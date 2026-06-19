const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Server is working on Port 3000');
});

const PORT = 3000;

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Test Server running at http://127.0.0.1:${PORT}/`);
  console.log('If you see this, Port 3000 is FREE and WORKING.');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ERROR: Port ${PORT} is already in use! Something else is running here.`);
  } else {
    console.error('Server error:', err);
  }
});
