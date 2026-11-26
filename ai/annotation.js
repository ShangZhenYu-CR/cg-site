export const annotationTools = [
  ['select','选择','v'], ['arrow','箭头','a'], ['line','直线','l'], ['rect','方框','r'], ['ellipse','椭圆','e'],
  ['bubble','气泡','q'], ['pen','画笔','b'], ['text','文字','t'], ['num','序号','n'],
  ['highlight','区域高亮','h'], ['penHighlight','高亮笔','j'], ['distance','量距','d'], ['angle','量角','g'],
  ['bracket','括号','k'], ['magnifier','放大镜','m'], ['spotlight','聚光','s'], ['watermark','水印','w'],
  ['filterRect','区域滤镜','f'], ['filterPen','滤镜笔','p'], ['filterAuto','区域识别','u'],
  ['erase','删除标注','x'], ['eraseRect','区域橡皮','c'], ['erasePen','橡皮笔','o'],
];

const heads = {none:'无',arrow:'箭头',bar:'竖线',dot:'圆点',circle:'圆',circleOutline:'空心圆',triangle:'实心三角',triangleOutline:'空心三角',diamond:'实心菱形',diamondOutline:'空心菱形',crowfootOne:'一',crowfootMany:'鸟爪',crowfootOneOrMany:'一或多',indentedTriangle:'凹尾三角'};
const shapes = {rect:'方框',ellipse:'椭圆',diamond:'菱形',thought:'思考气泡'};
const filters = {mosaic:'马赛克',blur:'高斯模糊',smart:'智能擦除',gray:'黑白',invert:'反相',emboss:'浮雕',brightness:'亮度',restore:'还原背景'};
const colors = {
  c:['描边 / 文字','#f5222d'], fill:['填充色','#ffccc7'], outline:['箭头描边','#ffccc7'],
  textColor:['注释颜色','#f5222d'],
};
const ranges = {
  lw:['线宽',2,0.5,120,0.5], opacity:['不透明度',1,0,1,0.05], radius:['圆角',6,0,100,1],
  headScale:['箭头大小',1,0.3,4,0.1], outlineWidth:['箭头描边宽度',0,0,16,0.5],
  fontSize:['字号',30,8,150,1], captionSize:['注释字号',30,8,150,1], lengthScale:['比例',1,0.01,1000,0.01], decimals:['小数位',0,0,5,1],
  zoom:['放大倍率',2,1,8,0.1], strength:['强度',0.5,0,1,0.05], tilt:['角度',30,-90,90,1], gap:['间隔',56,10,240,1],
  n:['起始 / 当前编号',1,1,9999,1],
};
const choices = {
  dash:['线型','solid',{solid:'实线',dash:'虚线',dot:'点线'}],
  fillMode:['填充','border',{border:'仅描边',solid:'纯色',hatch:'斜线',cross:'交叉线'}],
  shape:['形状','rect',shapes], arrowPath:['路线','curve',{line:'直线',curve:'曲线',elbow:'折线'}],
  start:['起点','none',heads], end:['终点','arrow',heads], shaft:['箭杆','plain',{plain:'等宽',taper:'渐细'}],
  brush:['笔尖','regular',{regular:'常规',pressure:'压感'}],
  family:['字体','sans-serif',{'sans-serif':'无衬线',serif:'衬线',monospace:'等宽','Microsoft YaHei':'微软雅黑','SimSun':'宋体','Arial':'Arial'}],
  align:['对齐','left',{left:'左',center:'居中',right:'右'}],
  valign:['垂直对齐','middle',{top:'顶部',middle:'居中',bottom:'底部'}],
  numShape:['序号样式','circle-outline',{ 'circle-outline':'空心圆','circle-solid':'实心圆','square-outline':'空心方框','square-solid':'实心方框',plain:'纯数字'}],
  numFormat:['编号格式','arabic',{arabic:'数字',roman:'罗马数字',lower:'小写字母',upper:'大写字母',chinese:'中文数字'}],
  unit:['标注单位','px',{px:'像素',cm:'厘米',mm:'毫米',m:'米',in:'英寸',ft:'英尺'}],
  filter:['效果','mosaic',filters],
  connector:['放大镜连线','gradient',{none:'无',line:'引线',gradient:'渐变'}],
  strokeEffect:['笔触','architect',{architect:'规整',artist:'手绘',cartoon:'卡通'}],
};
const flags = {bold:['粗体',false],italic:['斜体',false],sourceOutline:['源区域边框',true]};
export const annotationFields = {...colors,...ranges,...choices,...flags};

