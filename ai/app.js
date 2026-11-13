/**
 * /ai/ 页面逻辑
 * 认证：昵称+口令 → token；会话/项目存服务器；私人对话只有创建者+管理员可见。
 */

const APP_BUILD = '2026-11-14 03:06';
const DEFAULT_BACKEND = 'https://ai.coldrain-aichat.com';

/* ---------------- 图标（Lucide，ISC） ---------------- */
const ICON_PATHS = {"download":"<path d=\"M12 3v12\"/><path d=\"m7 10 5 5 5-5\"/><path d=\"M5 21h14\"/>","copy":"<rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5 15V5a2 2 0 0 1 2-2h10\"/>","plus":"<path d=\"M5 12h14\" /> <path d=\"M12 5v14\" />","search":"<path d=\"m21 21-4.34-4.34\" /> <circle cx=\"11\" cy=\"11\" r=\"8\" />","folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />","file":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\" /> <path d=\"M14 2v5a1 1 0 0 0 1 1h5\" />","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /> <circle cx=\"12\" cy=\"7\" r=\"4\" />","panel-left":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M9 3v18\" />","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\" /> <path d=\"M12 2v2\" /> <path d=\"M12 20v2\" /> <path d=\"m4.93 4.93 1.41 1.41\" /> <path d=\"m17.66 17.66 1.41 1.41\" /> <path d=\"M2 12h2\" /> <path d=\"M20 12h2\" /> <path d=\"m6.34 17.66-1.41 1.41\" /> <path d=\"m19.07 4.93-1.41 1.41\" />","moon":"<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\" />","ellipsis":"<circle cx=\"12\" cy=\"12\" r=\"1\" /> <circle cx=\"19\" cy=\"12\" r=\"1\" /> <circle cx=\"5\" cy=\"12\" r=\"1\" />","arrow-up":"<path d=\"m5 12 7-7 7 7\" /> <path d=\"M12 19V5\" />","paperclip":"<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\" />","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /> <circle cx=\"9\" cy=\"9\" r=\"2\" /> <path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />","film":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M7 3v18\" /> <path d=\"M3 7.5h4\" /> <path d=\"M3 12h18\" /> <path d=\"M3 16.5h4\" /> <path d=\"M17 3v18\" /> <path d=\"M17 7.5h4\" /> <path d=\"M17 16.5h4\" />","code":"<path d=\"m16 18 6-6-6-6\" /> <path d=\"m8 6-6 6 6 6\" />","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /> <path d=\"M2 12h20\" />","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\" /> <circle cx=\"12\" cy=\"13\" r=\"3\" />"};
function ic(name, size) {
  const s = size || 16;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || '') + '</svg>';
}
function setBtnLabel(btn, text) {
  const span = btn.querySelector('span');
  if (span) span.textContent = text; else btn.textContent = text;
}
const CAP_ICON = { image: 'image', gif: 'film', code: 'code', search: 'globe', fidelity: 'search', raw: 'camera' };

/** 用线性图标替换占位字符 */
function decorateIcons() {
  const put = (sel, name, size) => { const e = document.querySelector(sel); if (e) e.innerHTML = ic(name, size); };
  put('#plusBtn', 'plus', 18);
  put('#menuBtn', 'ellipsis', 18);
  put('#sideCollapse', 'panel-left', 15);
  put('#sideToggle', 'panel-left', 15);
  put('#sendBtn', 'arrow-up', 18);
  for (const pair of [['#navProjects', 'folder'], ['#navFiles', 'file'], ['#navPrefs', 'user']]) {
    const btn = document.querySelector(pair[0]);
    if (!btn) continue;
    const svg = btn.querySelector('svg');
    if (svg) svg.outerHTML = ic(pair[1], 16);
  }
}

/* 默认模型迁移：老的 5.6 Terra / Luna 升到 6.1 Terra（中等思考） */
(function migrateModelOnce() {
  if (localStorage.getItem('ai.modelMigrated61')) return;
  localStorage.setItem('ai.modelMigrated61', '1');
  const cur = localStorage.getItem('ai.model') || '';
  if (/gpt-5\.6-(terra|luna)/i.test(cur)) {
    localStorage.setItem('ai.model', 'gpt-6.1-terra');
    localStorage.setItem('ai.effort', 'medium');
  }
})();
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
    try { return JSON.parse(localStorage.getItem(scopedKey('convs.cache')) || 'null'); } catch { return null; }
  },
  set convCache(list) {
    try { localStorage.setItem(scopedKey('convs.cache'), JSON.stringify(list)); } catch {}
  },
  get theme() { return localStorage.getItem('ai.theme') || 'auto'; },
  set theme(v) { localStorage.setItem('ai.theme', v); },
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

/* 本地缓存按账号分区：昵称只作显示，键里用稳定编码 */
const scopeName = () => (LS.name ? encodeURIComponent(String(LS.name)) : 'anon');
const scopedKey = (k) => 'ai.' + scopeName() + '.' + k;
const LEGACY_KEYS = ['ai.drafts', 'ai.convs.cache'];
const ANON_KEYS = ['ai.anon.drafts', 'ai.anon.convs.cache'];
function clearLegacyKeys() {
  for (const k of LEGACY_KEYS.concat(ANON_KEYS)) { try { localStorage.removeItem(k); } catch {} }
}

// 账号生命周期：换账号后所有旧请求/旧保存/旧缓存写入都要失效
let sessionEpoch = 0;

const RANK = { user: 1, astra: 2, admin: 3 };
const canAstra = () => (RANK[LS.role] || 0) >= 2;
const isAdmin = () => LS.role === 'admin';

const state = {
  runs: [],
  currentRunId: null,
  bgRun: false,
  projects: [],
  convs: [],
  currentId: null,
  streaming: false,
  finishPromise: null,
  editing: null,
  skills: [],
  tools: [],
  pendingSkill: null,
  waitingUpload: false,
  imageMode: false,
  gifMode: false,
  search: true,   // 联网搜索默认开：模型按需调用，可在菜单里关
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

let thinkingEl = null;   // 等待首字时的占位元素
let thinkingTimer = 0;
const thread = $('#thread');
const listBox = $('#list');
const scrollBox = $('#scroll');
const input = $('#input');
const sendBtn = $('#sendBtn');

/* ---------------- Markdown ---------------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const hasKatex = () => typeof window !== 'undefined' && !!window.katex;

function texHTML(tex, display) {
  if (!hasKatex()) return esc(tex);
  try {
    return window.katex.renderToString(tex, { displayMode: !!display, throwOnError: false, output: 'html' });
  } catch (e) {
    return esc(tex);
  }
}

function inline(s) {
  s = s.replace(/`([^`\n]+)`/g, (m, c) => '<code>' + c + '</code>');
  s = s.replace(/\$([^$\n]+?)\$/g, (m, tex) => texHTML(tex, false));
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  return s;
}

/* ---------------- 工具卡片（自定义工具执行结果） ---------------- */
function pushToolCards(reply, calls) {
  if (!Array.isArray(calls) || !calls.length) return;
  reply.tools = reply.tools || [];
  const sig = (t) => String(t && t.name) + ':' + JSON.stringify((t && t.args) || {});
  for (const c of calls) {
    const card = {
      name: String(c.name || 'tool'),
      args: c.args || {},
      result: c.ok ? String(c.output || '').slice(0, 300) : ('失败：' + String(c.err || '').slice(0, 120)),
    };
    if (reply.tools.some((t) => sig(t) === sig(card))) continue;
    reply.tools.push(card);
  }
}

/* ---------------- 长期记忆（前端收集） ---------------- */
const MEM_RE = /\[\[memory(-deep)?:\s*([^\]]+?)\s*\]\]/gi;
const FORGET_RE = /\[\[forget:\s*([^\]]+?)\s*\]\]/gi;

/** 抽出并移除 [[memory: ...]] 标记，顺手提交给服务端 */
function collectMemories(text) {
  const items = [];
  const cleaned = String(text || '')
    .replace(MEM_RE, (m, deep, t) => {
      const v = String(t || '').trim();
      if (v) items.push({ text: v, tier: deep ? 'deep' : 'hot' });
      return '';
    })
    .replace(FORGET_RE, (m, kw) => {
      const k = String(kw || '').trim();
      if (k) api('/memory?text=' + encodeURIComponent(k), { method: 'DELETE' }).catch(() => {});
      return '';
    })
    .replace(/\n{3,}/g, '\n\n').trim();
  for (const one of items.slice(0, 4)) {
    api('/memory', { method: 'POST', body: one }).catch(() => {});
  }
  return cleaned;
}

function stripMemoryMarkers(text) {
  return String(text || '').replace(MEM_RE, '').replace(FORGET_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}
/* ---------------- 记住这句：选中文字即记 ---------------- */
let memBtn = null;

function hideMemBtn() {
  if (memBtn) { memBtn.remove(); memBtn = null; }
}

document.addEventListener('mouseup', (e) => {
  const sel = window.getSelection();
  const text = sel ? String(sel).trim() : '';
  if (!text || text.length < 4 || text.length > 300) { hideMemBtn(); return; }
  const anchor = e.target && e.target.closest && e.target.closest('#thread .msg');
  if (!anchor) { hideMemBtn(); return; }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  hideMemBtn();
  memBtn = el('button', 'mem-float', '记住这句');
  memBtn.type = 'button';
  memBtn.style.left = Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 44)) + 'px';
  memBtn.style.top = Math.max(8, rect.top - 38 + window.scrollY) + 'px';
  memBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
  memBtn.addEventListener('click', async () => {
    const clean = text.replace(/\s+/g, ' ').slice(0, 300);
    const r = await api('/memory', { method: 'POST', body: { text: clean, tier: 'hot' } });
    flashHint(r.ok ? '已记住（常用记忆）' : '记不住了');
    hideMemBtn();
  });
  document.body.append(memBtn);
});

document.addEventListener('scroll', hideMemBtn, true);
/* ---------------- 计算沙箱（Web Worker） ---------------- */
let calcWorker = null;
let calcSeq = 0;
const calcPending = new Map();

/* 计算块：默认只展示，点「运行」才算；只允许纯数字表达式，没有任何脚本/网络能力 */
function safeCalc(code) {
  let src = String(code || '').trim();
  // 兼容模型习惯：允许 return 开头、结尾分号
  src = src.replace(/^return\s+/, '').replace(/;\s*$/, '').trim();
  if (!src) throw new Error('空表达式');
  if (src.length > 500) throw new Error('表达式太长');
  if (!/^[0-9+\-*/%().\s]+$/.test(src)) throw new Error('只支持数字表达式（+ - * / % 和括号）');
  let v;
  try { v = Function('"use strict"; return (' + src + ');')(); } catch (e) { throw new Error('算不出来'); }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('结果不是有限数字');
  return v;
}
function calcKey(code) {
  let h = 5381;
  const s = String(code || '');
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'c' + h.toString(36);
}
/** 给计算块挂上「运行」按钮；有历史结果的直接显示结果，不重新执行 */
function attachCalcRuns(root, msg, opts) {
  const o = opts || {};
  const nodes = [...(root || document).querySelectorAll('.calc[data-code]:not([data-ready])')];
  for (const node of nodes) {
    node.dataset.ready = '1';
    let code = '';
    try { code = decodeURIComponent(escape(atob(node.dataset.code || ''))); } catch { code = ''; }
    const key = calcKey(code);
    const saved = msg && msg.calcResults && msg.calcResults[key];
    const out = node.querySelector('.calc-out');
    const btn = node.querySelector('.calc-run');
    const show = (v, err) => {
      if (!out) return;
      out.hidden = false;
      out.className = 'calc-out' + (err ? ' calc-err' : '');
      out.textContent = err ? ('计算失败：' + err) : String(v);
    };
    if (saved) {
      show(saved.value, saved.err);
      if (btn) btn.hidden = true;
      continue;
    }
    if (o.readOnly) { if (btn) btn.hidden = true; continue; }
    if (btn) {
      btn.addEventListener('click', () => {
        try {
          const v = safeCalc(code);
          show(v);
          if (msg) {
            msg.calcResults = msg.calcResults || {};
            msg.calcResults[key] = { value: v };
            const cv = current();
            if (cv && (cv.messages || []).includes(msg)) saveConv(cv);
          }
        } catch (e) {
          show(null, (e && e.message) || String(e));
        }
      });
    }
  }
}
function hydrateCalcs(root, msg, opts) { attachCalcRuns(root, msg, opts); }

/** chart 块：{type,labels,series} → 内联 SVG（不依赖第三方库） */
function chartSVG(specText) {
  let spec = null;
  try { spec = JSON.parse(specText); } catch (e) { return '<pre class="chart-err">图表数据不是合法 JSON</pre>'; }
  const type = String(spec.type || 'line').toLowerCase();
  const labels = Array.isArray(spec.labels) ? spec.labels.map(String) : [];
  const series = Array.isArray(spec.series) ? spec.series.filter((s) => s && Array.isArray(s.data)) : [];
  if (!labels.length || !series.length) return '<pre class="chart-err">图表缺少 labels 或 series</pre>';
  const W = 640, H = 300, padL = 44, padR = 16, padT = 24, padB = 40;
  const iw = W - padL - padR, ih = H - padT - padB;
  const colors = ['#c6613f', '#184f95', '#3f8f6a', '#8a5cb8', '#b8873a'];
  const max = Math.max(1, ...series.flatMap((s) => s.data.map((v) => Number(v) || 0)));
  const min = Math.min(0, ...series.flatMap((s) => s.data.map((v) => Number(v) || 0)));
  const span = max - min || 1;
  const x = (i) => padL + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v) => padT + ih - (((Number(v) || 0) - min) / span) * ih;
  const parts = [];
  parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" role="img">');
  // pie：单独排版——不画坐标轴/网格，避免轴标签、图例和饼图叠在一起
  const isPie = type === 'pie';
  for (let k = 0; !isPie && k <= 4; k++) {
    const gy = padT + (ih / 4) * k;
    const val = max - (span / 4) * k;
    parts.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--line)"/>');
    parts.push('<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="var(--dim)">' + (Math.round(val * 100) / 100) + '</text>');
  }
  labels.forEach((lb, i) => {
    if (isPie) return;
    parts.push('<text x="' + x(i) + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="11" fill="var(--dim)">' + esc(lb) + '</text>');
  });
  if (type === 'bar') {
    const bw = Math.max(6, (iw / labels.length) * 0.6 / series.length);
    series.forEach((s, si) => {
      s.data.forEach((v, i) => {
        const bx = padL + (iw / labels.length) * i + (iw / labels.length) * 0.2 + si * bw;
        const by = y(v);
        parts.push('<rect x="' + bx + '" y="' + by + '" width="' + (bw - 2) + '" height="' + Math.max(0, padT + ih - by) + '" rx="3" fill="' + colors[si % colors.length] + '"/>');
      });
    });
  } else if (type === 'pie') {
    const data = series[0].data.map((v) => Math.max(0, Number(v) || 0));
    const total = data.reduce((a, b) => a + b, 0) || 1;
    // 左边饼、右边图例，各自占一半宽度，互不覆盖
    const legendW = Math.min(220, Math.max(120, iw * 0.38));
    const pieArea = iw - legendW;
    const R = Math.max(40, Math.min(pieArea, ih) / 2 - 10);
    const cx = padL + pieArea / 2, cy = padT + ih / 2;
    let a0 = -Math.PI / 2;
    data.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
      const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      parts.push('<path d="M' + cx + ' ' + cy + ' L' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 + ' Z" fill="' + colors[i % colors.length] + '"/>');
      // 占比写在扇形里：太小的片子不写，避免文字压在一起
      const pct = (v / total) * 100;
      if (pct >= 8) {
        const mid = (a0 + a1) / 2;
        const lx = cx + R * 0.62 * Math.cos(mid), ly = cy + R * 0.62 * Math.sin(mid);
        parts.push('<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="600" fill="#fff">' + (Math.round(pct * 10) / 10) + '%</text>');
      }
      a0 = a1;
    });
    // 图例：色块 + 名称 + 百分比，纵向排列，超过高度自动分两列
    const rows = Math.max(1, labels.length);
    const lineH = Math.min(20, (ih - 8) / Math.min(rows, 8));
    const perCol = Math.max(1, Math.floor((ih - 8) / lineH));
    const lx0 = padL + pieArea + 8;
    labels.forEach((lb, i) => {
      const col = Math.floor(i / perCol), row = i % perCol;
      const lx = lx0 + col * 96;
      const ly = padT + 12 + row * lineH;
      parts.push('<rect x="' + lx + '" y="' + (ly - 8) + '" width="9" height="9" rx="2" fill="' + colors[i % colors.length] + '"/>');
      const pct = (Math.round((data[i] / total) * 1000) / 10);
      parts.push('<text x="' + (lx + 14) + '" y="' + (ly) + '" font-size="11" fill="var(--dim)">' + esc(lb) + '　' + pct + '%</text>');
    });
  } else {
    series.forEach((s, si) => {
      const pts = s.data.map((v, i) => x(i) + ',' + y(v)).join(' ');
      parts.push('<polyline points="' + pts + '" fill="none" stroke="' + colors[si % colors.length] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
      s.data.forEach((v, i) => parts.push('<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="' + colors[si % colors.length] + '"/>'));
    });
  }
  series.forEach((s, si) => {
    if (!s.name || isPie) return;
    parts.push('<rect x="' + (padL + si * 90) + '" y="4" width="8" height="8" rx="2" fill="' + colors[si % colors.length] + '"/>');
    parts.push('<text x="' + (padL + si * 90 + 12) + '" y="11" font-size="11" fill="var(--dim)">' + esc(String(s.name)) + '</text>');
  });
  parts.push('</svg>');
  const title = spec.title ? '<div class="chart-title">' + esc(String(spec.title)) + '</div>' : '';
  return '<figure class="chart">' + title + parts.join('') + '</figure>';
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
      const lang = (fence[1] || 'text').toLowerCase();
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      if (lang === 'chart') out.push(chartSVG(buf.join('\n')));
      else if (lang === 'calc' || lang === 'compute') {
        const codeTxt = buf.join('\n');
        let b64 = '';
        try { b64 = btoa(unescape(encodeURIComponent(codeTxt))); } catch (e) { b64 = ''; }
        out.push('<div class="calc" data-code="' + b64 + '">'
          + '<div class="calc-bar"><span class="calc-lab">计算</span>'
          + '<button type="button" class="calc-run">运行</button></div>'
          + '<pre class="calc-src">' + esc(codeTxt) + '</pre>'
          + '<div class="calc-out" hidden></div></div>');
      }
      else {
        const code = buf.join('\n');
        // 行号：每行拆成「序号 + 内容」，复制按钮仍然复制纯代码
        const codeHtml = esc(code).split('\n').map((ln, idx) =>
          '<span class="cl"><span class="cn">' + (idx + 1) + '</span><span class="ct">' + (ln || ' ') + '</span></span>'
        ).join('');
        out.push('<div class="pre-wrap"><div class="pre-head"><span class="pre-lang">' + esc(lang || 'text') + '</span>'
          + '<button type="button" class="pre-copy" data-code="' + encodeURIComponent(code).replace(/"/g, '&quot;') + '">复制</button></div>'
          + '<pre class="with-ln"><code>' + codeHtml + '</code></pre></div>');
      }
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const lv = Math.min(h[1].length, 3); out.push('<h' + lv + '>' + inline(esc(h[2])) + '</h' + lv + '>'); i++; continue; }
    if (/^\$\$/.test(line.trim())) {
      flush();
      const buf = [];
      const oneLine = line.trim().replace(/^\$\$/, '');
      i++;
      if (/\$\$\s*$/.test(oneLine) || !oneLine.trim()) {
        out.push('<div class="math-block">' + texHTML(oneLine.replace(/\$\$\s*$/, ''), true) + '</div>');
        continue;
      }
      buf.push(oneLine);
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      const lastLine = (lines[i] || '').replace(/\$\$\s*$/, '');
      if (lastLine.trim()) buf.push(lastLine);
      i++;
      out.push('<div class="math-block">' + texHTML(buf.join('\n'), true) + '</div>');
      continue;
    }
    if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).filter((r) => !/^[\s:|-]+$/.test(r.trim().replace(/^\|/, '').replace(/\|$/, '')));
      out.push('<div class="tbl-wrap"><table><thead><tr>' + head.map((c) => '<th>' + inline(esc(c)) + '</th>').join('') + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + cells(r).map((c) => '<td>' + inline(esc(c)) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + inline(esc(buf.join('\n'))) + '</blockquote>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const nodes = [];
      const stack = [];
      let baseIndent = null;
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        const indent = String(m[1] || '').replace(/\t/g, '  ').length;
        if (baseIndent == null) baseIndent = indent;
        const depth = Math.min(5, Math.max(0, Math.round((indent - baseIndent) / 2)));
        const node = { type: /\d+\./.test(m[2]) ? 'ol' : 'ul', text: m[3], children: [] };
        while (stack.length > depth) stack.pop();
        const parent = stack.length ? stack[stack.length - 1] : null;
        if (parent) parent.children.push(node); else nodes.push(node);
        stack.push(node);
        i++;
      }
      const renderLi = (n) => '<li>' + inline(esc(n.text)) + (n.children.length ? renderList(n.children) : '') + '</li>';
      const renderList = (list) => {
        let html = '';
        for (let k = 0; k < list.length;) {
          const tag = list[k].type;
          let j = k;
          while (j < list.length && list[j].type === tag) j++;
          html += '<' + tag + '>' + list.slice(k, j).map(renderLi).join('') + '</' + tag + '>';
          k = j;
        }
        return html;
      };
      out.push(renderList(nodes));
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
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal || (ctrl && ctrl.signal),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errText(status, data) {
  if (status === 401) {
    const msg = data && (data.error || data.e);
    return msg ? String(msg) : '登录过期了，重新进一下';
  }
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

for (const sel of ['#loginName', '#loginPass']) {
  const elx = document.querySelector(sel);
  if (!elx) continue;
  elx.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#loginOk').click(); }
  });
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
    sessionEpoch += 1;
    LS.token = data.token; LS.name = data.name; LS.role = data.role;
    $('#dlgLogin').hidden = true;
    renderIdentity(); renderModels();
    await bootData();
    startSync();
  } catch { $('#loginErr').textContent = '连不上后端'; }
  finally { $('#loginOk').disabled = false; }
});

function logout() {
  sessionEpoch += 1;
  stopSync();
  try { if (state.controller) state.controller.abort(); } catch {}
  try { localStorage.removeItem(draftKey()); localStorage.removeItem(scopedKey('convs.cache')); } catch {}
  LS.token = ''; LS.role = ''; LS.name = '';
  clearLegacyKeys();
  state.convs = []; state.projects = []; state.currentId = null;
  state.attachments = []; state.pendingSkill = null; state.editing = null;
  state.streaming = false; state.skills = []; state.tools = [];
  saveStates.clear(); saveQueues.clear();
  thread.textContent = ''; listBox.textContent = '';
  $('#empty').hidden = false;
  renderIdentity();
  showLogin('');
}

function renderIdentity() {
  $('#meName').textContent = LS.name || '未登录';
  const assetBtn = $('#assetBtn');
  if (assetBtn) assetBtn.hidden = LS.role !== 'admin';
  $('#meAvatar').textContent = (LS.name || '?').slice(0, 1);
  const r = { astra: 'Astra', admin: '管理员' }[LS.role] || '';
  $('#meRole').textContent = r; $('#meRole').hidden = !r;
  $('#meHint').textContent = '· Free';
  const up = $('#upHead');
  if (up) up.textContent = (LS.name || '未登录') + ' · Free' + (r ? ' · ' + r : '');
}

/* ---------------- 主题（跟随系统 / 浅色 / 深色） ---------------- */
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
let themeMq = null;

function resolvedTheme() {
  const t = LS.theme;
  if (t === 'light' || t === 'dark') return t;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}

function applyTheme() {
  const mode = resolvedTheme();
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  // 字号：写进 CSS 变量，body 与对话正文都跟着走
  // 默认 16px（对齐 Claude）；早期默认是 15，这里做一次迁移
  if (!LS.fontMigrated) {
    if (!LS.font || Number(LS.font) === 15) LS.font = 16;
    LS.fontMigrated = true;
    persistSettings();
  }
  const fs = Number(LS.font) || 16;
  document.documentElement.style.setProperty('--ui-font', fs + 'px');
  document.documentElement.style.setProperty('--ui-line', Math.round(fs * 1.4) + 'px');
  const btn = $('#themeBtn');
  if (btn) {
    btn.textContent = LS.theme === 'auto' ? '◐' : (mode === 'light' ? '☀' : '☾');
    btn.title = '外观：' + THEME_LABEL[LS.theme] + '（点击切换）';
  }
}

function initTheme() {
  applyTheme();
  if (themeMq) return;
  try {
    themeMq = window.matchMedia('(prefers-color-scheme: light)');
    themeMq.addEventListener('change', () => { if (LS.theme === 'auto') applyTheme(); });
  } catch { /* 老浏览器忽略 */ }
}

/* ---------------- 花费显示 ---------------- */
let usageData = null;
let usageTimer = null;

function formatUsd(n) {
  const v = Number(n) || 0;
  if (v === 0) return '$0';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(3);
  if (v >= 0.0001) return '$' + v.toFixed(4);
  return '$' + v.toFixed(6);   // 极小金额别显示成 $0.0000
}

async function refreshUsage() {
  if (!LS.token) return;
  try {
    const r = await api('/usage');
    if (!r.ok) return;
    usageData = await r.json();
    renderUsageBar();
    renderPlanPill();
    if (!$('#dlgUsage').hidden) renderUsageDialog();
  } catch { /* 统计失败不影响聊天 */ }
}

function scheduleUsage() {
  clearTimeout(usageTimer);
  usageTimer = setTimeout(refreshUsage, 1500);
}

/** 首页额度药丸（点开看明细） */
function renderPlanPill() {
  const el = $('#planPill');
  if (!el) return;
  const a = usageData && usageData.allowance;
  if (!a) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = '剩余 ' + formatUsd(a.remaining) + ' · 每月 ' + a.resetDay + ' 日重置';
}

/** 跨会话收集编程模式产物（files），最近优先 */
function recentArtifacts(limit) {
  const out = [];
  for (const c of state.convs || []) {
    for (const f of (c.files || [])) {
      out.push({ name: f.name, at: f.updatedAt || 0, convId: c.id, convTitle: c.title || '未命名', content: String(f.content || ''), head: String(f.content || '').slice(0, 160) });
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, limit || 6);
}

function openArtifact(it) {
  state.currentId = it.convId;
  renderAll();
  const cv = current();
  if (!cv) return;
  const idx = (cv.files || []).findIndex((f) => f.name === it.name);
  if (idx >= 0) { state.fileIdx = idx; openCodePane(); }
}

/* 图片尺寸记忆：先按已知比例占位，避免加载时才撑开导致页面跳动 */
const DIMS_KEY = 'ai.imgdims';
let imgDims = {};
try { imgDims = JSON.parse(localStorage.getItem(DIMS_KEY) || '{}') || {}; } catch (e) { imgDims = {}; }
let dimsSaveTimer = 0;
function rememberDims(url, w, h) {
  if (!url || !w || !h) return;
  imgDims[url] = [w, h];
  clearTimeout(dimsSaveTimer);
  dimsSaveTimer = setTimeout(() => {
    try {
      const keys = Object.keys(imgDims);
      if (keys.length > 600) {
        // 只留最近写入的一部分，避免无限膨胀
        const keep = {};
        for (const k of keys.slice(-400)) keep[k] = imgDims[k];
        imgDims = keep;
      }
      localStorage.setItem(DIMS_KEY, JSON.stringify(imgDims));
    } catch (e) {}
  }, 600);
}
function dimsOf(url) { return imgDims[url] || null; }
let dimsConvTimer = 0;
function queueDimsSave() {
  clearTimeout(dimsConvTimer);
  dimsConvTimer = setTimeout(() => {
    const cv = current();
    if (!cv) return;
    if ((cv.messages || []).some((mm) => mm.streaming)) return;   // 别和流式保存打架
    saveConv(cv).catch(() => {});
  }, 2500);
}

/** 产物预览：md 渲染 / 幻灯片首页 / 网页缩略 / 图片 */
function artifactPreview(it) {
  const name = String(it.name || '');
  const content = String(it.content || '');
  const box = el('div', 'prev-render');
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) {
    const img = document.createElement('img');
    img.src = /^https?:|^\/oss\//.test(content) ? fileUrl(content) : content;
    img.loading = 'lazy';
    box.append(img);
    return box;
  }
  if (/deck\.json$/i.test(name)) {
    let deck = { slides: [] };
    try { deck = JSON.parse(content); } catch (e) {}
    const s = (deck.slides || [])[0] || { title: '（空）', bullets: [] };
    const slide = el('div', 'mini-slide');
    slide.append(el('div', 'ms-t', s.title || ''));
    const ul = el('ul', 'ms-b');
    for (const b of (s.bullets || []).slice(0, 3)) ul.append(el('li', null, b));
    slide.append(ul);
    slide.append(el('div', 'ms-n', '1 / ' + Math.max(1, (deck.slides || []).length)));
    box.append(slide);
    return box;
  }
  if (/\.html?$/i.test(name)) {
    const frame = document.createElement('iframe');
    frame.className = 'mini-page';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('scrolling', 'no');
    frame.loading = 'lazy';
    frame.srcdoc = content || '<body style="font:13px system-ui;color:#aaa;padding:12px">空页面</body>';
    box.append(frame);
    return box;
  }
  if (/\.(md|markdown|txt)$/i.test(name)) {
    const mdBox = el('div', 'mini-md bd');
    mdBox.innerHTML = md(content || '');
    box.append(mdBox);
    return box;
  }
  box.append(el('pre', 'mini-code', content.slice(0, 400)));
  return box;
}
function renderRecentArtifacts() {
  const box = $('#recentArt');
  const list = $('#raList');
  if (!box || !list) return;
  const items = recentArtifacts(6);
  if (!items.length) { box.hidden = true; return; }
  box.hidden = false;
  list.textContent = '';
  for (const it of items) {
    const b = el('button', 'ra-card');
    b.type = 'button';
    const prev = artifactPreview(it);
    prev.classList.add('ra-prev');
    const n = el('div', 'n');
    n.append(el('span', 'ftype', /\.html?$/i.test(it.name) ? '</>' : /\.(png|jpe?g|gif|svg)$/i.test(it.name) ? 'IMG' : 'FILE'));
    n.append(el('span', null, it.name));
    const m = el('div', 'm', it.convTitle + ' · ' + when(it.at));
    b.append(prev, n, m);
    b.addEventListener('click', () => openArtifact(it));
    list.append(b);
  }
}

function renderUsageBar() {
  const t = $('#usageText');
  if (!t || !usageData) return;
  const star = usageData.est ? '*' : '';
  const a = usageData.allowance;
  const head = a ? '剩余 ' + formatUsd(a.remaining) : '今日 ' + formatUsd(usageData.today);
  t.textContent = head + ' · 今日 ' + formatUsd(usageData.today) + star;
  const parts = ['点击看明细'];
  if (a) parts.push('每月 ' + a.resetDay + ' 日重置为 ' + formatUsd(a.limit));
  if (usageData.est) parts.push('* 含按张估算的图');
  $('#usageBar').title = parts.join(' · ');
}

