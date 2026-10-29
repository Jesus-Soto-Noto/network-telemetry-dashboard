const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const DB_FILE = path.join(__dirname, 'devices.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Router RPC Configuration via Environment Variables
const ROUTER_IP = process.env.ROUTER_IP || '192.168.10.1';
const AP1_IP = process.env.AP1_IP || '192.168.10.2';
const AP2_IP = process.env.AP2_IP || '192.168.10.12';
const ROUTER_USER = process.env.ROUTER_USER || 'admin';
const ROUTER_PASS = process.env.ROUTER_PASS || '';

let rpcSession = null;

function md5Upper(str) {
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

// Dual-MD5 Challenge-Response JSON-RPC 2.0 Authentication
async function getRouterSession(forceRefresh = false) {
  if (DEMO_MODE || !ROUTER_PASS) return null;
  if (rpcSession && !forceRefresh) return rpcSession;
  try {
    const challengeRes = await fetch(`http://${ROUTER_IP}/RPC2_Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'global.login',
        params: { userName: ROUTER_USER, password: '', clientType: 'Web3.0' },
        id: 1
      })
    }).then(r => r.json());

    const { realm, random, encryption } = challengeRes.params;
    const realmDigest = md5Upper(`${ROUTER_USER}:${realm}:${ROUTER_PASS}`);
    const challengeDigest = md5Upper(`${ROUTER_USER}:${random}:${realmDigest}`);

    const authRes = await fetch(`http://${ROUTER_IP}/RPC2_Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'global.login',
        params: {
          userName: ROUTER_USER,
          password: challengeDigest,
          clientType: 'Web3.0',
          realm,
          random,
          passwordType: 'Default',
          authorityType: encryption
        },
        session: challengeRes.session,
        id: 2
      })
    }).then(r => r.json());

    rpcSession = authRes.session;
    return rpcSession;
  } catch (err) {
    console.error('[RPC Auth] Connection failed:', err.message);
    return null;
  }
}

async function callRouterRPC(method, params = {}) {
  let sess = await getRouterSession();
  if (!sess) return null;
  try {
    let res = await fetch(`http://${ROUTER_IP}/RPC2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params, id: Math.floor(Math.random() * 10000), session: sess })
    }).then(r => r.json());

    // Automatic session re-negotiation on expiry codes
    if (res.error && (res.error.code === 287637504 || res.error.code === 287637505)) {
      sess = await getRouterSession(true);
      res = await fetch(`http://${ROUTER_IP}/RPC2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params, id: Math.floor(Math.random() * 10000), session: sess })
      }).then(r => r.json());
    }
    return res;
  } catch (err) {
    console.error(`[RPC Call] ${method} failed:`, err.message);
    return null;
  }
}

function pingHost(host) {
  if (DEMO_MODE) {
    return Promise.resolve({ alive: true, ms: host === '1.1.1.1' ? 18 : 2 });
  }
  const isWin = process.platform === 'win32';
  const cmd = isWin ? `ping -n 1 -w 500 ${host}` : `ping -c 1 -W 1 ${host}`;
  return new Promise((resolve) => {
    exec(cmd, (err, stdout) => {
      if (err || !/ttl=/i.test(stdout)) {
        resolve({ alive: false, ms: null });
      } else {
        const match = stdout.match(/(?:tiempo|time)[=<]\s*([0-9.]+)\s*ms/i);
        const ms = match ? Math.max(1, Math.round(parseFloat(match[1]))) : 1;
        resolve({ alive: true, ms });
      }
    });
  });
}

function getVendor(mac) {
  if (!mac) return 'Desconocido';
  const clean = mac.toUpperCase().replace(/[:-]/g, '');
  if (clean.length < 6) return 'Desconocido';
  const prefix = clean.substring(0, 6);
  const vendors = {
    '1C4D89': 'Imou / Dahua',
    '00EBD8': 'Mercusys (TP-Link)',
    '60A434': 'Mercusys (TP-Link)',
    'CC2D21': 'Tenda',
    '345A60': 'Realtek Gigabit',
    '0024D7': 'Intel Wireless',
    '10FEED': 'TP-Link',
    'F460E2': 'Samsung',
    '282A7B': 'Xiaomi'
  };
  if (vendors[prefix]) return vendors[prefix];
  const firstByte = parseInt(clean.substring(0, 2), 16);
  if ((firstByte & 0x02) !== 0) return 'Dispositivo Móvil (MAC Privada)';
  return 'Dispositivo de Red';
}

