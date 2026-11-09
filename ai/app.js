/**
 * /ai/ 页面逻辑
 *
 * 登录：昵称 + 口令 → 服务端签发 token（localStorage 保存）
 * 会话：存在服务器，进来的人共享同一份
 * Astra：只有 astra / admin 角色能选
 */

const DEFAULT_BACKEND = 'https://chat.coldrain-aichat.com/ai-api';

const RECOMMENDED = [
  'gpt-6.1-sol',
  'gpt-6-astra',
  'gpt-6.1-terra',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
];
const DEFAULT_MODEL = 'gpt-6.1-terra';   // 新建对话默认用 Terra
const DEFAULT_MODELS = RECOMMENDED.slice();

function labelOf(id) {
  return String(id)
    .replace(/^gpt-/, 'GPT-')
    .replace(/-sol$/, ' Sol')
    .replace(/-terra$/, ' Terra')
    .replace(/-luna$/, ' Luna')
    .replace(/-astra$/, ' Astra')
    .replace(/-pro$/, ' Pro')
    .replace(/-mini$/, ' Mini')
    .replace(/-nano$/, ' Nano');
}

/* 推理强度 */
const EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'max'];
const EFFORT_CAP = [
  { test: /sol/i, max: 'medium' },
  { test: /terra/i, max: 'high' },
  { test: /luna/i, max: 'max' },
  { test: /astra/i, max: 'medium' },   // Astra：到 mid 为止
];
const EFFORT_LABEL = { minimal: '极低', low: '低', medium: '中', high: '高', max: '最高' };

function effortsFor(model) {
  const cap = EFFORT_CAP.find(c => c.test.test(model || ''));
  const max = cap ? cap.max : 'medium';
  const end = EFFORT_ORDER.indexOf(max);
  return EFFORT_ORDER.slice(1, end + 1);
}

/* ---------------- 本地偏好 ---------------- */
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
  set model(v) { v ? localStorage.setItem('ai.model', v) : localStorage.removeItem('ai.model'); },
  get effort() { return localStorage.getItem('ai.effort') || 'medium'; },
  set effort(v) { localStorage.setItem('ai.effort', v); },
};

const ROLE_RANK = { user: 1, astra: 2, admin: 3 };
const canAstra = () => (ROLE_RANK[LS.role] || 0) >= 2;

