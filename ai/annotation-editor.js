import {annotationTools,annotationFields,annotationOptions,annotationDefaults,annotationPen,annotationText,annotationRotates,annotationBounds,annotationCaptionBounds,rotateAnnotationPoint,annotationCaretAndSelection,annotationTextOffset,numeral,drawAnnotations,prepareSmartErase,usesSmartErase} from './annotation.js?v=20261126a2';

const clamp = (v,min=0,max=1) => Math.max(min,Math.min(max,v));
const colors = ['#f5222d','#fa8c16','#faad14','#52c41a','#13c2c2','#1677ff','#722ed1','#ffffff','#181818'];
const toolGroups = [
  ['select','arrow','line','rect','ellipse','bubble','pen','text','num'],
  ['highlight','penHighlight','distance','angle','bracket','magnifier','spotlight','watermark'],
  ['filterRect','filterPen','filterAuto','erase','eraseRect','erasePen'],
];
const toolNames = new Map(annotationTools.map(([id,label])=>[id,label]));
const toolByKey = new Map(annotationTools.map(([id,,key])=>[key,id]));
const inBox = (p,b,pad=0) => p.x>=b[0]-pad&&p.x<=b[2]+pad&&p.y>=b[1]-pad&&p.y<=b[3]+pad;
const ordered = (a,b) => [Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)];
const lineTools = new Set(['arrow','line','distance','bracket']);
const centeredShapes = new Set(['rect','ellipse','bubble','highlight','spotlight','magnifier','filterRect','eraseRect']);

function detectRegions(image) {
  const ratio=Math.min(1,1600/Math.max(image.width,image.height));
  const work=document.createElement('canvas');
  const width=work.width=Math.max(1,Math.round(image.width*ratio));
  const height=work.height=Math.max(1,Math.round(image.height*ratio));
  const ctx=work.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,width,height);
  const {data}=ctx.getImageData(0,0,width,height);
  const worker=new Worker(new URL('./annotation-region-worker.js?v=20261126a1',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
    worker.addEventListener('message',({data})=>{
      worker.terminate();
      if(data.error){reject(new Error(data.error));return;}
      resolve(data.regions.sort((a,b)=>a[2]*a[3]-b[2]*b[3]).slice(0,180));
    },{once:true});
    worker.addEventListener('error',()=>{worker.terminate();reject(new Error('区域识别引擎无法启动'));},{once:true});
    worker.postMessage({data,width,height},[data.buffer]);
  });
}

function itemForEdit(item) {
  if(item.v===2)return item;
  const style={...annotationDefaults(item.t),c:item.c||'#e5484d',lw:(item.lw||4)*1.5};
  if(item.t==='arrow'){style.arrowPath='line';style.end='triangle';}
  if(item.t==='text'){style.fontSize=22+(item.lw||4)*4;style.bold=true;}
  if(item.t==='num'){style.fontSize=(16+(item.lw||4)*2)*1.2;style.numShape='circle-solid';}
  return {...item,v:2,style,pts:item.pts?.map(p=>[p[0],p[1],.5])};
}

