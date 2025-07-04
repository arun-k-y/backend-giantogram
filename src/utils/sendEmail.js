const nodemailer = require("nodemailer");

// Validate required environment variables
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️  Email credentials not found in environment variables");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER ,
    pass: process.env.EMAIL_PASS 
  },
});

async function sendEmail(to, subject, text) {
  await transporter.sendMail({
    from: '"Giantogram" giantogram2@gmail.com',
    to,
    subject,
    text,
  });
}

module.exports = sendEmail;