/* ---------------- 状态 ---------------- */
const state = {
  convs: [],
  currentId: null,
  streaming: false,
  imageMode: false,
  controller: null,
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const convList = $('#convList');
const thread = $('#thread');
const empty = $('#empty');
const scroll = $('#scroll');
const input = $('#input');
const sendBtn = $('#sendBtn');
const hint = $('#hint');

/* ---------------- Markdown ---------------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  s = s.replace(/`([^`\n]+)`/g, (m, c) => '<code class="inline">' + c + '</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  return s;
}

function md(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let para = [];

  const flush = () => {
    if (!para.length) return;
    out.push('<p>' + inline(esc(para.join('\n'))).replace(/\n/g, '<br>') + '</p>');
    para = [];
  };

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
      out.push(
        '<div class="code-wrap"><span class="lang">' + esc(lang) + '</span>' +
        '<pre><code>' + esc(buf.join('\n')) + '</code></pre></div>'
      );
      continue;
    }

    if (!line.trim()) { flush(); i++; continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const lv = Math.min(h[1].length, 3); out.push('<h' + lv + '>' + inline(esc(h[2])) + '</h' + lv + '>'); i++; continue; }

    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.replace(/[^-\s]/g, '').length >= 3) {
      flush(); out.push('<hr>'); i++; continue;
    }

    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + inline(esc(buf.join('\n'))).replace(/\n/g, '<br>') + '</blockquote>');
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          items[items.length - 1] += '\n' + lines[i].trim();
          i++;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push('<' + tag + '>' + items.map(t => '<li>' + inline(esc(t)).replace(/\n/g, '<br>') + '</li>').join('') + '</' + tag + '>');
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return out.join('');
}

/* ---------------- 网络 ---------------- */
function backendBase() {
  return (LS.backend || DEFAULT_BACKEND).replace(/\/+$/, '');
}

function fileUrl(u) {
  if (!u) return '';
  return /^https?:\/\//.test(u) ? u : backendBase() + u;
}

async function api(path, opts = {}) {
  return fetch(backendBase() + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', 'x-token': LS.token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

function errText(status, data) {
  if (status === 401) return '登录过期了，重新进一下';
  if (status === 403) return (data && data.error) || '没有权限';
  if (status === 429) return '太快了，歇一会儿再发';
  if (data && (data.error || data.e)) return String(data.error || data.e);
  return '请求失败（HTTP ' + status + '）';
}

/* ---------------- 登录 ---------------- */
function showLogin(msg) {
  const dlg = $('#dlgLogin');
  $('#loginErr').textContent = msg || '';
  $('#loginName').value = LS.name || '';
  $('#loginPass').value = '';
  if (!dlg.open) dlg.showModal();
  setTimeout(() => ($('#loginName').value ? $('#loginPass') : $('#loginName')).focus(), 40);
}

$('#loginForm').addEventListener('submit', async (e) => {
  const btn = e.submitter;
  if (!btn || btn.value !== 'ok') return;
  e.preventDefault();
  const name = $('#loginName').value.trim();
  const pass = $('#loginPass').value;
  if (!name) { $('#loginErr').textContent = '昵称不能空'; return; }
  if (!pass) { $('#loginErr').textContent = '口令不能空'; return; }

  $('#loginOk').disabled = true;
  try {
    const res = await fetch(backendBase() + '/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, pass }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { $('#loginErr').textContent = errText(res.status, data); return; }

    LS.token = data.token;
    LS.name = data.name;
    LS.role = data.role;
    $('#dlgLogin').close();
    renderIdentity();
    renderModels();
    await bootData();
    await verify();
    input.focus();
  } catch (err) {
    $('#loginErr').textContent = '连不上后端';
  } finally {
    $('#loginOk').disabled = false;
  }
});

function logout() {
  LS.token = '';
  LS.role = '';
  state.convs = [];
  state.currentId = null;
  thread.textContent = '';
  convList.textContent = '';
  $('#empty').style.display = 'block';
  renderIdentity();
  showLogin('');
}

$('#btnLogout').addEventListener('click', () => {
  if (confirm('退出登录？')) logout();
});

function renderIdentity() {
  $('#whoName').textContent = LS.name || '未登录';
  const b = $('#whoRole');
  const txt = { astra: 'Astra', admin: '管理员' }[LS.role] || '';
  b.textContent = txt;
  b.hidden = !txt;
  $('#btnUsers').hidden = LS.role !== 'admin';
}

/* ---------------- 会话 ---------------- */
function current() {
  return state.convs.find(c => c.id === state.currentId) || null;
}

async function loadConvs() {
  const res = await api('/convs');
  if (res.status === 401) { logout(); return false; }
  if (!res.ok) return false;
  const data = await res.json();
  state.convs = (data.conversations || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return true;
}

async function createConv() {
  const res = await api('/convs', { method: 'POST', body: { title: '新对话' } });
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) return null;
  const { conversation } = await res.json();
  state.convs.unshift(conversation);
  state.currentId = conversation.id;
  return conversation;
}

async function saveConv(conv) {
  conv.updatedAt = Date.now();
  try {
    await api('/convs/' + encodeURIComponent(conv.id), {
      method: 'PUT',
      body: { title: conv.title, messages: conv.messages },
    });
  } catch { /* 下次再存 */ }
}

async function deleteConv(id) {
  try { await api('/convs/' + encodeURIComponent(id), { method: 'DELETE' }); } catch {}
}

/* ---------------- 渲染 ---------------- */
function startRename(conv, titleNode) {
  if (titleNode.dataset.editing) return;
  titleNode.dataset.editing = '1';

  const inp = el('input', 't-input');
  inp.value = conv.title || '';
  inp.maxLength = 120;
  inp.setAttribute('aria-label', '重命名对话');
  titleNode.replaceWith(inp);
  inp.focus();
  inp.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const v = inp.value.trim();
    delete titleNode.dataset.editing;
    inp.replaceWith(titleNode);
    if (save && v && v !== conv.title) {
      conv.title = v.slice(0, 120);
      titleNode.textContent = conv.title;
      await saveConv(conv);
    }
  };

  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('blur', () => finish(true));
}

function renderConvList() {
  convList.textContent = '';
  const list = state.convs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const c of list) {
    const row = el('div', 'conv' + (c.id === state.currentId ? ' active' : ''));
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    const t = el('span', 't', c.title || '新对话');
    t.title = '双击改标题';
    row.append(t);

    t.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(c, t);
    });

    const edit = el('span', 'x edit', '✎');
    edit.title = '重命名';
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(c, t);
    });

    const x = el('span', 'x', '×');
    x.title = '删除（所有人都看不到了）';
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('删除这个对话？所有人都会看不到它。')) return;
      await deleteConv(c.id);
      state.convs = state.convs.filter(v => v.id !== c.id);
      if (state.currentId === c.id) {
        state.currentId = state.convs[0] ? state.convs[0].id : null;
        if (!state.currentId) await createConv();
      }
      renderAll();
    });

    row.append(edit, x);
    row.addEventListener('click', () => {
      if (state.streaming) return;
      state.currentId = c.id;
      renderAll();
      closeNav();
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        row.click();
      }
    });
    convList.append(row);
  }
}

