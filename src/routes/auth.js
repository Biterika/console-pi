const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { verifyPassword, generateToken } = require('../services/crypto');
const { parseCookies } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password (support both plain text legacy and hashed)
    const isValid = user.password.includes(':')
      ? await verifyPassword(password, user.password)
      : password === user.password;
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken();
    await pool.execute(
      'INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [token, user.id]
    );
    
    logger.info(`User ${username} logged in`);
    
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; Max-Age=${config.session.maxAge}`);
    res.json({
      username: user.username,
      isAdmin: !!user.is_admin,
      token,
    });
  } catch (err) {
    logger.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/logout
 */
router.post('/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    
    if (cookies.session) {
      await pool.execute('DELETE FROM auth_tokens WHERE token = ?', [cookies.session]);
    }
    
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
    res.json({ ok: true });
  } catch (err) {
    logger.error('Logout error:', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/me
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({
    username: req.authUser.username,
    isAdmin: !!req.authUser.is_admin,
  });
});

module.exports = router;
