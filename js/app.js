/* =========================================================
   Leitura — biblioteca local, importação, painéis e leitores
   ========================================================= */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const els = {
  views: $$('.view'),
  nav: $('#nav'),
  grid: $('#grid'), empty: $('#empty'),
  lendoGrid: $('#lendoGrid'), lendoEmpty: $('#lendoEmpty'),
  favGrid: $('#favGrid'), favEmpty: $('#favEmpty'),
  search: $('#search'), sort: $('#sort'), filters: $('#filters'),
  dropzone: $('#dropzone'), dropOverlay: $('#dropOverlay'),
  fileInput: $('#fileInput'), toast: $('#toast'),
  hero: $('#hero'), lendoRow: $('#lendoRow'), statGrid: $('#statGrid'),
  goalBox: $('#goalBox'), actChart: $('#actChart'), recoList: $('#recoList'),
  goalBig: $('#goalBig'), metaInput: $('#metaInput'), metaSave: $('#metaSave'),
  metaYear: $('#metaYear'), doneList: $('#doneList'), doneCount: $('#doneCount'),
  kpiGrid: $('#kpiGrid'), weekChart: $('#weekChart'), weekTotal: $('#weekTotal'),
  summaryList: $('#summaryList'), libCount: $('#libCount'),
  reader: $('#readerView'), readerTitle: $('#readerTitle'),
  readerControls: $('#readerControls'), readerBody: $('#readerBody'),
  readerFooter: $('#readerFooter'), btnBack: $('#btnBack'), btnMode: $('#btnMode'),
  btnType: $('#btnType'), btnNotes: $('#btnNotes'), btnNotesClose: $('#btnNotesClose'),
  notesPanel: $('#notesPanel'), notesText: $('#notesText'), notesList: $('#notesList'),
  notesPos: $('#notesPos'), typePanel: $('#typePanel'),
  hlPop: $('#hlPop'), hlRemove: $('#hlRemove'), hlHead: $('#hlHead'), hlList: $('#hlList'),
  findBar: $('#findBar'), findInput: $('#findInput'), findCount: $('#findCount'),
  findPrev: $('#findPrev'), findNext: $('#findNext'), findClose: $('#findClose'),
  btnFind: $('#btnFind'), btnSpeak: $('#btnSpeak'),
  fontMinus: $('#fontMinus'), fontPlus: $('#fontPlus'), fontVal: $('#fontVal'),
  widthSeg: $('#widthSeg'), fontSeg: $('#fontSeg'),
  voiceSel: $('#voiceSel'),
  velRange: $('#velRange'), velVal: $('#velVal'),
  pitchRange: $('#pitchRange'), pitchVal: $('#pitchVal'),
  volRange: $('#volRange'), volVal: $('#volVal'),
  noiteVoice: $('#noiteVoice'),
  btnAdd: $('#btnAdd'), btnAddSide: $('#btnAddSide'), btnAddLib: $('#btnAddLib'),
  btnModeTop: $('#btnModeTop'),   btnExport: $('#btnExport'), btnImport: $('#btnImport'),
  fileBackup: $('#fileBackup'),
  shelfChips: $('#shelfChips'), tagSel: $('#tagSel'),
  itemModal: $('#itemModal'), mClose: $('#mClose'), mCancel: $('#mCancel'),
  mSave: $('#mSave'), mDelete: $('#mDelete'), mTitle: $('#mTitle'),
  mAuthor: $('#mAuthor'), mCover: $('#mCover'), mCoverFile: $('#mCoverFile'),
  mCoverGen: $('#mCoverGen'), mShelf: $('#mShelf'), mCols: $('#mCols'),
  mColNew: $('#mColNew'), mColAdd: $('#mColAdd'), mTags: $('#mTags'),
  mTagNew: $('#mTagNew'), mTagAdd: $('#mTagAdd'), mStars: $('#mStars'),
  sharedList: $('#sharedList'), sharedEmpty: $('#sharedEmpty'), sharedCount: $('#sharedCount'),
  sharedFile: $('#sharedFile'), btnSharedRefresh: $('#btnSharedRefresh'),
  btnSharedUpload: $('#btnSharedUpload'), btnSharedKey: $('#btnSharedKey')
};

let items = [];
let view = 'home';
let filter = 'all';
let shelfFilter = 'all';
let tagFilter = '';
let query = '';
let sortMode = 'recent';
let currentApi = null;
let currentItem = null;
let toastTimer = null;
let actTimer = null;

/* ================= Utilidades ================= */
function toast(msg, ms = 2800) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

function progressRatio(it) {
  const p = it.progress;
  if (!p || !p.total) return 0;
  const cur = (it.type === 'comic' || it.type === 'epub') ? p.page + 1 : p.page;
  return Math.min(1, Math.max(0, cur / p.total));
}

const isDone = (it) => progressRatio(it) >= 0.99;
const isReading = (it) => { const r = progressRatio(it); return r > 0.001 && r < 0.99; };
const isFav = (it) => !!it.favorite;

/* ================= Estantes, coleções, tags, notas ================= */
const SHELVES = [
  { id: 'para-ler', label: 'Para ler' },
  { id: 'lendo', label: 'Lendo' },
  { id: 'lidos', label: 'Lidos' }
];

function deriveShelf(it) {
  const r = progressRatio(it);
  return r >= 0.99 ? 'lidos' : r > 0.001 ? 'lendo' : 'para-ler';
}
function shelfOf(it) {
  return (it.shelf && SHELVES.some(s => s.id === it.shelf)) ? it.shelf : deriveShelf(it);
}
function shelfLabel(id) {
  const s = SHELVES.find(x => x.id === id);
  return s ? s.label : id;
}

function getCollections() {
  try { return JSON.parse(localStorage.getItem('leitura:colecoes') || '[]'); }
  catch (e) { return []; }
}
function setCollections(list) { localStorage.setItem('leitura:colecoes', JSON.stringify(list)); }

function allTags() {
  const set = new Set();
  items.forEach(it => (it.tags || []).forEach(t => set.add(t)));
  return [...set].sort(naturalCompare);
}

function inShelf(it, key) {
  if (key === 'all') return true;
  if (key.startsWith('col:')) return (it.collecoes || []).includes(key.slice(4));
  if (SHELVES.some(s => s.id === key)) return shelfOf(it) === key;
  return true;
}

const ratingOf = (it) => Math.max(0, Math.min(5, Math.round(it.rating || 0)));