function renderUsageDialog() {
  const d = usageData;
  if (!d) return;
  $('#uToday').textContent = formatUsd(d.today);
  $('#uMonth').textContent = formatUsd(d.month);
  $('#uTotal').textContent = formatUsd(d.total);
  $('#uEst').textContent = String(d.imageEst != null ? d.imageEst : 0.04);
  const a = d.allowance;
  $('#uLeft').textContent = a ? formatUsd(a.remaining) : '—';
  const srcEl = $('#uSource');
  if (srcEl) {
    srcEl.textContent = a && a.source === 'admin' ? 'OpenAI 账单（Admin key）' : '本地记账';
    srcEl.style.color = a && a.source === 'admin' ? '#6fe0a8' : '';
  }
  if (a) {
    $('#uResetDay').textContent = String(a.resetDay);
    $('#uLimit').textContent = formatUsd(a.limit);
    const when = new Date(a.resetAt);
    const pad = (n) => String(n).padStart(2, '0');
    $('#uResetLine').innerHTML = '每月 <b>' + a.resetDay + '</b> 日 00:00 重置为 <b>' +
      formatUsd(a.limit) + '</b>　下次 ' + (when.getMonth() + 1) + ' 月 ' + when.getDate() + ' 日'
      + (a.baselineUsd != null ? '　（已按 $' + a.baselineUsd.toFixed(2) + ' 校准）' : '');
  }

  const models = $('#uModels');
  models.textContent = '';
  if (!d.byModel || !d.byModel.length) {
    models.append(el('div', 'u-row', '还没有记录'));
  } else {
    for (const m of d.byModel) {
      const row = el('div', 'u-row');
      const tokens = (m.i || 0) + (m.o || 0);
      row.append(el('span', 'k', m.model + '　' + (tokens ? tokens.toLocaleString() + ' tokens' : (m.n || 0) + ' 次')));
      row.append(el('b', null, formatUsd(m.usd)));
      models.append(row);
    }
  }

  const convs = $('#uConvs');
  convs.textContent = '';
  if (!d.convs || !d.convs.length) convs.append(el('div', 'u-row', '还没有记录'));
  else for (const c of d.convs) {
    const row = el('div', 'u-row');
    // 服务端只回 id，这里翻成对话名；找不到说明已删
    const known = (state.convs || []).find((x) => x.id === c.id);
    const looksLikeId = /^[a-z0-9]{6,}$/i.test(String(c.title || ''));
    const label = known ? (known.title || '未命名') : (looksLikeId ? '已删除的对话' : (c.title || c.id));
    row.append(el('span', 'k', label));
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
/* ---------------- 技能（万物皆插件） ---------------- */
async function loadSkills() {
  try {
    const r = await api('/skills');
    if (!r.ok) return;
    const j = await r.json().catch(() => ({}));
    state.skills = Array.isArray(j.skills) ? j.skills : [];
  } catch (e) { /* 技能加载失败不影响聊天 */ }
}
async function loadTools() {
  try {
    const r = await api('/tools');
    if (!r.ok) return;
    const j = await r.json().catch(() => ({}));
    state.tools = Array.isArray(j.tools) ? j.tools : [];
  } catch (e) {}
}
function skillById(id) {
  return (state.skills || []).find((s) => s.id === id || s.cmd === String(id || '').replace(/^\//, '')) || null;
}

async function loadProjects() {
  let r;
  try { r = await api('/projects'); } catch { return; }
  if (r.status === 401) { logout(); return; }
  if (!r.ok) return;
  state.projects = (await r.json()).projects || [];
  for (const p of state.projects) if (state.open[p.id] === undefined) state.open[p.id] = true;
}

async function loadConvs() {
  const epoch = sessionEpoch;
  let r;
  try { r = await api('/convs'); } catch { return false; }   // 超时/断网保留缓存
  if (epoch !== sessionEpoch) return false;                  // 账号已切换：丢弃旧响应
  if (r.status === 401) { logout(); return false; }
  if (!r.ok) return false;
  const data = await r.json().catch(() => null);
  if (!data) return false;
  if (epoch !== sessionEpoch) return false;
  const before = state.convs.slice();
  state.convs = (data.conversations || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const cv of state.convs) if (!Array.isArray(cv.files)) cv.files = [];

  // 本地有更新但还没写完的会话，别被服务端旧数据盖掉（否则刚发的消息会“消失”）
  const localNewer = new Map();
  for (const c of before) if ((c.updatedAt || 0) > 0) localNewer.set(c.id, c);
  const isDirty = (id) => {
    const rec = saveStates.get(id);
    return !!((rec && ['pending', 'failed', 'conflict'].includes(rec.state)) || saveQueues.has(id));
  };
  state.convs = state.convs.map((s) => {
    const l = localNewer.get(s.id);
    if (!l) return s;
    const dirty = isDirty(s.id);
    const newer = (l.updatedAt || 0) > (s.updatedAt || 0) + 800 && Array.isArray(l.messages) && l.messages.length;
    if (!dirty && !newer) return s;
    // 有未解决编辑/冲突/正在保存：保留本地工作副本（标题/正文/文件/版本），不被轮询覆盖
    return { ...s, title: l.title, messages: l.messages, files: l.files || s.files, settings: l.settings || s.settings, rev: l.rev, updatedAt: l.updatedAt };
  });
  // 一次性把会话里记录的 5.6 Terra / Luna 升到 6.1 Terra（中等思考）
  if (!localStorage.getItem('ai.convModelMigrated61')) {
    localStorage.setItem('ai.convModelMigrated61', '1');
    for (const cv of state.convs) {
      if (cv.settings && RETIRED_DEFAULT_RE.test(String(cv.settings.model || ''))) {
        cv.settings.model = 'gpt-6.1-terra';
        cv.settings.effort = 'medium';
        saveConv(cv).catch(() => {});
      }
    }
  }

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
  if (!r.ok) {
    if (r.status === 401) { const e = new Error('登录过期了'); e.status = 401; throw e; }
    return null;
  }
  const { conversation } = await r.json();
  state.convs.unshift(conversation);
  state.currentId = conversation.id;
  return conversation;
}



/* ---------------- 设备资产检查（C2/C3 UI） ---------------- */
function assetReportHTML(job) {
  if (!job) return '';
  if (job.status === 'queued' || job.status === 'running') return '<p>检查中…（' + (job.status === 'queued' ? '排队' : '执行') + '）</p>';
  if (job.status === 'failed') return '<p class="warn">检查失败：' + esc(job.error || '未知错误') + '</p>';
  const rep = job.report || {};
  const rows = Array.isArray(rep.objects) ? rep.objects : [];
  let html = '<table><thead><tr><th>对象</th><th>面数</th><th>材质</th><th>UV</th><th>贴图</th></tr></thead><tbody>';
  for (const o of rows) {
    html += '<tr><td>' + esc(String(o.name || '')) + '</td><td>' + esc(String(o.faces == null ? '' : o.faces)) + '</td><td>' + esc(String(o.materials == null ? '' : o.materials)) + '</td><td>' + esc(o.uv ? '有' : '无') + '</td><td>' + esc(String(o.textures == null ? 0 : o.textures)) + '</td></tr>';
  }
  html += '</tbody></table>';
  if (Array.isArray(rep.warnings) && rep.warnings.length) html += '<div class="warn">' + rep.warnings.map((w) => esc(String(w))).join('<br>') + '</div>';
  return html;
}
async function openAssetDialog() {
  const dlg = $('#dlgAsset');
  const sel = $('#assetDevice');
  const rep = $('#assetReport');
  if (!dlg || !sel) return;
  sel.textContent = '';
  rep.textContent = '';
  dlg.hidden = false;
  const opt = (val, text) => { const o = document.createElement('option'); o.value = val; o.textContent = text; sel.append(o); };
  try {
    const r = await api('/devices');
    const j = await r.json().catch(() => ({}));
    const devs = Array.isArray(j.devices) ? j.devices : [];
    if (!devs.length) opt('', '没有已配对设备');
    for (const d of devs) opt(d.id, d.name + (d.online ? '（在线）' : '（离线）'));
  } catch (e) {
    opt('', '读取设备失败');
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest && e.target.closest('#assetBtn');
  if (b) { closePops(); openAssetDialog(); return; }
  if (e.target.closest && e.target.closest('#assetClose')) { const d = $('#dlgAsset'); if (d) d.hidden = true; return; }
  if (e.target.closest && e.target.closest('#assetRun')) {
    const btn = $('#assetRun');
    const dev = $('#assetDevice').value;
    const pth = $('#assetPath').value.trim();
    const rep = $('#assetReport');
    if (!dev) { flashHint('先选一台设备'); return; }
    if (!pth) { flashHint('填一下 .blend 路径'); return; }
    btn.disabled = true;
    rep.innerHTML = '<p>提交中…</p>';
    try {
      const r = await api('/assets/inspect', { method: 'POST', body: { deviceId: dev, path: pth } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.job) { rep.innerHTML = '<p class="warn">' + esc((j && j.error) || '提交失败') + '</p>'; return; }
      let job = j.job;
      rep.innerHTML = assetReportHTML(job);
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 800));
        const rr = await api('/assets/jobs/' + encodeURIComponent(job.id));
        const jj = await rr.json().catch(() => ({}));
        job = jj.job || job;
        rep.innerHTML = assetReportHTML(job);
        if (job.status === 'done' || job.status === 'failed') break;
      }
    } catch (err) {
      rep.innerHTML = '<p class="warn">' + esc(String((err && err.message) || err)) + '</p>';
    } finally {
      btn.disabled = false;
    }
  }
});

/* ---------------- 任务（runs）：创建 / 取消 / 面板 ---------------- */
const RUN_STATUS = { queued: '排队', running: '运行中', cancelling: '取消中', succeeded: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' };
const RUN_ACTIVE = new Set(['queued', 'running', 'cancelling']);
function newRunKey() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
async function loadRuns() {
  try {
    const r = await api('/runs');
    if (!r.ok) return;
    const j = await r.json().catch(() => ({}));
    state.runs = Array.isArray(j.runs) ? j.runs : [];
    renderRunChip();
  } catch (e) {}
}
function renderRunChip() {
  const b = $('#runChip');
  if (!b) return;
  const active = (state.runs || []).filter((r) => RUN_ACTIVE.has(r.status));
  b.hidden = false;
  b.textContent = active.length ? ('任务 · ' + active.length) : '任务';
  b.classList.toggle('on', active.length > 0);
  b.title = active.length ? (active.length + ' 个任务进行中') : '最近任务';
}
async function cancelRun(id, refresh = true) {
  try { await api('/runs/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }); } catch (e) {}
  if (refresh) await loadRuns();
}
async function openRunDetail(id) {
  let run = null;
  try {
    const r = await api('/runs/' + encodeURIComponent(id));
    if (r.ok) { const j = await r.json(); run = j.run; }
  } catch (e) {}
  if (!run) { flashHint('读不到任务详情'); return; }
  const rows = [];
  if (['failed', 'interrupted', 'cancelled'].includes(run.status)) {
    rows.push({
      label: '重试这个任务',
      sub: '用同样的请求再跑一次',
      onClick: async () => {
        try {
          const r = await api('/runs/' + encodeURIComponent(id) + '/retry', { method: 'POST' });
          const j = await r.json().catch(() => ({}));
          flashHint(r.ok ? '已重试，任务面板可看进度' : (j.error || '重试失败'));
        } catch (e) { flashHint('重试失败'); }
        await loadRuns();
        openRunsPanel();
      },
    });
  }
  const evs = (run.events || []).slice(-12).reverse();
  for (const e of evs) {
    rows.push({ label: e.type, sub: new Date(e.at || Date.now()).toLocaleTimeString('zh-CN', { hour12: false }) + (e.data && e.data.error ? ' · ' + String(e.data.error).slice(0, 50) : '') });
  }
  rows.push({ label: '返回任务列表', sub: '刷新并回到列表', onClick: async () => { await loadRuns(); openRunsPanel(); } });
  openListPanel('任务详情', (RUN_STATUS[run.status] || run.status) + ' · ' + (run.title || run.id), rows);
}
function openRunsPanel() {
  const list = [...(state.runs || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 10);
  const rows = [{
    label: '刷新', sub: '拉取最新任务状态', onClick: async () => { await loadRuns(); openRunsPanel(); },
  }];
  for (const r of list) {
    const active = RUN_ACTIVE.has(r.status);
    const when = new Date(r.updatedAt || r.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
    rows.push({
      label: (RUN_STATUS[r.status] || r.status) + ' · ' + (r.title || r.id),
      sub: when + (r.costUsd ? ' · $' + Number(r.costUsd).toFixed(4) : '') + (active ? ' · 点一下取消' : (r.error ? ' · ' + String(r.error).slice(0, 40) : '')),
      onClick: active ? async () => { await cancelRun(r.id); openRunsPanel(); } : async () => { openRunDetail(r.id); },
    });
  }
  openListPanel('任务', list.length ? '最近 10 个任务；运行中的点一下取消' : '还没有任务', rows);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#runChip');
  if (!b) return;
  loadRuns().then(openRunsPanel);
});

/* ---------------- 保存：状态、串行化、版本冲突 ---------------- */
const saveQueues = new Map();
const saveStates = new Map(); // convId -> { state, at, error }
const SAVE_LABEL = { pending: '保存中…', saved: '已保存', failed: '未保存', conflict: '有冲突' };

/** 保存用的快照：成功时只有这份内容被确认，不能顺带把更新标成已保存 */
function convSnapshot(conv, extra) {
  return JSON.stringify({
    title: conv.title,
    messages: conv.messages,
    projectId: conv.projectId || null,
    private: !!conv.private,
    files: conv.files || [],
    settings: conv.settings || {},
    archived: !!conv.archived,
    artifact: conv.artifact || null,
    design: conv.design || null,
    cutIndex: (typeof conv.cutIndex === 'number' && conv.cutIndex >= 0) ? conv.cutIndex : null,
    extra: extra || null,
  });
}

function paintSaveState() {
  const elc = $('#saveState');
  if (!elc) return;
  const cv = current();
  const rec = cv ? saveStates.get(cv.id) : null;
  if (!rec || !cv || rec.state === 'saved' && Date.now() - rec.at > 2500) {
    elc.hidden = true;
    return;
  }
  elc.hidden = false;
  elc.textContent = SAVE_LABEL[rec.state] || '';
  elc.dataset.state = rec.state;
  elc.title = rec.error ? String(rec.error).slice(0, 200) : (rec.state === 'conflict' ? '服务器上这个对话更新过，点这里处理' : '');
}

function setSaveState(conv, state, error, extra) {
  if (!conv || !conv.id) return;
  const prev = saveStates.get(conv.id) || {};
  // 合并：重复标记 conflict 时不能丢掉 serverRev
  saveStates.set(conv.id, { ...prev, state, at: Date.now(), error: error || '', ...(extra || {}) });
  paintSaveState();
  if (state === 'saved') setTimeout(paintSaveState, 2600);
}

async function saveConv(conv, extra) {
  if (!conv || !conv.id) return { ok: false, error: '没有会话' };
  // 冲突未解决：暂停这个会话的保存队列，绝不自动提交旧内容
  const rec0 = saveStates.get(conv.id);
  if (conv.__conflict || (rec0 && rec0.state === 'conflict')) {
    setSaveState(conv, 'conflict');
    return { ok: false, conflict: true };
  }
  const prev = saveQueues.get(conv.id) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => doSaveConv(conv, extra));
  saveQueues.set(conv.id, run);
  state.saving = true;
  try { return await run; } finally {
    if (saveQueues.get(conv.id) === run) {
      saveQueues.delete(conv.id);
      state.saving = [...saveQueues.values()].length > 0;
      paintSaveState();
    }
  }
}

async function doSaveConv(conv, extra) {
  if (conv.__cacheOnly) {
    // 还没从服务器载入正文，不能拿空的 messages 覆盖
    return { ok: false, error: '缓存占位，未保存' };
  }
  const rec0 = saveStates.get(conv.id);
  if (conv.__conflict || (rec0 && rec0.state === 'conflict')) {
    setSaveState(conv, 'conflict');
    return { ok: false, conflict: true };
  }
  setSaveState(conv, 'pending');
  const body = {
    title: conv.title,
    messages: conv.messages,
    projectId: conv.projectId || null,
    private: !!conv.private,
    files: conv.files || [],
    settings: conv.settings || {},
    archived: !!conv.archived,
    artifact: conv.artifact || null,
    design: conv.design || null,
    cutIndex: (typeof conv.cutIndex === 'number' && conv.cutIndex >= 0) ? conv.cutIndex : null,
    ...(extra || {}),
  };
  if (Number.isFinite(Number(conv.rev))) body.baseRev = Number(conv.rev);
  const snapshot = convSnapshot(conv, extra);
  const epoch = sessionEpoch;
  let res;
  try {
    res = await api('/convs/' + encodeURIComponent(conv.id), { method: 'PUT', body });
  } catch (e) {
    setSaveState(conv, 'failed', e && e.message);
    pendingSaves.set(conv.id, conv);
    return { ok: false, error: e };
  }
  if (epoch !== sessionEpoch) {
    // 保存发出后切换了账号：结果不属于当前身份，丢弃
    return { ok: false, stale: true };
  }
  if (res.status === 409) {
    const j = await res.json().catch(() => ({}));
    // 只记录服务器版本，不把它当作本地已确认版本；否则下一次保存会带着旧内容覆盖
    conv.__conflict = true;
    conv.__serverRev = Number.isFinite(Number(j.rev)) ? Number(j.rev) : null;
    setSaveState(conv, 'conflict', '', { serverRev: conv.__serverRev });
    return { ok: false, conflict: true };
  }
  if (!res.ok) {
    let msg = '保存失败（HTTP ' + res.status + '）';
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
    setSaveState(conv, 'failed', msg);
    return { ok: false, error: msg };
  }
  const j = await res.json().catch(() => ({}));
  if (j && j.conversation) {
    conv.rev = j.conversation.rev;
    conv.updatedAt = j.conversation.updatedAt;
  }
  conv.__lastSaved = snapshot;
  conv.__serverRev = null;
  // 保存期间又有新改动：只确认这份快照，剩下的继续排队
  if (convSnapshot(conv, extra) !== snapshot) {
    setSaveState(conv, 'pending');
    setTimeout(() => { if (!conv.__conflict) saveConv(conv); }, 30);
    return { ok: true, more: true };
  }
  setSaveState(conv, 'saved');
  pingTabs();
  return { ok: true };
}

// 点保存状态：失败重试；冲突时选「重新载入」或「强制覆盖」
document.addEventListener('click', async (e) => {
  const b = e.target.closest && e.target.closest('#saveState');
  if (!b) return;
  const cv = current();
  if (!cv) return;
  const rec = saveStates.get(cv.id);
  if (!rec) return;
  if (rec.state === 'conflict' || cv.__conflict) {
    openListPanel('保存冲突', '这个对话在别处更新过。选择保留哪一份：', [
      { label: '重新载入服务器版本', sub: '放弃本地未保存的改动', onClick: async () => {
        $('#dlgList').hidden = true;
        const r = await api('/convs/' + encodeURIComponent(cv.id));
        if (!r.ok) { flashHint('载入失败'); return; }
        const j = await r.json().catch(() => ({}));
        if (j && j.conversation) {
          const i = state.convs.findIndex(x => x.id === cv.id);
          if (i >= 0) state.convs[i] = j.conversation;
          cv.__conflict = false;
          cv.__serverRev = null;
          saveStates.delete(cv.id);
          renderAll();
          flashHint('已载入服务器版本');
        }
      } },
      { label: '用本地覆盖', sub: '以当前页面为准，覆盖服务器', onClick: async () => {
        $('#dlgList').hidden = true;
        // 明确覆盖：以服务器最新版本为 baseRev，提交当前本地内容
        cv.__conflict = false;
        const rec2 = saveStates.get(cv.id) || {};
        const srvRev = Number(cv.__serverRev) || Number(rec2.serverRev);
        if (Number.isFinite(srvRev) && srvRev > 0) cv.rev = srvRev;
        saveStates.delete(cv.id);
        saveStates.set(cv.id, { state: 'pending', at: Date.now(), error: '' });
        const r = await saveConv(cv);
        if (r.ok) { flashHint('已覆盖'); renderAll(); }
        else flashHint('覆盖失败，仍未保存');
      } },
    ]);
    return;
  }
  await saveConv(cv);
});

/* ---- 会话自带的界面状态（共享） ---- */
let settingsTimer = null;

function persistSettings() {
  const cv = current();
  if (!cv) return;
  cv.settings = {
    model: LS.model,
    effort: LS.effort,
    codeMode: !!state.codeMode,
    workMode: !!state.workMode,
    search: !!state.search,
    raw: !!state.rawUpload,
    imageMode: !!state.imageMode,
    gifMode: !!state.gifMode,
  };
  clearTimeout(settingsTimer);
  // 流式期间不要单独保存设置：服务端写文件会推进 rev，旧快照的 PUT 会撞 409 并暂停队列
  if (state.streaming) { cv.__settingsDirty = true; return; }
  settingsTimer = setTimeout(() => saveConv(cv), 600);
}

const RETIRED_DEFAULT_RE = /gpt-5\.6-(terra|luna)/i;

function applyConvSettings(cv) {
  // 这个会话带产物（文档/幻灯片/设计）就顺手把右侧面板打开
  // 手机上不自动铺开：整屏面板会把刚点开的对话盖住，底部的「产物」按钮仍可手动打开
  const narrow = window.innerWidth < 900;
  if (cv && cv.artifact && cv.artifact.kind) {
    const pane = $('#artPane');
    // 换会话时按它自己的产物类型重开，避免沿用上一个面板
    if (!narrow && pane && (pane.hidden || artKind !== cv.artifact.kind || artName !== cv.artifact.name)) {
      openArtifactPane(cv.artifact.kind, cv.artifact.name);
    } else if (narrow) {
      closeArtifactPane();
      artKind = cv.artifact.kind;
      artName = cv.artifact.name;
    }
  } else if (cv && !cv.artifact) {
    closeArtifactPane();
  }
  const s = cv && cv.settings;
  if (!s) return;
  // 空会话不吃历史设置：新对话一律用当前默认（6.1 Terra / 中等）
  if (!(cv.messages || []).length && !(cv.files || []).length) return;
  applyingSettings = true;
  try {
    if (s.model) { modelPinned = true; LS.model = s.model; }   // 会话记录的就是它当时用的模型，直接恢复
    if (s.effort) LS.effort = s.effort;

    // 开关按会话重置；联网缺省为开（模型按需调用）
    setCap('code', !!s.codeMode);
    setCap('work', !!s.workMode);
    setCap('search', s.search === undefined ? true : !!s.search);
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
  const row = el('div', 'kid' + (cv.id === state.currentId ? ' on' : '') + (cv.archived ? ' archived' : ''));
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.draggable = true;
  row.dataset.id = cv.id;
  const t = el('span', 't', (cv.private ? '🔒 ' : '') + (cv.title || '新对话'));
  const time = el('span', 'time', when(cv.updatedAt));
  const act = el('button', 'row-act');
  act.type = 'button';
  act.title = '更多';
  act.innerHTML = ic('ellipsis', 15);
  act.addEventListener('click', (e) => {
    e.stopPropagation();
    // 先记下位置：下面会重渲染，这个按钮会被替换掉
    const r = act.getBoundingClientRect();
    state.currentId = cv.id;
    applyConvSettings(cv);
    renderAll();
    const pop = $('#menuPop');
    closePops();
    pop.hidden = false;
    const w = 220;
    const h = pop.offsetHeight || 300;
    pop.style.left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8) + 'px';
    pop.style.top = Math.min(Math.max(8, r.bottom + 6), window.innerHeight - h - 8) + 'px';
  });
  // 有产物的对话，在行尾给一个文件小标（对齐 Claude 的 artifact 提示）
  if ((cv.files || []).length) {
    const mark = el('span', 'row-art');
    mark.title = '这个对话有产物（' + cv.files.length + ' 个）';
    mark.innerHTML = ic('file', 13);
    row.append(t, mark, time, act);
  } else {
    row.append(t, time, act);
  }

  if (isAdmin() && cv.private && cv.owner) {
    const own = el('span', 'lock', cv.owner);
    row.append(own);
  }

  row.addEventListener('click', async () => {
    if (state.streaming) return;
    if (cv.__stale) await ensureFreshConv(cv);
    state.view = 'chat';
    state.currentId = cv.id;
    const cur = state.convs.find((c) => c.id === cv.id) || cv;
    applyConvSettings(cur);
    renderAll();
    closeNav();
  });
  // 右键也能开会话菜单
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      state.view = 'chat';
      state.currentId = cv.id;
      applyConvSettings(cv);
      renderAll();
      closeNav();
    }
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = act.getBoundingClientRect();
    state.currentId = cv.id;
    applyConvSettings(cv);
    renderAll();
    const pop = $('#menuPop');
    closePops();
    pop.hidden = false;
    pop.style.left = Math.min(Math.max(8, e.clientX), window.innerWidth - 228) + 'px';
    pop.style.top = Math.min(Math.max(8, e.clientY), window.innerHeight - 300) + 'px';
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

function renderSkeleton() {
  if ((state.convs || []).length) return;
  listBox.textContent = '';
  for (let i = 0; i < 5; i++) {
    const row = el('div', 'sk-row');
    listBox.append(row);
  }
}
function renderSide() {
  const q = $('#q').value.trim().toLowerCase();
  listBox.textContent = '';
  // 搜索同时匹配标题和正文（Claude 的侧栏搜索也搜内容）
  const matches = (cv) => {
    if (!q) return true;
    if (String(cv.title || '').toLowerCase().includes(q)) return true;
    return (cv.messages || []).some((m) => String((m && m.text) || '').toLowerCase().includes(q));
  };
  const pinnedIds = new Set((state.convs || []).filter((cv) => isPinned(cv.id)).map((cv) => cv.id));

  // 项目过滤视图（从项目页返回时用）
  const pf = (state.projects || []).find((x) => x.id === state.projectFilter);
  if (pf) {
    const headP = el('div', 'grp');
    headP.innerHTML = '<span>' + esc(pf.name) + '</span><button id="pfExit">← 全部</button>';
    listBox.append(headP);
    const kidsP = state.convs.filter((cv) => cv.projectId === pf.id && !cv.archived && matches(cv));
    if (!kidsP.length) listBox.append(el('div', 'kid', '这个项目还没有会话'));
    for (const cv of kidsP) listBox.append(convRow(cv));
    const exitBtn = document.getElementById('pfExit');
    if (exitBtn) exitBtn.addEventListener('click', () => { state.projectFilter = null; renderAll(); });
    return;
  }

  // 分组标题：点一下折叠/展开（Claude 就是这样）
  state.sideCollapsed = state.sideCollapsed || {};
  const sectionCollapsed = (label) => !!state.sideCollapsed[label];
  const toggleSection = (label) => {
    state.sideCollapsed[label] = !state.sideCollapsed[label];
    renderSide();
  };
  const sectionHead = (label) => {
    const folded = sectionCollapsed(label);
    const h = el('div', 'grp grp-toggle' + (folded ? ' folded' : ''));
    h.innerHTML = '<span>' + label + '</span><i class="chev">' + (folded ? '›' : '⌄') + '</i>';
    h.title = folded ? '展开' : '折叠';
    h.addEventListener('click', () => toggleSection(label));
    return h;
  };

  // 已置顶：置顶的会话 + 项目（Claude 把项目行放在置顶区）
  const pinned = (state.convs || []).filter((cv) => !cv.archived && pinnedIds.has(cv.id) && !cv.projectId && matches(cv));
  const pinnedProjects = (state.projects || []).filter((p) => p.pinned);
  if (pinned.length || pinnedProjects.length) {
    listBox.append(sectionHead('已置顶'));
    if (!sectionCollapsed('已置顶')) {
      for (const p of pinnedProjects) appendProject(p);
      for (const cv of pinned) listBox.append(convRow(cv));
    }
  }

  // 项目：可展开，子项缩进
  function appendProject(p) {
    const kids = state.convs.filter((cv) => cv.projectId === p.id && !cv.archived && matches(cv));
    if (q && !String(p.name || '').toLowerCase().includes(q) && !kids.length) return;
    const open = state.open && state.open[p.id] !== undefined ? !!state.open[p.id] : true;
    const row = el('button', 'prow' + (open ? ' open' : '') + (state.projectId === p.id ? ' on' : ''));
    row.type = 'button';
    row.innerHTML = '<span class="pico"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>'
      + '<span class="pn">' + esc(p.name) + '</span>'
      + '<span class="pchev">›</span>';
    row.title = p.name + '（点名字进项目，点箭头展开）';
    row.addEventListener('click', (e) => {
      const onChevron = e.target && e.target.closest && e.target.closest('.pchev');
      if (onChevron) {                       // 只有箭头负责折叠
        state.open = state.open || {};
        state.open[p.id] = !open;
        renderSide();
        return;
      }
      openProject(p.id);                     // 点名字 = 进项目页
    });
    row.addEventListener('dblclick', () => openProjectDialog(p));
    listBox.append(row);
    if (!open) return;
    const box = el('div', 'pkids');
    for (const cv of kids) box.append(convRow(cv));
    if (!kids.length) box.append(el('div', 'pkids-empty', '还没有会话'));
    listBox.append(box);
  }

  const projects = (state.projects || []).filter((p) => !p.pinned);
  if (projects.length) {
    listBox.append(sectionHead('项目'));
    if (!sectionCollapsed('项目')) for (const p of projects) appendProject(p);
  }

  // 最近：平铺，不做按天分组（对齐 Claude）
  // 项目里的会话只在项目下显示，不进「最近」（对齐 Claude）
  const loose = (state.convs || []).filter((cv) => !cv.archived && !cv.projectId && matches(cv) && !pinnedIds.has(cv.id));
  const LIMIT = 12;
  const shown = state.sideAll ? loose : loose.slice(0, LIMIT);
  listBox.append(sectionHead('最近'));
  if (!sectionCollapsed('最近')) for (const cv of shown) listBox.append(convRow(cv));
  if (!loose.length) {
    const hint = el('div', 'side-empty');
    hint.append(el('div', 'se-t', q ? '没有匹配' : '还没有会话'));
    if (!q) hint.append(el('div', 'se-d', '点上面的「新建」开始，或按 Ctrl+Shift+O。'));
    listBox.append(hint);
  }
  if (!state.sideAll && loose.length > LIMIT) {
    const more = el('button', 'viewall', '查看全部');
    more.type = 'button';
    more.addEventListener('click', () => { state.sideAll = true; renderSide(); });
    listBox.append(more);
  }

  // 已归档
  const arch = (state.convs || []).filter((cv) => cv.archived && matches(cv));
  if (arch.length) {
    const h = el('div', 'grp');
    h.innerHTML = '<span>已归档</span><button id="archToggle">' + (state.showArchived ? '隐藏' : '显示 ' + arch.length) + '</button>';
    listBox.append(h);
    if (state.showArchived) for (const cv of arch) listBox.append(convRow(cv));
    const tg = document.getElementById('archToggle');
    if (tg) tg.addEventListener('click', () => { state.showArchived = !state.showArchived; renderSide(); });
  }
}

/* ---------------- 消息操作：编辑 / 重新生成 ---------------- */
/** 把某条用户消息拿回输入框，并把它之后的内容清掉（等于"从这里重来"） */
function startEdit(idx) {
  const cv = current();
  if (!cv || state.streaming) return;
  const m = (cv.messages || [])[idx];
  if (!m || m.role !== 'user') return;
  const text = m.text || '';
  // 只记录「正在编辑哪一条」，不改动已保存的消息；
  // 真正截断发生在用户按发送时——否则点一下「编辑」就把后面的回答删了，误触就没了
  state.editing = { convId: cv.id, idx, text };
  input.value = text;
  input.dispatchEvent(new Event('input'));
  input.focus();
  input.setSelectionRange(text.length, text.length);
  flashHint('正在编辑：发送后会从这条重新开始，不发送不会有任何改动');
}

/** 从某条 AI 回答处重新生成 */
async function regenerateFrom(idx) {
  const cv = current();
  if (!cv || state.streaming) return;
  const msgs = cv.messages || [];
  let u = -1;
  for (let i = idx - 1; i >= 0; i--) { if (msgs[i].role === 'user') { u = i; break; } }
  if (u < 0) return;
  const ask = msgs[u];
  const text = ask.text || '';
  const imgs = (ask.images || []).slice();
  msgs.splice(u, msgs.length - u);
  await saveConv(cv);
  renderAll();
  sendChat(text, imgs.length ? { refImages: imgs } : {});
}

/* ---------------- 命令面板 ---------------- */
function palActions() {
  const acts = [
    { label: '新建对话', key: 'Ctrl+Shift+O', run: () => { $('#newChat').click(); } },
    { label: '打开项目页', key: '', run: () => showProjectsPage() },
    { label: '打开文件列表', key: '', run: () => showFilesPage() },
    { label: '打开图库', key: '', run: () => showGalleryPage() },
    { label: '切换模型…', key: '', run: () => openModelMenu() },
    { label: '自定义指令', key: '', run: () => openInstructions() },
  ];
  return acts;
}

const PAL_TABS = [['all', '全部'], ['conv', '会话'], ['file', '文件'], ['act', '动作']];
let palTab = 'all';

const RECENT_SEARCH_KEY = 'ai.recentSearch';
function loadRecentSearch() {
  try { return JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]'); } catch { return []; }
}
function pushRecentSearch(q) {
  const term = String(q || '').trim();
  if (!term) return;
  const all = loadRecentSearch().filter((x) => x !== term);
  all.unshift(term);
  try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(all.slice(0, 6))); } catch {}
}
function renderPalTabs() {
  const box = $('#palTabs');
  if (!box) return;
  box.textContent = '';
  for (const [k, label] of PAL_TABS) {
    const b = el('button', 'pal-tab' + (palTab === k ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => { palTab = k; renderPalTabs(); renderPalette($('#palInput').value); });
    box.append(b);
  }
}

function palSect(box, title) {
  box.append(el('div', 'pal-sect', title));
}

function renderPalette(q) {
  const box = $('#palList');
  if (!box) return;
  const query = String(q || '').trim().toLowerCase();
  box.textContent = '';
  const hit = (s) => !query || String(s).toLowerCase().includes(query);
  const want = (t) => palTab === 'all' || palTab === t;

  if (!query && palTab === 'all') {
    const recent = loadRecentSearch();
    if (recent.length) {
      palSect(box, '最近搜索');
      for (const term of recent) {
        const b = el('button', 'pal-item');
        b.type = 'button';
        b.append(el('span', null, term));
        b.append(el('span', 'k', '↩'));
        b.addEventListener('click', () => {
          $('#palInput').value = term;
          renderPalette(term);
          $('#palInput').focus();
        });
        box.append(b);
      }
    }
  }

  if (want('act')) {
    const acts = palActions().filter((a) => hit(a.label));
    if (acts.length) {
      palSect(box, '动作');
      for (const a of acts) {
        const b = el('button', 'pal-item');
        b.type = 'button';
        b.append(el('span', null, a.label));
        if (a.key) b.append(el('span', 'k', a.key));
        b.addEventListener('click', () => { closePalette(); a.run(); });
        box.append(b);
      }
    }
  }

  if (want('conv')) {
    const convs = (state.convs || []).filter((c) => hit(c.title || '新对话') && !c.archived).slice(0, 12);
    if (convs.length) {
      palSect(box, '会话');
      for (const cv of convs) {
        const b = el('button', 'pal-item');
        b.type = 'button';
        b.append(el('span', null, cv.title || '新对话'));
        b.append(el('span', 'k', when(cv.updatedAt)));
        b.addEventListener('click', () => {
          closePalette();
          state.view = 'chat';
          state.currentId = cv.id;
          applyConvSettings(cv);
          renderAll();
        });
        box.append(b);
      }
    }
  }

  if (want('file')) {
    const files = recentArtifacts(30).filter((it) => hit(it.name));
    if (files.length) {
      palSect(box, '文件');
      for (const it of files.slice(0, 10)) {
        const b = el('button', 'pal-item');
        b.type = 'button';
        b.append(el('span', null, it.name));
        b.append(el('span', 'k', it.convTitle));
        b.addEventListener('click', () => { closePalette(); openArtifact(it); });
        box.append(b);
      }
    }
  }

  if (!box.querySelector('.pal-item')) box.append(el('div', 'pal-sect', '没有匹配项'));
  const first = box.querySelector('.pal-item');
  if (first) first.classList.add('on');
}

function openPalette() {
  const ov = $('#dlgPal');
  ov.hidden = false;
  const inputEl = $('#palInput');
  inputEl.value = '';
  palTab = 'all';
  renderPalTabs();
  renderPalette('');
  inputEl.focus();
}

function closePalette() {
  const ov = $('#dlgPal');
  if (ov) ov.hidden = true;
}

document.addEventListener('keydown', (e) => {
  if ($('#dlgPal').hidden) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
}, true);

$('#palInput').addEventListener('input', (e) => renderPalette(e.target.value));
/** 命令面板：↑↓ 选择，Enter 执行 */
function palMove(step) {
  const items = [...document.querySelectorAll('#palList .pal-item')];
  if (!items.length) return;
  let idx = items.findIndex((x) => x.classList.contains('on'));
  if (idx < 0) idx = 0; else idx = (idx + step + items.length) % items.length;
  items.forEach((x) => x.classList.remove('on'));
  items[idx].classList.add('on');
  items[idx].scrollIntoView({ block: 'nearest' });
}

$('#palInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); return; }
  if (e.key === 'Enter') {
    pushRecentSearch($('#palInput').value);
    const first = $('#palList .pal-item');
    if (first) first.click();
  }
});
$('#dlgPal').addEventListener('click', (e) => { if (e.target.id === 'dlgPal') closePalette(); });
$('#palClose').addEventListener('click', () => closePalette());
$('#brandMenu').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#menuPop');
  const r = e.currentTarget.getBoundingClientRect();
  closePops();
  p.hidden = false;
  p.style.left = Math.min(r.left, window.innerWidth - 228) + 'px';
  p.style.top = (r.bottom + 6) + 'px';
});

/* ---------------- 设置（左导航） ---------------- */
const SET_TABS = [
  ['appearance', '外观'],
  ['ins', '自定义指令'],
  ['skills', '技能'],
  ['tools', '工具'],
  ['users', '成员'],
  ['cfg', '接口'],
  ['usage', '用量'],
  ['account', '账号'],
  ['memory', '记忆'],
  ['keys', '快捷键'],
  ['data', '数据'],
];
if (LS.role === 'admin') SET_TABS.push(['audit', '审计'], ['monitor', '监控']);

/** 把已有的小弹窗内容搬进设置面板（保留原有事件） */
const SET_SRC = { ins: 'dlgIns', users: 'dlgUsers', cfg: 'dlgCfg', usage: 'dlgUsage' };

function exportConvMarkdown() {
  const cv = current();
  if (!cv) return;
  const lines2 = ['# ' + (cv.title || '对话'), ''];
  for (const m of cv.messages || []) {
    if (m.role === 'divider') { lines2.push('---', String(m.text || ''), '---', ''); continue; }
    const who = m.role === 'user' ? (m.who || LS.name || '我') : 'AI';
    lines2.push('## ' + who, '', String(m.text || ''), '');
    for (const u of (m.images || [])) lines2.push('![](' + fileUrl(u) + ')', '');
  }
  const blob = new Blob([lines2.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (cv.title || '对话').replace(/[\\/:*?"<>|]/g, '_') + '.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flashHint('已导出 Markdown');
}
function exportAll() {
  const payload = { exportedAt: Date.now(), version: 1, conversations: state.convs || [], projects: state.projects || [] };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'maodou-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flashHint('已导出 ' + (state.convs || []).length + ' 个对话');
}
async function importAll(file) {
  if (!file) return;
  let data = null;
  try { data = JSON.parse(await file.text()); } catch { flashHint('不是有效的 JSON'); return; }
  const convs = Array.isArray(data && data.conversations) ? data.conversations : [];
  if (!convs.length) { flashHint('文件里没有对话'); return; }
  const sig = (c) => (c.title || '') + '#' + ((c.messages || []).length);
  const existing = new Set((state.convs || []).map((c) => sig(c)));
  let ok = 0;
  let skipped = 0;
  for (const c of convs.slice(0, 200)) {
    if (existing.has(sig(c))) { skipped += 1; continue; }
    const r = await api('/convs', { method: 'POST', body: { title: (c.title || '导入的对话').slice(0, 60) } });
    if (!r.ok) continue;
    const j = await r.json().catch(() => ({}));
    const id = j.conversation && j.conversation.id;
    if (!id) continue;
    await api('/convs/' + id, { method: 'PUT', body: { title: c.title || '导入的对话', messages: c.messages || [], files: c.files || [], settings: c.settings || {} } });
    ok += 1;
  }
  await loadConvs();
  renderAll();
  flashHint('已导入 ' + ok + ' 个对话' + (skipped ? '，跳过重复 ' + skipped + ' 个' : ''));
}
function renderSetNav(active) {
  const nav = $('#setNav');
  if (!nav) return;
  nav.textContent = '';
  for (const [k, label] of SET_TABS) {
    const b = el('button', 'set-item' + (k === active ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => openSettings(k));
    nav.append(b);
  }
}


/* ---------------- 设置 · 技能 ---------------- */
const SKILL_PERM_LABEL = { search: '联网搜索', image: '画图', gif: '动图', code: '代码文件', chart: '图表', calc: '计算', artifact: '产物' };

/* ---------------- 设置 · 工具（代码沙箱） ---------------- */
async function mountToolsPane(pane) {
  pane.textContent = '';
  const h = el('h3', null, '工具');
  pane.append(h, el('p', 'set-hint', '工具是一段跑在服务器沙箱里的代码：无网络、非 root、限时间/内存。模型可以通过技能调用它，结果会带回对话。'));
  const row = el('div', 'set-row');
  const add = el('button', 'set-chip', '＋ 新建工具');
  add.type = 'button';
  add.addEventListener('click', () => toolForm(pane, null));
  row.append(add);
  pane.append(row);
  const box = el('div', 'skill-list');
  box.style.marginTop = '12px';
  pane.append(box);
  await loadTools();
  box.textContent = '';
  const tools = state.tools || [];
  if (state.toolEditId) {
    const one = tools.find((x) => x.id === state.toolEditId);
    state.toolEditId = null;
    if (one) { toolForm(pane, one); return; }
  }
  if (!tools.length) { box.append(el('div', 'set-hint', '还没有工具。新建一个 Node/Python 脚本试试。')); return; }
  for (const t of tools) {
    const r = el('div', 'skill-row');
    const main = el('div', 'sk-main');
    const head = el('div');
    head.append(el('span', 'sk-name', t.name));
    head.append(el('span', 'sk-cmd', t.runtime === 'python' ? 'python' : 'node'));
    main.append(head);
    if (t.desc) main.append(el('div', 'sk-desc', t.desc));
    const perms = el('div', 'sk-perms');
    if (t.params && t.params.length) perms.append(el('span', 'sk-p', '参数：' + t.params.join(', ')));
    perms.append(el('span', 'sk-p', (t.timeoutMs || 5000) + 'ms'));
    perms.append(el('span', 'sk-p', '作者 ' + (t.author || '—')));
    if (t.uses) perms.append(el('span', 'sk-p', '用过 ' + t.uses));
    main.append(perms);
    const acts = el('div', 'sk-acts');
    const test = el('button', 'set-chip', '测试');
    test.type = 'button';
    test.addEventListener('click', async () => {
      const argsRaw = prompt('传参数（JSON，传给 stdin）', '{}');
      if (argsRaw === null) return;
      let args = {};
      try { args = JSON.parse(argsRaw || '{}'); } catch (e) { flashHint('参数不是合法 JSON'); return; }
      flashHint('运行中…');
      const rr = await api('/tools/' + encodeURIComponent(t.id) + '/test', { method: 'POST', body: { args } });
      const j = await rr.json().catch(() => ({}));
      openListPanel('工具输出 · ' + t.name, j.ok ? ('用时 ' + j.ms + 'ms') : (j.error || '失败'), [
        { label: (j.stdout || j.stderr || '(无输出)').slice(0, 1200), sub: '标准输出 / 错误' },
      ]);
    });
    acts.append(test);
    const runBtn = el('button', 'set-chip', '运行');
    runBtn.type = 'button';
    runBtn.addEventListener('click', () => openToolRun(t));
    acts.append(runBtn);
    if (t.mine) {
      const ed = el('button', 'set-chip', '编辑');
      ed.type = 'button';
      ed.addEventListener('click', () => toolForm(pane, t));
      const del = el('button', 'set-chip', '删除');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm('删除工具「' + t.name + '」？')) return;
        const rr = await api('/tools/' + encodeURIComponent(t.id), { method: 'DELETE' });
        if (rr.ok) { flashHint('已删除'); mountToolsPane(pane); }
      });
      acts.append(ed, del);
    }
    r.append(main, acts);
    box.append(r);
  }
}


function openToolRun(t) {
  const dlg = $('#dlgTool');
  if (!dlg) return;
  $('#toolRunTitle').textContent = '运行 · ' + (t.name || '工具');
  $('#toolRunDesc').textContent = t.desc || '';
  const box = $('#toolRunFields');
  box.textContent = '';
  const params = Array.isArray(t.params) ? t.params : [];
  if (!params.length) box.append(el('div', 'set-hint', '这个工具不需要参数。'));
  for (const p of params) {
    const lab = el('label', 'field', p);
    const inp = el('input');
    inp.type = 'text';
    inp.dataset.arg = p;
    inp.placeholder = p;
    lab.append(inp);
    box.append(lab);
  }
  const out = $('#toolRunOut');
  out.hidden = true;
  out.textContent = '';
  dlg.hidden = false;
  dlg.dataset.toolId = t.id;
}
document.addEventListener('click', async (e) => {
  if (e.target.closest && e.target.closest('#toolRunClose')) { const d = $('#dlgTool'); if (d) d.hidden = true; return; }
  if (!e.target.closest || !e.target.closest('#toolRunGo')) return;
  const dlg = $('#dlgTool');
  const id = dlg && dlg.dataset.toolId;
  if (!id) return;
  const args = {};
  for (const inp of document.querySelectorAll('#toolRunFields input[data-arg]')) args[inp.dataset.arg] = inp.value;
  const out = $('#toolRunOut');
  const btn = $('#toolRunGo');
  btn.disabled = true;
  out.hidden = false;
  out.textContent = '运行中…';
  try {
    const r = await api('/tools/' + encodeURIComponent(id) + '/run', { method: 'POST', timeout: 60000, body: { args } });
    const j = await r.json().catch(() => ({}));
    const text = [j.stdout, j.stderr, j.error].filter(Boolean).join('\n').slice(0, 6000);
    out.textContent = (j.ok ? '' : '（失败）') + (text || '(无输出)') + (j.ms != null ? '\n\n[' + j.ms + 'ms]' : '');
  } catch (err) {
    out.textContent = '运行失败：' + String((err && err.message) || err);
  } finally {
    btn.disabled = false;
  }
});

function toolForm(pane, tool) {
  pane.textContent = '';
  const h = el('h3', null, tool ? '编辑工具' : '新建工具');
  pane.append(h, el('p', 'set-hint', '代码从 stdin 读 JSON 参数（例如 {"text":"..."}），把结果打印到 stdout。沙箱里没有网络，读不到服务器文件。'));
  const form = el('div', 'skill-form');
  const mk = (label, node) => { form.append(el('label', null, label), node); };
  const name = el('input'); name.type = 'text'; name.value = tool ? tool.name : ''; name.placeholder = '英文名，例如 charcount';
  const desc = el('input'); desc.type = 'text'; desc.value = tool ? (tool.desc || '') : ''; desc.placeholder = '给模型看的说明：这个工具做什么、什么时候用';
  const params = el('input'); params.type = 'text'; params.value = tool && tool.params ? tool.params.join(',') : ''; params.placeholder = '参数名，逗号分隔，例如 text,limit';
  const runtime = document.createElement('select');
  for (const [v, label] of [['node', 'Node.js'], ['python', 'Python 3']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = label; runtime.append(o);
  }
  runtime.value = tool ? (tool.runtime || 'node') : 'node';
  const timeout = document.createElement('input'); timeout.type = 'text'; timeout.value = String(tool ? (tool.timeoutMs || 5000) : 5000);
  const code = document.createElement('textarea'); code.value = tool ? (tool.code || '') : "const fs = require('fs');\nconst args = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');\nconsole.log('hello ' + (args.text || ''));";
  code.style.minHeight = '150px';
  code.style.fontFamily = 'ui-monospace, monospace';
  mk('工具名', name);
  mk('说明', desc);
  mk('参数（逗号分隔）', params);
  const rtWrap = el('div'); rtWrap.append(runtime); mk('运行时', rtWrap);
  mk('超时（毫秒，最多 8000）', timeout);
  const pkgs = el('input');
  pkgs.type = 'text';
  pkgs.value = tool && tool.packages ? tool.packages.join(',') : '';
  pkgs.placeholder = '仅 Python：额外依赖，逗号分隔（服务器已安装才可用；os/socket 等已禁用）';
  mk('允许的库', pkgs);
  mk('代码', code);
  const row = el('div', 'set-row');
  const save = el('button', 'set-chip', '保存');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const body = {
      name: name.value.trim(), desc: desc.value.trim(), runtime: runtime.value,
      params: params.value.split(',').map(s => s.trim()).filter(Boolean),
      timeoutMs: Number(timeout.value) || 5000, code: code.value,
      packages: pkgs.value.split(',').map(s => s.trim()).filter(Boolean),
    };
    const r = tool ? await api('/tools/' + encodeURIComponent(tool.id), { method: 'PUT', body }) : await api('/tools', { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '保存失败'); return; }
    flashHint(tool ? '已保存' : '已创建工具');
    await loadTools();
    mountToolsPane(pane);
  });
  const back = el('button', 'set-chip', '取消');
  back.type = 'button';
  back.addEventListener('click', () => mountToolsPane(pane));
  row.append(save, back);
  form.append(row);
  pane.append(form);
}

async function mountSkillList(box) {
  box.textContent = '';
  box.append(el('div', 'set-hint', '读取中…'));
  await loadSkills();
  box.textContent = '';
  const skills = state.skills || [];
  if (!skills.length) {
    box.append(el('div', 'set-hint', '还没有技能。点上面的「新建技能」，或者导入别人给的 JSON。'));
    return;
  }
  for (const s of skills) {
    const row = el('div', 'skill-row');
    const main = el('div', 'sk-main');
    const head = el('div');
    head.append(el('span', 'sk-name', s.name));
    head.append(el('span', 'sk-cmd', '/' + s.cmd));
    main.append(head);
    if (s.desc) main.append(el('div', 'sk-desc', s.desc));
    const perms = el('div', 'sk-perms');
    for (const k of ['search', 'image', 'gif', 'code', 'chart', 'calc']) if (s.perms && s.perms[k]) perms.append(el('span', 'sk-p', SKILL_PERM_LABEL[k]));
    if (s.perms && s.perms.artifact) perms.append(el('span', 'sk-p', '产物：' + ({ doc: '文档', deck: '幻灯片', design: '设计稿' }[s.perms.artifact] || s.perms.artifact)));
    if (s.perms && Array.isArray(s.perms.tools) && s.perms.tools.length) perms.append(el('span', 'sk-p', '工具 ' + s.perms.tools.length));
    if (!perms.children.length) perms.append(el('span', 'sk-p', '只用对话'));
    perms.append(el('span', 'sk-p', '作者 ' + (s.author || '—')));
    if (s.uses) perms.append(el('span', 'sk-p', '用过 ' + s.uses + ' 次'));
    main.append(perms);
    const acts = el('div', 'sk-acts');
    const use = el('button', 'set-chip', '用一次');
    use.type = 'button';
    use.addEventListener('click', () => { $('#dlgSet').hidden = true; useSkill(s); });
    acts.append(use);
    if (s.mine) {
      const ed = el('button', 'set-chip', '编辑');
      ed.type = 'button';
      ed.addEventListener('click', () => skillForm(document.querySelector('.set-pane[data-pane="skills"]'), s));
      const del = el('button', 'set-chip', '删除');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm('删除技能「' + s.name + '」？')) return;
        const r = await api('/skills/' + encodeURIComponent(s.id), { method: 'DELETE' });
        if (!r.ok) { flashHint('删除失败'); return; }
        flashHint('已删除');
        mountSkillList(box);
      });
      acts.append(ed, del);
    }
    row.append(main, acts);
    box.append(row);
  }
}

