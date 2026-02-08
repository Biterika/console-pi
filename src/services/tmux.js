const container = require('./container');
const logger = require('../utils/logger');

/**
 * Create a new tmux session running pi
 */
async function createSession(containerName, sessionName) {
  logger.info(`Creating tmux session ${sessionName} in ${containerName}`);
  
  await container.ensureContainerRunning(containerName);
  
  try {
    container.exec(containerName, `tmux new-session -d -s ${sessionName} pi`);
    logger.info(`Session ${sessionName} created`);
    return sessionName;
  } catch (err) {
    logger.error(`Failed to create session ${sessionName}:`, err.message);
    throw new Error(`Failed to create session: ${err.message}`);
  }
}

/**
 * Kill a tmux session
 */
function killSession(containerName, sessionName) {
  logger.info(`Killing tmux session ${sessionName} in ${containerName}`);
  
  try {
    container.exec(containerName, `tmux kill-session -t ${sessionName}`, { timeout: 5000 });
  } catch (err) {
    logger.debug(`Session ${sessionName} might already be dead:`, err.message);
  }
}

/**
 * List tmux sessions in container
 */
function listSessions(containerName) {
  try {
    const raw = container.exec(
      containerName,
      'tmux list-sessions -F "#{session_name}|#{session_created}" 2>/dev/null || echo ""'
    ).toString();
    
    return raw.trim().split('\n').filter(l => l).map(line => {
      const [name, created] = line.split('|');
      return {
        name,
        created: created ? new Date(parseInt(created) * 1000).toISOString() : null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Check if session exists
 */
function sessionExists(containerName, sessionName) {
  const sessions = listSessions(containerName);
  return sessions.some(s => s.name === sessionName);
}

module.exports = {
  createSession,
  killSession,
  listSessions,
  sessionExists,
};
