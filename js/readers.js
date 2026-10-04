/* Leitores: PDF, EPUB, páginas (mangá/HQ), áudio e texto. */

/* ---------- Leitura humana: tipografia de livro + virada de página ---------- */
function typographic(root) {
  if (!root) return;
  const skip = (el) => el && /^(CODE|PRE|SCRIPT|STYLE)$/i.test(el.tagName);
  const SEL = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, dd, dt, div';
  let blocks = [];
  try { blocks = [...root.querySelectorAll(SEL)].filter(b => !b.querySelector(SEL)); } catch (e) {}
  if (!blocks.length) blocks = [root];
  for (const block of blocks) {
    let open = true;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      if (skip(n.parentElement)) continue;
      let s = n.nodeValue;
      if (s.indexOf('...') >= 0) s = s.replace(/\.{3,}/g, '\u2026');
      if (/\s--\s/.test(s)) s = s.replace(/\s--\s/g, ' \u2014 ');
      s = s.replace(/(\w)'(\w)/g, '$1\u2019$2');
      if (s.indexOf('"') >= 0) {
        s = s.replace(/"/g, () => {
          const r = open ? '\u201C' : '\u201D';
          open = !open;
          return r;
        });
      }
      n.nodeValue = s;
    }
  }
}

function pageTurn(body) {
  if (!body) return;
  body.classList.remove('page-turn');
  void body.offsetWidth;
  body.classList.add('page-turn');
}