function starsHtml(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="${i <= n ? '' : 'off'}">★</span>`;
  return s;
}

function progressLabel(it) {
  const p = it.progress;
  if (!p) return 'Não lido';
  if (it.type === 'audio') return p.pos > 0 ? 'Ouvindo' : 'Não lido';
  const pct = Math.round(progressRatio(it) * 100);
  if (pct <= 0) return 'Não lido';
  if (pct >= 100) return 'Concluído';
  return `Lendo · ${pct}%`;
}

function typeLabel(it) {
  if (it.type === 'comic') return (it.pages && it.pages.length > 1) ? 'Álbum' : 'Página';
  return LABELS[it.type] || it.type;
}

function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getActivity() {
  try { return JSON.parse(localStorage.getItem('leitura:atividade') || '{}'); }
  catch (e) { return {}; }
}
function addActivity(sec) {
  const a = getActivity();
  const k = todayKey();
  a[k] = (a[k] || 0) + sec;
  localStorage.setItem('leitura:atividade', JSON.stringify(a));
}
function getMeta() {
  const n = parseInt(localStorage.getItem('leitura:meta') || '12', 10);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

function lastDays(n) {
  const out = [];
  const labels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    out.push({ key, label: labels[d.getDay()], short: String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') });
  }
  return out;
}

function streak() {
  const a = getActivity();
  let n = 0;
  const d = new Date();
  if (!a[todayKey(d)]) d.setDate(d.getDate() - 1);
  while (a[todayKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function fmtHours(sec) {
  if (sec < 60) return Math.round(sec) + 'min';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h + 'h' + (m ? ' ' + m + 'min' : '');
}

/* ================= Preferências de tipografia ================= */
const TYPE_PREFS = {
  font: parseInt(localStorage.getItem('leitura:fonte') || '19', 10) || 19,
  col: localStorage.getItem('leitura:coluna') || 'normal',
  family: localStorage.getItem('leitura:familia') || 'serif'
};

function applyTypePrefs() {
  els.reader.style.setProperty('--book-size', TYPE_PREFS.font + 'px');
  els.reader.dataset.col = TYPE_PREFS.col;
  els.reader.dataset.font = TYPE_PREFS.family;
  els.fontVal.textContent = TYPE_PREFS.font;
  els.widthSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.w === TYPE_PREFS.col));
  els.fontSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.f === TYPE_PREFS.family));
  localStorage.setItem('leitura:fonte', String(TYPE_PREFS.font));
  localStorage.setItem('leitura:coluna', TYPE_PREFS.col);
  localStorage.setItem('leitura:familia', TYPE_PREFS.family);
}

function changeFont(d) {
  TYPE_PREFS.font = Math.min(34, Math.max(13, TYPE_PREFS.font + d));
  applyTypePrefs();
}

/* ================= Anotações ================= */
function noteKey(it) {
  const p = it.progress || {};
  if (it.type === 'audio') return 't' + ((p.track || 0) + 1);
  if (it.type === 'text') return 'p' + (Math.round((p.page || 0) / 10) * 10);
  if (it.type === 'pdf') return 'p' + (p.page || 1);
  return 'p' + ((p.page || 0) + 1);
}

function posLabel(it, key) {
  const n = key.slice(1);
  if (key[0] === 't') return 'Faixa ' + n;
  if (it.type === 'text') return n + '% da leitura';
  if (it.type === 'epub') return 'Parte ' + n;
  return 'Página ' + n;
}

function hasNote(it, key) { return !!(it.notes && (it.notes[key] || '').trim()); }

let noteShownKey = null;
let hlPosKey = null;

function flushNote(key) {
  if (!currentItem || key === null) return;
  const text = els.notesText.value;
  currentItem.notes = currentItem.notes || {};
  if (text.trim()) currentItem.notes[key] = text;
  else delete currentItem.notes[key];
  DB.put(currentItem).catch(() => {});
}

function refreshNotes() {
  if (!currentItem) return;
  const key = noteKey(currentItem);
  els.btnNotes.classList.toggle('has-note', hasNote(currentItem, key));
  if (hlPosKey !== key) {
    hlPosKey = key;
    applyHighlights();
    if (speaking) setSpeaking(false);
    if (!els.findBar.hidden && findTerm) findFlow(findTerm, 0);
  }
  if (els.notesPanel.hidden) { noteShownKey = null; return; }
  if (key !== noteShownKey) {
    flushNote(noteShownKey);
    noteShownKey = key;
    els.notesText.value = (currentItem.notes || {})[key] || '';
  }
  els.notesPos.textContent = posLabel(currentItem, key) + ' · ' + currentItem.title;
  renderNotesList();
  renderHighlights();
}

function renderNotesList() {
  const notes = currentItem.notes || {};
  const keys = Object.keys(notes).filter(k => (notes[k] || '').trim());
  if (!keys.length) {
    els.notesList.innerHTML = '<p class="notes-empty">Nenhuma anotação neste livro.</p>';
    return;
  }
  keys.sort((a, b) => naturalCompare(a, b));
  els.notesList.innerHTML = keys.map(k => `
    <button class="note-item" data-k="${k}">
      <span class="np">${posLabel(currentItem, k)}</span>
      <span class="nt">${escapeHtml(notes[k])}</span>
    </button>`).join('');
  els.notesList.querySelectorAll('.note-item').forEach(b => {
    b.onclick = () => {
      if (currentApi && currentApi.goTo) currentApi.goTo(parseInt(b.dataset.k.slice(1), 10) || 0);
      setTimeout(refreshNotes, 400);
    };
  });
}

let noteTimer = null;
function saveNote() {
  if (!currentItem || noteShownKey === null) return;
  flushNote(noteShownKey);
  els.btnNotes.classList.toggle('has-note', hasNote(currentItem, noteKey(currentItem)));
  renderNotesList();
}

function toggleNotes(force) {
  const open = force !== undefined ? force : els.notesPanel.hidden;
  if (!open && !els.notesPanel.hidden) {
    flushNote(noteShownKey);
    noteShownKey = null;
  }
  els.notesPanel.hidden = !open;
  els.typePanel.hidden = true;
  if (open) { refreshNotes(); els.notesText.focus(); }
}

function toggleType() {
  const open = els.typePanel.hidden;
  els.typePanel.hidden = !open;
  els.notesPanel.hidden = true;
  if (open) renderVozPop();
}

document.addEventListener('click', (e) => {
  if (els.typePanel.hidden) return;
  if (e.target.closest('#typePanel') || e.target.closest('#btnType')) return;
  els.typePanel.hidden = true;
});

/* ================= Destaques ================= */
let hlSel = null;
let hlLastApply = 0;

function hlArr(key) {
  const all = (currentItem && currentItem.highlights) || {};
  return all[key] || [];
}

function findRange(root, text) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let p = n.parentNode;
      while (p && p !== root) {
        if (p.tagName === 'MARK') return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let full = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    nodes.push({ n, start: full.length });
    full += n.nodeValue;
  }
  const idx = full.indexOf(text);
  if (idx < 0) return null;
  const end = idx + text.length;
  let sN = null, sO = 0, eN = null, eO = 0;
  for (const it of nodes) {
    const len = it.n.nodeValue.length;
    if (!sN && idx >= it.start && idx < it.start + len) { sN = it.n; sO = idx - it.start; }
    if (end > it.start && end <= it.start + len) { eN = it.n; eO = end - it.start; break; }
  }
  if (!sN || !eN) return null;
  const r = document.createRange();
  r.setStart(sN, sO);
  r.setEnd(eN, eO);
  return r;
}

function clearHighlights(root) {
  root.querySelectorAll('mark.hl').forEach(m => {
    const p = m.parentNode;
    if (!p) return;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  });
}

function applyHighlights() {
  const root = els.readerBody;
  if (!currentItem || !root || !root.firstChild) return;
  hlLastApply = Date.now();
  clearHighlights(root);
  const key = noteKey(currentItem);
  for (const h of hlArr(key)) {
    const range = findRange(root, h.text);
    if (!range) continue;
    try {
      const mark = document.createElement('mark');
      mark.className = 'hl';
      mark.dataset.c = h.color || 'y';
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch (e) { /* seleção não aplicável */ }
  }
}

function saveHighlight(text, color) {
  if (!currentItem) return;
  const key = noteKey(currentItem);
  currentItem.highlights = currentItem.highlights || {};
  const arr = currentItem.highlights[key] = currentItem.highlights[key] || [];
  if (!arr.some(h => h.text === text)) arr.push({ text, color: color || 'y', at: Date.now() });
  DB.put(currentItem).catch(() => {});
  applyHighlights();
  renderHighlights();
}

function removeHighlightAt(key, text) {
  if (!currentItem || !currentItem.highlights || !currentItem.highlights[key]) return;
  currentItem.highlights[key] = currentItem.highlights[key].filter(h => h.text !== text);
  if (!currentItem.highlights[key].length) delete currentItem.highlights[key];
  DB.put(currentItem).catch(() => {});
  applyHighlights();
  renderHighlights();
}

function renderHighlights() {
  if (!currentItem || !els.hlList) return;
  const all = currentItem.highlights || {};
  const keys = Object.keys(all).filter(k => (all[k] || []).length);
  const rows = [];
  keys.forEach(k => all[k].forEach(h => rows.push({ k, h })));
  rows.sort((a, b) => (a.h.at || 0) - (b.h.at || 0));

  els.hlHead.hidden = !rows.length;
  els.hlList.hidden = !rows.length;
  if (!rows.length) { els.hlList.innerHTML = ''; return; }

  els.hlList.innerHTML = rows.map(({ k, h }) => `
    <div class="hl-item" data-k="${k}" data-t="${escapeHtml(h.text)}">
      <mark class="hl" data-c="${h.color || 'y'}">${escapeHtml(h.text.length > 100 ? h.text.slice(0, 100) + '…' : h.text)}</mark>
      <div class="hl-meta">
        <span>${posLabel(currentItem, k)}</span>
        <button class="hl-del" title="Remover destaque">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`).join('');

  els.hlList.querySelectorAll('.hl-del').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const item = e.target.closest('.hl-item');
    removeHighlightAt(item.dataset.k, item.dataset.t);
  });
  els.hlList.querySelectorAll('.hl-item').forEach(el => el.onclick = () => {
    const k = el.dataset.k;
    if (currentApi && currentApi.goTo) currentApi.goTo(parseInt(k.slice(1), 10) || 0);
    setTimeout(() => { applyHighlights(); renderHighlights(); }, 500);
  });
}

function showHlPop(rect, text) {
  els.hlPop.hidden = false;
  const w = els.hlPop.offsetWidth, h = els.hlPop.offsetHeight;
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  let top = rect.top - h - 10;
  if (top < 56) top = Math.min(rect.bottom + 10, window.innerHeight - h - 8);
  els.hlPop.style.left = left + 'px';
  els.hlPop.style.top = top + 'px';
  hlSel = text;
  els.hlRemove.hidden = !hlArr(noteKey(currentItem)).some(h => h.text === text);
}

document.addEventListener('mouseup', (e) => {
  if (els.reader.hidden) return;
  if (e.target instanceof Element && e.target.closest('#hlPop')) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const text = sel.toString().trim();
  if (text.length < 3) { els.hlPop.hidden = true; return; }
  const range = sel.getRangeAt(0);
  if (!els.readerBody.contains(range.commonAncestorContainer)) { els.hlPop.hidden = true; return; }
  showHlPop(range.getBoundingClientRect(), text);
});

els.hlPop.querySelectorAll('.hl-c').forEach(b => b.onclick = () => {
  if (!hlSel || !currentItem) return;
  saveHighlight(hlSel, b.dataset.c);
  els.hlPop.hidden = true;
  hlSel = null;
  window.getSelection().removeAllRanges();
});
els.hlRemove.onclick = () => {
  if (hlSel) removeHighlightAt(noteKey(currentItem), hlSel);
  els.hlPop.hidden = true;
  hlSel = null;
};
document.addEventListener('scroll', () => { els.hlPop.hidden = true; }, true);

const hlObserver = new MutationObserver(() => {
  if (!currentItem || !currentItem.highlights) return;
  if (Date.now() - hlLastApply < 250) return;
  applyHighlights();
  renderHighlights();
});
hlObserver.observe(els.readerBody, { childList: true, subtree: true });

/* ================= Busca no livro ================= */
let findTerm = '';
let findHits = [];
let findIdx = -1;

function flowText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let full = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    nodes.push({ n, start: full.length });
    full += n.nodeValue;
  }
  return { nodes, full };
}

function clearFindMarks(root) {
  (root || els.readerBody).querySelectorAll('mark.find-hit').forEach(m => {
    const p = m.parentNode;
    if (!p) return;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  });
}

function rangeForOffsets(nodes, s, e) {
  let sN = null, sO = 0, eN = null, eO = 0;
  for (const it of nodes) {
    const len = it.n.nodeValue.length;
    if (!sN && s >= it.start && s < it.start + len) { sN = it.n; sO = s - it.start; }
    if (e > it.start && e <= it.start + len) { eN = it.n; eO = e - it.start; break; }
  }
  if (!sN || !eN) return null;
  const r = document.createRange();
  r.setStart(sN, sO);
  r.setEnd(eN, eO);
  return r;
}

function findFlow(term, dir) {
  const root = els.readerBody;
  if (!root.firstChild) return;
  findTerm = term;
  clearFindMarks(root);
  const { nodes, full } = flowText(root);
  const t = term.toLowerCase();
  const low = full.toLowerCase();
  findHits = [];
  let i = low.indexOf(t);
  while (i !== -1) { findHits.push(i); i = low.indexOf(t, i + Math.max(1, t.length)); }

  if (!findHits.length) { findIdx = -1; els.findCount.textContent = '0/0'; return; }
  findIdx = (dir === 0) ? Math.min(findIdx < 0 ? 0 : findIdx, findHits.length - 1)
    : (findIdx < 0 ? 0 : (findIdx + dir + findHits.length) % findHits.length);

  for (let k = findHits.length - 1; k >= 0; k--) {
    const s = findHits[k];
    const range = rangeForOffsets(nodes, s, s + term.length);
    if (!range) continue;
    try {
      const mark = document.createElement('mark');
      mark.className = 'find-hit' + (k === findIdx ? ' find-cur' : '');
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch (e) { /* ignora */ }
  }
  const cur = root.querySelector('mark.find-cur');
  if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  els.findCount.textContent = (findIdx + 1) + '/' + findHits.length;
}

async function findCurrent(dir) {
  const term = els.findInput.value.trim();
  if (!term) { clearFindMarks(); findIdx = -1; els.findCount.textContent = '0/0'; return; }
  if (currentItem && (currentItem.type === 'epub' || currentItem.type === 'text')) {
    findFlow(term, dir);
    return;
  }
  if (currentApi && currentApi.find) {
    const res = await currentApi.find(term, dir);
    if (res) els.findCount.textContent = res.label;
    else els.findCount.textContent = '0/0';
  }
}

function openFind() {
  els.findBar.hidden = false;
  els.notesPanel.hidden = true;
  els.typePanel.hidden = true;
  els.findInput.focus();
  els.findInput.select();
}

function closeFind() {
  els.findBar.hidden = true;
  clearFindMarks();
  findTerm = '';
  findHits = [];
  findIdx = -1;
}

els.btnFind.onclick = openFind;
els.findClose.onclick = closeFind;
els.findNext.onclick = () => findCurrent(1);
els.findPrev.onclick = () => findCurrent(-1);
els.findInput.oninput = () => { findIdx = -1; findCurrent(0); };
els.findInput.onkeydown = (e) => {
  if (e.key === 'Enter') { e.preventDefault(); findCurrent(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
};

/* ================= Leitura em voz alta ================= */
let speaking = false;
let vozWatchdog = null;
const VOZ_SEL = 'leitura:voz';
const VOZ_VEL = 'leitura:vozvel';
const VOZ_PITCH = 'leitura:vozpitch';
const VOZ_VOL = 'leitura:vozvol';
const VOZ_NOITE = 'leitura:voznoite';

/* Pontua as vozes: pt-BR neural/natural primeiro (bem menos robótica) */
function listVoices() {
  let all = [];
  try { all = window.speechSynthesis.getVoices() || []; } catch (e) { return []; }
  const score = (v) => {
    let s = 0;
    const nome = (v.name || '').toLowerCase();
    if (/pt[-_]BR/i.test(v.lang)) s += 100;
    else if (/^pt/i.test(v.lang)) s += 60;
    if (/natural|neural/.test(nome)) s += 60;
    if (/daniel|francisca/.test(nome)) s += 40;
    if (/google.*portugu/.test(nome)) s += 35;
    if (/maria/.test(nome)) s += 25;
    if (/portugu/.test(nome)) s += 15;
    if (/desktop/.test(nome)) s += 5;          // vozes SAPI antigas (mais robóticas)
    return s;
  };
  return all.slice().sort((a, b) => score(b) - score(a));
}

function vozEscolhida() {
  const lista = listVoices();
  const salva = localStorage.getItem(VOZ_SEL);
  if (salva) {
    const v = lista.find(x => x.name === salva);
    if (v) return v;
  }
  return lista.find(v => /pt[-_]BR/i.test(v.lang)) || lista[0] || null;
}

function vozVel() {
  const v = parseFloat(localStorage.getItem(VOZ_VEL));
  return Number.isFinite(v) ? v : 1;
}

function vozPitch() {
  const v = parseFloat(localStorage.getItem(VOZ_PITCH));
  return Number.isFinite(v) ? v : 1;
}

function vozVol() {
  const v = parseFloat(localStorage.getItem(VOZ_VOL));
  return Number.isFinite(v) ? v : 1;
}

function fmtNum(v) {
  return (Math.round(v * 100) / 100).toString().replace('.', ',');
}

function tomPalavra(v) {
  if (v <= 0.8) return 'bem grave';
  if (v < 0.97) return 'grave';
  if (v <= 1.03) return 'normal';
  if (v <= 1.2) return 'agudo';
  return 'bem agudo';
}

/* ---------- Vozes naturais pt-BR: Kokoro + Piper (servidor local via Python) ---------- */
const VOZES_KOKORO = [
  ['pf_dora', 'Dora'], ['pm_alex', 'Alex'], ['pm_santa', 'Santa']
];
const VOZES_PIPER = [
  ['faber', 'Faber'], ['jeff', 'Jeff'], ['cadu', 'Cadu'], ['edresson', 'Edresson']
];
let vozesAudio = VOZES_KOKORO.map(([id]) => 'kokoro:' + id)
  .concat(VOZES_PIPER.map(([id]) => 'piper:' + id));
let kokoroPronto = false;
let kokoroFalhou = false;
let kokoroAbort = null;
let kokoroFonte = null;
let kokoroLoop = 0;
let audioCtx = null;

function nomeAudio(val) {
  const partes = String(val).split(':');
  const lista = partes[0] === 'piper' ? VOZES_PIPER : VOZES_KOKORO;
  const hit = lista.find(x => x[0] === partes[1]);
  return hit ? hit[1] : (partes[1] || val);
}

function ehAudio(val) {
  return val.indexOf('kokoro:') === 0 || val.indexOf('piper:') === 0;
}

/* Modo soneca: voz suave e abafada (grave + volume baixo + filtro) para dormir */
function noiteVoz() {
  return localStorage.getItem(VOZ_NOITE) === '1';
}

function checarStatusVoz() {
  return fetch('/api/voz/status')
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      const pronto = !!(j && j.pronto);
      if (j && Array.isArray(j.vozes) && j.vozes.length) vozesAudio = j.vozes;
      if (pronto !== kokoroPronto) {
        kokoroPronto = pronto;
        if (!els.typePanel.hidden) renderVozPop();
        if (!speaking) els.btnSpeak.title = tituloSpeak();
      }
      return pronto;
    })
    .catch(() => false);
}
checarStatusVoz();

/* voz efetiva escolhida: valor 'kokoro:xxx'/'piper:xxx' ou nome da voz do sistema ('' = padrão) */
function vozSel() {
  const salva = localStorage.getItem(VOZ_SEL);
  if (salva) return salva;
  return (kokoroPronto && !kokoroFalhou) ? 'kokoro:pf_dora' : '';
}

function vozAudioAtual() {
  if (kokoroFalhou) return null;
  const v = vozSel();
  return ehAudio(v) ? v : null;
}

function ctxAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function esperarVoices() {
  return new Promise(res => {
    try {
      if (window.speechSynthesis.getVoices().length) return res();
    } catch (e) { return res(); }
    let fim = false;
    const acabou = () => { if (!fim) { fim = true; res(); } };
    window.speechSynthesis.addEventListener('voiceschanged', acabou, { once: true });
    setTimeout(acabou, 2500);
  });
}

/* quebra em pedaços curtos: evita o corte de ~15s do Chrome e melhora o ritmo */
function dividirTexto(s, max) {
  max = max || 140;
  const partes = [];
  let resto = s;
  while (resto.length > max) {
    let corte = -1;
    for (const sep of ['. ', '? ', '! ', '; ', ': ', ', ', ' ']) {
      const i = resto.lastIndexOf(sep, max);
      if (i > 30) { corte = i + sep.length; break; }
    }
    if (corte < 0) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte);
  }
  if (resto.trim()) partes.push(resto.trim());
  return partes;
}

function tituloSpeak() {
  const aud = vozAudioAtual();
  const voz = vozEscolhida();
  const rot = aud ? (aud.indexOf('piper:') === 0 ? 'Piper · ' : 'Kokoro · ') + nomeAudio(aud) : '';
  return 'Ler em voz alta' + (rot ? ' (' + rot + ')' : voz ? ' (' + voz.name + ')' : '');
}

function setSpeaking(v) {
  speaking = v;
  els.btnSpeak.classList.toggle('on', v);
  els.btnSpeak.title = v ? 'Parar leitura' : tituloSpeak();
  if (v) {
    clearInterval(vozWatchdog);
    /* trava de segurança: alguns navegadores suspendem a voz em silêncio */
    vozWatchdog = setInterval(() => {
      if (speaking) { try { window.speechSynthesis.resume(); } catch (e) {} }
    }, 8000);
  } else {
    clearInterval(vozWatchdog);
    vozWatchdog = null;
    kokoroLoop++;                                 /* invalida loops de leitura por áudio */
    if (kokoroAbort) { try { kokoroAbort.abort(); } catch (e) {} kokoroAbort = null; }
    if (kokoroFonte) { try { kokoroFonte.stop(); } catch (e) {} kokoroFonte = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

function coletarPartes(maxTam) {
  const walker = document.createTreeWalker(els.readerBody, NodeFilter.SHOW_TEXT);
  const nos = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement && /^(SCRIPT|STYLE|CODE|PRE)$/i.test(n.parentElement.tagName)) continue;
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (t.length > 1) nos.push(t);
  }
  return nos.length ? nos.flatMap(t => dividirTexto(t, maxTam)) : null;
}

/* Leitura com voz neural: pede um WAV por trecho ao servidor local e toca via WebAudio */
async function lerComKokoro(voz, partes) {
  const meuId = ++kokoroLoop;
  const ac = new AbortController();
  kokoroAbort = ac;
  setSpeaking(true);

  const tocar = async (buf) => {
    try {
      const ctx = ctxAudio();
      const audio = await ctx.decodeAudioData(buf);
      if (!speaking || meuId !== kokoroLoop) return false;
      const noite = noiteVoz();
      const fonte = ctx.createBufferSource();
      fonte.buffer = audio;
      /* Tom: -100 cents extras no modo soneca (mais grave e lento) */
      fonte.detune.value = Math.round((vozPitch() - 1) * 1200) - (noite ? 100 : 0);
      const ganho = ctx.createGain();
      ganho.gain.value = vozVol() * (noite ? 0.75 : 1);          /* Volume */
      if (noite) {
        /* soneca: filtra os agudos -> voz "abafada", macia como um sussurro */
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 1400;
        filtro.Q.value = 0.7;
        fonte.connect(filtro).connect(ganho);
      } else {
        fonte.connect(ganho);
      }
      ganho.connect(ctx.destination);
      kokoroFonte = fonte;
      return await new Promise(res => {
        fonte.onended = () => { if (kokoroFonte === fonte) kokoroFonte = null; res(true); };
        fonte.start();
      });
    } catch (e) { return false; }
  };

  let idx = 0;
  const proximaBusca = () => {
    if (idx >= partes.length) return null;
    const parte = partes[idx++];
    const p = fetch('/api/voz?texto=' + encodeURIComponent(parte) +
      '&voz=' + encodeURIComponent(voz) + '&vel=' + vozVel(), { signal: ac.signal })
      .then(resp => { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.arrayBuffer(); });
    p.catch(() => {});                 /* evita rejeição não tratada se pararmos no meio */
    return p;
  };

  try {
    let pend = proximaBusca();
    while (speaking && meuId === kokoroLoop) {
      if (!pend) { setSpeaking(false); toast('Leitura concluída.'); return; }
      const buf = await pend;
      /* já busca o próximo trecho enquanto o atual é falado (sem pausa entre frases) */
      pend = (speaking && meuId === kokoroLoop) ? proximaBusca() : null;
      const ok = await tocar(buf);
      if (!ok) return;
    }
  } catch (e) {
    if (meuId !== kokoroLoop || !speaking) return;
    if (e && e.name === 'AbortError') return;
    kokoroFalhou = true;
    toast('Voz neural indisponível — usando a voz do sistema.');
    setSpeaking(false);
    speakReader();                 /* recomeça a página em modo sistema */
  }
}

async function speakReader() {
  if (speaking) { setSpeaking(false); return; }

  const aud = vozAudioAtual();
  const partes = coletarPartes(aud ? 220 : 140);
  if (!partes) { toast('Nada para ler nesta página.'); return; }
  if (aud) { await lerComKokoro(aud, partes); return; }

  if (!('speechSynthesis' in window)) { toast('Leitura em voz alta não suportada neste navegador.'); return; }
  await esperarVoices();
  const v0 = vozEscolhida();
  if (!v0) { toast('Nenhuma voz encontrada no sistema.'); return; }

  let idx = 0;
  setSpeaking(true);
  const falar = () => {
    if (!speaking) return;
    if (idx >= partes.length) { setSpeaking(false); toast('Leitura concluída.'); return; }
    const u = new SpeechSynthesisUtterance(partes[idx++]);
    const voz = vozEscolhida();      /* voz/velocidade valem já na próxima frase */
    if (voz) { try { u.voice = voz; } catch (e) {} u.lang = voz.lang || 'pt-BR'; }
    else { u.lang = 'pt-BR'; }
    const noite = noiteVoz();        /* soneca: mais lenta, grave e suave */
    u.rate = vozVel() * (noite ? 0.9 : 1);
    u.pitch = vozPitch() * (noite ? 0.85 : 1);
    u.volume = vozVol() * (noite ? 0.7 : 1);
    u.onend = () => { if (speaking) setTimeout(falar, 50); };
    u.onerror = (e) => {
      if (!speaking) return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) { setTimeout(falar, 60); return; }
      console.warn('voz:', e && e.error);
      setSpeaking(false);
    };
    window.speechSynthesis.speak(u);
  };
  falar();
}

els.btnSpeak.onclick = speakReader;

/* Preenche o seletor de voz (Kokoro + vozes do sistema) no popover Aa */
function renderVozPop() {
  if (!els.voiceSel) return;
  sincronizaSliderVoz();
  checarStatusVoz();                      /* reaproveita re-render se o status mudou */
  const lista = listVoices();
  const efetiva = vozSel() || (vozEscolhida() ? vozEscolhida().name : '');
  const opcoes = (prefixo, marca) => vozesAudio.filter(v => v.indexOf(prefixo) === 0)
    .map(v => `<option value="${v}"${efetiva === v ? ' selected' : ''}>${marca} · ${nomeAudio(v)}${prefixo === 'kokoro:' ? ' (natural)' : ''}</option>`)
    .join('');
  const grupoSys = lista.length
    ? lista.map(v =>
        `<option value="${escapeHtml(v.name)}"${efetiva === v.name ? ' selected' : ''}>${escapeHtml(v.name)} · ${escapeHtml(v.lang || '')}</option>`
      ).join('')
    : '<option value="" disabled>(carregando vozes do sistema…)</option>';
  const temKokoro = vozesAudio.some(v => v.indexOf('kokoro:') === 0);
  const temPiper = vozesAudio.some(v => v.indexOf('piper:') === 0);
  els.voiceSel.innerHTML =
    (temKokoro ? `<optgroup label="Kokoro · voz natural pt-BR">${opcoes('kokoro:', 'Kokoro')}</optgroup>` : '') +
    (temPiper ? `<optgroup label="Piper · vozes brasileiras">${opcoes('piper:', 'Piper')}</optgroup>` : '') +
    `<optgroup label="Vozes do sistema">${grupoSys}</optgroup>`;
  if (!lista.length) esperarVoices().then(() => { if (!els.typePanel.hidden) renderVozPop(); });
}

/* Preenche os 3 deslizadores (velocidade, tom, volume) com os valores salvos */
function sincronizaSliderVoz() {
  els.velRange.value = vozVel();
  els.pitchRange.value = vozPitch();
  els.volRange.value = vozVol();
  if (els.noiteVoice) els.noiteVoice.checked = noiteVoz();
  atualizaRotulosVoz();
}

function atualizaRotulosVoz() {
  els.velVal.textContent = fmtNum(parseFloat(els.velRange.value)) + 'x';
  els.pitchVal.textContent = tomPalavra(parseFloat(els.pitchRange.value));
  els.volVal.textContent = Math.round(parseFloat(els.volRange.value) * 100) + '%';
  [els.velRange, els.pitchRange, els.volRange].forEach(el => {
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 1;
    const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
    el.style.setProperty('--fill', pct.toFixed(1) + '%');
  });
}

els.velRange.oninput = () => {
  localStorage.setItem(VOZ_VEL, els.velRange.value);
  atualizaRotulosVoz();
};
els.pitchRange.oninput = () => {
  localStorage.setItem(VOZ_PITCH, els.pitchRange.value);
  atualizaRotulosVoz();
};
els.volRange.oninput = () => {
  localStorage.setItem(VOZ_VOL, els.volRange.value);
  atualizaRotulosVoz();
};

els.voiceSel.onchange = () => {
  localStorage.setItem(VOZ_SEL, els.voiceSel.value);
  if (ehAudio(els.voiceSel.value)) kokoroFalhou = false;
  setSpeaking(speaking);
  toast('Voz: ' + els.voiceSel.options[els.voiceSel.selectedIndex].text);
};

els.noiteVoice.onchange = () => {
  localStorage.setItem(VOZ_NOITE, els.noiteVoice.checked ? '1' : '0');
  toast(els.noiteVoice.checked
    ? 'Modo soneca ligado — voz suave, grave e abafada.'
    : 'Modo soneca desligado.');
};

/* ================= Exportar anotações (Markdown) ================= */
function slugify(s) {
  return (s || 'livro').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'livro';
}

function exportNotes() {
  if (!currentItem) return;
  const notes = currentItem.notes || {};
  const highs = currentItem.highlights || {};
  const keys = [
    ...Object.keys(notes).filter(k => (notes[k] || '').trim()),
    ...Object.keys(highs).filter(k => (highs[k] || []).length)
  ].filter((k, i, a) => a.indexOf(k) === i).sort(naturalCompare);

  if (!keys.length) { toast('Nenhuma anotação ou destaque neste livro.'); return; }

  let md = `# ${currentItem.title}\n\n`;
  if (currentItem.author) md += `*${currentItem.author}*\n\n`;
  md += `Anotações exportadas em ${new Date().toLocaleString('pt-BR')} — Leitura (biblioteca local)\n\n---\n\n`;

  for (const k of keys) {
    md += `## ${posLabel(currentItem, k)}\n\n`;
    const n = (notes[k] || '').trim();
    if (n) md += n + '\n\n';
    (highs[k] || []).forEach(h => {
      const cores = { y: 'amarelo', g: 'verde', p: 'rosa', b: 'azul' };
      md += `> **Destaque (${cores[h.color] || h.color || 'amarelo'})** — “${h.text}”\n\n`;
    });
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slugify(currentItem.title) + '-anotacoes.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Anotações exportadas (.md).');
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#btnExportNotes')) exportNotes();
});

