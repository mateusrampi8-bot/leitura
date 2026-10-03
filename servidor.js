/* Servidor local sem dependências: node servidor.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

/* ---------- Voz natural Kokoro (Python em 127.0.0.1:8123) ---------- */
const PORTA_VOZ = 8123;
const PY_CANDIDATOS = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
  'python'
];
let vozProc = null;
let vozPronto = false;

function iniciarVoz() {
  const py = PY_CANDIDATOS.find(p => p === 'python' || fs.existsSync(p)) || 'python';
  try {
    vozProc = spawn(py, [path.join(ROOT, 'voz_kokoro.py')], { stdio: ['ignore', 'pipe', 'pipe'] });
    vozProc.stdout.on('data', d => {
      if (String(d).includes('PRONTO')) {
        vozPronto = true;
        console.log('Voz natural pronta (Kokoro + Piper pt-BR)');
      }
    });
    vozProc.stderr.on('data', d => {
      const t = String(d).trim();
      if (t) console.log('[voz] ' + t.split('\n')[0]);
    });
    vozProc.on('exit', () => { vozPronto = false; vozProc = null; });
    vozProc.on('error', () => { vozProc = null; });
  } catch (e) {
    console.log('Voz Kokoro indisponível: ' + e.message);
  }
}

function pararVoz() {
  if (vozProc) { try { vozProc.kill(); } catch (e) {} vozProc = null; }
}
process.on('exit', pararVoz);
process.on('SIGINT', () => { pararVoz(); process.exit(0); });

function proxyVoz(req, res, query) {
  const enviar = () => {
    const alvo = http.get({ host: '127.0.0.1', port: PORTA_VOZ, path: '/sintese?' + query }, r => {
      res.writeHead(r.statusCode, {
        'Content-Type': r.headers['content-type'] || 'audio/wav',
        'Cache-Control': 'no-store'
      });
      r.pipe(res);
    });
    alvo.on('error', () => {
      vozPronto = false;
      if (!res.headersSent) res.writeHead(504);
      res.end();
    });
    req.on('close', () => { try { alvo.destroy(); } catch (e) {} });
  };
  const tentar = (tenta) => {
    if (vozPronto) return enviar();
    if (tenta >= 40) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ erro: 'voz natural indisponível' }));
    }
    statusVoz(ok => {
      if (ok) return enviar();
      setTimeout(() => tentar(tenta + 1), 400);
    });
  };
  tentar(0);
}

/* consulta o Python (self-healing: volta a ficar pronto quando ele responder) */
function statusVoz(cb) {
  const t = http.get({ host: '127.0.0.1', port: PORTA_VOZ, path: '/status' }, r => {
    let d = '';
    r.on('data', c => { d += c; });
    r.on('end', () => {
      vozPronto = r.statusCode === 200;
      cb(vozPronto, d);
    });
  });
  t.on('error', () => { vozPronto = false; cb(false, null); });
}

function proxyStatusVoz(res) {
  statusVoz((ok, corpo) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(ok && corpo ? corpo : JSON.stringify({ pronto: false }));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  try {
    const urlCompleta = req.url || '/';
    const url = decodeURIComponent(urlCompleta.split('?')[0]);

    if (url === '/api/voz/status') {
      return proxyStatusVoz(res);
    }
    if (url === '/api/voz') {
      const query = urlCompleta.split('?')[1] || '';
      return proxyVoz(req, res, query);
    }

    let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('404');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('500');
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('Leitor rodando em ' + url);
  iniciarVoz();

  // endereços da rede local (celular/tablet na mesma Wi-Fi)
  const os = require('os');
  const ips = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  for (const ip of ips) console.log(`  Celular: http://${ip}:${PORT}`);
  if (!ips.length) console.log('  (nenhum IP de rede local encontrado)');

  const cmd = process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  setTimeout(() => exec(cmd), 300);
});
