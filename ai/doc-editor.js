const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function hrefOf(input, image = false) {
  const value = String(input || '').trim();
  if (!value || /[\u0000-\u001f\\]/.test(value)) return '';
  if (/^https?:\/\/[^/]/i.test(value) || /^\/(?!\/)/.test(value)) return value;
  return !image && (/^mailto:[^ ]+$/i.test(value) || value.startsWith('#')) ? value : '';
}
const unescapeMd = text => text.replace(/\\([\\[\]()<>])/g,'$1');
const escapeLabel = text => String(text || '').replace(/[\\[\]]/g, '\\$&').replace(/\r?\n/g,' ');
const destination = url => '<' + String(url).replace(/[<>]/g, ch => encodeURIComponent(ch)) + '>';

function markdownLink(text, start) {
  const image = text.startsWith('![', start);
  const begin = start + (image ? 2 : 1);
  if (!image && text[start] !== '[') return null;
  let i = begin, depth = 1;
  for (; i < text.length && depth; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '[') depth++;
    if (text[i] === ']') depth--;
  }
  if (depth || text[i] !== '(') return null;
  const closeLabel = i - 1;
  const angled = text[i + 1] === '<';
  const urlStart = i + (angled ? 2 : 1);
  i = urlStart;
  depth = 1;
  for (; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (angled && text[i] === '>') break;
    if (!angled && text[i] === '(') depth++;
    if (!angled && text[i] === ')' && !--depth) break;
    if (!angled && /\s/.test(text[i])) break;
  }
  const endUrl = i;
  if (angled && text[i++] !== '>') return null;
  const tail = /^(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?\)/.exec(text.slice(i));
  if (!tail || !endUrl || endUrl === urlStart) return null;
  const end = i + tail[0].length;
  return { image, start, end, label: text.slice(begin,closeLabel), url:unescapeMd(text.slice(urlStart,endUrl)),
    prefix:text.slice(start,begin), suffix:text.slice(closeLabel,end), raw:text.slice(start,end) };
}

function parseFigures(text) {
  const figures = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    let at = 0;
    while (at < value.length) {
      const link = markdownLink(value,at);
      if (!link) return null;
      if (link.image && hrefOf(link.url,true)) {
        figures.push({url:link.url,caption:unescapeMd(link.label),source:''});
      } else if (!link.image && figures.length && /^(?:来源(?:页|网页)?|出处|source)$/i.test(link.label) && hrefOf(link.url)) {
        figures[figures.length-1].source = link.url;
      } else if (!link.image && link.label === '画布卡片' && link.url.startsWith('#space=')) {
        const q = new URLSearchParams(link.url.slice(1));
        if (!figures.length || !q.get('space') || !q.get('canvas') || !q.get('card')) return null;
        Object.assign(figures[figures.length-1],{spaceId:q.get('space'),canvasId:q.get('canvas'),cardId:q.get('card')});
      } else return null;
      at = link.end;
      while (/[ \t]/.test(value[at] || '\0')) at++;
    }
  }
  return figures.length ? figures : null;
}

function figureMarkdown(figure) {
  let out = '![' + escapeLabel(figure.caption) + '](' + destination(figure.url) + ')';
  if (figure.source) out += ' [来源](' + destination(figure.source) + ')';
  if (figure.spaceId && figure.canvasId && figure.cardId) {
    out += ' [画布卡片](#' + new URLSearchParams({space:figure.spaceId,canvas:figure.canvasId,card:figure.cardId}) + ')';
  }
  return out;
}
function newEntity(payload) { return {id:'',revision:0,payload}; }