/* ======================= PDF ======================= */
const PdfReader = (() => {
  let pdf = null, pageNum = 1, scale = 1, fitMode = 'width', ctx = null, renderTask = null, findCache = null;

  async function open(item, els, progress) {
    ctx = els;
    const data = await item.blob.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data }).promise;
    findCache = null;
    pageNum = Math.min(Math.max(progress.page || 1, 1), pdf.numPages);
    scale = 1; fitMode = 'width';

    els.body.classList.add('canvas-mode');
    els.body.innerHTML = '<canvas class="page-canvas" id="pdfCanvas"></canvas>';
    els.controls.innerHTML =
      `<button class="btn btn-icon" data-act="prev" title="Página anterior (←)">&#8249;</button>
       <input class="page-input" id="pageInput" type="number" min="1">
       <span class="label">/ <span id="pageTotal"></span></span>
       <button class="btn btn-icon" data-act="next" title="Próxima página (→)">&#8250;</button>
       <span style="width:8px"></span>
       <button class="btn btn-icon" data-act="zoomOut" title="Diminuir zoom (-)">&#8722;</button>
       <span class="label" id="zoomLabel">100%</span>
       <button class="btn btn-icon" data-act="zoomIn" title="Aumentar zoom (+)">+</button>
       <button class="btn btn-sm" data-act="fit" title="Ajustar à largura">Ajustar</button>
       <button class="btn btn-icon" data-act="full" title="Tela cheia (F)">&#x26F6;</button>`;

    document.getElementById('pageTotal').textContent = pdf.numPages;
    els.controls.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'prev') go(pageNum - 1);
      if (act === 'next') go(pageNum + 1);
      if (act === 'zoomIn') setZoom(scale * 1.2);
      if (act === 'zoomOut') setZoom(scale / 1.2);
      if (act === 'fit') { fitMode = 'width'; render(); }
      if (act === 'full') toggleFull();
    };
    const input = document.getElementById('pageInput');
    input.onchange = () => go(parseInt(input.value, 10) || 1);

    els.body.onwheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(e.deltaY < 0 ? scale * 1.12 : scale / 1.12);
    };

    els.footer.innerHTML =
      `<span><span class="kbd">←</span> <span class="kbd">→</span> páginas</span>
       <span><span class="kbd">Espaço</span> próxima</span>
       <span><span class="kbd">+/-</span> zoom</span>
       <span><span class="kbd">F</span> tela cheia</span>
       <span>${formatBytes(item.size)}</span>`;

    await render();
    return {
      onKey, onResize: render, dispose, goTo: (n) => go(n), find,
      getPageText: pageText, getPage: () => pageNum, getNumPages: () => (pdf ? pdf.numPages : 0)
    };
  }

  async function pageText() {
    if (!pdf) return '';
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    return tc.items.map(x => x.str || '').join(' ').replace(/\s+/g, ' ').trim();
  }

  async function find(term, dir) {
    if (!pdf || !term) return null;
    const t = term.toLowerCase();
    if (!findCache || findCache.term !== t) {
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const txt = tc.items.map(x => x.str || '').join(' ').toLowerCase();
        let idx = 0, c = 0;
        while ((idx = txt.indexOf(t, idx)) !== -1) { c++; idx += Math.max(1, t.length); }
        if (c) pages.push({ page: i, count: c });
      }
      findCache = { term: t, pages };
    }
    const pages = findCache.pages;
    if (!pages.length) return { label: '0/0' };
    let cur = pages.findIndex(p => p.page === pageNum);
    if (dir > 0) cur = cur < 0 ? 0 : (cur + 1) % pages.length;
    else if (dir < 0) cur = cur < 0 ? pages.length - 1 : (cur - 1 + pages.length) % pages.length;
    else if (cur < 0) cur = 0;
    if (pages[cur].page !== pageNum) { pageNum = pages[cur].page; await render(); }
    return { label: (cur + 1) + '/' + pages.length };
  }

  function setZoom(z) { scale = Math.min(Math.max(z, 0.2), 6); fitMode = 'custom'; render(); }

  async function render() {
    if (!pdf) return;
    const canvas = document.getElementById('pdfCanvas');
    if (!canvas) return;
    const page = await pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    let s = scale;
    if (fitMode === 'width') {
      const avail = ctx.body.clientWidth - 40;
      s = avail / base.width;
      scale = s;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: s * dpr });
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.style.width = (vp.width / dpr) + 'px';
    canvas.style.height = (vp.height / dpr) + 'px';

    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    try { await renderTask.promise; } catch (e) { if (e.name !== 'RenderingCancelledException') throw e; }

    document.getElementById('pageInput').value = pageNum;
    document.getElementById('pageInput').max = pdf.numPages;
    document.getElementById('zoomLabel').textContent = Math.round(scale * 100) + '%';
    ctx.body.scrollTop = 0;
    pageTurn(ctx.body);
    ctx.onProgress({ page: pageNum, total: pdf.numPages });
  }

  function go(n) {
    if (!pdf) return;
    const t = Math.min(Math.max(n, 1), pdf.numPages);
    if (t === pageNum) return;
    pageNum = t;
    render();
  }

  function onKey(e) {
    const rtl = false;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(pageNum + 1); return true; }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(pageNum - 1); return true; }
    if (e.key === ' ') { go(pageNum + 1); return true; }
    if (e.key === 'Home') { go(1); return true; }
    if (e.key === 'End') { go(pdf.numPages); return true; }
    if (e.key === '+' || e.key === '=') { setZoom(scale * 1.2); return true; }
    if (e.key === '-') { setZoom(scale / 1.2); return true; }
    if (e.key.toLowerCase() === 'f') { toggleFull(); return true; }
    return false;
  }

  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function dispose() {
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    if (pdf) pdf.destroy();
    pdf = null; ctx = null;
  }

  return { open, onKey };
})();

