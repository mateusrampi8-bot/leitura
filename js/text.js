/* Utilidades: detecção de tipo, conversões e renderização de texto. */

const Types = {
  PDF: 'pdf',
  EPUB: 'epub',
  COMIC: 'comic',   // imagem única (mangá/HQ/revista digital) ou ZIP de imagens
  AUDIO: 'audio',
  TEXT: 'text'
};

const EXT = {
  pdf: ['pdf'],
  epub: ['epub'],
  comic: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'zip'],
  audio: ['mp3', 'm4a', 'm4b', 'ogg', 'oga', 'wav', 'flac', 'aac', 'opus'],
  text: ['txt', 'md', 'markdown', 'html', 'htm']
};

const LABELS = {
  pdf: 'Livro',
  epub: 'EPUB',
  comic: 'Página',
  audio: 'Áudio',
  text: 'Texto',
  zip: 'Álbum'
};

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function detectType(name) {
  const ext = extOf(name);
  for (const [type, list] of Object.entries(EXT)) {
    if (list.includes(ext)) return type;
  }
  return null;
}

/* Arquivo sem extensão (ou extensão errada): descobre o tipo pelos primeiros bytes. */
async function sniffType(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const ascii = String.fromCharCode.apply(null, head);
    if (head[0] === 0x50 && head[1] === 0x4B) {
      return (ascii.includes('application/epub+zip') || ascii.includes('META-INF/container.xml')) ? 'epub' : 'zip';
    }
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'pdf';
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return 'comic';
    if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'comic';
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'comic';
    if (head[0] === 0x42 && head[1] === 0x4D) return 'comic';
    if (ascii.indexOf('WEBP') === 8) return 'comic';
    if (ascii.indexOf('RIFF') === 0) return 'audio';
    if (ascii.indexOf('ID3') === 0) return 'audio';
    if (ascii.indexOf('fLaC') === 0) return 'audio';
    if (ascii.indexOf('OggS') === 0) return 'audio';
    if (ascii.indexOf('ftyp') === 4) return 'audio';
    if (head[0] === 0xFF && (head[1] === 0xFB || head[1] === 0xF3 || head[1] === 0xF2)) return 'audio';
    const bytes = head.slice(0, 512);
    let bad = 0;
    for (const x of bytes) if (x === 0 || x < 9 || (x > 13 && x < 32)) bad++;
    if (bytes.length && bad / bytes.length < 0.1) return 'text';
    return null;
  } catch (e) {
    return null;
  }
}

function baseName(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? name : name.slice(0, i);
}

function stripExt(name) {
  return baseName(name).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n >= 10 ? 0 : 1) + ' ' + u[i];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- Ordenação natural (cap10 antes de cap2) ---------- */
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/* ---------- Markdown leve para artigos ---------- */
function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false, inList = false, para = [];

  const flushPara = () => {
    if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
  };
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  const inline = (t) => {
    t = escapeHtml(t);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return t;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith('```')) {
      flushPara(); closeList();
      if (inCode) { out.push('</pre>'); inCode = false; }
      else { out.push('<pre>'); inCode = true; }
      continue;
    }
    if (inCode) { out.push(escapeHtml(raw) + '\n'); continue; }

    if (!line.trim()) { flushPara(); closeList(); continue; }

    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushPara(); closeList();
      const lvl = Math.min(m[1].length + 1, 6);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s-*]*$/.test(line)) {
      flushPara(); closeList(); out.push('<hr>'); continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushPara(); closeList();
      out.push('<blockquote>' + inline(m[1]) + '</blockquote>');
      continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inline(m[1]) + '</li>');
      continue;
    }
    if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      flushPara(); closeList();
      out.push('<p>' + inline(m[2]) + '</p>');
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  if (inCode) out.push('</pre>');
  return out.join('\n');
}

/* ---------- HTML simples: isola o corpo se for um documento completo ---------- */
function renderHtmlDoc(src) {
  const body = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = body ? body[1] : src;
  const style = src.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  return style.join('\n') + content;
}

/* ---------- Capa elegante (SVG) para itens sem imagem ---------- */
function placeholderCover(title, kindLabel) {
  const words = String(title || '').trim().split(/\s+/).filter(w => /[A-Za-zÀ-ÿ0-9]/.test(w));
  const initials = (words.slice(0, 2).map(w => w[0]).join('') || 'L').toUpperCase();
  const label = escapeHtml(kindLabel || '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">` +
    `<rect width="400" height="600" fill="#f4f0e5"/>` +
    `<rect x="16" y="16" width="368" height="568" fill="none" stroke="#c9d6c4" stroke-width="2" rx="8"/>` +
    `<rect x="26" y="26" width="348" height="548" fill="none" stroke="#e0e7dc" stroke-width="1" rx="5"/>` +
    `<line x1="90" y1="230" x2="310" y2="230" stroke="#c9d6c4" stroke-width="1.5"/>` +
    `<line x1="90" y1="372" x2="310" y2="372" stroke="#c9d6c4" stroke-width="1.5"/>` +
    `<text x="200" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="118" fill="#6d8a6b">${escapeHtml(initials)}</text>` +
    `<text x="200" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="21" fill="#8b958a" letter-spacing="4">${label.toUpperCase()}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
