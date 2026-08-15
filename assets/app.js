/* 沉淀 个人站 · app.js */
(function () {
  'use strict';

  function start() {
    if (document.getElementById('intro')) {
      runIntro();
    }
    if (document.getElementById('sidebar')) {
      initShell();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.SiteGate && !window.SiteGate.isUnlocked()) {
      window.addEventListener('site:unlocked', start, { once: true });
    } else {
      start();
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
    Array.prototype.map.call(text, function (ch, i) {
      var s = document.createElement('span');
      s.className = 'letter';
      s.textContent = ch === ' ' ? ' ' : ch;
      s.style.setProperty('--i', i);
      title.appendChild(s);
      return s;
    });

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
        g.addColorStop(0, 'rgba(110,120,255,' + p.a + ')');
        g.addColorStop(1, 'rgba(110,120,255,0)');
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

  /* ================= 应用外壳 ================= */
  function initShell() {
    var sidebar = document.getElementById('sidebar');
    var hideBtn = document.getElementById('sidebar-hide');
    var openBtn = document.getElementById('sidebar-open');
    var backdrop = document.getElementById('backdrop');
    var colNav = document.getElementById('col-nav');
    var contentEl = document.getElementById('note-content');
    var notesTreeEl = document.getElementById('col-notes-tree');
    var viewer = document.querySelector('#view-notes .note-viewer');
    var items = [];
    var lastActive = null;
    var uid = 0;
    var MOBILE = 860;

    /* ---- 侧边栏隐藏 / 展开 ---- */
    function sidebarOpen() {
      if (window.innerWidth <= MOBILE) return sidebar.classList.contains('open');
      return !sidebar.classList.contains('hidden');
    }
    function setSidebar(open, save) {
      var mobile = window.innerWidth <= MOBILE;
      sidebar.classList.toggle('hidden', !open && !mobile);
      sidebar.classList.toggle('open', open && mobile);
      document.body.classList.toggle('sidebar-gone', !open && !mobile);
      backdrop.classList.toggle('show', open && mobile);
      if (save) {
        try { localStorage.setItem('site:sidebar', open ? 'shown' : 'hidden'); } catch (e) {}
      }
    }
    hideBtn.addEventListener('click', function () { setSidebar(false, true); });
    openBtn.addEventListener('click', function () { setSidebar(true, true); });
    backdrop.addEventListener('click', function () { setSidebar(false, true); });
    window.addEventListener('resize', function () { setSidebar(sidebarOpen(), false); });

    var stored;
    try { stored = localStorage.getItem('site:sidebar'); } catch (e) {}
    if (window.innerWidth <= MOBILE) setSidebar(false, false);
    else setSidebar(stored !== 'hidden', false);

    /* ---- 视图切换 ---- */
    var views = {
      resume: document.getElementById('view-resume'),
      notes: document.getElementById('view-notes'),
      apply: document.getElementById('view-apply'),
      interview: document.getElementById('view-interview')
    };
    var cols = colNav.querySelectorAll('.col-item');

    function showView(name) {
      Object.keys(views).forEach(function (k) {
        views[k].classList.toggle('active', k === name);
      });
      Array.prototype.forEach.call(cols, function (c) {
        c.classList.toggle('active', c.getAttribute('data-view') === name);
      });
      if (name === 'notes') viewer.scrollTop = 0;
    }

    Array.prototype.forEach.call(cols, function (c) {
      c.addEventListener('click', function (e) {
        // 点击笔记章节树内部(章节/小节)时,不触发栏目切换
        var t = e.target;
        if (t && t.closest && t.closest('#col-notes-tree')) return;
        var v = c.getAttribute('data-view');
        if (v === 'notes') c.classList.toggle('open');
        showView(v);
        if (window.innerWidth <= MOBILE) setSidebar(false, true);
      });
    });
    showView('notes');

    /* ---- 加载笔记 + 章节树 ---- */
    fetch('学习笔记/notes.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.length) loadNote('学习笔记/' + data[0].file);
      })
      .catch(function () {
        contentEl.innerHTML = '<p class="loading">笔记加载失败</p>';
      });

    function loadNote(file) {
      contentEl.innerHTML = '<div class="loading">加载中…</div>';
      fetch(file)
        .then(function (res) { return res.text(); })
        .then(function (md) {
          contentEl.innerHTML = marked.parse(md);
          buildTree();
          viewer.scrollTop = 0;
        })
        .catch(function () {
          contentEl.innerHTML = '<p class="loading">笔记内容加载失败</p>';
        });
    }

    /* ---- 章节树 ---- */
    function scrollToHeading(h) {
      var top = h.getBoundingClientRect().top - viewer.getBoundingClientRect().top + viewer.scrollTop - 16;
      viewer.scrollTo({ top: top, behavior: 'smooth' });
    }

    function scrollSpy() {
      var line = viewer.getBoundingClientRect().top + 90;
      var active = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].h.getBoundingClientRect().top <= line) active = items[i];
      }
      if (active !== lastActive) {
        if (lastActive) lastActive.a.classList.remove('active');
        if (active) {
          active.a.classList.add('active');
          var node = active.a.parentElement;
          while (node && node !== notesTreeEl) {
            node = node.parentElement;
            if (node && node.classList && node.classList.contains('tree-folder')) node.classList.add('open');
          }
        }
        lastActive = active;
      }
    }

    var spyTicking = false;
    viewer.addEventListener('scroll', function () {
      if (!spyTicking) {
        spyTicking = true;
        requestAnimationFrame(function () { scrollSpy(); spyTicking = false; });
      }
    });

    function makeFolder(label) {
      var li = document.createElement('li');
      li.className = 'tree-folder';
      var row = document.createElement('div');
      row.className = 'tree-row';
      var caret = document.createElement('span');
      caret.className = 'caret';
      var labelEl = document.createElement('span');
      labelEl.className = 'tree-label';
      labelEl.textContent = label;
      row.appendChild(caret);
      row.appendChild(labelEl);
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        li.classList.toggle('open');
      });
      li.appendChild(row);
      var child = document.createElement('ul');
      child.className = 'tree-children';
      li.appendChild(child);
      return { li: li, child: child };
    }

    function makeLeaf(h) {
      var li = document.createElement('li');
      li.className = 'tree-leaf';
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        scrollToHeading(h);
      });
      li.appendChild(a);
      items.push({ h: h, a: a });
      return li;
    }

    function buildTree() {
      notesTreeEl.innerHTML = '';
      items = [];
      lastActive = null;
      var heads = contentEl.querySelectorAll('h2, h3');
      if (!heads.length) return;
      var chapter = null;
      heads.forEach(function (h) {
        if (!h.id) h.id = 'sec-' + (++uid);
        if (h.tagName === 'H2') {
          chapter = makeFolder(h.textContent);
          notesTreeEl.appendChild(chapter.li);
        } else if (chapter) {
          chapter.child.appendChild(makeLeaf(h));
        } else {
          notesTreeEl.appendChild(makeLeaf(h));
        }
      });
      scrollSpy();
    }

    /* ---- 秋招投递跟踪 ---- */
    var STATUSES = [
      { key: 'screen', label: '初筛' },
      { key: 'quiz', label: '测评' },
      { key: 'written', label: '笔试' },
      { key: 'interview', label: '面试' },
      { key: 'offer', label: 'offer' },
      { key: 'fail', label: '挂掉' }
    ];
    var applyKey = 'site:apply';
    var applyList = document.getElementById('apply-list');
    var applyEmpty = document.getElementById('apply-empty');
    var applyModal = document.getElementById('apply-modal');
    var applyForm = document.getElementById('apply-form');
    var applyCompany = document.getElementById('apply-company');
    var applyLink = document.getElementById('apply-link');
    var applyItems = [];
    var applyUid = 0;

    try { applyItems = JSON.parse(localStorage.getItem(applyKey) || '[]'); } catch (e) { applyItems = []; }
    applyItems.forEach(function (it) {
      if (!STATUSES.some(function (s) { return s.key === it.status; })) it.status = 'screen';
      if (it.id > applyUid) applyUid = it.id;
    });

    function saveApply() {
      try { localStorage.setItem(applyKey, JSON.stringify(applyItems)); } catch (e) {}
    }

    function renderApply() {
      applyList.innerHTML = '';
      applyEmpty.style.display = applyItems.length ? 'none' : '';
      applyItems.forEach(function (it) {
        var li = document.createElement('li');
        li.className = 'apply-item status-' + it.status;

        var info = document.createElement('div');
        info.className = 'apply-info';
        var name = document.createElement('span');
        name.className = 'apply-name';
        name.textContent = it.company;
        info.appendChild(name);
        if (it.link) {
          var a = document.createElement('a');
          a.className = 'apply-link';
          a.href = it.link;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = '招聘链接 ↗';
          info.appendChild(a);
        }

        var wrap = document.createElement('span');
        wrap.className = 'apply-status-wrap';
        var sel = document.createElement('select');
        sel.className = 'apply-status';
        STATUSES.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.key;
          opt.textContent = s.label;
          if (s.key === it.status) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
          it.status = sel.value;
          li.className = 'apply-item status-' + it.status;
          saveApply();
        });
        wrap.appendChild(sel);

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'apply-del';
        del.textContent = '✕';
        del.title = '删除该条';
        del.setAttribute('aria-label', '删除 ' + it.company);
        del.addEventListener('click', function () {
          if (!window.confirm('删除「' + it.company + '」这条投递?')) return;
          applyItems = applyItems.filter(function (x) { return x !== it; });
          saveApply();
          renderApply();
        });
        li.appendChild(info);
        li.appendChild(wrap);
        li.appendChild(del);
        applyList.appendChild(li);
      });
    }

    function openApplyModal() {
      applyCompany.value = '';
      applyLink.value = '';
      applyModal.hidden = false;
      applyCompany.focus();
    }
    function closeApplyModal() {
      applyModal.hidden = true;
    }
    document.getElementById('apply-add').addEventListener('click', openApplyModal);
    document.getElementById('apply-cancel').addEventListener('click', closeApplyModal);
    applyModal.addEventListener('click', function (e) {
      if (e.target === applyModal) closeApplyModal();
    });
    applyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = applyCompany.value.trim();
      if (!name) { applyCompany.focus(); return; }
      var link = applyLink.value.trim();
      applyItems.push({ id: ++applyUid, company: name, link: link, status: 'screen' });
      saveApply();
      renderApply();
      closeApplyModal();
    });

    renderApply();
  }
})();
