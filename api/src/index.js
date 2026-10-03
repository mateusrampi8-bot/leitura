/* API Leitura — biblioteca compartilhada, usuários, votos e anotações */

const LIMITE = 90 * 1024 * 1024;
const SESSAO_DIAS = 30;
const JWK_CACHE_MS = 10 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sessao, X-Nome',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

const erro = (msg, status = 400) => json({ erro: msg }, status);

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(str) {
  const t = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const texto = (buf) => new TextEncoder().encode(buf);
const utf8 = (buf) => new TextDecoder().decode(buf);

async function corpo(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

/* ---------------- Senhas ---------------- */
async function derivar(senha, saltB64) {
  const key = await crypto.subtle.importKey('raw', texto(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64url(saltB64), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return b64url(new Uint8Array(bits));
}

function mesmo(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) - b.charCodeAt(i);
  return d === 0;
}

/* ---------------- Sessões (HMAC) ---------------- */
async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', texto(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function gerarToken(email, env) {
  const payload = b64url(texto(JSON.stringify({
    email,
    exp: Math.floor(Date.now() / 1000) + SESSAO_DIAS * 86400
  })));
  const key = await hmacKey(env.SESSION_SECRET, 'sign');
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, texto(payload))));
  return `v1.${payload}.${sig}`;
}

async function lerToken(token, env) {
  const p = (token || '').split('.');
  if (p.length !== 3 || p[0] !== 'v1' || !env.SESSION_SECRET) return null;
  const key = await hmacKey(env.SESSION_SECRET, 'verify');
  const ok = await crypto.subtle.verify('HMAC', key, unb64url(p[2]), texto(p[1]));
  if (!ok) return null;
  try {
    const dados = JSON.parse(utf8(unb64url(p[1])));
    if (!dados.email || dados.exp * 1000 < Date.now()) return null;
    return dados;
  } catch (e) { return null; }
}

async function sessaoDe(request, env) {
  const dados = await lerToken(request.headers.get('X-Sessao'), env);
  if (!dados) return null;
  const u = await env.LEITURA.get('usuarios/' + dados.email);
  return u ? await u.json() : null;
}

const publico = (u) => ({ email: u.email, nome: u.nome, role: u.role });
const ehAdmin = (u) => !!u && u.role === 'admin';

/* ---------------- Google ---------------- */
let jwks = { em: 0, chaves: [] };

async function chavesGoogle() {
  if (Date.now() - jwks.em < JWK_CACHE_MS) return jwks.chaves;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const d = await r.json();
  jwks = { em: Date.now(), chaves: d.keys || [] };
  return jwks.chaves;
}

async function verificarGoogle(credential, clientId) {
  const p = (credential || '').split('.');
  if (p.length !== 3) throw new Error('Credencial do Google inválida');
  const header = JSON.parse(utf8(unb64url(p[0])));
  const payload = JSON.parse(utf8(unb64url(p[1])));
  if (header.alg !== 'RS256') throw new Error('Algoritmo inválido');
  const jwk = (await chavesGoogle()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Chave do Google não encontrada');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, unb64url(p[2]), texto(p[0] + '.' + p[1])
  );
  if (!ok) throw new Error('Assinatura do Google inválida');
  if (payload.aud !== clientId) throw new Error('Credencial de outro aplicativo');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)) throw new Error('Origem inválida');
  if (!payload.email) throw new Error('Conta Google sem e-mail');
  if (payload.exp * 1000 < Date.now()) throw new Error('Credencial expirada');
  return {
    email: String(payload.email).toLowerCase(),
    nome: String(payload.name || payload.email.split('@')[0]).slice(0, 60)
  };
}

/* ---------------- Social (votos + anotações) ---------------- */
async function socialDe(env, id) {
  const o = await env.LEITURA.get('social/' + id);
  return o ? await o.json() : { votos: {}, anotacoes: [] };
}

const salvarSocial = (env, id, soc) => env.LEITURA.put('social/' + id, JSON.stringify(soc));

function contagem(soc) {
  let likes = 0, dislikes = 0;
  for (const v of Object.values(soc.votos || {})) {
    if (v === 1) likes++; else if (v === -1) dislikes++;
  }
  return { likes, dislikes };
}

