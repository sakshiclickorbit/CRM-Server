const jwt = require('jsonwebtoken');

// Unified JWT secret key with fallback
const JWT_SECRET = process.env.JWT_SECRET || 'long_jwt_secret_key';

// Public endpoints that bypass authentication
const whitelistedPaths = [
  '/api/login-subadmin',
  '/api/login-publisher',
  '/login-subadmin',
  '/login-publisher'
];

const verifyToken = (req, res, next) => {
  // 1. Bypass CORS preflight requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  const rawPath = req.path || '';
  // Normalize path by removing trailing slash if present
  const path = rawPath.endsWith('/') && rawPath.length > 1 ? rawPath.slice(0, -1) : rawPath;

  // 2. Bypass static assets uploads
  if (path.startsWith('/uploads')) {
    return next();
  }

  // 3. Bypass Socket.IO connection handshakes/transports
  if (path.startsWith('/socket.io')) {
    return next();
  }

  // 4. Bypass whitelisted login routes
  if (whitelistedPaths.includes(path)) {
    return next();
  }

  // Extract token from various possible locations (Header, Query Parameter, or Cookies)
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(403).json({ success: false, message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach decoded user information to the request object (supporting both req.user and req.admin)
    req.user = decoded;
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;
