const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');

const pool = mysql.createPool(config.db);

// Test connection on startup
pool.getConnection()
  .then(conn => {
    logger.info('Database connected successfully');
    conn.release();
  })
  .catch(err => {
    logger.error('Database connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
