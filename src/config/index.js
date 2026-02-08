require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'beebro',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'beebro',
    connectionLimit: 10,
    waitForConnections: true,
  },
  
  session: {
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
  
  lxc: {
    template: process.env.LXC_TEMPLATE || 'beebro-template',
    containerPrefix: process.env.LXC_CONTAINER_PREFIX || 'beebro-',
  },
};
