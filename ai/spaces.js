export function mountSpaces(ctx) {
  const { api, el, $, state, renderAll, openListPanel, flashHint, openPluginViewer, base } = ctx;
  const S = { spaces: null, space: null, resource: null, tab: 'comments', activeEntity: null, saveTimer: null, saving: false, conflict: false, comments: [] };
  function roleLabel(role) { return { owner: '所有者', editor: '编辑', commenter: '评论者', viewer: '只读', admin: '管理员' }[role] || role; }
  // 公开 / 私人：后端返回 visibility 字段后才显示，旧后端不显示，避免把只有成员能看的空间标成公开
  function visOf(s) { return s && (s.visibility === 'private' || s.visibility === 'public') ? s.visibility : null; }
  function visLabel(v) { return v === 'private' ? '私人空间：只有成员能看' : v === 'public' ? '公开空间：所有人能看能编辑' : ''; }
  /* ---------------- 维基缩略图只认标准宽度 ----------------
   * 维基 2025–2026 起只接受这些宽度的缩略图，其他宽度直接请求会返回 400（见 https://w.wiki/GHai）。
   * 不在列表里的宽度一律往下取到最近的标准宽度（比如以前存下的 1600 → 1280），保证一定能打开。 */
  const WIKI_STEPS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];
  function fixWikiThumb(u) {
    const m = /^(https?:\/\/(?:upload|thumb)\.wikimedia\.org\/[^?#]+\/thumb\/[^?#]+\/)(\d+)px-([^/?#]+(?:[?#].*)?)$/i.exec(String(u || ''));
    if (!m) return u;
    const n = Number(m[2]);
    if (WIKI_STEPS.includes(n)) return u;
    const std = WIKI_STEPS.filter((x) => x <= n).pop() || WIKI_STEPS[0];
    return m[1] + std + 'px-' + m[3];
  }
  /* ---------------- 站内对话框（替代浏览器 prompt / confirm） ----------------
   * fields: { name, label, type: text | textarea | choice | select, options: [[值, 名称, 说明]], value, placeholder, maxLength, readOnly, copy }
   * 确定 → 各字段的值；取消 / Esc / 点遮罩 → null */
  const ROLE_OPTIONS = [['editor', '编辑', '能改页面和画布'], ['commenter', '评论', '只能看和评论'], ['viewer', '只读', '只能看']];
  function ask(o) {
    return new Promise((resolve) => {
      const back = document.activeElement;
      const ov = el('div', 'overlay sp-dlg');
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      const card = el('form', 'card');
      card.noValidate = true;
      const h = el('h2', null, o.title);
      h.id = 'spDlgTitle' + Date.now();
      ov.setAttribute('aria-labelledby', h.id);
      card.append(h);
      if (o.sub) card.append(el('p', null, o.sub));
      const inputs = {};
      for (const f of (o.fields || [])) {
        const wrap = el('div', 'sd-field');
        if (f.label) wrap.append(el('label', 'sd-label', f.label));
        let inp;
        if (f.type === 'choice') {
          inp = el('div', 'sd-seg');
          inp.setAttribute('role', 'radiogroup');
          if (f.label) inp.setAttribute('aria-label', f.label);
          let cur = f.value != null ? f.value : f.options[0][0];
          const opts = [];
          const pick = (v, b) => { cur = v; for (const x of opts) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; } };
          f.options.forEach(([v, t, sub]) => {
            const b = el('button', 'sd-opt');
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.dataset.value = v;
            b.append(el('b', null, t));
            if (sub) b.append(el('span', null, sub));
            b.addEventListener('click', () => pick(v, b));
            b.addEventListener('keydown', (e) => {
              const i = opts.indexOf(b);
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); const n = opts[(i + 1) % opts.length]; n.click(); n.focus(); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); const n = opts[(i - 1 + opts.length) % opts.length]; n.click(); n.focus(); }
            });
            opts.push(b);
            inp.append(b);
          });
          pick(cur, opts.find((b) => b.dataset.value === String(cur)) || opts[0]);
          inp.getValue = () => cur;
        } else if (f.type === 'check') {
          inp = el('label', 'sd-check');
          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.checked = !!f.value;
          inp.append(cb, el('span', null, f.text || ''));
          inp.getValue = () => cb.checked;
        } else if (f.type === 'images') {
          // 图片网格：每张可勾选，带全选 / 全不选
          inp = el('div', 'sd-imgs');
          const picked = new Set(f.value || f.images.map((_, i) => i));
          const head = el('div', 'sd-imgs-head');
          const count = el('span', null, '');
          const all = el('button', 'sd-link', '全选'); all.type = 'button';
          const none = el('button', 'sd-link', '全不选'); none.type = 'button';
          head.append(count, all, none);
          const grid = el('div', 'sd-imgs-grid');
          const boxes = [];
          const upd = () => { count.textContent = '已选 ' + picked.size + ' / ' + f.images.length + ' 张'; boxes.forEach((b, i) => { b.cb.checked = picked.has(i); b.lab.classList.toggle('on', picked.has(i)); }); };
          f.images.forEach((im, i) => {
            const lab = el('label', 'sd-img');
            const cb = document.createElement('input'); cb.type = 'checkbox';
            const img = document.createElement('img');
            img.src = im.src; img.alt = im.label || ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
            img.addEventListener('load', () => { im.w = img.naturalWidth; im.h = img.naturalHeight; });
            img.addEventListener('error', () => lab.classList.add('broken'));
            lab.title = im.label || im.save || '';
            cb.addEventListener('change', () => { if (cb.checked) picked.add(i); else picked.delete(i); upd(); });
            lab.append(cb, img);
            grid.append(lab);
            boxes.push({ cb, lab });
          });
          all.addEventListener('click', () => { f.images.forEach((_, i) => picked.add(i)); upd(); });
          none.addEventListener('click', () => { picked.clear(); upd(); });
          inp.append(head, grid);
          upd();
          inp.getValue = () => [...picked].sort((a, b) => a - b);
        } else if (f.type === 'select') {
          inp = document.createElement('select');
          for (const [v, t] of f.options) inp.add(new Option(t, v));
          if (f.value != null) inp.value = f.value;
        } else {
          inp = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
          if (f.type === 'textarea') inp.rows = f.rows || 4; else inp.type = 'text';
          if (f.value != null) inp.value = f.value;
          if (f.placeholder) inp.placeholder = f.placeholder;
          if (f.maxLength) inp.maxLength = f.maxLength;
          if (f.readOnly) inp.readOnly = true;
        }
        inp.classList.add('sd-input');
        inp.dataset.name = f.name;
        const id = 'sd' + Math.random().toString(36).slice(2, 8);
        inp.id = id;
        const lab = wrap.querySelector('label');
        if (lab && !['choice', 'check', 'images'].includes(f.type)) lab.htmlFor = id;
        inputs[f.name] = inp;
        if (f.copy) {
          const row = el('div', 'sd-copyrow');
          const cp = el('button', 'ghost', '复制');
          cp.type = 'button';
          cp.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(inp.value); flashHint('已复制'); } catch (e) { inp.select(); flashHint('请按 Ctrl + C 复制'); }
          });
          row.append(inp, cp);
          wrap.append(row);
        } else wrap.append(inp);
        card.append(wrap);
      }
      const err = el('div', 'sd-err');
      err.hidden = true;
      err.setAttribute('role', 'alert');
      card.append(err);
      if (o.extra) card.append(o.extra((v) => close(v)));
      const row = el('div', 'btn-row');
      const cancel = el('button', 'ghost', o.cancel || '取消');
      cancel.type = 'button';
      const ok = el('button', 'primary' + (o.danger ? ' danger' : ''), o.ok || '确定');
      ok.type = 'submit';
      if (o.cancel === false) cancel.hidden = true;
      row.append(cancel, ok);
      card.append(row);
      ov.append(card);
      document.body.append(ov);
      const values = () => { const v = {}; for (const [k, i] of Object.entries(inputs)) v[k] = i.getValue ? i.getValue() : String(i.value || '').trim(); return v; };
      let closed = false;
      function close(result) {
        if (closed) return;
        closed = true;
        ov.remove();
        document.removeEventListener('keydown', onKey, true);
        try { if (back && back.focus) back.focus({ preventScroll: true }); } catch (e) {}
        resolve(result);
      }
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); } };
      document.addEventListener('keydown', onKey, true);
      cancel.addEventListener('click', () => close(null));
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(null); });
      card.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = values();
        const m = o.validate ? o.validate(v) : '';
        if (m) { err.textContent = m; err.hidden = false; return; }
        close(v);
      });
      // 多行输入框里 Ctrl + Enter 提交
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') { e.preventDefault(); card.requestSubmit(); } });
      const first = o.focusOk ? ok : (card.querySelector('input.sd-input:not([readonly]), textarea.sd-input, select.sd-input, .sd-opt.on') || ok);
      const focusFirst = () => { if (closed || document.activeElement === first) return; first.focus(); if (first.tagName === 'INPUT' || first.tagName === 'TEXTAREA') first.select(); };
      focusFirst();
      setTimeout(focusFirst, 0);
    });
  }
  /* ---------------- 聊天内容存到空间 ----------------
   * o: { title, text, textLabel, textDefault, images: [{ src 显示用, save 原地址, label }] } */
  const canEdit = (sp) => ['owner', 'editor', 'admin'].includes(sp.role);
  function splitTextBlocks(text, max) {
    const blocks = [];
    let cur = [];
    let fence = false;
    for (const line of String(text || '').split(/\r?\n/)) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (!fence && (/^#{1,6}\s/.test(line) || /^---+\s*$/.test(line)) && cur.join('').trim()) { blocks.push(cur.join('\n')); cur = []; }
      if (!fence && /^---+\s*$/.test(line)) continue;
      cur.push(line);
    }
    blocks.push(cur.join('\n'));
    const out = [];
    for (let b of blocks.map((x) => x.trim()).filter(Boolean)) {
      while (b.length > max) { let cut = b.lastIndexOf('\n', max); if (cut < max / 2) cut = max; out.push(b.slice(0, cut)); b = b.slice(cut).replace(/^\n/, ''); }
      out.push(b);
    }
    return out;
  }
  /** 把图片复制进空间：站内图片用登录态读取，外链能读到就读；读不到就保留原地址 */
  async function copyImageIntoSpace(im, sid, rid) {
    im = { ...im, src: fixWikiThumb(im.src), save: fixWikiThumb(im.save) };
    const save = im.save || im.src;
    try {
      let r;
      if (/^\/(files|oss)\//.test(save)) r = await api(save, { timeout: 60000 });
      else r = await fetch(im.src, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(blob.type) || blob.size > 25 * 1024 * 1024) throw new Error('类型不支持');
      const up = await api('/spaces/' + encodeURIComponent(sid) + '/resources/' + encodeURIComponent(rid) + '/images', { method: 'POST', raw: blob, mime: blob.type, timeout: 120000 });
      const j = await up.json().catch(() => ({}));
      if (up.ok && j.url) return { url: j.url, copied: true };
    } catch (e) {}
    return { url: /^https?:\/\//.test(im.src) ? im.src : save, copied: false };
  }
  async function saveToSpace(o) {
    let spaces = [];
    try { spaces = await loadSpaces(true); } catch (e) { flashHint('读不到空间列表'); return; }
    const writable = spaces.filter(canEdit);
    if (!writable.length) { flashHint(spaces.length ? '你在现有空间里都没有编辑权限' : '还没有空间，先在左侧「空间」新建一个'); return; }
    const images = o.images || [];
    const hasText = !!String(o.text || '').trim();
    if (!hasText && !images.length) { flashHint('没有可存的内容'); return; }
    const last = readLS('ai.saveSpaceLast');
    const fields = [];
    if (hasText) fields.push({ name: 'withText', type: 'check', text: (o.textLabel || '文字') + '（约 ' + String(o.text).length + ' 字）', value: o.textDefault !== false });
    if (images.length) fields.push({ name: 'imgs', type: 'images', label: '图片', images });
    fields.push({ name: 'space', label: '存到空间', type: 'select', options: writable.map((sp) => [sp.id, (visOf(sp) === 'private' ? '🔒 ' : '') + (sp.title || '未命名空间')]), value: writable.some((sp) => sp.id === last) ? last : (S.space && writable.some((sp) => sp.id === S.space.id) ? S.space.id : writable[0].id) });
    fields.push({ name: 'where', label: '放到', type: 'choice', value: images.length ? 'canvas' : 'page', options: [['canvas', '新画布', '文字一张卡，图片排成网格'], ['page', '新页面', '只放文字；图片写成链接'], ['existing', '已有画布或页面', '追加在原内容后面']] });
    fields.push({ name: 'title', label: '新建时的标题', value: String(o.title || '来自对话').slice(0, 120), maxLength: 120 });
    const got = await ask({ title: '存到空间', fields, ok: '存进去', validate: (v) => (!v.withText && !(v.imgs || []).length) ? '至少选一项内容' : (v.where !== 'existing' && !v.title ? '请填写标题' : '') });
    if (!got) return;
    writeLS('ai.saveSpaceLast', got.space);
    const sid = got.space;
    const text = got.withText ? String(o.text || '') : '';
    const pickedImgs = (got.imgs || []).map((i) => images[i]).filter(Boolean);
    // 目标：新建，或从已有的里选
    let res = null;
    if (got.where === 'existing') {
      const r = await api('/spaces/' + encodeURIComponent(sid));
      const j = await r.json().catch(() => ({}));
      const list = (j.space && j.space.resources) || [];
      if (!list.length) { flashHint('这个空间还没有页面或画布，改选「新画布」或「新页面」'); return; }
      const pick = await ask({ title: '追加到哪里', sub: pickedImgs.length ? '图片放进画布会排成网格；放进页面会写成链接。' : '', fields: [{ name: 'rid', label: '页面或画布', type: 'select', options: list.map((x) => [x.id, (x.type === 'canvas' ? '画布 · ' : '页面 · ') + (x.title || '未命名')]) }], ok: '追加' });
      if (!pick) return;
      const rr = await api('/spaces/' + encodeURIComponent(sid) + '/resources/' + encodeURIComponent(pick.rid));
      const jj = await rr.json().catch(() => ({}));
      if (!rr.ok || !jj.resource) { flashHint(jj.error || '打不开这个页面'); return; }
      res = jj.resource;
    } else {
      const type = got.where === 'canvas' ? 'canvas' : 'page';
      const r = await api('/spaces/' + encodeURIComponent(sid) + '/resources', { method: 'POST', body: { type, title: got.title } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.resource) { flashHint(j.error || '新建失败'); return; }
      res = j.resource;
      if (type === 'page') res.entities = []; // 新页面自带的空块不要
    }
    const sidE = encodeURIComponent(sid), ridE = encodeURIComponent(res.id);
    // 图片先复制进空间
    const urls = [];
    let copied = 0;
    for (let i = 0; i < pickedImgs.length; i++) {
      flashHint('正在存图片 ' + (i + 1) + ' / ' + pickedImgs.length + '…');
      const c = await copyImageIntoSpace(pickedImgs[i], sid, res.id);
      if (c.copied) copied += 1;
      urls.push({ url: c.url, im: pickedImgs[i] });
    }
    const keep = (res.entities || []).map((e) => ({ id: e.id, expectedRevision: e.revision, payload: e.payload }));
    let added = [];
    if (res.type === 'canvas') {
      let y0 = 40;
      for (const e of res.entities || []) { const p = e.payload || {}; y0 = Math.max(y0, (Number(p.y) || 0) + (Number(p.h) || 160) + 80); }
      y0 = Math.min(y0, CV.WORLD);
      let x = 40, y = y0;
      if (text) {
        // 卡片最多 4000 字：长文字拆成几张并排
        const parts = [];
        let t = text;
        while (t.length > 3800) { let cut = t.lastIndexOf('\n', 3800); if (cut < 1900) cut = 3800; parts.push(t.slice(0, cut)); t = t.slice(cut).replace(/^\n/, ''); }
        parts.push(t);
        let rowH = 0;
        parts.forEach((pt, i) => {
          const h = clamp(Math.ceil(pt.length / 26) * 21 + 40, 120, CV.MAXH);
          added.push({ payload: { type: 'text', text: pt, x: x + i * 460, y, w: 420, h } });
          rowH = Math.max(rowH, h);
        });
        y += rowH + 60;
      }
      const cols = 3, cw = 300;
      let rowH = 0;
      urls.forEach((u, i) => {
        const ratio = u.im.w && u.im.h ? u.im.h / u.im.w : 0.75;
        const h = clamp(Math.round(cw * ratio), CV.MINH, CV.MAXH);
        if (i && i % cols === 0) { y += rowH + 40; rowH = 0; }
        added.push({ payload: { type: 'image', url: u.url, text: (u.im.label || '').slice(0, 200), x: x + (i % cols) * (cw + 40), y: Math.min(y, CV.WORLD), w: cw, h } });
        rowH = Math.max(rowH, h);
      });
    } else {
      added = splitTextBlocks(text, 20000).map((t) => ({ payload: { text: t } }));
      if (urls.length) added.push({ payload: { text: '图片：\n' + urls.map((u) => (u.im.label ? u.im.label + '：' : '') + (/^\//.test(u.url) ? base() + u.url : u.url)).join('\n') } });
    }
    const entities = keep.concat(added).slice(0, 200);
    const pr = await api('/spaces/' + sidE + '/resources/' + ridE, { method: 'PUT', timeout: 60000, body: { baseRevision: res.revision, title: res.title, entities, edges: res.type === 'canvas' ? (res.edges || []) : undefined } });
    const pj = await pr.json().catch(() => ({}));
    if (!pr.ok) { flashHint('存的时候出错：' + (pj.error || ('HTTP ' + pr.status))); return; }
    const spTitle = (writable.find((x) => x.id === sid) || {}).title || '空间';
    const parts = [];
    if (text) parts.push('文字');
    if (urls.length) parts.push(urls.length + ' 张图片' + (urls.length > copied ? '（' + (urls.length - copied) + ' 张没能复制，保留原链接）' : ''));
    const open = await ask({ title: '已存到空间', sub: '「' + spTitle + '」·「' + (res.title || '未命名') + '」：' + parts.join('、') + '。', ok: '打开', cancel: '留在这里', focusOk: true });
    if (open) await openPage(sid, res.id);
  }
  const askConfirm = (title, sub, okText, danger) => ask({ title, sub, ok: okText || '确定', danger }).then((v) => !!v);
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
    // 同一个空间、同一页已经画好时不重建：外面（聊天的定时同步等）每次重画都会走到这里，
    // 重建画布或页面会把选中、正在输入的文字、打开的菜单全部打断
    const same = S.drawn && S.drawn.space === S.space && S.drawn.res === S.resource && !!$('#pageEditor').childElementCount;
    if (same) return;
    S.drawn = { space: S.space, res: S.resource };
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
        if (S.resource?.id === r.id) return;
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
  let providersP = null;
  let providersCache = null;
  function loadProviders() {
    if (!providersP) {
      providersP = api('/ai/providers').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
        const fb = [{ id: 'openai', name: 'OpenAI', available: true }];
        providersCache = j && (Array.isArray(j.image) || Array.isArray(j.text))
          ? { image: Array.isArray(j.image) && j.image.length ? j.image : fb, text: Array.isArray(j.text) && j.text.length ? j.text : fb }
          : { image: fb, text: fb, fallback: true };
        return providersCache;
      });
    }
    return providersP;
  }
  const providerName = (kind, id) => { const list = (providersCache && providersCache[kind]) || []; const f = list.find((x) => x.id === id); return f ? f.name : (id === 'openai' || !id ? 'OpenAI' : id); };
  const cvAlias = new Map();
  const cvViews = new Map();
  const cvHist = new Map();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  /** 节点类卡片：AI 节点、搜图、标注 */
  const isNodeType = (t) => /^(ai-|img-search$|annot$)/.test(String(t || ''));
  const resolveKey = (k) => { let x = k; for (let i = 0; i < 8 && cvAlias.has(x); i++) x = cvAlias.get(x); return x; };
  function keyOf(e) {
    if (!e.id && !e._tmp) e._tmp = 'tmp_' + Math.random().toString(36).slice(2, 10);
    return e.id || e._tmp;
  }
  function normPayload(e) {
    const p = e.payload = { ...(e.payload || {}) };
    p.type = ['text', 'image', 'file', 'page', 'ai-image', 'ai-text', 'img-search', 'annot'].includes(p.type) ? p.type : 'text';
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
    const st = cv = { res, sel: new Set(), edgeSel: -1, edgeSet: new Set(), running: new Set(), errors: new Map(), rel: null, editing: null, cards: new Map(), spaceDown: false, gesture: null };
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
    const help = el('button', 'cv-help', '? 操作说明');
    help.type = 'button';
    help.title = '画布操作说明';
    const helpBox = el('div', 'cv-helpbox');
    helpBox.hidden = true;
    helpBox.innerHTML = '<div class="hb-head"><b>画布操作说明</b><button type="button" class="hb-x" aria-label="关闭">×</button></div><div class="hb-sec">看画布</div><div class="hb-row"><span>缩放</span><em>鼠标滚轮；触控板双指捏合；Ctrl + 滚轮</em></div><div class="hb-row"><span>移动画布</span><em>按住右键 / 中键 / 空格拖动；触控板两指滑动；Shift + 滚轮横向</em></div><div class="hb-row"><span>看全部</span><em>底部「适应」，或 Shift + 1；点百分比回到 100%</em></div><div class="hb-sec">卡片</div><div class="hb-row"><span>新建</span><em>双击空白处；或把底部的文本、便签、图片、页面拖到画布上（点一下放在画面中央）</em></div><div class="hb-row"><span>编辑文字</span><em>双击卡片，或选中后按 Enter；Esc 结束</em></div><div class="hb-row"><span>移动 / 改大小</span><em>拖动卡片；拖右下角；方向键微调（Shift 步长 10）</em></div><div class="hb-row"><span>对齐</span><em>拖动时靠近其他卡片会出现红色辅助线并吸附；按住 Alt 不吸附</em></div><div class="hb-row"><span>样式</span><em>选中后在浮出的工具条里改颜色、形状、字号、对齐、层级，或用 AI 修改文字</em></div><div class="hb-sec">选择</div><div class="hb-row"><span>多选</span><em>Shift / Ctrl + 点击；在空白处拖框（连线也能框中）；Ctrl + A 全选</em></div><div class="hb-row"><span>删除</span><em>Delete / Backspace</em></div><div class="hb-sec">连线</div><div class="hb-row"><span>连线</span><em>按住 Shift，从一张卡拖到另一张卡；或拖卡片边上的小圆点</em></div><div class="hb-row"><span>文字 / 样式</span><em>双击连线写文字；单击连线可改虚线、箭头、方向或删除</em></div><div class="hb-sec">AI 节点</div><div class="hb-row"><span>新建</span><em>底部「AI」选生图 / 生文 / 改图 / 改文；或选中图片、文字卡后点工具条「AI」</em></div><div class="hb-row"><span>输入</span><em>连进节点的卡片就是素材（文字、图片、上游节点的结果）</em></div><div class="hb-row"><span>生成</span><em>点「生成」或 Ctrl + Enter；下方可展开 AI 实际使用的提示词</em></div><div class="hb-row"><span>结果</span><em>「存为新卡片」；改文可「替换原卡片」；选中卡片会高亮它的上游和下游</em></div><div class="hb-sec">搜图与标注</div><div class="hb-row"><span>看大图</span><em>双击图片卡，或选中后点工具条「大图」；搜图节点里双击一张；← → 切换，点图看原始大小</em></div><div class="hb-row"><span>复制</span><em>Ctrl + C 站内复制卡片（不重复占空间）；Ctrl + Shift + C 复制图像，可粘贴到别的软件；Ctrl + Alt + C 复制提示词；右键卡片也有这些</em></div><div class="hb-row"><span>搜图</span><em>底部「AI」→ 搜图，或从文字卡拖线选「用它搜图」；节点右上角切换来源（全网、Pexels 图库、开放图库、维基共享资源）；点一张选中，按住拖到画布上拿出来（存 1280 宽的版本）；选中拿出来的图，工具条「原图页面」可以打开来源页看原图</em></div><div class="hb-row"><span>拖线到空白</span><em>从卡片拖出连线，在空白处松手，选要做什么（标注、改图、看图写文字、文本卡…）</em></div><div class="hb-row"><span>标注</span><em>选「标注图片」，或双击标注节点：箭头、方框、椭圆、画笔、文字、序号；原图不变</em></div><div class="hb-sec">复制与粘贴</div><div class="hb-row"><span>复制</span><em>Ctrl + C / X / V（连同卡片之间的连线，可跨画布）；Ctrl + D 原地复制</em></div><div class="hb-row"><span>粘贴外部内容</span><em>截图或图片直接 Ctrl + V 上传；文字变文本卡；图片链接变图片卡；也可以把图片文件拖进来</em></div><div class="hb-row"><span>撤销 / 重做</span><em>Ctrl + Z / Ctrl + Shift + Z</em></div>';
    box.append(world, marquee, bar, tools, empty, help, helpBox);
    on(help, 'click', (ev) => { ev.stopPropagation(); helpBox.hidden = !helpBox.hidden; });
    on(helpBox.querySelector('.hb-x'), 'click', (ev) => { ev.stopPropagation(); helpBox.hidden = true; });
    // 第一次打开画布时自动弹出一次说明
    if (readLS('ai.canvasHelpSeen') !== '1') { helpBox.hidden = false; writeLS('ai.canvasHelpSeen', '1'); }

    /* 视图 */
    let viewTimer = null;
    /* 平移、缩放的过程中才开 will-change（流畅）；停下 150 毫秒后关掉，让浏览器按当前比例重新画文字，
     * 否则 Chrome 一直拿 100% 时画好的位图去拉伸，缩放后文字和边框都是糊的。位移取整，避免半像素发虚。 */
    let crispT = 0;
    function applyView() {
      world.style.transform = 'translate(' + Math.round(view.x) + 'px,' + Math.round(view.y) + 'px) scale(' + view.z + ')';
      world.classList.add('moving');
      clearTimeout(crispT);
      crispT = setTimeout(() => world.classList.remove('moving'), 150);
      if (zoomBtn) zoomBtn.textContent = Math.round(view.z * 100) + '%';
      cvViews.set(res.id, { ...view });
      clearTimeout(viewTimer);
      viewTimer = setTimeout(() => writeLS('ai.canvasView.' + res.id, JSON.stringify(view)), 400);
      placeBar();
      sharpenSoon();
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
      st.sel.clear(); clearEdgeSel();
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
        img.src = p.url.startsWith('/files/') || p.url.startsWith('/oss/') ? base() + p.url : fixWikiThumb(p.url); img.alt = p.text || '图片'; img.draggable = false; img.loading = 'lazy';
        card.append(img);
      } else if (p.type === 'ai-image' || p.type === 'ai-text') {
        buildAiNode(e, card);
      } else if (p.type === 'img-search') {
        buildSearchNode(e, card);
      } else if (p.type === 'annot') {
        buildAnnotNode(e, card);
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
    /* ---------------- AI 节点 ---------------- */
    const AI_ICON = {
      image: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg>',
      text: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 11h16M4 16h10"/></svg>',
      spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z"/></svg>',
      search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
      pen: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    };
    const AI_CHIPS = {
      'ai-text': ['润色这段文字', '总结成三条要点', '翻译成英文', '扩写成一段完整的介绍', '提取关键词', '描述这张图片'],
      'ai-image': ['按图上的标注修改', '换个画风', '换个背景', '增加细节，画质更高'],
    };
    const SIZES = [['1024x1024', '方形'], ['1536x1024', '横版'], ['1024x1536', '竖版']];
    /** 连进这个节点的卡片就是输入：文字卡、便签、图片卡、上游节点的结果 */
    function nodeInputs(e) {
      const k = keyOf(e);
      const out = [];
      for (const ed of edges()) {
        if (resolveKey(ed.to) !== k) continue;
        const src = byKey(ed.from);
        if (!src) continue;
        const sp = src.payload, from = keyOf(src);
        if ((sp.type === 'image' || sp.type === 'ai-image') && sp.url) out.push({ type: 'image', url: fixWikiThumb(sp.url), from });
        else if (sp.type === 'ai-text' && (sp.output || '').trim()) out.push({ type: 'text', text: sp.output, from });
        else if ((sp.type === 'text' || sp.type === 'file') && (sp.text || '').trim()) out.push({ type: 'text', text: sp.text, from });
        else if (sp.type === 'annot' && (sp.url || sp.src)) {
          out.push({ type: 'image', url: fixWikiThumb(sp.url || sp.src), from });
          const notes = (sp.annots || []).filter((a) => a.t === 'text' && a.s).map((a) => a.s);
          const nums = (sp.annots || []).filter((a) => a.t === 'num').length;
          if (notes.length || nums) out.push({ type: 'text', text: '图上的标注：' + notes.map((t, i) => (i + 1) + '. ' + t).join('；') + (nums ? '（图中有 ' + nums + ' 个序号标记）' : ''), from });
        } else if (sp.type === 'img-search') { const r = (sp.results || [])[sp.picked]; if (r && r.url) out.push({ type: 'image', url: fixWikiThumb(r.url), from }); }
        else if (sp.type === 'page') { const r = pageOf(sp); if (r) out.push({ type: 'text', text: '（空间里的页面：' + (r.title || '未命名') + '）', from }); }
      }
      return out;
    }
    /** 一张卡能拿出的图片：图片卡、生图结果、标注成图（没有就用原图）、搜图选中的那张 */
    function imageOfCard(e) {
      const p = e && e.payload;
      if (!p) return '';
      if ((p.type === 'image' || p.type === 'ai-image') && p.url) return p.url;
      if (p.type === 'annot') return p.url || p.src || '';
      if (p.type === 'img-search') { const r = (p.results || [])[p.picked]; return (r && r.url) || ''; }
      return '';
    }
    function textOfCard(e) {
      const p = e && e.payload;
      if (!p) return '';
      if (p.type === 'text' || p.type === 'file') return p.text || '';
      if (p.type === 'ai-text') return p.output || '';
      return '';
    }
    /** 图片卡的来源页：搜图时记下的 source / ref；还是维基外链时直接从地址推算文件页 */
    function sourceOfCard(p) {
      if (!p) return '';
      if (/^https?:\/\//i.test(p.source || '')) return p.source;
      if (/^https?:\/\//i.test(p.ref || '')) return p.ref;
      const m = /^https?:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i.exec(p.url || '');
      return m ? 'https://commons.wikimedia.org/wiki/File:' + m[1] : '';
    }
    const shownUrl = (u) => (/^\/(files|oss)\//.test(u || '') ? base() + u : fixWikiThumb(u || ''));
    /** 图片的高宽比：先看卡片上已加载的图，再看搜图结果里的尺寸 */
    function ratioOfCard(e) {
      const c = st.cards.get(keyOf(e));
      const img = c && c.querySelector('img');
      if (img && img.naturalWidth) return img.naturalHeight / img.naturalWidth;
      const p = e.payload;
      if (p.type === 'img-search') { const r = (p.results || [])[p.picked]; if (r && r.w && r.h) return r.h / r.w; }
      if (p.ar) return p.ar;
      if (p.w && p.h && p.type === 'image') return p.h / p.w;
      return 0.75;
    }
    function aiTitle(p, ins) {
      if (p.type === 'ai-image') return p.mode === 'edit' || ins.some((i) => i.type === 'image') ? '改图' : '生图';
      return p.mode === 'edit' ? '改文' : '生文';
    }
    function buildAiNode(e, card) {
      const p = e.payload;
      const kind = p.type === 'ai-image' ? 'image' : 'text';
      const wrap = el('div', 'an-wrap');
      const head = el('div', 'an-head');
      const ic = el('span', 'an-ic'); ic.innerHTML = AI_ICON[kind];
      const title = el('span', 'an-title');
      const prov = el('button', 'an-chip an-ui an-prov'); prov.type = 'button'; prov.title = '选择 AI 服务';
      head.append(ic, title, el('span', 'an-gap'), prov);
      if (kind === 'image') { const sz = el('button', 'an-chip an-ui an-size'); sz.type = 'button'; sz.title = '图片尺寸'; head.append(sz); }
      const run = el('button', 'an-run an-ui'); run.type = 'button';
      head.append(run);
      const ta = document.createElement('textarea');
      ta.className = 'an-ins';
      ta.value = p.text || '';
      ta.readOnly = true;
      ta.dataset.eid = e.id || '';
      ta.placeholder = kind === 'image' ? '双击写需求，比如：一只在雨里打伞的柴犬，水彩风' : '双击写要求，比如：把连进来的要点整理成一段介绍';
      on(ta, 'input', () => { e.payload = { ...e.payload, text: ta.value }; scheduleSave(); });
      on(ta, 'blur', () => stopEdit());
      on(ta, 'keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ta.blur(); box.focus({ preventScroll: true }); }
        else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); ta.blur(); runNode(keyOf(e)); }
        ev.stopPropagation();
      });
      const chips = el('div', 'an-chips an-ui');
      for (const c of AI_CHIPS[p.type]) {
        const b = el('button', 'an-pre', c.replace(/(这段文字|成三条要点|成一段完整的介绍|这张图片|，画质更高)$/, ''));
        b.type = 'button'; b.title = c;
        if (c === '按图上的标注修改') b.textContent = '按标注修改';
        b.addEventListener('click', () => { const cur = byKey(card.dataset.key); if (!cur) return; const s0 = snap(); cur.payload = { ...cur.payload, text: c }; ta.value = c; pushUndo(s0); scheduleSave(); });
        chips.append(b);
      }
      const ins = el('div', 'an-inputs');
      const out = el('div', 'an-out');
      const det = document.createElement('details');
      det.className = 'an-prompt an-ui';
      const sum = document.createElement('summary'); sum.textContent = 'AI 实际使用的提示词';
      const pre = el('div', 'an-ptext an-scroll');
      const cp = el('button', 'an-mini', '复制'); cp.type = 'button';
      cp.addEventListener('click', async () => { const cur = byKey(card.dataset.key); try { await navigator.clipboard.writeText((cur && cur.payload.usedPrompt) || ''); flashHint('已复制提示词'); } catch (er) { flashHint('复制失败'); } });
      det.append(sum, pre, cp);
      const acts = el('div', 'an-acts an-ui');
      wrap.append(head, ta, chips, ins, out, det, acts);
      card.append(wrap);
      prov.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const pv = await loadProviders();
        const cur = byKey(card.dataset.key); if (!cur) return;
        const list = pv[kind] || [];
        const now = cur.payload.provider || (list.find((x) => x.default) || list[0] || {}).id || 'openai';
        popMenu(prov, list.map((x) => ({
          label: x.name, sub: x.available === false ? '即将接入' : (Array.isArray(x.models) && x.models.length ? x.models.slice(0, 2).join(' / ') : ''), on: x.id === now,
          onClick: () => { if (x.available === false) { flashHint(x.name + ' 还没接入，先用其他服务'); return; } const s0 = snap(); cur.payload = { ...cur.payload, provider: x.id, model: '' }; pushUndo(s0); renderAiNode(cur); scheduleSave(); },
        })).concat(pv.fallback ? [{ note: '后端还没有服务列表接口，暂时只显示 OpenAI' }] : []));
      });
      const szBtn = head.querySelector('.an-size');
      if (szBtn) szBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const cur = byKey(card.dataset.key); if (!cur) return;
        const now = cur.payload.size || '1024x1024';
        popMenu(szBtn, SIZES.map(([v, t]) => ({ label: t, sub: v.replace('x', ' × '), on: v === now, onClick: () => { const s0 = snap(); cur.payload = { ...cur.payload, size: v }; pushUndo(s0); renderAiNode(cur); scheduleSave(); } })));
      });
      run.addEventListener('click', (ev) => { ev.stopPropagation(); runNode(card.dataset.key); });
      loadProviders().then(() => { const cur = byKey(card.dataset.key); if (cur) renderAiNode(cur); });
      renderAiNode(e);
    }
    function renderAiNode(e) {
      const card = st.cards.get(keyOf(e));
      if (!card || !card.querySelector('.an-wrap')) return;
      const p = e.payload, k = keyOf(e);
      const kind = p.type === 'ai-image' ? 'image' : 'text';
      const ins = nodeInputs(e);
      const running = st.running.has(k), err = st.errors.get(k);
      card.querySelector('.an-title').textContent = aiTitle(p, ins);
      card.querySelector('.an-prov').textContent = providerName(kind, p.provider) + ' ▾';
      const sz = card.querySelector('.an-size');
      if (sz) sz.textContent = ((SIZES.find((x) => x[0] === (p.size || '1024x1024')) || SIZES[0])[1]) + ' ▾';
      const run = card.querySelector('.an-run');
      run.disabled = running;
      run.textContent = running ? '生成中…' : (p.url || p.output ? '重新生成' : '生成');
      run.title = 'Ctrl + Enter 也能生成';
      const ta = card.querySelector('.an-ins');
      if (document.activeElement !== ta && ta.value !== (p.text || '')) ta.value = p.text || '';
      const insBox = card.querySelector('.an-inputs');
      const insSig = JSON.stringify([p.mode, ins.map((i) => i.type === 'image' ? i.url : i.text.length)]);
      const outSig = JSON.stringify([running, err || '', p.url || '', (p.output || '').length, p.output ? p.output.slice(0, 40) : '']);
      const insSame = card._insSig === insSig, outSame = card._outSig === outSig;
      card._insSig = insSig; card._outSig = outSig;
      if (!insSame) insBox.textContent = '';
      if (insSame) { /* 输入没变 */ }
      else if (!ins.length) {
        insBox.append(el('span', 'an-hint', p.mode === 'edit' ? (kind === 'image' ? '把要改的图片连到这里（Shift + 拖动）' : '把要改的文字卡连到这里（Shift + 拖动）') : '可选：把文字卡或图片连到这里作为素材'));
      } else {
        const nt = ins.filter((i) => i.type === 'text').length, ni = ins.filter((i) => i.type === 'image').length;
        insBox.append(el('span', 'an-hint', '输入：' + [nt ? nt + ' 段文字' : '', ni ? ni + ' 张图片' : ''].filter(Boolean).join('，')));
        for (const i of ins.filter((x) => x.type === 'image').slice(0, 4)) {
          const im = document.createElement('img');
          im.src = /^\/(files|oss)\//.test(i.url) ? base() + i.url : i.url; im.alt = ''; im.draggable = false;
          insBox.append(im);
        }
      }
      const out = card.querySelector('.an-out');
      if (!outSame) out.textContent = '';
      out.className = 'an-out' + (kind === 'text' ? ' an-scroll an-ui' : '');
      if (outSame) { /* 结果没变 */ }
      else if (running) out.append(el('div', 'an-status', kind === 'image' ? 'AI 正在写提示词并画图…' : 'AI 正在写…'));
      else if (err) { const d = el('div', 'an-err', err); d.setAttribute('role', 'alert'); out.append(d); }
      else if (kind === 'image' && p.url) {
        const im = document.createElement('img');
        im.src = /^\/(files|oss)\//.test(p.url) ? base() + p.url : p.url; im.alt = p.usedPrompt || '生成的图片'; im.draggable = false;
        out.append(im);
      } else if (kind === 'text' && p.output) out.append(el('div', 'an-otext', p.output));
      else out.append(el('div', 'an-empty', kind === 'image' ? '生成的图片会显示在这里' : '生成的文字会显示在这里'));
      const det = card.querySelector('.an-prompt');
      det.hidden = !p.usedPrompt;
      det.querySelector('.an-ptext').textContent = p.usedPrompt || '';
      const acts = card.querySelector('.an-acts');
      acts.textContent = '';
      const has = kind === 'image' ? !!p.url : !!p.output;
      if (has && !running) {
        const keep = el('button', 'an-mini', '存为新卡片'); keep.type = 'button';
        keep.addEventListener('click', () => saveNodeResult(k));
        acts.append(keep);
        const src = kind === 'text' && p.mode === 'edit' ? ins.find((i) => i.type === 'text') : null;
        if (src) {
          const rp = el('button', 'an-mini', '替换原卡片'); rp.type = 'button';
          rp.addEventListener('click', () => replaceSource(k, src.from));
          acts.append(rp);
        }
        if (p.ranAt) acts.append(el('span', 'an-meta', providerName(kind, p.provider) + (p.model ? ' · ' + p.model : '')));
      }
    }
    /** 运行节点：把需求和连进来的输入交给后端，结果和实际提示词写回节点 */
    /** 生成前把连进来的外链图片复制进空间：后端只拿站内图片，避免模型服务去外站下载被限流（429）；
     *  复制成功后来源卡片的地址也换成空间地址，下次不用再复制 */
    async function localizeInputs(e) {
      const k = keyOf(e);
      const ext = (u) => /^https?:\/\//i.test(u || '');
      const tasks = [];
      for (const ed of edges()) {
        if (resolveKey(ed.to) !== k) continue;
        const src = byKey(ed.from);
        if (!src) continue;
        const sp = src.payload;
        if ((sp.type === 'image' || sp.type === 'ai-image') && ext(sp.url)) tasks.push({ key: keyOf(src), field: 'url', u: sp.url });
        else if (sp.type === 'annot' && !sp.url && ext(sp.src)) tasks.push({ key: keyOf(src), field: 'src', u: sp.src });
        else if (sp.type === 'img-search') { const r = (sp.results || [])[sp.picked]; if (r && ext(r.url)) tasks.push({ key: keyOf(src), field: 'result', i: sp.picked, u: r.url }); }
      }
      if (!tasks.length) return 0;
      flashHint('正在把 ' + tasks.length + ' 张参考图复制进空间…');
      let n = 0;
      for (const t of tasks) {
        const c = await copyImageIntoSpace({ src: t.u, save: t.u }, S.space.id, res.id);
        if (!c.copied || cv !== st) continue;
        const cur = byKey(t.key);
        if (!cur) continue;
        if (t.field === 'result') {
          const results = (cur.payload.results || []).slice();
          if (!results[t.i] || results[t.i].url !== t.u) continue;
          results[t.i] = { ...results[t.i], url: c.url };
          cur.payload = { ...cur.payload, results };
        } else {
          if (cur.payload[t.field] !== t.u) continue;
          cur.payload = { ...cur.payload, [t.field]: c.url };
        }
        n += 1;
        const card = st.cards.get(keyOf(cur));
        if (t.field === 'url' && card && card.querySelector(':scope > img')) card.querySelector(':scope > img').src = shownUrl(c.url);
        if (cur.payload.type === 'annot') renderAnnotNode(cur);
      }
      if (n) scheduleSave();
      return n;
    }
    async function runNode(k0) {
      const e = byKey(k0);
      if (!e) return;
      const k = keyOf(e), p = e.payload;
      if (st.running.has(k)) return;
      const kind = p.type === 'ai-image' ? 'image' : 'text';
      const instruction = (p.text || '').trim();
      let ins = nodeInputs(e);
      if (!instruction && !ins.length) { flashHint('先写需求（双击节点），或者把卡片连进来'); startEdit(k); return; }
      if (p.mode === 'edit' && kind === 'image' && !ins.some((i) => i.type === 'image')) { flashHint('改图要先把一张图片连到这个节点'); return; }
      if (p.mode === 'edit' && kind === 'text' && !ins.some((i) => i.type === 'text')) { flashHint('改文要先把一张文字卡连到这个节点'); return; }
      st.running.add(k); st.errors.delete(k);
      renderAiNode(e);
      const sid = S.space.id, rid = res.id;
      let j = {}, err = '';
      try {
        if (await localizeInputs(e)) ins = nodeInputs(byKey(k) || e);
        const r = await api('/spaces/' + encodeURIComponent(sid) + '/resources/' + encodeURIComponent(rid) + '/generate', {
          method: 'POST', timeout: 240000,
          body: { nodeId: e.id || undefined, kind, mode: p.mode || 'gen', instruction, inputs: ins.map((i) => (i.type === 'text' ? { type: 'text', text: String(i.text).slice(0, 8000) } : { type: 'image', url: i.url })), provider: p.provider || 'openai', model: p.model || undefined, size: kind === 'image' ? (p.size || '1024x1024') : undefined },
        });
        j = await r.json().catch(() => ({}));
        if (r.status === 404 || r.status === 405) err = '后端还没有画布生成接口，等后端上线后就能用';
        else if (!r.ok) err = j.error || ('生成失败（HTTP ' + r.status + '）');
        else if (kind === 'image' && !j.url) err = '没有拿到图片，可以换个说法再试';
      } catch (ex) { err = '生成失败：' + String((ex && ex.message) || ex); }
      // 外站图片被限流：换成看得懂的提示
      if (err && /\b429\b|Too Many Requests|downloading file/i.test(err)) err = '参考图所在的网站暂时拒绝下载（请求太多）。已尝试把参考图复制进空间，请等一会儿再点「重新生成」；如果还不行，把这张图下载后拖进画布再用。';
      const kk = resolveKey(k);
      st.running.delete(kk); st.running.delete(k);
      if (cv !== st) return;
      const cur = byKey(kk);
      if (!cur) return;
      if (err) { st.errors.set(kk, err); renderAiNode(cur); return; }
      const s0 = snap();
      const np = { ...cur.payload, usedPrompt: String(j.usedPrompt || '').slice(0, 8000), provider: j.provider || cur.payload.provider || 'openai', model: String(j.model || '').slice(0, 80), ranAt: Date.now() };
      if (kind === 'image') np.url = String(j.url); else np.output = String(j.text || '').slice(0, 20000);
      cur.payload = np;
      pushUndo(s0);
      renderAiNode(cur);
      for (const ed of edges()) if (resolveKey(ed.from) === kk) { const d = byKey(ed.to); if (d && d.payload.type && d.payload.type.startsWith('ai-')) renderAiNode(d); }
      scheduleSave();
    }
    function saveNodeResult(k) {
      const e = byKey(k);
      if (!e) return;
      const p = e.payload;
      const x = p.x + p.w + 80, y = p.y;
      const n = p.type === 'ai-image'
        ? addCard({ type: 'image', url: p.url, text: (p.usedPrompt || '').slice(0, 200), w: 300, h: 220 }, x, y)
        : addCard({ text: (p.output || '').slice(0, 4000), w: 280, h: clamp(Math.ceil((p.output || '').length / 18) * 22 + 40, 100, CV.MAXH) }, x, y);
      edges().push({ from: k, to: keyOf(n) });
      refresh(); scheduleSave();
    }
    function replaceSource(k, srcKey) {
      const e = byKey(k), src = byKey(srcKey);
      if (!e || !src || !e.payload.output) return;
      const s0 = snap();
      src.payload = { ...src.payload, text: e.payload.output.slice(0, 4000) };
      const ta = st.cards.get(keyOf(src)) && st.cards.get(keyOf(src)).querySelector('textarea');
      if (ta) ta.value = src.payload.text;
      pushUndo(s0); refresh(); scheduleSave();
      flashHint('已替换原卡片的文字，可以 Ctrl + Z 撤销');
    }
    /** 找一个不压住已有卡片的位置：从卡片右边发起时先往下找，否则先往右找 */
    function freeSpot(x, y, w, h, down) {
      const hit = (ax, ay) => ents().some((e) => { const q = e.payload; return ax < q.x + q.w + 24 && ax + w + 24 > q.x && ay < q.y + q.h + 24 && ay + h + 24 > q.y; });
      for (let i = 0; i < 40; i++) {
        const nx = down ? x + Math.floor(i / 8) * (w + 40) : x + (i % 8) * 40 + Math.floor(i / 8) * (w + 40);
        const ny = down ? y + (i % 8) * 60 : y + Math.floor(i / 8) * 0;
        if (!hit(nx, ny)) return { x: clamp(nx, 0, CV.WORLD), y: clamp(ny, 0, CV.WORLD) };
      }
      return { x, y };
    }
    /** 新建 AI 节点；from 是发起的卡片（改图 / 改文 / 用它生成），会自动连线 */
    /** 拖线到空白处时：新卡片从松手处往远离来源的方向展开 */
    function dropPlace(at, src, w, h) {
      const sp = src.payload;
      const left = at.x < sp.x + sp.w / 2;
      return { x: left ? at.x - w : at.x, y: at.y - Math.min(40, h / 2) };
    }
    function createAiNode(type, mode, at, fromKey, text, exact) {
      const w = 320, h = type === 'ai-image' ? 470 : 420;
      let x = at ? at.x - w / 2 : 0, y = at ? at.y - 60 : 0;
      const src = fromKey ? byKey(fromKey) : null;
      if (src && at && exact) ({ x, y } = dropPlace(at, src, w, h));
      else {
        if (src) { x = src.payload.x + src.payload.w + 80; y = src.payload.y; }
        else if (!at) { const c = viewCenter(); x = c.x - w / 2; y = c.y - h / 2; }
        ({ x, y } = freeSpot(x, y, w, h, !!src));
      }
      const n = addCard({ type, mode, text: text || '', w, h, provider: 'openai', color: '' }, x, y);
      if (src) { edges().push({ from: keyOf(src), to: keyOf(n) }); refresh(); scheduleSave(); }
      setTimeout(() => startEdit(keyOf(n)), 0);
      return n;
    }
    function aiMenuForSelection(anchor) {
      const items = [...st.sel].map(byKey).filter(Boolean);
      const one = items.length === 1 ? items[0] : null;
      const t = one && one.payload.type;
      const list = [];
      if (t === 'img-search') {
        const r = (one.payload.results || [])[one.payload.picked];
        if (r) {
          list.push({ html: AI_ICON.image, label: '拿出选中的图', sub: '放到节点右边', onClick: () => { const p = one.payload; takeResult(one, p.picked, { x: p.x + p.w + 80 + 130, y: p.y + 100 }); } });
          list.push({ html: AI_ICON.pen, label: '标注选中的图', sub: '保留原图', onClick: () => createAnnot(one) });
          list.push({ html: AI_ICON.image, label: '用选中的图改图', onClick: () => createAiNode('ai-image', 'edit', null, keyOf(one)) });
        } else list.push({ label: '先在节点里点选一张图', sub: '', onClick: () => {} });
        list.unshift({ html: AI_ICON.search, label: one.payload.results && one.payload.results.length ? '重新搜索' : '搜索', onClick: () => runSearch(keyOf(one)) });
      }
      if (t === 'annot') {
        list.push({ html: AI_ICON.pen, label: '编辑标注', onClick: () => openAnnotEditor(keyOf(one)) });
        list.push({ html: AI_ICON.image, label: '按标注改图', sub: '带标注的图作为参考', onClick: () => createAiNode('ai-image', 'edit', null, keyOf(one), '按图上的标注修改') });
        list.push({ html: AI_ICON.text, label: '看图写文字', onClick: () => createAiNode('ai-text', 'gen', null, keyOf(one), '描述这张图片和上面的标注') });
      }
      if (t === 'image' || t === 'ai-image') {
        if (imageOfCard(one)) list.push({ html: AI_ICON.pen, label: '标注图片', sub: '新节点，保留原图', onClick: () => createAnnot(one) });
        list.push({ html: AI_ICON.image, label: '改图', sub: '以这张图为参考', onClick: () => createAiNode('ai-image', 'edit', null, keyOf(one)) });
        list.push({ html: AI_ICON.text, label: '看图写文字', sub: '描述、提取内容', onClick: () => createAiNode('ai-text', 'gen', null, keyOf(one), '描述这张图片') });
      }
      if (t === 'text' || t === 'ai-text') {
        list.push({ html: AI_ICON.text, label: '改文', sub: '新节点，保留原文', onClick: () => createAiNode('ai-text', 'edit', null, keyOf(one)) });
        if (t === 'text' && one.id) list.push({ label: '就地修改', sub: '直接改这张卡', onClick: () => aiEditCard(one) });
        list.push({ html: AI_ICON.image, label: '用它生图', sub: '这段文字当描述', onClick: () => createAiNode('ai-image', 'gen', null, keyOf(one)) });
        list.push({ html: AI_ICON.text, label: '用它写文', sub: '当素材写新内容', onClick: () => createAiNode('ai-text', 'gen', null, keyOf(one)) });
      }
      if (t === 'ai-image' || t === 'ai-text') {
        list.unshift({ html: AI_ICON.spark, label: one.payload.url || one.payload.output ? '重新生成' : '生成', onClick: () => runNode(keyOf(one)) });
      }
      if (!list.length) return;
      popMenu(anchor, list);
    }
    /* ---------------- 拖线到空白处的「要做什么」 ---------------- */
    function linkMenu(src, at, screen, onClose) {
      const k = keyOf(src);
      const img = imageOfCard(src), txt = textOfCard(src).trim();
      const t = src.payload.type;
      const list = [];
      const linkNew = (payload) => {
        const w = payload.w || 240, h = payload.h || 140;
        const pos = dropPlace(at, src, w, h);
        const n = addCard(payload, pos.x, pos.y, payload.type === 'text' || !payload.type);
        edges().push({ from: k, to: keyOf(n) });
        refresh(); scheduleSave();
        return n;
      };
      if (img) {
        list.push({ html: AI_ICON.pen, label: '标注图片', sub: '保留原图', onClick: () => createAnnot(src, at) });
        list.push({ html: AI_ICON.image, label: t === 'annot' ? '按标注改图' : '改图', sub: '以这张图为参考', onClick: () => createAiNode('ai-image', 'edit', at, k, t === 'annot' ? '按图上的标注修改' : '', true) });
        list.push({ html: AI_ICON.text, label: '看图写文字', sub: '描述、提取内容', onClick: () => createAiNode('ai-text', 'gen', at, k, '描述这张图片', true) });
      }
      if (t === 'img-search' && img) list.unshift({ html: AI_ICON.image, label: '拿出选中的图', sub: '放成图片卡', onClick: () => takeResult(src, src.payload.picked, at) });
      if (txt) {
        if (t === 'text' || t === 'ai-text') list.push({ html: AI_ICON.text, label: '改文', sub: '新节点，保留原文', onClick: () => createAiNode('ai-text', 'edit', at, k, '', true) });
        list.push({ html: AI_ICON.image, label: '用它生图', sub: '这段文字当描述', onClick: () => createAiNode('ai-image', 'gen', at, k, '', true) });
        list.push({ html: AI_ICON.text, label: '用它写文', onClick: () => createAiNode('ai-text', 'gen', at, k, '', true) });
        list.push({ html: AI_ICON.search, label: '用它搜图', sub: '第一行当关键词', onClick: () => createSearchNode(at, src, txt.split('\n')[0].slice(0, 60)) });
      }
      list.push({ label: '文本卡', onClick: () => linkNew({ type: 'text', text: '', w: 240, h: 140 }) });
      list.push({ label: '便签', onClick: () => linkNew({ type: 'text', text: '', color: 'yellow', w: 200, h: 200 }) });
      popMenu(screen, list, onClose);
    }

    /* ---------------- 搜图节点 ---------------- */
    /* 来源：[节点里存的值, 名称, 说明]。前三个走后端 /ai/image-search（发 provider），维基由浏览器直接查。
     * 没写 provider 的旧节点当作维基（以前的默认）；新节点用上次选的来源，没选过就用「开放图库」。
     * （2026-11-19：Brave、Pexels 的密钥还没申请到，后端只接了 Openverse，默认先用开放图库；接好后改回 'web'） */
    const SEARCH_SOURCES = [
      ['web', '全网', '网页上的图片（OpenAI 联网搜索），版权不明，适合当参考'],
      ['pexels', 'Pexels 图库', '高质量摄影图，可免费使用'],
      ['openverse', '开放图库', 'Openverse：开放授权的图片'],
      ['commons', '维基共享资源', '免费公开图片，英文关键词更准'],
    ];
    const SEARCH_API = { web: 'web', pexels: 'pexels', openverse: 'openverse' }; // 全网发 web，具体用哪家搜索由后端决定（T-0038 先接 OpenAI 联网搜索）
    const SEARCH_VIA = { web: '全网', brave: '全网', pexels: 'Pexels 图库', openverse: '开放图库' };
    const srcOf = (p) => (SEARCH_SOURCES.some((x) => x[0] === p.provider) ? p.provider : 'commons');
    const lastSource = () => { const v = readLS('ai.searchSource'); return SEARCH_SOURCES.some((x) => x[0] === v) ? v : 'openverse'; };
    function createSearchNode(at, src, query) {
      const w = 440, h = 470;
      let pos;
      if (src && at) pos = dropPlace(at, src, w, h);
      else { const c = at || viewCenter(); pos = freeSpot(c.x - w / 2, c.y - h / 2, w, h, false); }
      const n = addCard({ type: 'img-search', text: query || '', w, h, provider: lastSource(), results: [], picked: -1 }, pos.x, pos.y);
      if (src) { edges().push({ from: keyOf(src), to: keyOf(n) }); refresh(); scheduleSave(); }
      if (query) setTimeout(() => runSearch(keyOf(n)), 0); else setTimeout(() => startEdit(keyOf(n)), 0);
      return n;
    }
    function buildSearchNode(e, card) {
      const wrap = el('div', 'an-wrap');
      const head = el('div', 'an-head');
      const ic = el('span', 'an-ic'); ic.innerHTML = AI_ICON.search;
      const prov = el('button', 'an-chip an-ui an-prov'); prov.type = 'button'; prov.title = '搜图来源';
      const run = el('button', 'an-run an-ui'); run.type = 'button';
      head.append(ic, el('span', 'an-title', '搜图'), el('span', 'an-gap'), prov, run);
      const ta = document.createElement('textarea');
      ta.className = 'an-ins sn-q';
      ta.value = e.payload.text || '';
      ta.readOnly = true;
      ta.rows = 1;
      ta.placeholder = '双击输入关键词，比如：Nalanda stupa';
      on(ta, 'input', () => { const cur = byKey(card.dataset.key); if (cur) { cur.payload = { ...cur.payload, text: ta.value.replace(/\n/g, ' ') }; scheduleSave(); } });
      on(ta, 'blur', () => stopEdit());
      on(ta, 'keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ta.blur(); box.focus({ preventScroll: true }); }
        else if (ev.key === 'Enter') { ev.preventDefault(); ta.blur(); runSearch(card.dataset.key); }
        ev.stopPropagation();
      });
      const grid = el('div', 'sn-grid an-ui an-scroll');
      const foot = el('div', 'an-inputs sn-foot');
      wrap.append(head, ta, grid, foot);
      on(grid, 'dblclick', (ev) => {
        const item = ev.target.closest('.sn-item');
        if (!item) return;
        ev.stopPropagation();
        const cur = byKey(card.dataset.key); if (!cur) return;
        const i = Number(item.dataset.i);
        // 双击的两下单击会把选中切换两次，这里把它定在这一张上
        if (cur.payload.picked !== i) { cur.payload = { ...cur.payload, picked: i }; renderSearchNode(cur); refresh({ keepEdges: true }); scheduleSave(); }
        previewCard(cur, i);
      });
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => sharpenSoon()).observe(grid);
      card.append(wrap);
      prov.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const cur = byKey(card.dataset.key); if (!cur) return;
        popMenu(prov, SEARCH_SOURCES.map(([v, t, sub]) => ({ label: t, sub, on: srcOf(cur.payload) === v, onClick: () => { writeLS('ai.searchSource', v); if (srcOf(cur.payload) === v) return; const s0 = snap(); cur.payload = { ...cur.payload, provider: v }; pushUndo(s0); renderSearchNode(cur); scheduleSave(); } })));
      });
      run.addEventListener('click', (ev) => { ev.stopPropagation(); runSearch(card.dataset.key); });
      // 结果：点一下选中，按住拖到画布上就拿出来
      on(grid, 'pointerdown', (ev) => {
        const item = ev.target.closest('.sn-item');
        if (!item || ev.button !== 0) return;
        ev.preventDefault();
        const i = Number(item.dataset.i);
        const sx = ev.clientX, sy = ev.clientY;
        let ghost = null;
        const inBoard = (x, y) => { const r = rect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false; const t = document.elementFromPoint(x, y); return !!(t && box.contains(t) && !isUi(t) && t.closest('.canvas-card') !== card); };
        const mv = (m) => {
          if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return;
          if (!ghost) { ghost = el('div', 'cv-ghost sn-ghost'); const im = item.querySelector('img'); if (im) ghost.append(im.cloneNode()); document.body.append(ghost); }
          ghost.style.left = m.clientX + 'px'; ghost.style.top = m.clientY + 'px';
          ghost.classList.toggle('ok', inBoard(m.clientX, m.clientY));
        };
        const up = (u) => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          const cur = byKey(card.dataset.key);
          if (!cur) { if (ghost) ghost.remove(); return; }
          if (!ghost) { const s0 = snap(); cur.payload = { ...cur.payload, picked: cur.payload.picked === i ? -1 : i }; pushUndo(s0); renderSearchNode(cur); refresh({ keepEdges: true }); scheduleSave(); return; }
          ghost.remove();
          if (inBoard(u.clientX, u.clientY)) takeResult(cur, i, toWorld(u.clientX, u.clientY));
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      });
      renderSearchNode(e);
    }
    function renderSearchNode(e) {
      const card = st.cards.get(keyOf(e));
      if (!card || !card.querySelector('.sn-grid')) return;
      const p = e.payload, k = keyOf(e);
      const running = st.running.has(k), err = st.errors.get(k);
      const list = Array.isArray(p.results) ? p.results : [];
      const src = srcOf(p);
      card.querySelector('.an-prov').textContent = SEARCH_SOURCES.find((x) => x[0] === src)[1] + ' ▾';
      const run = card.querySelector('.an-run');
      run.disabled = running;
      run.textContent = running ? '搜索中…' : (list.length ? '重新搜索' : '搜索');
      const ta = card.querySelector('.an-ins');
      if (document.activeElement !== ta && ta.value !== (p.text || '')) ta.value = p.text || '';
      const grid = card.querySelector('.sn-grid');
      const sig = JSON.stringify([running, err || '', list.map((r) => [r.thumb, r.url])]);
      if (card._snSig !== sig) {
        card._snSig = sig;
        grid.textContent = '';
        if (running) grid.append(el('div', 'an-status', '正在搜索…'));
        else if (err) { const d = el('div', 'an-err', err); d.setAttribute('role', 'alert'); grid.append(d); }
        else if (!list.length) grid.append(el('div', 'an-empty', '输入关键词后搜索，图片会排在这里'));
        list.forEach((r, i) => {
          const it = el('div', 'sn-item');
          it.dataset.i = String(i);
          it.title = (r.title || '') + (r.w && r.h ? '（' + r.w + ' × ' + r.h + '）' : '') + (r.author ? '\n摄影：' + r.author : '') + '\n点击选中，双击看大图，按住拖到画布上拿出来，右键更多操作';
          const im = document.createElement('img');
          im.src = shownUrl(r.thumb || r.url); im.alt = r.title || ''; im.loading = 'lazy'; im.draggable = false; im.referrerPolicy = 'no-referrer';
          if (r.thumb && r.url && r.thumb !== r.url) { im.dataset.full = shownUrl(r.url); im.addEventListener('load', sharpenSoon); }
          im.addEventListener('error', () => {
            const original = r.url && shownUrl(r.url);
            if (original && im.getAttribute('src') !== original) im.src = original;
            else it.classList.add('broken');
          });
          it.append(im);
          grid.append(it);
        });
      }
      grid.querySelectorAll('.sn-item').forEach((it) => it.classList.toggle('on', Number(it.dataset.i) === p.picked));
      const foot = card.querySelector('.sn-foot');
      const picked = list[p.picked];
      foot.textContent = list.length ? ('共 ' + list.length + ' 张' + (picked ? ' · 已选：' + (picked.title || '第 ' + (p.picked + 1) + ' 张') + (picked.author ? ' · 摄影 ' + picked.author : '') : ' · 点击选中，双击看大图，按住拖到画布上拿出来')) : '';
      // 后端暂时用别的来源代替时说清楚，免得把开放图库的结果当成全网
      if (list.length && p.via && SEARCH_API[src] && p.via !== SEARCH_API[src]) foot.append(el('span', 'sn-via', ' · 后端还没接入「' + SEARCH_SOURCES.find((x) => x[0] === src)[1] + '」，这次结果来自' + (SEARCH_VIA[p.via] || p.via)));
      // Pexels 要求每次展示搜索结果都带上指向 Pexels 的链接
      if (list.length && p.via === 'pexels') {
        const a = el('a', 'sn-credit an-ui', '图片来自 Pexels');
        a.href = 'https://www.pexels.com'; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        foot.append(' · ', a);
      }
    }
    async function runSearch(k0) {
      const e = byKey(k0);
      if (!e) return;
      const k = keyOf(e), p = e.payload;
      if (st.running.has(k)) return;
      const q = String(p.text || '').trim();
      if (!q) { flashHint('先输入关键词（双击节点）'); startEdit(k); return; }
      st.running.add(k); st.errors.delete(k);
      renderSearchNode(e);
      const src = srcOf(p);
      let list=[], err='', via='', progress;
      const previous=p.results || [];
      const cursor=p.searchProgress;
      const same=cursor && cursor.query===q && cursor.src===src;
      try {
        if (same && cursor.nextPage===0) { flashHint('这个条件的结果已看完'); }
        else {
          const r=await api('/ai/image-search',{method:'POST',timeout:180000,body:{
            query:q,count:24,rank:true,provider:SEARCH_API[src] || src,
            terms:same ? cursor.terms : '',page:same ? cursor.nextPage : 1,
            exclude:previous.flatMap(x=>[x.original || x.url,x.source]).filter(Boolean),
          }});
          const j=await r.json();
          if (!r.ok) err=j.error || '搜索失败';
          else {
            via=j.provider;
            const seen=new Set(previous.flatMap(x=>[x.original || x.url,x.source]).filter(Boolean));
            list=j.images.filter(x=>!seen.has(x.url)&&!seen.has(x.source)).map(x=>({...x,original:x.url,w:x.width,h:x.height}));
            progress={query:q,src,terms:j.terms,nextPage:j.nextPage};
            if (!list.length) flashHint('这一轮没有符合需求的新图片');
          }
        }
      } catch (ex) { err = '搜索失败：' + String((ex && ex.message) || ex); }
      st.running.delete(resolveKey(k)); st.running.delete(k);
      if (cv !== st) return;
      const cur = byKey(k);
      if (!cur) return;
      if (err) { st.errors.set(keyOf(cur), err); renderSearchNode(cur); return; }
      if (!progress) { renderSearchNode(cur); return; }
      const s0 = snap();
      cur.payload={...cur.payload,via,searchProgress:progress,results:[...(cur.payload.results || []),...list]};
      pushUndo(s0);
      renderSearchNode(cur);
      scheduleSave();
    }
    /** 把搜到的第 i 张图拿到画布上：先用原链接放卡，再在后台复制进空间 */
    function takeResult(node, i, at) {
      const r = (node.payload.results || [])[i];
      if (!r) return null;
      const w = 260, h = r.w && r.h ? clamp(Math.round(w * r.h / r.w), CV.MINH, CV.MAXH) : 200;
      const url0 = fixWikiThumb(r.url);
      const src0 = /^https?:\/\//i.test(r.source || '') ? String(r.source).slice(0, 500) : '';
      const cap = (r.title || '') + (r.author ? (r.title ? ' · ' : '') + '摄影 ' + r.author : '');
      const n = addCard({ type: 'image', url: url0, text: cap.slice(0, 200), w, h, source: src0, ref: src0.length <= 200 ? src0 : '' }, at.x - w / 2, at.y - h / 2);
      edges().push({ from: keyOf(node), to: keyOf(n) });
      refresh(); scheduleSave();
      const nk = keyOf(n), sid = S.space.id, rid = res.id;
      copyImageIntoSpace({ src: url0, save: url0 }, sid, rid).then((c) => {
        if (!c.copied || cv !== st) return;
        const cur = byKey(nk);
        if (!cur || cur.payload.url !== url0) return;
        cur.payload = { ...cur.payload, url: c.url };
        const im = st.cards.get(keyOf(cur)) && st.cards.get(keyOf(cur)).querySelector('img');
        if (im) im.src = shownUrl(c.url);
        scheduleSave();
      });
      return n;
    }

    /* ---------------- 标注节点 ---------------- */
    const ANN_COLORS = ['#e5484d', '#f5a524', '#30a46c', '#0090ff', '#ffffff', '#111111'];
    function createAnnot(src, at) {
      const url = imageOfCard(src);
      if (!url) { flashHint('这张卡里没有图片'); return null; }
      const ar = clamp(ratioOfCard(src), 0.1, 10);
      const w = 380, h = clamp(Math.round(w * ar) + 64, 160, CV.MAXH);
      const pos = at ? dropPlace(at, src, w, h) : freeSpot(src.payload.x + src.payload.w + 80, src.payload.y, w, h, true);
      const n = addCard({ type: 'annot', src: url, ar, annots: [], url: '', text: '', w, h }, pos.x, pos.y);
      edges().push({ from: keyOf(src), to: keyOf(n) });
      refresh(); scheduleSave();
      if (/^https?:\/\//i.test(url)) {
        const nk = keyOf(n);
        copyImageIntoSpace({ src: url, save: url }, S.space.id, res.id).then((c) => {
          if (!c.copied || cv !== st) return;
          const cur = byKey(nk);
          if (!cur || cur.payload.src !== url) return;
          cur.payload = { ...cur.payload, src: c.url };
          renderAnnotNode(cur); scheduleSave();
        });
      }
      setTimeout(() => openAnnotEditor(keyOf(n)), 0);
      return n;
    }
    function buildAnnotNode(e, card) {
      const wrap = el('div', 'an-wrap');
      const head = el('div', 'an-head');
      const ic = el('span', 'an-ic'); ic.innerHTML = AI_ICON.pen;
      const cnt = el('span', 'an-chip ann-count');
      const ed = el('button', 'an-run an-ui'); ed.type = 'button'; ed.textContent = '编辑标注';
      head.append(ic, el('span', 'an-title', '标注'), el('span', 'an-gap'), cnt, ed);
      const stage = el('div', 'ann-stage');
      const boxEl = el('div', 'ann-box');
      const img = document.createElement('img'); img.draggable = false; img.alt = '原图'; img.referrerPolicy = 'no-referrer';
      const ov = document.createElementNS(SVGNS, 'svg'); ov.setAttribute('class', 'ann-svg'); ov.setAttribute('preserveAspectRatio', 'none');
      boxEl.append(img, ov);
      stage.append(boxEl);
      const foot = el('div', 'an-inputs ann-foot');
      wrap.append(head, stage, foot);
      card.append(wrap);
      ed.addEventListener('click', (ev) => { ev.stopPropagation(); openAnnotEditor(card.dataset.key); });
      renderAnnotNode(e);
    }
    /** 标注画成 SVG（视图宽 1000，高按比例） */
    function annotSvg(list, ar) {
      const W = 1000, H = 1000 * ar;
      const esc2 = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      let out = '';
      for (const a of list || []) {
        const c = esc2(a.c || '#e5484d'), lw = (a.lw || 4) * 1.5;
        const X = (v) => (v * W).toFixed(1), Y = (v) => (v * H).toFixed(1);
        if (a.t === 'rect') out += '<rect x="' + X(Math.min(a.x1, a.x2)) + '" y="' + Y(Math.min(a.y1, a.y2)) + '" width="' + X(Math.abs(a.x2 - a.x1)) + '" height="' + Y(Math.abs(a.y2 - a.y1)) + '" fill="none" stroke="' + c + '" stroke-width="' + lw + '" rx="4"/>';
        else if (a.t === 'ellipse') out += '<ellipse cx="' + X((a.x1 + a.x2) / 2) + '" cy="' + Y((a.y1 + a.y2) / 2) + '" rx="' + X(Math.abs(a.x2 - a.x1) / 2) + '" ry="' + Y(Math.abs(a.y2 - a.y1) / 2) + '" fill="none" stroke="' + c + '" stroke-width="' + lw + '"/>';
        else if (a.t === 'arrow') {
          const x1 = a.x1 * W, y1 = a.y1 * H, x2 = a.x2 * W, y2 = a.y2 * H;
          const ang = Math.atan2(y2 - y1, x2 - x1), hl = 10 + lw * 3;
          const p1 = [x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45)], p2 = [x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45)];
          out += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + c + '" stroke-width="' + lw + '" stroke-linecap="round"/>';
          out += '<polygon points="' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' ' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1) + '" fill="' + c + '"/>';
        } else if (a.t === 'pen' && a.pts && a.pts.length) out += '<polyline points="' + a.pts.map((q) => X(q[0]) + ',' + Y(q[1])).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="' + lw + '" stroke-linecap="round" stroke-linejoin="round"/>';
        else if (a.t === 'text') out += '<text x="' + X(a.x1) + '" y="' + Y(a.y1) + '" fill="' + c + '" font-size="' + (22 + (a.lw || 4) * 4) + '" font-weight="700" font-family="sans-serif" paint-order="stroke" stroke="' + (c.toLowerCase() === '#ffffff' ? '#000' : '#fff') + '" stroke-width="5" stroke-linejoin="round">' + esc2(a.s || '') + '</text>';
        else if (a.t === 'num') { const r = 16 + (a.lw || 4) * 2; out += '<circle cx="' + X(a.x1) + '" cy="' + Y(a.y1) + '" r="' + r + '" fill="' + c + '" stroke="#fff" stroke-width="3"/><text x="' + X(a.x1) + '" y="' + Y(a.y1) + '" fill="' + (c.toLowerCase() === '#ffffff' ? '#000' : '#fff') + '" font-size="' + r * 1.2 + '" font-weight="700" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">' + (a.n || 1) + '</text>'; }
      }
      return out;
    }
    function renderAnnotNode(e) {
      const card = st.cards.get(keyOf(e));
      if (!card || !card.querySelector('.ann-box')) return;
      const p = e.payload;
      const ar = clamp(Number(p.ar) || 0.75, 0.1, 10);
      const img = card.querySelector('.ann-box img');
      const want = shownUrl(p.src);
      if (img.getAttribute('src') !== want) img.src = want;
      card.querySelector('.ann-box').style.aspectRatio = (1 / ar).toFixed(4);
      const svgEl = card.querySelector('.ann-svg');
      svgEl.setAttribute('viewBox', '0 0 1000 ' + (1000 * ar).toFixed(1));
      const sig = JSON.stringify(p.annots || []);
      if (card._annSig !== sig) { card._annSig = sig; svgEl.innerHTML = annotSvg(p.annots, ar); }
      const n = (p.annots || []).length;
      card.querySelector('.ann-count').textContent = n ? n + ' 处标注' : '还没标注';
      card.querySelector('.ann-foot').textContent = st.running.has(keyOf(e)) ? '正在生成带标注的图…' : (p.url ? '原图不变 · 下游节点拿到的是带标注的图' : (n ? '原图不变 · 带标注的图还没生成（下游会用原图）' : '原图不变 · 双击或点「编辑标注」开始'));
    }
    /** 读图片内容（站内用登录态，外链要允许跨域） */
    async function loadImageBlob(u) {
      u = fixWikiThumb(u);
      const r = /^\/(files|oss)\//.test(u) ? await api(u, { timeout: 60000 }) : await fetch(u, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }
    /* ---------------- 看大图、复制图像、复制提示词、下载 ----------------
     * Ctrl + C 只在站内复制卡片（粘贴时引用同一个文件，不再占空间）；
     * Ctrl + Shift + C 把图像放进系统剪贴板，可以粘贴到别的软件；Ctrl + Alt + C 复制提示词。 */
    /** 卡片的提示词：生成的图用 AI 实际用的提示词，其他图用卡片上的文字 */
    function promptOfCard(e) {
      const p = e && e.payload;
      if (!p) return '';
      if (p.type === 'ai-image') return p.usedPrompt || p.text || '';
      if (p.type === 'img-search') { const r = (p.results || [])[p.picked]; return (r && r.title) || ''; }
      if (p.type === 'image' || p.type === 'annot') return p.text || '';
      return '';
    }
    const promptLabelOf = (e) => (e && e.payload.type === 'ai-image' ? '复制提示词' : '复制图片说明');
    async function toPng(blob) {
      if (blob.type === 'image/png') return blob;
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      return await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('转换失败'))), 'image/png'));
    }
    /** 把图像放进系统剪贴板（浏览器只认 PNG，其他格式先转换） */
    function copyImageOut(u, say) {
      say = say || flashHint;
      if (!u) { say('这张卡片没有图片'); return; }
      if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') { say('这个浏览器不支持复制图像，可以用「下载图片」'); return; }
      say('正在复制图像…');
      let item;
      try { item = new ClipboardItem({ 'image/png': loadImageBlob(u).then(toPng) }); } catch (ex) { say('这个浏览器不支持复制图像，可以用「下载图片」'); return; }
      navigator.clipboard.write([item]).then(() => say('已复制图像，可以粘贴到其他软件'))
        .catch((ex) => { const m = String((ex && ex.message) || ex); say(/HTTP|fetch|network|CORS/i.test(m) ? '图片所在网站不允许读取，先把图拖进空间再复制，或打开原图页面' : '复制图像失败：' + m); });
    }
    function copyPromptOut(e, say) {
      say = say || flashHint;
      const t = promptOfCard(e);
      if (!t) { say(e && e.payload.type === 'ai-image' ? '还没有生成，没有提示词' : '这张卡片没有文字可复制'); return; }
      navigator.clipboard.writeText(t).then(() => say(promptLabelOf(e) === '复制提示词' ? '已复制提示词' : '已复制图片说明')).catch(() => say('复制失败'));
    }
    async function downloadImage(u, name, say) {
      say = say || flashHint;
      try {
        const b = await loadImageBlob(u);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        const ext = ((b.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '')) || 'png';
        a.download = String(name || '图片').replace(/[\\/:*?"<>|\n]/g, '_').slice(0, 60) + '.' + ext;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      } catch (ex) { say('下载失败：图片所在网站不允许读取，可以打开原图页面下载'); }
    }
    /** 看大图。list = [{ url, thumb, title, source, prompt, promptLabel }]；← → 切换，点图在适应窗口和原始大小之间切换，Esc 关闭 */
    function openPreview(list, i0, opts) {
      if (!list.length) return;
      let i = clamp(i0, 0, list.length - 1);
      const back = document.activeElement;
      const ov = el('div', 'cv-preview');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '看大图'); ov.tabIndex = -1;
      const stage = el('div', 'pv-stage');
      const img = document.createElement('img'); img.referrerPolicy = 'no-referrer'; img.draggable = false;
      stage.append(img);
      const cap = el('div', 'pv-cap'), ttl = el('span', 'pv-title'), acts = el('div', 'pv-acts'), hint = el('span', 'pv-hint');
      hint.setAttribute('role', 'status');
      cap.append(ttl, acts, hint);
      const mk = (cls, txt, title) => { const b = el('button', cls, txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); return b; };
      const prev = mk('pv-nav pv-prev', '‹', '上一张（←）'), next = mk('pv-nav pv-next', '›', '下一张（→）'), close = mk('pv-close', '×', '关闭（Esc）');
      ov.append(stage, cap, prev, next, close);
      let hintT = 0;
      const say = (t) => { hint.textContent = t; clearTimeout(hintT); hintT = setTimeout(() => { hint.textContent = ''; }, 3000); };
      const act = (t, title, fn) => { const b = mk(null, t, title); b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); acts.append(b); };
      const cur = () => list[i];
      function show() {
        const it = cur();
        stage.classList.remove('actual');
        ttl.textContent = (it.title || '图片') + (list.length > 1 ? '（' + (i + 1) + ' / ' + list.length + '）' : '');
        img.alt = it.title || '';
        const full = shownUrl(it.url);
        // 先显示缩略图，原图下载好再换上
        if (it.thumb && it.thumb !== it.url) {
          img.src = shownUrl(it.thumb); stage.classList.add('loading');
          const pre = new Image(); pre.referrerPolicy = 'no-referrer';
          pre.onload = () => { if (cur() === it) { img.src = full; stage.classList.remove('loading'); } };
          pre.onerror = () => { if (cur() === it) stage.classList.remove('loading'); };
          pre.src = full;
        } else { img.src = full; stage.classList.remove('loading'); }
        prev.hidden = next.hidden = list.length < 2;
        acts.textContent = '';
        act('复制图像', 'Ctrl + Shift + C：粘贴到其他软件', () => copyImageOut(it.url, say));
        if (it.prompt) act(it.promptLabel || '复制提示词', 'Ctrl + Alt + C', () => navigator.clipboard.writeText(it.prompt).then(() => say('已复制')).catch(() => say('复制失败')));
        act('下载', '保存到电脑', () => downloadImage(it.url, it.title, say));
        if (it.source) act('原图页面', '在新标签页打开来源页', () => window.open(it.source, '_blank', 'noopener,noreferrer'));
        if (opts && opts.take) act('拿到画布上', '放到搜图节点旁边', () => { const j = i; done(); opts.take(j); });
      }
      const go = (d) => { if (list.length < 2) return; i = (i + d + list.length) % list.length; show(); };
      function done() { ov.remove(); clearTimeout(hintT); if (back && back.isConnected) back.focus({ preventScroll: true }); else box.focus({ preventScroll: true }); }
      prev.addEventListener('click', (ev) => { ev.stopPropagation(); go(-1); });
      next.addEventListener('click', (ev) => { ev.stopPropagation(); go(1); });
      close.addEventListener('click', (ev) => { ev.stopPropagation(); done(); });
      img.addEventListener('click', (ev) => { ev.stopPropagation(); stage.classList.toggle('actual'); });
      ov.addEventListener('click', (ev) => { if (ev.target === ov || ev.target === stage) done(); });
      ov.addEventListener('keydown', (ev) => {
        const isC = ev.code === 'KeyC' || ev.key === 'c' || ev.key === 'C';
        if (ev.key === 'Escape') { ev.preventDefault(); done(); }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(-1); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); go(1); }
        else if ((ev.ctrlKey || ev.metaKey) && isC && ev.shiftKey) { ev.preventDefault(); copyImageOut(cur().url, say); }
        else if ((ev.ctrlKey || ev.metaKey) && isC && ev.altKey) { ev.preventDefault(); if (cur().prompt) navigator.clipboard.writeText(cur().prompt).then(() => say('已复制')).catch(() => say('复制失败')); else say('这张图没有文字可复制'); }
        ev.stopPropagation();
      });
      document.body.append(ov);
      show();
      ov.focus({ preventScroll: true });
    }
    /** 看一张卡片的大图；搜图节点看它搜到的全部结果 */
    function previewCard(e, i) {
      const p = e && e.payload;
      if (!p) return;
      if (p.type === 'img-search') {
        const rs = p.results || [];
        if (!rs.length) { flashHint('还没有搜索结果'); return; }
        const k = keyOf(e);
        openPreview(rs.map((r) => ({ url: r.url, thumb: r.thumb, title: (r.title || '') + (r.author ? ' · 摄影 ' + r.author : ''), source: r.source, prompt: r.title || '', promptLabel: '复制图片说明' })),
          i != null ? i : (p.picked >= 0 ? p.picked : 0),
          { take: (j) => { const cur = byKey(k); if (cur) takeResult(cur, j, { x: cur.payload.x + cur.payload.w + 170, y: cur.payload.y + 130 }); } });
        return;
      }
      const u = imageOfCard(e);
      if (!u) { flashHint(p.type === 'ai-image' ? '还没有生成图片' : '这张卡片没有图片'); return; }
      openPreview([{ url: u, title: (p.type === 'ai-image' ? (p.text || '生成的图') : (p.text || '图片')).slice(0, 80), source: p.type === 'image' ? sourceOfCard(p) : '', prompt: promptOfCard(e), promptLabel: promptLabelOf(e) }], 0);
    }
    /** 右键菜单：图片类卡片多出看大图、复制图像、复制提示词、下载 */
    function cardMenu(e, pt) {
      const multi = st.sel.size > 1;
      const u = multi ? '' : imageOfCard(e);
      const p = e.payload;
      const items = [];
      if (!multi && (u || (p.type === 'img-search' && (p.results || []).length))) items.push({ label: '看大图', sub: p.type === 'image' ? '双击' : '', onClick: () => previewCard(e) });
      items.push({ label: multi ? '复制 ' + st.sel.size + ' 张卡片' : '复制卡片', sub: 'Ctrl+C', onClick: () => copySel(false) });
      if (u) {
        items.push({ label: '复制图像', sub: 'Ctrl+Shift+C', onClick: () => copyImageOut(u) });
        if (promptOfCard(e)) items.push({ label: promptLabelOf(e), sub: 'Ctrl+Alt+C', onClick: () => copyPromptOut(e) });
        items.push({ label: '下载图片', onClick: () => downloadImage(u, promptOfCard(e).slice(0, 40) || '图片') });
        const src = p.type === 'img-search' ? ((p.results || [])[p.picked] || {}).source : (p.type === 'image' ? sourceOfCard(p) : '');
        if (src) items.push({ label: '原图页面', onClick: () => window.open(src, '_blank', 'noopener,noreferrer') });
      }
      items.push({ label: '创建副本', sub: 'Ctrl+D', onClick: () => duplicate() });
      items.push({ label: '删除', sub: 'Delete', onClick: () => deleteSelected() });
      popMenu(pt, items);
    }
    /** 搜图节点里某一张结果的右键菜单 */
    function searchItemMenu(e, i, pt) {
      const r = (e.payload.results || [])[i];
      if (!r) return;
      const k = keyOf(e);
      const items = [
        { label: '看大图', sub: '双击', onClick: () => previewCard(e, i) },
        { label: '拿到画布上', onClick: () => { const cur = byKey(k); if (cur) takeResult(cur, i, { x: cur.payload.x + cur.payload.w + 170, y: cur.payload.y + 130 }); } },
        { label: '复制图像', sub: 'Ctrl+Shift+C', onClick: () => copyImageOut(r.url) },
      ];
      if (r.title) items.push({ label: '复制图片说明', onClick: () => navigator.clipboard.writeText(r.title).then(() => flashHint('已复制图片说明')).catch(() => flashHint('复制失败')) });
      items.push({ label: '下载图片', onClick: () => downloadImage(r.url, r.title) });
      if (r.source) items.push({ label: '原图页面', onClick: () => window.open(r.source, '_blank', 'noopener,noreferrer') });
      popMenu(pt, items);
    }
    /** 搜图格子放大后换上原图，免得放大看是糊的 */
    let sharpenRaf = 0;
    function sharpenSoon() { if (!sharpenRaf) sharpenRaf = requestAnimationFrame(() => { sharpenRaf = 0; sharpenGrids(); }); }
    function sharpenGrids() {
      const dpr = window.devicePixelRatio || 1;
      for (const im of world.querySelectorAll('.sn-item img[data-full]')) {
        if (im.dataset.up || !im.naturalWidth || !im.clientWidth) continue;
        const need = Math.max(im.clientWidth / im.naturalWidth, im.clientHeight / im.naturalHeight) * view.z * dpr;
        if (need <= 1.2) continue;
        im.dataset.up = '1';
        const full = im.dataset.full;
        const pre = new Image(); pre.referrerPolicy = 'no-referrer';
        pre.onload = () => { if (im.isConnected && im.dataset.full === full) im.src = full; };
        pre.src = full;
      }
    }
    /** 原图 + 标注画成一张 PNG，上传进空间 */
    async function flattenAnnot(p) {
      const blob = await loadImageBlob(p.src);
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const W = Math.round(bmp.width * scale), H = Math.round(bmp.height * scale);
      const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
      const ctx2 = cnv.getContext('2d');
      ctx2.drawImage(bmp, 0, 0, W, H);
      const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 1000 ' + (1000 * H / W).toFixed(1) + '" preserveAspectRatio="none">' + annotSvg(p.annots, H / W) + '</svg>';
      const ov = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText); });
      ctx2.drawImage(ov, 0, 0, W, H);
      const png = await new Promise((ok) => cnv.toBlob(ok, 'image/png'));
      const up = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(res.id) + '/images', { method: 'POST', raw: png, mime: 'image/png', timeout: 120000 });
      const j = await up.json().catch(() => ({}));
      if (!up.ok || !j.url) throw new Error(j.error || ('HTTP ' + up.status));
      return { url: j.url, ar: H / W };
    }
    /** 全屏标注编辑器 */
    function openAnnotEditor(k0) {
      const e = byKey(k0);
      if (!e || e.payload.type !== 'annot') return;
      const k = keyOf(e);
      let list = JSON.parse(JSON.stringify(e.payload.annots || []));
      const undo = [], redo = [];
      let tool = 'arrow', color = ANN_COLORS[0], lw = 4, selIdx = -1, cur = null;
      let ar = clamp(Number(e.payload.ar) || 0.75, 0.1, 10);
      const ed = el('div', 'ann-editor');
      ed.setAttribute('role', 'dialog'); ed.setAttribute('aria-modal', 'true'); ed.setAttribute('aria-label', '标注图片');
      const barE = el('div', 'ae-bar');
      const TOOLS = [['select', '选择'], ['arrow', '箭头'], ['rect', '方框'], ['ellipse', '椭圆'], ['pen', '画笔'], ['text', '文字'], ['num', '序号']];
      const toolBtns = TOOLS.map(([v, t]) => { const b = el('button', 'ae-tool', t); b.type = 'button'; b.dataset.v = v; b.addEventListener('click', () => { tool = v; selIdx = -1; sync(); }); return b; });
      const colorBtns = ANN_COLORS.map((c) => { const b = el('button', 'ae-color'); b.type = 'button'; b.style.background = c; b.title = c; b.addEventListener('click', () => { color = c; if (selIdx >= 0) { push(); list[selIdx].c = c; } sync(); }); return b; });
      const widthBtns = [[2, '细'], [4, '中'], [8, '粗']].map(([v, t]) => { const b = el('button', 'ae-tool', t); b.type = 'button'; b.dataset.w = String(v); b.addEventListener('click', () => { lw = v; if (selIdx >= 0) { push(); list[selIdx].lw = v; } sync(); }); return b; });
      const bUndo = el('button', 'ae-tool', '撤销'), bRedo = el('button', 'ae-tool', '重做'), bClear = el('button', 'ae-tool', '清空'), bDel = el('button', 'ae-tool', '删除选中');
      const bCancel = el('button', 'ghost', '取消'), bDone = el('button', 'primary', '完成');
      [bUndo, bRedo, bClear, bDel, bCancel, bDone].forEach((b) => { b.type = 'button'; });
      const grp = (...xs) => { const g = el('div', 'ae-grp'); g.append(...xs); return g; };
      barE.append(grp(...toolBtns), grp(...colorBtns), grp(...widthBtns), grp(bUndo, bRedo, bDel, bClear), el('span', 'an-gap'), grp(bCancel, bDone));
      const stageE = el('div', 'ae-stage');
      const boxE = el('div', 'ae-box');
      const imgE = document.createElement('img'); imgE.src = shownUrl(e.payload.src); imgE.draggable = false; imgE.alt = '原图'; imgE.referrerPolicy = 'no-referrer';
      const svgE = document.createElementNS(SVGNS, 'svg'); svgE.setAttribute('class', 'ae-svg'); svgE.setAttribute('preserveAspectRatio', 'none');
      boxE.append(imgE, svgE);
      stageE.append(boxE);
      const tip = el('div', 'ae-tip', '在图上拖动来画；文字和序号点一下放置；「选择」可以拖动、删除；Ctrl + Z 撤销，Esc 取消');
      ed.append(barE, stageE, tip);
      document.body.append(ed);
      const back = document.activeElement;
      const fit = () => {
        const r = stageE.getBoundingClientRect();
        let w = r.width - 32, h = w * ar;
        if (h > r.height - 32) { h = r.height - 32; w = h / ar; }
        boxE.style.width = Math.max(50, w) + 'px'; boxE.style.height = Math.max(50, h) + 'px';
        svgE.setAttribute('viewBox', '0 0 1000 ' + (1000 * ar).toFixed(1));
      };
      imgE.addEventListener('load', () => { if (imgE.naturalWidth) { ar = clamp(imgE.naturalHeight / imgE.naturalWidth, 0.1, 10); fit(); draw(); } });
      const push = () => { undo.push(JSON.stringify(list)); if (undo.length > 100) undo.shift(); redo.length = 0; };
      const draw = () => {
        let extra = '';
        if (selIdx >= 0 && list[selIdx]) { const b = bboxOf(list[selIdx]); extra = '<rect x="' + (b.x0 * 1000 - 8).toFixed(1) + '" y="' + (b.y0 * 1000 * ar - 8).toFixed(1) + '" width="' + ((b.x1 - b.x0) * 1000 + 16).toFixed(1) + '" height="' + ((b.y1 - b.y0) * 1000 * ar + 16).toFixed(1) + '" fill="none" stroke="#0090ff" stroke-width="2" stroke-dasharray="6 4"/>'; }
        svgE.innerHTML = annotSvg(cur ? list.concat([cur]) : list, ar) + extra;
      };
      const sync = () => {
        toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === tool));
        colorBtns.forEach((b) => b.classList.toggle('on', b.title === color));
        widthBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.w) === lw));
        bUndo.disabled = !undo.length; bRedo.disabled = !redo.length; bClear.disabled = !list.length; bDel.disabled = selIdx < 0;
        boxE.dataset.tool = tool;
        draw();
      };
      function bboxOf(a) {
        if (a.t === 'pen') { const xs = a.pts.map((q) => q[0]), ys = a.pts.map((q) => q[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
        if (a.t === 'text') { const wd = Math.max(0.04, (a.s || '').length * (22 + (a.lw || 4) * 4) / 1000 * 0.95); return { x0: a.x1, y0: a.y1 - (26 + (a.lw || 4) * 4) / 1000 / ar, x1: a.x1 + wd, y1: a.y1 + 0.01 }; }
        if (a.t === 'num') { const r = (16 + (a.lw || 4) * 2) / 1000; return { x0: a.x1 - r, y0: a.y1 - r / ar, x1: a.x1 + r, y1: a.y1 + r / ar }; }
        return { x0: Math.min(a.x1, a.x2), y0: Math.min(a.y1, a.y2), x1: Math.max(a.x1, a.x2), y1: Math.max(a.y1, a.y2) };
      }
      const norm = (ev) => { const r = boxE.getBoundingClientRect(); return { x: clamp((ev.clientX - r.left) / r.width, 0, 1), y: clamp((ev.clientY - r.top) / r.height, 0, 1) }; };
      const nextNum = () => list.filter((a) => a.t === 'num').reduce((m, a) => Math.max(m, a.n || 0), 0) + 1;
      let drag = null;
      svgE.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        const q = norm(ev);
        if (tool === 'select') {
          selIdx = -1;
          for (let i = list.length - 1; i >= 0; i--) { const b = bboxOf(list[i]); const pad = 0.015; if (q.x >= b.x0 - pad && q.x <= b.x1 + pad && q.y >= b.y0 - pad && q.y <= b.y1 + pad) { selIdx = i; break; } }
          if (selIdx >= 0) { drag = { q, orig: JSON.stringify(list[selIdx]), moved: false }; svgE.setPointerCapture(ev.pointerId); }
          sync();
          return;
        }
        if (tool === 'text') {
          const inp = el('input', 'ae-text-input');
          const r = boxE.getBoundingClientRect();
          inp.style.left = (ev.clientX - r.left) + 'px'; inp.style.top = (ev.clientY - r.top) + 'px';
          inp.placeholder = '输入标注文字，回车确定';
          inp.maxLength = 200;
          boxE.append(inp);
          // 立刻聚焦：点完马上打字时第一个字不能丢（按下时已 preventDefault，焦点不会被抢回去）
          inp.focus();
          setTimeout(() => { if (document.activeElement !== inp && inp.isConnected) inp.focus(); }, 0);
          let done = false;
          const fin = (ok) => { if (done) return; done = true; const v = inp.value.trim(); inp.remove(); if (ok && v) { push(); list.push({ t: 'text', x1: q.x, y1: q.y, s: v, c: color, lw }); } sync(); };
          inp.addEventListener('keydown', (k2) => { k2.stopPropagation(); if (k2.key === 'Enter') fin(true); if (k2.key === 'Escape') fin(false); });
          inp.addEventListener('blur', () => fin(true));
          return;
        }
        if (tool === 'num') { push(); list.push({ t: 'num', x1: q.x, y1: q.y, n: nextNum(), c: color, lw }); sync(); return; }
        cur = tool === 'pen' ? { t: 'pen', pts: [[q.x, q.y]], c: color, lw } : { t: tool, x1: q.x, y1: q.y, x2: q.x, y2: q.y, c: color, lw };
        svgE.setPointerCapture(ev.pointerId);
      });
      svgE.addEventListener('pointermove', (ev) => {
        const q = norm(ev);
        if (drag && selIdx >= 0) {
          const dx = q.x - drag.q.x, dy = q.y - drag.q.y;
          if (!drag.moved && Math.hypot(dx, dy) < 0.003) return;
          if (!drag.moved) { undo.push(JSON.stringify(list)); redo.length = 0; drag.moved = true; }
          const o = JSON.parse(drag.orig), a = list[selIdx];
          if (o.t === 'pen') a.pts = o.pts.map((pt) => [clamp(pt[0] + dx, 0, 1), clamp(pt[1] + dy, 0, 1)]);
          else { a.x1 = clamp(o.x1 + dx, 0, 1); a.y1 = clamp(o.y1 + dy, 0, 1); if (o.x2 != null) { a.x2 = clamp(o.x2 + dx, 0, 1); a.y2 = clamp(o.y2 + dy, 0, 1); } }
          draw();
          return;
        }
        if (!cur) return;
        if (cur.t === 'pen') { const l = cur.pts[cur.pts.length - 1]; if (Math.hypot(q.x - l[0], q.y - l[1]) > 0.003 && cur.pts.length < 600) cur.pts.push([q.x, q.y]); }
        else { cur.x2 = q.x; cur.y2 = q.y; }
        draw();
      });
      const endDraw = () => {
        if (drag) { drag = null; sync(); return; }
        if (!cur) return;
        const big = cur.t === 'pen' ? cur.pts.length > 1 : Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) > 0.01;
        if (big) { push(); list.push(cur); }
        cur = null;
        sync();
      };
      svgE.addEventListener('pointerup', endDraw);
      svgE.addEventListener('pointercancel', endDraw);
      bUndo.addEventListener('click', () => { if (!undo.length) return; redo.push(JSON.stringify(list)); list = JSON.parse(undo.pop()); selIdx = -1; sync(); });
      bRedo.addEventListener('click', () => { if (!redo.length) return; undo.push(JSON.stringify(list)); list = JSON.parse(redo.pop()); selIdx = -1; sync(); });
      bClear.addEventListener('click', () => { if (!list.length) return; push(); list = []; selIdx = -1; sync(); });
      bDel.addEventListener('click', () => { if (selIdx < 0) return; push(); list.splice(selIdx, 1); selIdx = -1; sync(); });
      const close = () => { ed.remove(); window.removeEventListener('resize', fit); document.removeEventListener('keydown', onKey, true); try { if (back && back.focus) back.focus({ preventScroll: true }); else box.focus({ preventScroll: true }); } catch (er) {} };
      const onKey = (ev) => {
        if (ev.target && ev.target.classList && ev.target.classList.contains('ae-text-input')) return;
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); return; }
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); ev.stopPropagation(); (ev.shiftKey ? bRedo : bUndo).click(); return; }
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && selIdx >= 0) { ev.preventDefault(); ev.stopPropagation(); bDel.click(); }
      };
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', fit);
      bCancel.addEventListener('click', close);
      bDone.addEventListener('click', async () => {
        close();
        const node = byKey(k);
        if (!node) return;
        const s0 = snap();
        node.payload = { ...node.payload, annots: list.slice(0, 300), ar, url: '' };
        pushUndo(s0);
        renderAnnotNode(node); scheduleSave();
        if (!list.length) return;
        const kk = keyOf(node);
        st.running.add(kk); renderAnnotNode(node);
        try {
          const out = await flattenAnnot(node.payload);
          const n2 = byKey(kk);
          if (n2 && cv === st && JSON.stringify(n2.payload.annots) === JSON.stringify(list.slice(0, 300))) { n2.payload = { ...n2.payload, url: out.url }; scheduleSave(); }
        } catch (er) {
          console.warn('生成带标注的图失败', er);
          flashHint('标注已保存，但没能生成带标注的图（' + String((er && er.message) || er).slice(0, 60) + '），下游节点会用原图');
        }
        st.running.delete(kk);
        const n3 = byKey(kk);
        if (n3) { renderAnnotNode(n3); refresh({ keepEdges: true }); }
      });
      fit(); sync();
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
    function clearEdgeSel() { st.edgeSel = -1; st.edgeSet.clear(); }
    const edgeOn = (i) => st.edgeSel === i || st.edgeSet.has(i);
    function syncEdgeSel() {
      for (const grp of svg.querySelectorAll('.eg .edge')) {
        const on = edgeOn(Number(grp.dataset.i));
        grp.classList.toggle('on', on);
        grp.classList.toggle('rel', !!(st.rel && st.rel.es.has(Number(grp.dataset.i))));
        const ln = grp.querySelector('.ed');
        if (ln) ln.setAttribute('marker-end', edges()[Number(grp.dataset.i)].arrow === false ? 'none' : on ? 'url(#cvArrowOn)' : 'url(#cvArrow)');
      }
      st.edgeMid = st.edgeSel >= 0 ? (st.edgeMids || [])[st.edgeSel] || null : null;
    }
    /** 选中一张卡时：连进来的是上游，连出去的是下游 */
    function relInfo() {
      const focus = st.sel.size === 1 ? resolveKey([...st.sel][0]) : null;
      const up = new Set(), down = new Set(), es = new Set();
      if (focus) edges().forEach((ed, i) => {
        const f = resolveKey(ed.from), t = resolveKey(ed.to);
        if (t === focus) { up.add(f); es.add(i); }
        if (f === focus) { down.add(t); es.add(i); }
      });
      return { focus, up, down, es };
    }
    function refresh(opts) {
      const solo = st.sel.size === 1;
      st.rel = relInfo();
      box.classList.toggle('focus-mode', !!(st.rel.focus && st.rel.es.size));
      for (const e of ents()) {
        const k = keyOf(e);
        const c = st.cards.get(k);
        if (!c) continue;
        const p = e.payload;
        c.className = 'canvas-card' + (isNodeType(p.type) ? ' ai-node' : '') + (p.type === 'img-search' ? ' sn-node' : '') + (p.type === 'annot' ? ' ann-node' : '') + (p.color && p.type !== 'image' ? ' c-' + p.color : '') + (st.sel.has(k) ? ' sel' : '') + (st.sel.has(k) && solo ? ' solo' : '') + (st.editing === k ? ' editing' : '') + (st.rel.up.has(k) ? ' rel-up' : '') + (st.rel.down.has(k) ? ' rel-down' : '');
        if (p.type === 'ai-image' || p.type === 'ai-text') renderAiNode(e);
        else if (p.type === 'img-search') renderSearchNode(e);
        else if (p.type === 'annot') renderAnnotNode(e);
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
        const on = edgeOn(i);
        st.edgeMids[i] = mid;
        if (on) st.edgeMid = mid;
        const grp = document.createElementNS(SVGNS, 'g');
        grp.setAttribute('class', 'edge' + (on ? ' on' : '') + (st.rel && st.rel.es.has(i) ? ' rel' : ''));
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
    /** 连线文字：在连线中间就地编辑，Enter 保存，Esc 取消，点别处也保存 */
    function editEdgeLabel(i) {
      const ed = edges()[i];
      const mid = (st.edgeMids || [])[i];
      if (!ed || !mid) return;
      const inp = el('input', 'cv-label-input');
      inp.value = ed.label || '';
      inp.maxLength = 80;
      inp.placeholder = '连线文字';
      inp.setAttribute('aria-label', '连线文字');
      inp.style.left = (mid.x * view.z + view.x) + 'px';
      inp.style.top = (mid.y * view.z + view.y) + 'px';
      box.append(inp);
      bar.style.display = 'none';
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        const v = inp.value.trim().slice(0, 80);
        inp.remove();
        box.focus({ preventScroll: true });
        if (!save || v === (ed.label || '')) { refresh({ keepEdges: true }); return; }
        const s0 = snap();
        if (v) ed.label = v; else delete ed.label;
        pushUndo(s0); refresh(); scheduleSave();
      };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
      for (const evName of ['pointerdown', 'dblclick', 'paste', 'wheel']) inp.addEventListener(evName, (e) => e.stopPropagation());
      inp.addEventListener('blur', () => finish(true));
      inp.focus({ preventScroll: true }); inp.select();
      setTimeout(() => { if (inp.isConnected && document.activeElement !== inp) { inp.focus({ preventScroll: true }); inp.select(); } }, 0);
    }
    /** 小菜单：anchor 是按钮元素，或屏幕坐标 {x, y}；onClose 在菜单关掉时调用 */
    let menuEl = null;
    let menuOnClose = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } if (menuOnClose) { const f = menuOnClose; menuOnClose = null; f(); } }
    function popMenu(anchor, items, onClose) {
      closeMenu();
      menuOnClose = onClose || null;
      const m = el('div', 'cv-menu');
      m.setAttribute('role', 'menu');
      for (const it of items) {
        if (it.note) { m.append(el('div', 'cm-note', it.note)); continue; }
        const b = el('button', 'cm-item' + (it.on ? ' on' : ''));
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.innerHTML = (it.html || '') + '<span>' + it.label + '</span>' + (it.sub ? '<em>' + it.sub + '</em>' : '');
        if (it.style) b.querySelector('span').style.cssText = it.style;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); closeMenu(); it.onClick(); });
        b.addEventListener('keydown', (ev) => {
          const all = [...m.querySelectorAll('.cm-item')], i = all.indexOf(b);
          if (ev.key === 'ArrowDown') { ev.preventDefault(); all[(i + 1) % all.length].focus(); }
          if (ev.key === 'ArrowUp') { ev.preventDefault(); all[(i - 1 + all.length) % all.length].focus(); }
          if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(); box.focus({ preventScroll: true }); }
        });
        m.append(b);
      }
      for (const evName of ['pointerdown', 'wheel', 'dblclick']) m.addEventListener(evName, (e) => e.stopPropagation());
      box.append(m);
      menuEl = m;
      const r = rect();
      const a = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
      const mw = m.offsetWidth, mh = m.offsetHeight;
      let left = a.left + a.width / 2 - mw / 2 - r.left;
      left = clamp(left, 8, Math.max(8, r.width - mw - 8));
      let top = a.bottom - r.top + 6;
      if (top + mh > r.height - 8) top = a.top - r.top - mh - 6;
      m.style.left = left + 'px';
      m.style.top = Math.max(8, top) + 'px';
      const first = m.querySelector('.cm-item.on') || m.querySelector('.cm-item');
      if (first) first.focus({ preventScroll: true });
    }
    on(document, 'pointerdown', (ev) => { if (menuEl && !menuEl.contains(ev.target)) closeMenu(); }, { capture: true });
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
      if (!st.sel.size && st.edgeSet.size) {
        const dl = el('button', 'danger', '删除 ' + st.edgeSet.size + ' 条连线');
        dl.type = 'button'; dl.title = 'Delete';
        dl.addEventListener('click', () => deleteSelected());
        bar.append(dl);
        return;
      }
      if (!st.sel.size) return;
      const items = [...st.sel].map(byKey).filter(Boolean);
      if (st.rel && st.rel.focus && st.rel.es.size) {
        bar.append(el('span', 'cb-rel', '上游 ' + st.rel.up.size + ' · 下游 ' + st.rel.down.size));
        bar.append(el('span', 'sep'));
      }
      const same = (key, def) => { const vals = items.map((e) => e.payload[key] == null ? def : e.payload[key]); return vals.every((v) => v === vals[0]) ? vals[0] : null; };
      const setAll = (key, value) => {
        const s0 = snap();
        let v = value;
        if (key === 'layer') { const layers = ents().map((e) => e.payload.layer || 0); v = value === 'front' ? Math.max(...layers) + 1 : Math.min(...layers) - 1; }
        for (const e of items) e.payload[key] = v;
        pushUndo(s0); rebuild(); scheduleSave();
      };
      // AI 节点不需要形状、字号、对齐、颜色
      const plain = items.every((e) => !isNodeType(e.payload.type));
      const textual = plain && items.some((e) => e.payload.type !== 'image');
      const shapeNow = same('shape', 'rect');
      const SHAPE_ICON = {
        rect: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
        circle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7.5"/></svg>',
        diamond: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/></svg>',
      };
      const ALIGN_ICON = {
        left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
        center: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
        right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
      };
      const LAYER_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/></svg>';
      const menuBtn = (html, title, menuItems) => {
        const b = el('button', 'cb-btn');
        b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.setAttribute('aria-haspopup', 'menu');
        b.innerHTML = html + '<svg class="caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); popMenu(b, menuItems()); });
        bar.append(b);
      };
      if (plain) menuBtn(SHAPE_ICON[shapeNow] || SHAPE_ICON.rect, '形状', () => [['rect', '矩形'], ['circle', '圆形'], ['diamond', '菱形']].map(([v, t]) => ({ html: SHAPE_ICON[v], label: t, on: shapeNow === v, onClick: () => setAll('shape', v) })));
      if (textual) {
        const fsNow = same('fontSize', 14);
        menuBtn('<span class="cb-txt">' + (fsNow || '字号') + '</span>', '字号', () => [12, 14, 16, 20, 24, 32, 48].map((n) => ({ label: n + ' 号', style: 'font-size:' + Math.min(n, 22) + 'px', on: fsNow === n, onClick: () => setAll('fontSize', n) })));
        const alNow = same('align', 'left');
        menuBtn(ALIGN_ICON[alNow] || ALIGN_ICON.left, '文字对齐', () => [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']].map(([v, t]) => ({ html: ALIGN_ICON[v], label: t, on: alNow === v, onClick: () => setAll('align', v) })));
      }
      menuBtn(LAYER_ICON, '层级', () => [{ label: '移到最上层', onClick: () => setAll('layer', 'front') }, { label: '移到最下层', onClick: () => setAll('layer', 'back') }]);
      bar.append(el('span', 'sep'));
      const colorable = items.filter((e) => e.payload.type !== 'image' && !isNodeType(e.payload.type));
      if (colorable.length) {
        for (const [name, hex, label] of CARD_COLORS) {
          const d = el('button', 'dot' + (colorable.every((e) => (e.payload.color || '') === name) ? ' on' : ''));
          d.type = 'button'; d.style.background = hex; d.title = label; d.setAttribute('aria-label', label);
          d.addEventListener('click', () => { const s = snap(); for (const e of colorable) e.payload = { ...e.payload, color: name }; pushUndo(s); refresh(); scheduleSave(); });
          bar.append(d);
        }
        bar.append(el('span', 'sep'));
      }
      if (items.length === 1 && ['text', 'image', 'ai-image', 'ai-text', 'img-search', 'annot'].includes(items[0].payload.type)) {
        const ai = el('button', 'cb-ai');
        ai.type = 'button'; ai.title = 'AI：改图、改文、生成'; ai.setAttribute('aria-haspopup', 'menu');
        ai.innerHTML = AI_ICON.spark + '<span>AI</span><svg class="caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';
        ai.addEventListener('click', (ev) => { ev.stopPropagation(); aiMenuForSelection(ai); });
        bar.append(ai);
      }
      if (items.length === 1 && (imageOfCard(items[0]) || (items[0].payload.type === 'img-search' && (items[0].payload.results || []).length))) {
        const pv = el('button', null, '大图');
        pv.type = 'button';
        pv.title = '看大图（图片卡可以双击）；右键还有复制图像、复制提示词、下载';
        pv.addEventListener('click', () => previewCard(items[0]));
        bar.append(pv);
      }
      if (items.length === 1 && items[0].payload.type === 'image' && sourceOfCard(items[0].payload)) {
        const op = el('button', null, '原图页面');
        op.type = 'button';
        op.title = '在新标签页打开这张图的来源页，可以查看和下载原图';
        op.addEventListener('click', () => { window.open(sourceOfCard(items[0].payload), '_blank', 'noopener,noreferrer'); });
        bar.append(op);
      }
      if (items.length === 1 && items[0].payload.type === 'page') {
        const op = el('button', null, '打开');
        op.type = 'button';
        op.addEventListener('click', () => openPageCard(items[0]));
        bar.append(op);
      }
      const dup = el('button', null, '副本');
      dup.type = 'button'; dup.title = '创建副本（Ctrl + D）。复制到剪贴板用 Ctrl + C，右键有更多复制方式';
      dup.addEventListener('click', () => duplicate());
      const del = el('button', 'danger', '删除');
      del.type = 'button'; del.title = 'Delete';
      del.addEventListener('click', () => deleteSelected());
      bar.append(dup, del);
    }
    /** 浮动工具条按实际宽度限制在画布里（居中定位，所以算中心点） */
    function barX(cx) { const half = (bar.offsetWidth || 240) / 2; return clamp(cx, half + 8, Math.max(half + 8, box.clientWidth - half - 8)); }
    function placeBar() {
      if (!st.sel.size && st.edgeSet.size && !st.gesture) {
        const ms = [...st.edgeSet].map((i) => (st.edgeMids || [])[i]).filter(Boolean);
        if (ms.length) {
          const cx = ms.reduce((a, m) => a + m.x, 0) / ms.length, cy = Math.min(...ms.map((m) => m.y));
          bar.style.display = 'flex';
          bar.style.left = barX(cx * view.z + view.x) + 'px';
          bar.style.top = (cy * view.z + view.y - 14) + 'px';
          bar.style.transform = 'translate(-50%,-100%)';
          return;
        }
      }
      if (st.edgeSel >= 0 && !st.sel.size && st.edgeMid && !st.gesture) {
        bar.style.display = 'flex';
        bar.style.left = barX(st.edgeMid.x * view.z + view.x) + 'px';
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
      bar.style.left = barX(cx) + 'px';
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
      st.sel = new Set([keyOf(e)]); clearEdgeSel();
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
      ta.focus({ preventScroll: true });
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
      const idx = new Set(st.edgeSet);
      if (st.edgeSel >= 0) idx.add(st.edgeSel);
      if (!st.sel.size && !idx.size) return;
      const s = snap();
      if (idx.size) S.resource.edges = edges().filter((_, i) => !idx.has(i));
      if (st.sel.size) {
        const ks = new Set([...st.sel].map(resolveKey));
        S.resource.entities = ents().filter((e) => !ks.has(keyOf(e)));
        S.resource.edges = edges().filter((x) => !ks.has(resolveKey(x.from)) && !ks.has(resolveKey(x.to)));
        for (const k of ks) { const c = st.cards.get(k); if (c) c.remove(); st.cards.delete(k); }
      }
      st.sel.clear();
      clearEdgeSel();
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
      // 系统剪贴板写入卡片文字（空卡片写一个标记），粘贴时据此判断剪贴板里还是不是这几张卡
      const plain = cards.map((c) => c.payload.text || c.payload.url || '').filter(Boolean).join('\n\n') || '[毛豆画布卡片 ' + cards.length + ' 张]';
      const clipNow = cvClip = { cards, links, plain, at: Date.now(), sys: false };
      const keep = () => { try { localStorage.setItem('ai.canvasClip', JSON.stringify(clipNow)); } catch (e) {} };
      keep();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(plain).then(() => { clipNow.sys = true; keep(); }).catch(() => {});
      } catch (e) {}
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
      st.sel = new Set(fresh); clearEdgeSel();
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
      if (st.running.delete(oldKey)) st.running.add(newKey);
      if (st.errors.has(oldKey)) { st.errors.set(newKey, st.errors.get(oldKey)); st.errors.delete(oldKey); }
      buildBar();
    };
    st.syncRevs = () => {
      for (const e of ents()) { const c = st.cards.get(keyOf(e)); const ta = c && c.querySelector('textarea'); if (ta) { ta.dataset.eid = e.id || ''; ta.dataset.rev = String(e.revision || 0); } }
      buildBar();
    };

    /* 底部工具条 */
    const tb = (label, title, fn, cls) => { const b = el('button', cls || null); b.type = 'button'; b.title = title; b.innerHTML = label; b.addEventListener('click', (ev) => { if (b._dragged) return; fn(ev); }); tools.append(b); return b; };
    /** 按住工具条按钮拖到画布上：在松手的位置放卡片（直接点击仍然放在画面中央） */
    let lastScreen = { x: 0, y: 0 };
    function dragFromTool(btn, make) {
      if (!btn) return;
      btn.title += '；也可以直接拖到画布上';
      on(btn, 'pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const sx = ev.clientX, sy = ev.clientY;
        let ghost = null;
        const inBoard = (x, y) => { const r = rect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false; const t = document.elementFromPoint(x, y); return !!(t && box.contains(t) && !isUi(t)); };
        const mv = (m) => {
          if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 5) return;
          if (!ghost) {
            ghost = el('div', 'cv-ghost');
            ghost.innerHTML = btn.querySelector('svg') ? btn.querySelector('svg').outerHTML : '';
            ghost.append(el('span', null, (btn.querySelector('.lbl') || btn).textContent));
            document.body.append(ghost);
            btn._dragged = true;
          }
          ghost.style.left = m.clientX + 'px'; ghost.style.top = m.clientY + 'px';
          ghost.classList.toggle('ok', inBoard(m.clientX, m.clientY));
        };
        const up = (u) => {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          if (!ghost) return;
          ghost.remove();
          lastScreen = { x: u.clientX, y: u.clientY };
          if (inBoard(u.clientX, u.clientY)) make(toWorld(u.clientX, u.clientY));
          setTimeout(() => { btn._dragged = false; }, 0);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/></svg><span class="lbl">文本</span>', '新建文本卡（也可以双击空白处）', () => addAtCenter({}, true));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 4h16v10l-6 6H4z" fill="#fff3b0" stroke="#c9a92c"/><path d="M14 20v-6h6" stroke="#c9a92c"/></svg><span class="lbl">便签</span>', '新建便签', () => addAtCenter({ color: 'yellow', w: 200, h: 200 }, true));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg><span class="lbl">图片</span>', '图片：上传本地图片或用链接', (ev) => imageMenu(ev.currentTarget, null));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg><span class="lbl">页面</span>', '放一张链到本空间页面的卡片', () => {
      const list = (S.space.resources || []).filter((r) => r.id !== res.id);
      if (!list.length) { flashHint('这个空间还没有别的页面'); return; }
      openListPanel('链到页面', '卡片双击即可打开对应页面', list.map((r) => ({
        label: r.title || '未命名', sub: r.type === 'canvas' ? '画布' : '页面',
        onClick: () => { const d = $('#dlgList'); if (d) d.hidden = true; addAtCenter({ type: 'page', ref: r.id, text: r.title || '', w: 240, h: 110 }); },
      })));
    });
    tb(AI_ICON.spark + '<span class="lbl">AI</span>', 'AI 节点：生图、生文、改图、改文', (ev) => aiToolMenu(ev.currentTarget, null));
    function aiToolMenu(anchor, pt) {
      const one = st.sel.size === 1 ? byKey([...st.sel][0]) : null;
      const t = one && one.payload.type;
      popMenu(anchor, [
        { html: AI_ICON.image, label: '生图', sub: '写需求，AI 写提示词再画', onClick: () => createAiNode('ai-image', 'gen', pt) },
        { html: AI_ICON.text, label: '生文', sub: '写作、总结、看图说话', onClick: () => createAiNode('ai-text', 'gen', pt) },
        { html: AI_ICON.search, label: '搜图', sub: '搜到的图排在节点里，可拖出来用', onClick: () => createSearchNode(pt, null, '') },
        { html: AI_ICON.image, label: '改图', sub: t === 'image' || t === 'ai-image' ? '改选中的图' : '先选中一张图，或建好后把图连进来', onClick: () => createAiNode('ai-image', 'edit', pt, t === 'image' || t === 'ai-image' ? keyOf(one) : null) },
        { html: AI_ICON.text, label: '改文', sub: t === 'text' || t === 'ai-text' ? '改选中的文字' : '先选中一张文字卡，或建好后连进来', onClick: () => createAiNode('ai-text', 'edit', pt, t === 'text' || t === 'ai-text' ? keyOf(one) : null) },
        { note: '节点的输入就是连进来的卡片（Shift + 拖动连线）；结果可以继续连给下一个节点' },
      ]);
    }
    const toolBtn = (t) => [...tools.querySelectorAll('button')].find((b) => b.title.startsWith(t));
    /** 图片：上传本地图片，或填图片链接；pt 为空时放在画面中央 */
    function imageMenu(anchor, pt) {
      const at = () => { const p = pt || viewCenter(); return { x: p.x - 150, y: p.y - 110 }; };
      popMenu(anchor, [
        { label: '上传本地图片', sub: 'PNG / JPG / WebP / GIF', onClick: () => {
          const picker = document.createElement('input');
          picker.type = 'file'; picker.accept = 'image/png,image/jpeg,image/webp,image/gif'; picker.multiple = true;
          picker.onchange = () => { if (picker.files.length) { flashHint('正在上传 ' + picker.files.length + ' 张图片…'); uploadImages(picker.files, at()); } };
          picker.click();
        } },
        { label: '用图片链接', sub: 'https://… 或站内 /files/…', onClick: async () => {
          const got = await ask({ title: '用图片链接', fields: [{ name: 'url', label: '图片链接', placeholder: 'https://… 或 /files/…', maxLength: 500 }], ok: '放到画布', validate: (v) => /^(https?:\/\/|\/files\/|\/oss\/)\S+$/i.test(v.url) ? '' : '请填写 http(s):// 或 /files/ 开头的图片链接' });
          if (got) { const p = at(); addCard({ type: 'image', url: got.url, w: 300, h: 220 }, p.x, p.y); }
        } },
        { note: '也可以直接 Ctrl + V 粘贴截图，或把图片文件拖进画布' },
      ]);
    }
    const askPageAt = (pt) => {
      const list = (S.space.resources || []).filter((r) => r.id !== res.id);
      if (!list.length) { flashHint('这个空间还没有别的页面'); return; }
      openListPanel('链到页面', '卡片双击即可打开对应页面', list.map((r) => ({
        label: r.title || '未命名', sub: r.type === 'canvas' ? '画布' : '页面',
        onClick: () => { const d = $('#dlgList'); if (d) d.hidden = true; addCard({ type: 'page', ref: r.id, text: r.title || '', w: 240, h: 110 }, pt.x - 120, pt.y - 55); },
      })));
    };
    dragFromTool(toolBtn('新建文本卡'), (pt) => addCard({}, pt.x - 120, pt.y - 40, true));
    dragFromTool(toolBtn('新建便签'), (pt) => addCard({ color: 'yellow', w: 200, h: 200 }, pt.x - 100, pt.y - 100, true));
    dragFromTool(toolBtn('图片：'), (pt) => imageMenu({ x: lastScreen.x, y: lastScreen.y }, pt));
    dragFromTool(toolBtn('放一张链到'), (pt) => askPageAt(pt));
    dragFromTool(toolBtn('AI 节点'), (pt) => aiToolMenu({ x: lastScreen.x, y: lastScreen.y }, pt));
    tools.append(el('span', 'sep'));
    tb('−', '缩小（滚轮）', () => zoomCenter(1 / 1.25));
    const zoomBtn = tb('100%', '恢复 100%', () => zoomCenter(1 / view.z), 'zoom');
    tb('＋', '放大（滚轮）', () => zoomCenter(1.25));
    tb('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="lbl">适应</span>', '适应画布（Shift + 1）', () => fit());

    /* 指针：平移、移动、改大小、连线、框选、双指缩放 */
    const pointers = new Map();
    let pinch = null;
    const isUi = (t) => !!(t.closest && t.closest('.cv-tools,.cv-cardbar,.cv-help,.cv-helpbox,.cv-menu,.cv-label-input'));
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
      // 节点里的按钮、提示词、结果文字：选中节点但不开始拖动，让点击和选字正常进行
      if (cardEl && ev.target.closest('.an-ui')) {
        const k = cardEl.dataset.key;
        if (!st.sel.has(k) || st.sel.size > 1) { st.sel = new Set([k]); clearEdgeSel(); refresh(); }
        pointers.delete(ev.pointerId);
        return;
      }
      const port = ev.target.closest('.cc-port');
      const rz = ev.target.closest('.cc-resize');
      const hit = ev.target.closest('.hit,.elabel');
      try { box.setPointerCapture(ev.pointerId); } catch (e) {}
      if (ev.button === 1 || ev.button === 2 || st.spaceDown || (ev.pointerType === 'touch' && !cardEl)) {
        ev.preventDefault();
        st.gesture = { type: 'pan', sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y };
        st.rdown = ev.button === 2 ? { x: ev.clientX, y: ev.clientY } : null;
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
        clearEdgeSel();
        if (ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
          // 先不决定：拖出去就是连线，原地松开就是加选
          st.gesture = { type: 'shiftcard', k, sx: ev.clientX, sy: ev.clientY };
          return;
        }
        if (ev.metaKey || ev.ctrlKey) {
          if (st.sel.has(k)) { st.sel.delete(k); refresh(); return; }
          st.sel.add(k);
        } else if (!st.sel.has(k)) st.sel = new Set([k]);
        refresh();
        st.gesture = { type: 'move', sx: ev.clientX, sy: ev.clientY, k, items: [...st.sel].map(byKey).filter(Boolean).map((e) => ({ e, ox: e.payload.x, oy: e.payload.y })), s: snap(), moved: false };
        return;
      }
      if (!ev.shiftKey) { st.sel.clear(); clearEdgeSel(); refresh(); }
      st.gesture = { type: 'marquee', sx: ev.clientX, sy: ev.clientY, base: new Set(st.sel), baseEdges: new Set(st.edgeSet) };
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
      if (g.type === 'shiftcard') {
        if (Math.hypot(dx, dy) < 5) return;
        st.gesture = { type: 'link', from: g.k, side: null };
        bar.style.display = 'none';
        return linkMove(st.gesture, ev);
      }
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
      if (g.type === 'link') return linkMove(g, ev);
      if (g.type === 'marquee') {
        const r = rect();
        const x0 = Math.min(g.sx, ev.clientX) - r.left, y0 = Math.min(g.sy, ev.clientY) - r.top;
        const w = Math.abs(dx), h = Math.abs(dy);
        Object.assign(marquee.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' });
        const a = { x: (x0 - view.x) / view.z, y: (y0 - view.y) / view.z };
        const b = { x: a.x + w / view.z, y: a.y + h / view.z };
        st.sel = new Set(g.base);
        for (const e of ents()) { const p = e.payload; if (p.x < b.x && p.x + p.w > a.x && p.y < b.y && p.y + p.h > a.y) st.sel.add(keyOf(e)); }
        st.edgeSel = -1;
        st.edgeSet = new Set(g.baseEdges);
        (st.edgeMids || []).forEach((m, i) => { if (m && m.x >= a.x && m.x <= b.x && m.y >= a.y && m.y <= b.y) st.edgeSet.add(i); });
        refresh({ keepEdges: true });
      }
    });
    /** 朝着指针方向选一条边（Shift 拖动连线时没有指定圆点） */
    function sideToward(p, w) {
      const dx = (w.x - (p.x + p.w / 2)) / p.w, dy = (w.y - (p.y + p.h / 2)) / p.h;
      return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : (dy >= 0 ? 'b' : 't');
    }
    function linkMove(g, ev) {
      const a = byKey(g.from);
      if (!a) return;
      const w = toWorld(ev.clientX, ev.clientY);
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const tc = over && over.closest && over.closest('.canvas-card');
      const target = tc && tc.dataset.key !== g.from ? byKey(tc.dataset.key) : null;
      let geo;
      if (target) {
        const sides = pickSides(a.payload, target.payload);
        geo = curve(sideAnchor(a.payload, g.side || sides[0]), sideAnchor(target.payload, sides[1]));
      } else geo = curve(sideAnchor(a.payload, g.side || sideToward(a.payload, w)), { x: w.x, y: w.y, nx: 0, ny: 0 });
      const tmp = svg.querySelector('.tmp');
      tmp.style.display = '';
      tmp.setAttribute('d', geo.d);
      for (const c of st.cards.values()) c.classList.toggle('drop', c === tc && c.dataset.key !== g.from);
    }
    const endPointer = (ev) => {
      pointers.delete(ev.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; return; }
      const g = st.gesture;
      st.gesture = null;
      box.classList.remove('panning');
      drawGuides([]);
      // 没有手势（比如点的是浮动工具条上的按钮）：什么都不重画，否则按钮在 click 之前就被换掉了
      if (!g) return;
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
        } else if (!tc && over && box.contains(over) && !isUi(over)) {
          // 在空白处松手：就在松手的位置问「要做什么」
          const src = byKey(g.from);
          const w = toWorld(ev.clientX, ev.clientY);
          if (src && Math.hypot(w.x - (src.payload.x + src.payload.w / 2), w.y - (src.payload.y + src.payload.h / 2)) > Math.max(src.payload.w, src.payload.h) / 2 + 20) {
            const tmp = svg.querySelector('.tmp');
            tmp.style.display = '';
            linkMenu(src, w, { x: ev.clientX, y: ev.clientY }, () => { tmp.style.display = 'none'; });
          }
        }
      } else if (g.type === 'marquee') {
        marquee.style.display = 'none';
        // 只框中一条连线：当作单选这条，浮出连线工具条
        if (!st.sel.size && st.edgeSet.size === 1) { st.edgeSel = [...st.edgeSet][0]; st.edgeSet.clear(); }
        refresh({ keepEdges: true });
        return;
      } else if (g.type === 'shiftcard') {
        // Shift + 点击（没拖动）：加选 / 取消选中
        if (st.sel.has(g.k)) st.sel.delete(g.k); else st.sel.add(g.k);
      }
      refresh();
    };
    on(box, 'pointerup', endPointer);
    on(box, 'pointercancel', endPointer);
    on(box, 'dblclick', (ev) => {
      // 按下时画布捕获了指针，dblclick 的 target 会变成画布本身：按坐标取真正点到的元素
      const tgt = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
      if (isUi(tgt) || tgt.closest('.an-ui')) return;
      const cardEl = tgt.closest('.canvas-card');
      if (cardEl) {
        const e = byKey(cardEl.dataset.key);
        if (!e) return;
        if (e.payload.type === 'page') { openPageCard(e); return; }
        if (e.payload.type === 'annot') { openAnnotEditor(cardEl.dataset.key); return; }
        if (e.payload.type === 'image') { previewCard(e); return; }
        startEdit(cardEl.dataset.key);
        return;
      }
      const hitEl = tgt.closest('.hit,.elabel');
      if (hitEl) { editEdgeLabel(Number(hitEl.dataset.i)); return; }
      const w = toWorld(ev.clientX, ev.clientY);
      addCard({}, w.x - 120, w.y - 30, true);
    });
    on(box, 'contextmenu', (ev) => {
      if (st.editing && ev.target.closest('.canvas-card.editing')) return;
      ev.preventDefault();
      const d = st.rdown; st.rdown = null;
      if (d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return; // 右键拖动是平移，不弹菜单
      const tgt = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
      if (!tgt || isUi(tgt)) return;
      const cardEl = tgt.closest('.canvas-card');
      if (!cardEl) return;
      const k = cardEl.dataset.key, e = byKey(k);
      if (!e) return;
      const pt = { x: ev.clientX, y: ev.clientY };
      const item = tgt.closest('.sn-item');
      if (item) { searchItemMenu(e, Number(item.dataset.i), pt); return; }
      if (!st.sel.has(k)) { st.sel = new Set([k]); clearEdgeSel(); refresh(); }
      cardMenu(e, pt);
    });
    on(box, 'wheel', (ev) => {
      if (isUi(ev.target)) return;
      const sc = ev.target.closest && ev.target.closest('.an-scroll');
      if (sc && !(ev.ctrlKey || ev.metaKey) && sc.scrollHeight > sc.clientHeight + 1) return;
      if (st.editing && ev.target.closest('.canvas-card.editing') && !(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
      // 捏合手势（浏览器会带上 ctrlKey）或 Ctrl + 滚轮：缩放
      if (ev.ctrlKey || ev.metaKey) { zoomAt(ev.clientX, ev.clientY, view.z * clamp(Math.exp(-ev.deltaY * unit * 0.0025), 0.8, 1.25)); return; }
      // 区分鼠标滚轮和触控板：滚轮一格的位移大且没有横向分量；触控板是一串小位移
      const now = performance.now();
      const small = ev.deltaMode === 0 && (Math.abs(ev.deltaY) < 50 || ev.deltaX !== 0);
      if (small) st.padAt = now;
      const trackpad = small || (st.padAt && now - st.padAt < 300);
      if (!trackpad && !ev.shiftKey) { zoomAt(ev.clientX, ev.clientY, view.z * clamp(Math.exp(-ev.deltaY * unit * 0.0015), 0.8, 1.25)); return; }
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
      if (mod && (k === 'a' || k === 'A')) { ev.preventDefault(); st.sel = new Set(ents().map(keyOf)); clearEdgeSel(); refresh(); return; }
      if (mod && (k === 'd' || k === 'D')) { ev.preventDefault(); duplicate(); return; }
      if (mod && (ev.code === 'KeyC' || k === 'c' || k === 'C') && (ev.shiftKey || ev.altKey)) {
        ev.preventDefault();
        const e = [...st.sel].map(byKey).filter(Boolean).find((x) => imageOfCard(x)) || (st.sel.size === 1 ? byKey([...st.sel][0]) : null);
        if (!e) { flashHint('先选中一张图片'); return; }
        if (ev.shiftKey) copyImageOut(imageOfCard(e)); else copyPromptOut(e);
        return;
      }
      if (mod && (k === 'c' || k === 'C')) { if (st.sel.size) { ev.preventDefault(); copySel(false); } return; }
      if (mod && (k === 'x' || k === 'X')) { if (st.sel.size) { ev.preventDefault(); copySel(true); } return; }
      if (mod && (k === '=' || k === '+')) { ev.preventDefault(); zoomCenter(1.25); return; }
      if (mod && k === '-') { ev.preventDefault(); zoomCenter(1 / 1.25); return; }
      if (mod && k === '0') { ev.preventDefault(); zoomCenter(1 / view.z); return; }
      if (ev.shiftKey && (k === '!' || k === '1')) { ev.preventDefault(); fit(); return; }
      if (k === 'Escape') { st.sel.clear(); clearEdgeSel(); refresh(); return; }
      if (k === 'Enter' && st.sel.size === 1) { ev.preventDefault(); startEdit([...st.sel][0]); return; }
      const step = ev.shiftKey ? 10 : 1;
      if (k === 'ArrowLeft') { ev.preventDefault(); nudge(-step, 0); return; }
      if (k === 'ArrowRight') { ev.preventDefault(); nudge(step, 0); return; }
      if (k === 'ArrowUp') { ev.preventDefault(); nudge(0, -step); return; }
      if (k === 'ArrowDown') { ev.preventDefault(); nudge(0, step); return; }
    });
    on(box, 'keyup', (ev) => { if (ev.key === ' ') { st.spaceDown = false; box.classList.remove('space-pan'); } if (ev.key === 'Shift') box.classList.remove('shift-link'); });
    on(box, 'keydown', (ev) => { if (ev.key === 'Shift' && !st.editing) box.classList.add('shift-link'); });
    on(box, 'blur', () => box.classList.remove('shift-link'));
    on(box, 'blur', () => { st.spaceDown = false; box.classList.remove('space-pan'); });

    // 粘贴：本画布复制的卡片 → 原样粘贴；外部文字 → 文本卡；图片链接 → 图片卡
    let lastPt = null;
    on(box, 'pointermove', (ev) => { lastPt = toWorld(ev.clientX, ev.clientY); });
    function clipImages(cd) {
      if (!cd) return [];
      const ok = (f) => f && /^image\/(png|jpe?g|webp|gif)$/.test(f.type);
      const fromFiles = [...(cd.files || [])].filter(ok);
      if (fromFiles.length) return fromFiles;
      // Chrome 粘贴截图时有时只放在 items 里
      return [...(cd.items || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(ok);
    }
    function onPaste(ev) {
      if (st.editing) return;
      const cd = ev.clipboardData;
      const c = viewCenter();
      const at = lastPt || { x: c.x, y: c.y };
      const imgs = clipImages(cd);
      if (imgs.length) {
        ev.preventDefault();
        flashHint('正在上传 ' + imgs.length + ' 张图片…');
        uploadImages(imgs, { x: at.x - 150, y: at.y - 110 }).catch((e) => flashHint('上传失败：' + ((e && e.message) || e)));
        return;
      }
      const text = (cd && cd.getData('text/plain')) || '';
      let clip = cvClip;
      if (!clip) { try { clip = JSON.parse(localStorage.getItem('ai.canvasClip') || 'null'); } catch (e) {} }
      // 剪贴板内容和上次复制的卡片对得上才粘卡片；写系统剪贴板失败时（没有权限）退回：剪贴板为空就粘卡片
      const isOurs = clip && clip.cards && clip.cards.length && (text === clip.plain || (!text && !clip.sys));
      if (isOurs) {
        ev.preventDefault();
        pasteClip(clip, { x: at.x - 20, y: at.y - 20 });
        return;
      }
      const t = text.trim();
      if (!t) { if (cd && [...(cd.items || [])].some((it) => it.kind === 'file')) flashHint('只支持粘贴 PNG、JPG、WebP、GIF 图片'); return; }
      ev.preventDefault();
      if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(t) || /^\/files\/\S+\.(png|jpe?g|gif|webp)$/i.test(t)) { addCard({ type: 'image', url: t.slice(0, 500), w: 300, h: 220 }, at.x - 150, at.y - 110); return; }
      const long = t.length > 160;
      addCard({ text: t.slice(0, 4000), w: long ? 320 : 240, h: clamp(Math.ceil(t.length / (long ? 22 : 16)) * 22 + 30, 100, CV.MAXH) }, at.x - 120, at.y - 40);
    }
    on(box, 'paste', onPaste);
    // 焦点不在画布上（比如刚点过页面别处）也能把东西粘到当前画布；输入框里的粘贴不拦
    on(document, 'paste', (ev) => {
      if (box.contains(ev.target)) return;
      if (state.view !== 'spaces' || !box.isConnected || !box.offsetParent) return;
      const t = ev.target;
      if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"],.overlay:not([hidden])')) return;
      onPaste(ev);
    });
    // 画布容器不能自己滚动（聚焦卡片里的输入框时浏览器会自动滚动），否则坐标全部错位
    on(box, 'scroll', () => { if (box.scrollTop || box.scrollLeft) { box.scrollTop = 0; box.scrollLeft = 0; } });
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
    const got = await ask({ title: '用 AI 修改这张卡', sub: '说说希望怎么改，AI 改完直接写回卡片，可以 Ctrl + Z 撤销。', fields: [{ name: 'ins', type: 'textarea', rows: 3, value: '润色这段文字' }], ok: '修改', validate: (v) => v.ins ? '' : '请写一下怎么改' });
    const instruction = got && got.ins;
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
                  if (!await askConfirm('回滚到 v' + v.version + '？', '会生成一个新版本，原来的历史都保留。', '回滚')) return;
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
            if (!await askConfirm('删除扩展「' + (x.name || x.id) + '」？', '删除后空间成员都不能再打开它。', '删除', true)) return;
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
            if (!await askConfirm('移除「' + (m.name || m.userId) + '」？', '移除后对方不再是成员；如果是私人空间，对方将看不到这个空间。', '移除', true)) return;
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
    const got = await ask({ title: '安装扩展', sub: '扩展是一个网页小工具，在沙箱里打开。脚本要写在页面里，不能引用外部资源。', fields: [
      { name: 'name', label: '名称', value: '新扩展', maxLength: 60 },
      { name: 'html', label: 'HTML', type: 'textarea', rows: 8, placeholder: '<!doctype html>…' },
    ], ok: '安装', validate: (v) => !v.name ? '请填写名称' : !v.html ? '请粘贴扩展的 HTML' : '' });
    if (!got) return;
    const { name, html } = got;
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
    const got = await ask({ title: 'AI 生成扩展', sub: '描述你要的小工具，AI 会写成一个扩展装进这个空间。', fields: [{ name: 'p', type: 'textarea', rows: 4, placeholder: '例如：一个练字用的字帖小工具，可以选字体和格子大小' }], ok: '生成', validate: (v) => v.p ? '' : '请描述一下要什么扩展' });
    const promptText = got && got.p;
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
    const got = await ask({ title: '用邀请码加入空间', sub: '邀请码由空间所有者生成，7 天内有效。', fields: [{ name: 'code', label: '邀请码', placeholder: '粘贴邀请码' }], ok: '加入', validate: (v) => v.code ? '' : '请填写邀请码' });
    const code = got && got.code;
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
    const got = await ask({ title: '生成邀请码', sub: '拿到邀请码的人可以加入「' + (S.space.title || '空间') + '」。', fields: [{ name: 'role', label: '加入后的角色', type: 'choice', options: ROLE_OPTIONS, value: 'editor' }], ok: '生成' });
    if (!got) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/invites', { method: 'POST', body: { role: got.role } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '生成失败'); return; }
    await ask({ title: '邀请码', sub: '7 天内有效。发给同事，对方在空间标签栏「＋」→「用邀请码加入」里输入。', fields: [{ name: 'code', value: j.invite.code, readOnly: true, copy: true }], ok: '完成', cancel: false });
  }

  async function addMember() {
    if (!S.space) return;
    const got = await ask({ title: '邀请成员', sub: '对方要在本站登录过一次，才能被加进来。', fields: [
      { name: 'name', label: '昵称', placeholder: '对方登录用的昵称' },
      { name: 'role', label: '角色', type: 'choice', options: ROLE_OPTIONS, value: 'editor' },
    ], ok: '加入空间', validate: (v) => v.name ? '' : '请填写昵称', extra: (close) => {
      const a = el('button', 'sd-link', '对方还没登录过？生成一个邀请码发给他');
      a.type = 'button';
      a.addEventListener('click', () => { close(null); inviteToSpace(); });
      return a;
    } });
    if (!got) return;
    const { name, role } = got;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/members', { method: 'POST', body: { name, role } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '添加失败'); return; }
    await openSpace(S.space.id);
    flashHint('已加入空间');
  }
  function closeList() { const d = $('#dlgList'); if (d) d.hidden = true; }
  function addSpaceMenu() { createSpace(); }
  async function createSpace() {
    closeList();
    const got = await ask({ title: '新建空间', fields: [
      { name: 'title', label: '名称', value: '新空间', maxLength: 120 },
      { name: 'visibility', label: '谁能看', type: 'choice', value: 'public', options: [['public', '公开', '所有人能看能编辑，不用邀请'], ['private', '🔒 私人', '只有你和你加进来的成员能看']] },
    ], ok: '新建', validate: (v) => v.title ? '' : '请填写名称', extra: (close) => {
      const a = el('button', 'sd-link', '有邀请码？加入别人的空间');
      a.type = 'button';
      a.addEventListener('click', () => { close(null); joinSpace(); });
      return a;
    } });
    if (!got) return;
    const { title, visibility } = got;
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
    if (!await askConfirm(next === 'private' ? '设为私人空间？' : '设为公开空间？', tip.replace(/^设为(私人|公开)空间？/, ''), next === 'private' ? '设为私人' : '设为公开', next === 'private')) return;
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
      const title = type === 'canvas' ? '未命名画布' : '未命名页面';
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources', { method: 'POST', body: { type, title } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { flashHint(j.error || '新建失败'); return; }
      await openSpace(S.space.id, j.resource && j.resource.id);
      // 标题选中：直接打字就是改名
      const t = $('#spaceResTitle');
      if (t && !t.disabled) { t.focus(); t.select(); }
    };
    openListPanel('新建', '在「' + (S.space.title || '空间') + '」里', [
      { label: '页面', sub: '写文字，按段落分块；建好后直接改标题', onClick: () => make('page') },
      { label: '画布', sub: '白板：卡片、便签、图片、连线；建好后直接改标题', onClick: () => make('canvas') },
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
  $('#spaceResTitle').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    const ed = $('#pageEditor');
    const firstTa = ed && ed.querySelector('.page-block textarea');
    if (firstTa) firstTa.focus(); else if (ed && ed.tabIndex >= 0) ed.focus({ preventScroll: true }); else e.target.blur();
  });
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
    const got = await ask(action === 'ask'
      ? { title: '问 AI', sub: '针对选中的文字提问，只回答，不改原文。', fields: [{ name: 'ins', type: 'textarea', rows: 3, value: '解释这段内容' }], ok: '提问', validate: (v) => v.ins ? '' : '请写一下想问什么' }
      : { title: '用 AI 修改选中的文字', sub: '先给出修改建议，确认后才写入页面。', fields: [{ name: 'ins', type: 'textarea', rows: 3, value: '润色这段文字' }], ok: '生成建议', validate: (v) => v.ins ? '' : '请写一下怎么改' });
    const instruction = got && got.ins;
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
  return { render, openSpace, openPage, saveToSpace };
}
