const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, unique: true, required: true },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    }
  },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  isVerified: { type: Boolean, default: false },
  budget: {
    type: Number,
    default: 0,
    min: 0
  },
  fcmToken: { type: String, unique: true, sparse: true },
  googleId: { type: String, unique: true, sparse: true },
  picture: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