export function markdownEntities(input) {
  const text = String(input ?? '');
  const entities = [];
  let lines = [], fence = '', joinBefore = '';
  function flush() {
    if (!lines.length) return;
    const raw = lines.join('');
    const figures = parseFigures(raw);
    const ent = newEntity(figures ? {text:'',figures} : {text:raw});
    ent.joinBefore = joinBefore;
    if (figures) ent.figureSource = {raw, key:JSON.stringify(figures)};
    entities.push(ent);
    lines = []; joinBefore = '';
  }
  for (const match of text.matchAll(/([^\n]*)(\n|$)/g)) {
    if (!match[0]) continue;
    const line = match[1], full = match[0];
    if (!fence && !line.trim()) {
      flush();
      joinBefore += full;
      continue;
    }
    if (!fence && lines.length && (/^#{1,6}[ \t]/.test(line) || /^#{1,6}[ \t]/.test(lines[0]) || /^ {0,3}(`{3,}|~{3,})/.test(line))) flush();
    lines.push(full);
    const mark = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) { fence = ''; flush(); }
    }
  }
  flush();
  if (!entities.length) return [newEntity({text})];
  // Keep the original line endings between blocks out of their editable text.
  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i], original = ent.figureSource?.raw ?? ent.payload.text;
    const ending = /(\r?\n)$/.exec(original);
    if (!ending) continue;
    if (ent.figureSource) ent.figureSource.raw = original.slice(0,-ending[0].length);
    else ent.payload.text = original.slice(0,-ending[0].length);
    if (i + 1 < entities.length) entities[i+1].joinBefore = ending[0] + entities[i+1].joinBefore;
    else joinBefore = ending[0] + joinBefore;
  }
  entities[entities.length-1].joinAfter = joinBefore;
  return entities;
}

export function documentMarkdown(entities) {
  return entities.map((entity,index) => {
    const {text,figures} = entity.payload;
    const imageText = figures?.length ? entity.figureSource?.key === JSON.stringify(figures)
      ? entity.figureSource.raw : figures.map(figureMarkdown).join('\n') : '';
    return (entity.joinBefore ?? (index ? '\n\n' : '')) +
      [text,imageText].filter(Boolean).join('\n\n') + (entity.joinAfter || '');
  }).join('');
}
export function documentPayloads(text) { return markdownEntities(text).map(entity => entity.payload); }

function marks(node, before='', after='') {
  if (before) node.dataset.before = before;
  if (after) node.dataset.after = after;
  return node;
}

function richInline(root,text,resolveUrl) {
  let start = 0, i = 0;
  function put(node,end) { root.append(text.slice(start,i), node); i = start = end; }
  while (i < text.length) {
    const char = text[i];
    if (char === '\\' && /[!-/:-@\[-`{-~]/.test(text[i+1] || ' ')) {
      put(marks(element('span','',text[i+1]),'\\'),i+2); continue;
    }
    if (char === '[' || char === '!') {
      const link = markdownLink(text,i);
      if (link && hrefOf(link.url,link.image)) {
        if (link.image) {
          const img = element('img'); img.src = hrefOf(resolveUrl(link.url),true); img.alt = unescapeMd(link.label);
          img.loading = 'lazy'; img.dataset.atom = link.raw; img.contentEditable = 'false'; put(img,link.end);
        } else {
          const anchor = marks(element('a'),link.prefix,link.suffix);
          anchor.href = hrefOf(resolveUrl(link.url)); anchor.rel='noopener noreferrer'; anchor.target='_blank';
          richInline(anchor,link.label,resolveUrl); put(anchor,link.end);
        }
        continue;
      }
    }
    const marker = /^(?:\*\*|__|~~|`+|\*|_)/.exec(text.slice(i));
    if (marker) {
      const token = marker[0], end = text.indexOf(token,i+token.length);
      if (end > i+token.length && text[end-1] !== '\\' && !(token[0] === '_' && /\w/.test(text[i-1]||''))) {
        const code = token[0] === '`', tag = code ? 'code' : token === '~~' ? 's' : token.length === 2 ? 'strong' : 'em';
        const span = marks(element(tag),token,token), inside = text.slice(i+token.length,end);
        if (code) span.textContent = inside; else richInline(span,inside,resolveUrl);
        put(span,end+token.length); continue;
      }
    }
    i++;
  }
  root.append(text.slice(start));
}

function cellsOf(line) {
  const first = /^(\s*\|)/.exec(line);
  if (!first || !/\|\s*$/.test(line)) return null;
  const cells = [];
  let start = first[0].length;
  for (let i = start; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] !== '|') continue;
    const value = line.slice(start,i);
    const left = /^\s*/.exec(value)[0], content = value.slice(left.length).trimEnd();
    cells.push({before:(cells.length ? '' : first[0])+left, text:content, after:value.slice(left.length+content.length)+'|'});
    start = i+1;
  }
  if (cells.length) cells[cells.length-1].after += line.slice(start);
  return cells.length ? cells : null;
}

