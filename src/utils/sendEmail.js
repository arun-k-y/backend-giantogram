const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "giantogram2@gmail.com",
    pass: "rkikdzldjnpodqux",
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
