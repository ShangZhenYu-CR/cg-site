/**
 * 毛豆插件 Host SDK v1（客户端）
 * 插件页引入后：
 *   import { callTool, onReady } from './host-sdk.js';
 *   onReady(() => callTool('charcount', { text: 'hi' }).then(console.log));
 */
let hostNonce = null;
let ready = false;
const pending = new Map();
const readyHandlers = [];
window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'dsh:host_hello') {
    hostNonce = d.nonce || null;
    ready = true;
    try { parent.postMessage({ type: 'dsh:plugin_ready', nonce: hostNonce }, '*'); } catch (e2) {}
    for (const fn of readyHandlers.splice(0)) { try { fn({ nonce: hostNonce, apiVersion: d.apiVersion || 1 }); } catch (e3) {} }
    return;
  }
  if (d.type === 'dsh:host_ready') { ready = true; return; }
  if (d.type === 'dsh:result' && d.id && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    if (d.ok) p.resolve(d.result);
    else p.reject(new Error(d.error || '工具调用失败'));
  }
});
export function onReady(fn) {
  if (ready) fn({ nonce: hostNonce });
  else readyHandlers.push(fn);
}
export function callTool(name, args) {
  return new Promise((resolve, reject) => {
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    pending.set(id, { resolve, reject });
    try { parent.postMessage({ type: 'dsh:call', id, nonce: hostNonce, name, args: args || {} }, '*'); } catch (e) { pending.delete(id); reject(e); }
  });
}
