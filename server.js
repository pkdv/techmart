const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ====== MongoDB ======
const MONGO_URI = 'mongodb+srv://techmart:password123%24@techmart.whkbejk.mongodb.net/?appName=techmart';
let db;
MongoClient.connect(MONGO_URI)
  .then(client => { db = client.db('techmart'); console.log('MongoDB Connected!'); })
  .catch(err => console.error('MongoDB Error:', err));

// ====== Hardcoded users ======
const hardcodedUsers = {
  admin: { password: 'password123', role: 'admin' },
  ahmed: { password: 'ahmed2024',   role: 'user'  },
  user:  { password: '123456',      role: 'user'  },
  test:  { password: 'test',        role: 'user'  },
};
const loginAttempts = {};

// ====== LOGIN — ⚠️ VULNERABLE: No rate limiting ======
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Missing fields');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';

  if (!loginAttempts[username]) loginAttempts[username] = 0;

  let validUser = hardcodedUsers[username] && hardcodedUsers[username].password === password;

  if (!validUser && db) {
    try {
      const dbUser = await db.collection('users').findOne({ username, password });
      if (dbUser) validUser = true;
    } catch(e) {}
  }

  if (validUser) {
    loginAttempts[username] = 0;
    try {
      if (db) await db.collection('users').updateOne(
        { username },
        { $set: { lastLogin: new Date(), ip, userAgent: ua } },
        { upsert: true }
      );
    } catch(e) {}
    res.status(200).send('Welcome admin');
  } else {
    loginAttempts[username]++;
    // ⚠️ VULN: logs but never blocks
    res.status(200).send('Wrong password');
  }
});

// ====== REGISTER ======
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password) return res.status(400).send('Missing fields');
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';
  try {
    if (!db) return res.status(500).send('DB not connected');
    const existing = await db.collection('users').findOne({ username });
    if (existing || hardcodedUsers[username]) return res.status(409).send('Username already exists');
    await db.collection('users').insertOne({
      username, password, email: email || '',
      ip, userAgent: ua, role: 'user',
      createdAt: new Date(), lastLogin: null
    });
    res.status(200).send('Registered successfully');
  } catch(e) { res.status(500).send('Server error'); }
});

// ====== FILE — ⚠️ VULNERABLE: Path Traversal ======
app.get('/file', (req, res) => {
  const file = req.query.name;
  if (!file) return res.status(400).send('Missing file name');
  const base = path.join(__dirname, 'uploads');
  const fullPath = path.join(base, file);
  // ⚠️ VULN: No validation — allows ../server.js
  if (fs.existsSync(fullPath)) {
    res.send(fs.readFileSync(fullPath, 'utf8'));
  } else {
    res.status(404).send('File not found');
  }
});

// ====== SEARCH — ⚠️ VULNERABLE: XSS ======
app.get('/search', (req, res) => {
  const q = req.query.q || '';
  // ⚠️ VULN: No sanitization
  res.send(`<p>Results for: <strong>"${q}"</strong></p>`);
});

// ====== ORDER — ⚠️ VULNERABLE: IDOR ======
const orders = {
  1: { user: 'ahmed@gmail.com',    product: 'MacBook Pro M4',   card: '****4532' },
  2: { user: 'sara@outlook.com',   product: 'iPhone 17 Pro',    card: '****9876' },
  3: { user: 'me@techmart.iq',     product: 'Sony WH-1000XM6',  card: '****1234' },
  4: { user: 'khalid@company.com', product: 'Galaxy S25 Ultra', card: '****7890' },
  5: { user: 'mona@private.net',   product: 'MX Master 4',      card: '****3456' },
};

app.get('/order', (req, res) => {
  const id = parseInt(req.query.id);
  const order = orders[id];
  if (!order) return res.status(404).send('Order not found');
  // ⚠️ VULN: No session check
  res.json(order);
});

// ====== ADMIN ======
app.get('/admin/users-db', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch(e) { res.json([]); }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

app.listen(port, () => console.log(`TechMart VULNERABLE running on port ${port}`));
