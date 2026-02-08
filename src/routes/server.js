const express = require('express');
const { execSync } = require('child_process');
const { requireAdmin } = require('../middleware/auth');
const { validateContainerName } = require('../middleware/validate');
const containerService = require('../services/container');
const tmux = require('../services/tmux');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/server/info - Server stats
 */
router.get('/info', requireAdmin, (req, res) => {
  try {
    // Memory
    const memRaw = execSync('free -b').toString();
    const memParts = memRaw.split('\n')[1].split(/\s+/);
    const memory = {
      total: parseInt(memParts[1]),
      used: parseInt(memParts[2]),
      free: parseInt(memParts[3]),
    };
    
    // CPU
    const cpuCores = parseInt(execSync('grep -c ^processor /proc/cpuinfo').toString().trim());
    const loadAvg = execSync('cat /proc/loadavg').toString().trim().split(' ');
    
    // Disk
    const diskRaw = execSync('df -B1 /').toString().split('\n')[1].split(/\s+/);
    const disk = {
      total: parseInt(diskRaw[1]),
      used: parseInt(diskRaw[2]),
      free: parseInt(diskRaw[3]),
    };
    
    // Uptime
    const uptime = execSync('uptime -p').toString().trim();
    
    res.json({
      memory,
      cpu: { cores: cpuCores, load: parseFloat(loadAvg[0]) },
      disk,
      uptime,
    });
  } catch (err) {
    logger.error('Failed to get server info:', err.message);
    res.status(500).json({ error: 'Failed to get server info' });
  }
});

/**
 * GET /api/server/containers - List containers
 */
router.get('/containers', requireAdmin, (req, res) => {
  try {
    const containers = containerService.listContainers();
    res.json(containers);
  } catch (err) {
    logger.error('Failed to list containers:', err.message);
    res.status(500).json({ error: 'Failed to list containers' });
  }
});

/**
 * GET /api/server/containers/:name/sessions - List tmux sessions in container
 */
router.get('/containers/:name/sessions', requireAdmin, validateContainerName, (req, res) => {
  try {
    const sessions = tmux.listSessions(req.params.name);
    res.json(sessions);
  } catch (err) {
    logger.error('Failed to list container sessions:', err.message);
    res.json([]);
  }
});

module.exports = router;
