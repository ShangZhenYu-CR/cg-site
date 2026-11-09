/**
 * /ai/ 页面逻辑
 * 认证：昵称+口令 → token；会话/项目存服务器；私人对话只有创建者+管理员可见。
 */

const DEFAULT_BACKEND = 'https://chat.coldrain-aichat.com/ai-api';

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
  get backend() { return localStorage.getItem('ai.backend') || DEFAULT_BACKEND; },
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
};

const RANK = { user: 1, astra: 2, admin: 3 };
const canAstra = () => (RANK[LS.role] || 0) >= 2;
const isAdmin = () => LS.role === 'admin';

const state = {
  projects: [],
  convs: [],
  currentId: null,
  streaming: false,
  imageMode: false,
  search: false,
  rawUpload: false,
  attachments: [],
  codeMode: false,
  fileIdx: 0,
  open: {},          // projectId -> bool
  controller: null,
};

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
  state.convs = (data.conversations || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const cv of state.convs) if (!Array.isArray(cv.files)) cv.files = [];
  // 只缓存列表元信息，避免塞满 localStorage
  LS.convCache = state.convs.map(c => ({
    id: c.id, title: c.title, updatedAt: c.updatedAt,
    projectId: c.projectId || null, private: !!c.private, owner: c.owner || '',
  }));
  return true;
}

const current = () => state.convs.find(c => c.id === state.currentId) || null;

async function createConv(opts = {}) {
  const r = await api('/convs', { method: 'POST', body: { title: '新对话', projectId: opts.projectId || null, private: !!opts.private } });
  if (!r.ok) return null;
  const { conversation } = await r.json();
  state.convs.unshift(conversation);
  state.currentId = conversation.id;
  return conversation;
}

async function saveConv(conv, extra) {
  conv.updatedAt = Date.now();
  const body = {
    title: conv.title,
    messages: conv.messages,
    projectId: conv.projectId || null,
    private: !!conv.private,
    files: conv.files || [],
    ...(extra || {}),
  };
  try { await api('/convs/' + encodeURIComponent(conv.id), { method: 'PUT', body }); } catch {}
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
    const img = el('img');
    img.src = fileUrl(u);
    img.alt = '图片';
    img.loading = 'lazy';
    bd.append(img);
  }

  if (!isUser && !m.err) {
    if (m.meta) bd.append(el('div', 'meta', m.meta));
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

function renderThread() {
  thread.textContent = '';
  const cv = current();
  const msgs = cv ? cv.messages : [];
  $('#empty').hidden = !!msgs.length;
  for (const m of msgs) thread.append(bubble(m));
  $('#titleBtn').textContent = cv ? cv.title : '新对话';
  updateCtx();
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
      b.addEventListener('click', () => { LS.model = id; renderModels(); renderEffort(); updateCtx(); });
      box.append(b);
    }
  };
  addGroup('推荐', rec);
  addGroup('全部', rest);

  if (!list.includes(LS.model) && list.length) LS.model = rec[0] || list[0];
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
    s.addEventListener('click', () => { LS.effort = e; renderEffort(); });
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

/** GIF：官方 output_format=gif，帧数 2–16 */
async function sendGif(prompt) {
  const cv = current() || await createConv();
  if (!cv) return;
  if (!cv.messages.length) cv.title = prompt.slice(0, 24);
  cv.messages.push({ role: 'user', text: prompt, who: LS.name, ts: Date.now() });
  const reply = { role: 'assistant', text: '正在生成动图…', ts: Date.now() };
  cv.messages.push(reply);
  renderThread();
  scrollBottom(true);
  setBusy(true);

  try {
    const res = await api('/gif', { method: 'POST', body: { prompt, frames: 8 }, timeout: 300000 });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(errText(res.status, data)), { status: res.status });
    if (!data.url) throw new Error('后端没返回 GIF');
    reply.text = '';
    reply.images = [data.url];
    reply.meta = 'GIF · ' + (data.frames || 8) + ' 帧';
    delete reply.err;
  } catch (e) {
    reply.err = true;
    reply.text = (e && e.message) || '生成失败';
  } finally {
    setBusy(false);
    await saveConv(cv);
    renderAll();
    scrollBottom(true);
  }
}

