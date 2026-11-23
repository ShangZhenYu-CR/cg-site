import {mountBlockLayout} from './doc-layout.js?v=20261123notion2';

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

function plainEntities(input) {
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

// Layout metadata lives beside each block so a Markdown source edit may change
// its length, reorder it or add text without invalidating subsequent blocks.
const blockMarker=/^<!-- maodou:block (\{[^\n]*\}) -->\r?$/;
function blockInfo(line) {
  const match=blockMarker.exec(line); if(!match)return null;
  // Only accept the small alphabet emitted by the editor, never arbitrary JSON.
  if(!/^\{"v":1(?:,"g":"[\w-]+","c":\d+)?(?:,"i":\d+)?(?:,"k":"[\w-]+")?\}$/.test(match[1]))return null;
  return JSON.parse(match[1]);
}
export function markdownEntities(input) {
  const text=String(input??'');
  if(!text.includes('<!-- maodou:block '))return plainEntities(text);
  const out=[];let current=null,lines=[],fence='';
  function flush(){
    const body=lines.join('').replace(/\r?\n\r?\n$/,'');
    lines=[];
    if(!current){if(body)out.push(...plainEntities(body));return;}
    const figureMark='\n\n<!-- maodou:figures -->\n';
    const split=body.lastIndexOf(figureMark);
    const images=parseFigures(split<0?body:body.slice(split+figureMark.length));
    const payload={text:images?(split<0?'':body.slice(0,split)):body};
    if(images)payload.figures=images;
    if(current.g)payload.layout={group:current.g,column:current.c};
    if(current.i)payload.indent=current.i;
    if(current.k)payload.docKey=current.k;
    out.push(newEntity(payload));
  }
  for(const m of text.matchAll(/([^\n]*)(\n|$)/g)){
    if(!m[0])continue;
    const info=!fence&&blockInfo(m[1]);
    if(info){flush();current=info;continue;}
    const mark=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(m[1]);
    if(mark){if(!fence)fence=mark[1];else if(mark[1][0]===fence[0]&&mark[1].length>=fence.length&&!mark[2].trim())fence='';}
    lines.push(m[0]);
  }
  if(!current)return plainEntities(text);
  // A final block has no separator after it.
  lines.push('\n\n');flush();return out;
}
export function documentMarkdown(entities) {
  if(entities.some(e=>e.payload.layout || e.payload.indent || e.payload.docKey)){
    return entities.map(({payload:p})=>{
      const info={v:1};
      if(p.layout){info.g=p.layout.group;info.c=p.layout.column;}
      if(p.indent)info.i=p.indent;
      if(p.docKey)info.k=p.docKey;
      const figures=p.figures?.map(figureMarkdown).join('\n');
      const body=figures&&p.text?p.text+'\n\n<!-- maodou:figures -->\n'+figures:(figures||p.text||'');
      return '<!-- maodou:block '+JSON.stringify(info)+' -->\n'+body;
    }).join('\n\n');
  }
  return entities.map((entity,index) => {
    const {text,figures} = entity.payload;
    const imageText = figures?.length ? entity.figureSource?.key === JSON.stringify(figures)
      ? entity.figureSource.raw : figures.map(figureMarkdown).join('\n') : '';
    return (entity.joinBefore ?? (index ? '\n\n' : '')) +
      [text,imageText].filter(Boolean).join('\n\n') + (entity.joinAfter || '');
  }).join('');
}
export function documentPayloads(text) { return markdownEntities(text).map(({payload})=>{const {docKey,...value}=payload;return value;}); }

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
    const marker = /^(?:\*\*|__|~~|==|`+|\*|_)/.exec(text.slice(i));
    if (marker) {
      const token = marker[0], end = text.indexOf(token,i+token.length);
      if (end > i+token.length && text[end-1] !== '\\' && !(token[0] === '_' && /\w/.test(text[i-1]||''))) {
        const code = token[0] === '`', tag = code ? 'code' : token === '~~' ? 's' : token === '==' ? 'mark' : token.length === 2 ? 'strong' : 'em';
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
  function edit(node) { if(editable) node.spellcheck=true; node.dataset.unit=''; return node; }
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
    const task=list && /^\[([ xX])\]([ \t]+)/.exec(line.slice(list[0].length));
    const lead=heading?.[0] || quote?.[0] || (list ? list[0]+(task?.[0]||'') : '');
    const tag=heading?'h'+heading[1].length:quote?'blockquote':list?'li':'p';
    const row=edit(marks(element(tag),lead,nl));
    if(task)row.dataset.checked=String(task[1].toLowerCase()==='x');
    richInline(row,line.slice(lead.length),resolveUrl);
    if(task){
      const box=element('input');box.type='checkbox';box.checked=row.dataset.checked==='true';box.disabled=!editable;
      box.dataset.atom='';box.contentEditable='false';box.setAttribute('aria-label','完成待办');row.prepend(box);
    }
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
  group._figurePayload=payload;
  group.contentEditable='false';
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
  const article=element('article','md-readout');
  let row=null,group=null,cols=new Map();
  for(const {payload} of entities){
    const block=element('section','md-export-block md-block');
    if(payload.indent)block.style.paddingInlineStart=(payload.indent*24)+'px';
    if(payload.text)paintBody(block,payload.text,resolveUrl,false);
    if(payload.figures?.length)block.append(renderFigures(payload,{resolveUrl}));
    if(!payload.layout){row=null;group=null;article.append(block);continue;}
    if(group!==payload.layout.group){group=payload.layout.group;row=element('div','md-read-columns');article.append(row);cols=new Map();}
    const col=payload.layout.column;
    if(!cols.has(col)){const part=element('div','md-read-column');part.style.order=col;row.append(part);cols.set(col,part);}
    cols.get(col).append(block);
  }
  return article;
}

const types=[
  {id:'text',name:'正文',keys:'text paragraph duanluo 正文 段落',icon:'¶',prefix:''},
  {id:'h1',name:'一级标题',keys:'heading title biaoti 标题 1',icon:'H1',prefix:'# '},
  {id:'h2',name:'二级标题',keys:'heading title biaoti 标题 2',icon:'H2',prefix:'## '},
  {id:'h3',name:'三级标题',keys:'heading title biaoti 标题 3',icon:'H3',prefix:'### '},
  {id:'bullet',name:'项目列表',keys:'bullet list liebiao 列表 无序',icon:'•',prefix:'- '},
  {id:'order',name:'编号列表',keys:'ordered numbered list liebiao 列表 有序',icon:'1.',prefix:'1. '},
  {id:'todo',name:'待办',keys:'todo task checkbox daiban 待办 清单 勾选',icon:'☑',prefix:'- [ ] '},
  {id:'quote',name:'引用',keys:'quote yinyong 引用',icon:'❝',prefix:'> '},
  {id:'code',name:'代码块',keys:'code daima 代码',icon:'</>'},
  {id:'table',name:'表格',keys:'table biaoge 表格',icon:'▦'},
];
const stripPrefix=/^(?:#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)/;
const actionId=a=>a.id || (/画布图/.test(a.label)?'figures':/批注/.test(a.label)?'comment':/AI 修改/.test(a.label)?'review':/问 AI/.test(a.label)?'ask':'page');
const signature=p=>JSON.stringify(p,(k,v)=>k==='assetKey'?undefined:v);
function pastedHtml(html) {
  const template=document.createElement('template');template.innerHTML=html;
  const quoteAttr=v=>String(v||'').replace(/[\\[\]]/g,'\\$&');
  const compact=v=>v.trim().replace(/\n{3,}/g,'\n\n');
  function walk(node) {
    if(node.nodeType===Node.TEXT_NODE)return node.data;
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const tag=node.tagName;
    if(['SCRIPT','STYLE','NOSCRIPT','IFRAME','OBJECT','META','BUTTON','SELECT','SVG'].includes(tag))return '';
    if(tag==='BR')return '\n';
    if(tag==='IMG'){const url=hrefOf(node.getAttribute('src'),true);return url?'!['+quoteAttr(node.alt)+']('+destination(url)+')':'';}
    if(tag==='FIGURE'){
      const img=node.querySelector('img'),url=img&&hrefOf(img.getAttribute('src'),true);
      if(!url)return '';
      const f={url,caption:node.dataset.caption || node.querySelector('figcaption')?.childNodes[0]?.textContent || img.alt || '',source:hrefOf(node.dataset.source)};
      if(node.dataset.card){Object.assign(f,{cardId:node.dataset.card,canvasId:node.dataset.canvas,spaceId:node.dataset.space});}
      return '\n\n'+figureMarkdown(f)+'\n\n';
    }
    if(tag==='TABLE'){
      const rows=[...node.rows].map(r=>[...r.cells].map(c=>compact([...c.childNodes].map(walk).join('')).replace(/\|/g,'\\|').replace(/\n/g,' ')));
      if(!rows.length)return '';
      rows.splice(1,0,rows[0].map(()=>'---'));
      return '\n\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n\n';
    }
    if(tag==='OL'||tag==='UL'){
      return '\n\n'+[...node.children].filter(c=>c.tagName==='LI').map((li,i)=>{
        const cb=li.querySelector('input[type="checkbox"]'),lead=cb?'- ['+(cb.checked?'x':' ')+'] ':tag==='UL'?'- ':((node.start||1)+i)+'. ';
        return lead+compact([...li.childNodes].map(walk).join(''));
      }).join('\n')+'\n\n';
    }
    const inside=[...node.childNodes].map(walk).join('');
    if(!inside)return '';
    if(/^H[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+compact(inside)+'\n\n';
    if(tag==='BLOCKQUOTE')return '\n\n'+compact(inside).split('\n').map(s=>'> '+s).join('\n')+'\n\n';
    if(tag==='PRE')return '\n\n'+'\x60'.repeat(3)+'\n'+node.textContent+'\n'+'\x60'.repeat(3)+'\n\n';
    if(tag==='A'){const url=hrefOf(node.getAttribute('href'));return url?'['+inside+']('+destination(url)+')':inside;}
    if(tag==='STRONG'||tag==='B')return '**'+inside+'**';
    if(tag==='EM'||tag==='I')return '*'+inside+'*';
    if(tag==='CODE')return '\x60'+inside+'\x60';
    if(tag==='MARK')return '=='+inside+'==';
    if(tag==='S'||tag==='DEL')return '~~'+inside+'~~';
    if(['P','DIV','SECTION','ARTICLE'].includes(tag))return '\n\n'+inside+'\n\n';
    return inside;
  }
  return compact([...template.content.childNodes].map(walk).join(''));
}

export function mountDocEditor(container,{entities,onChange=()=>{},onSelection=()=>{},resolveUrl=url=>url,onOpenCard,readOnly=false,actions=[]}) {
  const root=element('div','md-document'), outline=element('details','md-outline');
  const sectionTop=element('div','md-doc-controls'), outlineRows=element('div'), sections=element('div','md-sections');
  outline.append(element('summary','','目录'),outlineRows);sectionTop.append(outline);
  sections.contentEditable=String(!readOnly);sections.spellcheck=true;
  if(!readOnly){sections.setAttribute('role','textbox');sections.setAttribute('aria-label','文档正文');sections.setAttribute('aria-multiline','true');}
  container.replaceChildren(root);root.append(sectionTop,sections);
  const shown=new Map(),folded=new Map(),float=element('div','md-float'),pop=element('div','md-popover');
  float.hidden=pop.hidden=true;float.setAttribute('role','toolbar');float.setAttribute('aria-label','所选文字');document.body.append(float,pop);
  let last=null,mode='',command=null,options=[],index=0,composing=false,insertAt=null;
  const history=[],future=[];
  const snapshot=()=>entities.map(e=>({e,p:structuredClone(e.payload),sig:signature(e.payload),before:e.joinBefore,after:e.joinAfter}));
  let baseline=snapshot(),writingGroup=null,writingTime=0;
  function same(snap){return entities.length===snap.length && snap.every((item,i)=>item.e===entities[i]&&item.sig===signature(entities[i].payload));}
  function changed(typingEntity) {
    if(!same(baseline)){
      const now=performance.now();
      if(typeof typingEntity!=='object'||typingEntity!==writingGroup||now-writingTime>900){
        history.push(baseline);if(history.length>60)history.shift();
      }
      writingGroup=typingEntity;writingTime=now;future.length=0;baseline=snapshot();
    }
    onChange(entities);
  }
  function restore(redo=false){
    if(readOnly)return;
    const stack=redo?future:history,other=redo?history:future;
    if(!same(baseline)){history.length=future.length=0;baseline=snapshot();return;}
    const items=stack.pop();if(!items)return;
    other.push(baseline);
    for(const item of items){item.e.payload=structuredClone(item.p);item.e.joinBefore=item.before;item.e.joinAfter=item.after;}
    entities.splice(0,entities.length,...items.map(i=>i.e));baseline=snapshot();writingGroup=null;
    closePopup();layout.clear();refresh();onChange(entities);
    if(last&&shown.has(last.entity))focusSelection(last.entity,last.from);else if(entities.length)focusSelection(entities[0]);
  }
  const nodeElement=n=>n?.nodeType===Node.ELEMENT_NODE?n:n?.parentElement;
  function locate(node){const host=nodeElement(node)?.closest('.md-block');return host&&sections.contains(host)?host:null;}
  function capture(){
    const native=window.getSelection();if(!native.rangeCount)return null;
    const range=native.getRangeAt(0),first=locate(range.startContainer),end=locate(range.endContainer);
    if(!first||!end)return null;
    const a=entities.indexOf(first._entity),b=entities.indexOf(end._entity);
    if(a<0||b<a)return null;
    const ranges=[];
    for(let i=a;i<=b;i++){
      const entity=entities[i],map=bodyMap(shown.get(entity));
      const pos=(n,k)=>{const p=map.places.get(n);return p?.boundaries?p.boundaries[k]:p?.start+k;};
      const from=i===a?pos(range.startContainer,range.startOffset):0,to=i===b?pos(range.endContainer,range.endOffset):map.raw.length;
      if(!Number.isFinite(from)||!Number.isFinite(to))return null;
      ranges.push({entity,id:entity.id,revision:entity.revision,from,to,text:map.raw.slice(from,to)});
    }
    return {...ranges[0],text:ranges.map(r=>r.text).join('\n'),ranges};
  }
  function selection(){
    const current=capture();if(current)last=current;
    if(!last||!entities.includes(last.entity)||last.ranges.some(r=>!entities.includes(r.entity)))return null;
    const ranges=last.ranges.map(r=>({...r,id:r.entity.id,revision:r.entity.revision}));
    return {...last,id:last.entity.id,revision:last.entity.revision,ranges};
  }
  function point(entity,n) {
    const host=shown.get(entity);if(!host)return null;
    let nearest=null,dist=Infinity;
    for(const leaf of bodyMap(host).leaves){
      const d=n<leaf.start?leaf.start-n:n>leaf.end?n-leaf.end:0;
      if(d<dist){nearest=leaf;dist=d;}
    }
    return nearest?[nearest.node,Math.max(0,Math.min(n-nearest.start,nearest.end-nearest.start))]:[host,0];
  }
  function focusRange(first,from,end,to){
    const a=point(first,from),b=point(end,to);if(!a||!b)return;
    if(!readOnly)sections.focus({preventScroll:true});
    const range=document.createRange();range.setStart(...a);range.setEnd(...b);
    const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);notify();
  }
  function focusSelection(id,from=0,to=from){
    const entity=typeof id==='object'?id:entities.find(e=>e.id===id);
    if(entity)focusRange(entity,from,entity,to);
  }
  function isMulti(s){return s?.ranges?.length>1;}
  function active(){let s=selection();if(!s&&entities.length){focusSelection(entities[0]);s=selection();}return s;}
  function rebuildOutline(){
    outlineRows.replaceChildren();let collapsed=0,count=0;
    for(const [entity,host] of shown){
      const section=host.closest('.md-section');let visible=false,headIndex=0;
      for(const row of host.children){
        const level=/^H([1-6])$/.exec(row.tagName);
        if(level){
          const depth=Number(level[1]),key=headIndex++;if(collapsed&&depth<=collapsed)collapsed=0;
          row.hidden=Boolean(collapsed);
          const line=element('div','md-outline-row');line.style.setProperty('--level',depth);line.hidden=row.hidden;
          const closed=folded.get(entity)?.has(key),toggle=element('button','',closed?'▸':'▾');
          toggle.type='button';toggle.title=closed?'展开章节':'折叠章节';toggle.setAttribute('aria-expanded',String(!closed));
          toggle.onclick=()=>{if(!folded.has(entity))folded.set(entity,new Set());const set=folded.get(entity);if(set.has(key))set.delete(key);else set.add(key);rebuildOutline();};
          const nav=element('button','',row.textContent.trim()||'未命名标题');nav.type='button';
          nav.onclick=()=>{row.scrollIntoView({block:'nearest'});const b=bodyMap(host).places.get(row).boundaries;focusSelection(entity,b[0]);outline.open=false;};
          line.append(toggle,nav);outlineRows.append(line);count++;if(!collapsed&&closed)collapsed=depth;
        }else row.hidden=Boolean(collapsed);
        if(!row.hidden)visible=true;
      }
      const figures=section.querySelector('.md-figures');if(figures)figures.hidden=Boolean(collapsed);
      section.hidden=!visible&&(!figures||figures.hidden);
    }
    outline.hidden=!count;
  }
  function refresh(){
    sections.replaceChildren();shown.clear();
    for(const entity of entities){
      const section=element('section','md-section'),host=element('div','md-block');
      host._entity=entity;shown.set(entity,host);
      paintBody(host,entity.payload.text,resolveUrl,!readOnly);
      section.append(host);
      if(entity.payload.figures?.length)section.append(renderFigures(entity.payload,{resolveUrl,onOpenCard,editable:!readOnly,changed,repaint:refresh}));
      sections.append(section);
    }
    layout.render();rebuildOutline();
  }
  function resetJoins(){for(const e of entities){delete e.joinBefore;delete e.joinAfter;}}
  function inherited(e){const p={};if(e?.payload.layout)p.layout={...e.payload.layout};if(e?.payload.indent)p.indent=e.payload.indent;return p;}
  function after(entity,payload={text:''}){
    const ent=newEntity({...inherited(entity),...payload}),i=entity?entities.indexOf(entity)+1:entities.length;
    entities.splice(i,0,ent);resetJoins();changed();refresh();focusSelection(ent);return ent;
  }
  function addBlock(payload={text:''}){if(!readOnly)return after(selection()?.entity,payload);}
  function insertFigures(figures){
    if(readOnly||!figures.length)return;
    const s=insertAt&&entities.includes(insertAt.entity)?insertAt:active();insertAt=null;
    if(!s){addBlock({text:'',figures});return;}
    const e=s.entity,raw=e.payload.text,at=s.from,to=s.to,img=newEntity({...inherited(e),text:'',figures});
    if(!raw&&!e.payload.figures?.length){e.payload.figures=figures;changed();refresh();focusSelection(e);return;}
    const i=entities.indexOf(e);
    if(at===0&&to===0){entities.splice(i,0,img);}
    else if(at===raw.length&&to===at){entities.splice(i+1,0,img);}
    else{
      const host=shown.get(e),map=bodyMap(host);
      const inline=[...host.querySelectorAll('strong,em,s,mark,a,code')].filter(node=>node.dataset.before);
      const edge=pos=>{for(const node of [...inline].reverse()){const b=map.places.get(node).boundaries;if(b[0]===pos)pos-=node.dataset.before.length;else if(b.at(-1)===pos)pos+=node.dataset.after.length;}return pos;};
      const within=pos=>inline.filter(node=>{const b=map.places.get(node).boundaries;return b[0]<pos && pos<b.at(-1);});
      const from=edge(at),end=edge(to),leftEnd=within(from).reverse().map(node=>node.dataset.after).join(''),rightStart=within(end).map(node=>node.dataset.before).join('');
      e.payload.text=raw.slice(0,from)+leftEnd;
      entities.splice(i+1,0,img,...(end<raw.length?[newEntity({...inherited(e),text:rightStart+raw.slice(end)})]:[]));
    }
    resetJoins();changed();refresh();focusSelection(img);
  }
  function replace(s,start,end,value,from=start+value.length,to=from){
    const p=s.entity.payload;p.text=p.text.slice(0,start)+value+p.text.slice(end);
    changed();refresh();focusSelection(s.entity,from,to);
  }
  function applySelectionText(s,value){
    if(readOnly||!s||isMulti(s)||!shown.has(s.entity)||s.entity.payload.text.slice(s.from,s.to)!==s.text)return false;
    replace(s,s.from,s.to,String(value));return true;
  }
  function restoreSelection(sel){
    if(!sel)return false;const ranges=sel.ranges||[sel],resolved=[];
    for(const r of ranges){
      const entity=entities.includes(r.entity)?r.entity:entities.find(e=>e.id&&e.id===r.id);
      if(!entity||entity.payload.text.slice(r.from,r.to)!==r.text)return false;
      resolved.push(entity);
    }
    focusRange(resolved[0],ranges[0].from,resolved.at(-1),ranges.at(-1).to);return true;
  }
  const api={getSelection:selection,focusSelection,restoreSelection,addBlock,insertFigures,applySelectionText,
    isInteracting:()=>Boolean(mode||composing||layout.isInteracting?.()),
    refresh(){if(!same(baseline)){baseline=snapshot();history.length=future.length=0;}refresh();},
    destroy(){document.removeEventListener('selectionchange',selectionChanged);document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true);layout.destroy();float.remove();pop.remove();cellTools.remove();root.remove();}};
  const layout=mountBlockLayout({root,sections,entities,readOnly,focus:focusSelection,onCommit(){resetJoins();changed();refresh();},
    onInsert(entity){const ent=after(entity);showCommands({entity:ent,from:0,to:0},false);},
    onTransform(items,anchor){showCommands({items,anchor},true);}});

  function button(parent,label,action){
    const b=element('button','',label);b.type='button';b.setAttribute('aria-label',label);
    b.onmousedown=e=>e.preventDefault();b.onclick=action;parent.append(b);return b;
  }
  function closePopup(){mode='';command=null;options=[];pop.hidden=true;pop.replaceChildren();sections.removeAttribute('aria-controls');sections.removeAttribute('aria-activedescendant');}
  function outside(e){if(pop.contains(e.target)||float.contains(e.target)||cellTools.contains(e.target))return;if(!root.contains(e.target)){closePopup();float.hidden=true;}else if(!e.target.closest('.md-more-actions,.md-block-handle,.md-block-add')&&mode!=='slash')closePopup();}
  function caretRect(){
    const sel=window.getSelection();if(!sel.rangeCount||!locate(sel.anchorNode))return null;
    const r=sel.getRangeAt(0),boxes=r.getClientRects(),b=boxes[boxes.length-1]||r.getBoundingClientRect();
    return b.width||b.height?b:nodeElement(r.endContainer).getBoundingClientRect();
  }
  function place(node,rect,above=false){
    if(!rect||node.hidden)return;
    const w=node.offsetWidth,h=node.offsetHeight,space=window.innerHeight-rect.bottom;
    const y=(above&&rect.top>=h+8)||(!above&&space<h&&rect.top>space)?rect.top-h-7:rect.bottom+7;
    node.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-w-8))+'px';
    node.style.top=Math.max(8,Math.min(y,window.innerHeight-h-8))+'px';
  }
  function reposition(){
    const rect=caretRect();place(float,rect,true);
    if(!pop.hidden)place(pop,command?.anchor?.getBoundingClientRect()||rect||command?.rect);
  }
  function runAction(action,s=selection()){
    closePopup();float.hidden=true;
    if(actionId(action)==='figures')insertAt=s?{...s}:null;
    return action.run(api,s);
  }
  const extra=actions.filter(a=>(a.position==='page')||!['ask','review','comment','figures'].includes(actionId(a)));
  if(extra.length){
    const more=button(sectionTop,'文档操作',()=>{
      if(mode==='page'){closePopup();return;}
      closePopup();mode='page';command={anchor:more};pop.hidden=false;
      extra.forEach(a=>button(pop,a.label,()=>runAction(a)));reposition();
    });more.className='md-more-actions';more.textContent='•••';more.title='文档操作';
  }
  function format(kind,s=active(),url=''){
    if(!s||readOnly)return;
    const token=kind==='bold'?'**':kind==='italic'?'*':kind==='mark'?'==':null;
    const selector=kind==='bold'?'strong':kind==='italic'?'em':kind==='mark'?'mark':'a';
    const jobs=[];
    for(const r of s.ranges){
      const host=shown.get(r.entity),map=bodyMap(host),set=[];
      for(const leaf of map.leaves){
        const a=Math.max(leaf.start,r.from),b=Math.min(leaf.end,r.to);
        if(b<=a||leaf.node.nodeType!==Node.TEXT_NODE||nodeElement(leaf.node).closest('pre'))continue;
        const wrapper=nodeElement(leaf.node).closest(selector);
        set.push({a,b,wrapper:wrapper&&host.contains(wrapper)?wrapper:null});
      }
      jobs.push({r,map,set});
    }
    const all=jobs.flatMap(j=>j.set);
    if(!all.length)return;
    const remove=kind!=='link'&&all.every(j=>j.wrapper);
    let start=null,end=null;
    for(const {r,map,set} of jobs){
      const source=r.entity.payload.text;
      const edits=[],visited=new Set();
      for(const span of set){
        if(span.wrapper&&(remove||kind==='link')){
          const node=span.wrapper;if(visited.has(node))continue;visited.add(node);
          const bounds=map.places.get(node).boundaries,left=bounds[0],right=bounds.at(-1);
          const a=Math.max(left,r.from),b=Math.min(right,r.to);
          const before=node.dataset.before||'',after=node.dataset.after||'';
          const wrap=(lo,hi)=>lo<hi?before+source.slice(lo,hi)+after:'';
          const target=kind==='link'?'['+source.slice(a,b)+']('+destination(url)+')':source.slice(a,b);
          edits.push({a:left-before.length,b:right+after.length,value:wrap(left,a)+target+wrap(b,right)});
        }else if(!span.wrapper){
          const inside=source.slice(span.a,span.b);
          edits.push({a:span.a,b:span.b,value:kind==='link'?'['+inside+']('+destination(url)+')':token+inside+token});
        }
      }
      let val=source;
      for(const ed of edits.sort((a,b)=>b.a-a.a))val=val.slice(0,ed.a)+ed.value+val.slice(ed.b);
      r.entity.payload.text=val;
      if(!start)start={e:r.entity,n:r.from+(remove? -2:token?.length||1)};
      end={e:r.entity,n:r.to+val.length-source.length-(remove?-2:token?.length||1)};
    }
    closePopup();changed();refresh();if(start&&end)focusRange(start.e,Math.max(0,start.n),end.e,Math.max(0,end.n));
  }
  function editLink(){
    const s=active();if(!s)return;
    closePopup();mode='link';const rect=caretRect()||shown.get(s.entity).getBoundingClientRect();command={rect};
    float.hidden=true;pop.hidden=false;const form=element('form','md-link-form'),label=element('label','','链接地址'),field=element('input');
    field.type='text';field.placeholder='https://…';field.setAttribute('aria-label','链接地址');
    label.append(field);const save=element('button','','应用');save.type='submit';form.append(label,save);pop.append(form);
    form.onsubmit=e=>{e.preventDefault();const url=hrefOf(field.value);if(!url){field.setCustomValidity('请输入有效的链接地址');field.reportValidity();return;}
      if(s.text)format('link',s,url);else{closePopup();replace(s,s.from,s.to,'['+escapeLabel(url)+']('+destination(url)+')');}};
    field.oninput=()=>field.setCustomValidity('');reposition();field.focus();
  }
  if(!readOnly){
    button(float,'粗体',()=>format('bold')).className='md-format-bold';
    button(float,'斜体',()=>format('italic')).className='md-format-italic';
    button(float,'高亮',()=>format('mark'));
    button(float,'链接',editLink);
  }
  const selectedActions=actions.filter(a=>a.position==='selection'||['ask','review','comment'].includes(actionId(a)));
  const selectionButtons=selectedActions.map(a=>({a,b:button(float,a.label,()=>runAction(a))}));
  function notify(){
    const s=capture();if(s)last=s;
    onSelection(s);
    const display=Boolean(s?.text?.trim() && !mode && !layout.selected().length && root.isConnected);
    for(const {a,b} of selectionButtons)b.hidden=Boolean(isMulti(s)&&!a.multi);
    float.hidden=!display||![...float.children].some(ch=>!ch.hidden);
    if(!float.hidden)place(float,caretRect(),true);
  }
  function commandRows(query,transform){
    const list=types.filter(t=>!transform||t.id!=='table');
    const fig=actions.find(a=>actionId(a)==='figures');
    if(fig&&!transform)list.push({id:'figures',name:'画布图',keys:'board canvas image photo huabutu 画布图 素材 图片',icon:'▧',action:fig});
    if(command?.table&&!transform)list.push({id:'table-row',name:'添加表格行',keys:'row 加行 行',icon:'+'},{id:'table-col',name:'添加表格列',keys:'column 加列 列',icon:'+'});
    const q=query.trim().toLowerCase();return list.filter(t=>(t.name+' '+t.keys+' '+t.id).toLowerCase().includes(q));
  }
  function highlightCommand(){
    [...pop.querySelectorAll('[role=option]')].forEach((el,i)=>{el.setAttribute('aria-selected',String(i===index));if(i===index){sections.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}});
  }
  const listId='md-cmd-'+Math.random().toString(36).slice(2,8);
  function refreshCommands(value){
    options=commandRows(value,mode==='convert');index=0;
    let list=pop.querySelector('[role=listbox]');if(!list){list=element('div','md-cmd-list');list.setAttribute('role','listbox');list.id=listId;pop.append(list);}
    list.replaceChildren();sections.setAttribute('aria-controls',listId);
    for(const [i,item] of options.entries()){
      const b=button(list,item.name,()=>choose(item));b.id=listId+'-'+i;b.setAttribute('role','option');
      const icon=element('span','md-cmd-icon',item.icon);icon.setAttribute('aria-hidden','true');b.prepend(icon);
      b.addEventListener('pointermove',()=>{if(index!==i){index=i;highlightCommand();}});
    }
    if(!list.children.length)list.append(element('div','md-cmd-empty','没有匹配的内容'));
    highlightCommand();reposition();
  }
  function showCommands(spec,transform,slash=false){
    closePopup();mode=transform?'convert':slash?'slash':'insert';command=spec;pop.hidden=false;float.hidden=true;
    if(!slash){
      const field=element('input','md-command-filter');field.setAttribute('aria-label','查找内容类型');field.placeholder='查找内容类型';
      pop.append(field);field.oninput=()=>refreshCommands(field.value);field.focus();
    }
    refreshCommands(spec.query||'');
  }
  function updateSlash(){
    if(composing||readOnly)return;
    const s=capture(),range=window.getSelection();if(!s||isMulti(s)||s.from!==s.to||!range.rangeCount){if(mode==='slash')closePopup();return;}
    const unit=nodeElement(range.anchorNode)?.closest('[data-unit]');
    if(!unit||unit.tagName==='PRE'){if(mode==='slash')closePopup();return;}
    const map=bodyMap(shown.get(s.entity)),bounds=map.places.get(unit).boundaries;
    // A slash after ordinary text or inside a URL stays literal.
    const ahead=map.raw.slice(bounds[0],s.from),match=/^(\/[^\n/]*)$/.exec(ahead);
    if(!match){if(mode==='slash')closePopup();return;}
    const spec={entity:s.entity,from:bounds[0],to:s.to,query:match[1].slice(1),table:unit.closest('table'),rect:caretRect()};
    if(mode==='slash'){command=spec;refreshCommands(spec.query);}else showCommands(spec,false,true);
  }
  function convert(entity,type,at=0){
    const item=types.find(x=>x.id===type),raw=entity.payload.text;
    if(type==='table'){entity.payload.text='| 列一 | 列二 |\n| --- | --- |\n|  |  |';return 2;}
    if(type==='code'){const fence='\x60'.repeat(3);entity.payload.text=fence+'\n'+raw+'\n'+fence;return 4;}
    const lines=raw.split('\n'),line=raw.slice(0,at).split('\n').length-1;
    lines[line]=item.prefix+lines[line].replace(stripPrefix,'');entity.payload.text=lines.join('\n');
    return lines.slice(0,line).reduce((n,l)=>n+l.length+1,0)+item.prefix.length;
  }
  function choose(item){
    const spec=command;if(!spec||!item)return;const converting=mode==='convert';closePopup();
    if(converting){for(const entity of spec.items)convert(entity,item.id);changed();refresh();layout.setSelection(spec.items);return;}
    const entity=spec.entity,raw=entity.payload.text;
    entity.payload.text=raw.slice(0,spec.from)+raw.slice(spec.to);
    if(item.id==='figures'){changed();refresh();focusSelection(entity,spec.from);runAction(item.action,selection());return;}
    if(item.id==='table-row'||item.id==='table-col'){refresh();focusSelection(entity,spec.from);modifyTable(item.id==='table-row'?'row':'col');return;}
    const pos=convert(entity,item.id,spec.from);changed();refresh();focusSelection(entity,pos,item.id==='table'?pos+2:pos);
  }
  function menuKey(e){
    if(!mode)return false;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const s=selection();closePopup();if(s)focusSelection(s.entity,s.to);return true;}
    if(!['slash','insert','convert'].includes(mode))return false;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(options.length){index=(index+(e.key==='ArrowDown'?1:options.length-1))%options.length;highlightCommand();}
      e.preventDefault();e.stopPropagation();return true;
    }
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();choose(options[index]);return true;}
    return false;
  }

  function modifyTable(type){
    const s=active(),unit=nodeElement(window.getSelection().anchorNode)?.closest('td,th');
    if(!s||!unit)return;
    const t=unit.closest('table'),m=bodyMap(shown.get(s.entity)),bounds=m.places.get(t).boundaries;
    const a=bounds[0],b=bounds.at(-1),raw=s.entity.payload.text.slice(a,b),ending=/\r?\n$/.exec(raw)?.[0]||'';
    const rows=raw.slice(0,raw.length-ending.length).split(/\r?\n/);let pos=s.from;
    if(type==='row'){pos=a+rows.join('\n').length+3;rows.push('|'+'  |'.repeat(t.rows[0].cells.length));}
    else{rows.forEach((line,i)=>rows[i]=line.trimEnd()+(i===1?' --- |':'  |'));pos=a+rows[0].length-1;}
    replace(s,a,b,rows.join('\n')+ending,pos);
  }
  const cellTools=element('div','md-cell-tools');cellTools.hidden=true;document.body.append(cellTools);
  if(!readOnly){button(cellTools,'加行',()=>modifyTable('row'));button(cellTools,'加列',()=>modifyTable('col'));}
  function cellContext(){
    const unit=nodeElement(window.getSelection().anchorNode)?.closest('td,th');
    cellTools.hidden=readOnly||!unit||!sections.contains(unit)||!window.getSelection().isCollapsed||Boolean(mode);
    if(!cellTools.hidden)place(cellTools,unit.closest('table').getBoundingClientRect());
  }
  function insertBlocks(s,incoming){
    if(!s||!incoming.length)return;
    const first=s.entity,lastRange=s.ranges.at(-1),firstRaw=first.payload.text,lastRaw=lastRange.entity.payload.text;
    const before=firstRaw.slice(0,s.from),tail=lastRaw.slice(lastRange.to),i=entities.indexOf(first),j=entities.indexOf(lastRange.entity);
    const groups=new Map();
    const next=incoming.map(e=>{
      const p=structuredClone(e.payload);delete p.docKey;
      if(p.layout){const original=p.layout.group;if(!groups.has(original))groups.set(original,crypto.randomUUID());p.layout.group=groups.get(original);}
      else Object.assign(p,inherited(first));
      return newEntity(p);
    });
    if(before.trim() && (next[0].payload.figures?.length || /^(?:#{1,6}\s|(\x60{3,})|\|)/.test(next[0].payload.text))){next.unshift(newEntity({...inherited(first),text:before}));}
    else next[0].payload.text=before+next[0].payload.text;
    let e=next.at(-1),at=e.payload.text.length;
    if(tail&&e.payload.figures?.length){e=newEntity({...inherited(lastRange.entity),text:tail});next.push(e);at=0;}else e.payload.text+=tail;
    const original=next[0];Object.assign(first.payload,original.payload);next[0]=first; if(e===original)e=first;
    if(first.payload.figures?.length&&!original.payload.figures?.length && next.length>1){
      const figures=first.payload.figures;delete first.payload.figures;next.push(newEntity({...inherited(first),text:'',figures}));
    }
    entities.splice(i,j-i+1,...next);resetJoins();changed();refresh();focusSelection(e,at);
  }
  function delText(s){insertBlocks(s,[newEntity({text:''})]);}
  function forwardBoundary(s,unit){
    if(!unit||s.from!==s.to||unit.matches('td,th,pre')||s.to!==s.entity.payload.text.length)return false;
    const i=entities.indexOf(s.entity),next=entities[i+1];if(!next)return false;
    if(s.entity.payload.figures?.length||next.payload.figures?.length||JSON.stringify(s.entity.payload.layout)!==JSON.stringify(next.payload.layout)){
      focusSelection(next,0);return true;
    }
    s.entity.payload.text+=next.payload.text.replace(stripPrefix,'');entities.splice(i+1,1);resetJoins();changed();refresh();focusSelection(s.entity,s.to);return true;
  }
  function selectionPayloads(s) {
    return s.ranges.map(r=>{
      const p=structuredClone(r.entity.payload),host=shown.get(r.entity),map=bodyMap(host),source=p.text;
      if(r.from===0&&r.to===source.length){delete p.docKey;return p;}
      const marks=[...host.querySelectorAll('strong,em,mark,s,a,code')].filter(n=>n.dataset.before);
      const opens=marks.filter(n=>{const b=map.places.get(n).boundaries;return r.from>=b[0]&&r.from<=b.at(-1);});
      const closes=marks.filter(n=>{const b=map.places.get(n).boundaries;return r.to>=b[0]&&r.to<=b.at(-1);});
      const prefix=r.from===map.places.get(host.querySelector('[data-unit]'))?.boundaries[0]?host.querySelector('[data-unit]')?.dataset.before||'':'';
      return {...inherited(r.entity),text:prefix+opens.map(n=>n.dataset.before).join('')+source.slice(r.from,r.to)+closes.reverse().map(n=>n.dataset.after).join('')};
    });
  }
  function clipboard(e,cut=false){
    const picked=layout.selected(),s=capture();
    if(!picked.length&&(!s||!s.text||window.getSelection().isCollapsed))return;
    const list=picked.length?picked.map(ent=>newEntity(ent.payload)):selectionPayloads(s).map(newEntity);
    const markdown=documentMarkdown(list),semantic=renderDocumentContent(list,{resolveUrl}),clone=semantic.cloneNode(true);
    for(const [i,f] of [...clone.querySelectorAll('figure')].entries()){
      const p=list.flatMap(e=>e.payload.figures||[])[i];if(p){f.dataset.caption=p.caption||'';f.dataset.source=p.source||'';f.dataset.space=p.spaceId||'';f.dataset.canvas=p.canvasId||'';f.dataset.card=p.cardId||'';}
    }
    e.preventDefault();e.clipboardData.setData('text/plain',picked.length?list.map(it=>it.payload.text||it.payload.figures?.map(f=>f.caption).join('\n')).join('\n\n'):window.getSelection().toString());
    e.clipboardData.setData('text/html',clone.outerHTML);e.clipboardData.setData('text/markdown',markdown);
    if(cut&&!readOnly){if(picked.length)layout.removeSelected();else delText(s);}
  }
  root.addEventListener('copy',e=>{if(!e.target.closest('input,textarea'))clipboard(e);});
  root.addEventListener('cut',e=>{if(!e.target.closest('input,textarea'))clipboard(e,true);});
  root.addEventListener('paste',e=>{
    if(readOnly||e.target.closest('input,textarea')||!sections.contains(e.target))return;
    const s=capture()||active();if(!s)return;
    const data=e.clipboardData,md=data.getData('text/markdown'),html=data.getData('text/html'),plain=data.getData('text/plain').replace(/\r\n/g,'\n');
    if(!md&&!html&&!plain)return;
    e.preventDefault();closePopup();
    const td=nodeElement(window.getSelection().anchorNode)?.closest('td,th'),pre=nodeElement(window.getSelection().anchorNode)?.closest('pre');
    if((td||pre)&&!isMulti(s)){replace(s,s.from,s.to,td?plain.replace(/\n/g,' ').replace(/\|/g,'\\|'):plain);return;}
    const value=md || (html?pastedHtml(html):'') || plain;
    if(!value.includes('\n')&&!isMulti(s)&&!parseFigures(value)){replace(s,s.from,s.to,value);return;}
    insertBlocks(s,markdownEntities(value));
  });
  function enter(s,unit,soft){
    if(isMulti(s)){delText(s);s=capture();unit=nodeElement(window.getSelection().anchorNode)?.closest('[data-unit]');}
    if(!s||!unit)return;const raw=s.entity.payload.text;
    if(unit.tagName==='PRE'||soft){replace(s,s.from,s.to,'\n');return;}
    if(unit.matches('td,th')){
      const cells=[...unit.closest('table').querySelectorAll('td,th')],next=cells[cells.indexOf(unit)+1];
      if(next){focusSelection(s.entity,bodyMap(shown.get(s.entity)).places.get(next).boundaries[0]);}else after(s.entity);
      return;
    }
    const prefix=unit.dataset.before||'',tail=unit.dataset.after||'';
    let repeated=unit.tagName==='LI'?prefix.replace(/\d+/,n=>String(Number(n)+1)).replace(/\[[xX]\]/,'[ ]'):unit.tagName==='BLOCKQUOTE'?prefix:'';
    if(repeated&&!unit.textContent.trim()){
      const b=bodyMap(shown.get(s.entity)).places.get(unit).boundaries;
      if(s.entity.payload.indent)layout.indent([s.entity],-1);
      else replace(s,b[0]-prefix.length,b.at(-1),'');return;
    }
    const host=shown.get(s.entity),map=bodyMap(host),inline=[...host.querySelectorAll('strong,em,s,mark,a,code')].filter(n=>n.dataset.before);
    const outsideEdge=pos=>{for(const el of inline.slice().reverse()){const b=map.places.get(el).boundaries;if(pos===b[0])pos-=el.dataset.before.length;else if(pos===b.at(-1))pos+=el.dataset.after.length;}return pos;};
    const from=outsideEdge(s.from),to=outsideEdge(s.to),inside=pos=>inline.filter(el=>{const b=map.places.get(el).boundaries;return pos>b[0]&&pos<b.at(-1);});
    const close=inside(from).reverse().map(el=>el.dataset.after).join(''),open=inside(to).map(el=>el.dataset.before).join('');
    const right=raw.slice(to);s.entity.payload.text=raw.slice(0,from)+close;
    const ent=newEntity({...inherited(s.entity),text:repeated+open+right});
    if(!right&&tail&&s.entity.payload.text.endsWith(tail))s.entity.payload.text=s.entity.payload.text.slice(0,-tail.length);
    entities.splice(entities.indexOf(s.entity)+1,0,ent);resetJoins();changed();refresh();focusSelection(ent,repeated.length+open.length);
  }
  function typed(e){
    if(readOnly)return;
    if(e.target.matches('input[type=checkbox]')){
      const host=locate(e.target),li=e.target.closest('li');if(!host||!li)return;
      li.dataset.checked=String(e.target.checked);li.dataset.before=li.dataset.before.replace(/\[[ xX]\]/,e.target.checked?'[x]':'[ ]');
      host._entity.payload.text=bodyMap(host).raw;changed();return;
    }
    if(!sections.contains(e.target)||e.target.closest('input,textarea,figcaption'))return;
    const host=locate(window.getSelection().anchorNode);if(!host)return;
    const map=bodyMap(host);
    // Non-structural input preserves the live browser composition range.
    host._entity.payload.text=map.raw;
    if(!composing&&!e.isComposing){
      const s=capture();
      if(s && !isMulti(s) && s.from===s.to && /^(?:#{1,6} |[-*] |\d+\. |>\s|\[\] )$/.test(map.raw) && host.querySelector('p')){
        if(map.raw==='[] ')host._entity.payload.text='- [ ] ';
        changed();refresh();focusSelection(s.entity,s.entity.payload.text.length);return;
      }
      changed(host._entity);updateSlash();
    }
    if(host.querySelector('h1,h2,h3,h4,h5,h6'))rebuildOutline();notify();
  }
  root.addEventListener('compositionstart',()=>{composing=true;});
  root.addEventListener('compositionend',e=>{composing=false;typed(e);});
  root.addEventListener('input',typed);
  root.addEventListener('keydown',e=>{
    if(e.isComposing||composing||e.keyCode===229)return;
    if(menuKey(e)||readOnly||!sections.contains(e.target)||e.target.closest('input,textarea,figcaption'))return;
    const mod=e.metaKey||e.ctrlKey,key=e.key.toLowerCase(),s=capture();
    if(mod&&((key==='z')||key==='y')){e.preventDefault();restore(key==='y'||e.shiftKey);return;}
    if(e.target.closest('button'))return;
    if(!s)return;
    const unit=nodeElement(window.getSelection().anchorNode)?.closest('[data-unit]');if(!unit)return;
    if(mod&&key==='b'){e.preventDefault();format('bold',s);return;}
    if(mod&&key==='i'){e.preventDefault();format('italic',s);return;}
    if(mod&&key==='k'){e.preventDefault();editLink();return;}
    if(e.key==='Enter'){e.preventDefault();enter(s,unit,e.shiftKey);return;}
    if(e.key==='Tab'){
      if(unit.matches('td,th')){const cells=[...unit.closest('table').querySelectorAll('th,td')],next=cells[cells.indexOf(unit)+(e.shiftKey?-1:1)];
        if(next){e.preventDefault();focusSelection(s.entity,bodyMap(shown.get(s.entity)).places.get(next).boundaries[0]);}}
      else if(unit.tagName==='LI'||isMulti(s)){e.preventDefault();layout.indent(s.ranges.map(r=>r.entity),e.shiftKey?-1:1);focusSelection(s.entity,s.from);}
      return;
    }
    if(isMulti(s)&&['Backspace','Delete'].includes(e.key)){e.preventDefault();delText(s);return;}
    if(e.key==='Delete'&&forwardBoundary(s,unit)){e.preventDefault();return;}
    if(e.key==='Backspace'&&s.from===s.to){
      const bounds=bodyMap(shown.get(s.entity)).places.get(unit).boundaries,atStart=s.from===bounds[0];
      if(atStart&&s.entity.payload.indent){e.preventDefault();layout.indent([s.entity],-1);focusSelection(s.entity,s.from);return;}
      if(atStart&&unit.dataset.before&&!unit.matches('td,th,pre')){e.preventDefault();replace(s,bounds[0]-unit.dataset.before.length,bounds[0],'');return;}
      const i=entities.indexOf(s.entity),prev=entities[i-1];
      if(s.from===0&&prev&&!s.entity.payload.figures?.length){
        e.preventDefault();
        if(prev.payload.figures?.length || JSON.stringify(prev.payload.layout)!==JSON.stringify(s.entity.payload.layout)){focusSelection(prev,prev.payload.text.length);return;}
        const end=prev.payload.text.length;prev.payload.text+=s.entity.payload.text;entities.splice(i,1);resetJoins();changed();refresh();focusSelection(prev,end);
      }
    }
  });
  root.addEventListener('beforeinput',e=>{
    if(readOnly||composing||e.isComposing||e.target.closest('input,textarea,figcaption')||!sections.contains(e.target))return;
    const s=capture();if(!s)return;const unit=nodeElement(window.getSelection().anchorNode)?.closest('[data-unit]');
    if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){e.preventDefault();restore(e.inputType==='historyRedo');return;}
    if(e.inputType==='formatBold'||e.inputType==='formatItalic'){e.preventDefault();format(e.inputType==='formatBold'?'bold':'italic',s);return;}
    if(['insertParagraph','insertLineBreak'].includes(e.inputType)&&unit){e.preventDefault();enter(s,unit,e.inputType==='insertLineBreak');return;}
    if(isMulti(s)&&e.inputType.startsWith('delete')){e.preventDefault();delText(s);return;}
    if(e.inputType==='deleteContentForward'&&forwardBoundary(s,unit)){e.preventDefault();return;}
    if(isMulti(s)&&e.inputType==='insertText'){e.preventDefault();insertBlocks(s,[newEntity({text:e.data||''})]);return;}
    if(e.inputType==='insertText'&&e.data?.includes('|')&&unit?.matches('td,th')){e.preventDefault();replace(s,s.from,s.to,e.data.replace(/\|/g,'\\|'));}
  });
  const originalNotify=notify;
  function selectionChanged(){originalNotify();cellContext();}
  pop.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229)menuKey(e);});
  document.addEventListener('selectionchange',selectionChanged);
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);
  refresh();return api;
}