/* ---------------- Listagem de livros ---------------- */
async function listar(env, usuario) {
  const keys = [];
  let cursor;
  do {
    const page = await env.LEITURA.list({ prefix: 'livros/', cursor });
    for (const o of page.objects) keys.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return (await Promise.all(keys.map(async (key) => {
    const meta = await env.LEITURA.get(key, { onlyMetadata: true });
    if (!meta) return null;
    const id = key.slice('livros/'.length);
    const soc = await socialDe(env, id);
    const c = contagem(soc);
    return {
      id,
      nome: (meta.customMetadata && meta.customMetadata.nome) || id,
      tipo: (meta.httpMetadata && meta.httpMetadata.contentType) || 'application/octet-stream',
      tamanho: meta.size,
      enviado: meta.uploaded ? new Date(meta.uploaded).getTime() : 0,
      likes: c.likes,
      dislikes: c.dislikes,
      meuVoto: usuario ? (soc.votos[usuario.email] || 0) : 0
    };
  }))).filter(Boolean).sort((a, b) => b.enviado - a.enviado);
}

/* ---------------- Roteador ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    try {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

      /* ----- Autenticação ----- */
      if (request.method === 'GET' && p === '/auth/config') {
        return json({ google: env.GOOGLE_CLIENT_ID || null });
      }

      if (request.method === 'GET' && p === '/auth/eu') {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Sessão inválida', 401);
        return json({ usuario: publico(u) });
      }

      if (request.method === 'POST' && p === '/auth/cadastrar') {
        const d = await corpo(request);
        const nome = String(d.nome || '').trim().slice(0, 60);
        const email = String(d.email || '').trim().toLowerCase();
        const senha = String(d.senha || '');
        if (!nome) return erro('Diga seu nome.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('E-mail inválido.');
        if (senha.length < 6) return erro('A senha precisa de ao menos 6 caracteres.');
        if (await env.LEITURA.get('usuarios/' + email)) return erro('Este e-mail já tem conta.', 409);

        const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await derivar(senha, salt);
        const admin = !!(d.codigo && env.ADMIN_CODE && String(d.codigo) === env.ADMIN_CODE);
        const user = {
          email, nome, salt, hash,
          role: admin ? 'admin' : 'user',
          google: false,
          criadoEm: Date.now()
        };
        await env.LEITURA.put('usuarios/' + email, JSON.stringify(user));
        return json({ token: await gerarToken(email, env), usuario: publico(user) });
      }

      if (request.method === 'POST' && p === '/auth/entrar') {
        const d = await corpo(request);
        const email = String(d.email || '').trim().toLowerCase();
        const u = await env.LEITURA.get('usuarios/' + email);
        const rec = u ? await u.json() : null;
        if (!rec || !rec.hash) return erro('E-mail ou senha incorretos.', 401);
        const hash = await derivar(String(d.senha || ''), rec.salt);
        if (!mesmo(hash, rec.hash)) return erro('E-mail ou senha incorretos.', 401);
        return json({ token: await gerarToken(email, env), usuario: publico(rec) });
      }

      if (request.method === 'POST' && p === '/auth/google') {
        if (!env.GOOGLE_CLIENT_ID) return erro('Login com Google não configurado.', 501);
        const d = await corpo(request);
        let g;
        try {
          g = await verificarGoogle(d.credential, env.GOOGLE_CLIENT_ID);
        } catch (e) { return erro(e.message, 401); }

        const have = await env.LEITURA.get('usuarios/' + g.email);
        let rec = have ? await have.json() : null;
        if (!rec) {
          rec = {
            email: g.email, nome: g.nome,
            salt: '', hash: '',
            role: 'user', google: true,
            criadoEm: Date.now()
          };
          await env.LEITURA.put('usuarios/' + g.email, JSON.stringify(rec));
        }
        return json({ token: await gerarToken(g.email, env), usuario: publico(rec) });
      }

      /* ----- Livros ----- */
      if (request.method === 'GET' && p === '/lista') {
        const u = await sessaoDe(request, env);
        return json(await listar(env, u));
      }

      if (request.method === 'GET' && p.startsWith('/livro/') && p.endsWith('/social')) {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Entre na sua conta.', 401);
        const id = p.slice('/livro/'.length, -'/social'.length);
        const soc = await socialDe(env, id);
        const c = contagem(soc);
        return json({
          ...c,
          meuVoto: soc.votos[u.email] || 0,
          anotacoes: (soc.anotacoes || [])
            .filter((a) => a.email === u.email)
            .sort((a, b) => b.em - a.em)
        });
      }

      if (request.method === 'GET' && p.startsWith('/livro/')) {
        const id = p.slice('/livro/'.length).split('/')[0];
        const obj = await env.LEITURA.get('livros/' + id);
        if (!obj) return erro('Livro não encontrado', 404);
        const nome = (obj.customMetadata && obj.customMetadata.nome) || id;
        return new Response(obj.body, {
          headers: {
            'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
            'Cache-Control': 'public, max-age=3600',
            ...CORS
          }
        });
      }

      if (request.method === 'POST' && p === '/enviar') {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Entre na sua conta.', 401);
        if (!ehAdmin(u)) return erro('Só o dono da biblioteca pode enviar livros.', 403);
        const nome = request.headers.get('X-Nome') || 'arquivo';
        const tam = Number(request.headers.get('Content-Length') || 0);
        if (tam > LIMITE) return erro('Arquivo maior que 90 MB', 413);
        const id = crypto.randomUUID();
        await env.LEITURA.put('livros/' + id, request.body, {
          httpMetadata: {
            contentType: request.headers.get('Content-Type') || 'application/octet-stream'
          },
          customMetadata: { nome, enviadoPor: u.email }
        });
        return json({ ok: true, id });
      }

      if (request.method === 'DELETE' && p.startsWith('/livro/') && p.endsWith('/anotacao')) {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Entre na sua conta.', 401);
        const id = p.slice('/livro/'.length, -'/anotacao'.length);
        const em = Number(url.searchParams.get('em'));
        const soc = await socialDe(env, id);
        soc.anotacoes = (soc.anotacoes || []).filter((a) => !(a.email === u.email && a.em === em));
        await salvarSocial(env, id, soc);
        return json({ ok: true });
      }

      if (request.method === 'DELETE' && p.startsWith('/livro/')) {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Entre na sua conta.', 401);
        if (!ehAdmin(u)) return erro('Só o dono da biblioteca pode excluir livros.', 403);
        const id = p.slice('/livro/'.length);
        await env.LEITURA.delete('livros/' + id);
        await env.LEITURA.delete('social/' + id);
        return json({ ok: true });
      }

      /* ----- Votos e anotações ----- */
      if (request.method === 'POST' && p.startsWith('/livro/') && p.endsWith('/voto')) {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Entre na sua conta para avaliar.', 401);
        const id = p.slice('/livro/'.length, -'/voto'.length);
        const d = await corpo(request);
        const voto = Number(d.voto);
        if (![1, -1, 0].includes(voto)) return erro('Voto inválido.');
        const soc = await socialDe(env, id);
        soc.votos = soc.votos || {};
        if (voto === 0) delete soc.votos[u.email];
        else soc.votos[u.email] = voto;
        await salvarSocial(env, id, soc);
        const c = contagem(soc);
        return json({ ...c, meuVoto: voto });
      }

      if (request.method === 'POST' && p.startsWith('/livro/') && p.endsWith('/anotacao')) {
        const u = await sessaoDe(request, env);
        if (!u) return erro('Entre na sua conta para anotar.', 401);
        const id = p.slice('/livro/'.length, -'/anotacao'.length);
        const d = await corpo(request);
        const t = String(d.texto || '').trim();
        if (!t) return erro('Escreva a anotação.');
        if (t.length > 2000) return erro('Máximo de 2000 caracteres.');
        const soc = await socialDe(env, id);
        soc.anotacoes = soc.anotacoes || [];
        const minhas = soc.anotacoes.filter((a) => a.email === u.email);
        if (minhas.length >= 50) return erro('Limite de 50 anotações por livro.');
        soc.anotacoes.push({ email: u.email, texto: t, em: Date.now() });
        await salvarSocial(env, id, soc);
        return json({ ok: true });
      }

      return erro('Rota não encontrada', 404);
    } catch (e) {
      return erro(e.message || 'Erro interno', 500);
    }
  }
};
