import mongoose from 'mongoose';

// Flexible schema for revenue documents from MongoDB (revenues collection).
// Fields match the stored format: ASIN, Product Name, total_sales, ads_sales, etc.
const revenueSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: 'revenues',
  },
);

const Revenue = mongoose.model('Revenue', revenueSchema);

export default Revenue;
