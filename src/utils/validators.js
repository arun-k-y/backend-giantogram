const isValidMobile = (mobile) => {
  // Mobile numbers must always start with + followed by country code and number
  const mobileRegex = /^\+[1-9]\d{1,14}$/;
  return mobileRegex.test(mobile);
};

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to determine if identifier is email or mobile
const getIdentifierType = (identifier) => {
  if (!identifier || typeof identifier !== "string") return null;
  
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  
  // Check email first (most specific)
  if (isValidEmail(trimmed)) return "email";
  
  // Check mobile second - must start with +
  if (trimmed.startsWith("+") && isValidMobile(trimmed)) return "mobile";
  
  // If it's not email or mobile, and it's not empty, it could be a username
  // Username can be any characters and any length (minimum 1 character)
  if (trimmed.length > 0) return "username";

  return null;
};

module.exports = {
  isValidEmail,
  isValidMobile,
  getIdentifierType,
};
