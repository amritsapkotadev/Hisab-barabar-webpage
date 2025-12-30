const Expense = require('../models/Expense');
const Group = require('../models/Group');
const { firebase } = require('../firebase');

exports.createPersonalExpense = async (req, res) => {
  try {
    const { description, amount, date, paymentMethod = 'Cash', category = 'Other', paidBy, participants } = req.body;
    const userId = req.user?.id;

    // Basic validation
    if (!description || !amount || !date) {
      return res.status(400).json({ message: 'Description, amount, and date are required.' });
    }

    // Additional type checks (optional, but recommended)
    if (typeof description !== 'string' || typeof amount !== 'number' || typeof date !== 'string') {
      return res.status(400).json({ message: 'Invalid data types for one or more fields.' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized. User not found in request.' });
    }

    // Create the expense
    const expense = await Expense.create({
      description,
      amount,
      date,
      paymentMethod,
      category,
      user: userId,       // Link to user
      type: 'personal',   // Mark as personal
      createdBy: req.user._id,
      paidBy: paidBy.trim(),
      participants: participants.map(p => p.trim()),
    });

    console.log(`✅ Personal expense created for user ${userId}:`, expense);

    res.status(201).json({ data: expense });
  } catch (error) {
    console.error('❌ Error creating personal expense:', error);
    res.status(500).json({ message: 'Something went wrong while creating the personal expense.' });
  }
};


// Create a new expense
exports.createExpense = async (req, res) => {
  try {
    const { groupId, description, amount, paidBy, participants, date } = req.body;

    // Validation
    if (!groupId || !description || !amount || !paidBy || !participants || !date) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ message: 'At least one participant is required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Check if group exists and user has access
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.includes(req.user.name)) {
      return res.status(403).json({ message: 'Not authorized: you must be a group member to add expenses' });
    }

    // Validate that paidBy and participants are group members
    const validMembers = group.members;
    if (!validMembers.includes(paidBy.trim())) {
      return res.status(400).json({ message: 'Payer must be a group member' });
    }

    const invalidParticipants = participants.filter(p => !validMembers.includes(p.trim()));
    if (invalidParticipants.length > 0) {
      return res.status(400).json({
        message: `Invalid participants: ${invalidParticipants.join(', ')}`
      });
    }

    // Create expense
    const expense = new Expense({
      description: description.trim(),
      amount: parseFloat(amount),
      paidBy: paidBy.trim(),
      participants: participants.map(p => p.trim()),
      groupId,
      date,
      splitType: 'equal',
      createdBy: req.user._id,
    });

    const savedExpense = await expense.save();

    // Transform expense to match frontend interface
    const transformedExpense = {
      id: savedExpense._id,
      groupId: savedExpense.groupId,
      description: savedExpense.description,
      amount: savedExpense.amount,
      paidBy: savedExpense.paidBy,
      participants: savedExpense.participants,
      splitType: savedExpense.splitType,
      date: savedExpense.date,
      createdAt: savedExpense.createdAt,
    };

    res.status(201).json({
      success: true,
      data: transformedExpense
    });
  } catch (error) {
    console.error('Create expense error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Server error while creating expense' });
  }
};

