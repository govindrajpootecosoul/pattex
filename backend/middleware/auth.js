import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/** Short-lived in-memory cache to avoid User.findById on every dashboard request. */
const userCache = new Map();
const USER_CACHE_TTL_MS = (() => {
  const v = Number(process.env.AUTH_USER_CACHE_TTL_MS || '');
  return Number.isFinite(v) && v > 0 ? v : 5 * 60 * 1000;
})();

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }

    const now = Date.now();
    const cached = userCache.get(String(userId));
    if (cached && cached.expiresAt > now) {
      req.user = cached.user;
      return next();
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    userCache.set(String(userId), { user, expiresAt: now + USER_CACHE_TTL_MS });
    req.user = user;
    next();
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please sign in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};
