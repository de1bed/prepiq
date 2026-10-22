// =====================================================================
// Pasarela local "tipo Supabase" para pruebas de punta a punta SIN Docker
// de Supabase: enruta /rest/v1 → PostgREST y simula /auth/v1 (GoTrue) con
// lo mínimo que usa supabase-js (login con contraseña, registro, refresh,
// usuario, logout). /realtime/v1 se rechaza: la app debe caer a sondeo.
//
// SOLO PARA DESARROLLO/PRUEBAS. En producción se usa Supabase real.
// =====================================================================
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import pg from 'pg';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3000';
const SECRET = process.env.JWT_SECRET ?? 'prepiq-local-dev-secret-at-least-32-characters';
// Si se define GOTRUE_URL, /auth/v1 se envía al GoTrue real en vez del simulado.
const GOTRUE = process.env.GOTRUE_URL ?? '';
const DB = process.env.DATABASE_URL ?? 'postgres://root@/prepiq_e2e?host=/var/run/postgresql';
const pool = new pg.Pool({ connectionString: DB });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signJwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = String(token).split('.');
  if (!h || !b || !s) return null;
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  if (sig !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (p.exp && p.exp < Date.now() / 1000) return null;
  return p;
}

const refreshTokens = new Map(); // token → user id

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const expires_in = 3600;
  const access_token = signJwt({ sub: user.id, role: 'authenticated', aud: 'authenticated', email: user.email, iat: now, exp: now + expires_in });
  const refresh_token = crypto.randomBytes(24).toString('hex');
  refreshTokens.set(refresh_token, user.id);
  return {
    access_token, token_type: 'bearer', expires_in, expires_at: now + expires_in, refresh_token,
    user: toUser(user),
  };
}
function toUser(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: [], created_at: u.created_at, updated_at: u.created_at,
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...cors(), ...extra });
  res.end(JSON.stringify(body));
}
function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, range, x-supabase-api-version',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-expose-headers': 'content-range, content-location',
  };
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace('/auth/v1', '');
  if (path === '/token') {
    const body = await readBody(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const { rows } = await pool.query(
        `select id, email, created_at, raw_user_meta_data from auth.users
         where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [body.email, body.password]);
      if (!rows[0]) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' });
      return send(res, 200, session(rows[0]));
    }
    if (grant === 'refresh_token') {
      const uid = refreshTokens.get(body.refresh_token);
      if (!uid) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', code: 'refresh_token_not_found' });
      refreshTokens.delete(body.refresh_token);
      const { rows } = await pool.query('select id, email, created_at, raw_user_meta_data from auth.users where id = $1', [uid]);
      return send(res, 200, session(rows[0]));
    }
    return send(res, 400, { error: 'unsupported_grant_type' });
  }
  if (path === '/signup') {
    const body = await readBody(req);
    if (!body.email || !body.password || body.password.length < 6) return send(res, 422, { code: 'weak_password', msg: 'Password should be at least 6 characters' });
    try {
      const { rows } = await pool.query(
        `insert into auth.users(id, email, encrypted_password, email_confirmed_at, aud, role)
         values (gen_random_uuid(), $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), 'authenticated', 'authenticated')
         returning id, email, created_at, raw_user_meta_data`, [body.email, body.password]);
      return send(res, 200, session(rows[0]));
    } catch {
      return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' });
    }
  }
  if (path === '/user') {
    const p = verifyJwt((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
    if (!p?.sub) return send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
    const { rows } = await pool.query('select id, email, created_at, raw_user_meta_data from auth.users where id = $1', [p.sub]);
    return rows[0] ? send(res, 200, toUser(rows[0])) : send(res, 404, { msg: 'User not found' });
  }
  if (path === '/logout') { res.writeHead(204, cors()); return res.end(); }
  if (path === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  return send(res, 404, { msg: `auth simulado: ${path} no implementado` });
}

function proxyRest(req, res, url, base = POSTGREST, prefix = '/rest/v1') {
  const target = new URL(base + url.pathname.replace(prefix, '') + url.search);
  const headers = { ...req.headers };
  delete headers.host;
  // Igual que Supabase: si no hay Authorization, usar la apikey (rol anon).
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  const p = http.request(target, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, { ...r.headers, ...cors() });
    r.pipe(res);
  });
  p.on('error', (e) => send(res, 502, { message: `PostgREST no disponible: ${e.message}` }));
  req.pipe(p);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
  try {
    if (url.pathname.startsWith('/auth/v1')) {
      if (GOTRUE) return proxyRest(req, res, url, GOTRUE, '/auth/v1');
      return await handleAuth(req, res, url);
    }
    if (url.pathname.startsWith('/rest/v1')) return proxyRest(req, res, url);
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    return send(res, 404, { msg: 'no encontrado' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { msg: String(e) });
  }
});
// Realtime: si REALTIME_URL está definido (host:puerto), se reenvía el
// websocket como lo hace Kong en Supabase (/realtime/v1/* → /socket/*, con el
// tenant en el Host). Si no, se rechaza y la app usa sondeo.
const REALTIME = process.env.REALTIME_URL ?? '';
server.on('upgrade', (req, socket, head) => {
  if (!REALTIME || !req.url.startsWith('/realtime/v1/')) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  const [host, port] = REALTIME.split(':');
  const upstream = net.connect(Number(port), host, () => {
    const path = req.url.replace('/realtime/v1/', '/socket/');
    const headers = Object.entries(req.headers)
      .filter(([k]) => k.toLowerCase() !== 'host')
      .map(([k, v]) => `${k}: ${v}`);
    upstream.write([`GET ${path} HTTP/1.1`, 'host: realtime-dev.localhost', ...headers, '', ''].join('\r\n'));
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

if (process.argv[2] === 'anon-key') {
  console.log(signJwt({ role: 'anon', iss: 'prepiq-local', iat: 1700000000, exp: 2000000000 }));
  process.exit(0);
}
server.listen(PORT, () => console.log(`Pasarela local en http://localhost:${PORT} → ${POSTGREST}`));
