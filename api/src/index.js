/* API da biblioteca compartilhada — Cloudflare Workers + R2 */

const LIMITE = 90 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Chave, X-Nome',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function autorizado(request, env) {
  const chave = env.CHAVE;
  return !!chave && request.headers.get('X-Chave') === chave;
}

async function listar(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.LEITURA.list({ prefix: 'livros/', cursor });
    for (const o of page.objects) keys.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const livros = await Promise.all(keys.map(async (key) => {
    const meta = await env.LEITURA.get(key, { onlyMetadata: true });
    if (!meta) return null;
    const id = key.slice('livros/'.length);
    return {
      id,
      nome: (meta.customMetadata && meta.customMetadata.nome) || id,
      tipo: (meta.httpMetadata && meta.httpMetadata.contentType) || 'application/octet-stream',
      tamanho: meta.size,
      enviado: meta.uploaded ? new Date(meta.uploaded).getTime() : 0
    };
  }));

  return livros.filter(Boolean).sort((a, b) => b.enviado - a.enviado);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    try {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

      if (request.method === 'GET' && p === '/lista') {
        return json(await listar(env));
      }

      if (request.method === 'GET' && p.startsWith('/livro/')) {
        const id = p.slice('/livro/'.length);
        const obj = await env.LEITURA.get('livros/' + id);
        if (!obj) return json({ erro: 'Livro não encontrado' }, 404);
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
        if (!autorizado(request, env)) return json({ erro: 'Chave incorreta' }, 403);
        const nome = request.headers.get('X-Nome') || 'arquivo';
        const tam = Number(request.headers.get('Content-Length') || 0);
        if (tam > LIMITE) return json({ erro: 'Arquivo maior que 90 MB' }, 413);
        const id = crypto.randomUUID();
        await env.LEITURA.put('livros/' + id, request.body, {
          httpMetadata: {
            contentType: request.headers.get('Content-Type') || 'application/octet-stream'
          },
          customMetadata: { nome }
        });
        return json({ ok: true, id });
      }

      if (request.method === 'DELETE' && p.startsWith('/livro/')) {
        if (!autorizado(request, env)) return json({ erro: 'Chave incorreta' }, 403);
        const id = p.slice('/livro/'.length);
        await env.LEITURA.delete('livros/' + id);
        return json({ ok: true });
      }

      return json({ erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      return json({ erro: e.message || 'Erro interno' }, 500);
    }
  }
};
