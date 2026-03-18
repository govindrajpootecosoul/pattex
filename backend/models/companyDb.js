import mongoose from 'mongoose';

// Schemas for company DB collections (same structure in each company DB: pattex, emami, etc.)
const revenueSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'revenues' }
);

const inventorySchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'inventories' }
);

const marketingSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'marketings' }
);

const buyboxSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'buyboxes' }
);

const targetSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'targets' }
);

const modelCache = new Map();

/**
 * Get Revenue, Inventory, Marketing, Buybox models for a company database.
 * Uses same cluster as maindb; database name = company (e.g. pattex, emami).
 * @param {string} databaseName - Company DB name (e.g. 'pattex', 'emami')
 * @returns {{ Revenue: Model, Inventory: Model, Marketing: Model, Buybox: Model, Target: Model }}
 */
export function getCompanyModels(databaseName) {
  if (!databaseName || typeof databaseName !== 'string') {
    throw new Error('databaseName is required');
  }
  const dbName = databaseName.trim();
  if (!dbName) throw new Error('databaseName is required');

  if (modelCache.has(dbName)) {
    return modelCache.get(dbName);
  }

  const conn = mongoose.connection.useDb(dbName);
  const models = {
    Revenue: conn.models.Revenue ?? conn.model('Revenue', revenueSchema),
    Inventory: conn.models.Inventory ?? conn.model('Inventory', inventorySchema),
    Marketing: conn.models.Marketing ?? conn.model('Marketing', marketingSchema),
    Buybox: conn.models.Buybox ?? conn.model('Buybox', buyboxSchema),
    Target: conn.models.Target ?? conn.model('Target', targetSchema),
  };
  modelCache.set(dbName, models);
  return models;
}
