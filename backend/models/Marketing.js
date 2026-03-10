import mongoose from 'mongoose';

// Flexible schema for marketing documents from MongoDB (marketings collection).
// Fields match the stored format from Amazon exports: ASIN, Product Name,
// Impressions, Clicks, ads_spend, ads_sales, total_sales, total_units, etc.
const marketingSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: 'marketings',
  },
);

const Marketing = mongoose.model('Marketing', marketingSchema);

export default Marketing;

