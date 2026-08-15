/* 明暗主题切换 · theme.js */
(function () {
  'use strict';

  var KEY = 'site:theme';

  function current() {
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btns = document.querySelectorAll('.theme-toggle .theme-btn');
    Array.prototype.forEach.call(btns, function (b) {
      var dark = theme === 'dark';
      b.textContent = dark ? '☀' : '☾';
      b.setAttribute('aria-label', dark ? '切换到日间模式' : '切换到夜间模式');
      b.title = dark ? '日间模式' : '夜间模式';
    });
  }

  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var slots = document.querySelectorAll('.theme-toggle');
    Array.prototype.forEach.call(slots, function (slot) {
      if (slot.querySelector('.theme-btn')) return;
      var b = document.createElement('button');
      b.className = 'theme-btn';
      b.type = 'button';
      b.addEventListener('click', toggle);
      slot.appendChild(b);
    });
    apply(current());
  });
})();
