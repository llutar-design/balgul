/* 백제 보물 발굴 탐험대 — 유물 일러스트 (직접 제작한 Canvas 벡터 그림)
 * 모든 유물은 높이 100 단위의 좌표계에서 그린다. opts.angle(라디안)로 돌려 보기를 흉내 낸다. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  var PAL = {
    gold:   ['#5a3806', '#a8741f', '#f0cd72', '#fff4c4', '#d9a441', '#6f460c'],
    silver: ['#3f474c', '#89959b', '#dfe6e9', '#ffffff', '#aeb9be', '#535c61'],
    bronze: ['#2c3a2a', '#5b6b45', '#9b8a50', '#cdb771', '#6e7a4d', '#2f3d2e'],
    stone:  ['#5d5a55', '#8f8b84', '#b9b5ac', '#d3cfc5', '#a19d94', '#605d57']
  };

  function cylGrad(ctx, x0, x1, pal, shift) {
    var g = ctx.createLinearGradient(x0, 0, x1, 0);
    var s = shift || 0;
    g.addColorStop(0, pal[0]);
    g.addColorStop(Math.min(0.95, Math.max(0.05, 0.2 + s)), pal[1]);
    g.addColorStop(Math.min(0.95, Math.max(0.06, 0.38 + s)), pal[2]);
    g.addColorStop(Math.min(0.96, Math.max(0.07, 0.46 + s)), pal[3]);
    g.addColorStop(Math.min(0.97, Math.max(0.08, 0.66 + s)), pal[4]);
    g.addColorStop(1, pal[5]);
    return g;
  }

  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  }

  /* ---------- 연습용 백제풍 토기 (가로 100 × 세로 100) ---------- */
  function potPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(31, 8); ctx.lineTo(69, 8);
    ctx.quadraticCurveTo(65, 13, 64, 19);
    ctx.bezierCurveTo(90, 25, 98, 48, 94, 66);
    ctx.bezierCurveTo(90, 84, 72, 95, 58, 96);
    ctx.lineTo(42, 96);
    ctx.bezierCurveTo(28, 95, 10, 84, 6, 66);
    ctx.bezierCurveTo(2, 48, 10, 25, 36, 19);
    ctx.quadraticCurveTo(35, 13, 31, 8);
    ctx.closePath();
  }
  function drawPot(ctx) {
    potPath(ctx);
    var g = ctx.createRadialGradient(38, 42, 4, 50, 58, 60);
    g.addColorStop(0, '#c5c8c6'); g.addColorStop(0.45, '#8e9391'); g.addColorStop(1, '#4b4f4f');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); potPath(ctx); ctx.clip();
    ctx.strokeStyle = 'rgba(40,44,44,0.28)'; ctx.lineWidth = 0.7;
    for (var i = -100; i < 200; i += 4.5) {
      ctx.beginPath(); ctx.moveTo(i, 28); ctx.lineTo(i + 70, 98); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 98); ctx.lineTo(i + 70, 28); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, 100, 28);
    ctx.strokeStyle = 'rgba(30,32,32,0.55)'; ctx.lineWidth = 1.1;
    [30, 34].forEach(function (y) { ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(50, y + 3, 100, y); ctx.stroke(); });
    var hl = ctx.createRadialGradient(30, 44, 1, 30, 44, 22);
    hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(0, 0, 100, 100);
    ctx.restore();
    ellipse(ctx, 50, 9, 19, 2.4); ctx.fillStyle = '#3a3d3d'; ctx.fill();
    ctx.strokeStyle = '#2b2e2e'; ctx.lineWidth = 1.2; potPath(ctx); ctx.stroke();
  }

  var CRACK_V = [[50, -6], [47, 15], [53, 28], [48, 41], [50, 52], [46, 66], [53, 80], [50, 106]];
  var CRACK_H = [[-6, 52], [14, 47], [27, 55], [40, 49], [50, 52], [62, 56], [75, 48], [88, 55], [106, 51]];
  function piecePolys() {
    var ci = 4, hi = 4;
    var vTop = CRACK_V.slice(0, ci + 1), vBot = CRACK_V.slice(ci);
    var hLeft = CRACK_H.slice(0, hi + 1), hRight = CRACK_H.slice(hi);
    return [
      [[-6, -6]].concat(vTop, hLeft.slice().reverse().slice(1)),
      [[106, -6]].concat(vTop, hRight.slice(1)),
      [[-6, 106]].concat(hLeft, vBot.slice(1)),
      [[106, 106]].concat(vBot.slice().reverse(), hRight.slice(1))
    ];
  }

  /* ---------- 석조사리감 (가로 80 × 세로 100), 돌려 보기 지원 ---------- */
  function drawSarigam(ctx, o) {
    var a = o.angle || 0;
    var W = 54, D = 50, cx = 40;
    var ca = Math.cos(a), sa = Math.sin(a);
    var fw = W * Math.abs(ca), sw = D * Math.abs(sa);
    var total = fw + sw, x0 = cx - total / 2;
    var frontFirst = sa >= 0;          // 정면(또는 뒷면) 왼쪽, 옆면 오른쪽
    var fx = frontFirst ? x0 : x0 + sw, sx = frontFirst ? x0 + fw : x0;
    var rnd = rng(77);

    function face(x, w, shade, kind) {
      if (w < 0.6) return;
      var top = 26, bottom = 97;
      ctx.beginPath();
      ctx.moveTo(x, bottom);
      ctx.lineTo(x, top);
      ctx.bezierCurveTo(x, top - 22, x + w, top - 22, x + w, top);
      ctx.lineTo(x + w, bottom);
      ctx.closePath();
      var g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, shade[0]); g.addColorStop(0.5, shade[1]); g.addColorStop(1, shade[2]);
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      for (var i = 0; i < 520; i++) {                 // 화강암 반점
        var px = x + rnd() * w, py = 4 + rnd() * 94;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(40,38,36,0.35)' : 'rgba(255,255,250,0.35)';
        ctx.fillRect(px, py, 0.5 + rnd() * 0.8, 0.5 + rnd() * 0.8);
      }
      var vg = ctx.createLinearGradient(0, 0, 0, 100);
      vg.addColorStop(0, 'rgba(255,255,255,0.12)'); vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vg; ctx.fillRect(x, 0, w, 100);
      if (kind === 'front') frontDetail(x, w);
      ctx.restore();
      ctx.strokeStyle = 'rgba(50,46,42,0.75)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, top);
      ctx.bezierCurveTo(x, top - 22, x + w, top - 22, x + w, top); ctx.lineTo(x + w, bottom); ctx.stroke();
    }

    function frontDetail(x, w) {
      var k = w / W;                    // 가로 축소 비율
      var nx = x + w / 2;
      var nw = 22 * k, ntop = 36, nbot = 74;
      // 감실(사리를 모시는 작은 방)
      ctx.beginPath();
      ctx.moveTo(nx - nw / 2, nbot); ctx.lineTo(nx - nw / 2, ntop + 9);
      ctx.bezierCurveTo(nx - nw / 2, ntop - 3, nx + nw / 2, ntop - 3, nx + nw / 2, ntop + 9);
      ctx.lineTo(nx + nw / 2, nbot); ctx.closePath();
      var ng = ctx.createLinearGradient(0, ntop, 0, nbot);
      ng.addColorStop(0, '#1d1a17'); ng.addColorStop(1, '#3b3631');
      ctx.fillStyle = ng; ctx.fill();
      ctx.strokeStyle = 'rgba(230,226,215,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(nx - nw / 2, nbot, nw, 1.2);
      // 감실 양옆의 새겨진 글자 (오른쪽부터 읽는다)
      if (k > 0.25 && !o.noText) {
        var R = '百濟昌王十三季太歲在', L = '丁亥妹兄公主供養舍利';
        ctx.save();
        ctx.font = '600 4.3px "Batang","BatangChe","Gungsuh","Malgun Gothic",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var cols = [[nx + nw / 2 + 6.5 * k, R], [nx - nw / 2 - 6.5 * k, L]];
        cols.forEach(function (c) {
          for (var i = 0; i < 10; i++) {
            var cy = 38 + i * 5.3;
            ctx.save(); ctx.translate(c[0], cy); ctx.scale(k, 1);
            ctx.fillStyle = 'rgba(255,255,250,0.45)'; ctx.fillText(c[1][i], 0.35, 0.35);
            ctx.fillStyle = 'rgba(35,30,26,' + (o.dim ? 0.35 : 0.85) + ')'; ctx.fillText(c[1][i], 0, 0);
            ctx.restore();
          }
        });
        ctx.restore();
      }
    }

    var light = ['#9c978e', '#c9c4b9', '#a8a399'];
    var dark = ['#6f6b64', '#8c877e', '#77736b'];
    if (frontFirst) { face(fx, fw, ca >= 0 ? light : dark, ca >= 0 ? 'front' : 'back'); face(sx, sw, dark, 'side'); }
    else { face(sx, sw, dark, 'side'); face(fx, fw, ca >= 0 ? light : dark, ca >= 0 ? 'front' : 'back'); }
    // 받침 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ellipse(ctx, cx, 97.5, total / 2 + 3, 2); ctx.fill();
  }

  /* ---------- 보주형 꼭지 (연봉오리 모양) ---------- */
  function budKnob(ctx, cx, yTop, yBot, wid, pal, x0, x1) {
    var h = yBot - yTop;
    ctx.beginPath();
    ctx.moveTo(cx, yTop);
    ctx.bezierCurveTo(cx + wid * 0.9, yTop + h * 0.35, cx + wid * 0.75, yTop + h * 0.75, cx + wid * 0.35, yBot);
    ctx.lineTo(cx - wid * 0.35, yBot);
    ctx.bezierCurveTo(cx - wid * 0.75, yTop + h * 0.75, cx - wid * 0.9, yTop + h * 0.35, cx, yTop);
    ctx.closePath();
    ctx.fillStyle = cylGrad(ctx, x0, x1, pal); ctx.fill();
    ctx.strokeStyle = pal[0]; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, yTop + h * 0.25); ctx.quadraticCurveTo(cx + wid * 0.25, yTop + h * 0.6, cx, yBot);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
  }

  /* ---------- 청동제사리합 (가로 82 × 세로 100) ---------- */
  function drawHap(ctx, o) {
    var a = o.angle || 0, part = o.part || 'all';
    var cx = 41, bx0 = 13, bx1 = 69, lx0 = 10, lx1 = 72;
    var lift = o.lift || 0;
    var rnd = rng(31);
    if (part !== 'lid') {
      // 몸통
      ctx.beginPath();
      ctx.moveTo(bx0, 44); ctx.lineTo(bx0, 90);
      ctx.ellipse(cx, 90, (bx1 - bx0) / 2, 5, 0, Math.PI, 0, true);
      ctx.lineTo(bx1, 44); ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, bx0, bx1, PAL.bronze); ctx.fill();
      ctx.save(); ctx.clip();
      for (var i = 0; i < 90; i++) {           // 청동 녹 얼룩
        ctx.fillStyle = 'rgba(' + (60 + rnd() * 40 | 0) + ',' + (140 + rnd() * 60 | 0) + ',' + (110 + rnd() * 40 | 0) + ',' + (0.12 + rnd() * 0.25) + ')';
        ellipse(ctx, bx0 + rnd() * (bx1 - bx0), 44 + rnd() * 50, 0.8 + rnd() * 2.5, 0.6 + rnd() * 1.8); ctx.fill();
      }
      // 새겨진 글자 (돌려 보면 둘레를 따라 움직인다)
      if (!o.noText) {
        var txt = '丁酉年二月十五日百濟王昌爲亡王子立刹本舍利二枚葬時神化爲三';
        var cols = 6, per = 5, r = (bx1 - bx0) / 2;
        ctx.font = '600 4.4px "Batang","BatangChe","Malgun Gothic",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var c = 0; c < cols; c++) {
          var th = (c - (cols - 1) / 2) * 0.32 + a;
          var z = Math.cos(th);
          if (z < 0.15) continue;
          var x = cx - Math.sin(th) * r * 0.92;
          for (var j = 0; j < per; j++) {
            var ch = txt[c * per + j]; if (!ch) continue;
            ctx.save(); ctx.translate(x, 52 + j * 6.4); ctx.scale(Math.max(0.2, z), 1);
            ctx.fillStyle = 'rgba(255,240,190,' + 0.35 * z + ')'; ctx.fillText(ch, 0.3, 0.3);
            ctx.fillStyle = 'rgba(25,30,20,' + 0.8 * z + ')'; ctx.fillText(ch, 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.restore();
      ctx.strokeStyle = '#1f281d'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(bx0, 44); ctx.lineTo(bx0, 90); ctx.ellipse(cx, 90, (bx1 - bx0) / 2, 5, 0, Math.PI, 0, true); ctx.lineTo(bx1, 44); ctx.stroke();
      // 아가리
      ellipse(ctx, cx, 44, (bx1 - bx0) / 2, 4.5);
      ctx.fillStyle = part === 'body' ? '#1b211a' : '#46523a'; ctx.fill();
      ctx.strokeStyle = '#2a3526'; ctx.stroke();
    }
    if (part !== 'body') {
      ctx.save(); ctx.translate(0, -lift);
      // 뚜껑
      ctx.beginPath();
      ctx.moveTo(lx0, 47); ctx.lineTo(lx0, 40);
      ctx.bezierCurveTo(lx0, 26, lx1, 26, lx1, 40);
      ctx.lineTo(lx1, 47);
      ctx.ellipse(cx, 47, (lx1 - lx0) / 2, 4, 0, 0, Math.PI, false);
      ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, lx0, lx1, PAL.bronze); ctx.fill();
      ctx.strokeStyle = '#1f281d'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(230,210,140,0.5)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(lx0 + 1, 41); ctx.bezierCurveTo(lx0 + 4, 33, lx1 - 4, 33, lx1 - 1, 41); ctx.stroke();
      // 연꽃 받침 + 꼭지
      ellipse(ctx, cx, 30.5, 9, 2.6); ctx.fillStyle = cylGrad(ctx, cx - 9, cx + 9, PAL.bronze); ctx.fill(); ctx.strokeStyle = '#1f281d'; ctx.stroke();
      budKnob(ctx, cx, 12, 30, 9, PAL.bronze, cx - 9, cx + 9);
      ctx.restore();
    }
  }

  /* ---------- 은제사리호 (가로 90 × 세로 100) ---------- */
  function drawHo(ctx, o) {
    var part = o.part || 'all', lift = o.lift || 0;
    var cx = 45;
    if (part !== 'lid') {
      ctx.beginPath(); ctx.moveTo(35, 89); ctx.lineTo(33, 97); ctx.lineTo(57, 97); ctx.lineTo(55, 89); ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, 33, 57, PAL.silver); ctx.fill(); ctx.strokeStyle = '#3a4246'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(29, 40);
      ctx.bezierCurveTo(4, 46, 4, 86, 36, 90);
      ctx.lineTo(54, 90);
      ctx.bezierCurveTo(86, 86, 86, 46, 61, 40);
      ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, 8, 82, PAL.silver); ctx.fill();
      ctx.save(); ctx.clip();
      var tg = ctx.createLinearGradient(0, 40, 0, 92);
      tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(70,60,50,0.22)');
      ctx.fillStyle = tg; ctx.fillRect(0, 40, 90, 52);
      ctx.strokeStyle = 'rgba(70,80,86,0.5)'; ctx.lineWidth = 0.7;
      [56, 59].forEach(function (y) { ctx.beginPath(); ctx.ellipse(cx, y, 36, 3, 0, 0, Math.PI); ctx.stroke(); });
      ctx.restore();
      ctx.strokeStyle = '#3a4246'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(29, 40); ctx.bezierCurveTo(4, 46, 4, 86, 36, 90); ctx.lineTo(54, 90); ctx.bezierCurveTo(86, 86, 86, 46, 61, 40); ctx.stroke();
      ellipse(ctx, cx, 40, 16, 3); ctx.fillStyle = part === 'body' ? '#22282b' : '#7d888d'; ctx.fill(); ctx.stroke();
    }
    if (part !== 'body') {
      ctx.save(); ctx.translate(0, -lift);
      ctx.beginPath();
      ctx.moveTo(25, 42); ctx.bezierCurveTo(25, 27, 65, 27, 65, 42);
      ctx.ellipse(cx, 42, 20, 3, 0, 0, Math.PI, false); ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, 25, 65, PAL.silver); ctx.fill(); ctx.strokeStyle = '#3a4246'; ctx.lineWidth = 0.8; ctx.stroke();
      budKnob(ctx, cx, 17, 32, 7, PAL.silver, cx - 7, cx + 7);
      ctx.restore();
    }
  }

  /* ---------- 금제사리병 (가로 62 × 세로 100) ---------- */
  function drawByeong(ctx, o) {
    var part = o.part || 'all', lift = o.lift || 0;
    var cx = 31;
    if (part !== 'lid') {
      ctx.beginPath();
      ctx.moveTo(26, 28); ctx.lineTo(26, 46);
      ctx.bezierCurveTo(4, 54, 2, 92, 22, 96);
      ctx.lineTo(40, 96);
      ctx.bezierCurveTo(60, 92, 58, 54, 36, 46);
      ctx.lineTo(36, 28); ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, 5, 57, PAL.gold); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = cylGrad(ctx, 26, 36, PAL.gold); ctx.fillRect(26, 26, 10, 22);
      var hl = ctx.createRadialGradient(22, 66, 1, 22, 66, 14);
      hl.addColorStop(0, 'rgba(255,255,230,0.6)'); hl.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = hl; ctx.fillRect(0, 40, 62, 60);
      ctx.restore();
      ctx.strokeStyle = '#5a3806'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(26, 28); ctx.lineTo(26, 46); ctx.bezierCurveTo(4, 54, 2, 92, 22, 96); ctx.lineTo(40, 96); ctx.bezierCurveTo(60, 92, 58, 54, 36, 46); ctx.lineTo(36, 28); ctx.stroke();
      ellipse(ctx, cx, 28, 7, 2); ctx.fillStyle = cylGrad(ctx, 24, 38, PAL.gold); ctx.fill(); ctx.stroke();
      if (part === 'body') { ellipse(ctx, cx, 28, 4, 1.1); ctx.fillStyle = '#3a2404'; ctx.fill(); }
    }
    if (part !== 'body') {
      ctx.save(); ctx.translate(0, -lift);
      budKnob(ctx, cx, 6, 27, 10, PAL.gold, cx - 10, cx + 10);
      ctx.restore();
    }
  }

  /* ---------- 백제금동대향로 (가로 50 × 세로 100) ---------- */
  function drawHyangno(ctx, o) {
    var a = o.angle || 0;
    var cx = 25, G = PAL.gold;
    var rnd = rng(1993);

    // --- 받침: 용 ---
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function goldStroke(w) { ctx.strokeStyle = cylGrad(ctx, 3, 47, G); ctx.lineWidth = w; }
    // 똬리 튼 몸통 (받침 원)
    goldStroke(5.2);
    ctx.beginPath(); ctx.ellipse(cx, 93, 19, 4.2, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(70,40,5,0.65)'; ctx.lineWidth = 0.6;
    for (var s = 0; s < 34; s++) {       // 비늘
      var t = s / 34 * TAU;
      var sx = cx + Math.cos(t) * 19, sy = 93 + Math.sin(t) * 4.2;
      ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    // 위로 솟는 몸통 (S자)
    goldStroke(5);
    ctx.beginPath(); ctx.moveTo(40, 92); ctx.bezierCurveTo(46, 84, 34, 82, 30, 84); ctx.bezierCurveTo(20, 87, 12, 82, 18, 77); ctx.stroke();
    goldStroke(4.2);
    ctx.beginPath(); ctx.moveTo(18, 77); ctx.bezierCurveTo(22, 74, 26, 76, 25, 72); ctx.stroke();
    // 다리와 발톱
    goldStroke(2.2);
    [[12, 92, 6, 97], [38, 92, 44, 97], [33, 84, 41, 80], [17, 83, 9, 80]].forEach(function (l) {
      ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo((l[0] + l[2]) / 2, l[1] - 2, l[2], l[3]); ctx.stroke();
      ctx.lineWidth = 0.9; ctx.beginPath();
      for (var k = -1; k <= 1; k++) { ctx.moveTo(l[2], l[3]); ctx.lineTo(l[2] + k * 1.4 + (l[2] > l[0] ? 1.2 : -1.2), l[3] + 1.2); }
      ctx.stroke(); ctx.lineWidth = 2.2;
    });
    // 갈기와 지느러미
    ctx.strokeStyle = 'rgba(255,230,150,0.8)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(30, 84); ctx.lineTo(31, 81); ctx.moveTo(26, 85.5); ctx.lineTo(26, 82.5); ctx.moveTo(21, 84.5); ctx.lineTo(19.5, 81.5); ctx.stroke();
    // 용머리: 고개를 들어 벌린 입으로 기둥을 물고 있다
    ctx.strokeStyle = cylGrad(ctx, 12, 38, G); ctx.lineWidth = 0.9;
    ctx.beginPath();                       // 갈기 (뒤로 흩날림)
    for (var mn = 0; mn < 5; mn++) { ctx.moveTo(20 - mn * 0.3, 77 + mn * 0.6); ctx.quadraticCurveTo(15 - mn, 77 + mn, 13.5 - mn * 0.6, 80 + mn * 0.8); ctx.moveTo(30 + mn * 0.3, 77 + mn * 0.6); ctx.quadraticCurveTo(35 + mn, 77 + mn, 36.5 + mn * 0.6, 80 + mn * 0.8); }
    ctx.stroke();
    ctx.beginPath();                       // 아래턱과 머리
    ctx.moveTo(19.5, 79); ctx.bezierCurveTo(17.5, 76, 18, 73, 20.5, 72.2);
    ctx.lineTo(22.3, 71.6); ctx.lineTo(27.7, 71.6); ctx.lineTo(29.5, 72.2);
    ctx.bezierCurveTo(32, 73, 32.5, 76, 30.5, 79);
    ctx.bezierCurveTo(28, 80.5, 22, 80.5, 19.5, 79); ctx.closePath();
    ctx.fillStyle = cylGrad(ctx, 17, 33, G); ctx.fill(); ctx.strokeStyle = G[0]; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath();                       // 위턱 (기둥을 감싸 무는 입술)
    ctx.moveTo(20.2, 72.4); ctx.quadraticCurveTo(19.6, 69.4, 22.4, 69.2); ctx.lineTo(22.6, 71.4);
    ctx.moveTo(29.8, 72.4); ctx.quadraticCurveTo(30.4, 69.4, 27.6, 69.2); ctx.lineTo(27.4, 71.4);
    ctx.fillStyle = cylGrad(ctx, 19, 31, G); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff6d0';             // 송곳니
    ctx.beginPath(); ctx.moveTo(22.3, 71.5); ctx.lineTo(22.9, 72.8); ctx.lineTo(23.3, 71.5); ctx.moveTo(27.7, 71.5); ctx.lineTo(27.1, 72.8); ctx.lineTo(26.7, 71.5); ctx.fill();
    ctx.fillStyle = '#3d2604';             // 양옆의 눈과 콧구멍
    ellipse(ctx, 19.9, 74.6, 0.75, 0.55); ctx.fill(); ellipse(ctx, 30.1, 74.6, 0.75, 0.55); ctx.fill();
    ctx.fillStyle = 'rgba(61,38,4,0.6)'; ellipse(ctx, 23.6, 76.2, 0.4, 0.3); ctx.fill(); ellipse(ctx, 26.4, 76.2, 0.4, 0.3); ctx.fill();
    ctx.strokeStyle = cylGrad(ctx, 14, 36, G); ctx.lineWidth = 1.1;    // 뿔
    ctx.beginPath(); ctx.moveTo(20, 73.5); ctx.quadraticCurveTo(16, 71, 15.5, 67.5); ctx.moveTo(30, 73.5); ctx.quadraticCurveTo(34, 71, 34.5, 67.5); ctx.stroke();
    ctx.restore();

    // --- 몸체를 잇는 기둥 (용의 입에 물림) ---
    ctx.fillStyle = cylGrad(ctx, 22.5, 27.5, G);
    ctx.fillRect(22.5, 66, 5, 5.5);

    // --- 몸체: 연꽃 ---
    ctx.beginPath();
    ctx.moveTo(4.5, 50); ctx.bezierCurveTo(5, 60, 14, 67, 22, 68);
    ctx.lineTo(28, 68); ctx.bezierCurveTo(36, 67, 45, 60, 45.5, 50); ctx.closePath();
    ctx.fillStyle = cylGrad(ctx, 4, 46, G); ctx.fill();
    var bodyR = function (y) { var t = (y - 50) / 18; return 20.5 * Math.sqrt(Math.max(0, 1 - t * t * 0.86)); };
    [[52, 9, 0], [57.5, 9, 0.35], [63, 9, 0]].forEach(function (row, ri) {
      var y = row[0], n = row[1], r = bodyR(y + 3);
      var petals = [];
      for (var p = 0; p < n; p++) {
        var ph = p / n * TAU + row[2] + a;
        petals.push({ ph: ph, z: Math.cos(ph) });
      }
      petals.sort(function (p1, p2) { return p1.z - p2.z; });
      petals.forEach(function (pt) {
        if (pt.z < -0.1) return;
        var x = cx + Math.sin(pt.ph) * r, w = (TAU * r / n) * 0.5 * (0.3 + 0.7 * pt.z), h = 7.2;
        ctx.beginPath();
        ctx.moveTo(x, y - h * 0.15);
        ctx.bezierCurveTo(x + w, y + h * 0.15, x + w * 0.8, y + h, x, y + h * 1.05);
        ctx.bezierCurveTo(x - w * 0.8, y + h, x - w, y + h * 0.15, x, y - h * 0.15);
        var lum = 0.55 + 0.45 * pt.z;
        var pg = ctx.createLinearGradient(x - w, 0, x + w, 0);
        pg.addColorStop(0, shade(G[1], lum * 0.8)); pg.addColorStop(0.45, shade(G[3], lum)); pg.addColorStop(1, shade(G[4], lum * 0.85));
        ctx.fillStyle = pg; ctx.fill();
        ctx.strokeStyle = 'rgba(80,48,6,0.7)'; ctx.lineWidth = 0.45; ctx.stroke();
        if (pt.z > 0.3) {                 // 꽃잎 잎맥과 작은 부조
          ctx.strokeStyle = 'rgba(90,56,6,0.55)'; ctx.lineWidth = 0.35;
          ctx.beginPath(); ctx.moveTo(x, y + h * 0.05); ctx.quadraticCurveTo(x + w * 0.12, y + h * 0.5, x, y + h * 0.95); ctx.stroke();
          if (pt.z > 0.7 && (ri + Math.round(pt.ph * 3)) % 3 === 0) {
            ctx.fillStyle = 'rgba(90,56,6,0.5)';
            ctx.beginPath(); ctx.moveTo(x - w * 0.3, y + h * 0.55); ctx.quadraticCurveTo(x, y + h * 0.38, x + w * 0.3, y + h * 0.55); ctx.lineTo(x + w * 0.42, y + h * 0.45); ctx.lineTo(x + w * 0.4, y + h * 0.65); ctx.closePath(); ctx.fill();
          }
        }
      });
    });

    // --- 뚜껑: 겹겹의 산봉우리 ---
    var lidTop = 17, lidBot = 50;
    var lidR = function (y) { var t = (y - lidTop) / (lidBot - lidTop); return 3.5 + 18 * Math.sin(Math.min(1, t) * Math.PI / 2 * 0.98); };
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, lidTop);
    for (var yy = lidTop; yy <= lidBot; yy += 1) ctx.lineTo(cx - lidR(yy), yy);
    for (yy = lidBot; yy >= lidTop; yy -= 1) ctx.lineTo(cx + lidR(yy), yy);
    ctx.closePath();
    ctx.fillStyle = cylGrad(ctx, 3, 47, ['#3e2604', '#7a5014', '#b78a35', '#d8b05a', '#93661f', '#3e2604']);
    ctx.fill();
    // 뚜껑 테두리 띠
    ctx.beginPath(); ctx.ellipse(cx, 50, 21.5, 2.2, 0, 0, TAU);
    ctx.fillStyle = cylGrad(ctx, 3.5, 46.5, G); ctx.fill(); ctx.strokeStyle = G[0]; ctx.lineWidth = 0.4; ctx.stroke();

    var peaks = [];
    var rows = [[46, 14], [41, 13], [36, 12], [31, 10], [26.5, 8]];
    rows.forEach(function (row, ri) {
      var y = row[0], n = row[1], r = lidR(y) * 0.98;
      for (var p = 0; p < n; p++) {
        var ph = (p + (ri % 2) * 0.5) / n * TAU + a;
        peaks.push({ y: y, r: r, ph: ph, z: Math.cos(ph), w: TAU * r / n, ri: ri, deco: rnd() });
      }
    });
    peaks.sort(function (p1, p2) { return p1.z - p2.z || p1.y - p2.y; });
    peaks.forEach(function (pk) {
      if (pk.z < -0.25) return;
      var x = cx + Math.sin(pk.ph) * pk.r;
      var w = pk.w * (0.32 + 0.68 * Math.max(0, pk.z)) * 0.72 + 0.6;
      var h = 6.2 - pk.ri * 0.4;
      var lum = 0.5 + 0.5 * Math.max(0, pk.z);
      ctx.beginPath();
      ctx.moveTo(x - w, pk.y + 1.2);
      ctx.bezierCurveTo(x - w * 0.7, pk.y - h * 0.4, x - w * 0.35, pk.y - h, x, pk.y - h);
      ctx.bezierCurveTo(x + w * 0.35, pk.y - h, x + w * 0.7, pk.y - h * 0.4, x + w, pk.y + 1.2);
      ctx.closePath();
      var g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, shade(G[1], lum * 0.75)); g.addColorStop(0.4, shade(G[3], lum)); g.addColorStop(1, shade(G[4], lum * 0.7));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(70,40,4,0.75)'; ctx.lineWidth = 0.4; ctx.stroke();
      if (pk.z > 0.35) {
        ctx.strokeStyle = 'rgba(90,55,8,0.6)'; ctx.lineWidth = 0.3;
        ctx.beginPath(); ctx.moveTo(x - w * 0.2, pk.y - h * 0.7); ctx.quadraticCurveTo(x, pk.y - h * 0.3, x - w * 0.1, pk.y); ctx.stroke();
        if (pk.deco < 0.3) {              // 나무
          ctx.fillStyle = shade('#6f460c', lum);
          ctx.fillRect(x + w * 0.25, pk.y - h * 0.55, 0.35, 1.6);
          ellipse(ctx, x + w * 0.25, pk.y - h * 0.62, 0.9, 0.7); ctx.fill();
        } else if (pk.deco < 0.55) {      // 동물
          ctx.fillStyle = shade('#5a3806', lum);
          ellipse(ctx, x - w * 0.3, pk.y - h * 0.25, 1.1, 0.5); ctx.fill();
          ctx.fillRect(x - w * 0.3 - 1.1, pk.y - h * 0.25, 0.25, 0.9); ctx.fillRect(x - w * 0.3 + 0.8, pk.y - h * 0.25, 0.25, 0.9);
        } else if (pk.deco < 0.7) {       // 사람
          ctx.fillStyle = shade('#4a2e05', lum);
          ellipse(ctx, x + w * 0.1, pk.y - h * 0.45, 0.45, 0.45); ctx.fill();
          ctx.fillRect(x + w * 0.1 - 0.35, pk.y - h * 0.4, 0.7, 1.5);
        }
      }
    });

    // --- 다섯 악사와 다섯 마리 새 ---
    var figs = [];
    for (var m = 0; m < 5; m++) {
      var ph = m / 5 * TAU + a + 0.3;
      figs.push({ ph: ph, z: Math.cos(ph), m: m });
    }
    figs.sort(function (f1, f2) { return f1.z - f2.z; });
    figs.forEach(function (f) {
      if (f.z < -0.1) return;
      var r = lidR(22) * 0.95, x = cx + Math.sin(f.ph) * r, y = 22.6, k = (0.45 + 0.55 * f.z) * 1.35;
      var col = shade(G[3], 0.55 + 0.45 * f.z);
      // 악사: 머리, 몸, 악기
      ctx.fillStyle = shade(G[4], 0.5 + 0.5 * f.z);
      ctx.beginPath(); ctx.moveTo(x - 1.6 * k, y + 2.6); ctx.quadraticCurveTo(x, y - 1.2, x + 1.6 * k, y + 2.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ellipse(ctx, x, y - 0.6, 0.85 * k, 0.85); ctx.fill();
      ctx.strokeStyle = shade(G[0], 1); ctx.lineWidth = 0.35;
      if (f.m === 0) { ctx.beginPath(); ctx.moveTo(x - 1.3 * k, y + 0.6); ctx.lineTo(x + 2 * k, y + 2); ctx.stroke(); }          // 거문고류
      else if (f.m === 1) { ctx.beginPath(); ctx.moveTo(x + 0.3, y); ctx.lineTo(x + 0.6 * k, y + 2.4); ctx.stroke(); }            // 피리
      else if (f.m === 2) { ellipse(ctx, x + 0.9 * k, y + 1.4, 0.8 * k, 0.8); ctx.stroke(); }                                         // 완함
      else if (f.m === 3) { ctx.fillStyle = shade(G[1], 1); ctx.fillRect(x - 0.9 * k, y + 1, 1.8 * k, 0.9); }                        // 배소
      else { ellipse(ctx, x, y + 1.6, 1.1 * k, 0.6); ctx.stroke(); }                                                                   // 북
      // 새
      var bx = cx + Math.sin(f.ph + 0.63) * lidR(19) * 0.9, by = 19.4;
      ctx.fillStyle = shade(G[3], 0.5 + 0.5 * Math.cos(f.ph + 0.63));
      ctx.beginPath(); ctx.moveTo(bx - 1.1, by); ctx.quadraticCurveTo(bx, by - 1.6, bx + 1.1, by - 0.4); ctx.lineTo(bx + 0.2, by + 0.5); ctx.closePath(); ctx.fill();
    });

    // --- 꼭대기 봉황 ---
    ctx.save();
    ctx.lineJoin = 'round';
    // 꼬리깃
    ctx.beginPath(); ctx.moveTo(26, 12); ctx.bezierCurveTo(31, 6, 31, 1.5, 28.5, 0.6); ctx.bezierCurveTo(30, 4, 28, 8, 25, 11); ctx.closePath();
    ctx.fillStyle = cylGrad(ctx, 24, 32, G); ctx.fill(); ctx.strokeStyle = G[0]; ctx.lineWidth = 0.4; ctx.stroke();
    // 날개 (양쪽)
    [-1, 1].forEach(function (sd) {
      ctx.beginPath();
      ctx.moveTo(cx + sd * 1.5, 9.5);
      ctx.bezierCurveTo(cx + sd * 6, 5.5, cx + sd * 10.5, 4.5, cx + sd * 12, 6.5);
      ctx.bezierCurveTo(cx + sd * 10, 8, cx + sd * 9.5, 10, cx + sd * 7.5, 10.5);
      ctx.bezierCurveTo(cx + sd * 5, 11.6, cx + sd * 3, 12, cx + sd * 1.5, 12.5);
      ctx.closePath();
      ctx.fillStyle = cylGrad(ctx, cx - 12, cx + 12, G); ctx.fill(); ctx.strokeStyle = G[0]; ctx.lineWidth = 0.4; ctx.stroke();
      ctx.strokeStyle = 'rgba(80,48,6,0.6)'; ctx.lineWidth = 0.3;
      for (var q = 0; q < 4; q++) { ctx.beginPath(); ctx.moveTo(cx + sd * (3 + q * 2), 10.4 - q * 0.6); ctx.lineTo(cx + sd * (4.5 + q * 2), 7.5 - q * 0.6); ctx.stroke(); }
    });
    // 몸통과 목
    ctx.beginPath(); ctx.moveTo(23, 15.5); ctx.bezierCurveTo(21.5, 12, 22.5, 9, 24, 7);
    ctx.bezierCurveTo(23.5, 5, 24, 3.5, 25.5, 3.2); ctx.bezierCurveTo(27, 3.2, 27.5, 4.8, 26.5, 6.5);
    ctx.bezierCurveTo(28.5, 9, 28.5, 12.5, 27, 15.5); ctx.closePath();
    ctx.fillStyle = cylGrad(ctx, 21, 29, G); ctx.fill(); ctx.strokeStyle = G[0]; ctx.lineWidth = 0.4; ctx.stroke();
    // 볏, 부리, 턱 아래 구슬(여의주)
    ctx.fillStyle = G[3];
    ctx.beginPath(); ctx.moveTo(25, 3.3); ctx.quadraticCurveTo(24.4, 1.4, 25.8, 1); ctx.quadraticCurveTo(25.6, 2.3, 26.2, 3.3); ctx.fill();
    ctx.fillStyle = G[1]; ctx.beginPath(); ctx.moveTo(24.4, 4.3); ctx.lineTo(23, 4.9); ctx.lineTo(24.5, 5.2); ctx.fill();
    ellipse(ctx, 24.2, 6.4, 0.9, 0.9); ctx.fillStyle = '#fff2b8'; ctx.fill(); ctx.strokeStyle = G[0]; ctx.lineWidth = 0.3; ctx.stroke();
    ctx.fillStyle = '#2d1b02'; ellipse(ctx, 25.4, 4.2, 0.3, 0.3); ctx.fill();
    // 봉황이 선 받침
    ellipse(ctx, cx, 16.5, 3.6, 1.2); ctx.fillStyle = cylGrad(ctx, 21, 29, G); ctx.fill(); ctx.strokeStyle = G[0]; ctx.stroke();
    ctx.restore();

    // 연기 구멍 표현 (봉황 가슴 앞, 산 사이)
    ctx.fillStyle = 'rgba(40,24,2,0.65)';
    [[cx - 1.5, 13.6], [cx + 1.5, 13.6]].forEach(function (h) { ellipse(ctx, h[0], h[1], 0.45, 0.45); ctx.fill(); });
  }

  // 어두운 쪽은 검정이 아니라 짙은 금동색으로 가라앉혀 회색빛이 돌지 않게 한다
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var dr = 70, dg = 42, db = 6;
    k = Math.max(0, k);
    return 'rgb(' + Math.min(255, dr + (r - dr) * k | 0) + ',' + Math.min(255, dg + (g - dg) * k | 0) + ',' + Math.min(255, db + (b - db) * k | 0) + ')';
  }

  var DEFS = {
    pot:     { aspect: 1.0,  fn: drawPot },
    sarigam: { aspect: 0.8,  fn: drawSarigam },
    hap:     { aspect: 0.82, fn: drawHap },
    ho:      { aspect: 0.9,  fn: drawHo },
    byeong:  { aspect: 0.62, fn: drawByeong },
    hyangno: { aspect: 0.5,  fn: drawHyangno }
  };

  var custom = {};   // 선생님이 등록한 유물 이미지 (artKey → Image)

  function drawFit(ctx, key, x, y, w, h, opts) {
    opts = opts || {};
    var d = DEFS[key]; if (!d) return;
    var img = !opts.noCustom && custom[key];
    ctx.save();
    if (img && img.complete && img.naturalWidth) {
      var s1 = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      var iw = img.naturalWidth * s1, ih = img.naturalHeight * s1;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    } else {
      var s = Math.min(w / (d.aspect * 100), h / 100);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(s, s);
      ctx.translate(-d.aspect * 50, -50);
      d.fn(ctx, opts);
    }
    ctx.restore();
  }

  // 지정한 높이(px)의 캔버스로 그리기 (발굴 마스크·썸네일용)
  function render(key, hPx, opts) {
    var d = DEFS[key];
    var w = Math.ceil(hPx * d.aspect), h = Math.ceil(hPx);
    var c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    drawFit(c.getContext('2d'), key, 0, 0, w, h, Object.assign({ noCustom: true }, opts || {}));
    return c;
  }

  // 실루엣 (잠긴 유물 표시)
  function silhouette(key, hPx, color) {
    var c = render(key, hPx);
    var g = c.getContext('2d');
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color || 'rgba(60,40,20,0.55)';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // 토기 조각 4개: {canvas, ox, oy}  (ox, oy = 완성 토기 캔버스 안에서의 위치)
  function potPieces(sizePx) {
    var full = render('pot', sizePx);
    var k = sizePx / 100;
    return piecePolys().map(function (poly) {
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      poly.forEach(function (p) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); });
      minX = Math.max(0, minX); minY = Math.max(0, minY); maxX = Math.min(100, maxX); maxY = Math.min(100, maxY);
      var ox = Math.floor(minX * k), oy = Math.floor(minY * k);
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(maxX * k) - ox); c.height = Math.max(1, Math.ceil(maxY * k) - oy);
      var g = c.getContext('2d');
      g.translate(-ox, -oy);
      g.beginPath(); poly.forEach(function (p, i) { if (i) g.lineTo(p[0] * k, p[1] * k); else g.moveTo(p[0] * k, p[1] * k); }); g.closePath();
      g.save(); g.clip(); g.drawImage(full, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.strokeStyle = '#b9a58a'; g.lineWidth = Math.max(1.5, 1.6 * k);
      g.stroke();                       // 깨진 단면
      g.restore();
      return { canvas: c, ox: ox, oy: oy };
    });
  }

  function setCustom(key, dataUrl) {
    if (!dataUrl) { delete custom[key]; return; }
    var img = new Image();
    img.src = dataUrl;
    custom[key] = img;
  }

  window.Art = {
    draw: drawFit,
    render: render,
    silhouette: silhouette,
    potPieces: potPieces,
    aspect: function (key) { return DEFS[key] ? DEFS[key].aspect : 1; },
    setCustom: setCustom,
    hasCustom: function (key) { return !!custom[key]; },
    rng: rng
  };
})();
