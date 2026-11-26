self.addEventListener('message',async ({data:{data,width,height}})=>{
  try{
    const r=await fetch(new URL('./annotation-region.wasm?v=20261126a1',import.meta.url));
    if(!r.ok)throw new Error('区域识别引擎加载失败');
    const {instance}=await WebAssembly.instantiate(await r.arrayBuffer());
    const engine=instance.exports,ptr=engine.region_input(data.length);
    new Uint8Array(engine.memory.buffer,ptr,data.length).set(data);
    const count=engine.region_detect(width,height),regions=[];
    const boxes=new Int32Array(engine.memory.buffer,engine.region_output(),count*4);
    for(let i=0;i<count;i++){
      const x=boxes[i*4],y=boxes[i*4+1],w=boxes[i*4+2],h=boxes[i*4+3];
      if(w>0&&h>0)regions.push([x/width,y/height,w/width,h/height]);
    }
    self.postMessage({regions});
  }catch(error){
    self.postMessage({error:error.message});
  }
},{once:true});
