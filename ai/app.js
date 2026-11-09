/**
 * /ai/ 页面逻辑：会话列表 + 流式聊天 + 图片生成
 *
 * 后端契约（见 ../ai-worker/worker.js）：
 *   POST {backend}/chat   { pass, model, messages:[{role,text}] }  -> text/event-stream
 *        data: {"t":"增量"} … data: [DONE]
 *        data: {"e":"错误"}  / HTTP 401 = 口令不对
 *   POST {backend}/image  { pass, prompt, size }                  -> { images:[{b64,mime}|{url}] }
 *   GET  {backend}/health -> { ok:true, ... }
 */

const DEFAULT_BACKEND = 'https://chat.coldrain-aichat.com/ai-api';
const DEFAULT_MODELS = ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-5.6-luna', 'gpt-5.5'];

/** 模型排序权重：版本号越大越靠前；pro/sol/terra 属同代加强款 */
function modelScore(id) {
  const m = /^gpt-(\d+(?:\.\d+)?)/.exec(id) || /^o(\d+)/.exec(id);
  let v = m ? parseFloat(m[1]) : 0;
  if (/pro/i.test(id)) v += 0.3;
  if (/sol/i.test(id)) v += 0.2;
  if (/terra/i.test(id)) v += 0.15;
  if (/luna/i.test(id)) v += 0.1;
  if (/mini|nano/i.test(id)) v -= 0.5;
  return v;
}

/* ---------------- 存储 ---------------- */
const LS = {
  get pass() { return localStorage.getItem('ai.pass') || ''; },
  set pass(v) { v ? localStorage.setItem('ai.pass', v) : localStorage.removeItem('ai.pass'); },
  get backend() { return localStorage.getItem('ai.backend') || DEFAULT_BACKEND; },
  set backend(v) { v ? localStorage.setItem('ai.backend', v) : localStorage.removeItem('ai.backend'); },
  get models() {
    const raw = localStorage.getItem('ai.models');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_MODELS.slice();
  },
  set models(v) { v && v.length ? localStorage.setItem('ai.models', v.join(',')) : localStorage.removeItem('ai.models'); },
  get model() { return localStorage.getItem('ai.model') || this.models[0]; },
  set model(v) { localStorage.setItem('ai.model', v); },
};

const DB_NAME = 'ai-chat';
const STORE = 'convs';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function dbAll() {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

async function dbPut(conv) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(conv);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* 隐私模式等，忽略 */ }
}

async function dbDel(id) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