function paintBody(host,text,resolveUrl,editable) {
  const rows = String(text ?? '').match(/[^\n]*(?:\n|$)/g).filter((r,i,a) => r || a.length===1 || i===0);
  const rowsWithEnds = rows.map(row => { const nl = /\r?\n$/.exec(row)?.[0] || ''; return {line:row.slice(0,row.length-nl.length),nl}; });
  host.replaceChildren();
  function edit(node) { if (editable) {node.contentEditable='true'; node.spellcheck=true;} node.dataset.unit=''; return node; }
  for (let i=0; i<rowsWithEnds.length; i++) {
    const {line,nl}=rowsWithEnds[i];
    const fenced = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenced) {
      let end=i+1;
      for (;end<rows.length;end++) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(rowsWithEnds[end].line);
        if (close && close[1][0]===fenced[1][0] && close[1].length>=fenced[1].length) break;
      }
      let code=rows.slice(i+1,end).join(''), tail=rows[end] || '';
      if (tail && code.endsWith('\n')) { const n=/\r?\n$/.exec(code)[0]; code=code.slice(0,-n.length); tail=n+tail; }
      const pre=edit(marks(element('pre'),line+nl,tail));
      pre.textContent=code; host.append(pre); i=end; continue;
    }
    const cells=cellsOf(line), separator = rowsWithEnds[i+1];
    if (cells && separator && cellsOf(separator.line)?.every(cell=>/^:?-{3,}:?$/.test(cell.text))) {
      const table=element('table'), head=element('thead'), body=element('tbody'); table.append(head,body);
      const addRow=(rowCells,tag,parent,tail) => {
        const tr=marks(element('tr'),'',tail);
        for (const cell of rowCells) { const td=edit(marks(element(tag),cell.before,cell.after)); richInline(td,cell.text,resolveUrl); tr.append(td); }
        parent.append(tr);
      };
      addRow(cells,'th',head,nl+separator.line+separator.nl); i++;
      while (i+1 < rows.length && cellsOf(rowsWithEnds[i+1].line)) {
        i++; const row=rowsWithEnds[i]; addRow(cellsOf(row.line),'td',body,row.nl);
      }
      host.append(table); continue;
    }
    const heading=/^(#{1,6})([ \t]+)/.exec(line);
    const quote=/^([ \t]*>[ \t]?)/.exec(line);
    const list=/^([ \t]*)([-+*]|\d+[.)])([ \t]+)/.exec(line);
    const lead=heading?.[0] || quote?.[0] || list?.[0] || '';
    const tag=heading?'h'+heading[1].length:quote?'blockquote':list?'li':'p';
    const row=edit(marks(element(tag),lead,nl));
    richInline(row,line.slice(lead.length),resolveUrl);
    if (list) {
      const ordered=/^\d/.test(list[2]);
      let group=host.lastElementChild;
      if (group?.tagName !== (ordered?'OL':'UL')) { group=element(ordered?'ol':'ul'); host.append(group); }
      if (ordered) row.value=parseInt(list[2],10);
      group.append(row);
    } else host.append(row);
  }
}