function skillForm(pane, skill) {
  if (!pane) return;
  pane.textContent = '';
  const h = el('h3', null, skill ? '编辑技能' : '新建技能');
  pane.append(h);
  const form = el('div', 'skill-form');
  const mk = (label, node) => { const l = el('label', null, label); form.append(l, node); };
  const name = el('input'); name.type = 'text'; name.value = skill ? skill.name : ''; name.placeholder = '例如：深度研究';
  const cmd = el('input'); cmd.type = 'text'; cmd.value = skill ? skill.cmd : ''; cmd.placeholder = '英文指令，例如 research（调用时 /research）';
  const desc = el('input'); desc.type = 'text'; desc.value = skill ? (skill.desc || '') : ''; desc.placeholder = '一句话说明它做什么';
  const prompt = el('textarea'); prompt.value = skill ? skill.prompt : ''; prompt.placeholder = '提示词。想留空让用户补充，就写 {input} 占位，例如：围绕 {input} 做一次深度研究，给出带来源的结论。';
  mk('名称', name);
  mk('指令（不需要写 /）', cmd);
  mk('说明', desc);
  mk('提示词', prompt);
  const checks = el('div', 'sk-checks');
  const permDefs = [['search', '联网搜索'], ['image', '画图'], ['gif', '动图'], ['code', '代码文件'], ['chart', '图表'], ['calc', '计算沙箱']];
  const boxes = {};
  for (const [k, label] of permDefs) {
    const lab = el('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!(skill && skill.perms && skill.perms[k]);
    boxes[k] = cb;
    lab.append(cb, document.createTextNode(' ' + label));
    checks.append(lab);
  }
  mk('允许使用的能力（没勾的不会开放给模型）', checks);
  // 自定义工具（代码沙箱）：勾了就允许这个技能调用
  const toolWrap = el('div', 'sk-checks');
  const toolBoxes = {};
  (state.tools || []).forEach((t) => {
    const lab = el('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!(skill && skill.perms && Array.isArray(skill.perms.tools) && skill.perms.tools.includes(t.id));
    toolBoxes[t.id] = cb;
    lab.append(cb, document.createTextNode(' ' + t.name));
    toolWrap.append(lab);
  });
  if (!(state.tools || []).length) toolWrap.append(el('span', 'set-hint', '还没有自定义工具，可在「工具」页新建'));
  mk('可用工具（代码沙箱）', toolWrap);

  const artWrap = el('div');
  const art = document.createElement('select');
  for (const [v, label] of [['', '不写产物'], ['doc', '写成文档'], ['deck', '写成幻灯片'], ['design', '写成网页']]) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    art.append(o);
  }
  art.value = (skill && skill.perms && skill.perms.artifact) ? skill.perms.artifact : '';
  artWrap.append(art);
  mk('产物', artWrap);
  const visWrap = el('div');
  const vis = document.createElement('select');
  for (const [v, label] of [['public', '所有人可用'], ['private', '只有我能用']]) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    vis.append(o);
  }
  vis.value = skill ? (skill.visibility || 'public') : 'public';
  visWrap.append(vis);
  mk('可见性', visWrap);
  const row = el('div', 'set-row');
  const save = el('button', 'set-chip', '保存');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const body = {
      name: name.value.trim(),
      cmd: cmd.value.trim().replace(/^\/+/, ''),
      desc: desc.value.trim(),
      prompt: prompt.value,
      visibility: vis.value,
      perms: { search: boxes.search.checked, image: boxes.image.checked, gif: boxes.gif.checked, code: boxes.code.checked, chart: boxes.chart.checked, calc: boxes.calc.checked, artifact: art.value || null, tools: Object.keys(toolBoxes).filter((id) => toolBoxes[id].checked) },
    };
    const r = skill ? await api('/skills/' + encodeURIComponent(skill.id), { method: 'PUT', body }) : await api('/skills', { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '保存失败'); return; }
    flashHint(skill ? '已保存' : '已创建技能 /' + (j.skill && j.skill.cmd));
    await loadSkills();
    mountPane('skills');
  });
  const back = el('button', 'set-chip', '取消');
  back.type = 'button';
  back.addEventListener('click', () => mountPane('skills'));
  row.append(save, back);
  form.append(row);
  pane.append(form);
}

