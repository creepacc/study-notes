/* 通行密码门 · gate.js */
(function () {
  'use strict';

  // 通行密码的 SHA-256(hex): sha256("88888888")
  var PASS_HASH = '615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25';
  var KEY = 'site:unlocked';

  function isUnlocked() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function sha256hex(str) {
    if (window.crypto && window.crypto.subtle) {
      var data = new TextEncoder().encode(str);
      return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
    // 兜底: 无 crypto.subtle(非 https)时的简化哈希
    return Promise.resolve(fallbackHash(str));
  }

  function fallbackHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'fb' + h.toString(16) + str.length.toString(16);
  }

  function unlock(gateEl) {
    document.body.style.overflow = '';
    gateEl.classList.add('ok');
    setTimeout(function () {
      window.dispatchEvent(new CustomEvent('site:unlocked'));
      if (gateEl.parentNode) gateEl.parentNode.removeChild(gateEl);
    }, 450);
  }

  function buildGate() {
    document.body.style.overflow = 'hidden';
    var div = document.createElement('div');
    div.className = 'gate';
    div.innerHTML =
      '<div class="gate-card">' +
        '<div class="gate-logo">◇</div>' +
        '<h1 class="gate-title">求职之路</h1>' +
        '<p class="gate-sub">私人站点 · 输入通行密码进入</p>' +
        '<form class="gate-form" autocomplete="off">' +
          '<input class="gate-input" type="password" placeholder="通行密码" />' +
          '<button class="gate-btn" type="submit">进入</button>' +
        '</form>' +
        '<p class="gate-err" hidden>密码错误,再试一次</p>' +
      '</div>';
    document.body.appendChild(div);

    var form = div.querySelector('.gate-form');
    var input = div.querySelector('.gate-input');
    var err = div.querySelector('.gate-err');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pwd = input.value;
      if (!pwd) return;
      sha256hex(pwd).then(function (h) {
        if (h === PASS_HASH) {
          try { sessionStorage.setItem(KEY, '1'); } catch (e2) {}
          unlock(div);
        } else {
          err.hidden = false;
          input.value = '';
          input.focus();
        }
      });
    });
    input.focus();
  }

  window.SiteGate = { isUnlocked: isUnlocked };

  document.addEventListener('DOMContentLoaded', function () {
    if (!isUnlocked()) buildGate();
  });
})();