export function openAnnotation({src,aspect,items,readImage,save,el}) {
  let list=structuredClone(items),tool='arrow',selected=-1,ar=aspect,image=null,regions=[],detection=null;
  let draft=null,gesture=null,angle=[],hover=null,textInput=null,textEdit=null,frame=0,smartRevision=0,smartPatches=new Map();
  const before=[],after=[],settings=new Map();
  const styleFor=id=>{
    if(!settings.has(id)){
      const next=annotationDefaults(id);
      if(id==='num')next.n=Math.min(9999,1+Math.max(0,...list.filter(a=>a.t==='num').map(a=>a.n||1)));
      settings.set(id,next);
    }
    return settings.get(id);
  };
  const ed=el('div','ann-editor');
  ed.setAttribute('role','dialog');ed.setAttribute('aria-modal','true');ed.setAttribute('aria-label','标注图片');ed.tabIndex=-1;
  const bar=el('div','ae-bar'), options=el('div','ae-options');
  const workspace=el('div','ae-workspace'), outline=el('aside','ae-outline'), entries=el('ul','ae-outline-list');
  const empty=el('p','ae-outline-empty','还没有标注'), rows=[];
  outline.setAttribute('aria-label','标注列表');
  outline.append(el('h2','ae-outline-title','标注列表'),empty,entries);
  const stage=el('div','ae-stage'), box=el('div','ae-box'), base=document.createElement('img');
  base.src=src;base.alt='原图';base.draggable=false;base.referrerPolicy='no-referrer';
  const surface=document.createElement('canvas');surface.className='ae-svg';
  const guide=document.createElement('canvas');guide.className='ae-guide';guide.setAttribute('aria-hidden','true');
  const tip=el('div','ae-tip');
  const group=(...children)=>{const g=el('div','ae-grp');g.append(...children);return g;};
  const button=(label,action,className='ae-tool')=>{
    const node=el('button',className,label);node.type='button';node.addEventListener('click',action);return node;
  };
  const tools = new Map(annotationTools.map(([id,label,key])=>{
    const b=button(label,()=>switchTool(id));b.dataset.v=id;b.title=`${label}（${key.toUpperCase()}）`;
    b.setAttribute('aria-keyshortcuts',key.toUpperCase());return [id,b];
  }));
  const undo=button('撤销',()=>history(before,after)),redo=button('重做',()=>history(after,before));
  const del=button('删除选中',()=>remove(selected));
  const clear=button('清空',()=>{remember();list=[];selected=-1;sync(true);});
  const cancel=button('取消',close,'ghost');
  const done=button('完成',()=>{
    if(textInput)textInput.blur();
    close();save(list.slice(0,300),ar);
  },'primary');
  bar.append(...toolGroups.map(ids=>group(...ids.map(id=>tools.get(id)))),el('span','an-gap'),group(undo,redo,del,clear,cancel,done));
  box.append(base,surface,guide);stage.append(box);workspace.append(outline,stage);
  ed.append(bar,options,workspace,tip);
  const focusBefore=document.activeElement;
  document.body.append(ed);
  const events = new AbortController(), {signal}=events;
  const on = (t,event,fn,opts={})=>t.addEventListener(event,fn,{...opts,signal});

  function remember(snapshot=list) {
    before.push(structuredClone(snapshot));if(before.length>100)before.shift();after.length=0;
  }
  function history(source,dest) {
    if(!source.length)return;
    dest.push(structuredClone(list));list=source.pop();draft=null;selected=-1;sync(true);
  }
  function remove(i) {
    if(i<0)return;
    remember();list.splice(i,1);
    if(selected===i)selected=-1;
    else if(selected>i)selected--;
    sync(true);
  }
  function switchTool(id,index=-1) {
    if(textInput)textInput.blur();
    tool=id;draft=null;gesture=null;selected=index;angle=[];hover=null;
    sync(true);
    if(index<0)ed.focus({preventScroll:true});
  }
  function close() {
    events.abort();cancelAnimationFrame(frame);ed.remove();focusBefore?.focus({preventScroll:true});
  }
  function updateSetting(key,value) {
    const a=list[selected], type=a?.t||tool, options=styleFor(type);
    options[key]=value;
    if(a){
      remember();
      list[selected]=itemForEdit(a);
      if(key==='n')list[selected].n=value;
      else list[selected].style={...list[selected].style,[key]:value};
    }
    sync();
  }
  function buildOptions() {
    const a=list[selected], type=a?.t||tool;
    const values=a?{...annotationDefaults(type),...itemForEdit(a).style,n:a.n}:styleFor(type);
    if(a?.t==='bubble'){
      values.textColor=a.style.textColor??a.style.c;
      values.captionSize=a.style.captionSize??a.style.fontSize??values.captionSize;
    }
    const fields=[];
    if(annotationOptions[type]?.includes('c')){
      const palette=group(...colors.map(color=>{
        const b=button('',()=>{updateSetting('c',color);options.querySelector('[name="c"]').value=color;},'ae-color');
        b.style.background=color;b.title=color;b.setAttribute('aria-label',color);return b;
      }));
      fields.push(palette);
    }
    for(const key of annotationOptions[type]||[]){
      const [label,fallback,kind,max,step]=annotationFields[key],wrap=el('label','ae-setting');
      let input;
      if(kind&&typeof kind==='object'){
        input=document.createElement('select');
        for(const [value,caption] of Object.entries(kind)){
          if(type==='filterAuto'&&value==='smart')continue;
          const option=el('option','',caption);option.value=value;input.append(option);
        }
      }else{
        input=document.createElement('input');
        input.type=typeof fallback==='boolean'?'checkbox':typeof fallback==='number'?'number':'color';
        if(input.type==='number'){input.min=kind;input.max=max;input.step=step;}
      }
      input.name=key;input.setAttribute('aria-label',label);
      if(input.type==='checkbox')input.checked=values[key]??fallback;else input.value=values[key]??fallback;
      input.addEventListener('change',()=>{
        if(input.type==='number'){
          const value=clamp(input.valueAsNumber||0,kind,max);input.value=value;updateSetting(key,value);
        } else updateSetting(key,input.type==='checkbox'?input.checked:input.value);
      });
      wrap.append(el('span','',label),input);fields.push(wrap);
    }
    if(a&&annotationText.has(a.t))fields.push(button(a.t==='num'?'编辑序号说明':'编辑文字',()=>editText(list[selected],selected)));
    options.replaceChildren(...fields);
  }
  function syncOutline() {
    empty.hidden=list.length>0;
    while(rows.length>list.length)rows.pop().item.remove();
    for(const [index,a] of list.entries()){
      if(!rows[index]){
        const item=el('li','ae-outline-row'), name=el('span','ae-outline-name'), preview=el('span','ae-outline-preview');
        const open=button('',()=>{
          switchTool('select',index);
          const current=list[index];
          if(annotationText.has(current.t))editText(current,index);
        },'ae-outline-open');
        open.append(name,preview);
        const discard=button('×',()=>{
          if(textInput)textInput.blur();
          remove(index);
          ed.focus({preventScroll:true});
        },'ae-outline-delete');
        item.append(open,discard);entries.prepend(item);
        rows.push({item,name,preview,open,discard});
      }
      const row=rows[index];
      const name=a.t==='num'?'序号 '+numeral(a.n||1,a.style?.numFormat):toolNames.get(a.t);
      const preview=(a.s||'').replace(/\s+/g,' ').trim();
      const label=preview?name+' · '+preview:name;
      row.name.textContent=name;
      row.preview.textContent=preview;
      row.preview.hidden=!preview;
      row.open.title=label;
      row.open.setAttribute('aria-pressed',String(index===selected));
      row.discard.title='删除 '+label;
      row.discard.setAttribute('aria-label',row.discard.title);
    }
  }
  function sync(rebuild=false) {
    for(const [id,b] of tools){
      b.classList.toggle('on',id===tool);b.setAttribute('aria-pressed',String(id===tool));
    }
    undo.disabled=!before.length;redo.disabled=!after.length;clear.disabled=!list.length;del.disabled=selected<0;
    box.dataset.tool=tool;
    const tips={filterAuto:'点选识别区域，或拖框一次处理多个区域。',angle:'依次点第一条边的端点、角顶点、第二条边的端点。',magnifier:'拖出要放大的范围；用选择工具可移动放大框。',text:'点一下输入文字；Shift+Enter 换行。也可以拖出文本宽度。',num:'点一下放置序号，直接输入旁边的文字说明。',select:'拖控制点缩放或旋转。Alt 从中心缩放，Shift 按固定角度旋转，Ctrl 移动时对齐。双击可编辑文字说明。',erase:'点中要删除的那一条标注。'};
    tip.textContent=textEdit?'直接在图上输入。Enter 确定，Shift+Enter 换行，Esc 取消输入。':tips[tool]||'在图上拖动。Shift 约束比例或角度，Ctrl+Z 撤销，Esc 取消。';
    if(rebuild)buildOptions();
    syncOutline();
    if(tool==='filterAuto'&&image&&!detection)recognize();
    if(list.some(usesSmartErase))refreshSmart();
    requestDraw();
  }
  function fit() {
    const r=stage.getBoundingClientRect(),w=Math.max(50,Math.min(r.width-32,(r.height-32)/ar)),h=w*ar;
    box.style.width=w+'px';box.style.height=h+'px';
    const dpr=Math.min(window.devicePixelRatio||1,2,1800/Math.max(w,h));
    const wide=Math.max(1,Math.round(w*dpr)),high=Math.max(1,Math.round(wide*ar));
    if(surface.width!==wide||surface.height!==high){surface.width=guide.width=wide;surface.height=guide.height=high;}
    requestDraw();
  }
  function widgetHandles(a) {
    const b=annotationBounds(a,ar);
    const ends=[[a.x1,a.y1,'start'],[a.x2,a.y2,'end']];
    if(a.v===2&&a.t==='arrow'&&a.style.arrowPath==='curve'){
      const x=a.x3??((a.x1+a.x2)/2-(a.y2-a.y1)*ar*.18),y=a.y3??((a.y1+a.y2)/2+(a.x2-a.x1)/ar*.18);
      return [...ends,[x,y,'bend']];
    }
    if(a.t==='angle')return [...ends,[a.x3,a.y3,'bend']];
    if(lineTools.has(a.t))return ends;
    if(a.t==='magnifier'){
      const s={...annotationDefaults(a.t),...a.style},w=Math.min(1,(b[2]-b[0])*s.zoom),h=Math.min(1,(b[3]-b[1])*s.zoom);
      const x=clamp(a.x3??(b[2]+.018),0,1-w),y=clamp(a.y3??(b[1]-(b[3]-b[1])*.35),0,1-h);
      return [[b[0],b[1],'nw'],[b[2],b[3],'se'],[x+w*.5,y+h*.5,'lens']];
    }
    return [[b[0],b[1],'nw'],[b[2],b[1],'ne'],[b[2],b[3],'se'],[b[0],b[3],'sw']];
  }
  function positionedHandles(a,b) {
    const handles=widgetHandles(a);
    if(a.v===2&&annotationRotates.has(a.t))handles.push([(b[0]+b[2])/2,b[1]-.036/ar,'rotate']);
    return handles.map(([x,y,id])=>[...rotateAnnotationPoint(x,y,b,a.rotation||0,ar),id]);
  }
  function requestDraw() {
    if(!frame)frame=requestAnimationFrame(draw);
  }
  function draw() {
    frame=0;
    let items=draft?[...list,draft]:list,liveText;
    if(textEdit){
      liveText={...textEdit.item,s:textInput.value};
      items=list.slice();
      items[textEdit.index<0?items.length:textEdit.index]=liveText;
    }
    drawAnnotations(surface,image,items,ar,smartPatches);
    const w=guide.width,h=guide.height,g=guide.getContext('2d');
    g.clearRect(0,0,w,h);g.setLineDash([6,4]);g.strokeStyle='#168dff';g.lineWidth=2;
    if(liveText){
      const first=textInput.selectionStart,last=textInput.selectionEnd;
      const {caret,selection}=annotationCaretAndSelection(g,liveText,ar,first,last,textInput.selectionDirection);
      const scale=w/1000;
      const bounds=annotationBounds(liveText,ar),rotation=liveText.rotation||0;
      const cx=(bounds[0]+bounds[2])*w/2,cy=(bounds[1]+bounds[3])*h/2;
      g.save();g.translate(cx,cy);g.rotate(rotation*Math.PI/180);g.translate(-cx,-cy);
      g.fillStyle='#1677ff45';
      for(const {x,y,w,h} of selection)g.fillRect(x*scale,y*scale,w*scale,h*scale);
      g.fillStyle='#168dff';
      g.fillRect(caret.x*scale,caret.y*scale,2,caret.h*scale);
      g.restore();
      const [left,top]=rotateAnnotationPoint(caret.x*scale/w,(caret.y+caret.h)*scale/h,bounds,rotation,ar);
      textInput.style.left=clamp(left)*100+'%';textInput.style.top=clamp(top)*100+'%';
    }else if(selected>=0){
      const a=list[selected],b=annotationBounds(a,ar);
      const rotated=(x,y)=>rotateAnnotationPoint(x,y,b,a.rotation||0,ar);
      const outline=([x,y,r,bottom])=>{
        const corners=[[x-4/w,y-4/h],[r+4/w,y-4/h],[r+4/w,bottom+4/h],[x-4/w,bottom+4/h]];
        g.beginPath();
        for(const [i,corner] of corners.entries()){
          const [px,py]=rotated(...corner);
          if(i)g.lineTo(px*w,py*h);else g.moveTo(px*w,py*h);
        }
        g.closePath();g.stroke();
      };
      outline(b);
      const caption=annotationCaptionBounds(a,ar);
      if(caption)outline(caption);
      g.setLineDash([]);g.fillStyle='#fff';
      for(const [x,y,id] of positionedHandles(a,b)){
        if(id==='rotate'){
          const [px,py]=rotated((b[0]+b[2])/2,b[1]-4/h);
          g.beginPath();g.moveTo(px*w,py*h);g.lineTo(x*w,y*h);g.stroke();
        }
        g.beginPath();g.arc(x*w,y*h,id==='rotate'?5:4,0,2*Math.PI);g.fill();g.stroke();
      }
    }
    if(tool==='filterAuto'&&hover){
      g.fillStyle='#1677ff25';
      for(const [x,y,rw,rh] of hover){g.fillRect(x*w,y*h,rw*w,rh*h);g.strokeRect(x*w,y*h,rw*w,rh*h);}
    }
    if(angle.length){
      g.beginPath();g.moveTo(angle[0].x*w,angle[0].y*h);
      if(angle[1])g.lineTo(angle[1].x*w,angle[1].y*h);
      if(gesture?.hover)g.lineTo(gesture.hover.x*w,gesture.hover.y*h);
      g.stroke();
    }
  }
  function local(e) {
    const r=box.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height),pressure:e.pointerType==='pen'?e.pressure:.5};
  }
  function recognize() {
    tip.textContent='正在识别可标注的区域…';
    detection=detectRegions(image);
    detection.then(found=>{
      if(!ed.isConnected)return;
      regions=found;
      if(tool==='filterAuto')tip.textContent=regions.length?'点选识别区域，或拖框一次处理多个区域。':'原图没有识别到可处理的区域。';
    },error=>{
      detection=null;
      if(ed.isConnected&&tool==='filterAuto')tip.textContent=error.message;
    });
  }
  function refreshSmart() {
    if(!image)return;
    const revision=++smartRevision;
    prepareSmartErase(image,list,ar).then(patches=>{
      if(revision===smartRevision&&ed.isConnected){smartPatches=patches;requestDraw();}
    },error=>{
      if(revision===smartRevision&&ed.isConnected)tip.textContent=error.message;
    });
  }
  function at(item,p) {
    if(item.t==='filterAuto')return item.regions.some(([x,y,w,h])=>inBox(p,[x,y,x+w,y+h],.008));
    const b=annotationBounds(item,ar),[x,y]=rotateAnnotationPoint(p.x,p.y,b,-(item.rotation||0),ar);
    const caption=annotationCaptionBounds(item,ar);
    return inBox({x,y},b,.012)||(caption&&inBox({x,y},caption,.006));
  }
  function editText(a,idx=-1) {
    if(textInput)textInput.blur();
    if(idx<0&&list.length>=300){tip.textContent='已到 300 条标注，请先删除一条。';return;}
    const input=el('textarea','ae-text-input');
    textInput=input;textEdit={item:itemForEdit(a),index:idx};
    input.value=a.s||'';input.maxLength=2000;
    input.style.left=a.x1*100+'%';input.style.top=a.y1*100+'%';
    input.setAttribute('aria-label',a.t==='num'?'序号文字说明':'标注文字');
    box.append(input);
    const finish=(commit,focus)=>{
      if(textInput!==input)return;
      const value=input.value.trim(), item=textEdit.item;
      textInput=null;textEdit=null;input.remove();
      if(idx<0&&((commit&&value)||item.t==='num')){
        remember();list.push(commit&&value?{...item,s:value}:item);
        if(item.t==='num'){
          styleFor('num').n=Math.min(9999,item.n+1);
          options.querySelector('[name="n"]').value=styleFor('num').n;
        }
      }else if(idx>=0&&commit&&value!==(a.s||'')){
        remember();list[idx]={...item,s:value};
      }
      sync();if(focus)ed.focus({preventScroll:true});
    };
    on(input,'keydown',e=>{
      if(e.isComposing)return;
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish(true,true);}
      if(e.key==='Escape'){e.preventDefault();finish(false,true);}
    });
    for(const e of ['input','compositionupdate','selectionchange','keyup','select'])on(input,e,requestDraw);
    on(input,'blur',()=>finish(true,false));
    input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);
    sync();
  }
  function newItem(tool,p) {
    const style={...styleFor(tool)},item={v:2,t:tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,style};
    if(annotationPen.has(tool))item.pts=[[p.x,p.y,p.pressure]];
    return item;
  }
  function add(a) {
    if(list.length>=300){tip.textContent='已到 300 条标注，请先删除一条。';return;}
    remember();list.push(a);selected=-1;sync(true);
  }
  function regionsAt(a,b) {
    if(Math.hypot(a.x-b.x,a.y-b.y)<.012){
      const first=regions.find(([x,y,w,h])=>inBox(b,[x,y,x+w,y+h]));
      return first?[first]:[];
    }
    const [x,y,r,bottom]=ordered(a,b);
    return regions.filter(([rx,ry,rw,rh])=>rw*rh<.98&&rx<r&&rx+rw>x&&ry<bottom&&ry+rh>y).slice(0,100);
  }
  function shiftItem(a,fn) {
    const copy={...a};
    for(const n of [1,2,3])if(copy['x'+n]!=null&&copy['y'+n]!=null)[copy['x'+n],copy['y'+n]]=fn(copy['x'+n],copy['y'+n]);
    if(copy.pts)copy.pts=copy.pts.map(([x,y,p])=>[...fn(x,y),p??.5]);
    if(copy.regions)copy.regions=copy.regions.map(([x,y,w,h])=>{const a=fn(x,y),b=fn(x+w,y+h);return [a[0],a[1],b[0]-a[0],b[1]-a[1]];});
    return copy;
  }
  function moveSelection(p,{shiftKey:shift,altKey:alt,ctrlKey:align}) {
    const {point:o,original:a,handle,bounds:b}=gesture;
    const [x,y,r,bottom]=b,cx=(x+r)/2,cy=(y+bottom)/2;
    const rotation=a.rotation||0;
    if(handle==='rotate'){
      const angleFor=q=>Math.atan2((q.y-cy)*ar,q.x-cx);
      let angle=rotation+(angleFor(p)-angleFor(o))*180/Math.PI;
      if(shift)angle=Math.round(angle/15)*15;
      list[selected]={...a,rotation:((angle+540)%360)-180};return;
    }
    if(!handle){
      let dx=p.x-o.x,dy=p.y-o.y;
      if(align){
        const items=list.filter((_,i)=>i!==selected).map(item=>annotationBounds(item,ar));
        const nearest=(delta,left,right,min,max,limit)=>{
          let shift=0,best=limit;
          for(const rect of items){
            for(const source of [left,(left+right)/2,right])for(const target of [rect[min],(rect[min]+rect[max])/2,rect[max]]){
              const offset=target-source-delta;
              if(Math.abs(offset)<best){best=Math.abs(offset);shift=offset;}
            }
          }
          return delta+shift;
        };
        dx=nearest(dx,x,r,0,2,.012);dy=nearest(dy,y,bottom,1,3,.012/ar);
      }
      const visible=[[x,y],[x,bottom],[r,y],[r,bottom]].map(([l,t])=>rotateAnnotationPoint(l,t,b,rotation,ar));
      dx=clamp(dx,-Math.min(...visible.map(q=>q[0])),1-Math.max(...visible.map(q=>q[0])));
      dy=clamp(dy,-Math.min(...visible.map(q=>q[1])),1-Math.max(...visible.map(q=>q[1])));
      list[selected]=shiftItem(a,(x,y)=>[x+dx,y+dy]);return;
    }
    [p.x,p.y]=rotateAnnotationPoint(p.x,p.y,b,-rotation,ar);
    if(handle==='start'||handle==='end'||handle==='bend'){
      const n={start:1,end:2,bend:3}[handle],other=n===1?2:1;
      if(shift&&n!==3&&lineTools.has(a.t)){
        const x=a['x'+other],y=a['y'+other];
        const dx=p.x-x,dy=(p.y-y)*ar,len=Math.hypot(dx,dy),angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;
        p.x=x+Math.cos(angle)*len;p.y=y+Math.sin(angle)*len/ar;
      }
      list[selected]={...a,['x'+n]:clamp(p.x),['y'+n]:clamp(p.y)};
    }else if(handle==='lens'){
      list[selected]={...a,x3:clamp((a.x3??(r+.018))+p.x-o.x),y3:clamp((a.y3??y)+p.y-o.y)};return;
    }else{
      const w=Math.max(.01,r-x),h=Math.max(.01,bottom-y);
      const left=handle.endsWith('w'),top=handle.startsWith('n');
      const px=alt?cx:left?r:x,py=alt?cy:top?bottom:y,m=alt?.5:1;
      const sx=clamp((p.x-px)/(m*(left?-w:w)),.05,100),sy=clamp((p.y-py)/(m*(top?-h:h)),.05,100);
      list[selected]=shiftItem(a,(x,y)=>[clamp(px+(x-px)*sx),clamp(py+(y-py)*(shift?sx:sy))]);
      if(a.t==='text'||a.t==='num')list[selected].style={...itemForEdit(a).style,fontSize:clamp(itemForEdit(a).style.fontSize*sx,8,150)};
    }
    if(rotation){
      const changed=list[selected],[l,t,r,b]=annotationBounds(changed,ar),x=(l+r)/2,y=(t+b)/2;
      const [nx,ny]=rotateAnnotationPoint(x,y,gesture.bounds,rotation,ar);
      list[selected]=shiftItem(changed,(px,py)=>[clamp(px+nx-x),clamp(py+ny-y)]);
    }
  }
  function updateDraft(p,e) {
    if(draft.pts){
      const pts=gesture.points;
      pts.push([p.x,p.y,p.pressure]);
      if(pts.length>600)pts.splice(pts.length-2,1);
      draft.pts=e.shiftKey?[pts[0],pts.at(-1)]:pts;
      return;
    }
    const anchor=gesture.point;
    let x=p.x,y=p.y;
    if(e.shiftKey){
      const dx=x-anchor.x,dy=(y-anchor.y)*ar;
      if(lineTools.has(draft.t)){
        const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,len=Math.hypot(dx,dy);
        x=anchor.x+Math.cos(a)*len;y=anchor.y+Math.sin(a)*len/ar;
      } else {
        const len=Math.max(Math.abs(dx),Math.abs(dy));x=anchor.x+Math.sign(dx)*len;y=anchor.y+Math.sign(dy)*len/ar;
      }
    }
    const fromCenter=e.altKey&&centeredShapes.has(draft.t);
    draft.x1=fromCenter?clamp(2*anchor.x-x):anchor.x;
    draft.y1=fromCenter?clamp(2*anchor.y-y):anchor.y;
    draft.x2=clamp(x);draft.y2=clamp(y);
  }

  on(surface,'pointerdown',e=>{
    if(e.button!==0)return;
    e.preventDefault();
    const p=local(e);
    if(textInput){
      const a={...textEdit.item,s:textInput.value},b=annotationBounds(a,ar);
      const [x,y]=rotateAnnotationPoint(p.x,p.y,b,-(a.rotation||0),ar);
      const textBox=annotationCaptionBounds({...a,s:a.s||' '},ar)||(a.t==='text'?b:null);
      if(textBox&&inBox({x,y},textBox,.008)){
        const at=annotationTextOffset(guide.getContext('2d'),a,ar,x,y);
        textInput.setSelectionRange(at,at);requestDraw();return;
      }
      textInput.blur();
    }
    if(tool==='select'||tool==='erase'){
      const hit=list.findLastIndex(a=>at(a,p));
      if(tool==='erase'){remove(hit);return;}
      const old=list[selected];
      const handle=old&&positionedHandles(old,annotationBounds(old,ar)).find(([x,y])=>Math.hypot(x-p.x,(y-p.y)*ar)<.014)?.[2];
      if(!handle)selected=hit;
      if(selected>=0){
        const a=list[selected];gesture={point:p,original:structuredClone(a),bounds:annotationBounds(a,ar),handle,changed:false};
        surface.setPointerCapture(e.pointerId);
      }
      sync(true);
      if(selected>=0)rows[selected].item.scrollIntoView({block:'nearest'});
      return;
    }
    if(tool==='num'){
      editText({...newItem(tool,p),n:styleFor(tool).n});return;
    }
    if(tool==='watermark'){editText(newItem(tool,p));return;}
    if(tool==='angle'){
      angle.push(p);
      if(angle.length===3){
        const [a,b,c]=angle;
        add({...newItem('angle',a),x2:b.x,y2:b.y,x3:c.x,y3:c.y});angle=[];gesture=null;
      }
      requestDraw();return;
    }
    gesture={point:p};surface.setPointerCapture(e.pointerId);
    if(tool==='filterAuto'){hover=regionsAt(p,p);requestDraw();return;}
    draft=newItem(tool,p);gesture.points=draft.pts;requestDraw();
  });
  on(surface,'pointermove',e=>{
    const p=local(e);
    if(tool==='angle'&&angle.length){gesture={hover:p};requestDraw();return;}
    if(tool==='filterAuto'){hover=regionsAt(gesture?.point||p,p);requestDraw();return;}
    if(tool==='select'&&gesture&&selected>=0){
      if(Math.hypot(p.x-gesture.point.x,(p.y-gesture.point.y)*ar)<.002&&!gesture.changed)return;
      gesture.changed=true;moveSelection(p,e);requestDraw();return;
    }
    if(draft){updateDraft(p,e);requestDraw();}
  });
  on(surface,'pointerleave',()=>{if(!gesture&&hover){hover=null;requestDraw();}});
  const end=e=>{
    const p=local(e),previous=gesture;
    const cancel=e.type==='pointercancel';
    if(draft&&!cancel)updateDraft(p,e);
    gesture=null;
    if(tool==='select'&&previous?.changed&&selected>=0){
      const a=list[selected];list[selected]=previous.original;
      if(!cancel){remember();list[selected]=a;}
    }
    if(!cancel&&tool==='filterAuto'&&previous){
      const hit=regionsAt(previous.point,p);
      if(hit.length)add({...newItem(tool,p),regions:hit});hover=null;
    }
    if(draft){
      const a=draft;draft=null;
      if(!cancel){
        if(a.t==='text'||a.t==='bubble'){
          if(a.t==='text'&&a.x2<a.x1)[a.x1,a.x2]=[a.x2,a.x1];
          if(a.t==='bubble'&&Math.hypot(a.x2-a.x1,a.y2-a.y1)<.012){a.x2=clamp(a.x1+.18);a.y2=clamp(a.y1+.10);}
          editText(a);
        }else if(a.pts||Math.hypot(a.x2-a.x1,a.y2-a.y1)>.004)add(a);
      }
    }
    sync();
  };
  on(surface,'pointerup',end);on(surface,'pointercancel',end);
  on(entries,'pointerdown',e=>{
    if(textInput&&e.button===0&&e.target.closest('button'))e.preventDefault();
  });
  on(surface,'dblclick',e=>{
    if(!textInput&&tool==='select'&&selected>=0&&annotationText.has(list[selected].t)){e.preventDefault();editText(list[selected],selected);}
  });
  on(document,'keydown',e=>{
    if(e.isComposing||e.target===textInput)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(angle.length){angle=[];requestDraw();}else close();return;}
    if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName))return;
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){
      e.preventDefault();e.stopPropagation();
      if(e.shiftKey||e.key.toLowerCase()==='y')history(after,before);else history(before,after);return;
    }
    if((e.key==='Delete'||e.key==='Backspace')&&selected>=0){e.preventDefault();e.stopPropagation();remove(selected);return;}
    if(e.ctrlKey||e.metaKey||e.altKey||draft||(gesture&&!gesture.hover))return;
    const id=toolByKey.get(e.key.toLowerCase());
    if(id){e.preventDefault();e.stopPropagation();switchTool(id);}
  },{capture:true});
  on(window,'resize',fit);
  const stageSize=new ResizeObserver(fit);
  stageSize.observe(stage);
  signal.addEventListener('abort',()=>stageSize.disconnect(),{once:true});
  on(base,'load',()=>{if(!image){ar=base.naturalHeight/base.naturalWidth;fit();}});
  readImage().then(bitmap=>{
    if(!ed.isConnected){bitmap.close();return;}
    image=bitmap;base.style.visibility='hidden';ar=image.height/image.width;fit();refreshSmart();
    if(tool==='filterAuto'&&!detection)recognize();
    signal.addEventListener('abort',()=>image.close(),{once:true});
  },()=>{
    if(ed.isConnected)tip.textContent='原图无法读取。可以添加矢量标注，像素滤镜需等原图可读取后使用。';
  });
  fit();sync(true);ed.focus({preventScroll:true});
}
