const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const groupSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  description: { 
    type: String, 
    trim: true,
    maxlength: 500,
    default: ''
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  members: [{ 
    type: String,  // Consider using ObjectId if storing user IDs
    required: true,
    trim: true
  }],
  inviteCode: {
    type: String,
    unique: true,
    required: true,
    default: () => uuidv4().slice(0, 8).toUpperCase() // Generates short unique code
  },
  emoji: {
    type: String,
    trim: true,
    default: ''
  }
}, { 
  timestamps: true 
});

groupSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Group', groupSchema);