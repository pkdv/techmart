const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ⚠️ Vulnerable login endpoint — no rate limiting
const users = {
  admin: 'password123',
  ahmed: 'ahmed2024',
  user:  '123456',
  test:  'test'
};

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    res.status(200).send('Login successful');
  } else {
    res.status(401).send('Invalid credentials');
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html', {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
});

app.listen(port, () => {
  console.log(`TechMart running on port ${port}`);
});
