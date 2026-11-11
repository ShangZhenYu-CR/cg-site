/**
 * /ai/ 页面逻辑
 * 认证：昵称+口令 → token；会话/项目存服务器；私人对话只有创建者+管理员可见。
 */

const APP_BUILD = '2026-11-11 15:28';
const DEFAULT_BACKEND = 'https://ai.coldrain-aichat.com';

const RECOMMENDED = [
  'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.1-terra', 'gpt-6-luna',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
];
const DEFAULT_MODEL = 'gpt-6.1-terra';
const DEFAULT_MODELS = RECOMMENDED.slice();

function labelOf(id) {
  return String(id).replace(/^gpt-/, 'GPT-')
    .replace(/-sol$/, ' Sol').replace(/-terra$/, ' Terra').replace(/-luna$/, ' Luna')
    .replace(/-astra$/, ' Astra').replace(/-pro$/, ' Pro');
}

const EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'max'];
const EFFORT_CAP = [
  { test: /sol/i, max: 'medium' },
  { test: /terra/i, max: 'high' },
  { test: /luna/i, max: 'max' },
  { test: /astra/i, max: 'medium' },
];
const EFFORT_LABEL = { minimal: '极低', low: '低', medium: '中', high: '高', max: '最高' };

function effortsFor(model) {
  const cap = EFFORT_CAP.find(c => c.test.test(model || ''));
  const end = EFFORT_ORDER.indexOf(cap ? cap.max : 'medium');
  return EFFORT_ORDER.slice(1, end + 1);
}

const LS = {
  get token() { return localStorage.getItem('ai.token') || ''; },
  set token(v) { v ? localStorage.setItem('ai.token', v) : localStorage.removeItem('ai.token'); },
  get name() { return localStorage.getItem('ai.name') || ''; },
  set name(v) { v ? localStorage.setItem('ai.name', v) : localStorage.removeItem('ai.name'); },
  get role() { return localStorage.getItem('ai.role') || ''; },
  set role(v) { v ? localStorage.setItem('ai.role', v) : localStorage.removeItem('ai.role'); },
  get backend() {
    const v = localStorage.getItem('ai.backend');
    // 旧地址自动迁到新服务器，用户不用手动改
    if (!v || v === 'https://chat.coldrain-aichat.com/ai-api') return DEFAULT_BACKEND;
    return v;
  },
  set backend(v) { v ? localStorage.setItem('ai.backend', v) : localStorage.removeItem('ai.backend'); },
  get models() {
    const raw = localStorage.getItem('ai.models');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_MODELS.slice();
  },
  set models(v) { v && v.length ? localStorage.setItem('ai.models', v.join(',')) : localStorage.removeItem('ai.models'); },
  get model() { return localStorage.getItem('ai.model') || DEFAULT_MODEL; },
  set model(v) { localStorage.setItem('ai.model', v); },
  get effort() { return localStorage.getItem('ai.effort') || 'medium'; },
  set effort(v) { localStorage.setItem('ai.effort', v); },
  get side() { return localStorage.getItem('ai.side') !== '0'; },
  set side(v) { localStorage.setItem('ai.side', v ? '1' : '0'); },
  get convCache() {
    try { return JSON.parse(localStorage.getItem('ai.convs.cache') || 'null'); } catch { return null; }
  },
  set convCache(list) {
    try { localStorage.setItem('ai.convs.cache', JSON.stringify(list)); } catch {}
  },
  get fidelity() { return localStorage.getItem('ai.fidelity') === '1'; },
  set fidelity(v) { v ? localStorage.setItem('ai.fidelity', '1') : localStorage.removeItem('ai.fidelity'); },
  get draw() {
    const def = {
      model: 'gpt-image-2.6-sunburst', size: '1024x1024', quality: 'auto', bg: '',
      format: 'png', compression: 100, n: 1, moderation: 'auto', frames: 8, dur: 150,
      custom: '', complexity: '',
    };
    try { return Object.assign(def, JSON.parse(localStorage.getItem('ai.draw') || '{}')); } catch { return def; }
  },
  set draw(v) { try { localStorage.setItem('ai.draw', JSON.stringify(v)); } catch {} },
};

const RANK = { user: 1, astra: 2, admin: 3 };
const canAstra = () => (RANK[LS.role] || 0) >= 2;
const isAdmin = () => LS.role === 'admin';

const state = {
  projects: [],
  convs: [],
  currentId: null,
  streaming: false,
  waitingUpload: false,
  imageMode: false,
  gifMode: false,
  search: false,
  rawUpload: false,
  fidelity: false,        // 保真优先：高频纹理图不二次压糊
  attachments: [],
  uploading: [],
  codeMode: false,
  fileIdx: 0,
  open: {},          // projectId -> bool
  touched: false,    // 用户是否已经动过界面（初始化不再覆盖其选择）
  controller: null,
};
state.fidelity = LS.fidelity;

let applyingSettings = false;

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const thread = $('#thread');
const listBox = $('#list');
const scrollBox = $('#scroll');
const input = $('#input');
const sendBtn = $('#sendBtn');

