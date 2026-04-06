const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ====== Security Headers ======
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.removeHeader('X-Powered-By');
  next();
});

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
  return typeof p === 'string' && p.length >= 4 && p.length <= 50;
}
function isValidFilename(f) {
  return typeof f === 'string' &&
         /^[a-zA-Z0-9_\-\.]+$/.test(f) &&
         !f.includes('..');
}
function sanitizeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ====== Account Lockout ======
const loginAttempts = {};
const lockoutUntil  = {};
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000;

// ====== LOGIN — Secured ======
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!isValidUsername(username)) return res.status(400).send('Invalid username');
  if (!isValidPassword(password)) return res.status(400).send('Invalid password');

  if (lockoutUntil[username] && Date.now() < lockoutUntil[username]) {
    return res.status(200).send('Account locked — try again later');
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';

  let validUser = false;
  if (db) {
    try {
      const dbUser = await db.collection('users').findOne({ username, password });
      if (dbUser) validUser = true;
    } catch(e) {}
  }

  if (validUser) {
    loginAttempts[username] = 0;
    delete lockoutUntil[username];
    res.status(200).send('Welcome');
  } else {
    loginAttempts[username] = (loginAttempts[username] || 0) + 1;
    if (loginAttempts[username] >= MAX_ATTEMPTS) {
      lockoutUntil[username] = Date.now() + LOCKOUT_MS;
      setTimeout(() => {
        loginAttempts[username] = 0;
        delete lockoutUntil[username];
      }, LOCKOUT_MS);
    }
    res.status(200).send('Wrong password');
  }
});

// ====== REGISTER ======
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!isValidUsername(username)) return res.status(400).send('Invalid username');
  if (!isValidPassword(password)) return res.status(400).send('Password too short');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';

  try {
    if (!db) return res.status(500).send('DB not connected');
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.status(409).send('Username already exists');

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

// ====== FILE — Secured ======
app.get('/file', (req, res) => {
  const file = req.query.name;

  if (!file || !isValidFilename(file)) {
    return res.status(403).send('Access denied');
  }

  const allowed = ['products.txt'];
  if (!allowed.includes(file)) {
    return res.status(403).send('Access denied');
  }

  const base     = path.join(__dirname, 'uploads');
  const fullPath = path.resolve(base, file);

  if (!fullPath.startsWith(base)) {
    return res.status(403).send('Access denied');
  }

  if (fs.existsSync(fullPath)) {
    res.send(fs.readFileSync(fullPath, 'utf8'));
  } else {
    res.status(404).send('File not found');
  }
});

// ====== SEARCH — Secured ======
app.get('/search', (req, res) => {
  const q    = req.query.q || '';
  const safe = sanitizeHTML(q);
  res.send(`<p>Results for: <strong>"${safe}"</strong></p>`);
});

// ====== ORDER — Secured ======
const orders = {
  1: { user: 'ahmed@gmail.com',    product: 'MacBook Pro M4',   card: '****4532' },
  2: { user: 'sara@outlook.com',   product: 'iPhone 17 Pro',    card: '****9876' },
  3: { user: 'me@techmart.iq',     product: 'Sony WH-1000XM6',  card: '****1234' },
  4: { user: 'khalid@company.com', product: 'Galaxy S25 Ultra', card: '****7890' },
  5: { user: 'mona@private.net',   product: 'MX Master 4',      card: '****3456' },
};

app.get('/order', (req, res) => {
  const id = parseInt(req.query.id);
  if (isNaN(id) || id < 1 || id > 5) {
    return res.status(400).send('Invalid order ID');
  }
  // ✅ IDOR Fix — only order 3 is accessible (current user's order)
  if (id === 3) {
    return res.json(orders[id]);
  }
  return res.status(403).send('Access denied — not your order');
});

// ====== ADMIN ======
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
