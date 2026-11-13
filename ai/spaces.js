export function mountSpaces(ctx) {
  const { api, el, $, state, renderAll, openListPanel, flashHint } = ctx;
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
  function scheduleSave() {
    if (S.saveTimer) clearTimeout(S.saveTimer);
    $('#spaceSaveState').textContent = '未保存…';
    S.saveTimer = setTimeout(() => { savePage().catch(() => {}); }, 650);
  }
  async function savePage() {
    if (S.saving || !S.resource || !S.space) return;
    const titleEl = $('#spaceResTitle');
    const blocks = [...document.querySelectorAll('#pageEditor .page-block textarea')].map((ta) => ({
      id: ta.dataset.eid || undefined,
      expectedRevision: Number(ta.dataset.rev) || 0,
      payload: { text: ta.value },
    }));
    S.saving = true;
    $('#spaceSaveState').textContent = '保存中…';
    try {
      const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources/' + encodeURIComponent(S.resource.id), {
        method: 'PUT',
        body: { baseRevision: S.resource.revision, title: titleEl ? titleEl.value : S.resource.title, entities: blocks },
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
    const title = (prompt('页面标题', '新页面') || '').trim();
    if (!title) return;
    const r = await api('/spaces/' + encodeURIComponent(S.space.id) + '/resources', { method: 'POST', body: { type: 'page', title } });
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
  $('#spaceBack').addEventListener('click', () => { S.space = null; S.resource = null; render(); });
  $('#newResourceBtn').addEventListener('click', () => createPage());
  $('#spaceNotif').addEventListener('click', () => showNotifications());
  $('#spaceAddMember').addEventListener('click', () => addMember());
  $('#addBlockBtn').addEventListener('click', () => {
    if (!S.resource) return;
    S.resource.entities = (S.resource.entities || []).concat([{ id: '', payload: { text: '' }, revision: 0 }]);
    renderEditor();
    scheduleSave();
    const tas = document.querySelectorAll('#pageEditor textarea');
    if (tas.length) tas[tas.length - 1].focus();
  });
  $('#spaceResTitle').addEventListener('input', () => scheduleSave());
  $('#tabComments').addEventListener('click', () => { S.tab = 'comments'; $('#tabComments').classList.add('on'); $('#tabMembers').classList.remove('on'); renderSide(); });
  $('#tabMembers').addEventListener('click', () => { S.tab = 'members'; $('#tabMembers').classList.add('on'); $('#tabComments').classList.remove('on'); renderSide(); });
  return { render, openSpace };
}