/* ======================= EPUB ======================= */
const EpubReader = (() => {
  let zip = null, opfDir = '', opf = null, spine = [], toc = [], index = 0, ctx = null;
  const urls = new Map();

  function resolve(path) {
    if (/^[a-z]+:/i.test(path)) return path;
    path = decodeURIComponent(path.split('#')[0]);
    if (path.startsWith('/')) return path.slice(1);
    const parts = (opfDir + path).split('/');
    const out = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      if (p === '..') out.pop(); else out.push(p);
    }
    return out.join('/');
  }

  async function urlFor(path) {
    const key = resolve(path);
    if (urls.has(key)) return urls.get(key);
    try {
      const f = zip.file(key);
      if (!f) return '';
      const blob = await f.async('blob');
      const u = URL.createObjectURL(blob);
      urls.set(key, u);
      return u;
    } catch (e) { return ''; }
  }

  async function open(item, els, progress) {
    ctx = els;
    zip = await JSZip.loadAsync(item.blob);

    const containerFile = zip.file('META-INF/container.xml');
    const containerXml = containerFile ? await containerFile.async('text') : '';
    let opfPath = (containerXml.match(/full-path="([^"]+)"/) || [])[1] || '';
    if (!opfPath) {
      const all = Object.keys(zip.files);
      opfPath = all.find(n => n.endsWith('.opf')) || '';
    }
    opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfText = await zip.file(opfPath).async('text');
    opf = new DOMParser().parseFromString(opfText, 'application/xml');

    const manifest = {};
    opf.querySelectorAll('manifest > item').forEach(it => {
      manifest[it.getAttribute('id')] = {
        href: it.getAttribute('href'),
        type: it.getAttribute('media-type') || ''
      };
    });

    spine = [...opf.querySelectorAll('spine > itemref')].map(r => manifest[r.getAttribute('idref')]).filter(Boolean);

    // Tabela de conteúdos (EPUB3 nav ou NCX)
    const navItem = Object.values(manifest).find(m => m.type.includes('nav')) ||
                    Object.values(manifest).find(m => m.href && m.href.endsWith('.ncx'));
    if (navItem) {
      try {
        const xml = await zip.file(resolve(navItem.href)).async('text');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        doc.querySelectorAll('nav a, navPoint content, a').forEach(a => {
          const href = a.getAttribute('src') || a.getAttribute('href');
          const label = (a.textContent || '').trim();
          if (href && label) toc.push({ href: resolve(href), label: label.slice(0, 90) });
        });
      } catch (e) {}
    }
    if (!toc.length) toc = spine.map((s, i) => ({ href: resolve(s.href), label: 'Parte ' + (i + 1) }));

    els.body.classList.remove('canvas-mode');
    els.body.classList.add('text-mode');
    els.body.innerHTML = '<div class="book-reader" id="epubContent"></div>';

    const tocSel = toc.length > 1
      ? `<select id="tocSelect" class="page-input" style="width:170px" title="Sumário">
          ${toc.map((t, i) => `<option value="${i}">${escapeHtml(t.label)}</option>`).join('')}
         </select>`
      : '';
    els.controls.innerHTML =
      `<button class="btn btn-icon" data-act="prev" title="Parte anterior (←)">&#8249;</button>
       <span class="label" id="epubPos"></span>
       <button class="btn btn-icon" data-act="next" title="Próxima parte (→)">&#8250;</button>
       ${tocSel}
       <button class="btn btn-icon" data-act="full" title="Tela cheia (F)">&#x26F6;</button>`;

    els.controls.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'prev') go(index - 1);
      if (act === 'next') go(index + 1);
      if (act === 'full') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
    };
    const sel = document.getElementById('tocSelect');
    if (sel) sel.onchange = () => go(parseInt(sel.value, 10));

    els.footer.innerHTML =
      `<span><span class="kbd">←</span> <span class="kbd">→</span> capítulos</span>
       <span>${spine.length} partes</span><span>${formatBytes(item.size)}</span>`;

    index = Math.min(Math.max(progress.page || 0, 0), spine.length - 1);
    await render();
    return { onKey, onResize: () => {}, dispose, goTo: (n) => go(n - 1) };
  }

  async function render() {
    const part = spine[index];
    if (!part) return;
    const html = await zip.file(resolve(part.href)).async('text');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = resolve(part.href);
    const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';

    const refs = [...doc.querySelectorAll('[src], [href], image')];
    for (const el of refs) {
      const attr = el.tagName.toLowerCase() === 'image' ? 'href' : (el.hasAttribute('src') ? 'src' : 'href');
      const val = el.getAttribute(attr);
      if (!val || val.startsWith('#') || /^[a-z]+:/i.test(val)) continue;
      const u = await urlFor(baseDir + val);
      if (u) el.setAttribute(attr, u);
      else if (attr === 'href') el.setAttribute('href', 'javascript:void 0');
    }

    const el = document.getElementById('epubContent');
    el.innerHTML = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
    typographic(el);
    el.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
    el.querySelectorAll('a').forEach(a => {
      a.onclick = (ev) => {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) { ev.preventDefault(); el.querySelector(href)?.scrollIntoView(); return; }
        if (/^[a-z]+:/i.test(href)) return;
        ev.preventDefault();
        const target = resolve(baseDir + href);
        const i = spine.findIndex(s => resolve(s.href) === target);
        if (i >= 0) go(i);
      };
    });

    ctx.body.scrollTop = 0;
    document.getElementById('epubPos').textContent = `${index + 1} / ${spine.length}`;
    const sel = document.getElementById('tocSelect');
    if (sel) sel.value = String(index);
    pageTurn(ctx.body);
    ctx.onProgress({ page: index, total: spine.length });
  }

  function go(i) {
    if (i < 0 || i >= spine.length || i === index) return;
    index = i;
    render();
  }

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { go(index + 1); return true; }
    if (e.key === 'ArrowLeft') { go(index - 1); return true; }
    if (e.key === 'Home') { go(0); return true; }
    if (e.key === 'End') { go(spine.length - 1); return true; }
    return false;
  }

  function dispose() { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); zip = null; toc = []; ctx = null; }

  return { open, onKey };
})();