function bodyMap(root) {
  let raw = '';
  const places = new Map(), leaves=[];
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = raw.length;
      raw += node.data;
      places.set(node,{start}); leaves.push({node,start,end:raw.length}); return;
    }
    const data = node.dataset;
    if (data.atom !== undefined || node.tagName === 'BR') {
      raw += data.atom ?? (node.parentNode.childNodes.length === 1 ? '' : '\n');
      return;
    }
    raw += data.before || '';
    const boundaries=[raw.length]; places.set(node,{boundaries});
    for (const child of node.childNodes) { visit(child); boundaries.push(raw.length); }
    if (!node.childNodes.length && data.unit !== undefined) leaves.push({node,start:raw.length,end:raw.length});
    raw += data.after || '';
  }
  visit(root);
  return {raw, places, leaves};
}

function renderFigures(payload,{resolveUrl,onOpenCard,editable,changed,repaint}) {
  const group = element('div','md-figures');
  for (const figure of payload.figures) {
    const figureBox = element('figure');
    const url = hrefOf(resolveUrl(figure.url),true);
    if (url) {
      const link=element('a'); link.href=url; link.target='_blank'; link.rel='noopener noreferrer';
      const image=element('img'); image.src=url; image.alt=figure.caption || ''; image.loading='lazy'; link.append(image); figureBox.append(link);
    }
    const caption=element('figcaption');
    if (editable) {
      const input=element('input'); input.placeholder='添加图注'; input.setAttribute('aria-label','图注');
      input.value=figure.caption || '';
      input.oninput=()=>{figure.caption=input.value; if(figureBox.querySelector('img')) figureBox.querySelector('img').alt=input.value; changed();};
      caption.append(input);
    } else if(figure.caption) caption.append(figure.caption);
    const links=element('span','md-figure-actions');
    const source=hrefOf(figure.source);
    if (source) { const link=element('a','','来源'); link.href=source; link.target='_blank'; link.rel='noopener noreferrer'; links.append(link); }
    if (onOpenCard && figure.cardId) {
      const back=element('button','','回到画布'); back.type='button'; back.onclick=()=>onOpenCard(figure); links.append(back);
    }
    if (editable) {
      const remove=element('button','','移除图片'); remove.type='button';
      remove.onclick=()=>{payload.figures.splice(payload.figures.indexOf(figure),1); changed(); repaint();};
      links.append(remove);
    }
    caption.append(links); figureBox.append(caption); group.append(figureBox);
  }
  return group;
}

export function renderDocumentContent(entities,{resolveUrl=url=>url}={}) {
  const article=element('article');
  for (const {payload} of entities) {
    const block=element('section','md-export-block md-block');
    if(payload.text) paintBody(block,payload.text,resolveUrl,false);
    if(payload.figures?.length) block.append(renderFigures(payload,{resolveUrl}));
    article.append(block);
  }
  return article;
}

