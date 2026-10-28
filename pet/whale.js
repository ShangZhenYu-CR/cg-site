/**
 * 键盘肥鱼桌宠（原创 SVG，无外部素材）
 *
 * 用法：window.mountWhalePet(document.getElementById('petStage'), 180)
 * 你按键盘 / 点鼠标时，两只鳍会往下按。
 */

(function () {
  const SVG = `
<svg viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="whaleBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8bc0ff"/>
      <stop offset="100%" stop-color="#5b8fd6"/>
    </linearGradient>
    <linearGradient id="whaleBelly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eaf3ff"/>
      <stop offset="100%" stop-color="#c9dcf5"/>
    </linearGradient>
  </defs>

  <!-- 尾巴 -->
  <g id="wTail">
    <path d="M178 74 q18 -10 26 -22 q6 14 2 24 q-4 10 -14 12 q-8 2 -14 -2 z" fill="#5b8fd6"/>
  </g>

  <!-- 身体 -->
  <ellipse cx="110" cy="72" rx="66" ry="44" fill="url(#whaleBody)"/>
  <ellipse cx="110" cy="88" rx="46" ry="24" fill="url(#whaleBelly)"/>

  <!-- 呆毛 -->
  <path d="M104 29 q4 -14 12 -16 q-2 10 2 16 z" fill="#8bc0ff"/>

  <!-- 鲸鱼耳朵 -->
  <path d="M78 40 q-10 -12 -2 -18 q8 -4 12 8 z" fill="#5b8fd6"/>
  <path d="M142 40 q10 -12 2 -18 q-8 -4 -12 8 z" fill="#5b8fd6"/>

  <!-- 眼睛 -->
  <ellipse cx="90" cy="64" rx="7" ry="8.5" fill="#12161f"/>
  <ellipse cx="130" cy="64" rx="7" ry="8.5" fill="#12161f"/>
  <circle cx="92.5" cy="61" r="2.6" fill="#fff"/>
  <circle cx="132.5" cy="61" r="2.6" fill="#fff"/>

  <!-- 腮红 -->
  <ellipse cx="76" cy="78" rx="8" ry="5" fill="#ff9db1" opacity=".55"/>
  <ellipse cx="144" cy="78" rx="8" ry="5" fill="#ff9db1" opacity=".55"/>

  <!-- 嘴 -->
  <path d="M104 80 q6 6 12 0" stroke="#3a4a63" stroke-width="2.4" fill="none" stroke-linecap="round"/>

  <!-- 键盘 -->
  <rect x="22" y="104" width="176" height="34" rx="7" fill="#1b2130" stroke="#2c3a4f" stroke-width="2"/>
  <g fill="#31405a">
    <rect x="30" y="111" width="14" height="9" rx="2"/><rect x="48" y="111" width="14" height="9" rx="2"/>
    <rect x="66" y="111" width="14" height="9" rx="2"/><rect x="84" y="111" width="14" height="9" rx="2"/>
    <rect x="102" y="111" width="14" height="9" rx="2"/><rect x="120" y="111" width="14" height="9" rx="2"/>
    <rect x="138" y="111" width="14" height="9" rx="2"/><rect x="156" y="111" width="14" height="9" rx="2"/>
    <rect x="174" y="111" width="14" height="9" rx="2"/>
    <rect x="30" y="124" width="30" height="9" rx="2"/><rect x="64" y="124" width="90" height="9" rx="2"/>
    <rect x="158" y="124" width="30" height="9" rx="2"/>
  </g>

  <!-- 鳍（打字时下压） -->
  <g id="finL">
    <ellipse cx="72" cy="100" rx="10" ry="14" fill="#7fb2f0"/>
  </g>
  <g id="finR">
    <ellipse cx="148" cy="100" rx="10" ry="14" fill="#7fb2f0"/>
  </g>
</svg>`;

  window.mountWhalePet = function (container, width) {
    if (!container) return;

    const w = width || 180;
    container.innerHTML = SVG;
    container.style.cssText = 'position:relative;width:' + w + 'px;height:' + Math.round(w * (150 / 220)) + 'px;';

    const svg = container.querySelector('svg');
    svg.style.cssText = 'width:100%;height:100%;display:block;overflow:visible;';

    const finL = container.querySelector('#finL');
    const finR = container.querySelector('#finR');
    const tail = container.querySelector('#wTail');

    let t = null;
    let idle = 0;

    function press() {
      finL.setAttribute('transform', 'translate(0,5)');
      finR.setAttribute('transform', 'translate(0,5)');
      clearTimeout(t);
      t = setTimeout(() => {
        finL.removeAttribute('transform');
        finR.removeAttribute('transform');
      }, 95);
    }

    window.addEventListener('keydown', press, { passive: true });
    window.addEventListener('mousedown', press, { passive: true });

    // 尾巴慢慢甩，别太闹
    setInterval(() => {
      idle = (idle + 1) % 2;
      tail.setAttribute('transform', idle ? 'rotate(-4 178 74)' : 'rotate(3 178 74)');
    }, 1400);
  };
})();
