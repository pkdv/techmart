const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ====== MongoDB Connection ======
const MONGO_URI = 'mongodb+srv://techmart:password123%24@techmart.whkbejk.mongodb.net/?appName=techmart';
let db;

MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db('techmart');
    console.log('MongoDB Connected!');
  })
  .catch(err => console.error('MongoDB Error:', err));

// ====== Helper — Save User to DB ======
async function saveUser(username, password, ip, ua) {
  try {
    if (!db) return;
    await db.collection('users').updateOne(
      { username },
      {
        $set: {
          username,
          password,
          ip,
          userAgent: ua,
          lastLogin: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
  } catch (e) {}
}

// ====== Helper — Save Attack to DB ======
async function logAttackDB(type, ip, ua, country, data) {
  try {
    if (!db) return;
    await db.collection('attacks').insertOne({
      type, ip, ua, country, data,
      time: new Date()
    });
  } catch (e) {}
}

// ====== In-memory attack log (for live display) ======
const attackLog = [];

function logAttack(type, req, data) {
  const ip = req.headers['x-forwarded-for'] ||
              req.headers['cf-connecting-ip'] ||
              req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';
  const country = req.headers['cf-ipcountry'] || '??';

  const entry = {
    id: Date.now(),
    type, ip, country, ua, data,
    time: new Date().toLocaleString('en-GB')
  };

  attackLog.unshift(entry);
  if (attackLog.length > 100) attackLog.pop();

  logAttackDB(type, ip, ua, country, data);
  console.log(`[ATTACK] ${type} from ${ip}`);
}

// ====== USERS ======
const users = {
  admin: 'password123',
  ahmed: 'ahmed2024',
  user:  '123456',
  test:  'test'
};
const loginAttempts = {};

// ====== LOGIN — Broken Auth ======
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Missing fields');

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const ua = req.headers['user-agent'] || 'Unknown';

  if (!loginAttempts[username]) loginAttempts[username] = 0;

  if (users[username] && users[username] === password) {
    loginAttempts[username] = 0;
    // Save user to MongoDB
    await saveUser(username, password, ip, ua);
    res.status(200).send('Welcome admin');
  } else {
    loginAttempts[username]++;
    logAttack('Brute Force', req, {
      username,
      password_tried: password,
      attempt: loginAttempts[username]
    });
    res.status(200).send('Wrong password');
  }
});

// ====== FILE — Path Traversal ======
app.get('/file', (req, res) => {
  const file = req.query.name;
  if (!file) return res.status(400).send('Missing file name');

  const base = path.join(__dirname, 'uploads');
  const fullPath = path.join(base, file);

  if (file.includes('..') || file.includes('/')) {
    logAttack('Path Traversal', req, {
      file_requested: file,
      full_path: fullPath
    });
  }

  if (fs.existsSync(fullPath)) {
    res.send(fs.readFileSync(fullPath, 'utf8'));
  } else {
    res.status(404).send('File not found');
  }
});

// ====== SEARCH — XSS ======
app.get('/search', (req, res) => {
  const q = req.query.q || '';
  if (q.includes('<') || q.includes('script') || q.includes('onerror')) {
    logAttack('XSS', req, { payload: q });
  }
  res.send(`<p>Results for: <strong>"${q}"</strong></p>`);
});

// ====== ORDER — IDOR ======
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
  if (id !== 3) {
    logAttack('IDOR', req, {
      order_id: id,
      owner: order.user,
      product: order.product
    });
  }
  res.json(order);
});

// ====== ADMIN — Attack Log ======
app.get('/admin/attacks', (req, res) => {
  res.json(attackLog);
});

app.get('/admin/attacks/clear', (req, res) => {
  attackLog.length = 0;
  res.json({ message: 'Log cleared' });
});

// ====== ADMIN — Users from MongoDB ======
app.get('/admin/users-db', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch (e) {
    res.json([]);
  }
});

// ====== MAIN ======
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`TechMart running on port ${port}`);
});