function exportSkills() {
  const mine = (state.skills || []).filter((s) => s.mine);
  if (!mine.length) { flashHint('没有你自己做的技能'); return; }
  const payload = { version: 1, exportedAt: Date.now(), skills: mine.map((s) => ({ name: s.name, cmd: s.cmd, desc: s.desc, prompt: s.prompt, perms: s.perms, visibility: s.visibility, icon: s.icon })) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skills-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flashHint('已导出 ' + mine.length + ' 个技能');
}

async function importSkills(file) {
  if (!file) return;
  let data = null;
  try { data = JSON.parse(await file.text()); } catch { flashHint('不是有效的 JSON'); return; }
  const list = Array.isArray(data) ? data : (Array.isArray(data && data.skills) ? data.skills : []);
  if (!list.length) { flashHint('文件里没有技能'); return; }
  let ok = 0, skip = 0;
  for (const s of list.slice(0, 50)) {
    const r = await api('/skills', { method: 'POST', body: { name: s.name, cmd: s.cmd, desc: s.desc, prompt: s.prompt, perms: s.perms, visibility: s.visibility || 'public', icon: s.icon } });
    if (r.ok) ok += 1; else skip += 1;
  }
  await loadSkills();
  mountPane('skills');
  flashHint('导入 ' + ok + ' 个' + (skip ? '，跳过 ' + skip + ' 个（指令重复或格式不对）' : ''));
}

function mountPane(key) {
  const pane = document.querySelector('.set-pane[data-pane="' + key + '"]');
  if (!pane) return;
  if (key === 'appearance') {
    if (!pane.dataset.built) {
      pane.dataset.built = '1';
      const h = el('h3', null, '外观');
      const p = el('p', 'set-hint', '主题跟随系统或手动指定。');
      const row = el('div', 'set-row');
      for (const [k, label] of [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) {
        const b = el('button', 'set-chip' + (LS.theme === k ? ' on' : ''), label);
        b.type = 'button';
        b.addEventListener('click', () => {
          LS.theme = k;
          applyTheme();
          persistSettings();
          mountPane('appearance');
        });
        row.append(b);
      }
      const h2 = el('p', 'set-hint', '字号（影响对话和界面文字）');
      h2.style.marginTop = '18px';
      const row2 = el('div', 'set-row wrap');
      for (const size of [14, 15, 16]) {
        const b = el('button', 'set-chip' + ((LS.font || 16) === size ? ' on' : ''), size + 'px');
        b.type = 'button';
        b.addEventListener('click', () => {
          LS.font = size;
          applyTheme();
          persistSettings();
          mountPane('appearance');
        });
        row2.append(b);
      }
      pane.append(h, p, row, h2, row2);
    }
    return;
  }
  if (key === 'account') {
    pane.textContent = '';
    const h = el('h3', null, '账号');
    const row = el('div', 'set-kv');
    row.append(el('span', null, '昵称'));
    row.append(el('span', null, LS.name || '未登录'));
    const row2 = el('div', 'set-kv');
    row2.append(el('span', null, '身份'));
    row2.append(el('span', null, ({ astra: 'Astra', admin: '管理员' })[LS.role] || '成员'));
    const row3 = el('div', 'set-kv');
    row3.append(el('span', null, '站点版本'));
    row3.append(el('span', null, APP_BUILD));
    const acts = el('div', 'set-row');
    acts.style.marginTop = '14px';
    const rename = el('button', 'set-chip', '改昵称');
    rename.type = 'button';
    rename.addEventListener('click', () => { $('#dlgSet').hidden = true; $('#renameSelfBtn').click(); });
    const out = el('button', 'set-chip', '退出登录');
    out.type = 'button';
    out.addEventListener('click', () => { $('#dlgSet').hidden = true; $('#logoutBtn').click(); });
    acts.append(rename, out);
    const about = el('p', 'set-hint', '毛豆 · 自建小站：聊天、看图、画图、动图、联网、写代码。数据存在自己的服务器。');
    about.style.marginTop = '18px';
    pane.append(h, row, row2, row3, acts, about);
    return;
  }
  if (key === 'skills') {
    pane.textContent = '';
    const h = el('h3', null, '技能');
    h.style.marginBottom = '6px';
    pane.append(h, el('p', 'set-hint', '技能就是「斜杠命令 + 提示词 + 能力声明」。做好后所有人都能用：在输入框敲 / 就能选到。'));
    const statsEl = el('p', 'set-hint', '');
    statsEl.style.marginTop = '2px';
    pane.append(statsEl);
    (async () => {
      try {
        const r = await api('/skills/stats');
        if (!r.ok) return;
        const s = await r.json();
        statsEl.textContent = '共 ' + (s.skills || 0) + ' 个技能（我的 ' + (s.mine || 0) + ' 个）· 累计调用 ' + (s.totalUses || 0) + ' 次'
          + (s.top && s.top[0] ? ' · 最常用：' + s.top[0].name + '（' + s.top[0].uses + ' 次）' : '');
      } catch (e) {}
    })();
    const row = el('div', 'set-row');
    const add = el('button', 'set-chip', '＋ 新建技能');
    add.type = 'button';
    add.addEventListener('click', () => skillForm(pane, null));
    const exp = el('button', 'set-chip', '导出技能');
    exp.type = 'button';
    exp.addEventListener('click', exportSkills);
    const imp = el('button', 'set-chip', '导入技能');
    imp.type = 'button';
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'application/json';
    fi.hidden = true;
    fi.addEventListener('change', () => importSkills(fi.files && fi.files[0]));
    imp.addEventListener('click', () => fi.click());
    row.append(add, exp, imp);
    pane.append(row, fi);
    const listBox = el('div', 'skill-list');
    listBox.style.marginTop = '12px';
    pane.append(listBox);
    mountSkillList(listBox);
    // 从技能市场点「编辑」进来时直接打开这条的编辑表单
    if (state.editSkillId) {
      const sk = (state.skills || []).find((x) => x.id === state.editSkillId);
      state.editSkillId = null;
      if (sk) skillForm(pane, sk);
    }
    return;
  }
  if (key === 'tools') {
    mountToolsPane(pane);
    return;
  }
  if (key === 'memory') {
    pane.textContent = '';
    pane.append(el('h3', null, '记忆'));
    pane.append(el('p', 'set-hint', '我在对话里自己记下的事，会带到以后的对话里。可以随时删。'));
    const box = el('div', 'mem-list');
    pane.append(box);
    box.append(el('div', 'set-hint', '读取中…'));
    (async () => {
      const r = await api('/memory');
      const j = await r.json().catch(() => ({ items: [] }));
      box.textContent = '';
      const items = j.items || [];
      if (!items.length) { box.append(el('div', 'set-hint', '还没有记忆。多聊几次它就会自己记住。')); return; }
      items.forEach((it) => {
        const row = el('div', 'mem-row');
        const scope = it.scope || (it.tier === 'deep' ? 'fact' : 'personal');
        const scopeLabel = { personal: '个人', project: '项目', fact: '单次' }[scope] || '个人';
        const tier = el('span', 'mem-tier' + (scope === 'fact' ? ' deep' : ''), scopeLabel);
        row.append(tier);
        const wrap = el('div', 'mem-main');
        wrap.append(el('div', 'mem-text', it.text));
        if (it.source && it.source.convId) {
          const srcConv = (state.convs || []).find((c) => c.id === it.source.convId);
          wrap.append(el('div', 'mem-src', '来源：' + (srcConv ? srcConv.title || srcConv.id : String(it.source.convId).slice(0, 10))));
        }
        row.append(wrap);
        const move = el('button', 'mem-del', it.tier === 'deep' ? '转常用' : '转深库');
        move.type = 'button';
        move.addEventListener('click', async () => {
          await api('/memory', { method: 'PATCH', body: { id: it.id, tier: it.tier === 'deep' ? 'hot' : 'deep' } });
          flashHint('已切换');
          $('#dlgSet').hidden = true;
          openSettings('memory');
        });
        const del = el('button', 'mem-del', '删除');
        del.type = 'button';
        del.addEventListener('click', async () => {
          await api('/memory?id=' + encodeURIComponent(it.id || ''), { method: 'DELETE' });
          row.remove();
          flashHint('已删除');
        });
        row.append(move, del);
        box.append(row);
      });
    })();
    return;
  }
  if (key === 'monitor') {
    pane.append(el('h3', null, '运行监控'));
    pane.append(el('p', 'set-hint', '请求量、错误率、延迟与上游 5xx；每 15 秒刷新。'));
    const box = el('div', 'mon-box');
    pane.append(box);
    const render = (m) => {
      box.textContent = '';
      if (!m) { box.append(el('div', 'set-hint', '读取失败')); return; }
      const grid = el('div', 'mon-grid');
      const card = (k, v) => { const c = el('div', 'mon-card'); c.append(el('div', 'mon-k', k)); c.append(el('div', 'mon-v', v)); return c; };
      grid.append(card('请求数', String(m.req)));
      grid.append(card('5xx', String(m.err5) + '（' + (m.errorRate * 100).toFixed(1) + '%）'));
      grid.append(card('p50', Math.round(m.p50) + 'ms'));
      grid.append(card('p95', Math.round(m.p95) + 'ms'));
      grid.append(card('上游 5xx', String(m.upstream ? m.upstream.err5 : 0)));
      grid.append(card('运行', Math.floor(m.uptimeSec / 60) + ' 分钟'));
      box.append(grid);
      if (Array.isArray(m.alerts) && m.alerts.length) box.append(el('div', 'mon-alert', '告警：' + m.alerts.join('；')));
      if (Array.isArray(m.errors) && m.errors.length) {
        const list = el('div', 'mon-errs');
        for (const e of m.errors.slice(0, 6)) list.append(el('div', 'mon-err', new Date(e.at).toLocaleTimeString() + '  ' + e.status + '  ' + e.path));
        box.append(list);
      }
    };
    const load = async () => {
      try { render(await (await api('/metrics')).json()); } catch (e) { render(null); }
    };
    load();
    const timer = setInterval(load, 15000);
    const dlg = $('#dlgSet');
    const clear = () => { clearInterval(timer); dlg.removeEventListener('click', clear); };
    dlg.addEventListener('click', clear);
    return;
  }
  if (key === 'audit') {
    pane.append(el('h3', null, '审计日志'));
    pane.append(el('p', 'set-hint', '最近 50 条技能/工具/分享变更，只有管理员能看。'));
    const box = el('div', 'audit-list');
    pane.append(box);
    box.append(el('div', 'set-hint', '读取中…'));
    (async () => {
      const r = await api('/audit?limit=50');
      const j = await r.json().catch(() => ({ items: [] }));
      box.textContent = '';
      const items = j.items || [];
      if (!items.length) { box.append(el('div', 'set-hint', '还没有记录')); return; }
      for (const it of items) {
        const row = el('div', 'audit-row');
        row.append(el('span', 'audit-time', new Date(it.at).toLocaleString()));
        row.append(el('span', 'audit-act', it.action || ''));
        row.append(el('span', 'audit-target', it.target || ''));
        row.append(el('span', 'audit-actor', it.actor || ''));
        box.append(row);
      }
    })();
    return;
  }
  if (key === 'keys') {
    if (!pane.dataset.built) {
      pane.dataset.built = '1';
      pane.append(el('h3', null, '快捷键'));
      const list = [
        ['Ctrl + K', '命令面板'],
        ['Ctrl + F', '在对话里查找'],
        ['Ctrl + Shift + O', '新建对话'],
        ['Esc', '关闭浮层 / 弹窗 / 查找'],
        ['Shift + Enter', '输入框内换行'],
      ];
      for (const pair of list) {
        const row = el('div', 'set-kv');
        row.append(el('span', null, pair[1]));
        row.append(el('kbd', null, pair[0]));
        pane.append(row);
      }
    }
    return;
  }
  if (key === 'data') {
    if (!pane.dataset.built) {
      pane.dataset.built = '1';
      const h = el('h3', null, '数据');
      const p = el('p', 'set-hint', '把全部对话导出成一个 JSON 文件，随时备份。');
      const row = el('div', 'set-row');
      const exp = el('button', 'set-chip', '导出全部对话');
      exp.type = 'button';
      exp.addEventListener('click', exportAll);
      const imp = el('button', 'set-chip', '导入 JSON');
      imp.type = 'button';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      fileInput.hidden = true;
      fileInput.addEventListener('change', () => importAll(fileInput.files && fileInput.files[0]));
      imp.addEventListener('click', () => fileInput.click());
      row.append(exp, imp);
      pane.append(fileInput);
      pane.append(h, p, row);
      const p2 = el('p', 'set-hint', '空对话、空文件（比如新建了但从没写过东西的文档）可以一键清掉。');
      const row2 = el('div', 'set-row');
      const clean = el('button', 'set-chip', '清理空内容');
      clean.type = 'button';
      clean.addEventListener('click', async () => {
              const { emptyConvs, emptyFileCount } = scanEmpty();
              clean.textContent = '清理空内容（' + (emptyConvs.length + emptyFileCount) + '）';
              await cleanEmpty();
              clean.textContent = '清理空内容';
            });
            row2.append(clean);
            pane.append(p2, row2);
    }
    return;
  }
  const srcId = SET_SRC[key];
  const src = srcId && document.getElementById(srcId);
  if (!src) return;
  const card = src.querySelector('.card');
  if (card && card.parentElement !== pane) {
    card.classList.add('in-settings');
    pane.append(card);
  }
}

/* ---------------- 焦点陷阱：弹窗里 Tab 不跑出去 ---------------- */
function trapFocus(ov) {
  if (!ov || ov.dataset.trap) return;
  ov.dataset.trap = '1';
  ov.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...ov.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
document.querySelectorAll('.overlay').forEach(trapFocus);

/* ---------------- 成员（设置内） ---------------- */
let usersPaneBuilt = false;
async function mountUsersPane(pane) {
  if (!pane) return;
  if (!usersPaneBuilt) {
    usersPaneBuilt = true;
    pane.innerHTML = '<h3>成员</h3><p class="set-hint">进来过的人都在这里；认不出的直接拉黑。私人对话只有创建者和管理员能看到。</p><div class="members" id="usersPaneList"></div>';
  }
  const box = pane.querySelector('#usersPaneList');
  if (!box) return;
  box.textContent = '加载中…';
  const r = await api('/users');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { box.textContent = errText(r.status, j); return; }
  box.textContent = '';
  const users = (j.users || []).slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  if (!users.length) { box.append(el('div', 'set-hint', '还没有人来过')); return; }
  for (const u of users) {
    const row = el('div', 'mrow' + (u.blocked ? ' blocked' : ''));
    row.append(el('div', 'avatar', String(u.name).slice(0, 1)));
    const mi = el('div', 'mi');
    mi.append(el('div', 'mn', u.name));
    const role = { astra: 'Astra', admin: '管理员' }[u.role] || '普通';
    mi.append(el('div', 'mm', role + ' · 进过 ' + (u.logins || 0) + ' 次' + (u.lastSeen ? ' · ' + when(u.lastSeen) : '')));
    row.append(mi);
    const rn = el('button', 'mb', '改名');
    rn.addEventListener('click', async () => {
      const to = prompt('把「' + u.name + '」改成？', u.name);
      if (!to || to.trim() === u.name) return;
      const rr = await api('/users/rename', { method: 'POST', body: { from: u.name, to: to.trim() } });
      const jj = await rr.json().catch(() => ({}));
      if (!rr.ok) { alert(errText(rr.status, jj)); return; }
      if (jj.token) { LS.token = jj.token; LS.name = jj.to; renderIdentity(); }
      mountUsersPane(pane);
    });
    const blk = el('button', 'mb' + (u.blocked ? '' : ' red'), u.blocked ? '解封' : '拉黑');
    blk.addEventListener('click', async () => {
      if (!u.blocked && !confirm('拉黑「' + u.name + '」？他之后进不来。')) return;
      const rr = await api('/users/block', { method: 'POST', body: { name: u.name, blocked: !u.blocked } });
      if (!rr.ok) { alert('操作失败'); return; }
      mountUsersPane(pane);
    });
    row.append(rn, blk);
    box.append(row);
  }
}
function openSettings(tab) {
  // 「用量」没有独立的设置面板，真正的明细在 #dlgUsage 里；直接打开那个对话框
  if (tab === 'usage') {
    Promise.resolve(refreshUsage()).then(() => { renderUsageDialog(); $('#dlgUsage').hidden = false; }).catch(() => {});
    return;
  }
  const ov = $('#dlgSet');
  ov.hidden = false;
  const key = SET_TABS.some(([k]) => k === tab) ? tab : 'appearance';
  renderSetNav(key);
  for (const p of document.querySelectorAll('.set-pane')) p.hidden = p.dataset.pane !== key;
  mountPane(key);
  if (key === 'users') mountUsersPane(document.querySelector('.set-pane[data-pane="users"]'));
  trapFocus(ov);
  const firstNav = document.querySelector('.set-item');
  if (firstNav) setTimeout(() => firstNav.focus(), 30);
}

$('#setClose').addEventListener('click', () => { $('#dlgSet').hidden = true; });
$('#dlgSet').addEventListener('click', (e) => { if (e.target.id === 'dlgSet') $('#dlgSet').hidden = true; });

/* 线程 */
/** 把结果里的链接变成可点的（下载文件尤其需要） */
function linkify(text) {
  return esc(String(text || '')).replace(/(https?:\/\/[^\s"'<>]+|\/files\/[A-Za-z0-9._-]+)/g, (m) => {
    const href = m.startsWith('/') ? base() + m : m;
    const attrs = m.startsWith('/files/') ? ' download' : ' target="_blank" rel="noreferrer"';
    return '<a href="' + esc(href) + '"' + attrs + '>' + esc(m) + '</a>';
  });
}

function toolCard(t) {
  const d = el('details', 'tool-card');
  const sum = document.createElement('summary');
  sum.innerHTML = '<span class="tc-chev">›</span><span class="tc-ico">' + ic('code', 12) + '</span><span class="tc-name">' + esc(t.name || 'tool') + '</span><span class="tc-cnt">' + (t.result ? '1 个结果' : '') + '</span>';
  d.append(sum);
  const body = el('div', 'tc-body');
  const args = typeof t.args === 'string' ? t.args : JSON.stringify(t.args || {});
  body.innerHTML = '<div>参数：<code>' + esc(String(args).slice(0, 300)) + '</code></div>' + (t.result ? '<div style="margin-top:4px">结果：' + linkify(String(t.result).slice(0, 600)) + '</div>' : '');
  d.append(body);
  return d;
}

function bubble(m, idx) {
  if (m.role === 'divider') {
    const d = el('div', 'divider');
    d.append(el('span', null, m.text || '以上内容不再发送给模型'));
    return d;
  }
  if (m.kind === 'handoff') {
    const d = el('div', 'doc');
    d.append(el('span', 'lab', '交接文档'));
    const body = el('div');
    body.innerHTML = md(stripMemoryMarkers(m.text)); hydrateCalcs(body, m, { readOnly: true });
    d.append(body);
    return d;
  }

  const isUser = m.role === 'user';
  const wrap = el('div', 'msg ' + (isUser ? 'user' : 'ai') + (m.streaming ? ' streaming' : ''));
  if (m.ts) {
    const d = new Date(m.ts);
    wrap.title = d.toLocaleString('zh-CN', { hour12: false });
  }
  wrap.append(el('div', 'av', isUser ? (m.who || LS.name || '我').slice(0, 1) : 'AI'));

  const bd = el('div', 'bd');
  if (isUser && m.who && m.who !== LS.name) bd.append(el('div', 'name', m.who));
  if (isUser) {
    const edit = el('button', 'msg-edit', '编辑');
    edit.type = 'button';
    edit.title = '拿回输入框重新发';
    edit.addEventListener('click', () => startEdit(idx));
    bd.append(edit);
  }

  const content = el('div');
  if (m.err) {
    content.append(el('div', 'err', m.text || '出错了'));
    const retry = el('button', 'msg-more', '重试');
    retry.type = 'button';
    retry.addEventListener('click', () => regenerateFrom(idx));
    content.append(retry);
  }
  else {
    content.innerHTML = md(m.text || '');
    hydrateCalcs(content, m);
    if (m.interrupted || m.stopped) {
      const note = el('div', 'msg-note', m.stopped ? '已停止，上面的内容是停止前收到的' : '连接中断，上面是已经收到的内容');
      const retry = el('button', 'msg-more', '重试');
      retry.type = 'button';
      retry.addEventListener('click', () => regenerateFrom(idx));
      note.append(retry);
      content.append(note);
    }
  }
  bd.append(content);

  if (!isUser && Array.isArray(m.tools) && m.tools.length) {
    for (const t of m.tools) bd.append(toolCard(t));
  }

  // 长消息折叠（默认只显示前半段，可展开）
  if (!isUser && !m.err && String(m.text || '').length > 1400) {
    content.classList.add('clamped');
    const more = el('button', 'msg-more', '展开全部');
    more.type = 'button';
    more.addEventListener('click', () => {
      const on = content.classList.toggle('clamped');
      more.textContent = on ? '展开全部' : '收起';
    });
    bd.append(more);
  }

  for (const u of (m.images || [])) {
    const box = el('div', 'imgbox');
    const img = el('img');
    const known = (m.dims && m.dims[u]) || dimsOf(u) || dimsOf(fileUrl(u));
    // 已知比例 → 直接按比例占位；未知 → 先按 1:1 占（生成图多数是方图）
    const ratio = known ? (known[0] + ' / ' + known[1]) : '1 / 1';
    img.style.aspectRatio = ratio;
    img.style.width = 'min(420px, 100%)';
    img.style.height = 'auto';
    img.src = fileUrl(u);
    img.alt = '';
    img.setAttribute('aria-label', '图片');
    img.setAttribute('role', 'img');
    box.append(el('span', 'img-load'));
    img.decoding = 'async';
    const settle = () => {
      box.classList.add('ready');
      if (img.naturalWidth && img.naturalHeight) {
        img.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
        rememberDims(u, img.naturalWidth, img.naturalHeight);
        // 存到消息上：下次（含其它设备）一进来就能先占对位置
        if (!m.dims || !m.dims[u]) {
          m.dims = m.dims || {};
          m.dims[u] = [img.naturalWidth, img.naturalHeight];
          queueDimsSave();
        }
      }
    };
    img.addEventListener('load', settle, { once: true });
    if (img.complete && img.naturalWidth) settle();
    img.addEventListener('error', () => { box.classList.add('broken'); }, { once: true });
    img.title = '点击放大';
    img.addEventListener('click', () => openLightbox(u));

    const acts = el('div', 'imgacts');
    // 静态图 → 一键让模型做成动图
    if (!/\.gif(\?|$)/i.test(u)) {
      const toGif = el('button');
      toGif.innerHTML = ic('film', 14) + '<span>转GIF</span>';
      toGif.type = 'button';
      toGif.title = '让 AI 把这张图做成动图';
      toGif.addEventListener('click', (e) => {
        e.stopPropagation();
        turnImageToGif(u);
      });
      acts.append(toGif);
    }
    const dl = el('button');
    dl.innerHTML = ic('download', 14) + '<span>下载</span>';
    dl.type = 'button';
    dl.addEventListener('click', async (e) => {
      e.stopPropagation();
      setBtnLabel(dl, '…');
      try { await downloadImage(u); setBtnLabel(dl, '已下载'); }
      catch { setBtnLabel(dl, '失败'); flashHint('下载失败，可右键另存'); }
      setTimeout(() => { setBtnLabel(dl, '下载'); }, 1500);
    });

    const cpImg = el('button');
    cpImg.innerHTML = ic('copy', 14) + '<span>复制</span>';
    cpImg.type = 'button';
    cpImg.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const msg = await copyImage(u);
        setBtnLabel(cpImg, '已复制');
        if (msg) flashHint(msg);
      } catch { setBtnLabel(cpImg, '失败'); flashHint('复制失败，可右键另存'); }
      setTimeout(() => { setBtnLabel(cpImg, '复制'); }, 1500);
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
      try {
        await navigator.clipboard.writeText(m.text || '');
        cp.textContent = '已复制';
        flashHint('已复制到剪贴板');
        setTimeout(() => cp.textContent = '复制', 1200);
      } catch {}
    });
    acts.append(cp);
    const regen = el('button', null, '重新生成');
    regen.type = 'button';
    regen.title = '从这条开始重新回答';
    regen.addEventListener('click', () => regenerateFrom(idx));
    acts.append(regen);
    // 用户消息额外给「编辑」：把原文放回输入框，改完重发（Claude 的 Edit）
    if (isUser) {
      const edit = el('button', null, '编辑');
      edit.type = 'button';
      edit.title = '把这条放回输入框修改';
      edit.addEventListener('click', () => {
        input.value = m.text || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        flashHint('已放回输入框，改完按 Enter 重发');
      });
      acts.append(edit);
    }
    // 反馈与朗读：功能已实现，默认隐藏（FEATURES_FB 打开才显示）
    if (FEATURES_FB.feedback) {
      const up = el('button', 'fb-up', '赞');
      up.type = 'button';
      up.title = '这条回答有帮助';
      const down = el('button', 'fb-down', '踩');
      down.type = 'button';
      down.title = '这条回答没帮上忙';
      const mark = (which) => {
        up.classList.toggle('on', which === 'up');
        down.classList.toggle('on', which === 'down');
        flashHint(which === 'up' ? '已记录：有帮助' : '已记录：没帮上忙');
      };
      up.addEventListener('click', () => mark('up'));
      down.addEventListener('click', () => mark('down'));
      acts.append(up, down);
    }
    if (FEATURES_FB.readAloud) {
      const ro = el('button', null, '朗读');
      ro.type = 'button';
      ro.addEventListener('click', () => {
        try {
          if (!('speechSynthesis' in window)) { flashHint('这个浏览器不支持朗读'); return; }
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(String(m.text || '').slice(0, 4000));
          u.lang = 'zh-CN';
          window.speechSynthesis.speak(u);
          flashHint('开始朗读');
        } catch (err) { flashHint('朗读失败'); }
      });
      acts.append(ro);
    }
    bd.append(acts);
  }

  // 用户消息也给操作：复制 + 编辑（Claude 对用户消息只给这两项）
  if (isUser) {
    const uacts = el('div', 'acts');
    const ucp = el('button', null, '复制');
    ucp.type = 'button';
    ucp.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(m.text || '');
        ucp.textContent = '已复制';
        flashHint('已复制到剪贴板');
        setTimeout(() => { ucp.textContent = '复制'; }, 1200);
      } catch (err) {}
    });
    const uedit = el('button', null, '编辑');
    uedit.type = 'button';
    uedit.title = '把这条放回输入框修改';
    uedit.addEventListener('click', () => {
      input.value = m.text || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      flashHint('已放回输入框，改完按 Enter 重发');
    });
    uacts.append(ucp, uedit);
    bd.append(uacts);
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
let lightboxList = [];
function openLightbox(u, list) {
  lightboxList = Array.isArray(list) && list.length ? list : [];
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

/* 灯箱：← → 在同一条消息的图片间切换 */
function lightboxNav(step) {
  if (!lightboxUrl) return;
  if (Array.isArray(lightboxList) && lightboxList.length) {
    const idx = lightboxList.indexOf(lightboxUrl);
    const nx = lightboxList[(idx + step + lightboxList.length) % lightboxList.length];
    lightboxUrl = nx;
    $('#lightboxImg').src = fileUrl(nx);
    return;
  }
  const imgs = [...document.querySelectorAll('.msg .imgbox img')].map((i) => i.getAttribute('src') || '');
  const urls = imgs.map((s) => s.split('/').pop()).filter(Boolean);
  const cur = String(lightboxUrl).split('/').pop();
  let i = urls.indexOf(cur);
  if (i < 0) return;
  i = (i + step + urls.length) % urls.length;
  lightboxUrl = urls[i];
  $('#lightboxImg').src = fileUrl(lightboxUrl);
}
document.addEventListener('keydown', (e) => {
  if ($('#lightbox').hidden) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); lightboxNav(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); lightboxNav(1); }
});
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

/* ---------------- 会话内查找（Ctrl+F） ---------------- */
let findHits = [];
let findIdx = -1;

function runFind(q) {
  const query = String(q || '').trim().toLowerCase();
  findHits = [];
  findIdx = -1;
  for (const m of document.querySelectorAll('#thread .msg')) m.classList.remove('found', 'found-on');
  const count = $('#findCount');
  if (!query) { if (count) count.textContent = '0/0'; return; }
  for (const m of document.querySelectorAll('#thread .msg')) {
    if (String(m.textContent || '').toLowerCase().includes(query)) findHits.push(m);
  }
  if (count) count.textContent = (findHits.length ? 1 : 0) + '/' + findHits.length;
  for (const m of findHits) m.classList.add('found');
  if (findHits.length) { findIdx = 0; focusHit(); }
}

function focusHit() {
  for (const m of findHits) m.classList.remove('found-on');
  const m = findHits[findIdx];
  if (!m) return;
  m.classList.add('found-on');
  m.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const count = $('#findCount');
  if (count) count.textContent = (findIdx + 1) + '/' + findHits.length;
}

function stepFind(step) {
  if (!findHits.length) return;
  findIdx = (findIdx + step + findHits.length) % findHits.length;
  focusHit();
}

function openFind() {
  const bar = $('#findBar');
  if (!bar) return;
  bar.hidden = false;
  $('#findInput').focus();
  $('#findInput').select();
}

function closeFind() {
  const bar = $('#findBar');
  if (bar) bar.hidden = true;
  for (const m of document.querySelectorAll('#thread .msg')) m.classList.remove('found', 'found-on');
  findHits = [];
}

$('#findInput').addEventListener('input', (e) => runFind(e.target.value));
$('#findInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('#findNext').addEventListener('click', () => stepFind(1));
$('#findPrev').addEventListener('click', () => stepFind(-1));
$('#findClose').addEventListener('click', closeFind);
/* ---------------- 草稿 / 回到最新 ---------------- */
const PIN_KEY = 'ai.pins';
function loadPins() { try { return JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); } catch { return []; } }
function isPinned(id) { return loadPins().includes(id); }
function togglePin(id) {
  let all = loadPins();
  all = all.includes(id) ? all.filter((x) => x !== id) : [id, ...all];
  try { localStorage.setItem(PIN_KEY, JSON.stringify(all)); } catch {}
}
const DRAFT_NEW = '__new__';
const draftKey = () => scopedKey('drafts');
function loadDrafts() {
  try { return JSON.parse(localStorage.getItem(draftKey()) || '{}'); } catch { return {}; }
}
function saveDraft(convId, text, images) {
  if (!convId) return;
  const all = loadDrafts();
  const hasImages = Array.isArray(images) && images.length > 0;
  if (text || hasImages) {
    if (convId === DRAFT_NEW) all[convId] = { text: text || '', images: hasImages ? images : [] };
    else all[convId] = text;
  } else {
    delete all[convId];
  }
  try { localStorage.setItem(draftKey(), JSON.stringify(all)); } catch {}
}
function restoreDraft(convId) {
  const all = loadDrafts();
  const raw = all[convId];
  const text = (raw && typeof raw === 'object') ? (raw.text || '') : (raw || '');
  input.value = text;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  if (convId === DRAFT_NEW) {
    state.attachments = (raw && Array.isArray(raw.images)) ? raw.images : [];
    renderAttach();
  } else if (state.attachments.length) {
    // 附件属于新对话草稿，切到别的会话要收起来
    state.attachments = [];
    renderAttach();
  }
  const box = $('#composer');
  if (box) box.classList.toggle('has-text', !!text.trim() || state.attachments.length > 0);
  syncSendVisible();
}

let lastDraftConv = null;
function syncDraftSwitch() {
  const cv = current();
  const id = cv ? cv.id : DRAFT_NEW;
  if (id === lastDraftConv) return;
  hideSuggests();
  if (lastDraftConv) saveDraft(lastDraftConv, input.value, state.attachments);
  lastDraftConv = id;
  restoreDraft(id);
}

function updateToLatest() {
  const btn = $('#toLatest');
  if (!btn) return;
  const gap = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight;
  btn.hidden = gap < 240;
}

function openSettingsPlaceholder() {}

function renderThread() {
  // 用「离底距离」而不是绝对位置：内容高度变化时也不会跳到历史
  const prevDist = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight;

  thread.textContent = '';
  const cv = current();
  const allMsgs = cv ? cv.messages : [];
  // 长对话只渲染最近一窗，避免一次铺几千个 DOM 节点
  const win = Math.max(100, Number(cv && cv.__window) || 300);
  const winStart = Math.max(0, allMsgs.length - win);
  const msgs = allMsgs.slice(winStart);
  $('#empty').hidden = !!allMsgs.length;
  if (!allMsgs.length) renderRecentArtifacts();
  layoutHomeComposer();
  // 日期分隔线：和 Claude 一样按天分段（今天 / 昨天 / 更早显示具体日期）
  let lastDayKey = '';
  const dayStartOf = (ts) => {
    const d = ts ? new Date(ts) : new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };
  const dayLabelOf = (ts) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const d = ts ? new Date(ts) : now;
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (that === today) return '今天';
    if (that === today - 86400000) return '昨天';
    if (that === today - 172800000) return '前天';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };
  if (winStart > 0) {
    const more = el('button', 'load-earlier', '加载更早的 ' + winStart + ' 条消息');
    more.type = 'button';
    more.addEventListener('click', () => {
      if (!cv) return;
      cv.__window = win + 300;
      renderThread();
    });
    thread.append(more);
  }
  msgs.forEach((m, i) => {
    const dk = String(dayStartOf(m.ts));
    if (dk !== lastDayKey) {
      lastDayKey = dk;
      thread.append(el('div', 'day-sep', dayLabelOf(m.ts)));
    }
    thread.append(bubble(m, winStart + i));
  });
  const viewName = { projects: '项目', files: '文件', gallery: '图库', plugins: '插件' }[state.view];
  $('#titleBtn').textContent = viewName || (cv ? cv.title : '新对话');
  const chev = $('#titleBtn').querySelector('.tchev');
  if (!chev) { const i = el('i', 'tchev', '⌄'); $('#titleBtn').append(i); }
  syncDraftSwitch();
  updateToLatest();
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

/* 能力开关：语音还没接，先渲染但隐藏，接上后把 voice 改成 true 即可 */
const FEATURES = { voice: false };
if (FEATURES.voice) { const mb = $('#micBtn'); if (mb) mb.hidden = false; }
function syncArtifactPane() {
  const cv = current();
  const pane = $('#artPane');
  if (!pane) return;
  if (state.view !== 'chat' || !cv || !cv.artifact || !cv.artifact.kind) {
    if (!pane.hidden) closeArtifactPane();
    return;
  }
  // 手机上不自动铺开整屏产物面板（会把刚点开的对话盖住）；底部「产物」按钮仍可打开
  if (window.innerWidth < 900) {
    if (!pane.hidden) closeArtifactPane();
    artKind = cv.artifact.kind;
    artName = cv.artifact.name;
    return;
  }
  if (pane.hidden || artKind !== cv.artifact.kind || artName !== cv.artifact.name) {
    openArtifactPane(cv.artifact.kind, cv.artifact.name);
  }
}

function renderAll() {
  syncArtifactPane();
  renderSide();
  // 顶栏标题：跟着当前视图走，别停在上一段对话的标题
  const VIEW_TITLE = { projects: '项目', files: '文件', images: '图库', plugins: '插件', skills: '技能' };
  const tb = $('#titleBtn');
  if (tb && VIEW_TITLE[state.view]) {
    tb.textContent = VIEW_TITLE[state.view];
    const i = el('i', 'tchev', '⌄');
    tb.append(i);
  }
  const isProj = state.view === 'projects';
  const isFiles = state.view === 'files';
  const isPlugins = state.view === 'plugins';
  const pg = $('#pluginsPage');
  if (pg) {
    pg.hidden = !isPlugins;
    if (isPlugins) renderPluginsPage();
  }
  const isSkills = state.view === 'skills';
  const skp = $('#skillsPage');
  if (skp) {
    skp.hidden = !isSkills;
    if (isSkills) renderSkillsPage();
  }
  const isImages = state.view === 'images';
  const isProject = state.view === 'project';
  const pd = $('#projDetail');
  document.body.classList.toggle('in-project', isProject);
  if (pd) {
    pd.hidden = !isProject;
    if (isProject) renderProjectDetail();
  }
  const gp = $('#galleryPage');
  if (gp) {
    gp.hidden = !isImages;
    if (isImages) renderGallery();
  }
  const page = $('#projPage');
  if (page) {
    page.hidden = !isProj;
    if (isProj) renderProjectsPage();
  }
  const fp = $('#filesPage');
  if (fp) {
    fp.hidden = !isFiles;
    if (isFiles) renderFilesPage();
  }
  if (isProj || isFiles || isImages || isPlugins || isSkills || state.view === 'project') {
    $('#thread').textContent = '';
    $('#empty').hidden = true;
    layoutHomeComposer();
    const cb = $('#composerBlock');
    if (cb) cb.hidden = true;
  } else {
    const cb = $('#composerBlock');
    if (cb) cb.hidden = false;
    renderThread();
  }
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
  num.textContent = used.toLocaleString() + ' / ' + (budget > 0 ? budget.toLocaleString() : '本站不裁剪');
  num.style.color = color;
  $('#ring').title = budget > 0 ? '上下文占用 ' + Math.round(ratio * 100) + '%' : '本站不主动裁剪（模型自身仍有上下文上限）';

  const arch = $('#ctxArch');
  const cut = Number(cv && cv.cutIndex) || 0;
  arch.hidden = cut <= 0;
  if (cut > 0) arch.textContent = '已归档 ' + cut + ' 条';
}

/* ---------------- 模型 / 强度 ---------------- */
let modelPinned = false;   // 会话指定的模型，不要被列表自动纠正掉

function visibleModels() {
  const all = LS.models.filter((m) => !DEAD_MODEL_RE.test(String(m)));
  return canAstra() ? all : all.filter(m => !/astra/i.test(m));
}

/** 输入框下方那行：模型 · 努力度（点开就是模型菜单） */
function updateComposerMeta() {
  const chip = '<span class="mm">' + esc(labelOf(LS.model)) + '</span><span class="me">' + esc(EFFORT_LABEL[LS.effort] || LS.effort) + '</span>';
  const cm = $('#cmModel');
  if (cm) {
    cm.innerHTML = chip;
    cm.title = '切换模型 / 思考强度';
  }
  const p = $('#metaProject');
  if (p) {
    const cv = current();
    const proj = cv && cv.projectId ? (state.projects || []).find((x) => x.id === cv.projectId) : null;
    p.innerHTML = '<span class="pm">' + esc(proj ? proj.name : '项目') + '</span><span class="chev-s">⌄</span>';
  }
}

/** 模型的一句话定位（对应 Claude 菜单里的第二行说明） */
function modelMeta(id) {
  const m = String(id || '');
  if (/astra/i.test(m)) return { badge: canAstra() ? (LS.role === 'astra' ? 'Astra 专属' : (LS.role === 'admin' ? '管理员' : '成员')) : '受限', desc: '最强推理，适合复杂任务' };
  // 5.6 Sol 单独给详细说明（其余 Sol 用一句话）
  if (/gpt-5\.6-sol/i.test(m)) return { badge: '', desc: '比 6.1 Sol 回复更详细' };
  if (/sol/i.test(m)) return { badge: '', desc: '通用主力，均衡稳定' };
  if (/terra/i.test(m)) return { badge: '', desc: '更快更省，适合日常' };
  if (/luna/i.test(m)) return { badge: '', desc: '最快最省，适合简单任务' };
  return { badge: '', desc: '' };
}

let showAllModels = false;
let showRetired = false;   // 已淘汰模型默认折叠

/** 在售模型：只保留 5.6 的 Terra / Luna，其余归入已淘汰 */
/** 首页菜单上的模型（用户指定：6 Sol 只出现在「更多模型」里） */
const HOME_MODEL_RE = [
  /gpt-6\.1-sol/i, /gpt-6-astra/i, /gpt-6\.1-terra/i, /gpt-6-luna/i,
  /gpt-5\.6-sol/i,
];
/** 明确用不上的（搜索/嵌入/语音/审核类），直接不显示 */
const DEAD_MODEL_RE = /search-api|embedding|whisper|tts|transcribe|moderation|dall-e|realtime|image-1|^o[13](-|$)/i;

function isActiveModel(id) {
  const m = String(id || '');
  return HOME_MODEL_RE.some((re) => re.test(m));
}

function modelRow(id, retired) {
  const meta = modelMeta(id);
  const b = el('button', 'mp-item' + (retired ? ' retired' : ''));
  b.type = 'button';
  const t = el('div', 't');
  t.append(el('span', null, labelOf(id)));
  if (meta.badge) t.append(el('span', 'badge', meta.badge));
  if (retired) t.append(el('span', 'badge legacy', '已淘汰'));
  if (id === LS.model) t.append(el('span', 'ck', '✓'));
  b.append(t);
  if (meta.desc) b.append(el('div', 'd', meta.desc));
  b.addEventListener('click', () => {
    modelPinned = false;
    LS.model = id;
    renderModels();
    renderEffort();
    updateCtx();
    persistSettings();
  });
  return b;
}

const MODEL_ORDER = ['sol', 'terra', 'luna'];
function modelRank(id) {
  const m = String(id).toLowerCase();
  for (let i = 0; i < MODEL_ORDER.length; i++) if (m.includes(MODEL_ORDER[i])) return i;
  return 9;
}
function homeRank(id) {
  const i = HOME_MODEL_RE.findIndex((re) => re.test(String(id)));
  return i < 0 ? 99 : i;
}
function activeModels() {
  return visibleModels().filter(isActiveModel).sort((a, b) => homeRank(a) - homeRank(b));
}

/** 「更多模型」的飞出面板：全部模型 + 已淘汰（折叠） */
const is56 = (id) => /5\.6/i.test(String(id));
const is6x = (id) => /^gpt-6/i.test(String(id));

function renderAllModels() {
  const box = $('#allModelList');
  if (!box) return;
  box.textContent = '';
  const list = visibleModels();
  const five6 = list.filter((m) => is56(m) && /(sol|terra|luna)/i.test(m)).sort((a, b) => modelRank(a) - modelRank(b));
  const six = list.filter((m) => is6x(m) && !is56(m));
  const legacy = list.filter((m) => !five6.includes(m) && !six.includes(m));

  box.append(el('div', 'mp-sect', '更多模型'));
  if (six.length) {
    box.append(el('div', 'mp-sect sub', 'GPT-6 / 6.1 系列'));
    for (const id of six) box.append(modelRow(id, false));
  }
  if (five6.length) {
    box.append(el('div', 'mp-sect sub', 'GPT-5.6 系列'));
    for (const id of five6) box.append(modelRow(id, false));
  }
  if (legacy.length) {
    const fold = el('button', 'mp-row mp-fold');
    fold.type = 'button';
    fold.innerHTML = '<span>更早的模型</span><span class="mp-right"><b>' + legacy.length + '</b><i class="chev">' + (showRetired ? '⌄' : '›') + '</i></span>';
    fold.addEventListener('click', (e) => {
      e.stopPropagation();
      showRetired = !showRetired;
      renderAllModels();
    });
    box.append(fold);
    if (showRetired) for (const id of legacy) box.append(modelRow(id, true));
  }
}

function renderModels() {
  const list = visibleModels();
  const box = $('#modelList');
  box.textContent = '';

  const active = activeModels();
  const current = active.length ? active : list;

  // 首页菜单列出常用模型；「更多模型」里放剩下的
  for (const id of current) box.append(modelRow(id, !isActiveModel(id)));
  if (!modelPinned && !list.includes(LS.model) && list.length) LS.model = current[0] || list[0];

  $('#modelName').textContent = labelOf(LS.model);
  const mm = $('#moreModels');
  if (mm) {
    mm.innerHTML = '<span>更多模型</span><span class="mp-right"><b>' + esc(labelOf(LS.model)) + '</b><i class="chev">›</i></span>';
  }
  const note = $('#mpNote');
  if (note) note.textContent = canAstra() ? '模型越高越慢越贵；带图请求会自动省略推理档位。' : '高级模型需要高级口令。';
  renderAllModels();
  updateComposerMeta();
  renderEffort();
}

const EFFORT_DESC = {
  minimal: '最快，几乎不思考',
  low: '轻量思考，响应快',
  medium: '日常推荐，兼顾质量与速度',
  high: '更详尽的推理，耗时更长',
  max: '最深推理，用量达 5× 或以上',
};

function renderEffort() {
  const list = effortsFor(LS.model);
  let idx = list.indexOf(LS.effort);
  if (idx < 0) idx = Math.max(0, list.indexOf('medium'));
  LS.effort = list[idx];

  const box = $('#effList');
  if (box) {
    box.textContent = '';
    for (const e of list) {
      const b = el('button', 'eff-item');
      b.type = 'button';
      b.append(el('span', null, EFFORT_LABEL[e] || e));
      if (e === 'medium') b.append(el('span', 'rec', '推荐'));
      if (e === 'max') b.append(el('span', 'warn', '⚠ 用量达 5× 或以上'));
      if (e === LS.effort) b.append(el('span', 'ck', '✓'));
      b.title = EFFORT_DESC[e] || '';
      b.addEventListener('click', () => {
        LS.effort = e;
        renderEffort();
        persistSettings();
        $('#effPop').hidden = true;
      });
      box.append(b);
    }
  }

  $('#effName').textContent = EFFORT_LABEL[LS.effort] || LS.effort;
  updateComposerMeta();
  $('#popEff').textContent = EFFORT_LABEL[LS.effort] || LS.effort;
}

/* ---------------- 发送 ---------------- */
function setBusy(b) {
  state.streaming = b;
  sendBtn.classList.toggle('stop', b);
  const box = $('#composer');
  if (box) box.classList.toggle('is-busy', b);
  sendBtn.title = b ? '停止' : '发送';
  sendBtn.setAttribute('aria-label', b ? '停止生成' : '发送消息');
  const sr = document.getElementById('srStatus');
  if (sr) sr.textContent = b ? '正在生成回复' : '生成结束';
  sendBtn.innerHTML = b
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="m5 12 7-7 7 7"/></svg>';
}

