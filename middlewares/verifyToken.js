// middlewares/verifyToken.js
const jwt = require('jsonwebtoken');

// Replace 'your_jwt_secret_key' with your actual JWT secret key
const JWT_SECRET = 'gurdeep0111';

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ message: 'Token is required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach decoded token data to the request
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
};

module.exports = verifyToken;
