const config = require('../config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = config.nodeEnv === 'production' ? 'info' : 'debug';

function formatMessage(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ');
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

const logger = {
  error: (...args) => {
    if (levels.error <= levels[currentLevel]) {
      console.error(formatMessage('error', ...args));
    }
  },
  warn: (...args) => {
    if (levels.warn <= levels[currentLevel]) {
      console.warn(formatMessage('warn', ...args));
    }
  },
  info: (...args) => {
    if (levels.info <= levels[currentLevel]) {
      console.log(formatMessage('info', ...args));
    }
  },
  debug: (...args) => {
    if (levels.debug <= levels[currentLevel]) {
      console.log(formatMessage('debug', ...args));
    }
  },
};

module.exports = logger;
