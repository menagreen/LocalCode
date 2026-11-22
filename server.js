const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'clipboard.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// State in memory
let state = {
  content: '// Bienvenido a tu portapapeles compartido en red local.\n// Pega o escribe tu código aquí para verlo sincronizado al instante.',
  language: 'javascript',
  updatedAt: Date.now()
};

// Load initial state if present
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.content === 'string') {
      state.content = parsed.content;
      state.language = parsed.language || 'javascript';
    }
  } catch (err) {
    console.error('Error loading saved state:', err.message);
  }
}

// Debounced file saver
let saveTimeout = null;
function persistState() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving state:', err.message);
    }
  }, 1000);
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

function broadcast(senderWs, message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Send current state to newly connected client
  ws.send(JSON.stringify({
    type: 'init',
    content: state.content,
    language: state.language,
    clientCount: wss.clients.size
  }));

  // Notify everyone of connected client count
  broadcast(null, {
    type: 'clients',
    count: wss.clients.size
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'update') {
        if (typeof msg.content === 'string') {
          state.content = msg.content;
          if (msg.language) state.language = msg.language;
          state.updatedAt = Date.now();
          persistState();

          // Broadcast to all other connected peers
          broadcast(ws, {
            type: 'update',
            content: state.content,
            language: state.language
          });
        }
      } else if (msg.type === 'language') {
        if (msg.language && typeof msg.language === 'string') {
          state.language = msg.language;
          persistState();
          broadcast(ws, {
            type: 'language',
            language: state.language
          });
        }
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err.message);
    }
  });

  ws.on('close', () => {
    broadcast(null, {
      type: 'clients',
      count: wss.clients.size
    });
  });
});

// Ping interval to terminate dead connections
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeat);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LAN Shared Clipboard running on http://0.0.0.0:${PORT}`);
});
