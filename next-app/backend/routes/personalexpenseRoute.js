// expenseController.js

const createPersonalExpense = async (req, res) => {
  try {
    const { description, amount, date, paymentMethod = 'Cash', category = 'Other' } = req.body;
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
    });

    console.log(`✅ Personal expense created for user ${userId}:`, expense);

    res.status(201).json({ data: expense });
  } catch (error) {
    console.error('❌ Error creating personal expense:', error);
    res.status(500).json({ message: 'Something went wrong while creating the personal expense.' });
  }
};