/* ======================= PÁGINAS (mangá / HQ / revista) ======================= */
const PageReader = (() => {
  let pages = [], i = 0, twoPages = false, rtl = false, fit = 'height', zoom = 1, ctx = null;
  const cache = new Map();

  async function open(item, els, progress) {
    ctx = els;
    pages = item.pages || [{ name: item.name, blob: item.blob }];
    i = Math.min(Math.max(progress.page || 0, 0), pages.length - 1);
    rtl = item.rtl === true || (item.type === 'comic' && /manga|manhwa|chap/i.test(item.name));

    els.body.classList.add('canvas-mode');
    els.body.innerHTML = '<div class="pages-row" id="pagesRow"></div>';
    els.controls.innerHTML =
      `<button class="btn btn-icon" data-act="prev" title="Página anterior (←)">&#8249;</button>
       <input class="page-input" id="pageInput" type="number" min="1">
       <span class="label">/ <span id="pageTotal"></span></span>
       <button class="btn btn-icon" data-act="next" title="Próxima página (→)">&#8250;</button>
       <span style="width:6px"></span>
       <button class="btn btn-sm" data-act="single">1 pág</button>
       <button class="btn btn-sm" data-act="spread">2 pág</button>
       <button class="btn btn-sm" data-act="rtl" title="Direita para esquerda (leitura de mangá)">${rtl ? 'Mangá ⟵' : 'Manga →'}</button>
       <button class="btn btn-icon" data-act="zoomOut" title="Diminuir (-)">&#8722;</button>
       <button class="btn btn-icon" data-act="zoomIn" title="Aumentar (+)">+</button>
       <button class="btn btn-icon" data-act="full" title="Tela cheia (F)">&#x26F6;</button>`;

    document.getElementById('pageTotal').textContent = pages.length;
    els.controls.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'prev') go(i - (twoPages ? 2 : 1));
      if (act === 'next') go(i + (twoPages ? 2 : 1));
      if (act === 'single') { twoPages = false; render(); }
      if (act === 'spread') { twoPages = true; render(); }
      if (act === 'rtl') { rtl = !rtl; e.target.textContent = rtl ? 'Mangá ⟵' : 'Manga →'; render(); }
      if (act === 'zoomIn') { zoom = Math.min(zoom * 1.15, 4); render(); }
      if (act === 'zoomOut') { zoom = Math.max(zoom / 1.15, 0.3); render(); }
      if (act === 'full') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
    };
    document.getElementById('pageInput').onchange = (e) => go(parseInt(e.target.value, 10) - 1);

    els.footer.innerHTML =
      `<span><span class="kbd">←</span> <span class="kbd">→</span> páginas</span>
       <span><span class="kbd">Espaço</span> próxima</span>
       <span><span class="kbd">1</span> / <span class="kbd">2</span> modo</span>
       <span>${pages.length} páginas</span>`;

    await render();
    return { onKey, onResize: render, dispose, goTo: (n) => go(n - 1) };
  }

  async function srcFor(idx) {
    if (idx < 0 || idx >= pages.length) return null;
    if (cache.has(idx)) return cache.get(idx);
    const url = URL.createObjectURL(pages[idx].blob);
    cache.set(idx, url);
    if (cache.size > 30) {
      const first = cache.keys().next().value;
      if (first !== idx) { URL.revokeObjectURL(cache.get(first)); cache.delete(first); }
    }
    return url;
  }

  async function render() {
    const row = document.getElementById('pagesRow');
    if (!row) return;
    row.className = 'pages-row' + (rtl ? ' rtl' : '');
    const idxs = twoPages ? [i, i + 1] : [i];

    const imgs = await Promise.all(idxs.map(async (n) => {
      const url = await srcFor(n);
      if (!url) return null;
      return `<img src="${url}" alt="página ${n + 1}">`;
    }));

    row.innerHTML = imgs.filter(Boolean).join('') || '<span class="muted">Sem página</span>';
    pageTurn(ctx.body);

    const imgsEls = [...row.querySelectorAll('img')];
    imgsEls.forEach(im => {
      const apply = () => {
        const maxW = ctx.body.clientWidth - 40;
        const maxH = ctx.body.clientHeight - 30;
        if (fit === 'height') {
          im.style.height = (maxH * zoom) + 'px';
          im.style.width = 'auto';
          if (parseFloat(im.style.width) > maxW * zoom) {
            im.style.width = (maxW * zoom) + 'px';
            im.style.height = 'auto';
          }
        } else {
          im.style.width = (maxW * zoom) + 'px';
          im.style.height = 'auto';
        }
      };
      if (im.complete) apply(); else im.onload = apply;
    });

    document.getElementById('pageInput').value = i + 1;
    ctx.body.scrollTop = 0;
    ctx.onProgress({ page: i, total: pages.length });
    preload();
  }

  function preload() {
    const next = twoPages ? i + 2 : i + 1;
    srcFor(next);
    srcFor(next + 1);
  }

  function go(n) {
    const t = Math.min(Math.max(n, 0), pages.length - 1);
    if (t === i) return;
    i = t;
    render();
  }

  function onKey(e) {
    const dir = rtl ? -1 : 1;
    const step = twoPages ? 2 : 1;
    if (e.key === 'ArrowRight') { go(i + dir * step); return true; }
    if (e.key === 'ArrowLeft') { go(i - dir * step); return true; }
    if (e.key === ' ') { go(i + step); return true; }
    if (e.key === 'Home') { go(0); return true; }
    if (e.key === 'End') { go(pages.length - 1); return true; }
    if (e.key === '1') { twoPages = false; render(); return true; }
    if (e.key === '2') { twoPages = true; render(); return true; }
    if (e.key === '+' || e.key === '=') { zoom = Math.min(zoom * 1.15, 4); render(); return true; }
    if (e.key === '-') { zoom = Math.max(zoom / 1.15, 0.3); render(); return true; }
    if (e.key.toLowerCase() === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); return true; }
    return false;
  }

  function dispose() { cache.forEach(u => URL.revokeObjectURL(u)); cache.clear(); ctx = null; }

  return { open, onKey };
})();

