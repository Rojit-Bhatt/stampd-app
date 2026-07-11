const { verifyAuthToken } = require("../utils/tokenUtils");

const extractToken = (req) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  if (req.headers["x-access-token"]) {
    return req.headers["x-access-token"];
  }

  if (req.headers.token) {
    return req.headers.token;
  }

  return null;
};

const verifyToken = (req, _res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      const error = new Error("Access denied. Token is required.");
      error.statusCode = 401;
      throw error;
    }

    const decoded = verifyAuthToken(token);

    if (!decoded.userId || !decoded.role) {
      const error = new Error("Invalid token payload.");
      error.statusCode = 401;
      throw error;
    }

    req.user = {
      id: decoded.userId,
      role: decoded.role
    };

    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Admin access required."
    });
  }

  next();
};

module.exports = {
  verifyToken,
  isAdmin
};
