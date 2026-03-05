import mongoose from 'mongoose';

// Use a flexible schema because inventory documents come from
// an external source with many string/number fields and spaces in keys.
const inventorySchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: 'inventories',
  },
);

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;

