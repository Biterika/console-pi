/**
 * Parse cookies from header string
 */
function parseCookies(str) {
  if (!str) return {};
  return str.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

/**
 * Validate username (alphanumeric, 3-32 chars)
 */
function isValidUsername(username) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

/**
 * Validate password (min 4 chars)
 */
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 4;
}

/**
 * Sanitize path to prevent directory traversal
 */
function sanitizePath(path) {
  // Remove null bytes
  let clean = path.replace(/\0/g, '');
  // Resolve .. and normalize
  const parts = clean.split('/').filter(p => p && p !== '..');
  return '/' + parts.join('/');
}

module.exports = {
  parseCookies,
  formatBytes,
  isValidUsername,
  isValidPassword,
  sanitizePath,
};
