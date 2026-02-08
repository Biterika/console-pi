const { isValidUsername, isValidPassword, sanitizePath } = require('../utils/helpers');

/**
 * Middleware: validate user creation input
 */
function validateCreateUser(req, res, next) {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  if (!isValidUsername(username)) {
    return res.status(400).json({ 
      error: 'Username must be 3-32 characters, alphanumeric with _ and -' 
    });
  }
  
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  
  next();
}

/**
 * Middleware: validate and sanitize file path
 */
function validateFilePath(req, res, next) {
  const path = req.query.path || '/root';
  req.sanitizedPath = sanitizePath(path);
  next();
}

/**
 * Middleware: validate container name
 */
function validateContainerName(req, res, next) {
  const name = req.params.name;
  
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid container name' });
  }
  
  next();
}

/**
 * Middleware: validate session ID
 */
function validateSessionId(req, res, next) {
  const id = req.params.id;
  
  if (!id || !/^s[a-zA-Z0-9]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  
  next();
}

module.exports = {
  validateCreateUser,
  validateFilePath,
  validateContainerName,
  validateSessionId,
};