// Create an unequal expense (for advanced splits)
exports.createUnequalExpense = async (req, res) => {
  try {
    const { groupId, description, amount, paidBy, splits, date, payers, splitType, type } = req.body;

    // Validation
    if (!groupId || !description || !amount || !date) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a valid number greater than 0' });
    }

    // Validate payers if provided
    if (payers && Array.isArray(payers)) {
      for (const payer of payers) {
        if (typeof payer.amountPaid !== 'number' || isNaN(payer.amountPaid)) {
          return res.status(400).json({ message: `Payer amountPaid for ${payer.name} must be a valid number` });
        }
      }
    }

    // Validate splits if provided
    if (splits && Array.isArray(splits)) {
      for (const split of splits) {
        if (typeof split.amount !== 'number' || isNaN(split.amount)) {
          return res.status(400).json({ message: `Split amount for ${split.participant} must be a valid number` });
        }
      }
    }

    // Check if group exists and user has access
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.includes(req.user.name)) {
      return res.status(403).json({ message: 'Not authorized: you must be a group member to add expenses' });
    }

    // Validate payers if provided
    let finalPaidBy = paidBy;
    let finalPayers = [];

    if (payers && Array.isArray(payers) && payers.length > 0) {
      // Multi-payer expense
      const validMembers = group.members;

      // Validate all payers are group members
      const invalidPayers = payers.filter(payer => !validMembers.includes(payer.name.trim()));
      if (invalidPayers.length > 0) {
        return res.status(400).json({
          message: `Invalid payers: ${invalidPayers.map(p => p.name).join(', ')}`
        });
      }

      // Validate total paid amount equals expense amount
      const totalPaid = payers.reduce((sum, payer) => sum + payer.amountPaid, 0);
      if (Math.abs(totalPaid - amount) > 0.01) {
        return res.status(400).json({
          message: `Total paid amount (${totalPaid}) must equal expense amount (${amount})`
        });
      }

      finalPaidBy = payers.length === 1 ? payers[0].name : 'Multiple';
      finalPayers = payers.map(payer => ({
        name: payer.name.trim(),
        amountPaid: payer.amountPaid
      }));
    } else {
      // Single payer expense
      if (!paidBy) {
        return res.status(400).json({ message: 'Payer is required' });
      }

      const validMembers = group.members;
      if (!validMembers.includes(paidBy.trim())) {
        return res.status(400).json({ message: 'Payer must be a group member' });
      }

      finalPaidBy = paidBy.trim();
      finalPayers = [{ name: finalPaidBy, amountPaid: amount }];
    }

    // Validate splits if provided
    let finalSplits = [];
    let finalParticipants = [];

    if (splits && Array.isArray(splits) && splits.length > 0) {
      const validMembers = group.members;

      // Validate all participants are group members
      const invalidParticipants = splits.filter(split => !validMembers.includes(split.participant.trim()));
      if (invalidParticipants.length > 0) {
        return res.status(400).json({
          message: `Invalid participants in splits: ${invalidParticipants.map(p => p.participant).join(', ')}`
        });
      }

      // Validate total split amount equals expense amount
      const totalSplit = splits.reduce((sum, split) => sum + split.amount, 0);
      if (Math.abs(totalSplit - amount) > 0.01) {
        return res.status(400).json({
          message: `Total split amount (${totalSplit}) must equal expense amount (${amount})`
        });
      }

      finalSplits = splits.map(split => ({
        participant: split.participant.trim(),
        amount: split.amount,
        percentage: split.percentage
      }));

      finalParticipants = splits.map(split => split.participant.trim());
    } else {
      return res.status(400).json({ message: 'Splits are required for advanced expenses' });
    }

    // Determine split type
    const finalSplitType = splitType || 'unequal';

    // Create expense
    const expense = new Expense({
      description: description.trim(),
      amount: parseFloat(amount),
      paidBy: finalPaidBy,
      participants: finalParticipants,
      splits: finalSplits,
      payers: finalPayers,
      splitType: finalSplitType,
      groupId,
      date,
      createdBy: req.user._id,
      type: type,
    });

    const savedExpense = await expense.save();

    try {
      await firebase.messaging().send({
        notification: {
          title: 'New Expense Added',
          body: `${req.user.name} added an expense of Rs ${amount} to ${group.name}`,
        },
        data: {
          groupId: group._id.toString(),
          groupName: group.name
        },
        topic: `group_${groupId}`,
      });
      console.log('Notification sent successfully');
    } catch (error) {
      console.error('Error sending FCM notification:', error);
    }

    // Transform expense to match frontend interface
    const transformedExpense = {
      id: savedExpense._id,
      groupId: savedExpense.groupId,
      description: savedExpense.description,
      amount: savedExpense.amount,
      paidBy: savedExpense.paidBy,
      participants: savedExpense.participants,
      splits: savedExpense.splits,
      payers: savedExpense.payers,
      splitType: savedExpense.splitType,
      date: savedExpense.date,
      createdAt: savedExpense.createdAt,
    };

    res.status(201).json({
      success: true,
      data: transformedExpense
    });
  } catch (error) {
    console.error('Create unequal expense error:', error);
    if (error && error.stack) console.error(error.stack);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Server error while creating unequal expense' });
  }
};

