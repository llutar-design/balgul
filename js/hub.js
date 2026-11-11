/* 백제 역사 체험관 — 통합 관리자
 * 게임 등록·실행(한 번에 하나), 통합 메인 화면, 게임 시작 패널, 공통 보상(탐험 별·도감·배지), 역사 도감, 특별 전시,
 * 게임 오류 격리, 선생님 설정의 체험관 항목. 게임 연결 규약은 docs/GAME_API.md 참고. */
(function () {
  'use strict';

  var KEY_HUB = 'baekje-hub.save.v1', KEY_GAME = 'baekje-hub.game.', KEY_CARD = 'baekje-hub.cardOverrides.v1';
  var ORDER = ['excavation', 'village', 'crossword', 'defense'];
  var META = {
    excavation: { title: '백제 보물 발굴 탐험대', desc: '신비로운 백제의 보물을 찾아라!', reward: '유물 도감', color: '#c98a2e',
      howto: ['유적지를 골라 손가락으로 흙을 걷어 내요.', '작은 삽 → 발굴 붓 → 정밀 붓 순서로 조심스럽게 파요.', '드러난 유물을 기록 도구로 찍어 발굴 수첩에 남겨요.', '유물을 수습하고 탐구 활동과 퀴즈를 풀어요.', '모은 유물은 백제 박물관에 전시해요.'] },
    village: { title: '백제마을 만들기', desc: '내 손으로 찬란한 사비를 건설하자!', reward: '건축 도감', color: '#5f9a4c',
      howto: ['아래 건물 카드를 손가락으로 끌어 빈 땅에 놓아요.', '초록 칸에는 지을 수 있고, 빨간 칸에는 지을 수 없어요.', '도로로 건물을 이으면 일을 더 잘해요.', '식량·나무·흙·문화 점수를 모아 미션을 해결해요.', '친구와 함께 하나의 마을을 지을 수 있어요.'] },
    crossword: { title: '백제 십자 낱말풀이', desc: '백제의 비밀 단어를 완성하자!', reward: '역사 지식 배지', color: '#3e7fb8',
      howto: ['격자판의 번호 칸이나 문제 목록을 눌러 낱말을 골라요.', '힌트를 읽고 아래 글자판에서 글자를 하나씩 눌러요.', '가로와 세로 낱말이 만나는 칸은 글자가 같아야 해요.', '틀려도 괜찮아요. 다시 도전할 수 있어요.', '모든 낱말을 채우면 퍼즐 완성!'] },
    defense: { title: '부소산을 막아라!', desc: '힘을 합쳐 부소산성을 지켜라!', reward: '방어 임무 배지', color: '#b5523c',
      howto: ['아래에서 방어 시설을 골라 지도 위 설치 지점으로 끌어요.', '활쏘기 진지·성벽·감시초소·보급 창고를 알맞게 배치해요.', '적이 길을 따라 성문으로 와요. 성문 내구도를 지켜요.', '자원은 한정되어 있어요. 어디에 쓸지 함께 의논해요.', '이 게임은 상상으로 만든 교육용 시뮬레이션이에요.'] }
  };
  var DIFF = [['easy', '쉬움', '1~2학년'], ['normal', '보통', '3~4학년'], ['hard', '어려움', '5~6학년']];
  var SPECIAL = [
    { need: 5, id: 'map', title: '사비 도성 한눈에 보기', icon: '🗺️' },
    { need: 15, id: 'exchange', title: '바다 건너 백제 문화의 길', icon: '⛵' },
    { need: 30, id: 'hall', title: '백제 탐험 명예의 전당', icon: '🏅' }
  ];

  var registry = {};
  var hub = freshHub();
  var active = null;          // { id, inst, host, root }
  var errLog = [];
  var codexTab = 'artifact';

  function freshHub() { return { stars: {}, codex: {}, badges: {}, records: {}, plays: {} }; }
  function $(s) { return document.querySelector(s); }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; }
  function today() { var d = new Date(); return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.'; }
  function S() { return App.settings; }
  function raw() { return window.BAEKJE_DATA || {}; }
  function cardsData() { return (raw().historyCards || { categories: [], cards: [] }); }
  function overrides() { return App.store.get(KEY_CARD) || {}; }
  function card(id) {
    var c = cardsData().cards.filter(function (x) { return x.id === id; })[0];
    if (!c) return null;
    var o = overrides()[id];
    return o ? Object.assign({}, c, o) : c;
  }
  function persistHub() { App.store.set(KEY_HUB, hub); }

  /* ---------------- 공통 보상 ---------------- */
  function totalStars() {
    var n = 0;
    Object.keys(hub.stars).forEach(function (k) { n += hub.stars[k] || 0; });
    var sb = App.save.stageBest || {};
    Object.keys(sb).forEach(function (k) { n += (sb[k] && sb[k].stars) || 0; });   // 발굴 게임 스테이지 별
    return n;
  }
  function award(gameId, o) {
    o = o || {};
    var res = { newCodex: [], starsGained: 0, newBadge: null };
    var before = totalStars();
    if (o.key && o.stars) {
      var k = gameId + ':' + o.key;
      var s = Math.max(0, Math.min(3, o.stars | 0));
      if (!hub.stars[k] || hub.stars[k] < s) hub.stars[k] = s;      // 같은 단계는 최고 기록만 (반복 수집 방지)
    }
    (o.codex || []).forEach(function (id) {
      var c = card(id);
      if (c && !hub.codex[id]) { hub.codex[id] = { date: today(), from: gameId }; res.newCodex.push(c); }
    });
    if (o.badge && o.badge.id) {
      hub.badges[gameId] = hub.badges[gameId] || {};
      if (!hub.badges[gameId][o.badge.id]) {
        hub.badges[gameId][o.badge.id] = { name: o.badge.name, icon: o.badge.icon || '🏅', date: today() };
        res.newBadge = o.badge;
      }
    }
    persistHub();
    res.starsGained = totalStars() - before;
    var after = totalStars();
    SPECIAL.forEach(function (sp) { if (before < sp.need && after >= sp.need) App.toast('🏛️ 특별 전시 「' + sp.title + '」가 열렸어요!', { big: true, dur: 4000, key: 'sp' + sp.id }); });
    if (res.newCodex.length && !o.silent) App.toast('📚 도감 등록: ' + res.newCodex.map(function (c) { return c.title; }).join(', '), { dur: 3200, key: 'codex' });
    return res;
  }

  /* ---------------- 게임 실행 ---------------- */
  function makeHost(id, opts) {
    var host = {
      id: id,
      options: opts,
      data: raw(),
      PCOL: ['#e8553e', '#3e8acb', '#4caf6a', '#b55bd6'],
      PNAME: ['빨강', '파랑', '초록', '보라'],
      SIDES: ['bottom', 'top', 'left', 'right'],
      mapPoint: function (cx, cy) { return App.mapPoint(cx, cy); },
      scale: function () { return App.scale(); },
      sound: function (n, p) { Sound.play(n, p); },
      load: function () { return App.store.get(KEY_GAME + id); },
      save: function (obj) { return App.store.set(KEY_GAME + id, obj); },
      toast: function (t, o) { App.toast(t, o); },
      modal: function (c, o) { return App.modal(c, o); },
      award: function (o) { return award(id, o); },
      setRecord: function (text) { hub.records[id] = { text: String(text), date: today() }; persistHub(); },
      card: card,
      isUnlockedCard: function (cid) { return !!hub.codex[cid]; },
      exit: function () { exitGame(); },
      error: function (e) { gameError(e); },
      isActive: function () { return !!active && active.host === host; }
    };
    return host;
  }

  function launch(id, opts) {
    if (id === 'excavation') {
      S().difficulty = opts.difficulty; S().players = opts.players; App.saveSettings();
      App.startExcavation(opts.players);
      return;
    }
    var def = registry[id];
    if (!def) { App.toast('이 게임을 불러오지 못했어요. 파일이 있는지 확인해 주세요.'); return; }
    unmount();
    App.show('scr-game');
    var screen = $('#scr-game');
    var root = el('div', 'game-root game-' + id);
    screen.insertBefore(root, screen.firstChild);
    var host = makeHost(id, opts);
    hub.plays[id] = (hub.plays[id] || 0) + 1; persistHub();
    active = { id: id, host: host, root: root, inst: null };
    errLog = [];
    try {
      active.inst = def.mount(root, host) || {};
    } catch (e) {
      console.error(e);
      unmount();
      App.show('scr-hub');
      App.toast('게임을 시작하는 중 문제가 생겼어요. 다른 게임은 계속 즐길 수 있어요.', { dur: 4000 });
    }
  }
  function unmount() {
    if (!active) return;
    var a = active; active = null;
    try { a.inst && a.inst.unmount && a.inst.unmount(); } catch (e) { console.error(e); }
    if (a.root && a.root.parentNode) a.root.parentNode.removeChild(a.root);
  }
  function pauseGame() { if (active && active.inst && active.inst.pause) try { active.inst.pause(); } catch (e) { console.error(e); } }
  function resumeGame() { if (active && active.inst && active.inst.resume) try { active.inst.resume(); } catch (e) { console.error(e); } }
  function exitGame() { App.closeAllModals(); unmount(); App.show('scr-hub'); }
  function confirmExit() {
    if (!active) { App.show('scr-hub'); return; }
    pauseGame();
    var box = el('div', 'pause-box');
    box.appendChild(el('h2', '', '🏛️ 체험관으로 돌아갈까요?'));
    box.appendChild(el('p', 'hub-small', (META[active.id] || {}).title + ' 진행 내용은 게임마다 저장된 부분까지 남아요.'));
    var m;
    var add = function (label, cls, fn) { var b = el('button', 'big-btn ' + cls, '<span>' + label + '</span>'); b.addEventListener('click', function () { Sound.play('select'); fn(); }); box.appendChild(b); };
    add('계속하기', 'primary', function () { m.close(); });
    add('체험관으로 나가기', '', function () { exitGame(); });
    m = App.modal(box, { cls: 'small', onClose: function () { if (active) resumeGame(); } });
  }
  // 한 게임의 오류가 짧은 시간에 반복되면 그 게임만 닫고 체험관으로 돌아간다 (다른 게임에는 영향 없음)
  function gameError(e) {
    console.error(e);
    if (!active) return false;
    var now = performance.now();
    errLog = errLog.filter(function (t) { return now - t < 6000; });
    errLog.push(now);
    if (errLog.length >= 3) {
      var t = (META[active.id] || {}).title;
      exitGame();
      App.toast('「' + t + '」에서 문제가 생겨 체험관으로 돌아왔어요. 다른 게임은 그대로 즐길 수 있어요.', { dur: 5000, key: 'crash' });
    }
    return true;
  }

  /* ---------------- 그림 (자체 제작 Canvas 일러스트) ---------------- */
  function lotus(g, x, y, r, col, a) {
    g.save(); g.translate(x, y); g.globalAlpha = a == null ? 1 : a;
    g.strokeStyle = col; g.lineWidth = Math.max(1.5, r * 0.05);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.stroke();
    for (var i = 0; i < 8; i++) {
      g.save(); g.rotate(i * Math.PI / 4);
      g.beginPath(); g.moveTo(0, -r * 0.24);
      g.bezierCurveTo(r * 0.2, -r * 0.4, r * 0.16, -r * 0.7, 0, -r * 0.76);
      g.bezierCurveTo(-r * 0.16, -r * 0.7, -r * 0.2, -r * 0.4, 0, -r * 0.24);
      g.stroke();
      g.beginPath(); g.arc(0, -r * 0.66, r * 0.035, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.stroke();
    for (i = 0; i < 6; i++) { g.beginPath(); g.arc(Math.cos(i) * r * 0.1, Math.sin(i) * r * 0.1, r * 0.025, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  function drawHubBg() {
    var c = $('#hub-bg'); if (!c) return;
    var g = c.getContext('2d');
    var bg = g.createRadialGradient(960, 420, 100, 960, 540, 1200);
    bg.addColorStop(0, '#3d2a52'); bg.addColorStop(0.5, '#23163a'); bg.addColorStop(1, '#120b1f');
    g.fillStyle = bg; g.fillRect(0, 0, 1920, 1080);
    // 먼 산과 강 (부소산과 백마강을 떠올리게 하는 실루엣)
    g.fillStyle = 'rgba(70,52,96,.7)';
    g.beginPath(); g.moveTo(0, 860);
    for (var x = 0; x <= 1920; x += 30) g.lineTo(x, 800 - Math.sin(x / 300) * 60 - Math.sin(x / 90 + 1) * 14);
    g.lineTo(1920, 1080); g.lineTo(0, 1080); g.fill();
    var rv = g.createLinearGradient(0, 900, 0, 1080);
    rv.addColorStop(0, 'rgba(232,184,74,.18)'); rv.addColorStop(1, 'rgba(232,184,74,.02)');
    g.fillStyle = rv;
    g.beginPath(); g.moveTo(0, 960);
    for (x = 0; x <= 1920; x += 30) g.lineTo(x, 940 + Math.sin(x / 200) * 16);
    g.lineTo(1920, 1080); g.lineTo(0, 1080); g.fill();
    // 연꽃무늬 수막새를 닮은 금빛 원형 문양
    lotus(g, 160, 150, 120, '#e8b84a', 0.22);
    lotus(g, 1760, 150, 120, '#e8b84a', 0.22);
    lotus(g, 960, 540, 520, '#e8b84a', 0.05);
    var rnd = Art.rng(7);
    for (var i = 0; i < 140; i++) {
      g.fillStyle = 'rgba(255,230,160,' + (0.08 + rnd() * 0.3) + ')';
      g.beginPath(); g.arc(rnd() * 1920, rnd() * 760, 0.8 + rnd() * 2, 0, Math.PI * 2); g.fill();
    }
    // 금빛 테두리
    g.strokeStyle = 'rgba(232,184,74,.55)'; g.lineWidth = 4; g.strokeRect(22, 22, 1876, 1036);
    g.strokeStyle = 'rgba(232,184,74,.25)'; g.lineWidth = 2; g.strokeRect(34, 34, 1852, 1012);
  }

  function isoBox(g, x, y, w, d, h, top, left, right) {
    // 아이소메트릭 상자: (x,y)는 바닥 앞 꼭짓점
    g.fillStyle = left; g.beginPath(); g.moveTo(x, y); g.lineTo(x - w, y - w / 2); g.lineTo(x - w, y - w / 2 - h); g.lineTo(x, y - h); g.fill();
    g.fillStyle = right; g.beginPath(); g.moveTo(x, y); g.lineTo(x + d, y - d / 2); g.lineTo(x + d, y - d / 2 - h); g.lineTo(x, y - h); g.fill();
    g.fillStyle = top; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - w, y - w / 2 - h); g.lineTo(x - w + d, y - w / 2 - d / 2 - h); g.lineTo(x + d, y - d / 2 - h); g.fill();
  }
  function isoRoof(g, x, y, w, d, h, rh, col, col2) {
    var tx = x, ty = y - h;
    g.fillStyle = col2;
    g.beginPath(); g.moveTo(tx - w - 8, ty - w / 2 + 4); g.lineTo(tx - w / 2 + d / 2, ty - w / 4 - d / 4 - rh); g.lineTo(tx + d / 2 + 4, ty - d / 4 - rh + 2); g.lineTo(tx + 4, ty + 6); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(tx + 4, ty + 6); g.lineTo(tx + d / 2 + 4, ty - d / 4 - rh + 2); g.lineTo(tx + d + 10, ty - d / 2 + 3); g.lineTo(tx + d / 2 + 4 - 0, ty - d / 4 + 10); g.fill();
    g.beginPath(); g.moveTo(tx - w - 8, ty - w / 2 + 4); g.lineTo(tx + 4, ty + 6); g.lineTo(tx + d / 2 + 4, ty - d / 4 - rh + 2); g.lineTo(tx - w / 2 + d / 2, ty - w / 4 - d / 4 - rh); g.fill();
  }
  function drawCardArt(id, g, W, H) {
    var x;
    g.clearRect(0, 0, W, H);
    if (id === 'excavation') {
      var sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#6d8a7a'); sky.addColorStop(1, '#e6c88f');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      [['#a8845a', 0.32], ['#8f6b43', 0.5], ['#7b5a37', 0.7], ['#6a4c2e', 0.88]].forEach(function (l, i) {
        g.fillStyle = l[0]; g.beginPath(); g.moveTo(0, H * l[1]);
        for (var xx = 0; xx <= W; xx += 20) g.lineTo(xx, H * l[1] + Math.sin(xx / 40 + i) * 5);
        g.lineTo(W, H); g.lineTo(0, H); g.fill();
      });
      var gl = g.createRadialGradient(W * 0.52, H * 0.64, 10, W * 0.52, H * 0.64, H * 0.5);
      gl.addColorStop(0, 'rgba(255,226,140,.95)'); gl.addColorStop(1, 'rgba(255,226,140,0)');
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
      g.save(); g.beginPath(); g.rect(0, 0, W, H * 0.8); g.clip();
      Art.draw(g, 'hyangno', W * 0.52 - H * 0.3, H * 0.28, H * 0.6, H * 0.6);
      g.restore();
      g.fillStyle = '#6a4c2e'; g.beginPath(); g.moveTo(0, H * 0.8);
      for (x = 0; x <= W; x += 20) g.lineTo(x, H * 0.8 + Math.sin(x / 30) * 6 - (Math.abs(x - W * 0.52) < 70 ? 0 : 4));
      g.lineTo(W, H); g.lineTo(0, H); g.fill();
      var rnd = Art.rng(3);
      for (var i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,240,190,' + rnd() + ')'; g.beginPath(); g.arc(W * 0.52 + (rnd() - 0.5) * 220, H * 0.3 + rnd() * H * 0.5, 1 + rnd() * 2.5, 0, 7); g.fill(); }
      // 붓
      g.save(); g.translate(W * 0.82, H * 0.3); g.rotate(0.7);
      g.fillStyle = '#8a5a2b'; g.fillRect(-6, -60, 12, 80); g.fillStyle = '#d9c49a'; g.beginPath(); g.moveTo(-9, 20); g.lineTo(9, 20); g.lineTo(5, 48); g.lineTo(-5, 48); g.fill();
      g.restore();
    } else if (id === 'village') {
      var sk = g.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, '#a9d3e8'); sk.addColorStop(1, '#e9f2d6');
      g.fillStyle = sk; g.fillRect(0, 0, W, H);
      g.fillStyle = '#86a86a'; g.beginPath(); g.moveTo(0, H * 0.45); g.quadraticCurveTo(W * 0.3, H * 0.32, W * 0.55, H * 0.44); g.quadraticCurveTo(W * 0.8, H * 0.3, W, H * 0.42); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = '#a7c47a'; g.beginPath(); g.moveTo(W * 0.5, H * 0.42); g.lineTo(W * 1.05, H * 0.7); g.lineTo(W * 0.5, H * 0.98); g.lineTo(-W * 0.05, H * 0.7); g.fill();
      g.fillStyle = '#7cb5d6'; g.beginPath(); g.moveTo(0, H * 0.86); g.quadraticCurveTo(W * 0.3, H * 0.78, W * 0.5, H * 0.98); g.lineTo(0, H); g.fill();
      g.strokeStyle = '#d8c08e'; g.lineWidth = 10; g.beginPath(); g.moveTo(W * 0.2, H * 0.64); g.lineTo(W * 0.5, H * 0.79); g.lineTo(W * 0.82, H * 0.63); g.stroke();
      // 궁궐 (기와 지붕), 집들, 시장
      isoBox(g, W * 0.52, H * 0.6, 60, 60, 34, '#d7c4a0', '#b89a6c', '#cbb185');
      isoRoof(g, W * 0.52, H * 0.6, 60, 60, 34, 30, '#5b5f6e', '#474a57');
      [[0.25, 0.66], [0.34, 0.73], [0.73, 0.68], [0.64, 0.76]].forEach(function (p, j) {
        isoBox(g, W * p[0], H * p[1], 26, 26, 18, '#e2cfa8', '#b8996a', '#d1b98d');
        isoRoof(g, W * p[0], H * p[1], 26, 26, 18, 18, j % 2 ? '#c9a24a' : '#5b5f6e', j % 2 ? '#a9852e' : '#474a57');
      });
      // 시장 천막
      g.fillStyle = '#e8553e'; g.beginPath(); g.moveTo(W * 0.82, H * 0.74); g.lineTo(W * 0.88, H * 0.66); g.lineTo(W * 0.94, H * 0.74); g.fill();
      g.fillStyle = '#3e8acb'; g.beginPath(); g.moveTo(W * 0.74, H * 0.82); g.lineTo(W * 0.8, H * 0.74); g.lineTo(W * 0.86, H * 0.82); g.fill();
      // 주민
      [[0.42, 0.75, '#e8553e'], [0.58, 0.73, '#3e8acb'], [0.3, 0.7, '#4caf6a']].forEach(function (p) {
        g.fillStyle = p[2]; g.beginPath(); g.arc(W * p[0], H * p[1] - 10, 5, 0, 7); g.fill();
        g.fillRect(W * p[0] - 4, H * p[1] - 6, 8, 10);
      });
      // 나무
      [[0.1, 0.5], [0.9, 0.5], [0.15, 0.56]].forEach(function (p) { g.fillStyle = '#4f7f3a'; g.beginPath(); g.arc(W * p[0], H * p[1], 16, 0, 7); g.fill(); });
    } else if (id === 'crossword') {
      g.fillStyle = '#1e3550'; g.fillRect(0, 0, W, H);
      lotus(g, W / 2, H / 2, H * 0.48, '#e8b84a', 0.18);
      var cs = Math.min(W, H) / 6.2, ox = W / 2 - cs * 2.5, oy = H / 2 - cs * 2.5;
      var grid = ['백제 · ', '마 · 사', '강성왕비', ' 부 흥 ', ' 여 사 '];
      grid.forEach(function (row, r) {
        for (var cc = 0; cc < 5; cc++) {
          var ch = row[cc]; if (ch === ' ' || ch === undefined) continue;
          var bx = ox + cc * cs, by = oy + r * cs;
          var gold = '백제사비'.indexOf(ch) >= 0 && ch !== '·';
          g.fillStyle = ch === '·' ? '#f4ead0' : (gold ? '#f2c75c' : '#fbf3de');
          g.fillRect(bx + 2, by + 2, cs - 4, cs - 4);
          g.strokeStyle = '#8a6a2a'; g.lineWidth = 2; g.strokeRect(bx + 2, by + 2, cs - 4, cs - 4);
          if (ch !== '·') { g.fillStyle = '#3a2412'; g.font = 'bold ' + (cs * 0.5 | 0) + 'px "Malgun Gothic"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, bx + cs / 2, by + cs / 2 + 2); }
        }
      });
      g.fillStyle = 'rgba(255,230,150,.9)'; g.font = 'bold 18px "Malgun Gothic"'; g.textAlign = 'left';
      g.fillText('1', ox + 6, oy + 20);
    } else if (id === 'defense') {
      var s2 = g.createLinearGradient(0, 0, 0, H); s2.addColorStop(0, '#f3c98b'); s2.addColorStop(1, '#f7e4bf');
      g.fillStyle = s2; g.fillRect(0, 0, W, H);
      g.fillStyle = '#6f9461'; g.beginPath(); g.moveTo(-10, H * 0.75); g.quadraticCurveTo(W * 0.25, H * 0.18, W * 0.55, H * 0.2); g.quadraticCurveTo(W * 0.85, H * 0.24, W + 10, H * 0.7); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = '#5b8250'; for (var t = 0; t < 14; t++) { g.beginPath(); g.arc(W * (0.08 + t * 0.065), H * (0.5 + Math.sin(t) * 0.08), 14, 0, 7); g.fill(); }
      // 성벽과 성문
      g.fillStyle = '#b9a88a'; g.beginPath(); g.moveTo(W * 0.12, H * 0.62); g.quadraticCurveTo(W * 0.5, H * 0.36, W * 0.88, H * 0.6); g.lineTo(W * 0.88, H * 0.68); g.quadraticCurveTo(W * 0.5, H * 0.45, W * 0.12, H * 0.7); g.fill();
      g.strokeStyle = '#8c7a5c'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#9d8b6c'; g.fillRect(W * 0.43, H * 0.38, W * 0.14, H * 0.16);
      isoRoof(g, W * 0.5 + 8, H * 0.38, W * 0.09, W * 0.09, 0, 18, '#5b5f6e', '#474a57');
      g.fillStyle = '#5a3a1e'; g.beginPath(); g.moveTo(W * 0.47, H * 0.54); g.lineTo(W * 0.47, H * 0.45); g.quadraticCurveTo(W * 0.5, H * 0.41, W * 0.53, H * 0.45); g.lineTo(W * 0.53, H * 0.54); g.fill();
      // 깃발
      [[0.3, 0.44], [0.7, 0.44]].forEach(function (p) { g.strokeStyle = '#5a3a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * p[0], H * p[1]); g.lineTo(W * p[0], H * p[1] - 40); g.stroke(); g.fillStyle = '#e8b84a'; g.beginPath(); g.moveTo(W * p[0], H * p[1] - 40); g.lineTo(W * p[0] + 28, H * p[1] - 32); g.lineTo(W * p[0], H * p[1] - 24); g.fill(); });
      // 귀여운 수비대
      [[0.36, 0.78, '#e8553e'], [0.5, 0.82, '#3e8acb'], [0.64, 0.78, '#4caf6a'], [0.22, 0.84, '#b55bd6']].forEach(function (p) {
        var x0 = W * p[0], y0 = H * p[1];
        g.fillStyle = p[2]; g.beginPath(); g.ellipse(x0, y0 + 14, 14, 18, 0, 0, 7); g.fill();
        g.fillStyle = '#f6d7b0'; g.beginPath(); g.arc(x0, y0 - 10, 13, 0, 7); g.fill();
        g.fillStyle = '#5b5f6e'; g.beginPath(); g.arc(x0, y0 - 14, 13, Math.PI, 0); g.fill();
        g.fillStyle = '#3a2412'; g.beginPath(); g.arc(x0 - 4, y0 - 9, 1.8, 0, 7); g.arc(x0 + 4, y0 - 9, 1.8, 0, 7); g.fill();
      });
      g.strokeStyle = '#d8c08e'; g.lineWidth = 8; g.setLineDash([12, 8]); g.beginPath(); g.moveTo(W, H * 0.95); g.quadraticCurveTo(W * 0.8, H * 0.8, W * 0.52, H * 0.6); g.stroke(); g.setLineDash([]);
    }
  }

  /* ---------------- 통합 메인 화면 ---------------- */
  function enabled(id) { var e = S().gamesEnabled || {}; return e[id] !== false; }
  function diffOf(id) {
    var d = (S().gameDifficulty || {})[id];
    if (d) return d;
    var gr = S().grade || 3;
    return gr <= 2 ? 'easy' : gr <= 4 ? 'normal' : 'hard';
  }
  function recordText(id) {
    if (id === 'excavation') {
      var got = Object.keys(App.save.collected).filter(function (k) { return !!App.data.artifactsById[k]; }).length;
      var sb = App.save.stageBest || {}, st = 0; Object.keys(sb).forEach(function (k) { st += sb[k].stars || 0; });
      return App.save.plays ? '유물 ' + got + '/' + App.data.artifacts.length + ' · 별 ' + st : '';
    }
    return hub.records[id] ? hub.records[id].text : '';
  }
  function gameStars(id) {
    if (id === 'excavation') { var sb = App.save.stageBest || {}, n = 0; Object.keys(sb).forEach(function (k) { n += sb[k].stars || 0; }); return n; }
    var t = 0; Object.keys(hub.stars).forEach(function (k) { if (k.indexOf(id + ':') === 0) t += hub.stars[k]; }); return t;
  }
  function renderHub() {
    var box = $('#hub-cards'); if (!box) return;
    box.innerHTML = '';
    ORDER.forEach(function (id, i) {
      var m = META[id];
      var on = enabled(id), ready = id === 'excavation' || !!registry[id];
      var c = el('button', 'hub-card' + (on && ready ? '' : ' off'));
      c.style.setProperty('--accent', m.color);
      c.style.animationDelay = (i * 0.08) + 's';
      var cv = el('canvas', 'hub-art');
      var g = Activities.hiDpi(cv, 372, 270);
      try { drawCardArt(id, g, 372, 270); } catch (e) { console.error(e); }
      c.appendChild(cv);
      c.appendChild(el('div', 'hub-card-num', String(i + 1)));
      c.appendChild(el('h3', '', m.title));
      c.appendChild(el('p', '', '“' + m.desc + '”'));
      var rec = recordText(id);
      c.appendChild(el('div', 'hub-card-rec', (gameStars(id) ? '⭐ ' + gameStars(id) + ' · ' : '') + (rec || '아직 기록이 없어요')));
      if (!on) c.appendChild(el('div', 'hub-card-lock', '선생님이 잠가 두었어요'));
      else if (!ready) c.appendChild(el('div', 'hub-card-lock', '불러오지 못했어요'));
      c.addEventListener('click', function () {
        if (!on || !ready) { Sound.play('wrong'); return; }
        Sound.play('select'); openLaunch(id, c);
      });
      box.appendChild(c);
    });
    var cd = cardsData().cards, got = cd.filter(function (x) { return hub.codex[x.id]; }).length;
    $('#hub-codex-n').textContent = got + '/' + cd.length;
    $('#hub-stars-n').textContent = totalStars();
    var nextSp = SPECIAL.filter(function (sp) { return totalStars() < sp.need; })[0];
    $('#hub-special-n').textContent = nextSp ? '⭐' + (nextSp.need - totalStars()) + '개 더' : '모두 열림';
    var vol = $('#hub-vol'); vol.value = Math.round(S().volume * 100);
    $('#hub-mute').textContent = S().muted ? '🔇' : '🔊';
  }

  function openLaunch(id, cardEl) {
    var m = META[id];
    if (cardEl) cardEl.classList.add('zoom');
    var opts = { players: S().players || 1, difficulty: diffOf(id) };
    var box = el('div', 'launch');
    var art = el('canvas', 'launch-art'); var g = Activities.hiDpi(art, 520, 380); drawCardArt(id, g, 520, 380);
    var left = el('div', 'launch-left'); left.appendChild(art);
    left.appendChild(el('div', 'launch-reward', '🎁 모으는 보상: <b>' + m.reward + '</b> · ⭐ 백제 탐험 별'));
    var rec = recordText(id);
    left.appendChild(el('div', 'launch-rec', '📋 내 기록: ' + (rec || '아직 없어요') + (gameStars(id) ? ' · 별 ' + gameStars(id) + '개' : '')));
    var badges = hub.badges[id] ? Object.keys(hub.badges[id]).map(function (k) { var b = hub.badges[id][k]; return '<span class="badge-chip">' + b.icon + ' ' + b.name + '</span>'; }).join('') : '';
    if (badges) left.appendChild(el('div', 'launch-badges', badges));
    box.appendChild(left);
    var right = el('div', 'launch-right');
    right.appendChild(el('h2', '', m.title));
    right.appendChild(el('p', 'launch-desc', m.desc));
    function segRow(label, list, key) {
      var row = el('div', 'launch-row'); row.appendChild(el('label', '', label));
      var gg = el('div', 'segs');
      list.forEach(function (op) {
        var b = el('button', 'seg' + (opts[key] === op[0] ? ' on' : ''), op[1] + (op[2] ? '<small>' + op[2] + '</small>' : ''));
        b.addEventListener('click', function () {
          opts[key] = op[0]; Sound.play('tap');
          gg.querySelectorAll('.seg').forEach(function (x) { x.classList.toggle('on', x === b); });
          if (key === 'difficulty') { S().gameDifficulty = Object.assign({}, S().gameDifficulty, (function (o) { o[id] = op[0]; return o; })({})); App.saveSettings(); }
        });
        gg.appendChild(b);
      });
      row.appendChild(gg); right.appendChild(row);
    }
    segRow('난이도', DIFF, 'difficulty');
    segRow('함께 하는 사람', [[1, '1명'], [2, '2명'], [3, '3명'], [4, '4명']], 'players');
    var bt = el('div', 'launch-btns');
    var go = el('button', 'big-btn primary', '<span>▶ 게임 시작</span>');
    var how = el('button', 'big-btn', '<span>📖 게임 설명</span>');
    bt.appendChild(go); bt.appendChild(how); right.appendChild(bt);
    box.appendChild(right);
    var md = App.modal(box, { close: true, cls: 'wide launch-modal', onClose: function () { if (cardEl) cardEl.classList.remove('zoom'); } });
    go.addEventListener('click', function () {
      Sound.play('select');
      opts.grade = S().grade; opts.timeLimit = S().timeLimit; opts.unlockAll = S().unlockAll; opts.testMode = S().testMode;
      md.close(); launch(id, opts);
    });
    how.addEventListener('click', function () { Sound.play('select'); showHowto(id); });
  }
  function showHowto(id) {
    var m = META[id];
    var box = el('div', 'howto-box');
    box.appendChild(el('h2', '', '📖 ' + m.title + ' 게임 방법'));
    box.appendChild(el('ol', '', m.howto.map(function (t) { return '<li>' + t + '</li>'; }).join('')));
    var def = registry[id];
    if (def && def.notice) box.appendChild(el('p', 'hub-notice', '⚠️ ' + def.notice));
    App.modal(box, { close: true, cls: 'wide' });
  }

  /* ---------------- 역사 도감 ---------------- */
  function renderCodex() {
    var cd = cardsData();
    var tabs = $('#codex-tabs'); tabs.innerHTML = '';
    cd.categories.forEach(function (cat) {
      var n = cd.cards.filter(function (c) { return c.category === cat.id; });
      var got = n.filter(function (c) { return hub.codex[c.id]; }).length;
      var b = el('button', 'codex-tab' + (codexTab === cat.id ? ' on' : ''), cat.icon + ' ' + cat.name + ' <small>' + got + '/' + n.length + '</small>');
      b.addEventListener('click', function () { codexTab = cat.id; Sound.play('tap'); renderCodex(); });
      tabs.appendChild(b);
    });
    var grid = $('#codex-grid'); grid.innerHTML = '';
    cd.cards.filter(function (c) { return c.category === codexTab; }).forEach(function (c0) {
      var c = card(c0.id), got = !!hub.codex[c.id];
      var it = el('button', 'codex-card' + (got ? '' : ' locked'));
      it.appendChild(el('div', 'codex-icon', got ? c.icon || '📜' : '❔'));
      it.appendChild(el('b', '', got ? c.title : '???'));
      it.appendChild(el('small', '', got ? (META[hub.codex[c.id].from] ? META[hub.codex[c.id].from].title : '') : hintFor(c)));
      it.addEventListener('click', function () {
        if (!got) { Sound.play('wrong'); App.toast(hintFor(c)); return; }
        Sound.play('select'); codexDetail(c);
      });
      grid.appendChild(it);
    });
    var all = cd.cards.length, have = cd.cards.filter(function (c) { return hub.codex[c.id]; }).length;
    $('#codex-progress').textContent = '모은 카드 ' + have + ' / ' + all;
  }
  function hintFor(c) {
    var h = { artifact: '발굴 탐험대에서 유물을 찾거나 낱말풀이를 하면 모을 수 있어요', building: '백제마을 만들기에서 건물을 지으면 모을 수 있어요', person: '십자 낱말풀이에서 모을 수 있어요', place: '낱말풀이·발굴·방어 게임에서 모을 수 있어요', history: '부소산을 막아라와 낱말풀이에서 모을 수 있어요' };
    return h[c.category] || '여러 게임에서 모을 수 있어요';
  }
  function codexDetail(c) {
    var box = el('div', 'codex-detail');
    var top = el('div', 'cd-top');
    if (c.art) { var cv = el('canvas'); var g = Activities.hiDpi(cv, 220, 220); try { Art.draw(g, c.art, 10, 10, 200, 200); } catch (e) {} top.appendChild(cv); }
    else top.appendChild(el('div', 'cd-icon', c.icon || '📜'));
    var tx = el('div', 'cd-text');
    var cat = cardsData().categories.filter(function (x) { return x.id === c.category; })[0];
    tx.appendChild(el('div', 'cd-cat', cat ? cat.icon + ' ' + cat.name : ''));
    tx.appendChild(el('h2', '', c.title));
    tx.appendChild(el('p', '', c.text));
    top.appendChild(tx); box.appendChild(top);
    if (c.note) box.appendChild(el('p', 'cd-note', '💡 알아 두기: ' + c.note));
    box.appendChild(el('p', 'cd-src', '📚 참고: ' + (c.source || '-') + (hub.codex[c.id] ? ' · 등록한 날 ' + hub.codex[c.id].date : '')));
    App.modal(box, { close: true, cls: 'wide' });
  }

  /* ---------------- 특별 전시 ---------------- */
  function openSpecial() {
    var box = el('div', 'special');
    box.appendChild(el('h2', '', '🏛️ 백제 역사 체험관 특별 전시'));
    box.appendChild(el('p', 'hub-small', '네 가지 게임에서 모은 ⭐ 백제 탐험 별로 특별 전시가 열려요. 지금 별: ' + totalStars() + '개'));
    var row = el('div', 'sp-row');
    SPECIAL.forEach(function (sp) {
      var open = totalStars() >= sp.need;
      var b = el('button', 'sp-card' + (open ? '' : ' locked'), '<div class="sp-icon">' + (open ? sp.icon : '🔒') + '</div><b>' + sp.title + '</b><small>' + (open ? '열림 · 눌러서 보기' : '⭐ ' + sp.need + '개 모으면 열려요') + '</small>');
      b.addEventListener('click', function () { if (!open) { Sound.play('wrong'); return; } Sound.play('select'); showExhibit(sp); });
      row.appendChild(b);
    });
    box.appendChild(row);
    App.modal(box, { close: true, cls: 'wide' });
  }
  function showExhibit(sp) {
    var box = el('div', 'exhibit');
    box.appendChild(el('h2', '', sp.icon + ' ' + sp.title));
    var cv = el('canvas', 'ex-canvas'); var g = Activities.hiDpi(cv, 1100, 600);
    box.appendChild(cv);
    var cap = el('p', 'hub-small');
    if (sp.id === 'map') {
      drawSabiMap(g, 1100, 600);
      cap.textContent = '사비 도성은 북쪽의 부소산성, 동쪽과 북쪽을 감싼 나성, 서쪽과 남쪽을 흐르는 백마강으로 둘러싸여 있었어요. ※ 위치 관계를 이해하기 위한 교육용 개념도이며 실제 지도와 거리·모양이 달라요.';
    } else if (sp.id === 'exchange') {
      drawExchange(g, 1100, 600);
      cap.textContent = '백제는 중국 남조(양나라 등)와 교류하며 문화를 받아들이고, 바다 건너 왜(일본)에 불교, 학문, 절을 짓는 기술과 기와 만드는 기술 등을 전했어요. ※ 화살표는 교류 방향을 단순하게 나타낸 개념도예요.';
    } else {
      drawHall(g, 1100, 600);
      cap.textContent = '네 가지 게임을 즐기며 백제 역사를 탐험한 여러분, 정말 멋져요!';
    }
    box.appendChild(cap);
    App.modal(box, { close: true, cls: 'wide' });
  }
  function label(g, t, x, y, size, col, bg) {
    g.font = 'bold ' + size + 'px "Malgun Gothic"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (bg) { var w = g.measureText(t).width + 18; g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - size * 0.75, w, size * 1.5, 10) : g.rect(x - w / 2, y - size * 0.75, w, size * 1.5); g.fill(); }
    g.fillStyle = col || '#3a2412'; g.fillText(t, x, y);
  }
  function drawSabiMap(g, W, H) {
    g.fillStyle = '#efe2bf'; g.fillRect(0, 0, W, H);
    // 백마강: 서쪽과 남쪽을 감싸 흐른다
    g.strokeStyle = '#7fb3d1'; g.lineWidth = 46; g.lineCap = 'round';
    g.beginPath(); g.moveTo(330, -20); g.bezierCurveTo(170, 150, 150, 380, 300, 500); g.bezierCurveTo(450, 610, 760, 560, 1120, 600); g.stroke();
    label(g, '백마강', 190, 330, 26, '#24577a');
    // 부소산성
    g.fillStyle = '#86a86a'; g.beginPath(); g.ellipse(500, 120, 140, 80, -0.1, 0, 7); g.fill();
    g.strokeStyle = '#6b5a3a'; g.lineWidth = 5; g.setLineDash([10, 6]); g.beginPath(); g.ellipse(500, 120, 130, 70, -0.1, 0, 7); g.stroke(); g.setLineDash([]);
    label(g, '부소산성', 500, 110, 26, '#2e3d1c', 'rgba(255,255,255,.7)');
    // 나성 (동쪽·북쪽)
    g.strokeStyle = '#8c6b45'; g.lineWidth = 10; g.beginPath(); g.moveTo(610, 90); g.bezierCurveTo(760, 120, 860, 180, 880, 300); g.bezierCurveTo(900, 400, 880, 480, 860, 560); g.stroke();
    label(g, '나성', 930, 300, 26, '#5a3a1e', 'rgba(255,255,255,.7)');
    // 왕궁 터 추정지, 정림사지, 궁남지
    g.fillStyle = '#c9a24a'; g.fillRect(450, 200, 90, 50); label(g, '왕궁 터(추정, 관북리)', 495, 275, 20, '#5a3a1e');
    g.fillStyle = '#b5523c'; g.fillRect(520, 330, 30, 40); label(g, '정림사지', 535, 390, 22, '#5a3a1e');
    g.fillStyle = '#9fd0c8'; g.beginPath(); g.ellipse(600, 470, 50, 26, 0, 0, 7); g.fill(); label(g, '궁남지', 600, 470, 20, '#1d4a44');
    // 성 밖: 능산리사지, 왕흥사지
    g.fillStyle = '#b5523c'; g.fillRect(990, 260, 30, 40); label(g, '능산리사지', 1005, 320, 22, '#5a3a1e');
    label(g, '(나성 바깥)', 1005, 348, 16, '#7a5a3a');
    g.fillStyle = '#b5523c'; g.fillRect(130, 90, 30, 40); label(g, '왕흥사지', 145, 150, 22, '#5a3a1e');
    label(g, '(강 건너편)', 145, 176, 16, '#7a5a3a');
    label(g, '북 ↑', 1050, 40, 22, '#5a3a1e');
    label(g, '교육용 개념도 (실제 축척 아님)', 900, 580, 18, '#7a5a3a');
  }
  function drawExchange(g, W, H) {
    var sea = g.createLinearGradient(0, 0, W, 0); sea.addColorStop(0, '#9cc8dc'); sea.addColorStop(1, '#b8dcea');
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8d8a8';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(300, 0); g.bezierCurveTo(320, 160, 260, 300, 330, 600); g.lineTo(0, 600); g.fill();   // 중국 대륙
    g.beginPath(); g.moveTo(470, 0); g.lineTo(640, 0); g.bezierCurveTo(650, 120, 610, 300, 560, 360); g.bezierCurveTo(520, 330, 500, 200, 470, 0); g.fill();   // 한반도
    g.beginPath(); g.moveTo(820, 600); g.bezierCurveTo(820, 460, 900, 330, 1100, 240); g.lineTo(1100, 600); g.fill();   // 일본 열도
    label(g, '중국 남조 (양나라 등)', 160, 300, 24, '#5a3a1e', 'rgba(255,255,255,.6)');
    label(g, '백제', 540, 300, 28, '#8a1f12', 'rgba(255,255,255,.8)');
    label(g, '왜 (일본)', 960, 430, 24, '#5a3a1e', 'rgba(255,255,255,.6)');
    g.strokeStyle = '#b98522'; g.lineWidth = 6; g.setLineDash([14, 8]);
    g.beginPath(); g.moveTo(310, 330); g.quadraticCurveTo(410, 400, 510, 320); g.stroke();
    g.beginPath(); g.moveTo(580, 340); g.quadraticCurveTo(720, 470, 880, 430); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#b98522';
    [[510, 320, -0.6], [880, 430, -0.2]].forEach(function (a) { g.save(); g.translate(a[0], a[1]); g.rotate(a[2]); g.beginPath(); g.moveTo(0, 0); g.lineTo(-22, -10); g.lineTo(-22, 10); g.fill(); g.restore(); });
    label(g, '문화·물자 교류', 410, 430, 20, '#5a3a1e');
    label(g, '불교 · 학문 · 절 짓는 기술 · 기와 기술', 720, 510, 20, '#5a3a1e', 'rgba(255,255,255,.7)');
    label(g, '교육용 개념도 (실제 지도 아님)', 900, 40, 18, '#2b4b5a');
  }
  function drawHall(g, W, H) {
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#fff4d6'); bg.addColorStop(1, '#efd9a2');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#b98522'; g.lineWidth = 8; g.strokeRect(20, 20, W - 40, H - 40);
    g.lineWidth = 2; g.strokeRect(36, 36, W - 72, H - 72);
    lotus(g, 120, 120, 60, '#b98522', 0.8); lotus(g, W - 120, 120, 60, '#b98522', 0.8);
    label(g, '백제 역사 탐험 인증서', W / 2, 110, 48, '#6b4423');
    var cd = cardsData().cards, got = cd.filter(function (c) { return hub.codex[c.id]; }).length;
    var nb = 0; Object.keys(hub.badges).forEach(function (k) { nb += Object.keys(hub.badges[k]).length; });
    var lines = ['⭐ 모은 백제 탐험 별: ' + totalStars() + '개', '📚 역사 도감 카드: ' + got + ' / ' + cd.length + '장', '🏅 게임 배지: ' + nb + '개', '🏺 발굴한 유물: ' + Object.keys(App.save.collected).filter(function (k) { return !!App.data.artifactsById[k]; }).length + '점'];
    lines.forEach(function (t, i) { label(g, t, W / 2, 220 + i * 66, 30, '#3a2412'); });
    label(g, '위 탐험대는 사비 백제의 역사와 문화를 열심히 탐구하였기에 이 인증서를 드립니다.', W / 2, 500, 22, '#6b4423');
    label(g, today() + '  백제 역사 체험관', W / 2, 550, 22, '#6b4423');
  }

  /* ---------------- 선생님 설정: 체험관 항목 ---------------- */
  function teacherSection(box, closeTeacher) {
    var sec = el('div', 'set-hub');
    sec.appendChild(el('h3', '', '🏛️ 체험관 설정'));
    var grid = el('div', 'set-grid');
    ORDER.forEach(function (id) {
      var row = el('div', 'set-row');
      row.appendChild(el('label', '', META[id].title));
      var gg = el('div', 'segs');
      var onB = el('button', 'seg' + (enabled(id) ? ' on' : ''), enabled(id) ? '사용' : '잠금');
      onB.addEventListener('click', function () {
        var e = Object.assign({}, S().gamesEnabled); e[id] = !enabled(id); S().gamesEnabled = e; App.saveSettings();
        onB.textContent = enabled(id) ? '사용' : '잠금'; onB.classList.toggle('on', enabled(id)); Sound.play('tap');
      });
      gg.appendChild(onB);
      DIFF.forEach(function (d) {
        var b = el('button', 'seg' + (diffOf(id) === d[0] ? ' on' : ''), d[1]);
        b.addEventListener('click', function () {
          var o = Object.assign({}, S().gameDifficulty); o[id] = d[0]; S().gameDifficulty = o; App.saveSettings();
          if (id === 'excavation') S().difficulty = d[0];
          gg.querySelectorAll('.seg.d').forEach(function (x) { x.classList.toggle('on', x === b); }); Sound.play('tap');
        });
        b.classList.add('d'); gg.appendChild(b);
      });
      if (id !== 'excavation') {
        var go = el('button', 'seg', '▶ 바로 시작');
        go.addEventListener('click', function () { closeTeacher(); launch(id, { players: S().players, difficulty: diffOf(id), grade: S().grade, timeLimit: S().timeLimit, unlockAll: S().unlockAll, testMode: S().testMode }); });
        gg.appendChild(go);
      }
      row.appendChild(gg); grid.appendChild(row);
    });
    sec.appendChild(grid);
    var act = el('div', 'set-actions');
    function action(label, cls, fn) { var b = el('button', 'seg big ' + (cls || ''), label); b.addEventListener('click', fn); act.appendChild(b); return b; }
    action('📚 역사 학습 카드 수정', '', openCardEditor);
    ORDER.forEach(function (id) {
      var def = registry[id];
      if (def && def.teacher) action(def.teacherLabel || ('✏️ ' + META[id].title + ' 데이터'), '', function () { def.teacher(makeHost(id, {})); });
    });
    var rb = action('🗑️ 체험관 기록 초기화 (별·도감·배지·마을·낱말·방어)', 'danger', function () {
      if (!rb.dataset.confirm) { rb.dataset.confirm = '1'; rb.textContent = '정말 지울까요? 한 번 더 누르세요'; setTimeout(function () { delete rb.dataset.confirm; rb.textContent = '🗑️ 체험관 기록 초기화 (별·도감·배지·마을·낱말·방어)'; }, 4000); return; }
      hub = freshHub(); persistHub();
      ORDER.forEach(function (id) { App.store.remove(KEY_GAME + id); });
      rb.textContent = '✔ 초기화했어요'; Sound.play('whoosh');
    });
    sec.appendChild(act);
    sec.appendChild(el('p', 'set-note', '난이도: 쉬움 1~2학년 · 보통 3~4학년 · 어려움 5~6학년. 제한 시간은 발굴과 낱말풀이(어려움)에 적용돼요. 발굴 기록 초기화는 위의 "진행 기록 초기화"를 쓰세요.'));
    box.appendChild(sec);
  }
  function openCardEditor() {
    var box = el('div', 'card-editor');
    box.appendChild(el('h2', '', '📚 역사 학습 카드 수정'));
    box.appendChild(el('p', 'set-note', '고친 내용은 이 컴퓨터에 저장되고 도감·게임의 역사 카드에 바로 반영돼요. 원본은 data/historyCards.json 에 있어요.'));
    var sel = el('select', 'ce-select');
    cardsData().cards.forEach(function (c) { var o = el('option', '', c.title + ' (' + c.id + ')'); o.value = c.id; sel.appendChild(o); });
    var t1 = el('input', 'ce-title'); var t2 = el('textarea', 'ce-text'); var t3 = el('textarea', 'ce-note');
    function fill() { var c = card(sel.value); t1.value = c.title; t2.value = c.text; t3.value = c.note || ''; }
    sel.addEventListener('change', fill);
    box.appendChild(sel);
    box.appendChild(el('label', '', '제목')); box.appendChild(t1);
    box.appendChild(el('label', '', '설명')); box.appendChild(t2);
    box.appendChild(el('label', '', '알아 두기(주의할 점)')); box.appendChild(t3);
    var row = el('div', 'set-actions');
    var sv = el('button', 'seg big', '💾 저장'), rs = el('button', 'seg big', '↺ 원래대로');
    sv.addEventListener('click', function () { var o = overrides(); o[sel.value] = { title: t1.value.trim() || card(sel.value).title, text: t2.value, note: t3.value }; App.store.set(KEY_CARD, o); App.toast('카드를 저장했어요'); Sound.play('correct'); });
    rs.addEventListener('click', function () { var o = overrides(); delete o[sel.value]; App.store.set(KEY_CARD, o); fill(); App.toast('원래 내용으로 되돌렸어요'); });
    row.appendChild(sv); row.appendChild(rs); box.appendChild(row);
    fill();
    // 입력 칸에서는 키보드를 쓸 수 있어야 하므로 터치 제스처 막기를 풀어 준다
    App.modal(box, { close: true, cls: 'wide' });
  }

  /* ---------------- 연결 ---------------- */
  function bind() {
    $('#hub-codex').addEventListener('click', function () { Sound.play('select'); App.show('scr-codex'); });
    $('#hub-stars').addEventListener('click', function () { Sound.play('select'); openSpecial(); });
    $('#hub-special').addEventListener('click', function () { Sound.play('select'); openSpecial(); });
    $('#hub-vol').addEventListener('input', function (e) { S().volume = e.target.value / 100; Sound.setVolume(S().volume); App.saveSettings(); });
    $('#hub-vol').addEventListener('change', function () { Sound.play('correct'); });
    $('#hub-mute').addEventListener('click', function () { App.setMuted(!S().muted); renderHub(); });
    $('#game-home').addEventListener('click', function () { Sound.play('select'); confirmExit(); });
    App.holdable($('#hub-teacher'), 3000, App.openTeacher);
  }
  function init() {
    var h = App.store.get(KEY_HUB);
    hub = Object.assign(freshHub(), h || {});
    drawHubBg();
    bind();
  }

  window.BaekjeHub = {
    register: function (def) { if (def && def.id) registry[def.id] = def; },
    registry: registry,
    init: init,
    renderHub: renderHub, renderCodex: renderCodex,
    launch: launch, unmount: unmount, exitGame: exitGame,
    pauseGame: pauseGame, resumeGame: resumeGame,
    isRunning: function () { return !!active; },
    activeId: function () { return active ? active.id : null; },
    activeInstance: function () { return active ? active.inst : null; },   // 테스트용: 게임이 돌려준 객체(예: inst.debug)
    gameError: gameError,
    award: award, totalStars: totalStars, card: card,
    teacherSection: teacherSection,
    state: function () { return hub; },
    reload: function () { hub = Object.assign(freshHub(), App.store.get(KEY_HUB) || {}); },
    META: META, drawCardArt: drawCardArt, lotus: lotus
  };
})();
