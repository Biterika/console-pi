const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const pool = require('../db/pool');
const { getUserByToken } = require('../middleware/auth');
const { parseCookies } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Setup WebSocket server for terminal connections
 */
function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', handleConnection);
  
  logger.info('WebSocket server initialized');
  
  return wss;
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('session');
  const token = url.searchParams.get('token');
  
  // Authenticate
  const cookies = parseCookies(req.headers.cookie);
  const authToken = token || cookies.session;
  const user = await getUserByToken(authToken);
  
  if (!user) {
    logger.warn('WebSocket: Unauthorized connection attempt');
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  // Get session
  const [rows] = await pool.execute(
    'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
    [sessionId, user.id]
  );
  const session = rows[0];
  
  if (!user.container || !session) {
    logger.warn(`WebSocket: Invalid session ${sessionId} for user ${user.username}`);
    ws.close(1008, 'Invalid session');
    return;
  }
  
  logger.info(`WebSocket: User ${user.username} attached to ${session.tmux_session}`);
  
  // Spawn PTY process
  const proc = pty.spawn('lxc', [
    'exec', '-t', '--env', 'TERM=xterm-256color', user.container, '--',
    'tmux', 'attach-session', '-t', session.tmux_session
  ], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    env: process.env,
  });
  
  // PTY → WebSocket
  proc.on('data', data => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  });
  
  // WebSocket → PTY
  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'input') {
        proc.write(msg.data);
      }
      
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        proc.resize(msg.cols, msg.rows);
      }
    } catch (err) {
      logger.debug('WebSocket message parse error:', err.message);
    }
  });
  
  // Cleanup
  ws.on('close', () => {
    logger.debug(`WebSocket: Connection closed for ${user.username}`);
    proc.kill();
  });
  
  proc.on('exit', (code) => {
    logger.debug(`PTY exited with code ${code}`);
    if (ws.readyState === 1) {
      ws.close();
    }
  });
}

module.exports = { setupWebSocket };