/* ---------------- 状态 ---------------- */
const state = {
  convs: [],       // [{id,title,ts,messages:[{role,text,images?,err?}]}]
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
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  // s 已转义
  s = s.replace(/`([^`\n]+)`/g, (m, c) => '<code class="inline">' + c + '</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  return s;
}

/** 极简 Markdown：代码块、标题、列表、引用、分割线、段落 */
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

    // 代码块
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      flush();
      const lang = fence[1] || 'text';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // 跳过结束围栏
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

    // 列表（- / * / 数字）
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
        // 列表项的续行（缩进）
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

/* ---------------- 渲染 ---------------- */
function current() {
  return state.convs.find(c => c.id === state.currentId) || null;
}

function makeConv() {
  const now = Date.now();
  return { id: 'c' + now.toString(36) + Math.random().toString(36).slice(2, 6), title: '新对话', ts: now, messages: [] };
}

function touch(conv) {
  conv.ts = Date.now();
  dbPut(conv);
}

function renderConvList() {
  convList.textContent = '';
  const list = state.convs.slice().sort((a, b) => b.ts - a.ts);
  for (const c of list) {
    const row = el('button', 'conv' + (c.id === state.currentId ? ' active' : ''));
    row.type = 'button';
    const t = el('span', 't', c.title || '新对话');
    const x = el('span', 'x', '×');
    x.title = '删除';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('删除这个对话？')) return;
      state.convs = state.convs.filter(v => v.id !== c.id);
      dbDel(c.id);
      if (state.currentId === c.id) {
        state.currentId = state.convs[0] ? state.convs[0].id : null;
        renderAll();
      } else {
        renderConvList();
      }
    });
    row.append(t, x);
    row.addEventListener('click', () => {
      if (state.streaming) return;
      state.currentId = c.id;
      renderAll();
      closeNav();
    });
    convList.append(row);
  }
}

function bubbleFor(msg) {
  const wrap = el('div', 'msg ' + (msg.role === 'user' ? 'user' : 'assistant'));
  wrap.append(el('div', 'who', msg.role === 'user' ? '我' : 'AI'));

  const body = el('div', 'body');
  const content = el('div', 'content');
  body.append(content);

  if (msg.err) {
    content.append(el('div', 'err', msg.text || '出错了'));
  } else {
    content.innerHTML = md(msg.text);
  }

  if (msg.images && msg.images.length) {
    for (const src of msg.images) {
      const img = el('img');
      img.src = src;
      img.alt = '生成的图片';
      img.loading = 'lazy';
      content.append(img);
      const dl = el('a', 'tools');
      dl.href = src;
      dl.download = 'ai-' + Date.now() + '.png';
      dl.textContent = '下载 PNG';
      dl.style.cssText = 'font-size:12px;color:var(--faint);text-decoration:none;display:inline-block;margin:6px 0 10px';
      content.append(dl);
    }
  }

  if (msg.role === 'assistant' && !msg.err) {
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
  if (state.streaming) scrollToBottom();
}

function renderAll() {
  renderConvList();
  renderThread();
}

function scrollToBottom(force) {
  const near = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 160;
  if (force || near) scroll.scrollTop = scroll.scrollHeight;
}

function renderModels() {
  const sel = $('#model');
  const models = LS.models;
  const cur = LS.model;
  sel.textContent = '';
  for (const m of models) {
    const o = el('option', null, m);
    o.value = m;
    sel.append(o);
  }
  if (!models.includes(cur) && models.length) LS.model = models[0];
  sel.value = LS.model;
}

/* ---------------- 网络 ---------------- */
function backendBase() {
  return (LS.backend || DEFAULT_BACKEND).replace(/\/+$/, '');
}

async function api(path, body, signal) {
  const res = await fetch(backendBase() + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return res;
}

function errText(status, data) {
  if (status === 401) return '口令不对，或者已经换了';
  if (status === 429) return '太快了，歇一会儿再发';
  if (data && (data.error || data.e)) return String(data.error || data.e);
  return '请求失败（HTTP ' + status + '）';
}

/* ---------------- 聊天 ---------------- */
async function sendChat(text) {
  const conv = current() || (() => { const c = makeConv(); state.convs.push(c); state.currentId = c.id; return c; })();
  if (!conv.messages.length) {
    conv.title = text.slice(0, 24) || '新对话';
    renderConvList();
  }

  conv.messages.push({ role: 'user', text });
  const reply = { role: 'assistant', text: '', streaming: true };
  conv.messages.push(reply);
  renderThread();
  scrollToBottom(true);

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
      pass: LS.pass,
      model: $('#model').value || LS.model,
      messages: conv.messages.filter(m => !m.err && !m.streaming).map(m => ({ role: m.role, text: m.text })),
    }, state.controller.signal);

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
    touch(conv);
  } catch (e) {
    delete reply.streaming;
    if (e && e.name === 'AbortError') {
      reply.text = acc || '（已停止）';
      touch(conv);
    } else {
      reply.err = true;
      reply.text = (e && e.message) || '出错了';
      touch(conv);
      if (e && e.status === 401) askPass();
    }
    renderThread();
  } finally {
    state.streaming = false;
    state.controller = null;
    setSendState();
    renderThread();
  }
}

/* ---------------- 图片 ---------------- */
async function sendImage(prompt) {
  const conv = current() || (() => { const c = makeConv(); state.convs.push(c); state.currentId = c.id; return c; })();
  if (!conv.messages.length) {
    conv.title = prompt.slice(0, 24) || '生成图片';
    renderConvList();
  }

  conv.messages.push({ role: 'user', text: prompt });
  const reply = { role: 'assistant', text: '正在生成…' };
  conv.messages.push(reply);
  renderThread();
  scrollToBottom(true);

  state.streaming = true;
  setSendState();

  try {
    const res = await api('/image', { pass: LS.pass, prompt });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(errText(res.status, data)), { status: res.status });

    const imgs = (data.images || []).map(it => it.b64 ? 'data:' + (it.mime || 'image/png') + ';base64,' + it.b64 : it.url).filter(Boolean);
    if (!imgs.length) throw new Error('后端没给图片');
    reply.text = '';
    reply.images = imgs;
    delete reply.err;
  } catch (e) {
    reply.err = true;
    reply.text = (e && e.message) || '生成失败';
    if (e && e.status === 401) askPass();
  } finally {
    state.streaming = false;
    setSendState();
    touch(conv);
    renderThread();
  }
}

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

function askPass() {
  const dlg = $('#dlgPass');
  $('#passErr').textContent = '';
  $('#passInput').value = LS.pass;
  if (!dlg.open) dlg.showModal();
  setTimeout(() => $('#passInput').focus(), 30);
}

$('#passForm').addEventListener('submit', (e) => {
  const btn = e.submitter;
  if (!btn || btn.value !== 'ok') return;
  e.preventDefault();
  const v = $('#passInput').value.trim();
  if (!v) { $('#passErr').textContent = '口令不能为空'; return; }
  LS.pass = v;
  $('#dlgPass').close();
  renderWho();
  verify();
});

$('#btnPass').addEventListener('click', askPass);

$('#btnCfg').addEventListener('click', () => {
  $('#cfgBackend').value = LS.backend;
  $('#cfgModels').value = LS.models.join(',');
  $('#dlgCfg').showModal();
});

$('#dlgCfg').addEventListener('close', () => {
  // method=dialog：只有点保存才应用
  const submitter = $('#dlgCfg').returnValue;
  if (submitter !== 'ok') return;
});

$('#cfgOk').addEventListener('click', () => {
  LS.backend = $('#cfgBackend').value.trim();
  LS.models = $('#cfgModels').value.split(',').map(s => s.trim()).filter(Boolean);
  renderModels();
  verify();
});

async function verify() {
  const who = $('#whoAmI');
  const base = backendBase();
  if (!base) {
    who.textContent = '后端未配置';
    who.style.color = 'var(--danger)';
    return;
  }
  who.textContent = '连接中…';
  who.style.color = 'var(--faint)';
  try {
    const res = await fetch(base + '/health?pass=' + encodeURIComponent(LS.pass));
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      const ids = Array.isArray(data.models) ? data.models : [];
      const chatty = ids
        // 聊天模型：排掉图片/语音/向量/审核这类，以及纯别名
        .filter(id => !/image|dall-e|tts|whisper|embed|moderation|audio|realtime|transcribe|sora|codex-mini|omni-/i.test(id))
        .filter(id => !/^(chat-latest|chatgpt-image-latest)$/i.test(id))
        // 去掉带日期快照的重复项（gpt-5.2-2025-12-11 这种）
        .filter(id => !/-\d{4}-\d{2}-\d{2}$/.test(id))
        .sort((a, b) => modelScore(b) - modelScore(a) || a.localeCompare(b));
      if (chatty.length) {
        LS.models = chatty;
        renderModels();
        const cur = LS.model;
        // 记住的选择还在就用它，否则用最新的
        $('#model').value = chatty.includes(cur) ? cur : chatty[0];
        LS.model = $('#model').value;
      }
      who.textContent = '口令已验证 · ' + (chatty.length || ids.length) + ' 个模型';
      who.style.color = 'var(--dim)';
    } else if (res.status === 401) {
      who.textContent = '口令不对';
      who.style.color = 'var(--danger)';
    } else {
      who.textContent = '后端异常';
      who.style.color = 'var(--danger)';
    }
  } catch {
    who.textContent = '连不上后端';
    who.style.color = 'var(--danger)';
  }
}

function renderWho() {
  $('#whoAmI').textContent = LS.pass ? '已保存口令' : '未验证口令';
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.streaming) {
    state.controller && state.controller.abort();
    return;
  }
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
    ? '图片模式：发的这句话会被当成画面描述，生成一张图。'
    : '内容由 AI 生成，注意甄别。对话只存在你自己的浏览器里。';
  input.focus();
});

$('#model').addEventListener('change', (e) => { LS.model = e.target.value; });

$('#gear').addEventListener('click', () => $('#btnCfg').click());

$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav'));

$('#newChat').addEventListener('click', () => {
  if (state.streaming) return;
  const c = makeConv();
  state.convs.push(c);
  state.currentId = c.id;
  dbPut(c);
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

/* ---------------- 启动 ---------------- */
async function boot() {
  const stored = await dbAll();
  state.convs = stored.sort((a, b) => b.ts - a.ts);
  if (!state.convs.length) {
    const c = makeConv();
    state.convs.push(c);
    dbPut(c);
  }
  state.currentId = state.convs[0].id;
  renderModels();
  renderAll();
  renderWho();
  autosize();
  if (LS.pass) verify();
  else askPass();
  input.focus();
}

boot();