/* 一闪而过的提示，贴在输入框上方 */
let flashTimer = null;
/* 交接文档进度：模型调用要十几秒，给个可见进度 */
let handoffTimer = 0;
function showHandoffProgress() {
  hideHandoffProgress();
  const box = el('div', 'hf-prog');
  box.id = 'hfProg';
  box.innerHTML = '<div class="hf-row"><span class="hf-spin"></span><span class="hf-txt">正在把上文压成交接文档…</span><b class="hf-sec">0s</b></div>'
    + '<div class="hf-bar"><i style="width:4%"></i></div>';
  document.body.append(box);
  const t0 = Date.now();
  handoffTimer = setInterval(() => {
    const el2 = document.querySelector('#hfProg');
    if (!el2) return;
    const sec = Math.round((Date.now() - t0) / 1000);
    const b = el2.querySelector('.hf-sec'); if (b) b.textContent = sec + 's';
    const fill = el2.querySelector('.hf-bar i');
    if (fill) fill.style.width = Math.min(92, 4 + sec * 7) + '%';
  }, 500);
}
function hideHandoffProgress() {
  clearInterval(handoffTimer);
  const box = document.querySelector('#hfProg');
  if (box) box.remove();
}
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
  clearTimeout(settingsTimer);   // 别让流式前的设置保存和本轮文件写入抢 rev
  let cv = current();
  if (!cv) {
    // 新会话要先建号；断网/服务不可达时别把用户这句话吞掉
    try {
      cv = await createConv({ private: !!state.pendingPrivate, projectId: state.projectFilter || null });
    } catch (e) {
      if (e && e.status === 401) { logout(); flashHint('登录过期了，请重新登录'); return; }
      cv = null;
    }
    if (!cv) {
      if (input && text) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
      flashHint('网络好像断了，消息没发出去（已放回输入框）');
      return;
    }
  }
  if (cv) { state.pendingPrivate = false; saveDraft(DRAFT_NEW, ''); }
  if (!cv) return;
  // 首句自动命名：标题还是「新对话」时，用第一句当标题
  if ((!cv.title || cv.title === '新对话') && text && text.trim()) {
    const first = text.trim().split(/\n/)[0].slice(0, 24);
    if (first) cv.title = first;
  }

  // 参考图：显式指定的优先，否则把当前附件全部带上（多图参考，最多 4 张）
  const picked = (opts.refImages && opts.refImages.length) ? opts.refImages
    : opts.refImage ? [opts.refImage]
    : state.attachments.map(a => a.url);
  const imgs = picked.filter(Boolean).slice(0, MAX_REF_IMAGES);
  state.attachments = [];
  renderAttach();

  // 每个请求都建一条任务记录：刷新后仍能看到状态/取消意图
  let runId = null;
  try {
    const rr = await api('/runs', { method: 'POST', body: { conversationId: cv.id, requestKey: newRunKey(), title: cv.title } });
    if (rr.ok) { const jj = await rr.json().catch(() => ({})); runId = jj.run && jj.run.id; }
  } catch (e) {}
  state.currentRunId = runId || null;

  // 画图模式且没有附件：走对话模型 + 图像工具，这样能看到上文
  const drawMode = !!opts.draw || !!state.imageMode;
  const gifAsk = !!opts.gif;

  // 产物类需求：按关键词自动建 doc / deck / design，并打开右栏
  if (!drawMode && !gifAsk && !cv.artifact) {
    const t = String(text || '');
    let kind = null;
    let name = null;
    if (/(幻灯片|PPT|ppt|演示文稿|演示稿|slides?|deck)/i.test(t)) { kind = 'deck'; name = '幻灯片.deck.json'; }
    else if (/(网站|网页|落地页|landing|html|设计稿|页面设计|webpage)/i.test(t)) { kind = 'design'; name = '页面.html'; }
    else if (/(做|创建|写|开发|实现|来个|整个)/.test(t) && /(游戏|小游戏|\bgame\b)/i.test(t)) { kind = 'design'; name = '游戏.html'; }
    else {
      const m = t.match(/(文档|报告|方案|说明书|白皮书|文章|总结|简历|会议纪要|策划书|需求文档|设计文档)/);
      if (m) { kind = 'doc'; name = (String(m[1]).replace(/[\\/:*?"<>|]/g, '').slice(0, 16) || '文档') + '.md'; }
    }
    if (kind && name) {
      cv.artifact = { kind, name };
      openArtifactPane(kind, name);
    }
  }

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
  const caret = el('span', 'cursor');
  if (host) { host.textContent = ''; host.append(caret); }

  setBusy(true);
  showThinking(gifAsk ? '正在生成动图' : (drawMode ? '正在画图' : (state.search ? '正在联网搜索' : '正在思考')));
  state.controller = new AbortController();

  let acc = '';
  let raf = 0;
  let lastPaint = 0;
  const paint = () => {
    raf = 0;
    if (!host) return;
    const now = performance.now();
    if (now - lastPaint < 80) { raf = requestAnimationFrame(paint); return; }
    lastPaint = now;
    const split = splitStreamFiles(acc);
    host.innerHTML = md(split.text);
    host.append(caret);
    if (split.files.length && cv) {
      cv.files = cv.files || [];
      for (const f of split.files) {
        const fi = cv.files.findIndex((x) => x.name === f.name);
        const rec = { name: f.name, content: f.content, updatedAt: Date.now() };
        if (fi >= 0) cv.files[fi] = rec; else cv.files.push(rec);
      }
      if (cv.artifact && !cv.artifact.name && split.files[0]) cv.artifact.name = split.files[0].name;
      if (!$('#artPane').hidden) renderArtifact();
    }
    if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

/** 等待首个字符时的「思考中」占位 */
const THINK_LABELS = {
  web_search: '正在联网搜索',
  search: '正在联网搜索',
  image: '正在画图',
  generate_image: '正在画图',
  write_file: '正在写文件',
  calc: '正在计算',
  python: '正在运行代码',
};
function showThinking(text) {
  if (!thinkingEl) {
    thinkingEl = el('div', 'msg ai thinking');
    const bd = el('div', 'bd');
    bd.innerHTML = '<span class="dots"><i></i><i></i><i></i></span><span class="tk"></span><span class="te"></span>';
    thinkingEl.append(bd);
    thread.append(thinkingEl);
    thinkingEl.__t0 = Date.now();
    thinkingEl.__label = '正在思考';
    clearInterval(thinkingTimer);
    thinkingTimer = setInterval(() => {
      const te = thinkingEl && thinkingEl.querySelector('.te');
      if (!te) return;
      const sec = Math.round((Date.now() - thinkingEl.__t0) / 1000);
      te.textContent = sec >= 4 ? ' · ' + sec + 's' : '';
    }, 1000);
  }
  if (text) thinkingEl.__label = text;
  const tk = thinkingEl.querySelector('.tk');
  if (tk) tk.textContent = thinkingEl.__label;
  if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;
}
function hideThinking() {
  clearInterval(thinkingTimer);
  thinkingTimer = 0;
  if (!thinkingEl) return;
  thinkingEl.remove();
  thinkingEl = null;
}
  /** 真打一次 /chat；imageOpts 允许被降档重试替换 */
  const postChat = async (io) => {
    const reqBody = {
        model, search: state.search, convId: cv.id, projectId: cv.projectId || null, runId: runId || undefined,
        // 出图工具常开：模型自己判断要不要画
        imageTool: true,
        ...(drawMode
          ? { imageMode: true, refImages: refImages.length ? refImages : undefined, imageOpts: io, imageCount: wantN }
          : { effort }),
        codeMode: state.codeMode || !!cv.artifact,
        workMode: !!state.workMode,
        // 技能：服务端据此注入说明并只放开技能声明的工具
        skill: state.pendingSkill ? state.pendingSkill.id : undefined,
        fileNames: (cv.files || []).map(f => f.name),
        artifactContent: (() => {
          const art = cv.artifact;
          if (!art) return undefined;
          const hit = (cv.files || []).find(x => x.name === art.name);
          return hit ? String(hit.content || '').slice(0, 24000) : undefined;
        })(),
        artifact: cv.artifact || undefined,
        design: cv.artifact && cv.artifact.kind === 'design' ? (cv.design || undefined) : undefined,
        messages: sentMessages(cv).map(m => ({
          role: m.role,
          text: m.text,
          // 只有用户消息能带图；assistant 的内容只允许 output_text / refusal
          images: m.role === 'user' ? m.images : undefined,
        })),
    };

    // 后台任务模式：服务端独立执行，前端轮询进度；关页任务继续
    if (runId && !drawMode && !gifAsk) {
      const started = await api('/runs/' + encodeURIComponent(runId) + '/start', { method: 'POST', body: { payload: reqBody } });
      if (started.ok) {
        state.bgRun = true;
        let st = 'running';
        let runErr = null;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (;;) {
          if (state.controller && state.controller.signal.aborted) break;
          try {
            const pr = await api('/runs/' + encodeURIComponent(runId) + '/progress');
            if (pr.ok) {
              const j = await pr.json().catch(() => ({}));
              if (j.status) st = j.status;
              if (j.error) runErr = j.error;
              const o = j.output || {};
              if (typeof o.text === 'string' && o.text !== acc) { acc = o.text; paint(); hideThinking(); }
              if (Array.isArray(o.tools) && o.tools.length) {
                reply.tools = o.tools.map((t) => ({ name: t.name, args: t.args, result: t.result }));
              }
              if (Array.isArray(o.images) && o.images.length) reply.images = o.images.slice(0, 8);
            }
          } catch (e) {}
          if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(st)) break;
          await sleep(650);
        }
        if (st === 'cancelled' || (state.controller && state.controller.signal.aborted)) {
          throw Object.assign(new Error('已取消'), { name: 'AbortError' });
        }
        if (st === 'failed') throw new Error(runErr || '任务失败');
        return;
      }
    }

    const res = await api('/chat', { method: 'POST', signal: state.controller.signal, body: reqBody });
    if (!res.ok) {
      let d = null; try { d = await res.json(); } catch {}
      throw Object.assign(new Error(errText(res.status, d)), { status: res.status });
    }

    // 服务端执行过的自定义工具：画成工具卡片
    try {
      const rawCalls = res.headers.get('x-tool-calls');
      if (rawCalls) {
        const calls = JSON.parse(atob(rawCalls));
        pushToolCards(reply, calls);
      }
    } catch (e) {}

    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const d = await res.json();
      if (Array.isArray(d.tool_calls)) pushToolCards(reply, d.tool_calls);
      acc = d.text || '';
      paint();
    } else {
      // 注意：这里不能 hideThinking——上游可能还要思考十几秒，先留着占位
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let sawDone = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // 兼容 CRLF：有些中转会在 event 之间用 \r\n\n
        buf = buf.replace(/\r\n/g, '\n');
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') { sawDone = true; continue; }
            let ev; try { ev = JSON.parse(payload); } catch { continue; }
            if (ev.done) sawDone = true;
            if (ev.e) throw new Error(ev.e);
            if (ev.u) cv.usage = ev.u;
            if (ev.img) {
              reply.images = [...(reply.images || []), ev.img];
              if (ev.imgPrompt) reply.imgPrompts = [...(reply.imgPrompts || []), ev.imgPrompt];
              if (!reply.meta) reply.meta = '图片';
            }
            if (ev.tool_progress && ev.tool_progress.name === 'write_file') {
              const raw = String(ev.tool_progress.raw || '');
              const nm = raw.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              const cm = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/);
              if (nm && cm) {
                let name = '', content = '';
                try { name = JSON.parse('"' + nm[1] + '"'); } catch (e) {}
                try { content = JSON.parse('"' + cm[1].replace(/\\$/, '') + '"'); } catch (e) { content = cm[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
                if (name) {
                  applyFiles(cv, [{ name, content }], { backup: false });
                  if (!cv.artifact) cv.artifact = { kind: 'doc', name };
                  const kind = cv.artifact.kind || 'doc';
                  if (kind === 'doc') {
                    if ($('#artPane').hidden) openArtifactPane('doc', cv.artifact.name);
                    else renderArtifact();
                  } else {
                    // design / deck：流式阶段 iframe 反复重载会白屏闪烁，只有内容完整时才刷新一次
                    const complete = kind === 'design'
                      ? /<\/html>\s*$/i.test(content)
                      : (/"slides"\s*:/.test(content) && /\}\s*$/.test(content));
                    if (complete) {
                      if ($('#artPane').hidden) openArtifactPane(kind, name);
                      else { artName = name; renderArtifact(); }
                    }
                  }
                }
              }
            }
            if (ev.tool && ev.tool.name === 'write_file' && ev.tool.args) {
              const a = ev.tool.args;
              const name = String(a.name || '文档.md');
              const content = String(a.content || '');
              applyFiles(cv, [{ name, content }]);
              reply.wrote = [name];
              // 产物类型跟着文件名走：写成 .md 就是文档，写成 .html 就是设计稿
              const nk = kindOfFile(name);
              cv.artifact = { kind: nk, name };
              reply.tools = reply.tools || [];
              reply.tools.push({ name: 'write_file', args: { name }, result: '已写入' });
              openArtifactPane(nk, name);
            } else if (ev.tool && ev.tool.name === 'publish_plugin') {
              const a = ev.tool.args || {};
              reply.tools = reply.tools || [];
              const card = { name: 'publish_plugin', args: a, result: '待确认' };
              reply.tools.push(card);
              const ok = window.confirm('发布到插件库并生成在线页面？\n\n名称：' + (a.name || '(未命名)') + '\n标识：' + (a.slug || '(自动)') + '\n\n发布会推送到 GitHub，几秒后生效。');
              if (!ok) { card.result = '已取消'; flashHint('已取消发布'); }
              else {
                card.result = '发布中…';
                const r = await publishDesignArtifact({ name: a.name, desc: a.desc, slug: a.slug });
                card.result = r.ok ? ('已发布：' + r.url) : ('失败：' + (r.error || ''));
              }
            } else if (ev.tool) {
              reply.tools = reply.tools || [];
              reply.tools.push({ name: ev.tool.name || 'tool', args: ev.tool.args, result: null, call_id: ev.tool.call_id || null });
            }
            if (Array.isArray(ev.tool_calls)) pushToolCards(reply, ev.tool_calls);
            if (ev.tool_done) {
              const list = reply.tools || [];
              const hit = ev.tool_done.call_id ? list.find((t) => t.call_id === ev.tool_done.call_id) : list.slice(-1)[0];
              if (hit) hit.result = String(ev.tool_done.result || '').slice(0, 300);
              // 工具产出的文件：立刻记进会话文件，避免保存时被旧列表覆盖
              try {
                const raw = String(ev.tool_done.result || '');
                const m = raw.match(/\{"ok":true,"file":\{[^}]*\}(?:,"convRev":\d+)?\}/);
                if (m) {
                  const parsedFile = JSON.parse(m[0]);
                  const jf = parsedFile.file;
                  if (jf) {
                    // 服务端写文件会推进 rev，客户端必须同步，否则下一次保存会 409
                    try { const rev = parsedFile.convRev; if (Number.isFinite(Number(rev))) { cv.rev = Number(rev); cv.__serverFileRev = true; } } catch (e) {}
                    cv.files = cv.files || [];
                    const byName = cv.files.find((x) => x.name === jf.name);
                    if (jf.url && !cv.files.some((x) => x.url === jf.url)) {
                      cv.files.push({ name: jf.name || '文件', url: jf.url, kind: (typeof kindOfFile === 'function' ? kindOfFile(jf.name) : 'doc'), size: jf.size || 0, content: '' });
                    } else if (byName && jf.size) {
                      byName.size = jf.size;
                    }
                    if (state.view === 'chat') { try { renderSide(); } catch (e) {} }
                  }
                }
              } catch (e) {}
            }
            if (ev.tool_result) { const last = (reply.tools || []).slice(-1)[0]; if (last) last.result = ev.tool_result; }
            if (ev.tool_start && ev.tool_start.name) showThinking(THINK_LABELS[ev.tool_start.name] || '正在调用工具');
            if (ev.tool_progress && ev.tool_progress.name === 'write_file') {
              const nm2 = String(ev.tool_progress.raw || '').match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              let fn = '';
              if (nm2) { try { fn = JSON.parse('"' + nm2[1] + '"'); } catch (e) {} }
              showThinking(fn ? '正在写 ' + fn : '正在写文件');
            }
            if (ev.img_b64 || ev.img) showThinking('正在画图');
            if (ev.t) { if (!acc && ev.t.trim()) hideThinking(); acc += ev.t; schedule(); }
          }
        }
      }
      // 末尾可能还有一帧没被空行收尾：按行解析一次
      if (buf.trim()) {
        for (const line of buf.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let ev; try { ev = JSON.parse(payload); } catch { continue; }
          if (ev.done) sawDone = true;
          if (ev.t) acc += ev.t;
        }
      }
      if (!sawDone) {
        const err = new Error('连接提前中断');
        err.interrupted = true;
        throw err;
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
    const sig = state.controller && state.controller.signal;
    if (sig && sig.aborted) return false;
    try {
      if (gifAsk) {
        const r = await api('/gif', {
          method: 'POST', timeout: 300000, signal: sig,
          body: { prompt: text, frames: (imageOpts && imageOpts.frame_count) || gifFrames, duration: gifDuration, image: imgs[0] },
        });
        const d = await r.json().catch(() => ({}));
        if (d.url) { reply.images = [d.url]; reply.meta = 'GIF · 回退生成'; return true; }
        return false;
      }
      const r2 = await api('/draw', {
        method: 'POST', timeout: 300000, signal: sig,
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
        if (host) host.innerHTML = '';
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
    const parsed = extractFiles(reply.text || '');
    if (parsed.files.length) {
      applyFiles(cv, parsed.files);
      reply.wrote = parsed.files.map(f => f.name);
      reply.text = parsed.text;
      if (!reply.text) reply.text = '';
    }
    if (host) { host.innerHTML = md(reply.text || ''); hydrateCalcs(host, reply); }
    if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;
  } catch (e) {
    hideThinking();
    delete reply.streaming;
    const aborted = e && e.name === 'AbortError';
    const interrupted = !!(e && e.interrupted);
    // 工具报错也要走兜底，否则用户只看到一段上游 JSON；中断/取消不再兜底
    let recovered = false;
    if (!aborted && !interrupted) { try { recovered = await fallbackImage(); } catch { recovered = false; } }
    if (recovered) {
      reply.text = acc || '';
    } else if (aborted) {
      // 主动停止：保留已经收到的正文
      reply.text = acc || '（已停止）';
      if (acc) reply.stopped = true;
    } else if (acc) {
      // 网络中断（或流提前结束）：保留已经收到的正文，只标记状态
      reply.text = acc;
      reply.interrupted = true;
    } else {
      reply.err = true;
      reply.text = humanError(e && e.message) || (e && e.message) || '出错了';
      if (e && e.status === 401) logout();
    }
  } finally {
    if (state.pendingSkill) { state.pendingSkill = null; renderSkillChip(); }
    if (reply && typeof reply.text === 'string') reply.text = collectMemories(reply.text);
    hideThinking();
    state.controller = null;
    // 先解锁输入再落盘：收尾那一两秒里用户按发送，不该被当成「停止」
    setBusy(false);
    // 服务端写文件/附件会推进 rev；保存前拉一次最新版本，避免用旧 baseRev 撞 409
    if (cv && cv.__serverFileRev) {
      try {
        const rr = await api('/convs/' + encodeURIComponent(cv.id));
        if (rr.ok) { const jj = await rr.json(); if (jj.conversation && Number.isFinite(Number(jj.conversation.rev))) cv.rev = Number(jj.conversation.rev); }
      } catch (e) {}
      cv.__serverFileRev = false;
    }
    state.currentRunId = null;
    if (state.bgRun) {
      // 服务端已经把 user/assistant 写回会话：重新拉取，别再用本地副本覆盖
      state.bgRun = false;
      try {
        const rr = await api('/convs/' + encodeURIComponent(cv.id));
        if (rr.ok) {
          const jj = await rr.json();
          if (jj.conversation) {
            const idx = state.convs.findIndex((c) => c.id === cv.id);
            if (idx >= 0) state.convs[idx] = jj.conversation; else state.convs.unshift(jj.conversation);
            setSaveState(jj.conversation, 'saved');
            pingTabs();
          }
        }
      } catch (e) {}
      loadRuns();
      renderAll();
    } else {
      state.finishPromise = saveConv(cv);
      await state.finishPromise;
      state.finishPromise = null;
      loadRuns();
      renderAll();
    }
    // 模型写完文件后，右侧产物面板跟着刷新
    if (!$('#artPane').hidden) renderArtifact();
    scheduleUsage();
    if (stickBottom) scrollBox.scrollTop = scrollBox.scrollHeight;
    if (!reply.err) setTimeout(() => maybeSuggest(cv), 400);
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
  if (!current()) saveDraft(DRAFT_NEW, input.value, state.attachments);
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
['dragenter', 'dragover'].forEach((evt) => {
  $('#composer').addEventListener(evt, (e) => { e.preventDefault(); $('#composer').classList.add('dragover'); });
});
['dragleave', 'drop'].forEach((evt) => {
  $('#composer').addEventListener(evt, () => $('#composer').classList.remove('dragover'));
});

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


/** 流式切分：把 ```file:name ... ``` 从正文里摘出来；未闭合的也先收进 files */
function splitStreamFiles(src) {
  const open = src.indexOf('```file:');
  if (open < 0) return { text: src, files: [] };
  const nl = src.indexOf('\n', open);
  if (nl < 0) return { text: src.slice(0, open), files: [] };
  const name = src.slice(open + 8, nl).trim();
  // 注意：文档内容里可能还有 ``` 代码块，流式阶段不找闭合，整段都归文件；
  // 真正的闭合在 extractFiles 里用最后一个 ``` 判断。
  return { text: src.slice(0, open), files: [{ name, content: src.slice(nl + 1) }] };
}
function extractFiles(text) {
  // 单文件块：文档正文里可能有 ``` 代码块，闭合必须取最后一个 ```
  const open = text.indexOf('```file:');
  if (open >= 0) {
    const nl = text.indexOf('\n', open);
    if (nl >= 0) {
      const name = text.slice(open + 8, nl).trim();
      const close = text.lastIndexOf('```');
      const second = text.indexOf('```file:', open + 1);
      if (name && close > nl && (second < 0 || second > close)) {
        const content = text.slice(nl + 1, close).replace(/\s+$/, '') + '\n';
        const cleaned = (text.slice(0, open) + text.slice(close + 3)).replace(/\n{3,}/g, '\n\n').trim();
        return { files: [{ name, content }], text: cleaned };
      }
    }
  }
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
function backupName(name, n) {
  const dot = String(name).lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return base + '（旧版' + n + '）' + ext;
}
function applyFiles(cv, incoming, opts = {}) {
  cv.files = cv.files || [];
  const keepBackup = opts.backup !== false;
  for (const f of incoming) {
    const i = cv.files.findIndex(x => x.name === f.name);
    if (i >= 0) {
      const old = cv.files[i];
      const oldLen = String(old.content || '').length;
      // 覆盖前留一份旧版；流式半成品不留（opts.backup=false），同内容不留第二份
      if (keepBackup && oldLen > 200 && String(old.content || '') !== String(f.content || '')
        && !cv.files.some(x => x.name !== f.name && x.content === old.content && /（旧版\d+）/.test(x.name))) {
        let n = 1;
        while (cv.files.some(x => x.name === backupName(f.name, n))) n += 1;
        if (n <= 2) cv.files.push({ name: backupName(f.name, n), content: old.content, updatedAt: Date.now() });
      }
      cv.files[i] = { ...f, updatedAt: Date.now() };
    } else {
      cv.files.push({ ...f, updatedAt: Date.now() });
    }
  }
}

/* 代码面板：拖宽 + Esc 关闭 */
(function initCodeResize() {
  const handle = document.getElementById('codeResizer');
  if (!handle) return;
  const pane = $('#codepane');
  const saved = Number(localStorage.getItem('ai.codeW') || 0);
  if (saved > 280) pane.style.width = saved + 'px';
  let dragging = false;
  handle.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); document.body.style.userSelect = 'none'; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.max(300, Math.min(window.innerWidth - 480, window.innerWidth - e.clientX));
    pane.style.width = w + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    const w = parseInt(pane.style.width, 10);
    if (w) localStorage.setItem('ai.codeW', String(w));
  });
})();
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
  renderCodeSeg();

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

  if (files.length > 4) {
    const sel = document.createElement('select');
    sel.id = 'codeFileSel';
    sel.className = 'code-file-sel';
    files.forEach((f, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = f.name;
      if (i === state.fileIdx) o.selected = true;
      sel.append(o);
    });
    sel.addEventListener('change', () => { state.fileIdx = Number(sel.value); renderCode(); });
    tabs.append(sel);
  }
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
  renderCodeSeg();
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

/* 代码面板：源码 / 预览 分段切换 */
function renderCodeSeg() {
  const box = $('#codeSeg');
  if (!box) return;
  const previewing = !$('#codeFrame').hidden;
  box.textContent = '';
  const modes = [['src', '源码'], ['preview', '预览']];
  for (const pair of modes) {
    const key = pair[0];
    const b = el('button', 'seg' + ((key === 'preview') === previewing ? ' on' : ''), pair[1]);
    b.type = 'button';
    b.addEventListener('click', () => {
      const cv = current();
      const file = cv && cv.files && cv.files[state.fileIdx];
      if (!file) return;
      if (key === 'preview') {
        if (!canPreview(file)) { flashHint('只有 .html / .svg 能预览'); return; }
        $('#codeFrame').hidden = false;
        $('#codeArea').hidden = true;
        renderPreview();
      } else {
        $('#codeFrame').hidden = true;
        $('#codeArea').hidden = false;
      }
      renderCodeSeg();
    });
    box.append(b);
  }
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
  showHandoffProgress();
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
    hideHandoffProgress();
  }
});

/* ---------------- 项目 ---------------- */
let editingProject = null;

let draftKnowledge = [];

function renderKnList() {
  const box = $('#projKnList');
  if (!box) return;
  box.textContent = '';
  if (!draftKnowledge.length) { box.append(el('div', 'kn-empty', '还没有资料')); return; }
  draftKnowledge.forEach((k, i) => {
    const row = el('div', 'kn-row');
    row.append(el('span', null, k.name));
    const del = el('button', null, '移除');
    del.type = 'button';
    del.addEventListener('click', () => { draftKnowledge.splice(i, 1); renderKnList(); });
    row.append(del);
    box.append(row);
  });
}

function openProjectDialog(p) {
  editingProject = p;
  $('#projTitle').textContent = p ? '项目指令' : '新建项目';
  $('#projName').value = p ? p.name : '';
  $('#projDesc').value = p ? (p.description || '') : '';
  $('#projIns').value = p ? (p.instructions || '') : '';
  draftKnowledge = (p && Array.isArray(p.knowledge)) ? p.knowledge.map((k) => ({ name: k.name, text: k.text })) : [];
  renderKnList();
  $('#projKnText').value = '';
  $('#projKnName').value = '';
  $('#projDelete').hidden = !p;
  $('#dlgProject').hidden = false;
}

$('#projKnAdd').addEventListener('click', () => {
  const text = $('#projKnText').value.trim();
  if (!text) { flashHint('先粘贴资料内容'); return; }
  const name = $('#projKnName').value.trim() || ('资料 ' + (draftKnowledge.length + 1));
  draftKnowledge.push({ name, text: text.slice(0, 2000) });
  $('#projKnText').value = '';
  $('#projKnName').value = '';
  renderKnList();
});

$('#projCancel').addEventListener('click', () => { $('#dlgProject').hidden = true; });

$('#projSave').addEventListener('click', async () => {
  const name = $('#projName').value.trim() || '未命名项目';
  const instructions = $('#projIns').value;
  const description = $('#projDesc').value.trim();
  const payload = { name, instructions, description, knowledge: draftKnowledge };
  const r = editingProject
    ? await api('/projects/' + editingProject.id, { method: 'PUT', body: payload })
    : await api('/projects', { method: 'POST', body: payload });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { alert(errText(r.status, j)); return; }
  $('#dlgProject').hidden = true;
  await loadProjects();
  renderAll();     // 项目页/侧栏都要刷新，否则新建完看不到卡片
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
$('#cfgTest').addEventListener('click', async () => {
  const out = $('#cfgTestOut');
  if (out) out.textContent = '测试中…';
  const base = ($('#cfgBackend').value || LS.backend).replace(/\/$/, '');
  const t0 = performance.now();
  try {
    const r = await fetch(base + '/health', { headers: { 'x-token': LS.token } });
    const ms = Math.round(performance.now() - t0);
    if (r.ok) { if (out) out.textContent = '通了 · ' + ms + 'ms'; }
    else if (out) out.textContent = 'HTTP ' + r.status + ' · ' + ms + 'ms';
  } catch (e) {
    if (out) out.textContent = '连不上（跨域或地址错）';
  }
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
function closePops(except) {
  pops.forEach(id => { if (id !== except) $('#' + id).hidden = true; });
  const menu = $('#menuBtn'), plus = $('#plusBtn');
  if (menu) menu.setAttribute('aria-expanded', 'false');
  if (plus) plus.setAttribute('aria-expanded', 'false');
}

/** 把面板放在触发元素上方（底部不够就翻到下方），Claude 的模型菜单就是这么弹的 */
function placeAbove(pop, anchor, align) {
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = align === 'left' ? r.left : r.right - w;
  left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
  let top = r.top - h - 8;
  if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - h - 8);
  pop.style.left = left + 'px';
  pop.style.top = Math.max(8, top) + 'px';
}

function openModelMenu() {
  const p = $('#modelPop');
  const anchor = $('#cmModel') || $('#modelBtn');
  closePops();
  placeAbove(p, anchor, 'right');
}

$('#modelBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#modelPop');
  if (!p.hidden) { p.hidden = true; return; }
  openModelMenu();
});
$('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#menuPop'); const h = p.hidden; closePops(); p.hidden = !h; $('#menuBtn').setAttribute('aria-expanded', String(!p.hidden)); });
$('#meBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#userPop'); const h = p.hidden; closePops(); p.hidden = !h; });
$('#plusBtn').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#plusPop'); const h = p.hidden; closePops(); p.hidden = !h; $('#plusBtn').setAttribute('aria-expanded', String(!p.hidden)); });
document.addEventListener('click', () => closePops());

/* 思考强度：点开子菜单（Claude 的二级面板），不再用滑杆 */
$('#popEffRow').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#effPop');
  p.hidden = !p.hidden;
});

$('#moreModels').addEventListener('click', (e) => {
  e.stopPropagation();
  const fly = $('#allPop');
  const open = fly.hidden;
  renderAllModels();
  if (open) {
    const popR = $('#modelPop').getBoundingClientRect();
    const rowR = e.currentTarget.getBoundingClientRect();
    const w = 288;
    fly.style.left = Math.max(8, popR.left - w - 8) + 'px';
    fly.style.top = Math.max(8, Math.min(rowR.top - 46, window.innerHeight - fly.offsetHeight - 8)) + 'px';
  }
  fly.hidden = !open;
});

/* ---- 能力开关：默认不显示，开了才浮在输入框上方 ---- */
const DEFAULT_PH = '今天我能为您做些什么？';
const CAP_DEFS = [
  { k: 'image', icon: '🖼️', label: '画图' },
  { k: 'gif', icon: '🎞️', label: '动图' },
  { k: 'code', icon: '🧑‍💻', label: '编程模式' },
  { k: 'work', icon: '🛠️', label: '工作模式' },
  { k: 'search', icon: '🌐', label: '联网搜索' },
  { k: 'fidelity', icon: '🔍', label: '保真' },
  { k: 'raw', icon: '📷', label: '原图' },
];

function capOn(k) {
  if (k === 'image') return state.imageMode;
  if (k === 'gif') return state.gifMode;
  if (k === 'code') return state.codeMode;
  if (k === 'work') return state.workMode;
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
    b.innerHTML = '<span class="ci">' + ic(CAP_ICON[c.k] || 'image', 14) + '</span>' + c.label + '<span class="x">×</span>';
    b.addEventListener('click', () => setCap(c.k, false));
    if (c.k === 'image' || c.k === 'gif') {
      b.addEventListener('mouseenter', () => showDrawPanel(b));
      b.addEventListener('mouseleave', hideDrawPanelSoon);
    }
    box.append(b);
  }
  $('#plusBtn').classList.toggle('on', active.length > 0);
}

