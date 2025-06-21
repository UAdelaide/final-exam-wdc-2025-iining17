const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add form parsing support
app.use(express.static(path.join(__dirname, '/public')));

// Session middleware
app.use(session({
  secret: 'dog-walking-secret-key', // Should use environment variable in production
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to false in development, true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;