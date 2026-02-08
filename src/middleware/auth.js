const pool = require('../db/pool');
const { parseCookies } = require('../utils/helpers');

/**
 * Get user by auth token
 */
async function getUserByToken(token) {
  if (!token) return null;
  
  const [rows] = await pool.execute(
    `SELECT u.* FROM users u 
     JOIN auth_tokens a ON u.id = a.user_id 
     WHERE a.token = ? AND (a.expires_at IS NULL OR a.expires_at > NOW())`,
    [token]
  );
  
  return rows[0] || null;
}

/**
 * Middleware: require authenticated user
 */
async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const user = await getUserByToken(cookies.session);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.authUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware: require admin user
 */
async function requireAdmin(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const user = await getUserByToken(cookies.session);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    req.authUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = {
  getUserByToken,
  requireAuth,
  requireAdmin,
};
