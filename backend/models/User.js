import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Users are stored in: maindb.userspattex_emami (cluster0.2ift0zy.mongodb.net)
const USERS_COLLECTION = 'userspattex_emami';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    databaseName: { type: String, required: true, trim: true }, // company DB name (e.g. pattex, emami) on same cluster
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      required: true,
      trim: true,
    },
  },
  { timestamps: true, collection: USERS_COLLECTION }
);

// Critical indexes for auth & admin dashboards.
// NOTE: `email` already has an index created automatically by `unique: true`.
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1, role: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
