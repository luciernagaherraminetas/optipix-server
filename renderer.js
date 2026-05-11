console.log("RENDERER OK");

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let selectedFolder = null;
let selectedMode = 'normal';
let isPaused = false;
let isCancelled = false;
let isProcessing = false;
let currentJobId = 0;
let outputFolder = null;

function checkTrial() {
  let start = localStorage.getItem('trialStart');

  if (!start) {
    start = Date.now();
    localStorage.setItem('trialStart', start);
  }

  const now = Date.now();
  const days = (now - start) / (1000 * 60 * 60 * 24);

  return days <= 30;
}

window.selectFiles = async function () {
  const paths = await ipcRenderer.invoke('select-folder');

  if (!paths || paths.length === 0) return;

  selectedFolder = paths[0];

  document.getElementById('status').innerText = "Carpeta seleccionada ✅";

  document.getElementById('selectedFolder').innerText =
    "📁 " + path.basename(selectedFolder);

  document.getElementById('optBtn').disabled = false;

};

function getMachineId() {
  const data = os.hostname() + os.platform() + os.arch();
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getImagesFromFolder(folder) {
  let results = [];

  const files = fs.readdirSync(folder);

  for (let file of files) {
    if (file.startsWith(".")) continue;

    const fullPath = path.join(folder, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(getImagesFromFolder(fullPath));
    } else {
      const ext = path.extname(fullPath).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.heic', '.webp'].includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

window.selectOutputFolder = async function () {
  const paths = await ipcRenderer.invoke('select-output-folder');

  if (!paths || paths.length === 0) return;

  outputFolder = paths[0];

  document.getElementById('outputFolder').innerText =
    "💾 " + path.basename(outputFolder);
};

window.setQuality = function(mode) {
  selectedMode = mode;

  document.getElementById('status').innerText =
    "Modo: " + mode.toUpperCase();
};

function getQualityMode(mode) {
  switch(mode) {
    case 'minima': return 60;
    case 'normal': return 80;
    case 'alta': return 90;
    default: return 80;
  }
}

async function compressSmart(inputPath, outputPath) {

  const quality = getQualityMode(selectedMode);

  const result = await ipcRenderer.invoke(
    'compress-image',
    {
      inputPath,
      outputPath,
      quality
    }
  );

  if (!result.success) {
    throw new Error(result.error);
  }

  return quality;

}

function getUniqueFolder(basePath) {
  if (!fs.existsSync(basePath)) return basePath;

  let counter = 1;
  let newPath;

  do {
    newPath = `${basePath} (${counter})`;
    counter++;
  } while (fs.existsSync(newPath));

  return newPath;
}

window.optimize = async function () {

let isPro = localStorage.getItem('isPro') === 'true';

if (!isPro && !checkTrial()) {
  alert('⏳ Tu prueba de 30 días ha terminado. Activa PRO.');
  return;
}

  if (!selectedFolder) {
    alert("Selecciona una carpeta");
    return;
  }

  if (isProcessing) {
    alert("Ya hay un proceso en curso");
    return;
  }

  // 🔥 nuevo proceso único
  const jobId = Date.now();
  currentJobId = jobId;

  isProcessing = true;
  isPaused = false;
  isCancelled = false;

  setCardState('processing');
  document.getElementById('optBtn').disabled = true;
  document.getElementById('optBtn').innerText = "Procesando...";

  // 📁 destino
  let baseFolder;

  if (outputFolder) {
    baseFolder = outputFolder;
  } else {
    const desktopPath = await ipcRenderer.invoke('get-desktop');
    baseFolder = path.join(desktopPath, "Archivos Optimizados");
  }

  const folderName = path.basename(selectedFolder);
  
  let outputDir = path.join(baseFolder, folderName);

  // 🔥 evitar sobrescribir
  outputDir = getUniqueFolder(outputDir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let images = getImagesFromFolder(selectedFolder);
  const totalImages = images.length;

  if (images.length === 0) {
    alert("No se encontraron imágenes");
    document.getElementById('status').innerText = "❌ Carpeta sin imágenes";
    resetUI();
    return;
  }

if (!isPro && images.length > 30) {
  alert("Versión gratuita: máximo 30 imágenes. Activa PRO para ilimitado.");

  // 🔥 Limitar a 30 automáticamente
  images = images.slice(0, 30);

  // Forzar calidad mínima
  selectedMode = 'minima';
}

  // 📊 stats
  let huboErrores = false;
  let totalOriginal = 0;
  let totalOptimizado = 0;
  const results = [];

  let processed = 0;
  const startTime = Date.now();

  document.getElementById('status').innerText = `Procesando 0 / ${totalImages}`;

  await processInBatches(images, 4, async (filePath) => {

    // 🔥 corta proceso viejo o cancelado
    if (jobId !== currentJobId || isCancelled) return;

    const baseName = path.relative(selectedFolder, filePath)
      .replace(/[\/\\]/g, "_")
      .replace(path.extname(filePath), "");

    const output = path.join(outputDir, baseName + "-opt.jpg");
    const beforeSize = fs.statSync(filePath).size;

    try {
      await compressSmart(filePath, output);

      if (fs.existsSync(output)) {
        const afterSize = fs.statSync(output).size;
        results.push({ beforeSize, afterSize });
      }

    } catch (err) {
      console.log("❌ ERROR:", err);
      huboErrores = true;
    }

    processed++;

    // ⏱ ETA
    const elapsed = (Date.now() - startTime) / 1000;
    const avg = elapsed / processed;
    const remaining = (totalImages - processed) * avg;

    const min = Math.floor(remaining / 60);
    const sec = Math.floor(remaining % 60);

    const eta = `${min}m ${sec}s`;

    document.getElementById('status').innerText =
      `Procesando ${processed} / ${totalImages} • ⏳ ${eta}`;

    const percent = Math.round((processed / totalImages) * 100);
    document.getElementById('progressBar').style.width = percent + "%";

    const progressText = document.getElementById('progressText');
    if (progressText) progressText.innerText = percent + "%";

  }, jobId);

  // 🔥 si se canceló → NO continuar
  if (isCancelled || jobId !== currentJobId) {
    resetUI();
    return;
  }

  // 📊 resumen
  for (const r of results) {
    totalOriginal += r.beforeSize;
    totalOptimizado += r.afterSize;
  }

  const savedBytes = totalOriginal - totalOptimizado;
  const savedMB = (savedBytes / 1024 / 1024).toFixed(2);
  const percent = totalOriginal > 0
    ? ((savedBytes / totalOriginal) * 100).toFixed(1)
    : 0;

  if (huboErrores) {
    document.getElementById('status').innerText =
      "⚠️ Completado con algunos errores";
  } else {
    document.getElementById('status').innerText =
      `✅ Optimización completada\n💾 Ahorraste: ${savedMB} MB (${percent}%)`;
  }

  // 📂 abrir carpeta SOLO si sigue siendo el proceso activo
  if (jobId === currentJobId && !isCancelled) {
    ipcRenderer.invoke('open-folder', outputDir);
  }

  resetUI();

};

function resetUI() {
  isProcessing = false;

  document.getElementById('optBtn').innerText = "Optimizar";
  document.getElementById('optBtn').disabled = false;

  setTimeout(() => {
    document.getElementById('progressBar').style.width = "0%";
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.innerText = "0%";
  }, 1500);
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('optBtn');
  if (btn) btn.disabled = true;

  // 🔥 AQUÍ VA EL PASO 6
  if (localStorage.getItem('isPro') === 'true') {
    const proBtn = document.querySelector('[onclick="unlockPro()"]');
    if (proBtn) proBtn.style.display = "none";

    const input = document.getElementById('proInputContainer');
    if (input) input.style.display = "none";
  }
});

// 🖱️ DRAG & DROP
document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();

  if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

  const folderPath = e.dataTransfer.files[0].path;

  selectedFolder = folderPath;

  document.getElementById('status').innerText = "Carpeta cargada por drag & drop ✅";

  document.getElementById('selectedFolder').innerText =
    "📁 " + path.basename(folderPath);

  document.getElementById('optBtn').disabled = false;

});

document.addEventListener("dragenter", () => {
  document.body.classList.add("dragover");
});

document.addEventListener("dragleave", () => {
  document.body.classList.remove("dragover");
});

document.addEventListener("drop", () => {
  document.body.classList.remove("dragover");
});

window.unlockPro = function () {
  document.getElementById('proInputContainer').style.display = "block";
};

window.closeProModal = function () {
  document.getElementById('proModal').classList.add('hidden');
};

window.goToPayment = function () {
  require('electron').shell.openExternal("https://gumroad.com/l/optipix");

  alert("Después de pagar, recibirás tu código PRO");

  closeProModal();
};

window.activatePro = function () {
  const code = document.getElementById('proCode').value;

  if (code === "OPTIPIX-2026-PRO") {
    localStorage.setItem('pro', 'true');

    alert("🚀 PRO ACTIVADO");

    document.getElementById('proInputContainer').style.display = "none";
    document.querySelector('[onclick="unlockPro()"]').style.display = "none";

  } else {
    alert("Código inválido");
  }
};

window.pauseProcess = function () {
  isPaused = true;

  setCardState('paused');

  document.getElementById('status').innerText = "⏸ Pausado";
};

window.resumeProcess = function () {
  isPaused = false;

  setCardState('processing');

  document.getElementById('status').innerText = "▶️ Reanudado";
};

window.cancelProcess = function () {
  isCancelled = true;

  currentJobId = 0;

  setCardState('cancelled');
  isProcessing = false;

  // 🔴 reset UI
  document.getElementById('status').innerText = "❌ Cancelado";

  document.getElementById('progressBar').style.width = "0%";

  const progressText = document.getElementById('progressText');
  if (progressText) progressText.innerText = "0%";

  const img = document.getElementById('miniPreview');
  if (img) img.src = "";

  document.getElementById('optBtn').innerText = "Optimizar";
  document.getElementById('optBtn').disabled = false;
};

function setCardState(state) {
  const card = document.querySelector('.card');
  if (!card) return;
  card.classList.remove('processing', 'paused', 'cancelled');

  if (state) card.classList.add(state);
}

async function processInBatches(items, batchSize, fn, jobId) {
  for (let i = 0; i < items.length; i += batchSize) {

    if (jobId !== currentJobId) return;
    if (isCancelled) return;

    const batch = items.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (item) => {

        if (jobId !== currentJobId) return;
        if (isCancelled) return;

        while (isPaused) {
          await new Promise(r => setTimeout(r, 200));
        }

        await fn(item);

      })
    );

    await new Promise(r => setTimeout(r, 0));
  }
}