async function sendChat(text) {
  const cv = current() || await createConv();
  if (!cv) return;

  const imgs = state.attachments.map(a => a.url);
  state.attachments = [];
  renderAttach();

  if (!cv.messages.length) cv.title = (text || '图片').slice(0, 24);
  cv.messages.push({ role: 'user', text, who: LS.name, images: imgs.length ? imgs : undefined, ts: Date.now() });

  const reply = { role: 'assistant', text: '', streaming: true, ts: Date.now() };
  cv.messages.push(reply);
  renderThread();
  scrollBottom(true);

  const model = LS.model;
  const effort = LS.effort;
  // 图像生成模型不接受 reasoning 参数，所以只在明确要图时才挂工具
  const wantsImage = /(画一|画个|画只|画张|画幅|生成.{0,6}图|来张图|出图|绘图|插画|海报|头像|表情包|配图|draw|image|picture|illustration)/i.test(text);
  reply.meta = labelOf(model) + ' · ' + (wantsImage ? '图像' : (EFFORT_LABEL[effort] || effort));

  const node = thread.lastElementChild;
  const body = node && node.querySelector('.bd');
  const host = body ? body.querySelector('div') : null;

  setBusy(true);
  state.controller = new AbortController();

  let acc = '';
  let raf = 0;
  const paint = () => {
    raf = 0;
    if (host) host.innerHTML = md(acc) + '<span class="cursor"></span>';
    scrollBottom();
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  try {
    const res = await api('/chat', {
      method: 'POST', signal: state.controller.signal,
      body: {
        model, search: state.search, convId: cv.id, projectId: cv.projectId || null,
        ...(wantsImage ? { imageTool: true } : { effort }),
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
              if (!reply.meta) reply.meta = '图片';
            }
            if (ev.t) { acc += ev.t; schedule(); }
          }
        }
      }
      paint();
    }
    reply.text = acc;
    delete reply.streaming;

    const parsed = extractFiles(reply.text || '');
    if (parsed.files.length) {
      applyFiles(cv, parsed.files);
      reply.wrote = parsed.files.map(f => f.name);
      reply.text = parsed.text;
      if (!reply.text) reply.text = '';
    }
  } catch (e) {
    delete reply.streaming;
    if (e && e.name === 'AbortError') reply.text = acc || '（已停止）';
    else { reply.err = true; reply.text = (e && e.message) || '出错了'; if (e && e.status === 401) logout(); }
  } finally {
    setBusy(false);
    state.controller = null;
    await saveConv(cv);
    renderAll();
    scrollBottom(true);
  }
}

async function sendImage(prompt) {
  const cv = current() || await createConv();
  if (!cv) return;
  if (!cv.messages.length) cv.title = prompt.slice(0, 24);
  cv.messages.push({ role: 'user', text: prompt, who: LS.name, ts: Date.now() });
  const reply = { role: 'assistant', text: '正在生成…', ts: Date.now() };
  cv.messages.push(reply);
  renderThread();
  scrollBottom(true);
  setBusy(true);

  try {
    const res = await api('/image', { method: 'POST', body: { prompt } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(errText(res.status, data)), { status: res.status });
    const imgs = (data.images || []).map(x => x.url).filter(Boolean);
    if (!imgs.length) throw new Error('后端没给图片');
    reply.text = ''; reply.images = imgs; reply.meta = 'gpt-image-2.6-sunburst'; delete reply.err;
  } catch (e) {
    reply.err = true; reply.text = (e && e.message) || '生成失败';
    if (e && e.status === 401) logout();
  } finally {
    setBusy(false);
    await saveConv(cv);
    renderAll();
    scrollBottom(true);
  }
}

function scrollBottom(force) {
  const near = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < 200;
  if (force || near) scrollBox.scrollTop = scrollBox.scrollHeight;
}

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
    box.append(chip);
  });
}

const MAX_IMAGE_MB = 50;

