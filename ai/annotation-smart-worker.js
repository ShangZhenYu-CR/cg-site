const moduleReady = fetch(new URL('./annotation-smart.wasm?v=20261126a1',import.meta.url))
  .then(async r=>{
    if(!r.ok)throw new Error('智能擦除引擎加载失败');
    return (await WebAssembly.instantiate(await r.arrayBuffer())).instance.exports;
  });

self.addEventListener('message',async ({data})=>{
  const {id,width,height,source,mask}=data;
  const size=width*height*5;
  try{
    const engine=await moduleReady;
    const ptr=engine.reserve(size);
    const view=new Uint8Array(engine.memory.buffer,ptr,size);
    view.set(source);view.set(mask,source.length);
    if(engine.reconstruct(width,height)!==1)throw new Error('这个区域没有足够的背景可用于重建');
    const result=new Uint8ClampedArray(engine.memory.buffer,ptr,source.length).slice();
    for(let i=0;i<mask.length;i++)result[4*i+3]=mask[i];
    self.postMessage({id,result},[result.buffer]);
  }catch(error){
    self.postMessage({id,error:error.message});
  }
});
