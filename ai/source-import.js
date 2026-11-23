// The browser exposes the bytes of a dropped file, but not the webpage it came from.
export async function pickSourceFiles({source, target, files = [], ask, el, upload, forget}) {
  const items = [];
  let busy = false, list, status, submit;
  function append(files) {
    for (const file of files) {
      if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) {
        status.textContent = file.name + ' 的格式无法导入，请选择 JPG、PNG、WebP 或 GIF。';
        continue;
      }
      const row = el('div','source-file');
      const img = document.createElement('img');
      const preview = URL.createObjectURL(file);
      img.src = preview;
      img.alt = file.name;
      const info = el('div');
      const name = el('strong',null,file.name);
      const size = el('small');
      img.onload = () => { size.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' 像素'; };
      const link = document.createElement('input');
      link.type = 'url';
      link.setAttribute('aria-label', file.name + ' 原图网址（选填）');
      link.placeholder = '原图网址（选填）';
      const remove = el('button','ghost','移除');
      remove.type = 'button';
      const item = {file,img,preview,link,row};
      remove.onclick = () => { if (busy) return; items.splice(items.indexOf(item),1); URL.revokeObjectURL(preview); row.remove(); submit.disabled = !items.length; };
      info.append(name,size,link);
      row.append(img,info,remove); list.append(row); items.push(item);
    }
    submit.disabled = !items.length;
  }
  await ask({title:'从作品页带回原图', sub:'打开作品页，保存选中的原图，再把文件拖到这里。将存入「'+target+'」，每张卡都会保留作品页。', ok:'稍后继续', cancel:false, extra(close) {
    const panel = el('div','source-import');
    const page = el('a',null,'打开作品页 ↗'); page.href=source; page.target='_blank'; page.rel='noopener noreferrer'; page.title=source;
    const uri=el('small',null,source);
    const input=document.createElement('input');
    input.type='file'; input.multiple=true; input.accept='image/png,image/jpeg,image/webp,image/gif'; input.hidden=true;
    const zone=el('button','source-drop','选择或拖入已保存的原图'); zone.type='button';
    zone.onclick=()=>input.click();
    input.onchange=()=>{ append(input.files); input.value=''; };
    panel.ondragover=event=>{ if(event.dataTransfer.types.includes('Files')) event.preventDefault(); };
    panel.ondrop=event=>{ event.preventDefault(); event.stopPropagation(); if (!busy) append(event.dataTransfer.files); };
    list=el('div','source-files');
    status=el('div','sd-err'); status.setAttribute('role','status');
    const actions=el('div','btn-row');
    const stop=el('button','ghost','取消这次导入'); stop.type='button'; stop.onclick=()=>{ if (!busy) {forget(); close(null);} };
    submit=el('button','primary','存入画布'); submit.type='button'; submit.disabled=true;
    submit.onclick=async()=>{
      if(busy) return;
      const invalid=items.find(i=>i.link.value.trim() && (!URL.canParse(i.link.value.trim()) || !/^https?:$/.test(new URL(i.link.value.trim()).protocol)));
      if(invalid){status.textContent='原图网址需要以 http:// 或 https:// 开头。';invalid.link.focus();return;}
      busy=true; submit.disabled=true; zone.disabled=true;
      const form=panel.closest('form');
      const later=form.querySelector('[type=submit]'); later.disabled=true;
      try {
        while(items.length){
          const item=items[0]; status.textContent='正在保存 '+item.file.name;
          await item.img.decode();
          await upload(item.file,{source,originalUrl:item.link.value.trim(),width:item.img.naturalWidth,height:item.img.naturalHeight});
          URL.revokeObjectURL(item.preview); item.row.remove();items.shift();
        }
        busy=false;forget();close(true);
      } catch(error){status.textContent=error.message;}
      finally{busy=false;submit.disabled=!items.length;zone.disabled=false;later.disabled=false;}
    };
    actions.append(stop,submit);panel.append(page,uri,input,zone,list,status,actions);append(files);return panel;
  },dismissible:()=>!busy});
  items.forEach(i=>URL.revokeObjectURL(i.preview));
}