/* ---------------- Markdown ---------------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  s = s.replace(/`([^`\n]+)`/g, (m, c) => '<code>' + c + '</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  return s;
}

function md(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push('<p>' + inline(esc(para.join('\n'))).replace(/\n/g, '<br>') + '</p>'); para = []; } };

  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      flush();
      const lang = fence[1] || 'text';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const lv = Math.min(h[1].length, 3); out.push('<h' + lv + '>' + inline(esc(h[2])) + '</h' + lv + '>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + inline(esc(buf.join('\n'))) + '</blockquote>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push('<' + tag + '>' + items.map(t => '<li>' + inline(esc(t)) + '</li>').join('') + '</' + tag + '>');
      continue;
    }
    para.push(line); i++;
  }
  flush();
  return out.join('');
}

/* ---------------- 网络 ---------------- */
const base = () => (LS.backend || DEFAULT_BACKEND).replace(/\/+$/, '');
const fileUrl = (u) => (!u ? '' : (/^https?:\/\//.test(u) ? u : base() + u));

async function api(path, opts = {}) {
  const ctrl = opts.signal ? null : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeout || 30000) : null;
  try {
    return await fetch(base() + path, {
      method: opts.method || 'GET',
      headers: { 'content-type': 'application/json', 'x-token': LS.token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal || (ctrl && ctrl.signal),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errText(status, data) {
  if (status === 401) return '登录过期了，重新进一下';
  if (status === 403) return (data && data.error) || '没有权限';
  if (status === 413) return (data && data.error) || '文件太大';
  if (data && (data.error || data.e)) return String(data.error || data.e);
  return '请求失败（HTTP ' + status + '）';
}

/* ---------------- 登录 ---------------- */
function showLogin(msg) {
  $('#loginErr').textContent = msg || '';
  $('#loginName').value = LS.name || '';
  $('#loginPass').value = '';
  $('#dlgLogin').hidden = false;
  setTimeout(() => ($('#loginName').value ? $('#loginPass') : $('#loginName')).focus(), 40);
}

$('#loginOk').addEventListener('click', async () => {
  const name = $('#loginName').value.trim();
  const pass = $('#loginPass').value;
  if (!name) { $('#loginErr').textContent = '昵称不能空'; return; }
  if (!pass) { $('#loginErr').textContent = '口令不能空'; return; }
  $('#loginOk').disabled = true;
  try {
    const res = await fetch(base() + '/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, pass }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { $('#loginErr').textContent = errText(res.status, data); return; }
    LS.token = data.token; LS.name = data.name; LS.role = data.role;
    $('#dlgLogin').hidden = true;
    renderIdentity(); renderModels();
    await bootData();
  } catch { $('#loginErr').textContent = '连不上后端'; }
  finally { $('#loginOk').disabled = false; }
});

function logout() {
  LS.token = ''; LS.role = '';
  state.convs = []; state.projects = []; state.currentId = null;
  thread.textContent = ''; listBox.textContent = '';
  $('#empty').hidden = false;
  renderIdentity();
  showLogin('');
}

function renderIdentity() {
  $('#meName').textContent = LS.name || '未登录';
  $('#meAvatar').textContent = (LS.name || '?').slice(0, 1);
  const r = { astra: 'Astra', admin: '管理员' }[LS.role] || '';
  $('#meRole').textContent = r; $('#meRole').hidden = !r;
  $('#meHint').textContent = isAdmin() ? '点这里：自定义指令 / 成员' : '点这里：自定义指令';
}

/* ---------------- 花费显示 ---------------- */
let usageData = null;
let usageTimer = null;

function formatUsd(n) {
  const v = Number(n) || 0;
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(3);
  return '$' + v.toFixed(4);
}

async function refreshUsage() {
  if (!LS.token) return;
  try {
    const r = await api('/usage');
    if (!r.ok) return;
    usageData = await r.json();
    renderUsageBar();
    if (!$('#dlgUsage').hidden) renderUsageDialog();
  } catch { /* 统计失败不影响聊天 */ }
}

function scheduleUsage() {
  clearTimeout(usageTimer);
  usageTimer = setTimeout(refreshUsage, 1500);
}

function renderUsageBar() {
  const t = $('#usageText');
  if (!t || !usageData) return;
  const star = usageData.est ? '*' : '';
  t.textContent = '今日 ' + formatUsd(usageData.today) + ' · 本月 ' + formatUsd(usageData.month) + star;
  $('#usageBar').title = '点击看明细' + (usageData.est ? '（* 含按张估算的图）' : '');
}

function renderUsageDialog() {
  const d = usageData;
  if (!d) return;
  $('#uToday').textContent = formatUsd(d.today);
  $('#uMonth').textContent = formatUsd(d.month);
  $('#uTotal').textContent = formatUsd(d.total);
  $('#uEst').textContent = String(d.imageEst != null ? d.imageEst : 0.04);

  const models = $('#uModels');
  models.textContent = '';
  if (!d.byModel || !d.byModel.length) {
    models.append(el('div', 'u-row', '还没有记录'));
  } else {
    for (const m of d.byModel) {
      const row = el('div', 'u-row');
      row.append(el('span', 'k', m.model + '　' + (m.i + m.o).toLocaleString() + ' tokens'));
      row.append(el('b', null, formatUsd(m.usd)));
      models.append(row);
    }
  }

  const convs = $('#uConvs');
  convs.textContent = '';
  if (!d.convs || !d.convs.length) convs.append(el('div', 'u-row', '还没有记录'));
  else for (const c of d.convs) {
    const row = el('div', 'u-row');
    row.append(el('span', 'k', c.title || c.id));
    row.append(el('b', null, formatUsd(c.usd)));
    convs.append(row);
  }

  const days = $('#uDays');
  days.textContent = '';
  if (!d.days || !d.days.length) days.append(el('div', 'u-row', '还没有记录'));
  else for (const x of d.days) {
    const row = el('div', 'u-row');
    row.append(el('span', 'k', x.day));
    row.append(el('b', null, formatUsd(x.usd)));
    days.append(row);
  }
}

/* ---------------- 数据 ---------------- */
async function loadProjects() {
  let r;
  try { r = await api('/projects'); } catch { return; }
  if (r.status === 401) { logout(); return; }
  if (!r.ok) return;
  state.projects = (await r.json()).projects || [];
  for (const p of state.projects) if (state.open[p.id] === undefined) state.open[p.id] = true;
}

async function loadConvs() {
  let r;
  try { r = await api('/convs'); } catch { return false; }   // 超时/断网保留缓存
  if (r.status === 401) { logout(); return false; }
  if (!r.ok) return false;
  const data = await r.json().catch(() => null);
  if (!data) return false;
  const before = state.convs.slice();
  state.convs = (data.conversations || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const cv of state.convs) if (!Array.isArray(cv.files)) cv.files = [];

  // 本地有更新但还没写完的会话，别被服务端旧数据盖掉（否则刚发的消息会“消失”）
  const localNewer = new Map();
  for (const c of before) if ((c.updatedAt || 0) > 0) localNewer.set(c.id, c);
  state.convs = state.convs.map((s) => {
    const l = localNewer.get(s.id);
    if (l && (l.updatedAt || 0) > (s.updatedAt || 0) + 800 && Array.isArray(l.messages) && l.messages.length) {
      return { ...s, messages: l.messages, files: l.files || s.files, settings: l.settings || s.settings, updatedAt: l.updatedAt };
    }
    return s;
  });
  // 只缓存列表元信息，避免塞满 localStorage
  LS.convCache = state.convs.map(c => ({
    id: c.id, title: c.title, updatedAt: c.updatedAt,
    projectId: c.projectId || null, private: !!c.private, owner: c.owner || '',
  }));
  return true;
}

const current = () => state.convs.find(c => c.id === state.currentId) || null;

async function createConv(opts = {}) {
  modelPinned = false;
  const r = await api('/convs', {
    method: 'POST',
    body: {
      title: '新对话',
      projectId: opts.projectId || null,
      private: !!opts.private,
      settings: { model: LS.model, effort: LS.effort, codeMode: !!state.codeMode, search: !!state.search, raw: !!state.rawUpload, imageMode: !!state.imageMode, gifMode: !!state.gifMode },
    },
  });
  if (!r.ok) return null;
  const { conversation } = await r.json();
  state.convs.unshift(conversation);
  state.currentId = conversation.id;
  return conversation;
}

async function saveConv(conv, extra) {
  state.saving = true;
  conv.updatedAt = Date.now();
  const body = {
    title: conv.title,
    messages: conv.messages,
    projectId: conv.projectId || null,
    private: !!conv.private,
    files: conv.files || [],
    settings: conv.settings || {},
    ...(extra || {}),
  };
  try { await api('/convs/' + encodeURIComponent(conv.id), { method: 'PUT', body }); } catch {} finally { state.saving = false; }
}

/* ---- 会话自带的界面状态（共享） ---- */
let settingsTimer = null;

function persistSettings() {
  const cv = current();
  if (!cv) return;
  cv.settings = {
    model: LS.model,
    effort: LS.effort,
    codeMode: !!state.codeMode,
    search: !!state.search,
    raw: !!state.rawUpload,
    imageMode: !!state.imageMode,
    gifMode: !!state.gifMode,
  };
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveConv(cv), 600);
}

function applyConvSettings(cv) {
  const s = cv && cv.settings;
  if (!s) return;
  applyingSettings = true;
  try {
    if (s.model) { modelPinned = true; LS.model = s.model; }   // 会话记录的就是它当时用的模型，直接恢复
    if (s.effort) LS.effort = s.effort;

    // 五个开关全部按会话重置，缺省即为关闭（否则会带到别的对话上）
    setCap('code', !!s.codeMode);
    setCap('search', !!s.search);
    setCap('raw', !!s.raw);
    setCap('image', !!s.imageMode);
    setCap('gif', !!s.gifMode);

    renderModels();
    renderEffort();
  } finally {
    applyingSettings = false;
  }
}

/* ---------------- 侧栏 ---------------- */
function convRow(cv) {
  const row = el('div', 'kid' + (cv.id === state.currentId ? ' on' : ''));
  row.draggable = true;
  row.dataset.id = cv.id;
  const t = el('span', 't', (cv.private ? '🔒 ' : '') + (cv.title || '新对话'));
  const time = el('span', 'time', when(cv.updatedAt));
  row.append(t, time);

  if (isAdmin() && cv.private && cv.owner) {
    const own = el('span', 'lock', cv.owner);
    row.append(own);
  }

  row.addEventListener('click', () => {
    if (state.streaming) return;
    state.currentId = cv.id;
    applyConvSettings(cv);
    renderAll();
    closeNav();
  });
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', cv.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  return row;
}

function when(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toTimeString().slice(0, 5);
  const diff = (now - d) / 86400000;
  if (diff < 2) return '昨天';
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function renderSide() {
  const q = $('#q').value.trim().toLowerCase();
  listBox.textContent = '';

  const head = el('div', 'grp');
  head.innerHTML = '<span>项目</span><button id="newProjInline">＋ 新建</button>';
  listBox.append(head);

  const matches = (cv) => !q || String(cv.title || '').toLowerCase().includes(q);

  for (const p of state.projects) {
    const kids = state.convs.filter(cv => cv.projectId === p.id);
    if (q && !p.name.toLowerCase().includes(q) && !kids.some(matches)) continue;

    const row = el('div', 'proj' + (state.open[p.id] ? ' open' : ''));
    row.innerHTML = `<span class="caret">▶</span><span class="ico">📁</span>
      <span class="pn">${esc(p.name)}</span><span class="cnt">${kids.length}</span>
      <span class="pact"><i data-act="ins" title="项目指令">⚙</i><i data-act="add" title="在此新建">＋</i></span>`;

    row.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act === 'ins') { e.stopPropagation(); openProjectDialog(p); return; }
      if (act === 'add') { e.stopPropagation(); createConv({ projectId: p.id }).then(() => { state.open[p.id] = true; renderAll(); }); return; }
      state.open[p.id] = !state.open[p.id];
      renderSide();
    });

    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('dragover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dragover'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const cv = state.convs.find(x => x.id === id);
      if (!cv) return;
      cv.projectId = p.id;
      state.open[p.id] = true;
      await saveConv(cv);
      renderAll();
    });

    listBox.append(row);

    if (state.open[p.id]) {
      const box = el('div', 'kids');
      for (const cv of kids.filter(matches)) box.append(convRow(cv));
      if (!kids.length) box.append(el('div', 'kid', '（空）'));
      listBox.append(box);
    }
  }

  const head2 = el('div', 'grp');
  head2.innerHTML = '<span>最近</span>';
  listBox.append(head2);
  const loose = state.convs.filter(cv => !cv.projectId && matches(cv));
  if (!loose.length) listBox.append(el('div', 'kid', q ? '没有匹配' : '（还没有对话）'));
  for (const cv of loose) listBox.append(convRow(cv));

  const np = document.getElementById('newProjInline');
  if (np) np.addEventListener('click', () => openProjectDialog(null));
}

/* ---------------- 线程 ---------------- */
function bubble(m) {
  if (m.role === 'divider') {
    const d = el('div', 'divider');
    d.append(el('span', null, m.text || '以上内容不再发送给模型'));
    return d;
  }
  if (m.kind === 'handoff') {
    const d = el('div', 'doc');
    d.append(el('span', 'lab', '交接文档'));
    const body = el('div');
    body.innerHTML = md(m.text);
    d.append(body);
    return d;
  }

  const isUser = m.role === 'user';
  const wrap = el('div', 'msg ' + (isUser ? 'user' : 'ai'));
  wrap.append(el('div', 'av', isUser ? (m.who || LS.name || '我').slice(0, 1) : 'AI'));

  const bd = el('div', 'bd');
  if (isUser) bd.append(el('div', 'name', m.who || LS.name || '我'));

  const content = el('div');
  if (m.err) content.append(el('div', 'err', m.text || '出错了'));
  else content.innerHTML = md(m.text || '');
  bd.append(content);

  for (const u of (m.images || [])) {
    const box = el('div', 'imgbox');
    const img = el('img');
    img.src = fileUrl(u);
    img.alt = '图片';
    img.loading = 'lazy';
    img.title = '点击放大';
    img.addEventListener('click', () => openLightbox(u));

    const acts = el('div', 'imgacts');
    // 静态图 → 一键让模型做成动图
    if (!/\.gif(\?|$)/i.test(u)) {
      const toGif = el('button', null, '转GIF');
      toGif.type = 'button';
      toGif.title = '让 AI 把这张图做成动图';
      toGif.addEventListener('click', (e) => {
        e.stopPropagation();
        turnImageToGif(u);
      });
      acts.append(toGif);
    }
    const dl = el('button', null, '下载');
    dl.type = 'button';
    dl.addEventListener('click', async (e) => {
      e.stopPropagation();
      dl.textContent = '…';
      try { await downloadImage(u); dl.textContent = '已下载'; }
      catch { dl.textContent = '失败'; flashHint('下载失败，可右键另存'); }
      setTimeout(() => { dl.textContent = '下载'; }, 1500);
    });

    const cpImg = el('button', null, '复制');
    cpImg.type = 'button';
    cpImg.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const msg = await copyImage(u);
        cpImg.textContent = '已复制';
        if (msg) flashHint(msg);
      } catch { cpImg.textContent = '失败'; flashHint('复制失败，可右键另存'); }
      setTimeout(() => { cpImg.textContent = '复制'; }, 1500);
    });

    acts.append(dl, cpImg);
    box.append(img, acts);
    bd.append(box);
  }

  if (!isUser && !m.err) {
    if (m.meta) bd.append(el('div', 'meta', m.meta));
    const prompts = (m.imgPrompts && m.imgPrompts.length) ? m.imgPrompts : (m.imgPrompt ? [m.imgPrompt] : []);
    if (prompts.length) {
      const det = el('details', 'imgprompt');
      det.append(el('summary', null, prompts.length > 1 ? ('模型写的 ' + prompts.length + ' 条提示词') : '模型写的提示词'));
      prompts.forEach((p, i) => {
        det.append(el('div', 'ip-text', (prompts.length > 1 ? ('第 ' + (i + 1) + ' 张：') : '') + p));
      });
      bd.append(det);
    }
    if (m.wrote && m.wrote.length) {
      const chip = el('div', 'wrote-chip');
      chip.innerHTML = '已写入 <b>' + m.wrote.length + '</b> 个文件：' + esc(m.wrote.join(', '));
      chip.style.cursor = 'pointer';
      chip.title = '打开代码面板';
      chip.addEventListener('click', () => openCodePane());
      bd.append(chip);
    }
    const acts = el('div', 'acts');
    const cp = el('button', null, '复制');
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(m.text || ''); cp.textContent = '已复制'; setTimeout(() => cp.textContent = '复制', 1200); } catch {}
    });
    acts.append(cp);
    bd.append(acts);
  }

  wrap.append(bd);
  return wrap;
}


/** 从用户话里猜要几张（1–4） */
function countImages(text) {
  const t = String(text || '');
  const m = /(\d+)\s*张/.exec(t);
  if (m) return Math.max(1, Math.min(4, Number(m[1])));
  const cn = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 4, 六: 4 };
  const c = /([一两二三四五六])\s*张/.exec(t);
  if (c) return cn[c[1]] || 1;
  return 1;
}
/* ---------------- 图片：下载 / 复制 / 放大 ---------------- */
function fileNameFrom(u, mime) {
  const p = (String(u).split('?')[0].split('/').pop() || 'image');
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(p);
  const ext = (mime && mime.split('/')[1]) || (hasExt ? p.split('.').pop() : 'png');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  return 'ai-' + stamp + '.' + (ext === 'jpeg' ? 'jpg' : ext);
}