/* ================= Exportar / importar biblioteca ================= */
async function buildBackup() {
  const recs = await DB.all();
  if (!recs.length) return null;
  const zip = new JSZip();
  const list = [];
  for (const r of recs) {
    const e = {
      type: r.type, title: r.title, ext: r.ext || '', size: r.size || 0,
      rtl: !!r.rtl, favorite: !!r.favorite, addedAt: r.addedAt,
      cover: r.cover || '', progress: r.progress || null, notes: r.notes || null
    };
    if (r.blob) { const p = `files/${r.id}.bin`; zip.file(p, r.blob); e.blob = p; }
    if (Array.isArray(r.pages)) {
      e.pages = [];
      for (let i = 0; i < r.pages.length; i++) {
        const p = `files/${r.id}_${i}.bin`;
        zip.file(p, r.pages[i].blob);
        e.pages.push({ name: r.pages[i].name, file: p });
      }
    }
    list.push(e);
  }
  zip.file('manifest.json', JSON.stringify({ app: 'leitura', v: 1, exportedAt: Date.now(), items: list }));
  return zip.generateAsync({ type: 'blob' });
}

async function exportLibrary() {
  try {
    toast('Gerando arquivo de backup...');
    const blob = await buildBackup();
    if (!blob) { toast('Nada para exportar ainda.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'biblioteca-leitura-' + todayKey() + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Biblioteca exportada (' + formatBytes(blob.size) + ').', 4000);
  } catch (e) {
    console.error(e);
    toast('Erro ao exportar: ' + e.message, 5000);
  }
}

async function importBackup(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const mf = zip.file('manifest.json');
    if (!mf) { toast('Arquivo inválido: não é um backup do Leitura.'); return; }
    const data = JSON.parse(await mf.async('text'));
    if (!data || !Array.isArray(data.items)) { toast('Arquivo de backup inválido.'); return; }

    const bar = makeProgressBar();
    let ok = 0, total = data.items.length;
    for (const e of data.items) {
      const rec = {
        type: e.type, title: e.title || 'Sem título', ext: e.ext || '', size: e.size || 0,
        rtl: !!e.rtl, favorite: !!e.favorite, addedAt: e.addedAt || Date.now(),
        cover: e.cover || placeholderCover(e.title || 'Livro', LABELS[e.type] || 'Arquivo'),
        progress: e.progress || null, notes: e.notes || null,
        blob: null, pages: null
      };
      if (e.blob && zip.file(e.blob)) rec.blob = await zip.file(e.blob).async('blob');
      if (Array.isArray(e.pages)) {
        rec.pages = [];
        for (const p of e.pages) {
          if (p.file && zip.file(p.file)) rec.pages.push({ name: p.name || 'pagina', blob: await zip.file(p.file).async('blob') });
        }
      }
      if (rec.blob || (rec.pages && rec.pages.length)) { await DB.add(rec); ok++; }
      bar.set(ok / Math.max(1, total));
    }
    bar.done();
    items = await DB.all();
    render();
    toast(ok + ' item(ns) restaurado(s).', 4000);
  } catch (e) {
    console.error(e);
    toast('Erro ao importar backup: ' + e.message, 5000);
  }
}

