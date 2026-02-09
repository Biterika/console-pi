const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { validateSessionId } = require('../middleware/validate');
const { generateSessionId } = require('../services/crypto');
const tmux = require('../services/tmux');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/sessions - List user's sessions
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, tmux_session, created_at FROM sessions WHERE user_id = ?',
      [req.authUser.id]
    );
    
    res.json(rows.map(s => ({
      id: s.id,
      name: s.name,
      tmuxSession: s.tmux_session,
      createdAt: s.created_at,
    })));
  } catch (err) {
    logger.error('Failed to list sessions:', err.message);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/sessions - Create session
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.authUser;
    
    if (!user.container) {
      return res.status(400).json({ error: 'No container assigned' });
    }
    
    const sessionId = generateSessionId();
    const tmuxSession = `sess${sessionId}`;
    
    // Create tmux session
    const startPi = req.body.startPi !== false;
    await tmux.createSession(user.container, tmuxSession, startPi);
    
    // Count existing sessions for naming
    const [existing] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?',
      [user.id]
    );
    
    const name = req.body.name || `Агент ${existing[0].cnt + 1}`;
    
    // Save to database
    await pool.execute(
      'INSERT INTO sessions (id, user_id, name, tmux_session) VALUES (?, ?, ?, ?)',
      [sessionId, user.id, name, tmuxSession]
    );
    
    logger.info(`Session ${name} created for user ${user.username}`);
    
    res.json({ id: sessionId, name, tmuxSession });
  } catch (err) {
    logger.error('Failed to create session:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sessions/:id - Delete session
 */
router.delete('/:id', requireAuth, validateSessionId, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.*, u.container 
       FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.id = ? AND s.user_id = ?`,
      [req.params.id, req.authUser.id]
    );
    
    const session = rows[0];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Kill tmux session
    tmux.killSession(session.container, session.tmux_session);
    
    // Delete from database
    await pool.execute('DELETE FROM sessions WHERE id = ?', [req.params.id]);
    
    logger.info(`Session ${session.name} deleted`);
    
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to delete session:', err.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});


/**
 * PATCH /api/sessions/:id - Rename session
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    
    const [rows] = await pool.execute(
      "SELECT * FROM sessions WHERE id = ? AND user_id = ?",
      [req.params.id, req.authUser.id]
    );
    
    if (!rows[0]) return res.status(404).json({ error: "Session not found" });
    
    await pool.execute("UPDATE sessions SET name = ? WHERE id = ?", [name, req.params.id]);
    
    res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: "Failed to rename" });
  }
});

module.exports = router;
