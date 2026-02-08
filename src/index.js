const http = require('http');
const app = require('./app');
const { setupWebSocket } = require('./websocket/terminal');
const config = require('./config');
const logger = require('./utils/logger');

const server = http.createServer(app);

// Setup WebSocket
setupWebSocket(server);

// Start server
server.listen(config.port, () => {
  logger.info(`Beebro running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
