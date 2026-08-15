/* 学习笔记 个人站 · app.js */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('intro')) {
      runIntro();
    } else if (document.getElementById('note-list')) {
      initNotesApp();
    }
  });

  /* ================= 开场动画 ================= */
  function runIntro() {
    var intro = document.getElementById('intro');
    var canvas = document.getElementById('intro-canvas');
    var title = document.getElementById('intro-title');
    var sub = document.getElementById('intro-sub');
    var bar = document.getElementById('intro-bar');
    var count = document.getElementById('intro-count');
    var main = document.getElementById('main');

    // 把标题拆成逐字 span
    var text = title.textContent.trim();
    title.textContent = '';
    var spans = Array.prototype.map.call(text, function (ch, i) {
      var s = document.createElement('span');
      s.className = 'letter';
      s.textContent = ch === ' ' ? ' ' : ch;
      s.style.setProperty('--i', i);
      title.appendChild(s);
      return s;
    });
    var _ = spans;

    // 粒子背景
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0;
    var parts = [];
    function resize() {
      W = canvas.width = intro.offsetWidth;
      H = canvas.height = intro.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    for (var i = 0; i < 70; i++) {
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.5,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(Math.random() * 0.55 + 0.12),
        a: Math.random() * 0.55 + 0.18
      });
    }
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
        if (p.x < -12) p.x = W + 12;
        if (p.x > W + 12) p.x = -12;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, 'rgba(160,180,255,' + p.a + ')');
        g.addColorStop(1, 'rgba(160,180,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    })();

    // 逐字浮现
    requestAnimationFrame(function () {
      title.classList.add('on');
    });
    setTimeout(function () { sub.classList.add('on'); }, 620);

    // 进度条 + 计数器
    var dur = 1900;
    var start = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      bar.style.width = (eased * 100).toFixed(1) + '%';
      count.textContent = String(Math.round(eased * 100)).padStart(2, '0');
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(function () {
          intro.classList.add('out');
          main.classList.add('on');
          setTimeout(function () {
            if (intro.parentNode) intro.parentNode.removeChild(intro);
          }, 900);
        }, 220);
      }
    })(start);
  }

  /* ================= 学习笔记应用 ================= */
  function initNotesApp() {
    var listEl = document.getElementById('note-list');
    var contentEl = document.getElementById('note-content');
    var notes = [];

    fetch('notes.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        notes = data;
        notes.forEach(function (n, idx) {
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = '#';
          a.textContent = n.title;
          if (idx === 0) a.className = 'active';
          a.addEventListener('click', function (e) {
            e.preventDefault();
            var all = listEl.querySelectorAll('a');
            for (var k = 0; k < all.length; k++) all[k].classList.remove('active');
            a.classList.add('active');
            loadNote(n.file);
          });
          li.appendChild(a);
          listEl.appendChild(li);
        });
        if (notes.length) loadNote(notes[0].file);
      })
      .catch(function () {
        contentEl.innerHTML = '<p class="loading">笔记列表加载失败</p>';
      });

    function loadNote(file) {
      contentEl.innerHTML = '<div class="loading">加载中…</div>';
      fetch(file)
        .then(function (res) { return res.text(); })
        .then(function (md) {
          contentEl.innerHTML = marked.parse(md);
          contentEl.scrollTop = 0;
          document.querySelector('.note-viewer').scrollTop = 0;
        })
        .catch(function () {
          contentEl.innerHTML = '<p class="loading">笔记内容加载失败</p>';
        });
    }
  }
})();
