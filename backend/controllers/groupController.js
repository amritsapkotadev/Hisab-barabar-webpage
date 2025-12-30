const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const { firebase } = require('../firebase');

// Create a new group
exports.createGroup = async (req, res) => {
  try {
    const { name, description, members, emoji } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ message: 'At least one member is required' });
    }

    // Filter out empty members
    const validMembers = members.filter(member => member && member.trim() !== '');

    if (validMembers.length === 0) {
      return res.status(400).json({ message: 'At least one valid member is required' });
    }

    // Create group
    const group = new Group({
      name: name.trim(),
      description: description ? description.trim() : '',
      createdBy: req.user._id,
      members: validMembers.map(member => member.trim()),
      emoji: emoji ? emoji.trim() : '',
    });

    const savedGroup = await group.save();

    // Generate invite link with environment variable domain
    const APP_DOMAIN = process.env.APP_DOMAIN || 'hisab-barabar.up.railway.app';
    const inviteLink = `https://${APP_DOMAIN}/join/${savedGroup._id}`;

    res.status(201).json({
      success: true,
      data: {
        id: savedGroup._id,
        name: savedGroup.name,
        description: savedGroup.description,
        members: savedGroup.members,
        emoji: savedGroup.emoji,
        totalExpenses: 0,
        balances: {},
        inviteCode: savedGroup.inviteCode,
        inviteLink: inviteLink,
        createdAt: savedGroup.createdAt,
      }
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error while creating group' });
  }
};

// Join group by ID
exports.joinGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const userName = req.user.name;

    if (!groupId) {
      return res.status(400).json({ message: 'Group ID is required' });
    }

    // Find group by ID
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is already a member
    if (group.members.includes(userName)) {
      return res.json({
        success: true,
        data: {
          id: group._id,
          name: group.name,
          description: group.description,
          members: group.members,
          inviteCode: group.inviteCode,
        },
        message: 'You are already a member of this group'
      });
    }

    // Add user to group members
    group.members.push(userName);
    await group.save();

    res.json({
      success: true,
      data: {
        id: group._id,
        name: group.name,
        description: group.description,
        members: group.members,
        inviteCode: group.inviteCode,
      },
      message: 'Successfully joined group'
    });
  } catch (error) {
    console.error('Join group by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Server error while joining group' });
  }
};

// Join group by invite code
exports.joinGroupByInviteCode = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user._id;
    const username = req.user.name;

    if (!inviteCode || !inviteCode.trim()) {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    // Find group by invite code
    const group = await Group.findOne({ inviteCode: inviteCode.trim().toUpperCase() });

    if (!group) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    // Check if user is already a member
    if (group.members.includes(username)) {
      return res.status(400).json({ message: 'You are already a member of this group' });
    }

    // Add user to group members
    group.members.push(username); // Assuming you want to store usernames
    await group.save();

    const user = await User.findById(group.createdBy);

    try {
      await firebase.messaging().send({
        token: user.fcmToken,
        notification: {
          title: 'New Member Joined',
          body: `${username} has joined the group ${group.name}`,
        },
        data: {
          groupId: group._id.toString(),
          groupName: group.name,
          userId: userId.toString(),
          userName: username,
        }
      });
    console.log('Notification sent successfully');
    } catch (error) {
      console.error('Error sending FCM notification:', error);
    }

    res.json({
      success: true,
      data: {
        id: group._id,
        name: group.name,
        description: group.description,
        members: group.members,
        inviteCode: group.inviteCode,
      },
      message: 'Successfully joined group'
    });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ message: 'Server error while joining group' });
  }
};

// Add member to group by phone number
exports.addMemberByPhone = async (req, res) => {
  try {
    const { id } = req.params; // group id
    const { phone } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const normalizedPhone = phone.trim();

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Ensure requester has access (creator or existing member)
    const requesterName = req.user.name;
    const hasAccess = group.createdBy.toString() === req.user._id.toString() || group.members.includes(requesterName);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to add members to this group' });
    }

    const userToAdd = await User.findOne({ phone: normalizedPhone });
    if (!userToAdd) {
      return res.status(404).json({ message: 'User with this phone number not found' });
    }

    const newMemberName = userToAdd.name;
    if (group.members.includes(newMemberName)) {
      return res.status(400).json({ message: 'User is already a member of this group' });
    }

    const user = await User.findById(group.createdBy);

    try {
      await firebase.messaging().send({
        token: user.fcmToken,
        notification: {
          title: 'New Member',
          body: `${requesterName} added ${newMemberName} to the group ${group.name}`,
        },
        data: {
          groupId: group._id.toString(),
          groupName: group.name,
          userId: userToAdd._id.toString(),
          userName: newMemberName,
        }
      });
      console.log('Notification sent successfully');
    } catch (error) {
      console.error('Error sending FCM notification:', error);
    }

    group.members.push(newMemberName);
    await group.save();

    return res.json({
      success: true,
      message: 'Member added to the group successfully',
      data: {
        id: group._id,
        name: group.name,
        description: group.description,
        members: group.members,
        inviteCode: group.inviteCode,
      }
    });
  } catch (error) {
    console.error('Add member by phone error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    return res.status(500).json({ message: 'Server error while adding member' });
  }
};

