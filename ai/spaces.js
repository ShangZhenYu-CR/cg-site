export function mountSpaces(ctx) {
  const { api, el, $, state, renderAll, openListPanel, flashHint, openPluginViewer, base } = ctx;
  const S = { spaces: null, space: null, resource: null, tab: 'comments', activeEntity: null, saveTimer: null, saving: false, conflict: false, comments: [] };
  function roleLabel(role) { return { owner: '所有者', editor: '编辑', commenter: '评论者', viewer: '只读', admin: '管理员' }[role] || role; }
  // 公开 / 私人：后端返回 visibility 字段后才显示，旧后端不显示，避免把只有成员能看的空间标成公开
  function visOf(s) { return s && (s.visibility === 'private' || s.visibility === 'public') ? s.visibility : null; }
  function visLabel(v) { return v === 'private' ? '私人空间：只有成员能看' : v === 'public' ? '公开空间：所有人能看能编辑' : ''; }
  async function loadSpaces(force) {
    if (S.spaces && !force) return S.spaces;
    const r = await api('/spaces');
    const j = await r.json().catch(() => ({}));
    S.spaces = Array.isArray(j.spaces) ? j.spaces : [];
    return S.spaces;
  }
  /* ---------------- 布局：顶部空间标签栏 + 工作区 ---------------- */
  const narrow = () => window.matchMedia('(max-width:820px)').matches;
  function readLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  S.treeOpen = narrow() ? false : readLS('ai.spaceTree') !== '0';
  S.sideOpen = false;
  function applyLayout() {
    const w = $('#spaceWork');
    if (!w) return;
    w.classList.toggle('no-tree', !S.treeOpen);
    w.classList.toggle('with-side', !!S.sideOpen);
    const t = $('#treeToggle');
    if (t) { t.setAttribute('aria-expanded', String(!!S.treeOpen)); t.title = S.treeOpen ? '收起页面列表' : '展开页面列表'; }
    const sb = $('#sidePanelBtn');
    if (sb) sb.setAttribute('aria-expanded', String(!!S.sideOpen));
  }
  // 窄屏：页面列表是抽屉，切到窄屏时收起，点正文区收起
  window.matchMedia('(max-width:820px)').addEventListener('change', (mq) => {
    S.treeOpen = mq.matches ? false : readLS('ai.spaceTree') !== '0';
    applyLayout();
  });
  function setTree(open) { S.treeOpen = !!open; if (!narrow()) writeLS('ai.spaceTree', open ? '1' : '0'); applyLayout(); }
  function setSide(open) { S.sideOpen = !!open; applyLayout(); if (open) renderSide(); }
  function renderTabs() {
    const box = $('#spaceTabs');
    if (!box) return;
    box.textContent = '';
    const list = (S.spaces || []).slice();
    if (S.space && !list.some((s) => s.id === S.space.id)) list.push(S.space);
    for (const s of list) {
      const on = !!(S.space && S.space.id === s.id);
      const b = el('button', 'space-tab' + (on ? ' on' : ''));
      b.type = 'button';
      b.dataset.id = s.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(on));
      if (visOf(s) === 'private') { const lk = el('span', 'st-lock', '🔒'); lk.title = '私人空间'; b.append(lk); }
      b.append(el('span', 'st-t', s.title || '未命名空间'));
      if (s.isMember === false) { b.append(el('span', 'st-new', '未加入')); b.title = '公开空间，你还不是成员，可以直接编辑'; }
      b.addEventListener('click', () => { if (!on) openSpace(s.id).catch(() => {}); });
      box.append(b);
      // 只横向滚动标签条本身，不能用 scrollIntoView（会把外层页面也滚走）
      if (on) requestAnimationFrame(() => {
        const l = b.offsetLeft, r = l + b.offsetWidth;
        if (l < box.scrollLeft) box.scrollLeft = l - 8;
        else if (r > box.scrollLeft + box.clientWidth) box.scrollLeft = r - box.clientWidth + 8;
      });
    }
  }
  function render() {
    const page = $('#spacesPage');
    if (!page) return;
    renderTabs();
    const empty = $('#spacesEmpty');
    const work = $('#spaceWork');
    if (!S.space) {
      work.hidden = true;
      empty.hidden = !(S.spaces && !S.spaces.length);
      return;
    }
    empty.hidden = true;
    work.hidden = false;
    const vis = visOf(S.space);
    const notMember = S.space.isMember === false;
    $('#spacesSub').textContent = (vis ? visLabel(vis) + ' · ' : '') + '成员 ' + (S.space.members || []).length + ' 人 · ' + (notMember ? '你还不是成员，可直接编辑' : '你的角色：' + roleLabel(S.space.role));
    $('#spaceAddMember').hidden = !['owner', 'admin'].includes(S.space.role);
    const visBtn = $('#spaceVisBtn');
    if (visBtn) {
      visBtn.hidden = !vis || !['owner', 'admin'].includes(S.space.role);
      visBtn.textContent = vis === 'private' ? '设为公开' : '设为私人';
    }
    applyLayout();
    renderTree();
    renderEditor();
    renderSide();
  }
  async function openSpace(id, rid) {
    if (!await flushSave()) return false;
    await clearCanvasFocus();
    const r = await api('/spaces/' + encodeURIComponent(id) + '?full=1');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '打不开空间'); return false; }
    S.space = j.space;
    writeLS('ai.lastSpace', id);
    if (!rid) {
      const last = readLS('ai.lastRes.' + id);
      if (last && (j.space.resources || []).some((x) => x.id === last)) rid = last;
    }
    S.resource = null;
    S.activeEntity = null;
    S.comments = [];
    S.extensions = [];
    const extP = api('/spaces/' + encodeURIComponent(id) + '/extensions').then((er) => er.json()).then((ej) => { S.extensions = Array.isArray(ej.extensions) ? ej.extensions : []; }).catch(() => {});
    // 指定了页面（比如从产物面板「存到空间」跳过来）就直接打开那一页
    if (rid) { render(); await openResource(rid); }
    else if (j.space.firstResource) {
      S.resource = j.space.firstResource;
      S.activeEntity = (S.resource.entities || [])[0] ? S.resource.entities[0].id : null;
      S.conflict = false;
      render();
      loadComments();
    } else if (j.space.resources && j.space.resources.length) await openResource(j.space.resources[0].id);
    else { S.resource = null; render(); }
    await extP;
    return true;
  }
  /** 从别的视图直接跳到某个空间的某一页 */
  async function openPage(spaceId, rid) {
    if (!await flushSave()) return false;
    state.view = 'spaces';
    renderAll();
    try { await loadSpaces(true); } catch (e) {}
    return openSpace(spaceId, rid);
  }
  async function openResource(rid) {
    if (!await flushSave()) return;
    if (!S.space) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(rid));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '打不开页面'); return; }
    S.resource = j.resource;
    S.activeEntity = (j.resource.entities || [])[0] ? j.resource.entities[0].id : null;
    S.conflict = false;
    writeLS('ai.lastRes.' + S.space.id, rid);
    render();
    loadComments();
  }
  const ICON_PAGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>';
  const ICON_CANVAS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="7" rx="1.5"/><rect x="13" y="14" width="8" height="7" rx="1.5"/><path d="M7 10v4a3 3 0 0 0 3 3h3"/></svg>';
  function renderTree() {
    const box = $('#spaceRes');
    if (!box) return;
    box.textContent = '';
    for (const r of (S.space.resources || [])) {
      const b = el('button', 'space-res-item' + (S.resource && S.resource.id === r.id ? ' on' : ''));
      b.type = 'button';
      b.dataset.rid = r.id;
      const ic = el('span', 'ri');
      ic.innerHTML = r.type === 'canvas' ? ICON_CANVAS : ICON_PAGE;
      ic.title = r.type === 'canvas' ? '画布' : '页面';
      b.append(ic, el('span', 'rn', r.title || '未命名'));
      b.addEventListener('click', () => {
        if (narrow()) setTree(false);
        openResource(r.id).catch(() => {});
      });
      box.append(b);
    }
    if (!(S.space.resources || []).length) box.append(el('div', 'set-hint', '还没有页面，点上方 ＋ 新建页面或画布。'));
  }
  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 2) + 'px';
  }
  window.addEventListener('resize', () => { document.querySelectorAll('#pageEditor .page-block textarea').forEach(autosize); });
  function renderEditor() {
    const box = $('#pageEditor');
    const title = $('#spaceResTitle');
    if (!box) return;
    if (cv && cv.cleanup) { cv.cleanup(); cv = null; }
    const res = S.resource;
    box.textContent = '';
    box.removeAttribute('style');
    if (!res) {
      title.value = ''; title.disabled = true;
      box.classList.remove('canvas-board');
      box.removeAttribute('tabindex');
      $('#addBlockBtn').hidden = true;
      return;
    }
    title.disabled = false;
    title.value = res.title || '';
    const isCanvas = res.type === 'canvas';
    box.classList.toggle('canvas-board', isCanvas);
    $('#addBlockBtn').hidden = isCanvas;
    $('#canvasFullBtn').hidden = !isCanvas;
    $('#canvasFullBtn').textContent = S.canvasFocus ? '退出全屏' : '⤢ 全屏';
    if (isCanvas) { box.tabIndex = 0; renderCanvas(box, res); return; }
    box.removeAttribute('tabindex');
    for (const e of (res.entities || [])) {
      const row = el('div', 'page-block');
      const ta = document.createElement('textarea');
      ta.value = (e.payload && e.payload.text) || '';
      ta.dataset.eid = e.id || '';
      ta.dataset.rev = String(e.revision || 0);
      ta.placeholder = '写点什么…';
      ta.rows = 1;
      ta.addEventListener('focus', () => { S.activeEntity = e.id; });
      ta.addEventListener('input', () => {
        e.payload = { text: ta.value };
        autosize(ta);
        scheduleSave();
      });
      const del = el('button', 'blk-del', '×');
      del.type = 'button';
      del.title = '删除这个块';
      del.addEventListener('click', () => {
        S.resource.entities = (S.resource.entities || []).filter((x) => x !== e);
        renderEditor();
        scheduleSave();
      });
      row.append(ta, del);
      box.append(row);
    }
    requestAnimationFrame(() => box.querySelectorAll('.page-block textarea').forEach(autosize));
    $('#spaceSaveState').textContent = S.conflict ? '有冲突，请刷新' : '';
  }

  /* ---------------- 画布：主流白板操作（滚轮平移、Ctrl+滚轮缩放、框选、拖圆点连线、撤销） ---------------- */
  // 后端限制：x、y 在 0–4000，宽 120–800，高 80–600
  const CV = { MIN_Z: 0.1, MAX_Z: 3, WORLD: 32000, MINW: 120, MAXW: 800, MINH: 80, MAXH: 600 };
  const CARD_COLORS = [['', '#ffffff', '白色'], ['yellow', '#fff3b0', '黄色'], ['green', '#d5f2d8', '绿色'], ['blue', '#d7e8fb', '蓝色'], ['pink', '#fbdbe6', '粉色'], ['purple', '#e6dcfa', '紫色']];
  const SVGNS = 'http://www.w3.org/2000/svg';
  let cv = null;
  let cvClip = null;
  const cvAlias = new Map();
  const cvViews = new Map();
  const cvHist = new Map();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const resolveKey = (k) => { let x = k; for (let i = 0; i < 8 && cvAlias.has(x); i++) x = cvAlias.get(x); return x; };
  function keyOf(e) {
    if (!e.id && !e._tmp) e._tmp = 'tmp_' + Math.random().toString(36).slice(2, 10);
    return e.id || e._tmp;
  }
  function normPayload(e) {
    const p = e.payload = { ...(e.payload || {}) };
    p.type = ['text', 'image', 'file', 'page'].includes(p.type) ? p.type : 'text';
    p.w = clamp(Math.round(Number(p.w) || 240), CV.MINW, CV.MAXW);
    p.h = clamp(Math.round(Number(p.h) || 160), CV.MINH, CV.MAXH);
    p.x = clamp(Math.round(Number(p.x) || 0), 0, CV.WORLD);
    p.y = clamp(Math.round(Number(p.y) || 0), 0, CV.WORLD);
    p.color = CARD_COLORS.some((c) => c[0] === p.color) ? p.color : '';
    return p;
  }
  /** 保存后临时卡片拿到正式 id：连线、选中、DOM 都要跟着换 */
  function canvasRekey(oldKey, newKey) {
    cvAlias.set(oldKey, newKey);
    let changed = false;
    for (const ed of (S.resource && S.resource.edges) || []) {
      if (ed.from === oldKey) { ed.from = newKey; changed = true; }
      if (ed.to === oldKey) { ed.to = newKey; changed = true; }
    }
    if (cv && cv.rekey) cv.rekey(oldKey, newKey);
    return changed;
  }
  function renderCanvas(box, res) {
    const ac = new AbortController();
    const on = (t, ev, fn, opt) => t.addEventListener(ev, fn, { signal: ac.signal, ...(opt || {}) });
    const ents = () => S.resource.entities || (S.resource.entities = []);
    const edges = () => S.resource.edges || (S.resource.edges = []);
    for (const e of ents()) normPayload(e);
    if (!cvHist.has(res.id)) cvHist.set(res.id, { undo: [], redo: [] });
    const hist = cvHist.get(res.id);
    const st = cv = { res, sel: new Set(), edgeSel: -1, editing: null, cards: new Map(), spaceDown: false, gesture: null };
    let view = cvViews.get(res.id) || (() => { try { const v = JSON.parse(readLS('ai.canvasView.' + res.id) || 'null'); return v && isFinite(v.x) && isFinite(v.y) && isFinite(v.z) ? v : null; } catch (e) { return null; } })();
    const needFit = !view;
    if (!view) view = { x: 40, y: 40, z: 1 };

    const world = el('div', 'cv-world');
    const bounds = el('div', 'cv-bounds');
    bounds.style.width = (CV.WORLD + CV.MAXW) + 'px';
    bounds.style.height = (CV.WORLD + CV.MAXH) + 'px';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'cv-edges');
    svg.setAttribute('width', String(CV.WORLD + CV.MAXW));
    svg.setAttribute('height', String(CV.WORLD + CV.MAXH));
    svg.innerHTML = '<defs><marker id="cvArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--dim)"/></marker><marker id="cvArrowOn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--accent)"/></marker></defs><g class="eg"></g><g class="guides"></g><path class="tmp" d="" style="display:none" marker-end="url(#cvArrowOn)"/>';
    world.append(bounds, svg);
    const marquee = el('div', 'cv-marquee');
    const bar = el('div', 'cv-cardbar');
    const tools = el('div', 'cv-tools');
    const empty = el('div', 'cv-empty');
    empty.innerHTML = '双击空白处新建卡片<br>或用下方工具条添加';
    const help = el('button', 'cv-help', '?');
    help.type = 'button';
    help.title = '画布快捷键';
    const helpBox = el('div', 'cv-helpbox');
    helpBox.hidden = true;
    helpBox.innerHTML = '<b>移动画布</b>：滚轮 / 触控板；按住空格或中键拖动<br><b>缩放</b>：Ctrl + 滚轮 / 双指捏合<br><b>新建卡片</b>：双击空白处<br><b>编辑文字</b>：双击卡片，Esc 结束<br><b>多选</b>：Shift + 点击，或在空白处拖框<br><b>连线</b>：从卡片边上的圆点拖到另一张卡<br><b>删除</b>：Delete / Backspace<br><b>撤销 / 重做</b>：Ctrl + Z / Ctrl + Shift + Z<br><b>复制粘贴</b>：Ctrl + C / X / V（外部文字、图片链接也能粘贴）<br><b>原地复制</b>：Ctrl + D　<b>全选</b>：Ctrl + A<br><b>连线文字</b>：双击连线<br><b>不吸附对齐</b>：拖动时按住 Alt<br><b>微调</b>：方向键（Shift 加大步长）<br><b>适应画布</b>：Shift + 1';
    box.append(world, marquee, bar, tools, empty, help, helpBox);
    on(help, 'click', (ev) => { ev.stopPropagation(); helpBox.hidden = !helpBox.hidden; });

    /* 视图 */
    let viewTimer = null;
    function applyView() {
      world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.z + ')';
      if (zoomBtn) zoomBtn.textContent = Math.round(view.z * 100) + '%';
      cvViews.set(res.id, { ...view });
      clearTimeout(viewTimer);
      viewTimer = setTimeout(() => writeLS('ai.canvasView.' + res.id, JSON.stringify(view)), 400);
      placeBar();
    }
    const rect = () => box.getBoundingClientRect();
    function toWorld(cx, cy) { const r = rect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; }
    function zoomAt(cx, cy, nz) {
      nz = clamp(nz, CV.MIN_Z, CV.MAX_Z);
      const r = rect();
      const w = toWorld(cx, cy);
      view.x = (cx - r.left) - w.x * nz;
      view.y = (cy - r.top) - w.y * nz;
      view.z = nz;
      applyView();
    }
    function zoomCenter(f) { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.z * f); }
    function fit() {
      const r = rect();
      const list = ents();
      if (!list.length || !r.width) { view = { x: 40, y: 40, z: 1 }; applyView(); return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const e of list) { const p = e.payload; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
      const pad = 60;
      const z = clamp(Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2 - 50) / (y1 - y0)), 0.2, 1);
      view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - 50 - (y1 - y0) * z) / 2 - y0 * z };
      applyView();
    }

    /* 撤销 / 重做：整块快照 */
    function snap() { return { ents: ents().map((e) => ({ k: keyOf(e), payload: { ...e.payload } })), edges: edges().map((x) => ({ ...x })) }; }
    function pushUndo(s) { hist.undo.push(s); if (hist.undo.length > 80) hist.undo.shift(); hist.redo.length = 0; }
    function restore(s) {
      const cur = new Map(ents().map((e) => [keyOf(e), e]));
      const remap = {};
      const next = [];
      for (const it of s.ents) {
        const k = resolveKey(it.k);
        let e = cur.get(k);
        if (!e) { e = { id: '', payload: { ...it.payload }, revision: 0 }; remap[k] = keyOf(e); cvAlias.set(k, keyOf(e)); }
        else e.payload = { ...it.payload };
        next.push(e);
      }
      S.resource.entities = next;
      S.resource.edges = s.edges.map((x) => ({ ...x, from: remap[resolveKey(x.from)] || resolveKey(x.from), to: remap[resolveKey(x.to)] || resolveKey(x.to) }));
      st.sel.clear(); st.edgeSel = -1;
      rebuild();
      scheduleSave();
    }
    function undo() { if (!hist.undo.length) { flashHint('没有可撤销的操作'); return; } hist.redo.push(snap()); restore(hist.undo.pop()); }
    function redo() { if (!hist.redo.length) return; hist.undo.push(snap()); restore(hist.redo.pop()); }

    /* 卡片 */
    const byKey = (k) => ents().find((e) => keyOf(e) === resolveKey(k));
    function pageOf(p) { return (S.space.resources || []).find((r) => r.id === p.ref) || (S.space.resources || []).find((r) => r.title === p.ref); }
    function buildCard(e) {
      const p = e.payload;
      const card = el('div', 'canvas-card');
      const k = keyOf(e);
      card.dataset.key = k;
      card.dataset.eid = e.id || '';
      if (p.type === 'image' && p.url) {
        const img = document.createElement('img');
        img.src = p.url.startsWith('/files/') || p.url.startsWith('/oss/') ? base() + p.url : p.url; img.alt = p.text || '图片'; img.draggable = false; img.loading = 'lazy';
        card.append(img);
      } else if (p.type === 'page') {
        const pg = el('div', 'cc-page');
        const r = pageOf(p);
        pg.append(el('div', 'k', (r && r.type === 'canvas') ? '画布' : '页面'), el('div', 'n', (r && r.title) || p.text || p.ref || '未命名'), el('div', 'h', r ? '双击打开' : '页面已不存在'));
        card.append(pg);
      } else {
        const ta = document.createElement('textarea');
        ta.value = p.text || '';
        ta.readOnly = true;
        ta.dataset.eid = e.id || '';
        ta.dataset.rev = String(e.revision || 0);
        ta.placeholder = p.type === 'file' ? ('文件：' + (p.ref || '未命名')) : '双击输入文字';
        on(ta, 'input', () => {
          e.payload = { ...e.payload, text: ta.value };
          if (ta.scrollHeight > ta.clientHeight + 1 && e.payload.h < CV.MAXH) {
            e.payload.h = clamp(e.payload.h + (ta.scrollHeight - ta.clientHeight) + 4, CV.MINH, CV.MAXH);
            placeCard(e); drawEdges();
          }
          scheduleSave();
        });
        on(ta, 'blur', () => stopEdit());
        on(ta, 'keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ta.blur(); box.focus({ preventScroll: true }); } ev.stopPropagation(); });
        card.append(ta);
      }
      for (const side of ['t', 'r', 'b', 'l']) { const pt = el('div', 'cc-port ' + side); pt.dataset.port = side; pt.title = '拖到另一张卡片上连线'; card.append(pt); }
      const rz = el('div', 'cc-resize');
      rz.title = '拖动改大小';
      card.append(rz);
      st.cards.set(k, card);
      placeCard(e);
      world.append(card);
      return card;
    }
    function placeCard(e) {
      const card = st.cards.get(keyOf(e));
      if (!card) return;
      const p = e.payload;
      card.dataset.shape = p.shape || '';
      card.style.zIndex = String(1 + ents().filter(other => (other.payload.layer || 0) < (p.layer || 0)).length);
      const textBox = card.querySelector('textarea');
      if (textBox) { textBox.style.fontSize = p.fontSize ? p.fontSize + 'px' : ''; textBox.style.textAlign = p.align || ''; }
      card.style.left = p.x + 'px'; card.style.top = p.y + 'px';
      card.style.width = p.w + 'px'; card.style.height = p.h + 'px';
    }
    function rebuild() {
      for (const c of st.cards.values()) c.remove();
      st.cards.clear();
      for (const e of ents()) { normPayload(e); buildCard(e); }
      refresh();
    }
    /** 只切换连线的选中样式，不重画（重画会让双击落到新元素上，浏览器就不触发 dblclick） */
    function syncEdgeSel() {
      for (const grp of svg.querySelectorAll('.eg .edge')) {
        const on = Number(grp.dataset.i) === st.edgeSel;
        grp.classList.toggle('on', on);
        const ln = grp.querySelector('.ed');
        if (ln) ln.setAttribute('marker-end', edges()[Number(grp.dataset.i)].arrow === false ? 'none' : on ? 'url(#cvArrowOn)' : 'url(#cvArrow)');
      }
      st.edgeMid = st.edgeSel >= 0 ? (st.edgeMids || [])[st.edgeSel] || null : null;
    }
    function refresh(opts) {
      const solo = st.sel.size === 1;
      for (const e of ents()) {
        const k = keyOf(e);
        const c = st.cards.get(k);
        if (!c) continue;
        const p = e.payload;
        c.className = 'canvas-card' + (p.color && p.type !== 'image' ? ' c-' + p.color : '') + (st.sel.has(k) ? ' sel' : '') + (st.sel.has(k) && solo ? ' solo' : '') + (st.editing === k ? ' editing' : '');
      }
      if (solo) { const e = byKey([...st.sel][0]); S.activeEntity = e && e.id; }
      empty.hidden = ents().length > 0;
      if (opts && opts.keepEdges) syncEdgeSel(); else drawEdges();
      buildBar();
      placeBar();
    }
    /** 两张卡之间选哪两条边：横向间隔大就左右相连，否则上下相连 */
    function pickSides(a, b) {
      const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
      const gapX = dx >= 0 ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
      const gapY = dy >= 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h);
      if (gapX >= gapY) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
      return dy >= 0 ? ['b', 't'] : ['t', 'b'];
    }
    function sideAnchor(p, side) {
      if (side === 't') return { x: p.x + p.w / 2, y: p.y, nx: 0, ny: -1 };
      if (side === 'b') return { x: p.x + p.w / 2, y: p.y + p.h, nx: 0, ny: 1 };
      if (side === 'l') return { x: p.x, y: p.y + p.h / 2, nx: -1, ny: 0 };
      return { x: p.x + p.w, y: p.y + p.h / 2, nx: 1, ny: 0 };
    }
    function curve(s, t) {
      const k = clamp(Math.hypot(t.x - s.x, t.y - s.y) * 0.4, 30, 160);
      const c1 = { x: s.x + s.nx * k, y: s.y + s.ny * k };
      const c2 = { x: t.x + (t.nx || 0) * k, y: t.y + (t.ny || 0) * k };
      const mid = { x: 0.125 * s.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * t.x, y: 0.125 * s.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * t.y };
      return { d: 'M' + s.x + ' ' + s.y + 'C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + t.x + ' ' + t.y, mid };
    }
    function edgeGeom(pa, pb) {
      const [sa, sb] = pickSides(pa, pb);
      return curve(sideAnchor(pa, sa), sideAnchor(pb, sb));
    }
    function drawEdges() {
      const g = svg.querySelector('.eg');
      g.textContent = '';
      st.edgeMid = null;
      st.edgeMids = [];
      edges().forEach((ed, i) => {
        const a = byKey(ed.from), b = byKey(ed.to);
        if (!a || !b) return;
        const { d, mid } = edgeGeom(a.payload, b.payload);
        const on = st.edgeSel === i;
        st.edgeMids[i] = mid;
        if (on) st.edgeMid = mid;
        const grp = document.createElementNS(SVGNS, 'g');
        grp.setAttribute('class', 'edge' + (on ? ' on' : ''));
        grp.dataset.i = String(i);
        const line = document.createElementNS(SVGNS, 'path');
        line.setAttribute('d', d);
        line.setAttribute('class', 'ed');
        if (ed.dashed) line.setAttribute('stroke-dasharray','7 5');
        line.setAttribute('marker-end', ed.arrow === false ? 'none' : on ? 'url(#cvArrowOn)' : 'url(#cvArrow)');
        const hit = document.createElementNS(SVGNS, 'path');
        hit.setAttribute('d', d);
        hit.setAttribute('class', 'hit');
        hit.dataset.i = String(i);
        grp.append(line, hit);
        if (ed.label) {
          const tx = document.createElementNS(SVGNS, 'text');
          tx.setAttribute('x', String(mid.x)); tx.setAttribute('y', String(mid.y));
          tx.setAttribute('class', 'elabel');
          tx.dataset.i = String(i);
          tx.textContent = ed.label;
          grp.append(tx);
        }
        g.append(grp);
      });
    }
    /** 拖动时和其他卡片的左 / 中 / 右、上 / 中 / 下对齐；返回需要补的位移和要画的辅助线 */
    function snapMove(g, mx, my) {
      if (!g.box0) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const it of g.items) { const p = it.e.payload; x0 = Math.min(x0, it.ox); y0 = Math.min(y0, it.oy); x1 = Math.max(x1, it.ox + p.w); y1 = Math.max(y1, it.oy + p.h); }
        g.box0 = { x0, y0, x1, y1 };
        const moving = new Set(g.items.map((it) => it.e));
        g.others = ents().filter((e) => !moving.has(e)).map((e) => e.payload);
      }
      const b = g.box0;
      const th = 6 / view.z;
      const xs = [b.x0 + mx, (b.x0 + b.x1) / 2 + mx, b.x1 + mx];
      const ys = [b.y0 + my, (b.y0 + b.y1) / 2 + my, b.y1 + my];
      let bestX = null, bestY = null;
      for (const o of g.others) {
        const oxs = [o.x, o.x + o.w / 2, o.x + o.w], oys = [o.y, o.y + o.h / 2, o.y + o.h];
        for (const a of xs) for (const t of oxs) { const d = t - a; if (Math.abs(d) <= th && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t, o }; }
        for (const a of ys) for (const t of oys) { const d = t - a; if (Math.abs(d) <= th && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t, o }; }
      }
      if (!bestX && !bestY) return null;
      const ax = bestX ? bestX.d : 0, ay = bestY ? bestY.d : 0;
      const lines = [];
      const nb = { x0: b.x0 + mx + ax, y0: b.y0 + my + ay, x1: b.x1 + mx + ax, y1: b.y1 + my + ay };
      if (bestX) lines.push({ x1: bestX.at, y1: Math.min(nb.y0, bestX.o.y) - 12, x2: bestX.at, y2: Math.max(nb.y1, bestX.o.y + bestX.o.h) + 12 });
      if (bestY) lines.push({ x1: Math.min(nb.x0, bestY.o.x) - 12, y1: bestY.at, x2: Math.max(nb.x1, bestY.o.x + bestY.o.w) + 12, y2: bestY.at });
      return { ax, ay, lines };
    }
    function drawGuides(lines) {
      const gg = svg.querySelector('.guides');
      gg.textContent = '';
      for (const l of lines) {
        const ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', l.x1); ln.setAttribute('y1', l.y1); ln.setAttribute('x2', l.x2); ln.setAttribute('y2', l.y2);
        gg.append(ln);
      }
    }
    function editEdgeLabel(i) {
      const ed = edges()[i];
      if (!ed) return;
      const v = prompt('连线上的文字（最多 80 字，留空就去掉）', ed.label || '');
      if (v == null) return;
      const label = v.trim().slice(0, 80);
      if (label === (ed.label || '')) return;
      const s0 = snap();
      if (label) ed.label = label; else delete ed.label;
      pushUndo(s0); refresh(); scheduleSave();
    }
    function selBox() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const k of st.sel) { const e = byKey(k); if (!e) continue; const p = e.payload; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
      return x0 === Infinity ? null : { x0, y0, x1, y1 };
    }
    function buildBar() {
      bar.textContent = '';
      if (st.edgeSel >= 0 && !st.sel.size) {
        const lb = el('button', null, (edges()[st.edgeSel] || {}).label ? '改文字' : '加文字');
        lb.type = 'button'; lb.title = '也可以双击连线';
        lb.addEventListener('click', () => editEdgeLabel(st.edgeSel));
        const rv = el('button', null, '反向');
        rv.type = 'button'; rv.title = '箭头换个方向';
        rv.addEventListener('click', () => { const ed = edges()[st.edgeSel]; if (!ed) return; const s0 = snap(); const f = ed.from; ed.from = ed.to; ed.to = f; pushUndo(s0); refresh(); scheduleSave(); });
        const dl = el('button', 'danger', '删除');
        dl.type = 'button'; dl.title = 'Delete';
        dl.addEventListener('click', () => deleteSelected());
        for (const [key,label] of [['dashed','虚线'],['arrow','箭头']]) {
          const ed = edges()[st.edgeSel], btn = el('button', null, label);
          btn.setAttribute('aria-pressed', String(key === 'arrow' ? ed.arrow !== false : !!ed.dashed));
          btn.onclick = () => { pushUndo(snap()); ed[key] = key === 'arrow' ? ed.arrow === false : !ed.dashed; refresh(); scheduleSave(); };
          bar.append(btn);
        }
        bar.append(lb, rv, dl);
        return;
      }
      if (!st.sel.size) return;
      const items = [...st.sel].map(byKey).filter(Boolean);
      for (const [key,label,options] of [
        ['shape','形状',[['rect','矩形'],['circle','圆形'],['diamond','菱形']]],
        ['align','对齐',[['left','左对齐'],['center','居中'],['right','右对齐']]],
        ['fontSize','字号',[12,16,20,24,32,48].map(n=>[n,n+'px'])],
        ['layer','层级',[['front','置顶'],['back','置底']]]
      ]) {
        const select = el('select'); select.title = label; select.setAttribute('aria-label',label);
        select.add(new Option(label,''));
        for (const [v,t] of options) select.add(new Option(t,v));
        select.onchange = () => {
          if (!select.value) return;
          pushUndo(snap());
          const layers = ents().map(e=>e.payload.layer || 0);
          const value = key === 'layer' ? (select.value === 'front' ? Math.max(...layers)+1 : Math.min(...layers)-1) : key === 'fontSize' ? Number(select.value) : select.value;
          for (const e of items) e.payload[key] = value;
          rebuild(); scheduleSave();
        };
        bar.append(select);
      }
      const colorable = items.filter((e) => e.payload.type !== 'image');
      if (colorable.length) {
        for (const [name, hex, label] of CARD_COLORS) {
          const d = el('button', 'dot' + (colorable.every((e) => (e.payload.color || '') === name) ? ' on' : ''));
          d.type = 'button'; d.style.background = hex; d.title = label; d.setAttribute('aria-label', label);
          d.addEventListener('click', () => { const s = snap(); for (const e of colorable) e.payload = { ...e.payload, color: name }; pushUndo(s); refresh(); scheduleSave(); });
          bar.append(d);
        }
        bar.append(el('span', 'sep'));
      }
      if (items.length === 1 && items[0].payload.type === 'text' && items[0].id) {
        const ai = el('button', null, 'AI 修改');
        ai.type = 'button';
        ai.addEventListener('click', () => aiEditCard(items[0]));
        bar.append(ai);
      }
      if (items.length === 1 && items[0].payload.type === 'page') {
        const op = el('button', null, '打开');
        op.type = 'button';
        op.addEventListener('click', () => openPageCard(items[0]));
        bar.append(op);
      }
      const dup = el('button', null, '复制');
      dup.type = 'button'; dup.title = 'Ctrl + D';
      dup.addEventListener('click', () => duplicate());
      const del = el('button', 'danger', '删除');
      del.type = 'button'; del.title = 'Delete';
      del.addEventListener('click', () => deleteSelected());
      bar.append(dup, del);
    }
    function placeBar() {
      if (st.edgeSel >= 0 && !st.sel.size && st.edgeMid && !st.gesture) {
        bar.style.display = 'flex';
        bar.style.left = clamp(st.edgeMid.x * view.z + view.x, 120, Math.max(120, box.clientWidth - 120)) + 'px';
        bar.style.top = (st.edgeMid.y * view.z + view.y - 14) + 'px';
        bar.style.transform = 'translate(-50%,-100%)';
        return;
      }
      const b = st.sel.size && !st.gesture && !st.editing ? selBox() : null;
      if (!b) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      const cx = (b.x0 + b.x1) / 2 * view.z + view.x;
      let top = b.y0 * view.z + view.y - 10;
      let below = false;
      if (top < 48) { top = b.y1 * view.z + view.y + 12; below = true; }
      const w = box.clientWidth;
      bar.style.left = clamp(cx, 120, Math.max(120, w - 120)) + 'px';
      bar.style.top = top + 'px';
      bar.style.transform = below ? 'translate(-50%,0)' : 'translate(-50%,-100%)';
    }
    function addCard(extra, x, y, edit) {
      const s = snap();
      const e = { id: '', payload: { text: '', type: 'text', w: 240, h: 140, color: '', ...extra, x, y }, revision: 0 };
      normPayload(e);
      ents().push(e);
      pushUndo(s);
      buildCard(e);
      st.sel = new Set([keyOf(e)]); st.edgeSel = -1;
      refresh();
      scheduleSave();
      if (edit && e.payload.type === 'text') setTimeout(() => startEdit(keyOf(e)), 0);
      return e;
    }
    async function uploadImages(files, point) {
      const canvas = S.resource;
      for (const file of files) {
        const response = await api('/spaces/'+S.space.id+'/resources/'+canvas.id+'/images', {method:'POST',raw:file, mime:file.type});
        const result = await response.json();
        if (!response.ok) { flashHint(result.error); return; }
        if (S.resource?.id !== canvas.id) return;
        addCard({type:'image',url:result.url,w:300,h:220},point.x,point.y);
        point = {x:point.x+24,y:point.y+24};
      }
    }
    on(box,'dragover',ev=>{ if (ev.dataTransfer.types.includes('Files')) ev.preventDefault(); });
    on(box,'drop',ev=>{ if (!ev.dataTransfer.files.length) return; ev.preventDefault(); uploadImages(ev.dataTransfer.files,toWorld(ev.clientX,ev.clientY)); });
    function viewCenter() { const r = rect(); return toWorld(r.left + r.width / 2, r.top + (r.height - 50) / 2); }
    function addAtCenter(extra, edit) {
      const c = viewCenter();
      const w = extra.w || 240, h = extra.h || 140;
      // 连续添加时错开一点，避免叠在一起
      const n = ents().length % 6;
      return addCard(extra, c.x - w / 2 + n * 16, c.y - h / 2 + n * 16, edit);
    }
    function startEdit(k) {
      const card = st.cards.get(resolveKey(k));
      const ta = card && card.querySelector('textarea');
      if (!ta) return;
      st.editing = resolveKey(k);
      st.sel = new Set([st.editing]);
      st.editSnap = snap();
      st.editText = ta.value;
      ta.readOnly = false;
      refresh();
      ta.focus();
      try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
    }
    function stopEdit() {
      if (!st.editing) return;
      const card = st.cards.get(st.editing);
      const ta = card && card.querySelector('textarea');
      if (ta) { ta.readOnly = true; if (ta.value !== st.editText && st.editSnap) pushUndo(st.editSnap); }
      st.editing = null; st.editSnap = null;
      refresh();
    }
    function deleteSelected() {
      if (st.edgeSel >= 0) {
        const s = snap();
        edges().splice(st.edgeSel, 1);
        st.edgeSel = -1;
        pushUndo(s); refresh(); scheduleSave();
        return;
      }
      if (!st.sel.size) return;
      const s = snap();
      const ks = new Set([...st.sel].map(resolveKey));
      S.resource.entities = ents().filter((e) => !ks.has(keyOf(e)));
      S.resource.edges = edges().filter((x) => !ks.has(resolveKey(x.from)) && !ks.has(resolveKey(x.to)));
      for (const k of ks) { const c = st.cards.get(k); if (c) c.remove(); st.cards.delete(k); }
      st.sel.clear();
      pushUndo(s); refresh(); scheduleSave();
    }
    function duplicate() {
      if (!st.sel.size) return;
      const s = snap();
      const fresh = [];
      for (const k of st.sel) {
        const src = byKey(k);
        if (!src) continue;
        const e = { id: '', payload: { ...src.payload, x: src.payload.x + 24, y: src.payload.y + 24 }, revision: 0 };
        normPayload(e); ents().push(e); buildCard(e); fresh.push(keyOf(e));
      }
      pushUndo(s);
      st.sel = new Set(fresh);
      refresh(); scheduleSave();
    }
    /** 复制选中的卡片和它们之间的连线；跨画布也能粘贴 */
    function copySel(cut) {
      const keys = new Set([...st.sel].map(resolveKey));
      const cards = ents().filter((e) => keys.has(keyOf(e))).map((e) => ({ k: keyOf(e), payload: { ...e.payload } }));
      if (!cards.length) return;
      const links = edges().filter((x) => keys.has(resolveKey(x.from)) && keys.has(resolveKey(x.to))).map((x) => ({ ...x, from: resolveKey(x.from), to: resolveKey(x.to) }));
      const plain = cards.map((c) => c.payload.text || c.payload.url || '').filter(Boolean).join('\n\n');
      cvClip = { cards, links, plain, at: Date.now() };
      try { localStorage.setItem('ai.canvasClip', JSON.stringify(cvClip)); } catch (e) {}
      try { if (navigator.clipboard && plain) navigator.clipboard.writeText(plain).catch(() => {}); } catch (e) {}
      if (cut) deleteSelected();
      flashHint(cut ? '已剪切 ' + cards.length + ' 张卡片' : '已复制 ' + cards.length + ' 张卡片');
    }
    function pasteClip(clip, at) {
      let x0 = Infinity, y0 = Infinity;
      for (const c of clip.cards) { x0 = Math.min(x0, c.payload.x); y0 = Math.min(y0, c.payload.y); }
      const s0 = snap();
      const map = {};
      const fresh = [];
      for (const c of clip.cards) {
        const e = { id: '', payload: { ...c.payload, x: at.x + (c.payload.x - x0), y: at.y + (c.payload.y - y0) }, revision: 0 };
        normPayload(e); ents().push(e); buildCard(e);
        map[c.k] = keyOf(e); fresh.push(keyOf(e));
      }
      for (const l of clip.links) if (map[l.from] && map[l.to]) edges().push({ ...l, from: map[l.from], to: map[l.to] });
      pushUndo(s0);
      st.sel = new Set(fresh); st.edgeSel = -1;
      refresh(); scheduleSave();
    }
    function nudge(dx, dy) {
      if (!st.sel.size) return;
      const s = snap();
      for (const k of st.sel) { const e = byKey(k); if (!e) continue; e.payload = { ...e.payload, x: clamp(e.payload.x + dx, 0, CV.WORLD), y: clamp(e.payload.y + dy, 0, CV.WORLD) }; placeCard(e); }
      pushUndo(s); refresh(); scheduleSave();
    }
    function openPageCard(e) {
      const r = pageOf(e.payload);
      if (!r) { flashHint('这个页面已不存在'); return; }
      openResource(r.id).catch(() => {});
    }
    st.rekey = (oldKey, newKey) => {
      const c = st.cards.get(oldKey);
      if (c) { st.cards.delete(oldKey); st.cards.set(newKey, c); c.dataset.key = newKey; c.dataset.eid = newKey; const ta = c.querySelector('textarea'); if (ta) ta.dataset.eid = newKey; }
      if (st.sel.delete(oldKey)) st.sel.add(newKey);
      if (st.editing === oldKey) st.editing = newKey;
      buildBar();
    };
    st.syncRevs = () => {
      for (const e of ents()) { const c = st.cards.get(keyOf(e)); const ta = c && c.querySelector('textarea'); if (ta) { ta.dataset.eid = e.id || ''; ta.dataset.rev = String(e.revision || 0); } }
      buildBar();
    };

    /* 底部工具条 */
    const tb = (label, title, fn, cls) => { const b = el('button', cls || null); b.type = 'button'; b.title = title; b.innerHTML = label; b.addEventListener('click', fn); tools.append(b); return b; };
    tb('上传图片','从本地上传图片',()=>{ const picker=document.createElement('input'); picker.type='file'; picker.accept='image/png,image/jpeg,image/webp,image/gif'; picker.multiple=true; picker.onchange=()=>uploadImages(picker.files,viewCenter()); picker.click(); });
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/></svg><span class="lbl">文本</span>', '新建文本卡（也可以双击空白处）', () => addAtCenter({}, true));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 4h16v10l-6 6H4z" fill="#fff3b0" stroke="#c9a92c"/><path d="M14 20v-6h6" stroke="#c9a92c"/></svg><span class="lbl">便签</span>', '新建便签', () => addAtCenter({ color: 'yellow', w: 200, h: 200 }, true));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg><span class="lbl">图片</span>', '用图片链接新建图片卡', () => {
      const url = (prompt('图片链接（站内 /files/... 或 https://...）') || '').trim();
      if (url) addAtCenter({ type: 'image', url, w: 300, h: 220 });
    });
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg><span class="lbl">页面</span>', '放一张链到本空间页面的卡片', () => {
      const list = (S.space.resources || []).filter((r) => r.id !== res.id);
      if (!list.length) { flashHint('这个空间还没有别的页面'); return; }
      openListPanel('链到页面', '卡片双击即可打开对应页面', list.map((r) => ({
        label: r.title || '未命名', sub: r.type === 'canvas' ? '画布' : '页面',
        onClick: () => { const d = $('#dlgList'); if (d) d.hidden = true; addAtCenter({ type: 'page', ref: r.id, text: r.title || '', w: 240, h: 110 }); },
      })));
    });
    tools.append(el('span', 'sep'));
    tb('−', '缩小（Ctrl + 滚轮）', () => zoomCenter(1 / 1.25));
    const zoomBtn = tb('100%', '恢复 100%', () => zoomCenter(1 / view.z), 'zoom');
    tb('＋', '放大（Ctrl + 滚轮）', () => zoomCenter(1.25));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="lbl">适应</span>', '适应画布（Shift + 1）', () => fit());

    /* 指针：平移、移动、改大小、连线、框选、双指缩放 */
    const pointers = new Map();
    let pinch = null;
    const isUi = (t) => !!(t.closest && t.closest('.cv-tools,.cv-cardbar,.cv-help,.cv-helpbox'));
    on(box, 'pointerdown', (ev) => {
      if (isUi(ev.target)) return;
      if (st.editing && ev.target.closest('.canvas-card.editing')) return;
      if (!helpBox.hidden) helpBox.hidden = true;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        st.gesture = null;
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...view } };
        return;
      }
      if (st.editing) stopEdit();
      box.focus({ preventScroll: true });
      const cardEl = ev.target.closest('.canvas-card');
      const port = ev.target.closest('.cc-port');
      const rz = ev.target.closest('.cc-resize');
      const hit = ev.target.closest('.hit,.elabel');
      try { box.setPointerCapture(ev.pointerId); } catch (e) {}
      if (ev.button === 1 || st.spaceDown || (ev.pointerType === 'touch' && !cardEl)) {
        ev.preventDefault();
        st.gesture = { type: 'pan', sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y };
        box.classList.add('panning');
        return;
      }
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (port && cardEl) { st.gesture = { type: 'link', from: cardEl.dataset.key, side: port.dataset.port }; bar.style.display = 'none'; return; }
      if (rz && cardEl) {
        const e = byKey(cardEl.dataset.key);
        st.gesture = { type: 'resize', e, sx: ev.clientX, sy: ev.clientY, ow: e.payload.w, oh: e.payload.h, s: snap(), moved: false };
        return;
      }
      if (hit) { st.sel.clear(); st.edgeSel = Number(hit.dataset.i); refresh({ keepEdges: true }); return; }
      if (cardEl) {
        const k = cardEl.dataset.key;
        st.edgeSel = -1;
        if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
          if (st.sel.has(k)) { st.sel.delete(k); refresh(); return; }
          st.sel.add(k);
        } else if (!st.sel.has(k)) st.sel = new Set([k]);
        refresh();
        st.gesture = { type: 'move', sx: ev.clientX, sy: ev.clientY, k, items: [...st.sel].map(byKey).filter(Boolean).map((e) => ({ e, ox: e.payload.x, oy: e.payload.y })), s: snap(), moved: false };
        return;
      }
      if (!ev.shiftKey) { st.sel.clear(); st.edgeSel = -1; refresh(); }
      st.gesture = { type: 'marquee', sx: ev.clientX, sy: ev.clientY, base: new Set(st.sel) };
    });
    on(box, 'pointermove', (ev) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const r = rect();
        const nz = clamp(pinch.v.z * d / pinch.d, CV.MIN_Z, CV.MAX_Z);
        const wx = (pinch.mx - r.left - pinch.v.x) / pinch.v.z, wy = (pinch.my - r.top - pinch.v.y) / pinch.v.z;
        view = { z: nz, x: mx - r.left - wx * nz, y: my - r.top - wy * nz };
        applyView();
        return;
      }
      const g = st.gesture;
      if (!g) return;
      const dx = ev.clientX - g.sx, dy = ev.clientY - g.sy;
      if (g.type === 'pan') { view.x = g.ox + dx; view.y = g.oy + dy; applyView(); return; }
      if (g.type === 'move') {
        if (!g.moved && Math.hypot(dx, dy) < 3) return;
        g.moved = true;
        bar.style.display = 'none';
        let mx = dx / view.z, my = dy / view.z;
        const snapRes = ev.altKey ? null : snapMove(g, mx, my);
        if (snapRes) { mx += snapRes.ax; my += snapRes.ay; }
        for (const it of g.items) {
          it.e.payload = { ...it.e.payload, x: clamp(Math.round(it.ox + mx), 0, CV.WORLD), y: clamp(Math.round(it.oy + my), 0, CV.WORLD) };
          placeCard(it.e);
        }
        drawEdges();
        drawGuides(snapRes ? snapRes.lines : []);
        return;
      }
      if (g.type === 'resize') {
        g.moved = true;
        g.e.payload = { ...g.e.payload, w: clamp(Math.round(g.ow + dx / view.z), CV.MINW, CV.MAXW), h: clamp(Math.round(g.oh + dy / view.z), CV.MINH, CV.MAXH) };
        placeCard(g.e); drawEdges(); bar.style.display = 'none';
        return;
      }
      if (g.type === 'link') {
        const a = byKey(g.from);
        if (!a) return;
        const w = toWorld(ev.clientX, ev.clientY);
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        const tc = over && over.closest && over.closest('.canvas-card');
        const target = tc && tc.dataset.key !== g.from ? byKey(tc.dataset.key) : null;
        let geo;
        if (target) geo = curve(sideAnchor(a.payload, g.side), sideAnchor(target.payload, pickSides(a.payload, target.payload)[1]));
        else geo = curve(sideAnchor(a.payload, g.side), { x: w.x, y: w.y, nx: 0, ny: 0 });
        const tmp = svg.querySelector('.tmp');
        tmp.style.display = '';
        tmp.setAttribute('d', geo.d);
        for (const c of st.cards.values()) c.classList.toggle('drop', c === tc && c.dataset.key !== g.from);
        return;
      }
      if (g.type === 'marquee') {
        const r = rect();
        const x0 = Math.min(g.sx, ev.clientX) - r.left, y0 = Math.min(g.sy, ev.clientY) - r.top;
        const w = Math.abs(dx), h = Math.abs(dy);
        Object.assign(marquee.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' });
        const a = { x: (x0 - view.x) / view.z, y: (y0 - view.y) / view.z };
        const b = { x: a.x + w / view.z, y: a.y + h / view.z };
        st.sel = new Set(g.base);
        for (const e of ents()) { const p = e.payload; if (p.x < b.x && p.x + p.w > a.x && p.y < b.y && p.y + p.h > a.y) st.sel.add(keyOf(e)); }
        refresh();
      }
    });
    const endPointer = (ev) => {
      pointers.delete(ev.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; return; }
      const g = st.gesture;
      st.gesture = null;
      box.classList.remove('panning');
      drawGuides([]);
      if (!g) { refresh({ keepEdges: true }); return; }
      if (g.type === 'move') {
        if (g.moved) { pushUndo(g.s); scheduleSave(); }
        else if (!(ev.shiftKey || ev.metaKey || ev.ctrlKey) && st.sel.size > 1) st.sel = new Set([g.k]);
      } else if (g.type === 'resize') {
        if (g.moved) { pushUndo(g.s); scheduleSave(); }
      } else if (g.type === 'link') {
        svg.querySelector('.tmp').style.display = 'none';
        for (const c of st.cards.values()) c.classList.remove('drop');
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        const tc = over && over.closest && over.closest('.canvas-card');
        const to = tc && tc.dataset.key;
        if (to && to !== g.from) {
          const exists = edges().some((x) => (resolveKey(x.from) === g.from && resolveKey(x.to) === to) || (resolveKey(x.from) === to && resolveKey(x.to) === g.from));
          if (exists) flashHint('这两张卡已经连上了');
          else { const s = snap(); edges().push({ from: g.from, to }); pushUndo(s); scheduleSave(); }
        }
      } else if (g.type === 'marquee') {
        marquee.style.display = 'none';
      }
      refresh();
    };
    on(box, 'pointerup', endPointer);
    on(box, 'pointercancel', endPointer);
    on(box, 'dblclick', (ev) => {
      // 按下时画布捕获了指针，dblclick 的 target 会变成画布本身：按坐标取真正点到的元素
      const tgt = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
      if (isUi(tgt)) return;
      const cardEl = tgt.closest('.canvas-card');
      if (cardEl) {
        const e = byKey(cardEl.dataset.key);
        if (!e) return;
        if (e.payload.type === 'page') { openPageCard(e); return; }
        if (e.payload.type === 'image') return;
        startEdit(cardEl.dataset.key);
        return;
      }
      const hitEl = tgt.closest('.hit,.elabel');
      if (hitEl) { editEdgeLabel(Number(hitEl.dataset.i)); return; }
      const w = toWorld(ev.clientX, ev.clientY);
      addCard({}, w.x - 120, w.y - 30, true);
    });
    on(box, 'wheel', (ev) => {
      if (isUi(ev.target)) return;
      if (st.editing && ev.target.closest('.canvas-card.editing') && !(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
      if (ev.ctrlKey || ev.metaKey) { zoomAt(ev.clientX, ev.clientY, view.z * clamp(Math.exp(-ev.deltaY * unit * 0.0025), 0.8, 1.25)); return; }
      let dx = ev.deltaX * unit, dy = ev.deltaY * unit;
      if (ev.shiftKey && !dx) { dx = dy; dy = 0; }
      view.x -= dx; view.y -= dy;
      applyView();
    }, { passive: false });
    on(box, 'keydown', (ev) => {
      if (st.editing) return;
      if (ev.target !== box) return;
      const mod = ev.ctrlKey || ev.metaKey;
      const k = ev.key;
      if (k === ' ') { ev.preventDefault(); if (!st.spaceDown) { st.spaceDown = true; box.classList.add('space-pan'); } return; }
      if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); deleteSelected(); return; }
      if (mod && (k === 'z' || k === 'Z')) { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
      if (mod && (k === 'y' || k === 'Y')) { ev.preventDefault(); redo(); return; }
      if (mod && (k === 'a' || k === 'A')) { ev.preventDefault(); st.sel = new Set(ents().map(keyOf)); st.edgeSel = -1; refresh(); return; }
      if (mod && (k === 'd' || k === 'D')) { ev.preventDefault(); duplicate(); return; }
      if (mod && (k === 'c' || k === 'C')) { if (st.sel.size) { ev.preventDefault(); copySel(false); } return; }
      if (mod && (k === 'x' || k === 'X')) { if (st.sel.size) { ev.preventDefault(); copySel(true); } return; }
      if (mod && (k === '=' || k === '+')) { ev.preventDefault(); zoomCenter(1.25); return; }
      if (mod && k === '-') { ev.preventDefault(); zoomCenter(1 / 1.25); return; }
      if (mod && k === '0') { ev.preventDefault(); zoomCenter(1 / view.z); return; }
      if (ev.shiftKey && (k === '!' || k === '1')) { ev.preventDefault(); fit(); return; }
      if (k === 'Escape') { st.sel.clear(); st.edgeSel = -1; refresh(); return; }
      if (k === 'Enter' && st.sel.size === 1) { ev.preventDefault(); startEdit([...st.sel][0]); return; }
      const step = ev.shiftKey ? 10 : 1;
      if (k === 'ArrowLeft') { ev.preventDefault(); nudge(-step, 0); return; }
      if (k === 'ArrowRight') { ev.preventDefault(); nudge(step, 0); return; }
      if (k === 'ArrowUp') { ev.preventDefault(); nudge(0, -step); return; }
      if (k === 'ArrowDown') { ev.preventDefault(); nudge(0, step); return; }
    });
    on(box, 'keyup', (ev) => { if (ev.key === ' ') { st.spaceDown = false; box.classList.remove('space-pan'); } });
    on(box, 'blur', () => { st.spaceDown = false; box.classList.remove('space-pan'); });

    // 粘贴：本画布复制的卡片 → 原样粘贴；外部文字 → 文本卡；图片链接 → 图片卡
    let lastPt = null;
    on(box, 'pointermove', (ev) => { lastPt = toWorld(ev.clientX, ev.clientY); });
    on(box, 'paste', (ev) => {
      if (st.editing) return;
      const text = (ev.clipboardData && ev.clipboardData.getData('text/plain')) || '';
      let clip = cvClip;
      if (!clip) { try { clip = JSON.parse(localStorage.getItem('ai.canvasClip') || 'null'); } catch (e) {} }
      const c = viewCenter();
      const at = lastPt || { x: c.x, y: c.y };
      if (clip && clip.cards && clip.cards.length && (!text || text === clip.plain)) {
        ev.preventDefault();
        pasteClip(clip, { x: at.x - 20, y: at.y - 20 });
        return;
      }
      const t = text.trim();
      if (!t) return;
      ev.preventDefault();
      if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(t) || /^\/files\/\S+\.(png|jpe?g|gif|webp)$/i.test(t)) { addCard({ type: 'image', url: t.slice(0, 500), w: 300, h: 220 }, at.x - 150, at.y - 110); return; }
      const long = t.length > 160;
      addCard({ text: t.slice(0, 4000), w: long ? 320 : 240, h: clamp(Math.ceil(t.length / (long ? 22 : 16)) * 22 + 30, 100, CV.MAXH) }, at.x - 120, at.y - 40);
    });
    st.cleanup = () => { ac.abort(); clearTimeout(viewTimer); };
    st.fit = fit;
    st.view = () => ({ ...view });
    rebuild();
    applyView();
    if (needFit) requestAnimationFrame(() => fit());
    $('#spaceSaveState').textContent = S.conflict ? '有冲突，请刷新' : '';
  }

  async function aiEditCard(e) {
    if (!S.space || !S.resource) return;
    const text = String((e.payload && e.payload.text) || '');
    if (!text.trim()) { flashHint('这张卡还没有文字'); return; }
    const instruction = (prompt('用 AI 修改这张卡：希望怎么改？', '润色这段文字') || '').trim();
    if (!instruction) return;
    $('#spaceSaveState').textContent = 'AI 修改中…';
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id) + '/ai', {
      method: 'POST', timeout: 90000,
      body: { action: 'edit', entityId: e.id, expectedRevision: e.revision, from: 0, to: text.length, instruction },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('#spaceSaveState').textContent = ''; flashHint(j.error || 'AI 修改失败'); return; }
    S.resource = j.resource || S.resource;
    renderEditor();
    $('#spaceSaveState').textContent = 'AI 已修改';
    flashHint('AI 已修改这张卡');
  }

  let dirty = false;
  let pendingSave;
  async function flushSave() {
    clearTimeout(S.saveTimer);
    if (!pendingSave && dirty) {
      pendingSave = (async () => {
        while (dirty) {
          dirty = false;
          if (!await savePage()) { dirty = true; return false; }
        }
        return true;
      })().finally(() => { pendingSave = null; });
    }
    return pendingSave || true;
  }
  function scheduleSave() {
    dirty = true;
    if (S.saveTimer) clearTimeout(S.saveTimer);
    $('#spaceSaveState').textContent = '未保存…';
    S.saveTimer = setTimeout(() => { flushSave().catch(() => {}); }, 650);
  }
  async function savePage() {
    if (!S.resource || !S.space) return true;
    if (S.saving) return;
    const titleEl = $('#spaceResTitle');
    let blocks;
    let edgesOut = null;
    if (S.resource.type === 'canvas') {
      blocks = (S.resource.entities || []).map((e) => ({ id: e.id || undefined, expectedRevision: Number(e.revision) || 0, payload: e.payload || {} }));
      S.resource.edges = S.resource.edges || [];
      if (cv && cv.res === S.resource) {
        const known = new Set((S.resource.entities || []).map((e) => e.id).filter(Boolean));
        edgesOut = S.resource.edges.filter((x) => known.has(resolveKey(x.from)) && known.has(resolveKey(x.to))).map((x) => ({ ...x, from: resolveKey(x.from), to: resolveKey(x.to) }));
      }
    } else {
      blocks = [...document.querySelectorAll('#pageEditor .page-block textarea')].map((ta) => ({
        id: ta.dataset.eid || undefined,
        expectedRevision: Number(ta.dataset.rev) || 0,
        payload: { text: ta.value },
      }));
    }
    const submitted = [...S.resource.entities];
    S.saving = true;
    $('#spaceSaveState').textContent = '保存中…';
    try {
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id), {
        method: 'PUT',
        body: { baseRevision: S.resource.revision, title: titleEl ? titleEl.value : S.resource.title, entities: blocks, edges: S.resource.type === 'canvas' ? (edgesOut || S.resource.edges || []) : undefined },
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) { S.conflict = true; $('#spaceSaveState').textContent = '有冲突，已保留你的输入'; flashHint(j.error || '页面已被其他人修改'); return; }
      if (!r.ok) { $('#spaceSaveState').textContent = '保存失败'; flashHint(j.error || '保存失败'); return; }
      S.resource.revision = j.resource.revision;
      // 按 id 对回：已有的按 id 找，新建的按顺序领取服务器新分配的 id
      const savedList = j.resource.entities || [];
      const sentIds = new Set(submitted.map((x) => x.id).filter(Boolean));
      const fresh = savedList.filter((x) => !sentIds.has(x.id));
      let fi = 0;
      let edgesChanged = false;
      for (const entity of submitted) {
        const saved = entity.id ? savedList.find((x) => x.id === entity.id) : fresh[fi++];
        if (!saved) continue;
        if (!entity.id) {
          const oldKey = entity._tmp;
          entity.id = saved.id;
          if (oldKey && canvasRekey(oldKey, saved.id)) edgesChanged = true;
        }
        entity.revision = saved.revision;
      }
      if (S.resource.type === 'canvas') {
        if (cv && cv.syncRevs) cv.syncRevs();
        // 连线里还有临时 id：再存一次，把正式 id 写进连线
        if (edgesChanged) dirty = true;
      } else {
        const tas = document.querySelectorAll('#pageEditor .page-block textarea');
        (S.resource.entities || []).forEach((en, i) => { if (tas[i]) { tas[i].dataset.eid = en.id || ''; tas[i].dataset.rev = String(en.revision || 0); } });
      }
      S.conflict = false;
      $('#spaceSaveState').textContent = '已保存';
      setTimeout(() => { const x = $('#spaceSaveState'); if (x) x.textContent = ''; }, 1200);
      renderTree();
      return true;
    } finally { S.saving = false; }
  }
  async function loadComments() {
    if (!S.space || !S.resource) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id) + '/comments');
    const j = await r.json().catch(() => ({ comments: [] }));
    S.comments = Array.isArray(j.comments) ? j.comments : [];
    const open = S.comments.filter((c) => !c.resolved).length;
    const sb = $('#sidePanelBtn');
    if (sb) sb.textContent = open ? '评论 ' + open : '评论';
    if (S.tab === 'comments') renderSide();
  }
  function renderSide() {
    const box = $('#spaceSideBody');
    if (!box) return;
    box.textContent = '';
    if (S.tab === 'apps') {
      const sp = S.space;
      const list = el('div');
      for (const x of (S.extensions || [])) {
        const row = el('div', 'space-member');
        const nm = el('span', null, x.name || x.id);
        nm.title = 'v' + (x.version || 1) + (x.enabled === false ? ' · 已禁用' : '');
        row.append(nm);
        const open = el('button', 'set-chip', '打开');
        open.type = 'button';
        open.style.cssText = 'border:0;background:none;color:var(--accent);cursor:pointer;font-size:12px';
        open.addEventListener('click', () => {
          if (x.enabled === false) { flashHint('这个扩展已禁用'); return; }
          openPluginViewer({ name: x.name || '扩展', slug: x.id, url: base() + '/extensions/' + encodeURIComponent(x.id) + '/entry' });
        });
        row.append(open);
        if (['owner', 'admin'].includes(sp.role)) {
          const hist = el('button', 'set-chip', '历史');
          hist.type = 'button';
          hist.style.cssText = 'border:0;background:none;color:var(--faint);cursor:pointer;font-size:12px';
          hist.addEventListener('click', async () => {
            const vr = await api('/spaces/' + encodeURIComponent(sp.id) + '/extensions/' + encodeURIComponent(x.id) + '/versions');
            const vj = await vr.json().catch(() => ({}));
            const base = '/spaces/' + encodeURIComponent(sp.id) + '/extensions/' + encodeURIComponent(x.id);
            const rows2 = (vj.versions || []).flatMap((v) => {
              const out = [{
                label: 'v' + v.version + (v.version === x.version ? '（当前）' : ''),
                sub: new Date(v.createdAt).toLocaleString() + ' · 点此对比当前',
                onClick: async () => {
                  const [a, b] = await Promise.all([
                    api(base + '/versions/' + encodeURIComponent(x.version)).then((r) => r.json()).catch(() => ({})),
                    api(base + '/versions/' + encodeURIComponent(v.version)).then((r) => r.json()).catch(() => ({})),
                  ]);
                  const diff = diffLines((b.version && b.version.html) || '', (a.version && a.version.html) || '');
                  openListPanel('v' + v.version + ' ↔ 当前 v' + x.version, '只显示不同的行（最多 80 行）', diff.length ? diff.map((t) => ({ label: t, sub: '' })) : [{ label: '没有差异', sub: '' }]);
                },
              }];
              if (v.version !== x.version) out.push({
                label: '回滚到 v' + v.version,
                sub: '会生成新版本，保留历史',
                onClick: async () => {
                  if (!confirm('回滚到 v' + v.version + '？会生成新版本。')) return;
                  const rr = await api(base + '/rollback', { method: 'POST', body: { version: v.version } });
                  const jj = await rr.json().catch(() => ({}));
                  if (!rr.ok) { flashHint(jj.error || '回滚失败'); return; }
                  await openSpace(sp.id);
                  flashHint('已回滚到 v' + v.version);
                },
              });
              return out;
            });
            openListPanel('扩展版本 · ' + (x.name || x.id), '回滚会保留历史并生成新版本', rows2.length ? rows2 : [{ label: '没有历史版本', sub: '' }]);
          });
          row.append(hist);
        }
        if (['owner', 'admin'].includes(sp.role)) {
          const del = el('button', null, '删除');
          del.type = 'button';
          del.addEventListener('click', async () => {
            if (!confirm('删除扩展「' + (x.name || x.id) + '」？')) return;
            const rr = await api('/spaces/' + encodeURIComponent(sp.id) + '/extensions/' + encodeURIComponent(x.id), { method: 'DELETE' });
            if (rr.ok) { await openSpace(sp.id); flashHint('已删除'); } else flashHint('删除失败');
          });
          row.append(del);
        }
        list.append(row);
      }
      if (!(S.extensions || []).length) list.append(el('div', 'set-hint', '还没有扩展。'));
      box.append(list);
      if (['owner', 'admin'].includes(sp.role)) {
        const add = el('button', 'ghost', '＋ 安装扩展');
        add.type = 'button';
        add.style.marginTop = '10px';
        add.addEventListener('click', () => installExtension());
        const gen = el('button', 'ghost', 'AI 生成扩展');
        gen.type = 'button';
        gen.style.marginTop = '10px';
        gen.style.marginLeft = '6px';
        gen.addEventListener('click', () => generateExtension());
        box.append(add, gen);
      }
      return;
    }
    if (S.tab === 'members') {
      const sp = S.space;
      for (const m of (sp.members || [])) {
        const row = el('div', 'space-member');
        row.append(el('span', null, m.name || m.userId));
        row.append(el('span', 'sm-role', roleLabel(m.role)));
        if (['owner', 'admin'].includes(sp.role) && m.role !== 'owner') {
          const del = el('button', null, '移除');
          del.type = 'button';
          del.addEventListener('click', async () => {
            if (!confirm('移除 ' + (m.name || m.userId) + '？')) return;
            const r = await api('/spaces/' + encodeURIComponent(sp.id) + '/members/' + encodeURIComponent(m.userId), { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (r.ok) { await openSpace(sp.id); flashHint('已移除'); } else flashHint(j.error || '移除失败');
          });
          row.append(del);
        }
        box.append(row);
      }
      if (['owner', 'admin'].includes(sp.role)) {
        const inv = el('button', 'ghost', '生成邀请码');
        inv.type = 'button';
        inv.style.marginTop = '10px';
        inv.addEventListener('click', () => inviteToSpace());
        box.append(inv);
      }
      return;
    }
    if (!S.resource) { box.append(el('div', 'set-hint', '先打开一个页面。')); return; }
    const list = el('div');
    for (const c of (S.comments || [])) {
      const row = el('div', 'space-comment');
      row.append(el('div', 'cm-meta', (c.authorName || '成员') + ' · ' + new Date(c.createdAt).toLocaleString() + (c.resolved ? ' · 已解决' : '')));
      row.append(el('div', 'cm-body', c.body || ''));
      const act = el('button', 'cm-act', c.resolved ? '重新打开' : '标记解决');
      act.type = 'button';
      act.addEventListener('click', async () => {
        const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/comments/' + encodeURIComponent(c.id), { method: 'PATCH', body: { resolved: !c.resolved } });
        if (r.ok) loadComments(); else flashHint('操作失败');
      });
      row.append(act);
      list.append(row);
    }
    if (!(S.comments || []).length) list.append(el('div', 'set-hint', '还没有评论。'));
    box.append(list);
    const form = el('div', 'space-cmt-form');
    const ta = document.createElement('textarea');
    ta.placeholder = '评论这一段…（用成员列表 @）';
    const sel = document.createElement('select');
    sel.multiple = true;
    sel.size = Math.min(4, Math.max(2, (S.space.members || []).length));
    for (const m of (S.space.members || [])) {
      const o = document.createElement('option');
      o.value = m.userId;
      o.textContent = '@' + (m.name || m.userId);
      sel.append(o);
    }
    const btn = el('button', 'primary', '发评论');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      const body = ta.value.trim();
      if (!body) { flashHint('评论不能为空'); return; }
      const mentions = [...sel.selectedOptions].map((o) => o.value);
      const active = (S.resource.entities || []).find((e) => e.id === S.activeEntity);
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id) + '/comments', {
        method: 'POST',
        body: { body, mentions, anchor: active ? { entityId: active.id, quote: String((active.payload && active.payload.text) || '').slice(0, 80) } : null },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { flashHint(j.error || '评论失败'); return; }
      ta.value = '';
      await loadComments();
    });
    form.append(ta, sel, btn);
    box.append(form);
  }

  function diffLines(a, b) {
    const al = String(a || '').split('\n'), bl = String(b || '').split('\n');
    const out = [];
    const n = Math.max(al.length, bl.length);
    for (let i = 0; i < n && out.length < 80; i++) {
      if ((al[i] || '') === (bl[i] || '')) continue;
      if (al[i] != null) out.push('- ' + al[i].slice(0, 160));
      if (bl[i] != null) out.push('+ ' + bl[i].slice(0, 160));
    }
    return out;
  }

  async function installExtension() {
    if (!S.space) return;
    const name = (prompt('扩展名称', '新扩展') || '').trim();
    if (!name) return;
    const html = (prompt('粘贴扩展的 HTML（内联脚本可用，禁止外部资源）') || '').trim();
    if (!html) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/extensions', { method: 'POST', body: { name, html, manifest: { name, apiVersion: 1 } } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '安装失败'); return; }
    await openSpace(S.space.id);
    S.tab = 'apps';
    $('#tabApps').classList.add('on'); $('#tabComments').classList.remove('on'); $('#tabMembers').classList.remove('on');
    setSide(true);
    flashHint('扩展已安装');
  }


  async function generateExtension() {
    if (!S.space) return;
    const promptText = (prompt('描述你要的扩展（例如：一个字帖小工具）', '') || '').trim();
    if (!promptText) return;
    flashHint('AI 正在生成扩展…');
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/extensions/generate', { method: 'POST', timeout: 120000, body: { prompt: promptText } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '生成失败'); return; }
    await openSpace(S.space.id);
    S.tab = 'apps';
    $('#tabApps').classList.add('on'); $('#tabComments').classList.remove('on'); $('#tabMembers').classList.remove('on');
    setSide(true);
    flashHint('扩展已生成，点「打开」试试');
  }


  async function joinSpace() {
    const code = (prompt('输入空间邀请码') || '').trim();
    if (!code) return;
    const r = await api('/spaces/join', { method: 'POST', body: { code } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '加入失败'); return; }
    S.spaces = null;
    await loadSpaces(true);
    await openSpace(j.spaceId);
    flashHint('已加入空间');
  }
  async function inviteToSpace() {
    if (!S.space) return;
    const role = (prompt('邀请角色：editor / commenter / viewer', 'editor') || 'editor').trim();
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/invites', { method: 'POST', body: { role } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '生成失败'); return; }
    prompt('邀请码（7 天有效，可发给同事）', j.invite.code);
  }

  async function addMember() {
    if (!S.space) return;
    const name = (prompt('成员昵称（需已登录过本站）') || '').trim();
    if (!name) return;
    const role = (prompt('角色：editor / commenter / viewer', 'editor') || 'editor').trim();
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/members', { method: 'POST', body: { name, role } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '添加失败'); return; }
    await openSpace(S.space.id);
    flashHint('已加入空间');
  }
  function closeList() { const d = $('#dlgList'); if (d) d.hidden = true; }
  function addSpaceMenu() {
    openListPanel('新建或加入空间', '公开 / 私人之后可以随时切换', [
      { label: '新建公开空间', sub: '所有人能看能编辑，不用邀请', onClick: () => createSpace('public') },
      { label: '🔒 新建私人空间', sub: '只有你和你加进来的成员能看', onClick: () => createSpace('private') },
      { label: '用邀请码加入', sub: '别人发给你的空间邀请码', onClick: () => { closeList(); joinSpace(); } },
    ]);
  }
  async function createSpace(visibility) {
    closeList();
    const title = (prompt(visibility === 'private' ? '私人空间名称' : '空间名称', '新空间') || '').trim();
    if (!title) return;
    const r = await api('/spaces', { method: 'POST', body: { title, visibility } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '创建失败'); return; }
    S.spaces = null;
    await loadSpaces(true);
    await openSpace(j.space.id);
    // 旧后端不认 visibility：空间实际只有成员能看，说清楚
    if (visibility === 'public' && !visOf(j.space)) flashHint('后端还不支持公开空间，这个空间暂时只有成员能看');
  }
  async function toggleVisibility() {
    if (!S.space) return;
    const next = visOf(S.space) === 'private' ? 'public' : 'private';
    const tip = next === 'private'
      ? '设为私人空间？之后只有成员能看，没加入的人会立刻失去访问。'
      : '设为公开空间？所有人都能看到并编辑这个空间里的页面。';
    if (!confirm(tip)) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id), { method: 'PATCH', body: { visibility: next } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404 || r.status === 405) { flashHint('后端还不支持切换公开 / 私人'); return; }
    if (!r.ok) { flashHint(j.error || '切换失败'); return; }
    S.spaces = null;
    await loadSpaces(true);
    await openSpace(S.space.id);
    flashHint(next === 'private' ? '已设为私人空间' : '已设为公开空间');
  }
  function createPage() {
    if (!S.space) return;
    const make = async (type) => {
      closeList();
      const title = (prompt(type === 'canvas' ? '画布标题' : '页面标题', type === 'canvas' ? '新画布' : '新页面') || '').trim();
      if (!title) return;
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources', { method: 'POST', body: { type, title } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { flashHint(j.error || '新建失败'); return; }
      await openSpace(S.space.id, j.resource && j.resource.id);
    };
    openListPanel('新建', '在「' + (S.space.title || '空间') + '」里', [
      { label: '页面', sub: '写文字，按段落分块', onClick: () => make('page') },
      { label: '画布', sub: '白板：卡片、便签、图片、连线', onClick: () => make('canvas') },
    ]);
  }
  async function showNotifications() {
    const r = await api('/notifications?limit=20');
    const j = await r.json().catch(() => ({ items: [] }));
    const items = Array.isArray(j.items) ? j.items : [];
    const rows = items.map((n) => ({
      label: (n.kind === 'mention' ? '@ 提及 · ' : '') + (n.body || ''),
      sub: new Date(n.createdAt).toLocaleString() + (n.readAt ? ' · 已读' : ''),
      onClick: async () => { closeList(); if (n.spaceId) { state.view = 'spaces'; renderAll(); await openSpace(n.spaceId, n.resourceId || undefined); } },
    }));
    if (!rows.length) rows.push({ label: '还没有通知', sub: '' });
    openListPanel('通知', items.length ? '最近 ' + items.length + ' 条' : '空间里的 @ 会出现在这里', rows);
    if (items.some((n) => !n.readAt)) api('/notifications/read', { method: 'POST', body: {} }).catch(() => {});
  }
  async function enterSpaces() {
    if (!await flushSave()) return;
    state.view = 'spaces';
    renderAll();
    try { await loadSpaces(true); } catch (e) {}
    const list = S.spaces || [];
    if (!list.length) { S.space = null; S.resource = null; render(); return; }
    const keep = S.space && list.some((x) => x.id === S.space.id) ? S.space.id : '';
    const last = readLS('ai.lastSpace');
    await openSpace(keep || (list.some((x) => x.id === last) ? last : list[0].id), keep && S.resource ? S.resource.id : undefined);
  }
  $('#navSpaces').addEventListener('click', () => { enterSpaces().catch(() => {}); });
  $('#newSpaceBtn').addEventListener('click', () => addSpaceMenu());
  $('#emptyNewSpace').addEventListener('click', () => addSpaceMenu());
  $('#joinSpaceBtn').addEventListener('click', () => joinSpace());
  $('#newResourceBtn').addEventListener('click', () => createPage());
  $('#spaceNotif').addEventListener('click', () => showNotifications());
  $('#spaceAddMember').addEventListener('click', () => addMember());
  $('#treeToggle').addEventListener('click', (ev) => { ev.stopPropagation(); setTree(!S.treeOpen); });
  document.querySelector('.space-main').addEventListener('pointerdown', (ev) => {
    if (narrow() && S.treeOpen && !ev.target.closest('#treeToggle')) setTree(false);
  });
  $('#sidePanelBtn').addEventListener('click', () => setSide(!S.sideOpen));
  $('#sideCloseBtn').addEventListener('click', () => setSide(false));
  if ($('#spaceVisBtn')) $('#spaceVisBtn').addEventListener('click', () => toggleVisibility());

  async function toggleCanvasFocus() {
    const page = $('#spacesPage');
    if (!page || !S.resource || S.resource.type !== 'canvas') return;
    const on = !S.canvasFocus;
    S.canvasFocus = on;
    page.classList.toggle('canvas-focus', on);
    $('#canvasFullBtn').textContent = on ? '退出全屏' : '⤢ 全屏';
    if (on) {
      try { await page.requestFullscreen(); } catch (e) {}
    } else {
      try { if (document.fullscreenElement === page) await document.exitFullscreen(); } catch (e) {}
    }
  }
  async function clearCanvasFocus() {
    const page = $('#spacesPage');
    if (!page) return;
    S.canvasFocus = false;
    page.classList.remove('canvas-focus');
    const btn = $('#canvasFullBtn');
    if (btn) btn.textContent = '⤢ 全屏';
    try { if (document.fullscreenElement === page) await document.exitFullscreen(); } catch (e) {}
  }
  document.addEventListener('fullscreenchange', () => {
    const page = $('#spacesPage');
    if (!document.fullscreenElement && S.canvasFocus && page) {
      S.canvasFocus = false;
      page.classList.remove('canvas-focus');
      const b = $('#canvasFullBtn');
      if (b) b.textContent = '⤢ 全屏';
    }
  });

  $('#canvasFullBtn').addEventListener('click', () => toggleCanvasFocus());
  $('#addBlockBtn').addEventListener('click', () => {
    if (!S.resource || S.resource.type === 'canvas') return;
    S.resource.entities = (S.resource.entities || []).concat([{ id: '', payload: { text: '' }, revision: 0 }]);
    renderEditor();
    scheduleSave();
    const tas = document.querySelectorAll('#pageEditor textarea');
    if (tas.length) tas[tas.length - 1].focus();
  });
  $('#spaceResTitle').addEventListener('input', () => scheduleSave());
  $('#tabComments').addEventListener('click', () => { S.tab = 'comments'; $('#tabComments').classList.add('on'); $('#tabMembers').classList.remove('on'); $('#tabApps').classList.remove('on'); renderSide(); });
  $('#tabMembers').addEventListener('click', () => { S.tab = 'members'; $('#tabMembers').classList.add('on'); $('#tabComments').classList.remove('on'); $('#tabApps').classList.remove('on'); renderSide(); });
  $('#tabApps').addEventListener('click', () => { S.tab = 'apps'; $('#tabApps').classList.add('on'); $('#tabComments').classList.remove('on'); $('#tabMembers').classList.remove('on'); renderSide(); });

  let selBar = null, selTarget = null;
  function ensureSelBar() {
    if (selBar) return selBar;
    selBar = document.createElement('div');
    selBar.className = 'space-selbar';
    const ask = document.createElement('button'); ask.type = 'button'; ask.textContent = '问 AI';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '修改';
    const cmt = document.createElement('button'); cmt.type = 'button'; cmt.textContent = '评论';
    ask.addEventListener('click', () => runSelectionAction('ask'));
    edit.addEventListener('click', () => runSelectionAction('edit'));
    cmt.addEventListener('click', () => {
      S.tab = 'comments';
      $('#tabComments').classList.add('on'); $('#tabMembers').classList.remove('on'); $('#tabApps').classList.remove('on');
      setSide(true);
      const ta = document.querySelector('.space-cmt-form textarea');
      if (ta) ta.focus();
      hideSelBar();
    });
    selBar.append(ask, edit, cmt);
    selBar.addEventListener('mousedown', (e) => e.preventDefault());
    document.body.append(selBar);
    return selBar;
  }
  function hideSelBar() { if (selBar) selBar.hidden = true; selTarget = null; }
  function readSelection(ta) {
    const from = ta.selectionStart, to = ta.selectionEnd;
    if (from == null || to == null || to <= from) return null;
    const text = ta.value.slice(from, to);
    if (!text.trim()) return null;
    return { from, to, text, id: ta.dataset.eid, revision: Number(ta.dataset.rev) || 0, ta };
  }
  function showSelBar(ta) {
    const sel = readSelection(ta);
    if (!sel) { hideSelBar(); return; }
    selTarget = sel;
    const bar = ensureSelBar();
    bar.hidden = false;
    const r = ta.getBoundingClientRect();
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, r.left + 8)) + 'px';
    bar.style.top = Math.max(8, r.top - 40) + 'px';
  }
  async function runSelectionAction(action) {
    const sel = selTarget;
    if (!sel || !S.resource || !S.space) return;
    const label = action === 'ask' ? '问 AI：想了解这段什么？' : '修改：希望怎么改？';
    const instruction = (prompt(label, action === 'ask' ? '解释这段内容' : '润色这段文字') || '').trim();
    if (!instruction) return;
    hideSelBar();
    $('#spaceSaveState').textContent = action === 'ask' ? 'AI 思考中…' : 'AI 修改中…';
    try {
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id) + '/ai', {
        method: 'POST', timeout: 90000,
        body: { action: action === 'edit' ? 'preview' : action, entityId: sel.id, expectedRevision: sel.revision, from: sel.from, to: sel.to, instruction },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('#spaceSaveState').textContent = ''; flashHint(j.error || 'AI 调用失败'); return; }
      if (action === 'ask') {
        $('#spaceSaveState').textContent = '';
        openListPanel('选区问答', '只回答，不改原文', [{ label: (j.answer || '').slice(0, 2000), sub: 'AI 回答' }]);
        return;
      }
      if (j.action === 'preview') {
        $('#spaceSaveState').textContent = '待确认';
        const diff = diffLines(sel.text, j.answer || '');
        openListPanel('修改建议', '确认应用后再写入页面', [
          ...(diff.length ? diff : ['没有差异']).map((t) => ({ label: t, sub: '' })),
          { label: '应用修改', sub: '应用后仍可撤销', onClick: async () => {
            const ar = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id) + '/ai', {
              method: 'POST', timeout: 60000,
              body: { action: 'apply', entityId: sel.id, expectedRevision: sel.revision, from: sel.from, to: sel.to, replacement: j.answer || '', instruction },
            });
            const aj = await ar.json().catch(() => ({}));
            if (!ar.ok) { flashHint(aj.error || '应用失败'); return; }
            S.resource = aj.resource || S.resource;
            renderEditor(); renderTree();
            $('#spaceSaveState').textContent = 'AI 已应用';
            flashHint('已应用修改');
          } },
        ]);
        return;
      }
      S.resource = j.resource || S.resource;
      renderEditor();
      renderTree();
      $('#spaceSaveState').textContent = 'AI 已修改';
      openListPanel('AI 修改已应用', '只改了选中的范围', [{
        label: '撤销这次修改',
        sub: '如果之后又有人改过这段，会提示冲突',
        onClick: async () => {
          const rr = await api('/spaces/' + encodeURIComponent(S.space.id) + '/changes/' + encodeURIComponent(j.changeId) + '/undo', { method: 'POST', body: {} });
          const jj = await rr.json().catch(() => ({}));
          if (!rr.ok) { flashHint(jj.error || '撤销失败'); return; }
          await openResource(S.resource.id);
          flashHint('已撤销这次 AI 修改');
        },
      }]);
    } catch (e) {
      $('#spaceSaveState').textContent = '';
      flashHint('AI 调用失败：' + String((e && e.message) || e));
    }
  }
  function bindSelection() {
    const editor = $('#pageEditor');
    if (!editor) return;
    editor.addEventListener('mouseup', (e) => { if (e.target && e.target.tagName === 'TEXTAREA') showSelBar(e.target); });
    editor.addEventListener('keyup', (e) => { if (e.target && e.target.tagName === 'TEXTAREA' && (e.shiftKey || e.key === 'Shift')) showSelBar(e.target); });
    editor.addEventListener('blur', () => setTimeout(() => { if (selBar && !selBar.matches(':hover')) hideSelBar(); }, 200), true);
  }
  document.addEventListener('mousedown', (e) => { if (selBar && !selBar.hidden && !selBar.contains(e.target)) hideSelBar(); });
  bindSelection();
  return { render, openSpace, openPage };
}
