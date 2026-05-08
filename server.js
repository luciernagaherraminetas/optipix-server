const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'luciernagasocial@gmail.com',
    pass: 'manolo86'
  }
});
