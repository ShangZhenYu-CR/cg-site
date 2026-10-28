/**
 * 敲键盘桌宠
 *
 * 素材来自 bongocat-react（MIT），参考 BongoCat-mac（MIT）。
 * 这里没有用它的 React 组件，只用 5 张同尺寸精灵图自己叠层：
 *   base.png       猫本体
 *   left-up/down   左手抬起 / 按下
 *   right-up/down  右手抬起 / 按下
 *
 * 用法：window.mountBongoPet(document.getElementById('petStage'))
 */

(function () {
  const BASE = 'pet/';
  const RATIO = 201 / 397;

  function layer(src) {
    const img = document.createElement('img');
    img.src = BASE + src;
    img.alt = '';
    img.draggable = false;
    img.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none;';
    return img;
  }

  window.mountBongoPet = function (container, width) {
    if (!container) return;

    const w = width || 160;
    container.innerHTML = '';
    container.style.cssText =
      'position:relative;width:' + w + 'px;height:' + Math.round(w * RATIO) + 'px;';

    const base = layer('base.png');
    const left = layer('left-up.png');
    const right = layer('right-up.png');
    container.append(base, left, right);

    let timer = null;

    function press() {
      left.src = BASE + 'left-down.png';
      right.src = BASE + 'right-down.png';
      clearTimeout(timer);
      timer = setTimeout(release, 95);
    }

    function release() {
      left.src = BASE + 'left-up.png';
      right.src = BASE + 'right-up.png';
    }

    window.addEventListener('keydown', press, { passive: true });
    window.addEventListener('mousedown', press, { passive: true });
  };
})();
