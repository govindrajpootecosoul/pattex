import mongoose from 'mongoose';

// Schemas for company DB collections (same structure in each company DB: pattex, emami, etc.)
const revenueSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'revenues' }
);

// Common fields used by the dashboard routes (some are filtered in JS today,
// but indexes are still valuable for faster Mongo-side queries later).
revenueSchema.index({ Date: 1 });
revenueSchema.index({ year_month: 1 });
revenueSchema.index({ 'Sales Channel': 1 });
revenueSchema.index({ ASIN: 1 });
revenueSchema.index({ 'Product Category': 1 });
revenueSchema.index({ 'Product Name': 1 });
revenueSchema.index({ total_sales: 1 });

const inventorySchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'inventories' }
);

inventorySchema.index({ Date: 1 });
inventorySchema.index({ 'Sales Channel': 1 });
inventorySchema.index({ ASIN: 1 });
inventorySchema.index({ Stock_Status: 1 });
inventorySchema.index({ DOS: 1 });

const marketingSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'marketings' }
);

marketingSchema.index({ Date: 1 });
marketingSchema.index({ year_month: 1 });
marketingSchema.index({ 'Sales Channel': 1 });
marketingSchema.index({ ASIN: 1 });
marketingSchema.index({ 'Product Name': 1 });
marketingSchema.index({ 'Product Category': 1 });
marketingSchema.index({ 'Campaign Name': 1 });
marketingSchema.index({ 'Campaign Type': 1 });
marketingSchema.index({ 'Portfolio name': 1 });

const buyboxSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'buyboxes' }
);

buyboxSchema.index({ Date: 1 });
buyboxSchema.index({ 'Sales Channel': 1 });
buyboxSchema.index({ ASIN: 1 });
buyboxSchema.index({ 'Current Owner': 1 });

const targetSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'targets' }
);

targetSchema.index({ Year: 1 });
targetSchema.index({ Month: 1 });
targetSchema.index({ 'Sales Channel': 1 });

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