exports.getPersonalExpenses = async (req, res) => {
  try {
    const userId = req.user._id;  // Get the authenticated user's ID
    const expenses = await Expense.find({ createdBy: userId, type: 'personal' }).sort({ createdAt: -1 });
    // Transform expenses to match frontend interface
    const transformedExpenses = expenses.map(expense => ({
      id: expense._id,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      createdAt: expense.createdAt,
      paidBy: expense.paidBy,
      participants: expense.participants,
      splitType: expense.splitType,
      groupId: expense.groupId,  // Include groupId if needed
    }));
    res.json({
      success: true,
      data: transformedExpenses
    });
  } catch (error) {
    console.error('Get personal expenses error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    res.status(500).json({ message: 'Server error while fetching personal expenses' });
  }
};

// Get expenses for a specific group
exports.getExpensesByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if group exists and user has access
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.includes(req.user.name)) {
      return res.status(403).json({ message: 'Not authorized: you must be a group member to access this group' });
    }

    // Get expenses for the group
    const expenses = await Expense.find({ groupId }).sort({ createdAt: -1 });

    // Transform expenses to match frontend interface
    const transformedExpenses = expenses.map(expense => ({
      id: expense._id,
      groupId: expense.groupId,
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participants: expense.participants,
      splits: expense.splits,
      payers: expense.payers,
      splitType: expense.splitType,
      date: expense.date,
      createdAt: expense.createdAt,
    }));

    res.json({
      success: true,
      data: transformedExpenses
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Server error while fetching expenses' });
  }
};

// Get all expenses for the authenticated user (including personal and group expenses)
exports.getAllExpenses = async (req, res) => {
  try {
    // Get all groups where the user is a member
    const userGroups = await Group.find({ members: req.user.name });
    const groupIds = userGroups.map(group => group._id);

    // Get all group expenses where user is a participant or payer
    const groupExpenses = await Expense.find({
      groupId: { $in: groupIds }
    }).sort({ createdAt: -1 });

    // Get all personal expenses for the user
    const personalExpenses = await Expense.find({
      user: req.user._id,
      type: 'personal'
    }).sort({ createdAt: -1 });

    // Combine and sort all expenses by createdAt descending
    const allExpenses = [...groupExpenses, ...personalExpenses].sort(
      (a, b) => b.createdAt - a.createdAt
    );

    // Transform expenses to match frontend interface
    const transformedExpenses = allExpenses.map(expense => ({
      id: expense._id,
      groupId: expense.groupId,
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participants: expense.participants,
      splits: expense.splits,
      payers: expense.payers,
      splitType: expense.splitType,
      date: expense.date,
      createdAt: expense.createdAt,
      type: expense.type
    }));

    res.json({
      success: true,
      data: transformedExpenses
    });
  } catch (error) {
    console.error('Get all expenses error:', error);
    res.status(500).json({ message: 'Server error while fetching expenses' });
  }
};

// Delete an expense by ID
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    // Find the group to check authorization
    const group = await Group.findById(expense.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (!group.members.includes(req.user.name)) {
      return res.status(403).json({ message: 'Not authorized to delete this expense' });
    }
    await Expense.findByIdAndDelete(id);
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }
    res.status(500).json({ message: 'Server error while deleting expense' });
  }
};

