export function mountSpaces(ctx) {
  const { api, el, $, state, renderAll, openListPanel, flashHint, openPluginViewer, base } = ctx;
  const S = { spaces: null, space: null, resource: null, tab: 'comments', activeEntity: null, saveTimer: null, saving: false, conflict: false, comments: [] };
  function roleLabel(role) { return { owner: '所有者', editor: '编辑', commenter: '评论者', viewer: '只读', admin: '管理员' }[role] || role; }
  async function loadSpaces(force) {
    if (S.spaces && !force) return S.spaces;
    const r = await api('/spaces');
    const j = await r.json().catch(() => ({}));
    S.spaces = Array.isArray(j.spaces) ? j.spaces : [];
    return S.spaces;
  }
  function render() {
    const page = $('#spacesPage');
    if (!page) return;
    const list = $('#spacesList');
    const work = $('#spaceWork');
    const back = $('#spaceBack');
    const addM = $('#spaceAddMember');
    if (S.space) {
      $('#spacesTitle').textContent = S.space.title || '空间';
      $('#spacesSub').textContent = '成员 ' + (S.space.members || []).length + ' 人 · 你的角色：' + roleLabel(S.space.role);
      list.hidden = true;
      work.hidden = false;
      back.hidden = false;
      addM.hidden = !['owner', 'admin'].includes(S.space.role);
      $('#newSpaceBtn').hidden = true;
      renderTree();
      renderEditor();
      renderSide();
      return;
    }
    $('#spacesTitle').textContent = '空间';
    $('#spacesSub').textContent = '空间是一起工作的资料容器：成员、页面、评论和通知都按空间隔离。';
    work.hidden = true;
    list.hidden = false;
    back.hidden = true;
    addM.hidden = true;
    $('#newSpaceBtn').hidden = false;
    list.textContent = '';
    const spaces = S.spaces || [];
    if (!spaces.length) {
      const e = el('div', 'pp-empty');
      e.append(el('div', 't', '还没有空间'));
      e.append(el('div', 'd', '新建一个空间，把同事加进来一起写页面。'));
      list.append(e);
      return;
    }
    for (const s of spaces) {
      const card = el('button', 'space-card');
      card.type = 'button';
      card.append(el('div', 'sc-t', s.title || '未命名空间'));
      card.append(el('div', 'sc-m', (s.memberCount || 0) + ' 位成员 · ' + roleLabel(s.role)));
      card.addEventListener('click', () => openSpace(s.id).catch(() => {}));
      list.append(card);
    }
  }
  async function openSpace(id) {
    const r = await api('/spaces/' + encodeURIComponent(id));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '打不开空间'); return; }
    S.space = j.space;
    S.resource = null;
    S.activeEntity = null;
    S.comments = [];
    S.extensions = [];
    try { const er = await api('/spaces/' + encodeURIComponent(id) + '/extensions'); const ej = await er.json().catch(() => ({})); S.extensions = Array.isArray(ej.extensions) ? ej.extensions : []; } catch (e) {}
    if (j.space.resources && j.space.resources.length) await openResource(j.space.resources[0].id);
    else { S.resource = null; render(); }
  }
  async function openResource(rid) {
    if (!S.space) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(rid));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '打不开页面'); return; }
    S.resource = j.resource;
    S.activeEntity = (j.resource.entities || [])[0] ? j.resource.entities[0].id : null;
    S.conflict = false;
    render();
    loadComments();
  }
  function renderTree() {
    const box = $('#spaceRes');
    if (!box) return;
    box.textContent = '';
    for (const r of (S.space.resources || [])) {
      const b = el('button', 'space-res-item' + (S.resource && S.resource.id === r.id ? ' on' : ''), r.title || '未命名');
      b.type = 'button';
      b.append(el('span', 'rt', r.type === 'canvas' ? '画布' : '页面'));
      b.addEventListener('click', () => { openResource(r.id).catch(() => {}); });
      box.append(b);
    }
    if (!(S.space.resources || []).length) box.append(el('div', 'set-hint', '还没有页面，点右上角 ＋ 新建。'));
  }
  function renderEditor() {
    const box = $('#pageEditor');
    const title = $('#spaceResTitle');
    if (!box) return;
    const res = S.resource;
    box.textContent = '';
    if (!res) { title.value = ''; title.disabled = true; return; }
    title.disabled = false;
    title.value = res.title || '';
    const isCanvas = res.type === 'canvas';
    box.classList.toggle('canvas-board', isCanvas);
    $('#addBlockBtn').textContent = isCanvas ? '＋ 文本卡' : '＋ 添加文本块';
    $('#linkCardsBtn').hidden = !isCanvas;
    if (isCanvas) { renderCanvas(box, res); return; }
    for (const e of (res.entities || [])) {
      const row = el('div', 'page-block');
      const ta = document.createElement('textarea');
      ta.value = (e.payload && e.payload.text) || '';
      ta.dataset.eid = e.id || '';
      ta.dataset.rev = String(e.revision || 0);
      ta.placeholder = '写点什么…';
      ta.addEventListener('focus', () => { S.activeEntity = e.id; });
      ta.addEventListener('input', () => {
        e.payload = { text: ta.value };
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
    $('#spaceSaveState').textContent = S.conflict ? '有冲突，请刷新' : '';
  }
  function renderCanvas(box, res) {
    for (const e of (res.entities || [])) {
      const p = e.payload || {};
      const card = el('div', 'canvas-card');
      card.style.left = (p.x || 20) + 'px';
      card.style.top = (p.y || 20) + 'px';
      card.style.width = (p.w || 240) + 'px';
      card.style.height = (p.h || 160) + 'px';
      card.dataset.eid = e.id || '';
      card.dataset.rev = String(e.revision || 0);
      const label = { text: '文本卡', image: '图片卡', file: '文件卡', page: '页面卡' }[p.type] || '卡片';
      const head = el('div', 'cc-head');
      head.append(el('span', null, label));
      const acts = el('div', 'cc-acts');
      if (e.id) {
        const ai = el('button', 'cc-ai', 'AI');
        ai.type = 'button'; ai.title = '用 AI 修改这张卡的文字';
        ai.addEventListener('click', () => aiEditCard(e));
        acts.append(ai);
      }
      const del = el('button', 'cc-del', '×');
      del.type = 'button';
      del.title = '删除卡片';
      del.addEventListener('click', () => {
        S.resource.entities = (S.resource.entities || []).filter((x) => x !== e);
        renderEditor();
        scheduleSave();
      });
      acts.append(del);
      head.append(acts);
      if (p.type === 'image' && p.url) {
        const img = document.createElement('img');
        img.src = p.url; img.loading = 'lazy'; img.style.cssText = 'width:100%;height:calc(100% - 26px);object-fit:cover;display:block';
        card.append(head, img);
      } else {
        const ta = document.createElement('textarea');
        ta.value = p.text || '';
        ta.placeholder = p.type === 'file' ? ('文件：' + (p.ref || '未命名')) : p.type === 'page' ? ('页面：' + (p.ref || '未命名')) : '卡片内容…';
        ta.addEventListener('focus', () => { S.activeEntity = e.id; });
        ta.addEventListener('input', () => { e.payload = { ...(e.payload || {}), text: ta.value }; scheduleSave(); });
        card.append(head, ta);
      }
      card.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('textarea,button')) return;
        if (S.linkMode) {
          if (!S.linkFrom) { S.linkFrom = e.id; card.classList.add('link-from'); } else if (S.linkFrom !== e.id) {
            S.resource.edges = (S.resource.edges || []).concat([{ from: S.linkFrom, to: e.id }]);
            S.linkFrom = null; S.linkMode = false; $('#linkCardsBtn').classList.remove('on');
            renderEditor(); scheduleSave();
          }
          return;
        }
        S.activeEntity = e.id;
        const sx = ev.clientX, sy = ev.clientY, ox = Number(p.x) || 0, oy = Number(p.y) || 0;
        card.setPointerCapture(ev.pointerId);
        card.classList.add('dragging');
        const move = (m) => {
          const nx = Math.max(0, ox + m.clientX - sx), ny = Math.max(0, oy + m.clientY - sy);
          card.style.left = nx + 'px'; card.style.top = ny + 'px';
          e.payload = { ...(e.payload || {}), x: Math.round(nx), y: Math.round(ny) };
        };
        const up = () => {
          card.classList.remove('dragging');
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerup', up);
          scheduleSave();
        };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', up);
      });
      box.append(card);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'canvas-edges');
    svg.setAttribute('width', '2000'); svg.setAttribute('height', '1200');
    for (const ed of (res.edges || [])) {
      const a = (res.entities || []).find((x) => x.id === ed.from);
      const b = (res.entities || []).find((x) => x.id === ed.to);
      if (!a || !b) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', (a.payload.x || 0) + (a.payload.w || 240) / 2);
      line.setAttribute('y1', (a.payload.y || 0) + (a.payload.h || 160) / 2);
      line.setAttribute('x2', (b.payload.x || 0) + (b.payload.w || 240) / 2);
      line.setAttribute('y2', (b.payload.y || 0) + (b.payload.h || 160) / 2);
      line.setAttribute('stroke', 'rgba(120,120,120,.55)'); line.setAttribute('stroke-width', '2');
      svg.append(line);
    }
    box.append(svg);
    if (!(res.entities || []).length) box.append(el('div', 'set-hint', '画布还是空的，点下面「＋ 文本卡」。'));
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

  function scheduleSave() {
    if (S.saveTimer) clearTimeout(S.saveTimer);
    $('#spaceSaveState').textContent = '未保存…';
    S.saveTimer = setTimeout(() => { savePage().catch(() => {}); }, 650);
  }
  async function savePage() {
    if (S.saving || !S.resource || !S.space) return;
    const titleEl = $('#spaceResTitle');
    let blocks;
    if (S.resource.type === 'canvas') {
      blocks = (S.resource.entities || []).map((e) => ({ id: e.id || undefined, expectedRevision: Number(e.revision) || 0, payload: e.payload || {} }));
      S.resource.edges = S.resource.edges || [];
    } else {
      blocks = [...document.querySelectorAll('#pageEditor .page-block textarea')].map((ta) => ({
        id: ta.dataset.eid || undefined,
        expectedRevision: Number(ta.dataset.rev) || 0,
        payload: { text: ta.value },
      }));
    }
    S.saving = true;
    $('#spaceSaveState').textContent = '保存中…';
    try {
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id), {
        method: 'PUT',
        body: { baseRevision: S.resource.revision, title: titleEl ? titleEl.value : S.resource.title, entities: blocks, edges: S.resource.type === 'canvas' ? (S.resource.edges || []) : undefined },
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) { S.conflict = true; $('#spaceSaveState').textContent = '有冲突，已保留你的输入'; flashHint(j.error || '页面已被其他人修改'); return; }
      if (!r.ok) { $('#spaceSaveState').textContent = '保存失败'; flashHint(j.error || '保存失败'); return; }
      S.resource = j.resource;
      for (const e of (j.resource.entities || [])) {
        const ta = document.querySelector('#pageEditor textarea[data-eid="' + e.id + '"]');
        if (ta) { ta.dataset.rev = String(e.revision); }
      }
      S.conflict = false;
      $('#spaceSaveState').textContent = '已保存';
      setTimeout(() => { const x = $('#spaceSaveState'); if (x) x.textContent = ''; }, 1200);
      renderTree();
    } finally { S.saving = false; }
  }
  async function loadComments() {
    if (!S.space || !S.resource) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id) + '/comments');
    const j = await r.json().catch(() => ({ comments: [] }));
    S.comments = Array.isArray(j.comments) ? j.comments : [];
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
            const rows2 = (vj.versions || []).map((v) => ({
              label: 'v' + v.version + (v.version === x.version ? '（当前）' : ''),
              sub: new Date(v.createdAt).toLocaleString(),
              onClick: async () => {
                if (v.version === x.version) return;
                if (!confirm('回滚到 v' + v.version + '？会生成新版本。')) return;
                const rr = await api('/spaces/' + encodeURIComponent(sp.id) + '/extensions/' + encodeURIComponent(x.id) + '/rollback', { method: 'POST', body: { version: v.version } });
                const jj = await rr.json().catch(() => ({}));
                if (!rr.ok) { flashHint(jj.error || '回滚失败'); return; }
                await openSpace(sp.id);
                flashHint('已回滚到 v' + v.version);
              },
            }));
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
    renderSide();
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
    renderSide();
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
  async function createSpace() {
    const title = (prompt('空间名称', '新空间') || '').trim();
    if (!title) return;
    const r = await api('/spaces', { method: 'POST', body: { title } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '创建失败'); return; }
    S.spaces = null;
    await loadSpaces(true);
    await openSpace(j.space.id);
  }
  async function createPage() {
    if (!S.space) return;
    const kind = (prompt('类型：page=页面，canvas=画布', 'page') || '').trim();
    if (!kind) return;
    const type = kind === 'canvas' ? 'canvas' : 'page';
    const title = (prompt(type === 'canvas' ? '画布标题' : '页面标题', type === 'canvas' ? '新画布' : '新页面') || '').trim();
    if (!title) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources', { method: 'POST', body: { type, title } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flashHint(j.error || '新建失败'); return; }
    await openSpace(S.space.id);
    if (j.resource) await openResource(j.resource.id);
  }
  async function showNotifications() {
    const r = await api('/notifications?limit=20');
    const j = await r.json().catch(() => ({ items: [] }));
    const items = Array.isArray(j.items) ? j.items : [];
    const rows = items.map((n) => ({
      label: (n.kind === 'mention' ? '@ 提及 · ' : '') + (n.body || ''),
      sub: new Date(n.createdAt).toLocaleString() + (n.readAt ? ' · 已读' : ''),
      onClick: async () => { if (n.spaceId) { await openSpace(n.spaceId); if (n.resourceId) await openResource(n.resourceId); } },
    }));
    if (!rows.length) rows.push({ label: '还没有通知', sub: '' });
    openListPanel('通知', items.length ? '最近 ' + items.length + ' 条' : '空间里的 @ 会出现在这里', rows);
    if (items.some((n) => !n.readAt)) api('/notifications/read', { method: 'POST', body: {} }).catch(() => {});
  }
  $('#navSpaces').addEventListener('click', async () => {
    state.view = 'spaces';
    S.space = null;
    S.resource = null;
    renderAll();
    try { await loadSpaces(true); } catch (e) {}
    render();
  });
  $('#newSpaceBtn').addEventListener('click', () => createSpace());
  $('#joinSpaceBtn').addEventListener('click', () => joinSpace());
  $('#spaceBack').addEventListener('click', () => { S.space = null; S.resource = null; render(); });
  $('#newResourceBtn').addEventListener('click', () => createPage());
  $('#spaceNotif').addEventListener('click', () => showNotifications());
  $('#spaceAddMember').addEventListener('click', () => addMember());
  $('#linkCardsBtn').addEventListener('click', () => {
    if (!S.resource || S.resource.type !== 'canvas') return;
    S.linkMode = !S.linkMode; S.linkFrom = null;
    $('#linkCardsBtn').classList.toggle('on', S.linkMode);
    flashHint(S.linkMode ? '点两张卡建立连线' : '已退出连线');
  });
  $('#addBlockBtn').addEventListener('click', () => {
    if (!S.resource) return;
    if (S.resource.type === 'canvas') {
      const n = (S.resource.entities || []).length;
      const kind = (prompt('卡片类型：text / image / file / page', 'text') || 'text').trim();
      const type = ['text', 'image', 'file', 'page'].includes(kind) ? kind : 'text';
      let payload = { text: '', x: 20 + (n % 5) * 30, y: 20 + (n % 4) * 30, w: 240, h: 160, type };
      if (type === 'image') { const url = (prompt('图片 URL（可粘贴站内 /files/... 或 https://...）') || '').trim(); if (!url) return; payload = { ...payload, url, w: 280, h: 200 }; }
      if (type === 'file' || type === 'page') { const ref = (prompt(type === 'file' ? '文件名' : '页面名') || '').trim(); if (!ref) return; payload = { ...payload, ref, text: ref }; }
      S.resource.entities = (S.resource.entities || []).concat([{ id: '', payload, revision: 0 }]);
    } else {
      S.resource.entities = (S.resource.entities || []).concat([{ id: '', payload: { text: '' }, revision: 0 }]);
    }
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
      $('#tabComments').classList.add('on'); $('#tabMembers').classList.remove('on');
      renderSide();
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
        body: { action, entityId: sel.id, expectedRevision: sel.revision, from: sel.from, to: sel.to, instruction },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('#spaceSaveState').textContent = ''; flashHint(j.error || 'AI 调用失败'); return; }
      if (action === 'ask') {
        $('#spaceSaveState').textContent = '';
        openListPanel('选区问答', '只回答，不改原文', [{ label: (j.answer || '').slice(0, 2000), sub: 'AI 回答' }]);
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
  return { render, openSpace };
}
