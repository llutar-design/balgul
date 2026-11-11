/* 백제마을 만들기 — 사비 시기 백제 마을을 2D 아이소메트릭으로 짓는 협동 건설 시뮬레이션
 * 건물 자료: data/buildings.json(host.data.buildings), 역사 설명: historyCards.json 카드(host.card).
 * 지도와 건물 모양은 교육용 가상 재구성이며, 자원·생산은 게임을 위한 단순화이다. 연결 규약은 docs/GAME_API.md. */
(function () {
  'use strict';

  var N = 22, HW = 32, HH = 16, TICK = 3, RES_K = 1.6;      // 격자 크기, 타일 반폭·반높이(월드 단위), 생산 주기(초), 캐시 배율
  var NOTICE = '이 마을은 교육용 가상 재구성이에요. 실제 사비 도성을 정확히 복원한 것이 아니며, 건물 모양 대부분은 창작 재현이에요. 자원과 생산은 게임을 위한 단순화로 백제의 실제 경제를 그대로 나타내지 않아요.';
  var STAGES = ['작은 백제 마을', '발전하는 백제 마을', '활기찬 사비 마을', '찬란한 사비 문화도시'];
  var REQ = [null, null, { pop: 6, cult: 15 }, { pop: 14, cult: 80, mis: 4 }, { pop: 24, cult: 200, palace: 1 }];
  var RES = [['food', '식량', '🍚'], ['wood', '나무', '🪵'], ['clay', '흙·재료', '🧱'], ['culture', '문화', '✨']];
  var ICON = { food: '🍚', wood: '🪵', clay: '🧱', culture: '✨' };
  var NAME = { food: '식량', wood: '나무', clay: '흙과 건축 재료', culture: '문화 점수' };
  var GROUPS = [['life', '생활', '🏠'], ['prod', '생산', '🔨'], ['culture', '문화', '🛕'], ['major', '주요', '🏯']];
  var DIFF = {
    easy: { start: { food: 150, wood: 200, clay: 160 }, cost: 0.6, prod: 1.5, cap: 600, eat: 0, spawn: 0.8 },
    normal: { start: { food: 30, wood: 70, clay: 45 }, cost: 1, prod: 1, cap: 300, eat: 0, spawn: 1.5 },
    hard: { start: { food: 25, wood: 45, clay: 30 }, cost: 1.25, prod: 1, cap: 200, eat: 0.25, spawn: 2 }
  };
  var SIDE_ANG = { bottom: 0, top: 180, left: 90, right: -90 };
  var WORKSHOP = { kiln: 1, weaving: 1, smithy: 1 };
  var EMO = { farm: '🌾', kiln: '🏺', weaving: '🧵', smithy: '🔨', port: '⛵', market: '🛒', temple: '🙏', pagoda: '🙏', school: '📖', well: '💧', storage: '📦', office: '📜', palace: '👑' };
  var ROBES = ['#c0504d', '#4f81bd', '#7fae4a', '#8064a2', '#e69a3a', '#3fa0b5', '#d0708e', '#9a7b4f'];
  var MISSIONS = [
    { id: 'm1', title: '주민이 살 집 세 채 만들기', short: '집 3채', hint: '초가집(또는 기와집)을 세 채 지어요. 지붕이 다 올라가야 해요.' },
    { id: 'm2', title: '농경지를 만들고 식량 생산하기', short: '식량 생산', hint: '연두색 평야에 농경지를 짓고, 식량을 10만큼 길러요. 도로와 이으면 더 빨라요.' },
    { id: 'm3', title: '시장과 도로 연결하기', short: '시장·도로', hint: '시장을 짓고, 도로로 시장과 집을 이어요.' },
    { id: 'm4', title: '토기 공방 건설하기', short: '토기 공방', hint: '토기 공방을 지어 그릇과 기와를 구워요.' },
    { id: 'm5', title: '절과 탑을 배치하고 역사적 역할 알아보기', short: '절과 탑', hint: '절과 탑을 지으면 백제 불교 이야기를 볼 수 있어요.' },
    { id: 'm6', title: '성벽과 성문을 배치해 사비 도성의 방어 개념 이해하기', short: '성벽·성문', hint: '성문 1개와 성벽 2구간을 지어요. 성문은 도로와 닿아야 해요.' }
  ];
  var HIST = {
    m5: { title: '🛕 절과 탑의 역사적 역할', cards: ['bld-temple', 'bld-pagoda', 'art-pagoda', 'plc-jeongnimsa'],
      ask: '백제의 절은 문 → 탑 → 금당 → 강당이 한 줄로 놓이는 배치가 많았어요. 우리 마을의 절 앞에 탑을 세워 볼까요?' },
    m6: { title: '🧱 사비 도성의 방어', cards: ['bld-wall', 'plc-naseong', 'plc-baengma', 'bld-gate'],
      ask: '사비 도성은 뒤쪽의 부소산성, 동쪽과 북쪽의 나성, 서쪽과 남쪽의 백마강이 함께 감쌌어요. 우리 마을도 강과 언덕과 성벽이 함께 지키고 있나요?' }
  };

  /* ---------------- 공용 도구 ---------------- */
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; }
  function txt(t, c, s) { var e = el(t, c); e.textContent = s; return e; }
  function idx(i, j) { return j * N + i; }
  function inMap(i, j) { return i >= 0 && j >= 0 && i < N && j < N; }
  function hash(i, j) { var h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ---------------- 지도 (가상의 사비 일대: 서·남쪽 강, 북쪽 언덕, 동쪽 나성 자리) ---------------- */
  function wEdge(j) { return j > 16 ? 3 : 1 + (Math.sin(j * 0.7) > 0.3 ? 1 : 0); }
  function sEdge(i) { return i < 4 ? 18 : 19 + (Math.sin(i * 0.6 + 1) > 0.4 ? 1 : 0); }
  function genMap() {
    var t = [], r = [], z = [];
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var c = 'g', zz = '';
      if (i <= wEdge(j) || j >= sEdge(i)) c = 'w';
      else if (i <= wEdge(j) + 3 || j >= sEdge(i) - 3) c = 'p';
      if (c === 'g') {
        if ((i - 13) * (i - 13) / 14 + (j - 1) * (j - 1) / 5 < 1) c = 'h';
        else if ((i - 13) * (i - 13) / 34 + (j - 1.5) * (j - 1.5) / 13 < 1) c = 'f';
        else if (i >= 17 && i <= 19 && j >= 3 && j <= 8 && hash(i, j) < 0.75) c = 'f';
        else if (i >= 15 && i <= 19 && j >= 15 && j <= 17 && hash(i, j) < 0.6) c = 'f';
        else if (i > 6 && hash(i * 3, j * 7) < 0.035) c = 'f';
      }
      if (i >= 10 && i <= 13 && j >= 5 && j <= 8) zz = 'P';          // 왕궁 터(추정)
      if (i >= 8 && i <= 11 && j >= 12 && j <= 14) zz = 'T';         // 정림사지 자리
      if (i >= 20 && j >= 2 && j <= 18 && c !== 'w') zz = 'N';       // 나성 자리
      if (zz && c === 'f') c = 'g';
      var road = (j === 11 && i >= 4) || (i === 12 && j >= 9 && j <= 19);
      if (road && c === 'w') road = false;
      if (road && (c === 'f' || c === 'h')) c = 'g';
      t.push(c); r.push(road ? 1 : 0); z.push(zz);
    }
    return { t: t, r: r, z: z };
  }

  /* ---------------- 아이소메트릭 그리기 도구 (월드 단위: 칸 = 64×32) ---------------- */
  function P(a, b) { return [(a - b) * HW, (a + b) * HH]; }
  function Pz(a, b, z) { return [(a - b) * HW, (a + b) * HH - z]; }
  function poly(g, pts, fill, stroke, lw) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function line(g, p, q, c, w) { g.strokeStyle = c; g.lineWidth = w || 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  // 직육면체: [a0,a1]×[b0,b1], 높이 z0~z1. 보이는 면은 왼쪽 앞(b1)과 오른쪽 앞(a1), 윗면
  function box(g, a0, b0, a1, b1, z0, z1, ct, cl, cr) {
    poly(g, [Pz(a0, b1, z0), Pz(a1, b1, z0), Pz(a1, b1, z1), Pz(a0, b1, z1)], cl);
    poly(g, [Pz(a1, b1, z0), Pz(a1, b0, z0), Pz(a1, b0, z1), Pz(a1, b1, z1)], cr);
    if (ct) poly(g, [Pz(a0, b0, z1), Pz(a1, b0, z1), Pz(a1, b1, z1), Pz(a0, b1, z1)], ct);
  }
  function fL(g, a0, a1, b, z0, z1, c) { poly(g, [Pz(a0, b, z0), Pz(a1, b, z0), Pz(a1, b, z1), Pz(a0, b, z1)], c); }
  function fR(g, b0, b1, a, z0, z1, c) { poly(g, [Pz(a, b0, z0), Pz(a, b1, z0), Pz(a, b1, z1), Pz(a, b0, z1)], c); }
  function post(g, a, b, z0, z1, c, w) { line(g, Pz(a, b, z0), Pz(a, b, z1), c, w || 2); }
  function ell(g, x, y, rx, ry, c) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function jar(g, a, b, s, c) {
    var p = P(a, b);
    ell(g, p[0], p[1] + 1, 6 * s, 3 * s, 'rgba(0,0,0,.18)');
    g.fillStyle = c || '#8a5a34'; g.beginPath(); g.ellipse(p[0], p[1] - 6 * s, 6 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
    ell(g, p[0], p[1] - 12 * s, 3.6 * s, 1.6 * s, '#5a3a1e');
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(p[0] - 2 * s, p[1] - 8 * s, 1.6 * s, 3 * s, 0, 0, Math.PI * 2); g.fill();
  }
  function qpt(p, c, q, t) { var u = 1 - t; return [u * u * p[0] + 2 * u * t * c[0] + t * t * q[0], u * u * p[1] + 2 * u * t * c[1] + t * t * q[1]]; }
  // 우진각(모임) 지붕: 처마 모서리가 살짝 들리고, 기와골·수막새·치미를 선택해 그린다. c = [앞왼쪽, 앞오른쪽, 뒷면, 용마루]
  function roof(g, a0, b0, a1, b1, z, rh, o, c, opt) {
    opt = opt || {};
    a0 -= o; b0 -= o; a1 += o; b1 += o;
    var la = a1 - a0, lb = b1 - b0, kk = opt.k == null ? 0.5 : opt.k, up = opt.up || 0, r1p, r2p;
    if (la >= lb) { r1p = [a0 + lb * kk, (b0 + b1) / 2]; r2p = [a1 - lb * kk, (b0 + b1) / 2]; }
    else { r1p = [(a0 + a1) / 2, b0 + la * kk]; r2p = [(a0 + a1) / 2, b1 - la * kk]; }
    var Nn = Pz(a0, b0, z + up), E = Pz(a1, b0, z + up), S = Pz(a1, b1, z + up), W = Pz(a0, b1, z + up);
    var R1 = Pz(r1p[0], r1p[1], z + rh), R2 = Pz(r2p[0], r2p[1], z + rh), sag = up * 1.7;
    function face(p, q, rB, rA, col, tiles) {
      var cp = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + sag];
      g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(cp[0], cp[1], q[0], q[1]);
      g.lineTo(rB[0], rB[1]); if (rA !== rB) g.lineTo(rA[0], rA[1]); g.closePath();
      g.fillStyle = col; g.fill();
      if (opt.thatch) {
        g.save(); g.clip();
        for (var s = 1; s < 14; s++) { var e1 = qpt(p, cp, q, s / 14), rr = rA === rB ? rA : [rA[0] + (rB[0] - rA[0]) * s / 14, rA[1] + (rB[1] - rA[1]) * s / 14]; line(g, e1, [e1[0] + (rr[0] - e1[0]) * 0.55, e1[1] + (rr[1] - e1[1]) * 0.55], 'rgba(120,80,20,.22)', 1.2); }
        g.restore();
      }
      if (tiles) {
        g.save(); g.clip();
        for (var t2 = 1; t2 < tiles; t2++) {
          var e2 = qpt(p, cp, q, t2 / tiles), r3 = rA === rB ? rA : [rA[0] + (rB[0] - rA[0]) * t2 / tiles, rA[1] + (rB[1] - rA[1]) * t2 / tiles];
          line(g, e2, r3, 'rgba(0,0,0,.22)', 1.3);
        }
        g.restore();
        // 처마 끝 수막새(연꽃무늬를 떠올리는 동그라미)
        for (var t3 = 0.5; t3 < tiles; t3 += 1) { var e3 = qpt(p, cp, q, t3 / tiles); ell(g, e3[0], e3[1] + 1, 1.7, 1.7, opt.gold ? '#e8c04a' : '#8f97a6'); }
      }
      g.strokeStyle = opt.thatch ? 'rgba(110,70,20,.55)' : 'rgba(20,24,30,.6)'; g.lineWidth = opt.thatch ? 2 : 2.4;
      g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(cp[0], cp[1], q[0], q[1]); g.stroke();
    }
    var tl = opt.tiles || 0;
    if (la >= lb) {
      face(Nn, E, R2, R1, c[2]); face(W, Nn, R1, R1, c[2]);
      face(W, S, R2, R1, c[0], tl); face(S, E, R2, R2, c[1], Math.max(0, Math.round(tl * lb / la)));
    } else {
      face(Nn, E, R1, R1, c[2]); face(W, Nn, R1, R2, c[2]);
      face(W, S, R2, R2, c[0], Math.max(0, Math.round(tl * la / lb))); face(S, E, R1, R2, c[1], tl);
    }
    // 용마루
    g.lineCap = 'round';
    line(g, R1, R2, c[3], opt.thatch ? 5 : 4);
    if (opt.thatch) { ell(g, (R1[0] + R2[0]) / 2, (R1[1] + R2[1]) / 2, Math.max(4, Math.abs(R1[0] - R2[0]) / 2 + 4), 3, c[3]); }
    if (opt.chimi) {
      [R1, R2].forEach(function (rp, s2) {
        var dx = s2 ? 1 : -1; if (R1[0] === R2[0]) dx = s2 ? 1 : -1;
        g.strokeStyle = opt.gold ? '#d8a93a' : c[3]; g.lineWidth = 3;
        g.beginPath(); g.moveTo(rp[0], rp[1]); g.quadraticCurveTo(rp[0] + dx * 2, rp[1] - 9, rp[0] - dx * 3, rp[1] - 11); g.stroke();
      });
    }
    g.lineCap = 'butt';
  }
  function flag(g, a, b, h, c1, c2) {
    post(g, a, b, 0, h, '#5a3a1e', 2.4);
    var t = Pz(a, b, h);
    g.fillStyle = c1; g.beginPath(); g.moveTo(t[0], t[1]); g.quadraticCurveTo(t[0] + 12, t[1] + 2, t[0] + 22, t[1] + 6); g.lineTo(t[0] + 20, t[1] + 20); g.quadraticCurveTo(t[0] + 10, t[1] + 15, t[0], t[1] + 16); g.fill();
    if (c2) { g.fillStyle = c2; g.fillRect(t[0] + 2, t[1] + 7, 14, 3); }
  }

  var C = {
    wall: '#f2e6cb', wallR: '#d5c19c', post: '#8a4b2a', red: '#a83a2c', redD: '#86291f',
    tile: ['#69728a', '#515a6e', '#454c5d', '#2f343f'],
    thatch: ['#dfba66', '#c29945', '#a98439', '#efd38c'],
    stone: ['#d8cfbb', '#b2a790', '#9b907a'],
    wood: ['#c0925f', '#9e7143', '#855c34'],
    pstone: ['#c9c3b6', '#a7a194', '#928c80', '#7f796e']
  };

  /* 건물 그림: 원점 = 차지한 칸의 위쪽 꼭짓점 */
  var DRAW = {
    road: function (g) {
      poly(g, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], '#d9c08c', '#b39661', 2);
      [[.3, .4], [.6, .3], [.5, .7], [.75, .65]].forEach(function (s) { var p = P(s[0], s[1]); ell(g, p[0], p[1], 2.4, 1.3, '#b8a070'); });
    },
    house: function (g) {
      box(g, .16, .16, .84, .84, 0, 3, C.stone[0], C.stone[1], C.stone[2]);
      box(g, .22, .22, .78, .78, 3, 19, null, '#ecd9b0', '#cfb588');
      post(g, .22, .78, 3, 19, C.post, 2.2); post(g, .78, .78, 3, 19, C.post, 2.2); post(g, .78, .22, 3, 19, C.post, 2.2);
      fL(g, .36, .54, .78, 3, 14, '#6b4423');
      fR(g, .38, .6, .78, 9, 15, '#7d5d3b');
      roof(g, .22, .22, .78, .78, 19, 18, .14, C.thatch, { thatch: 1, k: .5, up: 1.5 });
    },
    tilehouse: function (g) {
      box(g, .12, .12, 1.88, 1.88, 0, 6, C.stone[0], C.stone[1], C.stone[2]);
      box(g, .42, .45, 1.6, 1.55, 6, 30, null, C.wall, C.wallR);
      [.42, .81, 1.2, 1.6].forEach(function (a) { post(g, a, 1.55, 6, 30, C.post, 2.6); });
      [.45, 1.0].forEach(function (b) { post(g, 1.6, b, 6, 30, C.post, 2.6); });
      fL(g, .9, 1.12, 1.55, 6, 23, '#6b4423');
      fL(g, .5, .74, 1.55, 14, 24, '#c9b48a'); fL(g, 1.26, 1.52, 1.55, 14, 24, '#c9b48a');
      fR(g, .6, .88, 1.6, 14, 24, '#bba77d'); fR(g, 1.12, 1.4, 1.6, 14, 24, '#bba77d');
      roof(g, .42, .45, 1.6, 1.55, 30, 22, .3, C.tile, { tiles: 9, up: 5, k: .3 });
      jar(g, 1.75, 1.78, 1, '#7a4a28'); jar(g, 1.5, 1.82, .8, '#8a5a34');
    },
    well: function (g) {
      var c = P(.5, .5), x = c[0], y = c[1];
      ell(g, x, y + 4, 25, 12, 'rgba(0,0,0,.15)');
      g.fillStyle = '#9c917d'; g.beginPath(); g.moveTo(x + 20, y - 9); g.lineTo(x + 20, y); g.ellipse(x, y, 20, 10, 0, 0, Math.PI, false); g.lineTo(x - 20, y - 9); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,50,40,.35)'; g.lineWidth = 1;
      [-14, -5, 5, 14].forEach(function (dx) { g.beginPath(); g.moveTo(x + dx, y - 9 + Math.abs(dx) * 0.05 + 8); g.lineTo(x + dx, y + 8 - Math.abs(dx) * 0.2); g.stroke(); });
      ell(g, x, y - 9, 20, 10, '#cfc6b2'); ell(g, x, y - 9, 14, 7, '#3f7fa8'); ell(g, x - 4, y - 11, 5, 2, 'rgba(255,255,255,.4)');
      line(g, [x - 17, y - 8], [x - 17, y - 38], '#6b4423', 3); line(g, [x + 17, y - 8], [x + 17, y - 38], '#6b4423', 3);
      line(g, [x - 19, y - 36], [x + 19, y - 36], '#7a5030', 3);
      g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(x - 24, y - 34); g.lineTo(x, y - 47); g.lineTo(x + 24, y - 34); g.lineTo(x + 20, y - 38); g.lineTo(x, y - 43); g.lineTo(x - 20, y - 38); g.fill();
      line(g, [x + 4, y - 36], [x + 4, y - 22], '#5a3a1e', 1);
      g.fillStyle = '#9a6a3a'; g.fillRect(x, y - 23, 8, 7);
    },
    storage: function (g) {
      [[.42, .42], [1.58, .42], [.42, 1.58], [1.58, 1.58], [1, 1.58], [1.58, 1]].forEach(function (s) { post(g, s[0], s[1], 0, 12, '#6b4a2a', 3.2); });
      box(g, .32, .32, 1.68, 1.68, 12, 15, C.wood[0], C.wood[1], C.wood[2]);
      box(g, .4, .4, 1.6, 1.6, 15, 35, null, '#ba8b56', '#9a6c3e');
      for (var z = 19; z < 35; z += 4) { line(g, Pz(.4, 1.6, z), Pz(1.6, 1.6, z), 'rgba(70,40,15,.3)', 1); line(g, Pz(1.6, 1.6, z), Pz(1.6, .4, z), 'rgba(70,40,15,.3)', 1); }
      fL(g, .86, 1.14, 1.6, 15, 29, '#5a3a1e');
      line(g, Pz(.9, 1.95, 0), Pz(.9, 1.6, 15), '#6b4a2a', 2); line(g, Pz(1.1, 1.95, 0), Pz(1.1, 1.6, 15), '#6b4a2a', 2);
      for (var s2 = 1; s2 < 4; s2++) line(g, Pz(.9, 1.95 - s2 * .09, s2 * 3.8), Pz(1.1, 1.95 - s2 * .09, s2 * 3.8), '#6b4a2a', 1.5);
      roof(g, .4, .4, 1.6, 1.6, 35, 24, .22, C.thatch, { thatch: 1, k: .5, up: 1 });
      jar(g, 1.8, 1.4, .8); jar(g, 1.82, 1.7, .9, '#9a6a3a');
    },
    market: function (g) {
      box(g, .05, .05, 1.95, 1.95, 0, 2, '#dfcca3', '#bba57a', '#a8936a');
      for (var q = 0; q < 14; q++) { var p0 = P(.2 + hash(q, 1) * 1.6, .2 + hash(q, 2) * 1.6); ell(g, p0[0], p0[1] - 2, 3, 1.5, 'rgba(150,120,80,.35)'); }
      function stall(a, b, col, col2, goods) {
        var s = .78;
        post(g, a + .06, b + .06, 2, 26, '#6b4423', 2);
        box(g, a + .08, b + .34, a + s - .06, b + s - .06, 2, 10, '#c9a46c', '#a07a4c', '#8a6640');
        goods(a, b);
        post(g, a + s - .06, b + .06, 2, 26, '#6b4423', 2); post(g, a + .06, b + s - .06, 2, 22, '#6b4423', 2); post(g, a + s - .06, b + s - .06, 2, 22, '#6b4423', 2);
        poly(g, [Pz(a, b, 28), Pz(a + s, b, 28), Pz(a + s, b + s, 22), Pz(a, b + s, 22)], col);
        for (var t = 0; t < 4; t++) poly(g, [Pz(a + s * t / 4, b, 28), Pz(a + s * (t + .5) / 4, b, 28), Pz(a + s * (t + .5) / 4, b + s, 22), Pz(a + s * t / 4, b + s, 22)], col2);
        line(g, Pz(a, b + s, 22), Pz(a + s, b + s, 22), 'rgba(0,0,0,.25)', 1.5);
      }
      var pots = function (a, b) { jar(g, a + .3, b + .55, .55, '#8a5a34'); jar(g, a + .5, b + .5, .5, '#a0683a'); };
      var cloth = function (a, b) { box(g, a + .2, b + .42, a + .45, b + .6, 10, 13, '#3e5c9a', '#2e4a80', '#263e6c'); box(g, a + .45, b + .42, a + .65, b + .6, 10, 13, '#c8453a', '#a8352c', '#8e2c24'); };
      var grain = function (a, b) { var p1 = Pz(a + .4, b + .5, 10); ell(g, p1[0], p1[1] - 3, 8, 5, '#e8d08a'); ell(g, p1[0] - 2, p1[1] - 5, 3, 2, '#f6e6b0'); };
      stall(.15, .15, '#c8453a', 'rgba(255,255,255,.35)', pots);
      stall(1.05, .15, '#3e7cc0', 'rgba(255,255,255,.35)', cloth);
      stall(.15, 1.05, '#e0a93a', 'rgba(255,255,255,.35)', grain);
      stall(1.05, 1.05, '#4b9b5a', 'rgba(255,255,255,.35)', pots);
    },
    farm: function (g) {
      box(g, .04, .04, 1.96, 1.96, 0, 2, '#9b7a48', '#7f6038', '#6c522f');
      poly(g, [Pz(.12, .12, 2), Pz(1.88, .12, 2), Pz(1.88, .94, 2), Pz(.12, .94, 2)], '#86bba6');
      for (var a = .24; a < 1.84; a += .17) for (var b = .22; b < .9; b += .16) { var p = Pz(a, b, 2); line(g, [p[0], p[1]], [p[0] - 1, p[1] - 6], '#4f9a3c', 1.6); line(g, [p[0], p[1]], [p[0] + 2, p[1] - 5], '#62ad46', 1.4); }
      poly(g, [Pz(.12, 1.06, 2), Pz(1.88, 1.06, 2), Pz(1.88, 1.88, 2), Pz(.12, 1.88, 2)], '#8c6a3c');
      for (var bb = 1.14; bb < 1.86; bb += .14) {
        line(g, Pz(.16, bb, 3), Pz(1.84, bb, 3), '#5f9e3e', 4);
        for (var aa = .22; aa < 1.84; aa += .16) { var q = Pz(aa, bb, 5); ell(g, q[0], q[1], 2.2, 1.8, '#e2c15a'); }
      }
      poly(g, [Pz(.1, .1, 2.5), Pz(1.9, .1, 2.5), Pz(1.9, 1.9, 2.5), Pz(.1, 1.9, 2.5)], null, '#c4a46c', 2.5);
      line(g, Pz(.1, 1, 2.5), Pz(1.9, 1, 2.5), '#c4a46c', 3);
    },
    kiln: function (g) {
      box(g, .05, .05, 1.95, 1.95, 0, 2, '#bba071', '#977d55', '#816a47');
      var c = Pz(1, .95, 2);
      for (var s = 0; s <= 12; s++) {
        var col = s < 12 ? 'rgb(' + (118 + s * 3) + ',' + (84 + s * 2) + ',' + (58 + s) + ')' : '#a98462';
        g.fillStyle = col; g.beginPath(); g.ellipse(c[0], c[1] - s * 1.5, 46 - s * 1.2, 20 - s * 0.6, 0.46, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(c[0] - 8, c[1] - 22, 16, 6, 0.46, 0, Math.PI * 2); g.fill();
      var m = Pz(.45, 1.2, 4); ell(g, m[0], m[1], 9, 7, '#3a2212'); ell(g, m[0], m[1] + 1, 5, 4, '#ff9a3c'); ell(g, m[0], m[1] + 1, 2.5, 2, '#ffe08a');
      box(g, 1.42, .72, 1.62, .92, 10, 24, '#9a8a78', '#7d6e5e', '#6a5d50');
      jar(g, 1.5, 1.6, .8, '#c48a54'); jar(g, 1.75, 1.42, .75, '#b87a46'); jar(g, 1.3, 1.78, .7, '#d09a62');
      for (var w = 0; w < 4; w++) line(g, Pz(.25 + w * .05, 1.55, 3 + w * 2), Pz(.7 + w * .05, 1.75, 3 + w * 2), '#7a5030', 3);
    },
    weaving: function (g) {
      box(g, .12, .12, 1.88, 1.88, 0, 4, C.wood[0], C.wood[1], C.wood[2]);
      post(g, .2, .2, 4, 28, '#6b4423', 3);
      post(g, .7, .75, 4, 20, '#7a5030', 2.4); post(g, 1.3, .75, 4, 20, '#7a5030', 2.4);
      poly(g, [Pz(.74, .75, 6), Pz(1.26, .75, 6), Pz(1.26, .75, 18), Pz(.74, .75, 18)], '#efe6d2');
      ['#c8453a', '#3e5c9a', '#d9a43a', '#4b9b5a'].forEach(function (cc, t) { fL(g, .76, 1.24, .75, 7 + t * 2.6, 8.6 + t * 2.6, cc); });
      line(g, Pz(.66, .75, 20), Pz(1.34, .75, 20), '#5a3a1e', 2.4);
      box(g, .85, 1.0, 1.15, 1.2, 4, 9, '#a07a4c', '#80603a', '#6c5030');
      post(g, .3, 1.72, 4, 24, '#6b4423', 2.4); post(g, 1.72, .3, 4, 24, '#6b4423', 2.4);
      line(g, Pz(.3, 1.72, 22), Pz(1.72, 1.72, 22), '#5a3a1e', 1.2);
      [['#c8453a', .42], ['#3e5c9a', .82], ['#d9a43a', 1.22]].forEach(function (cl) { fL(g, cl[1], cl[1] + .3, 1.72, 9, 22, cl[0]); fL(g, cl[1], cl[1] + .3, 1.72, 9, 11, 'rgba(0,0,0,.15)'); });
      post(g, 1.78, 1.78, 4, 28, '#6b4423', 3); post(g, 1.78, .2, 4, 28, '#6b4423', 3); post(g, .2, 1.78, 4, 28, '#6b4423', 3);
      roof(g, .2, .2, 1.8, 1.8, 28, 16, .14, C.thatch, { thatch: 1, k: .4, up: 1 });
    },
    smithy: function (g) {
      box(g, .08, .08, 1.92, 1.92, 0, 3, '#a89a86', '#8b7e6b', '#776b5a');
      box(g, .2, .2, 1.8, .42, 3, 26, '#a08668', '#8a6f50', '#765e43');
      box(g, .2, .42, .42, 1.8, 3, 26, '#a08668', '#8a6f50', '#765e43');
      line(g, Pz(.9, .42, 20), Pz(.95, .42, 10), '#3a3a3a', 2); line(g, Pz(1.2, .42, 20), Pz(1.25, .42, 12), '#3a3a3a', 2);
      box(g, .62, .62, 1.15, 1.05, 3, 13, '#8c8276', '#6f665c', '#5d554c');
      poly(g, [Pz(.68, .68, 13), Pz(1.09, .68, 13), Pz(1.09, .99, 13), Pz(.68, .99, 13)], '#ff8a2c');
      var gc = Pz(.88, .83, 14); var gr = g.createRadialGradient(gc[0], gc[1], 1, gc[0], gc[1], 20); gr.addColorStop(0, 'rgba(255,220,120,.9)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(gc[0], gc[1], 20, 0, Math.PI * 2); g.fill();
      box(g, 1.3, 1.25, 1.52, 1.42, 3, 9, '#55555c', '#3d3d44', '#2e2e34'); box(g, 1.26, 1.22, 1.56, 1.45, 9, 11, '#6a6a72', '#4a4a52', '#3a3a42');
      post(g, 1.8, 1.8, 3, 26, '#6b4423', 3); post(g, 1.8, .2, 3, 26, '#6b4423', 3); post(g, .2, 1.8, 3, 26, '#6b4423', 3);
      roof(g, .2, .2, 1.8, 1.8, 26, 15, .14, ['#937050', '#785a3c', '#674c33', '#5a4029'], { k: .35, up: 1, tiles: 6 });
    },
    temple: function (g) {
      box(g, .1, .1, 2.9, 2.9, 0, 6, '#e3dac6', C.stone[1], C.stone[2]);
      poly(g, [Pz(1.35, 2.0, 6), Pz(1.65, 2.0, 6), Pz(1.65, 2.9, 6), Pz(1.35, 2.9, 6)], '#cfc4ae');
      box(g, .55, .45, 2.45, 2.0, 6, 11, '#cfc4ad', '#aa9f88', '#968b75');
      box(g, .75, .6, 2.25, 1.85, 11, 36, null, C.wall, C.wallR);
      for (var a = .75; a <= 2.26; a += .3) post(g, a, 1.85, 11, 36, C.red, 3);
      for (var b = .6; b <= 1.86; b += .31) post(g, 2.25, b, 11, 36, C.red, 3);
      fL(g, 1.28, 1.72, 1.85, 11, 30, C.red);
      for (var l = 1.35; l < 1.72; l += .09) line(g, Pz(l, 1.85, 12), Pz(l, 1.85, 29), 'rgba(255,220,160,.5)', 1);
      roof(g, .75, .6, 2.25, 1.85, 36, 12, .34, C.tile, { tiles: 12, up: 6, k: .25 });
      box(g, 1.05, .85, 1.95, 1.6, 44, 53, null, C.red, C.redD);
      roof(g, 1.05, .85, 1.95, 1.6, 53, 16, .28, C.tile, { tiles: 9, up: 5, k: .3, chimi: 1 });
      box(g, 1.32, 2.0, 1.68, 2.32, 0, 6, '#d8cfbb', '#b8ad97', '#a39882');
      for (var s = 1; s < 4; s++) line(g, Pz(1.32, 2.0 + s * .08, 6 - s * 1.5), Pz(1.68, 2.0 + s * .08, 6 - s * 1.5), 'rgba(0,0,0,.2)', 1);
      box(g, 1.42, 2.55, 1.58, 2.7, 6, 18, '#cfc6b2', '#a9a08c', '#958c78'); box(g, 1.37, 2.5, 1.63, 2.75, 18, 21, '#bdb4a0', '#a29986', '#8e8572');
    },
    pagoda: function (g) {
      box(g, .3, .3, 1.7, 1.7, 0, 5, C.pstone[0], C.pstone[1], C.pstone[2]);
      box(g, .42, .42, 1.58, 1.58, 5, 9, C.pstone[0], C.pstone[1], C.pstone[2]);
      var z = 9, s = .44;
      for (var t = 0; t < 5; t++) {
        var hb = t === 0 ? 17 : 8;
        box(g, 1 - s, 1 - s, 1 + s, 1 + s, z, z + hb, null, '#cdc7ba', '#a9a396');
        if (t === 0) { post(g, 1 - s + .05, 1 + s, z, z + hb, 'rgba(0,0,0,.18)', 1.5); post(g, 1 + s, 1 - s + .05, z, z + hb, 'rgba(0,0,0,.18)', 1.5); }
        z += hb;
        box(g, 1 - s - .16, 1 - s - .16, 1 + s + .16, 1 + s + .16, z, z + 2.5, null, '#b5afa2', '#9a9488');
        roof(g, 1 - s, 1 - s, 1 + s, 1 + s, z + 2.5, 4, .16, [C.pstone[0], C.pstone[1], C.pstone[2], C.pstone[3]], { up: 3, k: .5 });
        z += 4.5; s *= .86;
      }
      post(g, 1, 1, z, z + 18, '#8f897d', 2.6);
      [4, 8, 12].forEach(function (dz) { var p = Pz(1, 1, z + dz); ell(g, p[0], p[1], 3, 1.6, '#9a9488'); });
    },
    school: function (g) {
      box(g, .1, .1, 1.9, 1.9, 0, 3, '#d4c6a4', '#ac9d7d', '#988a6c');
      box(g, .28, .28, 1.32, 1.75, 3, 27, null, C.wall, C.wallR);
      [.28, .8, 1.32].forEach(function (a) { post(g, a, 1.75, 3, 27, C.post, 2.6); });
      [.28, .75, 1.2, 1.75].forEach(function (b) { post(g, 1.32, b, 3, 27, C.post, 2.6); });
      fL(g, .62, 1.0, 1.75, 3, 19, '#6b4423');
      fL(g, .58, 1.04, 1.75, 21, 25, '#3a2a1a');
      fR(g, .5, .95, 1.32, 12, 22, '#c9b48a'); fR(g, 1.05, 1.5, 1.32, 12, 22, '#c9b48a');
      roof(g, .28, .28, 1.32, 1.75, 27, 19, .24, C.tile, { tiles: 9, up: 4, k: .3 });
      box(g, 1.5, .55, 1.8, 1.15, 3, 9, '#b88a55', '#98703e', '#80603a');
      [[1.58, .7], [1.65, .9], [1.7, 1.05]].forEach(function (s) { var p = Pz(s[0], s[1], 9); g.fillStyle = '#f3ead4'; g.fillRect(p[0] - 6, p[1] - 3, 12, 4); ell(g, p[0] - 6, p[1] - 1, 1.8, 2, '#a8352a'); ell(g, p[0] + 6, p[1] - 1, 1.8, 2, '#a8352a'); });
      var tp = Pz(1.62, 1.6, 0); line(g, tp, [tp[0], tp[1] - 14], '#6b4423', 3);
      ell(g, tp[0], tp[1] - 22, 11, 10, '#4f8a3a'); ell(g, tp[0] - 4, tp[1] - 26, 6, 5, '#6aa84c');
    },
    palace: function (g) {
      flag(g, .3, .3, 52, '#c8453a', '#f2c75c');
      box(g, .08, .08, 3.92, 3.92, 0, 7, '#ddd4c0', '#b6ab95', '#a0957f');
      box(g, .45, .45, 3.55, 3.45, 7, 13, '#e6ddca', '#bdb29c', '#a79c86');
      box(g, 1.6, 3.45, 2.4, 3.9, 0, 10, '#d6cdb9', '#b0a690', '#9a907a');
      for (var s = 1; s < 5; s++) line(g, Pz(1.6, 3.45 + s * .09, 10 - s * 2), Pz(2.4, 3.45 + s * .09, 10 - s * 2), 'rgba(0,0,0,.18)', 1);
      box(g, .85, .85, 3.15, 2.85, 13, 46, null, C.wall, C.wallR);
      for (var a = .85; a <= 3.16; a += .29) post(g, a, 2.85, 13, 46, C.red, 3.4);
      for (var b = .85; b <= 2.86; b += .33) post(g, 3.15, b, 13, 46, C.red, 3.4);
      fL(g, 1.6, 2.4, 2.85, 13, 38, C.red);
      for (var l = 1.66; l < 2.4; l += .1) line(g, Pz(l, 2.85, 14), Pz(l, 2.85, 37), 'rgba(255,220,160,.5)', 1);
      fR(g, 1.4, 2.3, 3.15, 22, 38, '#b8a37a');
      roof(g, .85, .85, 3.15, 2.85, 46, 14, .42, C.tile, { tiles: 14, up: 8, k: .25, gold: 1 });
      box(g, 1.25, 1.15, 2.75, 2.5, 56, 69, null, C.red, C.redD);
      roof(g, 1.25, 1.15, 2.75, 2.5, 69, 20, .34, C.tile, { tiles: 11, up: 7, k: .28, chimi: 1, gold: 1 });
      flag(g, .3, 3.7, 52, '#f2c75c', '#c8453a'); flag(g, 3.7, .3, 52, '#f2c75c', '#c8453a'); flag(g, 3.7, 3.7, 52, '#c8453a', '#f2c75c');
    },
    gate: function (g) {
      box(g, 0, .15, 2, .85, 0, 28, '#cbbd9f', '#ae9f80', '#938567');
      [7, 14, 21].forEach(function (z) { line(g, Pz(0, .85, z), Pz(2, .85, z), 'rgba(60,45,30,.25)', 1); line(g, Pz(2, .85, z), Pz(2, .15, z), 'rgba(60,45,30,.25)', 1); });
      var pts = [Pz(.68, .85, 0)]; for (var t = 0; t <= 8; t++) pts.push(Pz(.68 + .64 * t / 8, .85, 15 + Math.sin(Math.PI * t / 8) * 6)); pts.push(Pz(1.32, .85, 0));
      poly(g, pts, '#3b2716');
      fL(g, .62, .7, .85, 0, 15, '#7a4a24'); fL(g, 1.3, 1.38, .85, 0, 15, '#7a4a24');
      box(g, -.04, .11, 2.04, .89, 28, 31, '#bfb294', '#a39577', '#8b7e62');
      box(g, .3, .3, 1.7, .7, 31, 40, null, C.red, C.redD);
      roof(g, .3, .3, 1.7, .7, 40, 12, .22, C.tile, { tiles: 8, up: 5, k: .2, chimi: 1 });
    },
    wall: function (g) {
      box(g, 0, .2, 3, .8, 0, 20, '#cdbf9e', '#ae9f7f', '#958767');
      [5, 10, 15].forEach(function (z) { line(g, Pz(0, .8, z), Pz(3, .8, z), 'rgba(60,45,30,.22)', 1); });
      for (var a = .2; a < 3; a += .42) line(g, Pz(a, .8, ((a * 10) | 0) % 2 ? 5 : 10), Pz(a, .8, ((a * 10) | 0) % 2 ? 10 : 15), 'rgba(60,45,30,.22)', 1);
      for (var m = .06; m < 2.9; m += .42) box(g, m, .6, m + .24, .8, 20, 26, '#c2b493', '#a59675', '#8c7e5f');
      box(g, 2.8, .2, 3, .8, 20, 24, '#c2b493', '#a59675', '#8c7e5f');
    },
    office: function (g) {
      box(g, .08, .08, 2.92, 1.92, 0, 6, C.stone[0], C.stone[1], C.stone[2]);
      box(g, 1.2, 1.55, 1.8, 1.92, 0, 6, '#d0c7b3', '#b0a690', '#9a907a');
      box(g, .4, .35, 2.6, 1.55, 6, 32, null, C.wall, C.wallR);
      for (var a = .4; a <= 2.61; a += .31) post(g, a, 1.55, 6, 32, C.red, 3);
      [.35, .75, 1.15, 1.55].forEach(function (b) { post(g, 2.6, b, 6, 32, C.red, 3); });
      fL(g, 1.25, 1.75, 1.55, 6, 26, '#6b4423');
      fL(g, .55, .95, 1.55, 15, 25, '#c9b48a'); fL(g, 2.05, 2.45, 1.55, 15, 25, '#c9b48a');
      roof(g, .4, .35, 2.6, 1.55, 32, 18, .3, C.tile, { tiles: 13, up: 5, k: .3, chimi: 1 });
      flag(g, 2.8, 1.8, 58, '#3e6fb0', '#f2c75c');
    },
    port: function (g) {
      [[.15, .15], [1.85, .15], [.15, 1.85], [1.85, 1.85]].forEach(function (s) { post(g, s[0], s[1], -6, 6, '#5a3a1e', 4); });
      box(g, .05, .05, 1.95, 1.95, 0, 5, '#b78c57', '#8f6a3d', '#7b5a33');
      for (var b = .2; b < 1.95; b += .2) line(g, Pz(.05, b, 5), Pz(1.95, b, 5), 'rgba(80,50,20,.3)', 1);
      box(g, .3, .3, .72, .72, 5, 16, '#c9a46c', '#a8834e', '#946f40');
      box(g, .38, .38, .64, .64, 16, 23, '#d4b27c', '#b08d58', '#9a7848');
      line(g, Pz(.3, .72, 10), Pz(.72, .72, 10), 'rgba(80,50,20,.4)', 1);
      jar(g, 1.35, .5, .8, '#8a5a34'); jar(g, 1.6, .65, .9, '#a0683a'); jar(g, 1.25, .8, .7, '#7a4a28');
      post(g, 1.82, 1.82, 5, 15, '#5a3a1e', 4); post(g, 1.82, 1.0, 5, 15, '#5a3a1e', 4);
      var rc = Pz(1.0, 1.5, 5); ell(g, rc[0], rc[1], 8, 4, '#c9a46c'); ell(g, rc[0], rc[1], 4, 2, '#9a7848');
    }
  };

  // 나무: 활엽수와 소나무 두 가지 (월드 좌표에 바로 그린다)
  function drawTree(g, x, y, s, kind) {
    ell(g, x, y + 1, 12 * s, 5 * s, 'rgba(0,0,0,.18)');
    line(g, [x, y], [x, y - 12 * s], '#6b4a2a', 3.4 * s);
    if (kind) {
      [['#356b35', 0, 14, 13], ['#3f7a3e', -9, 12, 11], ['#4b8a46', -17, 9, 9]].forEach(function (l) {
        g.fillStyle = l[0]; g.beginPath(); g.moveTo(x, y + (l[1] - 30) * s); g.lineTo(x - l[2] * s, y + (l[1] - 8) * s); g.lineTo(x + l[2] * s, y + (l[1] - 8) * s); g.fill();
      });
    } else {
      ell(g, x, y - 20 * s, 13 * s, 11 * s, '#4a8236'); ell(g, x - 7 * s, y - 16 * s, 9 * s, 8 * s, '#5c9a43');
      ell(g, x + 7 * s, y - 15 * s, 9 * s, 7.5 * s, '#3f7230'); ell(g, x - 3 * s, y - 25 * s, 6 * s, 5 * s, '#79b55a');
    }
  }

  /* ================================================================ */
  function mount(root, host) {
    var BD = host.data && host.data.buildings;
    if (!BD || !BD.list) {
      root.appendChild(txt('div', 'vg-fail', '건물 자료(data/buildings.json)를 불러오지 못했어요. 「데이터 갱신.bat」을 실행해 주세요.'));
      return { unmount: function () {}, pause: function () {}, resume: function () {} };
    }
    var DEF = {}, ORDER = [];
    BD.list.forEach(function (d) { DEF[d.id] = d; ORDER.push(d.id); });
    var opt = host.options || {};
    var NP = clamp(opt.players | 0 || 1, 1, 4);
    var DF = DIFF[opt.difficulty] || DIFF.normal;
    var MAP = genMap();

    var st = null;                                  // 저장되는 마을 상태
    var occ = new Int32Array(N * N), comp = new Int32Array(N * N), prevA = new Int32Array(N * N);
    var byId = {}, cnt = {}, doneCnt = {}, safe = false, popCap = 0, hungry = false, rateCache = { food: 0, wood: 0, clay: 0, culture: 0 };
    var residents = [], parts = [], floats = [], trees = [], wcells = [];
    var drags = {}, sel = [], undos = [], trays = [], acts = [], myModals = [];
    var alive = true, hubPaused = false, started = false, viewing = false, viewT = 0, viewBlend = 0;
    var raf = 0, last = 0, frames = 0, tickAcc = 0, spawnAcc = 0, checkAcc = 0, autoAcc = 0, saveSoon = -1, hudAcc = 0, scaleAcc = 0, smokeAcc = 0, simT = 0, nextRid = 1;
    var cam = { s: 1, x: 0, y: 0 }, baseCam = null, kRes = 1, R = 1, terrDirty = true, dirty = true, lastScaleKey = '';
    var spr = {}, tcv = document.createElement('canvas'), bgcv = document.createElement('canvas');
    var hudCache = {}, recText = '';

    for (var p0 = 0; p0 < NP; p0++) { sel.push(null); undos.push([]); }

    /* ---------- 화면 뼈대 ---------- */
    var wrap = el('div', 'vg-root' + (NP >= 3 ? ' vg-p3' : '') + (NP >= 4 ? ' vg-p4' : ''));
    root.appendChild(wrap);
    var cv = el('canvas', 'vg-cv'); wrap.appendChild(cv);
    var g = cv.getContext('2d');
    var hudRes = el('div', 'vg-panel vg-res vg-ui'); wrap.appendChild(hudRes);
    var hudStage = el('button', 'vg-panel vg-stage vg-ui'); wrap.appendChild(hudStage);
    var misBox = el('button', 'vg-panel vg-mis vg-ui'); wrap.appendChild(misBox);
    var noteBox = el('button', 'vg-panel vg-note vg-ui'); wrap.appendChild(noteBox);
    noteBox.appendChild(txt('b', '', 'ⓘ 알아 두기'));
    noteBox.appendChild(txt('span', '', '교육용 가상 재구성이에요. 실제 사비 도성을 정확히 복원한 것이 아니에요. 자원·생산은 게임을 위한 단순화예요.'));
    var btnCodex = el('button', 'vg-cbtn vg-ui vg-cb-codex', '<i>📚</i>건축 도감'); wrap.appendChild(btnCodex);
    var btnSave = el('button', 'vg-cbtn vg-ui vg-cb-save', '<i>💾</i>저장'); wrap.appendChild(btnSave);
    var btnView = el('button', 'vg-cbtn vg-ui vg-cb-view', '<i>🌄</i>전경 감상'); wrap.appendChild(btnView);
    var viewCap = el('div', 'vg-viewcap'); wrap.appendChild(viewCap);
    RES.forEach(function (r) {
      var row = el('div', 'vg-r vg-r-' + r[0], '<i>' + r[2] + '</i><span>' + r[1] + '</span><b>0</b><small></small>');
      hudRes.appendChild(row);
    });

    /* ---------- 상태 ---------- */
    function fresh() {
      return {
        v: 1, terr: MAP.t.slice(), road: MAP.r.slice(), bld: [],
        res: { food: DF.start.food, wood: DF.start.wood, clay: DF.start.clay, culture: 0 },
        cult: 0, foodMade: 0, missions: {}, stage: 1, seen: {}, ever: {}, nextId: 1, simT: 0, histSeen: {}
      };
    }
    function fromSave(s) {
      if (!s || s.v !== 1 || typeof s.terr !== 'string' || s.terr.length !== N * N || typeof s.road !== 'string' || s.road.length !== N * N) return null;
      var o = fresh();
      o.terr = s.terr.split(''); o.road = s.road.split('').map(function (c) { return c === '1' ? 1 : 0; });
      ['food', 'wood', 'clay', 'culture'].forEach(function (k2) { o.res[k2] = Math.max(0, +((s.res || {})[k2]) || 0); });
      o.cult = +s.cult || 0; o.foodMade = +s.foodMade || 0; o.missions = s.missions || {}; o.stage = clamp(s.stage | 0 || 1, 1, 4);
      o.seen = s.seen || {}; o.ever = s.ever || {}; o.simT = +s.simT || 0; o.histSeen = s.histSeen || {};
      (s.bld || []).forEach(function (a) { if (DEF[a[0]] && a[0] !== 'road') o.bld.push({ id: o.nextId++, t: a[0], i: a[1] | 0, j: a[2] | 0, rot: a[3] ? 1 : 0, prog: 1 }); });
      return o;
    }
    function snapshot() {
      return {
        v: 1, terr: st.terr.join(''), road: st.road.join(''), bld: st.bld.map(function (b) { return [b.t, b.i, b.j, b.rot]; }),
        res: { food: r1(st.res.food), wood: r1(st.res.wood), clay: r1(st.res.clay), culture: r1(st.res.culture) },
        cult: r1(st.cult), foodMade: r1(st.foodMade), missions: st.missions, stage: st.stage, seen: st.seen, ever: st.ever, simT: Math.round(simT), histSeen: st.histSeen,
        diff: opt.difficulty || 'normal', savedAt: Date.now()
      };
    }
    function saveNow(manual) {
      if (!st) return false;
      var ok = host.save(snapshot());
      saveSoon = -1; autoAcc = 0;
      if (manual) { host.sound(ok ? 'correct' : 'wrong'); host.toast(ok ? '💾 마을을 저장했어요. 다음에 「이어서 하기」로 계속할 수 있어요.' : '저장 공간이 부족해서 이 화면에서만 기억해요.', { key: 'vg-save' }); }
      return ok;
    }
    function scheduleSave() { saveSoon = 2; }

    /* ---------- 자료 계산 ---------- */
    function dims(b) { var d = DEF[b.t]; return b.rot ? [d.h, d.w] : [d.w, d.h]; }
    function costOf(t) { var c = DEF[t].cost || {}, o = {}; ['food', 'wood', 'clay'].forEach(function (k2) { if (c[k2]) o[k2] = Math.max(1, Math.ceil(c[k2] * DF.cost)); }); return o; }
    function costStr(c) { return ['wood', 'clay', 'food'].filter(function (k2) { return c[k2]; }).map(function (k2) { return ICON[k2] + c[k2]; }).join(' ') || '무료'; }
    function lack(c) { for (var q = 0; q < 3; q++) { var k2 = ['wood', 'clay', 'food'][q]; if (c[k2] && st.res[k2] + 1e-6 < c[k2]) return NAME[k2] + '가 ' + Math.ceil(c[k2] - st.res[k2]) + ' 부족해요'; } return ''; }
    function cap() { return DF.cap + 200 * (doneCnt.storage || 0); }
    function addRes(k2, v) {
      if (k2 === 'culture') { st.res.culture += v; if (v > 0) st.cult += v; return; }
      // 창고가 가득 차면 더 들어오지 않는다 (이미 넘친 양은 그대로 둔다)
      if (v > 0) st.res[k2] = Math.max(st.res[k2], Math.min(cap(), st.res[k2] + v));
      else st.res[k2] = Math.max(0, st.res[k2] + v);
    }
    function pay(c) { Object.keys(c).forEach(function (k2) { st.res[k2] = Math.max(0, st.res[k2] - c[k2]); }); }
    function refund(c, f) { Object.keys(c).forEach(function (k2) { addRes(k2, Math.floor(c[k2] * f)); }); }
    function unlocked(t) { var u = DEF[t].unlock; return !u || !!st.missions[u]; }
    function misNo(id) { for (var q = 0; q < MISSIONS.length; q++) if (MISSIONS[q].id === id) return q + 1; return 0; }
    function ring(i0, j0, w, h) {
      var r = [], i, j;
      for (i = i0; i < i0 + w; i++) { r.push([i, j0 - 1]); r.push([i, j0 + h]); }
      for (j = j0; j < j0 + h; j++) { r.push([i0 - 1, j]); r.push([i0 + w, j]); }
      return r.filter(function (c) { return inMap(c[0], c[1]); });
    }
    function gap(a, b) {
      var da = dims(a), db = dims(b);
      var dx = Math.max(0, a.i - (b.i + db[0] - 1), b.i - (a.i + da[0] - 1)), dy = Math.max(0, a.j - (b.j + db[1] - 1), b.j - (a.j + da[1] - 1));
      return Math.max(dx, dy);
    }
    function near(b, t, dist) { return st.bld.some(function (o) { return o.t === t && o.prog >= 1 && o !== b && gap(b, o) <= dist; }); }
    function nearTerr(b, c, dist) {
      var d = dims(b);
      for (var j = b.j - dist; j < b.j + d[1] + dist; j++) for (var i = b.i - dist; i < b.i + d[0] + dist; i++) if (inMap(i, j) && st.terr[idx(i, j)] === c) return true;
      return false;
    }
    function inZone(b, z) {
      var d = dims(b);
      for (var j = b.j; j < b.j + d[1]; j++) for (var i = b.i; i < b.i + d[0]; i++) if (MAP.z[idx(i, j)] === z) return true;
      return false;
    }
    function cellReason(d, i, j, ignore) {
      if (!inMap(i, j)) return '마을 땅 밖이에요';
      var q = idx(i, j), t = st.terr[q];
      if (t === 'w') return '강 위에는 지을 수 없어요';
      if (t === 'f') return '숲에는 바로 지을 수 없어요. 숲을 눌러 나무를 먼저 베어 주세요';
      if (occ[q] && occ[q] !== ignore) return '다른 건물이 이미 있어요';
      if (st.road[q]) return '도로 위에는 지을 수 없어요. 도로 옆에 지어 보세요';
      if (t === 'h' && !d.hill) return '언덕은 비탈져서 ' + d.short + '을(를) 지을 수 없어요';
      if (d.rule === 'plain' && t !== 'p') return '농경지는 강가의 평야(연두색 땅)에만 만들 수 있어요';
      return '';
    }
    // 배치 검사: { ok, reason, cells:[{i,j,ok}], w, h }
    function check(t, i0, j0, rot, ignore, withCost) {
      var d = DEF[t], w = rot ? d.h : d.w, h = rot ? d.w : d.h, cells = [], reason = '';
      for (var j = j0; j < j0 + h; j++) for (var i = i0; i < i0 + w; i++) {
        var r = cellReason(d, i, j, ignore);
        cells.push({ i: i, j: j, ok: !r }); if (r && !reason) reason = r;
      }
      if (!reason && d.rule === 'shore' && !ring(i0, j0, w, h).some(function (c) { return st.terr[idx(c[0], c[1])] === 'w'; })) reason = '선착장은 강(백마강)에 닿아야 해요';
      if (!reason && d.rule === 'gate' && !ring(i0, j0, w, h).some(function (c) { return st.road[idx(c[0], c[1])]; })) reason = '성문은 도로와 닿아야 해요. 길이 성문을 지나가야 하니까요';
      if (!reason && withCost) { if (!unlocked(t)) reason = '아직 잠겨 있어요. 미션 ' + misNo(d.unlock) + '을 해결하면 열려요'; else reason = lack(costOf(t)); }
      // 칸 하나하나는 괜찮지만 전체 조건(강·도로에 닿기, 비용)이 안 맞으면 모든 칸을 빨갛게
      if (reason && !cells.some(function (c) { return !c.ok; })) cells.forEach(function (c) { c.ok = false; });
      return { ok: !reason, reason: reason, cells: cells, w: w, h: h };
    }
    function roadReason(i, j) {
      if (!inMap(i, j)) return '마을 땅 밖이에요';
      var q = idx(i, j);
      if (st.terr[q] === 'w') return '강 위에는 도로를 놓을 수 없어요';
      if (st.terr[q] === 'f') return '숲에는 도로를 놓을 수 없어요. 먼저 나무를 베어 주세요';
      if (occ[q]) return '건물이 있는 칸에는 도로를 놓을 수 없어요';
      return '';
    }

    // 건물·도로가 바뀌면 칸 점유, 도로 연결망, 주민 수용 인원을 다시 계산한다
    function derive() {
      dirty = false;
      occ.fill(0); byId = {}; cnt = {}; doneCnt = {};
      st.bld.forEach(function (b) {
        var d = dims(b); byId[b.id] = b;
        cnt[b.t] = (cnt[b.t] || 0) + 1; if (b.prog >= 1) doneCnt[b.t] = (doneCnt[b.t] || 0) + 1;
        for (var j = b.j; j < b.j + d[1]; j++) for (var i = b.i; i < b.i + d[0]; i++) if (inMap(i, j)) occ[idx(i, j)] = b.id;
      });
      comp.fill(-1);
      var nc = 0;
      for (var q = 0; q < N * N; q++) {
        if (!st.road[q] || comp[q] >= 0) continue;
        var stack = [q]; comp[q] = nc;
        while (stack.length) {
          var c = stack.pop(), ci = c % N, cj = (c / N) | 0;
          [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]].forEach(function (n) {
            if (!inMap(n[0], n[1])) return; var nq = idx(n[0], n[1]);
            if (st.road[nq] && comp[nq] < 0) { comp[nq] = nc; stack.push(nq); }
          });
        }
        nc++;
      }
      safe = (doneCnt.gate || 0) >= 1 && (doneCnt.wall || 0) >= 2;
      st.bld.forEach(function (b) {
        var d = dims(b), rg = ring(b.i, b.j, d[0], d[1]);
        b.comps = []; b.door = -1; b.side = null;
        rg.forEach(function (c) {
          var nq = idx(c[0], c[1]);
          if (st.road[nq]) { if (b.comps.indexOf(comp[nq]) < 0) b.comps.push(comp[nq]); if (b.door < 0) b.door = nq; }
          if (b.t === 'port' && !b.side && st.terr[nq] === 'w') b.side = c;
        });
        b.conn = b.comps.length > 0;
        if (b.door < 0) { for (var s = 0; s < rg.length; s++) { var nq2 = idx(rg[s][0], rg[s][1]); if (passable(nq2)) { b.door = nq2; break; } } }
      });
      popCap = 0;
      st.bld.forEach(function (b) { if (b.prog >= 1) popCap += capOf(b); });
      trees = [];
      for (var q2 = 0; q2 < N * N; q2++) if (st.terr[q2] === 'f') {
        var ti = q2 % N, tj = (q2 / N) | 0, hh = hash(ti, tj);
        trees.push({ x: ti + .35 + hh * .3, y: tj + .3 + hash(tj, ti) * .3, s: .85 + hh * .3, k: hh > .55 ? 1 : 0 });
        if (hh > .3) trees.push({ x: ti + .72, y: tj + .75, s: .65 + hh * .2, k: hh > .8 ? 0 : 1 });
      }
      residents.forEach(function (r) { if (occ[r.cell]) { var hm = byId[r.home]; if (hm && hm.door >= 0) place(r, hm.door); r.path = null; } });
    }
    function passable(q) { return st.terr[q] !== 'w' && st.terr[q] !== 'f' && !occ[q]; }
    function capOf(b) {
      var d = DEF[b.t]; if (!d.pop) return 0;
      var n = d.pop;
      if (b.t === 'house' || b.t === 'tilehouse') { if (near(b, 'well', 3)) n += 1; if (safe) n += 1; }
      return n;
    }
    function shareComp(a, b) { return a.comps && b.comps && a.comps.some(function (c) { return b.comps.indexOf(c) >= 0; }); }
    function tradeLinked(b) { return st.bld.some(function (m) { return m.t === 'market' && m.prog >= 1 && shareComp(m, b); }); }
    // 한 생산 주기(3초)에 이 건물이 만드는 양
    function prodOf(b) {
      var d = DEF[b.t], pr = d.prod || {}, o = { food: pr.food || 0, wood: pr.wood || 0, clay: pr.clay || 0, culture: pr.culture || 0 };
      if (b.prog < 1) return { food: 0, wood: 0, clay: 0, culture: 0 };
      if (b.t === 'house' && !nearTerr(b, 'f', 2)) o.wood = 0;
      if (b.t === 'farm') { if (near(b, 'well', 3)) o.food += 1; if (near(b, 'smithy', 5)) o.food += 1; }
      if (b.t === 'pagoda' && near(b, 'temple', 2)) o.culture += 2;
      if (b.t === 'palace' && inZone(b, 'P')) o.culture += 3;
      if (b.t === 'temple' && inZone(b, 'T')) o.culture += 1;
      if (b.t === 'wall' && inZone(b, 'N')) o.culture += 1;
      var mul = DF.prod * (d.needsRoad && !b.conn ? 0.5 : 1) * (1 + 0.1 * Math.min(2, doneCnt.office || 0)) * (hungry ? 0.7 : 1);
      if (WORKSHOP[b.t]) { if (doneCnt.school) o[d.main] += 1; if (tradeLinked(b)) mul *= 1.5; }
      Object.keys(o).forEach(function (k2) { o[k2] *= mul; });
      return o;
    }
    function rates() {
      var o = { food: 0, wood: 1, clay: 1, culture: 0 };     // 마을 사람들이 조금씩 모으는 기본 수입
      st.bld.forEach(function (b) { var p = prodOf(b); o.food += p.food; o.wood += p.wood; o.clay += p.clay; o.culture += p.culture; });
      if (DF.eat) o.food -= residents.length * DF.eat;
      return o;
    }

    /* ---------- 행동: 짓기·옮기기·회전·철거·도로·숲 베기 + 되돌리기 ---------- */
    function pushUndo(p, u) { var s = undos[p] || undos[0]; s.push(u); if (s.length > 12) s.shift(); }
    function build(p, t, i, j, rot) {
      var chk = check(t, i, j, rot, 0, true);
      if (!chk.ok) return chk.reason;
      var c = costOf(t); pay(c);
      var b = { id: st.nextId++, t: t, i: i, j: j, rot: rot, prog: 0 };
      st.bld.push(b); dirty = true; derive();
      pushUndo(p, { k: 'build', id: b.id, cost: c });
      st.ever[t] = (st.ever[t] || 0) + 1;
      host.sound('build');
      dust(b, 16);
      learn(p, t, b);
      scheduleSave();
      return '';
    }
    function moveB(p, b, i, j, rot) {
      var chk = check(b.t, i, j, rot, b.id, false);
      if (!chk.ok) return chk.reason;
      pushUndo(p, { k: 'move', id: b.id, i: b.i, j: b.j, rot: b.rot });
      b.i = i; b.j = j; b.rot = rot; dirty = true; derive();
      host.sound('snap'); dust(b, 8); scheduleSave();
      return '';
    }
    function rotateB(p, b) {
      var d = dims(b), nr = b.rot ? 0 : 1;
      var tries = [[0, 0], [Math.floor((d[0] - d[1]) / 2), Math.floor((d[1] - d[0]) / 2)], [d[0] - d[1], 0], [0, d[1] - d[0]]];
      var reason = '';
      for (var q = 0; q < tries.length; q++) {
        var chk = check(b.t, b.i + tries[q][0], b.j + tries[q][1], nr, b.id, false);
        if (chk.ok) {
          pushUndo(p, { k: 'move', id: b.id, i: b.i, j: b.j, rot: b.rot });
          b.i += tries[q][0]; b.j += tries[q][1]; b.rot = nr; dirty = true; derive(); host.sound('snap'); scheduleSave();
          return '';
        }
        if (!reason) reason = chk.reason;
      }
      return '돌릴 자리가 없어요: ' + reason;
    }
    function demolish(p, b) {
      if (b.grab != null) return '친구가 옮기는 중이에요';
      var c = costOf(b.t), back = {};
      Object.keys(c).forEach(function (k2) { back[k2] = Math.floor(c[k2] * 0.5); });
      removeB(b);
      Object.keys(back).forEach(function (k2) { addRes(k2, back[k2]); });
      pushUndo(p, { k: 'demo', b: { t: b.t, i: b.i, j: b.j, rot: b.rot, id: b.id }, back: back });
      host.sound('erase'); dust(b, 18, '#b89a6a'); scheduleSave();
      return '';
    }
    function removeB(b) {
      st.bld = st.bld.filter(function (o) { return o !== b; });
      sel.forEach(function (s, q) { if (s && s.kind === 'b' && s.id === b.id) setSel(q, null); });
      dirty = true; derive();
    }
    function clearForest(p, q) {
      if (st.terr[q] !== 'f') return '';
      st.terr[q] = 'g'; var gain = Math.round(5 * DF.prod);
      var before = st.res.wood; addRes('wood', gain);
      pushUndo(p, { k: 'clear', q: q, gain: st.res.wood - before });
      terrDirty = true; dirty = true; derive();
      host.sound('vg-chop');
      var w = P(q % N + .5, ((q / N) | 0) + .5);
      for (var s = 0; s < 14; s++) parts.push({ x: w[0], y: w[1] - 18, vx: (Math.random() - .5) * 70, vy: -30 - Math.random() * 50, life: 1, max: 1, r: 3, col: s % 2 ? '#5c9a43' : '#8a6a3a', grav: 120 });
      floats.push({ x: w[0], y: w[1] - 30, text: '+' + gain + '🪵', life: 1.6 });
      scheduleSave();
      return '';
    }
    function unroad(p, q) {
      if (!st.road[q]) return;
      st.road[q] = 0; pushUndo(p, { k: 'unroad', q: q });
      terrDirty = true; dirty = true; derive(); host.sound('erase'); scheduleSave();
    }
    function undo(p) {
      var u = (undos[p] || []).pop();
      if (!u) { warn(p, '되돌릴 일이 없어요'); return false; }
      var msg = '', b, chk;
      if (u.k === 'build') {
        b = byId[u.id];
        if (!b) msg = '이미 없어진 건물이에요';
        else if (b.grab != null) msg = '친구가 옮기는 중이라 되돌릴 수 없어요';
        else { removeB(b); refund(u.cost, 1); }
      } else if (u.k === 'move') {
        b = byId[u.id];
        if (!b) msg = '이미 없어진 건물이에요';
        else if (b.grab != null) msg = '친구가 옮기는 중이라 되돌릴 수 없어요';
        else { chk = check(b.t, u.i, u.j, u.rot, b.id, false); if (!chk.ok) msg = '원래 자리에 다른 것이 생겼어요'; else { b.i = u.i; b.j = u.j; b.rot = u.rot; } }
      } else if (u.k === 'demo') {
        chk = check(u.b.t, u.b.i, u.b.j, u.b.rot, 0, false);
        if (!chk.ok) msg = '그 자리에 다른 것이 생겼어요';
        else { st.bld.push({ id: u.b.id, t: u.b.t, i: u.b.i, j: u.b.j, rot: u.b.rot, prog: 1 }); pay(u.back); }
      } else if (u.k === 'road') {
        u.cells.forEach(function (q) { if (st.road[q] && !occ[q]) { st.road[q] = 0; refund(u.cost, 1); } });
      } else if (u.k === 'unroad') {
        if (occ[u.q] || st.terr[u.q] === 'w' || st.terr[u.q] === 'f') msg = '그 자리에 다른 것이 생겼어요'; else st.road[u.q] = 1;
      } else if (u.k === 'clear') {
        if (occ[u.q] || st.road[u.q]) msg = '그 자리에 다른 것이 생겼어요'; else { st.terr[u.q] = 'f'; st.res.wood = Math.max(0, st.res.wood - u.gain); }
      }
      terrDirty = true; dirty = true; derive();
      if (msg) { warn(p, '되돌릴 수 없어요: ' + msg); return false; }
      host.sound('whoosh'); say(p, '↶ 되돌렸어요'); scheduleSave(); refreshCards();
      return true;
    }

    /* ---------- 도감 등록과 배운 내용 ---------- */
    function learn(p, t, b) {
      var d = DEF[t], ids = [];
      if (d.card) ids.push(d.card);
      (d.extra || []).forEach(function (x) { ids.push(x); });
      if (t === 'temple' && inZone(b, 'T')) ids.push('plc-jeongnimsa');
      if (!ids.length) return;
      var res = host.award({ codex: ids, silent: true });
      if (!st.seen[t]) { st.seen[t] = 1; showInfo(p, t, { learn: true, fresh: res.newCodex || [] }); }
      else if (res.newCodex && res.newCodex.length) host.toast('📚 도감 등록: ' + res.newCodex.map(function (c) { return c.title; }).join(', '), { key: 'vg-codex' });
    }

    /* ---------- 미션·성장·보상 ---------- */
    function misProg(id) {
      var built = function (t) { return doneCnt[t] || 0; };
      switch (id) {
        case 'm1': return [built('house') + built('tilehouse'), 3];
        case 'm2': return [built('farm') ? Math.min(10, Math.floor(st.foodMade)) : 0, 10];
        case 'm3':
          var ok = st.bld.some(function (m) { return m.t === 'market' && m.prog >= 1 && st.bld.some(function (h) { return (h.t === 'house' || h.t === 'tilehouse') && h.prog >= 1 && shareComp(m, h); }); });
          return [ok ? 1 : built('market') ? 0.5 : 0, 1];
        case 'm4': return [built('kiln'), 1];
        case 'm5': return [(built('temple') ? 1 : 0) + (built('pagoda') ? 1 : 0), 2];
        case 'm6': return [Math.min(1, built('gate')) + Math.min(2, built('wall')), 3];
      }
      return [0, 1];
    }
    function nDone() { return MISSIONS.filter(function (m) { return st.missions[m.id]; }).length; }
    function checkAll() {
      MISSIONS.forEach(function (m) {
        if (st.missions[m.id]) return;
        var pr = misProg(m.id);
        if (pr[0] < pr[1]) return;
        st.missions[m.id] = true;
        var un = ORDER.filter(function (t) { return DEF[t].unlock === m.id; }).map(function (t) { return DEF[t].short; });
        host.sound('fanfare');
        host.toast('🎯 미션 ' + misNo(m.id) + ' 완료! ' + m.title + (un.length ? '<br>🔓 새 건물: ' + un.join(', ') : ''), { big: true, dur: 4200, key: 'vg-mis' });
        trays.forEach(function (tr) { tr.flash = un.length ? 3 : 0; });
        refreshCards(true);
        var n = nDone(), stars = n >= 6 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
        if (stars) host.award({ key: 'missions', stars: stars });
        if (HIST[m.id] && !st.histSeen[m.id]) { st.histSeen[m.id] = 1; later(function () { showHist(m.id); }, 1.2); }
        scheduleSave();
      });
      var s = st.stage;
      while (s < 4 && stageOk(s + 1)) s++;
      if (s > st.stage) {
        st.stage = s;
        host.sound('fanfare');
        host.toast('🏘️ 마을이 ' + s + '단계로 성장했어요!<br>「' + STAGES[s - 1] + '」', { big: true, dur: 4500, key: 'vg-stage' });
        confetti();
        var res = host.award({ key: 'growth', stars: s - 1 });
        if (s === 4) host.award({ badge: { id: 'city', name: '찬란한 사비 건축가', icon: '🏯' } });
        if (res && res.starsGained) later(function () { host.toast('⭐ 백제 탐험 별 +' + res.starsGained, { key: 'vg-star' }); }, 4.6);
        scheduleSave();
      }
      var rt = '단계 ' + st.stage + ' · 미션 ' + nDone() + '/6 · 주민 ' + residents.length + '명';
      if (rt !== recText) { recText = rt; host.setRecord(rt); }
    }
    function stageOk(s) {
      var q = REQ[s]; if (!q) return true;
      return residents.length >= q.pop && st.cult >= q.cult && (!q.mis || nDone() >= q.mis) && (!q.palace || (doneCnt.palace || 0) >= 1);
    }
    function stageFrac() {
      if (st.stage >= 4) return 1;
      var q = REQ[st.stage + 1], f = [residents.length / q.pop, st.cult / q.cult];
      if (q.mis) f.push(nDone() / q.mis);
      if (q.palace) f.push((doneCnt.palace || 0) ? 1 : 0);
      return clamp(f.reduce(function (a, b) { return a + Math.min(1, b); }, 0) / f.length, 0, 1);
    }
    function score() {
      var v = st.cult + residents.length * 10 + nDone() * 50;
      st.bld.forEach(function (b) { var c = DEF[b.t].cost || {}; v += ((c.food || 0) + (c.wood || 0) + (c.clay || 0)) / 2; });
      return Math.floor(v);
    }

    /* ---------- 생산 주기 ---------- */
    function tick() {
      hungry = DF.eat > 0 && st.res.food < 1 && residents.length > 0;
      var sum = { food: 0, wood: 1, clay: 1, culture: 0 };
      st.bld.forEach(function (b) {
        var pr = prodOf(b), parts2 = [];
        ['food', 'wood', 'clay', 'culture'].forEach(function (k2) { if (pr[k2] > 0.01) { sum[k2] += pr[k2]; parts2.push('+' + r1(pr[k2]) + ICON[k2]); } });
        if (b.t === 'farm') st.foodMade += pr.food;
        if (parts2.length) { var d = dims(b), w = P(b.i + d[0] / 2, b.j + d[1] / 2); floats.push({ x: w[0], y: w[1] - 40, text: parts2.join(' '), life: 1.8 }); }
      });
      Object.keys(sum).forEach(function (k2) { addRes(k2, sum[k2]); });
      if (DF.eat && residents.length) st.res.food = Math.max(0, st.res.food - residents.length * DF.eat);
      if (sum.food + sum.wood + sum.clay > 2.5) host.sound('coin');
      rateCache = rates();
    }

    /* ---------- 주민 ---------- */
    function place(r, q) { r.cell = q; r.x = q % N + .5; r.y = ((q / N) | 0) + .5; }
    function say(r, e) { if (typeof r === 'number') { trayMsg(r, e, false); return; } r.bub = e; r.bt = 2.4; }
    function spawnRes(home) {
      var r = { id: nextRid++, home: home.id, cell: 0, x: 0, y: 0, path: null, pi: 0, t: .5 + Math.random() * 2, col: ROBES[nextRid % ROBES.length], hair: Math.random() < .5, ph: Math.random() * 6, bub: '', bt: 0, at: 'home', ox: (Math.random() - .5) * .3, oy: (Math.random() - .5) * .3 };
      place(r, home.door >= 0 ? home.door : idx(home.i, home.j));
      residents.push(r); say(r, '😊');
    }
    function syncResidents() {
      var per = {};
      residents = residents.filter(function (r) { var h = byId[r.home]; if (!h || h.prog < 1) return false; per[h.id] = (per[h.id] || 0) + 1; return per[h.id] <= capOf(h); });
      if (hungry || residents.length >= popCap) return;
      var homes = st.bld.filter(function (b) { return b.prog >= 1 && capOf(b) > (per[b.id] || 0); });
      if (homes.length) spawnRes(homes[(Math.random() * homes.length) | 0]);
    }
    function roadPath(from, goals) {
      if (goals[from]) return [from];
      prevA.fill(-2); prevA[from] = -1;
      var q = [from], h = 0;
      while (h < q.length) {
        var c = q[h++], ci = c % N, cj = (c / N) | 0, nb = [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]];
        for (var s = 0; s < 4; s++) {
          if (!inMap(nb[s][0], nb[s][1])) continue;
          var n = idx(nb[s][0], nb[s][1]);
          if (prevA[n] !== -2 || !st.road[n]) continue;
          prevA[n] = c;
          if (goals[n]) { var path = [n]; while (prevA[path[0]] >= 0) path.unshift(prevA[path[0]]); return path; }
          q.push(n);
        }
      }
      return null;
    }
    function goTo(r, b, kind) {
      if (!st.road[r.cell]) return false;
      var d = dims(b), goals = {}, any = false;
      ring(b.i, b.j, d[0], d[1]).forEach(function (c) { var q = idx(c[0], c[1]); if (st.road[q] && comp[q] === comp[r.cell]) { goals[q] = 1; any = true; } });
      if (!any) return false;
      var path = roadPath(r.cell, goals);
      if (!path) return false;
      r.path = path.slice(1); r.pi = 0; r.dest = b.id; r.goal = kind;
      if (!r.path.length) { r.path = null; arrive(r); }
      return true;
    }
    function arrive(r) {
      var b = byId[r.dest];
      if (r.goal === 'home') { r.at = 'home'; if (Math.random() < .3) say(r, '🏠'); r.t = 1.5 + Math.random() * 2.5; return; }
      r.at = r.dest;
      say(r, b ? (EMO[b.t] || '💬') : '💬');
      r.t = 2.5 + Math.random() * 2.5;
    }
    function wander(r, home) {
      var d = dims(home), cands = [];
      for (var j = home.j - 2; j < home.j + d[1] + 2; j++) for (var i = home.i - 2; i < home.i + d[0] + 2; i++) if (inMap(i, j) && passable(idx(i, j))) cands.push(idx(i, j));
      if (!cands.length) { r.t = 3; return; }
      var tgt = cands[(Math.random() * cands.length) | 0], path = [], ci = r.cell % N, cj = (r.cell / N) | 0, ti = tgt % N, tj = (tgt / N) | 0;
      while ((ci !== ti || cj !== tj) && path.length < 8) {
        if (Math.abs(ti - ci) >= Math.abs(tj - cj)) ci += ti > ci ? 1 : -1; else cj += tj > cj ? 1 : -1;
        var q = idx(ci, cj); if (!passable(q) && !st.road[q]) break; path.push(q);
      }
      r.path = path.length ? path : null; r.pi = 0; r.goal = 'wander';
      if (!home.conn && Math.random() < .35) say(r, '🛤️');
      r.t = 1.5 + Math.random() * 2;
    }
    function decide(r) {
      var home = byId[r.home]; if (!home) return;
      if (hungry && Math.random() < .5) { say(r, '😢'); r.t = 2.5; return; }
      // 집 근처를 돌다가 도로가 생기면 집에 들어갔다가 도로 쪽 문으로 나온다
      if (!st.road[r.cell] && home.conn && home.door >= 0) { place(r, home.door); r.at = 'home'; r.goal = ''; }
      if (r.at !== 'home' && r.goal !== 'wander') { if (!goTo(r, home, 'home')) { r.at = 'home'; wander(r, home); } return; }
      var cands = [];
      st.bld.forEach(function (b) {
        if (b.prog < 1 || b === home || !EMO[b.t]) return;
        var w = (b.t === 'farm' || WORKSHOP[b.t] || b.t === 'port') ? 5 : b.t === 'market' ? 4 : 2;
        cands.push([b, w]);
      });
      var tot = cands.reduce(function (a, c) { return a + c[1]; }, 0), pick = Math.random() * tot;
      for (var q = 0; q < cands.length; q++) {
        pick -= cands[q][1];
        if (pick <= 0) { if (goTo(r, cands[q][0], 'work')) return; break; }
      }
      // 갈 곳이 없거나 도로로 이어지지 않았으면 집 근처를 돌아다닌다
      for (q = 0; q < cands.length; q++) if (goTo(r, cands[(q + nextRid) % cands.length][0], 'work')) return;
      wander(r, home);
    }
    function stepRes(r, dt) {
      if (r.bt > 0) r.bt -= dt;
      if (r.path) {
        var tgt = r.path[r.pi], tx = tgt % N + .5, ty = ((tgt / N) | 0) + .5, dx = tx - r.x, dy = ty - r.y, dist = Math.sqrt(dx * dx + dy * dy), sp = 1.7 * dt;
        r.moving = true;
        if (dist <= sp) {
          r.x = tx; r.y = ty; r.cell = tgt; r.pi++;
          if (r.pi >= r.path.length) { r.path = null; if (r.goal === 'wander') { r.t = 1 + Math.random() * 2; } else arrive(r); }
        } else { r.x += dx / dist * sp; r.y += dy / dist * sp; }
        return;
      }
      r.moving = false;
      r.t -= dt; if (r.t > 0) return;
      decide(r);
    }

    /* ---------- 효과 ---------- */
    function dust(b, n, col) {
      var d = dims(b);
      for (var s = 0; s < n; s++) {
        var w = P(b.i + Math.random() * d[0], b.j + Math.random() * d[1]);
        parts.push({ x: w[0], y: w[1], vx: (Math.random() - .5) * 40, vy: -10 - Math.random() * 25, life: .9 + Math.random() * .5, max: 1.4, r: 4 + Math.random() * 5, col: col || '#d8c39a', grow: 8 });
      }
    }
    function confetti() {
      var cols = ['#e8553e', '#3e8acb', '#4caf6a', '#f2c75c', '#b55bd6'];
      for (var s = 0; s < 80; s++) parts.push({ screen: 1, x: 960 + (Math.random() - .5) * 600, y: 300, vx: (Math.random() - .5) * 600, vy: -200 - Math.random() * 300, life: 2.2, max: 2.2, r: 6, col: cols[s % 5], grav: 500, rect: 1 });
    }
    var laters = [];
    function later(fn, sec) { laters.push({ fn: fn, t: sec }); }

    /* ---------- 카메라·좌표 ---------- */
    function fitCam(full) {
      var top = full ? 30 : NP >= 2 ? 176 : 44, bot = full ? 1050 : 896;     // 혼자 할 때는 위쪽 판이 없어 지도를 더 크게
      var left = full ? 30 : (NP >= 3 ? 186 : 40), right = full ? 1890 : 1920 - (NP >= 4 ? 186 : 40);
      var s = Math.min((right - left) / (N * TW()), (bot - top) / (N * TH() + 40));
      return { s: s, x: (left + right) / 2, y: top + ((bot - top) - (N * TH() + 40) * s) / 2 + 8 * s };
    }
    function TW() { return HW * 2; }
    function TH() { return HH * 2; }
    function cellAt(x, y) {
      var wx = (x - cam.x) / cam.s, wy = (y - cam.y) / cam.s;
      var fi = (wy / HH + wx / HW) / 2, fj = (wy / HH - wx / HW) / 2;
      return { fi: fi, fj: fj, i: Math.floor(fi), j: Math.floor(fj) };
    }
    function scr(a, b) { var w = P(a, b); return [cam.x + w[0] * cam.s, cam.y + w[1] * cam.s]; }
    function nearestPlayer(pt) {
      var best = 0, bd = 1e9;
      for (var q = 0; q < NP; q++) {
        var side = host.SIDES[q], d = side === 'bottom' ? 1080 - pt.y : side === 'top' ? pt.y : side === 'left' ? pt.x : 1920 - pt.x;
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    }
    function overTray(cx, cy) {
      for (var q = 0; q < trays.length; q++) {
        var r = trays[q].el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return true;
      }
      return false;
    }

    /* ---------- 그림 캐시 ---------- */
    function setupCanvas() {
      var sc = host.scale ? host.scale() : 1;
      kRes = Math.max(0.75, Math.min(1.5, sc * (window.devicePixelRatio || 1)));
      R = kRes * RES_K;
      cv.width = Math.round(1920 * kRes); cv.height = Math.round(1080 * kRes);
      lastScaleKey = sc + ':' + (window.devicePixelRatio || 1);
      spr = {}; terrDirty = true;
      bgcv.width = cv.width; bgcv.height = cv.height;
      var bg = bgcv.getContext('2d'); bg.setTransform(kRes, 0, 0, kRes, 0, 0);
      var gr = bg.createRadialGradient(960, 520, 200, 960, 540, 1150);
      gr.addColorStop(0, '#4f7a5c'); gr.addColorStop(0.6, '#355a45'); gr.addColorStop(1, '#1d3528');
      bg.fillStyle = gr; bg.fillRect(0, 0, 1920, 1080);
      for (var s = 0; s < 90; s++) { bg.fillStyle = 'rgba(255,255,230,' + (0.03 + hash(s, 3) * 0.06) + ')'; bg.beginPath(); bg.ellipse(hash(s, 1) * 1920, hash(s, 2) * 1080, 30 + hash(s, 4) * 90, 10 + hash(s, 5) * 26, 0, 0, Math.PI * 2); bg.fill(); }
      if (st) trays.forEach(function (tr) { renderCards(tr); });
    }
    function sprite(t) {
      if (spr[t]) return spr[t];
      var d = DEF[t], w = d.w, h = d.h;
      var minX = -h * HW - 26, maxX = w * HW + 26, minY = -150, maxY = (w + h) * HH + 14;
      var c = document.createElement('canvas');
      c.width = Math.ceil((maxX - minX) * R); c.height = Math.ceil((maxY - minY) * R);
      var gg = c.getContext('2d'); gg.setTransform(R, 0, 0, R, -minX * R, -minY * R);
      try { DRAW[t](gg, w, h); } catch (e) { host.error(e); }
      spr[t] = { cv: c, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      return spr[t];
    }
    function drawSprite(gg, t, i, j, rot, alpha) {
      var s = sprite(t), n = P(i, j);
      gg.save();
      if (alpha != null) gg.globalAlpha = alpha;
      gg.translate(n[0], n[1]);
      if (rot) gg.scale(-1, 1);
      gg.drawImage(s.cv, s.x, s.y, s.w, s.h);
      gg.restore();
    }
    function drawTerrain() {
      terrDirty = false;
      var pad = 40, W = N * TW() + pad * 2, H = N * TH() + pad * 2 + 30;
      tcv.width = Math.ceil(W * R); tcv.height = Math.ceil(H * R);
      var tg = tcv.getContext('2d'); tg.setTransform(R, 0, 0, R, (N * HW + pad) * R, pad * R);
      tcv.ox = -(N * HW + pad); tcv.oy = -pad; tcv.ww = W; tcv.hh = H;
      // 섬처럼 보이는 아래쪽 흙 단면
      for (var s = 0; s < N; s++) {
        var t1 = st.terr[idx(s, N - 1)], t2 = st.terr[idx(N - 1, s)];
        var a = P(s, N), b = P(s + 1, N);
        poly(tg, [a, b, [b[0], b[1] + 26], [a[0], a[1] + 26]], t1 === 'w' ? '#3f84ab' : '#8a6440');
        poly(tg, [[a[0], a[1] + 12], [b[0], b[1] + 12], [b[0], b[1] + 15], [a[0], a[1] + 15]], t1 === 'w' ? 'rgba(255,255,255,.15)' : '#6e4e30');
        var c1 = P(N, s), c2 = P(N, s + 1);
        poly(tg, [c1, c2, [c2[0], c2[1] + 26], [c1[0], c1[1] + 26]], t2 === 'w' ? '#356f92' : '#74532f');
        poly(tg, [[c1[0], c1[1] + 12], [c2[0], c2[1] + 12], [c2[0], c2[1] + 15], [c1[0], c1[1] + 15]], t2 === 'w' ? 'rgba(255,255,255,.12)' : '#5a3f24');
      }
      wcells = [];
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) tile(tg, i, j);
      zones(tg);
    }
    // 지명 표지: 나무보다 위에 그리고, 그 칸에 건물이 서면 감춘다
    var LABELS = [['🌊 백마강', 1.2, 8.5, 'rgba(30,80,120,.8)', '#e6f4ff'], ['🌊 백마강', 9, 20.6, 'rgba(30,80,120,.8)', '#e6f4ff'],
      ['⛰️ 부소산 (언덕)', 13, 1.3, 'rgba(70,60,30,.78)', '#fff3cf'], ['왕궁 터 (추정)', 12, 7, 'rgba(120,80,10,.82)', '#fff3cf'],
      ['정림사지 자리', 10, 13.5, 'rgba(120,45,30,.8)', '#fff3cf'], ['나성 자리 (동쪽 성곽)', 21, 13.6, 'rgba(90,60,30,.82)', '#fff3cf']];
    function drawLabels() {
      g.font = 'bold 22px "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      LABELS.forEach(function (L) {
        var ci = Math.floor(L[1]), cj = Math.floor(L[2]);
        if (inMap(ci, cj) && occ[idx(ci, cj)]) return;
        var p = P(L[1], L[2]), w = g.measureText(L[0]).width + 22;
        g.fillStyle = L[3]; g.beginPath(); if (g.roundRect) g.roundRect(p[0] - w / 2, p[1] - 16, w, 32, 12); else g.rect(p[0] - w / 2, p[1] - 16, w, 32); g.fill();
        g.fillStyle = L[4]; g.fillText(L[0], p[0], p[1] + 1);
      });
    }
    function tile(tg, i, j) {
      var q = idx(i, j), t = st.terr[q], h = hash(i, j), pts = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      var col;
      if (t === 'w') { col = 'rgb(' + (78 + h * 12 | 0) + ',' + (156 + h * 14 | 0) + ',' + (200 + h * 10 | 0) + ')'; wcells.push(q); }
      else if (t === 'p') col = 'rgb(' + (190 + h * 12 | 0) + ',' + (206 + h * 8 | 0) + ',' + (118 + h * 10 | 0) + ')';
      else if (t === 'h') col = 'rgb(' + (160 + h * 14 | 0) + ',' + (152 + h * 10 | 0) + ',' + (98 + h * 8 | 0) + ')';
      else if (t === 'f') col = 'rgb(' + (88 + h * 10 | 0) + ',' + (132 + h * 12 | 0) + ',' + (66 + h * 8 | 0) + ')';
      else col = 'rgb(' + (142 + h * 14 | 0) + ',' + (190 + h * 10 | 0) + ',' + (96 + h * 10 | 0) + ')';
      poly(tg, pts, col);
      var c = P(i + .5, j + .5);
      if (t === 'w') {
        [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]].forEach(function (e) {
          var ni = i + e[0], nj = j + e[1];
          if (inMap(ni, nj) && st.terr[idx(ni, nj)] !== 'w') line(tg, pts[e[2]], pts[e[3]], 'rgba(255,255,255,.55)', 3);
        });
      } else {
        poly(tg, pts, null, 'rgba(40,60,20,.13)', 1);
        if (t === 'p') { for (var s = -2; s <= 2; s++) line(tg, [c[0] - 14 + s * 6, c[1] + s * 3 - 4], [c[0] + 2 + s * 6, c[1] + s * 3 + 4], 'rgba(120,130,40,.18)', 1.5); }
        else if (t === 'h') {
          ell(tg, c[0] - 4, c[1] - 2, 20, 8, 'rgba(255,255,220,.13)');
          tg.strokeStyle = 'rgba(90,70,30,.25)'; tg.lineWidth = 1.5; tg.beginPath(); tg.ellipse(c[0], c[1] + 2, 18, 7, 0, Math.PI * 1.1, Math.PI * 1.9); tg.stroke();
          if (h > .6) { ell(tg, c[0] + 8, c[1] + 2, 5, 3, '#9a9488'); ell(tg, c[0] + 7, c[1] + 1, 3, 1.6, '#c2bcb0'); }
        } else if (t === 'g' && h > .5) { line(tg, [c[0] - 8 + h * 10, c[1] + 2], [c[0] - 9 + h * 10, c[1] - 3], 'rgba(60,110,40,.45)', 1.5); line(tg, [c[0] - 6 + h * 10, c[1] + 2], [c[0] - 4 + h * 10, c[1] - 3], 'rgba(60,110,40,.45)', 1.5); }
        if (t === 'g' && h < .08) { ell(tg, c[0] + 6, c[1], 2.5, 2.5, '#f6e27a'); ell(tg, c[0] - 8, c[1] + 4, 2, 2, '#f4f4f4'); }
      }
      if (st.road[q]) {
        poly(tg, pts, '#dcc391');
        [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]].forEach(function (e) {
          var ni = i + e[0], nj = j + e[1];
          if (!inMap(ni, nj) || !st.road[idx(ni, nj)]) {
            var a = pts[e[2]], b = pts[e[3]], inA = [a[0] + (c[0] - a[0]) * .12, a[1] + (c[1] - a[1]) * .12], inB = [b[0] + (c[0] - b[0]) * .12, b[1] + (c[1] - b[1]) * .12];
            line(tg, inA, inB, '#b39661', 3);
          }
        });
        ell(tg, c[0] - 8 + h * 14, c[1] - 2, 2.2, 1.2, '#b8a070'); ell(tg, c[0] + 6 - h * 8, c[1] + 4, 1.8, 1, '#c4ac7c');
      }
    }
    function zones(tg) {
      var ZC = { P: ['rgba(232,184,74,.22)', '#c9962a'], T: ['rgba(200,90,60,.16)', '#b5523c'], N: ['rgba(140,100,60,.2)', '#8c6b45'] };
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
        var z = MAP.z[idx(i, j)]; if (!z) continue;
        var pts = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
        poly(tg, pts, ZC[z][0]);
        tg.setLineDash([6, 5]);
        [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]].forEach(function (e) {
          var ni = i + e[0], nj = j + e[1];
          if (!inMap(ni, nj) || MAP.z[idx(ni, nj)] !== z) line(tg, pts[e[2]], pts[e[3]], ZC[z][1], 2.5);
        });
        tg.setLineDash([]);
      }
    }

    /* ---------- 화면 그리기 ---------- */
    function render(t) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bgcv, 0, 0);
      if (terrDirty) drawTerrain();
      g.setTransform(kRes * cam.s, 0, 0, kRes * cam.s, kRes * cam.x, kRes * cam.y);
      g.drawImage(tcv, tcv.ox, tcv.oy, tcv.ww, tcv.hh);
      // 강물 반짝임
      g.lineCap = 'round';
      for (var w = 0; w < wcells.length; w++) {
        var q = wcells[w], hi = hash(q, 9); if (hi > .45) continue;
        var c = P(q % N + .5, ((q / N) | 0) + .5), ph = t * 0.9 + hi * 20;
        g.strokeStyle = 'rgba(255,255,255,' + (0.18 + 0.18 * Math.sin(ph * 1.3)) + ')'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(c[0] - 9 + Math.sin(ph) * 6, c[1] + hi * 8 - 4); g.lineTo(c[0] + 5 + Math.sin(ph) * 6, c[1] + hi * 8 - 1); g.stroke();
      }
      g.lineCap = 'butt';
      // 끌고 있는 건물의 칸 표시 (초록 = 지을 수 있음, 빨강 = 안 됨)
      Object.keys(drags).forEach(function (id) {
        var d = drags[id];
        if ((d.kind === 'card' || d.kind === 'bmove') && d.chk && !d.overTray) {
          d.chk.cells.forEach(function (cc) { if (inMap(cc.i, cc.j)) poly(g, [P(cc.i, cc.j), P(cc.i + 1, cc.j), P(cc.i + 1, cc.j + 1), P(cc.i, cc.j + 1)], cc.ok ? 'rgba(70,200,90,.5)' : 'rgba(235,60,50,.55)', cc.ok ? 'rgba(30,120,40,.8)' : 'rgba(150,20,20,.8)', 1.5); });
          poly(g, [P(d.gi, d.gj), P(d.gi + d.chk.w, d.gj), P(d.gi + d.chk.w, d.gj + d.chk.h), P(d.gi, d.gj + d.chk.h)], null, host.PCOL[d.p], 4);
        }
        if (d.kind === 'road' && d.hover && inMap(d.hover.i, d.hover.j) && !d.overTray) {
          var ok = !roadReason(d.hover.i, d.hover.j) || st.road[idx(d.hover.i, d.hover.j)];
          poly(g, [P(d.hover.i, d.hover.j), P(d.hover.i + 1, d.hover.j), P(d.hover.i + 1, d.hover.j + 1), P(d.hover.i, d.hover.j + 1)], ok ? 'rgba(70,200,90,.45)' : 'rgba(235,60,50,.5)', host.PCOL[d.p], 3);
        }
      });
      // 선택 표시
      sel.forEach(function (s, p) {
        if (!s) return;
        var a = 0.6 + 0.4 * Math.sin(t * 5);
        g.globalAlpha = a;
        if (s.kind === 'b' && byId[s.id]) { var b = byId[s.id], dd = dims(b); poly(g, [P(b.i, b.j), P(b.i + dd[0], b.j), P(b.i + dd[0], b.j + dd[1]), P(b.i, b.j + dd[1])], 'rgba(255,255,255,.18)', host.PCOL[p], 4); }
        else if (s.kind !== 'b') poly(g, [P(s.i, s.j), P(s.i + 1, s.j), P(s.i + 1, s.j + 1), P(s.i, s.j + 1)], 'rgba(255,255,255,.2)', host.PCOL[p], 4);
        g.globalAlpha = 1;
      });
      // 깊이 순서로 건물·나무·주민
      var objs = [];
      st.bld.forEach(function (b) { var dd = dims(b); objs.push({ k: b.i + dd[0] / 2 + b.j + dd[1] / 2, b: b }); });
      trees.forEach(function (tr) { objs.push({ k: tr.x + tr.y, tr: tr }); });
      residents.forEach(function (r) { objs.push({ k: r.x + r.y + .2, r: r }); });
      objs.sort(function (a, b) { return a.k - b.k; });
      objs.forEach(function (o) {
        if (o.b) drawBld(o.b, t);
        else if (o.tr) { var tp = P(o.tr.x, o.tr.y); drawTree(g, tp[0], tp[1], o.tr.s, o.tr.k); }
        else drawRes(o.r, t);
      });
      if (!viewing) drawLabels();
      // 도로 없음 표시, 배
      st.bld.forEach(function (b) {
        if (b.prog < 1) return;
        var dd = dims(b), c2 = P(b.i + dd[0] / 2, b.j + dd[1] / 2);
        if (b.t === 'port' && b.side) drawBoat(b, t);
        if (DEF[b.t].needsRoad && !b.conn && !viewing) {
          var y = c2[1] - 52 - Math.sin(t * 3 + b.id) * 3;
          ell(g, c2[0], y, 15, 15, 'rgba(255,255,255,.95)');
          g.strokeStyle = '#d23a2a'; g.lineWidth = 3; g.beginPath(); g.arc(c2[0], y, 14, 0, Math.PI * 2); g.stroke();
          g.font = '17px "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText('🛤️', c2[0], y + 1);
          line(g, [c2[0] - 10, y - 10], [c2[0] + 10, y + 10], '#d23a2a', 3);
        }
      });
      // 끌고 있는 건물의 반투명 모습
      Object.keys(drags).forEach(function (id) {
        var d = drags[id];
        if ((d.kind === 'card' || d.kind === 'bmove') && d.chk && !d.overTray) drawSprite(g, d.t, d.gi, d.gj, d.grot, 0.6);
      });
      // 입자와 떠오르는 숫자
      parts.forEach(function (pp) {
        if (pp.screen) return;
        g.globalAlpha = clamp(pp.life / pp.max, 0, 1) * 0.8;
        ell(g, pp.x, pp.y, pp.r, pp.r * (pp.flat ? .6 : 1), pp.col);
      });
      g.globalAlpha = 1;
      g.font = 'bold 19px "Malgun Gothic", "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      floats.forEach(function (f) {
        if (viewing) return;
        g.globalAlpha = clamp(f.life, 0, 1);
        g.lineWidth = 4; g.strokeStyle = 'rgba(40,26,12,.8)'; g.strokeText(f.text, f.x, f.y - (1.8 - f.life) * 22);
        g.fillStyle = '#fff6d0'; g.fillText(f.text, f.x, f.y - (1.8 - f.life) * 22);
      });
      g.globalAlpha = 1;
      // 화면 좌표: 안 되는 이유 안내(플레이어 방향으로), 축하 종이 조각
      g.setTransform(kRes, 0, 0, kRes, 0, 0);
      Object.keys(drags).forEach(function (id) {
        var d = drags[id], msg = '';
        if ((d.kind === 'card' || d.kind === 'bmove') && !d.overTray && d.chk) msg = d.chk.ok ? (d.kind === 'card' ? '✔ 여기에 놓으면 지어요' : '✔ 여기로 옮겨요') : '✖ ' + d.chk.reason;
        else if (d.kind === 'road' && !d.overTray && d.reason) msg = '✖ ' + d.reason;
        else if (d.overTray && (d.kind === 'card' || d.kind === 'bmove')) msg = '여기에 놓으면 취소돼요';
        if (msg) dragLabel(d, msg, d.chk && d.chk.ok && !d.overTray);
      });
      parts.forEach(function (pp) {
        if (!pp.screen) return;
        g.globalAlpha = clamp(pp.life / pp.max, 0, 1); g.fillStyle = pp.col;
        g.save(); g.translate(pp.x, pp.y); g.rotate(pp.life * 6); g.fillRect(-pp.r, -pp.r / 2, pp.r * 2, pp.r); g.restore();
      });
      g.globalAlpha = 1;
    }
    function dragLabel(d, msg, ok) {
      var side = host.SIDES[d.p], ang = SIDE_ANG[side] * Math.PI / 180;
      g.save(); g.translate(d.x, d.y); g.rotate(ang); g.translate(0, -96);
      g.font = 'bold 26px "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      var w = Math.min(860, g.measureText(msg).width + 36);
      g.fillStyle = ok ? 'rgba(30,110,50,.92)' : 'rgba(150,35,20,.94)';
      g.beginPath(); if (g.roundRect) g.roundRect(-w / 2, -24, w, 48, 22); else g.rect(-w / 2, -24, w, 48); g.fill();
      g.strokeStyle = host.PCOL[d.p]; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#fff'; g.fillText(msg, 0, 1, 840);
      g.restore();
    }
    function drawBld(b, t) {
      var d = dims(b), alpha = 1;
      Object.keys(drags).forEach(function (id) { if (drags[id].kind === 'bmove' && drags[id].b === b) alpha = 0.3; });
      if (b.prog >= 1) {
        var pop = b.pop > 0 ? 1 + Math.sin((1 - b.pop) * Math.PI * 3) * 0.05 * b.pop : 1;
        if (pop !== 1) { var cc = P(b.i + d[0] / 2, b.j + d[1] / 2); g.save(); g.translate(cc[0], cc[1]); g.scale(pop, 2 - pop); g.translate(-cc[0], -cc[1]); drawSprite(g, b.t, b.i, b.j, b.rot, alpha); g.restore(); }
        else drawSprite(g, b.t, b.i, b.j, b.rot, alpha);
        return;
      }
      // 공사 중: 아래에서부터 지어 올라가고 비계가 서 있다
      var s = sprite(b.t), n = P(b.i, b.j), bottom = n[1] + (d[0] + d[1]) * HH + 4, topY = n[1] - 120;
      var cut = bottom - (bottom - topY) * b.prog;
      poly(g, [P(b.i, b.j), P(b.i + d[0], b.j), P(b.i + d[0], b.j + d[1]), P(b.i, b.j + d[1])], 'rgba(150,110,60,.35)', 'rgba(110,80,40,.6)', 2);
      g.save(); g.beginPath(); g.rect(n[0] - 400, cut, 800, bottom - cut + 10); g.clip();
      drawSprite(g, b.t, b.i, b.j, b.rot, 0.95); g.restore();
      var hgt = 20 + 50 * b.prog;
      [[b.i, b.j + d[1]], [b.i + d[0], b.j + d[1]], [b.i + d[0], b.j]].forEach(function (c) { var p = P(c[0], c[1]); line(g, p, [p[0], p[1] - hgt], '#8a6a3a', 2.5); });
      var a1 = P(b.i, b.j + d[1]), a2 = P(b.i + d[0], b.j + d[1]), a3 = P(b.i + d[0], b.j);
      for (var z = 14; z < hgt; z += 16) { line(g, [a1[0], a1[1] - z], [a2[0], a2[1] - z], '#a07a44', 2); line(g, [a2[0], a2[1] - z], [a3[0], a3[1] - z], '#a07a44', 2); }
      var c3 = P(b.i + d[0] / 2, b.j + d[1] / 2);
      g.font = '22px "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🔨', c3[0] + Math.sin(t * 12) * 4, c3[1] - hgt - 14 + Math.abs(Math.sin(t * 12)) * -6);
    }
    function drawBoat(b, t) {
      var c = P(b.side[0] + .5, b.side[1] + .5), bob = Math.sin(t * 2 + b.id) * 2, x = c[0], y = c[1] + bob;
      ell(g, x, y + 4, 26, 7, 'rgba(20,50,80,.3)');
      g.fillStyle = '#7a4a24'; g.beginPath(); g.moveTo(x - 28, y - 6); g.quadraticCurveTo(x, y + 10, x + 28, y - 6); g.lineTo(x + 22, y - 2); g.quadraticCurveTo(x, y + 4, x - 22, y - 2); g.fill();
      g.fillStyle = '#9a6234'; g.beginPath(); g.moveTo(x - 28, y - 6); g.quadraticCurveTo(x, y + 10, x + 28, y - 6); g.quadraticCurveTo(x, y + 1, x - 28, y - 6); g.fill();
      line(g, [x, y - 2], [x, y - 40], '#5a3a1e', 2.5);
      g.fillStyle = '#f3ead4'; g.beginPath(); g.moveTo(x + 2, y - 38); g.quadraticCurveTo(x + 20, y - 26, x + 3, y - 8); g.fill();
    }
    function drawRes(r, t) {
      var w = P(r.x + r.ox, r.y + r.oy), x = w[0], y = w[1], bob = r.moving ? Math.abs(Math.sin(t * 11 + r.ph)) * 2.2 : 0, step = r.moving ? Math.sin(t * 11 + r.ph) * 2.5 : 0;
      ell(g, x, y, 7, 3, 'rgba(0,0,0,.22)');
      line(g, [x - 2.5, y - 6], [x - 2.5 + step, y], '#3a2a1a', 2.4); line(g, [x + 2.5, y - 6], [x + 2.5 - step, y], '#3a2a1a', 2.4);
      y -= bob;
      g.fillStyle = r.col; g.beginPath(); g.moveTo(x - 6, y - 5); g.lineTo(x - 4.5, y - 16); g.quadraticCurveTo(x, y - 18, x + 4.5, y - 16); g.lineTo(x + 6, y - 5); g.quadraticCurveTo(x, y - 3, x - 6, y - 5); g.fill();
      line(g, [x - 5, y - 10], [x + 5, y - 10], 'rgba(255,255,255,.55)', 1.5);
      ell(g, x, y - 22, 6, 6, '#f6d3a8');
      g.fillStyle = '#2a1e14'; g.beginPath(); g.arc(x, y - 23, 6.2, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      if (r.hair) ell(g, x, y - 30, 2.6, 2.6, '#2a1e14'); else { ell(g, x - 5, y - 24, 2.4, 3, '#2a1e14'); ell(g, x + 5, y - 24, 2.4, 3, '#2a1e14'); }
      ell(g, x - 2.2, y - 21.5, 0.9, 1.1, '#2a1e14'); ell(g, x + 2.2, y - 21.5, 0.9, 1.1, '#2a1e14');
      ell(g, x - 3.6, y - 19.8, 1.3, 0.8, 'rgba(240,120,120,.6)'); ell(g, x + 3.6, y - 19.8, 1.3, 0.8, 'rgba(240,120,120,.6)');
      if (r.bt > 0 && r.bub) {
        var by = y - 44, a = clamp(r.bt / 0.4, 0, 1);
        g.globalAlpha = a;
        g.fillStyle = '#fff'; g.beginPath(); if (g.roundRect) g.roundRect(x - 13, by - 12, 26, 22, 9); else g.rect(x - 13, by - 12, 26, 22); g.fill();
        g.beginPath(); g.moveTo(x - 3, by + 9); g.lineTo(x, by + 15); g.lineTo(x + 4, by + 9); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); if (g.roundRect) g.roundRect(x - 13, by - 12, 26, 22, 9); g.stroke();
        g.font = '15px "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(r.bub, x, by);
        g.globalAlpha = 1;
      }
    }

    /* ---------- 플레이어 자리(건물 카드 판) ---------- */
    function listOf(gi) {
      var gid = GROUPS[gi][0];
      return ORDER.filter(function (t) { return DEF[t].group === gid; });
    }
    function buildTray(p) {
      var side = host.SIDES[p];
      var tr = { p: p, side: side, group: 0, page: 0, rot: 0, per: (side === 'left' || side === 'right') ? 3 : 6, flash: 0 };
      var e = el('div', 'vg-tray vg-ui side-' + side); e.style.setProperty('--pc', host.PCOL[p]);
      var tabs = el('div', 'vg-tabs');
      GROUPS.forEach(function (gr, gi) {
        var b = el('button', 'vg-tab', '<i>' + gr[2] + '</i>' + gr[1]); b.dataset.g = gi;
        b.addEventListener('click', function () { tr.group = gi; tr.page = 0; host.sound('tap'); renderCards(tr); });
        tabs.appendChild(b);
      });
      var cards = el('div', 'vg-cards');
      var tools = el('div', 'vg-tools');
      var rotB = el('button', 'vg-tool vg-rot', '<i>↻</i>회전'); var undoB = el('button', 'vg-tool vg-undo', '<i>↶</i>되돌리기');
      rotB.addEventListener('click', function () {
        tr.rot = tr.rot ? 0 : 1; host.sound('tap');
        rotB.classList.toggle('on', !!tr.rot);
        Object.keys(drags).forEach(function (id) { var d = drags[id]; if (d.p === p && d.kind === 'bmove') d.rot = d.rot ? 0 : 1; if (d.p === p) updateGhost(d); });
        renderCards(tr);
      });
      undoB.addEventListener('click', function () { undo(p); });
      tools.appendChild(rotB); tools.appendChild(undoB);
      var info = el('div', 'vg-info hidden'); var msg = el('div', 'vg-msg hidden');
      e.appendChild(tabs); e.appendChild(cards); e.appendChild(tools); e.appendChild(info); e.appendChild(msg);
      wrap.appendChild(e);
      tr.el = e; tr.tabs = tabs; tr.cards = cards; tr.info = info; tr.msg = msg; tr.infoT = 0; tr.msgT = 0;
      var act = el('div', 'vg-act vg-ui hidden'); act.style.setProperty('--pc', host.PCOL[p]); wrap.appendChild(act);
      acts.push(act);
      trays.push(tr);
      renderCards(tr);
    }
    function renderCards(tr) {
      var list = listOf(tr.group), per = tr.per, pages = Math.ceil(list.length / per);
      if (tr.page >= pages) tr.page = 0;
      tr.tabs.querySelectorAll('.vg-tab').forEach(function (b) { b.classList.toggle('on', +b.dataset.g === tr.group); });
      tr.cards.innerHTML = '';
      list.slice(tr.page * per, tr.page * per + per).forEach(function (t) {
        var d = DEF[t], c = el('div', 'vg-card');
        c.dataset.t = t; c.dataset.p = tr.p;
        var icv = el('canvas'); c.appendChild(icv);
        drawIcon(icv, t, tr.rot);
        c.appendChild(txt('b', '', d.short));
        c.appendChild(txt('span', 'vg-cost', costStr(costOf(t))));
        if (!unlocked(t)) c.appendChild(txt('em', 'vg-lock', '🔒 미션 ' + misNo(d.unlock)));
        tr.cards.appendChild(c);
      });
      if (pages > 1) {
        var m = el('button', 'vg-more', '▶<small>' + (tr.page + 1) + '/' + pages + '</small>');
        m.addEventListener('click', function () { tr.page = (tr.page + 1) % pages; host.sound('tap'); renderCards(tr); });
        tr.cards.appendChild(m);
      }
      refreshCards();
    }
    var TALL = { road: 4, farm: 8, market: 34, kiln: 34, port: 28, wall: 30, well: 50, house: 40, tilehouse: 56, storage: 62, weaving: 48, smithy: 46, school: 50, gate: 56, office: 66, temple: 76, palace: 96, pagoda: 112 };
    // 카드·도감용 작은 그림: 건물 그림 전체가 들어오도록 크기를 맞춘다
    function drawIcon(icv, t, rot, W, H) {
      W = W || 104; H = H || 62;
      var gg = Activities.hiDpi(icv, W, H), s = sprite(t), d = DEF[t];
      var bw = (d.w + d.h) * HW + 8, bh = (d.w + d.h) * HH + (TALL[t] || 60) + 4;
      var sc = Math.min(W / bw, H / bh);
      gg.save(); gg.translate(W / 2, H - 2);
      gg.scale(sc * (rot ? -1 : 1), sc); gg.translate(-(d.w - d.h) * HW / 2, -(d.w + d.h) * HH);
      gg.drawImage(s.cv, s.x, s.y, s.w, s.h); gg.restore();
    }
    function refreshCards(flashNew) {
      trays.forEach(function (tr) {
        tr.cards.querySelectorAll('.vg-card').forEach(function (c) {
          var t = c.dataset.t, lk = !unlocked(t);
          c.classList.toggle('locked', lk);
          c.classList.toggle('poor', !lk && !!lack(costOf(t)));
          var l = c.querySelector('.vg-lock'); if (!lk && l) { l.remove(); if (flashNew) c.classList.add('vg-new'); }
        });
      });
    }
    function trayMsg(p, text, bad) {
      var tr = trays[p] || trays[0];
      tr.msg.textContent = text; tr.msg.classList.remove('hidden'); tr.msg.classList.toggle('bad', !!bad); tr.msgT = 2.8;
      // 설명 창이 떠 있으면 그 위에 안내를 띄운다
      tr.msg.style.bottom = tr.info.classList.contains('hidden') ? '' : 'calc(100% + ' + (tr.info.offsetHeight + 30) + 'px)';
    }
    function warn(p, text) { host.sound('wrong'); trayMsg(p, text, true); }
    function showInfo(p, t, o) {
      o = o || {};
      var tr = trays[p] || trays[0], d = DEF[t], box = tr.info, cd = d.card ? host.card(d.card) : null;
      box.innerHTML = '';
      var x = el('button', 'vg-x', '✕'); x.addEventListener('click', function () { box.classList.add('hidden'); }); box.appendChild(x);
      var head = el('div', 'vg-ihead');
      var icv = el('canvas'); head.appendChild(icv); drawIcon(icv, t, 0);
      var ht = el('div');
      if (o.learn) ht.appendChild(txt('div', 'vg-ilearn', '📚 새로 알게 된 것'));
      ht.appendChild(txt('h3', '', d.name + (o.b ? ' (' + (o.b.prog >= 1 ? '완성' : '짓는 중') + ')' : '')));
      ht.appendChild(txt('div', 'vg-isub', GROUPS.filter(function (gr) { return gr[0] === d.group; }).map(function (gr) { return gr[2] + ' ' + gr[1]; })[0] + ' · ' + d.w + '×' + d.h + '칸 · 비용 ' + costStr(costOf(t))));
      head.appendChild(ht); box.appendChild(head);
      if (o.learn && cd) {
        box.appendChild(txt('p', 'vg-itext', cd.text));
        // 카드의 주의 문구가 있으면 그것을, 없으면 게임 그림이 창작 재현이라는 설명을 덧붙인다
        if (cd.note) box.appendChild(txt('p', 'vg-inote', '💡 ' + cd.note));
        else if (d.info.indexOf('창작 재현') >= 0) box.appendChild(txt('p', 'vg-inote', '💡 ' + d.info));
        if (o.fresh && o.fresh.length) box.appendChild(txt('p', 'vg-igot', '🏯 건축 도감에 등록: ' + o.fresh.map(function (c) { return c.title; }).join(', ')));
      } else {
        box.appendChild(txt('p', 'vg-irow', '⚙️ ' + d.effect));
        box.appendChild(txt('p', 'vg-irow', '📍 짓는 곳: ' + d.ruleText + (d.needsRoad ? ' · 도로와 이어야 제대로 일해요' : '')));
        if (o.b && o.b.prog >= 1) {
          var pr = prodOf(o.b), s = ['food', 'wood', 'clay', 'culture'].filter(function (k2) { return pr[k2] > 0.01; }).map(function (k2) { return ICON[k2] + '+' + r1(pr[k2]); }).join(' ');
          var extra = [];
          if (DEF[o.b.t].needsRoad && !o.b.conn) extra.push('🛤️ 도로와 이어지지 않아 생산이 절반이에요');
          if (WORKSHOP[o.b.t] && tradeLinked(o.b)) extra.push('🏪 시장과 이어져 1.5배');
          if (capOf(o.b)) extra.push('👥 주민 ' + capOf(o.b) + '명까지');
          box.appendChild(txt('p', 'vg-irow vg-now', '📈 지금 3초마다: ' + (s || '없음') + (extra.length ? ' · ' + extra.join(' · ') : '')));
        }
        if (!unlocked(t)) box.appendChild(txt('p', 'vg-irow vg-ilock', '🔒 미션 ' + misNo(d.unlock) + '「' + MISSIONS[misNo(d.unlock) - 1].title + '」을 해결하면 열려요'));
        else if (!o.b) box.appendChild(txt('p', 'vg-irow', '👉 카드를 끌어 빈 땅에 놓으면 지어져요. 판 위로 되돌리면 취소돼요.'));
        box.appendChild(txt('p', 'vg-inote', '💡 ' + d.info));
      }
      box.classList.remove('hidden'); tr.infoT = o.learn ? 11 : 8;
      tr.msg.classList.add('hidden');
    }

    /* ---------- 선택과 행동 말풍선 ---------- */
    function setSel(p, s) {
      sel[p] = s;
      var a = acts[p]; if (!a) return;
      if (!s) { a.classList.add('hidden'); return; }
      a.innerHTML = '';
      var add = function (icon, label, fn, cls) {
        var b = el('button', 'vg-ab' + (cls ? ' ' + cls : ''), '<i>' + icon + '</i>' + label);
        b.addEventListener('click', function () { host.sound('tap'); fn(); });
        a.appendChild(b);
      };
      if (s.kind === 'b') {
        var b = byId[s.id]; if (!b) { setSel(p, null); return; }
        var c = costOf(b.t), back = costStr((function () { var o = {}; Object.keys(c).forEach(function (k2) { if (Math.floor(c[k2] / 2)) o[k2] = Math.floor(c[k2] / 2); }); return o; })());
        add('ℹ️', '정보', function () { showInfo(p, b.t, { b: b }); }, 'vg-ab-info');
        add('↻', '회전', function () { var r = rotateB(p, b); if (r) warn(p, r); }, 'vg-ab-rot');
        add('🗑️', '철거<small>' + back + '</small>', function () { var r = demolish(p, b); if (r) warn(p, r); else { setSel(p, null); say(p, '🗑️ 철거했어요. 절반을 돌려받았어요'); } }, 'vg-ab-demo');
      } else if (s.kind === 'road') {
        add('🗑️', '도로 철거', function () { unroad(p, idx(s.i, s.j)); setSel(p, null); }, 'vg-ab-demo');
      } else if (s.kind === 'forest') {
        add('🪓', '나무 베기<small>+' + Math.round(5 * DF.prod) + '🪵</small>', function () { clearForest(p, idx(s.i, s.j)); setSel(p, null); }, 'vg-ab-chop');
      }
      add('✕', '닫기', function () { setSel(p, null); }, 'vg-ab-x');
      a.classList.remove('hidden');
      placeActs();
    }
    function placeActs() {
      sel.forEach(function (s, p) {
        if (!s || !acts[p]) return;
        var x, y;
        if (s.kind === 'b') { var b = byId[s.id]; if (!b) return; var d = dims(b), c = scr(b.i + d[0] / 2, b.j + d[1] / 2); x = c[0]; y = c[1]; }
        else { var c2 = scr(s.i + .5, s.j + .5); x = c2[0]; y = c2[1]; }
        var ang = SIDE_ANG[host.SIDES[p]];
        acts[p].style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) rotate(' + ang + 'deg) translate(-50%, calc(-100% - 56px))';
      });
    }

    /* ---------- 포인터 (손가락마다 따로) ---------- */
    function capture(e) { try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* 합성 이벤트 등 */ } }
    function onDown(e) {
      if (!alive) return;
      if (viewing) { stopView(); e.preventDefault(); return; }
      if (!started || myModals.length) return;
      var pt = host.mapPoint(e.clientX, e.clientY), t = e.target;
      var card = t && t.closest ? t.closest('.vg-card') : null;
      if (card) {
        e.preventDefault();
        var p = +card.dataset.p, ty = card.dataset.t;
        if (!unlocked(ty)) { warn(p, '🔒 아직 잠겨 있어요. 미션 ' + misNo(DEF[ty].unlock) + '을 해결하면 열려요'); showInfo(p, ty); return; }
        drags[e.pointerId] = { id: e.pointerId, p: p, t: ty, kind: ty === 'road' ? 'road' : 'card', sx: pt.x, sy: pt.y, x: pt.x, y: pt.y, cx: e.clientX, cy: e.clientY, moved: false, overTray: true, cells: [], card: card };
        card.classList.add('drag');
        host.sound('tap');
        capture(e);
        return;
      }
      if (t !== cv) return;
      e.preventDefault();
      var pl = nearestPlayer(pt), c = cellAt(pt.x, pt.y);
      var d = { id: e.pointerId, p: pl, sx: pt.x, sy: pt.y, x: pt.x, y: pt.y, cx: e.clientX, cy: e.clientY, moved: false, kind: 'tap', ci: c.i, cj: c.j, what: 'none' };
      if (inMap(c.i, c.j)) {
        var q = idx(c.i, c.j), bid = occ[q];
        if (bid) {
          var b = byId[bid];
          if (b.grab != null && b.grab !== e.pointerId) { warn(pl, '다른 친구가 이 건물을 잡고 있어요'); return; }
          b.grab = e.pointerId; d.kind = 'bpend'; d.b = b; d.t = b.t; d.oi = c.fi - b.i; d.oj = c.fj - b.j; d.rot = b.rot;
        } else if (st.road[q]) d.what = 'road';
        else if (st.terr[q] === 'f') d.what = 'forest';
        else d.what = 'empty';
      }
      drags[e.pointerId] = d;
      capture(e);
    }
    function onMove(e) {
      var d = drags[e.pointerId]; if (!d) return;
      var pt = host.mapPoint(e.clientX, e.clientY);
      d.x = pt.x; d.y = pt.y; d.cx = e.clientX; d.cy = e.clientY;
      if (!d.moved && Math.abs(pt.x - d.sx) + Math.abs(pt.y - d.sy) > 14) d.moved = true;
      if (d.kind === 'bpend' && d.moved) { d.kind = 'bmove'; setSel(d.p, null); host.sound('tap'); }
      if (d.kind === 'road') paintTo(d);
      if (d.kind === 'card' || d.kind === 'bmove') updateGhost(d);
    }
    function updateGhost(d) {
      if (d.kind !== 'card' && d.kind !== 'bmove') return;
      d.overTray = overTray(d.cx, d.cy);
      var def = DEF[d.t], rot = d.kind === 'card' ? trays[d.p].rot : d.rot, w = rot ? def.h : def.w, h = rot ? def.w : def.h;
      var c = cellAt(d.x, d.y), i0, j0;
      if (d.kind === 'bmove') {
        var ow = d.b.rot === rot ? 0 : 1, oi = ow ? d.oj : d.oi, oj = ow ? d.oi : d.oj;
        i0 = Math.floor(c.fi - oi + .5); j0 = Math.floor(c.fj - oj + .5);
      } else { i0 = Math.round(c.fi - w / 2); j0 = Math.round(c.fj - h / 2); }
      d.gi = i0; d.gj = j0; d.grot = rot;
      d.chk = check(d.t, i0, j0, rot, d.kind === 'bmove' ? d.b.id : 0, d.kind === 'card');
    }
    function paintTo(d) {
      d.overTray = overTray(d.cx, d.cy);
      if (d.overTray) { d.last = null; return; }
      var c = cellAt(d.x, d.y), from = d.last || c;
      d.hover = c;
      var i = from.i, j = from.j, cells = [[i, j]];
      while (i !== c.i || j !== c.j) { if (Math.abs(c.i - i) >= Math.abs(c.j - j)) i += c.i > i ? 1 : -1; else j += c.j > j ? 1 : -1; cells.push([i, j]); }
      cells.forEach(function (cc) {
        if (!inMap(cc[0], cc[1])) return;
        var q = idx(cc[0], cc[1]); if (st.road[q]) return;
        var r = roadReason(cc[0], cc[1]); if (r) { d.reason = r; return; }
        var cost = costOf('road'), l = lack(cost); if (l) { d.reason = l; return; }
        pay(cost); st.road[q] = 1; d.cells.push(q); d.reason = '';
        terrDirty = true; dirty = true;
        host.sound('tile');
        var w = P(cc[0] + .5, cc[1] + .5);
        for (var s = 0; s < 3; s++) parts.push({ x: w[0] + (Math.random() - .5) * 30, y: w[1], vx: (Math.random() - .5) * 20, vy: -12, life: .6, max: .6, r: 4, col: '#d8c39a', grow: 6 });
      });
      d.last = { i: c.i, j: c.j };
    }
    function onUp(e) { var d = drags[e.pointerId]; if (!d) return; delete drags[e.pointerId]; finish(d, false); }
    function onCancel(e) { var d = drags[e.pointerId]; if (!d) return; delete drags[e.pointerId]; finish(d, true); }
    function finish(d, cancelled) {
      if (d.card) d.card.classList.remove('drag');
      if (d.b) d.b.grab = null;
      if (d.kind === 'card') {
        if (cancelled) return;
        if (!d.moved) { showInfo(d.p, d.t); return; }
        updateGhost(d);
        if (d.overTray) { say(d.p, '취소했어요'); host.sound('erase'); return; }
        var r = build(d.p, d.t, d.gi, d.gj, d.grot);
        if (r) warn(d.p, r);
      } else if (d.kind === 'road') {
        if (d.cells.length) { pushUndo(d.p, { k: 'road', cells: d.cells.slice(), cost: costOf('road') }); dirty = true; scheduleSave(); say(d.p, '🛤️ 도로 ' + d.cells.length + '칸을 놓았어요'); }
        else if (!cancelled && !d.moved) showInfo(d.p, 'road');
        else if (!cancelled && d.reason) warn(d.p, d.reason);
      } else if (d.kind === 'bmove') {
        if (cancelled) return;
        updateGhost(d);
        if (d.overTray) { say(d.p, '옮기기를 취소했어요'); return; }
        if (d.gi === d.b.i && d.gj === d.b.j && d.grot === d.b.rot) return;
        var r2 = moveB(d.p, d.b, d.gi, d.gj, d.grot);
        if (r2) warn(d.p, r2);
      } else if (d.kind === 'bpend') {
        if (!cancelled && byId[d.b.id]) { setSel(d.p, { kind: 'b', id: d.b.id }); host.sound('select'); }
      } else if (d.kind === 'tap' && !cancelled && !d.moved) {
        if (d.what === 'road') { setSel(d.p, { kind: 'road', i: d.ci, j: d.cj }); host.sound('select'); }
        else if (d.what === 'forest') { setSel(d.p, { kind: 'forest', i: d.ci, j: d.cj }); host.sound('select'); }
        else setSel(d.p, null);
      }
    }

    /* ---------- 창: 시작, 미션, 성장, 도감, 역사 이야기 ---------- */
    function openModal(node, o) {
      o = o || {};
      var m = host.modal(node, { close: o.close !== false, cls: o.cls || 'wide', onClose: function () { myModals = myModals.filter(function (x) { return x !== m; }); if (o.onClose) o.onClose(); } });
      myModals.push(m);
      return m;
    }
    function startScreen() {
      var saved = null;
      try { saved = fromSave(host.load()); } catch (e) { saved = null; }
      var box = el('div', 'vg-start');
      box.appendChild(txt('h2', '', '🏘️ 백제마을 만들기'));
      box.appendChild(txt('p', 'vg-lead', '넓은 빈 땅에 손가락으로 건물을 끌어다 놓아 사비 시기 백제 마을을 함께 지어요. 주민이 살고, 농사짓고, 장을 보는 마을로 키워 「찬란한 사비 문화도시」를 만들어 보세요!'));
      var ul = el('ul', 'vg-notes');
      ['이 마을은 교육용 가상 재구성이에요. 실제 사비 도성을 정확히 복원한 것이 아니에요.', '건물 모양 대부분은 유적과 기록을 참고해 상상으로 그린 창작 재현이에요.', '식량·나무·흙·문화 점수는 게임을 위한 단순화로, 백제의 실제 경제를 그대로 나타내지 않아요.'].forEach(function (s) { ul.appendChild(txt('li', '', s)); });
      box.appendChild(ul);
      var row = el('div', 'vg-start-btns'), m;
      if (saved) {
        var b1 = el('button', 'big-btn primary vg-continue', '<span>▶ 이어서 하기<small>' + saved.stage + '단계 · 건물 ' + saved.bld.length + '채 · 미션 ' + Object.keys(saved.missions).length + '/6</small></span>');
        b1.addEventListener('click', function () { host.sound('select'); st = saved; m.close(); begin(true); });
        row.appendChild(b1);
      }
      var b2 = el('button', 'big-btn vg-newgame' + (saved ? '' : ' primary'), '<span>' + (saved ? '🌱 새 마을' : '▶ 마을 만들기 시작') + (saved ? '<small>저장된 마을 대신 처음부터</small>' : '') + '</span>');
      b2.addEventListener('click', function () { host.sound('select'); st = fresh(); m.close(); begin(false); });
      row.appendChild(b2);
      box.appendChild(row);
      m = openModal(box, { close: false, cls: 'wide' });
    }
    function begin(loaded) {
      started = true; simT = st.simT || 0;
      // 불러온 건물은 완성 상태로, 주민은 집 수만큼 미리 채운다
      dirty = true; derive(); terrDirty = true;
      if (loaded) {
        st.bld.forEach(function (b) { b.prog = 1; });
        derive();
        var guard = 0; while (residents.length < popCap && guard++ < 200) { var before = residents.length; syncResidents(); if (residents.length === before) break; }
        var n = nDone(), stars = n >= 6 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
        if (stars) host.award({ key: 'missions', stars: stars, silent: true });
        if (st.stage > 1) host.award({ key: 'growth', stars: st.stage - 1, silent: true });
        host.toast('🏘️ 저장된 마을을 불러왔어요!', { key: 'vg-load' });
      } else {
        host.toast('👇 아래 건물 카드를 끌어 빈 땅에 놓아 보세요!', { key: 'vg-hello', dur: 3600 });
      }
      trays.forEach(function (tr) { renderCards(tr); });
      rateCache = rates();
      checkAll(); updateHud(true); scheduleSave();
    }
    function showMissions() {
      var box = el('div', 'vg-mlist');
      box.appendChild(txt('h2', '', '🎯 마을 미션 (' + nDone() + '/6)'));
      MISSIONS.forEach(function (m, q) {
        var done = !!st.missions[m.id], pr = misProg(m.id);
        var it = el('div', 'vg-mitem' + (done ? ' done' : ''));
        it.appendChild(txt('div', 'vg-mno', done ? '✔' : String(q + 1)));
        var body = el('div');
        body.appendChild(txt('b', '', m.title));
        body.appendChild(txt('p', '', m.hint));
        var un = ORDER.filter(function (t) { return DEF[t].unlock === m.id; }).map(function (t) { return DEF[t].short; });
        if (un.length) body.appendChild(txt('p', 'vg-mun', '🔓 해결하면 열리는 건물: ' + un.join(', ')));
        if (!done) { var bar = el('div', 'vg-bar'); var f = el('i'); f.style.width = Math.round(Math.min(1, pr[0] / pr[1]) * 100) + '%'; bar.appendChild(f); body.appendChild(bar); }
        if (done && HIST[m.id]) { var hb = el('button', 'pill', '📜 역사 이야기 다시 보기'); hb.addEventListener('click', function () { host.sound('select'); showHist(m.id); }); body.appendChild(hb); }
        it.appendChild(body); box.appendChild(it);
      });
      openModal(box, { cls: 'wide' });
    }
    function showHist(mid) {
      if (!alive) return;
      var H = HIST[mid], box = el('div', 'vg-hist');
      box.appendChild(txt('h2', '', H.title));
      H.cards.forEach(function (id) {
        var c = host.card(id); if (!c) return;
        var it = el('div', 'vg-hcard');
        it.appendChild(txt('div', 'vg-hicon', c.icon || '📜'));
        var b = el('div'); b.appendChild(txt('h3', '', c.title)); b.appendChild(txt('p', '', c.text));
        if (c.note) b.appendChild(txt('p', 'vg-inote', '💡 ' + c.note));
        it.appendChild(b); box.appendChild(it);
      });
      box.appendChild(txt('p', 'vg-ask', '🤔 ' + H.ask));
      box.appendChild(txt('p', 'vg-small', '※ 게임 속 건물과 배치는 교육용 가상 재구성이에요.'));
      var res = host.award({ codex: H.cards, silent: true });
      if (res.newCodex && res.newCodex.length) box.appendChild(txt('p', 'vg-igot', '📚 역사 도감에 등록: ' + res.newCodex.map(function (c) { return c.title; }).join(', ')));
      host.sound('sparkle');
      openModal(box, { cls: 'wide' });
    }
    function showGrowth() {
      var box = el('div', 'vg-grow');
      box.appendChild(txt('h2', '', '🏘️ 마을 성장 단계'));
      STAGES.forEach(function (name, q) {
        var s = q + 1, it = el('div', 'vg-gitem' + (st.stage >= s ? ' done' : '') + (st.stage + 1 === s ? ' next' : ''));
        it.appendChild(txt('b', '', s + '단계 · ' + name));
        var rq = REQ[s];
        var need = rq ? ['주민 ' + Math.min(residents.length, rq.pop) + '/' + rq.pop + '명', '문화 점수 ' + Math.floor(Math.min(st.cult, rq.cult)) + '/' + rq.cult].concat(rq.mis ? ['미션 ' + Math.min(nDone(), rq.mis) + '/' + rq.mis] : []).concat(rq.palace ? ['궁궐 ' + ((doneCnt.palace || 0) ? '✔' : '아직')] : []) : ['처음 시작하는 마을'];
        it.appendChild(txt('span', '', (st.stage >= s ? '✔ ' : '') + need.join(' · ')));
        box.appendChild(it);
      });
      box.appendChild(txt('p', 'vg-small', '⭐ 2단계·3단계·4단계에 오르면 백제 탐험 별을 받아요. 4단계에서는 「찬란한 사비 건축가」 배지를 받아요. 문화 점수는 모은 전체 양으로 계산해요.'));
      openModal(box, { cls: 'wide' });
    }
    function showCodex() {
      var box = el('div', 'vg-codex');
      box.appendChild(txt('h2', '', '📚 백제 건축 도감'));
      box.appendChild(txt('p', 'vg-small', '처음 지은 건물은 체험관 「백제 역사 도감」에 등록돼요. 카드를 눌러 배운 내용을 다시 읽어 보세요.'));
      var grid = el('div', 'vg-cgrid'), detail = el('div', 'vg-cdetail');
      ORDER.forEach(function (t) {
        var d = DEF[t]; if (!d.card) return;
        var c = host.card(d.card), got = !!st.seen[t] || host.isUnlockedCard(d.card);
        var it = el('button', 'vg-citem' + (got ? '' : ' locked'));
        var icv = el('canvas'); it.appendChild(icv); drawIcon(icv, t, 0);
        it.appendChild(txt('b', '', got && c ? c.title : '???'));
        it.appendChild(txt('small', '', st.seen[t] ? '✔ 우리 마을에 지었어요' : got ? '도감에 있어요' : '지으면 열려요'));
        it.addEventListener('click', function () {
          host.sound(got ? 'select' : 'wrong');
          detail.innerHTML = '';
          if (!got || !c) { detail.appendChild(txt('p', '', '아직 짓지 않은 건물이에요. ' + d.short + '을(를) 지으면 볼 수 있어요.')); return; }
          detail.appendChild(txt('h3', '', (c.icon || '') + ' ' + c.title));
          detail.appendChild(txt('p', '', c.text));
          if (c.note) detail.appendChild(txt('p', 'vg-inote', '💡 ' + c.note));
          if (!c.note || c.note.indexOf('창작 재현') < 0) detail.appendChild(txt('p', 'vg-irow', '🛠️ ' + d.info));
          detail.appendChild(txt('p', 'vg-small', '📚 참고: ' + (c.source || '-')));
        });
        grid.appendChild(it);
      });
      box.appendChild(grid); box.appendChild(detail);
      openModal(box, { cls: 'wide' });
    }
    function showNotes() {
      var box = el('div', 'vg-hist');
      box.appendChild(txt('h2', '', 'ⓘ 이 게임에 대해 알아 두기'));
      [['🗺️ 교육용 가상 재구성', '지도와 마을은 사비 일대의 지형 관계(서쪽·남쪽의 백마강, 북쪽의 부소산, 동쪽의 나성)를 떠올리도록 만든 교육용 가상 재구성이에요. 실제 사비 도성을 정확히 복원한 것이 아니고, 거리와 크기도 실제와 달라요.'],
        ['🏗️ 창작 재현', '건물 모양 대부분은 유적과 기록을 참고해 상상으로 그린 창작 재현이에요. 시장의 정확한 위치는 아직 밝혀지지 않았고, 관북리 일대의 왕궁 터도 "추정"이에요.'],
        ['🍚 게임을 위한 단순화', '식량·나무·흙과 건축 재료·문화 점수, 생산량과 비용은 놀이를 위해 단순하게 만든 것으로 백제의 실제 경제를 그대로 나타내지 않아요.']].forEach(function (s) {
        var it = el('div', 'vg-hcard'); var b = el('div'); b.appendChild(txt('h3', '', s[0])); b.appendChild(txt('p', '', s[1])); it.appendChild(b); box.appendChild(it);
      });
      openModal(box, { cls: 'wide' });
    }

    /* ---------- 전경 감상 ---------- */
    function startView() {
      if (viewing) return;
      viewing = true; viewT = 0; viewBlend = 0;
      Object.keys(drags).forEach(function (id) { finish(drags[id], true); delete drags[id]; });
      sel.forEach(function (s, p) { setSel(p, null); });
      wrap.classList.add('vg-viewing');
      viewCap.innerHTML = '<b>' + st.stage + '단계 · ' + STAGES[st.stage - 1] + '</b><span>주민 ' + residents.length + '명 · 건물 ' + st.bld.length + '채 · 화면을 누르면 돌아가요</span>';
      host.sound('whoosh');
    }
    function stopView() { viewing = false; wrap.classList.remove('vg-viewing'); cam = { s: baseCam.s, x: baseCam.x, y: baseCam.y }; host.sound('tap'); placeActs(); }
    function viewCamera(dt) {
      viewT += dt; viewBlend = Math.min(1, viewBlend + dt / 1.6);
      // 처음에는 마을 전체를 보여 주고, 천천히 건물이 모인 곳으로 다가갔다가 멀어진다
      var full = fitCam(true), fx = 0, fy = 0, n = 0;
      st.bld.forEach(function (b) { var d = dims(b), w = P(b.i + d[0] / 2, b.j + d[1] / 2); fx += w[0]; fy += w[1]; n++; });
      if (n) { fx /= n; fy /= n; } else fy = N * HH;
      var z = 1 + 0.38 * (0.5 - 0.5 * Math.cos(viewT * 0.22)), zf = (z - 1) / 0.38;
      var ex = fx * zf * 0.8 + Math.sin(viewT * 0.13) * 120 * zf, ey = N * HH + (fy - N * HH) * zf * 0.8 + Math.sin(viewT * 0.19) * 50 * zf;
      var ts = full.s * z, tx = 960 - ex * ts, ty = 552 - ey * ts;
      var e = viewBlend * viewBlend * (3 - 2 * viewBlend);
      cam.s = baseCam.s + (ts - baseCam.s) * e; cam.x = baseCam.x + (tx - baseCam.x) * e; cam.y = baseCam.y + (ty - baseCam.y) * e;
    }

    /* ---------- HUD ---------- */
    function setText(key, node, v) { if (hudCache[key] !== v) { hudCache[key] = v; node.innerHTML = v; } }
    function updateHud(force) {
      if (force) hudCache = {};
      var cp = cap();
      RES.forEach(function (r) {
        var row = hudRes.querySelector('.vg-r-' + r[0]), v = Math.floor(st.res[r[0]]), rt = r1(rateCache[r[0]] || 0);
        setText(r[0] + 'v', row.querySelector('b'), String(v));
        var full = r[0] !== 'culture' && v >= cp;
        setText(r[0] + 'r', row.querySelector('small'), full ? '가득' : (rt >= 0 ? '+' : '') + rt);
        row.classList.toggle('full', full);
        row.classList.toggle('neg', rt < 0);
      });
      hudRes.classList.toggle('hungry', hungry);
      setText('stage', hudStage, '<b>🏘️ ' + st.stage + '단계</b><span>' + STAGES[st.stage - 1] + '</span><em>👥 ' + residents.length + '/' + popCap + '명 · ⭐ ' + score() + '점</em><i class="vg-bar"><u style="width:' + Math.round(stageFrac() * 100) + '%"></u></i>');
      var cur = MISSIONS.filter(function (m) { return !st.missions[m.id]; })[0];
      var dots = MISSIONS.map(function (m, q) { return '<i class="' + (st.missions[m.id] ? 'ok' : m === cur ? 'cur' : '') + '">' + (st.missions[m.id] ? '✔' : q + 1) + '</i>'; }).join('');
      var pr = cur ? misProg(cur.id) : [1, 1];
      setText('mis', misBox, '<b>🎯 미션 ' + nDone() + '/6</b>' + (cur ? '<span>' + misNo(cur.id) + '. ' + cur.title + '</span><i class="vg-bar"><u style="width:' + Math.round(Math.min(1, pr[0] / pr[1]) * 100) + '%"></u></i>' : '<span>모든 미션을 해결했어요! 🎉</span>') + '<div class="vg-dots">' + dots + '</div>');
    }

    /* ---------- 갱신 ---------- */
    function update(dt) {
      // 화면 배율이 바뀌면 캔버스 선명도를 다시 맞춘다
      scaleAcc += dt;
      if (scaleAcc > 1) { scaleAcc = 0; var key = (host.scale ? host.scale() : 1) + ':' + (window.devicePixelRatio || 1); if (key !== lastScaleKey) setupCanvas(); }
      trays.forEach(function (tr) {
        if (tr.infoT > 0) { tr.infoT -= dt; if (tr.infoT <= 0) tr.info.classList.add('hidden'); }
        if (tr.msgT > 0) { tr.msgT -= dt; if (tr.msgT <= 0) tr.msg.classList.add('hidden'); }
        if (tr.flash > 0) { tr.flash -= dt; tr.el.classList.toggle('vg-flash', tr.flash > 0); }
      });
      if (viewing) viewCamera(dt);
      var frozen = hubPaused || !started || myModals.length > 0;
      if (dirty && st) derive();
      if (!frozen) {
        simT += dt; st.simT = simT;
        st.bld.forEach(function (b) {
          if (b.prog < 1) { b.prog = Math.min(1, b.prog + dt / 1.6); if (b.prog >= 1) { b.pop = 1; dirty = true; host.sound('sparkle'); var d = dims(b), w = P(b.i + d[0] / 2, b.j + d[1] / 2); for (var s = 0; s < 10; s++) parts.push({ x: w[0] + (Math.random() - .5) * 50, y: w[1] - 30 - Math.random() * 30, vx: (Math.random() - .5) * 30, vy: -30, life: .8, max: .8, r: 3, col: '#ffe28a' }); } }
          if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 2);
        });
        tickAcc += dt; if (tickAcc >= TICK) { tickAcc -= TICK; tick(); }
        spawnAcc += dt; if (spawnAcc >= DF.spawn) { spawnAcc = 0; syncResidents(); }
        checkAcc += dt; if (checkAcc >= 0.5) { checkAcc = 0; rateCache = rates(); checkAll(); }
        residents.forEach(function (r) { stepRes(r, dt); });
        smokeAcc += dt;
        if (smokeAcc > 0.35) {
          smokeAcc = 0;
          st.bld.forEach(function (b) {
            if (b.prog < 1 || (b.t !== 'kiln' && b.t !== 'smithy')) return;
            var off = b.t === 'kiln' ? Pz(1.52, .82, 26) : Pz(.88, .83, 44), n = P(b.i, b.j), sx = b.rot ? -off[0] : off[0];
            parts.push({ x: n[0] + sx, y: n[1] + off[1], vx: 6 + Math.random() * 6, vy: -18 - Math.random() * 8, life: 2.2, max: 2.2, r: 4, col: 'rgba(200,200,200,.8)', grow: 5 });
          });
        }
        for (var q = laters.length - 1; q >= 0; q--) { laters[q].t -= dt; if (laters[q].t <= 0) { var f = laters[q].fn; laters.splice(q, 1); f(); } }
      }
      // 입자는 멈춤 중에도 자연스럽게 사라지게 둔다
      for (var p2 = parts.length - 1; p2 >= 0; p2--) {
        var pp = parts[p2]; pp.life -= dt; if (pp.life <= 0) { parts.splice(p2, 1); continue; }
        pp.x += pp.vx * dt; pp.y += pp.vy * dt; if (pp.grav) pp.vy += pp.grav * dt; if (pp.grow) pp.r += pp.grow * dt;
      }
      if (parts.length > 400) parts.splice(0, parts.length - 400);
      for (var f2 = floats.length - 1; f2 >= 0; f2--) { floats[f2].life -= dt; if (floats[f2].life <= 0) floats.splice(f2, 1); }
      hudAcc += dt; if (hudAcc > 0.25 && st) { hudAcc = 0; updateHud(); refreshCards(); }
      if (sel.some(Boolean)) placeActs();
      if (st && started) {
        if (saveSoon > 0) { saveSoon -= dt; if (saveSoon <= 0) saveNow(false); }
        if (!frozen) { autoAcc += dt; if (autoAcc > 20) saveNow(false); }
      }
    }
    function frame(now) {
      if (!alive) return;
      raf = window.requestAnimationFrame(frame);
      frames++;
      var dt = Math.min(0.1, Math.max(0, (now - (last || now)) / 1000)); last = now;
      try { if (st) { update(dt); render(now / 1000); } } catch (e) { host.error(e); }
    }

    /* ---------- 시작 ---------- */
    Sound.define('vg-chop', function (a) { a.noise(0.06, { freq: 900, filter: 'bandpass', q: 2, gain: 0.25 }); a.noise(0.06, { freq: 700, filter: 'bandpass', q: 2, gain: 0.22, delay: 0.14 }); a.tone(180, 0.2, { type: 'triangle', gain: 0.12, delay: 0.3, slide: 90 }); });
    st = fresh();
    setupCanvas();
    baseCam = fitCam(false); cam = { s: baseCam.s, x: baseCam.x, y: baseCam.y };
    for (var p1 = 0; p1 < NP; p1++) buildTray(p1);
    derive();
    updateHud(true);
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onCancel);
    wrap.addEventListener('lostpointercapture', onCancel);
    wrap.addEventListener('contextmenu', prevent);
    function prevent(e) { e.preventDefault(); }
    btnSave.addEventListener('click', function () { saveNow(true); });
    btnView.addEventListener('click', function () { startView(); });
    btnCodex.addEventListener('click', function () { host.sound('select'); showCodex(); });
    misBox.addEventListener('click', function () { host.sound('select'); showMissions(); });
    hudStage.addEventListener('click', function () { host.sound('select'); showGrowth(); });
    noteBox.addEventListener('click', function () { host.sound('select'); showNotes(); });
    raf = window.requestAnimationFrame(frame);
    startScreen();

    function unmount() {
      if (!alive) return;
      try { if (started) saveNow(false); } catch (e) { /* 저장 실패는 무시 */ }
      alive = false;
      window.cancelAnimationFrame(raf);
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('pointercancel', onCancel);
      wrap.removeEventListener('lostpointercapture', onCancel);
      wrap.removeEventListener('contextmenu', prevent);
      myModals.slice().forEach(function (m) { try { m.close(); } catch (e) { /* 이미 닫힘 */ } });
      drags = {}; laters = []; residents = []; parts = [];
    }

    return {
      unmount: unmount,
      pause: function () { hubPaused = true; },
      resume: function () { hubPaused = false; last = 0; },
      debug: {
        state: function () { return st; },
        summary: function () {
          return { res: { food: r1(st.res.food), wood: r1(st.res.wood), clay: r1(st.res.clay), culture: r1(st.res.culture) }, cult: r1(st.cult), stage: st.stage, missions: nDone(), missionIds: Object.keys(st.missions), pop: residents.length, popCap: popCap,
            bld: st.bld.length, types: st.bld.map(function (b) { return b.t + '@' + b.i + ',' + b.j + (b.rot ? 'r' : '') + (b.prog < 1 ? '…' : '') + (b.conn ? '' : '×'); }).join(' '), roads: st.road.reduce(function (a, b) { return a + b; }, 0),
            started: started, frozen: hubPaused || !started || myModals.length > 0, viewing: viewing, frames: frames, alive: alive, simT: r1(simT), hungry: hungry, rates: rateCache, foodMade: r1(st.foodMade), undo: undos.map(function (u) { return u.length; }) };
        },
        // 무대 좌표 → 화면(client) 좌표: mapPoint 의 역변환 (확대·축소·180° 회전 모두 반영)
        cell: function (i, j) {
          var c = scr(i + .5, j + .5), a = host.mapPoint(0, 0), b = host.mapPoint(1000, 1000);
          return { x: Math.round(c[0] - a.x) * 1000 / (b.x - a.x) | 0, y: Math.round(c[1] - a.y) * 1000 / (b.y - a.y) | 0 };
        },
        cellAt: function (x, y) { var c = cellAt(x, y); return [c.i, c.j]; },
        card: function (p, t) {
          var tr = trays[p], gi = GROUPS.map(function (gr) { return gr[0]; }).indexOf(DEF[t].group);
          if (tr.group !== gi) { tr.group = gi; tr.page = 0; renderCards(tr); }
          var c = tr.cards.querySelector('.vg-card[data-t="' + t + '"]');
          if (!c) { tr.page = (tr.page + 1) % Math.ceil(listOf(gi).length / tr.per); renderCards(tr); c = tr.cards.querySelector('.vg-card[data-t="' + t + '"]'); }
          var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        },
        check: function (t, i, j, rot) { return check(t, i, j, rot | 0, 0, true).reason || 'OK'; },
        place: function (t, i, j, rot, p) { var r = build(p | 0, t, i, j, rot | 0); return r || 'OK'; },
        finishAll: function () { st.bld.forEach(function (b) { b.prog = 1; }); dirty = true; derive(); return true; },
        tick: function (n) { for (var q = 0; q < (n || 1); q++) tick(); rateCache = rates(); checkAll(); return nDone(); },
        give: function (o) { Object.keys(o).forEach(function (k2) { st.res[k2] = (st.res[k2] || 0) + o[k2]; }); refreshCards(); return true; },
        spawnAll: function () { var g2 = 0; while (residents.length < popCap && g2++ < 200) { var b0 = residents.length; syncResidents(); if (residents.length === b0) break; } checkAll(); return residents.length; },
        residents: function () { return residents.map(function (r) { return { x: r1(r.x), y: r1(r.y), moving: !!r.moving, onRoad: !!st.road[r.cell], bub: r.bt > 0 ? r.bub : '' }; }); },
        undo: function (p) { return undo(p | 0); },
        select: function (p, i, j) { var q = idx(i, j); if (occ[q]) setSel(p, { kind: 'b', id: occ[q] }); else if (st.terr[q] === 'f') setSel(p, { kind: 'forest', i: i, j: j }); else if (st.road[q]) setSel(p, { kind: 'road', i: i, j: j }); return !!sel[p]; },
        drags: function () { return Object.keys(drags).map(function (id) { var d = drags[id]; return { id: +id, p: d.p, kind: d.kind, t: d.t, ok: d.chk ? d.chk.ok : null, reason: d.chk ? d.chk.reason : d.reason || '', overTray: d.overTray }; }); },
        view: function (on) { if (on) startView(); else if (viewing) stopView(); return viewing; },
        save: function () { return saveNow(false); },
        terr: function (i, j) { var q = idx(i, j); return st.terr[q] + (st.road[q] ? '+road' : '') + (MAP.z[q] ? '[' + MAP.z[q] + ']' : '') + (occ[q] ? '#' + occ[q] : ''); },
        map: function () { var s = ''; for (var j = 0; j < N; j++) { for (var i = 0; i < N; i++) { var q = idx(i, j); s += occ[q] ? 'B' : st.road[q] ? '=' : st.terr[q]; } s += '\n'; } return s; },
        ptr: function (type, id, x, y) {
          var t = document.elementFromPoint(x, y) || cv;
          t.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1 }));
          return t.className || t.tagName;
        }
      }
    };
  }

  if (window.BaekjeHub) BaekjeHub.register({ id: 'village', notice: NOTICE, mount: mount });
})();
