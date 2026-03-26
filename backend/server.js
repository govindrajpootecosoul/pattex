import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { protect } from './middleware/auth.js';

connectDB();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(compression()); // Compress JSON responses (helps API + caching payoffs)

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', protect, dashboardRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'pattex' }));

const PORT = 3026;
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

function shutdown(signal) {
  server.close(() => {
    process.exit(0);
  });
  // If close hangs, force exit.
  setTimeout(() => process.exit(1), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