export function mountDocEditor(container,{entities,onChange=()=>{},onSelection=()=>{},resolveUrl=url=>url,onOpenCard,readOnly=false,actions=[]}) {
  const root=element('div','md-document'), tools=element('div','md-tools'), outline=element('details','md-outline');
  const outlineRows=element('div'), sections=element('div','md-sections');
  outline.append(element('summary','','目录'),outlineRows);
  container.replaceChildren(root); root.append(tools,outline,sections);
  const shown = new Map(), folded=new Map();
  let last=null, dragged=null;
  const changed=()=>onChange(entities);
  function locate(node) {
    const host=(node?.nodeType===1 ? node : node?.parentElement)?.closest('.md-block');
    return host && sections.contains(host) ? host : null;
  }
  function capture() {
    const sel=window.getSelection();
    if (!sel.rangeCount) return null;
    const range=sel.getRangeAt(0), host=locate(range.startContainer);
    if (!host || host!==locate(range.endContainer)) return null;
    const {places,raw}=bodyMap(host);
    const pos=(node,offset)=>{ const p=places.get(node); return p?.boundaries ? p.boundaries[offset] : p?.start+offset; };
    const from=pos(range.startContainer,range.startOffset),to=pos(range.endContainer,range.endOffset);
    if (!Number.isFinite(from)||!Number.isFinite(to)) return null;
    const entity=host._entity;
    return {entity,id:entity.id,revision:entity.revision,from,to,text:raw.slice(from,to)};
  }
  function selection() {
    const current=capture();
    if (current) last=current;
    else {
      const sel=window.getSelection();
      if(sel.rangeCount && !sel.isCollapsed && (locate(sel.anchorNode)||locate(sel.focusNode))) last=null;
    }
    if (!last || !entities.includes(last.entity)) return null;
    return {...last,id:last.entity.id,revision:last.entity.revision};
  }
  const notify=()=>onSelection(selection());
  document.addEventListener('selectionchange',notify);
  function focusSelection(id,from=0,to=from) {
    const entity=typeof id==='object' ? id : (last?.entity?.id===id && entities.includes(last.entity) ? last.entity : entities.find(e=>e.id===id));
    const host=shown.get(entity);
    if(!host) return;
    const {leaves}=bodyMap(host);
    function point(n) {
      let best=null,dist=Infinity;
      for(const leaf of leaves) {
        const d=n<leaf.start ? leaf.start-n : n>leaf.end ? n-leaf.end : 0;
        if(d < dist){best=leaf;dist=d;}
      }
      return best ? [best.node,Math.max(0,Math.min(n-best.start,best.end-best.start))] : [host,0];
    }
    const a=point(from), b=point(to);
    const unit=(a[0].nodeType===1?a[0]:a[0].parentElement)?.closest('[data-unit]');
    if(unit) unit.focus({preventScroll:true});
    const range=document.createRange(); range.setStart(...a); range.setEnd(...b);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range); notify();
  }
  function rebuildOutline() {
    outlineRows.replaceChildren();
    let collapsedLevel=0, count=0;
    for (const [entity,host] of shown) {
      const section=host.parentElement;
      let visible=false, headingIndex=0;
      for (const row of host.children) {
        const level=/^H([1-6])$/.exec(row.tagName);
        if (level) {
          const depth=Number(level[1]), key=headingIndex++;
          if(collapsedLevel && depth<=collapsedLevel) collapsedLevel=0;
          row.hidden=Boolean(collapsedLevel);
          const line=element('div','md-outline-row'); line.style.setProperty('--level',depth); line.hidden=row.hidden;
          const closed=folded.get(entity)?.has(key);
          const toggle=element('button','',closed?'▸':'▾'); toggle.type='button'; toggle.title=closed?'展开章节':'折叠章节';
          toggle.setAttribute('aria-label',toggle.title);
          toggle.setAttribute('aria-expanded',String(!closed));
          toggle.onclick=()=>{
            if(!folded.has(entity)) folded.set(entity,new Set());
            const set=folded.get(entity); if(set.has(key)) set.delete(key); else set.add(key);
            rebuildOutline();
          };
          const nav=element('button','',row.textContent.trim() || '未命名标题'); nav.type='button';
          nav.onclick=()=>{ row.scrollIntoView({block:'nearest'}); row.focus({preventScroll:true}); };
          line.append(toggle,nav); outlineRows.append(line); count++;
          if(!collapsedLevel && closed) collapsedLevel=depth;
        } else row.hidden=Boolean(collapsedLevel);
        if(!row.hidden) visible=true;
      }
      const figures=section.querySelector('.md-figures');
      if(figures) figures.hidden=Boolean(collapsedLevel);
      section.hidden=!visible && (!figures||figures.hidden);
    }
    outline.hidden=!count;
  }
  function refresh() {
    sections.replaceChildren(); shown.clear();
    for (const entity of entities) {
      const section=element('section','md-section'), host=element('div','md-block');
      host._entity=entity; shown.set(entity,host);
      if(!readOnly) {
        const handle=element('button','md-block-handle','⠿'); handle.type='button'; handle.title='拖动段落排序'; handle.setAttribute('aria-label','拖动段落排序'); handle.draggable=true;
        handle.ondragstart=e=>{dragged=entity; e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',entity.payload.text);};
        handle.ondragend=()=>{dragged=null; sections.querySelectorAll('.md-drop').forEach(el=>el.classList.remove('md-drop'));};
        handle.onclick=()=>focusSelection(entity); section.append(handle);
        section.ondragover=e=>{if(dragged && dragged!==entity){e.preventDefault();section.classList.add('md-drop');}};
        section.ondragleave=()=>section.classList.remove('md-drop');
        section.ondrop=e=>{
          if(!dragged||dragged===entity)return;
          e.preventDefault();
          const to=entities.indexOf(entity); entities.splice(entities.indexOf(dragged),1); entities.splice(to,0,dragged);
          dragged=null; resetJoins(); changed(); refresh();
        };
      }
      paintBody(host,entity.payload.text,resolveUrl,!readOnly);
      section.append(host);
      if(entity.payload.figures?.length) section.append(renderFigures(entity.payload,{resolveUrl,onOpenCard,editable:!readOnly,changed,repaint:refresh}));
      sections.append(section);
    }
    rebuildOutline();
  }
  function resetJoins() { for (const item of entities) { delete item.joinBefore; delete item.joinAfter; } }
  function addBlock(payload={text:''}) {
    if(readOnly) return;
    const s=selection(), i=s ? entities.indexOf(s.entity)+1 : entities.length;
    const ent=newEntity(payload); entities.splice(i,0,ent);
    resetJoins(); changed(); refresh(); focusSelection(ent); return ent;
  }
  function insertFigures(figures) {
    if(readOnly || !figures.length) return;
    const current=selection()?.entity;
    if(current && !current.payload.text && !current.payload.figures?.length) {
      current.payload.figures=figures; changed(); refresh(); focusSelection(current); return;
    }
    addBlock({text:'',figures});
  }
  function replace(s,start,end,repl,from=start+repl.length,to=from) {
    const data=s.entity.payload; data.text=data.text.slice(0,start)+repl+data.text.slice(end);
    changed(); refresh(); focusSelection(s.entity,from,to);
  }
  function active() {
    const s=selection(); if(s) return s;
    if(entities.length) {focusSelection(entities[0]);return selection();}
    return null;
  }
  function bold() {
    const s=active(); if(!s)return;
    const raw=s.entity.payload.text;
    if(raw.slice(Math.max(0,s.from-2),s.from)==='**' && raw.slice(s.to,s.to+2)==='**') {
      replace(s,s.from-2,s.to+2,s.text,s.from-2,s.to-2); return;
    }
    const label=s.text || '粗体'; replace(s,s.from,s.to,'**'+label+'**',s.from+2,s.from+2+label.length);
  }
  function linkText() {
    const s=active(); if(!s)return;
    const url=window.prompt('链接地址','https://'); if(!url || !hrefOf(url))return;
    const label=escapeLabel(s.text || url); replace(s,s.from,s.to,'['+label+']('+destination(url)+')',s.from+1,s.from+1+label.length);
  }
  function style(prefix) {
    const s=active(); if(!s)return;
    const raw=s.entity.payload.text, start=raw.slice(0,s.from).lastIndexOf('\n')+1, nl=raw.indexOf('\n',s.to), end=nl<0?raw.length:nl;
    const lines=raw.slice(start,end).split('\n').map((line,i)=>{
      const p=prefix==='1. ' ? (i+1)+'. ' : prefix;
      return p+line.replace(/^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/,'');
    });
    replace(s,start,end,lines.join('\n'),start+prefix.length);
  }
  function act(title,run) {
    const button=element('button','',title); button.type='button';
    button.onmousedown=e=>e.preventDefault(); button.onclick=run; tools.append(button); return button;
  }
  const api={getSelection:selection,focusSelection,refresh,addBlock,insertFigures,
    destroy(){document.removeEventListener('selectionchange',notify);root.remove();}};
  if(!readOnly) {
    const types=element('select'); types.setAttribute('aria-label','段落样式');
    for (const [label,value] of [['段落样式','choose'],['正文',''],['一级标题','# '],['二级标题','## '],['三级标题','### '],['项目列表','- '],['编号列表','1. '],['引用','> ']]) { const opt=element('option','',label); opt.value=value;types.append(opt); }
    types.onchange=()=>{style(types.value);types.value='choose';};tools.append(types);
    act('粗体',bold);act('链接',linkText);
    act('表格',()=>{const ent=addBlock({text:'| 列一 | 列二 |\n| --- | --- |\n|  |  |'});if(ent) focusSelection(ent,2,4);});
    const rowBtn=act('加行',()=>modifyTable('row')),colBtn=act('加列',()=>modifyTable('col'));
    rowBtn.hidden=colBtn.hidden=true;
    root.addEventListener('focusin',e=>{ if(e.target.closest('.md-tools'))return;rowBtn.hidden=colBtn.hidden=!e.target.closest('.md-block table');});
    function modifyTable(type) {
      const s=active(); if(!s)return;
      const selectionNode=window.getSelection().anchorNode, node=selectionNode?.nodeType===1?selectionNode:selectionNode?.parentElement;
      const table=node?.closest('table');
      if (!table) return;
      const map=bodyMap(shown.get(s.entity)), bounds=map.places.get(table).boundaries;
      const start=bounds[0],end=bounds.at(-1), raw=s.entity.payload.text.slice(start,end);
      const ending=/\r?\n$/.exec(raw)?.[0]||'', rows=raw.slice(0,raw.length-ending.length).split(/\r?\n/);
      let caret=s.from;
      if(type==='row'){
        const row='|'+ '  |'.repeat(table.rows[0].cells.length);
        caret=start+rows.join('\n').length+3; rows.push(row);
      } else {
        rows.forEach((line,i)=>rows[i]=line.trimEnd()+(i===1?' --- |':'  |')); caret=start+rows[0].length-1;
      }
      replace(s,start,end,rows.join('\n')+ending,caret);
    }
  }
  for(const action of actions) act(action.label,()=>action.run(api));
  tools.hidden=!tools.children.length;
  root.addEventListener('input',e=>{
    const host=locate(e.target); if(!host||readOnly)return;
    host._entity.payload.text=bodyMap(host).raw;
    changed(); if(e.target.closest('h1,h2,h3,h4,h5,h6')) rebuildOutline(); notify();
  });
  function enter(s,unit,soft) {
    const raw=s.entity.payload.text;
    if(unit.tagName==='PRE'||soft){replace(s,s.from,s.to,'\n');return;}
    const cell=unit.closest('th,td');
    if(cell){
      const cells=[...cell.closest('table').querySelectorAll('th,td')]; const next=cells[cells.indexOf(cell)+1];
      if(next){ const p=bodyMap(shown.get(s.entity)).places.get(next); focusSelection(s.entity,p.boundaries[0]); }
      else addBlock({text:''});
      return;
    }
    const prefix=unit.dataset.before||'', tail=unit.dataset.after||'';
    let repeated='';
    if(unit.tagName==='LI') repeated=prefix.replace(/\d+/,n=>String(Number(n)+1));
    if(unit.tagName==='BLOCKQUOTE') repeated=prefix;
    if(repeated && !unit.textContent.trim()){
      const b=bodyMap(shown.get(s.entity)).places.get(unit).boundaries; replace(s,b[0]-prefix.length,b.at(-1),'');return;
    }
    // Close active inline marks before splitting and reopen them on the new paragraph.
    const host=shown.get(s.entity), map=bodyMap(host);
    const inline=[...host.querySelectorAll('strong,em,s,a,code')];
    function outsideEdge(point) {
      for(const el of inline.slice().reverse()) {
        const b=map.places.get(el).boundaries;
        if(point===b[0]) point-=el.dataset.before.length;
        else if(point===b.at(-1)) point+=el.dataset.after.length;
      }
      return point;
    }
    const from=outsideEdge(s.from),to=outsideEdge(s.to);
    const inlineAt=(point)=>inline.filter(el=>{
      const b=map.places.get(el).boundaries; return point>b[0] && point<b.at(-1);
    });
    const leftMarks=inlineAt(from),rightMarks=inlineAt(to);
    const left=raw.slice(0,from)+leftMarks.reverse().map(el=>el.dataset.after||'').join('');
    const insidePrefix=rightMarks.map(el=>el.dataset.before||'').join('');
    const right=raw.slice(to);
    s.entity.payload.text=left;
    const ent=newEntity({text:repeated+insidePrefix+right});
    if(!right && tail && s.entity.payload.text.endsWith(tail)) s.entity.payload.text=s.entity.payload.text.slice(0,-tail.length);
    entities.splice(entities.indexOf(s.entity)+1,0,ent);
    resetJoins();changed();refresh();focusSelection(ent,repeated.length+insidePrefix.length);
  }
  root.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229||readOnly)return;
    const unit=e.target.closest('[data-unit]'),s=capture(); if(!unit||!s)return;
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='b'){e.preventDefault();bold();return;}
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){e.preventDefault();linkText();return;}
    if(e.key==='Enter'){ e.preventDefault();enter(s,unit,e.shiftKey);return; }
    if(e.key==='Tab' && unit.closest('table')){
      const cells=[...unit.closest('table').querySelectorAll('th,td')],next=cells[cells.indexOf(unit)+(e.shiftKey?-1:1)];
      if(next){e.preventDefault();const b=bodyMap(shown.get(s.entity)).places.get(next).boundaries;focusSelection(s.entity,b[0]);}
    }
    if(e.key==='Backspace' && s.from===s.to && s.from===0 && entities.indexOf(s.entity)>0 && !s.entity.payload.figures?.length){
      e.preventDefault();const i=entities.indexOf(s.entity),prev=entities[i-1],at=prev.payload.text.length;
      prev.payload.text+=s.entity.payload.text;entities.splice(i,1);resetJoins();changed();refresh();focusSelection(prev,at);
    }
  });
  root.addEventListener('beforeinput',e=>{
    if(readOnly || e.isComposing)return;
    if(e.inputType==='formatBold' && e.target.closest('[data-unit]')) {e.preventDefault();bold();return;}
    if(e.inputType==='insertText' && e.data && e.data.includes('|') && e.target.closest('th,td')){
      const s=capture();if(s){e.preventDefault();replace(s,s.from,s.to,e.data.replace(/\|/g,'\\|'));}return;
    }
    if(!readOnly&&!e.isComposing&&['insertParagraph','insertLineBreak'].includes(e.inputType)){
      const unit=e.target.closest('[data-unit]'),s=capture();if(unit&&s){e.preventDefault();enter(s,unit,e.inputType==='insertLineBreak');}
    }
  });
  root.addEventListener('paste',e=>{
    const unit=e.target.closest('[data-unit]'),s=capture();if(!unit||!s||readOnly)return;
    e.preventDefault(); let text=e.clipboardData.getData('text/plain').replace(/\r\n/g,'\n');
    if(unit.matches('td,th'))text=text.replace(/\|/g,'\\|').replace(/\n/g,' ');
    replace(s,s.from,s.to,text);
  });
  refresh(); return api;
}
