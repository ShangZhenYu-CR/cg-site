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
  attachments: [],
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
  return fetch(base() + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', 'x-token': LS.token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
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
  const r = await api('/projects');
  if (r.status === 401) { logout(); return; }
  if (!r.ok) return;
  state.projects = (await r.json()).projects || [];
  for (const p of state.projects) if (state.open[p.id] === undefined) state.open[p.id] = true;
}

async function loadConvs() {
  const r = await api('/convs');
  if (r.status === 401) { logout(); return; }
  if (!r.ok) return;
  state.convs = (await r.json()).conversations || [];
  state.convs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
  const body = { title: conv.title, messages: conv.messages, projectId: conv.projectId || null, private: !!conv.private, ...(extra || {}) };
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
  reply.meta = labelOf(model) + ' · ' + (EFFORT_LABEL[effort] || effort);

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
        model, effort, search: state.search, convId: cv.id, projectId: cv.projectId || null,
        messages: sentMessages(cv).map(m => ({ role: m.role, text: m.text, images: m.images })),
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
            if (ev.t) { acc += ev.t; schedule(); }
          }
        }
      }
      paint();
    }
    reply.text = acc;
    delete reply.streaming;
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

async function uploadFile(file) {
  if (!file || !/^image\//.test(file.type)) { alert('只支持图片'); return; }
  if (file.size > 6 * 1024 * 1024) { alert('图片不能超过 6MB'); return; }
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const r = await api('/upload', { method: 'POST', body: { b64: dataUrl, mime: file.type } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { alert(errText(r.status, j)); return; }
  state.attachments.push({ url: j.url, name: file.name });
  renderAttach();
}

$('#fileInput').addEventListener('change', async (e) => {
  for (const f of e.target.files) await uploadFile(f);
  e.target.value = '';
});

input.addEventListener('paste', async (e) => {
  const items = [...(e.clipboardData ? e.clipboardData.items : [])];
  const files = items.filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  for (const f of files) await uploadFile(f);
});

/* ---------------- 交接 ---------------- */
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
const pops = ['modelPop', 'menuPop', 'userPop', 'plusPop'];
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

document.querySelectorAll('#plusPop .opt').forEach(o => {
  o.addEventListener('click', () => {
    const mode = o.dataset.mode;
    closePops();
    if (mode === 'image') {
      state.imageMode = !state.imageMode;
      $('#plusBtn').classList.toggle('on', state.imageMode);
      input.placeholder = state.imageMode ? '描述你想生成的画面…' : '发消息…（Enter 发送，Shift+Enter 换行，可粘贴图片）';
    } else if (mode === 'upload') {
      $('#fileInput').click();
    } else if (mode === 'search') {
      state.search = !state.search;
      $('#searchState').textContent = state.search ? '开' : '关';
      $('#plusBtn').classList.toggle('on', state.search || state.imageMode);
      alert(state.search ? '已开启联网搜索：下一条消息会带 web_search' : '已关闭联网搜索');
    }
  });
});

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.streaming) { state.controller && state.controller.abort(); return; }
  const text = input.value.trim();
  if (!text && !state.attachments.length) return;
  input.value = '';
  input.style.height = 'auto';
  if (state.imageMode) { state.imageMode = false; $('#plusBtn').classList.remove('on'); sendImage(text); }
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

/* ---------------- 启动 ---------------- */
async function bootData() {
  await Promise.all([loadProjects(), loadConvs()]);
  if (!state.convs.length) await createConv();
  if (!state.currentId) state.currentId = state.convs[0] ? state.convs[0].id : null;
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