/* ================= Navegação ================= */
function setView(name) {
  view = name;
  els.views.forEach(v => v.classList.toggle('active', v.dataset.view === name));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo(0, 0);
  render();
}

function render() {
  if (view === 'home') renderHome();
  else if (view === 'biblioteca') renderLibrary();
  else if (view === 'adicionar') renderAdicionar();
  else if (view === 'lendo') renderLendo();
  else if (view === 'metas') renderMetas();
  else if (view === 'stats') renderStats();
  else if (view === 'favoritos') renderFavoritos();
  else if (view === 'compartilhada') renderShared();
}

function renderAdicionar() {
  const el = $('#addCount');
  if (el) el.textContent = items.length === 1 ? '1 título na biblioteca' : `${items.length} títulos na biblioteca`;
}

/* ================= Cards ================= */
function coverHtml(it) {
  return `<img class="cover" src="${it.cover}" alt="" loading="lazy">`;
}

function makeCard(it) {
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.dataset.id = it.id;
  const ratio = progressRatio(it);
  const rating = ratingOf(it);
  card.innerHTML = `
    <div class="card-cover">
      ${coverHtml(it)}
      <span class="card-badge">${typeLabel(it)}</span>
      <button class="card-edit" title="Editar" aria-label="Editar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3z"/></svg>
      </button>
      <button class="card-fav ${isFav(it) ? 'on' : ''}" title="Favoritar" aria-label="Favoritar">
        <svg viewBox="0 0 24 24"><path d="M12 19.5s-6.4-3.9-6.4-8.3A3.6 3.6 0 0 1 12 8.9a3.6 3.6 0 0 1 6.4 2.3c0 4.4-6.4 8.3-6.4 8.3z"/></svg>
      </button>
      ${ratio > 0 ? `<span class="card-bar"><i style="width:${ratio * 100}%"></i></span>` : ''}
    </div>
    <h3 class="card-title">${escapeHtml(it.title)}</h3>
    ${it.author ? `<div class="card-author">${escapeHtml(it.author)}</div>` : ''}
    <div class="card-foot">
      <span class="card-sub">${rating ? `<span class="card-stars">${starsHtml(rating)}</span> · ` : ''}${progressLabel(it)}</span>
      <button class="card-remove" title="Remover">Remover</button>
    </div>`;

  card.querySelector('.card-fav').onclick = (e) => { e.stopPropagation(); toggleFav(it); };
  card.querySelector('.card-edit').onclick = (e) => { e.stopPropagation(); openEditModal(it); };
  card.querySelector('.card-remove').onclick = (e) => { e.stopPropagation(); removeItem(it); };
  card.onclick = () => openItem(it);
  card.onkeydown = (e) => { if (e.key === 'Enter') openItem(it); };
  return card;
}

