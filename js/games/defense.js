/* 부소산을 막아라! — 협동 전략 방어 게임 (교육용 가상 시뮬레이션)
 * 자체 제작 Canvas 그림, 고정 시간 간격 시뮬레이션, Pointer Events 멀티터치.
 * 적은 귀여운 캐릭터이며 저지되면 연기와 함께 후퇴한다(폭력 표현 없음). */
(function () {
  'use strict';

  var W = 1920, H = 1080, STEP = 1 / 60;
  var FONT = '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  var ROLE_NAME = { wall: '성벽 관리', tower: '방어시설 관리', supply: '보급 관리', scout: '정찰 및 전략' };
  var ROLE_CARDS = { wall: ['wall'], tower: ['tower'], supply: ['depot'], scout: ['watch'] };
  var ROLE_MAP = {
    1: [['wall', 'tower', 'supply', 'scout']],
    2: [['wall', 'supply'], ['tower', 'scout']],
    3: [['wall', 'supply'], ['tower'], ['scout']],
    4: [['wall'], ['tower'], ['supply'], ['scout']]
  };
  var DIFF = {
    easy: { count: 0.75, hp: 0.8, res: 1.3, prep: 1.3, name: '쉬움' },
    normal: { count: 1, hp: 1, res: 1, prep: 1, name: '보통' },
    hard: { count: 1.15, hp: 1.15, res: 0.85, prep: 0.8, name: '어려움' }
  };
  var ENEMY_ORDER = ['inf', 'shield', 'scout', 'siege'];
  var FAC_ORDER = ['tower', 'wall', 'watch', 'depot'];
  var ZOOMS = [1, 1.35, 1.7];
  var NODE_POS = [[330, 640], [680, 440], [1070, 700], [1340, 440], [1620, 610]];

  /* ---------------- 작은 도구 ---------------- */
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
  function star(g, x, y, r, col) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(120,80,10,.7)'; g.lineWidth = 1.2; g.stroke();
  }
  function pips(g, lvl, x, y) { for (var i = 0; i < lvl; i++) star(g, x + (i - (lvl - 1) / 2) * 15, y, 6.5, '#f7cf3a'); }
  function label(g, t, x, y, size, col, bg) {
    g.font = 'bold ' + size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (bg) { var w = g.measureText(t).width + 22; g.fillStyle = bg; rr(g, x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.6); g.fill(); }
    g.fillStyle = col || '#3a2412'; g.fillText(t, x, y + 1);
  }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

  /* ---------------- 경로(꺾은선) ---------------- */
  function mkPath(name, def) {
    var pts = def.pts, segs = [], L = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1], l = dist(ax, ay, bx, by);
      segs.push({ ax: ax, ay: ay, bx: bx, by: by, l: l, s0: L, ux: (bx - ax) / l, uy: (by - ay) / l });
      L += l;
    }
    return { name: name, label: def.name, to: def.to || 'gate', pts: pts, segs: segs, len: L };
  }
  function posAt(P, s) {
    s = clamp(s, 0, P.len);
    var sg = P.segs[P.segs.length - 1];
    for (var i = 0; i < P.segs.length; i++) if (s <= P.segs[i].s0 + P.segs[i].l) { sg = P.segs[i]; break; }
    var k = s - sg.s0;
    return { x: sg.ax + sg.ux * k, y: sg.ay + sg.uy * k, ux: sg.ux, uy: sg.uy };
  }
  function project(P, x, y) {
    var best = { s: 0, d: 1e9 };
    P.segs.forEach(function (sg) {
      var t = clamp((x - sg.ax) * sg.ux + (y - sg.ay) * sg.uy, 0, sg.l);
      var d = dist(x, y, sg.ax + sg.ux * t, sg.ay + sg.uy * t);
      if (d < best.d) best = { s: sg.s0 + t, d: d };
    });
    return best;
  }

  /* ---------------- 그림: 시설 ---------------- */
  function shadow(g, w, y) { g.fillStyle = 'rgba(40,30,10,.22)'; g.beginPath(); g.ellipse(0, y || 20, w, w * 0.33, 0, 0, 7); g.fill(); }
  function drawTower(g, x, y, lvl, col) {
    g.save(); g.translate(x, y);
    shadow(g, 36);
    g.fillStyle = lvl >= 3 ? '#a99677' : '#c4b08e'; rr(g, -32, -4, 64, 26, 9); g.fill();
    g.strokeStyle = '#7d6a4c'; g.lineWidth = 2.5; g.stroke();
    g.strokeStyle = 'rgba(90,70,40,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-32, 8); g.lineTo(32, 8); g.moveTo(-10, -4); g.lineTo(-10, 8); g.moveTo(12, 8); g.lineTo(12, 22); g.stroke();
    g.fillStyle = '#8a5a2b'; g.fillRect(-25, -42, 7, 40); g.fillRect(18, -42, 7, 40);
    g.fillStyle = '#b07a42'; rr(g, -30, -12, 60, 10, 4); g.fill();
    // 귀여운 궁수 (주인 색 투구)
    g.fillStyle = '#f6d7b0'; circle(g, 0, -24, 10); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(0, -27, 10.8, Math.PI, 0); g.fill();
    g.fillStyle = '#3a2412'; circle(g, -3.5, -23, 1.7); g.fill(); circle(g, 3.5, -23, 1.7); g.fill();
    g.fillStyle = 'rgba(232,85,62,.35)'; circle(g, -6.5, -19.5, 2.3); g.fill(); circle(g, 6.5, -19.5, 2.3); g.fill();
    g.strokeStyle = '#6b4423'; g.lineWidth = 2.5; g.beginPath(); g.arc(12, -20, 9, -1.2, 1.2); g.stroke();
    // 기와 지붕
    g.fillStyle = lvl >= 2 ? '#4a5060' : '#626878';
    g.beginPath(); g.moveTo(-42, -38); g.quadraticCurveTo(-22, -44, -13, -62); g.lineTo(13, -62); g.quadraticCurveTo(22, -44, 42, -38); g.quadraticCurveTo(0, -48, -42, -38); g.fill();
    g.fillStyle = '#3c404d'; g.fillRect(-15, -65, 30, 5);
    if (lvl >= 3) { g.fillStyle = '#e8b84a'; g.fillRect(-15, -65, 30, 2); }
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -65); g.lineTo(0, -90); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(0, -90); g.lineTo(22, -83); g.lineTo(0, -76); g.fill();
    pips(g, lvl, 0, 32);
    g.restore();
  }
  function drawWatch(g, x, y, lvl, col, t) {
    g.save(); g.translate(x, y);
    shadow(g, 30);
    g.strokeStyle = '#7a4c24'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-20, 18); g.lineTo(-12, -50); g.moveTo(20, 18); g.lineTo(12, -50); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(-18, 2); g.lineTo(14, -30); g.moveTo(18, 2); g.lineTo(-14, -30); g.stroke();
    g.fillStyle = '#c99257'; rr(g, -22, -78, 44, 30, 6); g.fill(); g.strokeStyle = '#7a4c24'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#4a3420'; rr(g, -15, -73, 30, 16, 4); g.fill();
    var gl = g.createRadialGradient(8, -65, 1, 8, -65, 18); gl.addColorStop(0, 'rgba(255,230,120,.95)'); gl.addColorStop(1, 'rgba(255,230,120,0)');
    g.fillStyle = gl; circle(g, 8, -65, 18); g.fill();
    g.fillStyle = '#f6d7b0'; circle(g, -5, -66, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(-5, -68, 7.5, Math.PI, 0); g.fill();
    g.fillStyle = '#3a2412'; circle(g, -3, -65, 1.4); g.fill();
    g.fillStyle = '#8a6a3a'; g.save(); g.translate(1, -66); g.rotate(-0.25 + Math.sin((t || 0) * 1.5) * 0.15); g.fillRect(0, -2.5, 15, 5); g.restore();
    g.fillStyle = lvl >= 2 ? '#4a5060' : '#626878';
    g.beginPath(); g.moveTo(-32, -76); g.quadraticCurveTo(-10, -86, 0, -102); g.quadraticCurveTo(10, -86, 32, -76); g.closePath(); g.fill();
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -102); g.lineTo(0, -122); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(0, -122); g.lineTo(20, -116); g.lineTo(0, -110); g.fill();
    pips(g, lvl, 0, 32);
    g.restore();
  }
  function drawDepot(g, x, y, lvl, col) {
    g.save(); g.translate(x, y);
    shadow(g, 40);
    g.fillStyle = '#e2c69a'; rr(g, -30, -30, 60, 46, 6); g.fill(); g.strokeStyle = '#9a7a4a'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = col; rr(g, -9, -12, 18, 28, 4); g.fill();
    g.fillStyle = lvl >= 2 ? '#b98a2e' : '#d4ab4c';
    g.beginPath(); g.moveTo(-40, -24); g.lineTo(0, -60); g.lineTo(40, -24); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(110,80,20,.5)'; g.lineWidth = 1.5;
    for (var i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 4, -56); g.lineTo(i * 11, -26); g.stroke(); }
    var sacks = [[-34, 12], [34, 12], [-25, 20]];
    if (lvl >= 2) sacks.push([25, 20]);
    if (lvl >= 3) sacks.push([0, 26]);
    sacks.forEach(function (s) {
      g.fillStyle = '#f2e6c8'; g.beginPath(); g.ellipse(s[0], s[1], 10, 9, 0, 0, 7); g.fill(); g.strokeStyle = '#b39a6a'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#b39a6a'; g.fillRect(s[0] - 3, s[1] - 10, 6, 3);
    });
    pips(g, lvl, 0, 40);
    g.restore();
  }
  // 성벽: 길을 가로지르는 돌 블록 (위에서 본 모습 + 높이)
  function drawWall(g, x, y, ang, lvl, frac, broken, col, icon) {
    if (broken) {
      g.save(); g.translate(x, y);
      [[-26, 4, 10], [-10, 8, 12], [8, 2, 11], [24, 7, 9], [-2, -6, 9], [16, -6, 7], [-20, -6, 7]].forEach(function (r) {
        g.fillStyle = '#b3a283'; circle(g, r[0], r[1], r[2]); g.fill(); g.strokeStyle = '#7d6a4c'; g.lineWidth = 2; g.stroke();
      });
      g.fillStyle = 'rgba(255,255,255,.92)'; circle(g, 0, -30, 17); g.fill(); g.strokeStyle = col; g.lineWidth = 3.5; g.stroke();
      g.font = '20px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText('🔧', 0, -29);
      g.restore(); return;
    }
    var L = 46, T = 15, h = 14 + lvl * 5;
    var cx = Math.cos(ang), sy = Math.sin(ang), nx = -sy, ny = cx;
    function pt(a, b, dz) { return [x + cx * a + nx * b, y + sy * a + ny * b - dz]; }
    var c = [pt(-L, -T, 0), pt(L, -T, 0), pt(L, T, 0), pt(-L, T, 0)];
    var top = [pt(-L, -T, h), pt(L, -T, h), pt(L, T, h), pt(-L, T, h)];
    var side = lvl >= 3 ? '#8f7d5e' : lvl >= 2 ? '#a08c6a' : '#ab9876';
    var face = lvl >= 3 ? '#b8a37e' : lvl >= 2 ? '#c6b28e' : '#d3c19f';
    g.fillStyle = 'rgba(40,30,10,.22)'; g.beginPath(); g.ellipse(x, y + 6, L + 8, T + 10, ang, 0, 7); g.fill();
    for (var i = 0; i < 4; i++) {
      var a = c[i], b = c[(i + 1) % 4];
      // 화면 아래를 향한 면만 그린다
      var ex = b[0] - a[0], ey = b[1] - a[1], ox = ey, oy = -ex;
      var mx = (a[0] + b[0]) / 2 - x, my = (a[1] + b[1]) / 2 - y;
      if (ox * mx + oy * my < 0) { ox = -ox; oy = -oy; }
      if (oy <= 0) continue;
      g.fillStyle = side; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(b[0], b[1] - h); g.lineTo(a[0], a[1] - h); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(70,55,30,.6)'; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = 'rgba(70,55,30,.35)';
      for (var k = 1; k < 4; k++) { var t = k / 4; g.beginPath(); g.moveTo(a[0] + ex * t, a[1] + ey * t - (k % 2 ? 0 : h / 2)); g.lineTo(a[0] + ex * t, a[1] + ey * t - (k % 2 ? h / 2 : h)); g.stroke(); }
      g.beginPath(); g.moveTo(a[0], a[1] - h / 2); g.lineTo(b[0], b[1] - h / 2); g.stroke();
    }
    g.fillStyle = face; g.beginPath(); g.moveTo(top[0][0], top[0][1]); for (i = 1; i < 4; i++) g.lineTo(top[i][0], top[i][1]); g.closePath(); g.fill();
    g.strokeStyle = '#7d6a4c'; g.lineWidth = 2; g.stroke();
    // 여장(작은 돌 턱)
    for (i = -2; i <= 2; i++) {
      var m = pt(i * 19, -T + 4, h + 5);
      g.fillStyle = side; g.fillRect(m[0] - 5, m[1], 10, 6); g.fillStyle = face; g.fillRect(m[0] - 5, m[1] - 4, 10, 5);
    }
    if (frac < 0.6) {
      g.strokeStyle = 'rgba(60,40,20,.8)'; g.lineWidth = 2;
      var p0 = pt(-14, -6, h), p1 = pt(-4, 4, h), p2 = pt(6, -3, h), p3 = pt(14, 6, h);
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.stroke();
      if (frac < 0.3) { var q0 = pt(24, -8, h), q1 = pt(30, 6, 4); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); }
    }
    // 주인 색 깃발
    var f = pt(L - 4, 0, h);
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(f[0], f[1] - 26); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(f[0], f[1] - 26); g.lineTo(f[0] + 16, f[1] - 21); g.lineTo(f[0], f[1] - 15); g.fill();
    if (!icon) {
      pips(g, lvl, x, y + T + 18);
      if (frac < 1) hpBar(g, x, y - h - 26, 56, frac);
    }
  }
  function hpBar(g, x, y, w, frac) {
    g.fillStyle = 'rgba(40,25,10,.75)'; rr(g, x - w / 2 - 2, y - 2, w + 4, 11, 5); g.fill();
    g.fillStyle = frac > 0.6 ? '#6cc04a' : frac > 0.3 ? '#f2c230' : '#ec6a4a';
    rr(g, x - w / 2, y, Math.max(3, w * frac), 7, 3.5); g.fill();
  }
  function drawFacIcon(g, type, cx, cy, s, col) {
    g.save(); g.translate(cx, cy); g.scale(s, s);
    if (type === 'tower') drawTower(g, 0, 0, 1, col);
    else if (type === 'watch') drawWatch(g, 0, 10, 1, col, 0);
    else if (type === 'depot') drawDepot(g, 0, 0, 1, col);
    else drawWall(g, 0, 0, 0, 1, 1, false, col, true);
    g.restore();
  }

  /* ---------------- 그림: 적 (귀여운 캐릭터) ---------------- */
  function drawEnemy(g, type, x, y, dir, t, o) {
    o = o || {};
    g.save(); g.translate(x, y);
    if (o.alpha != null) g.globalAlpha = o.alpha;
    var bob = o.still ? 0 : Math.sin(t * 12) * 2;
    if (o.shake) g.translate(Math.sin(t * 40) * 1.6, 0);
    g.fillStyle = 'rgba(40,30,10,.2)'; g.beginPath(); g.ellipse(0, 16, type === 'siege' ? 32 : 14, 5, 0, 0, 7); g.fill();
    g.scale(dir < 0 ? -1 : 1, 1);
    if (type === 'siege') {
      g.translate(0, bob * 0.3);
      g.fillStyle = '#9a6a3a'; rr(g, -28, -18, 52, 26, 6); g.fill(); g.strokeStyle = '#6b4423'; g.lineWidth = 2.5; g.stroke();
      g.strokeStyle = 'rgba(70,40,15,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-28, -5); g.lineTo(24, -5); g.stroke();
      g.fillStyle = '#c08a4a'; rr(g, -10, -26, 52, 12, 6); g.fill(); g.strokeStyle = '#6b4423'; g.stroke();
      // 통나무 앞쪽의 웃는 얼굴
      g.fillStyle = '#e0b070'; circle(g, 42, -20, 7.5); g.fill(); g.stroke();
      g.fillStyle = '#3a2412'; circle(g, 40, -22, 1.2); g.fill(); circle(g, 44.5, -22, 1.2); g.fill();
      g.strokeStyle = '#3a2412'; g.lineWidth = 1.2; g.beginPath(); g.arc(42, -19, 2.5, 0.2, Math.PI - 0.2); g.stroke();
      [[-16, 10], [14, 10]].forEach(function (w) {
        g.save(); g.translate(w[0], w[1]); g.rotate(o.still ? 0 : t * 4);
        g.fillStyle = '#6b4423'; circle(g, 0, 0, 9); g.fill(); g.strokeStyle = '#3a2412'; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.moveTo(0, -8); g.lineTo(0, 8); g.stroke();
        g.restore();
      });
      // 뒤에서 미는 꼬마
      g.fillStyle = '#5f7fa3'; g.beginPath(); g.ellipse(-36, 0, 8, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#f6d7b0'; circle(g, -36, -13, 7.5); g.fill();
      g.fillStyle = '#d9822b'; g.beginPath(); g.arc(-36, -15, 8, Math.PI, 0); g.fill();
      g.fillStyle = '#3a2412'; circle(g, -33, -13, 1.3); g.fill();
    } else {
      var sc = type === 'scout' ? 0.82 : 1;
      g.scale(sc, sc); g.translate(0, bob);
      var body = type === 'shield' ? '#56739a' : type === 'scout' ? '#5f9a6a' : '#6f8fb5';
      g.fillStyle = body; g.beginPath(); g.ellipse(0, 4, 12, 13, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(-4, 0, 4, 6, 0, 0, 7); g.fill();
      var lg = o.still ? 0 : Math.sin(t * 12) * 3;
      g.fillStyle = '#3d4b5f'; g.fillRect(-7 + lg, 13, 5, 5); g.fillRect(2 - lg, 13, 5, 5);
      g.fillStyle = '#f6d7b0'; circle(g, 0, -12, 11); g.fill();
      if (type === 'scout') {
        g.fillStyle = '#4c8a50'; g.beginPath(); g.arc(0, -14, 11.5, Math.PI, 0); g.fill();
        g.fillStyle = '#86c060'; g.beginPath(); g.ellipse(4, -27, 4, 7, 0.6, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2;
        if (!o.still) { g.beginPath(); g.moveTo(-16, 0); g.lineTo(-26, 0); g.moveTo(-15, 8); g.lineTo(-23, 8); g.stroke(); }
      } else {
        g.fillStyle = type === 'shield' ? '#9b7bc0' : '#d9822b';
        g.beginPath(); g.arc(0, -14, 11.8, Math.PI, 0); g.fill();
        g.fillStyle = '#f2c75c'; circle(g, 0, -26, 2.6); g.fill();
      }
      g.fillStyle = '#3a2412'; circle(g, 1, -11, 1.8); g.fill(); circle(g, 7, -11, 1.8); g.fill();
      g.fillStyle = 'rgba(232,85,62,.4)'; circle(g, -2, -7, 2.4); g.fill(); circle(g, 9, -7, 2.2); g.fill();
      if (type === 'shield') {
        g.fillStyle = '#c79a52'; circle(g, 12, 2, 12); g.fill(); g.strokeStyle = '#8c8c8c'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#e8d08a'; circle(g, 12, 2, 4); g.fill();
        g.strokeStyle = 'rgba(110,70,20,.5)'; g.lineWidth = 1.5; circle(g, 12, 2, 8); g.stroke();
      } else if (type === 'inf') {
        g.strokeStyle = '#7a4c24'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-9, 6); g.lineTo(-12, -30); g.stroke();
        g.fillStyle = o.white ? '#ffffff' : '#f0e2c0'; g.beginPath(); g.moveTo(-12, -30); g.lineTo(-26, -25); g.lineTo(-11, -20); g.fill();
      }
      if (o.white && type !== 'inf') {
        g.strokeStyle = '#7a4c24'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-9, 6); g.lineTo(-12, -30); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-12, -30); g.lineTo(-26, -25); g.lineTo(-11, -20); g.fill();
      }
      if (o.sweat) { g.fillStyle = '#8fd0ff'; g.beginPath(); g.ellipse(12, -20, 2.5, 4, 0, 0, 7); g.fill(); }
    }
    g.restore();
  }

  /* ---------------- 그림: 지형 ---------------- */
  function tree(g, x, y, s, k) {
    g.fillStyle = 'rgba(30,50,20,.22)'; g.beginPath(); g.ellipse(x + 3, y + 10 * s, 16 * s, 6 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#7a5530'; g.fillRect(x - 2.5 * s, y, 5 * s, 10 * s);
    g.fillStyle = k ? '#4f8a43' : '#5a9a4a'; circle(g, x, y - 6 * s, 15 * s); g.fill();
    g.fillStyle = k ? '#64a352' : '#73b45c'; circle(g, x - 4 * s, y - 10 * s, 9 * s); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)'; circle(g, x - 6 * s, y - 13 * s, 4 * s); g.fill();
  }
  function house(g, x, y, s, roof) {
    g.fillStyle = 'rgba(40,30,10,.2)'; g.beginPath(); g.ellipse(x, y + 12 * s, 24 * s, 7 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#efdcb4'; g.fillRect(x - 18 * s, y - 8 * s, 36 * s, 20 * s);
    g.fillStyle = '#8a5a2b'; g.fillRect(x - 4 * s, y + 1 * s, 8 * s, 11 * s);
    g.fillStyle = roof; g.beginPath(); g.moveTo(x - 26 * s, y - 6 * s); g.quadraticCurveTo(x - 10 * s, y - 12 * s, x - 8 * s, y - 22 * s);
    g.lineTo(x + 8 * s, y - 22 * s); g.quadraticCurveTo(x + 10 * s, y - 12 * s, x + 26 * s, y - 6 * s); g.closePath(); g.fill();
  }
  function blob(g, cx, cy, rx, ry, seed, wob) {
    var r = rng(seed), n = 40, off = [];
    for (var i = 0; i < 6; i++) off.push(r() * 6.28);
    g.beginPath();
    for (i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2, k = 1 + wob * (Math.sin(a * 3 + off[0]) * 0.5 + Math.sin(a * 5 + off[1]) * 0.3 + Math.sin(a * 7 + off[2]) * 0.2);
      g.lineTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    g.closePath();
  }
  var RIVER = [[430, 140], [340, 250], [270, 390], [245, 560], [250, 720], [290, 860], [350, 1000], [380, 1090]];
  function strokePoly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  function riverDist(x, y) { var P = mkPath('r', { pts: RIVER }); return project(P, x, y).d; }

  // 단계별 배경(지형·길·설치 지점)을 한 번만 그린다
  function renderBg(g, ctx) {
    var i, r = rng(11);
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#b4d686'); gr.addColorStop(1, '#a3cb78');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(60,100,30,.08)'; circle(g, r() * W, r() * H, 2 + r() * 5); g.fill(); }
    // 백마강
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#d9cfa0'; g.lineWidth = 128; strokePoly(g, RIVER);
    g.strokeStyle = '#78b4d8'; g.lineWidth = 104; strokePoly(g, RIVER);
    g.strokeStyle = '#94c8e6'; g.lineWidth = 60; strokePoly(g, RIVER);
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3;
    for (i = 0; i < 26; i++) { var rp = posAt(mkPath('r', { pts: RIVER }), r() * 1000); g.beginPath(); g.arc(rp.x + (r() - 0.5) * 50, rp.y, 9, 0.2, 1.5); g.stroke(); }
    label(g, '백마강', 268, 470, 30, '#1f5576', 'rgba(255,255,255,.7)');
    // 부소산 (산)
    g.fillStyle = '#8fbf6a'; blob(g, 900, 420, 340, 250, 3, 0.08); g.fill();
    g.fillStyle = '#7fb05c'; blob(g, 900, 405, 285, 205, 5, 0.07); g.fill();
    g.fillStyle = '#73a553'; blob(g, 910, 380, 200, 140, 8, 0.08); g.fill();
    g.fillStyle = '#679a49'; blob(g, 920, 360, 110, 75, 9, 0.1); g.fill();
    // 산 위 나무
    for (i = 0; i < 70; i++) {
      var a = r() * 6.28, d = 0.15 + r() * 0.8, tx = 900 + Math.cos(a) * 300 * d, ty = 410 + Math.sin(a) * 220 * d;
      var e = ((tx - 900) / 250) * ((tx - 900) / 250) + ((ty - 410) / 190) * ((ty - 410) / 190);
      if (Math.abs(e - 1) < 0.22 || ctx.near(tx, ty, 60)) continue;
      tree(g, tx, ty, 0.75 + r() * 0.3, r() < 0.5);
    }
    // 산성 성곽 (돌 고리, 아래쪽에 성문 자리)
    g.lineCap = 'butt';
    var a0 = Math.PI / 2 + 0.16, a1 = Math.PI / 2 - 0.16 + Math.PI * 2;
    g.strokeStyle = '#8c7a5c'; g.lineWidth = 24; g.beginPath(); g.ellipse(900, 410, 250, 190, 0, a0, a1); g.stroke();
    g.strokeStyle = '#cdbb98'; g.lineWidth = 17; g.beginPath(); g.ellipse(900, 410, 250, 190, 0, a0, a1); g.stroke();
    g.fillStyle = '#b6a27e';
    for (i = 0; i < 64; i++) {
      var aa = a0 + (a1 - a0) * i / 63;
      g.fillRect(900 + Math.cos(aa) * 250 - 4, 410 + Math.sin(aa) * 190 - 12, 8, 7);
    }
    // 산성 안 군창(창고)과 누각
    house(g, 840, 380, 1.3, '#c9a24a'); house(g, 890, 405, 1.1, '#c9a24a');
    label(g, '군창(창고)', 865, 440, 20, '#4a3418', 'rgba(255,248,225,.75)');
    house(g, 1000, 330, 1.5, '#4f5463');
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(1040, 300); g.lineTo(1040, 250); g.stroke();
    g.fillStyle = '#e8b84a'; g.beginPath(); g.moveTo(1040, 250); g.lineTo(1072, 260); g.lineTo(1040, 270); g.fill();
    label(g, '부소산성', 930, 270, 34, '#2e3d1c', 'rgba(255,255,255,.75)');
    // 숲
    for (i = 0; i < 520; i++) {
      var fx = 160 + r() * 1600, fy = 160 + r() * 760;
      var inForest = (fx > 1250 && fy < 520) || (fx > 1600 && fy < 760) || (fx < 640 && fy < 330 && fx > 420) || (fx > 1150 && fx < 1300 && fy < 300) || r() < 0.18;
      if (!inForest) continue;
      if (ctx.near(fx, fy, 58) || riverDist(fx, fy) < 75) continue;
      var ee = ((fx - 900) / 345) * ((fx - 900) / 345) + ((fy - 420) / 255) * ((fy - 420) / 255);
      if (ee < 1.05) continue;
      if (fy > 690 && fx > 380 && fx < 820) continue;
      tree(g, fx, fy, 0.9 + r() * 0.5, r() < 0.5);
    }
    // 사비 도성 마을
    for (i = 0; i < 60; i++) {
      var hx = 390 + r() * 420, hy = 720 + r() * 190;
      if (ctx.near(hx, hy, 52) || riverDist(hx, hy) < 85) continue;
      house(g, hx, hy, 0.85 + r() * 0.3, r() < 0.3 ? '#c9a24a' : '#5b5f6e');
    }
    label(g, '사비 도성', 560, 905, 24, '#4a3418', 'rgba(255,248,225,.8)');
    // 길
    g.lineCap = 'round'; g.lineJoin = 'round';
    ctx.paths.forEach(function (P) { g.strokeStyle = '#b8955f'; g.lineWidth = 64; strokePoly(g, P.pts); });
    ctx.paths.forEach(function (P) { g.strokeStyle = '#e8d3a0'; g.lineWidth = 52; strokePoly(g, P.pts); });
    ctx.paths.forEach(function (P) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 5; g.setLineDash([4, 18]); strokePoly(g, P.pts); g.setLineDash([]);
      // 강을 건너는 곳에는 나무다리
      for (var s = 0; s < P.len; s += 9) {
        var p = posAt(P, s);
        if (riverDist(p.x, p.y) < 58) {
          g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.uy, p.ux));
          g.fillStyle = s % 18 < 9 ? '#a87443' : '#946236'; g.fillRect(-4, -32, 8, 64);
          g.restore();
        }
      }
      // 출발 진영 (작은 천막)
      var st0 = P.pts[0], q = posAt(P, 0);
      var tx0 = clamp(st0[0] - q.uy * 70, 190, 1730), ty0 = clamp(st0[1] + q.ux * 70, 185, 900);
      g.fillStyle = '#e9e1cf'; g.beginPath(); g.moveTo(tx0 - 22, ty0 + 14); g.lineTo(tx0, ty0 - 18); g.lineTo(tx0 + 22, ty0 + 14); g.fill();
      g.strokeStyle = '#9c8a6a'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#6f8fb5'; g.beginPath(); g.moveTo(tx0 - 5, ty0 + 14); g.lineTo(tx0, ty0 - 4); g.lineTo(tx0 + 5, ty0 + 14); g.fill();
    });
    // 창고 (지켜야 할 곳)는 동적으로 그린다. 설치 지점
    ctx.spots.forEach(function (s) {
      g.fillStyle = 'rgba(255,250,230,.55)'; circle(g, s.x, s.y + 8, 40); g.fill();
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.setLineDash([8, 6]); circle(g, s.x, s.y + 8, 40); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(138,106,58,.55)'; g.fillRect(s.x - 10, s.y + 6, 20, 4); g.fillRect(s.x - 2, s.y - 2, 4, 20);
    });
    ctx.slots.forEach(function (s) {
      g.save(); g.translate(s.x, s.y); g.rotate(s.ang);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-50, -18, 100, 36);
      g.strokeStyle = '#7d5a2e'; g.lineWidth = 3; g.setLineDash([9, 6]); g.strokeRect(-50, -18, 100, 36); g.setLineDash([]);
      g.restore();
    });
  }

  function drawGate(g, x, y, frac, t, shake) {
    g.save(); g.translate(x + (shake > 0 ? Math.sin(t * 60) * 3 * shake : 0), y);
    g.fillStyle = 'rgba(40,30,10,.25)'; g.beginPath(); g.ellipse(0, 22, 92, 16, 0, 0, 7); g.fill();
    g.fillStyle = '#b9a88a'; rr(g, -88, -52, 40, 72, 6); g.fill(); rr(g, 48, -52, 40, 72, 6); g.fill();
    g.strokeStyle = '#7d6a4c'; g.lineWidth = 2.5; rr(g, -88, -52, 40, 72, 6); g.stroke(); rr(g, 48, -52, 40, 72, 6); g.stroke();
    g.fillStyle = '#c9b796'; g.fillRect(-50, -46, 100, 64);
    g.fillStyle = '#7a4a24'; g.beginPath(); g.moveTo(-34, 20); g.lineTo(-34, -18); g.quadraticCurveTo(0, -44, 34, -18); g.lineTo(34, 20); g.closePath(); g.fill();
    g.strokeStyle = '#4e2e14'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.moveTo(0, -31); g.lineTo(0, 20); g.stroke();
    g.fillStyle = '#e8c060';
    for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++) { circle(g, -18 + j * 36, -10 + i * 12, 2.5); g.fill(); }
    if (frac < 0.6) { g.strokeStyle = '#3a2412'; g.lineWidth = 2; g.beginPath(); g.moveTo(-20, -20); g.lineTo(-10, -6); g.lineTo(-16, 8); g.stroke(); }
    if (frac < 0.3) { g.beginPath(); g.moveTo(18, -16); g.lineTo(10, 0); g.lineTo(20, 14); g.stroke(); }
    g.fillStyle = '#4f5463';
    g.beginPath(); g.moveTo(-104, -46); g.quadraticCurveTo(-60, -56, -50, -84); g.lineTo(50, -84); g.quadraticCurveTo(60, -56, 104, -46); g.quadraticCurveTo(0, -62, -104, -46); g.fill();
    g.fillStyle = '#3c404d'; g.fillRect(-54, -88, 108, 7);
    g.fillStyle = '#e8b84a'; g.fillRect(-54, -88, 108, 2);
    [-70, 70].forEach(function (fx) {
      g.strokeStyle = '#5a3a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(fx, -52); g.lineTo(fx, -100); g.stroke();
      g.fillStyle = '#e8b84a'; g.beginPath(); g.moveTo(fx, -100); g.lineTo(fx + 24 * Math.cos(t * 3), -92); g.lineTo(fx, -84); g.fill();
    });
    g.restore();
    // 내구도 막대
    g.fillStyle = 'rgba(40,25,10,.8)'; rr(g, x - 80, y - 128, 160, 26, 13); g.fill();
    g.fillStyle = frac > 0.6 ? '#6cc04a' : frac > 0.3 ? '#f2c230' : '#ec6a4a';
    rr(g, x - 76, y - 124, Math.max(6, 152 * frac), 18, 9); g.fill();
    label(g, '성문 ' + Math.ceil(frac * 100), x, y - 115, 17, '#fff');
  }
  function drawStore(g, s, t) {
    g.save(); g.translate(s.x, s.y);
    g.fillStyle = 'rgba(40,30,10,.25)'; g.beginPath(); g.ellipse(0, 26, 70, 14, 0, 0, 7); g.fill();
    g.fillStyle = '#ecd8ae'; rr(g, -58, -24, 116, 50, 6); g.fill(); g.strokeStyle = '#9a7a4a'; g.lineWidth = 2.5; g.stroke();
    g.strokeStyle = 'rgba(120,90,40,.4)'; for (var i = -40; i <= 40; i += 20) { g.beginPath(); g.moveTo(i, -24); g.lineTo(i, 26); g.stroke(); }
    g.fillStyle = '#4f5463'; g.beginPath(); g.moveTo(-74, -18); g.quadraticCurveTo(-40, -30, -36, -52); g.lineTo(36, -52); g.quadraticCurveTo(40, -30, 74, -18); g.quadraticCurveTo(0, -30, -74, -18); g.fill();
    var n = Math.ceil(s.food / s.max * 6);
    for (i = 0; i < n; i++) {
      var sx = -50 + (i % 3) * 18 + (i >= 3 ? 64 : 0), sy = 32 - (i % 2) * 4;
      g.fillStyle = '#f2e6c8'; g.beginPath(); g.ellipse(sx + (i >= 3 ? 0 : -20), sy, 10, 9, 0, 0, 7); g.fill(); g.strokeStyle = '#b39a6a'; g.lineWidth = 1.5; g.stroke();
    }
    g.restore();
    hpBar(g, s.x, s.y - 72, 110, s.food / s.max);
    label(g, '🍚 ' + s.name + ' ' + Math.ceil(s.food), s.x, s.y - 88, 18, '#fff', 'rgba(80,50,20,.82)');
  }

  /* =============================================================== */
  function mount(root, host) {
    var D = host.data.defenseStages;
    root.classList.add('df-root');
    if (!D || !D.stages) { root.appendChild(el('div', 'df-error', '방어 게임 데이터(data/defenseStages.json)를 불러오지 못했어요.')); return { unmount: function () {}, pause: function () {}, resume: function () {} }; }
    var FAC = D.facilities, EN = D.enemies;
    var players = clamp((host.options.players | 0) || 1, 1, 4);
    var diffKey = DIFF[host.options.difficulty] ? host.options.difficulty : 'normal';
    var dm = DIFF[diffKey];
    var roles = ROLE_MAP[players];
    var PCOL = host.PCOL, PNAME = host.PNAME, SIDES = host.SIDES;
    var save = host.load() || {}; if (!save.best) save.best = {};
    function roleHolder(role) { for (var i = 0; i < roles.length; i++) if (roles[i].indexOf(role) >= 0) return i; return 0; }
    function cardOwner(type) { return roleHolder(type === 'tower' ? 'tower' : type === 'wall' ? 'wall' : type === 'depot' ? 'supply' : 'scout'); }
    var leader = roleHolder('scout');
    function who(role) { return players > 1 ? PNAME[roleHolder(role)] + ' 친구가 ' : ''; }

    Sound.define('df-up', function (a) { [523, 659, 784, 1046].forEach(function (f, i) { a.tone(f, 0.16, { type: 'triangle', gain: 0.12, delay: i * 0.06 }); }); });
    Sound.define('df-repair', function (a) { [0, 0.14, 0.28].forEach(function (d) { a.noise(0.06, { freq: 900, filter: 'bandpass', q: 2, gain: 0.2, delay: d }); }); a.tone(660, 0.2, { type: 'triangle', gain: 0.1, delay: 0.4 }); });
    Sound.define('df-crumble', function (a) { if (!a.throttle('df-crumble', 300)) return; a.noise(0.45, { freq: 260, gain: 0.28, attack: 0.02 }); });
    Sound.define('df-ready', function (a) { a.tone(740, 0.1, { type: 'triangle', gain: 0.14 }); a.tone(988, 0.16, { type: 'triangle', gain: 0.12, delay: 0.08 }); });

    var screen = 'select', G = null, dead = false, raf = 0, last = 0, acc = 0, frames = 0;
    var speed = 1, userPaused = false, hostPaused = false;
    var cam = { x: W / 2, y: H / 2, zi: 0, z: 1 };
    var ptrs = {}, bubbles = {}, hudRefs = null, resK = 1, bgCanvas = null, toastGap = {};

    var cv = el('canvas', 'df-canvas'); root.appendChild(cv);
    var g = cv.getContext('2d');
    var hud = el('div', 'df-hud'); root.appendChild(hud);
    var scr = el('div', 'df-screen'); root.appendChild(scr);
    function setupCanvas() {
      resK = clamp(host.scale() * (window.devicePixelRatio || 1), 0.5, 1.5);
      cv.width = Math.round(W * resK); cv.height = Math.round(H * resK);
    }
    setupCanvas();

    function toast(t, o) { o = o || {}; var k = o.key || t; var now = performance.now(); if (toastGap[k] && now - toastGap[k] < 1500) return; toastGap[k] = now; if (G && G.silent) return; host.toast(t, o); }
    function snd(n) { if (G && G.silent) return; host.sound(n); }

    /* ---------------- 단계 데이터 준비 ---------------- */
    function stageOf(n) { return D.stages.filter(function (s) { return s.id === n; })[0]; }
    function unlocked(n) { return n === 1 || !!host.options.unlockAll || !!save.best[n - 1]; }
    function buildCtx(st) {
      var paths = st.paths.map(function (k) { return mkPath(k, D.paths[k]); });
      var pmap = {}; paths.forEach(function (P) { pmap[P.name] = P; });
      var spots = st.spots.map(function (id) { return { id: id, x: D.spots[id][0], y: D.spots[id][1], kind: 'spot' }; });
      var slots = st.slots.map(function (id) {
        var x = D.slots[id][0], y = D.slots[id][1], on = [], ang = 0, best = 1e9;
        paths.forEach(function (P) {
          var pr = project(P, x, y);
          if (pr.d < 22) { on.push({ path: P.name, s: pr.s }); if (pr.d < best) { best = pr.d; var q = posAt(P, pr.s); ang = Math.atan2(q.uy, q.ux) + Math.PI / 2; } }
        });
        return { id: id, x: x, y: y, kind: 'slot', on: on, ang: ang };
      });
      var stores = (st.stores || []).map(function (id) { var s = D.stores[id]; return { id: id, name: s.name, x: s.x, y: s.y, food: s.food, max: s.food }; });
      return {
        paths: paths, pmap: pmap, spots: spots, slots: slots, stores: stores,
        near: function (x, y, r) {
          for (var i = 0; i < paths.length; i++) if (project(paths[i], x, y).d < r) return true;
          for (i = 0; i < spots.length; i++) if (dist(x, y, spots[i].x, spots[i].y) < r) return true;
          for (i = 0; i < stores.length; i++) if (dist(x, y, stores[i].x, stores[i].y) < r + 40) return true;
          if (dist(x, y, D.gate.x, D.gate.y) < r + 60) return true;
          return false;
        }
      };
    }
    function makeBg(ctx, k) {
      var c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
      var bg = c.getContext('2d'); bg.setTransform(k, 0, 0, k, 0, 0);
      renderBg(bg, ctx);
      return c;
    }

    /* ---------------- 게임 시작 ---------------- */
    function startStage(n, opt) {
      opt = opt || {};
      var st = stageOf(n); if (!st) return;
      closeAllBubbles(); ptrs = {};
      var ctx = buildCtx(st);
      G = {
        n: n, st: st, ctx: ctx, phase: 'prep', wave: 0, nWaves: st.waves.length,
        res: Math.round(st.start * dm.res), gate: { hp: D.gate.hp, max: D.gate.hp, shake: 0 },
        facs: [], occ: {}, enemies: [], projs: [], fx: [], queue: [], waveT: 0, time: 0,
        prepLeft: 0, ready: {}, stats: { stopped: 0, arrived: 0, built: 0, repaired: 0 },
        stores: ctx.stores, endT: 0, win: false, finished: false, nextId: 1, rand: rng(n * 977 + 3),
        tut: st.tutorial && !opt.noTut ? 0 : -1, tutBubble: false, dry: !!opt.dry, silent: !!opt.dry, result: null
      };
      G.prepLeft = prepTime();
      (st.preWalls || []).forEach(function (pw) {
        var f = addFac('wall', pw.slot, roleHolder('wall'));
        if (f) { f.hp = Math.round(f.max * pw.frac); f.spent = 0; }
      });
      if (!opt.dry) {
        bgCanvas = makeBg(ctx, resK);
        cam.zi = 0; cam.z = 1; cam.x = W / 2; cam.y = H / 2;
        speed = 1; userPaused = false;
        screen = 'play'; scr.innerHTML = ''; scr.className = 'df-screen hidden';
        buildHud();
        snd('horn');
        toast(st.id + '단계 「' + st.title + '」 준비 시간이에요! 시설을 놓아 보세요.', { dur: 3200 });
      }
    }
    function prepTime() {
      if (G.tut >= 0 && G.wave === 0) return 1e9;   // 연습 첫 공격은 시간 제한 없음
      return Math.round((G.st.prep || 60) * dm.prep);
    }
    function waveGroups(i) {
      return (G.st.waves[i] || []).map(function (gr) { return { path: gr.path, type: gr.type, n: Math.max(1, Math.round(gr.n * dm.count)), gap: gr.gap, delay: gr.delay || 0 }; });
    }
    function startWave(auto) {
      if (!G || G.phase !== 'prep') return false;
      G.phase = 'wave'; G.waveT = 0; G.queue = [];
      waveGroups(G.wave).forEach(function (gr) { for (var i = 0; i < gr.n; i++) G.queue.push({ t: gr.delay + i * gr.gap, path: gr.path, type: gr.type }); });
      G.queue.sort(function (a, b) { return a.t - b.t; });
      G.ready = {};
      snd('horn');
      toast((auto ? '⏰ 준비 시간이 끝났어요! ' : '') + '🚩 공격 ' + (G.wave + 1) + '/' + G.nWaves + ' 시작! 성문을 지켜요!', { big: true, dur: 2200, key: 'wave' });
      if (G.tut >= 0 && G.tut <= 3) G.tut = 4;
      return true;
    }
    function spawn(type, pathName) {
      var E = EN[type], P = G.ctx.pmap[pathName]; if (!E || !P) return null;
      var r = G.rand;
      var e = { id: G.nextId++, type: type, P: P, s: 0, hp: E.hp * dm.hp, max: E.hp * dm.hp, speed: E.speed * (0.92 + r() * 0.16),
        off: (r() - 0.5) * 22, state: 'walk', t: 0, x: P.pts[0][0], y: P.pts[0][1], dir: 1, hitT: 0, wall: null, revealed: !E.stealth, anim: r() * 10 };
      G.enemies.push(e);
      return e;
    }

    /* ---------------- 시설 ---------------- */
    function kindOf(type) { return type === 'wall' ? 'slot' : 'spot'; }
    function placeOf(id) {
      var i, c = G.ctx;
      for (i = 0; i < c.spots.length; i++) if (c.spots[i].id === id) return c.spots[i];
      for (i = 0; i < c.slots.length; i++) if (c.slots[i].id === id) return c.slots[i];
      return null;
    }
    function canPlace(type, id, ignore) {
      var p = placeOf(id); if (!p) return '설치할 수 없는 곳이에요';
      if (p.kind !== kindOf(type)) return type === 'wall' ? '성벽은 길 위 네모 칸에만 놓을 수 있어요' : '이 시설은 둥근 설치 지점에 놓아요';
      if (G.occ[id] && G.occ[id] !== ignore) return '이미 시설이 있어요';
      return '';
    }
    function addFac(type, id, owner) {
      var p = placeOf(id), F = FAC[type];
      var f = { id: G.nextId++, type: type, lvl: 1, spot: id, x: p.x, y: p.y, ang: p.ang || 0, owner: owner, cd: 0, spent: F.cost, flash: 0.6, boost: 0, broken: false };
      if (type === 'wall') { f.max = F.hp[0]; f.hp = f.max; f.on = p.on; }
      G.facs.push(f); G.occ[id] = f;
      return f;
    }
    function place(type, id, owner) {
      var why = canPlace(type, id); if (why) return why;
      var c = FAC[type].cost;
      if (G.res < c) return '물자가 부족해요 (🌾 ' + c + ' 필요)';
      G.res -= c;
      var f = addFac(type, id, owner);
      G.stats.built++;
      snd('build');
      fxText(f.x, f.y - 60, '-' + c + ' 🌾', '#ffe9a8');
      return f;
    }
    function moveFac(f, id) {
      if (G.phase !== 'prep') return '공격 중에는 옮길 수 없어요';
      var why = canPlace(f.type, id, f); if (why) return why;
      delete G.occ[f.spot]; var p = placeOf(id);
      f.spot = id; f.x = p.x; f.y = p.y; f.ang = p.ang || 0; f.flash = 0.5; if (f.type === 'wall') f.on = p.on;
      G.occ[id] = f; snd('snap');
      return f;
    }
    function upCost(f) { var u = FAC[f.type].up; return f.lvl <= u.length ? u[f.lvl - 1] : null; }
    function upgrade(f) {
      var c = upCost(f); if (c == null) return '이미 가장 높은 단계예요';
      if (f.broken) return '먼저 수리해요';
      if (G.res < c) return '물자가 부족해요 (🌾 ' + c + ' 필요)';
      G.res -= c; f.spent += c; f.lvl++; f.flash = 0.8;
      if (f.type === 'wall') { var nm = FAC.wall.hp[f.lvl - 1]; f.hp += nm - f.max; f.max = nm; }
      snd('df-up'); fxText(f.x, f.y - 70, '⬆ ' + f.lvl + '단계!', '#ffe9a8');
      return f;
    }
    function repairCost(f) {
      if (f.type !== 'wall' || f.hp >= f.max) return 0;
      return Math.max(5, Math.ceil((1 - f.hp / f.max) * FAC.wall.repair * (1 + (f.lvl - 1) * 0.5)));
    }
    function repair(f) {
      var c = repairCost(f); if (!c) return '고칠 곳이 없어요';
      if (G.res < c) return '물자가 부족해요 (🌾 ' + c + ' 필요)';
      G.res -= c; f.hp = f.max; f.broken = false; f.flash = 0.6; G.stats.repaired++;
      snd('df-repair'); fxText(f.x, f.y - 50, '🔧 수리 완료', '#c8ffb0');
      return f;
    }
    function sellValue(f) { return G.phase === 'prep' ? f.spent : Math.floor(f.spent * 0.5); }
    function sell(f) {
      var v = sellValue(f);
      G.res += v; delete G.occ[f.spot]; G.facs = G.facs.filter(function (x) { return x !== f; });
      G.enemies.forEach(function (e) { if (e.wall === f) { e.wall = null; e.state = 'walk'; } });
      snd('coin'); fx(f.x, f.y, 'puff'); fxText(f.x, f.y - 40, '+' + v + ' 🌾', '#c8ffb0');
      return v;
    }
    function count(type) { return G.facs.filter(function (f) { return f.type === type; }).length; }

    /* ---------------- 효과 ---------------- */
    function fx(x, y, kind, o) { if (G.dry) return; G.fx.push({ x: x, y: y, kind: kind, t: 0, dur: kind === 'puff' ? 0.8 : 0.4, o: o || {} }); }
    function fxText(x, y, text, col) { if (G.dry) return; G.fx.push({ x: x, y: y, kind: 'text', text: text, col: col || '#fff', t: 0, dur: 1.3 }); }

    /* ---------------- 시뮬레이션 ---------------- */
    function towerRange(f) { return FAC.tower.range[f.lvl - 1] * (1 + f.boost); }
    function revealedAt(x, y) {
      for (var i = 0; i < G.facs.length; i++) {
        var f = G.facs[i];
        if (f.type === 'watch' && dist(x, y, f.x, f.y) <= FAC.watch.reveal[f.lvl - 1]) return true;
        if (f.type === 'tower' && dist(x, y, f.x, f.y) <= 85) return true;
      }
      return dist(x, y, D.gate.x, D.gate.y) < 130;
    }
    function nextWall(e) {
      var best = null;
      for (var i = 0; i < G.facs.length; i++) {
        var f = G.facs[i]; if (f.type !== 'wall' || f.broken) continue;
        for (var j = 0; j < f.on.length; j++) {
          var o = f.on[j];
          if (o.path === e.P.name && o.s > e.s - 4 && (!best || o.s < best.s)) best = { s: o.s, f: f };
        }
      }
      return best;
    }
    function pushersOf(f, self) { var n = 0; for (var i = 0; i < G.enemies.length; i++) { var e = G.enemies[i]; if (e !== self && e.wall === f && e.state === 'push') n++; } return n; }
    function stopEnemy(e) {
      e.state = 'retreat'; e.t = 0; e.wall = null;
      var b = EN[e.type].bounty; G.res += b; G.stats.stopped++;
      snd('poof'); fx(e.x, e.y, 'puff'); fxText(e.x, e.y - 34, '저지! +' + b, '#fff');
    }
    function arrive(e) {
      var E = EN[e.type];
      e.state = 'leave'; e.t = 0; G.stats.arrived++;
      if (e.P.to === 'gate') {
        G.gate.hp = Math.max(0, G.gate.hp - E.gate); G.gate.shake = 1;
        snd('thud'); fxText(D.gate.x, D.gate.y - 150, '성문 -' + E.gate, '#ffdddd');
        toast('🚪 성문이 밀리고 있어요!', { key: 'gatehit', dur: 1500 });
      } else {
        var s = G.stores.filter(function (x) { return x.id === e.P.to; })[0];
        if (s) { var take = Math.min(s.food, 20 + E.gate); s.food -= take; e.sack = true; snd('alarm'); fxText(s.x, s.y - 110, '🍚 -' + Math.ceil(take), '#ffe0a0'); toast('🍚 ' + s.name + '의 식량을 가져가요!', { key: 'store', dur: 1500 }); }
      }
    }
    function updEnemy(e, dt) {
      var E = EN[e.type];
      e.anim += dt; e.hitT = Math.max(0, e.hitT - dt);
      if (e.state === 'walk') {
        var blk = nextWall(e), ns = e.s + e.speed * dt;
        if (blk && ns >= blk.s - 90) {
          var stopS = blk.s - 30 - Math.min(36, pushersOf(blk.f, e) * 12);
          if (ns >= stopS) { ns = Math.max(e.s, stopS); e.state = 'push'; e.wall = blk.f; }
        }
        e.s = ns;
        if (e.s >= e.P.len) { e.s = e.P.len; arrive(e); }
      } else if (e.state === 'push') {
        var f = e.wall;
        if (!f || f.broken || G.facs.indexOf(f) < 0) { e.state = 'walk'; e.wall = null; }
        else {
          f.hp -= E.push * dt;
          if (f.hp <= 0) { f.hp = 0; f.broken = true; snd('df-crumble'); fx(f.x, f.y, 'puff'); fxText(f.x, f.y - 50, '성벽이 무너졌어요!', '#ffe0a0'); toast('🧱 성벽이 무너졌어요! 눌러서 수리해요', { key: 'wallbreak' }); }
        }
      } else {
        e.t += dt; e.s = Math.max(0, e.s - 75 * dt);
        if (e.t > 1.1) e.gone = true;
      }
      var p = posAt(e.P, e.s);
      e.x = p.x - p.uy * e.off; e.y = p.y + p.ux * e.off;
      e.dir = (e.state === 'retreat' || e.state === 'leave') ? (p.ux >= 0 ? -1 : 1) : (p.ux >= 0 ? 1 : -1);
      if (E.stealth) e.revealed = (e.state !== 'walk' && e.state !== 'push') || revealedAt(e.x, e.y);
    }
    function targetable(e) { return (e.state === 'walk' || e.state === 'push') && e.revealed && e.hp > 0; }
    function updTower(f, dt) {
      f.cd -= dt; if (f.cd > 0) return;
      var R = towerRange(f), best = null, bd = 1e9;
      for (var i = 0; i < G.enemies.length; i++) {
        var e = G.enemies[i]; if (!targetable(e) || e.pending >= e.hp) continue;
        if (dist(e.x, e.y, f.x, f.y) > R) continue;
        var rem = e.P.len - e.s; if (rem < bd) { bd = rem; best = e; }
      }
      if (!best) { f.cd = 0.1; return; }
      var dmg = FAC.tower.dmg[f.lvl - 1] * EN[best.type].armor[f.lvl - 1];
      var d = dist(best.x, best.y, f.x, f.y - 50);
      G.projs.push({ sx: f.x, sy: f.y - 50, e: best, t: 0, dur: clamp(d / 750, 0.1, 0.4), dmg: dmg });
      best.pending = (best.pending || 0) + dmg;
      f.cd = FAC.tower.rate[f.lvl - 1]; f.aim = Math.atan2(best.y - f.y, best.x - f.x);
      snd('arrow');
    }
    function step(dt) {
      var Gm = G, i;
      Gm.time += dt;
      Gm.gate.shake = Math.max(0, Gm.gate.shake - dt * 2);
      if (Gm.phase === 'prep') {
        if (Gm.prepLeft < 1e8) { Gm.prepLeft -= dt; if (Gm.prepLeft <= 0) startWave(true); }
      } else if (Gm.phase === 'wave') {
        Gm.waveT += dt;
        while (Gm.queue.length && Gm.queue[0].t <= Gm.waveT) { var q = Gm.queue.shift(); spawn(q.type, q.path); }
      }
      // 감시초소 근처 진지는 사거리가 늘어난다
      var watches = Gm.facs.filter(function (f) { return f.type === 'watch'; });
      Gm.facs.forEach(function (f) {
        f.flash = Math.max(0, f.flash - dt);
        if (f.type !== 'tower') return;
        f.boost = 0;
        watches.forEach(function (w) { if (dist(w.x, w.y, f.x, f.y) <= FAC.watch.reveal[w.lvl - 1]) f.boost = Math.max(f.boost, FAC.watch.boost[w.lvl - 1]); });
      });
      for (i = 0; i < Gm.enemies.length; i++) updEnemy(Gm.enemies[i], dt);
      Gm.enemies = Gm.enemies.filter(function (e) { return !e.gone; });
      for (i = 0; i < Gm.facs.length; i++) if (Gm.facs[i].type === 'tower') updTower(Gm.facs[i], dt);
      for (i = 0; i < Gm.projs.length; i++) {
        var p = Gm.projs[i]; p.t += dt;
        if (p.t >= p.dur) {
          p.done = true; var e = p.e; e.pending = Math.max(0, (e.pending || 0) - p.dmg);
          if (e.state === 'walk' || e.state === 'push') {
            e.hp -= p.dmg; e.hitT = 0.15; snd('hit');
            fx(e.x, e.y - 8, 'spark', { weak: p.dmg < 6 });
            if (e.hp <= 0.01) stopEnemy(e);
          }
        }
      }
      Gm.projs = Gm.projs.filter(function (p) { return !p.done; });
      for (i = 0; i < Gm.fx.length; i++) Gm.fx[i].t += dt;
      Gm.fx = Gm.fx.filter(function (f) { return f.t < f.dur; });
      if (!Gm.dry) tutCheck();
      if (Gm.phase === 'wave') {
        if (Gm.gate.hp <= 0) endStage(false, '성문 내구도가 0이 되었어요');
        else if (Gm.stores.length && foodLeft() <= 0) endStage(false, '창고의 식량이 모두 없어졌어요');
        else if (!Gm.queue.length && !Gm.enemies.some(function (e) { return e.state === 'walk' || e.state === 'push'; })) waveCleared();
      } else if (Gm.phase === 'end') {
        Gm.endT -= dt;
        if (Gm.endT <= 0 && !Gm.finished) { Gm.finished = true; finishStage(); }
      }
    }
    function foodLeft() { var n = 0; G.stores.forEach(function (s) { n += s.food; }); return n; }
    function foodMax() { var n = 0; G.stores.forEach(function (s) { n += s.max; }); return n; }
    function income() { var n = G.st.waveBonus || 30; G.facs.forEach(function (f) { if (f.type === 'depot') n += FAC.depot.income[f.lvl - 1]; }); return n; }
    function waveCleared() {
      if (G.wave >= G.nWaves - 1) { endStage(true); return; }
      var inc = income();
      G.res += inc;
      G.facs.forEach(function (f) { if (f.type === 'depot') fxText(f.x, f.y - 70, '+' + FAC.depot.income[f.lvl - 1] + ' 🌾', '#c8ffb0'); });
      G.wave++; G.phase = 'prep'; G.prepLeft = prepTime(); G.ready = {};
      snd('coin');
      toast('✨ 공격 ' + G.wave + '번째를 막았어요! 보급 물자 +' + inc + ' 🌾', { dur: 2600, key: 'clear' });
    }
    function endStage(win, why) {
      if (G.phase === 'end') return;
      G.phase = 'end'; G.win = win; G.why = why || ''; G.endT = 1.8; G.queue = [];
      if (!win) { snd('lose'); toast('😢 ' + (why || '성문을 지키지 못했어요'), { big: true, dur: 2000, key: 'end' }); }
      else { snd('fanfare'); toast('🎉 마지막 공격까지 막아 냈어요!', { big: true, dur: 2000, key: 'end' }); }
    }
    function calcStars() {
      var gf = G.gate.hp / G.gate.max, score = gf;
      if (G.stores.length) score = (gf + foodLeft() / foodMax()) / 2;
      return score >= 0.8 ? 3 : score >= 0.5 ? 2 : 1;
    }
    function finishStage() {
      var win = G.win, stars = win ? calcStars() : 0, res = null;
      G.result = { win: win, stars: stars, gate: Math.ceil(G.gate.hp), food: G.stores.length ? Math.ceil(foodLeft()) : null, wave: G.wave + 1, stopped: G.stats.stopped, res: G.res };
      if (G.dry) return;
      if (win) {
        var prev = save.best[G.n] ? save.best[G.n].stars : 0;
        save.best[G.n] = { stars: Math.max(prev, stars), gate: G.result.gate, date: Date.now() };
        host.save(save);
        try { res = host.award({ key: 'stage-' + G.n, stars: stars, codex: G.st.cards || [], badge: G.st.badge }); } catch (e) { host.error(e); }
        updateRecord();
      }
      showResult(win, stars, res);
    }
    function updateRecord() {
      var top = 0, tot = 0;
      Object.keys(save.best).forEach(function (k) { top = Math.max(top, +k); tot += save.best[k].stars || 0; });
      if (top) host.setRecord('최고 ' + top + '단계 · 별 ' + tot);
    }

    /* ---------------- 카메라 ---------------- */
    function toWorld(sx, sy) { return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y }; }
    function toStage(wx, wy) { return { x: (wx - cam.x) * cam.z + W / 2, y: (wy - cam.y) * cam.z + H / 2 }; }
    function clampCam() {
      var hw = W / 2 / cam.z, hh = H / 2 / cam.z;
      cam.x = clamp(cam.x, hw, W - hw); cam.y = clamp(cam.y, hh, H - hh);
    }
    function setZoom(zi) { cam.zi = clamp(zi, 0, ZOOMS.length - 1); cam.z = ZOOMS[cam.zi]; clampCam(); snd('tap'); }

    /* ---------------- 그리기 ---------------- */
    function render() {
      var Gm = G, t = Gm.time, i;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#9fc674'; g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(resK * cam.z, 0, 0, resK * cam.z, resK * (W / 2 - cam.x * cam.z), resK * (H / 2 - cam.y * cam.z));
      if (bgCanvas) g.drawImage(bgCanvas, 0, 0, W, H);
      // 끌고 있는 시설 종류 → 설치 가능 지점 강조
      var dragKinds = {}, anyDrag = false;
      Object.keys(ptrs).forEach(function (k) { var p = ptrs[k]; if (p.kind === 'build' || p.kind === 'move') { dragKinds[kindOf(p.type)] = p; anyDrag = true; } });
      if (anyDrag) {
        var pulse = 0.5 + 0.5 * Math.sin(t * 6 + performance.now() / 160);
        Gm.ctx.spots.concat(Gm.ctx.slots).forEach(function (s) {
          var p = dragKinds[s.kind]; if (!p) return;
          var occ = Gm.occ[s.id] && Gm.occ[s.id] !== p.fac;
          g.strokeStyle = occ ? 'rgba(220,60,40,.5)' : 'rgba(60,200,80,' + (0.55 + pulse * 0.45) + ')';
          g.lineWidth = 6;
          if (s.kind === 'spot') { circle(g, s.x, s.y + 8, 44 + pulse * 4); g.stroke(); }
          else { g.save(); g.translate(s.x, s.y); g.rotate(s.ang); g.strokeRect(-54, -22, 108, 44); g.restore(); }
        });
      }
      // 연습 안내 강조
      var tg = tutTarget();
      if (tg) {
        var b = Math.sin(performance.now() / 200) * 10;
        g.strokeStyle = '#ffe14a'; g.lineWidth = 7; circle(g, tg.x, tg.y + 8, 52 + b / 3); g.stroke();
        g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(tg.x, tg.y - 62 + b); g.lineTo(tg.x - 20, tg.y - 94 + b); g.lineTo(tg.x + 20, tg.y - 94 + b); g.fill();
        g.strokeStyle = '#8a5a10'; g.lineWidth = 2; g.stroke();
      }
      // 선택된 시설의 범위
      Object.keys(bubbles).forEach(function (side) { var bb = bubbles[side]; if (bb && bb.fac) rangeRing(bb.fac.type, bb.fac.x, bb.fac.y, bb.fac.lvl, bb.fac, PCOL[bb.player]); });
      Gm.stores.forEach(function (s) { drawStore(g, s, t); });
      drawGate(g, D.gate.x, D.gate.y, Gm.gate.hp / Gm.gate.max, t, Gm.gate.shake);
      // 시설·적을 y 순서로
      var list = [];
      Gm.facs.forEach(function (f) { list.push({ y: f.y, f: f }); });
      Gm.enemies.forEach(function (e) { list.push({ y: e.y, e: e }); });
      list.sort(function (a, b2) { return a.y - b2.y; });
      list.forEach(function (it) { if (it.f) drawFac(it.f, t); else drawEnemyObj(it.e); });
      // 화살
      g.strokeStyle = '#6b4423'; g.lineWidth = 3; g.lineCap = 'round';
      Gm.projs.forEach(function (p) {
        var k = p.t / p.dur, x = p.sx + (p.e.x - p.sx) * k, y = p.sy + (p.e.y - 10 - p.sy) * k - Math.sin(k * Math.PI) * 30;
        var a = Math.atan2(p.e.y - p.sy, p.e.x - p.sx);
        g.beginPath(); g.moveTo(x - Math.cos(a) * 12, y - Math.sin(a) * 12); g.lineTo(x, y); g.stroke();
        g.fillStyle = '#f2f2f2'; circle(g, x - Math.cos(a) * 12, y - Math.sin(a) * 12, 2.5); g.fill();
      });
      // 효과
      Gm.fx.forEach(function (f) {
        var k = f.t / f.dur;
        if (f.kind === 'puff') {
          for (var j = 0; j < 6; j++) {
            var a2 = j * 1.05 + f.x * 0.01, rd = 8 + k * 26;
            g.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - k)) + ')';
            circle(g, f.x + Math.cos(a2) * rd, f.y - 6 + Math.sin(a2) * rd * 0.7 - k * 14, 9 + k * 8); g.fill();
          }
        } else if (f.kind === 'spark') {
          star(g, f.x, f.y - k * 10, (f.o.weak ? 6 : 9) * (1 - k * 0.5), f.o.weak ? 'rgba(200,200,220,.9)' : 'rgba(255,230,90,.95)');
          if (f.o.weak && k < 0.5) label(g, '튕김', f.x + 14, f.y - 20, 14, '#3d4b5f');
        } else if (f.kind === 'text') {
          g.globalAlpha = 1 - k * k;
          g.font = 'bold 22px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = 5; g.strokeStyle = 'rgba(60,35,10,.85)'; g.strokeText(f.text, f.x, f.y - k * 34);
          g.fillStyle = f.col; g.fillText(f.text, f.x, f.y - k * 34);
          g.globalAlpha = 1;
        }
      });
      if (Gm.phase === 'prep') drawThreats(t);
      // 끄는 중인 시설 미리보기
      Object.keys(ptrs).forEach(function (k) {
        var p = ptrs[k]; if (p.kind !== 'build' && p.kind !== 'move') return;
        var col = PCOL[p.owner], spot = p.snap ? placeOf(p.snap) : null;
        var x = spot ? spot.x : p.wx, y = spot ? spot.y : p.wy;
        if (spot) rangeRing(p.type, x, y, p.fac ? p.fac.lvl : 1, null, col);
        g.globalAlpha = spot ? 0.85 : 0.5;
        drawFacAt(p.type, x, y, p.fac ? p.fac.lvl : 1, col, spot ? spot.ang || 0 : 0, t);
        g.globalAlpha = 1;
        if (!spot && p.sy < 920 && p.sy > 150) { g.strokeStyle = '#e8553e'; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 14, y - 14); g.lineTo(x + 14, y + 14); g.moveTo(x + 14, y - 14); g.lineTo(x - 14, y + 14); g.stroke(); }
      });
    }
    function rangeRing(type, x, y, lvl, f, col) {
      var R = 0;
      if (type === 'tower') R = FAC.tower.range[lvl - 1] * (1 + (f ? f.boost : 0));
      else if (type === 'watch') R = FAC.watch.reveal[lvl - 1];
      if (!R) return;
      g.fillStyle = hexA(col, 0.12); circle(g, x, y, R); g.fill();
      g.strokeStyle = hexA(col, 0.8); g.lineWidth = 4; g.setLineDash([14, 10]); circle(g, x, y, R); g.stroke(); g.setLineDash([]);
    }
    function drawFacAt(type, x, y, lvl, col, ang, t, f) {
      if (type === 'tower') drawTower(g, x, y, lvl, col);
      else if (type === 'watch') drawWatch(g, x, y, lvl, col, t);
      else if (type === 'depot') drawDepot(g, x, y, lvl, col);
      else drawWall(g, x, y, ang, lvl, f ? f.hp / f.max : 1, f ? f.broken : false, col);
    }
    function drawFac(f, t) {
      var col = PCOL[f.owner] || PCOL[0];
      if (f.type !== 'wall') { g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.ellipse(f.x, f.y + 20, 40, 14, 0, 0, 7); g.stroke(); }
      if (f.flash > 0) { g.fillStyle = 'rgba(255,240,150,' + f.flash + ')'; circle(g, f.x, f.y - 10, 50); g.fill(); }
      drawFacAt(f.type, f.x, f.y, f.lvl, col, f.ang, t, f);
      if (f.type === 'tower' && f.boost > 0) label(g, '👁️', f.x + 34, f.y - 46, 16);
    }
    function drawEnemyObj(e) {
      var ret = e.state === 'retreat' || e.state === 'leave';
      var hidden = !e.revealed;
      var o = { alpha: ret ? Math.max(0, 1 - e.t / 1.1) : hidden ? 0.32 : 1, white: e.state === 'retreat', sweat: e.state === 'retreat', shake: e.state === 'push' };
      drawEnemy(g, e.type, e.x, e.y, e.dir, e.anim, o);
      if (e.sack && ret) { g.globalAlpha = o.alpha; g.fillStyle = '#f2e6c8'; circle(g, e.x - e.dir * 12, e.y - 22, 8); g.fill(); g.globalAlpha = 1; }
      if (hidden && !ret) { label(g, '?', e.x, e.y - 40, 20, '#fff', 'rgba(60,90,60,.6)'); }
      if (e.hitT > 0 && !ret) { g.fillStyle = 'rgba(255,255,255,' + e.hitT * 3 + ')'; circle(g, e.x, e.y - 4, 16); g.fill(); }
      if (!ret && !hidden && e.hp < e.max) hpBar(g, e.x, e.y - (e.type === 'siege' ? 44 : 38), 34, Math.max(0, e.hp / e.max));
    }
    // 감시초소가 있으면 다음 공격의 방향과 적 구성을 보여 준다
    function drawThreats(t) {
      var know = count('watch') > 0;
      var groups = waveGroups(G.wave), by = {};
      groups.forEach(function (gr) { by[gr.path] = by[gr.path] || {}; by[gr.path][gr.type] = (by[gr.path][gr.type] || 0) + gr.n; });
      G.ctx.paths.forEach(function (P) {
        var p = posAt(P, 95), x = clamp(p.x, 330, 1630), y = clamp(p.y, 250, 860);
        if (!know) {
          g.globalAlpha = 0.9; label(g, '❓ 감시초소가 있으면 보여요', x, y - 40, 18, '#fff', 'rgba(60,50,40,.7)'); g.globalAlpha = 1;
          return;
        }
        var info = by[P.name];
        if (!info) { label(g, '😴 조용함', x, y - 40, 18, '#2e5a2a', 'rgba(255,255,255,.75)'); return; }
        var types = ENEMY_ORDER.filter(function (k) { return info[k]; });
        var w = types.length * 74 + 20, bx = x - w / 2, byy = y - 92;
        g.fillStyle = 'rgba(255,248,230,.94)'; rr(g, bx, byy, w, 76, 14); g.fill();
        g.strokeStyle = '#d9822b'; g.lineWidth = 4; g.stroke();
        types.forEach(function (k, i) {
          var cx = bx + 20 + i * 74 + 22;
          g.save(); g.translate(cx, byy + 40); g.scale(0.85, 0.85); drawEnemy(g, k, 0, 0, 1, 0, { still: true }); g.restore();
          label(g, '×' + info[k], cx + 30, byy + 56, 18, '#3a2412');
        });
        label(g, '⚠ ' + P.label, x, byy - 14, 17, '#fff', 'rgba(170,70,20,.88)');
        // 진행 방향 화살표
        var a = (t * 120) % 60;
        g.strokeStyle = 'rgba(230,90,40,.75)'; g.lineWidth = 6;
        for (var s = a; s < 260; s += 60) {
          var q = posAt(P, s), q2 = posAt(P, s + 20);
          g.beginPath(); g.moveTo(q.x - q.uy * 12 - q.ux * 8, q.y + q.ux * 12 - q.uy * 8); g.lineTo(q2.x, q2.y); g.lineTo(q.x + q.uy * 12 - q.ux * 8, q.y - q.ux * 12 - q.uy * 8); g.stroke();
        }
      });
    }

    /* ---------------- 연습(튜토리얼) ---------------- */
    var TUT = [
      function () { return '① ' + who('tower') + '🏹 활쏘기 진지 카드를 끌어서 반짝이는 둥근 자리에 놓아요.'; },
      function () { return '② ' + who('wall') + '🧱 성벽 카드를 길 위 네모 칸에 놓아요. 적이 멈춰서 시간을 벌어요.'; },
      function () { return '③ 지도 위 시설을 톡 눌러 보세요. 강화·수리·철거 버튼이 나와요.'; },
      function () { return '④ 준비가 끝나면 ' + (players > 1 ? '모두 ✋준비를 누르고 ' + PNAME[leader] + ' 친구가 ' : '') + '🚩 공격 시작을 눌러요!'; },
      function () { return '⑤ 적을 저지하면 물자 🌾를 얻어요. 무너진 성벽은 눌러서 수리해요.'; }
    ];
    function tutTarget() {
      if (!G || G.tut < 0) return null;
      if (G.tut === 0) return placeOf(G.st.spots.indexOf('A2') >= 0 ? 'A2' : G.st.spots[0]);
      if (G.tut === 1) return placeOf(G.st.slots.indexOf('wE1') >= 0 ? 'wE1' : G.st.slots[0]);
      return null;
    }
    function tutCheck() {
      if (!G || G.tut < 0) return;
      if (G.tut === 0 && count('tower') > 0) G.tut = 1;
      if (G.tut === 1 && count('wall') > 0) G.tut = 2;
      if (G.tut === 2 && G.tutBubble) G.tut = 3;
      if (G.tut === 4 && G.phase === 'wave' && G.waveT > 14) G.tut = -1;
      if (G.tut === 4 && G.phase !== 'wave') G.tut = -1;
    }

    /* ---------------- HUD (플레이어 패널) ---------------- */
    function buildHud() {
      hud.innerHTML = ''; bubbles = {};
      hudRefs = { panels: [], banners: [] };
      for (var i = 0; i < players; i++) hudRefs.panels.push(buildPanel(i));
      // 공통 조작: 일시정지·속도 (왼쪽 아래), 확대·축소 (오른쪽 아래)
      var bl = el('div', 'df-ctl df-ctl-bl');
      var pb = el('button', 'df-cbtn', '⏸'); pb.setAttribute('aria-label', '일시정지');
      pb.addEventListener('click', function () { setUserPause(!userPaused); });
      var sb = el('button', 'df-cbtn df-speed', '1×'); sb.setAttribute('aria-label', '속도');
      sb.addEventListener('click', function () { speed = speed === 1 ? 2 : 1; sb.textContent = speed + '×'; sb.classList.toggle('on', speed === 2); snd('tap'); });
      bl.appendChild(pb); bl.appendChild(sb); hud.appendChild(bl);
      var br = el('div', 'df-ctl df-ctl-br');
      var zo = el('button', 'df-cbtn', '🔍−'), zi = el('button', 'df-cbtn', '🔍+');
      zo.setAttribute('aria-label', '축소'); zi.setAttribute('aria-label', '확대');
      zo.addEventListener('click', function () { setZoom(cam.zi - 1); });
      zi.addEventListener('click', function () { setZoom(cam.zi + 1); });
      br.appendChild(zo); br.appendChild(zi); hud.appendChild(br);
      hudRefs.pauseBtn = pb; hudRefs.speedBtn = sb;
      // 연습 안내 띠 (아래·위 두 방향)
      ['bottom', 'top'].forEach(function (side, k) {
        if (k === 1 && players < 2) return;
        var bn = el('div', 'df-banner side-' + side + ' hidden');
        var tx = el('span', 'df-banner-t'); var sk = el('button', 'df-skip', '연습 건너뛰기');
        sk.addEventListener('click', function () { if (G) { G.tut = -1; if (G.phase === 'prep' && G.prepLeft > 1e8) G.prepLeft = prepTime(); } snd('tap'); });
        bn.appendChild(tx); bn.appendChild(sk); hud.appendChild(bn);
        hudRefs.banners.push({ el: bn, t: tx, last: '' });
      });
      var po = el('div', 'df-pause hidden');
      var pbox = el('div', 'df-pause-box', '<h2>⏸ 잠시 멈춤</h2><p>친구들과 작전을 의논해 보세요!</p>');
      var rb = el('button', 'big-btn primary', '<span>▶ 계속하기</span>');
      rb.addEventListener('click', function () { setUserPause(false); });
      var qb = el('button', 'big-btn', '<span>🗺️ 임무 지도로</span>');
      qb.addEventListener('click', function () { setUserPause(false); showSelect(); });
      pbox.appendChild(rb); pbox.appendChild(qb); po.appendChild(pbox); hud.appendChild(po);
      hudRefs.pauseOv = po;
      updateHud(true);
    }
    function setUserPause(p) { userPaused = p; if (hudRefs) { hudRefs.pauseOv.classList.toggle('hidden', !p); hudRefs.pauseBtn.textContent = p ? '▶' : '⏸'; } snd('tap'); }
    function buildPanel(i) {
      var side = SIDES[i], col = PCOL[i];
      var pn = el('div', 'df-panel side-' + side + (players === 1 ? ' solo' : ''));
      pn.style.setProperty('--pc', col);
      var myRoles = roles[i];
      var lb = el('div', 'df-plabel', '<i></i><b>' + PNAME[i] + '</b><small>' + myRoles.map(function (r) { return ROLE_NAME[r]; }).join('<br>') + '</small>');
      if (players === 1) lb.innerHTML = '<i></i><b>방어 대장</b><small>모든 역할</small>';
      pn.appendChild(lb);
      var stt = el('div', 'df-status', '<div class="df-s1"></div><div class="df-s2"></div><div class="df-s3"></div>');
      pn.appendChild(stt);
      var ref = { el: pn, s1: stt.children[0], s2: stt.children[1], s3: stt.children[2], cards: [], i: i, cache: {} };
      var types = [];
      myRoles.forEach(function (r) { types = types.concat(ROLE_CARDS[r]); });
      types.sort(function (a, b) { return FAC_ORDER.indexOf(a) - FAC_ORDER.indexOf(b); });
      types.forEach(function (type) {
        var F = FAC[type];
        var c = el('button', 'df-card'); c.dataset.type = type; c.dataset.owner = i;
        var ic = el('canvas', 'df-card-ic'); var ig = Activities.hiDpi(ic, 70, 62);
        drawFacIcon(ig, type, 35, type === 'watch' ? 40 : 40, type === 'watch' ? 0.44 : 0.58, col);
        c.appendChild(ic);
        c.appendChild(el('b', '', F.name));
        c.appendChild(el('small', '', '🌾 ' + F.cost));
        c.addEventListener('pointerdown', function (e) { onCardDown(e, type, i, c); });
        pn.appendChild(c); ref.cards.push({ el: c, type: type });
      });
      if (myRoles.indexOf('wall') >= 0) {
        var ra = el('button', 'df-act df-repall', '🔧<b>모두 수리</b><small></small>');
        ra.addEventListener('click', function () { repairAll(i); });
        pn.appendChild(ra); ref.repAll = ra;
      }
      if (i === leader) {
        var stb = el('button', 'df-act df-start', '🚩<b>공격 시작</b><small></small>');
        stb.addEventListener('click', function () { pressStart(i); });
        pn.appendChild(stb); ref.start = stb;
      } else {
        var rd = el('button', 'df-act df-ready', '✋<b>준비</b><small>눌러서 알리기</small>');
        rd.addEventListener('click', function () { toggleReady(i); });
        pn.appendChild(rd); ref.ready = rd;
      }
      hud.appendChild(pn);
      return ref;
    }
    function othersReady() { var n = 0; for (var i = 0; i < players; i++) if (i !== leader && G.ready[i]) n++; return n; }
    function toggleReady(i) {
      if (!G || G.phase !== 'prep') return;
      G.ready[i] = !G.ready[i]; snd(G.ready[i] ? 'df-ready' : 'tap');
      updateHud(true);
    }
    function pressStart(i) {
      if (!G) return false;
      if (G.phase !== 'prep') { toast('지금은 공격을 막는 중이에요!'); return false; }
      if (G.tut >= 0 && G.tut < 3) { toast('먼저 연습 안내를 따라 해 볼까요? (건너뛰기도 할 수 있어요)'); snd('wrong'); return false; }
      var need = players - 1, have = othersReady();
      if (have < need) { toast('✋ 친구들이 모두 「준비」를 눌러야 시작할 수 있어요 (' + have + '/' + need + ')', { key: 'needready' }); snd('wrong'); return false; }
      return startWave(false);
    }
    function repairAll(i) {
      if (!G) return;
      var walls = G.facs.filter(function (f) { return f.type === 'wall' && f.hp < f.max; });
      if (!walls.length) { toast('고칠 성벽이 없어요 👍'); return; }
      walls.sort(function (a, b) { return a.hp / a.max - b.hp / b.max; });
      var n = 0;
      walls.forEach(function (f) { if (repairCost(f) <= G.res) { repair(f); n++; } });
      if (!n) { toast('물자가 부족해서 수리하지 못했어요'); snd('wrong'); }
      else if (n < walls.length) toast('물자가 부족해서 ' + n + '개만 고쳤어요');
    }
    function setTxt(node, cacheObj, key, txt) { if (cacheObj[key] !== txt) { cacheObj[key] = txt; node.innerHTML = txt; } }
    function updateHud(force) {
      if (!hudRefs || !G) return;
      var inPrep = G.phase === 'prep';
      var waveTxt = G.phase === 'end' ? '임무 끝' : inPrep ? '준비 ' + (G.wave + 1) + '/' + G.nWaves : '⚔️ ' + (G.wave + 1) + '/' + G.nWaves;
      var left = G.enemies.filter(function (e) { return e.state === 'walk' || e.state === 'push'; }).length + G.queue.length;
      hudRefs.panels.forEach(function (ref) {
        var c = ref.cache;
        setTxt(ref.s1, c, 's1', '🌾 <b>' + Math.floor(G.res) + '</b>');
        setTxt(ref.s2, c, 's2', '🚪 ' + Math.ceil(G.gate.hp) + (G.stores.length ? ' · 🍚 ' + Math.ceil(foodLeft()) : ''));
        setTxt(ref.s3, c, 's3', waveTxt + (!inPrep && G.phase === 'wave' ? ' · 남은 ' + left : ''));
        ref.cards.forEach(function (cd) {
          var off = G.res < FAC[cd.type].cost;
          if (cd.off !== off) { cd.off = off; cd.el.classList.toggle('df-off', off); }
        });
        if (ref.repAll) {
          var rc = 0; G.facs.forEach(function (f) { rc += repairCost(f); });
          setTxt(ref.repAll.lastChild, c, 'rc', rc ? '🌾 ' + rc : '모두 튼튼');
          ref.repAll.classList.toggle('df-off', !rc || rc > G.res && !G.facs.some(function (f) { var x = repairCost(f); return x && x <= G.res; }));
        }
        if (ref.start) {
          var need = players - 1, have = othersReady();
          var sub = !inPrep ? '공격 막는 중' : (need ? '준비 ' + have + '/' + need : '') + (G.prepLeft < 1e8 ? (need ? ' · ' : '') + '자동 ' + Math.ceil(G.prepLeft) + '초' : (need ? '' : '눌러서 시작'));
          setTxt(ref.start.lastChild, c, 'st', sub);
          ref.start.classList.toggle('df-off', !inPrep || have < need);
          ref.start.classList.toggle('df-go', inPrep && have >= need);
        }
        if (ref.ready) {
          var on = !!G.ready[ref.i];
          ref.ready.classList.toggle('on', on);
          ref.ready.classList.toggle('df-off', !inPrep);
          setTxt(ref.ready.children[0], c, 'rb', on ? '준비 완료!' : '준비');
        }
      });
      // 연습 안내
      tutCheck();
      var msg = G.tut >= 0 ? TUT[G.tut]() : '';
      hudRefs.banners.forEach(function (b) {
        if (b.last !== msg) { b.last = msg; b.t.textContent = msg; b.el.classList.toggle('hidden', !msg); }
      });
      Object.keys(bubbles).forEach(function (s) { refreshBubble(bubbles[s]); });
    }

    /* ---------------- 선택 말풍선 (시설 조작) ---------------- */
    function nearestSide(sx, sy) {
      var best = 'bottom', bd = 1e9;
      for (var i = 0; i < players; i++) {
        var sd = SIDES[i], d = sd === 'bottom' ? H - sy : sd === 'top' ? sy : sd === 'left' ? sx : W - sx;
        if (sd === 'left' || sd === 'right') d *= 0.6;   // 옆자리는 짧은 변이라 가중치
        if (d < bd) { bd = d; best = sd; }
      }
      return best;
    }
    function openBubble(f, side) {
      closeBubble(side);
      var pi = SIDES.indexOf(side);
      var b = el('div', 'df-bubble'); b.style.setProperty('--pc', PCOL[pi]);
      var rot = side === 'top' ? 180 : side === 'left' ? 90 : side === 'right' ? -90 : 0;
      b.style.setProperty('--rot', rot + 'deg');
      var h = el('h4'); b.appendChild(h);
      var info = el('div', 'df-binfo'); b.appendChild(info);
      var row = el('div', 'df-brow'); b.appendChild(row);
      function btn(cls, html, fn) { var x = el('button', 'df-bbtn ' + cls, html); x.addEventListener('click', function () { fn(); }); row.appendChild(x); return x; }
      var bb = { el: b, fac: f, side: side, player: pi, h: h, info: info, cache: {} };
      bb.up = btn('df-bup', '⬆<b>강화</b><small></small>', function () { var r = upgrade(bb.fac); if (typeof r === 'string') { toast(r); snd('wrong'); } refreshBubble(bb, true); });
      bb.rep = btn('df-brep', '🔧<b>수리</b><small></small>', function () { var r = repair(bb.fac); if (typeof r === 'string') { toast(r); snd('wrong'); } refreshBubble(bb, true); });
      bb.sell = btn('df-bsell', '💰<b>철거</b><small></small>', function () { sell(bb.fac); closeBubble(side); });
      btn('df-bclose', '✕<b>닫기</b>', function () { closeBubble(side); snd('tap'); });
      hud.appendChild(b); bubbles[side] = bb;
      if (G) G.tutBubble = true;
      refreshBubble(bb, true); placeBubbles();
      snd('select');
    }
    function closeBubble(side) { var b = bubbles[side]; if (b) { b.el.remove(); delete bubbles[side]; } }
    function closeAllBubbles() { Object.keys(bubbles).forEach(closeBubble); }
    function refreshBubble(bb, force) {
      if (!G || G.facs.indexOf(bb.fac) < 0) { closeBubble(bb.side); return; }
      var f = bb.fac, F = FAC[f.type], c = bb.cache;
      setTxt(bb.h, c, 'h', F.icon + ' ' + F.name + ' <span>' + f.lvl + '단계</span>');
      var inf = '';
      if (f.type === 'tower') inf = '사거리 ' + Math.round(towerRange(f)) + (f.boost ? ' (👁️ +' + Math.round(f.boost * 100) + '%)' : '') + ' · 방패병에 ' + Math.round(EN.shield.armor[f.lvl - 1] * 100) + '%';
      else if (f.type === 'wall') inf = f.broken ? '무너졌어요! 수리하면 다시 막아요' : '튼튼함 ' + Math.ceil(f.hp) + '/' + f.max;
      else if (f.type === 'watch') inf = '살피는 거리 ' + F.reveal[f.lvl - 1] + ' · 진지 사거리 +' + Math.round(F.boost[f.lvl - 1] * 100) + '%';
      else inf = '공격을 막을 때마다 🌾 +' + F.income[f.lvl - 1];
      setTxt(bb.info, c, 'i', inf);
      var uc = upCost(f);
      setTxt(bb.up.lastChild, c, 'u', uc == null ? '최고 단계' : '🌾 ' + uc);
      bb.up.classList.toggle('df-off', uc == null || uc > G.res || f.broken);
      var rc = repairCost(f);
      bb.rep.style.display = f.type === 'wall' ? '' : 'none';
      setTxt(bb.rep.lastChild, c, 'r', rc ? '🌾 ' + rc : '튼튼함');
      bb.rep.classList.toggle('df-off', !rc || rc > G.res);
      setTxt(bb.sell.lastChild, c, 's', '+' + sellValue(f) + (G.phase === 'prep' ? ' (전액)' : ' (절반)'));
    }
    function placeBubbles() {
      Object.keys(bubbles).forEach(function (side) {
        var bb = bubbles[side]; if (!bb.fac) return;
        var p = toStage(bb.fac.x, bb.fac.y - 20), d = 150 * Math.min(1.3, cam.z);
        var x = p.x, y = p.y;
        if (side === 'bottom') y += d; else if (side === 'top') y -= d; else if (side === 'left') x -= d; else x += d;
        var horiz = side === 'bottom' || side === 'top';
        x = clamp(x, horiz ? 420 : 330, horiz ? 1500 : 1590); y = clamp(y, horiz ? 250 : 380, horiz ? 830 : 700);
        var key = Math.round(x) + ',' + Math.round(y);
        if (bb.pos !== key) { bb.pos = key; bb.el.style.left = x + 'px'; bb.el.style.top = y + 'px'; }
      });
    }

    /* ---------------- 입력 (Pointer Events, pointerId 별) ---------------- */
    function pt(e) { return host.mapPoint(e.clientX, e.clientY); }
    function facAt(wx, wy) {
      var best = null, bd = 56;
      G.facs.forEach(function (f) { var d = dist(wx, wy, f.x, f.y - (f.type === 'wall' ? 0 : 20)); if (d < bd) { bd = d; best = f; } });
      return best;
    }
    function snapFor(p) {
      var list = kindOf(p.type) === 'slot' ? G.ctx.slots : G.ctx.spots, best = null, bd = 80;
      list.forEach(function (s) {
        if (G.occ[s.id] && G.occ[s.id] !== p.fac) return;
        var d = dist(p.wx, p.wy, s.x, s.y); if (d < bd) { bd = d; best = s.id; }
      });
      return best;
    }
    function onCardDown(e, type, owner, node) {
      if (!G || screen !== 'play') return;
      e.preventDefault(); e.stopPropagation();
      try { node.setPointerCapture(e.pointerId); } catch (er) {}
      var s = pt(e), w = toWorld(s.x, s.y);
      ptrs[e.pointerId] = { kind: 'card', type: type, owner: owner, sx: s.x, sy: s.y, x0: s.x, y0: s.y, wx: w.x, wy: w.y, node: node };
      node.classList.add('df-press');
    }
    function onMapDown(e) {
      if (!G || screen !== 'play') return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      var s = pt(e), w = toWorld(s.x, s.y);
      ptrs[e.pointerId] = { kind: 'press', sx: s.x, sy: s.y, x0: s.x, y0: s.y, wx: w.x, wy: w.y, fac: facAt(w.x, w.y) };
    }
    function onMove(e) {
      var p = ptrs[e.pointerId]; if (!p || !G) return;
      var s = pt(e), w = toWorld(s.x, s.y), moved = dist(s.x, s.y, p.x0, p.y0);
      var dx = s.x - p.sx, dy = s.y - p.sy;
      p.sx = s.x; p.sy = s.y; p.wx = w.x; p.wy = w.y;
      if (p.kind === 'card' && moved > 14) {
        if (G.res < FAC[p.type].cost) { toast('물자가 부족해요 (🌾 ' + FAC[p.type].cost + ' 필요)', { key: 'nores' }); p.kind = 'dead'; snd('wrong'); }
        else { p.kind = 'build'; snd('tap'); }
      } else if (p.kind === 'press' && moved > 16) {
        if (p.fac && G.phase === 'prep') { p.kind = 'move'; p.type = p.fac.type; p.owner = p.fac.owner; }
        else if (p.fac) { toast('공격 중에는 시설을 옮길 수 없어요. 준비 시간에 옮겨요', { key: 'nomove' }); p.kind = cam.z > 1 ? 'pan' : 'dead'; }
        else p.kind = cam.z > 1 ? 'pan' : 'dead';
      }
      if (p.kind === 'pan') { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
      if (p.kind === 'build' || p.kind === 'move') p.snap = snapFor(p);
    }
    function onUp(e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      delete ptrs[e.pointerId];
      if (p.node) p.node.classList.remove('df-press');
      if (!G || screen !== 'play') return;
      var s = pt(e), r;
      if (p.kind === 'build') {
        if (p.snap) { r = place(p.type, p.snap, p.owner); if (typeof r === 'string') { toast(r); snd('wrong'); } }
        else if (s.y > 150 && s.y < 925) { toast(p.type === 'wall' ? '성벽은 길 위 네모 칸에 놓아요' : '둥근 설치 지점에 놓아요', { key: 'badspot' }); snd('wrong'); }
      } else if (p.kind === 'move') {
        if (p.snap && p.snap !== p.fac.spot) { r = moveFac(p.fac, p.snap); if (typeof r === 'string') { toast(r); snd('wrong'); } }
      } else if (p.kind === 'card') {
        var F = FAC[p.type]; toast(F.icon + ' ' + F.name + ' (🌾 ' + F.cost + '): ' + F.desc, { dur: 4200, key: 'info' + p.type }); snd('tap');
      } else if (p.kind === 'press') {
        var side = nearestSide(s.x, s.y);
        if (p.fac) openBubble(p.fac, side);
        else {
          closeBubble(side);
          var wd = toWorld(s.x, s.y);
          if (dist(wd.x, wd.y, D.gate.x, D.gate.y - 30) < 90) toast('🚪 성문: 내구도가 0이 되면 임무 실패예요. 꼭 지켜요!', { key: 'gateinfo' });
        }
      }
    }
    function onCancel(e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      if (p.node) p.node.classList.remove('df-press');
      delete ptrs[e.pointerId];
    }
    cv.addEventListener('pointerdown', onMapDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onCancel);
    root.addEventListener('lostpointercapture', onCancel);
    function noCtx(e) { e.preventDefault(); }
    root.addEventListener('contextmenu', noCtx);

    /* ---------------- 화면: 임무 지도 ---------------- */
    var selectBg = null;
    function showSelect() {
      screen = 'select'; G = null; ptrs = {}; hud.innerHTML = ''; hudRefs = null; bubbles = {};
      scr.className = 'df-screen df-select'; scr.innerHTML = '';
      var c = el('canvas', 'df-sel-bg'); c.width = Math.round(W * Math.min(1, resK)); c.height = Math.round(H * Math.min(1, resK));
      var sg = c.getContext('2d'); var k = c.width / W; sg.setTransform(k, 0, 0, k, 0, 0);
      if (!selectBg) selectBg = makeBg(buildCtx(stageOf(5)), Math.min(1, resK));
      sg.drawImage(selectBg, 0, 0, W, H);
      sg.fillStyle = 'rgba(40,25,10,.38)'; sg.fillRect(0, 0, W, H);
      drawGate(sg, D.gate.x, D.gate.y, 1, 0, 0);
      // 임무 길
      sg.strokeStyle = 'rgba(255,230,160,.85)'; sg.lineWidth = 10; sg.setLineDash([18, 14]); sg.lineCap = 'round';
      sg.beginPath(); NODE_POS.forEach(function (p, i) { if (i) sg.lineTo(p[0], p[1]); else sg.moveTo(p[0], p[1]); }); sg.stroke(); sg.setLineDash([]);
      scr.appendChild(c);
      scr.appendChild(el('div', 'df-title', '<h1>부소산을 막아라!</h1><p>백제의 마지막 방어선을 지켜라!</p>'));
      var tot = 0; Object.keys(save.best).forEach(function (k2) { tot += save.best[k2].stars || 0; });
      scr.appendChild(el('div', 'df-sel-info', '🛡️ ' + players + '명 · 난이도 ' + dm.name + ' · ⭐ ' + tot + '/15'));
      D.stages.forEach(function (st, i) {
        var ok = unlocked(st.id), best = save.best[st.id];
        var b = el('button', 'df-node' + (ok ? '' : ' locked') + (best ? ' cleared' : '') + (st.final ? ' final' : ''));
        b.style.left = NODE_POS[i][0] + 'px'; b.style.top = NODE_POS[i][1] + 'px';
        b.innerHTML = '<div class="df-node-n">' + (ok ? st.id : '🔒') + '</div><div class="df-node-t"><b>' + st.title + '</b><small>' + st.sub + '</small><span>' +
          [1, 2, 3].map(function (s) { return best && best.stars >= s ? '★' : '☆'; }).join('') + '</span></div>';
        b.dataset.stage = st.id;
        b.addEventListener('click', function () {
          if (!ok) { snd('wrong'); toast('앞 단계를 먼저 지켜 내면 열려요 🔒'); return; }
          snd('select'); showBrief(st.id);
        });
        scr.appendChild(b);
      });
      var hb = el('button', 'big-btn df-help-btn', '<span>📖 시설과 적 알아보기</span>');
      hb.addEventListener('click', function () { snd('select'); showHelp(); });
      scr.appendChild(hb);
      var bd = el('div', 'df-badges');
      D.stages.forEach(function (st) { var on = !!save.best[st.id]; bd.appendChild(el('span', 'badge-chip' + (on ? '' : ' df-dim'), (on ? st.badge.icon : '🔒') + ' ' + st.badge.name)); });
      scr.appendChild(bd);
      scr.appendChild(el('div', 'df-notice', '※ 교육용 가상 시뮬레이션이에요. 게임 속 방어 성공은 상상 이야기이며, 실제 백제는 660년에 멸망했어요.'));
    }
    function enemyIcon(type, size) {
      var c = el('canvas', 'df-eic'); var eg = Activities.hiDpi(c, size, size);
      eg.translate(size / 2, size * 0.62); eg.scale(size / 70, size / 70); drawEnemy(eg, type, 0, 0, 1, 0, { still: true });
      return c;
    }
    function facIcon(type, col, size) {
      var c = el('canvas', 'df-eic'); var fg = Activities.hiDpi(c, size, size);
      drawFacIcon(fg, type, size / 2, size * 0.62, size / 120 * (type === 'watch' ? 0.8 : 1), col || PCOL[0]);
      return c;
    }
    function showHelp() {
      var box = el('div', 'df-help');
      box.appendChild(el('h2', '', '📖 방어 시설과 원정대 알아보기'));
      var g1 = el('div', 'df-help-grid');
      FAC_ORDER.forEach(function (t) {
        var F = FAC[t], it = el('div', 'df-help-it'); it.appendChild(facIcon(t, PCOL[cardOwner(t)], 110));
        it.appendChild(el('div', '', '<b>' + F.icon + ' ' + F.name + ' <small>🌾 ' + F.cost + '</small></b><p>' + F.desc + '</p><small class="df-role">담당: ' + ROLE_NAME[t === 'tower' ? 'tower' : t === 'wall' ? 'wall' : t === 'depot' ? 'supply' : 'scout'] + '</small>'));
        g1.appendChild(it);
      });
      ENEMY_ORDER.forEach(function (t) {
        var E = EN[t], it = el('div', 'df-help-it enemy'); it.appendChild(enemyIcon(t, 110));
        it.appendChild(el('div', '', '<b>' + E.name + '</b><p>' + E.desc + '</p>'));
        g1.appendChild(it);
      });
      box.appendChild(g1);
      box.appendChild(el('p', 'df-help-note', '🚪 성문 내구도가 0이 되면 실패해요. 저지된 원정대는 연기와 함께 후퇴해요. ※ 시설과 규칙은 이해를 돕기 위해 단순하게 만든 것이며 실제 백제의 전술이나 기술이 아니에요.'));
      host.modal(box, { close: true, cls: 'wide' });
    }

    /* ---------------- 화면: 임무 설명 ---------------- */
    function showBrief(n) {
      var st = stageOf(n); screen = 'brief';
      scr.className = 'df-screen df-briefscr'; scr.innerHTML = '';
      var card = el('div', 'df-brief');
      var left = el('div', 'df-brief-l');
      var mc = el('canvas', 'df-brief-map'); var mg = Activities.hiDpi(mc, 640, 360);
      mg.scale(640 / W, 360 / H); mg.drawImage(makeBg(buildCtx(st), 0.5), 0, 0, W, H); drawGate(mg, D.gate.x, D.gate.y, 1, 0, 0);
      buildCtx(st).stores.forEach(function (s) { drawStore(mg, s, 0); });
      left.appendChild(mc);
      var types = {}; st.waves.forEach(function (w) { w.forEach(function (gr) { types[gr.type] = true; }); });
      var en = el('div', 'df-brief-en'); en.appendChild(el('h3', '', '이번에 오는 원정대'));
      var row = el('div', 'df-brief-row');
      ENEMY_ORDER.forEach(function (t) { if (!types[t]) return; var it = el('div', 'df-brief-e'); it.appendChild(enemyIcon(t, 84)); it.appendChild(el('b', '', EN[t].name)); row.appendChild(it); });
      en.appendChild(row); left.appendChild(en);
      card.appendChild(left);
      var right = el('div', 'df-brief-r');
      right.appendChild(el('div', 'df-brief-no', st.id + '단계 · ' + st.sub));
      right.appendChild(el('h2', '', st.title));
      right.appendChild(el('div', 'df-simbox small', '<h4>🎮 게임 속 이야기 (교육용 시뮬레이션)</h4><p>' + st.story + '</p>'));
      right.appendChild(el('ol', 'df-goals', st.goals.map(function (x) { return '<li>' + x + '</li>'; }).join('')));
      var rl = el('div', 'df-roles');
      for (var i = 0; i < players; i++) rl.appendChild(el('span', 'df-rolechip', '<i style="background:' + PCOL[i] + '"></i>' + (players === 1 ? '혼자서 모든 역할' : PNAME[i] + ': ' + roles[i].map(function (r) { return ROLE_NAME[r]; }).join(' + '))));
      right.appendChild(rl);
      if (st.final) right.appendChild(el('p', 'df-final-note', '⚠️ 실제 역사: 백제는 660년 신라와 당나라 연합군의 공격으로 사비성이 함락되어 멸망했어요. 이 임무의 승리는 상상으로 만든 교육용 시뮬레이션이에요.' + (players < 4 ? ' (4명이 함께하면 더 좋아요!)' : '')));
      var bt = el('div', 'df-brief-btns');
      var go = el('button', 'big-btn primary', '<span>🛡️ 임무 시작</span>'); go.dataset.act = 'go';
      go.addEventListener('click', function () { snd('select'); startStage(n); });
      var bk = el('button', 'big-btn', '<span>← 임무 지도</span>');
      bk.addEventListener('click', function () { snd('tap'); showSelect(); });
      bt.appendChild(go); bt.appendChild(bk); right.appendChild(bt);
      card.appendChild(right);
      scr.appendChild(card);
    }

    /* ---------------- 화면: 결과 ---------------- */
    function showResult(win, stars, aw) {
      var Gm = G, st = Gm.st; screen = 'result';
      closeAllBubbles(); ptrs = {};
      scr.className = 'df-screen df-resscr'; scr.innerHTML = '';
      var card = el('div', 'df-result' + (win ? ' win' : ' lose'));
      var tools = el('div', 'df-res-tools'); var fl = el('button', 'df-flip', '↻ 돌려 보기');
      fl.addEventListener('click', function () { card.classList.toggle('flipped'); snd('whoosh'); });
      tools.appendChild(fl); card.appendChild(tools);
      card.appendChild(el('h2', '', win ? '🎉 방어 성공!' : '😢 이번에는 지키지 못했어요'));
      card.appendChild(el('div', 'df-stars', win ? [1, 2, 3].map(function (s) { return '<span class="' + (stars >= s ? 'on' : '') + '">★</span>'; }).join('') : '<small>' + (Gm.why || '') + '</small>'));
      var stats = '저지한 원정대 <b>' + Gm.stats.stopped + '</b> · 성문 내구도 <b>' + Math.ceil(Gm.gate.hp) + '/' + Gm.gate.max + '</b>' + (Gm.stores.length ? ' · 창고 식량 <b>' + Math.ceil(foodLeft()) + '/' + foodMax() + '</b>' : '') + ' · 막은 공격 <b>' + (win ? Gm.nWaves : Gm.wave) + '/' + Gm.nWaves + '</b>';
      card.appendChild(el('p', 'df-res-stats', stats));
      if (win) {
        var bdg = el('div', 'df-res-badge', '<span class="badge-chip">' + st.badge.icon + ' ' + st.badge.name + '</span>' + (aw && aw.newBadge ? ' <b class="df-new">새 방어 임무 배지!</b>' : ''));
        card.appendChild(bdg);
      }
      var boxes = el('div', 'df-res-boxes');
      boxes.appendChild(el('div', 'df-simbox', '<h4>🎮 교육용 시뮬레이션 (게임 속 이야기)</h4><p>' + (win ? st.winText : st.loseText) + '</p><small>게임 속 시설과 규칙은 상상으로 만든 것이며 실제 전투를 그대로 재현하지 않아요.</small>'));
      var hc = host.card(st.cards[0]);
      var hist = el('div', 'df-histbox');
      hist.appendChild(el('h4', '', '📜 실제 역사 기록 <small>주제: ' + st.topic + '</small>'));
      if (hc) {
        hist.appendChild(el('div', 'df-hcard', '<span class="df-hicon">' + (hc.icon || '📜') + '</span><div><b>' + hc.title + '</b><p>' + hc.text + '</p>' + (hc.note ? '<small>💡 ' + hc.note + '</small>' : '') + '<small class="df-src">📚 참고: ' + (hc.source || '-') + '</small></div>'));
      }
      var more = st.cards.slice(1).map(function (id) { return host.card(id); }).filter(Boolean);
      if (more.length) hist.appendChild(el('p', 'df-more', (win ? '📚 도감에 함께 등록: ' : '📚 지켜 내면 도감에 등록: ') + more.map(function (c) { return (c.icon || '') + ' ' + c.title; }).join(', ')));
      boxes.appendChild(hist);
      card.appendChild(boxes);
      if (st.final) card.appendChild(el('p', 'df-final-note', '⚠️ 실제 백제는 660년 신라와 당나라 연합군의 공격으로 사비성이 함락되어 멸망했어요. 게임 속 승리는 상상으로 만든 교육용 가상 시뮬레이션이에요.'));
      var bt = el('div', 'df-res-btns');
      if (win && stageOf(Gm.n + 1)) { var nx = el('button', 'big-btn primary', '<span>다음 임무 ▶</span>'); nx.dataset.act = 'next'; nx.addEventListener('click', function () { snd('select'); showBrief(Gm.n + 1); }); bt.appendChild(nx); }
      var rt = el('button', 'big-btn' + (win ? '' : ' primary'), '<span>↻ 다시 도전</span>'); rt.dataset.act = 'retry';
      rt.addEventListener('click', function () { snd('select'); startStage(Gm.n); });
      var mp = el('button', 'big-btn', '<span>🗺️ 임무 지도</span>'); mp.dataset.act = 'map';
      mp.addEventListener('click', function () { snd('tap'); showSelect(); });
      bt.appendChild(rt); bt.appendChild(mp); card.appendChild(bt);
      scr.appendChild(card);
      hud.innerHTML = ''; hudRefs = null;
    }

    /* ---------------- 반복 (requestAnimationFrame 하나) ---------------- */
    function frame(ts) {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      frames++;
      var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
      try {
        if (frames % 90 === 0) {
          var k = clamp(host.scale() * (window.devicePixelRatio || 1), 0.5, 1.5);
          if (Math.abs(k - resK) > 0.05) { setupCanvas(); if (G && !G.dry) bgCanvas = makeBg(G.ctx, resK); }
        }
        if (screen === 'play' && G) {
          if (!hostPaused && !userPaused) {
            acc += dt * speed; var n = 0;
            while (acc >= STEP && n < 16 && G && screen === 'play') { step(STEP); acc -= STEP; n++; }
            if (n >= 16) acc = 0;
          }
          if (G && screen === 'play') { render(); if (frames % 5 === 0) updateHud(); placeBubbles(); }
        }
      } catch (e) { host.error(e); }
    }
    raf = requestAnimationFrame(frame);
    showSelect();

    /* ---------------- 테스트·균형 확인 도구 ---------------- */
    // 남은 공격에서 길마다 오는 적의 양 (자동 배치 전략용)
    function traffic() {
      var w = {};
      G.ctx.paths.forEach(function (P) { w[P.name] = 0.05; });
      for (var i = G.wave; i < G.nWaves; i++) waveGroups(i).forEach(function (gr) { w[gr.path] += gr.n * EN[gr.type].hp * (i === G.wave ? 2 : 1); });
      return w;
    }
    function cover(x, y, R, ignore) {
      var n = 0, tw = traffic();
      G.ctx.paths.forEach(function (P) {
        var c = 0;
        for (var s = 0; s < P.len; s += 12) { var p = posAt(P, s); if (dist(p.x, p.y, x, y) <= R) c++; }
        if (!c) return;
        var already = G.facs.filter(function (f) { return f.type === 'tower' && f !== ignore && project(P, f.x, f.y).d < towerRange(f); }).length;
        n += c * tw[P.name] / (1 + already * 1.2);
      });
      return n;
    }
    function freeSpots(type) { return (kindOf(type) === 'slot' ? G.ctx.slots : G.ctx.spots).filter(function (s) { return !G.occ[s.id]; }); }
    function placeBest(type, owner) {
      var c = freeSpots(type), best = null, bs = -1e9;
      c.forEach(function (s) {
        var sc;
        if (type === 'tower') sc = cover(s.x, s.y, FAC.tower.range[0]);
        else if (type === 'watch') sc = cover(s.x, s.y, FAC.watch.reveal[0]) + G.facs.filter(function (f) { return f.type === 'tower' && dist(f.x, f.y, s.x, s.y) < FAC.watch.reveal[0]; }).length * 30;
        else if (type === 'depot') sc = -cover(s.x, s.y, 200);
        else sc = G.facs.filter(function (f) { return f.type === 'tower' && dist(f.x, f.y, s.x, s.y) < towerRange(f); }).length * 10 + s.on.length * 3;
        if (sc > bs) { bs = sc; best = s; }
      });
      if (!best || G.res < FAC[type].cost) return false;
      return typeof place(type, best.id, owner == null ? cardOwner(type) : owner) !== 'string';
    }
    function autoPrep() {
      var hasScout = G.st.waves.some(function (w) { return w.some(function (gr) { return gr.type === 'scout'; }); });
      var armored = false;
      for (var i = G.wave; i < G.nWaves; i++) waveGroups(i).forEach(function (gr) { if (gr.type === 'shield' || gr.type === 'siege') armored = true; });
      var want = G.ctx.paths.length + 1;
      for (var guard = 0; guard < 40; guard++) {
        var did = false, nt = count('tower'), nw = count('wall');
        if (hasScout && !count('watch') && nt >= 1 && G.res >= FAC.watch.cost) did = placeBest('watch');
        if (!did && !count('depot') && nt >= 2 && G.nWaves - G.wave >= 4 && G.res >= FAC.depot.cost) did = placeBest('depot');
        if (!did && nt < want && G.res >= FAC.tower.cost) did = placeBest('tower');
        if (!did) G.facs.forEach(function (f) { if (!did && f.type === 'wall' && f.hp < f.max * 0.7 && repairCost(f) <= G.res) { repair(f); did = true; } });
        if (!did && nw < Math.ceil(nt / 2) && G.res >= FAC.wall.cost) did = placeBest('wall');
        if (!did && armored) {
          var ts = G.facs.filter(function (f) { return f.type === 'tower' && f.lvl < 3 && upCost(f) <= G.res; });
          ts.sort(function (a, b) { return a.lvl - b.lvl || cover(b.x, b.y, 200, b) - cover(a.x, a.y, 200, a); });
          if (ts.length) { upgrade(ts[0]); did = true; }
        }
        if (!did && G.res >= FAC.tower.cost && freeSpots('tower').length) did = placeBest('tower');
        if (!did) {
          var t2 = G.facs.filter(function (f) { return f.type === 'tower' && f.lvl < 3 && upCost(f) <= G.res; });
          if (t2.length) { upgrade(t2[0]); did = true; }
        }
        if (!did) break;
      }
    }
    function autoPlay(n, mode) {
      startStage(n, { dry: true, noTut: true });
      var steps = 0;
      while (G && !G.finished && steps < 60 * 60 * 30) {
        if (G.phase === 'prep') { if (mode === 'auto') autoPrep(); startWave(false); }
        if (mode === 'auto' && G.phase === 'wave' && steps % 30 === 0) G.facs.forEach(function (f) { if (f.broken && repairCost(f) <= G.res) repair(f); });
        step(STEP); steps++;
      }
      var r = G.result; r.stage = n; r.mode = mode; r.towers = count('tower'); r.walls = count('wall');
      G = null; showSelect();
      return r;
    }
    function validateMap() {
      var out = [];
      D.stages.forEach(function (st) {
        var c = buildCtx(st);
        c.spots.forEach(function (s) {
          c.paths.forEach(function (P) { var d = project(P, s.x, s.y).d; if (d < 66) out.push(st.id + ':' + s.id + ' 길 ' + P.name + ' ' + Math.round(d)); });
          c.spots.forEach(function (o) { if (o !== s && dist(o.x, o.y, s.x, s.y) < 90) out.push(st.id + ':' + s.id + ' 가까움 ' + o.id); });
          c.stores.forEach(function (o) { if (dist(o.x, o.y, s.x, s.y) < 100) out.push(st.id + ':' + s.id + ' 창고 ' + o.id); });
          if (dist(s.x, s.y, D.gate.x, D.gate.y) < 120) out.push(st.id + ':' + s.id + ' 성문');
        });
        c.slots.forEach(function (s) { if (!s.on.length) out.push(st.id + ':' + s.id + ' 길 위가 아님'); });
      });
      return out;
    }
    function find(id) { return G ? G.occ[id] : null; }
    function ret(r) { return typeof r === 'string' ? r : !!r; }
    var debug = {
      state: function () {
        return {
          screen: screen, frames: frames, dead: dead, speed: speed, paused: userPaused || hostPaused, hostPaused: hostPaused, userPaused: userPaused,
          zoom: cam.z, cam: { x: cam.x, y: cam.y }, players: players, difficulty: diffKey, ptrs: Object.keys(ptrs).length, bubbles: Object.keys(bubbles),
          stage: G ? G.n : null, phase: G ? G.phase : null, wave: G ? G.wave + 1 : null, waves: G ? G.nWaves : null,
          res: G ? Math.floor(G.res) : null, gate: G ? G.gate.hp : null, food: G && G.stores.length ? foodLeft() : null, prepLeft: G ? G.prepLeft : null, tut: G ? G.tut : null,
          enemies: G ? G.enemies.length : 0, queue: G ? G.queue.length : 0, stopped: G ? G.stats.stopped : 0, ready: G ? Object.keys(G.ready).filter(function (k) { return G.ready[k]; }) : [],
          facs: G ? G.facs.map(function (f) { return { type: f.type, spot: f.spot, lvl: f.lvl, owner: f.owner, hp: f.hp, max: f.max, broken: f.broken, boost: f.boost }; }) : [],
          result: G ? G.result : null, save: save
        };
      },
      setSpeed: function (s) { speed = s; if (hudRefs) hudRefs.speedBtn.textContent = s + '×'; return speed; },
      startStage: function (n, noTut) { startStage(n, { noTut: !!noTut }); return screen; },
      showSelect: function () { showSelect(); return screen; },
      showBrief: function (n) { showBrief(n); return screen; },
      skipToWave: function (n) { if (!G) return false; G.enemies = []; G.queue = []; G.projs = []; G.wave = clamp(n - 1, 0, G.nWaves - 1); G.phase = 'prep'; G.tut = -1; G.prepLeft = prepTime(); G.ready = {}; return G.wave + 1; },
      winStage: function () { if (!G) return false; G.enemies = []; G.queue = []; G.wave = G.nWaves - 1; G.phase = 'wave'; G.win = true; G.phase = 'end'; G.endT = 0; G.finished = true; finishStage(); return screen; },
      loseStage: function () { if (!G) return false; G.gate.hp = 0; if (G.phase === 'prep') startWave(false); return true; },
      place: function (type, id, owner) { return ret(place(type, id, owner == null ? cardOwner(type) : owner)); },
      upgrade: function (id) { var f = find(id); return f ? ret(upgrade(f)) : 'none'; },
      repair: function (id) { var f = find(id); return f ? ret(repair(f)) : 'none'; },
      sell: function (id) { var f = find(id); return f ? sell(f) : 'none'; },
      move: function (a, b) { var f = find(a); return f ? ret(moveFac(f, b)) : 'none'; },
      fac: function (id) { var f = find(id); return f ? { type: f.type, lvl: f.lvl, hp: f.hp, max: f.max, broken: f.broken, owner: f.owner, spent: f.spent, sell: sellValue(f), up: upCost(f), rep: repairCost(f) } : null; },
      setRes: function (v) { if (G) G.res = v; return v; },
      startWave: function () { return startWave(false); },
      pressStart: function (i) { return pressStart(i == null ? leader : i); },
      ready: function (i) { toggleReady(i); return G ? !!G.ready[i] : null; },
      spawn: function (type, path) { var e = spawn(type, path || G.ctx.paths[0].name); return e ? e.id : null; },
      enemies: function () { return G ? G.enemies.map(function (e) { return { id: e.id, type: e.type, path: e.P.name, s: Math.round(e.s), len: Math.round(e.P.len), x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp * 10) / 10, state: e.state, revealed: e.revealed }; }) : []; },
      fastForward: function (sec) { var n = Math.round(sec / STEP); for (var i = 0; i < n && G && screen === 'play' && !G.finished; i++) step(STEP); return G ? G.phase : screen; },
      autoPlay: function (n, mode) { return autoPlay(n, mode || 'auto'); },
      validateMap: validateMap,
      spotStage: function (id) { var p = placeOf(id); if (!p) return null; var s = toStage(p.x, p.y); return debug.toClient(s.x, s.y); },
      // 무대 좌표 → 화면(client) 좌표 (테스트용, mapPoint 의 역변환)
      toClient: function (sx, sy) { var a = host.mapPoint(0, 0), b = host.mapPoint(1000, 1000), kx = 1000 / (b.x - a.x), ky = 1000 / (b.y - a.y); return { x: (sx - a.x) * kx, y: (sy - a.y) * ky }; },
      cardRect: function (owner, type) {
        var c = root.querySelector('.df-card[data-owner="' + owner + '"][data-type="' + type + '"]'); if (!c) return null;
        var r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      setZoom: function (zi) { setZoom(zi); return cam.z; },
      leader: leader, roles: roles
    };

    return {
      unmount: function () {
        dead = true; cancelAnimationFrame(raf); raf = 0;
        cv.removeEventListener('pointerdown', onMapDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onCancel);
        root.removeEventListener('lostpointercapture', onCancel);
        root.removeEventListener('contextmenu', noCtx);
        ptrs = {}; G = null; bgCanvas = null; selectBg = null; screen = 'gone';
      },
      pause: function () { hostPaused = true; },
      resume: function () { hostPaused = false; last = 0; },
      debug: debug
    };
  }

  if (window.BaekjeHub) {
    BaekjeHub.register({
      id: 'defense',
      notice: '이 게임의 방어 성공은 교육용 가상 시뮬레이션이며 특정 전투가 그대로 있었음을 주장하지 않아요. 실제 백제는 660년에 멸망했어요.',
      mount: mount
    });
  }
})();