// Delete group
exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    // Find group
    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is the creator
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this group' });
    }

    // Get all expenses for this group
    const expenses = await Expense.find({ groupId: id });
    // Calculate balances
    const balances = {};
    group.members.forEach(member => {
      balances[member] = 0;
    });
    expenses.forEach(expense => {
      const splitAmount = expense.amount / expense.participants.length;
      if (balances.hasOwnProperty(expense.paidBy)) {
        balances[expense.paidBy] += expense.amount;
      }
      expense.participants.forEach(participant => {
        if (balances.hasOwnProperty(participant)) {
          balances[participant] -= splitAmount;
        }
      });
    });
    // Check if all balances are zero (settled)
    const unsettledMembers = Object.entries(balances).filter(([_, balance]) => Math.abs(balance) > 0.01);
    if (unsettledMembers.length > 0) {
      console.log('Cannot delete group, unsettled balances:', unsettledMembers);
      return res.status(400).json({ message: 'Cannot delete group: all balances must be settled (zero) before deletion.', unsettled: unsettledMembers });
    }

    // Delete all expenses associated with the group
    await Expense.deleteMany({ groupId: id });
    // Delete the group
    await Group.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Group and all associated expenses deleted successfully'
    });
  } catch (error) {
    console.error('Delete group error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Server error while deleting group' });
  }
};

// Delete member from group
exports.deleteMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberName } = req.body;

    const group = await Group.findById(id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.createdBy.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete members from this group' });
    }

    if (!group.members.includes(memberName)) {
      return res.status(404).json({ message: 'Member not found in the group' });
    }

    group.members = group.members.filter(member => member.toString() !== memberName.toString());
    await group.save();

    res.json({
      success: true,
      message: 'Member removed from the group successfully',
      updatedMembers: group.members
    });
  } catch (error) {
    console.error('Delete member error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID or member ID' });
    }
    res.status(500).json({ message: 'Server error while deleting member from group' });
  }
};

// Get all groups for the authenticated user
exports.getGroups = async (req, res) => {
  try {
    // Find groups where user is either creator or member
    const groups = await Group.find({
      $or: [
        { createdBy: req.user._id },
        { members: req.user.name }
      ]
    }).sort({ createdAt: -1 });

    // Calculate expenses and balances for each group
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        try {
          // Get expenses for this group
          const expenses = await Expense.find({ groupId: group._id });

          // Calculate total expenses
          const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

          // Calculate balances
          const balances = {};
          group.members.forEach(member => {
            balances[member] = 0;
          });

          expenses.forEach(expense => {
            const splitAmount = expense.amount / expense.participants.length;

            // Add to payer's balance
            if (balances.hasOwnProperty(expense.paidBy)) {
              balances[expense.paidBy] += expense.amount;
            }

            // Subtract split amount from each participant
            expense.participants.forEach(participant => {
              if (balances.hasOwnProperty(participant)) {
                balances[participant] -= splitAmount;
              }
            });
          });

          // Generate invite link with environment variable domain
          const APP_DOMAIN = process.env.APP_DOMAIN || 'splitsaathi.up.railway.app';
          const inviteLink = `https://${APP_DOMAIN}/join/${group._id}`;

          return {
            id: group._id,
            name: group.name,
            description: group.description,
            members: group.members,
            totalExpenses,
            balances,
            inviteCode: group.inviteCode,
            inviteLink: inviteLink,
            createdAt: group.createdAt,
          };
        } catch (error) {
          console.error(`Error calculating stats for group ${group._id}:`, error);
          return {
            id: group._id,
            name: group.name,
            description: group.description,
            members: group.members,
            totalExpenses: 0,
            balances: {},
            inviteCode: group.inviteCode,
            inviteLink: `https://splitsaathi.up.railway.app/join/${group._id}`,
            createdAt: group.createdAt,
          };
        }
      })
    );

    res.json({
      success: true,
      data: groupsWithStats
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error while fetching groups' });
  }
};

// Get a specific group by ID
exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user has access to this group (either creator or member)
    const hasAccess = group.createdBy.toString() === req.user._id.toString() ||
      group.members.includes(req.user.name);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Not authorized to access this group' });
    }

    // Get expenses for this group
    const expenses = await Expense.find({ groupId: group._id });

    // Calculate total expenses
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Calculate balances
    const balances = {};
    group.members.forEach(member => {
      balances[member] = 0;
    });

    expenses.forEach(expense => {
      const splitAmount = expense.amount / expense.participants.length;

      // Add to payer's balance
      if (balances.hasOwnProperty(expense.paidBy)) {
        balances[expense.paidBy] += expense.amount;
      }

      // Subtract split amount from each participant
      expense.participants.forEach(participant => {
        if (balances.hasOwnProperty(participant)) {
          balances[participant] -= splitAmount;
        }
      });
    });

    // Generate invite link with environment variable domain
    const APP_DOMAIN = process.env.APP_DOMAIN || 'splitsaathi.up.railway.app';
    const inviteLink = `https://${APP_DOMAIN}/join/${group._id}`;

    // Transform group to match frontend interface
    const transformedGroup = {
      id: group._id,
      name: group.name,
      description: group.description,
      members: group.members,
      totalExpenses,
      balances,
      inviteCode: group.inviteCode,
      inviteLink: inviteLink,
      createdAt: group.createdAt,
    };

    res.json({
      success: true,
      data: transformedGroup
    });
  } catch (error) {
    console.error('Get group by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
    res.status(500).json({ message: 'Server error while fetching group' });
  }
};