function fillGrid(el, list) {
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach(it => frag.appendChild(makeCard(it)));
  el.appendChild(frag);
}

async function toggleFav(it) {
  it.favorite = !it.favorite;
  await DB.put(it).catch(() => {});
  render();
  toast(it.favorite ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
}

async function removeItem(it) {
  if (!confirm(`Remover "${it.title}" da biblioteca?`)) return;
  await DB.remove(it.id);
  items = items.filter(x => x.id !== it.id);
  render();
  toast('Removido da biblioteca.');
}

/* ================= Início ================= */
function renderHome() {
  const h = new Date().getHours();
  $('#greeting').textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const reading = items.filter(isReading).sort((a, b) => b.addedAt - a.addedAt);
  const hero = reading[0];
  $('#greetingSub').textContent = hero
    ? 'Continue sua leitura de onde parou.'
    : items.length
      ? 'Escolha algo da sua biblioteca para começar.'
      : 'Adicione seus livros para começar a leitura.';

  /* Hero */
  if (hero) {
    const pct = Math.round(progressRatio(hero) * 100);
    els.hero.className = 'hero';
    els.hero.innerHTML = `
      <div class="hero-cover">${coverHtml(hero)}</div>
      <div class="hero-body">
        <span class="hero-label">Continue lendo</span>
        <h2 class="hero-title">${escapeHtml(hero.title)}</h2>
        <p class="hero-meta">${typeLabel(hero)} · ${formatBytes(hero.size)} · ${progressLabel(hero)}</p>
        <div class="hero-progress">
          <span class="bar"><i style="width:${pct}%"></i></span>
          <span class="pct">${pct}%</span>
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" id="heroContinue">Continuar lendo</button>
          <button class="btn" id="heroLibrary">Ver biblioteca</button>
        </div>
      </div>`;
    $('#heroContinue').onclick = () => openItem(hero);
    $('#heroLibrary').onclick = () => setView('biblioteca');
  } else {
    els.hero.className = 'hero hero-empty';
    els.hero.innerHTML = `
      <div class="hero-body">
        <span class="hero-label">${items.length ? 'Biblioteca' : 'Bem-vindo'}</span>
        <h2>${items.length ? 'Nada em andamento agora' : 'Comece sua biblioteca local'}</h2>
        <p class="hero-meta">${items.length
          ? 'Abra um livro, mangá ou artigo para retomar de onde parou.'
          : 'Arraste PDFs, EPUBs, imagens, ZIPs de páginas, textos e áudios. Tudo fica só no seu aparelho.'}</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary" id="heroAdd">Adicionar arquivos</button>
        ${items.length ? '<button class="btn" id="heroLibrary">Ver biblioteca</button>' : ''}
      </div>`;
    const a = $('#heroAdd'); if (a) a.onclick = () => setView('adicionar');
    const l = $('#heroLibrary'); if (l) l.onclick = () => setView('biblioteca');
  }

  /* Lendo agora */
  els.lendoRow.innerHTML = '';
  const rowList = reading.slice(0, 8);
  if (!rowList.length) {
    els.lendoRow.innerHTML = '<p class="muted">Nenhum item em andamento no momento.</p>';
  } else {
    const frag = document.createDocumentFragment();
    rowList.forEach(it => frag.appendChild(makeCard(it)));
    els.lendoRow.appendChild(frag);
  }

  /* Cartões da biblioteca */
  const stats = [
    { cls: 'ic-beige', val: items.length, lbl: 'Todos os livros', view: 'biblioteca',
      ic: '<svg viewBox="0 0 24 24"><path d="M5 4h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5zM19 4h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4z"/></svg>' },
    { cls: 'ic-sage', val: items.filter(isDone).length, lbl: 'Lidos', view: 'metas',
      ic: '<svg viewBox="0 0 24 24"><path d="m5.5 12.5 4 4 9-9"/></svg>' },
    { cls: 'ic-blue', val: reading.length, lbl: 'Em andamento', view: 'lendo',
      ic: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M10.2 9.3v5.4l4.4-2.7z"/></svg>' },
    { cls: 'ic-lav', val: items.filter(isFav).length, lbl: 'Favoritos', view: 'favoritos',
      ic: '<svg viewBox="0 0 24 24"><path d="M12 19.5s-6.4-3.9-6.4-8.3A3.6 3.6 0 0 1 12 8.9a3.6 3.6 0 0 1 6.4 2.3c0 4.4-6.4 8.3-6.4 8.3z"/></svg>' }
  ];
  els.statGrid.innerHTML = stats.map(s => `
    <button class="stat-card" data-view="${s.view}">
      <span class="ic ${s.cls}">${s.ic}</span>
      <span><span class="val">${s.val}</span><span class="lbl">${s.lbl}</span></span>
    </button>`).join('');

  renderGoal(els.goalBox, false);
  renderChart(els.actChart, lastDays(7));
  renderReco();
}

function renderGoal(box, big) {
  const meta = getMeta();
  const done = items.filter(isDone).length;
  const pct = Math.min(1, done / meta);
  const C = 2 * Math.PI * (big ? 72 : 54);
  const size = big ? 164 : 126;
  const r = big ? 72 : 54;
  const offset = C * (1 - pct);

  box.innerHTML = `
    <div class="ring" style="width:${size}px;height:${size}px;flex-basis:${size}px">
      <svg class="ring-svg" viewBox="0 0 ${size} ${size}">
        <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${big ? 13 : 11}" fill="none"/>
        <circle class="prog" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${big ? 13 : 11}" fill="none"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
      </svg>
      <span class="ring-center">
        <span class="big">${done}/${meta}</span>
        <span class="small">livros</span>
      </span>
    </div>
    <div class="goal-text">
      <div class="gt-title">Ler ${meta} livros em ${new Date().getFullYear()}</div>
      <p>${done >= meta
        ? 'Meta concluída. Parabéns!'
        : `Faltam <strong>${meta - done}</strong> livros para concluir a meta.`}</p>
      ${big ? '' : '<p>Você está indo bem.</p>'}
    </div>`;
}

function renderChart(box, days) {
  const a = getActivity();
  const vals = days.map(d => a[d.key] || 0);
  const max = Math.max(600, ...vals);
  box.innerHTML = days.map((d, i) => {
    const v = vals[i];
    const h = v > 0 ? Math.max(6, Math.round((v / max) * 100)) : 4;
    return `<div class="col" title="${d.short}: ${fmtHours(v)}">
      <span class="track"><span class="fill ${v ? '' : 'zero'}" style="height:${h}%"></span></span>
      <span class="lbl">${d.label}</span>
    </div>`;
  }).join('');
}

function renderReco() {
  const list = items.filter(it => !it.progress)
    .sort((a, b) => b.addedAt - a.addedAt).slice(0, 4);

  if (!list.length) {
    els.recoList.innerHTML = items.length
      ? '<p class="muted" style="font-size:13.5px">Você já começou tudo por aqui. Adicione novos títulos!</p>'
      : '<p class="muted" style="font-size:13.5px">Adicione livros para receber sugestões da sua biblioteca.</p>';
    return;
  }
  els.recoList.innerHTML = list.map(it => `
    <button class="reco-item" data-id="${it.id}">
      <span class="reco-thumb"><img src="${it.cover}" alt=""></span>
      <span class="reco-body">
        <span class="t">${escapeHtml(it.title)}</span>
        <span class="s">${typeLabel(it)} · ${formatBytes(it.size)}</span>
      </span>
    </button>`).join('');
  els.recoList.querySelectorAll('.reco-item').forEach(b => {
    b.onclick = () => { const it = items.find(x => x.id === +b.dataset.id); if (it) openItem(it); };
  });
}

/* ================= Biblioteca ================= */
function visibleItems() {
  let list = items.filter(it => filter === 'all' || it.type === filter);
  if (shelfFilter !== 'all') list = list.filter(it => inShelf(it, shelfFilter));
  if (tagFilter) list = list.filter(it => (it.tags || []).includes(tagFilter));
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(it =>
      (it.title || '').toLowerCase().includes(q) ||
      (it.author || '').toLowerCase().includes(q) ||
      (it.tags || []).some(t => t.toLowerCase().includes(q)));
  }
  if (sortMode === 'name') list.sort((a, b) => naturalCompare(a.title, b.title));
  else if (sortMode === 'rating') list.sort((a, b) => ratingOf(b) - ratingOf(a) || naturalCompare(a.title, b.title));
  else if (sortMode === 'progress') list.sort((a, b) => progressRatio(b) - progressRatio(a) || b.addedAt - a.addedAt);
  else list.sort((a, b) => b.addedAt - a.addedAt);
  return list;
}

function renderShelfChips() {
  const cols = getCollections();
  const defs = [
    { id: 'all', label: 'Todas as estantes' },
    ...SHELVES.map(s => ({ id: s.id, label: s.label })),
    ...cols.map(c => ({ id: 'col:' + c.id, label: c.name }))
  ];
  els.shelfChips.innerHTML = defs.map(d =>
    `<button class="chip ${shelfFilter === d.id ? 'active' : ''}" data-shelf="${d.id}">${escapeHtml(d.label)}</button>`
  ).join('');

  const tags = allTags();
  if (tags.length) {
    els.tagSel.hidden = false;
    els.tagSel.innerHTML = `<option value="">Todas as tags</option>` +
      tags.map(t => `<option value="${escapeHtml(t)}" ${tagFilter === t ? 'selected' : ''}>#${escapeHtml(t)}</option>`).join('');
  } else {
    els.tagSel.hidden = true;
    tagFilter = '';
  }
}

function renderLibrary() {
  renderShelfChips();
  const list = visibleItems();
  fillGrid(els.grid, list);
  els.empty.hidden = items.length > 0;
  els.libCount.textContent = items.length === 1 ? '1 item' : `${items.length} itens`;
  if (items.length && !list.length) {
    els.empty.hidden = false;
    els.empty.innerHTML = '<p>Nenhum resultado para esta busca ou filtro.</p>';
  } else if (!items.length) {
    els.empty.innerHTML =
      '<p>Sua biblioteca está vazia.</p><p class="muted">Abra a área Adicionar para trazer seus arquivos.</p>';
  }
}

/* ================= Modal: editar título ================= */
let editing = null;
let draft = null;

function openEditModal(it) {
  editing = it;
  draft = {
    cover: it.cover,
    shelf: shelfOf(it),
    collecoes: [...(it.collecoes || [])],
    tags: [...(it.tags || [])],
    rating: ratingOf(it)
  };
  els.mTitle.value = it.title || '';
  els.mAuthor.value = it.author || '';
  els.mCover.src = it.cover || '';
  els.mColNew.value = '';
  els.mTagNew.value = '';
  renderModal();
  els.itemModal.hidden = false;
  setTimeout(() => els.mTitle.focus(), 60);
}

function closeEditModal() {
  els.itemModal.hidden = true;
  editing = null;
  draft = null;
}

function renderModal() {
  if (!draft) return;
  els.mShelf.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.shelf === draft.shelf));

  const cols = getCollections();
  els.mCols.innerHTML = (cols.length
    ? cols.map(c => `<button class="chip-mini ${draft.collecoes.includes(c.id) ? 'active' : ''}" data-col="${c.id}">${escapeHtml(c.name)}</button>`)
    : ['<span class="muted" style="font-size:13px">Nenhuma coleção ainda.</span>']
  ).join('');
  els.mCols.querySelectorAll('[data-col]').forEach(b => b.onclick = () => {
    const id = b.dataset.col;
    const i = draft.collecoes.indexOf(id);
    if (i >= 0) draft.collecoes.splice(i, 1);
    else draft.collecoes.push(id);
    renderModal();
  });

  els.mTags.innerHTML = draft.tags.length
    ? draft.tags.map(t => `<button class="chip-mini active" data-tag="${escapeHtml(t)}">#${escapeHtml(t)} ✕</button>`).join('')
    : '<span class="muted" style="font-size:13px">Sem tags.</span>';
  els.mTags.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => {
    draft.tags = draft.tags.filter(t => t !== b.dataset.tag);
    renderModal();
  });

  els.mStars.innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button class="star-btn ${n <= draft.rating ? 'on' : ''}" data-n="${n}" title="${n} de 5">★</button>`
  ).join('');
  els.mStars.querySelectorAll('.star-btn').forEach(b => b.onclick = () => {
    const n = +b.dataset.n;
    draft.rating = draft.rating === n ? 0 : n;
    renderModal();
  });
}

function saveEditModal() {
  if (!editing || !draft) return;
  const t = els.mTitle.value.trim();
  if (t) editing.title = t;
  editing.author = els.mAuthor.value.trim();
  editing.cover = draft.cover;
  editing.shelf = draft.shelf;
  editing.collecoes = draft.collecoes;
  editing.tags = draft.tags;
  editing.rating = draft.rating;
  DB.put(editing).catch(() => {});
  closeEditModal();
  render();
  toast('Título atualizado.');
}

function renderLendo() {
  const list = items.filter(isReading).sort((a, b) => b.addedAt - a.addedAt);
  fillGrid(els.lendoGrid, list);
  els.lendoEmpty.hidden = list.length > 0;
}

function renderFavoritos() {
  const list = items.filter(isFav).sort((a, b) => naturalCompare(a.title, b.title));
  fillGrid(els.favGrid, list);
  els.favEmpty.hidden = list.length > 0;
}

function renderMetas() {
  els.metaYear.textContent = new Date().getFullYear();
  els.metaInput.value = getMeta();
  renderGoal(els.goalBig, true);

  const done = items.filter(isDone).sort((a, b) => b.addedAt - a.addedAt);
  els.doneCount.textContent = done.length + (done.length === 1 ? ' livro' : ' livros');
  els.doneList.innerHTML = done.length ? '' : '<p class="muted" style="font-size:14px">Nenhum livro concluído ainda.</p>';
  done.forEach(it => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <span class="lico"><svg viewBox="0 0 24 24"><path d="m5.5 12.5 4 4 9-9"/></svg></span>
      <span class="li-body">
        <span class="li-title">${escapeHtml(it.title)}</span>
        <span class="li-sub">${typeLabel(it)} · ${formatBytes(it.size)}</span>
      </span>
      <span class="li-val">100%</span>`;
    row.style.cursor = 'pointer';
    row.onclick = () => openItem(it);
    els.doneList.appendChild(row);
  });
}

