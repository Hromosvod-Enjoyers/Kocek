const path = require('path');
const fs = require('fs');
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SECRET = 'hromosvody-secredsdsfsfsdt-chaos-kocky-vybuchy';
const USERS_FILE = path.join(ROOT, 'users.json');
const MESSAGES_FILE = path.join(ROOT, 'messages.json');
const SESSION_FILE = path.join(ROOT, 'session.json');
const LOG_FILE = path.join(ROOT, 'log.json');

// Clear data on server start
const serverStartTime = Date.now();
fs.writeFileSync(USERS_FILE, JSON.stringify([]));
fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
fs.writeFileSync(SESSION_FILE, JSON.stringify({ startTime: serverStartTime }));

// Initialize log.json if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, JSON.stringify({}));
}

console.log('Server starting - all chat data cleared!');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Function to log IP and username to log.json
const logActivity = (username, ipAddress) => {
  try {
    let logs = readJSON(LOG_FILE);
    if (typeof logs !== 'object' || logs === null) logs = {};
    
    // Initialize IP array if it doesn't exist
    if (!logs[ipAddress]) {
      logs[ipAddress] = [];
    }
    
    // Add username to the IP's list
    logs[ipAddress].push(username);
    
    writeJSON(LOG_FILE, logs);
  } catch (err) {
    console.error('Error writing to log.json:', err);
  }
};

// Function to get client IP address
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.socket.remoteAddress || 
         'unknown';
};

// Rate limiting store: { ip: [timestamp1, timestamp2, ...] }
const rateLimitStore = {};

// Rate limiting middleware
const rateLimit = (maxRequests = 10, windowMs = 60000) => {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    
    if (!rateLimitStore[ip]) {
      rateLimitStore[ip] = [];
    }
    
    // Remove old requests outside the time window
    rateLimitStore[ip] = rateLimitStore[ip].filter(time => now - time < windowMs);
    
    if (rateLimitStore[ip].length >= maxRequests) {
      return res.status(429).json({ error: 'Příliš mnoho requestů. Zkuste později.' });
    }
    
    rateLimitStore[ip].push(now);
    next();
  };
};

app.use(express.json());
app.use(express.static(ROOT, { index: false }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Get server session info
app.get('/api/chat/session', (_req, res) => {
  const session = readJSON(SESSION_FILE);
  res.json({ startTime: session.startTime });
});

app.post('/api/chat/register', rateLimit(5, 60000), (req, res) => {
  const { username } = req.body;
  const clientIp = getClientIp(req);
  
  if (!username || username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Username musí mít 2-20 znaků' });
  }
  
  const users = readJSON(USERS_FILE);
  const exists = users.find(u => u.username === username);
  
  if (exists) {
    return res.status(409).json({ error: 'Username je již zabraný' });
  }

  const user = { username, createdAt: new Date().toISOString() };
  users.push(user);
  writeJSON(USERS_FILE, users);
  
  // Log the registration with IP and username
  logActivity(username, clientIp);
  
  const token = jwt.sign({ username }, SECRET);
  
  res.json({ token, username });
});

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    const decoded = jwt.verify(token, SECRET);
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === decoded.username);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/chat/send', verifyToken, rateLimit(30, 60000), (req, res) => {
  const { encryptedText } = req.body;
  const clientIp = getClientIp(req);
  
  if (!encryptedText || encryptedText.length === 0) {
    return res.status(400).json({ error: 'Encrypted text is required' });
  }
  
  const messages = readJSON(MESSAGES_FILE);
  const message = {
    id: Date.now(),
    username: req.user.username,
    encryptedText,
    timestamp: new Date().toISOString()
  };
  
  messages.push(message);
  writeJSON(MESSAGES_FILE, messages);
  
  // Log the activity with IP and username
  logActivity(req.user.username, clientIp);
  
  res.json({ ok: true, message });
});

app.get('/api/chat/messages', (req, res) => {
  const messages = readJSON(MESSAGES_FILE);
  res.json(messages);
});

app.get('/api/chat/users', (req, res) => {
  const users = readJSON(USERS_FILE);
  res.json(users.map(u => u.username));
});

app.use((_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`hromosvody server running on http://localhost:${PORT}`);
});
