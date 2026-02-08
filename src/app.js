const express = require('express');
const path = require('path');

// Routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const sessionsRoutes = require('./routes/sessions');
const filesRoutes = require('./routes/files');
const serverRoutes = require('./routes/server');

const app = express();

// Middleware
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/server', serverRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
