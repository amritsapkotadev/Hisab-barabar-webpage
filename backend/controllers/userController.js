const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Register a new user
exports.registerUser = async (req, res) => {
  try {
    console.log('Registration attempt:', { name: req.body.name, email: req.body.email });

    const { name, email, password, fcmToken } = req.body;

    // Validation
    if (!name || !email || !password) {
      console.log('Registration failed: Missing fields');
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      console.log('Registration failed: Password too short');
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      console.log('Registration failed: User already exists');
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      fcmTokens: fcmToken ? [fcmToken] : [],
      otp: otp,
      otpExpires: otpExpires,
      isVerified: false
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP Verification',
      text: `Your OTP is: ${otp}`
    });

    console.log('User created successfully:', { id: user._id, email: user.email });

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      message: 'User registered successfully. Please verify your email with the OTP sent.'
    });
  } catch (error) {
    console.error('Register user error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ success: true, token, message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error verifying OTP', error });
  }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP Verification',
      text: `Your new OTP is: ${otp}`
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ success: true, token, message: 'OTP resent successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error resending OTP', error });
  }
};

// Get user by name (non-sensitive fields)
exports.getUserByName = async (req, res) => {
  try {
    const user = await User.findOne({ name: req.params.name }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        picture: user.picture || null,
      }
    });
  } catch (error) {
    console.error('Get user by name error:', error);
    return res.status(500).json({ message: 'Server error while fetching user' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    user.isVerified = false;
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}`
    });

    res.json({ success: true, message: 'OTP sent to email for password reset' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error sending forgot password email', error });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    // Validate input
    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required' });
    } else if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }
    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    // Update user password and clear OTP
    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isVerified = true; // Automatically verify user after password reset
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful. You can now log in.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password', error });
  }
};

// Login user
exports.loginUser = async (req, res) => {
  try {
    console.log('Login attempt:', { email: req.body.email });

    const { email, password, fcmToken } = req.body;

    // Validation
    if (!email || !password) {
      console.log('Login failed: Missing credentials');
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.log('Login failed: User not found');
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Login failed: Invalid password');
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ success: false, message: 'Email not verified' });
    }

    console.log('Login successful:', { id: user._id, email: user.email });

    user.fcmToken = fcmToken;
    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login user error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// Google Login
exports.googleLogin = async (req, res) => {
  try {
    console.log('Google login attempt:', { email: req.body.email });

    const { googleId, email, name, picture } = req.body;

    // Validation
    if (!googleId || !email || !name) {
      console.log('Google login failed: Missing required fields');
      return res.status(400).json({ message: 'Google ID, email, and name are required' });
    }

    // Find user by Google ID or email
    let user = await User.findOne({
      $or: [
        { googleId: googleId },
        { email: email.toLowerCase().trim() }
      ]
    });

    if (!user) {
      console.log('Google login failed: User not found');
      return res.status(400).json({ message: 'User not found. Please register first.' });
    }

    // Update Google ID if not set
    if (!user.googleId) {
      user.googleId = googleId;
      user.picture = picture;
      await user.save();
    }

    console.log('Google login successful:', { id: user._id, email: user.email });

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture
      },
      message: 'Google login successful'
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Server error during Google login' });
  }
};

// Google Register
exports.googleRegister = async (req, res) => {
  try {
    console.log('Google registration attempt:', { email: req.body.email });

    const { googleId, email, name, picture } = req.body;

    // Validation
    if (!googleId || !email || !name) {
      console.log('Google registration failed: Missing required fields');
      return res.status(400).json({ message: 'Google ID, email, and name are required' });
    }

    // Check if user exists
    const userExists = await User.findOne({
      $or: [
        { googleId: googleId },
        { email: email.toLowerCase().trim() }
      ]
    });

    if (userExists) {
      console.log('Google registration failed: User already exists');
      return res.status(400).json({ message: 'User already exists with this email or Google account' });
    }

    // Create user with Google data
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      googleId: googleId,
      picture: picture,
      password: 'google_auth' // Placeholder password for Google users
    });

    console.log('Google user created successfully:', { id: user._id, email: user.email });

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture
      },
      message: 'Google user registered successfully'
    });
  } catch (error) {
    console.error('Google register user error:', error);
    res.status(500).json({ message: 'Server error during Google registration' });
  }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    // req.user is set in authMiddleware
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        picture: user.picture,
        createdAt: user.createdAt,
        budget: user.budget
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // Validate input
    if (!name || !email || !phone) {
      return res.status(400).json({ message: 'Name, email, and phone are required' });
    }

    // Check if email is taken by another user
    const emailTaken = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.user._id } });
    if (emailTaken) {
      return res.status(400).json({ message: 'Email is already taken by another user' });
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name: name.trim(), email: email.toLowerCase().trim(), phone: phone.trim() },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};

exports.setBudget = async (req, res) => {
  try {
    const { budget } = req.body;

    // Validate budget
    if (budget === undefined || budget < 0) {
      return res.status(400).json({ message: 'Budget must be a non-negative number' });
    }

    // Update user's budget
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { budget: budget },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        budget: user.budget
      },
      message: 'Budget updated successfully'
    });
  } catch (error) {
    console.error('Set budget error:', error);
    res.status(500).json({ message: 'Server error while setting budget' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    // Find user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error while changing password' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Server error while deleting account' });
  }
};