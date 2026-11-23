import {renderDocumentContent} from './doc-editor.js?v=20261123docs1';

function runs(node, style={}) {
  if(node.nodeType===Node.TEXT_NODE) return node.textContent ? [{...style,text:node.textContent}] : [];
  const tag=node.tagName;
  if(tag==='BR') return [{...style,text:'\n'}];
  if(tag==='IMG') return [{image:node.getAttribute('src'),caption:node.alt || ''}];
  const next={...style};
  if(tag==='STRONG'||tag==='B') next.bold=true;
  if(tag==='EM'||tag==='I') next.italic=true;
  if(tag==='CODE'||tag==='PRE') next.code=true;
  if(tag==='A'&&node.href) next.href=node.href;
  return [...node.childNodes].flatMap(n=>runs(n,next));
}

export function exportBlocks(entities) {
  const blocks=[];
  function collect(node) {
    const tag=node.tagName;
    if(tag==='TABLE') {blocks.push({table:[...node.rows].map(row=>[...row.cells].map(cell=>runs(cell)))});return;}
    if(tag==='UL'||tag==='OL') {
      for(const [i,li] of [...node.children].entries()){
        const children=[...li.childNodes].filter(n=>!['UL','OL'].includes(n.tagName));
        addRuns(children.flatMap(n=>runs(n)),{prefix:tag==='OL'?String(i+(node.start || 1))+'. ':'• '});
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
    if(entry.payload?.text) collect(renderDocumentContent([{payload:{text:entry.payload.text}}]));
    if(entry.payload?.figures?.length) blocks.push({figures:entry.payload.figures.map(({url,caption,source})=>({url,caption,source}))});
  }
  return blocks;
}

export async function exportDocument(kind,{title,entities,api}) {
  const response=await api('/export',{method:'POST',body:{kind,title,document:exportBlocks(entities)},timeout:180000});
  if(!response.ok) throw Error((await response.json()).error);
  const href=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.download=(title || '毛豆文档').replace(/[\\/:*?"<>|]/g,'_')+'.'+kind;link.href=href;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
}
