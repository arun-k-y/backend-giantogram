// Helper function to validate mobile number format
const isValidMobile = (mobile) => {
  // Adjust regex based on your requirements (this supports international format)
  const mobileRegex = /^[+]?[1-9]\d{1,14}$/;
  return mobileRegex.test(mobile);
};

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to determine if identifier is email or mobile
const getIdentifierType = (identifier) => {
  if (isValidEmail(identifier)) return "email";
  if (isValidMobile(identifier)) return "mobile";
  return null;
};

module.exports = {
  isValidEmail,
  isValidMobile,
  getIdentifierType,
};