/* ======================= ÁUDIO ======================= */
const AudioReader = (() => {
  let audio = null, tracks = [], i = 0, ctx = null, saveTimer = null;

  async function open(item, els, progress) {
    ctx = els;
    ctx.item = item;
    tracks = item.pages || [{ name: item.name, blob: item.blob }];
    i = Math.min(Math.max(progress.track || 0, 0), tracks.length - 1);

    els.body.classList.remove('canvas-mode', 'text-mode');
    els.body.innerHTML =
      `<div class="audio-view">
        <div class="audio-art">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 14.5v-2.5a8 8 0 0 1 16 0v2.5"/>
            <path d="M4 14h2.6a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H5.2A1.2 1.2 0 0 1 4 18z"/>
            <path d="M20 14h-2.6a1 1 0 0 0-1 1v3.2a1 1 0 0 0 1 1h1.4A1.2 1.2 0 0 0 20 18z"/>
          </svg>
        </div>
        <div class="audio-meta">
          <h2 id="auTitle"></h2>
          <p id="auSub"></p>
        </div>
        <div class="audio-seek">
          <input type="range" id="auSeek" min="0" max="1000" value="0">
          <div class="audio-times"><span id="auCur">0:00</span><span id="auDur">0:00</span></div>
        </div>
        <div class="audio-controls">
          <button class="btn btn-icon" data-act="prev" title="Faixa anterior">&#9198;</button>
          <button class="btn btn-icon" data-act="back" title="-15s">&#8630;</button>
          <button class="play" data-act="play" id="auPlay" title="Reproduzir (Espaço)">&#9654;</button>
          <button class="btn btn-icon" data-act="fwd" title="+15s">&#8631;</button>
          <button class="btn btn-icon" data-act="next" title="Próxima faixa">&#9197;</button>
        </div>
        <div class="audio-extra">
          <button class="btn btn-sm speed-btn" data-speed="0.75">0.75x</button>
          <button class="btn btn-sm speed-btn active" data-speed="1">1x</button>
          <button class="btn btn-sm speed-btn" data-speed="1.25">1.25x</button>
          <button class="btn btn-sm speed-btn" data-speed="1.5">1.5x</button>
          <button class="btn btn-sm speed-btn" data-speed="2">2x</button>
        </div>
        <div class="audio-queue">
          <div class="aq-head">Fila de faixas</div>
          <ul class="track-list" id="auList"></ul>
        </div>
       </div>`;

    audio = new Audio();
    audio.preload = 'metadata';
    bindControls(els);
    const vel = parseFloat(localStorage.getItem('leitura:vel') || '1');
    setSpeed(Number.isFinite(vel) ? vel : 1);
    await loadTrack(progress.pos || 0);

    els.footer.innerHTML =
      `<span><span class="kbd">Espaço</span> tocar/pausar</span>
       <span><span class="kbd">←</span> <span class="kbd">→</span> 15s</span>
       <span><span class="kbd">Shift+←</span> faixa</span>
       <span>${tracks.length} faixa(s)</span>`;
    return { onKey, onResize: () => {}, dispose, goTo: (n) => track(n - 1) };
  }

  function bindControls(els) {
    els.controls.innerHTML = `<span class="label">${tracks.length > 1 ? 'Faixa <span id="auTrackNo"></span> / ' + tracks.length : 'Áudio'}</span>`;
    els.body.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'play') toggle();
      if (act === 'prev') track(i - 1);
      if (act === 'next') track(i + 1);
      if (act === 'back') audio.currentTime = Math.max(0, audio.currentTime - 15);
      if (act === 'fwd') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
      const sp = e.target.closest('[data-speed]');
      if (sp) setSpeed(parseFloat(sp.dataset.speed));
    };
    renderList();
    const seek = document.getElementById('auSeek');
    seek.oninput = () => {
      if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    };

    audio.ontimeupdate = () => {
      const d = audio.duration || 0;
      seek.value = d ? (audio.currentTime / d) * 1000 : 0;
      document.getElementById('auCur').textContent = fmt(audio.currentTime);
      document.getElementById('auDur').textContent = fmt(d);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => ctx.onProgress({ pos: audio.currentTime, track: i }), 1500);
    };
    audio.onended = () => { if (i < tracks.length - 1) track(i + 1); else toggle(); };
    audio.onplay = () => { document.getElementById('auPlay').innerHTML = '&#10074;&#10074;'; };
    audio.onpause = () => { document.getElementById('auPlay').innerHTML = '&#9654;'; };
  }

  function setSpeed(v) {
    if (!audio) return;
    v = Math.min(2, Math.max(0.75, v));
    audio.playbackRate = v;
    localStorage.setItem('leitura:vel', String(v));
    document.querySelectorAll('.speed-btn').forEach(b =>
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.speed) - v) < 0.001));
  }

  function renderList() {
    const ul = document.getElementById('auList');
    if (!ul) return;
    ul.innerHTML = tracks.map((t, k) => `
      <li class="track-item ${k === i ? 'active' : ''}" data-k="${k}">
        <span class="tn">${k === i ? '&#9654;' : (k + 1)}</span>
        <span class="tt">${stripExt(t.name)}</span>
      </li>`).join('');
    ul.querySelectorAll('.track-item').forEach(li => li.onclick = () => track(+li.dataset.k));
  }

  async function loadTrack(startAt) {
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(tracks[i].blob);
    audio.currentTime = 0;
    renderList();
    document.getElementById('auTitle').textContent = stripExt(tracks[i].name);
    document.getElementById('auSub').textContent =
      (ctx.item && ctx.item.title ? ctx.item.title + ' · ' : '') + (i + 1) + ' de ' + tracks.length;
    const tn = document.getElementById('auTrackNo');
    if (tn) tn.textContent = i + 1;
    audio.onloadedmetadata = () => { if (startAt) audio.currentTime = startAt; };
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: stripExt(tracks[i].name) });
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('nexttrack', () => track(i + 1));
        navigator.mediaSession.setActionHandler('previoustrack', () => track(i - 1));
      } catch (e) {}
    }
  }

  function track(n) {
    if (n < 0 || n >= tracks.length) return;
    i = n;
    const wasPlaying = !audio.paused;
    loadTrack(0).then(() => { if (wasPlaying) audio.play(); });
  }

  function toggle() { audio.paused ? audio.play() : audio.pause(); }

  function fmt(s) {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  }

  function onKey(e) {
    if (e.key === ' ') { toggle(); return true; }
    if (e.key === 'ArrowRight') { if (e.shiftKey) track(i + 1); else audio.currentTime += 15; return true; }
    if (e.key === 'ArrowLeft') { if (e.shiftKey) track(i - 1); else audio.currentTime = Math.max(0, audio.currentTime - 15); return true; }
    if (e.key === '+' || e.key === '=') { setSpeed(Math.min(2, (audio.playbackRate || 1) + 0.25)); return true; }
    if (e.key === '-') { setSpeed(Math.max(0.75, (audio.playbackRate || 1) - 0.25)); return true; }
    return false;
  }

  function dispose() {
    clearTimeout(saveTimer);
    if (audio) {
      const last = { pos: audio.currentTime, track: i };
      audio.pause();
      if (audio.src) URL.revokeObjectURL(audio.src);
      audio = null;
      ctx.onProgress(last);
    }
    ctx = null;
  }

  return { open, onKey };
})();