function bubbleFor(msg) {
  const isUser = msg.role === 'user';
  const wrap = el('div', 'msg ' + (isUser ? 'user' : 'assistant'));
  const who = el('div', 'who', isUser ? (msg.who || LS.name || '我') : 'AI');
  if (isUser) who.title = msg.who || LS.name || '';
  wrap.append(who);

  const body = el('div', 'body');
  const content = el('div', 'content');
  body.append(content);

  if (msg.err) content.append(el('div', 'err', msg.text || '出错了'));
  else content.innerHTML = md(msg.text);

  for (const src of (msg.images || [])) {
    const img = el('img');
    img.src = fileUrl(src);
    img.alt = '生成的图片';
    img.loading = 'lazy';
    content.append(img);

    const dl = el('a', 'dl');
    dl.href = fileUrl(src);
    dl.download = 'ai-' + (msg.ts || Date.now()) + '.png';
    dl.textContent = '下载 PNG';
    dl.target = '_blank';
    content.append(dl);
  }

  if (!isUser && !msg.err) {
    if (msg.meta) body.append(el('div', 'meta', msg.meta));
    const tools = el('div', 'tools');
    const cp = el('button', 'copy', '复制');
    cp.type = 'button';
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(msg.text || ''); cp.textContent = '已复制'; setTimeout(() => cp.textContent = '复制', 1200); } catch {}
    });
    tools.append(cp);
    body.append(tools);
  }

  wrap.append(body);
  return wrap;
}

function renderThread() {
  thread.textContent = '';
  const conv = current();
  const msgs = conv ? conv.messages : [];
  empty.style.display = msgs.length ? 'none' : 'block';
  for (const m of msgs) thread.append(bubbleFor(m));
}

function renderAll() {
  renderConvList();
  renderThread();
}

function scrollToBottom(force) {
  const near = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 180;
  if (force || near) scroll.scrollTop = scroll.scrollHeight;
}

function visibleModels() {
  const all = LS.models;
  return canAstra() ? all : all.filter(m => !/astra/i.test(m));
}

function renderModels() {
  const sel = $('#model');
  const models = visibleModels();
  sel.textContent = '';

  const rec = RECOMMENDED.filter(m => models.includes(m));
  const rest = models.filter(m => !rec.includes(m));

  if (rec.length) {
    const g = el('optgroup');
    g.label = '推荐模型集';
    for (const m of rec) { const o = el('option', null, labelOf(m)); o.value = m; g.append(o); }
    sel.append(g);
  }
  if (rest.length) {
    const g = el('optgroup');
    g.label = '全部模型';
    for (const m of rest) { const o = el('option', null, labelOf(m)); o.value = m; g.append(o); }
    sel.append(g);
  }

  if (!models.includes(LS.model) && models.length) {
    LS.model = models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (rec[0] || models[0]);
  }
  sel.value = LS.model;
  renderEffort();
}

/* 推理强度：chip + 滑块 */
function renderEffort() {
  const list = effortsFor($('#model').value || LS.model);
  const range = $('#effortRange');
  const ticks = $('#effortTicks');
  const note = $('#effortNote');

  range.min = '0';
  range.max = String(Math.max(0, list.length - 1));
  range.step = '1';

  let idx = list.indexOf(LS.effort);
  if (idx < 0) idx = Math.max(0, list.indexOf('medium'));
  LS.effort = list[idx];
  range.value = String(idx);

  ticks.textContent = '';
  list.forEach((e, i) => {
    const b = el('button', 'tick' + (i === idx ? ' on' : ''), EFFORT_LABEL[e] || e);
    b.type = 'button';
    b.addEventListener('click', () => setEffort(i));
    ticks.append(b);
  });

  $('#effortLabel').textContent = EFFORT_LABEL[LS.effort] || LS.effort;

  const top = list[list.length - 1];
  let extra = '';
  if (/astra/i.test($('#model').value || '') && !canAstra()) extra = '（需要高级口令）';
  note.textContent = '最高到「' + (EFFORT_LABEL[top] || top) + '」。档位越高越慢。' + extra;
}