/** 上传前压缩：按体积分级降分辨率，目标 ≤400KB（跨境链路下行很慢） */
async function shrinkImage(file) {
  try {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return file;

    const encode = async (maxEdge, quality, keepPngOk) => {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);

      const keepPng = keepPngOk && /png/i.test(file.type) && file.size < 1024 * 1024;
      const type = keepPng ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(r => canvas.toBlob(r, type, quality));
      if (!blob) return null;
      const ext = keepPng ? '.png' : '.jpg';
      return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + ext, { type });
    };

    let out = await encode(2048, 0.9, true);
    if (!out || out.size >= file.size) out = file;

    const tiers = [
      [1600, 0.85, 1.2 * 1024 * 1024],
      [1280, 0.8, 800 * 1024],
    ];
    for (const [edge, q, ceiling] of tiers) {
      if (out.size <= ceiling) break;
      const next = await encode(edge, q, false);
      if (next && next.size < out.size) out = next;
    }
    return out;
  } catch {
    return file;
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

async function uploadFile(file) {
  if (!file || !/^image\//.test(file.type)) { alert('只支持图片'); return; }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) { alert('图片不能超过 ' + MAX_IMAGE_MB + 'MB'); return; }

  const box = $('#attach');
  const hint = el('div', 'up-hint', state.rawUpload ? '原图上传（较慢）…' : '压缩中…');
  box.append(hint);

  try {
    const small = state.rawUpload ? file : await shrinkImage(file);
    if (small.size > MAX_IMAGE_MB * 1024 * 1024) { alert('压缩后仍超过 ' + MAX_IMAGE_MB + 'MB'); return; }

    const kb = Math.max(1, Math.round(small.size / 1024));
    hint.textContent = '上传中 0% · ' + kb + 'KB';
    const prog = (p) => { hint.textContent = '上传中 ' + Math.round(p * 100) + '% · ' + kb + 'KB'; };

    // 1) 优先走 OSS 直传（绕开跨境隧道）
    const oss = await uploadViaOss(small, prog);
    if (oss.url) {
      state.attachments.push({ url: oss.url, name: small.name, oss: true });
      return;
    }
    if (oss.error) hint.textContent = '直传失败，改走服务器…（' + oss.error + '）';

    // 2) 回退：经隧道分片上传
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(small);
    });

    const { status, ok, j } = await uploadChunked(dataUrl, small.type, prog);
    if (!ok) { alert(errText(status, j)); return; }
    state.attachments.push({ url: j.url, name: small.name });
  } catch (err) {
    alert('上传失败：' + ((err && err.message) || err));
  } finally {
    hint.remove();
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
const EXT_BY_LANG = {
  python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', shell: 'sh',
  powershell: 'ps1', ps1: 'ps1', mel: 'mel', maya: 'mel', csharp: 'cs', cs: 'cs',
  cpp: 'cpp', 'c++': 'cpp', c: 'c', markdown: 'md', md: 'md', sql: 'sql',
  yaml: 'yml', yml: 'yml', xml: 'xml', text: 'txt',
};

/** 回复里的长代码块自动收进面板；短片段留在对话里 */
function harvestCode(text) {
  const re = /```([\w+#.-]*)[ \t]*\n([\s\S]*?)```/g;
  const blocks = [];
  let m;
  while ((m = re.exec(text))) {
    blocks.push({ lang: (m[1] || '').toLowerCase(), code: m[2], raw: m[0], at: m.index });
  }
  const big = blocks.filter(b => b.code.split('\n').length >= 15 || b.code.length >= 800);
  if (!big.length) return null;

  const files = [];
  let out = text;
  big.forEach((b, i) => {
    const before = text.slice(Math.max(0, b.at - 160), b.at);
    const named = /([\w./-]+\.(?:py|js|ts|html?|css|json|sh|ps1|mel|ma|cs|cpp|c|md|ya?ml|sql))/i.exec(before);
    const ext = EXT_BY_LANG[b.lang] || 'txt';
    const name = named ? named[1].split('/').pop() : 'snippet-' + (i + 1) + '.' + ext;
    files.push({ name, content: b.code.replace(/\s+$/, '') + '\n' });
    out = out.replace(b.raw, '');
  });

  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return { files, text: out };
}

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
$('#btnAbout').addEventListener('click', () => { $('#dlgAbout').hidden = false; });
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
});

/* ---- 能力开关：默认不显示，开了才浮在输入框上方 ---- */
const DEFAULT_PH = '发消息…（Enter 发送，Shift+Enter 换行，可粘贴图片）';
const CAP_DEFS = [
  { k: 'code', icon: '🧑‍💻', label: '编程模式' },
  { k: 'search', icon: '🌐', label: '联网搜索' },
  { k: 'raw', icon: '📷', label: '原图' },
];

function capOn(k) {
  if (k === 'image') return state.imageMode;
  if (k === 'code') return state.codeMode;
  if (k === 'search') return state.search;
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
    b.title = '点击关闭「' + c.label + '」';
    b.innerHTML = '<span class="ci">' + c.icon + '</span>' + c.label + '<span class="x">×</span>';
    b.addEventListener('click', () => setCap(c.k, false));
    box.append(b);
  }
  $('#plusBtn').classList.toggle('on', active.length > 0);
}

function setCap(kind, on) {
  if (kind === 'image') {
    state.imageMode = on;
    input.placeholder = on ? '描述你想生成的画面…' : DEFAULT_PH;
  } else if (kind === 'search') {
    state.search = on;
  } else if (kind === 'raw') {
    state.rawUpload = on;
  } else if (kind === 'code') {
    state.codeMode = on;
    if (on) { openCodePane(); if (!input.value.trim()) input.placeholder = '描述你要写的功能，GPT 会把文件写进右侧面板…'; }
    else { closeCodePane(); input.placeholder = DEFAULT_PH; }
  }
  renderCaps();
}

document.querySelectorAll('#plusPop .opt').forEach(o => {
  o.addEventListener('click', () => {
    const mode = o.dataset.mode;
    closePops();
    if (mode === 'upload') { $('#fileInput').click(); return; }
    setCap(mode, !capOn(mode));
  });
});

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.streaming) { state.controller && state.controller.abort(); return; }

  const text = input.value.trim();
  const hasAttach = state.attachments.length > 0;
  if (!text && !hasAttach) return;

  input.value = '';
  input.style.height = 'auto';

  // 挂着图就走看图对话：生图接口只接受文字提示，带图会被忽略
  if (state.imageMode && hasAttach) setCap('image', false);

  const wantsGif = /(gif|动图|动画|动起来|会动的图)/i.test(text);
  if (wantsGif && !hasAttach) { sendGif(text); return; }

  if (state.imageMode) { setCap('image', false); sendImage(text); }
  else sendChat(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 170) + 'px';
  sendBtn.disabled = !input.value.trim() && !state.attachments.length;
});

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
  renderAll();
  scrollBottom(true);
  await verify();
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
    if (state.streaming || document.hidden || !LS.token) return;
    const before = state.convs.map(c => c.id + c.updatedAt).join('|');
    await loadConvs();
    const after = state.convs.map(c => c.id + c.updatedAt).join('|');
    if (before !== after) renderAll();
  }, 15000);
}

boot();