function loadDevicesDb() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading devices.json:', e);
  }
  return {};
}

function saveDevicesDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing devices.json:', e);
  }
}

function getDemoDevices() {
  return [
    { mac: '1C:4D:89:AA:10:01', ip: '192.168.10.1', name: 'Gateway Principal AX3000', vendor: 'Imou / Dahua', type: 'router', connection: 'Nodo Maestro (WAN Fibra)', signal: 4, isOnline: true, notes: 'Core Router', lastSeen: 'Ahora mismo' },
    { mac: '34:5A:60:BB:20:10', ip: '192.168.10.10', name: 'Workstation Backend-01', vendor: 'Realtek Gigabit', type: 'pc', connection: 'Cable Ethernet (1 Gbps)', signal: 4, isOnline: true, notes: 'Docker Host', lastSeen: 'Ahora mismo' },
    { mac: '00:24:D7:CC:30:22', ip: '192.168.10.22', name: 'Laptop Desarrollo QA', vendor: 'Intel Wireless', type: 'pc', connection: 'Wi-Fi 5 GHz (Core_5G)', signal: 4, isOnline: true, notes: '', lastSeen: 'Ahora mismo' },
    { mac: 'F4:60:E2:DD:40:35', ip: '192.168.10.35', name: 'Terminal Móvil POS', vendor: 'Samsung', type: 'phone', connection: 'Wi-Fi 5 GHz (Core_5G)', signal: 3, isOnline: true, notes: 'Escáner inventario', lastSeen: 'Ahora mismo' },
    { mac: '00:EB:D8:EE:50:02', ip: '192.168.10.2', name: 'AP Oficina Norte', vendor: 'Mercusys (TP-Link)', type: 'router', connection: 'Punto de Acceso (Cable)', signal: 4, isOnline: true, notes: 'Canal 11', lastSeen: 'Ahora mismo' }
  ];
}

