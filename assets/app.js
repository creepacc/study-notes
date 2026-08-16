/* 求职之路 · app.js */
(function () {
  'use strict';

  function start() {
    initTheme();
    initNav();
    initLogout();
    initJobs();
    initNotes();
    initInterview();
    if (document.getElementById('splash')) runSplash();
  }

  /* ================= 开屏动画 ================= */
  function runSplash() {
    var splash = document.getElementById('splash');
    var canvas = document.getElementById('splash-canvas');
    var title = document.getElementById('splash-title');
    var sub = document.getElementById('splash-sub');
    var bar = document.getElementById('splash-bar');
    var count = document.getElementById('splash-count');

    // 标题逐字拆开
    var text = title.textContent.trim();
    title.textContent = '';
    Array.prototype.forEach.call(text, function (ch) {
      var s = document.createElement('span');
      s.className = 'letter';
      s.textContent = ch;
      s.style.setProperty('--i', title.children.length);
      title.appendChild(s);
    });

    // 轻柔上浮粒子
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0;
    var parts = [];
    function resize() {
      W = canvas.width = splash.offsetWidth;
      H = canvas.height = splash.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    for (var i = 0; i < 50; i++) {
      parts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 2 + 0.6,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.5 + 0.1),
        a: Math.random() * 0.5 + 0.15,
        hue: Math.random() < 0.5 ? '14,159,110' : '20,184,166'
      });
    }
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, 'rgba(' + p.hue + ',' + p.a + ')');
        g.addColorStop(1, 'rgba(' + p.hue + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    })();

    requestAnimationFrame(function () { title.classList.add('on'); });
    setTimeout(function () { sub.classList.add('on'); }, 520);

    var dur = 1700;
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
          splash.classList.add('out');
          setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
          }, 800);
        }, 200);
      }
    })(start);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.SiteGate && !window.SiteGate.isUnlocked()) {
      window.addEventListener('site:unlocked', start, { once: true });
    } else {
      start();
    }
  });

  /* ================= 主题切换 ================= */
  function initTheme() {
    var btn = document.getElementById('theme-btn');
    function apply(t) {
      document.documentElement.setAttribute('data-theme', t);
      btn.textContent = t === 'dark' ? '☀' : '☾';
      btn.title = t === 'dark' ? '日间模式' : '夜间模式';
    }
    var saved;
    try { saved = localStorage.getItem('site:theme'); } catch (e) {}
    apply(saved === 'dark' ? 'dark' : 'light');
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('site:theme', next); } catch (e) {}
      apply(next);
    });
  }

  /* ================= 导航切换 ================= */
  function initNav() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-tab'));
    var views = {
      jobs: document.getElementById('view-jobs'),
      notes: document.getElementById('view-notes'),
      resume: document.getElementById('view-resume'),
      interview: document.getElementById('view-interview')
    };
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-view');
        Object.keys(views).forEach(function (k) {
          views[k].classList.toggle('active', k === name);
        });
        tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
      });
    });
  }

  /* ================= 退出 ================= */
  function initLogout() {
    document.getElementById('logout-btn').addEventListener('click', function () {
      try { sessionStorage.removeItem('site:unlocked'); } catch (e) {}
      location.reload();
    });
  }

  /* ================= 求职记录 ================= */
  var STATUSES = [
    { key: 'applied', label: '已投' },
    { key: 'screen', label: '初筛' },
    { key: 'quiz', label: '测评' },
    { key: 'written', label: '笔试' },
    { key: 'interview', label: '面试' },
    { key: 'offer', label: 'offer' },
    { key: 'fail', label: '挂掉' }
  ];
  var JOB_KEY = 'site:jobs';
  var ACTIVE_KEYS = { applied: 1, screen: 1, quiz: 1, written: 1, interview: 1 };

  var jobs = [];
  var filter = 'all';
  var uid = 0;
  var editingId = null;
  var jobListEl, jobStatsEl, jobEmptyEl, filterBarEl;

  function initJobs() {
    jobListEl = document.getElementById('jobs-list');
    jobStatsEl = document.getElementById('jobs-stats');
    jobEmptyEl = document.getElementById('jobs-empty');
    filterBarEl = document.getElementById('filter-bar');

    document.getElementById('add-job').addEventListener('click', function () { openAddModal(); });
    document.getElementById('add-cancel').addEventListener('click', closeAddModal);
    document.getElementById('add-modal').addEventListener('click', function (e) {
      if (e.target === this) closeAddModal();
    });
    document.getElementById('add-form').addEventListener('submit', onSubmitAdd);
    document.getElementById('save-repo').addEventListener('click', saveToRepo);

    populateAddStatus();
    loadJobs();
  }

  function populateAddStatus() {
    var sel = document.getElementById('add-status');
    STATUSES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.key;
      opt.textContent = s.label;
      sel.appendChild(opt);
    });
  }

  function loadJobs() {
    var saved;
    try { saved = localStorage.getItem(JOB_KEY); } catch (e) {}
    if (saved) {
      try { jobs = JSON.parse(saved); } catch (e) { jobs = []; }
      normalizeJobs();
      renderJobs();
    } else {
      fetch('求职记录/jobs.json')
        .then(function (r) { if (!r.ok) throw new Error('no file'); return r.json(); })
        .then(function (data) {
          jobs = Array.isArray(data) ? data : [];
          normalizeJobs();
          saveLocal();
          renderJobs();
        })
        .catch(function () { jobs = []; renderJobs(); });
    }
  }

  function normalizeJobs() {
    jobs.forEach(function (it) {
      if (!STATUSES.some(function (s) { return s.key === it.status; })) it.status = 'applied';
      if (typeof it.note !== 'string') it.note = '';
      if (typeof it.date !== 'string') it.date = '';
      if (typeof it.link !== 'string') it.link = '';
      if (it.id > uid) uid = it.id;
    });
  }

  function saveLocal() {
    try { localStorage.setItem(JOB_KEY, JSON.stringify(jobs)); } catch (e) {}
  }

  function statusLabel(key) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].key === key) return STATUSES[i].label;
    return key;
  }

  function countBy(key) {
    return jobs.filter(function (j) { return j.status === key; }).length;
  }

  function renderJobs() {
    renderStats();
    renderFilters();
    var visible = filter === 'all' ? jobs : jobs.filter(function (j) { return j.status === filter; });
    jobListEl.innerHTML = '';
    jobEmptyEl.hidden = jobs.length !== 0;
    visible.forEach(function (it) { jobListEl.appendChild(makeJobCard(it)); });
  }

  function renderStats() {
    var total = jobs.length;
    var active = jobs.filter(function (j) { return ACTIVE_KEYS[j.status]; }).length;
    var offers = countBy('offer');
    var fails = countBy('fail');
    jobStatsEl.innerHTML =
      statCard(total, '投递总数') +
      statCard(active, '进行中') +
      statCard(offers, 'offer', 'offer') +
      statCard(fails, '已挂', 'fail');
  }

  function statCard(num, label, cls) {
    return '<div class="stat-card">' +
      '<div class="stat-num ' + (cls || '') + '">' + num + '</div>' +
      '<div class="stat-label">' + label + '</div>' +
      '</div>';
  }

  function renderFilters() {
    filterBarEl.innerHTML = '';
    filterBarEl.appendChild(makeFilterChip('all', '全部', jobs.length));
    STATUSES.forEach(function (s) {
      filterBarEl.appendChild(makeFilterChip(s.key, s.label, countBy(s.key)));
    });
  }

  function makeFilterChip(key, label, count) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (filter === key ? ' active' : '');
    btn.textContent = label + ' · ' + count;
    btn.addEventListener('click', function () {
      filter = key;
      renderFilters();
      renderList();
    });
    return btn;
  }

  function renderList() {
    var visible = filter === 'all' ? jobs : jobs.filter(function (j) { return j.status === filter; });
    jobListEl.innerHTML = '';
    visible.forEach(function (it) { jobListEl.appendChild(makeJobCard(it)); });
  }

  function makeJobCard(it) {
    var card = document.createElement('div');
    card.className = 'job-card st-' + it.status;
    card.setAttribute('data-id', it.id);

    /* 主行 */
    var main = document.createElement('div');
    main.className = 'job-main';

    var company = document.createElement('div');
    company.className = 'job-company';
    company.textContent = it.company;

    var meta = document.createElement('div');
    meta.className = 'job-meta';
    var date = document.createElement('span');
    date.className = 'job-date';
    date.textContent = it.date ? it.date : '—';
    meta.appendChild(date);
    meta.appendChild(spanDot());
    if (it.link) {
      var a = document.createElement('a');
      a.className = 'job-link';
      a.href = it.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '招聘链接 ↗';
      meta.appendChild(a);
      meta.appendChild(spanDot());
    }
    var statusTxt = document.createElement('span');
    statusTxt.className = 'job-status-text';
    statusTxt.textContent = statusLabel(it.status);
    meta.appendChild(statusTxt);

    /* 控制区 */
    var controls = document.createElement('div');
    controls.className = 'job-controls';

    var selWrap = document.createElement('div');
    selWrap.className = 'status-sel-wrap';
    var sel = document.createElement('select');
    sel.className = 'status-sel opt-' + it.status;
    STATUSES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.key;
      opt.textContent = s.label;
      if (s.key === it.status) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      it.status = sel.value;
      card.className = 'job-card st-' + it.status;
      sel.className = 'status-sel opt-' + it.status;
      saveLocal();
      renderStats();
      renderFilters();
    });
    selWrap.appendChild(sel);
    controls.appendChild(selWrap);

    var noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'job-btn';
    noteBtn.textContent = '📝';
    noteBtn.title = '备注 / 面试记录';
    noteBtn.addEventListener('click', function () {
      noteSection.classList.toggle('open');
    });
    controls.appendChild(noteBtn);

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'job-btn';
    editBtn.textContent = '✎';
    editBtn.title = '编辑(公司/链接/日期)';
    editBtn.addEventListener('click', function () {
      openAddModal(it);
    });
    controls.appendChild(editBtn);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'job-btn del';
    delBtn.textContent = '✕';
    delBtn.title = '删除';
    delBtn.addEventListener('click', function () {
      if (!window.confirm('删除「' + it.company + '」这条投递?')) return;
      jobs = jobs.filter(function (x) { return x !== it; });
      saveLocal();
      renderJobs();
    });
    controls.appendChild(delBtn);

    main.appendChild(company);
    main.appendChild(meta);
    main.appendChild(controls);
    card.appendChild(main);

    /* 备注区 */
    var noteSection = document.createElement('div');
    noteSection.className = 'job-note';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'note-toggle';
    toggle.textContent = '▾ 备注 / 面试记录' + (it.note ? ' · 有记录' : '');
    toggle.addEventListener('click', function () {
      noteSection.classList.toggle('open');
    });
    var ta = document.createElement('textarea');
    ta.className = 'note-box';
    ta.placeholder = '记录面试问题、回答情况、复盘要点…';
    ta.value = it.note;
    ta.addEventListener('input', function () {
      it.note = ta.value;
      saveLocal();
      toggle.textContent = '▾ 备注 / 面试记录' + (it.note ? ' · 有记录' : '');
    });

    noteSection.appendChild(toggle);
    noteSection.appendChild(ta);
    card.appendChild(noteSection);

    return card;
  }

  function spanDot() {
    var s = document.createElement('span');
    s.className = 'dot';
    s.textContent = '·';
    return s;
  }

  /* ---- 添加 / 编辑弹窗 ---- */
  function openAddModal(job) {
    editingId = job ? job.id : null;
    document.getElementById('add-company').value = job ? job.company : '';
    document.getElementById('add-link').value = job ? job.link : '';
    document.getElementById('add-date').value = job ? job.date : '';
    document.getElementById('add-status').value = job ? job.status : 'applied';
    document.getElementById('add-modal-title').textContent = job ? '编辑投递' : '添加投递';
    document.getElementById('add-modal').hidden = false;
    document.getElementById('add-company').focus();
  }
  function closeAddModal() {
    document.getElementById('add-modal').hidden = true;
  }
  function onSubmitAdd(e) {
    e.preventDefault();
    var company = document.getElementById('add-company').value.trim();
    if (!company) { document.getElementById('add-company').focus(); return; }
    var link = document.getElementById('add-link').value.trim();
    var date = document.getElementById('add-date').value;
    var status = document.getElementById('add-status').value;
    if (editingId != null) {
      var it = null;
      for (var i = 0; i < jobs.length; i++) if (jobs[i].id === editingId) it = jobs[i];
      if (it) {
        it.company = company;
        it.link = link;
        it.date = date;
        it.status = status;
      }
    } else {
      jobs.push({
        id: ++uid,
        company: company,
        link: link,
        date: date,
        status: status,
        note: ''
      });
    }
    saveLocal();
    renderJobs();
    closeAddModal();
  }

  /* ---- 保存到 GitHub(永久) ---- */
  var GH_OWNER = 'creepacc';
  var GH_REPO = 'study-notes';
  var GH_PATH = '求职记录/jobs.json';
  var GH_TOKEN_KEY = 'site:gh_token';
  var saveStatusEl = document.getElementById('save-status');
  var saveShaKey = 'site:jobs_sha';

  function saveStatusMsg(msg, ok) {
    saveStatusEl.textContent = msg;
    saveStatusEl.className = 'save-status' + (ok ? ' ok' : (msg ? ' err' : ''));
  }

  function getToken() {
    try { return localStorage.getItem(GH_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function promptToken() {
    var t = window.prompt('粘贴你的 GitHub 个人访问令牌(PAT)。它只保存在本浏览器 localStorage,不会写进仓库。\n创建方法见对话说明。');
    if (t) {
      t = t.trim();
      if (t) {
        try { localStorage.setItem(GH_TOKEN_KEY, t); } catch (e) {}
        return t;
      }
    }
    return '';
  }

  function utf8B64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function apiGet(url, token) {
    return fetch(url, { headers: token ? { 'Authorization': 'token ' + token } : {} })
      .then(function (res) { return res.json(); })
      .then(function (cur) { return cur && cur.sha ? cur.sha : null; });
  }

  function apiPut(url, token, content, sha) {
    var body = { message: 'update job records', content: content };
    if (sha) body.sha = sha;
    return fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (j) { return { status: res.status, j: j }; });
    });
  }

  function saveToRepo() {
    var token = getToken();
    if (!token) token = promptToken();
    if (!token) { saveStatusMsg('未配置令牌,无法保存', false); return; }

    saveStatusMsg('保存中…', true);
    var encPath = GH_PATH.split('/').map(encodeURIComponent).join('/');
    var url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + encPath;
    var content = utf8B64(JSON.stringify(jobs, null, 2));
    var sha = null;
    try { sha = localStorage.getItem(saveShaKey) || null; } catch (e) {}

    var first = sha
      ? Promise.resolve(sha)
      : apiGet(url, token).then(function (s) { return s || null; });

    first
      .then(function (s) { return apiPut(url, token, content, s); })
      .then(function (r) {
        if (r.status === 409 || (r.status === 422 && !sha)) {
          return apiGet(url, token).then(function (s) { return apiPut(url, token, content, s); });
        }
        return r;
      })
      .then(function (r) {
        if (r.status === 422 || r.status === 409) throw new Error(r.j && r.j.message ? r.j.message : 'HTTP ' + r.status);
        if (r.status >= 400) throw new Error('HTTP ' + r.status);
        if (r.j && r.j.content && r.j.content.sha) {
          try { localStorage.setItem(saveShaKey, r.j.content.sha); } catch (e) {}
        }
        saveStatusMsg('已保存 ✓ 约1分钟后所有设备可见', true);
      })
      .catch(function (err) {
        saveStatusMsg('保存失败:' + (err && err.message ? err.message : '请检查令牌/网络'), false);
      });
  }

  /* ================= 学习笔记 ================= */
  var notes = [];
  var noteContentEl, tocEl, pickerEl;
  var tocItems = [];
  var tocUid = 0;
  var lastActive = null;

  function initNotes() {
    noteContentEl = document.getElementById('note-content');
    tocEl = document.getElementById('notes-toc');
    pickerEl = document.getElementById('note-picker');

    fetch('学习笔记/notes.json')
      .then(function (r) { if (!r.ok) throw new Error('no file'); return r.json(); })
      .then(function (data) {
        notes = Array.isArray(data) ? data : [];
        renderNotePicker();
        if (notes.length) loadNote('学习笔记/' + notes[0].file);
        else noteContentEl.innerHTML = '<div class="note-empty">暂无笔记</div>';
      })
      .catch(function () {
        noteContentEl.innerHTML = '<div class="loading">笔记加载失败</div>';
      });
  }

  function renderNotePicker() {
    pickerEl.innerHTML = '';
    notes.forEach(function (n, i) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'note-pill' + (i === 0 ? ' active' : '');
      pill.textContent = n.title;
      pill.addEventListener('click', function () {
        Array.prototype.forEach.call(pickerEl.children, function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        loadNote('学习笔记/' + n.file);
      });
      pickerEl.appendChild(pill);
    });
  }

  function loadNote(file) {
    noteContentEl.innerHTML = '<div class="loading">加载中…</div>';
    fetch(file)
      .then(function (r) { if (!r.ok) throw new Error('no file'); return r.text(); })
      .then(function (md) {
        noteContentEl.innerHTML = marked.parse(md);
        buildToc();
      })
      .catch(function () {
        noteContentEl.innerHTML = '<div class="loading">笔记内容加载失败</div>';
      });
  }

  function buildToc() {
    tocEl.innerHTML = '';
    tocItems = [];
    lastActive = null;
    tocUid = 0;
    var heads = noteContentEl.querySelectorAll('h2, h3');
    if (!heads.length) {
      tocEl.innerHTML = '<div class="notes-toc-title">目录</div><div class="note-empty">无章节</div>';
      return;
    }
    tocEl.innerHTML = '<div class="notes-toc-title">目录</div>';
    var list = document.createElement('ul');
    tocEl.appendChild(list);
    var chapter = null;

    heads.forEach(function (h) {
      if (!h.id) h.id = 'sec-' + (++tocUid);
      if (h.tagName === 'H2') {
        chapter = makeTocFolder(h);
        list.appendChild(chapter.li);
      } else if (chapter) {
        chapter.child.appendChild(makeTocLeaf(h));
      } else {
        list.appendChild(makeTocLeaf(h));
      }
    });
    tocEl.appendChild(list);
  }

  function makeTocFolder(h) {
    var li = document.createElement('li');
    li.className = 'toc-folder';
    var row = document.createElement('div');
    row.className = 'toc-row';
    var caret = document.createElement('span');
    caret.className = 'caret';
    var label = document.createElement('span');
    label.textContent = h.textContent;
    row.appendChild(caret);
    row.appendChild(label);
    row.addEventListener('click', function () {
      li.classList.toggle('open');
      if (li.classList.contains('open')) scrollToHeading(h);
    });
    li.appendChild(row);
    var child = document.createElement('ul');
    child.className = 'toc-children';
    li.appendChild(child);
    return { li: li, child: child };
  }

  function makeTocLeaf(h) {
    var li = document.createElement('li');
    li.className = 'toc-leaf';
    var a = document.createElement('a');
    a.textContent = h.textContent;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      scrollToHeading(h);
    });
    li.appendChild(a);
    tocItems.push({ h: h, a: a });
    return li;
  }

  function scrollToHeading(h) {
    var viewer = noteContentEl.closest('.note-viewer');
    var scrollParent = viewer && viewer.scrollHeight > viewer.clientHeight
      ? viewer
      : document.querySelector('.main');
    var top = h.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop - 18;
    scrollParent.scrollTo({ top: top, behavior: 'smooth' });
  }

  function scrollSpy() {
    var viewer = noteContentEl.closest('.note-viewer');
    var scrollParent = viewer && viewer.scrollHeight > viewer.clientHeight ? viewer : document.querySelector('.main');
    var line = scrollParent.getBoundingClientRect().top + 120;
    var active = null;
    for (var i = 0; i < tocItems.length; i++) {
      if (tocItems[i].h.getBoundingClientRect().top <= line) active = tocItems[i];
    }
    if (active !== lastActive) {
      if (lastActive) lastActive.a.classList.remove('active');
      if (active) {
        active.a.classList.add('active');
        var node = active.a.parentElement;
        while (node && node !== tocEl) {
          node = node.parentElement;
          if (node && node.classList && node.classList.contains('toc-folder')) node.classList.add('open');
        }
      }
      lastActive = active;
    }
  }

  var spyTicking = false;
  document.querySelector('.main').addEventListener('scroll', function () {
    if (!spyTicking) {
      spyTicking = true;
      requestAnimationFrame(function () { scrollSpy(); spyTicking = false; });
    }
  });

  /* ================= 面试经验 ================= */
  function initInterview() {
    fetch('面试经验/interview.md')
      .then(function (r) { if (!r.ok) throw new Error('no file'); return r.text(); })
      .then(function (md) {
        document.getElementById('interview-content').innerHTML = marked.parse(md);
      })
      .catch(function () {
        document.getElementById('interview-content').innerHTML = '<div class="loading">加载失败</div>';
      });
  }
})();
