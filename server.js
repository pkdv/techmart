const express = require('express');
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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`TechMart running on port ${port}`);
});