async function fetchImageBlob(u) {
  // /oss/ 走同源代理，避免 OSS 跨域导致 fetch 失败（<img> 不受此限，下载/复制会）
  const target = u.startsWith('/oss/') ? base() + '/oss/raw/' + u.slice('/oss/'.length) : fileUrl(u);
  const r = await fetch(target, { credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.blob();
}

async function downloadImage(u) {
  const blob = await fetchImageBlob(u);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFrom(u, blob.type);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 复制图片到剪贴板；动图浏览器不接受，退回复制链接 */
async function copyImage(u) {
  const blob = await fetchImageBlob(u);
  if (blob.type === 'image/gif') {
    await navigator.clipboard.writeText(new URL(fileUrl(u), location.href).href);
    return '动图无法进剪贴板，已复制图片链接';
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
    return '';
  } catch {
    await navigator.clipboard.writeText(new URL(fileUrl(u), location.href).href);
    return '此浏览器不支持复制图片，已复制链接';
  }
}

let lightboxUrl = '';
function openLightbox(u) {
  lightboxUrl = u;
  const elImg = $('#lightboxImg');
  elImg.src = fileUrl(u);
  $('#lightbox').hidden = false;
}
function closeLightbox() {
  lightboxUrl = '';
  $('#lightbox').hidden = true;
  $('#lightboxImg').src = '';
}

$('#lbClose').addEventListener('click', closeLightbox);
$('#lightbox').addEventListener('click', (e) => { if (e.target === $('#lightbox')) closeLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox(); });
$('#lbDownload').addEventListener('click', async () => {
  if (!lightboxUrl) return;
  const b = $('#lbDownload');
  b.textContent = '…';
  try { await downloadImage(lightboxUrl); b.textContent = '已下载'; }
  catch { b.textContent = '失败'; }
  setTimeout(() => { b.textContent = '下载'; }, 1500);
});
$('#lbCopy').addEventListener('click', async () => {
  if (!lightboxUrl) return;
  const b = $('#lbCopy');
  try { const msg = await copyImage(lightboxUrl); b.textContent = '已复制'; if (msg) flashHint(msg); }
  catch { b.textContent = '失败'; }
  setTimeout(() => { b.textContent = '复制'; }, 1500);
});

function renderThread() {
  // 用「离底距离」而不是绝对位置：内容高度变化时也不会跳到历史
  const prevDist = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight;

  thread.textContent = '';
  const cv = current();
  const msgs = cv ? cv.messages : [];
  $('#empty').hidden = !!msgs.length;
  for (const m of msgs) thread.append(bubble(m));
  $('#titleBtn').textContent = cv ? cv.title : '新对话';
  updateCtx();

  const restore = () => {
    if (prevDist < 60) {
      scrollBox.scrollTop = scrollBox.scrollHeight;
    } else {
      scrollBox.scrollTop = Math.max(0, scrollBox.scrollHeight - scrollBox.clientHeight - prevDist);
    }
  };
  restore();
  requestAnimationFrame(restore);
}

function renderAll() {
  renderSide();
  renderThread();
  renderCode();
}

/* ---------------- 上下文 ---------------- */
function estimate(text) {
  const s = String(text || '');
  let cjk = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
  }
  return Math.ceil(cjk + (s.length - cjk) / 4);
}

function sentMessages(cv) {
  if (!cv) return [];
  const cut = Number(cv.cutIndex) || 0;
  return (cv.messages || []).slice(cut).filter(m => m.role !== 'divider' && !m.err && !m.streaming);
}

function ctxBudget(model) { return /luna/i.test(model || '') ? 0 : 400000; }

function updateCtx() {
  const cv = current();
  const model = $('#modelName') && LS.model;
  const budget = ctxBudget(model);
  const msgs = cv ? (cv.messages || []).slice(cv.cutIndex || 0).filter(m => m.role !== 'divider' && !m.err) : [];
  const used = msgs.reduce((n, m) => n + estimate(m.text) + (m.images ? m.images.length * 1200 : 0) + 8, 0);

  const ratio = budget > 0 ? Math.min(1, used / budget) : 0;
  const color = budget > 0 && ratio >= 0.8 ? 'var(--danger)' : (budget > 0 && ratio >= 0.5 ? 'var(--warn)' : 'var(--ok)');

  $('#ringArc').setAttribute('stroke-dashoffset', String(47.12 * (1 - ratio)));
  $('#ringArc').setAttribute('stroke', color);
  const num = $('#ctxNum');
  num.textContent = used.toLocaleString() + ' / ' + (budget > 0 ? budget.toLocaleString() : '不限');
  num.style.color = color;
  $('#ring').title = budget > 0 ? '上下文占用 ' + Math.round(ratio * 100) + '%' : '上下文不限（luna）';

  const arch = $('#ctxArch');
  const cut = Number(cv && cv.cutIndex) || 0;
  arch.hidden = cut <= 0;
  if (cut > 0) arch.textContent = '已归档 ' + cut + ' 条';
}

/* ---------------- 模型 / 强度 ---------------- */
let modelPinned = false;   // 会话指定的模型，不要被列表自动纠正掉

function visibleModels() {
  const all = LS.models;
  return canAstra() ? all : all.filter(m => !/astra/i.test(m));
}

function renderModels() {
  const list = visibleModels();
  const box = $('#modelList');
  box.textContent = '';
  const rec = RECOMMENDED.filter(m => list.includes(m));
  const rest = list.filter(m => !rec.includes(m));

  const addGroup = (title, arr) => {
    if (!arr.length) return;
    if (title) box.append(el('h4', null, title));
    for (const id of arr) {
      const b = el('button', 'opt' + (id === LS.model ? ' on' : ''), labelOf(id));
      b.addEventListener('click', () => { modelPinned = false; LS.model = id; renderModels(); renderEffort(); updateCtx(); persistSettings(); });
      box.append(b);
    }
  };
  addGroup('推荐', rec);
  addGroup('全部', rest);

  if (!modelPinned && !list.includes(LS.model) && list.length) LS.model = rec[0] || list[0];
  $('#modelName').textContent = labelOf(LS.model);
  renderEffort();
}

function renderEffort() {
  const list = effortsFor(LS.model);
  let idx = list.indexOf(LS.effort);
  if (idx < 0) idx = Math.max(0, list.indexOf('medium'));
  LS.effort = list[idx];

  const range = $('#effRange');
  range.max = String(Math.max(0, list.length - 1));
  range.value = String(idx);

  const ticks = $('#effTicks');
  ticks.textContent = '';
  list.forEach((e, i) => {
    const s = el('span', i === idx ? 'on' : '', EFFORT_LABEL[e]);
    s.style.cursor = 'pointer';
    s.addEventListener('click', () => { LS.effort = e; renderEffort(); persistSettings(); });
    ticks.append(s);
  });

  $('#effName').textContent = EFFORT_LABEL[LS.effort] || LS.effort;
  $('#popEff').textContent = EFFORT_LABEL[LS.effort] || LS.effort;
  $('#effHint').textContent = '这个模型最高到「' + EFFORT_LABEL[list[list.length - 1]] + '」。档位越高越慢、越贵。';
}

/* ---------------- 发送 ---------------- */
function setBusy(b) {
  state.streaming = b;
  sendBtn.classList.toggle('stop', b);
  sendBtn.title = b ? '停止' : '发送';
  sendBtn.innerHTML = b
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="m5 12 7-7 7 7"/></svg>';
}

/* 一闪而过的提示，贴在输入框上方 */
let flashTimer = null;
function flashHint(msg) {
  let h = $('#flashHint');
  if (!h) {
    h = el('div', 'up-hint');
    h.id = 'flashHint';
    $('#attach').append(h);
  }
  h.textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => h.remove(), 2800);
}

/** GIF：官方 output_format=gif，帧数 2–16 */
/** 画图 / 改图（带附件就是改图） */
/** 一键把某张静态图变成动图（走对话模型 + GIF 工具） */
function turnImageToGif(u) {
  if (state.streaming) { flashHint('上一轮还没结束，稍等下'); return; }
  sendChat('把这张图做成动图：主体保持原样，动作自然，首尾能衔接循环播放', { draw: true, gif: true, refImage: u });
}

/** 把上游 JSON 提炼成一句人话 + 建议；认不出来的返回空串，由调用方保留原文 */
function humanError(msg) {
  const s = String(msg || '');
  if (!s) return '';
  if (/pixel budget|No supported sheet|3840/i.test(s)) {
    return 'GIF 的帧数 × 尺寸超过了图片工具的像素上限（已自动降到 512² 重试过一次）。帧数调到 8 或更少更稳。';
  }
  if (/safety|violence|safety_violations/i.test(s)) {
    return '上游安全策略拦下了这次生成——被拒的是生成内容，不是你的操作。换个说法或换一张参考图再试。';
  }
  if (/Invalid value: 'input_image'|Supported values are: 'output_text' and 'refusal'/i.test(s)) {
    return '这轮请求里混进了不该回传的图片段（多来自历史消息）。已跳过历史图，重发这一句即可。';
  }
  if (/GIF output is not enabled/i.test(s)) {
    return '当前模型没开 GIF 输出。动图必须走 gpt-image-2.6-sunburst，把画图模型切回它再试。';
  }
  if (/rate limit|429|quota|insufficient/i.test(s)) return '上游限流或额度不足，等一会儿再试。';
  return '';
}

async function sendChat(text, opts = {}) {
  const cv = current() || await createConv();
  if (!cv) return;

  // 参考图：显式指定的优先，否则把当前附件全部带上（多图参考，最多 4 张）
  const picked = (opts.refImages && opts.refImages.length) ? opts.refImages
    : opts.refImage ? [opts.refImage]
    : state.attachments.map(a => a.url);
  const imgs = picked.filter(Boolean).slice(0, MAX_REF_IMAGES);
  state.attachments = [];
  renderAttach();

  // 画图模式且没有附件：走对话模型 + 图像工具，这样能看到上文
  const drawMode = !!opts.draw || !!state.imageMode;
  const gifAsk = !!opts.gif;

  // 上文里最近的一张图，作为参考图（保持角色/风格一致）
  let refImages = [];
  if (drawMode) {
    for (let i = cv.messages.length - 1; i >= 0; i--) {
      const m = cv.messages[i];
      if (m.images && m.images.length) {
        // 最多补 2 张上文图，且不要和本次附件重复
        refImages = m.images.slice(-2).filter((u) => !imgs.includes(u));
        break;
      }
    }
  }

  // 嘴上说「这张图」但没挂图时提醒，避免模型凭空画
  if (drawMode && !imgs.length && !refImages.length && /(这张|这个角色|参考|上图|刚才那张|原图)/.test(text)) {
    flashHint('没检测到图片：先粘贴或上传一张，再发这句');
  }

  if (!cv.messages.length) cv.title = (text || '图片').slice(0, 24);
  cv.messages.push({ role: 'user', text, who: LS.name, images: imgs.length ? imgs : undefined, ts: Date.now() });

  const reply = { role: 'assistant', text: '', streaming: true, ts: Date.now() };
  cv.messages.push(reply);
  renderThread();
  if (lastDist < 120) scrollBox.scrollTop = scrollBox.scrollHeight;

  const model = LS.model;
  const effort = LS.effort;
  // 图像生成模型不接受 reasoning 参数，所以只在明确要图时才挂工具
  const wantsImage = drawMode || /(画一|画个|画只|画张|画幅|生成.{0,6}图|来张图|出图|绘图|插画|海报|头像|表情包|配图|draw|image|picture|illustration)/i.test(text);

  // GIF：帧数 → 尺寸联动，别让上游 sheet 的像素预算把请求打回来（16 帧 @768² 必超）
  const gifFrames = Math.max(2, Math.min(16, Number(LS.draw.frames) || 8));
  const gifDuration = Math.max(20, Math.min(2000, Number(LS.draw.dur) || 150));
  const gifOpts = (frames, size) => ({
    model: 'gpt-image-2.6-sunburst',
    size: gifSizeForFrames(frames, size),
    output_format: 'gif',
    frame_count: Math.max(2, Math.min(16, Number(frames) || 8)),
    frame_duration_ms: gifDuration,
  });
  // 自定义尺寸只有合规才发；不合规宁可本地不发，也别让上游 400
  const drawSize = LS.draw.size === 'custom'
    ? (parseSize(LS.draw.custom) ? LS.draw.custom : undefined)
    : (LS.draw.size && LS.draw.size !== 'auto' ? LS.draw.size : undefined);
  const drawN = Math.min(10, Math.max(1, Number(LS.draw.n) || 1));
  let imageOpts = drawMode
    ? (gifAsk ? gifOpts(gifFrames, drawSize) : {
        model: LS.draw.model || undefined,
        size: drawSize,
        quality: LS.draw.quality && LS.draw.quality !== 'auto' ? LS.draw.quality : undefined,
        complexity: LS.draw.complexity || undefined,
        background: LS.draw.bg || undefined,
        output_format: (LS.draw.format && LS.draw.format !== 'gif') ? LS.draw.format : undefined,
      })
    : undefined;

  const wantN = drawMode && !gifAsk ? drawN : 1;
  reply.meta = drawMode
    ? ('画图 · ' + (imgs.length ? '参考 ' + imgs.length + ' 张图' : (refImages.length ? '参考上文图' : '无参考图'))
        + (wantN > 1 ? ' · 要 ' + wantN + ' 张' : ''))
    : labelOf(model) + ' · ' + (wantsImage ? '图像' : (EFFORT_LABEL[effort] || effort));

  const node = thread.lastElementChild;
  const body = node && node.querySelector('.bd');
  const host = body ? body.querySelector('div') : null;
  // 流式期间只更新一个纯文本节点 + 光标，避免整块 innerHTML 重建导致高度抖动
  const textNode = document.createTextNode('');
  const caret = el('span', 'cursor');
  if (host) { host.textContent = ''; host.append(textNode, caret); }

  setBusy(true);
  state.controller = new AbortController();

  let acc = '';
  let raf = 0;
  const paint = () => {
    raf = 0;
    textNode.nodeValue = acc;
    if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  /** 真打一次 /chat；imageOpts 允许被降档重试替换 */
  const postChat = async (io) => {
    const res = await api('/chat', {
      method: 'POST', signal: state.controller.signal,
      body: {
        model, search: state.search, convId: cv.id, projectId: cv.projectId || null,
        ...(drawMode
          ? { imageTool: true, imageMode: true, refImages: refImages.length ? refImages : undefined, imageOpts: io, imageCount: wantN > 1 ? wantN : undefined }
          : wantsImage ? { imageTool: true } : { effort }),
        codeMode: state.codeMode,
        fileNames: (cv.files || []).map(f => f.name),
        messages: sentMessages(cv).map(m => ({
          role: m.role,
          text: m.text,
          // 只有用户消息能带图；assistant 的内容只允许 output_text / refusal
          images: m.role === 'user' ? m.images : undefined,
        })),
      },
    });
    if (!res.ok) {
      let d = null; try { d = await res.json(); } catch {}
      throw Object.assign(new Error(errText(res.status, d)), { status: res.status });
    }

    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const d = await res.json();
      acc = d.text || '';
      paint();
    } else {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            let ev; try { ev = JSON.parse(payload); } catch { continue; }
            if (ev.e) throw new Error(ev.e);
            if (ev.u) cv.usage = ev.u;
            if (ev.img) {
              reply.images = [...(reply.images || []), ev.img];
              if (ev.imgPrompt) reply.imgPrompts = [...(reply.imgPrompts || []), ev.imgPrompt];
              if (!reply.meta) reply.meta = '图片';
            }
            if (ev.t) { acc += ev.t; schedule(); }
          }
        }
      }
      paint();
    }
  };

  /**
   * 兜底：这一轮没出图、或工具直接 400，就直连画图接口，别让用户白等。
   * 旧写法只在「请求成功但没图」时兜底，工具报错会直接穿透成一段上游 JSON。
   */
  const fallbackImage = async () => {
    if (!(drawMode || gifAsk) || (reply.images || []).length) return false;
    try {
      if (gifAsk) {
        const r = await api('/gif', {
          method: 'POST', timeout: 300000,
          body: { prompt: text, frames: (imageOpts && imageOpts.frame_count) || gifFrames, duration: gifDuration, image: imgs[0] },
        });
        const d = await r.json().catch(() => ({}));
        if (d.url) { reply.images = [d.url]; reply.meta = 'GIF · 回退生成'; return true; }
        return false;
      }
      const r2 = await api('/draw', {
        method: 'POST', timeout: 300000,
        body: { prompt: text, image: imgs[0], size: LS.draw.size, quality: LS.draw.quality, format: LS.draw.format === 'gif' ? 'png' : LS.draw.format, n: Math.max(countImages(text), LS.draw.n || 1), compression: LS.draw.compression },
      });
      const d2 = await r2.json().catch(() => ({}));
      const u = (d2.urls || [])[0];
      if (u) { reply.images = [u]; reply.meta = '画图 · 回退生成'; return true; }
      return false;
    } catch { return false; }
  };

  try {
    // 上游把 GIF 帧拼成 sheet，帧多尺寸大就 400；撞预算自动降一档重来一次
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        acc = '';
        textNode.nodeValue = '';
        await postChat(imageOpts);
        lastErr = null;
        break;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        lastErr = e;
        const m = String((e && e.message) || '');
        if (attempt === 0 && gifAsk && /pixel budget|No supported sheet|3840/i.test(m)) {
          imageOpts = gifOpts(imageOpts.frame_count || gifFrames, '512x512');
          reply.meta = 'GIF · ' + imageOpts.frame_count + ' 帧 · 512² · 已降档重试';
          acc = '';
          continue;
        }
        break;
      }
    }
    if (lastErr) throw lastErr;
    reply.text = acc;
    delete reply.streaming;

    // 兜底：切到直连接口，避免这一轮白跑
    if (!(reply.images || []).length) await fallbackImage();

    // 结束后一次性渲染 Markdown（流式期间只有纯文本）
    if (reply.images && reply.images.length > 1) reply.meta = '画图 · ' + reply.images.length + ' 张';
    if (gifAsk && reply.images && reply.images.length) {
      const fr = (imageOpts && imageOpts.frame_count) || gifFrames;
      const sz = String((imageOpts && imageOpts.size) || gifSizeForFrames(fr)).replace('x', '×');
      reply.meta = 'GIF · ' + fr + ' 帧 · ' + sz + (reply.images.length > 1 ? ' · ' + reply.images.length + ' 张' : '');
    }
    if (host) host.innerHTML = md(reply.text || '');
    if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;

    const parsed = extractFiles(reply.text || '');
    if (parsed.files.length) {
      applyFiles(cv, parsed.files);
      reply.wrote = parsed.files.map(f => f.name);
      reply.text = parsed.text;
      if (!reply.text) reply.text = '';
    }
  } catch (e) {
    delete reply.streaming;
    const aborted = e && e.name === 'AbortError';
    // 工具报错也要走兜底，否则用户只看到一段上游 JSON
    let recovered = false;
    if (!aborted) { try { recovered = await fallbackImage(); } catch { recovered = false; } }
    if (recovered) {
      reply.text = acc || '';
    } else if (aborted) {
      reply.text = acc || '（已停止）';
    } else {
      reply.err = true;
      reply.text = humanError(e && e.message) || (e && e.message) || '出错了';
      if (e && e.status === 401) logout();
    }
  } finally {
    state.controller = null;
    await saveConv(cv);
    setBusy(false);
    renderAll();
    scheduleUsage();
    if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;
  }
}

