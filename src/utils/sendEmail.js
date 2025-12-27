const nodemailer = require("nodemailer");

// Validate required environment variables
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️  Email credentials not found in environment variables");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
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


// const { google } = require("googleapis");

// const oAuth2Client = new google.auth.OAuth2(
//   process.env.CLIENT_ID,
//   process.env.CLIENT_SECRET
// );

// oAuth2Client.setCredentials({
//   refresh_token: process.env.REFRESH_TOKEN,
// });

// const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

// async function sendEmail(to, subject, text) {
//   const message = `
// From: Giantogram <arunkumaruy81@gmail.com>
// To: ${to}
// Subject: ${subject}

// ${text}
// `;

//   const encodedMessage = Buffer.from(message)
//     .toString("base64")
//     .replace(/\+/g, "-")
//     .replace(/\//g, "_");

//   await gmail.users.messages.send({
//     userId: "me",
//     requestBody: { raw: encodedMessage },
//   });
// }

// module.exports = sendEmail;


// const { Resend } = require('resend');

// const resend = new Resend('re_g5tSRANZ_KdemVsV6kzXuZswrswcmzwun');

// async function sendEmail(to, subject, text) {
//   await resend.emails.send({
//     from: 'onboarding@resend.dev',
//     to,
//     subject,
//     html: `<p>${text}</p>`
//   });
// }

// module.exports = sendEmail;

