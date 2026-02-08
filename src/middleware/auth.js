const pool = require("../db/pool");
const { parseCookies } = require("../utils/helpers");

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
 * Extract token from request (cookies or Authorization header)
 */
function extractToken(req) {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  // Fallback to cookies
  const cookies = parseCookies(req.headers.cookie);
  return cookies.session || null;
}

/**
 * Middleware: require authenticated user
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    const user = await getUserByToken(token);
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    req.authUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Authentication error" });
  }
}

/**
 * Middleware: require admin user
 */
async function requireAdmin(req, res, next) {
  try {
    const token = extractToken(req);
    const user = await getUserByToken(token);
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.is_admin) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    req.authUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Authentication error" });
  }
}

module.exports = {
  getUserByToken,
  requireAuth,
  requireAdmin,
};
