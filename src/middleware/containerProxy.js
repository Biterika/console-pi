const { createProxyMiddleware } = require('http-proxy-middleware');
const { execSync } = require('child_process');
const pool = require('../db/pool');
const logger = require('../utils/logger');

// Cache container IPs for 30 seconds
const ipCache = new Map();
const CACHE_TTL = 30000;

function getContainerIP(containerName) {
  const cached = ipCache.get(containerName);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.ip;
  }
  
  try {
    const raw = execSync(
      `lxc list ${containerName} --format json`,
      { timeout: 5000 }
    ).toString();
    const data = JSON.parse(raw);
    if (!data[0]?.state?.network?.eth0?.addresses) return null;
    const addr = data[0].state.network.eth0.addresses.find(a => a.family === 'inet');
    const ip = addr?.address || null;
    
    if (ip) {
      ipCache.set(containerName, { ip, time: Date.now() });
    }
    return ip;
  } catch (err) {
    logger.error(`Failed to get IP for ${containerName}: ${err.message}`);
    return null;
  }
}

async function getUserContainer(username) {
  try {
    const [rows] = await pool.execute(
      'SELECT container FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );
    return rows[0]?.container || null;
  } catch (err) {
    logger.error(`Failed to get container for ${username}: ${err.message}`);
    return null;
  }
}

// Middleware to handle /:username::port/* requests
async function containerProxy(req, res, next) {
  // Match pattern: /username:port/...
  const match = req.path.match(/^\/([a-zA-Z][a-zA-Z0-9_-]*):(\d+)(\/.*)?$/);
  if (!match) {
    return next();
  }
  
  const [, username, port, subpath = '/'] = match;
  const portNum = parseInt(port);
  
  if (portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'Invalid port' });
  }
  
  // Get container name for user
  const container = await getUserContainer(username);
  if (!container) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Get container IP
  const ip = getContainerIP(container);
  if (!ip) {
    return res.status(502).json({ error: 'Container not running' });
  }
  
  const target = `http://${ip}:${portNum}`;
  
  logger.info(`Proxy: ${req.path} -> ${target}${subpath}`);
  
  // Rewrite the URL before proxying
  req.url = subpath;
  
  // Create proxy
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    onError: (err, req, res) => {
      logger.error(`Proxy error: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Service unavailable' });
      }
    }
  });
  
  return proxy(req, res, next);
}

module.exports = containerProxy;
