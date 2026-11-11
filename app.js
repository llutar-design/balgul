/* 백제 보물 발굴 탐험대 — 메인 컨트롤러
 * 화면 전환, 화면 크기 맞춤, 플레이어 구역, 발굴 흐름, 점수·보상, 저장, 선생님 설정, 자가 진단 */
(function () {
  'use strict';

  var STAGE_W = 1920, STAGE_H = 1080;
  var SITE = { x: 175, y: 165, w: 1570, h: 750 };
  var PCOL = ['#e8553e', '#3e8acb', '#4caf6a', '#b55bd6'];
  var PNAME = ['빨강 대원', '파랑 대원', '초록 대원', '보라 대원'];
  var TOOL_LIST = [
    { id: 'shovel', name: '작은 삽', icon: 'assets/icons/shovel.svg' },
    { id: 'brush', name: '발굴 붓', icon: 'assets/icons/brush.svg' },
    { id: 'fine', name: '정밀 붓', icon: 'assets/icons/finebrush.svg' },
    { id: 'record', name: '기록 도구', icon: 'assets/icons/camera.svg' }
  ];
  var TITLES = [
    { xp: 0, name: '새싹 고고학자', icon: '🌱' },
    { xp: 250, name: '백제 발굴 조사원', icon: '⛏️' },
    { xp: 700, name: '사비의 유물 연구가', icon: '📜' },
    { xp: 1300, name: '백제 문화유산 지킴이', icon: '🛡️' },
    { xp: 2000, name: '전설의 고고학자', icon: '👑' }
  ];
  var BADGES = {
    first:   { icon: '🌱', name: '첫 발견' },
    careful: { icon: '🪶', name: '꼼꼼한 손길' },
    team:    { icon: '🤝', name: '협동 탐험대' },
    pattern: { icon: '🔍', name: '문양 탐정' },
    quiz:    { icon: '📜', name: '역사 박사' },
    legend:  { icon: '👑', name: '금빛 전설' },
    curator: { icon: '🏛️', name: '큐레이터' }
  };
  var DEFAULTS = {
    grade: 3, players: 1, turnMode: false, timeLimit: 5, difficulty: 'normal', hints: true,
    quizCount: 2, volume: 0.7, muted: false, orientation: 0, unlockAll: true, testMode: false, resolution: 'auto',
    gamesEnabled: {}, gameDifficulty: {}
  };
  // 발굴 결과로 체험관 역사 도감에 등록되는 카드
  var CODEX_BY_ARTIFACT = {
    'practice-pot': ['his-life'],
    sarigam: ['art-sarigam', 'plc-neungsan', 'per-wideok'],
    'bronze-hap': ['art-wangheung', 'plc-wangheungsa', 'his-buddhism'],
    'silver-ho': ['art-wangheung'], 'gold-byeong': ['art-wangheung'],
    hyangno: ['art-hyangno', 'plc-neungsan', 'plc-buyeo']
  };

  /* ---------------- 저장 (사용할 수 없으면 메모리에만 보관) ---------------- */
  var memStore = {};
  var Store = {
    ok: true,
    get: function (k) {
      var v;
      try { v = window.localStorage.getItem(k); } catch (e) { Store.ok = false; return memStore[k] || null; }
      if (v === null) return memStore[k] || null;
      try { return JSON.parse(v); } catch (e) { return memStore[k] || null; }   // 손상된 항목 하나는 저장소 고장으로 보지 않는다
    },
    set: function (k, v) {
      memStore[k] = v;
      try { window.localStorage.setItem(k, JSON.stringify(v)); Store.ok = true; return true; }
      catch (e) { Store.ok = false; return false; }
    },
    remove: function (k) { delete memStore[k]; try { window.localStorage.removeItem(k); } catch (e) {} }
  };
  var KEY_SAVE = 'baekje-treasure.save.v1', KEY_SET = 'baekje-treasure.settings.v1', KEY_IMG = 'baekje-treasure.img.';

  function freshSave() { return { collected: {}, placements: {}, xp: 0, badges: {}, stageBest: {}, plays: 0 }; }

  /* ---------------- 상태 ---------------- */
  var data = null, settings = {}, save = freshSave();
  var scale = 1, offX = 0, offY = 0, flip = false;
  var stageEl, current = 'scr-loading';
  var engine = null, icons = {};
  var session = null;        // 현재 발굴 판
  var pendingPlayers = 2, pendingTurn = false;
  var testAuto = false;

  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; }
  function artifact(id) { return data.artifactsById[id]; }
  function tier() { return Activities.tierOf(settings.grade); }
  function today() { var d = new Date(); return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.'; }

  /* ---------------- 데이터 ---------------- */
  function loadData() {
    var embedded = window.BAEKJE_DATA;
    function finish(d) {
      data = { artifacts: d.artifacts.artifacts, questions: d.questions.questions, stages: d.stages.stages, artifactsById: {} };
      data.artifacts.forEach(function (a) { data.artifactsById[a.id] = a; });
      return data;
    }
    if (location.protocol === 'file:' || !window.fetch) {
      if (!embedded) return Promise.reject(new Error('data/data.js 파일을 찾을 수 없어요.'));
      return Promise.resolve(finish(embedded));
    }
    // 웹 서버로 실행하면 JSON 파일을 직접 읽는다 (교사가 JSON만 고쳐도 바로 반영)
    return Promise.all(['artifacts', 'questions', 'stages'].map(function (n) {
      return fetch('data/' + n + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(n); return r.json(); });
    })).then(function (arr) {
      return finish({ artifacts: arr[0], questions: arr[1], stages: arr[2] });
    }).catch(function () {
      if (!embedded) throw new Error('데이터를 불러오지 못했어요.');
      return finish(embedded);
    });
  }

  /* ---------------- 화면 크기 맞춤 ---------------- */
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / STAGE_W, vh / STAGE_H);
    offX = (vw - STAGE_W * scale) / 2; offY = (vh - STAGE_H * scale) / 2;
    var t = 'translate(' + offX + 'px,' + offY + 'px) scale(' + scale + ')';
    if (flip) t += ' translate(' + STAGE_W + 'px,' + STAGE_H + 'px) rotate(180deg)';
    stageEl.style.transform = t;
  }
  function mapPoint(cx, cy) {
    var x = (cx - offX) / scale, y = (cy - offY) / scale;
    if (flip) { x = STAGE_W - x; y = STAGE_H - y; }
    return { x: x, y: y };
  }

  /* ---------------- 화면 전환 ---------------- */
  function show(id) {
    if (current === 'scr-dig' && id !== 'scr-dig') leaveDig();
    if (current === 'scr-game' && id !== 'scr-game' && window.BaekjeHub) BaekjeHub.unmount();   // 한 번에 한 게임만 실행
    if (current !== id) { $('#toasts').innerHTML = ''; toastSlots = {}; }
    $all('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    current = id;
    if (id === 'scr-hub' && window.BaekjeHub) BaekjeHub.renderHub();
    if (id === 'scr-codex' && window.BaekjeHub) BaekjeHub.renderCodex();
    if (id === 'scr-menu') renderMenu();
    if (id === 'scr-stages') renderStages();
    if (id === 'scr-museum') Museum.open(museumHighlight), museumHighlight = [];
    if (id === 'scr-players') renderPlayers();
  }
  var museumHighlight = [];

  /* ---------------- 토스트와 모달 ---------------- */
  var toastT = {}, toastSlots = {};
  function toast(text, o) {
    o = o || {};
    var box = $('#toasts');
    var key = o.key || text;
    if (toastT[key] && performance.now() - toastT[key] < (o.gap || 1200)) return;
    toastT[key] = performance.now();
    var both = current === 'scr-dig' && session && session.players >= 2 && !o.single;
    // 위치마다 한 개만 보여 준다: 새 안내가 오면 이전 안내는 바로 사라진다 (발굴 현장을 가리지 않도록)
    var mk = function (cls) {
      var old = toastSlots[cls];
      if (old) old.remove();
      var t = el('div', 'toast ' + (o.big ? 'big ' : '') + (o.cls || '') + ' ' + cls, text);
      box.appendChild(t);
      toastSlots[cls] = t;
      setTimeout(function () { t.classList.add('out'); }, o.dur || 2600);
      setTimeout(function () { t.remove(); if (toastSlots[cls] === t) toastSlots[cls] = null; }, (o.dur || 2600) + 500);
    };
    if (current === 'scr-dig') { mk('pos-bottom'); if (both) mk('pos-top'); }
    else mk('pos-center');
  }

  var modalStack = [];
  function modal(content, o) {
    o = o || {};
    var ov = $('#overlay');
    ov.classList.remove('hidden');
    var card = el('div', 'modal-card ' + (o.cls || ''));
    var tools = el('div', 'modal-tools');
    var flipB = el('button', 'icon-btn', '↻');
    flipB.title = '반대편 친구에게 돌려 보여 주기';
    flipB.addEventListener('click', function () { Sound.play('whoosh'); card.classList.toggle('flipped'); });
    tools.appendChild(flipB);
    var api = {
      card: card,
      close: function () {
        card.remove();
        modalStack = modalStack.filter(function (m) { return m !== api; });
        if (!modalStack.length) ov.classList.add('hidden');
        o.onClose && o.onClose();
      }
    };
    if (o.close) {
      var x = el('button', 'icon-btn', '✕');
      x.addEventListener('click', function () { Sound.play('tap'); api.close(); });
      tools.appendChild(x);
    }
    card.appendChild(tools);
    var body = el('div', 'modal-body');
    if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
    card.appendChild(body);
    ov.appendChild(card);
    modalStack.push(api);
    api.body = body;
    return api;
  }
  function closeAllModals() { modalStack.slice().forEach(function (m) { m.close(); }); }

  /* ---------------- 메인 화면 ---------------- */
  function drawMenuBg() {
    var c = $('#menu-bg'), g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, 620);
    sky.addColorStop(0, '#2f4a43'); sky.addColorStop(0.55, '#7b8f73'); sky.addColorStop(1, '#e6c88f');
    g.fillStyle = sky; g.fillRect(0, 0, 1920, 1080);
    // 먼 산 (부소산 느낌의 부드러운 능선)
    g.fillStyle = '#5b7063';
    g.beginPath(); g.moveTo(0, 560);
    for (var x = 0; x <= 1920; x += 40) g.lineTo(x, 520 - Math.sin(x / 260) * 50 - Math.sin(x / 90) * 12);
    g.lineTo(1920, 640); g.lineTo(0, 640); g.fill();
    g.fillStyle = '#7e8d6c';
    g.beginPath(); g.moveTo(0, 600);
    for (x = 0; x <= 1920; x += 40) g.lineTo(x, 585 - Math.sin(x / 180 + 1) * 30);
    g.lineTo(1920, 660); g.lineTo(0, 660); g.fill();
    // 땅의 단면 (흙층)
    var layers = [['#9b7449', 600], ['#86643f', 700], ['#a8845a', 790], ['#c7a26c', 880], ['#b39066', 960]];
    layers.forEach(function (l, i) {
      g.fillStyle = l[0];
      g.beginPath(); g.moveTo(0, l[1]);
      for (var xx = 0; xx <= 1920; xx += 30) g.lineTo(xx, l[1] + Math.sin(xx / 150 + i) * 10 + Math.sin(xx / 47 + i * 2) * 4);
      g.lineTo(1920, 1080); g.lineTo(0, 1080); g.fill();
    });
    var rnd = Art.rng(42);
    for (var i = 0; i < 260; i++) {
      g.fillStyle = 'rgba(' + (60 + rnd() * 60 | 0) + ',' + (45 + rnd() * 40 | 0) + ',30,' + (0.3 + rnd() * 0.4) + ')';
      g.beginPath(); g.ellipse(rnd() * 1920, 640 + rnd() * 440, 3 + rnd() * 9, 2 + rnd() * 6, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    // 땅속 보물의 빛
    [[300, 900, 'pot', 150], [1650, 890, 'hyangno', 260], [1350, 960, 'byeong', 90], [560, 980, 'sarigam', 120]].forEach(function (t) {
      var glow = g.createRadialGradient(t[0], t[1], 10, t[0], t[1], t[3]);
      glow.addColorStop(0, 'rgba(255,225,140,0.55)'); glow.addColorStop(1, 'rgba(255,225,140,0)');
      g.fillStyle = glow; g.fillRect(t[0] - t[3], t[1] - t[3], t[3] * 2, t[3] * 2);
      var s = Art.silhouette(t[2], t[3] * 0.9, 'rgba(70,45,20,0.55)');
      g.drawImage(s, t[0] - s.width / 2, t[1] - s.height / 2);
    });
    // 풀
    g.strokeStyle = '#6d8a4a'; g.lineWidth = 3;
    for (i = 0; i < 400; i++) { var gx = rnd() * 1920, gy = 600 + Math.sin(gx / 150) * 10; g.beginPath(); g.moveTo(gx, gy + 4); g.lineTo(gx + (rnd() - 0.5) * 10, gy - 8 - rnd() * 12); g.stroke(); }
  }

  function titleFor(xp) {
    var t = TITLES[0];
    TITLES.forEach(function (x) { if (xp >= x.xp) t = x; });
    return t;
  }
  function renderMenu() {
    var t = titleFor(save.xp);
    var nxt = TITLES.filter(function (x) { return x.xp > save.xp; })[0];
    var got = Object.keys(save.collected).filter(function (id) { return !!data.artifactsById[id]; }).length;
    $('#menu-rank').innerHTML = '<span class="rank-icon">' + t.icon + '</span><div><b>' + t.name + '</b><small>경험치 ' + save.xp +
      (nxt ? ' · 다음 칭호까지 ' + (nxt.xp - save.xp) : ' · 최고 칭호!') + ' · 유물 ' + got + '/' + data.artifacts.length + '</small></div>';
  }

  /* ---------------- 인원 선택 ---------------- */
  function renderPlayers() {
    var multi = (navigator.maxTouchPoints || 0) >= 2;
    pendingTurn = resolveTurn();
    $all('#scr-players .seg').forEach(function (b) { b.classList.toggle('on', (+b.dataset.turn === 1) === pendingTurn); });
    $('#touch-note').textContent = multi
      ? '이 화면은 여러 손가락 터치를 지원해요 (최대 ' + navigator.maxTouchPoints + '점). 모두 동시에 팔 수 있어요!'
      : '이 화면에서는 여러 손가락 터치가 감지되지 않았어요. 동시에 파려면 멀티 터치 화면이 필요해요 (마우스는 한 번에 한 곳만 파져요).';
  }

  /* ---------------- 스테이지 선택 ---------------- */
  function stageUnlocked(i) { return settings.unlockAll || i === 0 || !!save.stageBest[i - 1]; }
  function renderStages() {
    var box = $('#stage-list');
    box.innerHTML = '';
    var n = session && session.players ? session.players : pendingSetup.players;
    $('#stage-sub').textContent = (n > 1 ? '👥 ' + n + '명 협동 발굴' + (pendingSetup.turnMode ? ' (순서대로)' : '') : '🙋 혼자 발굴') + ' · ' + settings.grade + '학년 · ' + ({ easy: '쉬움', normal: '보통', hard: '어려움' })[settings.difficulty];
    data.stages.forEach(function (st, i) {
      var open = stageUnlocked(i);
      var best = save.stageBest[i];
      var card = el('button', 'stage-card theme-' + st.theme + (open ? '' : ' locked'));
      var cv = el('canvas');
      var g = Activities.hiDpi(cv, 340, 230);
      var art = artifact(st.finds[0].artifact);
      var bg = g.createLinearGradient(0, 0, 0, 230);
      var cols = { training: ['#c7a26c', '#9b7449'], neungsan: ['#b48a58', '#6a4d32'], wangheung: ['#a88b61', '#5d4a37'], hyangno: ['#93806a', '#4a3a2a'] }[st.theme];
      bg.addColorStop(0, cols[0]); bg.addColorStop(1, cols[1]);
      g.fillStyle = bg; g.fillRect(0, 0, 340, 230);
      if (save.collected[art.id]) Art.draw(g, art.art, 70, 15, 200, 200);
      else {
        var s = Art.silhouette(art.art, 190, 'rgba(50,30,12,0.6)');
        g.drawImage(s, 170 - s.width / 2, 20);
        g.fillStyle = '#fff3cf'; g.font = 'bold 64px "Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.fillText('?', 170, 140);
      }
      card.appendChild(cv);
      card.appendChild(el('div', 'sc-num', i === 0 ? '튜토리얼' : '스테이지 ' + i));
      card.appendChild(el('b', 'sc-title', st.title));
      card.appendChild(el('span', 'sc-subtitle', st.subtitle));
      card.appendChild(el('span', 'sc-site', '📍 ' + st.site));
      card.appendChild(el('span', 'sc-stars', best ? '⭐'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : (open ? '도전해 보세요!' : '🔒 앞 스테이지를 먼저 마쳐요')));
      if (open) card.addEventListener('click', function () { Sound.play('select'); openBrief(i); });
      else card.addEventListener('click', function () { Sound.play('wrong'); toast('앞 유적지를 먼저 발굴해야 열려요!'); });
      box.appendChild(card);
    });
  }

  /* ---------------- 브리핑 ---------------- */
  var pendingSetup = { players: 1, turnMode: false, stage: 0 };
  function openBrief(i) {
    pendingSetup.stage = i;
    var st = data.stages[i];
    $('#brief-site').textContent = '📍 ' + st.site;
    $('#brief-title').textContent = st.title + ' — ' + st.subtitle;
    $('#brief-story').textContent = st.story[tier()];
    $('#brief-missions').innerHTML = st.missions.map(function (m) { return '<li>' + m + '</li>'; }).join('');
    var cv = $('#brief-canvas'), g = cv.getContext('2d');
    g.clearRect(0, 0, 520, 520);
    var art = artifact(st.finds[0].artifact);
    var glow = g.createRadialGradient(260, 270, 20, 260, 270, 250);
    glow.addColorStop(0, 'rgba(255,225,140,0.7)'); glow.addColorStop(1, 'rgba(255,225,140,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 520, 520);
    var s = Art.silhouette(art.art, 420, 'rgba(70,45,20,0.75)');
    g.drawImage(s, 260 - s.width / 2, 50);
    g.fillStyle = '#fff3cf'; g.font = 'bold 120px "Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 260, 270);
    show('scr-brief');
  }

  /* ---------------- 발굴 화면 ---------------- */
  function buildPanels(n, turnMode) {
    var box = $('#player-panels');
    box.innerHTML = '';
    var sides = ['bottom', 'top', 'left', 'right'];
    for (var p = 0; p < n; p++) {
      var side = sides[p];
      var wide = side === 'bottom' || side === 'top';
      var panel = el('div', 'ppanel side-' + side + (wide ? ' wide' : ''));
      panel.dataset.player = p;
      panel.style.setProperty('--pc', PCOL[p]);
      var label = el('div', 'p-label', '<i></i><b>' + (n === 1 ? '탐험대원' : PNAME[p]) + '</b>' + (turnMode ? '<small class="turn-tag">내 차례!</small>' : ''));
      panel.appendChild(label);
      var tools = el('div', 'p-tools');
      TOOL_LIST.forEach(function (t) {
        var b = el('button', 'tool-btn' + (t.id === 'shovel' ? ' on' : ''), '<img src="' + t.icon + '" alt=""><span>' + t.name + '</span>');
        b.dataset.tool = t.id;
        // panel 변수는 반복문에서 계속 바뀌므로, 누른 버튼이 속한 구역을 직접 찾는다
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); selectTool(+b.closest('.ppanel').dataset.player, t.id); });
        tools.appendChild(b);
      });
      panel.appendChild(tools);
      if (wide) {
        var m = el('div', 'p-mission',
          '<div class="pm" data-k="exposed"><span>흙 걷기</span><i><u></u></i></div>' +
          '<div class="pm" data-k="ring"><span>주변 정리</span><i><u></u></i></div>' +
          '<div class="pm" data-k="dust"><span>먼지 털기</span><i><u></u></i></div>' +
          '<div class="pm rec" data-k="rec"><span>기록</span><b>0/0</b></div>');
        panel.appendChild(m);
      }
      if (turnMode) {
        var tb = el('button', 'turn-btn', '차례 넘기기 ▶');
        tb.addEventListener('click', function (e) {
          var owner = +e.currentTarget.closest('.ppanel').dataset.player;
          if (session && owner === session.turn) nextTurn();
          else toast('차례 넘기기는 지금 차례인 친구만 누를 수 있어요', { key: 'turnskip' });
        });
        panel.appendChild(tb);
      }
      box.appendChild(panel);
    }
  }

  function selectTool(p, tool) {
    if (!engine || !session) return;
    if (session.turnMode && p !== session.turn) { toast(PNAME[session.turn] + '의 차례예요!', { key: 'turn' }); return; }
    engine.setTool(p, tool);
    Sound.play('select');
    var panel = $('.ppanel[data-player="' + p + '"]');
    if (panel) panel.querySelectorAll('.tool-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === tool); });
    if (tool === 'record') toast('📷 드러난 유물을 눌러 기록해요', { key: 'rec-tip', gap: 6000 });
  }

  function nextTurn() {
    if (!session || !session.turnMode) return;
    session.turn = (session.turn + 1) % session.players;
    session.turnT = 0;
    engine.setTurn(session.turn);
    setTurnClasses(session.turn);
    Sound.play('select');
    toast('👉 ' + PNAME[session.turn] + '의 차례예요!', { key: 'turn' + session.turn });
  }

  function startDig(stageIdx, players, turnMode) {
    closeAllModals();
    var st = data.stages[stageIdx];
    session = {
      stage: st, stageIdx: stageIdx, players: players, turnMode: !!turnMode && players > 1, turn: 0, turnT: 0,
      timeLeft: settings.timeLimit ? settings.timeLimit * 60 : 0, paused: false, timeUp: false, records: [],
      stats: null, collected: false, hotspotsFound: [], startT: Date.now()
    };
    show('scr-dig');
    buildPanels(players, session.turnMode);
    $('#btn-collect').classList.add('hidden');
    $('#dig-site').className = 'theme-' + st.theme;
    var res = settings.resolution === 'low' ? 1 : Math.max(1, Math.min(1.5, scale * (window.devicePixelRatio || 1)));
    if (!engine) {
      engine = DigEngine.create({
        site: $('#dig-site'), floor: $('#cv-floor'), soil: $('#cv-soil'), fx: $('#cv-fx'),
        width: SITE.w, height: SITE.h, siteX: SITE.x, siteY: SITE.y,
        mapPoint: mapPoint, artifacts: data.artifactsById, icons: icons
      });
    }
    engine.start(st, {
      difficulty: settings.difficulty, hints: settings.hints, players: players,
      turnMode: session.turnMode, resolution: res
    }, { onProgress: onProgress, onEvent: onDigEvent, onError: softError });
    if (session.turnMode) { engine.setTurn(0); setTurnClasses(0); }
    updateTimer();
    toast(st.title + ' 발굴 시작! 먼저 작은 삽으로 겉흙을 걷어 내요', { big: true, dur: 3200, key: 'start' });
  }
  function setTurnClasses(p) {
    $all('.ppanel').forEach(function (pn) { pn.classList.toggle('my-turn', +pn.dataset.player === p); pn.classList.toggle('waiting', +pn.dataset.player !== p); });
  }

  function leaveDig() {
    if (engine) engine.stop();
    session = null;
  }

  function onProgress(s) {
    if (!session) return;
    session.stats = s;
    var th = s.thresholds;
    $all('.p-mission').forEach(function (m) {
      [['exposed', th.expose], ['ring', th.ring], ['dust', th.dust]].forEach(function (k) {
        var pm = m.querySelector('[data-k="' + k[0] + '"]');
        var v = Math.min(1, s[k[0]] / k[1]);
        pm.querySelector('u').style.width = (v * 100) + '%';
        pm.classList.toggle('done', v >= 1);
      });
      var rec = m.querySelector('[data-k="rec"]');
      rec.querySelector('b').textContent = s.recorded + '/' + s.total;
      rec.classList.toggle('done', s.recorded === s.total);
    });
    $('#hud-score').innerHTML = '⭐ ' + liveScore(s);
  }
  function liveScore(s) {
    return Math.round(s.exposed * 60 + s.dust * 30 + s.ring * 10) + Math.round(s.quality / 10) + s.recorded * 10;
  }

  function onDigEvent(type, d) {
    if (!session || (session.collected && type !== 'recorded')) return;
    var site = $('#dig-site');
    switch (type) {
      case 'glimpse':
        toast('✨ 무언가 발견했어요!', { big: true, key: 'glimpse', gap: 3000 });
        site.classList.remove('shake'); void site.offsetWidth; site.classList.add('shake');
        setTimeout(function () { toast('유물 가까이에서는 🖌️ 붓으로 바꿔서 조심조심!', { key: 'brush-tip', gap: 15000 }); }, 1500);
        break;
      case 'exposed':
        toast('🏺 ' + findName(d.find) + '이(가) 모습을 드러냈어요! 정밀 붓으로 먼지를 털어 보세요', { key: 'exp' + d.find.idx, dur: 3200 });
        break;
      case 'shovelWarn':
        toast(d.onArtifact ? '⚠️ 딱! 삽이 유물에 닿았어요. 붓으로 바꿔요!' : '⚠️ 유물 근처예요! 붓으로 살살 파 보세요', { key: 'warn', gap: 3000, cls: 'warn' });
        break;
      case 'recordMiss': toast('📷 드러난 유물을 눌러서 기록해요', { key: 'rmiss', gap: 2500 }); break;
      case 'recordDup': toast('이미 기록한 유물이에요 ✔', { key: 'rdup' }); break;
      case 'recordEarly': toast('유물을 조금 더 드러낸 뒤에 기록해요', { key: 'rearly', gap: 2500 }); break;
      case 'recorded':
        session.records.push({ name: findName(d.find), grid: d.record.grid, state: d.record.state, by: d.player });
        notebook(findName(d.find), d.record);
        if (d.all && !(session.stats && session.stats.complete)) setTimeout(function () { if (session && !(session.stats && session.stats.complete)) toast('기록 완료! 남은 흙과 먼지를 마저 정리해요', { key: 'allrec' }); }, 2600);
        break;
      case 'hotspot':
        session.hotspotsFound.push(d.hotspot.label);
        toast('🔍 ' + d.hotspot.label + ' 발견! ' + d.hotspot.info, { key: 'hs' + d.hotspot.label + d.hotspot.x, dur: 3600 });
        break;
      case 'hint': toast('💡 반짝이는 동그라미 쪽을 파 보세요!', { key: 'hint', gap: 15000 }); break;
      case 'complete':
        if (session.timeUp) break;        // 시간 종료 때는 자동으로 수습하므로 버튼·안내를 띄우지 않는다
        $('#btn-collect').classList.remove('hidden');
        Sound.play('found');
        toast('✅ 조사 완료! 가운데 "유물 수습하기"를 눌러요', { big: true, key: 'done', dur: 3500 });
        break;
    }
  }
  function findName(f) { return f.def.piece !== undefined ? '토기 조각 ' + (f.def.piece + 1) : f.art.short; }

  function notebook(name, rec) {
    var nb = el('div', 'notebook', '<b>📒 발굴 수첩</b><span>' + name + '</span><span>출토 위치: ' + rec.grid + ' 구획</span><span>깊이: ' + rec.depth + '</span><span>상태: ' + rec.state + '</span>');
    $('#scr-dig').appendChild(nb);
    setTimeout(function () { nb.classList.add('out'); }, 3200);
    setTimeout(function () { nb.remove(); }, 3800);
  }

  /* ---------------- 타이머 ---------------- */
  var lastTick = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    var now = performance.now(), dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;
    if (fpsBox) fpsUpdate(dt);
    if (!session || session.paused || session.collected || session.timeUp || current !== 'scr-dig' || modalStack.length) return;
    if (session.stats && session.stats.complete) return;   // 조사를 마쳤으면 시간과 차례를 멈춘다 (시간 종료 감점 방지)
    if (session.turnMode) {
      session.turnT += dt;
      if (session.turnT > 45) nextTurn();
    }
    if (session.timeLeft > 0) {
      var before = session.timeLeft;
      session.timeLeft = Math.max(0, session.timeLeft - dt);
      if (before > 30 && session.timeLeft <= 30) toast('⏰ 30초 남았어요!', { key: 't30' });
      if (session.timeLeft === 0 && !session.timeUp) timeUp();
      updateTimer();
    }
  }
  function updateTimer() {
    var t = $('#hud-timer');
    if (!session || !session.timeLeft && !session.timeUp) { t.textContent = '∞'; t.classList.remove('low'); return; }
    var s = Math.ceil(session.timeLeft);
    t.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    t.classList.toggle('low', s <= 30);
  }
  function timeUp() {
    session.timeUp = true;
    engine.setFrozen(true);
    toast('⏰ 시간이 다 됐어요! 남은 흙은 함께 걷어 낼게요', { big: true, dur: 3000 });
    Sound.play('rumble');
    var s = session;
    engine.reveal(function () {
      if (session !== s) return;          // 그사이 다른 판을 시작했으면 무시
      engine.recordAll();
      // 선생님 설정 등 창이 열려 있으면 닫힐 때까지 기다렸다가 수습한다
      (function tryCollect() {
        if (session !== s || s.collected) return;
        if (modalStack.length) { setTimeout(tryCollect, 500); return; }
        collect();
      })();
    });
  }

  /* ---------------- 수습 이후의 흐름 ---------------- */
  function collect() {
    if (!session || session.collected) return;
    session.collected = true;
    engine.setFrozen(true);
    $('#toasts').innerHTML = ''; toastSlots = {};
    $('#btn-collect').classList.add('hidden');
    Sound.play('place');
    var s = engine.stats();
    session.final = s;
    var st = session.stage;
    var steps = [];
    var flow = modal(el('div'), { cls: 'flow' });
    var root = flow.body;
    var result = { research: false, quiz: { correct: 0, total: 0 } };
    var mainArt = artifact(Array.isArray(st.reward) ? st.reward[0] : st.reward);

    if (st.activity === 'puzzle') steps.push(function (next) { Activities.puzzle(fresh(), { testAuto: testAuto, onDone: function (r) { result.research = true; next(); } }); });
    steps.push(function (next) {
      var c = Activities.ceremony(fresh(), {
        artifact: mainArt, tier: tier(), grand: st.theme === 'hyangno', points: 100,
        nextLabel: st.activity === 'puzzle' ? '퀴즈 풀기' : '탐구하기',
        onDone: next
      });
      if (testAuto) setTimeout(function () { c.stop(); next(); }, 30);
    });
    if (st.activity === 'inscription') steps.push(function (next) { Activities.inscription(fresh(), { artifact: mainArt, tier: tier(), testAuto: testAuto, onDone: function () { result.research = true; next(); } }); });
    if (st.activity === 'nesting') steps.push(function (next) { Activities.nesting(fresh(), { tier: tier(), testAuto: testAuto, onDone: function () { result.research = true; next(); } }); });
    if (st.activity === 'decoration') steps.push(function (next) { Activities.decoration(fresh(), { artifact: mainArt, tier: tier(), testAuto: testAuto, onDone: function () { result.research = true; next(); } }); });
    steps.push(function (next) {
      Activities.quiz(fresh(), { questions: pickQuestions(st.id), testAuto: testAuto, onDone: function (q) { result.quiz = q; next(); } });
    });
    steps.push(function () { showResults(fresh(), result, flow); });

    function fresh() { root.innerHTML = ''; root.className = 'modal-body'; var d = el('div', 'act-root'); root.appendChild(d); return d; }
    var i = 0;
    (function run() { var f = steps[i++]; if (f) f(run); })();
  }

  function pickQuestions(stageId) {
    var t = tier();
    var pool = data.questions.filter(function (q) { return q.stage === stageId && q.tier === t; });
    if (!pool.length) pool = data.questions.filter(function (q) { return q.stage === stageId; });
    return Activities.shuffle(pool.slice()).slice(0, settings.quizCount || 1);
  }

  function showResults(root, result, flow) {
    var s = session.final, st = session.stage;
    var quality = Math.round(s.quality);
    var pts = [];
    pts.push(['🏺 유물 발견', 100]);
    if (quality >= 90) pts.push(['🪶 정밀 발굴 보너스', 100]); else if (quality >= 75) pts.push(['🪶 정밀 발굴 보너스', 50]);
    if (s.hotspots) pts.push(['🔍 문양 관찰 보너스 (' + s.hotspots + '곳)', s.hotspots * 20]);
    var coop = session.players >= 2 && s.contrib.slice(0, session.players).every(function (c) { return c >= 0.1; });
    if (coop) pts.push(['🤝 협동 발굴 보너스 (' + session.players + '명)', 40 * session.players]);
    if (result.research) pts.push(['📚 유물 연구 완료 보너스', 80]);
    if (result.quiz.correct) pts.push(['📜 역사 퀴즈 보너스', result.quiz.correct * 50]);
    if (session.timeUp) pts.push(['⏰ 시간 종료 (남은 흙 자동 정리)', -40]);
    var total = Math.max(50, pts.reduce(function (a, p) { return a + p[1]; }, 0));
    var quizPerfect = result.quiz.total > 0 && result.quiz.correct === result.quiz.total;
    var stars = 1 + (quality >= 80 && !session.timeUp ? 1 : 0) + (quizPerfect && (s.hotspotTotal === 0 || s.hotspots >= Math.ceil(s.hotspotTotal / 2)) ? 1 : 0);

    // 저장
    var rewards = Array.isArray(st.reward) ? st.reward : [st.reward];
    var firstGrid = session.records[0] ? session.records[0].grid : '-';
    var newItems = rewards.filter(function (id) { return !save.collected[id]; });
    rewards.forEach(function (id) {
      var prev = save.collected[id];
      var better = !prev || stars > (prev.stars || 0) || (stars === (prev.stars || 0) && quality >= (prev.quality || 0));
      if (better) save.collected[id] = { date: today(), grid: firstGrid, quality: quality, stars: stars, team: session.players };
    });
    var beforeTitle = titleFor(save.xp);
    save.xp += total;
    save.plays++;
    var prevBest = save.stageBest[session.stageIdx];
    if (!prevBest || prevBest.stars < stars || (prevBest.stars === stars && prevBest.score < total)) save.stageBest[session.stageIdx] = { stars: stars, score: total };
    var newBadges = [];
    function badge(k, cond) { if (cond && !save.badges[k]) { save.badges[k] = today(); newBadges.push(BADGES[k]); } }
    badge('first', true);
    badge('careful', quality >= 95);
    badge('team', coop);
    badge('pattern', s.hotspotTotal >= 2 && s.hotspots === s.hotspotTotal);
    badge('quiz', quizPerfect);
    badge('legend', st.theme === 'hyangno');
    persist();
    if (window.BaekjeHub) {
      var codex = [];
      rewards.forEach(function (id) { (CODEX_BY_ARTIFACT[id] || []).forEach(function (c) { if (codex.indexOf(c) < 0) codex.push(c); }); });
      BaekjeHub.award('excavation', { codex: codex, silent: true });
    }
    var afterTitle = titleFor(save.xp);

    root.classList.add('act-results');
    root.appendChild(el('h2', 'act-title', '🏆 발굴 조사 결과'));
    var wrap = el('div', 'res-wrap');
    var left = el('div', 'res-left');
    left.appendChild(el('div', 'res-stars', '<span class="s on">⭐</span>'.repeat(stars) + '<span class="s">☆</span>'.repeat(3 - stars)));
    left.appendChild(el('div', 'res-total', '+' + total + ' <small>경험치</small>'));
    left.appendChild(el('ul', 'res-pts', pts.map(function (p) { return '<li><span>' + p[0] + '</span><b>' + (p[1] > 0 ? '+' : '') + p[1] + '</b></li>'; }).join('')));
    left.appendChild(el('div', 'res-quality', '조사 품질 <b>' + quality + '점</b>' + (s.shovelHits ? ' · 삽 충격 ' + s.shovelHits + '회' : ' · 유물 손상 없음 👍') + ' · 퀴즈 ' + result.quiz.correct + '/' + result.quiz.total));
    wrap.appendChild(left);
    var right = el('div', 'res-right');
    var items = el('div', 'res-items');
    rewards.forEach(function (id) {
      var a = artifact(id);
      var c = el('canvas'); var g = Activities.hiDpi(c, 170, 170); Art.draw(g, a.art, 5, 5, 160, 160);
      var it = el('div', 'res-item' + (newItems.indexOf(id) >= 0 ? ' new' : '')); it.appendChild(c); it.appendChild(el('span', '', a.short));
      items.appendChild(it);
    });
    right.appendChild(el('div', 'res-sub', newItems.length ? '🆕 새 유물이 수장고에 들어왔어요!' : '수집한 유물'));
    right.appendChild(items);
    right.appendChild(el('div', 'res-title', afterTitle.icon + ' <b>' + afterTitle.name + '</b>' + (afterTitle !== beforeTitle ? ' <em>칭호 승급!</em>' : '')));
    if (newBadges.length) right.appendChild(el('div', 'res-badges', newBadges.map(function (b) { return '<span class="badge-chip">' + b.icon + ' ' + b.name + '</span>'; }).join('')));
    if (session.records.length) right.appendChild(el('div', 'res-notebook', '<b>📒 발굴 수첩</b>' + session.records.map(function (r) { return '<span>' + r.name + ' · ' + r.grid + ' · ' + r.state + '</span>'; }).join('')));
    wrap.appendChild(right);
    root.appendChild(wrap);
    var btns = el('div', 'res-btns');
    var b1 = el('button', 'big-btn museum', '<span>🏛️ 박물관에 전시하기</span>');
    b1.addEventListener('click', function () { Sound.play('select'); flow.close(); museumHighlight = rewards.slice(); show('scr-museum'); toast('유물을 끌어서 전시대에 올려 보세요!'); });
    btns.appendChild(b1);
    var nextIdx = session.stageIdx + 1;
    if (data.stages[nextIdx]) {
      var b2 = el('button', 'big-btn primary', '<span>다음 유적지 →</span>');
      var pl = session.players, tm = session.turnMode;
      b2.addEventListener('click', function () { Sound.play('select'); flow.close(); pendingSetup.players = pl; pendingSetup.turnMode = tm; openBrief(nextIdx); });
      btns.appendChild(b2);
    }
    var b3 = el('button', 'big-btn', '<span>처음으로</span>');
    b3.addEventListener('click', function () { Sound.play('select'); flow.close(); show('scr-menu'); });
    btns.appendChild(b3);
    root.appendChild(btns);
    Sound.play('fanfare');
  }

  /* ---------------- 일시정지 ---------------- */
  function pause() {
    if (!session || session.collected || session.timeUp) return;
    session.paused = true;
    engine.setFrozen(true);
    var box = el('div', 'pause-box');
    box.appendChild(el('h2', '', '⏸️ 잠깐 쉬어요'));
    var m;
    var add = function (label, cls, fn) { var b = el('button', 'big-btn ' + cls, '<span>' + label + '</span>'); b.addEventListener('click', function () { Sound.play('select'); fn(); }); box.appendChild(b); };
    add('계속 발굴하기', 'primary', function () { m.close(); });
    add('이 유적지 처음부터', '', function () { var s = session; m.close(); startDig(s.stageIdx, s.players, s.turnMode); });
    add('다른 유적지 고르기', '', function () { m.close(); show('scr-stages'); });
    add('처음 화면으로', '', function () { m.close(); show('scr-menu'); });
    if (settings.testMode) add('🧪 테스트: 즉시 발굴 완료', 'teacher', function () { m.close(); testFinishDig(); });
    m = modal(box, { cls: 'small', onClose: function () { if (session) { session.paused = false; if (!session.collected && !session.timeUp) engine.setFrozen(false); } } });
  }
  function testFinishDig() {
    engine.reveal(function () { engine.recordAll(); });
  }

  /* ---------------- 선생님 설정 ---------------- */
  function holdable(node, ms, fn) {
    var timer = null;
    var start = function (e) {
      e.preventDefault();
      if (timer) return;                  // 손가락·손바닥이 여러 개 닿아도 타이머는 하나만
      node.classList.add('holding');
      timer = setTimeout(function () { node.classList.remove('holding'); timer = null; fn(); }, ms);
    };
    var cancel = function () { if (timer) { clearTimeout(timer); timer = null; } node.classList.remove('holding'); };
    node.addEventListener('pointerdown', start);
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function openTeacher() {
    if (!data) return;                    // 데이터를 불러오기 전에는 열지 않는다
    if (session && !session.collected && !session.paused) { session.paused = true; engine.setFrozen(true); }
    var hubGame = window.BaekjeHub && BaekjeHub.isRunning() && current === 'scr-game';
    if (hubGame) BaekjeHub.pauseGame();
    Sound.play('select');
    var box = el('div', 'teacher');
    box.appendChild(el('h2', '', '⚙️ 선생님 설정'));
    var grid = el('div', 'set-grid');
    box.appendChild(grid);
    function seg(label, key, options, after) {
      var row = el('div', 'set-row');
      row.appendChild(el('label', '', label));
      var g = el('div', 'segs');
      options.forEach(function (op) {
        var b = el('button', 'seg' + (settings[key] === op[0] ? ' on' : ''), op[1]);
        b.addEventListener('click', function () {
          settings[key] = op[0]; saveSettings();
          g.querySelectorAll('.seg').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
          Sound.play('tap'); after && after();
        });
        g.appendChild(b);
      });
      row.appendChild(g);
      grid.appendChild(row);
    }
    seg('학년 (퀴즈·설명 수준)', 'grade', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]);
    seg('기본 참여 인원 (모든 게임)', 'players', [[1, '1명'], [2, '2명'], [3, '3명'], [4, '4명']]);
    if (settings.turnMode === null) settings.turnMode = false;
    seg('협동 참여 방식', 'turnMode', [[false, '동시에 함께 (기본)'], [true, '순서대로']]);
    seg('제한 시간', 'timeLimit', [[0, '없음'], [3, '3분'], [5, '5분'], [7, '7분'], [10, '10분']]);
    seg('발굴 난이도', 'difficulty', [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']]);
    seg('힌트', 'hints', [[true, '켜기'], [false, '끄기']]);
    seg('퀴즈 문제 수', 'quizCount', [[1, '1문제'], [2, '2문제']]);
    seg('스테이지 열기', 'unlockAll', [[true, '모두 열기'], [false, '차례대로']]);
    seg('화면 방향', 'orientation', [[0, '기본'], [180, '180° 회전']], applyOrientation);
    seg('그래픽 품질', 'resolution', [['auto', '자동(선명)'], ['low', '성능 우선']]);
    seg('마우스 테스트 모드', 'testMode', [[false, '끄기'], [true, '켜기']], applyTestMode);

    var vrow = el('div', 'set-row');
    vrow.appendChild(el('label', '', '효과음 크기'));
    var vg = el('div', 'segs');
    var range = el('input'); range.type = 'range'; range.min = 0; range.max = 100; range.value = Math.round(settings.volume * 100);
    range.addEventListener('input', function () { settings.volume = range.value / 100; Sound.setVolume(settings.volume); saveSettings(); });
    range.addEventListener('change', function () { Sound.play('correct'); });
    vg.appendChild(range);
    var mb = el('button', 'seg' + (settings.muted ? ' on' : ''), settings.muted ? '🔇 꺼짐' : '🔊 켜짐');
    mb.addEventListener('click', function () { setMuted(!settings.muted); mb.textContent = settings.muted ? '🔇 꺼짐' : '🔊 켜짐'; mb.classList.toggle('on', settings.muted); });
    vg.appendChild(mb);
    vrow.appendChild(vg); grid.appendChild(vrow);

    var act = el('div', 'set-actions');
    function action(label, cls, fn) { var b = el('button', 'seg big ' + (cls || ''), label); b.addEventListener('click', fn); act.appendChild(b); return b; }
    action('⛶ 전체 화면 켜기/끄기', '', toggleFullscreen);
    data.stages.forEach(function (st, i) {
      action('▶ ' + (i === 0 ? '훈련소' : '스테이지 ' + i) + ' 바로 시작', '', function () { m.close(); startDig(i, settings.players, settings.players > 1 && resolveTurn()); });
    });
    action('🖼️ 유물 이미지 등록', '', function () { openImageManager(); });
    action('🧪 자가 진단 실행', '', function () { m.close(); runSelfTest(); });
    var resetB = action('🗑️ 진행 기록 초기화', 'danger', function () {
      if (!resetB.dataset.confirm) { resetB.dataset.confirm = '1'; resetB.textContent = '정말 지울까요? 한 번 더 누르세요'; setTimeout(function () { delete resetB.dataset.confirm; resetB.textContent = '🗑️ 진행 기록 초기화'; }, 4000); return; }
      save = freshSave(); App.save = save; persist();
      resetB.textContent = '✔ 초기화했어요'; Sound.play('whoosh');
    });
    box.appendChild(act);
    if (window.BaekjeHub) BaekjeHub.teacherSection(box, function () { m.close(); });
    box.appendChild(el('p', 'set-note', (Store.ok ? '💾 설정과 수집 기록은 이 컴퓨터의 브라우저에 저장돼요.' : '⚠️ 이 환경에서는 저장소를 쓸 수 없어 이번 실행 동안만 기록이 유지돼요.') +
      ' · 기본값: 1회 활동 약 3~5분 (제한 시간 5분, 보통 난이도)'));
    var m = modal(box, { close: true, cls: 'wide', onClose: function () {
      if (session && session.paused && !modalStack.length) { session.paused = false; if (!session.collected && !session.timeUp) engine.setFrozen(false); }
      if (hubGame && current === 'scr-game' && !modalStack.length) BaekjeHub.resumeGame();
      if (current === 'scr-hub') BaekjeHub.renderHub();
      if (current === 'scr-menu') renderMenu();
      if (current === 'scr-stages') renderStages();
    } });
  }

  function openImageManager() {
    var box = el('div', 'img-manager');
    box.appendChild(el('h2', '', '🖼️ 유물 이미지 등록'));
    box.appendChild(el('p', 'set-note', '학교에서 사용 권한을 확인한 유물 사진만 등록하세요. 등록한 이미지는 발견 화면과 박물관에 표시되고, 발굴 판정에는 직접 그린 그림의 모양을 사용해요.'));
    var list = el('div', 'img-list');
    data.artifacts.forEach(function (a) {
      var row = el('div', 'img-row');
      var c = el('canvas'); var g = Activities.hiDpi(c, 90, 90); Art.draw(g, a.art, 2, 2, 86, 86);
      row.appendChild(c);
      row.appendChild(el('span', '', a.short + (Art.hasCustom(a.art) ? ' <em>등록됨</em>' : '')));
      var inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      var pick = el('button', 'seg', '사진 고르기');
      pick.addEventListener('click', function () { inp.click(); });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var img = new Image();
          img.onload = function () {
            var k = Math.min(1, 900 / Math.max(img.width, img.height));
            var cv = document.createElement('canvas'); cv.width = img.width * k | 0; cv.height = img.height * k | 0;
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            // 저장 공간(약 5MB)을 아끼려고 JPEG로 줄인다. 진행 기록 저장 공간을 남겨 두기 위해 크기를 제한한다
            var url = cv.toDataURL('image/jpeg', 0.82);
            if (url.length > 600000) url = cv.toDataURL('image/jpeg', 0.6);
            Art.setCustom(a.art, url);
            var ok = Store.set(KEY_IMG + a.art, url);
            toast(ok ? '이미지를 등록했어요' : '저장 공간이 부족해 이번 실행 동안만 사용해요');
            mm.close(); openImageManager();
          };
          img.src = rd.result;
        };
        rd.readAsDataURL(f);
      });
      row.appendChild(pick); row.appendChild(inp);
      var del = el('button', 'seg', '기본 그림으로');
      del.addEventListener('click', function () { Art.setCustom(a.art, a.image || null); Store.remove(KEY_IMG + a.art); mm.close(); openImageManager(); });
      row.appendChild(del);
      list.appendChild(row);
    });
    box.appendChild(list);
    var mm = modal(box, { close: true, cls: 'wide' });
  }

  // 협동 발굴은 기본이 "동시에 함께 파기". 선생님이 "순서대로"를 고른 경우에만 차례 방식
  function resolveTurn() { return settings.turnMode === true; }

  function applyOrientation() {
    flip = settings.orientation === 180;
    document.body.classList.toggle('orient-flip', flip);
    layout();
  }

  var fpsBox = null, fpsAcc = 0, fpsN = 0;
  function applyTestMode() {
    var d = $('#debug-info');
    d.classList.toggle('hidden', !settings.testMode);
    fpsBox = settings.testMode ? d : null;
  }
  function fpsUpdate(dt) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      fpsBox.textContent = '🧪 테스트 모드 · FPS ' + Math.round(fpsN / fpsAcc) + ' · 화면 배율 ' + scale.toFixed(2) + ' · 활성 터치 ' + (engine && session ? engine.activePointers() : 0) +
        ' · 최대 터치 ' + (navigator.maxTouchPoints || 0) + (session && session.stats ? ' · 노출 ' + Math.round(session.stats.exposed * 100) + '% 주변 ' + Math.round(session.stats.ring * 100) + '% 먼지 ' + Math.round(session.stats.dust * 100) + '%' : '');
      fpsAcc = 0; fpsN = 0;
    }
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
      else document.exitFullscreen();
    } catch (e) { toast('이 브라우저에서는 F11 키로 전체 화면을 켜 주세요'); }
  }

  function setMuted(m) {
    settings.muted = m; Sound.setMuted(m); saveSettings();
    $('#hud-sound img').src = m ? 'assets/icons/mute.svg' : 'assets/icons/sound.svg';
    if (!m) Sound.play('select');
  }

  function saveSettings() { Store.set(KEY_SET, settings); }
  var persistWarned = false;
  function persist() {
    if (!Store.set(KEY_SAVE, save) && !persistWarned) {
      persistWarned = true;
      toast('⚠️ 저장 공간이 부족해 기록이 저장되지 않아요. 선생님 설정에서 등록한 이미지를 지워 주세요', { dur: 5000, key: 'quota' });
    }
  }

  /* ---------------- 오류 처리 ---------------- */
  var errT = 0;
  function softError(err) {
    console.error(err);
    if (performance.now() - errT > 5000) {
      errT = performance.now();
      toast('앗, 작은 문제가 생겼지만 계속할 수 있어요. 이상하면 ⏸️ → "처음부터"를 눌러 주세요', { key: 'err', dur: 4000 });
    }
  }
  function fatal(msg) {
    $('#fatal-msg').textContent = msg + ' 화면을 다시 불러오면 이어서 할 수 있어요.';
    $('#fatal').classList.remove('hidden');
  }

  /* ---------------- 이벤트 연결 ---------------- */
  function bindUI() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b || b.classList.contains('hold-btn')) return;
      var a = b.dataset.action;
      if (a !== 'sound') Sound.play('select');
      switch (a) {
        case 'start': pendingSetup.players = settings.players; pendingSetup.turnMode = settings.players > 1 && resolveTurn(); session = null; show('scr-stages'); break;
        case 'coop': show('scr-players'); break;
        case 'museum': show('scr-museum'); break;
        case 'howto': show('scr-howto'); break;
        case 'menu': show('scr-menu'); break;
        case 'hub': show('scr-hub'); break;
        case 'stages': show('scr-stages'); break;
        case 'dig-go': startDig(pendingSetup.stage, pendingSetup.players, pendingSetup.turnMode); break;
        case 'collect': collect(); break;
        case 'pause': pause(); break;
        case 'sound': setMuted(!settings.muted); break;
      }
    });
    $all('.choice-card').forEach(function (c) {
      c.addEventListener('click', function () {
        Sound.play('select');
        pendingSetup.players = +c.dataset.players; pendingSetup.turnMode = pendingTurn; session = null;
        show('scr-stages');
      });
    });
    $all('#scr-players .seg').forEach(function (b) {
      b.addEventListener('click', function () {
        pendingTurn = +b.dataset.turn === 1; Sound.play('tap');
        $all('#scr-players .seg').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
    holdable($('.hold-btn'), 3000, openTeacher);
    $all('.corner-hold').forEach(function (c) { holdable(c, 3000, openTeacher); });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) { e.preventDefault(); openTeacher(); }
      if (e.key === 'Escape' && current === 'scr-dig' && !modalStack.length) pause();
    });
    // 첫 터치에서 오디오 잠금 해제
    document.addEventListener('pointerdown', function () { Sound.unlock(); }, { once: true });
    // 확대·축소 제스처와 길게 눌러 생기는 메뉴 막기
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    window.addEventListener('resize', layout);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', function () { setTimeout(layout, 50); });
  }

  /* ---------------- 자가 진단 (?selftest=1 또는 선생님 설정) ---------------- */
  function runSelfTest() {
    var log = [], fails = 0;
    var out = $('#selftest-out') || (function () { var p = el('pre'); p.id = 'selftest-out'; document.body.appendChild(p); return p; })();
    function ok(cond, msg) { log.push((cond ? '✔ ' : '✘ ') + msg); if (!cond) fails++; out.textContent = log.join('\n'); }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function ptr(type, id, x, y) {
      var cx = offX + x * scale, cy = offY + y * scale;
      if (flip) { cx = offX + (STAGE_W - x) * scale; cy = offY + (STAGE_H - y) * scale; }
      $('#cv-fx').dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: cx, clientY: cy, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1 }));
    }
    function soilAlphaAt(x, y) {
      var R = engine.resolution();
      return $('#cv-soil').getContext('2d').getImageData((x - SITE.x) * R | 0, (y - SITE.y) * R | 0, 1, 1).data[3];
    }
    testAuto = true;
    var saveBackup = JSON.stringify(save);
    var setBackup = JSON.stringify(settings);
    var hubBackup = Store.get('baekje-hub.save.v1');
    // 진단 기준은 '보통' 난이도에 맞춰져 있으므로 교사 설정과 무관하게 고정한다
    settings.timeLimit = 0; settings.quizCount = 2; settings.difficulty = 'normal'; settings.hints = false;
    ok(data.artifacts.length === 6 && data.stages.length === 4 && data.questions.length >= 24, '데이터 불러오기 (유물 ' + data.artifacts.length + ', 스테이지 ' + data.stages.length + ', 문제 ' + data.questions.length + ')');
    ok(data.stages.every(function (s) { return s.finds.every(function (f) { return !!artifact(f.artifact); }); }), '스테이지와 유물 연결');
    return Promise.resolve().then(function () {
      document.querySelector('[data-action="start"]').click();
      ok(current === 'scr-stages', '발굴 시작 → 유적지 선택 화면');
      openBrief(1);
      document.querySelector('[data-action="dig-go"]').click();
      ok(current === 'scr-dig' && !!session, '발굴 현장 표시');
      return wait(300);
    }).then(function () {
      var fx = $('#cv-fx');
      ok(getComputedStyle(fx).touchAction === 'none', 'touch-action: none 적용');
      var a0 = soilAlphaAt(500, 400), b0 = soilAlphaAt(1400, 700);
      ok(a0 === 255 && b0 === 255, '처음에는 흙이 덮여 있음');
      // 두 손가락 동시 입력
      ptr('pointerdown', 1, 450, 400); ptr('pointerdown', 2, 1350, 700);
      ok(engine.activePointers() === 2, '두 개의 터치를 동시에 추적 (pointerId별)');
      for (var k = 0; k < 6; k++) {
        for (var i = 0; i <= 10; i++) { ptr('pointermove', 1, 450 + i * 10, 400 + (k % 2) * 6); ptr('pointermove', 2, 1350 + i * 10, 700 - (k % 2) * 6); }
        for (i = 10; i >= 0; i--) { ptr('pointermove', 1, 450 + i * 10, 403); ptr('pointermove', 2, 1350 + i * 10, 703); }
      }
      ptr('pointerup', 1, 450, 400); ptr('pointerup', 2, 1350, 700);
      ok(engine.activePointers() === 0, '손가락을 떼면 입력 상태 정리');
      return wait(120);
    }).then(function () {
      var a1 = soilAlphaAt(500, 400), b1 = soilAlphaAt(1400, 700);
      ok(a1 < 255 || b1 < 255, '손가락이 지나간 자리의 흙이 실제로 제거됨 (알파 ' + a1 + ', ' + b1 + ')');
      // 도구 특성 비교: 같은 동작에서 삽이 붓보다 많이 판다
      var T = DigEngine.TOOLS;
      ok(T.shovel.radius > T.brush.radius && T.brush.radius > T.fine.radius && T.shovel.dustMul === 0 && T.fine.dustMul > T.brush.dustMul, '도구별 범위·세기·먼지 처리 특성이 서로 다름');
      var f = engine.finds()[0];
      var R = engine.resolution();
      var x0 = (f.x - f.w * 0.75) / R, x1 = (f.x + f.w * 0.75) / R, y0 = (f.y - f.h * 0.7) / R, y1 = (f.y + f.h * 0.7) / R;
      var before = engine.stats().quality;
      for (var n = 0; n < 8; n++) engine.scrub('shovel', x0, y0, x1, y1, 14);
      return wait(400).then(function () {
        var s = engine.stats();
        ok(s.exposed < 0.05, '삽만으로는 유물 바로 위 흙이 남음 (노출 ' + Math.round(s.exposed * 100) + '%)');
        ok(s.quality < before, '유물 근처에서 삽을 쓰면 조사 품질 감소 (' + before + ' → ' + s.quality + ')');
        ok(s.ring < 0.5, '주변 흙은 붓으로 정리해야 함');
        for (n = 0; n < 3; n++) engine.scrub('brush', x0, y0, x1, y1, 10);
        return wait(400);
      }).then(function () {
        var s = engine.stats();
        ok(s.exposed >= s.thresholds.expose, '붓으로 유물이 드러남 (노출 ' + Math.round(s.exposed * 100) + '%, 주변 ' + Math.round(s.ring * 100) + '%)');
        ok(!s.complete, '기록 전에는 완료되지 않음');
        for (n = 0; n < 4; n++) engine.scrub('fine', x0, y0, x1, y1, 8);
        return wait(400);
      }).then(function () {
        var s = engine.stats();
        ok(s.dust >= s.thresholds.dust, '정밀 붓으로 먼지 제거 (' + Math.round(s.dust * 100) + '%)');
        ok(s.hotspots > 0, '새겨진 글자(문양) 발견 이벤트 (' + s.hotspots + '/' + s.hotspotTotal + ')');
        selectTool(0, 'record');
        var sx = SITE.x + f.x / R, sy = SITE.y + f.y / R;
        ptr('pointerdown', 5, sx, sy); ptr('pointerup', 5, sx, sy);
        return wait(500);
      });
    }).then(function () {
      var s = engine.stats();
      ok(s.recorded === 1, '기록 도구로 출토 위치 기록');
      ok(s.complete && !$('#btn-collect').classList.contains('hidden'), '발굴 완료 판정 → 수습 버튼 표시');
      $('#btn-collect').click();
      return wait(600);
    }).then(function () {
      ok(!!save.collected.sarigam, '수습·탐구·퀴즈 후 수집 기록 저장');
      ok(!!document.querySelector('.act-results'), '결과 화면 표시');
      var a = artifact('sarigam');
      ok(a.site.indexOf('능산리') >= 0 && a.era.indexOf('567') >= 0, '유물 이름·출토지 데이터 (석조사리감 / 능산리사지 / 567년)');
      closeAllModals();
      museumHighlight = ['sarigam'];
      show('scr-museum');
      ok(!!document.querySelector('#museum-tray .tray-item[data-id="sarigam"]'), '박물관 수장고에 발견 유물 표시');
      ok(document.querySelectorAll('#museum-tray .tray-item.locked').length >= 1, '미발견 유물은 잠금 상태로 표시');
      return wait(100);
    }).then(function () {
      // 다른 스테이지도 오류 없이 시작·재시작되는지
      var chain = Promise.resolve();
      [0, 2, 3, 3].forEach(function (i, k) {
        chain = chain.then(function () {
          startDig(i, k === 3 ? 4 : 2, false);
          return wait(250).then(function () {
            ok(engine.finds().length === data.stages[i].finds.length, '스테이지 ' + i + ' 시작 (' + (k === 3 ? '4인 재시작' : '2인') + ')');
            testFinishDig();
            var t0 = performance.now();
            return (function poll() {
              return wait(200).then(function () {
                if (engine.stats().complete || performance.now() - t0 > 10000) return performance.now() - t0;
                return poll();
              });
            })();
          }).then(function (ms) {
            var s = engine.stats();
            ok(s.complete, '스테이지 ' + i + ' 완료 판정 (자동 정리 ' + Math.round(ms) + 'ms)');
            collect();
            return wait(700);
          }).then(function () {
            ok(!!document.querySelector('.act-results'), '스테이지 ' + i + ' 활동·퀴즈·결과 흐름');
            closeAllModals();
          });
        });
      });
      return chain;
    }).then(function () {
      ok(['practice-pot', 'bronze-hap', 'silver-ho', 'gold-byeong', 'hyangno'].every(function (id) { return save.collected[id]; }), '모든 스테이지 보상 유물 수집');
      show('scr-menu');
    }).catch(function (e) {
      ok(false, '진단 중 오류: ' + (e && e.message));
    }).then(function () {
      testAuto = false;
      if (!/selftest=keep/.test(location.search)) {
        save = JSON.parse(saveBackup); App.save = save; persist();
        if (hubBackup) Store.set('baekje-hub.save.v1', hubBackup); else Store.remove('baekje-hub.save.v1');
        if (window.BaekjeHub) BaekjeHub.reload();
      }
      settings = JSON.parse(setBackup); App.settings = settings;
      log.push(fails ? ('결과: 실패 ' + fails + '건') : '결과: 모두 통과');
      out.textContent = log.join('\n');
      document.title = (fails ? 'SELFTEST FAIL ' + fails : 'SELFTEST PASS') + ' :: ' + log.join(' | ');
      if (!/selftest/.test(location.search)) {
        var box = el('div', 'selftest-box', '<h2>🧪 자가 진단 결과</h2><pre>' + log.join('\n') + '</pre>');
        modal(box, { close: true, cls: 'wide' });
      }
      return { fails: fails, log: log };
    });
  }

  /* ---------------- 시작 ---------------- */
  function init() {
    stageEl = $('#stage');
    layout();
    var s = Store.get(KEY_SET);
    settings = Object.assign({}, DEFAULTS, s || {});
    var sv = Store.get(KEY_SAVE);
    save = Object.assign(freshSave(), sv || {});
    App.save = save; App.settings = settings;
    Sound.setVolume(settings.volume); Sound.setMuted(settings.muted);
    $('#hud-sound img').src = settings.muted ? 'assets/icons/mute.svg' : 'assets/icons/sound.svg';
    applyOrientation(); applyTestMode();
    TOOL_LIST.forEach(function (t) { var im = new Image(); im.src = t.icon; icons[t.id] = im; });
    bindUI();
    requestAnimationFrame(tick);
    loadData().then(function () {
      data.artifacts.forEach(function (a) {
        if (a.image) Art.setCustom(a.art, a.image);
        var custom = Store.get(KEY_IMG + a.art);
        if (custom) Art.setCustom(a.art, custom);
      });
      App.data = data;
      drawMenuBg();
      if (window.BaekjeHub) BaekjeHub.init();
      show(window.BaekjeHub ? 'scr-hub' : 'scr-menu');
      // ?game=village 처럼 주소에 적으면 그 게임을 바로 시작한다 (시연·테스트용). &players=2 &difficulty=hard
      var gm = /[?&]game=(\w+)/.exec(location.search);
      if (gm && window.BaekjeHub) {
        var q = function (k, d) { var r = new RegExp('[?&]' + k + '=(\\w+)').exec(location.search); return r ? r[1] : d; };
        BaekjeHub.launch(gm[1], { players: +q('players', settings.players) || 1, difficulty: q('difficulty', 'normal'), grade: settings.grade, timeLimit: settings.timeLimit, unlockAll: settings.unlockAll, testMode: settings.testMode });
      }
      if (/selftest/.test(location.search)) setTimeout(runSelfTest, 300);
    }).catch(function (e) {
      fatal(e.message || '게임 데이터를 불러오지 못했어요.');
    });
  }

  window.addEventListener('error', function (e) {
    if (!data) fatal('게임을 시작하는 중 문제가 생겼어요.');
    else if (current === 'scr-game' && window.BaekjeHub && BaekjeHub.isRunning()) { BaekjeHub.gameError(e.error || e.message); softError(e.error || e.message); }
    else softError(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    if (current === 'scr-game' && window.BaekjeHub && BaekjeHub.isRunning()) BaekjeHub.gameError(e.reason);
    softError(e.reason);
  });

  window.App = {
    save: save, settings: settings, data: null,
    scale: function () { return scale; },
    mapPoint: mapPoint,
    artifact: function (id) { return artifact(id); },
    persist: function () { save = App.save; persist(); },
    modal: modal, toast: toast,
    selfTest: runSelfTest,
    // 체험관(hub.js)과 게임 모듈이 쓰는 공용 기능
    store: Store, show: show, current: function () { return current; },
    saveSettings: function () { saveSettings(); }, setMuted: function (m) { setMuted(m); },
    holdable: holdable, openTeacher: function () { openTeacher(); }, closeAllModals: function () { closeAllModals(); },
    modalCount: function () { return modalStack.length; },
    // 체험관 시작 창에서 2명 이상을 고르면 협동 발굴(기본: 동시에)로 바로 유적지 선택
    startExcavation: function (players) {
      session = null;
      pendingSetup.players = players; pendingSetup.turnMode = players > 1 && resolveTurn();
      show(players > 1 ? 'scr-stages' : 'scr-menu');
    },
    // 테스트·시연용 (선생님 설정의 자가 진단과 개발 도구에서 사용)
    debug: {
      engine: function () { return engine; }, startDig: startDig, openBrief: openBrief, collect: collect,
      show: show, openTeacher: openTeacher, site: SITE, setTestAuto: function (v) { testAuto = v; }
    },
    onDisplayed: function () {
      var all = data.artifacts.every(function (a) { return Object.keys(save.placements).some(function (k) { return save.placements[k] === a.id; }); });
      if (all && !save.badges.curator) { save.badges.curator = today(); persist(); toast('🏛️ 배지 획득: 큐레이터! 모든 유물을 전시했어요', { big: true }); }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