async function testSharp() {

  const result = await ipcRenderer.invoke('sharp-test');

  console.log(result);

  if (result.success) {

    console.log("✅ Sharp funcionando");

  } else {

    alert("Sharp falló: " + result.error);

  }

}

testSharp();

window.activateLicense = async function () {
  const licenseKey = document.getElementById('licenseInput').value.trim();

  if (!licenseKey) {
    alert('Ingresa una licencia');
    return;
  }

  const machineId = getMachineId();

  try {
    const res = await fetch('http://104.248.239.19:3000/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, machineId })
    });

    const data = await res.json();

    if (data.valid) {
      localStorage.setItem('isPro', 'true');
      localStorage.setItem('licenseKey', licenseKey);

      const proCard = document.getElementById('proCard');
      if (proCard) proCard.style.display = 'none';

      alert('✅ PRO activado');

    } else {

      if (data.reason === 'limit') {
        alert('⚠️ Esta licencia ya fue usada en otro dispositivo');

      } else if (data.reason === 'expired') {
        alert('⏳ Tu licencia expiró');

      } else {
        alert('❌ Licencia inválida');
      }

    }

  } catch (err) {
    console.error(err);
    alert('Error conectando con servidor');
  }
};

async function checkLicense() {
  const licenseKey = localStorage.getItem('licenseKey');
  if (!licenseKey) return false;

  const machineId = getMachineId();

  const res = await fetch('http://104.248.239.19:3000/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey, machineId })
  });

  const data = await res.json();
  return data.valid;
}

window.buyPro = async function () {
  const res = await fetch('http://104.248.239.19:3000/create-checkout-session', {
    method: 'POST'
  });

  const data = await res.json();

  require('electron').shell.openExternal(data.url);
};

window.addEventListener('DOMContentLoaded', () => {
  const isPro = localStorage.getItem('isPro') === 'true';

  if (isPro) {
    const proCard = document.getElementById('proCard');
    if (proCard) proCard.style.display = 'none';
  }
});
