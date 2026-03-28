const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const users = {
  admin: 'password123',
  ahmed: 'ahmed2024',
  user:  '123456',
  test:  'test'
};

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    res.status(200).send('Welcome admin');
  } else {
    res.status(200).send('Wrong password');
  }
});

app.get('/file', (req, res) => {
  const file = req.query.name;
  if (!file) return res.status(400).send('Missing file name');
  const base = path.join(__dirname, 'uploads');
  const fullPath = path.join(base, file);
  if (fs.existsSync(fullPath)) {
    res.send(fs.readFileSync(fullPath, 'utf8'));
  } else {
    res.status(404).send('File not found');
  }
});

app.get('/order', (req, res) => {
  const id = parseInt(req.query.id);
  const orders = {
    1: { user:'ahmed@gmail.com',    product:'MacBook Pro M4',   card:'****4532' },
    2: { user:'sara@outlook.com',   product:'iPhone 17 Pro',    card:'****9876' },
    3: { user:'me@techmart.iq',     product:'Sony WH-1000XM6',  card:'****1234' },
    4: { user:'khalid@company.com', product:'Galaxy S25 Ultra', card:'****7890' },
    5: { user:'mona@private.net',   product:'MX Master 4',      card:'****3456' },
  };
  const order = orders[id];
  if (!order) return res.status(404).send('Order not found');
  res.json(order);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`TechMart running on port ${port}`);
});
