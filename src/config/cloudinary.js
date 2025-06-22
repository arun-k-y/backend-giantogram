const cloudinary = require("cloudinary").v2;
// CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@daaavzzzf
cloudinary.config({
  cloud_name: "daaavzzzf",
  api_key: "189183574785781",
  api_secret: "T8Yw9tvkLnCoxfSuhbTyPGcwZBo",
});

module.exports = cloudinary;