function setEffort(i) {
  const list = effortsFor($('#model').value || LS.model);
  const v = list[Math.max(0, Math.min(list.length - 1, i))];
  LS.effort = v;
  $('#effortRange').value = String(list.indexOf(v));
  $('#effortLabel').textContent = EFFORT_LABEL[v] || v;
  [...$('#effortTicks').children].forEach((b, k) => b.classList.toggle('on', k === list.indexOf(v)));
}

/* ---------------- 聊天 ---------------- */
async function sendChat(text) {
  const conv = current() || await createConv();
  if (!conv) return;

  if (!conv.messages.length) conv.title = text.slice(0, 24) || '新对话';

  conv.messages.push({ role: 'user', text, who: LS.name, ts: Date.now() });
  const reply = { role: 'assistant', text: '', streaming: true, ts: Date.now() };
  conv.messages.push(reply);
  renderThread();
  scrollToBottom(true);

  const model = $('#model').value || LS.model;
  const effort = LS.effort;
  reply.meta = labelOf(model) + ' · ' + (EFFORT_LABEL[effort] || effort);

  const node = thread.lastElementChild;
  const content = node && node.querySelector('.content');

  state.streaming = true;
  setSendState();
  state.controller = new AbortController();

  let acc = '';
  let raf = 0;
  const paint = () => {
    raf = 0;
    if (!content) return;
    content.innerHTML = md(acc) + '<span class="cursor"></span>';
    scrollToBottom();
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  try {
    const res = await api('/chat', {
      method: 'POST',
      signal: state.controller.signal,
      body: {
        model,
        effort,
        messages: conv.messages.filter(m => !m.err && !m.streaming).map(m => ({ role: m.role, text: m.text })),
      },
    });

    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch {}
      throw Object.assign(new Error(errText(res.status, data)), { status: res.status });
    }

    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const data = await res.json();
      acc = data.text || data.reply || '';
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
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.e) throw new Error(ev.e);
              if (ev.t) { acc += ev.t; schedule(); }
            } catch (e) { if (e && e.message && e.message !== 'Unexpected end of JSON input') throw e; }
          }
        }
      }
      paint();
    }
    reply.text = acc;
    delete reply.streaming;
    await saveConv(conv);
  } catch (e) {
    delete reply.streaming;
    if (e && e.name === 'AbortError') {
      reply.text = acc || '（已停止）';
      await saveConv(conv);
    } else {
      reply.err = true;
      reply.text = (e && e.message) || '出错了';
      await saveConv(conv);
      if (e && e.status === 401) logout();
    }
  } finally {
    state.streaming = false;
    state.controller = null;
    setSendState();
    renderAll();
    scrollToBottom(true);
  }
}