function scrollBottom(force) {
  const near = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 200;
  if (force || near) scrollBox.scrollTop = scrollBox.scrollHeight;
}

/* 粘底：默认跟随新内容；用户主动往上滚才解除 */
let stickBottom = true;
let lastDist = 0;
const atBottom = () => scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 80;

scrollBox.addEventListener('scroll', () => {
  const d = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight;
  lastDist = d;
  if (d < 80) stickBottom = true;
  else if (d > 240) stickBottom = false;   // 死区，避免重建瞬间误判
}, { passive: true });
scrollBox.addEventListener('wheel', (e) => { if (e.deltaY < 0) stickBottom = false; }, { passive: true });
scrollBox.addEventListener('touchmove', () => { if (!atBottom()) stickBottom = false; }, { passive: true });

/* 图片/代码块等异步撑高内容时，只要在底部就继续贴底（这是“往上弹”的根因） */
const threadRO = new ResizeObserver(() => {
  // 用「变化之前」的离底距离判断：当前值已经被新内容撑大了
  if (lastDist < 120) scrollBox.scrollTop = scrollBox.scrollHeight;
});
try { threadRO.observe(thread); } catch {}

/* ---------------- 附件 / 上传 ---------------- */
function renderAttach() {
  const box = $('#attach');
  box.textContent = '';
  state.attachments.forEach((a, i) => {
    const chip = el('div', 'chip');
    const img = el('img');
    img.src = fileUrl(a.url);
    const x = el('button', null, '×');
    x.title = '移除';
    x.addEventListener('click', () => { state.attachments.splice(i, 1); renderAttach(); });
    chip.append(img, x);
    // 多图时必须能分清谁是谁：模型按「图1/图2」理解，用户也得看到同一个编号
    if (state.attachments.length > 1) chip.append(el('span', 'idx', '图' + (i + 1)));
    if (a.mode === 'fidelity') {
      const tag = el('span', 'mode-tag', '保真');
      tag.title = '高频细节 ' + (a.detail || 0) + '：这张图没有走强压缩';
      chip.append(tag);
    }
    box.append(chip);
  });

  // 还在上传的图：显示占位（切换对话也不会看起来“消失”）
  (state.uploading || []).forEach((u) => {
    const chip = el('div', 'chip up');
    chip.append(el('span', 'spin'));
    chip.append(el('span', 'up-txt', u.label + (u.kb ? ' ' + u.pct + '% · ' + u.kb + 'KB' : '…')));
    box.append(chip);
  });
}

const MAX_IMAGE_MB = 50;
/** 普通图上限：够清楚、又不至于拖慢跨境上传 */
const NORMAL_CAP = 1024 * 1024;
/** 保真图上限：高频纹理宁可大一点 */
const FIDELITY_CAP = 3 * 1024 * 1024;
/** 拉普拉斯均值超过这个值就当"高频纹理"（实测校准：花纹图 ~30+，插画 ~3） */
const DETAIL_THRESHOLD = 8;

/**
 * 高频细节打分：在「原图分辨率」上裁 256×256 块算拉普拉斯绝对均值。
 * 不能先缩到 256 再算——那正好把要检测的高频抹掉了。
 */
function detailScore(bmp) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  let best = 0;
  for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7]]) {
    const sw = Math.min(S, bmp.width);
    const sh = Math.min(S, bmp.height);
    const sx = Math.max(0, Math.min(bmp.width - sw, Math.round(bmp.width * fx - sw / 2)));
    const sy = Math.max(0, Math.min(bmp.height - sh, Math.round(bmp.height * fy - sh / 2)));
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const g = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    let sum = 0, n = 0;
    for (let y = 1; y < S - 1; y++) {
      for (let x = 1; x < S - 1; x++) {
        const i = y * S + x;
        sum += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - S] - g[i + S]);
        n++;
      }
    }
    if (n) best = Math.max(best, sum / n);
  }
  return best;
}

/**
 * 上传前压缩。返回 { file, mode, detail }
 * - 普通：长边 ≤2048、JPEG q0.9，超 1MB 就逐级降到 1600/q0.85、1280/q0.8
 * - 保真：高频纹理或手动开「保真」时，优先 PNG，退到 q0.95 JPEG，宁可变大也不二次压糊
 */
async function shrinkImage(file) {
  try {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return { file, mode: 'raw', detail: 0 };
    const bmp = await createImageBitmap(file);
    const detail = detailScore(bmp);
    const fidelity = state.fidelity || detail >= DETAIL_THRESHOLD;

    const encode = async (maxEdge, quality, keepPngOk) => {
      const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      // 只在源图本来就不大时保留 PNG（大 PNG 重编码又慢又大，纯浪费）
      const keepPng = keepPngOk && /png/i.test(file.type) && file.size < NORMAL_CAP;
      const type = keepPng ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(r => canvas.toBlob(r, type, quality));
      if (!blob) return null;
      const ext = keepPng ? '.png' : '.jpg';
      return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + ext, { type });
    };

    let out = null;
    if (fidelity) {
      out = await encode(2048, 0.95, true);
      if (out && out.size > FIDELITY_CAP) {
        const j = await encode(2048, 0.95, false);
        if (j && j.size < out.size) out = j;
      }
      if (out && out.size > FIDELITY_CAP) {
        const j2 = await encode(1800, 0.92, false);
        if (j2 && j2.size < out.size) out = j2;
      }
    } else {
      out = await encode(2048, 0.9, true);
      for (const [edge, q] of [[1600, 0.85], [1280, 0.8]]) {
        if (out && out.size <= NORMAL_CAP) break;
        const next = await encode(edge, q, false);
        if (next && next.size < out.size) out = next;
      }
    }

    // 压完反而更大就别压了（原图本来就不大时常见）
    if (!out || out.size >= file.size) out = file;
    return { file: out, mode: fidelity ? 'fidelity' : 'normal', detail };
  } catch {
    return { file, mode: 'raw', detail: 0 };
  }
}