async function getFullStatus() {
  const [mainPing, ap1Ping, ap2Ping, internetPing] = await Promise.all([
    pingHost(ROUTER_IP),
    pingHost(AP1_IP),
    pingHost(AP2_IP),
    pingHost('1.1.1.1')
  ]);

  if (DEMO_MODE) {
    const demoDevices = getDemoDevices();
    return {
      timestamp: new Date().toISOString(),
      routers: [
        { id: 'main', name: 'Imou HX21 (AX3000)', role: 'Router Principal / Maestro', ip: ROUTER_IP, mac: '1C:4D:89:AA:10:01', url: `http://${ROUTER_IP}`, status: 'online', pingMs: 1, wifi24: 'Core_2.4G (CH 1)', wifi5: 'Core_5G (CH 36)', dhcp: '192.168.10.2 - 192.168.10.254' },
        { id: 'ap1', name: 'Mercusys MW300D', role: 'Punto de Acceso (Oficina)', ip: AP1_IP, mac: '00:EB:D8:EE:50:02', url: `http://${AP1_IP}`, status: 'online', pingMs: 2, wifi24: 'AP_Oficina (CH 11)', wifi5: 'N/A', dhcp: 'Desactivado (Bridge)' },
        { id: 'ap2', name: 'Tenda AC5 (AC1200)', role: 'Punto de Acceso (Lab)', ip: AP2_IP, mac: 'CC:2D:21:FF:60:12', url: `http://${AP2_IP}`, status: 'online', pingMs: 2, wifi24: 'AP_Lab (CH 6)', wifi5: 'AP_Lab_5G (CH 48)', dhcp: 'Desactivado (AP Mode)' }
      ],
      internet: {
        provider: 'Fibra Óptica 600 Mbps',
        gateway: '192.168.100.1',
        dns: ['1.1.1.1 (Cloudflare)', '8.8.8.8 (Google)'],
        status: 'online',
        latencyMs: internetPing.ms || 18,
        downloadRateMbps: '142.80',
        uploadRateMbps: '64.30'
      },
      totalDevices: demoDevices.length,
      onlineDevices: demoDevices.length,
      devices: demoDevices
    };
  }

  const [staData, wanData] = await Promise.all([
    callRouterRPC('RTSta.getStaInfo'),
    callRouterRPC('RTWanIPv4.getNetStatus', { status: 1 })
  ]);

  const db = loadDevicesDb();
  const ignoredMacs = new Set((db._ignoredMacs || []).map(m => m.toUpperCase()));
  const devices = [];
  const seenMacs = new Set();

  function processSta(item, connType, isOnline) {
    if (!item || !item.DevMac) return;
    const mac = item.DevMac.toUpperCase();
    if (!isOnline && ignoredMacs.has(mac)) return;
    if (seenMacs.has(mac)) return;
    seenMacs.add(mac);

    const custom = db[mac] || {};
    const friendlyName = custom.name || item.Devname || `Nodo ${mac.slice(-5)}`;
    const devType = custom.type || 'other';

    devices.push({
      mac,
      ip: item.IPv4Addr || '',
      name: friendlyName,
      rawName: item.Devname || '',
      vendor: getVendor(mac),
      type: devType,
      connection: connType,
      signal: item.SignalStrength || 0,
      txRate: item.TxRate || 0,
      rxRate: item.RxRate || 0,
      isOnline,
      notes: custom.notes || '',
      lastSeen: isOnline ? 'Ahora mismo' : item.OfflineTime || 'Recientemente'
    });
  }

  if (staData && staData.params) {
    (staData.params.STAList5G || []).forEach(d => processSta(d, 'Wi-Fi 5 GHz', true));
    (staData.params.STAList2P4G || []).forEach(d => processSta(d, 'Wi-Fi 2.4 GHz', true));
    (staData.params.STAListLan || []).forEach(d => processSta(d, 'Ethernet LAN', true));
    (staData.params.STAListOffline || []).forEach(d => processSta(d, 'Desconectado', false));
  }

  devices.sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0) || a.name.localeCompare(b.name));

  return {
    timestamp: new Date().toISOString(),
    routers: [
      { id: 'main', name: 'Imou HX21 (AX3000)', role: 'Router Principal', ip: ROUTER_IP, mac: 'N/A', url: `http://${ROUTER_IP}`, status: mainPing.alive ? 'online' : 'offline', pingMs: mainPing.ms, wifi24: '2.4 GHz', wifi5: '5 GHz', dhcp: 'Activo' },
      { id: 'ap1', name: 'Access Point 1', role: 'Extensión LAN', ip: AP1_IP, mac: 'N/A', url: `http://${AP1_IP}`, status: ap1Ping.alive ? 'online' : 'offline', pingMs: ap1Ping.ms, wifi24: '2.4 GHz', wifi5: 'N/A', dhcp: 'Bridge' },
      { id: 'ap2', name: 'Access Point 2', role: 'Extensión Dual', ip: AP2_IP, mac: 'N/A', url: `http://${AP2_IP}`, status: ap2Ping.alive ? 'online' : 'offline', pingMs: ap2Ping.ms, wifi24: '2.4 GHz', wifi5: '5 GHz', dhcp: 'AP Mode' }
    ],
    internet: {
      provider: 'WAN Principal',
      gateway: ROUTER_IP,
      dns: ['1.1.1.1', '8.8.8.8'],
      status: internetPing.alive ? 'online' : 'offline',
      latencyMs: internetPing.ms || 0,
      downloadRateMbps: wanData && wanData.DownRate ? (wanData.DownRate / 1024 / 1024).toFixed(2) : '0.00',
      uploadRateMbps: wanData && wanData.UpRate ? (wanData.UpRate / 1024 / 1024).toFixed(2) : '0.00'
    },
    totalDevices: devices.length,
    onlineDevices: devices.filter(d => d.isOnline).length,
    devices
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/status') {
    try {
      const data = await getFullStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/devices/rename' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const { mac, name, type, notes } = JSON.parse(body);
        if (!mac || !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Parámetros mac y name obligatorios' }));
          return;
        }
        const db = loadDevicesDb();
        const cleanMac = mac.toUpperCase();
        db[cleanMac] = { ...(db[cleanMac] || {}), name, type: type || 'other', notes: notes || '', updatedAt: new Date().toISOString() };
        saveDevicesDb(db);
        if (!DEMO_MODE) {
          await callRouterRPC('RTSta.setStaDevName', { DevMac: cleanMac, DevName: name }).catch(() => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, mac: cleanMac, name }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Network Telemetry Dashboard listening on http://127.0.0.1:${PORT} (DEMO_MODE=${DEMO_MODE})`);
});
