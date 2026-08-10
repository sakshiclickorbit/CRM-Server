const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (requiredPermissions) => {
    return (req, res, next) => {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        jwt.verify(token, process.env.VITE_API_JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({ message: 'Invalid token' });
            }

            req.admin = decoded;

            // Role-based access check
            if (decoded.role === 'superadmin') {
                return next();
            }

            // Permission-based check
            const userPermissions = decoded.permissions || [];
            const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));

            if (!hasPermission) {
                return res.status(403).json({ message: 'Access denied' });
            }

            next();
        });
    };
};

module.exports = authMiddleware;