/* ======================= TEXTO / ARTIGO ======================= */
const TextReader = (() => {
  let ctx = null, pct = 0;

  async function open(item, els, progress) {
    ctx = els;
    const raw = await item.blob.text();
    const ext = (item.ext || '').toLowerCase() || extOf(item.title || '');

    els.body.classList.remove('canvas-mode');
    els.body.classList.add('text-mode');
    const inner = ext === 'html' || ext === 'htm'
      ? renderHtmlDoc(raw)
      : ext === 'md' || ext === 'markdown' ? renderMarkdown(raw) : `<p>${escapeHtml(raw).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

    els.body.innerHTML = `<article class="book-reader" id="textContent">${inner}</article>`;
    typographic(document.getElementById('textContent'));
    pageTurn(els.body);

    els.controls.innerHTML =
      `<button class="btn btn-icon" data-act="full" title="Tela cheia (F)">&#x26F6;</button>`;

    els.controls.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'full') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
    };

    els.footer.innerHTML = `<span><span class="kbd">↑</span> <span class="kbd">↓</span> rolar</span><span id="txtPos">0%</span><span>${formatBytes(item.size)}</span>`;

    const report = () => {
      if (!ctx) return;
      const max = els.body.scrollHeight - els.body.clientHeight;
      pct = max > 0 ? Math.round((els.body.scrollTop / max) * 100) : 0;
      const pos = document.getElementById('txtPos');
      if (pos) pos.textContent = pct + '%';
      ctx.onProgress({ page: pct, total: 100 });
    };
    els.body.onscroll = report;

    requestAnimationFrame(() => {
      const max = els.body.scrollHeight - els.body.clientHeight;
      els.body.scrollTop = max * ((progress.page || 0) / 100);
      report();
    });

    return { onKey, onResize: () => {}, dispose, goTo };
  }

  function goTo(pct) {
    if (!ctx) return;
    const max = ctx.body.scrollHeight - ctx.body.clientHeight;
    ctx.body.scrollTop = max * (Math.min(100, Math.max(0, pct)) / 100);
  }

  function onKey(e) {
    if (e.key.toLowerCase() === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); return true; }
    return false;
  }

  function dispose() {
    if (ctx && ctx.body) ctx.body.onscroll = null;
    ctx = null;
  }

  return { open, onKey };
})();

