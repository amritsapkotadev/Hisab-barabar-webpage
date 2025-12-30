const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  // Common fields for all expenses
  description: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0.01
  },
  date: { 
    type: String, 
    required: true 
  },
  type: {
    type: String,
    enum: ['personal', 'group'],
    required: true
  },

  // Used in both, but mandatory only for group
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  // Group-specific fields
  groupId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Group',
    default: null // will be null for personal
  },
  paidBy: { 
    type: String, // can use ObjectId if needed
    trim: true
  },
  participants: [{ 
    type: String, // or ObjectId
    trim: true
  }],
  splits: [{
    participant: {
      type: String, // or ObjectId
      trim: true
    },
    amount: {
      type: Number,
      min: 0
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100
    }
  }],
  payers: [{
    name: {
      type: String, // or ObjectId
      trim: true
    },
    amountPaid: {
      type: Number,
      min: 0
    }
  }],

  splitType: {
    type: String,
    enum: ['equal', 'unequal', 'percentage', 'shares'],
    default: 'equal'
  }

}, { 
  timestamps: true 
});

module.exports = mongoose.model('Expense', expenseSchema);