/** 分片并行上传：4 条连接同时发，绕开单连接的拥塞窗口限制 */
async function uploadChunked(dataUrl, mime, onProgress) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const N = b64.length > 700 * 1024 ? 4 : b64.length > 250 * 1024 ? 2 : 1;

  if (N === 1) {
    const r = await uploadWithProgress(dataUrl, mime, onProgress);
    return { status: r.status, ok: r.ok, j: r.j };
  }

  const init = await api('/upload/init', { method: 'POST', body: { mime } });
  const ij = await init.json().catch(() => ({}));
  if (!init.ok) return { status: init.status, ok: false, j: ij };

  const chunk = Math.ceil(b64.length / N);
  const parts = Array.from({ length: N }, (_, i) => b64.slice(i * chunk, (i + 1) * chunk));
  const prog = new Array(N).fill(0);
  const tick = () => onProgress(prog.reduce((a, b) => a + b, 0) / N);

  await Promise.all(parts.map((part, i) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', base() + '/upload/part');
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.setRequestHeader('x-token', LS.token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) { prog[i] = e.loaded / e.total; tick(); }
    };
    xhr.onload = () => { prog[i] = 1; tick(); resolve(); };
    xhr.onerror = () => reject(new Error('分片 ' + (i + 1) + ' 上传失败'));
    xhr.timeout = 180000;
    xhr.send(JSON.stringify({ id: ij.id, index: i, b64: part }));
  })));

  const fin = await api('/upload/finish', { method: 'POST', body: { id: ij.id } });
  const fj = await fin.json().catch(() => ({}));
  return { status: fin.status, ok: fin.ok, j: fj };
}

/** 带进度的上传（fetch 拿不到上传进度，用 XHR） */
function uploadWithProgress(dataUrl, mime, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', base() + '/upload');
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.setRequestHeader('x-token', LS.token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      let j = {};
      try { j = JSON.parse(xhr.responseText); } catch {}
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, j });
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.ontimeout = () => reject(new Error('超时'));
    xhr.timeout = 120000;
    xhr.send(JSON.stringify({ b64: dataUrl, mime }));
  });
}

/** OSS 直传：浏览器直接把文件 POST 给阿里云，不经过隧道 */
async function uploadViaOss(file, onProgress) {
  let sign;
  try {
    const r = await api('/oss/sign', { method: 'POST', body: { mime: file.type } });
    if (r.status === 501) return { skipped: true };
    sign = await r.json().catch(() => ({}));
    if (!r.ok) return { skipped: true, error: errText(r.status, sign) };
  } catch {
    return { skipped: true };
  }

  const fd = new FormData();
  fd.append('key', sign.key);
  fd.append('policy', sign.policy);
  fd.append('OSSAccessKeyId', sign.accessId);
  fd.append('signature', sign.signature);
  fd.append('success_action_status', '200');
  fd.append('file', file);

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', sign.host, true);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('OSS ' + xhr.status));
      xhr.onerror = () => reject(new Error('直传被浏览器拦下（OSS 跨域未配置）'));
      xhr.timeout = 120000;
      xhr.send(fd);
    });
    return { url: sign.url };
  } catch (e) {
    return { skipped: true, error: e.message };
  }
}

const pendingUploads = new Set();

async function uploadFile(file) {
  const task = doUploadFile(file);
  pendingUploads.add(task);
  try { return await task; } finally { pendingUploads.delete(task); }
}

async function doUploadFile(file) {
  if (!file || !/^image\//.test(file.type)) { alert('只支持图片'); return; }
  if (state.attachments.length + state.uploading.length >= MAX_REF_IMAGES) {
    alert('一条消息最多带 ' + MAX_REF_IMAGES + ' 张图');
    return;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) { alert('图片不能超过 ' + MAX_IMAGE_MB + 'MB'); return; }

  // 上传中的占位放进 state，切换对话也不会「看起来消失」
  const rec = { id: Math.random().toString(36).slice(2), label: state.rawUpload ? '原图上传' : '上传中', pct: 0, kb: 0 };
  state.uploading.push(rec);
  renderAttach();

  try {
    const shrunk = state.rawUpload ? { file, mode: 'raw', detail: 0 } : await shrinkImage(file);
    const small = shrunk.file;
    if (small.size > MAX_IMAGE_MB * 1024 * 1024) { alert('压缩后仍超过 ' + MAX_IMAGE_MB + 'MB'); return; }
    if (shrunk.mode === 'fidelity' && !state.fidelity) {
      flashHint('检测到高频纹理，已按保真上传（' + Math.round(small.size / 1024) + 'KB，细节优先）');
    }

    rec.kb = Math.max(1, Math.round(small.size / 1024));
    const prog = (p) => { rec.pct = Math.round(p * 100); renderAttach(); };
    renderAttach();

    // 1) 优先走 OSS 直传
    const oss = await uploadViaOss(small, prog);
    if (oss.url) {
      state.attachments.push({ url: oss.url, name: small.name, oss: true, mode: shrunk.mode, detail: Math.round(shrunk.detail) });
      return;
    }
    if (oss.error) { rec.label = '改走服务器'; renderAttach(); }

    // 2) 回退：经隧道分片上传
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(small);
    });

    const { status, ok, j } = await uploadChunked(dataUrl, small.type, prog);
    if (!ok) { alert(errText(status, j)); return; }
    state.attachments.push({ url: j.url, name: small.name, mode: shrunk.mode, detail: Math.round(shrunk.detail) });
  } catch (err) {
    alert('上传失败：' + ((err && err.message) || err));
  } finally {
    state.uploading = state.uploading.filter((x) => x !== rec);
    renderAttach();
  }
}
$('#fileInput').addEventListener('change', async (e) => {
  for (const f of e.target.files) await uploadFile(f);
  e.target.value = '';
});