/* ======================= GERAÇÃO DE CAPAS ======================= */
const Covers = {
  async for(item) {
    const label = { pdf: 'Livro PDF', epub: 'E-book', comic: 'Página', audio: 'Audiobook', text: 'Artigo' }[item.type] || 'Arquivo';
    const ph = placeholderCover(item.title, label);
    try {
      if (item.type === 'pdf') return await this.fromPdf(item) || ph;
      if (item.type === 'comic' && item.pages && item.pages[0]) return await this.fromBlob(item.pages[0].blob) || ph;
      if (item.type === 'epub') return await this.fromEpub(item) || ph;
      if (item.type === 'text') return ph;
      return ph;
    } catch (e) { return ph; }
  },

  async fromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      const w = 340, h = Math.round(w * img.height / img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.75);
    } finally { URL.revokeObjectURL(url); }
  },

  async fromPdf(item) {
    const data = await item.blob.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 340 / base.width;
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const out = c.toDataURL('image/jpeg', 0.75);
    doc.destroy();
    return out;
  },

  async fromEpub(item) {
    const zip = await JSZip.loadAsync(item.blob);
    const container = zip.file('META-INF/container.xml');
    if (!container) return null;
    const xml = await container.async('text');
    const opfPath = (xml.match(/full-path="([^"]+)"/) || [])[1];
    if (!opfPath) return null;
    const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('text'), 'application/xml');
    const items = [...opf.querySelectorAll('manifest > item')];
    const coverItem = items.find(it => (it.getAttribute('properties') || '').includes('cover-image')) ||
      items.find(it => /cover/i.test(it.getAttribute('id') || '') && (it.getAttribute('media-type') || '').startsWith('image/'));
    if (!coverItem) return null;
    const rel = coverItem.getAttribute('href');
    const path = dir + rel;
    const f = zip.file(path) || zip.file(decodeURIComponent(path));
    if (!f) return null;
    return this.fromBlob(await f.async('blob'));
  }
};