const lineStyle = ['c','lw','dash','opacity','strokeEffect'];
const shapeStyle = [...lineStyle,'fill','fillMode','radius','shape'];
const textStyle = ['c','fontSize','family','bold','italic','align','valign','opacity','fill','fillMode','radius'];
const captionStyle = ['textColor','captionSize','family','bold','italic'];
const filterStyle = ['filter','strength','opacity'];
export const annotationOptions = {
  arrow:[...lineStyle,'arrowPath','start','end','headScale','shaft','outline','outlineWidth',...captionStyle,'align'],
  line:[...lineStyle,'start','end','headScale',...captionStyle,'align'],
  rect:[...shapeStyle,...captionStyle,'align','valign'], ellipse:[...shapeStyle,...captionStyle,'align','valign'], bubble:[...shapeStyle,...captionStyle,'align','valign'],
  pen:[...lineStyle,'brush'], penHighlight:['c','lw','opacity','brush'],
  text:textStyle, num:['n','numShape','numFormat','c','fill','fillMode','fontSize','lw','dash','opacity',...captionStyle],
  distance:[...lineStyle,'lengthScale','unit','decimals','start','end','headScale'],
  angle:[...lineStyle,'decimals'], bracket:lineStyle,
  highlight:['c','opacity','shape','radius'], spotlight:['c','opacity','shape','radius'],
  magnifier:[...lineStyle,'shape','radius','zoom','connector','sourceOutline','end','headScale'],
  filterRect:[...filterStyle,'shape','radius'], filterPen:[...filterStyle,'lw'],
  filterAuto:filterStyle, eraseRect:['shape','radius'], erasePen:['lw'],
  watermark:['c','fontSize','family','bold','italic','opacity','tilt','gap'],
};
export const annotationPen = new Set(['pen','penHighlight','filterPen','erasePen']);
export const annotationText = new Set(['text','bubble','watermark','num','arrow','line','rect','ellipse']);
export const annotationRotates = new Set(['rect','ellipse','bubble','highlight','text','num','pen','penHighlight','arrow','line','distance','angle','bracket']);

export function annotationSignature(items) {
  return JSON.stringify(items.map(a=>{
    if(a.v===2){
      const {v,t,x1,y1,x2,y2,x3,y3,pts,s,n,regions,rotation,style}=a;
      return {v,t,x1,y1,x2,y2,x3,y3,pts,s,n,regions,rotation,style:Object.entries(style).sort(([x],[y])=>x.localeCompare(y))};
    }
    return [a.t,a.x1||0,a.y1||0,a.x2||0,a.y2||0,a.pts||[],a.s||'',a.c||'',a.lw||1,a.n||1];
  }));
}

export function annotationDefaults(tool) {
  const settings = Object.fromEntries((annotationOptions[tool] || []).map(k => [k,annotationFields[k][1]]));
  if (tool === 'ellipse') settings.shape = 'ellipse';
  if (tool === 'bubble') settings.fillMode = 'solid';
  if (tool === 'num') settings.fontSize = 24;
  if (tool === 'line') settings.end = 'none';
  if (tool === 'distance') { settings.start = 'bar'; settings.end = 'bar'; }
  if (tool === 'magnifier') settings.end = 'none';
  if (tool === 'spotlight') { settings.c = '#000000'; settings.opacity = 0.64; }
  if (tool === 'highlight' || tool === 'penHighlight') { settings.c = '#ffdf35'; settings.opacity = 0.45; }
  if (annotationPen.has(tool) && tool !== 'pen') settings.lw = 30;
  if (tool === 'watermark') { settings.c = '#000000'; settings.fontSize = 16; settings.opacity = 0.16; }
  return settings;
}

const W = 1000;
const lerp = (a,b,t) => a + (b-a)*t;
const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const cap = (x,min,max) => Math.min(max,Math.max(min,x));
const cssFont = s => `${s.italic?'italic ':''}${s.bold?'bold ':''}${s.fontSize}px ${s.family}`;

export function numeral(n, format) {
  if (format === 'roman') {
    let text = '';
    for (const [value, symbol] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) {
      text += symbol.repeat(Math.floor(n/value)); n %= value;
    }
    return text;
  }
  if (format === 'upper' || format === 'lower') {
    let text = '';
    for (; n; n=Math.floor((n-1)/26)) text=String.fromCharCode((format==='upper'?65:97)+(n-1)%26)+text;
    return text;
  }
  if (format !== 'chinese') return String(n);
  const digits = '零一二三四五六七八九', powers = ['','十','百','千'];
  let text = '', zero = false;
  [...String(n)].forEach((s,i,a) => {
    const d = Number(s), power = a.length-i-1;
    if (!d) { zero = !!text; return; }
    if (zero) text += digits[0];
    text += (d===1&&power===1&&!text?'':digits[d])+powers[power];
    zero = false;
  });
  return text;
}

