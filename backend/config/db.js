import mongoose from 'mongoose';

// Simple DB connector.
// IMPORTANT: We always connect to the maindb database on the cluster,
// and store users in maindb.userspattex_emami. Make sure MONGO_URI points
// to the correct cluster (cluster0.2ift0zy.mongodb.net).
const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI is required in .env');
    }
    // Force MongoDB to use the maindb database, even if the URI omits or changes the db name.
    const conn = await mongoose.connect(uri, { dbName: 'maindb' });
    console.log(`MongoDB connected: ${conn.connection.host} (DB: ${conn.connection.name})`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