function resetTransientModes() {
  state.search = false;
  state.gifMode = false;
  state.imageMode = false;
  state.codeMode = false;
  state.workMode = false;
  state.fidelity = false;
  state.rawUpload = false;
  input.placeholder = DEFAULT_PH;
  renderCaps();
  try { closeCodePane(); } catch (e) {}
}
function setCap(kind, on) {
  if (kind === 'image') {
    state.imageMode = on;
    input.placeholder = on ? '描述你想生成的画面…（鼠标移到「画图」标签上可调参数）' : DEFAULT_PH;
  } else if (kind === 'gif') {
    state.gifMode = on;
    input.placeholder = on ? '描述动作（挂着图就是让这张图动起来）…' : DEFAULT_PH;
  } else if (kind === 'work') {
    state.workMode = on;
    input.placeholder = on ? '描述要做的事，缺少工具时它会自己造…' : DEFAULT_PH;
    flashHint(on ? '工作模式：可以自己找工具、造工具、生成文件' : '已关闭工作模式');
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

/* 画图参数面板：按生成方式切换内容 */
const GIF_SIZES = [320, 480, 640, 720, 1088];

/** 一行「标签 + 按钮组」 */
function segRow(label, items, current, onPick) {
  const row = el('div', 'seg-row');
  row.append(el('span', 'seg-label', label));
  const seg = el('div', 'seg');
  for (const it of items) {
    const cur = String(current) === String(it.value);
    const b = el('button', 'seg-btn' + (cur ? ' on' : ''), it.label);
    b.type = 'button';
    if (it.disabled) {
      b.disabled = true;
      b.title = it.note || '';
    } else {
      b.addEventListener('click', () => onPick(it.value));
    }
    seg.append(b);
  }
  row.append(seg);
  return row;
}

/** 改一个参数 → 收敛 → 提示 → 重画 */
function applyDraw(patch, changed) {
  const { s, notes } = normalizeDraw(Object.assign({}, LS.draw, patch), changed);
  LS.draw = s;
  if (notes.length) showToast(notes.join('<br>'));
  renderDrawPanel();
}

/** 面板顶部的「画图 / 动图」切换 */
function renderModeSeg() {
  const box = $('#drawModeSeg');
  if (!box) return;
  box.textContent = '';
  const items = [['image', '🖼️ 画图', state.imageMode], ['gif', '🎞️ 动图', state.gifMode]];
  for (const [key, label, on] of items) {
    const b = el('button', 'seg-btn' + (on ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (key === 'gif') {
        setCap('image', false);
        setCap('gif', true);
        LS.draw = Object.assign({}, LS.draw, { format: 'gif' });
      } else {
        setCap('gif', false);
        setCap('image', true);
        if (LS.draw.format === 'gif') LS.draw = Object.assign({}, LS.draw, { format: 'png' });
      }
      renderDrawPanel();
    });
    box.append(b);
  }
}

const DRAW_GROUPS = [
  { key: 'size', label: '尺寸', opts: [['1024x1024', '1024²'], ['1536x1024', '1536×1024'], ['1024x1536', '1024×1536'], ['2880x2880', '2880²'], ['3840x2160', '4K'], ['auto', 'auto']] },
  { key: 'quality', label: '质量', opts: [['auto', 'auto'], ['low', '低'], ['medium', '中'], ['high', '高']] },
  { key: 'complexity', label: '复杂度', opts: [['', '默认'], ['low', '低'], ['medium', '中'], ['high', '高']] },
  { key: 'bg', label: '背景', opts: [['', 'auto'], ['opaque', '不透明'], ['transparent', '透明']] },
  { key: 'n', label: '张数', opts: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['6', '6'], ['10', '10']] },
  { key: 'format', label: '格式', opts: [['png', 'png'], ['webp', 'webp'], ['jpeg', 'jpeg'], ['svg', 'svg']] },
];

/** 当前参数的一句话摘要 + 费用提示（面板底部显示） */
function drawSummary(d) {
  const isGif = d.format === 'gif';
  const parts = [];
  if (isGif) {
    const frames = Math.max(2, Math.min(16, Number(d.frames) || 8));
    const side = (parseSize(d.size) || { w: 720 }).w || 720;
    const maxF = maxFramesForSize(side + 'x' + side);
    parts.push('GIF ' + frames + ' 帧 · 每帧 ' + gifSizeForFrames(frames, d.size).replace('x', '×'));
    if (maxF && maxF < 16) parts.push('这一档最多 ' + maxF + ' 帧');
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
  // 面板打开时先收敛一次：修掉历史遗留的冲突组合（比如 透明 + GIF 同时亮着）
  const fixed = normalizeDraw(LS.draw, 'open');
  if (fixed.notes.length) {
    LS.draw = fixed.s;
    showToast(fixed.notes.join('<br>'));
  }
  renderModeSeg();

  const body = $('#drawPopBody');
  if (!body) return;
  body.textContent = '';

  if (state.gifMode) {
    // ---- 动图面板：只放动图参数 ----
    if (LS.draw.format !== 'gif') LS.draw = Object.assign({}, LS.draw, { format: 'gif' });
    const side = (parseSize(LS.draw.size) || { w: 720 }).w || 720;
    const maxF = maxFramesForSize(side + 'x' + side) || 16;

    body.append(segRow('分辨率', GIF_SIZES.map((n) => ({ value: n, label: n + 'p' })), side, (v) => {
      applyDraw({ size: v + 'x' + v, custom: v + 'x' + v }, 'size');
    }));

    body.append(segRow('帧数', [2, 4, 6, 8, 12, 16].map((n) => ({
      value: n,
      label: String(n),
      disabled: n > maxF,
      note: '该分辨率最多 ' + maxF + ' 帧',
    })), Number(LS.draw.frames), (v) => applyDraw({ frames: v }, 'frames')));

    body.append(segRow('间隔', [60, 100, 150, 200].map((n) => ({ value: n, label: n + 'ms' })), Number(LS.draw.dur) || 150, (v) => applyDraw({ dur: v }, 'dur')));

    body.append(segRow('质量', [['low', '低'], ['medium', '中'], ['high', '高']].map(([v, t]) => ({ value: v, label: t })), LS.draw.quality, (v) => applyDraw({ quality: v }, 'quality')));
  } else {
    // ---- 画图面板 ----
    for (const g of DRAW_GROUPS) {
      const cur = g.key === 'n' ? Number(LS.draw.n) : LS.draw[g.key];
      body.append(segRow(g.label, g.opts.map(([v, t]) => ({ value: v, label: t })), cur, (v) => {
        const patch = {};
        patch[g.key] = g.key === 'n' ? Number(v) : v;
        applyDraw(patch, g.key);
      }));
    }
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


/* ---------------- 建议下一句 ---------------- */
const SUGGEST_MODEL = 'gpt-6.1-terra';
const SUGGEST_EFFORT = 'low';
let suggestReqToken = 0;
let suggestKey = '';
function ensureSuggestsBox() {
  let box = $('#suggests');
  if (box) return box;
  // HTML 可能是旧缓存（没有这个容器）：自己补一个，功能就不会因为缓存静默失效
  const form = $('#composer');
  if (!form || !form.parentElement) return null;
  box = el('div', 'suggests');
  box.id = 'suggests';
  box.hidden = true;
  form.parentElement.insertBefore(box, form);
  return box;
}
function hideSuggests() {
  const box = ensureSuggestsBox();
  if (!box) return;
  box.hidden = true;
  box.textContent = '';
  suggestKey = '';
}
function renderSuggests(items, cv) {
  const box = ensureSuggestsBox();
  if (!box || !items || !items.length) { hideSuggests(); return; }
  box.textContent = '';
  for (const text of items) {
    const b = el('button', 'sg-btn', text);
    b.type = 'button';
    b.title = '点击直接发送';
    b.addEventListener('click', () => {
      hideSuggests();
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      $('#composer').requestSubmit();
    });
    box.append(b);
  }
  const x = el('button', 'sg-x', '✕');
  x.type = 'button';
  x.title = '不看了';
  x.addEventListener('click', hideSuggests);
  box.append(x);
  box.hidden = false;
}
async function maybeSuggest(cv) {
  if (!cv || !cv.messages || cv.messages.length < 2) return;
  if (document.hidden) return;
  const last = cv.messages[cv.messages.length - 1];
  if (!last || last.role === 'user' || last.err) return;
  const key = cv.id + ':' + cv.messages.length;
  if (key === suggestKey) return;
  suggestKey = key;
  const my = ++suggestReqToken;
  try {
    const r = await api('/suggest', { method: 'POST', body: { model: SUGGEST_MODEL, effort: SUGGEST_EFFORT, messages: cv.messages } });
    if (my !== suggestReqToken) return;      // 已经切走/又发了一条
    if (!r.ok) return;
    const j = await r.json().catch(() => ({}));
    if (my !== suggestReqToken) return;
    const items = Array.isArray(j.items) ? j.items : [];
    if (!items.length) return;
    // 不能比对象引用：重新拉取会话后 current() 会换成一个新对象，用 id 比
    const cur = current();
    if (!cur || cur.id !== cv.id || state.streaming) return;
    renderSuggests(items, cur);
  } catch {}
}

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
    if (state.controller) {
      // 先把取消意图写到服务端，再断开流；否则服务端先看到断开会记成 interrupted
      if (state.currentRunId) { try { await cancelRun(state.currentRunId, false); } catch (e) {} }
      state.controller.abort();
      return;
    }
    // 流已经结束、只是在收尾落盘：等它写完再发，别把这条消息吞掉
    if (state.finishPromise) { try { await state.finishPromise; } catch {} }
    if (state.streaming) {
      // 出图/动图没有可中断的流，直接提示，别把输入吞掉
      flashHint('正在生成，稍等下再发；想取消等它结束');
      return;
    }
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

  // 编辑重发：到这一步才真的截断（之前只是把原文放回输入框）
  const ed = state.editing;
  if (ed && ed.convId === state.currentId) {
    const cvNow = current();
    if (cvNow && Array.isArray(cvNow.messages) && cvNow.messages[ed.idx] && cvNow.messages[ed.idx].role === 'user') {
      cvNow.messages.splice(ed.idx, cvNow.messages.length - ed.idx);
      cvNow.cutIndex = null;
      saveConv(cvNow).catch(() => {});
    }
  }
  state.editing = null;

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
function syncSendVisible() {
  const has = !!input.value.trim() || state.attachments.length > 0;
  const box = $('#composer');
  if (box) box.classList.toggle('has-text', has || state.streaming);
}

input.addEventListener('input', () => {
  if (suggestReqToken) { suggestReqToken++; hideSuggests(); }
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 170) + 'px';
  sendBtn.disabled = !input.value.trim() && !state.attachments.length;
  syncSendVisible();
  const cv = current();
  saveDraft(cv ? cv.id : DRAFT_NEW, input.value, state.attachments);
});
syncSendVisible();

scrollBox.addEventListener('scroll', updateToLatest);
$('#toLatest').addEventListener('click', () => { scrollBox.scrollTop = scrollBox.scrollHeight; updateToLatest(); });

for (const sel of ['#micBtn', '#voiceBtn']) {
  const vb = document.querySelector(sel);
  if (vb) vb.addEventListener('click', (e) => { e.stopPropagation(); flashHint('语音功能还在接入中，先用文字吧'); });
}

for (const sel of ['#cmModel']) {
  const btn = document.querySelector(sel);
  if (!btn) continue;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const p = $('#modelPop');
    if (!p.hidden) { p.hidden = true; return; }
    openModelMenu();
  });
}

$('#themeBtn').addEventListener('click', () => {
  const cur = LS.theme;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
  LS.theme = next;
  applyTheme();
  showToast('外观：<b>' + THEME_LABEL[next] + '</b>' + (next === 'auto' ? '（跟随系统，现在是' + (resolvedTheme() === 'light' ? '浅色' : '深色') + '）' : ''));
});

$('#planPill').addEventListener('click', async () => {
  await refreshUsage();
  renderUsageDialog();
  $('#dlgUsage').hidden = false;
});

$('#raAll').addEventListener('click', () => { showFilesPage(); });

$('#usageBar').addEventListener('click', async () => {
  await refreshUsage();
  renderUsageDialog();
  $('#dlgUsage').hidden = false;
});
$('#usageClose').addEventListener('click', () => { $('#dlgUsage').hidden = true; });

$('#uSaveBalance').addEventListener('click', async () => {
  const raw = $('#uBalance').value.trim();
  const bal = Number(raw);
  if (!raw || !Number.isFinite(bal) || bal < 0) { flashHint('填一个数字，例如 92.62'); return; }
  try {
    const r = await api('/usage/allowance', { method: 'POST', body: { balance: bal } });
    if (!r.ok) { flashHint('校准失败（HTTP ' + r.status + '）'); return; }
    $('#uBalance').value = '';
    await refreshUsage();
    renderUsageDialog();
    flashHint('余额已校准为 $' + bal.toFixed(2));
  } catch { flashHint('校准失败，检查网络'); }
});

/* 顶栏标题：点击开会话菜单，双击改名 */
$('#titleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  const pop = $('#menuPop');
  const open = !pop.hidden;
  closePops();
  if (open) return;
  pop.hidden = false;
  pop.style.left = Math.min(Math.max(8, r.left), window.innerWidth - 228) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
});
$('#titleBtn').addEventListener('dblclick', async () => {
  const cv = current();
  if (!cv) return;
  const next = prompt('重命名对话', cv.title || '新对话');
  if (!next) return;
  cv.title = next.slice(0, 60);
  await saveConv(cv);
  renderAll();
});

$('#newChat').addEventListener('click', async () => {
  if (!isActiveModel(LS.model)) {
    const act = visibleModels().filter(isActiveModel);
    const terra = act.find((m) => /terra/i.test(m));
    if (act.length) { LS.model = terra || act[0]; modelPinned = false; persistSettings(); }
  }
  state.currentId = null;
  state.pendingPrivate = false;
  state.editing = null;
  // 在项目页点「新建」时也要切回对话视图，否则页面停在项目页、输入框都看不到
  // 并且这条新对话要落在这个项目里（Claude 的项目内新建也是这样）
  if (state.view === 'project' && state.projectId) state.projectFilter = state.projectId;
  state.view = 'chat';
  // 新对话不继承上一个会话的临时模式：搜索/画图/动图/编程都是「这一句」的开关
  resetTransientModes();
  renderAll();
  closeNav();
  input.focus();
});

$('#brandBtn').addEventListener('click', () => { $('#newChat').click(); });
/** 通用列表面板（项目 / 文件共用） */
let listPanelReturn = null;
function openListPanel(title, sub, rows) {
  listPanelReturn = document.activeElement;
  $('#listTitle').textContent = title;
  $('#listSub').textContent = sub || '';
  const box = $('#listBody');
  box.textContent = '';
  if (!rows.length) box.append(el('div', 'lk-row', '暂时没有内容'));
  for (const r of rows) {
    const row = el('div', 'lk-row');
    const l = el('div');
    l.append(el('div', null, r.label));
    if (r.sub) l.append(el('div', 'sub', r.sub));
    row.append(l);
    if (r.value) row.append(el('b', null, r.value));
    if (typeof r.onClick === 'function') {
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.addEventListener('click', r.onClick);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.onClick(); } });
    }
    box.append(row);
  }
  $('#dlgList').hidden = false;
  const first = box.querySelector('.lk-row[tabindex="0"]') || box.querySelector('.lk-row');
  if (first) { first.tabIndex = 0; first.focus(); }
}

(function listPanelA11y() {
  const panel = document.getElementById('dlgList');
  if (!panel) return;
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      panel.hidden = true;
      if (listPanelReturn && listPanelReturn.focus) { try { listPanelReturn.focus(); } catch (e2) {} }
    }
  });
})();

/** 项目页（Claude 的 claude.ai/projects） */
function renderProjectsPage() {
  const grid = $('#ppGrid');
  if (!grid) return;
  grid.textContent = '';
  const convs = state.convs || [];
  const kw = String(window.__projQuery || '').trim().toLowerCase();
  const projs = (state.projects || [])
    .filter((p) => !kw || String(p.name || '').toLowerCase().includes(kw))
    .map((p) => ({
      p,
      last: Math.max(0, ...convs.filter((c) => c.projectId === p.id).map((c) => c.updatedAt || 0)),
    }))
    .sort((a, b) => b.last - a.last)
    .map((x) => x.p);
  for (const p of projs) {
    const n = convs.filter((c) => c.projectId === p.id).length;
    const card = el('div', 'pp-card');
    const name = el('div', 'n');
    name.append(el('span', 'ico', '📁'), el('span', null, p.name));
    card.append(name);
    card.append(el('div', 'm', n + ' 个对话' + (p.description ? ' · ' + p.description : '')));
    if (p.instructions) card.append(el('div', 'ins', String(p.instructions).slice(0, 120)));
    const acts = el('div', 'acts');
    const edit = el('button', null, '项目指令');
    edit.type = 'button';
    edit.addEventListener('click', (e) => { e.stopPropagation(); openProjectDialog(p); });
    const del = el('button', null, '删除');
    del.type = 'button';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('删除项目「' + p.name + '」？里面的对话会变成未分类，不会删。')) return;
      const r = await api('/projects/' + p.id, { method: 'DELETE' });
      if (!r.ok) { alert('删除失败'); return; }
      await Promise.all([loadProjects(), loadConvs()]);
      renderAll();
    });
    acts.append(edit, del);
    card.append(acts);
    card.addEventListener('click', () => openProject(p.id));
    grid.append(card);
  }
  if (!(state.projects || []).length) {
    const empty = el('div', 'pp-empty');
    empty.innerHTML = '<span class="mark">' + (typeof ICON_PATHS !== 'undefined' ? '' : '') + '</span>';
    const t = el('div', 't', '想开始一个项目？');
    const d = el('div', 'd', '把资料、指令和对话放进同一个项目，每次打开都自带上下文。');
    const b = el('button', null, '新建项目');
    b.type = 'button';
    b.addEventListener('click', () => openProjectDialog(null));
    empty.append(t, d, b);
    grid.append(empty);
  }
}

function showProjectsPage() {
  state.view = 'projects';
  renderAll();
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'ppSearch') {
    window.__projQuery = e.target.value;
    renderProjectsPage();
  }
});

/** 项目：列出全部项目，点一个只看它 */
function showProjects() {
  const convs = state.convs || [];
  const rows = (state.projects || []).map((p) => ({
    label: p.name,
    sub: convs.filter((c) => c.projectId === p.id).length + ' 个对话',
    value: state.projectFilter === p.id ? '筛选中' : '',
    onClick: () => {
      state.projectFilter = state.projectFilter === p.id ? null : p.id;
      $('#dlgList').hidden = true;
      renderAll();
    },
  }));
  rows.unshift({
    label: '全部对话',
    sub: convs.length + ' 个对话',
    value: state.projectFilter ? '' : '当前',
    onClick: () => { state.projectFilter = null; $('#dlgList').hidden = true; renderAll(); },
  });
  rows.push({
    label: '＋ 新建项目',
    sub: '项目可以有自己的指令，进入后自动生效',
    onClick: () => { $('#dlgList').hidden = true; openProjectDialog(null); },
  });
  openListPanel('项目', '点一个项目只看它；侧栏里 ⚙ 改指令，＋ 在项目里新建对话', rows);
}

/* 图片加载失败时不再回退老桶 */
$('#artClose').addEventListener('click', closeArtifactPane);
/* 产物标题按钮：点开菜单（重命名/导出/复制链接/删除），对齐 Claude */
async function renameArtifact() {
  const cv = current();
  if (!cv) return;
  const f = currentArtifactFile();
  if (!f) return;
  const next0 = (prompt('重命名产物', artName) || '').trim();
  if (!next0 || next0 === artName) return;
  // 用户只改名字不写扩展名时保留原扩展名，否则 .html 变「无后缀」→ 类型判断成代码
  const oldExt = (String(artName).match(/\.[A-Za-z0-9]+$/) || [''])[0];
  const hasExt = /\.[A-Za-z0-9]{1,8}$/.test(next0);
  const next = hasExt || !oldExt ? next0 : next0 + oldExt;
  f.name = next;
  artName = next;
  cv.artifact = { kind: artKind, name: next };
  await saveConv(cv);
  renderArtifact();
  $('#artTitle').textContent = next;
}
/* 产物标题下拉菜单（贴着标题展开，对齐 Claude） */
const ART_ICONS = {
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m6 11 6 6 6-6"/><path d="M4 21h16"/></svg>',
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6 4 4H6l4-4-1-6Z"/><path d="M12 13v8"/></svg>',
  install: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="12" height="10" rx="2"/><path d="M15 11h4a2 2 0 0 1 2 2v5"/></svg>',
  pen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16v4Z"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  flag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4h10l-1 4h7l-2 6H9"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>',
};
function closeArtMenu() { const m = $('#artMenu'); if (m) m.hidden = true; }
function buildArtMenu() {
  const menu = $('#artMenu');
  if (!menu) return;
  menu.textContent = '';
  const file = currentArtifactFile();
  const cv = current();
  const at = (file && file.updatedAt) || (cv && cv.updatedAt) || Date.now();
  const ago = Math.max(1, Math.round((Date.now() - at) / 60000));
  const upd = el('div', 'am-note', '更新于 ' + (ago < 60 ? ago + ' 分钟前' : Math.round(ago / 60) + ' 小时前'));
  menu.append(upd);
  const item = (icon, label, onClick, opts) => {
    const o = opts || {};
    const b = el('button', 'am-item' + (o.danger ? ' danger' : '') + (o.disabled ? ' disabled' : ''));
    b.type = 'button';
    b.innerHTML = '<span class="am-ic">' + icon + '</span><span>' + label + '</span>';
    if (o.disabled) b.disabled = true;
    else b.addEventListener('click', () => { closeArtMenu(); onClick(); });
    menu.append(b);
    return b;
  };
  const sep = () => menu.append(el('div', 'am-sep'));
  item(ART_ICONS.link, '复制链接', async () => {
    try { await navigator.clipboard.writeText(location.origin + '/ai/?c=' + encodeURIComponent(state.currentId)); flashHint('链接已复制'); }
    catch (e) { flashHint('复制失败'); }
  });
  item(ART_ICONS.down, '导出', () => $('#artExport').click());
  sep();
  item(ART_ICONS.pin, artKind && isPinned(state.currentId) ? '取消置顶' : '置顶', async () => {
    const c = current();
    if (!c) return;
    togglePin(c.id);
  });
  // 设计类产物可以真的发布成插件；其它类型保持灰态（和 Claude 的 Install artifact 一致）
  if (artKind === 'design') item(ART_ICONS.install, '发布为插件', () => publishDesignArtifact());
  else item(ART_ICONS.install, '安装为插件', () => {}, { disabled: true });
  item(ART_ICONS.pen, '重命名', renameArtifact);
  item(ART_ICONS.copy, '创建副本', async () => {
    const c = current();
    const src = currentArtifactFile();
    if (!c || !src) return;
    const dot = src.name.lastIndexOf('.');
    const copyName = dot > 0 ? src.name.slice(0, dot) + ' 副本' + src.name.slice(dot) : src.name + ' 副本';
    c.files = c.files || [];
    c.files.push({ name: copyName, content: src.content, updatedAt: Date.now() });
    c.artifact = { kind: kindOfFile(copyName), name: copyName };
    await saveConv(c);
    artName = copyName;
    artKind = kindOfFile(copyName);
    $('#artTitle').textContent = copyName;
    renderArtifact();
    flashHint('已创建副本');
  });
  item(ART_ICONS.refresh, '刷新', () => { renderArtifact(); flashHint('已刷新'); });
  item(ART_ICONS.flag, '反馈问题', () => flashHint('已记录，谢谢反馈'));
  sep();
  item(ART_ICONS.trash, '删除', async () => {
    const c = current();
    if (!c) return;
    if (!confirm('删除产物「' + artName + '」？')) return;
    c.files = (c.files || []).filter((x) => x.name !== artName);
    c.artifact = null;
    await saveConv(c);
    closeArtifactPane();
    renderAll();
  }, { danger: true });
}
$('#artTitleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = $('#artMenu');
  if (!menu) return;
  if (!menu.hidden) { menu.hidden = true; return; }
  buildArtMenu();
  menu.hidden = false;
  const btn = $('#artTitleBtn').getBoundingClientRect();
  menu.style.left = Math.round(btn.left) + 'px';
  menu.style.top = Math.round(btn.bottom + 6) + 'px';
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#artMenu') && !e.target.closest('#artTitleBtn')) closeArtMenu();
});
window.addEventListener('message', (e) => {
  const d = e.data;
  if (d && d.dshPreview === 'blocked') flashHint('预览里的链接不会跳转：' + String(d.href).slice(0, 40));
});
// ✦ 让 AI 改：Claude 头部没有这个按钮，能力改为点标题聚焦输入框
$('#cbDownload').addEventListener('click', () => $('#artExport').click());
$('#cbPresent').addEventListener('click', togglePresent);
$('#cbLayout').addEventListener('click', () => {
  const opts = [
    { label: '标准 16:9', run: () => { deckZoom = 100; applyDeckZoom(); } },
    { label: '放大到 125%', run: () => { deckZoom = 125; applyDeckZoom(); } },
    { label: '缩小到 75%', run: () => { deckZoom = 75; applyDeckZoom(); } },
    { label: '适应窗口（100%，居中）', run: () => { deckZoom = 100; applyDeckZoom(); } },
  ];
  openListPanel('幻灯片版式', '缩放只影响右侧画布，不改内容', opts.map((o) => ({ label: o.label, onClick: () => { $('#dlgList').hidden = true; o.run(); } })));
});
$('#cbZoom').addEventListener('click', () => {
  const steps = [50, 75, 100, 125, 150, 200];
  const next = steps[(steps.indexOf(deckZoom) + 1) % steps.length] || 100;
  deckZoom = next;
  applyDeckZoom();
});
$('#artOutputs').addEventListener('click', openOutputs);
$('#artDesignSystem').addEventListener('click', openDesignSystem);
$('#artPublish').addEventListener('click', publishDesignArtifact);
$('#artExport').addEventListener('click', () => {
  const f = currentArtifactFile();
  if (!f) { flashHint('还没有内容'); return; }
  const blob = new Blob([f.content || ''], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = artName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
function toggleArtFull() {
  const pane = $('#artPane');
  if (!pane) return;
  const on = pane.classList.toggle('expanded');
  document.body.classList.toggle('artfull', on);
  $('#artExpand').textContent = on ? '⤡' : '⤢';
  $('#artExpand').title = on ? '退出全屏' : '放大';
}
$('#artExpand').addEventListener('click', toggleArtFull);
/* ---------------- 项目详情（对齐 Claude） ---------------- */
/* 顶栏：项目视图才显示的搜索/收藏 */
$('#topSearch').addEventListener('click', () => { $('#q').focus(); $('#q').select && $('#q').select(); });
$('#topStar').addEventListener('click', async () => {
  const p = (state.projects || []).find((x) => x.id === state.projectId);
  if (!p) return;
  p.pinned = !p.pinned;
  const r = await api('/projects/' + p.id, { method: 'PUT', body: { pinned: !!p.pinned } });
  $('#topStar').textContent = p.pinned ? '★' : '☆';
  flashHint(p.pinned ? '已置顶项目' : '取消置顶');
  renderAll();
});
/* 项目详情页交互 */
$('#pdComposer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#pdInput').value.trim();
  if (!text) return;
  const cv = await createConv({ projectId: state.projectId });
  if (!cv) return;
  $('#pdInput').value = '';
  state.currentId = cv.id;
  state.view = 'chat';
  renderAll();
  input.value = text;
  send();
});
$('#pdInput').addEventListener('input', (e) => {
  const t = e.target;
  t.style.height = 'auto';
  t.style.height = Math.min(160, t.scrollHeight) + 'px';
  $('#pdComposer').classList.toggle('has-text', !!t.value.trim());
});
$('#pdIns').addEventListener('click', () => openProjectDialog((state.projects || []).find((x) => x.id === state.projectId)));
$('#pdFiles').addEventListener('click', () => openProjectDialog((state.projects || []).find((x) => x.id === state.projectId)));
$('#pdMemory').addEventListener('click', () => {
  const p = (state.projects || []).find((x) => x.id === state.projectId);
  if (!p) return;
  const rows = (p.knowledge || []).map((k) => ({ label: k.name || '片段', sub: String(k.text || '').slice(0, 80) }));
  openListPanel('记忆 · ' + p.name, rows.length ? '项目知识库里的内容' : '还没有内容，点「文件 → 添加」加一段', rows);
});

function openProject(id) {
  const p = (state.projects || []).find((x) => x.id === id);
  if (!p) return;
  state.projectId = id;
  state.view = 'project';
  renderAll();
}

/* 项目详情：+ 附件、标题改名、时间用相对量 */
$('#pdPlus').addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.addEventListener('change', async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const cv = await createConv({ projectId: state.projectId });
    if (!cv) return;
    state.currentId = cv.id; state.view = 'chat'; renderAll();
    uploadFile(file);
  });
  inp.click();
});
$('#pdTitle').addEventListener('dblclick', () => {
  const p = (state.projects || []).find((x) => x.id === state.projectId);
  if (p) openProjectDialog(p);
});
function renderProjectDetail() {
  const p = (state.projects || []).find((x) => x.id === state.projectId);
  if (!p) { state.view = 'projects'; renderAll(); return; }
  $('#pdTitle').textContent = p.name;
  $('#titleBtn').textContent = '项目 / ' + p.name;
  $('#pdInput').placeholder = '在 ' + p.name + ' 里新建会话';
  $('#pdInsAct').textContent = p.instructions ? '编辑' : '添加';
  $('#pdFilesAct').textContent = (p.knowledge || []).length ? String((p.knowledge || []).length) : '添加';
  $('#pdModel').textContent = labelOf(LS.model) + ' · ' + (EFFORT_LABEL[LS.effort] || '中等');
  $('#pdPrivate').textContent = p.private === false ? '团队可见' : '私人';

  const list = $('#pdList');
  list.textContent = '';
  const kids = (state.convs || []).filter((c) => c.projectId === p.id && !c.archived)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pinned = kids.filter((c) => isPinned(c.id));
  const rest = kids.filter((c) => !isPinned(c.id));
  const section = (label, arr) => {
    if (!arr.length) return;
    list.append(el('div', 'pd-sec', label));
    for (const cv of arr) {
      const row = el('button', 'pd-item');
      row.type = 'button';
      const t = el('span', 'pd-it', cv.title || '未命名');
      row.append(t);
      const ago = Date.now() - (cv.updatedAt || 0);
      const label = ago < 3600e3 ? Math.max(1, Math.round(ago / 60000)) + ' 分钟前'
        : ago < 86400e3 ? Math.round(ago / 3600e3) + ' 小时前'
        : ago < 7 * 86400e3 ? Math.round(ago / 86400e3) + ' 天前' : when(cv.updatedAt);
      row.append(el('span', 'pd-when', label));
      row.addEventListener('click', () => { state.currentId = cv.id; state.view = 'chat'; applyConvSettings(cv); renderAll(); });
      list.append(row);
    }
  };
  section('已置顶', pinned);
  section('最近', rest);
  if (!kids.length) {
    const empty = el('div', 'pd-empty', '这个项目还没有会话');
    list.append(empty);
  }
}
/* 画布工具条：缩放 / 放映 / 下载（对齐 Claude 底部那排） */
let deckZoom = 100;
let deckPresent = false;

function applyDeckZoom() {
  const pane = $('#artPane');
  if (pane) pane.style.setProperty('--slide-zoom', String(deckZoom / 100));
  const z = $('#cbZoom');
  if (z) z.textContent = deckZoom + '% ⌄';
}

function deckStep(delta) {
  deckZoom = Math.max(50, Math.min(200, deckZoom + delta));
  applyDeckZoom();
}

function togglePresent() {
  deckPresent = !deckPresent;
  const pane = $('#artPane');
  if (pane) pane.classList.toggle('present', deckPresent);
  if (deckPresent && pane && !pane.classList.contains('expanded')) toggleArtFull();
  $('#cbPresent').textContent = deckPresent ? '■' : '▶';
  $('#cbPresent').title = deckPresent ? '退出放映' : '放映';
}
/* 设计系统：配色 / 字体，写进会话，生成时带上 */
const DESIGN_PALETTES = [
  { id: 'warm', name: '暖色（默认）', hint: '#FCFCFB 底 / #c6613f 主色' },
  { id: 'cool', name: '冷色', hint: '浅灰底 / #184f95 主色' },
  { id: 'mono', name: '黑白', hint: '纯白底 / 近黑文字，极简' },
];
const DESIGN_FONTS = [
  { id: 'serif', name: '衬线标题（默认）' },
  { id: 'sans', name: '无衬线' },
];

function openDesignSystem() {
  const cv = current();
  if (!cv) return;
  const ds = cv.design || {};
  const rows = DESIGN_PALETTES.map((p) => ({
    label: (ds.palette === p.id ? '✓ ' : '') + p.name,
    sub: p.hint,
    onClick: async () => { cv.design = { ...(cv.design || {}), palette: p.id }; await saveConv(cv); $('#dlgList').hidden = true; flashHint('配色已设为' + p.name); },
  }));
  rows.push({ label: '— 字体 —', sub: '', onClick: () => {} });
  for (const ft of DESIGN_FONTS) {
    rows.push({ label: (ds.font === ft.id ? '✓ ' : '') + ft.name, sub: '', onClick: async () => { cv.design = { ...(cv.design || {}), font: ft.id }; await saveConv(cv); $('#dlgList').hidden = true; flashHint('字体已设为' + ft.name); } });
  }
  openListPanel('设计系统', '选好后重生成，产物会按这套规范输出', rows);
}

/** 产物面板底部：列出本对话所有产物 */
function openOutputs() {
  const cv = current();
  if (!cv) return;
  const files = cv.files || [];
  if (!files.length) { flashHint('这个对话还没有产物'); return; }
  openListPanel('产物 · ' + (cv.title || '未命名'), '点一个打开右侧面板', files.map((f) => ({
    label: f.name || '未命名',
    sub: (String(f.content || '').length + ' 字符'),
    onClick: () => {
      $('#dlgList').hidden = true;
      const ext = (f.name || '').split('.').pop();
      const kind = /deck\.json$/i.test(f.name || '') ? 'deck' : /\.html?$/i.test(f.name || '') ? 'design' : 'doc';
      openArtifactPane(kind, f.name);
    },
  })));
}
/* ---------------- 产物面板：文档 / 幻灯片 / 设计 ---------------- */
const ART_KINDS = {
  doc: { label: '文档', ext: '.md', tip: '把想法写下来，或者让我来写：直接在左边发一句「写一份……」，我会把内容放进这份文档。' },
  deck: { label: '幻灯片', ext: '.deck.json', tip: '一句话说清主题（比如「给团队讲一下新插件」），我按每页标题 + 要点写成分页。' },
  design: { label: '设计', ext: '.html', tip: '描述你要的页面（比如「一个深色落地页」），我输出可以直接看的 HTML。' },
  code: { label: '代码', ext: '.py', tip: '让我写一个脚本或模块，文件会出现在这里，可以直接改。' },
};

let artKind = 'doc';
let artName = '';

function currentArtifactFile() {
  const cv = current();
  if (!cv) return null;
  const files = cv.files || [];
  const byName = files.find((f) => f && (f.name || '') === artName);
  if (byName) return byName;
  // 名字对不上（改过名 / 旧数据）：按产物类型挑一个
  const ext = (ART_KINDS[artKind] || {}).ext || '.md';
  return files.find((f) => (f.name || '').endsWith(ext)) || files[0] || null;
}