export function annotationBounds(a, ar) {
  if (a.regions?.length) {
    return [
      Math.min(...a.regions.map(r=>r[0])),Math.min(...a.regions.map(r=>r[1])),
      Math.max(...a.regions.map(r=>r[0]+r[2])),Math.max(...a.regions.map(r=>r[1]+r[3])),
    ];
  }
  if (a.pts?.length) {
    const xs = a.pts.map(p=>p[0]), ys = a.pts.map(p=>p[1]);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  }
  const x = a.x1, y = a.y1;
  if (a.v===2 && a.t==='text') {
    const p=annotationTextLayout(layoutContext(),a,ar);
    return [p.x/W,p.y/(W*ar),(p.x+p.width)/W,(p.y+p.height)/(W*ar)];
  }
  if (a.t === 'num' || a.t === 'text' || a.t === 'watermark') {
    const s = a.v===2 ? {...annotationDefaults(a.t),...a.style} : {fontSize:22+(a.lw||4)*4,numFormat:'arabic'};
    if (a.t==='num') {
      const r = a.v===2 ? numberRadius(layoutContext(),a,s)/W : (16+(a.lw||4)*2)/W;
      return [x-r,y-r/ar,x+r,y+r/ar];
    }
    const width = Math.max(0.035,...String(a.s||'').split('\n').map(t=>
      [...t].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:.61),0)*s.fontSize/W));
    return [x,y-(a.v===2?0:s.fontSize/W/ar),a.x2>x?a.x2:x+width,y+s.fontSize*1.25/W/ar];
  }
  const xs = [x,a.x2],ys = [y,a.y2];
  if (a.x3 != null) { xs.push(a.x3); ys.push(a.y3); }
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}

export function annotationCaptionBounds(a,ar) {
  if(a.v!==2 || !a.s || !annotationText.has(a.t) || a.t==='text' || a.t==='watermark')return null;
  const p=annotationTextLayout(layoutContext(),a,ar),H=W*ar;
  return [p.x/W,p.y/H,(p.x+p.width)/W,(p.y+p.height)/H];
}

export function rotateAnnotationPoint(x,y,bounds,rotation,ar) {
  const [left,top,right,bottom]=bounds,cx=(left+right)/2,cy=(top+bottom)/2;
  const angle=rotation*Math.PI/180,dx=x-cx,dy=(y-cy)*ar,cos=Math.cos(angle),sin=Math.sin(angle);
  return [cx+dx*cos-dy*sin,cy+(dx*sin+dy*cos)/ar];
}

function boxOf(a,H) {
  const x=Math.min(a.x1,a.x2)*W,y=Math.min(a.y1,a.y2)*H;
  return [x,y,Math.abs(a.x2-a.x1)*W,Math.abs(a.y2-a.y1)*H];
}
function shapePath([x,y,w,h],shape,radius = 0) {
  const p=new Path2D();
  if (shape==='ellipse') p.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
  else if (shape==='diamond') {
    p.moveTo(x+w/2,y);p.lineTo(x+w,y+h/2);p.lineTo(x+w/2,y+h);p.lineTo(x,y+h/2);p.closePath();
  } else if (shape==='thought') {
    const tail=Math.min(w,h)*.17;
    p.ellipse(x+w/2,y+h*.44,w/2,h*.44,0,0,Math.PI*2);
    p.moveTo(x+w*.29+tail*.36,y+h*.91);p.ellipse(x+w*.29,y+h*.91,tail*.36,tail*.29,0,0,Math.PI*2);
    p.moveTo(x+w*.21+tail*.2,y+h*.99);p.ellipse(x+w*.21,y+h*.99,tail*.2,tail*.17,0,0,Math.PI*2);
  } else p.roundRect(x,y,w,h,Math.min(radius,w/2,h/2));
  return p;
}

function fillPath(ctx,p,s) {
  if (s.fillMode === 'border') return;
  ctx.fillStyle=s.fill;
  if (s.fillMode === 'solid') { ctx.fill(p); return; }
  const tile=document.createElement('canvas'); tile.width=12;tile.height=12;
  const line=tile.getContext('2d'),l=(x0,y0,x1,y1)=>{line.moveTo(x0,y0);line.lineTo(x1,y1);};
  line.strokeStyle=s.fill;line.lineWidth=1.6;
  l(-6,6,6,-6);l(0,12,12,0);l(6,18,18,6);
  if(s.fillMode==='cross'){l(0,0,12,12);l(-6,6,6,18);l(6,-6,18,6);}
  line.stroke();
  ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.fill(p);
}
function strokeStyle(ctx,s) {
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.lw;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(s.dash==='dash'?[s.lw*4,s.lw*2.5]:s.dash==='dot'?[s.lw*.3,s.lw*2.4]:[]);
}
function strokePath(ctx,p,s) {
  if (s.strokeEffect==='artist') {ctx.save();ctx.translate(.75,.55);ctx.globalAlpha*=.45;ctx.stroke(p);ctx.restore();}
  if (s.strokeEffect==='cartoon') {ctx.save();ctx.strokeStyle='#221b1b';ctx.lineWidth+=2;ctx.stroke(p);ctx.restore();}
  ctx.stroke(p);
}
function drawHead(ctx,tip,prev,kind,s,size) {
  if (kind==='none') return;
  ctx.save(); ctx.translate(...tip);ctx.rotate(Math.atan2(tip[1]-prev[1],tip[0]-prev[0]));
  ctx.setLineDash([]);
  const p=new Path2D(), z=size, w=z*.46;
  const vertices=pts=>{p.moveTo(...pts[0]);for(const q of pts.slice(1))p.lineTo(...q);};
  if (kind==='bar') vertices([[0,-w],[0,w]]);
  else if (kind==='dot'||kind==='circle'||kind==='circleOutline') p.arc(-w,0,kind==='dot'?w*.55:w,0,Math.PI*2);
  else if (kind.startsWith('diamond')) {vertices([[0,0],[-w,w],[-z,0],[-w,-w]]);p.closePath();}
  else if(kind.startsWith('crowfoot')) {
    if(kind!=='crowfootMany') vertices([[-w,-w],[-w,w]]);
    if(kind!=='crowfootOne'){vertices([[0,-w],[-z,0],[0,w]]);vertices([[-z,0],[0,0]]);}
  } else {
    vertices([[-z,-w],[0,0],[-z,w]]);
    if(kind==='indentedTriangle') {p.lineTo(-z*.65,0);p.closePath();}
    else if(kind!=='arrow') p.closePath();
  }
  const solid=['dot','circle','triangle','diamond','indentedTriangle'].includes(kind);
  if (s.outlineWidth) {ctx.save();ctx.lineWidth+=s.outlineWidth*2;ctx.strokeStyle=s.outline;ctx.stroke(p);ctx.restore();}
  if(solid)ctx.fill(p);else ctx.stroke(p);
  ctx.restore();
}