function renderStats() {
  const total = items.length;
  const done = items.filter(isDone).length;
  const reading = items.filter(isReading).length;
  const act = getActivity();
  const totalSec = Object.values(act).reduce((s, v) => s + v, 0);
  const week = lastDays(7);
  const weekSec = week.reduce((s, d) => s + (act[d.key] || 0), 0);

  els.kpiGrid.innerHTML = [
    { lbl: 'Livros na biblioteca', val: total, hint: `${items.filter(i => i.type === 'comic').length} mangás/HQs`, ic: '<path d="M5 4h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5zM19 4h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4z"/>' },
    { lbl: 'Concluídos', val: done, hint: `meta de ${getMeta()} no ano`, ic: '<path d="m5.5 12.5 4 4 9-9"/>' },
    { lbl: 'Em andamento', val: reading, hint: 'prontos para continuar', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 9.3v5.4l4.4-2.7z"/>' },
    { lbl: 'Tempo de leitura', val: fmtHours(totalSec), hint: 'registrado neste dispositivo', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>' }
  ].map(k => `
    <div class="kpi">
      <div class="lbl"><svg viewBox="0 0 24 24">${k.ic}</svg>${k.lbl}</div>
      <div class="val">${k.val}</div>
      <div class="hint">${k.hint}</div>
    </div>`).join('');

  els.weekTotal.textContent = fmtHours(weekSec);
  renderChart(els.weekChart, week);

  const avg = weekSec / 7;
  const favs = items.filter(isFav).length;
  const rows = [
    { t: 'Sequência de leitura', s: 'dias seguidos com atividade', v: streak() + (streak() === 1 ? ' dia' : ' dias') },
    { t: 'Média diária (7 dias)', s: 'tempo médio por dia', v: fmtHours(avg) },
    { t: 'Favoritos', s: 'títulos marcados com coração', v: favs },
    { t: 'Não iniciados', s: 'esperando na biblioteca', v: items.filter(i => !i.progress).length }
  ];
  els.summaryList.innerHTML = rows.map(r => `
    <div class="list-item">
      <span class="li-body"><span class="li-title">${r.t}</span><span class="li-sub">${r.s}</span></span>
      <span class="li-val">${r.v}</span>
    </div>`).join('');
}

/* ================= Importação ================= */
function makeProgressBar() {
  const bar = document.createElement('div');
  bar.className = 'import-bar';
  bar.innerHTML = '<i></i>';
  document.body.appendChild(bar);
  return { set: (p) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; }, done: () => setTimeout(() => bar.remove(), 400) };
}

function blobToDataURL(b) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

async function readEpubMeta(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const cFile = zip.file('META-INF/container.xml');
    if (!cFile) return {};
    const container = await cFile.async('text');
    const opfPath = (container.match(/full-path="([^"]+)"/) || [])[1] || '';
    const opfFile = opfPath ? zip.file(opfPath) : null;
    if (!opfFile) return {};
    const opf = await opfFile.async('text');
    const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    const tag = (name) => {
      const m = opf.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    const title = tag('dc:title');
    const author = tag('dc:creator');

    let coverHref = '';
    const mc = opf.match(/<meta[^>]*(?:name="cover"[^>]*content="([^"]+)"|content="([^"]+)"[^>]*name="cover")/i);
    const coverId = mc ? (mc[1] || mc[2]) : '';
    if (coverId) {
      const it = opf.match(new RegExp('<item[^>]*id="' + coverId + '"[^>]*href="([^"]+)"', 'i')) ||
        opf.match(new RegExp('<item[^>]*href="([^"]+)"[^>]*id="' + coverId + '"', 'i'));
      if (it) coverHref = it[1];
    }
    if (!coverHref) {
      const it = opf.match(/<item[^>]*properties="[^"]*cover-image[^"]*"[^>]*href="([^"]+)"/i) ||
        opf.match(/<item[^>]*href="([^"]+)"[^>]*properties="[^"]*cover-image[^"]*"/i);
      if (it) coverHref = it[1];
    }

    let coverBlob = null;
    if (coverHref) {
      const clean = decodeURIComponent(coverHref.replace(/^\.\//, ''));
      const f = zip.file(dir + clean) || zip.file(dir + coverHref) || zip.file(clean);
      if (f) {
        const ext = (clean.split('.').pop() || '').toLowerCase();
        const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'image/png';
        coverBlob = new Blob([await f.async('arraybuffer')], { type: mime });
      }
    }
    return { title, author, coverBlob };
  } catch (e) {
    return {};
  }
}

async function importFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  const bar = makeProgressBar();
  const groups = { pdf: [], epub: [], comic: [], audio: [], text: [], zip: [], unsupported: [] };
  for (const f of files) {
    const t = extOf(f.name) === 'zip' ? 'zip' : detectType(f.name);
    (t ? groups[t] : groups.unsupported).push(f);
  }

  let added = 0;
  const skipped = groups.unsupported.length;
  const total = files.length;
  let done = 0;
  const bump = () => { done++; bar.set(done / total); };

  const albumFrom = async (list, type, title) => {
    if (!list.length) return;
    const pages = [];
    list.sort((a, b) => naturalCompare(a.name, b.name));
    for (const f of list) pages.push({ name: f.name, blob: f });
    const item = buildRecord({
      type, title, pages,
      size: list.reduce((s, f) => s + f.size, 0),
      ext: extOf(list[0].name),
      rtl: type === 'comic' && /manga|manhwa|chap/i.test(title)
    });
    item.cover = await Covers.for(item);
    await DB.add(item);
    added++;
  };

  try {
    for (const f of groups.pdf) {
      const item = buildRecord({ type: 'pdf', title: stripExt(f.name), blob: f, size: f.size, ext: extOf(f.name) });
      item.cover = await Covers.for(item);
      await DB.add(item); added++; bump();
    }
    for (const f of groups.epub) {
      const meta = await readEpubMeta(f);
      const item = buildRecord({
        type: 'epub', title: meta.title || stripExt(f.name), author: meta.author || '',
        blob: f, size: f.size, ext: extOf(f.name)
      });
      item.cover = meta.coverBlob ? await blobToDataURL(meta.coverBlob) : await Covers.for(item);
      await DB.add(item); added++; bump();
    }
    if (groups.comic.length) {
      const folders = {};
      for (const f of groups.comic) {
        const rel = f.webkitRelativePath || '';
        const dir = rel.includes('/') ? rel.split('/')[0] : '';
        (folders[dir || '_loose'] = folders[dir || '_loose'] || []).push(f);
      }
      for (const [dir, list] of Object.entries(folders)) {
        const title = dir === '_loose'
          ? (list.length > 1 ? 'Álbum de imagens' : stripExt(list[0].name))
          : dir;
        await albumFrom(list, 'comic', title);
        bump();
      }
    }
    for (const f of groups.text) {
      const item = buildRecord({ type: 'text', title: stripExt(f.name), blob: f, size: f.size, ext: extOf(f.name) });
      item.cover = await Covers.for(item);
      await DB.add(item); added++; bump();
    }
    if (groups.audio.length) {
      const folders = {};
      for (const f of groups.audio) {
        const rel = f.webkitRelativePath || '';
        const dir = rel.includes('/') ? rel.split('/')[0] : '';
        (folders[dir || '_loose'] = folders[dir || '_loose'] || []).push(f);
      }
      for (const [dir, list] of Object.entries(folders)) {
        const title = dir === '_loose'
          ? (list.length > 1 ? 'Álbum de áudio' : stripExt(list[0].name))
          : dir;
        await albumFrom(list, 'audio', title);
        bump();
      }
    }
    for (const f of groups.zip) {
      await importZip(f, bump);
      added++;
    }
  } catch (e) {
    console.error(e);
    toast('Erro ao importar: ' + e.message, 5000);
  }

  bar.done();
  items = await DB.all();
  setView('biblioteca');
  const parts = [`${added} arquivo(s) adicionado(s)`];
  if (skipped) parts.push(`${skipped} tipo(s) não suportado(s)`);
  toast(parts.join(' · '), 4000);
}

