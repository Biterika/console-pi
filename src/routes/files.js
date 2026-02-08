const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { validateFilePath } = require('../middleware/validate');
const container = require('../services/container');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/files - List files in directory
 */
router.get('/', requireAuth, validateFilePath, (req, res) => {
  try {
    const user = req.authUser;
    
    if (!user.container) {
      return res.status(400).json({ error: 'No container assigned' });
    }
    
    const dir = req.sanitizedPath;
    
    const output = container.exec(
      user.container,
      `ls -la --time-style=long-iso '${dir}'`,
      { timeout: 5000 }
    ).toString();
    
    const files = output
      .split('\n')
      .slice(1) // Skip "total" line
      .filter(l => l.trim())
      .map(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 8) return null;
        
        const name = parts.slice(7).join(' ');
        if (name === '.' || name === '..') return null;
        
        return {
          name,
          size: parts[4],
          date: `${parts[5]} ${parts[6]}`,
          isDir: parts[0].startsWith('d'),
        };
      })
      .filter(Boolean);
    
    res.json(files);
  } catch (err) {
    logger.error('Failed to list files:', err.message);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

module.exports = router;
