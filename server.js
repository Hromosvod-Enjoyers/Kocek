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

// Clear data on server start
const serverStartTime = Date.now();
fs.writeFileSync(USERS_FILE, JSON.stringify([]));
fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
fs.writeFileSync(SESSION_FILE, JSON.stringify({ startTime: serverStartTime }));

console.log('Server starting - all chat data cleared!');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

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

app.post('/api/chat/register', (req, res) => {
  const { username, publicKey } = req.body;
  
  if (!username || username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'Username musí mít 2-20 znaků' });
  }
  
  if (!publicKey) {
    return res.status(400).json({ error: 'Public key is required' });
  }
  
  const users = readJSON(USERS_FILE);
  const exists = users.find(u => u.username === username);
  
  if (exists) {
    return res.status(409).json({ error: 'Username je již zabraný' });
  }

  const user = { username, publicKey, createdAt: new Date().toISOString() };
  users.push(user);
  writeJSON(USERS_FILE, users);
  
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

app.post('/api/chat/send', verifyToken, (req, res) => {
  const { encryptedText } = req.body;
  
  if (!encryptedText || encryptedText.length === 0) {
    return res.status(400).json({ error: 'Encrypted message is required' });
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
  
  res.json({ ok: true, message });
});

app.get('/api/chat/messages', (req, res) => {
  const messages = readJSON(MESSAGES_FILE);
  res.json(messages);
});

app.get('/api/chat/users', (req, res) => {
  const users = readJSON(USERS_FILE);
  res.json(users.map(u => ({ username: u.username, publicKey: u.publicKey })));
});

app.use((_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`hromosvody server running on http://localhost:${PORT}`);
});