/* ---------------- 图片 ---------------- */
async function sendImage(prompt) {
  const conv = current() || await createConv();
  if (!conv) return;

  if (!conv.messages.length) conv.title = prompt.slice(0, 24) || '生成图片';

  conv.messages.push({ role: 'user', text: prompt, who: LS.name, ts: Date.now() });
  const reply = { role: 'assistant', text: '正在生成…', ts: Date.now() };
  conv.messages.push(reply);
  renderThread();
  scrollToBottom(true);

  state.streaming = true;
  setSendState();

  try {
    const res = await api('/image', { method: 'POST', body: { prompt } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(errText(res.status, data)), { status: res.status });

    const imgs = (data.images || []).map(it => it.url || (it.b64 ? 'data:image/png;base64,' + it.b64 : '')).filter(Boolean);
    if (!imgs.length) throw new Error('后端没给图片');
    reply.text = '';
    reply.images = imgs;
    reply.meta = 'gpt-image-2.6-sunburst';
    delete reply.err;
  } catch (e) {
    reply.err = true;
    reply.text = (e && e.message) || '生成失败';
    if (e && e.status === 401) logout();
  } finally {
    state.streaming = false;
    setSendState();
    await saveConv(conv);
    renderAll();
    scrollToBottom(true);
  }
}

/* ---------------- 成员（admin） ---------------- */
async function openUsers() {
  const dlg = $('#dlgUsers');
  const box = $('#userList');
  box.textContent = '加载中…';
  dlg.showModal();

  const res = await api('/users');
  if (!res.ok) { box.textContent = '看不到（权限或网络）'; return; }
  const { users } = await res.json();
  box.textContent = '';

  if (!users.length) { box.textContent = '还没有人进来过'; return; }

  for (const u of users) {
    const row = el('div', 'user-row' + (u.blocked ? ' blocked' : ''));

    const main = el('div', 'u-main');
    main.append(el('div', 'u-name', u.name));
    const meta = el('div', 'u-meta');
    const role = { astra: 'Astra', admin: '管理员' }[u.role] || '普通';
    const last = u.lastSeen ? new Date(u.lastSeen).toLocaleString('zh-CN', { hour12: false }) : '—';
    meta.textContent = role + ' · 进过 ' + (u.logins || 0) + ' 次 · 最后 ' + last;
    main.append(meta);
    if (u.blocked) main.append(el('div', 'u-flag', '已拉黑'));

    const btn = el('button', 'u-btn' + (u.blocked ? ' undo' : ''), u.blocked ? '解封' : '拉黑');
    btn.addEventListener('click', async () => {
      const blocked = !u.blocked;
      if (blocked && !confirm('拉黑「' + u.name + '」？他之后进不来。')) return;
      const r = await api('/users/block', { method: 'POST', body: { name: u.name, blocked } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(errText(r.status, j)); return; }
      u.blocked = blocked;
      row.classList.toggle('blocked', blocked);
      btn.textContent = blocked ? '解封' : '拉黑';
      btn.classList.toggle('undo', blocked);
      const flag = main.querySelector('.u-flag');
      if (blocked && !flag) main.append(el('div', 'u-flag', '已拉黑'));
      if (!blocked && flag) flag.remove();
    });

    row.append(main, btn);
    box.append(row);
  }
}

$('#btnUsers').addEventListener('click', openUsers);
$('#usersClose').addEventListener('click', () => $('#dlgUsers').close());

/* ---------------- 交互 ---------------- */
function setSendState() {
  if (state.streaming) {
    sendBtn.textContent = '■';
    sendBtn.classList.add('stop');
    sendBtn.disabled = false;
    sendBtn.title = '停止';
  } else {
    sendBtn.textContent = '↑';
    sendBtn.classList.remove('stop');
    sendBtn.disabled = !input.value.trim();
    sendBtn.title = '发送';
  }
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  setSendState();
}

function closeNav() { document.body.classList.remove('nav'); }

$('#btnCfg').addEventListener('click', () => {
  $('#cfgBackend').value = LS.backend;
  $('#cfgModels').value = LS.models.join(',');
  $('#dlgCfg').showModal();
});

$('#cfgOk').addEventListener('click', () => {
  LS.backend = $('#cfgBackend').value.trim();
  LS.models = $('#cfgModels').value.split(',').map(s => s.trim()).filter(Boolean);
  renderModels();
  verify();
});

async function verify() {
  const who = $('#connState');
  if (!LS.token) return;
  who.textContent = '连接中…';
  who.style.color = 'var(--faint)';
  try {
    const res = await fetch(backendBase() + '/health?pass=' + encodeURIComponent(''), {
      headers: { 'x-token': LS.token },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      const ids = Array.isArray(data.models) ? data.models : [];
      const chatty = ids
        .filter(id => !/image|dall-e|tts|whisper|embed|moderation|audio|realtime|transcribe|sora|codex-mini|omni-/i.test(id))
        .filter(id => !/^(chat-latest|chatgpt-image-latest)$/i.test(id))
        .filter(id => !/-\d{4}-\d{2}-\d{2}$/.test(id))
        .sort((a, b) => modelScore(b) - modelScore(a) || a.localeCompare(b));
      if (chatty.length) { LS.models = chatty; renderModels(); }
      who.textContent = '在线 · ' + chatty.length + ' 个模型';
      who.style.color = 'var(--ok, #7fbf8a)';
    } else if (res.status === 401) {
      logout();
    } else {
      who.textContent = '后端异常';
      who.style.color = 'var(--danger)';
    }
  } catch {
    who.textContent = '连不上后端';
    who.style.color = 'var(--danger)';
  }
}

function modelScore(id) {
  const m = /^gpt-(\d+(?:\.\d+)?)/.exec(id) || /^o(\d+)/.exec(id);
  let v = m ? parseFloat(m[1]) : 0;
  if (/pro/i.test(id)) v += 0.3;
  if (/sol/i.test(id)) v += 0.2;
  if (/terra/i.test(id)) v += 0.15;
  if (/luna/i.test(id)) v += 0.1;
  if (/astra/i.test(id)) v += 0.25;
  if (/mini|nano/i.test(id)) v -= 0.5;
  return v;
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.streaming) { state.controller && state.controller.abort(); return; }
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autosize();
  if (state.imageMode) sendImage(text);
  else sendChat(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('#composer').requestSubmit();
  }
});
input.addEventListener('input', autosize);

$('#imgToggle').addEventListener('click', () => {
  state.imageMode = !state.imageMode;
  $('#imgToggle').classList.toggle('on', state.imageMode);
  input.placeholder = state.imageMode ? '描述你想生成的画面…' : '发消息…（Enter 发送，Shift+Enter 换行）';
  hint.textContent = state.imageMode
    ? '图片模式：这句话会被当成画面描述。'
    : '内容由 AI 生成，注意甄别。对话存在服务器上，进来的人都能看到。';
  input.focus();
});

$('#model').addEventListener('change', (e) => {
  LS.model = e.target.value;
  renderEffort();
  input.focus();
});

$('#effortChip').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('#effortPop');
  const open = pop.hidden;
  pop.hidden = !open;
  $('#effortChip').setAttribute('aria-expanded', String(open));
});

