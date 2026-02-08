# Beebro

Web-based terminal interface for AI coding agents (pi) with LXC container isolation.

## Features

- 🔐 User authentication with session management
- 📦 Isolated LXC containers per user
- 💻 Real-time terminal via WebSocket + xterm.js
- 🤖 Each session runs `pi` AI coding agent
- 📁 File browser for container filesystem
- 👑 Admin panel with server monitoring
- 📱 Mobile-responsive design

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Caddy (reverse proxy) - SSL, console.beebro.com               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│  Node.js (Express + WebSocket)                                  │
│  - REST API for users, sessions, files                          │
│  - WebSocket + node-pty for terminal                            │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  MySQL          │ │  LXD Containers │ │  phpMyAdmin     │
│  users/sessions │ │  beebro-{user}  │ │  /pma           │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Project Structure

```
src/
├── config/           # Configuration from env
├── db/               # Database pool
├── middleware/       # Auth & validation
├── routes/           # API endpoints
├── services/         # Business logic
├── websocket/        # Terminal WebSocket
├── utils/            # Helpers & logger
├── app.js            # Express app
└── index.js          # Entry point

tests/
├── unit/             # Unit tests
└── integration/      # API tests
```

## Installation

### Prerequisites

- Ubuntu 24.04
- Node.js 18+
- LXD 5.x
- MySQL 8.x
- Caddy 2.x

### Setup

1. Clone repository:
```bash
git clone https://github.com/Biterika/console-pi.git
cd console-pi
```

2. Install dependencies:
```bash
npm install
```

3. Copy env file and configure:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Setup MySQL:
```sql
CREATE DATABASE beebro;
CREATE USER 'beebro'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON beebro.* TO 'beebro'@'localhost';

USE beebro;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  container VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255),
  tmux_session VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE auth_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create admin user (password: admin)
INSERT INTO users (username, password, is_admin, container) 
VALUES ('admin', 'admin', TRUE, 'beebro-admin');
```

5. Setup LXD container template:
```bash
lxc launch ubuntu:24.04 beebro-base
lxc exec beebro-base -- apt update
lxc exec beebro-base -- apt install -y tmux nodejs npm
lxc exec beebro-base -- npm install -g @anthropic/pi
# Configure pi in /root/.pi/agent/
lxc stop beebro-base
lxc publish beebro-base --alias beebro-template
```

6. Start server:
```bash
npm start
```

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

## API Endpoints

### Auth
- `POST /api/login` - Login
- `POST /api/logout` - Logout
- `GET /api/me` - Current user

### Users (admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `DELETE /api/users/:id` - Delete user

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `DELETE /api/sessions/:id` - Delete session

### Files
- `GET /api/files?path=/root` - List files

### Server (admin only)
- `GET /api/server/info` - Server stats
- `GET /api/server/containers` - List containers
- `GET /api/server/containers/:name/sessions` - Container sessions

### WebSocket
- `ws://host/?session={id}&token={token}` - Terminal connection

## Security

- Passwords hashed with PBKDF2 (100k iterations)
- Cryptographically secure session tokens
- Input validation on all endpoints
- Path sanitization for file browser
- Container isolation per user

## License

MIT
