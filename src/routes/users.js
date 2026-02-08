const express = require("express");
const { execSync } = require("child_process");
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
const { validateCreateUser } = require("../middleware/validate");
const { hashPassword } = require("../services/crypto");
const container = require("../services/container");
const logger = require("../utils/logger");

const router = express.Router();

/**
 * GET /api/users - List all users
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, is_admin, container, created_at FROM users"
    );
    
    res.json(rows.map(u => ({
      id: u.id,
      username: u.username,
      isAdmin: !!u.is_admin,
      container: u.container,
      createdAt: u.created_at,
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
      containerName = await container.createContainer(username);
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
    
    // Hash password and create user in DB
    const hashedPassword = await hashPassword(password);
    
    const [result] = await pool.execute(
      "INSERT INTO users (username, password, is_admin, container) VALUES (?, ?, ?, ?)",
      [username, hashedPassword, !!isAdmin, containerName]
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