$('#effortRange').addEventListener('input', (e) => setEffort(Number(e.target.value)));

document.addEventListener('click', (e) => {
  const pop = $('#effortPop');
  if (pop.hidden) return;
  if (pop.contains(e.target) || $('#effortChip').contains(e.target)) return;
  pop.hidden = true;
  $('#effortChip').setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#effortPop').hidden) {
    $('#effortPop').hidden = true;
    $('#effortChip').setAttribute('aria-expanded', 'false');
  }
});

$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav'));

$('#newChat').addEventListener('click', async () => {
  if (state.streaming) return;
  await createConv();
  // 新对话回到默认模型（Terra）
  const models = visibleModels();
  if (models.includes(DEFAULT_MODEL)) {
    LS.model = DEFAULT_MODEL;
    renderModels();
  }
  renderAll();
  closeNav();
  input.focus();
});

empty.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-p]');
  if (!btn) return;
  input.value = btn.dataset.p;
  autosize();
  if (btn.dataset.img) { if (!state.imageMode) $('#imgToggle').click(); }
  if (!state.imageMode) input.focus();
});

/* ---------------- 启动 + 同步 ---------------- */
async function bootData() {
  const ok = await loadConvs();
  if (!ok) return;
  if (!state.convs.length) await createConv();
  if (!state.currentId || !state.convs.some(c => c.id === state.currentId)) {
    state.currentId = state.convs[0] ? state.convs[0].id : null;
  }
  renderAll();
  scrollToBottom(true);
}

async function poll() {
  if (state.streaming || document.hidden || !LS.token) return;
  const before = JSON.stringify(state.convs.map(c => [c.id, c.updatedAt, c.title]));
  const ok = await loadConvs();
  if (!ok) return;
  const after = JSON.stringify(state.convs.map(c => [c.id, c.updatedAt, c.title]));
  if (before !== after) {
    if (!state.currentId && state.convs[0]) state.currentId = state.convs[0].id;
    renderAll();
  }
}

async function boot() {
  renderIdentity();
  renderModels();
  autosize();

  if (!LS.token) { showLogin(''); return; }

  // 校验令牌
  const me = await api('/me').catch(() => null);
  if (!me || !me.ok) {
    if (me && me.status === 403) { LS.token = ''; showLogin('你被拉黑了'); return; }
    LS.token = '';
    showLogin('');
    return;
  }
  const who = await me.json();
  LS.name = who.name;
  LS.role = who.role;
  renderIdentity();
  renderModels();

  await bootData();
  await verify();
  input.focus();
  setInterval(poll, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}

boot();