exports.deletePersonalExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    if (expense.type !== 'personal' || expense.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this personal expense' });
    }
    await Expense.findByIdAndDelete(id);
    res.json({ success: true, message: 'Personal expense deleted successfully' });
  } catch (error) {
    console.error('Delete personal expense error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }
    res.status(500).json({ message: 'Server error while deleting personal expense' });
  }
};

exports.updatePersonalExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, date } = req.body;
    const expense = await Expense.findByIdAndUpdate(id,
      { description, amount, date }, {
      new: true,
      runValidators: true
    });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    // Check if the expense is personal and belongs to the authenticated user
    if (expense.type !== 'personal' || expense.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this personal expense' });
    }
    // Validate required fields
    if (!expense.description || !expense.amount || !expense.date) {
      return res.status(400).json({ message: 'Description, amount, and date are required' });
    }
    // Validate amount
    if (typeof expense.amount !== 'number' || isNaN(expense.amount) || expense.amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a valid number greater than 0' });
    }
    // Transform expense to match frontend interface
    const transformedExpense = {
      id: expense._id,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      createdAt: expense.createdAt,
      paidBy: expense.paidBy,
      participants: expense.participants,
      splitType: expense.splitType,
    };
    res.json({ success: true, data: transformedExpense });
  } catch (error) {
    console.error('Update personal expense error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }
    res.status(500).json({ message: 'Server error while updating personal expense' });
  }
};

// Update an expense by ID
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      description,
      amount,
      paidBy,
      participants,
      splits,
      payers,
      splitType,
      date
    } = req.body;

    // Find the expense
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Find the group to check authorization
    const group = await Group.findById(expense.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (!group.members.includes(req.user.name)) {
      return res.status(403).json({ message: 'Not authorized to update this expense' });
    }

    // Validate fields if provided
    if (description !== undefined) expense.description = description.trim();
    if (amount !== undefined) {
      if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Amount must be a valid number greater than 0' });
      }
      expense.amount = amount;
    }
    if (paidBy !== undefined) {
      if (!group.members.includes(paidBy.trim())) {
        return res.status(400).json({ message: 'Payer must be a group member' });
      }
      expense.paidBy = paidBy.trim();
    }
    if (participants !== undefined) {
      if (!Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ message: 'At least one participant is required' });
      }
      const invalidParticipants = participants.filter(p => !group.members.includes(p.trim()));
      if (invalidParticipants.length > 0) {
        return res.status(400).json({ message: `Invalid participants: ${invalidParticipants.join(', ')}` });
      }
      expense.participants = participants.map(p => p.trim());
    }
    if (splits !== undefined) {
      if (!Array.isArray(splits)) {
        return res.status(400).json({ message: 'Splits must be an array' });
      }
      expense.splits = splits;
    }
    if (payers !== undefined) {
      if (!Array.isArray(payers)) {
        return res.status(400).json({ message: 'Payers must be an array' });
      }
      expense.payers = payers;
    }
    if (splitType !== undefined) expense.splitType = splitType;
    if (date !== undefined) expense.date = date;

    await expense.save();

    // Transform expense to match frontend interface
    const transformedExpense = {
      id: expense._id,
      groupId: expense.groupId,
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participants: expense.participants,
      splits: expense.splits,
      payers: expense.payers,
      splitType: expense.splitType,
      date: expense.date,
      createdAt: expense.createdAt,
    };
    res.json({ success: true, data: transformedExpense });
  } catch (error) {
    console.error('Update expense error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }
    res.status(500).json({ message: 'Server error while updating expense' });
  }
};

// Get a single expense by ID
exports.getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    // Transform expense to match frontend interface
    const transformedExpense = {
      id: expense._id,
      groupId: expense.groupId,
      description: expense.description,
      amount: expense.amount,
      paidBy: expense.paidBy,
      participants: expense.participants,
      splitType: expense.splitType,
      date: expense.date,
      createdAt: expense.createdAt,
    };
    res.json({ success: true, data: transformedExpense });
  } catch (error) {
    console.error('Get expense by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }
    res.status(500).json({ message: 'Server error while fetching expense' });
  }
};