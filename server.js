const express = require("express");
const { WebSocketServer } = require("ws");
const { execSync } = require("child_process");
const pty = require("node-pty");
const http = require("http");
const mysql = require("mysql2/promise");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "beebro",
  password: "BeeBro2026!",
  database: "beebro",
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(express.json());
app.use(express.static("public"));

function parseCookies(str) {
  if (!str) return {};
  return str.split(";").reduce((acc, c) => {
    const [k, v] = c.trim().split("=");
    acc[k] = v;
    return acc;
  }, {});
}

async function getUserByToken(token) {
  if (!token) return null;
  const [rows] = await pool.execute(
    "SELECT u.* FROM users u JOIN auth_tokens a ON u.id = a.user_id WHERE a.token = ? AND (a.expires_at IS NULL OR a.expires_at > NOW())",
    [token]
  );
  return rows[0] || null;
}

async function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const user = await getUserByToken(cookies.session);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.authUser = user;
  next();
}

async function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const user = await getUserByToken(cookies.session);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!user.is_admin) return res.status(403).json({ error: "Forbidden" });
  req.authUser = user;
  next();
}

// Auth
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid" });
  
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  await pool.execute(
    "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
    [token, user.id]
  );
  
  res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; Max-Age=604800`);
  res.json({ username: user.username, isAdmin: !!user.is_admin, token });
});

app.post("/api/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session) {
    await pool.execute("DELETE FROM auth_tokens WHERE token = ?", [cookies.session]);
  }
  res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ username: req.authUser.username, isAdmin: !!req.authUser.is_admin });
});

// Users
app.get("/api/users", requireAdmin, async (req, res) => {
  const [rows] = await pool.execute("SELECT id, username, is_admin, container, created_at FROM users");
  res.json(rows.map(u => ({
    id: u.id,
    username: u.username,
    isAdmin: !!u.is_admin,
    container: u.container,
    createdAt: u.created_at
  })));
});

app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  
  const [existing] = await pool.execute("SELECT id FROM users WHERE username = ?", [username]);
  if (existing.length) return res.status(400).json({ error: "User exists" });

  const containerName = `beebro-${username}`;
  console.log(`Creating container ${containerName}...`);

  try {
    execSync(`lxc launch beebro-template ${containerName}`, { timeout: 120000, stdio: "ignore" });
  } catch (e) {}

  await new Promise(r => setTimeout(r, 5000));

  const containerExists = execSync(`lxc list --format csv -c n`).toString().includes(containerName);
  if (!containerExists) {
    return res.status(500).json({ error: "Failed to create container" });
  }

  const [result] = await pool.execute(
    "INSERT INTO users (username, password, is_admin, container) VALUES (?, ?, ?, ?)",
    [username, password, !!isAdmin, containerName]
  );
  
  console.log(`Container ${containerName} created`);
  res.json({ id: result.insertId, username, container: containerName });
});

app.delete("/api/users/:id", requireAdmin, async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [req.params.id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.id === req.authUser.id) return res.status(400).json({ error: "Нельзя удалить себя" });

  if (user.container) {
    try {
      execSync(`lxc delete ${user.container} --force`, { timeout: 30000 });
    } catch (err) { console.error(err.message); }
  }
  
  await pool.execute("DELETE FROM users WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Sessions
app.get("/api/sessions", requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT id, name, tmux_session, created_at FROM sessions WHERE user_id = ?",
    [req.authUser.id]
  );
  res.json(rows.map(s => ({ id: s.id, name: s.name, tmuxSession: s.tmux_session, createdAt: s.created_at })));
});

app.post("/api/sessions", requireAuth, async (req, res) => {
  const user = req.authUser;
  if (!user.container) return res.status(400).json({ error: "No container" });

  const sessionId = `s${Date.now()}`;
  const tmuxSession = `sess${sessionId}`;

  try {
    const state = execSync(`lxc list ${user.container} --format csv -c s`).toString().trim();
    if (state !== "RUNNING") {
      execSync(`lxc start ${user.container}`, { timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
    }
    
    execSync(`lxc exec ${user.container} -- tmux new-session -d -s ${tmuxSession} pi`, { timeout: 10000 });

    const [existing] = await pool.execute("SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?", [user.id]);
    const name = req.body.name || `Агент ${existing[0].cnt + 1}`;
    
    await pool.execute(
      "INSERT INTO sessions (id, user_id, name, tmux_session) VALUES (?, ?, ?, ?)",
      [sessionId, user.id, name, tmuxSession]
    );
    
    res.json({ id: sessionId, name, tmuxSession });
  } catch (err) {
    console.error("Failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/sessions/:id", requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT s.*, u.container FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.user_id = ?",
    [req.params.id, req.authUser.id]
  );
  const session = rows[0];
  if (!session) return res.status(404).json({ error: "Not found" });

  try {
    execSync(`lxc exec ${session.container} -- tmux kill-session -t ${session.tmux_session}`, { timeout: 5000 });
  } catch {}
  
  await pool.execute("DELETE FROM sessions WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Server info (admin only)
app.get("/api/server/info", requireAdmin, (req, res) => {
  try {
    const memRaw = execSync("free -b").toString();
    const memLines = memRaw.split("\\n");
    const memParts = memLines[1].split(/\s+/);
    const memory = {
      total: parseInt(memParts[1]),
      used: parseInt(memParts[2]),
      free: parseInt(memParts[3])
    };
    
    const cpuRaw = execSync("grep -c ^processor /proc/cpuinfo").toString().trim();
    const loadRaw = execSync("cat /proc/loadavg").toString().trim().split(" ");
    
    const uptimeRaw = execSync("uptime -p").toString().trim();
    
    const diskRaw = execSync("df -B1 /").toString().split("\\n")[1].split(/\s+/);
    const disk = {
      total: parseInt(diskRaw[1]),
      used: parseInt(diskRaw[2]),
      free: parseInt(diskRaw[3])
    };
    
    res.json({
      memory,
      cpu: { cores: parseInt(cpuRaw), load: parseFloat(loadRaw[0]) },
      disk,
      uptime: uptimeRaw
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/server/containers", requireAdmin, (req, res) => {
  try {
    const raw = execSync("lxc list --format json").toString();
    const containers = JSON.parse(raw).filter(c => !c.name.includes("base")).map(c => ({
      name: c.name,
      status: c.status,
      ip: c.state?.network?.eth0?.addresses?.find(a => a.family === "inet")?.address || null
    }));
    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/server/containers/:name/sessions", requireAdmin, (req, res) => {
  try {
    const raw = execSync(`lxc exec ${req.params.name} -- tmux list-sessions -F "#{session_name}|#{session_created}" 2>/dev/null || echo ""`).toString();
    const sessions = raw.trim().split("\n").filter(l => l).map(line => {
      const [name, created] = line.split("|");
      return { name, created: created ? new Date(parseInt(created) * 1000).toISOString() : null };
    });
    res.json(sessions);
  } catch {
    res.json([]);
  }
});

// Files
app.get("/api/files", requireAuth, (req, res) => {
  const user = req.authUser;
  if (!user.container) return res.status(400).json({ error: "No container" });
  const dir = req.query.path || "/root";
  try {
    const output = execSync(`lxc exec ${user.container} -- ls -la --time-style=long-iso '${dir}'`, { timeout: 5000 }).toString();
    const files = output.split("\\n").slice(1).filter(l => l.trim()).map(line => {
      const p = line.split(/\s+/);
      if (p.length < 8) return null;
      return { name: p.slice(7).join(" "), size: p[4], date: p[5] + " " + p[6], isDir: p[0].startsWith("d") };
    }).filter(f => f && f.name !== "." && f.name !== "..");
    res.json(files);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// WebSocket
wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const sessionId = url.searchParams.get("session");
  const token = url.searchParams.get("token");

  const cookies = parseCookies(req.headers.cookie);
  const authToken = token || cookies.session;
  const user = await getUserByToken(authToken);

  if (!user) { ws.close(1008, "Unauthorized"); return; }

  const [rows] = await pool.execute(
    "SELECT * FROM sessions WHERE id = ? AND user_id = ?",
    [sessionId, user.id]
  );
  const session = rows[0];

  if (!user.container || !session) { ws.close(1008, "Invalid session"); return; }

  console.log(`WS: Attaching to ${session.tmux_session}`);

  const proc = pty.spawn("lxc", ["exec", user.container, "--", "tmux", "attach-session", "-t", session.tmux_session], 
    { name: "xterm-256color", cols: 80, rows: 24 });

  proc.on("data", data => { if (ws.readyState === 1) ws.send(data); });

  ws.on("message", data => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "input") proc.write(msg.data);
      if (msg.type === "resize" && msg.cols && msg.rows) proc.resize(msg.cols, msg.rows);
    } catch {}
  });

  ws.on("close", () => proc.kill());
  proc.on("exit", () => { if (ws.readyState === 1) ws.close(); });
});

server.listen(3000, () => console.log("Beebro running on port 3000"));
