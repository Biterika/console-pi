const express = require("express");
const { requireAuth } = require("../middleware/auth");
const container = require("../services/container");
const logger = require("../utils/logger");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Helper to sanitize path
function sanitizePath(inputPath, baseDir = "/root") {
  const normalized = path.normalize(inputPath || "/");
  // Remove leading slashes and resolve
  const resolved = path.resolve(baseDir, normalized.replace(/^\/+/, ""));
  // Ensure stays within container
  if (!resolved.startsWith("/")) {
    return baseDir;
  }
  return resolved;
}

// Get container rootfs path
function getContainerRoot(containerName) {
  return `/mnt/lxd-storage/containers/${containerName}/rootfs`;
}

/**
 * GET /api/files - List files in directory
 */
router.get("/", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const requestedPath = req.query.path || "/root";
    const fullPath = sanitizePath(requestedPath, "/");
    const containerRoot = getContainerRoot(user.container);
    const hostPath = path.join(containerRoot, fullPath);

    // Check path exists
    if (!fs.existsSync(hostPath)) {
      return res.status(404).json({ error: "Path not found" });
    }

    const stats = fs.statSync(hostPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }

    const items = fs.readdirSync(hostPath);
    const files = items.map(name => {
      try {
        const itemPath = path.join(hostPath, name);
        const itemStats = fs.lstatSync(itemPath);
        return {
          name,
          size: itemStats.size,
          isDir: itemStats.isDirectory(),
          isSymlink: itemStats.isSymbolicLink(),
          modified: itemStats.mtime,
          permissions: (itemStats.mode & parseInt("777", 8)).toString(8)
        };
      } catch (e) {
        return {
          name,
          size: 0,
          isDir: false,
          error: true
        };
      }
    });

    // Sort: directories first, then by name
    files.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: fullPath,
      files
    });
  } catch (err) {
    logger.error("Failed to list files:", err.message);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * GET /api/files/read - Read file content
 */
router.get("/read", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: "Path required" });
    }

    const fullPath = sanitizePath(requestedPath, "/");
    const containerRoot = getContainerRoot(user.container);
    const hostPath = path.join(containerRoot, fullPath);

    if (!fs.existsSync(hostPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = fs.statSync(hostPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Cannot read directory" });
    }

    // Limit file size
    if (stats.size > 1024 * 1024 * 5) { // 5MB max
      return res.status(400).json({ error: "File too large" });
    }

    const content = fs.readFileSync(hostPath, "utf8");
    res.json({ content, size: stats.size });
  } catch (err) {
    logger.error("Failed to read file:", err.message);
    res.status(500).json({ error: "Failed to read file" });
  }
});

/**
 * POST /api/files/write - Write file content
 */
router.post("/write", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const { path: filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "Path required" });
    }

    const fullPath = sanitizePath(filePath, "/");
    const containerRoot = getContainerRoot(user.container);
    const hostPath = path.join(containerRoot, fullPath);

    fs.writeFileSync(hostPath, content || "");
    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to write file:", err.message);
    res.status(500).json({ error: "Failed to write file" });
  }
});

/**
 * POST /api/files/mkdir - Create directory
 */
router.post("/mkdir", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: "Path required" });
    }

    const fullPath = sanitizePath(dirPath, "/");
    const containerRoot = getContainerRoot(user.container);
    const hostPath = path.join(containerRoot, fullPath);

    fs.mkdirSync(hostPath, { recursive: true });
    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to create directory:", err.message);
    res.status(500).json({ error: "Failed to create directory" });
  }
});

/**
 * DELETE /api/files - Delete file or directory
 */
router.delete("/", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: "Path required" });
    }

    const fullPath = sanitizePath(requestedPath, "/");
    const containerRoot = getContainerRoot(user.container);
    const hostPath = path.join(containerRoot, fullPath);

    // Prevent deleting root
    if (fullPath === "/" || fullPath === "/root") {
      return res.status(400).json({ error: "Cannot delete root" });
    }

    if (!fs.existsSync(hostPath)) {
      return res.status(404).json({ error: "Not found" });
    }

    const stats = fs.lstatSync(hostPath);
    if (stats.isDirectory()) {
      fs.rmSync(hostPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(hostPath);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to delete:", err.message);
    res.status(500).json({ error: "Failed to delete" });
  }
});

/**
 * POST /api/files/rename - Rename file or directory
 */
router.post("/rename", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: "Both paths required" });
    }

    const containerRoot = getContainerRoot(user.container);
    const hostOldPath = path.join(containerRoot, sanitizePath(oldPath, "/"));
    const hostNewPath = path.join(containerRoot, sanitizePath(newPath, "/"));

    if (!fs.existsSync(hostOldPath)) {
      return res.status(404).json({ error: "Not found" });
    }

    fs.renameSync(hostOldPath, hostNewPath);
    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to rename:", err.message);
    res.status(500).json({ error: "Failed to rename" });
  }
});

/**
 * GET /api/files/download - Download file
 */
router.get("/download", requireAuth, (req, res) => {
  try {
    const user = req.authUser;
    if (!user.container) {
      return res.status(400).json({ error: "No container assigned" });
    }

    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: "Path required" });
    }

    const fullPath = sanitizePath(requestedPath, "/");
    const containerRoot = getContainerRoot(user.container);
    const hostPath = path.join(containerRoot, fullPath);

    if (!fs.existsSync(hostPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = fs.statSync(hostPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Cannot download directory" });
    }

    res.download(hostPath);
  } catch (err) {
    logger.error("Failed to download:", err.message);
    res.status(500).json({ error: "Failed to download" });
  }
});


/**
 * GET /api/files/raw - Read raw file (for images)
 */
router.get("/raw", requireAuth, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: "Path required" });
  }
  
  const user = req.authUser;
  if (!user.container) {
    return res.status(400).json({ error: "No container" });
  }
  
  const rootfsPath = `/mnt/lxd-storage/containers/${user.container}/rootfs`;
  const fullPath = path.join(rootfsPath, filePath);
  
  // Security check
  if (!fullPath.startsWith(rootfsPath)) {
    return res.status(403).json({ error: "Access denied" });
  }
  
  // Block special paths
  if (filePath.startsWith("/dev") || filePath.startsWith("/proc") || filePath.startsWith("/sys")) {
    return res.status(403).json({ error: "Access denied" });
  }
  
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp',
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/files/upload - Upload file to container
 */
router.post("/upload", requireAuth, (req, res) => {
  const user = req.authUser;
  if (!user.container) {
    return res.status(400).json({ error: "No container assigned" });
  }

  const targetPath = req.query.path || "/tmp";
  const containerRoot = getContainerRoot(user.container);
  
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      const filename = req.headers['x-filename'] || 'upload_' + Date.now();
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      
      const fullPath = sanitizePath(path.join(targetPath, safeName), "/");
      const hostPath = path.join(containerRoot, fullPath);
      
      const dir = path.dirname(hostPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(hostPath, buffer);
      logger.info('Uploaded file to ' + fullPath + ' for user ' + user.username);
      
      res.json({ success: true, path: fullPath });
    } catch (err) {
      logger.error('Failed to save uploaded file:', err.message);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });
});
module.exports = router;