/* 左侧栏宽度：拖右边缘可调，双击复位 */
const SIDE_W_KEY = 'ai.sidew';
function applySideWidth(w) {
  const max = Math.min(460, Math.round(window.innerWidth * 0.42));
  const v = Math.max(220, Math.min(w, max));
  document.documentElement.style.setProperty('--side-w', v + 'px');
  return v;
}
function initSideResizer() {
  const side = document.querySelector('#side');
  if (!side || side.querySelector('.side-resizer')) return;
  const saved = Number(localStorage.getItem(SIDE_W_KEY));
  if (saved) applySideWidth(saved);
  const bar = el('div', 'side-resizer');
  bar.title = '拖动调整侧栏宽度，双击复位';
  side.append(bar);
  let dragging = false, startX = 0, startW = 0;
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = side.getBoundingClientRect().width;
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    document.body.classList.add('side-resizing');
    e.preventDefault();
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applySideWidth(startW + (e.clientX - startX));
  });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('side-resizing');
    try { bar.releasePointerCapture(e.pointerId); } catch (err) {}
    try { localStorage.setItem(SIDE_W_KEY, String(Math.round(side.getBoundingClientRect().width))); } catch (err) {}
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);
  bar.addEventListener('dblclick', () => {
    document.documentElement.style.removeProperty('--side-w');
    try { localStorage.removeItem(SIDE_W_KEY); } catch (err) {}
    flashHint('侧栏宽度已复位');
  });
}
/* 产物面板宽度：拖动左边缘可调，双击复位 */
const ART_W_KEY = 'ai.artw';
function applyArtWidth(w) {
  // 右栏再宽也要给中间的对话留出可读宽度（侧栏宽度 + 360）
  const side = document.body.classList.contains('noside') ? 0 : 288;
  const max = Math.max(360, Math.min(Math.round(window.innerWidth * 0.78), window.innerWidth - side - 420));
  const v = Math.max(320, Math.min(w, max));
  document.body.style.setProperty('--art-w', v + 'px');
  return v;
}
function initArtResizer() {
  const pane = document.querySelector('#artPane');
  if (!pane || pane.querySelector('.art-resizer')) return;
  const saved = Number(localStorage.getItem(ART_W_KEY));
  if (saved) applyArtWidth(saved);
  const bar = el('div', 'art-resizer');
  bar.title = '拖动调整宽度，双击复位';
  pane.prepend(bar);
  let dragging = false, startX = 0, startW = 0;
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = pane.getBoundingClientRect().width;
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add('art-resizing');
    e.preventDefault();
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyArtWidth(startW - (e.clientX - startX));
  });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('art-resizing');
    try { bar.releasePointerCapture(e.pointerId); } catch (err) {}
    const w = Math.round(pane.getBoundingClientRect().width);
    try { localStorage.setItem(ART_W_KEY, String(w)); } catch (err) {}
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);
  bar.addEventListener('dblclick', () => {
    document.body.style.removeProperty('--art-w');
    try { localStorage.removeItem(ART_W_KEY); } catch (err) {}
    flashHint('宽度已复位');
  });
}
function openArtifactPane(kind, name) {
  artKind = kind;
  artName = name || ('未命名' + (ART_KINDS[kind] ? ART_KINDS[kind].ext : '.md'));
  const pane = $('#artPane');
  if (!pane) return;
  pane.hidden = false;
  document.body.classList.add('artopen');
  initArtResizer();
  // 默认宽度（46vw）在窄窗口上会挤掉中间对话：开面板时收一次，保证聊天区至少 420
  const side = document.body.classList.contains('noside') ? 0 : 288;
  const room = window.innerWidth - side - 420;
  if (pane.getBoundingClientRect().width > room) applyArtWidth(room);
  $('#artKind').textContent = ART_KINDS[kind] ? ART_KINDS[kind].label : '产物';
  $('#artPublish').hidden = kind !== 'design';
  const dsBtn = $('#artDesignSystem');
  if (dsBtn) dsBtn.hidden = kind !== 'design';
  $('#artTitle').textContent = artName;
  renderArtifact();
}

function closeArtifactPane() {
  const pane = $('#artPane');
  if (pane) { pane.hidden = true; pane.classList.remove('expanded'); }
  document.body.classList.remove('artopen', 'artfull');
  const btn = $('#artExpand'); if (btn) { btn.textContent = '⤢'; btn.title = '放大'; }
}


/* ---------------- 产物面板：对话内文件切换 ---------------- */
function kindOfFile(name) {
  const n = String(name || '');
  if (/deck\.json$/i.test(n)) return 'deck';
  if (/\.html?$/i.test(n)) return 'design';
  if (/\.(md|markdown|txt)$/i.test(n)) return 'doc';
  return 'code';
}
function closeFileMenu() {
  const m = $('#artFileMenu');
  if (m) m.remove();
}
function toggleFileMenu() {
  if ($('#artFileMenu')) { closeFileMenu(); return; }
  const cv = current();
  if (!cv) return;
  const files = (cv.files || []).slice();
  if (!files.length) { flashHint('这个对话还没有产物'); return; }
  const btn = $('#artFiles');
  const menu = el('div', 'art-file-menu');
  menu.id = 'artFileMenu';
  for (const fl of files) {
    const row = el('button', 'afm-row' + (fl.name === artName ? ' on' : ''));
    row.type = 'button';
    const nm = el('span', 'afm-name', fl.name);
    const sz = el('span', 'afm-size', (String(fl.content || '').length / 1024).toFixed(1) + 'K');
    row.append(nm, sz);
    row.addEventListener('click', () => {
      closeFileMenu();
      openArtifactPane(kindOfFile(fl.name), fl.name);
    });
    menu.append(row);
  }
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.round(Math.min(r.left, window.innerWidth - 350)) + 'px';
  menu.style.top = Math.round(r.bottom + 6) + 'px';
}
$('#artFiles').addEventListener('click', (e) => { e.stopPropagation(); toggleFileMenu(); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('#artFileMenu') && !e.target.closest('#artFiles')) closeFileMenu();
});
function renderArtifact() {
  const body = $('#artBody');
  if (!body) return;
  // 老数据里 .py/.json 可能被标成「文档」：按文件名重新判断，避免渲染器和标签对不上
  if (artName) {
    const guess = kindOfFile(artName);
    if (guess !== artKind) {
      const cv = current();
      if (guess === 'code' || (cv && cv.artifact && cv.artifact.name === artName)) {
        artKind = guess;
        if (cv && cv.artifact) cv.artifact.kind = guess;
        const chip = $('#artKind');
        if (chip && ART_KINDS[guess]) chip.textContent = ART_KINDS[guess].label;
      }
    }
  }
  body.textContent = '';
  // 头部只保留属于当前产物的控件
  if (artKind !== 'design') {
    const stale = document.querySelector('.art-acts .design-tabs');
    if (stale) stale.remove();
  }
  const file = currentArtifactFile();
  const hint = $('#artHint');
  if (hint) hint.textContent = file ? (ART_KINDS[artKind] || {}).label + ' · ' + artName : '';
  const filesBtn = $('#artFiles');
  if (filesBtn) {
    const cvNow = current();
    const n = cvNow ? (cvNow.files || []).length : 0;
    filesBtn.hidden = n <= 1;
    const cnt = $('#artFilesCount');
    if (cnt) cnt.textContent = n + ' 个文件';
  }
  const bar = $('#artBar');
  // 画布工具条只属于幻灯片；文档/设计不显示（避免盖住预览/源码切换）
  if (bar) bar.hidden = !file || artKind !== 'deck';
  if (artKind === 'deck') applyDeckZoom();
  const empty = !file || !String(file.content || '').trim() || (artKind === 'deck' && parseDeck(file).slides.length === 0);
  if (empty) {
    body.append(emptyArtifactState(file));
    if (file && (artKind === 'deck' || artKind === 'design')) {
      const blank = el('button', 'art-start', artKind === 'deck' ? '从空白一页开始' : '从空白页面开始');
      blank.type = 'button';
      blank.addEventListener('click', async () => {
        file.content = artKind === 'deck'
          ? JSON.stringify({ slides: [{ title: '第一页', bullets: ['在这里写要点'] }] }, null, 2)
          : '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新页面</title></head>\n<body style="font:16px/1.7 system-ui;padding:40px">\n  <h1>新页面</h1>\n  <p>从这里开始改。</p>\n</body></html>\n';
        const cv = current();
        if (cv) await saveConv(cv);
        renderArtifact();
      });
      body.querySelector('.art-empty').append(blank);
    }
    if (artKind === 'doc' && file) {
      const start = el('button', 'art-start', '开始写');
      start.type = 'button';
      start.addEventListener('click', () => {
        body.textContent = '';
        docEditPref = true;
        try { localStorage.setItem('ai.docEdit', '1'); } catch {}
        renderDoc(body, file);
        const ta = body.querySelector('.art-md');
        if (ta) ta.focus();
      });
      body.querySelector('.art-empty').append(start);
    }
    return;
  }
  if (artKind === 'deck') renderDeck(body, file);
  else if (artKind === 'design') renderDesign(body, file);
  else if (artKind === 'code') renderCodeFile(body, file);
  else renderDoc(body, file);
}


/** 代码文件：等宽编辑，可直接改并保存 */
function renderCodeFile(body, file) {
  const wrap = el('div', 'art-codefile');
  const head = el('div', 'acf-head');
  head.append(el('span', 'acf-name', file.name));
  const ta = el('textarea', 'acf-ta');
  ta.value = String(file.content || '');
  ta.spellcheck = false;
  let timer = 0;
  ta.addEventListener('input', () => {
    file.content = ta.value;
    clearTimeout(timer);
    timer = setTimeout(() => { const cv = current(); if (cv) saveConv(cv).catch(() => {}); }, 600);
  });
  wrap.append(head, ta);
  body.append(wrap);
}

/** 文档：默认只看渲染结果，需要改的时候再切「编辑」 */
let docEditPref = (() => { try { return localStorage.getItem('ai.docEdit') === '1'; } catch { return false; } })();
function renderDoc(body, file) {
  const wrapBox = el('div', 'doc-wrap');
  const bar = el('div', 'doc-bar');
  const bPrev = el('button', 'doc-tab', '预览');
  const bEdit = el('button', 'doc-tab', '编辑');
  bPrev.type = 'button'; bEdit.type = 'button';
  bar.append(bPrev, bEdit);

  const wrap = el('div', 'art-doc');
  const ta = el('textarea', 'art-md');
  ta.value = file.content || '';
  ta.spellcheck = false;
  const prev = el('div', 'art-preview bd');
  prev.innerHTML = md(file.content || '');
  let timer = 0;
  let docDirty = false;
  ta.addEventListener('input', () => {
    docDirty = true;
    file.content = ta.value;
    clearTimeout(timer);
    timer = setTimeout(() => { prev.innerHTML = md(file.content || ''); hydrateCalcs(prev, null, { readOnly: true }); }, 250);
  });
  ta.addEventListener('blur', () => {
    // 流式期间重渲染会把 textarea 拿掉触发 blur；此时保存会拿旧 rev 撞 409
    if (!docDirty || state.streaming) return;
    docDirty = false;
    const cv = current(); if (cv) saveConv(cv).catch(() => {});
  });

  const apply = (edit) => {
    docEditPref = edit;
    try { localStorage.setItem('ai.docEdit', edit ? '1' : '0'); } catch {}
    wrap.classList.toggle('view-only', !edit);
    bPrev.classList.toggle('on', !edit);
    bEdit.classList.toggle('on', edit);
    if (edit) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  };
  bPrev.addEventListener('click', () => apply(false));
  bEdit.addEventListener('click', () => apply(true));

  wrap.append(ta, prev);
  wrapBox.append(bar, wrap);
  body.append(wrapBox);
  apply(docEditPref);
}

/** 幻灯片：左缩略图 + 右画布；数据是 {slides:[{title,bullets}]} */
function parseDeck(file) {
  try {
    const j = JSON.parse(file.content || '{}');
    if (Array.isArray(j.slides)) return j;
  } catch (e) {}
  return { slides: [] };
}

/** 幻灯片：可编辑（标题/要点/增删页），保存回文件 */
function renderDeck(body, file) {
  const deck = parseDeck(file);
  const wrap = el('div', 'art-deck');
  const rail = el('div', 'deck-rail');
  const stage = el('div', 'deck-stage');
  let curIdx = 0;

  const save = () => {
    file.content = JSON.stringify(deck, null, 2);
    const cv = current();
    if (cv) saveConv(cv).catch(() => {});
    paintRail();
  };

  const paintRail = () => {
    rail.textContent = '';
    deck.slides.forEach((s, i) => {
      const row = el('div', 'deck-thumb-row');
      const th = el('button', 'deck-thumb' + (i === curIdx ? ' on' : ''));
      th.type = 'button';
      th.append(el('span', 'dt-n', String(i + 1)));
      th.append(el('span', 'dt-t', s.title || '（空页）'));
      th.addEventListener('click', () => { curIdx = i; paintRail(); paint(); });
      const del = el('button', 'deck-del', '×');
      del.type = 'button';
      del.title = '删除这一页';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (deck.slides.length <= 1) { flashHint('至少留一页'); return; }
        deck.slides.splice(i, 1);
        curIdx = Math.max(0, Math.min(curIdx, deck.slides.length - 1));
        save(); paint();
      });
      row.append(th, del);
      rail.append(row);
    });
    const add = el('button', 'deck-add', '＋ 新页');
    add.type = 'button';
    add.addEventListener('click', () => {
      deck.slides.push({ title: '新的一页', bullets: ['第一条要点'] });
      curIdx = deck.slides.length - 1;
      save(); paint();
    });
    rail.append(add);
  };

  const paint = () => {
    stage.textContent = '';
    const s = deck.slides[curIdx] || { title: '', bullets: [] };
    const slide = el('div', 'slide');
    const titleEl = el('div', 'slide-title');
    titleEl.contentEditable = 'true';
    titleEl.textContent = s.title || '';
    titleEl.addEventListener('input', () => { s.title = titleEl.textContent; file.content = JSON.stringify(deck, null, 2); });
    titleEl.addEventListener('blur', () => { save(); });
    const ul = el('ul', 'slide-bullets');
    (s.bullets || []).forEach((b, bi) => {
      const li = el('li');
      li.contentEditable = 'true';
      li.textContent = b;
      li.addEventListener('input', () => { s.bullets[bi] = li.textContent; file.content = JSON.stringify(deck, null, 2); });
      li.addEventListener('blur', () => save());
      ul.append(li);
    });
    const addB = el('button', 'slide-addb', '＋ 要点');
    addB.type = 'button';
    addB.addEventListener('click', () => { (s.bullets = s.bullets || []).push('新要点'); save(); paint(); });
    slide.append(titleEl, ul, addB);
    stage.append(slide);
    stage.append(el('div', 'deck-page', (curIdx + 1) + ' / ' + Math.max(1, deck.slides.length)));
  };

  wrap.append(rail, stage);
  body.append(wrap);
  paintRail();
  paint();
}

/** 设计：直接渲染 HTML（沙箱 iframe） */
/** 设计：预览 / 源码 双视图，源码可改 */
function renderDesign(body, file) {
  const wrap = el('div', 'art-design');
  const tabs = el('div', 'design-tabs');
  const bPrev = el('button', 'design-tab on', '预览');
  const bSrc = el('button', 'design-tab', '源码');
  bPrev.type = 'button'; bSrc.type = 'button';
  tabs.append(bPrev, bSrc);

  const frame = document.createElement('iframe');
  frame.className = 'design-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.srcdoc = designDoc(file);

  // 预览里的页面如果自己跳走（meta refresh / location 赋值），沙箱拦不住自跳；
  // 这里盯着 load 次数：第一次是初始 srcdoc，第二次说明它导航了，直接拉回原文
  let frameEscapeGuard = 0;
  frame.addEventListener('load', () => {
    frameEscapeGuard += 1;
    frame.dataset.loads = String(frameEscapeGuard);   // 便于排查
    if (frameEscapeGuard !== 2) return;
    frame.dataset.escaped = '1';
    flashHint('预览页试图跳转，已拉回');
    setTimeout(() => { try { renderArtifact(); } catch (e) {} }, 50);
  });

  const ta = el('textarea', 'design-src');
  ta.value = String(file.content || '');
  ta.spellcheck = false;
  ta.hidden = true;
  let timer = 0;
  ta.addEventListener('input', () => {
    file.content = ta.value;
    clearTimeout(timer);
    timer = setTimeout(() => { frame.srcdoc = designDoc(file); }, 500);
  });
  ta.addEventListener('blur', () => { const cv = current(); if (cv) saveConv(cv).catch(() => {}); });

  bPrev.addEventListener('click', () => {
    bPrev.classList.add('on'); bSrc.classList.remove('on');
    frame.hidden = false; ta.hidden = true;
  });
  bSrc.addEventListener('click', () => {
    bSrc.classList.add('on'); bPrev.classList.remove('on');
    frame.hidden = true; ta.hidden = false; ta.focus();
  });

  // 预览/源码开关放到头部右侧（Claude 的产物头部只有一行）
  const acts = document.querySelector('.art-acts');
  const stale = acts && acts.querySelector('.design-tabs');
  if (stale) stale.remove();
  if (acts) acts.insertBefore(tabs, acts.firstChild);

  wrap.append(frame, ta);
  body.append(wrap);
}

const previewGuardScript = '<script>(function(){' +
  'document.addEventListener("click",function(e){' +
  'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;' +
  'if(!a)return;' +
  'var href=a.getAttribute("href")||"";' +
  'e.preventDefault();' +
  'if(href.charAt(0)==="#"){' +
  'var id=href.slice(1);var t=id?document.getElementById(id):null;' +
  'if(t&&t.scrollIntoView){t.scrollIntoView({behavior:"smooth",block:"start"});}' +
  'else if(!id){window.scrollTo({top:0,behavior:"smooth"});}' +
  'try{history.replaceState(null,"",href);}catch(err){}' +
  '}else{' +
  'try{parent.postMessage({dshPreview:"blocked",href:href},"*");}catch(err){}' +
  '}' +
  '},true);' +
  '})();</script>';

function withPreviewGuard(html) {
  const h = String(html || '');
  if (/<head[^>]*>/i.test(h)) return h.replace(/<head[^>]*>/i, (m) => m + previewGuardScript);
  if (/<html[^>]*>/i.test(h)) return h.replace(/<html[^>]*>/i, (m) => m + previewGuardScript);
  return previewGuardScript + h;
}

function designDoc(file) {
  const raw = String(file.content || '');
  if (!raw.trim()) return '<!doctype html><body style="font:15px system-ui;padding:24px;color:#888">还没有内容——在左边描述你要的页面，我会输出 HTML。</body>';
  return withPreviewGuard(raw);
}
function emptyArtifactState() {
  const box = el('div', 'art-empty');
  const titles = { doc: '把想法变成文档', deck: '一句话变成幻灯片', design: '描述一个页面设计' };
  const subs = {
    doc: '左边直接发一句「写一份……」，内容会落进这份文档；也可以点「开始写」自己动手。',
    deck: '这套幻灯片还没有页面。加一页，或者直接让左边帮你写。',
    design: '左边描述你要的页面（比如「深色落地页，产品是本地 AI 助手」），我输出能直接看的 HTML。',
  };
  box.append(el('div', 'art-empty-t', titles[artKind] || '还没内容'));
  box.append(el('div', 'art-empty-d', subs[artKind] || ''));
  return box;
}
/* ---------------- 清理空内容 ---------------- */
function scanEmpty() {
  const emptyConvs = [];
  const fileClean = [];
  let emptyFileCount = 0;
  for (const cv of state.convs || []) {
    const files = cv.files || [];
    const emptyFiles = files.filter((x) => !String((x && x.content) || '').trim());
    const noMsgs = !(cv.messages || []).length;
    const noRealFiles = files.length === emptyFiles.length;
    if (noMsgs && noRealFiles) { emptyConvs.push(cv); continue; }
    if (emptyFiles.length) { fileClean.push({ cv, keep: files.filter((x) => String((x && x.content) || '').trim()) }); emptyFileCount += emptyFiles.length; }
  }
  return { emptyConvs, fileClean, emptyFileCount };
}

async function cleanEmpty() {
  const { emptyConvs, emptyFileCount } = scanEmpty();
  if (!emptyConvs.length && !emptyFileCount) { flashHint('没有需要清理的空内容'); return; }
  if (!confirm('将删除 ' + emptyConvs.length + ' 个空对话、' + emptyFileCount + ' 个空文件。继续？')) return;
  const r = await api('/clean-empty', { method: 'POST', body: {} });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { flashHint(j.error || '清理失败'); return; }
  await Promise.all([loadConvs(), loadProjects()]);
  renderAll();
  flashHint('已清理 ' + (j.convs || 0) + ' 个空对话、' + (j.files || 0) + ' 个空文件');
}
/* ---------------- 插件库 ---------------- */
let pluginItems = [];

async function loadPlugins() {
  if (pluginItems.length) return pluginItems;
  try {
    const r = await api('/plugins');
    const j = await r.json();
    pluginItems = Array.isArray(j.items) ? j.items : [];
  } catch { pluginItems = []; }
  return pluginItems;
}

async function renderPluginsPage() {
  const grid = $('#plugGrid');
  if (!grid) return;
  grid.textContent = '';
  grid.append(el('div', 'pp-empty', '读取中…'));
  const items = await loadPlugins();
  grid.textContent = '';
  const cnt = $('#plugCount');
  if (cnt) cnt.textContent = items.length ? items.length + ' 个' : '';
  if (!items.length) {
    const e = el('div', 'pp-empty');
    e.append(el('div', 't', '还没有插件'));
    e.append(el('div', 'd', '在对话里让 AI 写一个页面，产物面板里点「发布到插件库」。'));
    grid.append(e);
    return;
  }
  for (const it of items) {
    const card = el('button', 'plug-card');
    card.type = 'button';
    card.append(el('div', 'plug-n', it.name));
    if (it.desc) card.append(el('div', 'plug-d', it.desc));
    const meta = el('div', 'plug-m');
    if (it.author) meta.append(el('span', null, it.author));
    for (const t of (it.tags || [])) meta.append(el('span', 'plug-tag', t));
    card.append(meta);
    card.addEventListener('click', () => openPluginViewer(it));
    grid.append(card);
  }
}

let pluginOrigin = null;
function openPluginViewer(it) {
  $('#plugName').textContent = it.name || it.slug;
  $('#plugOpen').href = it.url;
  $('#plugFrame').src = it.url;
  $('#plugView').hidden = false;
  try { pluginOrigin = new URL(it.url, location.href).origin; } catch (e) { pluginOrigin = null; }
}

/* 插件页 ↔ 宿主：只接受当前插件 iframe 的消息，转发到登记工具 */
window.addEventListener('message', async (e) => {
  if (!pluginOrigin || e.origin !== pluginOrigin) return;
  const frame = document.getElementById('plugFrame');
  if (!frame || e.source !== frame.contentWindow) return;
  const d = e.data || {};
  if (d.type !== 'dsh:call' || !d.id || !d.name) return;
  const reply = (payload) => { try { frame.contentWindow.postMessage({ type: 'dsh:result', id: d.id, ...payload }, pluginOrigin); } catch (e2) {} };
  const tool = (state.tools || []).find((t) => t.name === d.name);
  if (!tool) { reply({ ok: false, error: '没有这个工具：' + d.name }); return; }
  try {
    const r = await api('/tools/' + encodeURIComponent(tool.id) + '/run', { method: 'POST', timeout: 60000, body: { args: d.args || {} } });
    const j = await r.json().catch(() => ({}));
    reply({ ok: !!(r.ok && j.ok), result: j });
  } catch (err) {
    reply({ ok: false, error: String((err && err.message) || err) });
  }
});

async function publishDesignArtifact(opts) {
  const o = opts || {};
  const cv = current();
  const file = cv && (cv.files || []).find((x) => /\.html?$/i.test(x.name || '') && String(x.content || '').trim());
  if (!file) { flashHint('当前对话里没有可发布的 HTML'); return { ok: false, error: '没有 HTML' }; }
  const rawName = (cv.artifact && cv.artifact.name ? cv.artifact.name : file.name || '').replace(/\.[^.]+$/, '');
  let displayName = String(o.name || '').trim() || (cv.title && cv.title !== '新对话' ? cv.title : rawName || '').trim();
  if (!displayName) displayName = (prompt('这个插件叫什么名字？') || '').trim();
  if (!displayName) { flashHint('得先有个名字'); return { ok: false, error: '没有名字' }; }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  let base = norm(o.slug || displayName);
  if (base.length < 2) {
    const typed = (prompt('给这个插件起一个英文标识（小写字母/数字/连字符，例如 my-calculator）', '') || '').trim().toLowerCase();
    base = norm(typed);
    if (base.length < 2) { flashHint('标识不合法，发布会取消'); return { ok: false, error: 'slug 不合法' }; }
  }
  const slug = base;
  flashHint('发布中…');
  const r = await api('/plugins/publish', { method: 'POST', body: {
    slug,
    name: displayName.slice(0, 40),
    desc: String(o.desc || cv.title || displayName).slice(0, 100),
    html: file.content,
  } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { flashHint(j.error || '发布失败'); return { ok: false, error: j.error || '发布失败' }; }
  pluginItems = [];
  flashHint(j.networked ? '已发布（注意：这个插件会联网）' : '已发布：' + j.url);
  try { await navigator.clipboard.writeText(j.url); } catch {}
  return { ok: true, url: j.url, networked: !!j.networked };
}
/* ---------------- 图库 ---------------- */
/** 汇总所有对话里的图片（用户贴的 + 模型生成的），最近的在前 */
function allImages(limit) {
  const out = [];
  for (const c of state.convs || []) {
    for (const m of c.messages || []) {
      for (const u of m.images || []) {
        out.push({ url: u, convId: c.id, convTitle: c.title || '未命名', at: m.ts || c.updatedAt || 0, role: m.role });
      }
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, limit || 200);
}

function renderGallery() {
  const grid = $('#galGrid');
  if (!grid) return;
  grid.textContent = '';
  const items = allImages(200);
  const cnt = $('#galCount');
  if (cnt) cnt.textContent = items.length ? items.length + ' 张' : '';
  if (!items.length) {
    const empty = el('div', 'pp-empty');
    empty.append(el('div', 't', '还没有图片'));
    empty.append(el('div', 'd', '在对话里发图，或用「画图 / 动图」让模型生成，这里会自动汇总。'));
    grid.append(empty);
    return;
  }
  for (const it of items) {
    const b = el('button', 'gal-item');
    b.type = 'button';
    const img = document.createElement('img');
    img.src = fileUrl(it.url);
    img.loading = items.indexOf(it) < 12 ? 'eager' : 'lazy';
    img.alt = it.convTitle;
    b.classList.add('loading');
    img.addEventListener('load', () => b.classList.remove('loading'));
    img.addEventListener('error', () => { b.classList.remove('loading'); b.classList.add('broken'); img.remove(); });
    b.append(img);
    const meta = el('div', 'gal-meta');
    meta.textContent = it.convTitle + ' · ' + when(it.at);
    b.append(meta);
    b.title = it.convTitle;
    b.addEventListener('click', () => openLightbox(it.url, items.map((x) => x.url)));
    grid.append(b);
  }
}


/* ---------------- 工具市场（浏览 / 复制） ---------------- */
async function renderToolsMarket(grid) {
  await loadTools();
  grid.textContent = '';
  const cnt = $('#skCount');
  const list = (state.tools || []).slice().sort((a, b) => (b.uses || 0) - (a.uses || 0));
  if (cnt) cnt.textContent = list.length ? list.length + ' 个工具' : '';
  if (!list.length) {
    grid.append(el('div', 'pp-empty', '还没有工具。在 设置 → 工具 里新建。'));
    return;
  }
  for (const t of list) {
    const card = el('div', 'plug-card sk-card');
    const head = el('div', 'sk-head');
    head.append(el('div', 'plug-n', t.name));
    head.append(el('div', 'com', t.runtime === 'python' ? 'python' : 'node'));
    card.append(head);
    if (t.desc) card.append(el('div', 'plug-d', t.desc));
    const meta = el('div', 'plug-m');
    if (t.params && t.params.length) meta.append(el('span', 'plug-tag', '参数 ' + t.params.join(',')));
    if (t.uses) meta.append(el('span', 'plug-tag', '用过 ' + t.uses));
    if (t.author) meta.append(el('span', null, t.author));
    card.append(meta);
    const acts = el('div', 'sk-acts2');
    if (!t.mine) {
      const clone = el('button', 'set-chip', '复制为我的');
      clone.type = 'button';
      clone.addEventListener('click', async () => {
        const r = await api('/tools/' + encodeURIComponent(t.id) + '/clone', { method: 'POST' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { flashHint(j.error || '复制失败'); return; }
        flashHint('已复制到我的工具（私有）');
        await loadTools();
        renderSkillsPage();
      });
      acts.append(clone);
    } else {
      const use = el('button', 'set-chip', '在设置里编辑');
      use.type = 'button';
      use.addEventListener('click', () => { state.toolEditId = t.id; $('#plusBtn').click(); setTimeout(() => { document.getElementById('setOpenBtn').click(); setTimeout(() => openSettings('tools'), 300); }, 100); });
      acts.append(use);
    }
    card.append(acts);
    grid.append(card);
  }
}

/* ---------------- 技能市场 ---------------- */
function showSkillsPage() {
  state.view = 'skills';
  renderAll();
}
let marketTab = 'skills';
async function renderSkillsPage() {
  const grid = $('#skGrid');
  if (!grid) return;
  for (const b of document.querySelectorAll('#mkTabs .pp-tab')) b.classList.toggle('on', b.dataset.tab === marketTab);
  if (marketTab === 'tools') return renderToolsMarket(grid);
  await loadSkills();
  const stats = await (async () => {
    try { const r = await api('/skills/stats'); return r.ok ? await r.json() : null; } catch (e) { return null; }
  })();
  grid.textContent = '';
  const cnt = $('#skCount');
  if (cnt) cnt.textContent = (state.skills || []).length ? (state.skills || []).length + ' 个' + (stats && stats.totalUses ? ' · 共调用 ' + stats.totalUses + ' 次' : '') : '';
  const list = (state.skills || []).slice().sort((a, b) => (b.uses || 0) - (a.uses || 0));
  if (!list.length) {
    const e = el('div', 'pp-empty');
    e.append(el('div', 't', '还没有技能'));
    e.append(el('div', 'd', '在 设置 → 技能 里新建，或者导入别人给的 JSON。'));
    grid.append(e);
    return;
  }
  for (const s of list) {
    const card = el('div', 'plug-card sk-card');
    const head = el('div', 'sk-head');
    head.append(el('div', 'plug-n', s.name));
    head.append(el('div', 'com', '/' + s.cmd));
    card.append(head);
    if (s.desc) card.append(el('div', 'plug-d', s.desc));
    const meta = el('div', 'plug-m');
    const pl = { search: '联网', image: '画图', gif: '动图', code: '代码', calc: '计算', chart: '图表' };
    for (const k of Object.keys(pl)) if (s.perms && s.perms[k]) meta.append(el('span', 'plug-tag', pl[k]));
    if (s.perms && s.perms.artifact) meta.append(el('span', 'plug-tag', '产物'));
    if (s.perms && Array.isArray(s.perms.tools) && s.perms.tools.length) meta.append(el('span', 'plug-tag', '工具 ' + s.perms.tools.length));
    if (s.uses) meta.append(el('span', 'plug-tag', '用过 ' + s.uses));
    if (s.author) meta.append(el('span', null, s.author));
    card.append(meta);
    const acts = el('div', 'sk-acts2');
    const use = el('button', 'set-chip', '用一次');
    use.type = 'button';
    use.addEventListener('click', () => useSkill(s));
    acts.append(use);
    if (s.mine) {
      const ed = el('button', 'set-chip', '编辑');
      ed.type = 'button';
      ed.addEventListener('click', () => {
        state.editSkillId = s.id;
        $('#plusBtn').click();
        setTimeout(() => { document.getElementById('setOpenBtn').click(); setTimeout(() => openSettings('skills'), 300); }, 100);
      });
      const del = el('button', 'set-chip', '删除');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm('删除技能「' + s.name + '」？')) return;
        const r = await api('/skills/' + encodeURIComponent(s.id), { method: 'DELETE' });
        if (r.ok) { flashHint('已删除'); renderSkillsPage(); }
      });
      acts.append(ed, del);
    }
    card.append(acts);
    grid.append(card);
  }
}

function showGalleryPage() {
  state.view = 'images';
  renderAll();
}
/* ---------------- 分享 ---------------- */
$('#shareBtn').addEventListener('click', () => { closePops(); shareCurrent(); });
$('#fpTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.pp-tab');
  if (!b) return;
  fpTab = b.dataset.tab;
  renderFilesPage();
});
async function shareCurrent() {
  const cv = current();
  if (!cv) return;
  const daysRaw = prompt('链接有效期（天，留空 = 永久）', '');
  if (daysRaw === null) return;
  const days = Math.max(0, Math.min(365, Number(daysRaw) || 0));
  const r = await api('/share', { method: 'POST', body: { convId: cv.id, expiresInDays: days || undefined } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { flashHint(j.error || '分享失败'); return; }
  try { await navigator.clipboard.writeText(j.url); } catch {}
  openListPanel('分享链接', '链接已复制，直接粘到飞书/微信里会自动显示对话标题', [
    { label: j.url, sub: '点一下再复制一次', onClick: async () => { try { await navigator.clipboard.writeText(j.url); flashHint('已复制'); } catch {} } },
    { label: '撤销分享', sub: '撤销后这个链接立刻失效', onClick: async () => {
      const d = await api('/share/' + j.token, { method: 'DELETE' });
      $('#dlgList').hidden = true;
      flashHint(d.ok ? '已撤销分享' : '撤销失败');
    } },
  ]);
}

/** 文件页的三个 tab + 做点新的 */
let fpTab = 'all';
function renderFpTabs() {
  const box = $('#fpTabs');
  if (!box) return;
  for (const b of box.querySelectorAll('.pp-tab')) b.classList.toggle('on', b.dataset.tab === fpTab);
}

function renderMakeNew() {
  const box = $('#mnCards');
  if (!box) return;
  if (box.dataset.built) return;
  box.dataset.built = '1';
  const kinds = [
    ['文档', '▤', '写一份结构清晰的文档，包含标题、要点和结论。'],
    ['幻灯片', '▣', '帮我做一套幻灯片：先给每页标题和要点，再用 ```file:slides.html 输出一个可以翻页的 HTML 版本。'],
    ['设计', '✧', '做一个页面设计稿：用 ```file:design.html 输出完整 HTML + CSS，风格参考 Claude 的暖色调。'],
  ];
  for (const [name, ico, promptText] of kinds) {
    const b = el('button', 'mn-card mn-' + name);
    b.type = 'button';
    b.append(el('div', 'mn-ico', ico));
    b.append(el('div', 'mn-name', name));
    b.addEventListener('click', async () => {
      state.view = 'chat';
      const cv = await createConv();
      if (!cv) return;
      const kind = name === '文档' ? 'doc' : name === '幻灯片' ? 'deck' : 'design';
      const meta = ART_KINDS[kind];
      const fname = '未命名' + meta.ext;
      cv.files = cv.files || [];
      cv.files.push({ name: fname, content: kind === 'deck' ? '{"slides":[]}' : '', updatedAt: Date.now() });
      cv.artifact = { kind, name: fname };
      cv.codeMode = true;
      await saveConv(cv);
      openArtifactPane(kind, fname);
      input.value = promptText;
      input.focus();
      renderAll();
      flashHint('左边写需求，右边就是 ' + meta.label);
    });
    box.append(b);
  }
}

async function renderSharedInto(grid) {
  const r = await api('/shares');
  const j = await r.json().catch(() => ({}));
  const items = (j.sharedWithMe || []).concat(j.mine || []);
  if (!items.length) {
    const empty = el('div', 'pp-empty');
    empty.append(el('div', 't', '还没有分享'));
    empty.append(el('div', 'd', '在会话菜单里点「分享链接」，把链接发给别人即可。'));
    grid.append(empty);
    return;
  }
  for (const it of items) {
    const card = el('button', 'pp-card');
    card.type = 'button';
    const n = el('div', 'n');
    n.append(el('span', 'ftype', it.by === LS.name ? '我' : '他'));
    n.append(el('span', null, it.title));
    card.append(n);
    card.append(el('div', 'm', it.by + ' · ' + when(it.at) + ' · ' + it.messages + ' 条'));
    card.addEventListener('click', () => window.open(base() + '/s/' + it.token, '_blank'));
    grid.append(card);
  }
}
/** 文件页（Claude 的 Artifacts 页） */
function renderFilesPage() {
  const grid = $('#fpGrid');
  if (!grid) return;
  renderFpTabs();
  renderMakeNew();
  grid.textContent = '';
  if (fpTab === 'shared') { renderSharedInto(grid); return; }
  let items = recentArtifacts(60);
  // 「我生成的」：产物都在自己的对话里，不按作者过滤（没有记录作者字段）
  if (fpTab === 'mine') items = items.slice();
  if (!items.length) {
    const empty = el('div', 'pp-empty');
    empty.append(el('div', 't', '还没有产物'));
    empty.append(el('div', 'd', '在编程模式里让模型写文件，或让它生成 HTML 页面，这里就会出现。'));
    grid.append(empty);
    return;
  }
  for (const it of items) {
    const card = el('button', 'pp-card');
    card.type = 'button';
    const prev = artifactPreview(it);
    prev.classList.add('prev');
    card.append(prev);
    const n = el('div', 'n');
    n.append(el('span', 'ftype', /\.html?$/i.test(it.name) ? '</>' : /.(png|jpe?g|gif|svg)$/i.test(it.name) ? 'IMG' : 'FILE'));
    n.append(el('span', null, it.name));
    card.append(n);
    card.append(el('div', 'm', it.convTitle + ' · ' + when(it.at)));
    card.addEventListener('click', () => openArtifact(it));
    grid.append(card);
  }
}

function showFilesPage() {
  state.view = 'files';
  renderAll();
}

/** 文件：列出所有会话里的产物，点一个直接打开 */
function showFiles() {
  const items = recentArtifacts(50);
  const rows = items.map((it) => ({
    label: it.name,
    sub: it.convTitle + ' · ' + when(it.at),
    onClick: () => { $('#dlgList').hidden = true; openArtifact(it); },
  }));
  openListPanel('文件', '编程模式产生的文件，按最近排序', rows);
}

$('#navProjects').addEventListener('click', showProjectsPage);
$('#ppNew').addEventListener('click', () => openProjectDialog(null));
$('#navFiles').addEventListener('click', showFilesPage);
$('#navGallery').addEventListener('click', showGalleryPage);
$('#navSkills').addEventListener('click', () => { state.view = 'skills'; renderAll(); });
$('#navPlugins').addEventListener('click', () => { state.view = 'plugins'; renderAll(); });
document.getElementById('mkTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.pp-tab');
  if (!b) return;
  marketTab = b.dataset.tab;
  renderSkillsPage();
});
$('#plugClose').addEventListener('click', () => { $('#plugView').hidden = true; $('#plugFrame').src = 'about:blank'; });
$('#navPrefs').addEventListener('click', () => { openInstructions(); });
$('#listClose').addEventListener('click', () => { $('#dlgList').hidden = true; });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    openFind();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if ($('#dlgPal').hidden) openPalette(); else closePalette();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
    e.preventDefault();
    $('#newChat').click();
    return;
  }
  if (e.key === 'Escape') {
    if (!$('#findBar').hidden) { closeFind(); return; }
    if (!$('#dlgPal').hidden) { closePalette(); return; }
    const openDlg = [...document.querySelectorAll('.overlay')].find((o) => !o.hidden && o.id !== 'dlgLogin');
    if (openDlg) { openDlg.hidden = true; return; }
    if (document.body.classList.contains('artfull')) { toggleArtFull(); return; }
  if (document.body.classList.contains('coding') && !$('#codepane').hidden) { setCap('code', false); return; }
    closePops();
  }
});

