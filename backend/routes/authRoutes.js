import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import Cache from '../utils/cache.js';

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, password, databaseName, role } = req.body;
    if (!name || !email || !phone || !password || !databaseName) {
      return res
        .status(400)
        .json({ message: 'Please provide name, email, phone, password and database name (company)' });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    const user = await User.create({
      name,
      email,
      phone,
      password,
      databaseName: String(databaseName).trim(),
      // status defaults to "active" from schema
      role: role === 'admin' ? 'admin' : 'user',
    });
    const token = generateToken(user._id);
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      databaseName: user.databaseName,
      status: user.status,
      role: user.role,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Your account is inactive. Please contact your admin.' });
    }
    const token = generateToken(user._id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      databaseName: user.databaseName,
      status: user.status,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST /api/auth/logout — invalidate server-side dashboard cache for this tenant
router.post('/logout', protect, async (req, res) => {
  try {
    const dbName = req.user?.databaseName;
    const removed = await Cache.invalidateDashboardForDatabase(dbName);
    res.json({ message: 'Logged out', cacheKeysRemoved: removed });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// GET /api/auth/users - list users with same databaseName as logged-in admin
router.get('/users', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can view company users' });
    }
    const dbName = req.user.databaseName;
    if (!dbName) {
      return res.status(400).json({ message: 'Logged-in user has no database assigned' });
    }
    const users = await User.find({ databaseName: dbName }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/auth/users/:id - update user (same databaseName only, admin)
router.put('/users/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can update users' });
    }
    const dbName = req.user.databaseName;
    const { id } = req.params;
    const { name, email, phone, status } = req.body;

    const user = await User.findOne({ _id: id, databaseName: dbName }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found for this database' });
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (status !== undefined && ['active', 'inactive'].includes(status)) {
      user.status = status;
    }

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// DELETE /api/auth/users/:id - delete user (same databaseName only, admin)
router.delete('/users/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete users' });
    }
    const dbName = req.user.databaseName;
    const { id } = req.params;

    const user = await User.findOneAndDelete({ _id: id, databaseName: dbName });
    if (!user) {
      return res.status(404).json({ message: 'User not found for this database' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

export default router;