async function importZip(file, bump) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files)
    .filter(f => !f.dir && !f.name.startsWith('__MACOSX'))
    .sort((a, b) => naturalCompare(a.name, b.name));

  const imgs = [], auds = [];
  for (const e of entries) {
    const t = detectType(e.name);
    if (t === 'comic') imgs.push(e);
    else if (t === 'audio') auds.push(e);
    else if (t === 'pdf') {
      const blob = await e.async('blob');
      const item = buildRecord({ type: 'pdf', title: stripExt(e.name), blob, size: blob.size, ext: extOf(e.name) });
      item.cover = await Covers.for(item);
      await DB.add(item);
      if (bump) bump();
    }
  }

  const list = imgs.length ? imgs : auds;
  if (!list.length) { toast('ZIP sem páginas ou áudios reconhecidos.'); return; }

  const type = imgs.length ? 'comic' : 'audio';
  const title = stripExt(file.name);
  const pages = [];
  let size = 0;
  for (const e of list) {
    const blob = await e.async('blob');
    pages.push({ name: e.name.split('/').pop(), blob });
    size += blob.size;
  }
  const item = buildRecord({ type, title, pages, size, rtl: type === 'comic' && /manga|manhwa|chap/i.test(title) });
  item.cover = await Covers.for(item);
  await DB.add(item);
  if (bump) bump();
}

function buildRecord({ type, title, author, blob, pages, size, rtl, ext }) {
  const t = title || 'Sem título';
  return {
    type,
    title: t,
    author: author || '',
    ext: ext || '',
    blob: blob || null,
    pages: pages || null,
    size: size || 0,
    rtl: !!rtl,
    favorite: false,
    addedAt: Date.now(),
    cover: placeholderCover(t, LABELS[type] || 'Arquivo'),
    progress: null,
    notes: null,
    highlights: null,
    tags: [],
    rating: 0,
    shelf: null,
    collecoes: []
  };
}

/* ================= Leitor ================= */
function setReaderMode(mode) {
  els.reader.dataset.mode = mode;
  localStorage.setItem('leitura:modo', mode);
}

/* ================= Calma: progresso fino + barras que somem ================= */
let chromeTimer = null;

function updateReaderProgress(p) {
  const fill = document.getElementById('readerProgressFill');
  if (!fill || !p || !p.total) return;
  const tipo = currentItem ? currentItem.type : '';
  const cur = (tipo === 'comic' || tipo === 'epub') ? p.page + 1 : p.page;
  const pct = Math.min(100, Math.max(0, (cur / p.total) * 100));
  fill.style.width = pct.toFixed(1) + '%';
}

function pokeChrome() {
  if (!els.reader || els.reader.hidden) return;
  els.reader.classList.remove('chrome-hidden');
  clearTimeout(chromeTimer);
  chromeTimer = setTimeout(() => {
    if (els.reader.hidden) return;
    if (!els.notesPanel.hidden || !els.typePanel.hidden || !els.findBar.hidden) return;
    if (document.querySelector('.reader-bar:hover, .reader-footer:hover')) return;
    els.reader.classList.add('chrome-hidden');
  }, 3200);
}

['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'focusin'].forEach(ev =>
  document.addEventListener(ev, pokeChrome, true));

async function openItem(item) {
  currentItem = item;
  els.reader.hidden = false;
  document.body.style.overflow = 'hidden';
  noteShownKey = null;
  hlPosKey = null;
  els.notesPanel.hidden = true;
  els.typePanel.hidden = true;
  els.btnType.hidden = !(item.type === 'epub' || item.type === 'text');
  els.btnSpeak.hidden = !(item.type === 'epub' || item.type === 'text');
  els.findBar.hidden = true;
  findTerm = '';
  els.readerTitle.textContent = item.title;
  els.readerControls.innerHTML = '';
  els.readerBody.innerHTML = '<p class="muted" style="margin:auto">Carregando...</p>';
  els.readerFooter.innerHTML = '';
  els.readerBody.scrollTop = 0;
  els.btnNotes.classList.remove('has-note');
  const fill0 = document.getElementById('readerProgressFill');
  if (fill0) fill0.style.width = '0%';

  const readerEls = {
    body: els.readerBody,
    controls: els.readerControls,
    footer: els.readerFooter,
    item,
    onProgress: (p) => { saveProgress(item, p); updateReaderProgress(p); }
  };

  try {
    if (item.type === 'pdf') currentApi = await PdfReader.open(item, readerEls, item.progress || {});
    else if (item.type === 'epub') currentApi = await EpubReader.open(item, readerEls, item.progress || {});
    else if (item.type === 'comic') currentApi = await PageReader.open(item, readerEls, item.progress || {});
    else if (item.type === 'audio') currentApi = await AudioReader.open(item, readerEls, item.progress || {});
    else if (item.type === 'text') currentApi = await TextReader.open(item, readerEls, item.progress || {});
    else throw new Error('Tipo não suportado');
  } catch (e) {
    console.error(e);
    els.readerBody.innerHTML =
      `<div class="empty"><p>Não foi possível abrir este arquivo.</p><p class="muted">${escapeHtml(e.message || '')}</p></div>`;
    currentApi = null;
  }
  refreshNotes();
  els.readerFooter.insertAdjacentHTML('beforeend',
    '<span><span class="kbd">N</span> anotar</span><span><span class="kbd">Esc</span> voltar</span>');
  startActivity();
  pokeChrome();
}

function saveProgress(item, p) {
  item.progress = Object.assign({}, item.progress, p);
  if (progressRatio(item) >= 0.99) item.shelf = 'lidos';
  DB.put(item).catch(() => {});
  refreshNotes();
}

function startActivity() {
  stopActivity();
  actTimer = setInterval(() => addActivity(30), 30000);
}
function stopActivity() {
  if (actTimer) { clearInterval(actTimer); actTimer = null; addActivity(30); }
}

async function closeReader() {
  stopActivity();
  clearTimeout(chromeTimer);
  els.reader.classList.remove('chrome-hidden');
  if (currentApi && currentApi.dispose) {
    try { currentApi.dispose(); } catch (e) {}
  }
  currentApi = null;
  currentItem = null;
  noteShownKey = null;
  hlPosKey = null;
  closeFind();
  if (speaking) setSpeaking(false);
  els.reader.hidden = true;
  els.btnSpeak.hidden = true;
  els.notesPanel.hidden = true;
  els.typePanel.hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen?.();
  items = await DB.all();
  render();
}

/* ================= Eventos ================= */
document.addEventListener('keydown', (e) => {
  if (els.reader.hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); return; }
  if (e.key === 'Escape') {
    if (!els.findBar.hidden) { closeFind(); return; }
    if (!els.notesPanel.hidden) { toggleNotes(false); return; }
    if (!els.typePanel.hidden) { els.typePanel.hidden = true; return; }
    closeReader();
    return;
  }
  if (e.target.matches('input, select, textarea')) return;
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
    toggleNotes();
    e.preventDefault();
    return;
  }
  if (currentApi && currentApi.onKey && currentApi.onKey(e)) e.preventDefault();
});

window.addEventListener('resize', () => {
  if (!els.reader.hidden && currentApi && currentApi.onResize) currentApi.onResize();
});

document.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav-item[data-view], .link[data-view], .stat-card[data-view], .btn[data-view]');
  if (nav) setView(nav.dataset.view);
});

els.btnBack.onclick = closeReader;

const cycleModes = ['light', 'sepia', 'night'];
function nextMode() {
  const cur = els.reader.dataset.mode || 'light';
  const i = cycleModes.indexOf(cur);
  const next = cycleModes[(i + 1) % cycleModes.length];
  setReaderMode(next);
  toast({ light: 'Modo claro', sepia: 'Modo sépia', night: 'Modo noite' }[next]);
}
els.btnMode.onclick = nextMode;

/* ================= Tema do app (claro / noite) ================= */
const ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.6 12H2.4M21.6 12h-2.2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5"/></svg>';

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('leitura:tema', t);
  els.btnModeTop.innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON;
  els.btnModeTop.title = t === 'dark' ? 'Modo claro' : 'Modo noite';
}

els.btnModeTop.onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  setTheme(dark ? 'light' : 'dark');
  toast(document.documentElement.dataset.theme === 'dark' ? 'Modo noite' : 'Modo claro');
};

const openPicker = () => els.fileInput.click();
els.btnAdd.onclick = () => setView('adicionar');
els.btnAddSide.onclick = () => setView('adicionar');
document.addEventListener('click', (e) => {
  if (e.target.closest('#btnPick, #btnPickInner')) openPicker();
});
if (els.dropzone) {
  els.dropzone.onclick = (e) => { if (!e.target.closest('button')) openPicker(); };
}
els.fileInput.onchange = async () => {
  await importFiles(els.fileInput.files);
  els.fileInput.value = '';
};

