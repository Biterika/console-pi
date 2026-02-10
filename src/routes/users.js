const express = require("express");
const { execSync } = require("child_process");
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
const { validateCreateUser } = require("../middleware/validate");
const { hashPassword } = require("../services/crypto");
const container = require("../services/container");
const proxy = require("../services/proxy");
const logger = require("../utils/logger");
const config = require("../config");

const router = express.Router();

/**
 * GET /api/users - List all users
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, is_admin, container, created_at, proxy_key FROM users"
    );
    
    res.json(rows.map(u => ({
      id: u.id,
      username: u.username,
      isAdmin: !!u.is_admin,
      container: u.container,
      createdAt: u.created_at,
      proxyKey: u.proxy_key,
    })));
  } catch (err) {
    logger.error("Failed to list users:", err.message);
    res.status(500).json({ error: "Failed to list users" });
  }
});

/**
 * POST /api/users - Create user
 */
router.post("/", requireAdmin, validateCreateUser, async (req, res) => {
  try {
    const { username, password, isAdmin } = req.body;
    
    // Check if user exists
    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );
    
    if (existing.length) {
      return res.status(400).json({ error: "User already exists" });
    }
    
    // Create container
    let containerName;
    try {
      containerName = await container.createContainer(config.lxc.containerPrefix + username);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Create FTP user
    try {
      execSync(`/opt/beebro/add-ftp-user.sh "${username}" "${password}"`, { timeout: 5000 });
      logger.info(`FTP user ${username} created`);
    } catch (err) {
      logger.error("Failed to create FTP user:", err.message);
    }
    
    // Create proxy API key
    let proxyKey = null;
    try {
      const proxyData = await proxy.createProxyKey(username);
      proxyKey = proxyData.key;
      
      // Update models.json in container with personal key
      const modelsJson = JSON.stringify({
        providers: {
          "llm-proxy": {
            baseUrl: "https://dev-ai.beebro.com",
            apiKey: proxyKey,
            api: "anthropic-messages",
            models: [
              { id: "claude-opus-4-5-20251101", name: "Claude 4.5 Opus", contextWindow: 200000, maxTokens: 16384 },
              { id: "claude-sonnet-4-5-20250929", name: "Claude 4.5 Sonnet", contextWindow: 200000, maxTokens: 16384 },
              { id: "claude-sonnet-4-20250514", name: "Claude 4 Sonnet", contextWindow: 200000, maxTokens: 16384 }
            ]
          }
        }
      });
      execSync(`lxc exec ${containerName} -- bash -c 'mkdir -p /root/.pi/agent && echo ${JSON.stringify(modelsJson)} > /root/.pi/agent/models.json'`, { timeout: 10000 });
      logger.info(`Proxy key created and configured for ${username}`);
    } catch (err) {
      logger.error("Failed to create proxy key:", err.message);
    }
    
    // Hash password and create user in DB
    const hashedPassword = await hashPassword(password);
    
    const [result] = await pool.execute(
      "INSERT INTO users (username, password, is_admin, container, proxy_key) VALUES (?, ?, ?, ?, ?)",
      [username, hashedPassword, !!isAdmin, containerName, proxyKey]
    );
    
    logger.info(`User ${username} created with container ${containerName}`);
    
    res.json({
      id: result.insertId,
      username,
      container: containerName,
    });
  } catch (err) {
    logger.error("Failed to create user:", err.message);
    res.status(500).json({ error: "Failed to create user" });
  }
});

/**
 * DELETE /api/users/:id - Delete user
 */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE id = ?",
      [req.params.id]
    );
    
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Cant delete yourself
    if (user.id === req.authUser.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }
    
    // Delete FTP user
    try {
      execSync(`/opt/beebro/del-ftp-user.sh "${user.username}"`, { timeout: 5000 });
      logger.info(`FTP user ${user.username} deleted`);
    } catch (err) {
      logger.error("Failed to delete FTP user:", err.message);
    }
    
    // Delete container
    if (user.container) {
      await container.deleteContainer(user.container);
    }
    
    // Delete user and related data
    await pool.execute("DELETE FROM auth_tokens WHERE user_id = ?", [user.id]);
    await pool.execute("DELETE FROM sessions WHERE user_id = ?", [user.id]);
    await pool.execute("DELETE FROM users WHERE id = ?", [user.id]);
    
    logger.info(`User ${user.username} deleted`);
    
    res.json({ ok: true });
  } catch (err) {
    logger.error("Failed to delete user:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
