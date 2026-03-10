import mongoose from 'mongoose';

// Flexible schema for buybox documents from MongoDB (buyboxes collection).
// Fields mirror the raw export format: ASIN, Product Name, BuyBox, Price, etc.
const buyboxSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: 'buyboxes',
  },
);

const Buybox = mongoose.model('Buybox', buyboxSchema);

export default Buybox;