$('#newMore').addEventListener('click', (e) => {
  e.stopPropagation();
  const p = $('#newPop');
  const h = p.hidden;
  closePops();
  p.hidden = !h;
});

$('#newPrivate2').addEventListener('click', async () => {
  closePops();
  state.currentId = null;
  state.pendingPrivate = true;
  renderAll();
  closeNav();
  input.focus();
});

$('#newProject2').addEventListener('click', () => {
  closePops();
  openProjectDialog(null);
});
$('#newPrivateBtn').addEventListener('click', async () => { closePops(); state.currentId = null; state.pendingPrivate = true; renderAll(); input.focus(); });
$('#moveProjectBtn').addEventListener('click', () => {
  const cv = current();
  closePops();
  if (!cv) return;
  const rows = (state.projects || []).map((p) => ({
    label: p.name,
    sub: '点一下把当前对话移进去',
    onClick: async () => {
      cv.projectId = p.id;
      await saveConv(cv);
      $('#dlgList').hidden = true;
      renderAll();
      flashHint('已移到「' + p.name + '」');
    },
  }));
  rows.unshift({ label: '移出项目（未分类）', sub: '', onClick: async () => { cv.projectId = null; await saveConv(cv); $('#dlgList').hidden = true; renderAll(); } });
  openListPanel('移到项目', '项目内的对话会带上项目指令', rows);
});
$('#pinBtn').addEventListener('click', () => {
  const cv = current();
  closePops();
  if (!cv) return;
  togglePin(cv.id);
  renderAll();
});

$('#exportMdBtn').addEventListener('click', () => { closePops(); exportConvMarkdown(); });

$('#archiveBtn').addEventListener('click', async () => {
  const cv = current();
  closePops();
  if (!cv) return;
  cv.archived = !cv.archived;
  await saveConv(cv);
  renderAll();
});

$('#deleteBtn').addEventListener('click', async () => {
  const cv = current();
  closePops();
  if (!cv) return;
  if (!confirm('删除对话「' + (cv.title || '新对话') + '」？删除后无法恢复。')) return;
  const r = await api('/convs/' + cv.id, { method: 'DELETE' });
  if (!r.ok) { alert('删除失败'); return; }
  state.convs = state.convs.filter((x) => x.id !== cv.id);
  state.currentId = (state.convs[0] || {}).id || null;
  renderAll();
});

$('#newProjectBtn').addEventListener('click', () => { closePops(); openProjectDialog(null); });
$('#insBtn').addEventListener('click', () => { closePops(); openSettings('ins'); });
$('#usersBtn').addEventListener('click', () => { closePops(); openSettings('users'); });
for (const sel of ['#setOpenTheme']) {
  const b = document.querySelector(sel);
  if (b) b.addEventListener('click', () => openSettings('appearance'));
}
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

for (const sel of ['#setOpenBtn']) {
  const b = document.querySelector(sel);
  if (b) b.addEventListener('click', () => { closePops(); openSettings('appearance'); });
}

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
function labelNavRows() {
  const map = [['#navProjects', '项目'], ['#navFiles', '文件'], ['#navPrefs', '自定义']];
  for (const pair of map) {
    const el2 = document.querySelector(pair[0]);
    if (el2) el2.title = pair[1];
  }
  const nb = document.querySelector('#newChat');
  if (nb) nb.title = '新建对话（Ctrl+Shift+O）';
}
/* 移动端：在侧栏上左滑关闭抽屉 */
let swipeStartX = null;
const sideEl = $('#side');
sideEl.addEventListener('touchstart', (e) => {
  if (!document.body.classList.contains('nav')) return;
  swipeStartX = e.touches[0].clientX;
}, { passive: true });
sideEl.addEventListener('touchmove', (e) => {
  if (swipeStartX === null) return;
  const dx = e.touches[0].clientX - swipeStartX;
  if (dx < -60) { closeNav(); swipeStartX = null; }
}, { passive: true });
sideEl.addEventListener('touchend', () => { swipeStartX = null; }, { passive: true });
function closeNav() { document.body.classList.remove('nav'); }

/* 侧栏收起 / 展开（桌面端，状态记在本机） */
function applySide() {
  const open = LS.side;
  document.body.classList.toggle('noside', !open);
  labelNavRows();
  const b = $('#sideToggle');
  b.textContent = open ? '«' : '»';
  b.title = open ? '收起侧栏' : '展开侧栏';

  const narrow = window.matchMedia('(max-width:820px)').matches;
  const c = $('#sideCollapse');
  if (c) {
    c.textContent = narrow ? '×' : (open ? '«' : '»');
    c.title = narrow ? '关闭侧栏' : (open ? '收起侧栏' : '展开侧栏');
  }
}

$('#sideToggle').addEventListener('click', () => {
  LS.side = true;
  applySide();
});

/* 侧栏内的收起按钮：窄屏关抽屉，宽屏收起整列 */
$('#sideCollapse').addEventListener('click', () => {
  if (window.matchMedia('(max-width:820px)').matches) { closeNav(); return; }
  // 收起态下点它就是展开回来
  LS.side = !LS.side;
  applySide();
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
    // 缓存只有元信息：打上标记，避免它被当成完整会话保存回去
    state.convs = cached.map(c => ({ ...c, messages: [], files: [], __cacheOnly: true }));
    state.currentId = state.convs[0].id;
    renderAll();
  }

  await Promise.all([loadProjects(), loadConvs(), loadSkills(), loadTools(), loadRuns()]);
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

/** Claude 式欢迎语：又开工了，{名字} */
function renderGreeting() {
  const el = $('#greetText');
  if (!el) return;
  el.textContent = LS.name ? '又开工了，' + LS.name : '今天想聊点什么？';
}

/** 空态时把输入框移进欢迎语块（Claude 首页是居中一体，不是钉在底部） */
const composerBlockEl = document.querySelector('#composerBlock');
function layoutHomeComposer() {
  const emptyBox = $('#empty');
  const mainBox = $('#main');
  if (!composerBlockEl || !emptyBox || !mainBox) return;
  const cv = current();
  const isEmpty = !cv || !(cv.messages || []).length;
  const inEmpty = composerBlockEl.parentElement === emptyBox;
  if (isEmpty && !inEmpty) {
    emptyBox.append(composerBlockEl);
    const art = $('#recentArt');
    if (art) emptyBox.append(art);   // 产物放在输入框下方（Claude 的位置）
    emptyBox.classList.add('with-composer');
  } else if (!isEmpty && inEmpty) {
    mainBox.insertBefore(composerBlockEl, document.querySelector('.meter'));
    emptyBox.classList.remove('with-composer');
  }
}

/* 会话同步：抽成幂等的 start/stop，登录后立即启动，退出停止 */
let syncTimer = null;
async function ensureFreshConv(cv) {
  if (!cv || !cv.__stale) return cv;
  try {
    const r = await api('/convs/' + encodeURIComponent(cv.id));
    if (r.ok) {
      const j = await r.json();
      if (j.conversation) {
        const idx = state.convs.findIndex((c) => c.id === cv.id);
        if (idx >= 0) state.convs[idx] = j.conversation;
        return j.conversation;
      }
    }
  } catch (e) {}
  delete cv.__stale;
  return cv;
}

const pendingSaves = new Map();
let syncOffline = false;
let syncFails = 0;
let syncRetryAt = 0;
async function loadConvsMeta() {
  if (Date.now() < syncRetryAt) return false;
  let r;
  try { r = await api('/convs?meta=1'); } catch (e) { syncFails += 1; syncOffline = true; syncRetryAt = Date.now() + Math.min(8000, 1500 * syncFails); return false; }
  if (!r.ok) { syncFails += 1; syncOffline = true; syncRetryAt = Date.now() + Math.min(8000, 1500 * syncFails); return false; }
  if (syncOffline) { syncOffline = false; syncFails = 0; setTimeout(() => { forceSyncNow().catch(() => {}); }, 50); }
  const j = await r.json().catch(() => null);
  if (!j) return false;
  const list = Array.isArray(j.conversations) ? j.conversations : [];
  const before = new Map(state.convs.map((c) => [c.id, c]));
  const curId = state.currentId;
  let changed = false;
  const next = list.map((s) => {
    const old = before.get(s.id);
    if (!old) { changed = true; return { ...s, messages: [], files: s.files || [] }; }
    const revChanged = Number(s.rev || 0) !== Number(old.rev || 0);
    const merged = { ...old, ...s, messages: old.messages || [], files: s.files && s.files.length ? s.files : (old.files || []) };
    if (revChanged) { merged.__stale = true; changed = true; }
    return merged;
  });
  if (next.length !== state.convs.length) changed = true;
  state.convs = next;
  const cur = next.find((c) => c.id === curId);
  if (cur && cur.__stale) {
    const fresh = await ensureFreshConv(cur);
    if (fresh) { delete fresh.__stale; changed = true; }
  }
  return changed;
}

let syncChannel = null;
try {
  if (typeof BroadcastChannel === 'function') {
    syncChannel = new BroadcastChannel('ai-sync');
    syncChannel.onmessage = () => {
      if (state.streaming || state.saving) return;
      loadConvsMeta().then((changed) => { if (changed) renderAll(); }).catch(() => {});
    };
  }
} catch (e) {}
function pingTabs() { try { if (syncChannel) syncChannel.postMessage({ t: 'conv', at: Date.now() }); } catch (e) {} }

async function flushPendingSaves() {
  for (const [id, conv] of [...pendingSaves.entries()]) {
    try { const r = await saveConv(conv); if (r && r.ok) pendingSaves.delete(id); } catch (e) {}
  }
}
async function forceSyncNow() {
  if (!LS.token) return;
  syncRetryAt = 0;
  try { await loadConvs(); } catch (e) {}
  try { await loadConvsMeta(); } catch (e) {}
  await flushPendingSaves();
  renderAll();
  loadRuns();
}
window.addEventListener('online', () => { flashHint('网络已恢复，正在同步…'); forceSyncNow().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) forceSyncNow().catch(() => {}); });

function startSync() {
  if (syncTimer) return;
  let tick = 0;
  syncTimer = setInterval(async () => {
    if (state.streaming || state.saving || !LS.token) return;
    tick += 1;
    if (tick % 6 === 0) {
      const before = state.convs.map(c => c.id + c.updatedAt).join('|');
      await loadConvs();
      const after = state.convs.map(c => c.id + c.updatedAt).join('|');
      if (before !== after) renderAll();
      loadRuns();
      return;
    }
    const changed = await loadConvsMeta();
    if (changed) { renderAll(); loadRuns(); }
  }, 1200);
}
function stopSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
}

async function boot() {
  document.querySelectorAll('.overlay').forEach((o) => {
    if (!o.getAttribute('role') && o.id !== 'dlgLogin') { o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); }
  });
  initTheme();
  clearLegacyKeys();
  decorateIcons();
  // 登录页复用品牌标记
  const mk = document.querySelector('.greet .mark svg');
  if (mk) {
    const lm = $('#loginMark');
    if (lm) lm.innerHTML = mk.outerHTML;
    const art = $('#loginArt');
    if (art && !art.firstChild) {
      const big = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      big.setAttribute('viewBox', mk.getAttribute('viewBox') || '0 0 24 24');
      big.setAttribute('class', 'big-mark');
      big.setAttribute('fill', 'currentColor');
      const path = mk.querySelector('path');
      if (path) { const np = path.cloneNode(true); big.append(np); }
      art.append(big);
    }
  }
  renderGreeting();
  renderIdentity();
  renderModels();
  renderCaps();
  applySide();
  if (!LS.token) { showLogin(''); return; }
  const me = await api('/me').catch(() => null);
  if (!me || !me.ok) { LS.token = ''; showLogin(''); return; }
  const who = await me.json();
  LS.name = who.name; LS.role = who.role;
  renderGreeting();
  renderIdentity(); renderModels();
  await bootData();
  input.focus();
  startSync();
}

boot();
initSideResizer();
// 面板可能在启动时就是打开的（有产物），补一次初始化
setTimeout(initArtResizer, 300);


const FEATURES_FB = { feedback: false, readAloud: false };
/* 代码块复制（事件委托，流式重绘也能用） */
document.addEventListener('click', async (e) => {
  const btn = e.target && e.target.closest && e.target.closest('.pre-copy');
  if (!btn) return;
  const raw = btn.getAttribute('data-code') || '';
  let text = '';
  try { text = decodeURIComponent(raw); } catch (err) { text = raw; }
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = '复制'; }, 1200);
  } catch (err) {
    flashHint('复制失败');
  }
});





/* ---------------- 项目选择器：对齐 Claude 的 Project 菜单 ---------------- */
let projPickEl = null;
let projPickOnlyPinned = false;
let projPickIdx = -1;

function closeProjectPicker() {
  if (!projPickEl) return;
  projPickEl.remove();
  projPickEl = null;
  projPickIdx = -1;
}

function openProjectPicker(anchor) {
  const cv = current();
  if (!cv || !anchor) return;
  closeProjectPicker();

  const pop = el('div', 'proj-pick');
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', '选择项目');

  const searchRow = el('div', 'pp-search');
  const searchIco = el('span', 'pp-ico');
  searchIco.innerHTML = ic('search', 15);
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = '搜索项目';
  input.setAttribute('aria-label', '搜索项目');
  input.autocomplete = 'off';
  const filterBtn = el('button', 'pp-filter');
  filterBtn.type = 'button';
  filterBtn.title = '只看置顶';
  filterBtn.setAttribute('aria-pressed', 'false');
  filterBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>';
  searchRow.append(searchIco, input, filterBtn);

  const body = el('div', 'pp-body');
  const foot = el('div', 'pp-foot');
  const newRow = el('button', 'pp-row pp-new');
  newRow.type = 'button';
  newRow.innerHTML = ic('plus', 16) + '<span>新建项目</span>';
  newRow.addEventListener('click', () => { closeProjectPicker(); openProjectDialog(null); });
  foot.append(newRow);

  pop.append(searchRow, body, foot);
  document.body.append(pop);

  const assign = async (pid, name) => {
    cv.projectId = pid;
    closeProjectPicker();
    try { await saveConv(cv); } catch (e) {}
    renderAll();
    updateComposerMeta();
    flashHint(pid ? '已归到「' + name + '」' : '已移出项目');
  };

  const mkRow = (p) => {
    const row = el('button', 'pp-row');
    row.type = 'button';
    row.setAttribute('role', 'menuitem');
    const ico = el('span', 'pp-ico');
    ico.innerHTML = ic('folder', 16);
    const name = el('span', 'pp-name', p.name || '未命名项目');
    row.append(ico, name);
    if (cv.projectId === p.id) row.append(el('span', 'pp-check', '✓'));
    row.addEventListener('click', () => assign(p.id, p.name || '未命名项目'));
    return row;
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const hit = (p) => !q || String(p.name || '').toLowerCase().includes(q);
    const pinned = (state.projects || []).filter((p) => p.pinned && hit(p));
    const rest = projPickOnlyPinned ? [] : (state.projects || []).filter((p) => !p.pinned && hit(p));
    body.textContent = '';
    if (cv.projectId) {
      const out = el('button', 'pp-row pp-out');
      out.type = 'button';
      out.innerHTML = '<span class="pp-ico">' + ic('file', 16) + '</span><span class="pp-name">不属于任何项目</span>';
      out.addEventListener('click', () => assign(null, ''));
      body.append(out, el('div', 'pp-sep'));
    }
    if (pinned.length) {
      body.append(el('div', 'pp-label', '已置顶'));
      for (const p of pinned) body.append(mkRow(p));
    }
    if (rest.length) {
      if (pinned.length) body.append(el('div', 'pp-sep'));
      body.append(el('div', 'pp-label', '项目'));
      for (const p of rest) body.append(mkRow(p));
    }
    if (!pinned.length && !rest.length) {
      const msg = !(state.projects || []).length ? '还没有项目' : (projPickOnlyPinned ? '没有置顶的项目' : '没有匹配的项目');
      body.append(el('div', 'pp-empty', msg));
    }
    projPickIdx = -1;
  };

  const rows = () => [...pop.querySelectorAll('.pp-row')];
  const highlight = (i) => {
    const list = rows();
    if (!list.length) return;
    projPickIdx = (i + list.length) % list.length;
    list.forEach((r, k) => r.classList.toggle('hl', k === projPickIdx));
    list[projPickIdx].scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', render);
  filterBtn.addEventListener('click', () => {
    projPickOnlyPinned = !projPickOnlyPinned;
    filterBtn.classList.toggle('on', projPickOnlyPinned);
    filterBtn.setAttribute('aria-pressed', String(projPickOnlyPinned));
    render();
    input.focus();
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeProjectPicker(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(projPickIdx + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); highlight(projPickIdx - 1); return; }
    if (e.key === 'Enter') {
      const list = rows();
      const target = list[projPickIdx >= 0 ? projPickIdx : 0];
      if (target) { e.preventDefault(); target.click(); }
    }
  });

  render();
  const r = anchor.getBoundingClientRect();
  const w = 280;
  pop.style.width = w + 'px';
  const h = pop.offsetHeight;
  const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  const outside = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closeProjectPicker();
  };
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  const obs = new MutationObserver(() => {
    if (!document.body.contains(pop)) {
      document.removeEventListener('mousedown', outside, true);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });

  projPickEl = pop;
  setTimeout(() => input.focus(), 0);
}

$('#metaProject').addEventListener('click', (e) => {
  e.stopPropagation();
  if (projPickEl) { closeProjectPicker(); return; }
  openProjectPicker(e.currentTarget);
});

$('#docBtn').addEventListener('click', () => {
  const cv = current();
  if (!cv) return;
  if (!cv.artifact) cv.artifact = { kind: 'doc', name: '文档.md' };
  openArtifactPane(cv.artifact.kind, cv.artifact.name);
  flashHint(cv.artifact.kind === 'doc' ? '这次回复会写进右侧文档' : '已打开右侧产物');
  input.focus();
});

/* ---------------- 斜杠技能：Claude 风格命令面板 ---------------- */
const SLASH_ICON = {
  clip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg>',
  slides: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 22h8"/><path d="m10 8 4 2-4 2z"/></svg>',
  design: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="10" cy="6.5" r=".8"/><circle cx="15" cy="6.5" r=".8"/><circle cx="17.5" cy="10" r=".8"/></svg>',
  skill: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>',
};

const SLASH_ITEMS = [
  { group: 'add', label: '添加文件', en: 'Add files', icon: 'clip', run: 'files', detail: '上传图片或文件作为参考。' },
  { group: 'add', label: '文档', en: 'Doc', icon: 'doc', run: 'doc', detail: '新建一份 Markdown 文档产物，之后写的内容会进右栏。' },
  { group: 'add', label: '幻灯片', en: 'Slides', icon: 'slides', run: 'deck', detail: '新建一套幻灯片产物，按页写标题和要点。' },
  { group: 'add', label: '设计', en: 'Design', icon: 'design', run: 'design', detail: '新建一个 HTML 设计产物，直接预览页面。' },
  { group: 'skill', label: '深度研究', en: 'deep-research', icon: 'skill', insert: '用联网搜索做一次深度研究，输出带来源的报告。', detail: '多轮检索、交叉核对，最后给出带来源的结论。' },
  { group: 'skill', label: '游戏', en: 'game', icon: 'skill', run: 'game', detail: '新建一个 HTML5 游戏产物（单文件，可直接预览）。' },
  { group: 'skill', label: '画图', en: 'image', icon: 'skill', click: '#plusPop [data-mode="image"]', detail: '开启 / 关闭画图模式，让模型直接出图。' },
  { group: 'skill', label: '联网搜索', en: 'web-search', icon: 'skill', click: '#plusPop [data-mode="search"]', detail: '开启 / 关闭联网搜索。' },
  { group: 'skill', label: '编程模式', en: 'code', icon: 'skill', click: '#plusPop [data-mode="code"]', detail: '开启后模型用 write_file 写代码文件到右侧。' },
  { group: 'skill', label: '切换模型', en: 'model', icon: 'skill', click: '#cmModel', detail: '选择模型和思考强度。' },
  { group: 'skill', label: '设置', en: 'settings', icon: 'skill', click: '#setOpenBtn', detail: '打开设置面板。' },
];

let slashEl = null;
let slashTip = null;
let slashList = [];
let slashIdx = 0;

function closeSlash() {
  if (slashTip) { slashTip.remove(); slashTip = null; }
  if (!slashEl) return;
  slashEl.remove();
  slashEl = null;
  slashList = [];
  slashIdx = 0;
  if (input) input.placeholder = DEFAULT_PH;
}

function slashQuery() {
  const v = input.value;
  if (!v.startsWith('/')) return null;
  return (v.slice(1).match(/^[^\s]*/) || [''])[0];
}

function showSlashTip(row, item) {
  if (!item || !item.detail) { if (slashTip) slashTip.style.display = 'none'; return; }
  if (!slashTip) { slashTip = el('div', 'slash-tip'); document.body.append(slashTip); }
  slashTip.style.display = 'block';
  slashTip.textContent = item.detail;
  const rr = row.getBoundingClientRect();
  const mr = slashEl.getBoundingClientRect();
  let left = mr.right + 10;
  if (left + 260 > window.innerWidth - 8) left = mr.left - 270;
  slashTip.style.left = Math.max(8, left) + 'px';
  slashTip.style.top = Math.max(8, Math.min(rr.top, window.innerHeight - 120)) + 'px';
}

function slashItemsAll() {
  // 内置命令 + 服务器上的技能（所有人共享，作者可改）
  const mine = (state.skills || []).filter((s) => s && s.enabled !== false).map((s) => ({
    group: 'shared',
    label: s.name,
    en: '/' + s.cmd,
    icon: s.icon || 'skill',
    detail: (s.desc || '') + '（作者 ' + (s.author || '—') + (s.uses ? ' · 用过 ' + s.uses + ' 次' : '') + '）',
    skill: s,
  }));
  // 顺序：添加类 → 共享技能 → 内置技能
  const adds = SLASH_ITEMS.filter((s) => s.group === 'add');
  const builtinSkills = SLASH_ITEMS.filter((s) => s.group !== 'add');
  // 同名以内置为准去重：共享技能里已有同名项时，不再重复显示内置的那条
  const sharedNames = new Set(mine.map((m) => m.label));
  return adds.concat(mine, builtinSkills.filter((s) => !sharedNames.has(s.label)));
}
function renderSlash(q) {
  const key = String(q || '').toLowerCase();
  slashList = slashItemsAll().filter((s) => !key || s.label.toLowerCase().includes(key) || s.en.toLowerCase().includes(key) || (s.detail || '').toLowerCase().includes(key));
  if (!slashList.length) { closeSlash(); return; }
  if (!slashEl) {
    slashEl = el('div', 'slash-menu');
    slashEl.addEventListener('mousedown', (e) => e.preventDefault());
    document.body.append(slashEl);
  }
  slashIdx = Math.max(0, Math.min(slashIdx, slashList.length - 1));
  slashEl.textContent = '';
  let lastGroup = null;
  slashList.forEach((s, i) => {
    if (s.group !== lastGroup) {
      if (lastGroup) slashEl.append(el('div', 'slash-sep'));
      if (s.group === 'shared') slashEl.append(el('div', 'slash-label', '共享技能'));
      if (s.group === 'skill') slashEl.append(el('div', 'slash-label', '技能'));
      lastGroup = s.group;
    }
    const row = el('button', 'slash-item' + (i === slashIdx ? ' on' : ''));
    row.type = 'button';
    row.innerHTML = '<span class="sc-ico sc-' + s.icon + '">' + (SLASH_ICON[s.icon] || SLASH_ICON.skill) + '</span>'
      + '<span class="sc-cmd">' + esc(s.label) + '</span>'
      + '<span class="sc-en">' + esc(s.en) + '</span>';
    row.addEventListener('mouseenter', () => { slashIdx = i; showSlashTip(row, s); });
    row.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); chooseSlash(i); });
    slashEl.append(row);
  });
  const r = input.getBoundingClientRect();
  const w = Math.min(340, Math.max(280, window.innerWidth - 32));
  slashEl.style.width = w + 'px';
  const h = slashEl.offsetHeight;
  let top = r.top - h - 8;
  if (top < 8) top = Math.max(8, r.bottom + 8);
  slashEl.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px';
  slashEl.style.top = top + 'px';
  const active = slashEl.querySelectorAll('.slash-item')[slashIdx];
  if (active) showSlashTip(active, slashList[slashIdx]);
}

function createSlashArtifact(kind) {
  const cv = current();
  if (!cv) return;
  const cfg = { doc: { kind: 'doc', name: '文档.md' }, deck: { kind: 'deck', name: '幻灯片.deck.json' }, design: { kind: 'design', name: '页面.html' }, game: { kind: 'design', name: '游戏.html' } }[kind];
  if (!cfg) return;
  if (!cv.artifact) cv.artifact = { kind: cfg.kind, name: cfg.name };
  openArtifactPane(cv.artifact.kind, cv.artifact.name);
  saveConv(cv).catch(() => {});
  flashHint('已新建' + (kind === 'doc' ? '文档' : kind === 'deck' ? '幻灯片' : '设计') + '产物');
  input.focus();
}

function applySkillModes(sk) {
  const perms = (sk && sk.perms) || {};
  setCap('search', !!perms.search);
  setCap('image', !!perms.image);
  setCap('gif', !!perms.gif);
  setCap('code', !!perms.code);
}

function renderSkillChip() {
  let chip = document.querySelector('#skillChip');
  if (!state.pendingSkill) { if (chip) chip.remove(); return; }
  if (!chip) {
    chip = el('div', 'skill-chip');
    chip.id = 'skillChip';
    const x = el('button', 'sc-x', '✕');
    x.type = 'button';
    x.title = '取消这个技能';
    x.addEventListener('click', () => { state.pendingSkill = null; renderSkillChip(); });
    chip.append(el('span', 'sc-n', ''), x);
    const box = $('#composer');
    if (box && box.parentElement) box.parentElement.insertBefore(chip, box);
  }
  const n = chip.querySelector('.sc-n');
  if (n) n.textContent = '技能 /' + state.pendingSkill.cmd + ' · ' + state.pendingSkill.name;
}

function useSkill(sk) {
  if (!sk) return;
  state.pendingSkill = sk;
  applySkillModes(sk);
  renderSkillChip();
  // 统一行为：把技能提示词放进输入框（{input} 留空给你补），按 Enter 才真正执行
  const hasSlot = String(sk.prompt || '').includes('{input}');
  const text = String(sk.prompt || '').replace(/\{input\}/g, '');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  const at = text.length;
  input.setSelectionRange(at, at);
  flashHint(hasSlot ? '已套用技能「' + sk.name + '」，补充内容后按 Enter' : '已套用技能「' + sk.name + '」，按 Enter 运行');
}

function chooseSlash(i) {
  const s = slashList[i];
  if (!s) return;
  closeSlash();
  if (s.skill) { useSkill(s.skill); return; }
  if (s.insert) {
    input.value = s.insert;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  // 执行动作类命令时清空 /game 这段文本
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (s.run === 'files') { const f = $('#fileInput'); if (f) f.click(); return; }
  if (['doc', 'deck', 'design', 'game'].includes(s.run)) { createSlashArtifact(s.run); return; }
  if (s.click) { const target = document.querySelector(s.click); if (target) target.click(); }
}

input.addEventListener('input', () => {
  const q = slashQuery();
  if (q === null) closeSlash();
  else { slashIdx = 0; renderSlash(q); }
});

input.addEventListener('keydown', (e) => {
  if (!slashEl) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeSlash(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); slashIdx = (slashIdx + 1) % slashList.length; renderSlash(slashQuery()); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); slashIdx = (slashIdx - 1 + slashList.length) % slashList.length; renderSlash(slashQuery()); return; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); chooseSlash(slashIdx); }
}, true);

document.addEventListener('mousedown', (e) => {
  if (slashEl && !slashEl.contains(e.target) && e.target !== input) closeSlash();
});

const slashBtn = $('#slashBtn');
if (slashBtn) slashBtn.addEventListener('click', () => {
  input.value = '/';
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
});