function arrowPoints(a,s,H) {
  const p=[a.x1*W,a.y1*H],q=[a.x2*W,a.y2*H];
  if(a.t!=='arrow'||s.arrowPath==='line')return [p,q];
  if(s.arrowPath==='elbow') {
    const mx=(p[0]+q[0])/2;
    return [p,[mx,p[1]],[mx,q[1]],q].filter((b,i,list)=>!i||dist(b,list[i-1])>0.01);
  }
  const b=a.x3==null ? [(p[0]+q[0])/2-(q[1]-p[1])*.18,(p[1]+q[1])/2+(q[0]-p[0])*.18] : [a.x3*W,a.y3*H];
  return [p,...Array.from({length:15},(_,i)=>{const t=(i+1)/16,v=1-t;return p.map((x,j)=>v*v*x+2*v*t*b[j]+t*t*q[j]);}),q];
}
function drawLine(ctx,a,s,H) {
  const points=arrowPoints(a,s,H),first=points[0],last=points.at(-1);
  if(points.length<2||dist(first,last)<.01)return;
  const p=new Path2D();p.moveTo(...first);points.slice(1).forEach(q=>p.lineTo(...q));
  if(s.outlineWidth){ctx.save();ctx.strokeStyle=s.outline;ctx.lineWidth+=s.outlineWidth*2;ctx.stroke(p);ctx.restore();}
  if(s.shaft==='taper'){
    ctx.setLineDash([]);
    points.slice(1).forEach((q,i)=>{ctx.beginPath();ctx.lineWidth=s.lw*lerp(1,.28,i/(points.length-1));ctx.moveTo(...points[i]);ctx.lineTo(...q);ctx.stroke();});
    ctx.lineWidth=s.lw;
  } else strokePath(ctx,p,s);
  const size=Math.min(dist(first,last)*.4,(9+s.lw*2.1)*(s.headScale||1));
  drawHead(ctx,first,points[1],s.start||'none',s,size);
  drawHead(ctx,last,points.at(-2),s.end||'none',s,size);
}

function brushPath(points,H) {
  const p=new Path2D(),[a,...rest]=points;
  if (!a) return p;
  p.moveTo(a[0]*W,a[1]*H);
  for (let i=0;i<rest.length-1;i++) {
    const b=rest[i],c=rest[i+1];p.quadraticCurveTo(b[0]*W,b[1]*H,(b[0]+c[0])*W/2,(b[1]+c[1])*H/2);
  }
  const end=rest.at(-1)||a;p.lineTo(end[0]*W+.01,end[1]*H);return p;
}
function brush(ctx,a,s,H) {
  if (s.brush!=='pressure') {strokePath(ctx,brushPath(a.pts,H),s);return;}
  for (const [i,q] of a.pts.entries()) {
    const p=a.pts[Math.max(0,i-1)];ctx.beginPath();ctx.lineWidth=s.lw*(.24+1.5*(p[2]+q[2])/2);
    ctx.moveTo(p[0]*W,p[1]*H);ctx.lineTo(q[0]*W+.01,q[1]*H);ctx.stroke();
  }
}