/* Drag & drop */
let dragDepth = 0;
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, (e) => {
  if (![...((e.dataTransfer || {}).types || [])].includes('Files')) return;
  e.preventDefault();
  if (ev === 'dragenter') dragDepth++;
  els.dropOverlay.classList.add('show');
  els.dropzone.classList.add('drag');
}));
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) { els.dropOverlay.classList.remove('show'); els.dropzone.classList.remove('drag'); }
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.classList.remove('show');
  els.dropzone.classList.remove('drag');
  if (e.dataTransfer && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
});

/* Busca / filtros / ordenação */
els.search.oninput = (e) => {
  query = e.target.value.trim();
  if (query && view !== 'biblioteca') setView('biblioteca');
  else render();
};
els.sort.onchange = (e) => { sortMode = e.target.value; render(); };
els.filters.onclick = (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  filter = chip.dataset.filter;
  [...els.filters.children].forEach(c => c.classList.toggle('active', c === chip));
  render();
};

/* Estantes e tags */
els.shelfChips.onclick = (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  shelfFilter = chip.dataset.shelf;
  renderLibrary();
};
els.tagSel.onchange = (e) => { tagFilter = e.target.value; renderLibrary(); };

/* Modal editar título */
els.mClose.onclick = closeEditModal;
els.mCancel.onclick = closeEditModal;
els.mSave.onclick = saveEditModal;
els.itemModal.addEventListener('click', (e) => { if (e.target === els.itemModal) closeEditModal(); });
els.mDelete.onclick = () => {
  if (!editing) return;
  const it = editing;
  closeEditModal();
  removeItem(it);
};
els.mShelf.onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || !draft) return;
  draft.shelf = b.dataset.shelf;
  renderModal();
};
els.mColAdd.onclick = () => {
  const name = els.mColNew.value.trim();
  if (!name || !draft) return;
  const cols = getCollections();
  let c = cols.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
  if (!c) {
    c = { id: 'c' + Date.now().toString(36), name };
    cols.push(c);
    setCollections(cols);
  }
  if (!draft.collecoes.includes(c.id)) draft.collecoes.push(c.id);
  els.mColNew.value = '';
  renderModal();
};
const addTag = () => {
  const t = (els.mTagNew.value || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!t || !draft) return;
  if (!draft.tags.includes(t)) draft.tags.push(t);
  els.mTagNew.value = '';
  renderModal();
};
els.mTagAdd.onclick = addTag;
els.mTagNew.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } };
els.mColNew.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); els.mColAdd.click(); } };
els.mCoverFile.onchange = () => {
  const f = els.mCoverFile.files[0];
  if (!f || !draft) return;
  const rd = new FileReader();
  rd.onload = () => { draft.cover = rd.result; els.mCover.src = rd.result; };
  rd.readAsDataURL(f);
  els.mCoverFile.value = '';
};
els.mCoverGen.onclick = () => {
  if (!editing || !draft) return;
  draft.cover = placeholderCover(els.mTitle.value.trim() || editing.title, typeLabel(editing));
  els.mCover.src = draft.cover;
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.itemModal.hidden) closeEditModal();
});

/* Meta */
els.metaSave.onclick = () => {
  const n = parseInt(els.metaInput.value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 500) { toast('Escolha um número entre 1 e 500.'); return; }
  localStorage.setItem('leitura:meta', String(n));
  render();
  toast('Meta atualizada.');
};

/* Anotações e tipografia */
els.btnNotes.onclick = () => toggleNotes();
els.btnNotesClose.onclick = () => toggleNotes(false);
els.btnType.onclick = toggleType;
els.notesText.oninput = () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveNote, 500); };
els.notesText.onblur = () => { clearTimeout(noteTimer); saveNote(); };
els.fontMinus.onclick = () => changeFont(-1);
els.fontPlus.onclick = () => changeFont(1);
els.widthSeg.onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  TYPE_PREFS.col = b.dataset.w;
  applyTypePrefs();
};
els.fontSeg.onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  TYPE_PREFS.family = b.dataset.f;
  applyTypePrefs();
};

/* Exportar / importar biblioteca */
els.btnExport.onclick = exportLibrary;
els.btnImport.onclick = () => els.fileBackup.click();
els.fileBackup.onchange = async () => {
  const f = els.fileBackup.files[0];
  if (f) await importBackup(f);
  els.fileBackup.value = '';
};

/* ================= Biblioteca compartilhada (Cloudflare) ================= */
const SHARED_API = 'https://leitura-api.leitura-biblioteca.workers.dev';
const CHAVE_STORE = 'leitura:chavecompartilhada';
const SHARED_EMPTY_HTML = els.sharedEmpty ? els.sharedEmpty.innerHTML : '';
let sharedCache = null;
let sharedErro = '';
let sharedPromise = null;

const sharedKey = () => localStorage.getItem(CHAVE_STORE) || '';

function pedirChave() {
  const atual = sharedKey();
  const v = prompt('Chave de acesso para enviar ou excluir livros:', atual);
  if (v === null) return atual;
  const nova = (v || '').trim();
  if (nova) localStorage.setItem(CHAVE_STORE, nova);
  else localStorage.removeItem(CHAVE_STORE);
  return nova;
}

async function apiShared(path, opts) {
  const res = await fetch(SHARED_API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || ('Erro ' + res.status));
  return data;
}

async function carregarShared(forcar) {
  if (sharedPromise) {
    await sharedPromise.catch(() => {});
    if (!forcar && sharedCache) return;
  }
  sharedErro = '';
  sharedPromise = (async () => {
    try { sharedCache = await apiShared('/lista'); }
    catch (e) { sharedCache = null; sharedErro = e.message; }
  })();
  try { await sharedPromise; } finally { sharedPromise = null; }
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

function extLabel(livro) {
  const ext = (livro.nome.split('.').pop() || '').toUpperCase();
  return ext && ext.length <= 5 ? ext : 'ARQUIVO';
}

function renderSharedBody() {
  if (!els.sharedList) return;
  const list = sharedCache || [];
  els.sharedList.innerHTML = '';

  if (sharedErro) {
    els.sharedCount.textContent = 'Sem conexão com a biblioteca compartilhada';
    els.sharedEmpty.hidden = false;
    els.sharedEmpty.innerHTML = `<p>Não foi possível carregar os livros.</p><p class="muted">${escapeHtml(sharedErro)}</p><button class="btn btn-primary" id="sharedRetry">Tentar de novo</button>`;
    const b = $('#sharedRetry');
    if (b) b.onclick = () => carregarShared(true).then(renderSharedBody);
    return;
  }

  els.sharedCount.textContent = !sharedCache
    ? 'Carregando livros...'
    : list.length === 1 ? '1 livro disponível para todos'
    : `${list.length} livros disponíveis para todos`;

  els.sharedEmpty.hidden = list.length > 0;
  if (!list.length) els.sharedEmpty.innerHTML = SHARED_EMPTY_HTML;

  list.forEach(livro => {
    const row = document.createElement('div');
    row.className = 'list-item shared';
    row.innerHTML = `
      <span class="lico"><svg viewBox="0 0 24 24"><path d="M5 4h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5zM19 4h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4z"/></svg></span>
      <span class="li-body">
        <span class="li-title">${escapeHtml(livro.nome)}</span>
        <span class="li-sub">${extLabel(livro)} · ${fmtBytes(livro.tamanho)} · ${new Date(livro.enviado).toLocaleDateString('pt-BR')}</span>
      </span>
      <span class="li-actions">
        <button class="btn btn-sm btn-primary shared-dl">Baixar</button>
        <button class="btn btn-sm shared-del" title="Excluir da biblioteca compartilhada">Excluir</button>
      </span>`;
    row.querySelector('.shared-dl').onclick = () => baixarShared(livro);
    row.querySelector('.shared-del').onclick = () => excluirShared(livro);
    els.sharedList.appendChild(row);
  });
}

async function renderShared() {
  await carregarShared(false);
  renderSharedBody();
}

async function baixarShared(livro) {
  toast(`Baixando "${livro.nome}"...`, 5000);
  try {
    const res = await fetch(`${SHARED_API}/livro/${livro.id}`);
    if (!res.ok) throw new Error('Falha no download (' + res.status + ')');
    const blob = await res.blob();
    const file = new File([blob], livro.nome, { type: livro.tipo });
    await importFiles([file]);
  } catch (e) {
    toast('Erro ao baixar: ' + e.message, 5000);
  }
}

async function enviarShared(file) {
  if (file.size > 90 * 1024 * 1024) { toast('Arquivo maior que 90 MB.', 4000); return; }
  let chave = sharedKey();
  if (!chave) {
    chave = pedirChave();
    if (!chave) { toast('Informe a chave de acesso para enviar.'); return; }
  }
  toast(`Enviando "${file.name}"...`, 6000);
  try {
    await apiShared('/enviar', {
      method: 'POST',
      headers: {
        'X-Chave': chave,
        'X-Nome': file.name,
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    });
    toast('Livro enviado para a biblioteca compartilhada!', 4500);
    sharedCache = null;
    await carregarShared(true);
    renderSharedBody();
  } catch (e) {
    if (/chave/i.test(e.message)) localStorage.removeItem(CHAVE_STORE);
    toast('Erro ao enviar: ' + e.message, 5000);
  }
}

async function excluirShared(livro) {
  if (!confirm(`Excluir "${livro.nome}" da biblioteca compartilhada?`)) return;
  let chave = sharedKey();
  if (!chave) {
    chave = pedirChave();
    if (!chave) { toast('Informe a chave de acesso para excluir.'); return; }
  }
  try {
    await apiShared(`/livro/${livro.id}`, { method: 'DELETE', headers: { 'X-Chave': chave } });
    toast('Livro excluído.');
    sharedCache = null;
    await carregarShared(true);
    renderSharedBody();
  } catch (e) {
    if (/chave/i.test(e.message)) localStorage.removeItem(CHAVE_STORE);
    toast('Erro ao excluir: ' + e.message, 5000);
  }
}

if (els.btnSharedRefresh) {
  els.btnSharedRefresh.onclick = () => { sharedCache = null; renderShared(); };
  els.btnSharedUpload.onclick = () => els.sharedFile.click();
  els.btnSharedKey.onclick = () => { if (pedirChave()) toast('Chave salva.'); };
  els.sharedFile.onchange = () => {
    const f = els.sharedFile.files[0];
    els.sharedFile.value = '';
    if (f) enviarShared(f);
  };
}

/* ================= Início ================= */
(async function init() {
  setTheme(localStorage.getItem('leitura:tema') === 'dark' ? 'dark' : 'light');
  setReaderMode(localStorage.getItem('leitura:modo') || 'light');
  applyTypePrefs();
  try {
    await DB.open();
    items = await DB.all();
  } catch (e) {
    toast('Armazenamento local indisponível. Use o iniciar.bat para abrir o app.', 6000);
  }
  setView('home');
})();
