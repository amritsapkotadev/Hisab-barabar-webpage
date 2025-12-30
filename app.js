const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); // Added mongoose for health check
const connectDB = require('./config/db');
require('dotenv').config();

// Import routes
const userRoutes = require('./backend/routes/userRoutes');
const groupRoutes = require('./backend/routes/groupRoutes');
const expenseRoutes = require('./backend/routes/expenseRoutes');
const authRoutes = require('./backend/routes/auth');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:8081', 
    'http://localhost:3000', 
    'http://127.0.0.1:8081', 
    'http://localhost:19006',
    'https://splitsaathi.up.railway.app',
    'https://*.up.railway.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Routes: **IMPORTANT** - Fixed route mounting
app.use('/users', userRoutes);  // User routes: /users/register, /users/login
app.use('/api/groups', groupRoutes);  // Group routes: /api/groups/
app.use('/groups', groupRoutes);  // Also mount at /groups for compatibility
app.use('/api/expenses', expenseRoutes);  // Expense routes: /api/expenses/
app.use('/expenses', expenseRoutes);  // Also mount at /expenses for compatibility
app.use('/api/auth', authRoutes);

// Serve static files for the join page (if needed)
app.use(express.static('public'));

// Handle group join links - redirect to app or show join page
app.get('/join/:groupId', (req, res) => {
  const { groupId } = req.params;
  const userAgent = req.get('User-Agent') || '';
  
  // Check if it's a mobile device
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
  
  // Get app domain from environment variable
  const APP_DOMAIN = process.env.APP_DOMAIN || 'splitsaathi.up.railway.app';
  
  if (isMobile) {
    // Try to open the app with deep link, fallback to app store
    const deepLink = `splitsaathi://join/${groupId}`;
    const appStoreLink = 'https://apps.apple.com/app/splitsaathi'; // Replace with actual app store link
    const playStoreLink = 'https://play.google.com/store/apps/details?id=com.splitsaathi'; // Replace with actual play store link
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Join Group - SplitSaathi</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            background: white; 
            padding: 40px 30px; 
            border-radius: 20px; 
            text-align: center; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 100%;
          }
          .logo { 
            font-size: 48px; 
            margin-bottom: 20px; 
          }
          h1 { 
            color: #333; 
            margin-bottom: 10px; 
            font-size: 24px;
          }
          p { 
            color: #666; 
            margin-bottom: 30px; 
            line-height: 1.5;
          }
          .btn { 
            display: inline-block; 
            padding: 15px 30px; 
            background: #4f46e5; 
            color: white; 
            text-decoration: none; 
            border-radius: 10px; 
            margin: 10px; 
            font-weight: 600;
            transition: background 0.3s;
          }
          .btn:hover { 
            background: #4338ca; 
          }
          .btn-secondary { 
            background: #6b7280; 
          }
          .btn-secondary:hover { 
            background: #4b5563; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">💰</div>
          <h1>Join Group on SplitSaathi</h1>
          <p>You've been invited to join a group for splitting expenses. Open the SplitSaathi app to continue.</p>
          
          <a href="${deepLink}" class="btn">Open SplitSaathi App</a>
          <br>
          <a href="${appStoreLink}" class="btn btn-secondary">Download for iOS</a>
          <a href="${playStoreLink}" class="btn btn-secondary">Download for Android</a>
          
          <script>
            // Try to open the app automatically
            setTimeout(() => {
              window.location.href = '${deepLink}';
            }, 1000);
          </script>
        </div>
      </body>
      </html>
    `);
  } else {
    // Desktop - redirect to web app
    res.redirect(`https://${APP_DOMAIN}/join/${groupId}`);
  }
});

// Health check route
app.get('/', (req, res) => {
  res.json({ 
    message: 'SplitSaathi API is running!',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'Connected to MongoDB' : 'Database connection issue',
    domain: process.env.APP_DOMAIN || 'splitsaathi.up.railway.app'
  });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API test successful',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    domain: process.env.APP_DOMAIN || 'splitsaathi.up.railway.app'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found` 
  });
});

const PORT = process.env.PORT || 5051;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 JWT Secret configured: ${!!process.env.JWT_SECRET}`);
  console.log(`🗄️ MongoDB URI configured: ${!!process.env.MONGO_URI}`);
  console.log(`🌐 App Domain: ${process.env.APP_DOMAIN || 'splitsaathi.up.railway.app'}`);
});

module.exports = app;