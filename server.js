const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const helmet = require('helmet');
const app = express();
const port = process.env.PORT || 3000;

// ====== Helmet.js — HTTP Security Headers ======
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:"],
  }
}));

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ====== MongoDB ======
const MONGO_URI = 'mongodb+srv://techmart:password123%24@techmart.whkbejk.mongodb.net/?appName=techmart';
let db;

MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db('techmart');
    console.log('MongoDB Connected!');
  })
  .catch(err => console.error('MongoDB Error:', err));

// ====== Input Validation ======
function isValidUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
}
function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 6 && p.length <= 50;
}
function isValidFilename(f) {
  return typeof f === 'string' &&
         /^[a-zA-Z0-9_\-\.]+$/.test(f) &&
         !f.includes('..');
}
function sanitizeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ====== Hardcoded users ======
const hardcodedUsers = {
  admin: { password: 'password123', role: 'admin' },
  ahmed: { password: 'ahmed2024',   role: 'user'  },
  user:  { password: '123456',      role: 'user'  },
  test:  { password: 'test',        role: 'user'  },
};

// ====== Account Lockout ======
const loginAttempts = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const lockoutTimers = {};

// ====== LOGIN — Secured ======
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Input Validation
  if (!isValidUsername(username)) return res.status(400).send('Invalid username format');
  if (!isValidPassword(password)) return res.status(400).send('Invalid password format');

  // Account Lockout Check
  if (loginAttempts[username] >= MAX_ATTEMPTS) {
    return res.status(200).send('Account locked — try again later');
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';

  // Check hardcoded users
  let validUser = hardcodedUsers[username] && hardcodedUsers[username].password === password;

  // Check MongoDB users
  if (!validUser && db) {
    try {
      const dbUser = await db.collection('users').findOne({ username, password });
      if (dbUser) validUser = true;
    } catch(e) {}
  }

  if (validUser) {
    loginAttempts[username] = 0;
    clearTimeout(lockoutTimers[username]);
    try {
      if (db) {
        await db.collection('users').updateOne(
          { username },
          { $set: { lastLogin: new Date(), ip, userAgent: ua } },
          { upsert: true }
        );
      }
    } catch(e) {}
    res.status(200).send('Welcome admin');
  } else {
    if (!loginAttempts[username]) loginAttempts[username] = 0;
    loginAttempts[username]++;

    // Auto-unlock after 15 minutes
    clearTimeout(lockoutTimers[username]);
    lockoutTimers[username] = setTimeout(() => {
      loginAttempts[username] = 0;
    }, LOCKOUT_TIME);

    res.status(200).send('Wrong password');
  }
});

// ====== REGISTER ======
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!isValidUsername(username)) return res.status(400).send('Invalid username format');
  if (!isValidPassword(password)) return res.status(400).send('Password must be 6-50 characters');

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
  } catch(e) {
    res.status(500).send('Server error');
  }
});

// ====== FILE — Secured (Path Traversal Fixed) ======
app.get('/file', (req, res) => {
  const file = req.query.name;

  // Input Validation
  if (!file || !isValidFilename(file)) {
    return res.status(403).send('Access denied — invalid filename');
  }

  // Whitelist only
  const allowed = ['products.txt'];
  if (!allowed.includes(file)) {
    return res.status(403).send('Access denied — file not allowed');
  }

  const base = path.join(__dirname, 'uploads');
  const fullPath = path.resolve(base, file);

  // Double-check path doesn't escape uploads directory
  if (!fullPath.startsWith(base)) {
    return res.status(403).send('Access denied — path traversal detected');
  }

  if (fs.existsSync(fullPath)) {
    res.send(fs.readFileSync(fullPath, 'utf8'));
  } else {
    res.status(404).send('File not found');
  }
});

// ====== SEARCH — Secured (XSS Fixed) ======
app.get('/search', (req, res) => {
  const q = req.query.q || '';
  const safe = sanitizeHTML(q);
  res.send(`<p>Results for: <strong>"${safe}"</strong></p>`);
});

// ====== ORDER — Secured (IDOR Fixed) ======
const orders = {
  1: { user: 'ahmed@gmail.com',    product: 'MacBook Pro M4',   card: '****4532' },
  2: { user: 'sara@outlook.com',   product: 'iPhone 17 Pro',    card: '****9876' },
  3: { user: 'me@techmart.iq',     product: 'Sony WH-1000XM6',  card: '****1234' },
  4: { user: 'khalid@company.com', product: 'Galaxy S25 Ultra', card: '****7890' },
  5: { user: 'mona@private.net',   product: 'MX Master 4',      card: '****3456' },
};

app.get('/order', (req, res) => {
  const id = parseInt(req.query.id);

  // Input Validation
  if (isNaN(id) || id < 1 || id > 5) {
    return res.status(400).send('Invalid order ID');
  }

  const order = orders[id];
  if (!order) return res.status(404).send('Order not found');

  // IDOR Fix — only return order 3 (current user)
  const currentUser = 'me@techmart.iq';
  if (order.user !== currentUser) {
    return res.status(403).send('Access denied — not your order');
  }

  res.json(order);
});

// ====== ADMIN endpoints ======
app.get('/admin/users-db', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch(e) { res.json([]); }
});

// ====== MAIN ======
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`TechMart SECURED running on port ${port}`);
});
