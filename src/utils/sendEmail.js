const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "arunkumaruy81@gmail.com",
    pass: "eshp blhd htyk otxy",
  },
});

async function sendEmail(to, subject, text) {
  await transporter.sendMail({
    from: '"Giantogram" arunkumaruy81@gmail.com',
    to,
    subject,
    text,
  });
}

module.exports = sendEmail;