/* 粘贴图片：监听整页，不要求焦点在输入框 */
function pickImageFiles(dt) {
  if (!dt) return [];
  const out = [];
  if (dt.files && dt.files.length) {
    for (const f of dt.files) if (/^image\//.test(f.type)) out.push(f);
  }
  if (!out.length && dt.items) {
    for (const it of dt.items) {
      if (it.kind === 'file' && /^image\//.test(it.type)) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}

document.addEventListener('paste', (e) => {
  if (!LS.token) return;
  const files = pickImageFiles(e.clipboardData);
  if (!files.length) return;
  e.preventDefault();
  for (const f of files) uploadFile(f);
}, true);

/* 拖图进输入区也能上传 */
['dragover', 'drop'].forEach((evt) => {
  $('#composer').addEventListener(evt, (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    if (evt === 'drop') {
      const files = pickImageFiles(e.dataTransfer);
      for (const f of files) uploadFile(f);
    }
  });
});

/* ---------------- 代码面板 ---------------- */
const FILE_RE = /```file:([^\n`]+)\n([\s\S]*?)```/g;

function extractFiles(text) {
  const files = [];
  FILE_RE.lastIndex = 0;
  let m;
  while ((m = FILE_RE.exec(text))) {
    files.push({ name: m[1].trim(), content: m[2].replace(/\s+$/, '') + '\n' });
  }
  if (!files.length) return { files: [], text };
  const cleaned = text.replace(FILE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { files, text: cleaned };
}

function applyFiles(cv, incoming) {
  cv.files = cv.files || [];
  for (const f of incoming) {
    const i = cv.files.findIndex(x => x.name === f.name);
    if (i >= 0) cv.files[i] = { ...f, updatedAt: Date.now() };
    else cv.files.push({ ...f, updatedAt: Date.now() });
  }
}

function openCodePane() {
  document.body.classList.add('coding');
  $('#codepane').hidden = false;
  renderCode();
}

function closeCodePane() {
  document.body.classList.remove('coding');
  $('#codepane').hidden = true;
}

function renderCode() {
  const pane = $('#codepane');
  if (pane.hidden) return;
  const cv = current();
  const files = (cv && cv.files) || [];
  const tabs = $('#codeTabs');
  tabs.textContent = '';

  files.forEach((f, i) => {
    const t = el('div', 'tab' + (i === state.fileIdx ? ' on' : ''));
    t.append(el('span', null, f.name));
    const x = el('i', null, '×');
    x.title = '删除文件';
    x.addEventListener('click', (e) => { e.stopPropagation(); deleteFile(i); });
    t.append(x);
    t.addEventListener('click', () => { state.fileIdx = i; renderCode(); });
    tabs.append(t);
  });

  if (!files.length) {
    $('#codeName').textContent = '还没有文件';
    $('#codeStat').textContent = '';
    $('#codeArea').value = '';
    $('#codeArea').disabled = true;
    return;
  }

  if (state.fileIdx >= files.length) state.fileIdx = files.length - 1;
  const f = files[state.fileIdx];
  $('#codeName').textContent = f.name;
  $('#codeArea').disabled = false;
  if (document.activeElement !== $('#codeArea') || $('#codeArea').dataset.for !== f.name) {
    $('#codeArea').value = f.content || '';
    $('#codeArea').dataset.for = f.name;
  }
  const lines = (f.content || '').split('\n').length;
  $('#codeStat').textContent = lines + ' 行 · ' + (f.content || '').length + ' 字符';

  if (!$('#codeFrame').hidden) {
    if (canPreview(f)) renderPreview();
    else closePreview();
  }
}

let codeSaveTimer = null;
function scheduleCodeSave() {
  clearTimeout(codeSaveTimer);
  codeSaveTimer = setTimeout(async () => {
    const cv = current();
    if (!cv) return;
    await saveConv(cv);
  }, 800);
}

$('#codeArea').addEventListener('input', () => {
  const cv = current();
  if (!cv || !cv.files || !cv.files[state.fileIdx]) return;
  cv.files[state.fileIdx].content = $('#codeArea').value;
  cv.files[state.fileIdx].updatedAt = Date.now();
  const f = cv.files[state.fileIdx];
  $('#codeStat').textContent = f.content.split('\n').length + ' 行 · ' + f.content.length + ' 字符';
  if (!$('#codeFrame').hidden) {
    clearTimeout(window.__pvTimer);
    window.__pvTimer = setTimeout(renderPreview, 500);
  }
  scheduleCodeSave();
});

async function deleteFile(i) {
  const cv = current();
  if (!cv || !cv.files) return;
  const name = cv.files[i].name;
  if (!confirm('删除文件「' + name + '」？')) return;
  cv.files.splice(i, 1);
  if (state.fileIdx >= cv.files.length) state.fileIdx = Math.max(0, cv.files.length - 1);
  await saveConv(cv);
  renderCode();
}

$('#codeNew').addEventListener('click', async () => {
  const cv = current();
  if (!cv) return;
  const name = prompt('新文件名（相对路径，如 src/main.py）', 'untitled.txt');
  if (!name) return;
  cv.files = cv.files || [];
  if (cv.files.some(f => f.name === name)) { state.fileIdx = cv.files.findIndex(f => f.name === name); renderCode(); return; }
  cv.files.push({ name: name.replace(/\\/g, '/').trim(), content: '', updatedAt: Date.now() });
  state.fileIdx = cv.files.length - 1;
  await saveConv(cv);
  renderCode();
});

$('#codeDownload').addEventListener('click', () => {
  const cv = current();
  const f = cv && cv.files && cv.files[state.fileIdx];
  if (!f) return;
  const blob = new Blob([f.content || ''], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = f.name.split('/').pop();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
});

/* ---- HTML / SVG 预览（sandbox iframe） ---- */
function canPreview(f) { return !!f && /\.(html?|svg)$/i.test(f.name); }

function renderPreview() {
  const frame = $('#codeFrame');
  if (frame.hidden) return;
  const cv = current();
  const f = cv && cv.files && cv.files[state.fileIdx];
  if (!f) return;

  if (/\.svg$/i.test(f.name)) {
    frame.srcdoc = '<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh">' + f.content + '</body></html>';
    return;
  }
  frame.srcdoc = inlineAssets(f.content, (cv && cv.files) || []);
}

/** 把 <link href="x.css"> / <script src="x.js"> 换成同会话里的文件内容 */
function inlineAssets(html, files) {
  const byName = new Map(files.map(x => [x.name, x.content || '']));
  const find = (ref) => {
    const clean = String(ref).split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\//, '');
    if (byName.has(clean)) return byName.get(clean);
    const base = clean.split('/').pop();
    for (const [n, c] of byName) if (n === base || n.endsWith('/' + base)) return c;
    return null;
  };

  let out = html;
  out = out.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href) => {
    if (/^(https?:)?\/\//i.test(href) || /^data:/i.test(href)) return m;
    const css = find(href);
    return css != null ? '<style>\n' + css + '\n</style>' : m;
  });
  out = out.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
    if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) return m;
    const js = find(src);
    return js != null ? '<script' + a + b + '>\n' + js + '\n</script>' : m;
  });
  return out;
}

function closePreview() {
  $('#codeFrame').hidden = true;
  $('#codeArea').hidden = false;
  $('#codePreview').classList.remove('on');
}

$('#codePreview').addEventListener('click', () => {
  const cv = current();
  const f = cv && cv.files && cv.files[state.fileIdx];
  if (!f) return;
  if (!canPreview(f)) { alert('只有 .html / .svg 能预览'); return; }
  const frame = $('#codeFrame');
  const open = frame.hidden;
  frame.hidden = !open;
  $('#codeArea').hidden = open;
  $('#codePreview').classList.toggle('on', open);
  if (open) renderPreview();
  else closePreview();
});

$('#codeClose').addEventListener('click', () => setCap('code', false));

/* 复制当前文件全文（Maya 脚本这类直接粘贴运行，不用下载） */
$('#codeCopy').addEventListener('click', async () => {
  const cv = current();
  const f = cv && cv.files && cv.files[state.fileIdx];
  if (!f) return;
  const text = f.content || '';
  const btn = $('#codeCopy');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.textContent = '✓';
    btn.title = '已复制 ' + text.length + ' 字符';
    setTimeout(() => { btn.textContent = '⧉'; btn.title = '复制当前文件全文'; }, 1200);
  } catch {
    alert('复制失败，请手动全选复制');
  }
});

/* 功能简介 */
$('#btnAbout').addEventListener('click', () => {
  const b = $('#aboutBuild');
  if (b) b.textContent = '当前版本：' + APP_BUILD;
  $('#dlgAbout').hidden = false;
});
$('#aboutClose').addEventListener('click', () => { $('#dlgAbout').hidden = true; });


$('#handoffBtn').addEventListener('click', async () => {
  const cv = current();
  if (!cv) return;
  const msgs = cv.messages.slice(cv.cutIndex || 0).filter(m => !m.err && !m.streaming && m.role !== 'divider');
  if (msgs.length < 2) { alert('对话还太短，不用交接。'); return; }
  if (!confirm('把这段对话压成一份交接文档？之后只发送「文档 + 新消息」，上面的原文保留但不再发给模型。')) return;

  const btn = $('#handoffBtn');
  btn.disabled = true; btn.textContent = '生成中…';
  try {
    const r = await api('/summarize', { method: 'POST', body: { model: LS.model, messages: msgs.map(m => ({ role: m.role, text: m.text })) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(errText(r.status, j));
    const divider = { role: 'divider', text: '以上 ' + msgs.length + ' 条已归档为交接文档，之后不再发送给模型', ts: Date.now() };
    const doc = { role: 'assistant', kind: 'handoff', text: j.text, ts: Date.now() };
    cv.messages.push(divider, doc);
    cv.cutIndex = cv.messages.indexOf(doc);
    delete cv.usage;
    await saveConv(cv);
    renderAll();
    scrollBottom(true);
  } catch (e) {
    alert('生成失败：' + ((e && e.message) || e));
  } finally {
    btn.disabled = false; btn.textContent = '交接文档';
  }
});

/* ---------------- 项目 ---------------- */
let editingProject = null;

function openProjectDialog(p) {
  editingProject = p;
  $('#projTitle').textContent = p ? '项目指令' : '新建项目';
  $('#projName').value = p ? p.name : '';
  $('#projIns').value = p ? (p.instructions || '') : '';
  $('#projDelete').hidden = !p;
  $('#dlgProject').hidden = false;
}

$('#projCancel').addEventListener('click', () => { $('#dlgProject').hidden = true; });

$('#projSave').addEventListener('click', async () => {
  const name = $('#projName').value.trim() || '未命名项目';
  const instructions = $('#projIns').value;
  const r = editingProject
    ? await api('/projects/' + editingProject.id, { method: 'PUT', body: { name, instructions } })
    : await api('/projects', { method: 'POST', body: { name, instructions } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { alert(errText(r.status, j)); return; }
  $('#dlgProject').hidden = true;
  await loadProjects();
  renderSide();
});

$('#projDelete').addEventListener('click', async () => {
  if (!editingProject) return;
  if (!confirm('删除项目「' + editingProject.name + '」？里面的对话会变成未分类，不会删。')) return;
  const r = await api('/projects/' + editingProject.id, { method: 'DELETE' });
  if (!r.ok) { alert('删除失败'); return; }
  $('#dlgProject').hidden = true;
  await Promise.all([loadProjects(), loadConvs()]);
  renderAll();
});

/* ---------------- 自定义指令 ---------------- */
async function openInstructions() {
  const r = await api('/me/instructions');
  const j = await r.json().catch(() => ({}));
  const ins = j.instructions || {};
  $('#insStyle').value = ins.style || '';
  $('#insAbout').value = ins.about || '';
  $('#dlgIns').hidden = false;
}

$('#insCancel').addEventListener('click', () => { $('#dlgIns').hidden = true; });
$('#insSave').addEventListener('click', async () => {
  const r = await api('/me/instructions', { method: 'PUT', body: { style: $('#insStyle').value, about: $('#insAbout').value } });
  if (!r.ok) { alert('保存失败'); return; }
  $('#dlgIns').hidden = true;
});

/* ---------------- 成员 ---------------- */
async function openUsers() {
  $('#dlgUsers').hidden = false;
  const box = $('#userList');
  box.textContent = '加载中…';
  const r = await api('/users');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { box.textContent = errText(r.status, j); return; }
  box.textContent = '';
  for (const u of j.users || []) {
    const row = el('div', 'mrow' + (u.blocked ? ' blocked' : ''));
    row.append(el('div', 'avatar', String(u.name).slice(0, 1)));
    const mi = el('div', 'mi');
    mi.append(el('div', 'mn', u.name));
    const role = { astra: 'Astra', admin: '管理员' }[u.role] || '普通';
    mi.append(el('div', 'mm', role + ' · 进过 ' + (u.logins || 0) + ' 次 · ' + (u.lastSeen ? when(u.lastSeen) : '—')));
    row.append(mi);

    const rn = el('button', 'mb', '改名');
    rn.addEventListener('click', async () => {
      const to = prompt('把「' + u.name + '」改成？', u.name);
      if (!to || to.trim() === u.name) return;
      const rr = await api('/users/rename', { method: 'POST', body: { from: u.name, to: to.trim() } });
      const jj = await rr.json().catch(() => ({}));
      if (!rr.ok) { alert(errText(rr.status, jj)); return; }
      if (jj.token) { LS.token = jj.token; LS.name = jj.to; renderIdentity(); }
      openUsers();
    });

    const blk = el('button', 'mb' + (u.blocked ? '' : ' red'), u.blocked ? '解封' : '拉黑');
    blk.addEventListener('click', async () => {
      if (!u.blocked && !confirm('拉黑「' + u.name + '」？他之后进不来。')) return;
      const rr = await api('/users/block', { method: 'POST', body: { name: u.name, blocked: !u.blocked } });
      if (!rr.ok) { alert('操作失败'); return; }
      openUsers();
    });

    row.append(rn, blk);
    box.append(row);
  }
}

$('#usersClose').addEventListener('click', () => { $('#dlgUsers').hidden = true; });

/* ---------------- 设置 ---------------- */
$('#cfgBtn').addEventListener('click', () => {
  $('#cfgBackend').value = LS.backend;
  $('#cfgModels').value = LS.models.join(',');
  $('#dlgCfg').hidden = false;
});
$('#cfgCancel').addEventListener('click', () => { $('#dlgCfg').hidden = true; });
$('#cfgSave').addEventListener('click', () => {
  LS.backend = $('#cfgBackend').value.trim();
  LS.models = $('#cfgModels').value.split(',').map(s => s.trim()).filter(Boolean);
  $('#dlgCfg').hidden = true;
  renderModels();
});

/* ---------------- 弹层 / 交互 ---------------- */
const pops = ['modelPop', 'menuPop', 'userPop', 'plusPop', 'newPop'];
function closePops(except) { pops.forEach(id => { if (id !== except) $('#' + id).hidden = true; }); }

$('#modelBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#modelPop'); const h = p.hidden; closePops(); p.hidden = !h; });
$('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#menuPop'); const h = p.hidden; closePops(); p.hidden = !h; });
$('#meBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#userPop'); const h = p.hidden; closePops(); p.hidden = !h; });
$('#plusBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#plusPop'); const h = p.hidden; closePops(); p.hidden = !h; });
document.addEventListener('click', () => closePops());

$('#effRange').addEventListener('input', (e) => {
  const l = effortsFor(LS.model);
  LS.effort = l[Number(e.target.value)] || l[0];
  renderEffort();
  persistSettings();
});

/* ---- 能力开关：默认不显示，开了才浮在输入框上方 ---- */
const DEFAULT_PH = '发消息…（Enter 发送，Shift+Enter 换行，可粘贴图片）';
const CAP_DEFS = [
  { k: 'image', icon: '🖼️', label: '画图' },
  { k: 'gif', icon: '🎞️', label: '动图' },
  { k: 'code', icon: '🧑‍💻', label: '编程模式' },
  { k: 'search', icon: '🌐', label: '联网搜索' },
  { k: 'fidelity', icon: '🔍', label: '保真' },
  { k: 'raw', icon: '📷', label: '原图' },
];

function capOn(k) {
  if (k === 'image') return state.imageMode;
  if (k === 'gif') return state.gifMode;
  if (k === 'code') return state.codeMode;
  if (k === 'search') return state.search;
  if (k === 'fidelity') return state.fidelity;
  if (k === 'raw') return state.rawUpload;
  return false;
}

function renderCaps() {
  const box = $('#caps');
  const active = CAP_DEFS.filter(c => capOn(c.k));
  box.textContent = '';
  box.hidden = active.length === 0;

  for (const c of active) {
    const b = el('button', 'cap on');
    b.type = 'button';
    b.title = c.k === 'image' ? '鼠标移上来调参数，点击关闭' : '点击关闭「' + c.label + '」';
    b.innerHTML = '<span class="ci">' + c.icon + '</span>' + c.label + '<span class="x">×</span>';
    b.addEventListener('click', () => setCap(c.k, false));
    if (c.k === 'image' || c.k === 'gif') {
      b.addEventListener('mouseenter', () => showDrawPanel(b));
      b.addEventListener('mouseleave', hideDrawPanelSoon);
    }
    box.append(b);
  }
  $('#plusBtn').classList.toggle('on', active.length > 0);
}

function setCap(kind, on) {
  if (kind === 'image') {
    state.imageMode = on;
    input.placeholder = on ? '描述你想生成的画面…（鼠标移到「画图」标签上可调参数）' : DEFAULT_PH;
  } else if (kind === 'gif') {
    state.gifMode = on;
    input.placeholder = on ? '描述动作（挂着图就是让这张图动起来）…' : DEFAULT_PH;
  } else if (kind === 'search') {
    state.search = on;
  } else if (kind === 'fidelity') {
    state.fidelity = on;
    LS.fidelity = on;
    input.placeholder = on ? '保真：高频纹理/小字不上强压缩（上传会更慢）…' : DEFAULT_PH;
  } else if (kind === 'raw') {
    state.rawUpload = on;
  } else if (kind === 'code') {
    state.codeMode = on;
    if (on) { openCodePane(); if (!input.value.trim()) input.placeholder = '描述你要写的功能，GPT 会把文件写进右侧面板…'; }
    else { closeCodePane(); input.placeholder = DEFAULT_PH; }
  }
  renderCaps();
  if (!applyingSettings) persistSettings();
}

document.querySelectorAll('#plusPop .opt').forEach(o => {
  o.addEventListener('click', () => {
    const mode = o.dataset.mode;
    closePops();
    if (mode === 'upload') { $('#fileInput').click(); return; }
    if (mode === 'drawcfg') { openDrawDialog(); return; }
    setCap(mode, !capOn(mode));
  });
});

/* 画图参数面板：并排按钮，选中高亮 */
const DRAW_GROUPS = [
  { key: 'size', label: '尺寸', opts: [['1024x1024', '1024²'], ['1536x1024', '1536×1024'], ['1024x1536', '1024×1536'], ['auto', 'auto']] },
  { key: 'quality', label: '质量', opts: [['auto', 'auto'], ['low', '低'], ['medium', '中'], ['high', '高']] },
  { key: 'complexity', label: '复杂度', opts: [['', '默认'], ['low', '低'], ['medium', '中'], ['high', '高']] },
  { key: 'bg', label: '背景', opts: [['', 'auto'], ['opaque', '不透明'], ['transparent', '透明']] },
  { key: 'n', label: '张数', opts: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['6', '6'], ['10', '10']] },
  { key: 'format', label: '格式', opts: [['png', 'png'], ['webp', 'webp'], ['jpeg', 'jpeg'], ['gif', 'GIF'], ['svg', 'svg']] },
];

/** 当前参数的一句话摘要 + 费用提示（面板底部显示） */
function drawSummary(d) {
  const isGif = d.format === 'gif';
  const parts = [];
  if (isGif) {
    const frames = Math.max(2, Math.min(16, Number(d.frames) || 8));
    parts.push('GIF ' + frames + ' 帧', '每帧 ' + gifSizeForFrames(frames, d.size).replace('x', '×'));
  } else {
    parts.push('尺寸 ' + (d.size === 'custom' ? (d.custom || '待填') : d.size));
    if (d.quality && d.quality !== 'auto') parts.push('质量 ' + d.quality);
    if (d.complexity) parts.push('复杂度 ' + d.complexity);
  }
  const n = Number(d.n) || 1;
  if (n > 1) parts.push('要 ' + n + ' 张');
  return parts.join(' · ');
}

function renderDrawPanel() {
  const d = LS.draw;
  const body = $('#drawPopBody');
  if (!body) return;
  body.textContent = '';

  for (const g of DRAW_GROUPS) {
    const row = el('div', 'seg-row');
    row.append(el('span', 'seg-label', g.label));
    const seg = el('div', 'seg');
    for (const [val, text] of g.opts) {
      const cur = String(d[g.key] == null ? '' : d[g.key]) === val;
      const b = el('button', 'seg-btn' + (cur ? ' on' : ''), text);
      b.type = 'button';
      b.addEventListener('click', () => {
        const nd = Object.assign({}, LS.draw);
        nd[g.key] = g.key === 'n' ? Number(val) : val;
        const { s, notes } = normalizeDraw(nd, g.key);
        LS.draw = s;
        if (notes.length) showToast(notes.join('<br>'));
        renderDrawPanel();
      });
      seg.append(b);
    }
    row.append(seg);
    body.append(row);
  }

  const note = el('div', 'seg-note');
  note.textContent = drawSummary(LS.draw);
  body.append(note);
  const n = Number(LS.draw.n) || 1;
  if (n > 1) {
    const cost = el('div', 'seg-cost');
    cost.textContent = '要 ' + n + ' 张 = 出图 ' + n + ' 次，费用按张叠加';
    body.append(cost);
  }
}

let drawPopTimer = null;

function showDrawPanel(anchor) {
  clearTimeout(drawPopTimer);
  const p = $('#drawPop');
  renderDrawPanel();
  p.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth || 250;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  let top = r.bottom + 8;
  if (top + p.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - p.offsetHeight - 8);
  p.style.left = left + 'px';
  p.style.top = top + 'px';
}

function hideDrawPanelSoon() {
  clearTimeout(drawPopTimer);
  drawPopTimer = setTimeout(() => { $('#drawPop').hidden = true; }, 220);
}

$('#barMore').addEventListener('click', () => {
  $('#drawPop').hidden = true;
  openDrawDialog();
});

/* 鼠标进面板时不要收起来 */
(function () {
  const pop = $('#drawPop');
  pop.addEventListener('mouseenter', () => clearTimeout(drawPopTimer));
  pop.addEventListener('mouseleave', hideDrawPanelSoon);
})();

/* ---------------- 参数冲突：自动降档 + 解释 ---------------- */
let toastTimer = null;
/** 全局小提示：参数被自动改小时说明原因 */
function showToast(msg, ms) {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 5200);
}

/** "1024x1024" → 像素数；auto/非法返回 0 */
function sizePixels(s) {
  const p = parseSize(s);
  return p ? p.w * p.h : 0;
}

/** 给定尺寸最多能放几帧；返回 0 表示这个尺寸在任何帧数下都放不下 */
function maxFramesForSize(size) {
  if (!parseSize(size)) return 16;
  const px = sizePixels(size);
  for (let n = 16; n >= 2; n--) if (sizePixels(gifSizeForFrames(n)) >= px) return n;
  return 0;
}

/**
 * 把一组画图参数收敛成「上游一定接受」的组合，并解释为什么改。
 * changed 表示用户刚动的是哪个字段，决定往哪边让步：
 *  - 动帧数 → 降尺寸
 *  - 动尺寸 → 降帧数
 */
function normalizeDraw(input, changed) {
  const s = Object.assign({}, input);
  const notes = [];
  const model = String(s.model || '');

  s.n = Math.min(10, Math.max(1, Number(s.n) || 1));
  s.frames = Math.max(2, Math.min(16, Number(s.frames) || 8));

  if ((s.quality === 'xhigh' || s.quality === 'max') && !/^gpt-image-2\.5/.test(model)) {
    notes.push('xhigh / max 只有 2.5 系模型支持，质量已降为 <b>high</b>');
    s.quality = 'high';
  }
  if (s.complexity && !/^gpt-image-2\.6/.test(model)) {
    notes.push('complexity 是 2.6 系模型才有的参数，已清空');
    s.complexity = '';
  }
  if (s.bg === 'transparent' && !['png', 'webp'].includes(s.format)) {
    notes.push('透明背景只能输出 png / webp，格式已改为 <b>png</b>');
    s.format = 'png';
  }
  if (s.format === 'gif' && s.n > 1) {
    notes.push('GIF 只支持单张，张数已改为 <b>1</b>');
    s.n = 1;
  }
  if (s.format === 'svg' && s.n > 1) {
    notes.push('SVG 每次只能出 1 张，张数已改为 <b>1</b>');
    s.n = 1;
  }

  if (s.format === 'gif') {
    const want = s.size === 'custom' ? s.custom : s.size;
    const applyCap = () => {
      const capped = gifSizeForFrames(s.frames, want);
      if (sizePixels(want) <= sizePixels(capped)) return;
      const from = want.replace('x', '×');
      const to = capped.replace('x', '×');
      notes.push(s.frames + ' 帧时每帧上限 <b>' + to + '</b>（帧图集 ≤8,294,400 像素），尺寸已从 ' + from + ' 降到 ' + to);
      s.custom = capped;
      s.size = PRESET_SIZES.includes(capped) ? capped : 'custom';
    };
    if (parseSize(want)) {
      const max = maxFramesForSize(want);
      if (max === 0) {
        // 这个尺寸任何帧数都放不下 → 降尺寸，保留帧数
        applyCap();
      } else if (changed === 'size' && s.frames > max) {
        notes.push(want.replace('x', '×') + ' 最多 <b>' + max + ' 帧</b>（帧图集 ≤8,294,400 像素），帧数已从 ' + s.frames + ' 降到 ' + max);
        s.frames = max;
      } else if (changed !== 'size') {
        applyCap();
      }
    }
  }
  return { s, notes };
}

/** 帧数 × 尺寸两个方向都提示，避免用户自己试错 */
function updateGifHint() {
  const h = $('#gifAutoHint');
  if (!h) return;
  const f = Number($('#gifFrames').value) || 8;
  const requested = $('#drawSize').value === 'custom' ? $('#drawCustomSize').value : $('#drawSize').value;
  if (!parseSize(requested)) {
    h.textContent = '帧图集上限：长边 ≤3840、总像素 ≤8,294,400 → ' + f + ' 帧每帧最大 ' + gifSizeForFrames(f).replace('x', '×');
    return;
  }
  const maxF = maxFramesForSize(requested);
  const maxForF = gifSizeForFrames(f, requested).replace('x', '×');
  h.textContent = '帧图集上限：' + f + ' 帧 → 每帧最大 ' + maxForF + '；' + requested.replace('x', '×') + ' → 最多 ' + maxF + ' 帧';
}

/** 自定义尺寸校验 + 张数费用提示 */
function updateDrawHints() {
  const custom = $('#drawSize').value === 'custom';
  $('#drawCustomSizeWrap').hidden = !custom;
  const box = $('#drawCustomSize');
  const bad = custom && !!box.value.trim() && !parseSize(box.value);
  box.classList.toggle('bad', bad);
  const n = Math.min(10, Math.max(1, Number($('#drawN').value) || 1));
  const parts = [];
  if (custom) {
    const ok = parseSize(box.value);
    parts.push(ok ? '自定义 ' + ok.w + '×' + ok.h + '（' + (ok.w * ok.h).toLocaleString() + ' 像素）'
      : '写成 宽x高（如 1536x864）：16 的倍数、单边 ≤3840、总像素 ≤8,294,400、比例 1:3–3:1');
  }
  if (n > 1) parts.push('要 ' + n + ' 张 → 出图 ' + n + ' 次，费用按张叠加');
  $('#drawCostHint').textContent = parts.join('　|　');
  updateGifHint();
}

/** xhigh / max 只有 2.5 系支持：这里只负责灰掉，改值交给 normalizeDraw（才带提示） */
function syncQualityOptions(model) {
  const sel = $('#drawQuality');
  const advanced = /^gpt-image-2\.5/.test(model || '');
  for (const opt of sel.options) {
    if (opt.value !== 'xhigh' && opt.value !== 'max') continue;
    opt.disabled = !advanced;
  }
}

function readDrawForm() {
  return {
    model: $('#drawModel').value,
    size: $('#drawSize').value,
    custom: $('#drawCustomSize').value.trim(),
    quality: $('#drawQuality').value,
    complexity: $('#drawComplexity').value,
    bg: $('#drawBg').value,
    moderation: $('#drawModeration').value,
    format: $('#drawFormat').value,
    n: Number($('#drawN').value) || 1,
    compression: Number($('#drawCompression').value),
    frames: Number($('#gifFrames').value) || 8,
    dur: Number($('#gifDur').value) || 150,
  };
}

function writeDrawForm(s) {
  $('#drawSize').value = s.size;
  $('#drawCustomSize').value = s.custom || '';
  $('#drawCustomSizeWrap').hidden = s.size !== 'custom';
  $('#drawQuality').value = s.quality;
  $('#drawComplexity').value = s.complexity || '';
  $('#drawBg').value = s.bg || '';
  $('#drawFormat').value = s.format;
  $('#drawN').value = String(s.n);
  $('#gifFrames').value = String(s.frames);
}

/** 任一字段变化：收敛参数 → 提示原因 → 刷新说明 */
function onDrawField(key) {
  const { s, notes } = normalizeDraw(readDrawForm(), key);
  if (notes.length) writeDrawForm(s);
  syncQualityOptions(s.model);
  updateDrawHints();
  if (notes.length) showToast(notes.join('<br>'));
}

/* 画图设置 */
function openDrawDialog() {
  const d = LS.draw;
  $('#drawModel').value = d.model;
  $('#drawBg').value = d.bg || '';
  $('#drawModeration').value = d.moderation || 'auto';
  $('#drawCompression').value = String(d.compression != null ? d.compression : 100);
  const nSel = $('#drawN');
  if (!nSel.options.length) {
    for (let i = 1; i <= 10; i++) { const o = el('option', null, String(i)); o.value = String(i); nSel.append(o); }
  }
  const f = $('#gifFrames');
  if (!f.options.length) {
    for (let i = 2; i <= 16; i++) { const o = el('option', null, String(i)); o.value = String(i); f.append(o); }
  }
  $('#gifDur').value = String(d.dur);
  writeDrawForm(Object.assign({ n: 1, frames: 8, format: 'png', quality: 'auto', complexity: '', size: '1024x1024', custom: '' }, d));
  syncQualityOptions(d.model);
  updateDrawHints();
  $('#dlgDraw').hidden = false;
}

const DRAW_FIELD_KEYS = {
  '#drawModel': 'model', '#drawSize': 'size', '#drawCustomSize': 'size', '#drawN': 'n',
  '#drawFormat': 'format', '#drawQuality': 'quality', '#drawComplexity': 'complexity',
  '#drawBg': 'bg', '#gifFrames': 'frames', '#gifDur': 'dur',
};
Object.entries(DRAW_FIELD_KEYS).forEach(([sel, key]) => {
  $(sel).addEventListener('change', () => onDrawField(key));
});
['#drawCustomSize', '#drawN'].forEach((sel) => {
  $(sel).addEventListener('input', () => onDrawField(DRAW_FIELD_KEYS[sel]));
});
$('#drawCancel').addEventListener('click', () => { $('#dlgDraw').hidden = true; });
$('#drawSave').addEventListener('click', () => {
  const { s, notes } = normalizeDraw(readDrawForm(), 'save');
  if (s.size === 'custom' && !parseSize(s.custom)) {
    alert('自定义尺寸要写成 宽x高（如 1536x864）：16 的倍数、单边 ≤3840、总像素 ≤8,294,400（约合 3840×2160）、比例 1:3–3:1');
    $('#drawCustomSize').focus();
    return;
  }
  LS.draw = s;
  $('#dlgDraw').hidden = true;
  if (notes.length) showToast(notes.join('<br>'));
});

/** 尺寸下拉里的预设值；降档到别的值时要切到「自定义」，否则下拉会变空 */
const PRESET_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'];

/** 单张图像素预算：实测硬限（3840×2160 正好等于它，2880×2880 也能过） */
const SIZE_PIXEL_BUDGET = 8294400;
/** 单边上限 */
const SIZE_MAX_EDGE = 3840;

/**
 * 解析 "1536x864"。上游真正的限制是像素预算而不是固定 3840×2160：
 * 实测 2880×2880、2160×3840 都能出图，3840×2176 被 "exceeds the current pixel budget" 拒掉。
 * 规则：16 的倍数、单边 ≤3840、w*h ≤8,294,400、比例 1:3–3:1。不合规返回 null。
 */
function parseSize(s) {
  const m = String(s || '').trim().match(/^(\d{2,4})x(\d{2,4})$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h || w % 16 || h % 16) return null;
  if (w > SIZE_MAX_EDGE || h > SIZE_MAX_EDGE) return null;
  if (w * h > SIZE_PIXEL_BUDGET) return null;
  const ratio = w / h;
  if (ratio < 1 / 3 || ratio > 3) return null;
  return { w, h };
}

/**
 * GIF 尺寸跟着帧数走：上游把帧拼成一张 sheet（4 列排布），
 * sheet 长边 ≤3840、总像素 ≤8.29M，所以帧越多每帧必须越小。
 * 实测：8 帧 @768² = 3072×1536 可以；16 帧 @768² = 3072×3072 超预算被拒。
 * → ≤8 帧用 768²，9–16 帧用 512²（4×4 = 2048² 仍在预算内）
 */
function gifSizeForFrames(n, want) {
  const f = Math.max(2, Math.min(16, Number(n) || 8));
  // 帧数向上取 2 的幂再排网格：长边 ≤3840、总像素 ≤8,294,400
  let cells = 1;
  while (cells < f) cells *= 2;
  // 上游按 2 的幂做近似方形排布：2 帧 2×1、4 帧 2×2、8 帧 4×2、16 帧 4×4
  const cols = Math.pow(2, Math.round(Math.log2(cells) / 2));
  const rows = cells / cols;
  const cell = Math.min(3840 / Math.max(cols, rows), Math.sqrt(8294400 / cells));
  const maxCell = Math.max(256, Math.floor(cell / 16) * 16);   // size 必须是 16 的倍数
  const wantMax = parseSize(want) ? Math.max(parseSize(want).w, parseSize(want).h) : 0;
  const side = wantMax ? Math.min(wantMax, maxCell) : maxCell;
  return side + 'x' + side;
}

/** 单条消息最多带几张参考图（上游允许 1500 张/512MB，这里只做交互上的合理上限） */
const MAX_REF_IMAGES = 10;

/**
 * 决定这条消息走哪条路（纯函数，便于测试）
 * 规则：动图模式 > 关键词动图 > 画图模式 > 普通聊天
 * 返回 { route: 'gif' | 'draw' | 'chat', ref } —— ref 是参考图数组，最多 4 张
 */
function decideRoute({ text, hasAttach, attachUrl, attachUrls, gifMode, imageMode }) {
  const list = Array.isArray(attachUrls) && attachUrls.length
    ? attachUrls.filter(Boolean).slice(0, 10)
    : (attachUrl ? [attachUrl] : []);
  const ref = list.length ? list : null;
  const gifByWord = /(gif|动图|动画|动起来|会动的图)/i.test(text || '');
  if (gifMode || gifByWord) return { route: 'gif', ref };
  if (imageMode) return { route: 'draw', ref };
  return { route: 'chat', ref: null };
}

/* 任何真实交互都算「用户已动手」，初始化不再覆盖其选择 */
['pointerdown', 'keydown'].forEach((evt) => {
  document.addEventListener(evt, () => { state.touched = true; }, true);
});

$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.streaming) {
    if (state.controller) { state.controller.abort(); return; }
    // 出图/动图没有可中断的流，直接提示，别把输入吞掉
    flashHint('正在生成，稍等下再发；想取消等它结束');
    return;
  }

  // 还有图片在上传：等它们完成，再连图一起发（别发出去才发现图没了）
  if (pendingUploads.size > 0) {
    if (state.waitingUpload) return;
    state.waitingUpload = true;
    flashHint('图片上传中，等它完成再一起发送…');
    try { await Promise.allSettled([...pendingUploads]); } finally { state.waitingUpload = false; }
    if (!state.attachments.length) flashHint('图片没上传成功，已按纯文字发送');
  }

  const text = input.value.trim();
  const hasAttach = state.attachments.length > 0;
  if (!text && !hasAttach) return;

  const attachUrls = state.attachments.map((a) => a.url);
  const decision = decideRoute({
    text,
    hasAttach,
    attachUrl: hasAttach ? state.attachments[0].url : null,
    attachUrls,
    gifMode: state.gifMode,
    imageMode: state.imageMode,
  });

  // 发送前记录：原本是否贴在底部（决定发送后要不要继续贴底）
  const wasBottom = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 80;

  input.value = '';
  input.style.height = 'auto';

  const repin = () => { if (wasBottom) scrollBox.scrollTop = scrollBox.scrollHeight; };
  requestAnimationFrame(repin);
  setTimeout(repin, 80);

  if (decision.route === 'gif') {
    sendChat(text || '把这张图做成动图', { draw: true, gif: true, refImages: decision.ref || undefined });
    return;
  }
  if (decision.route === 'draw') {
    // 统一走对话模型 + 图像工具：能联系上文，也会自己写提示词
    sendChat(text || '画一张图', { draw: true, refImages: decision.ref || undefined });
    return;
  }
  sendChat(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 170) + 'px';
  sendBtn.disabled = !input.value.trim() && !state.attachments.length;
});

$('#usageBar').addEventListener('click', async () => {
  await refreshUsage();
  renderUsageDialog();
  $('#dlgUsage').hidden = false;
});
$('#usageClose').addEventListener('click', () => { $('#dlgUsage').hidden = true; });

$('#newChat').addEventListener('click', async () => { await createConv(); renderAll(); closeNav(); input.focus(); });

$('#newMore').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#newPop');
  const h = p.hidden;
  closePops();
  p.hidden = !h;
});

$('#newPrivate2').addEventListener('click', async () => {
  closePops();
  await createConv({ private: true });
  renderAll();
  closeNav();
  input.focus();
});

$('#newProject2').addEventListener('click', () => {
  closePops();
  openProjectDialog(null);
});
$('#newPrivateBtn').addEventListener('click', async () => { closePops(); await createConv({ private: true }); renderAll(); input.focus(); });
$('#newProjectBtn').addEventListener('click', () => { closePops(); openProjectDialog(null); });
$('#insBtn').addEventListener('click', () => { closePops(); openInstructions(); });
$('#usersBtn').addEventListener('click', () => { closePops(); openUsers(); });
$('#logoutBtn').addEventListener('click', () => { closePops(); if (confirm('退出登录？')) logout(); });

$('#renameSelfBtn').addEventListener('click', async () => {
  closePops();
  const v = prompt('改成什么昵称？', LS.name);
  if (!v || v.trim() === LS.name) return;
  const r = await api('/me/rename', { method: 'POST', body: { name: v.trim() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { alert(errText(r.status, j)); return; }
  LS.token = j.token; LS.name = j.name; renderIdentity();
});

$('#renameBtn').addEventListener('click', async () => {
  closePops();
  const cv = current();
  if (!cv) return;
  const v = prompt('对话标题', cv.title);
  if (!v || v.trim() === cv.title) return;
  cv.title = v.trim();
  await saveConv(cv);
  renderAll();
});

$('#privateBtn').addEventListener('click', async () => {
  closePops();
  const cv = current();
  if (!cv) return;
  const next = !cv.private;
  if (!confirm(next ? '转为私人对话？只有你和管理员能看到。' : '转为公开？所有人可见。')) return;
  cv.private = next;
  await saveConv(cv);
  renderAll();
});

$('#q').addEventListener('input', renderSide);
$('#burger').addEventListener('click', () => document.body.classList.toggle('nav'));
function closeNav() { document.body.classList.remove('nav'); }

/* 侧栏收起 / 展开（桌面端，状态记在本机） */
function applySide() {
  const open = LS.side;
  document.body.classList.toggle('noside', !open);
  const b = $('#sideToggle');
  b.textContent = open ? '«' : '»';
  b.title = open ? '收起侧栏' : '展开侧栏';

  const narrow = window.matchMedia('(max-width:820px)').matches;
  const c = $('#sideCollapse');
  if (c) {
    c.textContent = narrow ? '×' : '«';
    c.title = narrow ? '关闭侧栏' : '收起侧栏';
  }
}

$('#sideToggle').addEventListener('click', () => {
  LS.side = true;
  applySide();
});

/* 侧栏内的收起按钮：窄屏关抽屉，宽屏收起整列 */
$('#sideCollapse').addEventListener('click', () => {
  if (window.matchMedia('(max-width:820px)').matches) closeNav();
  else { LS.side = false; applySide(); }
});

/* 窄屏点空白处关抽屉 */
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('nav')) return;
  if (e.target.closest && (e.target.closest('#side') || e.target.closest('#burger'))) return;
  closeNav();
});

/* ---------------- 启动 ---------------- */
async function bootData() {
  // 先用缓存把侧栏点亮（隧道慢时不至于像“历史没了”）
  const cached = LS.convCache;
  if (cached && cached.length && !state.convs.length) {
    state.convs = cached.map(c => ({ ...c, messages: [], files: [] }));
    state.currentId = state.convs[0].id;
    renderAll();
  }

  await Promise.all([loadProjects(), loadConvs()]);
  if (!state.convs.length) await createConv();
  if (!state.currentId || !state.convs.some(c => c.id === state.currentId)) {
    state.currentId = state.convs[0] ? state.convs[0].id : null;
  }
  // 用户已经动过手就别覆盖他的选择（异步加载可能比用户操作还慢）
  if (!state.touched) applyConvSettings(current());
  renderAll();
  scrollBottom(true);
  await verify();
  refreshUsage();
}

async function verify() {
  const dot = $('#connDot');
  try {
    const r = await fetch(base() + '/health', { headers: { 'x-token': LS.token } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      dot.className = 'dot ok';
      if (Array.isArray(j.models) && j.models.length) {
        const chatty = j.models
          .filter(id => !/image|dall-e|tts|whisper|embed|moderation|audio|realtime|transcribe|sora|codex-mini|omni-/i.test(id))
          .filter(id => !/^(chat-latest|chatgpt-image-latest)$/i.test(id))
          .filter(id => !/-\d{4}-\d{2}-\d{2}$/.test(id));
        if (chatty.length > 5) { LS.models = chatty; renderModels(); }
      }
    } else if (r.status === 401) { logout(); }
    else dot.className = 'dot bad';
  } catch { dot.className = 'dot bad'; }
}

async function boot() {
  renderIdentity();
  renderModels();
  renderCaps();
  applySide();
  if (!LS.token) { showLogin(''); return; }
  const me = await api('/me').catch(() => null);
  if (!me || !me.ok) { LS.token = ''; showLogin(''); return; }
  const who = await me.json();
  LS.name = who.name; LS.role = who.role;
  renderIdentity(); renderModels();
  await bootData();
  input.focus();
  setInterval(async () => {
    if (state.streaming || state.saving || document.hidden || !LS.token) return;
    const before = state.convs.map(c => c.id + c.updatedAt).join('|');
    await loadConvs();
    const after = state.convs.map(c => c.id + c.updatedAt).join('|');
    if (before !== after) renderAll();
  }, 15000);
}

boot();
