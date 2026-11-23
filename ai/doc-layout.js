// Rows use reading order in storage: top to bottom, then columns left to right.
function rowsOf(entities) {
  const rows=[];
  for(const entity of entities) {
    const layout=entity.payload.layout, last=rows.at(-1);
    if(!layout?.group || !Number.isInteger(layout.column) || layout.column<0) {
      rows.push({group:'',columns:[[entity]]});
      continue;
    }
    const row=last?.group===layout.group ? last : {group:layout.group,columns:[],indexes:[]};
    if(row!==last) rows.push(row);
    let index=row.indexes.indexOf(layout.column);
    if(index<0){
      index=row.indexes.findIndex(n=>n>layout.column);
      if(index<0) index=row.indexes.length;
      row.indexes.splice(index,0,layout.column);row.columns.splice(index,0,[]);
    }
    row.columns[index].push(entity);
  }
  return rows;
}
const newGroup=()=>'g-'+crypto.randomUUID();
const rowItems=row=>row.columns.flat();
const node=(tag,cls,label)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(label)e.textContent=label;return e;};
function control(cls,label,title){
  const b=node('button',cls,label);b.type='button';b.contentEditable='false';b.title=title;b.setAttribute('aria-label',title);return b;
}

export function mountBlockLayout({root,sections,entities,readOnly,onCommit,onInsert,onTransform,focus}) {
  const lifetime=new AbortController(), selected=new Set(), hosts=new Map();
  let first=null, menu=null, gesture=null, guide=null, scroller=null, scrollFrame=0;
  sections.classList.add('md-layout');
  root.classList.add('md-writing-surface');
  const listen=(el,name,fn,opts={})=>el.addEventListener(name,fn,{...opts,signal:lifetime.signal});
  const sectionFor=target=>{const section=target?.closest?.('.md-section');return section && sections.contains(section)?section:null;};
  function activity(){root.classList.toggle('md-layout-interacting',!!(gesture || menu));}
  const blockFor=target=>sectionFor(target)?._entity;
  const selectedBlocks=()=>entities.filter(item=>selected.has(item));
  function setSelection(items,anchor=items[0]) {
    selected.clear();for(const item of items) if(entities.includes(item))selected.add(item);
    first=anchor || null;
    for(const [item,section] of hosts){
      section.classList.toggle('md-block-selected',selected.has(item));
      section.querySelector('.md-block-handle')?.setAttribute('aria-pressed',String(selected.has(item)));
    }
  }
  function clear(){if(selected.size)setSelection([]);}
  function closeMenu(restore=false){
    if(!menu)return;
    const anchor=menu._anchor;
    menu.remove();menu=null;activity();
    if(restore && anchor?.isConnected) anchor.focus({preventScroll:true});
  }
  function openMenu(anchor,items) {
    closeMenu();menu=node('div','md-block-menu');activity();
    menu.setAttribute('role','menu');menu.setAttribute('aria-label','内容操作');menu.contentEditable='false';menu._anchor=anchor;
    const el=menu;
    for(const [label,fn] of items){
      const b=control('md-menu-action',label,label);b.setAttribute('role','menuitem');
      b.onclick=e=>{e.stopPropagation();closeMenu();fn();};el.append(b);
    }
    document.body.append(el);
    const rect=anchor.getBoundingClientRect();
    el.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-el.offsetWidth-8))+'px';
    el.style.top=(rect.bottom+el.offsetHeight+8<=window.innerHeight?rect.bottom+4:Math.max(8,rect.top-el.offsetHeight-4))+'px';
    el.querySelector('button')?.focus({preventScroll:true});
    el.onkeydown=e=>{
      const buttons=Array.from(el.children), i=buttons.indexOf(document.activeElement);
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu(true);}
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
        e.preventDefault();
        const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[index].focus();
      }
    };
  }
  const textOf=e=>String(e.payload.text || e.payload.figures?.[0]?.caption || (e.payload.figures?.length?'图片':'空段落')).trim().replace(/^#+\s*/,'').slice(0,42);
  const rowFor=(rows,e)=>rows.find(row=>row.columns.some(col=>col.includes(e)));
  function writeRows(rows) {
    const ordered=[];
    for(const row of rows){
      const cols=row.columns.filter(col=>col.length);
      const group=cols.length>1?(row.group || newGroup()):'';
      cols.forEach((col,column)=>{
        for(const e of col){
          if(group) e.payload.layout={group,column};else delete e.payload.layout;
          ordered.push(e);
        }
      });
    }
    if(!ordered.length)ordered.push({id:'',revision:0,payload:{text:''}});
    entities.splice(0,entities.length,...ordered);
  }
  function move(items,target,edge,wholeRow=false) {
    if(readOnly || !items.length || !target || items.includes(target))return;
    const rows=rowsOf(entities), chosen=new Set(items), dest=rowFor(rows,target);
    if(!dest)return;
    const extracted=[];
    for(const row of rows) {
      const moved=row.columns.map(col=>col.filter(e=>chosen.has(e))).filter(col=>col.length);
      if(moved.length)extracted.push({group:rowItems(row).every(e=>chosen.has(e))?row.group:newGroup(),columns:moved});
      row.columns=row.columns.map(col=>col.filter(e=>!chosen.has(e))).filter(col=>col.length);
    }
    const col=dest.columns.find(column=>column.includes(target));
    const structured=extracted.some(row=>row.columns.length>1);
    if((edge==='left'||edge==='right') && !structured) {
      dest.columns.splice(dest.columns.indexOf(col)+(edge==='right'?1:0),0,extracted.flatMap(rowItems));
    } else if(dest.columns.length>1 && !structured && !wholeRow){
      col.splice(col.indexOf(target)+(edge==='after'?1:0),0,...extracted.flatMap(rowItems));
    } else {
      rows.splice(rows.indexOf(dest)+(['after','right'].includes(edge)?1:0),0,...extracted);
    }
    writeRows(rows);
    onCommit();setSelection(items);hosts.get(items[0])?.querySelector('.md-block-handle')?.focus({preventScroll:true});
  }
  function duplicate(items) {
    const rows=rowsOf(entities), selected=new Set(items), next=[];
    for(const row of rows) {
      const originalCols=[...row.columns];
      const copied=originalCols.map(col=>col.filter(item=>selected.has(item)).map(item=>{
        const entity={id:'',revision:0,payload:structuredClone(item.payload)};delete entity.payload.docKey;
        next.push(entity);return entity;
      })).filter(col=>col.length);
      if(!copied.length)continue;
      if(copied.length===1 && row.columns.length>1) {
        const col=row.columns.find(col=>col.some(e=>selected.has(e)));
        col.splice(col.findLastIndex(e=>selected.has(e))+1,0,...copied[0]);
      } else {
        rows.splice(rows.indexOf(row)+1,0,{group:copied.length>1?newGroup():'',columns:copied});
      }
    }
    writeRows(rows);onCommit();setSelection(next);hosts.get(next[0])?.querySelector('.md-block-handle')?.focus({preventScroll:true});
  }
  function removeSelected() {
    const removed=selectedBlocks();if(readOnly||!removed.length)return;
    const at=entities.indexOf(removed[0]),rows=rowsOf(entities);
    for(const row of rows)row.columns=row.columns.map(col=>col.filter(e=>!selected.has(e)));
    writeRows(rows);clear();onCommit();focus(entities[Math.min(at,entities.length-1)]);
  }
  function indent(items,delta) {
    if(readOnly || !items.length)return;
    for(const e of items){const value=Math.max(0,(e.payload.indent || 0)+delta);if(value)e.payload.indent=value;else delete e.payload.indent;}
    onCommit();
  }
  function step(items,down) {
    const from=entities.indexOf(down?items.at(-1):items[0]),target=entities[from+(down?1:-1)];
    if(target)move(items,target,down?'after':'before',target.payload.layout?.group!==items[0].payload.layout?.group);
  }
  function actionMenu(anchor,items) {
    if(!items.length)return;
    const first=items[0];
    const group=rowFor(rowsOf(entities),first);
    const clipboard=command=>{anchor.focus({preventScroll:true});setSelection(items);document.execCommand(command);};
    const options=[['转换为…',()=>onTransform(items,anchor)],['复制到剪贴板',()=>clipboard('copy')],['剪切',()=>clipboard('cut')],['创建副本',()=>duplicate(items)]];
    if(group?.columns.length>1 && items.length<rowItems(group).length)options.push(['选择整组',()=>{
      const all=rowItems(group);setSelection(all);actionMenu(anchor,all);
    }]);
    const rest=entities.filter(e=>!items.includes(e));
    if(rest.length)options.push(['移动到…',()=>{
      const grouped=rowsOf(entities).some(r=>r.columns.filter(c=>c.some(e=>items.includes(e))).length>1);
      const edges=[['目标上方','before'],['目标下方','after'],...(!grouped?[['目标左栏','left'],['目标右栏','right']]:[])];
      openMenu(anchor,edges.map(([label,edge])=>[label,()=>openMenu(anchor,rest.map(e=>[textOf(e),()=>move(items,e,edge)]))]));
    }],['上移',()=>step(items,false)],['下移',()=>step(items,true)]);
    options.push(['增加缩进',()=>indent(items,1)],['减少缩进',()=>indent(items,-1)],['删除',()=>{setSelection(items);removeSelected();}]);
    openMenu(anchor,options);
  }
  function nativeBlocks() {
    const sel=window.getSelection();if(!sel.rangeCount || sel.isCollapsed)return [];
    const a=blockFor(sel.anchorNode?.parentElement),b=blockFor(sel.focusNode?.parentElement);
    if(!a || !b || a===b)return [];
    const start=entities.indexOf(a),end=entities.indexOf(b);
    return entities.slice(Math.min(start,end),Math.max(start,end)+1);
  }
  function choose(e,items){
    if(e.shiftKey && first){
      const a=entities.indexOf(first),b=entities.indexOf(items.at(-1));setSelection(entities.slice(Math.min(a,b),Math.max(a,b)+1),first);
    } else if(e.ctrlKey||e.metaKey){
      const next=new Set(selected);for(const item of items){if(next.has(item))next.delete(item);else next.add(item);}setSelection([...next],first || items[0]);
    } else if(!items.every(item=>selected.has(item))) {
      const range=nativeBlocks();setSelection(range.includes(items[0])?range:items);
    }
  }
  function dropTarget(x,y,items) {
    const element=document.elementFromPoint(x,y);
    let section=sectionFor(element);
    if(!section && element && sections.contains(element)){
      let nearest=Infinity;
      for(const item of entities) {
        if(items.includes(item))continue;
        const candidate=hosts.get(item),r=candidate.getBoundingClientRect();
        if(!r.height || (x<r.left && !element.closest('.md-group-tools')) || x>r.right)continue;
        const distance=Math.max(r.top-y,y-r.bottom,0);
        if(distance<nearest){section=candidate;nearest=distance;}
      }
    }
    const target=section?._entity;
    if(!section || items.includes(target))return null;
    const r=section.getBoundingClientRect(),frac=(x-r.left)/Math.max(r.width,1),height=(y-r.top)/Math.max(r.height,1);
    const movingRow=rowsOf(entities).some(row=>row.columns.filter(col=>col.some(e=>items.includes(e))).length>1);
    let edge=height<.5?'before':'after';
    if(!movingRow && height>=.18 && height<=.82 && (frac<.22 || frac>.78))edge=frac<.22?'left':'right';
    if(movingRow && section.closest('.md-columns')) section=section.closest('.md-columns');
    return {target,edge,rect:section.getBoundingClientRect()};
  }
  function guideAt(drop) {
    if(!drop){guide?.remove();guide=null;return;}
    if(!guide){guide=node('div','md-placement-guide');guide.contentEditable='false';document.body.append(guide);}
    const {rect,edge}=drop,side=edge==='left'||edge==='right';
    guide.dataset.edge=edge;guide.style.left=(edge==='right'?rect.right-2:rect.left)+'px';
    guide.style.top=(edge==='after'?rect.bottom-2:rect.top)+'px';
    guide.style.width=(side?3:rect.width)+'px';guide.style.height=(side?rect.height:3)+'px';
  }
  function autoScroll() {
    scrollFrame=0;if(!gesture?.dragging || !scroller)return;
    const r=scroller.getBoundingClientRect(),{y}=gesture;
    const delta=y<r.top+42 && y>=r.top ? -Math.ceil((r.top+42-y)/3) : y>r.bottom-42 && y<=r.bottom ? Math.ceil((y-r.bottom+42)/3):0;
    if(!delta)return;const old=scroller.scrollTop;scroller.scrollTop+=delta;
    if(scroller.scrollTop===old)return;
    guideAt(dropTarget(gesture.x,y,gesture.items));scrollFrame=requestAnimationFrame(autoScroll);
  }
  function finishGesture() {
    if(!gesture)return;
    clearTimeout(gesture.timer);cancelAnimationFrame(scrollFrame);scrollFrame=0;
    guideAt(null);root.classList.remove('is-moving-blocks');gesture=null;activity();
  }
  function startDrag(e,handle,items,fromContent=false){
    if(readOnly || e.button!==0 || gesture)return;
    if(!fromContent){
      e.preventDefault();e.stopPropagation();closeMenu();choose(e,items);
      handle.focus({preventScroll:true});
      handle.setPointerCapture(e.pointerId);
    }
    const moving=fromContent?items:selectedBlocks();
    if(!moving.length)return;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,items:moving,handle,fromContent,modified:e.shiftKey||e.ctrlKey||e.metaKey};
    activity();
    if(e.pointerType!=='mouse'){
      gesture.timer=setTimeout(()=>{
        if(!gesture)return;
        const g=gesture;g.long=true;setSelection(g.items);window.getSelection()?.removeAllRanges();actionMenu(handle,g.items);
      },460);
    }
  }
  if(!readOnly){
    listen(document,'pointermove',e=>{
      const g=gesture;if(!g||e.pointerId!==g.id)return;
      g.x=e.clientX;g.y=e.clientY;
      if(!g.dragging && Math.hypot(g.x-g.startX,g.y-g.startY)>5){
        clearTimeout(g.timer);
        if(g.fromContent && !g.long){finishGesture();return;}
        g.dragging=true;closeMenu();root.classList.add('is-moving-blocks');
        window.getSelection()?.removeAllRanges();
        scroller=sections.parentElement;while(scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))scroller=scroller.parentElement;
      }
      if(g.dragging){e.preventDefault();guideAt(dropTarget(g.x,g.y,g.items));if(!scrollFrame)scrollFrame=requestAnimationFrame(autoScroll);}
    },{passive:false});
    listen(document,'pointerup',e=>{
      const g=gesture;if(!g||e.pointerId!==g.id)return;
      if(g.dragging){const drop=dropTarget(e.clientX,e.clientY,g.items);if(drop)move(g.items,drop.target,drop.edge);}
      else if(!g.long && !g.modified && !g.fromContent)actionMenu(g.handle,g.items);
      finishGesture();
    });
    listen(document,'pointercancel',finishGesture);
    listen(window,'blur',finishGesture);
    listen(document,'pointerdown',e=>{
      if(menu && !menu.contains(e.target) && !e.target.closest('.md-grip'))closeMenu();
      if(!root.contains(e.target))return;
      if(e.target.closest('.md-grip,.md-block-controls,.md-group-tools'))return;
      clear();
      const section=sectionFor(e.target);
      if(e.pointerType==='touch' && section && !e.target.closest('button,a,input,textarea'))startDrag(e,section.querySelector('.md-block-handle'),[section._entity],true);
    },{capture:true});
    listen(root,'keydown',e=>{
      if(e.isComposing || e.keyCode===229)return;
      const handle=e.target.closest('.md-grip');
      if(!handle)return;
      const items=selectedBlocks().length?selectedBlocks():handle._items;
      if(e.key===' ' || e.key==='Enter'){e.preventDefault();setSelection(items);actionMenu(handle,items);}
      if(e.key==='Escape'){e.preventDefault();clear();closeMenu();focus(items[0]);}
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();setSelection(items);removeSelected();}
      if(e.key==='Tab' && (e.metaKey||e.ctrlKey)){e.preventDefault();indent(items,e.shiftKey?-1:1);}
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='a'){e.preventDefault();setSelection(entities);}
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='d'){e.preventDefault();duplicate(items);}
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        const down=e.key==='ArrowDown';
        e.preventDefault();
        if(e.ctrlKey||e.metaKey||e.altKey){
          step(items,down);hosts.get(items[0])?.querySelector('.md-block-handle')?.focus({preventScroll:true});
        }else{
          const now=e.target._items[0],next=entities[entities.indexOf(now)+(down?1:-1)];
          if(next){choose(e,[next]);hosts.get(next)?.querySelector('.md-block-handle')?.focus();}
        }
      }
    });
  }
  function grip(items,group=false) {
    const handle=control('md-grip '+(group?'md-group-handle':'md-block-handle'),group?'分栏':'',group?'分栏组操作':'段落操作');
    handle.setAttribute('aria-haspopup','menu');handle._items=items;
    handle.onpointerdown=e=>startDrag(e,handle,items);
    // Programmatic clicks from assistive devices may not dispatch pointer events.
    handle.onclick=e=>{if(e.detail===0){setSelection(items);actionMenu(handle,items);}};
    return handle;
  }
  function render() {
    closeMenu();hosts.clear();
    for(const section of sections.querySelectorAll('.md-section')){
      const item=section.querySelector('.md-block')._entity;
      section._entity=item;
      if(item.id)section.dataset.blockId=item.id;
      section.style.setProperty('--block-indent',item.payload.indent || 0);
      hosts.set(item,section);
      if(!readOnly){
        const controls=node('div','md-block-controls');controls.contentEditable='false';
        const add=control('md-block-add','+','在下方插入内容');add.onpointerdown=e=>e.stopPropagation();
        add.onclick=e=>{e.preventDefault();clear();onInsert(item,add);};
        controls.append(add,grip([item]));section.prepend(controls);
      }
    }
    const fragment=document.createDocumentFragment();
    for(const row of rowsOf(entities)){
      if(row.columns.length===1){for(const item of row.columns[0])fragment.append(hosts.get(item));continue;}
      const group=node('div','md-columns');group.dataset.group=row.group;group.style.setProperty('--columns',row.columns.length);
      if(!readOnly){
        const tools=node('div','md-group-tools');tools.contentEditable='false';
        tools.append(grip(rowItems(row),true));group.append(tools);
      }
      row.columns.forEach((col,i)=>{const column=node('div','md-column');column.dataset.column=i;for(const item of col)column.append(hosts.get(item));group.append(column);});
      fragment.append(group);
    }
    sections.replaceChildren(fragment);setSelection(selectedBlocks(),first);
  }
  return {render,selected:selectedBlocks,setSelection,clear,indent,removeSelected,isInteracting:()=>Boolean(gesture || menu),
    destroy(){finishGesture();closeMenu();lifetime.abort();hosts.clear();selected.clear();}};
}