let textMetrics;
const layoutContext=()=>textMetrics||=document.createElement('canvas').getContext('2d');
function textLines(ctx,text,width) {
  const rows=[];
  let cursor=0,start=0,value='';
  const add=()=>rows.push({value,start,end:cursor,width:ctx.measureText(value).width});
  for(const c of text){
    if(c==='\n'||(value&&width&&ctx.measureText(value+c).width>width)){
      add();value='';
      if(c==='\n'){cursor++;start=cursor;continue;}
      start=cursor;
    }
    value+=c;cursor+=c.length;
  }
  add();
  return rows;
}
function numberRadius(ctx,a,s) {
  ctx.font=cssFont({...s,bold:true});
  return Math.max(s.fontSize*.7,ctx.measureText(numeral(a.n||1,s.numFormat)).width*.5+5);
}
export function annotationTextLayout(ctx,a,ar) {
  const H=W*ar,s={...annotationDefaults(a.t),...a.style};
  const style={...annotationDefaults('text'),...s};
  if(a.t!=='text'&&a.t!=='watermark'){
    style.c=a.t==='bubble'?(a.style.textColor??s.c):s.textColor;
    style.fontSize=a.t==='bubble'?(a.style.captionSize??a.style.fontSize??s.captionSize):s.captionSize;
  }
  if(a.t==='num')style.align='left';
  const frame=['rect','ellipse','bubble'].includes(a.t)?boxOf(a,H):null;
  const path=(a.t==='arrow'||a.t==='line')?arrowPoints(a,s,H):null;
  const anchor=path?.[Math.floor(path.length/2)];
  const maxWidth=frame?Math.max(1,frame[2]-12):a.t==='text'&&a.x2>a.x1?(a.x2-a.x1)*W:0;
  const r=a.t==='num'?numberRadius(ctx,a,s):0;
  ctx.font=cssFont(style);
  const rows=textLines(ctx,a.s||'',maxWidth),lineH=style.fontSize*1.22;
  const width=maxWidth||Math.max(1,...rows.map(row=>row.width)),height=lineH*rows.length;
  let x=frame?frame[0]+6:a.x1*W,y=frame?frame[1]+5:a.y1*H;
  if(frame&&style.valign!=='top')y+=Math.max(0,frame[3]-10-height)*(style.valign==='middle'?.5:1);
  if(a.t==='num'){
    const gap=Math.max(style.fontSize*.24,6,s.lw*2);
    x+=r+gap;y-=height/2;
  }
  if(path){
    const x0=path.length===2?(path[0][0]+path[1][0])/2:anchor[0];
    const y0=path.length===2?(path[0][1]+path[1][1])/2:anchor[1];
    x=x0-width/2;y=y0-height-5;
  }
  for(const [i,row] of rows.entries()){
    row.x=x+(style.align==='center'?(width-row.width)/2:style.align==='right'?width-row.width:0);
    row.y=y+i*lineH;
  }
  return {x,y,width,height,lineH,rows,style};
}
function drawText(ctx,a,ar) {
  const {style,rows,x,y,width,height}=annotationTextLayout(ctx,a,ar);
  if(a.t==='text'&&style.fillMode!=='border')fillPath(ctx,shapePath([x-5,y-3,width+10,height+6],'rect',style.radius),style);
  ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle=style.c;
  for(const row of rows)ctx.fillText(row.value,row.x,row.y);
}
export function annotationCaretAndSelection(ctx,a,ar,start,end,direction) {
  const {rows,lineH}=annotationTextLayout(ctx,a,ar);
  const index=direction==='backward'?start:end;
  const caretRow=rows.findLast(row=>row.start<=index)||rows[0];
  const offset=(row,at)=>ctx.measureText(row.value.slice(0,Math.max(0,at-row.start))).width;
  const caret={x:caretRow.x+offset(caretRow,index),y:caretRow.y,h:lineH};
  const selection=[];
  if(start!==end){
    for(const row of rows){
      const from=Math.max(start,row.start),to=Math.min(end,row.end);
      if(from<to)selection.push({x:row.x+offset(row,from),y:row.y,w:offset(row,to)-offset(row,from),h:lineH});
    }
  }
  return {caret,selection};
}
export function annotationTextOffset(ctx,a,ar,x,y) {
  const {rows,lineH}=annotationTextLayout(ctx,a,ar);
  const row=rows[cap(Math.floor((y*ar*W-rows[0].y)/lineH),0,rows.length-1)];
  let offset=0,width=0;
  for(const char of row.value){
    const next=ctx.measureText(row.value.slice(0,offset+char.length)).width;
    if(x*W-row.x<(width+next)/2)break;
    offset+=char.length;width=next;
  }
  return row.start+offset;
}
function centeredText(ctx,text,x,y,size) {
  ctx.font=`600 ${size}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineJoin='round';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.setLineDash([]);
  ctx.strokeText(text,x,y);ctx.fillText(text,x,y);
}
function drawNumber(ctx,a,s,H) {
  const label=numeral(a.n||1,s.numFormat),x=a.x1*W,y=a.y1*H;
  const r=numberRadius(ctx,a,s);
  ctx.textAlign='center';ctx.textBaseline='middle';
  if(s.numShape!=='plain'){
    const p=shapePath([x-r,y-r,2*r,2*r],s.numShape.startsWith('square')?'rect':'ellipse');
    ctx.fillStyle=s.numShape.endsWith('solid')?s.c:s.fill;
    if(s.numShape.endsWith('solid')||s.fillMode!=='border') ctx.fill(p);
    if(s.numShape.endsWith('outline'))ctx.stroke(p);
  }
  ctx.fillStyle=s.numShape.endsWith('solid')?'#fff':s.c;ctx.fillText(label,x,y);
}

function maskEffect(ctx,a,s,H,image,scale) {
  if (!image) return;
  const free=annotationPen.has(a.t), mask=new Path2D();
  const boxes=a.t==='filterAuto'?a.regions.map(([x,y,w,h])=>[x*W,y*H,w*W,h*H]):[boxOf(a,H)];
  if(!free)for(const box of boxes)mask.addPath(shapePath(box,s.shape,s.radius));
  const width=ctx.canvas.width,height=ctx.canvas.height;
  const buffer=document.createElement('canvas');
  buffer.width=width;buffer.height=height;
  const b=buffer.getContext('2d');
  const restore = a.t.startsWith('erase')||s.filter==='restore';
  if (restore) b.drawImage(image,0,0,width,height);
  else if (s.filter==='mosaic') {
    const px=(3+s.strength*48)*scale;
    const small=document.createElement('canvas');
    small.width=Math.max(1,Math.ceil(width/px));small.height=Math.max(1,Math.ceil(height/px));
    small.getContext('2d').drawImage(ctx.canvas,0,0,small.width,small.height);
    b.imageSmoothingEnabled=false;b.drawImage(small,0,0,width,height);
  } else if (s.filter==='emboss') {
    b.drawImage(ctx.canvas,0,0);
    const data=b.getImageData(0,0,width,height), copy=new Uint8ClampedArray(data.data);
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=(y*width+x)*4, j=i-(width+1)*4;
      for(let c=0;c<3;c++)data.data[i+c]=128+(copy[i+c]-copy[j+c])*(1+s.strength*4);
    }
    b.putImageData(data,0,0);
  } else {
    const f={blur:`blur(${(1+s.strength*34)*scale}px)`,gray:'grayscale(1)',invert:'invert(1)',brightness:`brightness(${.25+s.strength*1.75})`};
    b.filter=f[s.filter];b.drawImage(ctx.canvas,0,0);
  }
  if(free||restore){
    const ink=document.createElement('canvas');ink.width=width;ink.height=height;
    const k=ink.getContext('2d');k.scale(scale,scale);
    if(free){k.lineCap='round';k.lineJoin='round';k.lineWidth=s.lw;k.stroke(brushPath(a.pts,H));}
    else k.fill(mask);
    if(restore){
      const [l,t,r,bottom]=annotationBounds(a,H/W),pad=(free?s.lw*scale/2:0)+2;
      const x=Math.max(0,Math.floor(l*width-pad)),y=Math.max(0,Math.floor(t*H*scale-pad));
      const w=Math.min(width,Math.ceil(r*width+pad))-x,h=Math.min(height,Math.ceil(bottom*H*scale+pad))-y;
      const mask=k.getImageData(x,y,w,h).data,base=b.getImageData(x,y,w,h).data;
      const output=ctx.getImageData(x,y,w,h),data=output.data;
      for(let i=0;i<data.length;i+=4){
        const coverage=mask[i+3];
        if(!coverage)continue;
        if(coverage===255){data.set(base.subarray(i,i+4),i);continue;}
        if(base[i]===data[i]&&base[i+1]===data[i+1]&&base[i+2]===data[i+2]&&base[i+3]===data[i+3])continue;
        const original=base[i+3]*coverage,edited=data[i+3]*(255-coverage),alpha=original+edited;
        if(alpha)for(let c=0;c<3;c++)data[i+c]=(base[i+c]*original+data[i+c]*edited)/alpha;
        data[i+3]=alpha/255;
      }
      ctx.putImageData(output,x,y);
      return;
    }
    b.globalCompositeOperation='destination-in';b.drawImage(ink,0,0);
  } else ctx.clip(mask);
  ctx.drawImage(buffer,0,0,W,H);
}

function drawLegacy(ctx,a,H) {
  const c=a.c||'#e5484d', lw=(a.lw||4)*1.5;
  strokeStyle(ctx,{c,lw});
  if(a.t==='rect'||a.t==='ellipse')ctx.stroke(shapePath(boxOf(a,H),a.t,4));
  if(a.t==='arrow'){
    const x=a.x2*W,y=a.y2*H,ang=Math.atan2(y-a.y1*H,x-a.x1*W),len=10+lw*3;
    ctx.beginPath();ctx.moveTo(a.x1*W,a.y1*H);ctx.lineTo(x,y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x-len*Math.cos(ang-.45),y-len*Math.sin(ang-.45));
    ctx.lineTo(x-len*Math.cos(ang+.45),y-len*Math.sin(ang+.45));ctx.fill();
  }
  if(a.t==='pen'&&a.pts?.length){ctx.beginPath();a.pts.forEach((p,i)=>i?ctx.lineTo(p[0]*W,p[1]*H):ctx.moveTo(p[0]*W,p[1]*H));ctx.stroke();}
  if(a.t==='text'){
    ctx.font=`bold ${22+(a.lw||4)*4}px sans-serif`;ctx.textBaseline='alphabetic';ctx.strokeStyle=c==='#ffffff'?'#000':'#fff';ctx.lineWidth=5;
    ctx.strokeText(a.s||'',a.x1*W,a.y1*H);ctx.fillText(a.s||'',a.x1*W,a.y1*H);
  }
  if(a.t==='num'){
    const r=16+(a.lw||4)*2,x=a.x1*W,y=a.y1*H;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=c==='#ffffff'?'#000':'#fff';
    ctx.font=`bold ${r*1.2}px sans-serif`;ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(a.n||1,x,y);
  }
}

const smartKey = a => JSON.stringify([a.t,a.x1,a.y1,a.x2,a.y2,a.pts,a.style.shape,a.style.radius,a.style.lw]);
export const usesSmartErase = a => a.v===2 && a.style?.filter==='smart' && (a.t==='filterRect'||a.t==='filterPen');
const smartCache=new WeakMap();
let worker, serial=0;
const jobs=new Map();
function reconstructPatch(width,height,source,mask) {
  if(!worker){
    worker=new Worker(new URL('./annotation-smart-worker.js?v=20261126a1',import.meta.url),{type:'module'});
    worker.addEventListener('message',({data})=>{
      const job=jobs.get(data.id);jobs.delete(data.id);
      if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);
    });
    worker.addEventListener('error',()=>{
      for(const job of jobs.values())job.reject(new Error('智能擦除进程无法启动'));
      jobs.clear();
    });
  }
  const id=++serial;
  return new Promise((resolve,reject)=>{
    jobs.set(id,{resolve,reject});worker.postMessage({id,width,height,source,mask},[source.buffer,mask.buffer]);
  });
}
async function makeSmartPatch(image,a,ar) {
  const ratio=Math.min(1,2048/Math.max(image.width,image.height));
  const width=Math.round(image.width*ratio),height=Math.round(image.height*ratio),scale=width/W,H=ar*W;
  const s=a.style, [left,top,right,bottom]=annotationBounds(a,ar);
  const brushMargin=a.t==='filterPen'?s.lw*scale:0;
  const x=Math.max(0,Math.floor(left*width-256-brushMargin)),y=Math.max(0,Math.floor(top*height-256-brushMargin));
  const w=Math.min(width,Math.ceil(right*width+256+brushMargin))-x,h=Math.min(height,Math.ceil(bottom*height+256+brushMargin))-y;
  const tile=document.createElement('canvas');tile.width=w;tile.height=h;
  const ctx=tile.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,x/ratio,y/ratio,w/ratio,h/ratio,0,0,w,h);
  const source=ctx.getImageData(0,0,w,h).data;
  ctx.clearRect(0,0,w,h);ctx.setTransform(scale,0,0,scale,-x,-y);
  if(a.t==='filterPen'){
    ctx.lineWidth=s.lw;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(brushPath(a.pts,H));
  }else ctx.fill(shapePath(boxOf(a,H),s.shape,s.radius));
  const pixels=ctx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h);
  for(let i=0;i<mask.length;i++)mask[i]=pixels[i*4+3];
  const result=await reconstructPatch(w,h,source,mask);
  ctx.putImageData(new ImageData(result,w,h),0,0);
  return {tile,x:x/scale,y:y/scale,w:w/scale,h:h/scale};
}
export async function prepareSmartErase(image,items,ar) {
  if(!image||!items.some(usesSmartErase))return new Map();
  if(!smartCache.has(image))smartCache.set(image,new Map());
  const cache=smartCache.get(image);
  return new Map(await Promise.all(items.filter(usesSmartErase).map(async a=>{
    const key=smartKey(a);
    if(!cache.has(key)){
      if(cache.size>=24)cache.delete(cache.keys().next().value);
      cache.set(key,makeSmartPatch(image,a,ar).catch(error=>{cache.delete(key);throw error;}));
    }
    return [key,await cache.get(key)];
  })));
}

export function drawAnnotations(canvas,image,items,ar,smartPatches) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),scale=canvas.width/W,H=W*ar;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  if(image)ctx.drawImage(image,0,0,canvas.width,canvas.height);
  ctx.setTransform(scale,0,0,scale,0,0);
  for(const a of [...items.filter(usesSmartErase),...items.filter(a=>!usesSmartErase(a))]){
    ctx.save();
    if(a.v!==2){drawLegacy(ctx,a,H);ctx.restore();continue;}
    const s={...annotationDefaults(a.t),...a.style};
    if(a.rotation&&annotationRotates.has(a.t)){
      const [l,t,r,b]=annotationBounds(a,ar),x=(l+r)*W/2,y=(t+b)*H/2;
      ctx.translate(x,y);ctx.rotate(a.rotation*Math.PI/180);ctx.translate(-x,-y);
    }
    ctx.globalAlpha=s.opacity??1;strokeStyle(ctx,{...s,lw:s.lw||1});
    if(usesSmartErase(a)){
      const patch=smartPatches?.get(smartKey(a));
      if(patch)ctx.drawImage(patch.tile,patch.x,patch.y,patch.w,patch.h);
      else{
        ctx.strokeStyle=ctx.fillStyle='#ff4d4f';ctx.globalAlpha=.25;
        if(a.t==='filterPen')ctx.stroke(brushPath(a.pts,H));
        else ctx.fill(shapePath(boxOf(a,H),s.shape,s.radius));
      }
    } else if(a.t==='rect'||a.t==='ellipse'||a.t==='bubble'||a.t==='highlight'){
      const frame=boxOf(a,H),p=shapePath(frame,s.shape,s.radius);
      if(a.t==='highlight')ctx.fill(p);
      else {
        if(a.t==='bubble'&&s.shape==='rect'){
          const [x,y,w,h]=frame;p.moveTo(x+w*.24,y+h);p.lineTo(x+w*.2,y+h+Math.min(24,h*.24));p.lineTo(x+w*.4,y+h);p.closePath();
        }
        fillPath(ctx,p,s);strokePath(ctx,p,s);
        if(a.s)drawText(ctx,a,ar);
      }
    } else if(a.t==='arrow'||a.t==='line'||a.t==='distance'){
      drawLine(ctx,a,s,H);
      if(a.s)drawText(ctx,a,ar);
      if(a.t==='distance'){
        const quantity=Math.hypot((a.x2-a.x1)*(image?.width||canvas.width),(a.y2-a.y1)*(image?.height||canvas.height))*s.lengthScale;
        centeredText(ctx,`${quantity.toFixed(s.decimals)} ${s.unit}`,(a.x1+a.x2)*W/2,(a.y1+a.y2)*H/2-10,18);
      }
    } else if(a.t==='angle'){
      const p=[a.x1*W,a.y1*H],v=[a.x2*W,a.y2*H],q=[a.x3*W,a.y3*H];
      const b=Math.atan2(p[1]-v[1],p[0]-v[0]),delta=Math.atan2(Math.sin(Math.atan2(q[1]-v[1],q[0]-v[0])-b),Math.cos(Math.atan2(q[1]-v[1],q[0]-v[0])-b));
      const r=Math.min(40,dist(p,v)/2,dist(q,v)/2);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...v);ctx.lineTo(...q);ctx.stroke();
      ctx.beginPath();ctx.arc(...v,r,b,b+delta,delta<0);ctx.stroke();
      centeredText(ctx,`${(Math.abs(delta)*180/Math.PI).toFixed(s.decimals)}°`,v[0]+Math.cos(b+delta/2)*(r+16),v[1]+Math.sin(b+delta/2)*(r+16),18);
    } else if(a.t==='bracket'){
      const x=a.x1*W,y=a.y1*H,dx=a.x2*W-x,dy=a.y2*H-y;
      ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));const length=Math.hypot(dx,dy),k=Math.min(24,length/5);
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(0,k,k,k);
      ctx.lineTo(length/2-k,k);ctx.quadraticCurveTo(length/2,k,length/2,2*k);ctx.quadraticCurveTo(length/2,k,length/2+k,k);
      ctx.lineTo(length-k,k);ctx.quadraticCurveTo(length,k,length,0);ctx.stroke();
    } else if(a.t==='pen'||a.t==='penHighlight')brush(ctx,a,s,H);
    else if(a.t==='text')drawText(ctx,a,ar);
    else if(a.t==='num'){drawNumber(ctx,a,s,H);if(a.s)drawText(ctx,a,ar);}
    else if(a.t==='spotlight'){
      const p=new Path2D();p.rect(0,0,W,H);p.addPath(shapePath(boxOf(a,H),s.shape,s.radius));ctx.fill(p,'evenodd');
    } else if(a.t==='watermark'&&a.s){
      ctx.translate(a.x1*W,a.y1*H);ctx.rotate(s.tilt*Math.PI/180);
      ctx.font=cssFont(s);ctx.textBaseline='middle';
      const xGap=Math.max(s.gap,ctx.measureText(a.s).width+s.gap),m=Math.hypot(W,H)*1.1;
      for(let y=-m;y<m;y+=Math.max(s.gap,s.fontSize+8))for(let x=-m;x<m;x+=xGap)ctx.fillText(a.s,x,y);
    } else if(a.t==='magnifier'&&image) {
      const [x,y,w,h]=boxOf(a,H),tw=Math.min(w*s.zoom,W),th=Math.min(h*s.zoom,H);
      const tx=cap(a.x3!=null?a.x3*W:x+w+18,0,W-tw),ty=cap(a.y3!=null?a.y3*H:y-h*.35,0,H-th);
      if(s.connector!=='none'){
        const first=[x+w/2,y+h/2],last=[tx+tw/2,ty+th/2];
        if(s.connector==='gradient'){
          const g=ctx.createLinearGradient(...first,...last);g.addColorStop(0,s.c+'70');g.addColorStop(1,s.c+'10');ctx.fillStyle=g;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.lineTo(tx+tw,ty+th);ctx.lineTo(tx,ty);ctx.fill();
        } else {
          ctx.beginPath();ctx.moveTo(...first);ctx.lineTo(...last);ctx.stroke();drawHead(ctx,last,first,s.end,s,12*s.headScale);
        }
      }
      if(s.sourceOutline)ctx.stroke(shapePath([x,y,w,h],s.shape,s.radius));
      const lens=shapePath([tx,ty,tw,th],s.shape,s.radius);
      ctx.save();ctx.clip(lens);
      ctx.drawImage(image,x/W*image.width,y/H*image.height,w/W*image.width,h/H*image.height,tx,ty,tw,th);
      ctx.restore();ctx.stroke(lens);
    } else if(a.t.startsWith('filter')||a.t.startsWith('erase'))maskEffect(ctx,a,s,H,image,scale);
    ctx.restore();
  }
}
