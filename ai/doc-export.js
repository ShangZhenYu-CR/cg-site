import {renderDocumentContent} from './doc-editor.js?v=20261123notion2';

function runs(node, style={}) {
  if(node.nodeType===Node.TEXT_NODE) return node.textContent ? [{...style,text:node.textContent}] : [];
  const tag=node.tagName;
  if(tag==='BR') return [{...style,text:'\n'}];
  if(tag==='IMG') return [{image:node.getAttribute('src'),caption:node.alt || ''}];
  if(tag==='INPUT') return [];
  const next={...style};
  if(tag==='STRONG'||tag==='B') next.bold=true;
  if(tag==='EM'||tag==='I') next.italic=true;
  if(tag==='CODE'||tag==='PRE') next.code=true;
  if(tag==='MARK') next.highlight=true;
  if(tag==='S'||tag==='DEL') next.strike=true;
  if(tag==='A'&&node.href) next.href=node.href;
  return [...node.childNodes].flatMap(n=>runs(n,next));
}

const galleryKey=p=>JSON.stringify([p.layout?.group,p.layout?.column,p.indent,p.figures.map(f=>f.url)]);

function galleryTracks(entities,root) {
  const counts=new Map();
  const needed=entities.map(e=>e.payload).filter(p=>p.figures?.length);
  function measure(container){
    for(const gallery of container.querySelectorAll('.md-figures')){
      if(!gallery.offsetWidth || !gallery._figurePayload)continue;
      const key=galleryKey(gallery._figurePayload);
      if(counts.has(key))continue;
      const figures=[...gallery.children],top=figures[0].getBoundingClientRect().top;
      counts.set(key,figures.filter(f=>Math.abs(f.getBoundingClientRect().top-top)<1).length);
    }
  }
  if(root)measure(root);
  if(needed.some(p=>!counts.has(galleryKey(p)))){
    // Measure folded galleries in an offscreen copy with the same editor padding and container queries.
    const editor=root?.querySelector('.md-writing-surface');
    const preview=editor?.offsetWidth ? editor.cloneNode(true) : renderDocumentContent(entities,{resolveUrl:()=>''});
    if(editor?.offsetWidth){
      const sources=editor.querySelectorAll('.md-figures');
      preview.querySelectorAll('.md-figures').forEach((g,i)=>{g._figurePayload=sources[i]._figurePayload;});
      preview.querySelectorAll('.md-section[hidden],.md-figures[hidden]').forEach(el=>{el.hidden=false;});
    }
    const width=editor?.getBoundingClientRect().width || root?.clientWidth || document.documentElement.clientWidth;
    Object.assign(preview.style,{position:'fixed',left:'-100000px',top:'0',visibility:'hidden',width:width+'px'});
    document.body.append(preview);measure(preview);preview.remove();
  }
  return counts;
}

export function exportBlocks(entities,counts=new Map()) {
  const blocks=[];
  function collect(node) {
    const tag=node.tagName;
    if(tag==='TABLE') {blocks.push({table:[...node.rows].map(row=>[...row.cells].map(cell=>runs(cell)))});return;}
    if(tag==='UL'||tag==='OL') {
      for(const [i,li] of [...node.children].entries()){
        const children=[...li.childNodes].filter(n=>!['UL','OL'].includes(n.tagName));
        const prefix=li.hasAttribute('data-checked') ? (li.dataset.checked==='true'?'☑ ':'☐ ') :
          tag==='OL'?String(li.hasAttribute('value')?li.value:i+(node.start || 1))+'. ':'• ';
        addRuns(children.flatMap(n=>runs(n)),{prefix});
        [...li.children].filter(n=>['UL','OL'].includes(n.tagName)).forEach(collect);
      }
      return;
    }
    if(tag==='HR'){blocks.push({rule:true});return;}
    if (/^H[1-6]$/.test(tag) || ['P','PRE','BLOCKQUOTE'].includes(tag)) {
      addRuns(runs(node),{level:/^H[1-6]$/.test(tag)?Number(tag[1]):0,quote:tag==='BLOCKQUOTE'}); return;
    }
    if(node.children.length) {for(const child of node.childNodes) {if(child.nodeType===Node.ELEMENT_NODE) collect(child);else if(child.textContent.trim()) addRuns(runs(child));}}
    else if(tag==='IMG'||node.textContent.trim()) addRuns(runs(node));
  }
  function addRuns(values,options={}) {
    let part=[];
    const flush=()=>{if(part.length) blocks.push({runs:part,...options});part=[];};
    for(const value of values){
      if(value.image){flush();blocks.push({figures:[{url:value.image,caption:value.caption}]});}
      else part.push(value);
    }
    flush();
  }
  for(const entry of entities){
    const start=blocks.length;
    if(entry.payload?.text) collect(renderDocumentContent([{payload:{text:entry.payload.text}}]));
    if(entry.payload?.figures?.length) blocks.push({figures:entry.payload.figures.map(({url,caption,source})=>({url,caption,source})),figureColumns:counts.get(galleryKey(entry.payload))});
    if(blocks.length===start && entry.payload) blocks.push({runs:[{text:''}]});
    for(let i=start;i<blocks.length;i++) {
      if(entry.payload.layout) blocks[i].layout={...entry.payload.layout};
      if(entry.payload.indent) blocks[i].indent=entry.payload.indent;
    }
  }
  return blocks;
}

export async function exportDocument(kind,{title,entities,root,api}) {
  const response=await api('/export',{method:'POST',body:{kind,title,document:exportBlocks(entities,galleryTracks(entities,root))},timeout:180000});
  if(!response.ok) throw Error((await response.json()).error);
  const href=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.download=(title || '毛豆文档').replace(/[\\/:*?"<>|]/g,'_')+'.'+kind;link.href=href;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
}
