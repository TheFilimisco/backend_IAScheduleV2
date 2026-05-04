const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  try {
    const payload = {
      id: user._id,
      role: user.role,
      code: user.code,
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
  } catch (err) {
    console.error("Error generating token:", err);
  }
};

module.exports = generateToken;
