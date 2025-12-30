const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUserProfile, updateUserProfile, googleLogin, googleRegister, setBudget, changePassword, deleteAccount, verifyOTP, resendOTP, forgotPassword, resetPassword, getUserByName } = require('../controllers/userController');
const protect = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);  // POST /users/register
router.post('/login', loginUser);        // POST /users/login

// OTP verification route
router.post('/verify-otp', verifyOTP); // POST /users/verify-otp
router.post('/resend-otp', resendOTP); // POST /users/resend-otp

// Forgot password route
router.post('/forgot-password', forgotPassword); // POST /users/forgot-password

// Reset password route
router.post('/reset-password', resetPassword); // POST /users/reset-password

//Setting budget routes
router.post('/budget', protect, setBudget);        // POST /users/budget

// Google authentication routes
router.post('/google-login', googleLogin);     // POST /users/google-login
router.post('/google-register', googleRegister); // POST /users/google-register

// Protected routes
router.get('/profile', protect, getUserProfile);  // GET /users/profile

// Update user profile route
router.put('/profile', protect, updateUserProfile);

//Change password route
router.put('/change-password', protect, changePassword);

//Account deletion route
router.delete('/delete-account', protect, deleteAccount);

// Lookup user by name (protected)
router.get('/:name', protect, getUserByName);

// Get all users (for testing - protect in production)
// router.get('/', async (req, res) => {
//   try {
//     const User = require('../models/User');
//     const users = await User.find().select('-password');
//     res.json(users);
//   } catch (err) {
//     console.error('Get users error:', err);
//     res.status(500).json({
//       error: 'Internal server error while fetching users'
//     });
//   }
// });

module.exports = router;
