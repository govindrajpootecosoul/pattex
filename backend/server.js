import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { protect } from './middleware/auth.js';
import { requestLogger } from './middleware/requestLogger.js';
import { ensureCompanyIndexes } from './utils/ensureCompanyIndexes.js';
import { getCompanyModels } from './models/companyDb.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(compression());
app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', protect, dashboardRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'pattex' }));

const PORT = 3026;
let server;

connectDB()
  .then(() => {
    if (String(process.env.ENSURE_COMPANY_INDEXES || '').toLowerCase() === 'true') {
      console.log('ENSURE_COMPANY_INDEXES=true — creating recommended indexes (background)...');
      const dbNames = String(process.env.COMPANY_DB_NAMES || 'pattex,emami')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      dbNames.forEach((dbName) => {
        ensureCompanyIndexes(getCompanyModels(dbName)).catch(() => {});
      });
    }

    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('API request logging enabled — each hit prints as [#seq time] METHOD path → status duration');
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });

function shutdown() {
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
