/* 백제 보물 발굴 탐험대 — 발굴 엔진
 *
 * 구조
 *  - 흙의 깊이를 격자(cell)마다 저장한다. 0 = 지표, L = 바닥(유물이 놓인 면), L+DUST = 유물 위 고운 먼지까지 제거.
 *  - 층마다 미리 만든 질감(오프스크린 캔버스 → 픽셀 배열)을 두고, 손가락이 지나간 영역(dirty rect)만
 *    픽셀 단위로 다시 합성해 putImageData 한다. 전체 화면을 매 프레임 다시 그리지 않는다.
 *  - 캔버스 3장을 겹친다: floor(바닥·유물, 정적) / soil(흙, 부분 갱신) / fx(입자·도구·안내, 매 프레임).
 *  - 입력은 Pointer Events로 pointerId마다 독립 관리하며, 시작 위치에 따라 가까운 플레이어 구역의 도구를 쓴다.
 */
(function () {
  'use strict';

  var DUST = 0.6;
  var CELL = 5;

  var TOOLS = {
    shovel: { radius: 52, rate: 0.22, dustMul: 0, soilMul: 1, sound: 'dig' },
    brush:  { radius: 32, rate: 0.075, dustMul: 0.35, soilMul: 1, sound: 'brush' },
    fine:   { radius: 20, rate: 0.08, dustMul: 1, soilMul: 0.6, sound: 'fine' },
    record: { radius: 0, rate: 0 }
  };

  var THEMES = {
    training:  { layers: ['#7b5b3b', '#9b7449', '#c7a26c', '#b79870'], floor: '#d9bf90', grass: true },
    neungsan:  { layers: ['#6a4d32', '#8f633a', '#b48a58', '#a58663'], floor: '#cdb085', grass: true },
    wangheung: { layers: ['#5d4a37', '#86673f', '#a88b61', '#9a8463'], floor: '#c4ab84', grass: true },
    hyangno:   { layers: ['#5e452f', '#7c5a39', '#93806a', '#6d685d'], floor: '#8a8272', grass: false, mud: true }
  };
  var DUST_RGB = [214, 192, 152];

  var DIFF = {
    easy:   { mul: 1.5, expose: 0.75, ring: 0.55, dust: 0.35 },
    normal: { mul: 1.0, expose: 0.85, ring: 0.7, dust: 0.5 },
    hard:   { mul: 0.75, expose: 0.92, ring: 0.8, dust: 0.65 }
  };

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function create(opts) {
    var site = opts.site;
    var cvFloor = opts.floor, cvSoil = opts.soil, cvFx = opts.fx;
    var W = opts.width, H = opts.height;           // 무대 좌표 단위 크기
    var mapPoint = opts.mapPoint;                   // (clientX, clientY) → 무대 좌표
    var siteX = opts.siteX, siteY = opts.siteY;
    var icons = opts.icons || {};

    var R = 1, Wp = 0, Hp = 0, GW = 0, GH = 0;
    var gFloor, gSoil, gFx;
    var depth, maxD, light, artCell, cellAny, nearCell;
    var artPx, noise, tex = [], out, out32;
    var L = 3, theme, stage, diff = DIFF.normal;
    var finds = [], hotspots = [];
    var dirty = [];
    var particles = [], sparkles = [], effects = [], markers = [], hintMarks = [];
    var pointers = {};
    var players = 1, turnMode = false, turnPlayer = 0;
    var playerTools = ['shovel', 'shovel', 'shovel', 'shovel'];
    var contrib = [0, 0, 0, 0];
    var quality = 100, shovelHits = 0;
    var cb = {};
    var running = false, raf = 0, lastT = 0, statTimer = 0, sparkleTimer = 0;
    var lastProgressT = 0, lastExposedSum = 0, hintTimer = 0, hintsOn = true;
    var revealing = false, frozen = false;
    var lastStats = null, warnT = 0;
    var glowLevel = 0, completeEmitted = false;

    /* ---------------- 준비 ---------------- */

    function setupCanvases(res) {
      R = res;
      Wp = Math.round(W * R); Hp = Math.round(H * R);
      [cvFloor, cvSoil, cvFx].forEach(function (c) { c.width = Wp; c.height = Hp; });
      gFloor = cvFloor.getContext('2d');
      gSoil = cvSoil.getContext('2d');
      gFx = cvFx.getContext('2d');
      GW = Math.ceil(Wp / CELL) + 2; GH = Math.ceil(Hp / CELL) + 2;
    }

    function makeTexture(baseHex, layerIdx, rnd, opt) {
      var c = document.createElement('canvas'); c.width = Wp; c.height = Hp;
      var g = c.getContext('2d');
      var base = hexRgb(baseHex);
      g.fillStyle = baseHex; g.fillRect(0, 0, Wp, Hp);
      // 넓은 얼룩: 작은 캔버스를 확대해서 부드러운 색 변화
      var sc = document.createElement('canvas'); sc.width = 64; sc.height = 32;
      var sg = sc.getContext('2d');
      for (var i = 0; i < 64 * 32; i++) {
        var k = 0.9 + rnd() * 0.2;
        sg.fillStyle = 'rgba(' + (base[0] * k | 0) + ',' + (base[1] * k | 0) + ',' + (base[2] * k | 0) + ',0.4)';
        sg.fillRect(i % 64, (i / 64) | 0, 1, 1);
      }
      g.imageSmoothingEnabled = true;
      g.drawImage(sc, 0, 0, Wp, Hp);
      // 자갈과 돌
      var nStones = opt.mud ? 25 : (40 + layerIdx * 25);
      for (i = 0; i < nStones; i++) {
        var x = rnd() * Wp, y = rnd() * Hp, rr = (3 + rnd() * (layerIdx === 1 ? 14 : 9)) * R;
        var sgd = g.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
        var tone = 110 + rnd() * 90 | 0;
        sgd.addColorStop(0, 'rgb(' + (tone + 40) + ',' + (tone + 34) + ',' + (tone + 26) + ')');
        sgd.addColorStop(1, 'rgb(' + (tone * 0.55 | 0) + ',' + (tone * 0.5 | 0) + ',' + (tone * 0.45 | 0) + ')');
        g.fillStyle = sgd;
        g.beginPath(); g.ellipse(x, y, rr, rr * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.beginPath(); g.ellipse(x + rr * 0.25, y + rr * 0.35, rr, rr * 0.5, 0, 0, Math.PI * 2); g.fill();
      }
      // 흙덩이
      for (i = 0; i < 70; i++) {
        var cx = rnd() * Wp, cy = rnd() * Hp, cr = (6 + rnd() * 16) * R;
        g.fillStyle = 'rgba(' + (base[0] * 0.75 | 0) + ',' + (base[1] * 0.72 | 0) + ',' + (base[2] * 0.7 | 0) + ',0.5)';
        g.beginPath(); g.ellipse(cx, cy, cr, cr * 0.7, rnd() * 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,240,210,0.12)';
        g.beginPath(); g.ellipse(cx - cr * 0.2, cy - cr * 0.25, cr * 0.6, cr * 0.35, 0, 0, Math.PI * 2); g.fill();
      }
      // 나무뿌리 (위쪽 두 층)
      if (layerIdx <= 1 && !opt.mud) {
        g.lineCap = 'round';
        for (i = 0; i < (layerIdx === 0 ? 14 : 8); i++) {
          var rx = rnd() * Wp, ry = rnd() * Hp, ang = rnd() * Math.PI * 2;
          g.strokeStyle = 'rgba(70,45,25,0.75)'; g.lineWidth = (2 + rnd() * 3) * R;
          g.beginPath(); g.moveTo(rx, ry);
          for (var s = 0; s < 4; s++) {
            ang += (rnd() - 0.5) * 1.2;
            var nx = rx + Math.cos(ang) * 50 * R, ny = ry + Math.sin(ang) * 50 * R;
            g.quadraticCurveTo((rx + nx) / 2 + (rnd() - 0.5) * 30 * R, (ry + ny) / 2 + (rnd() - 0.5) * 30 * R, nx, ny);
            rx = nx; ry = ny;
            g.lineWidth *= 0.8;
          }
          g.stroke();
        }
      }
      // 지표: 풀과 낙엽
      if (layerIdx === 0 && opt.grass) {
        for (i = 0; i < 900; i++) {
          var gx = rnd() * Wp, gy = rnd() * Hp, gl = (4 + rnd() * 9) * R;
          g.strokeStyle = rnd() < 0.5 ? 'rgba(96,128,58,0.75)' : 'rgba(128,140,70,0.7)';
          g.lineWidth = 1.4 * R;
          g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + (rnd() - 0.5) * gl, gy - gl); g.stroke();
        }
      }
      // 진흙: 물기 어린 광택
      if (opt.mud && layerIdx === L - 1) {
        for (i = 0; i < 40; i++) {
          g.fillStyle = 'rgba(200,210,215,0.08)';
          g.beginPath(); g.ellipse(rnd() * Wp, rnd() * Hp, (20 + rnd() * 60) * R, (6 + rnd() * 14) * R, rnd() * 3, 0, Math.PI * 2); g.fill();
        }
      }
      var id = g.getImageData(0, 0, Wp, Hp);
      var d = id.data;
      for (i = 0; i < d.length; i += 4) {          // 고운 입자
        var n = (rnd() - 0.5) * 26;
        d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n * 0.9, 0, 255);
      }
      return new Uint32Array(id.data.buffer);
    }

    function drawFloor(rnd) {
      var g = gFloor;
      g.fillStyle = theme.floor; g.fillRect(0, 0, Wp, Hp);
      var base = hexRgb(theme.floor);
      for (var i = 0; i < 2600; i++) {
        var k = 0.82 + rnd() * 0.3;
        g.fillStyle = 'rgba(' + (base[0] * k | 0) + ',' + (base[1] * k | 0) + ',' + (base[2] * k | 0) + ',0.5)';
        var r = (1 + rnd() * 4) * R;
        g.fillRect(rnd() * Wp, rnd() * Hp, r, r);
      }
      // 숯 조각·기와 조각 같은 작은 흔적 (유물 판정에는 포함되지 않음)
      for (i = 0; i < 10; i++) {
        var x = rnd() * Wp, y = rnd() * Hp;
        g.save(); g.translate(x, y); g.rotate(rnd() * 6);
        if (rnd() < 0.5) {
          g.fillStyle = 'rgba(40,36,34,0.55)'; g.fillRect(-4 * R, -2 * R, 8 * R, 4 * R);
        } else {
          g.fillStyle = '#8b8780'; g.strokeStyle = '#5d5a55'; g.lineWidth = R;
          g.beginPath(); g.moveTo(-14 * R, 0); g.quadraticCurveTo(0, -10 * R, 14 * R, 0); g.lineTo(10 * R, 5 * R); g.quadraticCurveTo(0, -3 * R, -10 * R, 5 * R); g.closePath(); g.fill(); g.stroke();
        }
        g.restore();
      }
      if (theme.mud) {
        var mg = g.createRadialGradient(Wp / 2, Hp / 2, 50 * R, Wp / 2, Hp / 2, Wp * 0.6);
        mg.addColorStop(0, 'rgba(120,115,100,0)'); mg.addColorStop(1, 'rgba(50,45,38,0.35)');
        g.fillStyle = mg; g.fillRect(0, 0, Wp, Hp);
      }
    }

    function drawStone(f) {
      // 왕흥사지 목탑 터의 심초석과 사리공
      var g = gFloor, sw = f.w * 1.9, sh = f.h * 1.35;
      g.save(); g.translate(f.x, f.y);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(8 * R, 12 * R, sw * 0.55, sh * 0.55, 0, 0, Math.PI * 2); g.fill();
      var gr = g.createLinearGradient(-sw / 2, -sh / 2, sw / 2, sh / 2);
      gr.addColorStop(0, '#b4afa5'); gr.addColorStop(1, '#77736b');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-sw * 0.5, -sh * 0.38); g.quadraticCurveTo(-sw * 0.42, -sh * 0.55, -sw * 0.1, -sh * 0.52);
      g.lineTo(sw * 0.42, -sh * 0.5); g.quadraticCurveTo(sw * 0.56, -sh * 0.3, sw * 0.5, sh * 0.2);
      g.quadraticCurveTo(sw * 0.45, sh * 0.52, sw * 0.1, sh * 0.5); g.lineTo(-sw * 0.4, sh * 0.48);
      g.quadraticCurveTo(-sw * 0.56, sh * 0.2, -sw * 0.5, -sh * 0.38); g.closePath(); g.fill();
      var rnd = Art.rng(9);
      for (var i = 0; i < 1400; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(50,48,45,0.3)' : 'rgba(255,255,250,0.3)';
        g.fillRect((rnd() - 0.5) * sw * 0.95, (rnd() - 0.5) * sh * 0.95, 1.6 * R, 1.6 * R);
      }
      // 사리공 (네모난 구멍)
      var hw = f.w * 1.12, hh = f.h * 1.08;
      g.fillStyle = '#3d3934'; g.fillRect(-hw / 2, -hh / 2, hw, hh);
      var ig = g.createLinearGradient(0, -hh / 2, 0, hh / 2);
      ig.addColorStop(0, 'rgba(0,0,0,0.6)'); ig.addColorStop(0.25, 'rgba(0,0,0,0.1)'); ig.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ig; g.fillRect(-hw / 2, -hh / 2, hw, hh);
      g.strokeStyle = '#d6d1c6'; g.lineWidth = 2 * R; g.strokeRect(-hw / 2, -hh / 2, hw, hh);
      g.restore();
    }

    function placeFinds(rnd) {
      var defs = stage.finds;
      var out = [];
      var multi = defs.length > 1;
      var slots = [[0.22, 0.3], [0.72, 0.28], [0.3, 0.74], [0.78, 0.72]];
      slots.sort(function () { return rnd() - 0.5; });
      defs.forEach(function (d, i) {
        var art = opts.artifacts[d.artifact];
        var hPx = d.size * R;
        var canvas, pieceOx = 0, pieceOy = 0;
        if (d.piece !== undefined) {
          var pcs = Art.potPieces(hPx);
          var pc = pcs[d.piece];
          canvas = pc.canvas; pieceOx = pc.ox; pieceOy = pc.oy;
        } else {
          canvas = Art.render(art.art, hPx);
        }
        var x, y, rot;
        if (multi) {
          var sl = slots[i % slots.length];
          x = (sl[0] + (rnd() - 0.5) * 0.12) * Wp;
          y = (sl[1] + (rnd() - 0.5) * 0.12) * Hp;
          rot = (rnd() - 0.5) * 1.6;
        } else {
          x = Wp / 2 + (rnd() - 0.5) * 240 * R;
          y = Hp / 2 + (rnd() - 0.5) * Math.max(0, Hp - canvas.height - 40 * R) * 0.8;
          rot = (rnd() - 0.5) * 0.14;
        }
        var ext = Math.max(canvas.width, canvas.height) / 2 + 10 * R;
        x = clamp(x, ext * 0.7, Wp - ext * 0.7);
        y = clamp(y, canvas.height / 2 + 8 * R, Hp - canvas.height / 2 - 8 * R);
        out.push({
          idx: i, def: d, art: art, canvas: canvas, x: x, y: y, rot: rot,
          w: canvas.width, h: canvas.height, pieceOx: pieceOx, pieceOy: pieceOy,
          cells: 0, exposed: 0, dust: 0, ring: 0, ringCleared: 0,
          glimpsed: false, ready: false, recorded: false, nearly: false, record: null
        });
      });
      return out;
    }

    function buildMasks() {
      var mc = document.createElement('canvas'); mc.width = Wp; mc.height = Hp;
      var mg = mc.getContext('2d');
      finds.forEach(function (f, i) {
        var s = document.createElement('canvas'); s.width = f.w; s.height = f.h;
        var sg = s.getContext('2d');
        sg.drawImage(f.canvas, 0, 0);
        sg.globalCompositeOperation = 'source-in';
        // 가장자리 반투명 픽셀의 값 오차를 피하려고 번호를 40 간격으로 칠한 뒤 반올림해 읽는다
        sg.fillStyle = 'rgb(' + ((i + 1) * 40) + ',0,0)'; sg.fillRect(0, 0, f.w, f.h);
        mg.save(); mg.translate(f.x, f.y); mg.rotate(f.rot); mg.drawImage(s, -f.w / 2, -f.h / 2); mg.restore();
      });
      // 바닥 → 유물 그림자 → 유물 본체 순서로 바닥 캔버스에 그린다
      var sh = document.createElement('canvas'); sh.width = Wp; sh.height = Hp;
      var shg = sh.getContext('2d');
      finds.forEach(function (f) {
        shg.save(); shg.translate(f.x + 7 * R, f.y + 9 * R); shg.rotate(f.rot); shg.drawImage(f.canvas, -f.w / 2, -f.h / 2); shg.restore();
      });
      shg.globalCompositeOperation = 'source-in'; shg.fillStyle = 'rgba(40,25,10,0.35)'; shg.fillRect(0, 0, Wp, Hp);
      drawFloorBase();
      gFloor.drawImage(sh, 0, 0);
      finds.forEach(function (f) {
        gFloor.save(); gFloor.translate(f.x, f.y); gFloor.rotate(f.rot); gFloor.drawImage(f.canvas, -f.w / 2, -f.h / 2); gFloor.restore();
      });

      var md = mg.getImageData(0, 0, Wp, Hp).data;
      artPx = new Uint8Array(Wp * Hp);
      for (var p = 0, q = 0; p < artPx.length; p++, q += 4) {
        if (md[q + 3] > 110) {
          var id = Math.round(md[q] / 40);
          if (id >= 1 && id <= finds.length) artPx[p] = id;
        }
      }
      var N = GW * GH;
      artCell = new Int8Array(N).fill(-1);
      cellAny = new Uint8Array(N);
      nearCell = new Uint8Array(N);
      for (var y = 0; y < Hp; y++) {
        var row = y * Wp, cy = (y / CELL) | 0;
        for (var x = 0; x < Wp; x++) {
          var v = artPx[row + x];
          if (v) {
            var c = cy * GW + ((x / CELL) | 0);
            cellAny[c] = v;
            if ((x % CELL) === 2 && (y % CELL) === 2) artCell[c] = v - 1;
          }
        }
      }
      // 주변(링) 영역: 유물에서 일정 거리 안
      var rr = Math.ceil(30 * R / CELL);
      for (var gy = 0; gy < GH; gy++) for (var gx = 0; gx < GW; gx++) {
        var ci = gy * GW + gx;
        if (!cellAny[ci]) continue;
        for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dy * dy > rr * rr) continue;
          var nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          var nc = ny * GW + nx;
          if (!cellAny[nc] && !nearCell[nc]) nearCell[nc] = cellAny[ci];
        }
      }
      finds.forEach(function (f) { f.cells = 0; f.ring = 0; });
      for (ci = 0; ci < N; ci++) {
        if (artCell[ci] >= 0) finds[artCell[ci]].cells++;
        if (nearCell[ci]) finds[nearCell[ci] - 1].ring++;
      }
    }

    var floorRnd;
    function drawFloorBase() {
      drawFloor(Art.rng(floorRnd));
      finds.forEach(function (f) { if (f.def.inStone) drawStone(f); });
    }

    function buildHotspots() {
      hotspots = [];
      finds.forEach(function (f) {
        if (f.def.piece !== undefined) return;
        (f.art.hotspots || []).forEach(function (h) {
          var lx = (h.x - 0.5) * f.w, ly = (h.y - 0.5) * f.h;
          var c = Math.cos(f.rot), s = Math.sin(f.rot);
          hotspots.push({
            find: f.idx, label: h.label, info: h.info,
            x: f.x + lx * c - ly * s, y: f.y + lx * s + ly * c,
            r: Math.max(26 * R, Math.min(f.w, f.h) * 0.09), found: false
          });
        });
      });
    }

    function start(stageDef, settings, callbacks) {
      stop();
      stage = stageDef; cb = callbacks || {};
      theme = THEMES[stage.theme] || THEMES.training;
      L = stage.layers || 3;
      diff = DIFF[settings.difficulty] || DIFF.normal;
      hintsOn = settings.hints !== false;
      players = settings.players || 1;
      turnMode = !!settings.turnMode;
      turnPlayer = 0;
      contrib = [0, 0, 0, 0];
      quality = 100; shovelHits = 0;
      particles = []; sparkles = []; effects = []; markers = []; hintMarks = []; dirty = [];
      pointers = {};
      revealing = false; frozen = false; glowLevel = 0; completeEmitted = false;
      playerTools = ['shovel', 'shovel', 'shovel', 'shovel'];
      setupCanvases(settings.resolution || 1);

      var seed = (Date.now() ^ (stage.id * 7919)) >>> 0;
      var rnd = Art.rng(seed);
      floorRnd = seed + 3;
      finds = placeFinds(rnd);
      buildMasks();
      buildHotspots();

      tex = [];
      for (var i = 0; i < L; i++) tex.push(makeTexture(theme.layers[i], i, Art.rng(seed + 11 + i * 101), theme));
      noise = new Int8Array(Wp * Hp);
      var nr = Art.rng(seed + 5);
      // 부드러운 잡음: 작은 격자 값을 보간해 흙 경계를 울퉁불퉁하게
      var NS = 16 * R;
      var NW = Math.ceil(Wp / NS) + 2, NH = Math.ceil(Hp / NS) + 2, small = new Float32Array(NW * NH);
      for (i = 0; i < small.length; i++) small[i] = nr() * 2 - 1;
      for (var y = 0; y < Hp; y++) {
        var sy = y / NS, iy = sy | 0, fy = sy - iy;
        fy = fy * fy * (3 - 2 * fy);
        for (var x = 0; x < Wp; x++) {
          var sx = x / NS, ix = sx | 0, fx = sx - ix;
          fx = fx * fx * (3 - 2 * fx);
          var a = small[iy * NW + ix], b = small[iy * NW + ix + 1], c = small[(iy + 1) * NW + ix], d = small[(iy + 1) * NW + ix + 1];
          var v = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
          noise[y * Wp + x] = clamp((v * 0.85 + (nr() * 2 - 1) * 0.15) * 127, -127, 127) | 0;
        }
      }

      var N = GW * GH;
      depth = new Float32Array(N);
      maxD = new Float32Array(N);
      light = new Float32Array(N).fill(1);
      for (i = 0; i < N; i++) maxD[i] = cellAny[i] ? L + DUST : L;

      out = gSoil.createImageData(Wp, Hp);
      out32 = new Uint32Array(out.data.buffer);
      renderRect(0, 0, Wp, Hp);
      gSoil.putImageData(out, 0, 0);

      lastProgressT = performance.now(); lastExposedSum = 0; hintTimer = 0;
      running = true;
      lastT = performance.now();
      raf = requestAnimationFrame(loop);
      bindInput();
      emitStats(true);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pointers = {};
      unbindInput();
    }

    /* ---------------- 흙 합성 ---------------- */

    function renderRect(x0, y0, x1, y1) {
      x0 = clamp(x0 | 0, 0, Wp); y0 = clamp(y0 | 0, 0, Hp);
      x1 = clamp(Math.ceil(x1), 0, Wp); y1 = clamp(Math.ceil(y1), 0, Hp);
      var NZ = 0.32 / 127, dr = DUST_RGB;
      var thinStart = L - 0.7;
      for (var y = y0; y < y1; y++) {
        var gy = y / CELL, iy = gy | 0, fy = gy - iy, row = y * Wp;
        var rowC = iy * GW;
        for (var x = x0; x < x1; x++) {
          var gx = x / CELL, ix = gx | 0, fx = gx - ix;
          var c00 = rowC + ix;
          var a = depth[c00], b = depth[c00 + 1], c = depth[c00 + GW], e = depth[c00 + GW + 1];
          var p = row + x;
          var art = artPx[p];
          var base = (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
          // 잡음은 중간 깊이에서만 쓴다: 손대지 않은 지표와 끝까지 판 바닥·유물은 깨끗하게 보이도록
          var top = art ? L + DUST : L;
          var nf = (base < top - base ? base : top - base) * 2.5;
          var d = base + noise[p] * NZ * (nf < 0 ? 0 : nf > 1 ? 1 : nf);
          if (d >= L) {
            if (art) {
              var rem = (L + DUST - d) / DUST;
              if (rem <= 0.04) { out32[p] = 0; continue; }
              var al = (rem > 1 ? 1 : rem) * 205 | 0;
              var nn = noise[p] * 0.08;
              out32[p] = (al << 24) | ((dr[2] + nn) << 16) | ((dr[1] + nn) << 8) | (dr[0] + nn | 0);
            } else out32[p] = 0;
            continue;
          }
          if (d < 0) d = 0;
          var layer = d | 0;
          var col = tex[layer][p];
          var la = light[c00], lb = light[c00 + 1], lc = light[c00 + GW], le = light[c00 + GW + 1];
          var sh = ((la + (lb - la) * fx) * (1 - fy) + (lc + (le - lc) * fx) * fy) * (1 - 0.13 * d / L);
          var fr = d - layer;
          if (fr > 0.9) sh *= 0.93;                  // 다음 층이 드러나기 직전의 테두리
          var r = (col & 255) * sh, g = ((col >> 8) & 255) * sh, bl = ((col >> 16) & 255) * sh;
          if (r > 255) r = 255; if (g > 255) g = 255; if (bl > 255) bl = 255;
          var alpha = 255;
          if (d > L - 0.07) alpha = ((L - d) / 0.07 * 255) | 0;
          else if (art && d > thinStart) alpha = (255 - (d - thinStart) / 0.7 * 70) | 0;   // 얇아진 흙 사이로 윤곽이 비침
          out32[p] = (alpha << 24) | ((bl | 0) << 16) | ((g | 0) << 8) | (r | 0);
        }
      }
    }

    function updateLight(gx0, gy0, gx1, gy1) {
      for (var gy = Math.max(1, gy0); gy <= Math.min(GH - 2, gy1); gy++) {
        for (var gx = Math.max(1, gx0); gx <= Math.min(GW - 2, gx1); gx++) {
          var c = gy * GW + gx;
          var gxd = Math.min(depth[c + 1], L) - Math.min(depth[c - 1], L);
          var gyd = Math.min(depth[c + GW], L) - Math.min(depth[c - GW], L);
          light[c] = clamp(1 - (gxd + gyd) * 0.24, 0.62, 1.32);
        }
      }
    }

    /* ---------------- 발굴 (도구 적용) ---------------- */

    function applyDab(x, y, toolName, player) {
      var t = TOOLS[toolName];
      if (!t || !t.rate) return null;
      var r = t.radius * R;
      var rate = t.rate * diff.mul;
      var gx0 = Math.floor((x - r) / CELL), gx1 = Math.ceil((x + r) / CELL);
      var gy0 = Math.floor((y - r) / CELL), gy1 = Math.ceil((y + r) / CELL);
      gx0 = clamp(gx0, 0, GW - 1); gx1 = clamp(gx1, 0, GW - 1); gy0 = clamp(gy0, 0, GH - 1); gy1 = clamp(gy1, 0, GH - 1);
      var removed = 0, hit = false, nearHit = false, metalExposed = false, layerSum = 0, layerN = 0;
      var r2 = r * r;
      for (var gy = gy0; gy <= gy1; gy++) {
        var cyp = gy * CELL + CELL / 2 - y;
        for (var gx = gx0; gx <= gx1; gx++) {
          var cxp = gx * CELL + CELL / 2 - x;
          var dd = cxp * cxp + cyp * cyp;
          if (dd > r2) continue;
          var c = gy * GW + gx;
          var cur = depth[c], mx = maxD[c];
          if (cur >= mx) {
            if (cellAny[c] && finds[cellAny[c] - 1].art.metal) metalExposed = true;
            continue;
          }
          var fall = 1 - dd / r2;
          var amt = rate * fall;
          if (cur >= L) amt *= t.dustMul;
          else amt *= t.soilMul;
          if (amt <= 0) continue;
          var nv = cur + amt;
          if (toolName === 'shovel' && (cellAny[c] || nearCell[c])) {
            var lim = cellAny[c] ? L - 0.5 : L - 0.3;
            if (nv > lim) {
              if (cur >= lim - 0.02) { if (cellAny[c]) hit = true; else nearHit = true; }
              nv = Math.max(cur, lim);
            }
          }
          if (nv > mx) nv = mx;
          removed += nv - cur;
          depth[c] = nv;
          layerSum += cur; layerN++;
        }
      }
      if (removed > 0) {
        updateLight(gx0 - 1, gy0 - 1, gx1 + 1, gy1 + 1);
        dirty.push([gx0 * CELL - CELL, gy0 * CELL - CELL, (gx1 + 2) * CELL, (gy1 + 2) * CELL]);
        contrib[player] += removed;
      }
      return { removed: removed, hit: hit, nearHit: nearHit, metal: metalExposed, avgDepth: layerN ? layerSum / layerN : 0 };
    }

    function spawnParticles(x, y, vx, vy, toolName, info) {
      if (particles.length > 520) return;
      var layer = clamp(Math.floor(info.avgDepth), 0, L - 1);
      var px = clamp(x | 0, 0, Wp - 1), py = clamp(y | 0, 0, Hp - 1);
      var col = info.avgDepth >= L ? null : tex[layer][py * Wp + px];
      var rgb = col === null ? DUST_RGB : [col & 255, (col >> 8) & 255, (col >> 16) & 255];
      var n = toolName === 'shovel' ? 5 : toolName === 'brush' ? 3 : 2;
      var sp = Math.sqrt(vx * vx + vy * vy) || 1;
      var dirx = vx / sp, diry = vy / sp;
      for (var i = 0; i < n; i++) {
        var spread = (Math.random() - 0.5) * 2.2;
        var speed = (toolName === 'shovel' ? 260 : 150) * R * (0.4 + Math.random());
        var ang = Math.atan2(diry, dirx) + spread;
        var big = toolName === 'shovel' && Math.random() < 0.25;
        particles.push({
          x: x + (Math.random() - 0.5) * 10 * R, y: y + (Math.random() - 0.5) * 10 * R,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          life: 1, decay: 1.4 + Math.random() * 1.2,
          size: (big ? 4 + Math.random() * 5 : 1.5 + Math.random() * 2.5) * R,
          col: 'rgb(' + (rgb[0] * (0.8 + Math.random() * 0.3) | 0) + ',' + (rgb[1] * (0.8 + Math.random() * 0.3) | 0) + ',' + (rgb[2] * (0.8 + Math.random() * 0.3) | 0) + ')',
          type: big ? 'clump' : 'dust'
        });
      }
      if (info.metal && Math.random() < 0.5) {
        particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 60 * R, vy: -40 * R - Math.random() * 60 * R, life: 1, decay: 0.8, size: 3 * R, col: '#ffe9a0', type: 'gold' });
      }
    }

    /* ---------------- 입력 ---------------- */

    function local(e) {
      var p = mapPoint(e.clientX, e.clientY);
      return { x: (p.x - siteX) * R, y: (p.y - siteY) * R };
    }

    function playerFor(x, y) {
      if (turnMode) return turnPlayer;
      if (players <= 1) return 0;
      // 플레이어 구역: 0=아래, 1=위, 2=왼쪽, 3=오른쪽 — 터치를 시작한 곳에서 가장 가까운 가장자리
      var d = [Hp - y, y, x * (Hp / Wp) * 1.6, (Wp - x) * (Hp / Wp) * 1.6];
      var best = 0;
      for (var i = 1; i < players; i++) if (d[i] < d[best]) best = i;
      return best;
    }

    function onDown(e) {
      if (!running || frozen) return;
      e.preventDefault();
      Sound.unlock();
      try { cvFx.setPointerCapture(e.pointerId); } catch (err) {}
      var p = local(e);
      var pl = playerFor(p.x, p.y);
      var tool = playerTools[pl];
      pointers[e.pointerId] = { x: p.x, y: p.y, sx: p.x, sy: p.y, player: pl, tool: tool, ang: -0.6, moved: 0, t: performance.now(), vx: 0, vy: 0 };
      if (tool !== 'record') stroke(pointers[e.pointerId], p.x, p.y, true);
    }

    function onMove(e) {
      var st = pointers[e.pointerId];
      if (!st || !running || frozen) return;
      e.preventDefault();
      var list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!list.length) list = [e];
      for (var i = 0; i < list.length; i++) {
        var p = local(list[i]);
        stroke(st, p.x, p.y, false);
      }
    }

    function onUp(e) {
      var st = pointers[e.pointerId];
      if (!st) return;
      delete pointers[e.pointerId];
      try { cvFx.releasePointerCapture(e.pointerId); } catch (err) {}
      if (e.type === 'pointerup' && st.tool === 'record' && st.moved < 40 * R && running && !frozen) recordAt(st.sx, st.sy, st.player);
    }

    function stroke(st, x, y, first) {
      if (st.tool === 'record') {
        st.moved += Math.abs(x - st.x) + Math.abs(y - st.y);
        st.x = x; st.y = y;
        return;
      }
      var t = TOOLS[st.tool];
      var r = t.radius * R;
      var spacing = Math.max(3 * R, r * 0.3);
      var dx = x - st.x, dy = y - st.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (!first && dist < 0.5) return;
      st.moved += dist;
      if (dist > 0.5) {
        var ang = Math.atan2(dy, dx);
        st.ang = st.ang + angleDiff(st.ang, ang) * 0.25;
        st.vx = dx; st.vy = dy;
      }
      var steps = first ? 1 : Math.max(1, Math.ceil(dist / spacing));
      var totalRemoved = 0, anyHit = false, anyNear = false, metal = false;
      for (var i = 1; i <= steps; i++) {
        var px = first ? x : st.x + dx * i / steps, py = first ? y : st.y + dy * i / steps;
        if (px < -r || py < -r || px > Wp + r || py > Hp + r) continue;
        var info = applyDab(px, py, st.tool, st.player);
        if (!info) continue;
        totalRemoved += info.removed;
        anyHit = anyHit || info.hit; anyNear = anyNear || info.nearHit; metal = metal || info.metal;
        if (info.removed > 0.02 || info.metal) spawnParticles(px, py, dx || 1, dy || 0.3, st.tool, info);
      }
      st.x = x; st.y = y;
      if (totalRemoved > 0.01) Sound.play(t.sound, Math.min(1, totalRemoved / 4));
      if (metal) Sound.play('glint');
      if (anyHit || anyNear) shovelPenalty(st, anyHit, x, y);
    }

    function angleDiff(a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

    function shovelPenalty(st, onArtifact, x, y) {
      var now = performance.now();
      if (st.lastHit && now - st.lastHit < 380) return;
      st.lastHit = now;
      shovelHits++;
      quality = Math.max(40, quality - (onArtifact ? 2 : 1));
      if (onArtifact) {
        Sound.play('clink');
        effects.push({ type: 'spark', x: x, y: y, t: 0, dur: 0.35 });
      }
      if (now - warnT > 3500) {
        warnT = now;
        cb.onEvent && cb.onEvent('shovelWarn', { player: st.player, onArtifact: onArtifact });
      }
    }

    function recordAt(x, y, player) {
      var gx = (x / CELL) | 0, gy = (y / CELL) | 0;
      var best = null, bestD = 1e18;
      // 누른 곳 근처(반경 60px)의 유물 찾기
      var rr = Math.ceil(60 * R / CELL);
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        var nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        var c = ny * GW + nx;
        if (cellAny[c] && depth[c] >= L - 0.05) {
          var dd = dx * dx + dy * dy;
          if (dd < bestD) { bestD = dd; best = finds[cellAny[c] - 1]; }
        }
      }
      if (!best) {
        effects.push({ type: 'miss', x: x, y: y, t: 0, dur: 0.6 });
        cb.onEvent && cb.onEvent('recordMiss', { player: player });
        return;
      }
      if (best.recorded) { cb.onEvent && cb.onEvent('recordDup', { player: player }); return; }
      if (best.exposed < diff.expose * 0.8) {
        cb.onEvent && cb.onEvent('recordEarly', { player: player, find: best });
        return;
      }
      recordFind(best, player);
    }

    function recordFind(best, player) {
      best.recorded = true;
      var col = 'ABCDEFGH'[clamp(Math.floor(best.x / Wp * 8), 0, 7)];
      var row = clamp(Math.floor(best.y / Hp * 4), 0, 3) + 1;
      best.record = {
        grid: col + '-' + row,
        depth: L + '층 아래',
        state: quality >= 90 ? '매우 양호' : quality >= 70 ? '양호' : '흠집 주의',
        by: player
      };
      Sound.play('shutter');
      effects.push({ type: 'camera', find: best, t: 0, dur: 1.1 });
      markers.push({ x: best.x + best.w * 0.42, y: best.y - best.h * 0.42, label: best.record.grid, player: player });
      setTimeout(function () { Sound.play('note'); }, 600);
      cb.onEvent && cb.onEvent('recorded', { find: best, record: best.record, player: player, all: finds.every(function (f) { return f.recorded; }) });
      emitStats(true);
    }

    var bound = false;
    function bindInput() {
      if (bound) return; bound = true;
      cvFx.addEventListener('pointerdown', onDown);
      cvFx.addEventListener('pointermove', onMove);
      cvFx.addEventListener('pointerup', onUp);
      cvFx.addEventListener('pointercancel', onUp);
      cvFx.addEventListener('lostpointercapture', onUp);
      window.addEventListener('blur', clearPointers);
    }
    function unbindInput() {
      if (!bound) return; bound = false;
      cvFx.removeEventListener('pointerdown', onDown);
      cvFx.removeEventListener('pointermove', onMove);
      cvFx.removeEventListener('pointerup', onUp);
      cvFx.removeEventListener('pointercancel', onUp);
      cvFx.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('blur', clearPointers);
    }
    function clearPointers() { pointers = {}; }

    /* ---------------- 진행 판정 ---------------- */

    function computeStats() {
      var N = GW * GH;
      finds.forEach(function (f) { f._e = 0; f._d = 0; f._r = 0; });
      for (var c = 0; c < N; c++) {
        var ai = artCell[c];
        if (ai >= 0) {
          var f = finds[ai];
          if (depth[c] >= L - 0.05) f._e++;
          if (depth[c] >= L + DUST - 0.12) f._d++;
        } else if (nearCell[c]) {
          if (depth[c] >= L - 0.1) finds[nearCell[c] - 1]._r++;
        }
      }
      var allReady = true, sumE = 0;
      finds.forEach(function (f) {
        f.exposed = f.cells ? f._e / f.cells : 1;
        f.dust = f.cells ? f._d / f.cells : 1;
        f.ringCleared = f.ring ? f._r / f.ring : 1;
        sumE += f.exposed;
        f.ready = f.exposed >= diff.expose && f.ringCleared >= diff.ring && f.dust >= diff.dust;
        if (!f.ready || !f.recorded) allReady = false;
      });
      var n = finds.length;
      var avg = function (k) { return finds.reduce(function (s, f) { return s + f[k]; }, 0) / n; };
      var tot = contrib[0] + contrib[1] + contrib[2] + contrib[3];
      return {
        exposed: avg('exposed'), ring: avg('ringCleared'), dust: avg('dust'),
        recorded: finds.filter(function (f) { return f.recorded; }).length, total: n,
        found: finds.filter(function (f) { return f.exposed >= diff.expose; }).length,
        quality: quality, shovelHits: shovelHits,
        hotspots: hotspots.filter(function (h) { return h.found; }).length, hotspotTotal: hotspots.length,
        complete: allReady,
        contrib: contrib.map(function (v) { return tot ? v / tot : 0; }),
        thresholds: diff, sumExposed: sumE
      };
    }

    function emitStats(force) {
      var s = computeStats();
      // 발견 이벤트
      finds.forEach(function (f) {
        if (!f.glimpsed && f.exposed > 0.06) {
          f.glimpsed = true;
          Sound.play('sparkle');
          cb.onEvent && cb.onEvent('glimpse', { find: f });
          effects.push({ type: 'ring', x: f.x, y: f.y, t: 0, dur: 1.2, r: Math.max(f.w, f.h) * 0.6 });
        }
        if (!f.nearly && f.exposed >= diff.expose) {
          f.nearly = true;
          Sound.play('found');
          cb.onEvent && cb.onEvent('exposed', { find: f });
        }
      });
      // 문양 발견 (정밀 붓으로 먼지를 털어 낸 곳)
      hotspots.forEach(function (h) {
        if (h.found) return;
        var rc = Math.ceil(h.r / CELL), gx = (h.x / CELL) | 0, gy = (h.y / CELL) | 0, tot = 0, ok = 0;
        for (var dy = -rc; dy <= rc; dy++) for (var dx = -rc; dx <= rc; dx++) {
          if (dx * dx + dy * dy > rc * rc) continue;
          var nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          var c = ny * GW + nx; if (!cellAny[c]) continue;
          tot++; if (depth[c] >= L + DUST - 0.15) ok++;
        }
        if (tot > 3 && ok / tot > 0.72) {
          h.found = true;
          Sound.play('sparkle');
          effects.push({ type: 'magnify', h: h, t: 0, dur: 3.2 });
          cb.onEvent && cb.onEvent('hotspot', { hotspot: h });
        }
      });
      if (s.sumExposed > lastExposedSum + 0.004) { lastExposedSum = s.sumExposed; lastProgressT = performance.now(); }
      lastStats = s;
      cb.onProgress && cb.onProgress(s);
      if (s.complete && !completeEmitted) { completeEmitted = true; cb.onEvent && cb.onEvent('complete', s); }
      return s;
    }

    /* ---------------- 그리기 루프 ---------------- */

    function loop(t) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      var rawDt = Math.max(0, (t - lastT) / 1000);
      var dt = Math.min(0.05, rawDt);
      lastT = t;
      try {
        if (revealing) revealStep(Math.min(0.5, rawDt));
        flushDirty();
        statTimer += dt;
        if (statTimer > 0.25) { statTimer = 0; emitStats(); }
        sparkleTimer += dt;
        if (sparkleTimer > 0.22) { sparkleTimer = 0; spawnSparkle(); }
        hintCheck(dt);
        drawFx(dt, t);
      } catch (err) {
        if (cb.onError) cb.onError(err);
      }
    }

    function flushDirty() {
      if (!dirty.length) return;
      // 겹치는 영역을 단순 병합해 putImageData 호출 수를 줄인다
      var merged = [];
      dirty.forEach(function (r) {
        for (var i = 0; i < merged.length; i++) {
          var m = merged[i];
          if (r[0] <= m[2] && r[2] >= m[0] && r[1] <= m[3] && r[3] >= m[1]) {
            m[0] = Math.min(m[0], r[0]); m[1] = Math.min(m[1], r[1]); m[2] = Math.max(m[2], r[2]); m[3] = Math.max(m[3], r[3]);
            return;
          }
        }
        merged.push(r.slice());
      });
      dirty = [];
      merged.forEach(function (m) {
        var x0 = clamp(m[0], 0, Wp), y0 = clamp(m[1], 0, Hp), x1 = clamp(m[2], 0, Wp), y1 = clamp(m[3], 0, Hp);
        if (x1 <= x0 || y1 <= y0) return;
        renderRect(x0, y0, x1, y1);
        gSoil.putImageData(out, 0, 0, x0, y0, x1 - x0, y1 - y0);
      });
    }

    function spawnSparkle() {
      // 흙 속에서 유물의 일부가 반짝임 (거의 드러난 곳 또는 이미 드러난 금속)
      for (var tries = 0; tries < 30; tries++) {
        var c = (Math.random() * GW * GH) | 0;
        if (!cellAny[c]) continue;
        var f = finds[cellAny[c] - 1];
        var dd = depth[c];
        var near = dd > L - 0.9 && dd < L;
        var metalShine = f.art.metal && dd >= L;
        if (near || metalShine) {
          sparkles.push({ x: (c % GW) * CELL + CELL / 2, y: ((c / GW) | 0) * CELL + CELL / 2, t: 0, dur: 0.7, s: (metalShine ? 9 : 7) * R, gold: f.art.metal });
          if (sparkles.length > 30) sparkles.shift();
          return;
        }
      }
    }

    function hintCheck(dt) {
      if (!hintsOn || revealing || frozen) return;
      hintTimer += dt;
      if (performance.now() - lastProgressT > 22000 && hintTimer > 22) {
        hintTimer = 0;
        // 아직 덜 드러난 유물 칸 하나를 안내
        var best = -1, bestD = 1e9;
        for (var tries = 0; tries < 400; tries++) {
          var c = (Math.random() * GW * GH) | 0;
          if (artCell[c] < 0) continue;
          if (depth[c] < L && depth[c] < bestD) { bestD = depth[c]; best = c; }
        }
        if (best >= 0) {
          var hx = (best % GW) * CELL, hy = ((best / GW) | 0) * CELL;
          hintMarks.push({ x: hx, y: hy, t: 0, dur: 5 });
          cb.onEvent && cb.onEvent('hint', { x: hx / R, y: hy / R });
        }
      }
    }

    function revealStep(dt) {
      // 아직 덜 걷힌 칸만 갱신하고, 그 범위만 다시 합성한다
      var done = true, x0 = GW, y0 = GH, x1 = -1, y1 = -1;
      for (var gy = 0; gy < GH; gy++) {
        var row = gy * GW;
        for (var gx = 0; gx < GW; gx++) {
          var c = row + gx;
          if (depth[c] < maxD[c]) {
            depth[c] = Math.min(maxD[c], depth[c] + dt * 2.2);
            done = false;
            if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
          }
        }
      }
      if (x1 >= 0) {
        updateLight(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
        dirty.push([(x0 - 1) * CELL, (y0 - 1) * CELL, (x1 + 2) * CELL, (y1 + 2) * CELL]);
      }
      if (done) { revealing = false; if (revealCb) { var f = revealCb; revealCb = null; f(); } }
    }

    function drawFx(dt, t) {
      var g = gFx;
      g.clearRect(0, 0, Wp, Hp);

      // 금동대향로: 드러날수록 주변 조명이 낮아지고 따뜻한 빛이 모인다
      if (stage.theme === 'hyangno' && lastStats) {
        var target = clamp((lastStats.exposed - 0.25) * 1.3, 0, 1);
        glowLevel += (target - glowLevel) * Math.min(1, dt * 1.5);
        if (glowLevel > 0.01) {
          var f0 = finds[0];
          var vg = g.createRadialGradient(f0.x, f0.y, f0.h * 0.25, f0.x, f0.y, Math.max(Wp, Hp) * 0.65);
          vg.addColorStop(0, 'rgba(255,214,120,' + (0.10 * glowLevel) + ')');
          vg.addColorStop(0.45, 'rgba(40,24,8,0)');
          vg.addColorStop(1, 'rgba(20,12,4,' + (0.45 * glowLevel) + ')');
          g.fillStyle = vg; g.fillRect(0, 0, Wp, Hp);
        }
      }

      // 발굴 구획 줄
      g.strokeStyle = 'rgba(255,250,235,0.35)'; g.lineWidth = 1.5 * R;
      g.setLineDash([10 * R, 6 * R]);
      g.beginPath();
      for (var i = 1; i < 8; i++) { g.moveTo(Wp * i / 8, 0); g.lineTo(Wp * i / 8, Hp); }
      for (i = 1; i < 4; i++) { g.moveTo(0, Hp * i / 4); g.lineTo(Wp, Hp * i / 4); }
      g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,250,235,0.55)'; g.font = 'bold ' + (16 * R) + 'px "Malgun Gothic",sans-serif';
      for (i = 0; i < 8; i++) g.fillText('ABCDEFGH'[i], Wp * i / 8 + 8 * R, 22 * R);
      for (i = 0; i < 4; i++) g.fillText(String(i + 1), 8 * R, Hp * i / 4 + 44 * R);

      // 입자
      var p, k;
      for (i = particles.length - 1; i >= 0; i--) {
        p = particles[i];
        p.life -= dt * p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        var fr = p.type === 'gold' ? 0.98 : 0.9;
        p.vx *= fr; p.vy *= fr;
        if (p.type === 'gold') {
          g.globalAlpha = p.life;
          drawStar(g, p.x, p.y, p.size * (1 + (1 - p.life)), '#fff1b0');
        } else {
          g.globalAlpha = Math.min(1, p.life * 1.4);
          g.fillStyle = p.col;
          g.beginPath();
          if (p.type === 'clump') g.ellipse(p.x, p.y, p.size, p.size * 0.75, p.vx * 0.01, 0, Math.PI * 2);
          else g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;

      // 반짝임
      for (i = sparkles.length - 1; i >= 0; i--) {
        var s = sparkles[i];
        s.t += dt;
        if (s.t > s.dur) { sparkles.splice(i, 1); continue; }
        k = Math.sin(s.t / s.dur * Math.PI);
        g.globalAlpha = k;
        drawStar(g, s.x, s.y, s.s * (0.6 + k * 0.6), s.gold ? '#fff4c2' : '#ffffff');
      }
      g.globalAlpha = 1;

      // 힌트 표시
      for (i = hintMarks.length - 1; i >= 0; i--) {
        var hm = hintMarks[i];
        hm.t += dt;
        if (hm.t > hm.dur) { hintMarks.splice(i, 1); continue; }
        var pulse = (hm.t % 1);
        g.strokeStyle = 'rgba(255,230,120,' + (1 - pulse) + ')';
        g.lineWidth = 5 * R;
        g.beginPath(); g.arc(hm.x, hm.y, (20 + pulse * 50) * R, 0, Math.PI * 2); g.stroke();
      }

      // 기록 깃발
      markers.forEach(function (m) {
        g.save(); g.translate(m.x, m.y);
        g.strokeStyle = '#3a2a1a'; g.lineWidth = 3 * R;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -46 * R); g.stroke();
        g.fillStyle = ['#e8553e', '#3e8acb', '#4caf6a', '#b55bd6'][m.player % 4];
        g.beginPath(); g.moveTo(0, -46 * R); g.lineTo(34 * R, -38 * R); g.lineTo(0, -28 * R); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold ' + (12 * R) + 'px "Malgun Gothic",sans-serif';
        g.fillText(m.label, 4 * R, -33 * R);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 0, 6 * R, 3 * R, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      });

      // 효과
      for (i = effects.length - 1; i >= 0; i--) {
        var ef = effects[i];
        ef.t += dt;
        if (ef.t > ef.dur) { effects.splice(i, 1); continue; }
        var q = ef.t / ef.dur;
        if (ef.type === 'ring') {
          g.strokeStyle = 'rgba(255,236,160,' + (1 - q) + ')'; g.lineWidth = 8 * R * (1 - q) + 1;
          g.beginPath(); g.arc(ef.x, ef.y, ef.r * (0.4 + q * 0.8), 0, Math.PI * 2); g.stroke();
        } else if (ef.type === 'spark') {
          g.globalAlpha = 1 - q;
          for (var sp = 0; sp < 6; sp++) {
            var a = sp / 6 * Math.PI * 2;
            g.strokeStyle = '#fff6c8'; g.lineWidth = 3 * R;
            g.beginPath(); g.moveTo(ef.x + Math.cos(a) * 8 * R, ef.y + Math.sin(a) * 8 * R);
            g.lineTo(ef.x + Math.cos(a) * (14 + q * 26) * R, ef.y + Math.sin(a) * (14 + q * 26) * R); g.stroke();
          }
          g.globalAlpha = 1;
        } else if (ef.type === 'miss') {
          g.strokeStyle = 'rgba(255,255,255,' + (1 - q) + ')'; g.lineWidth = 4 * R;
          g.beginPath(); g.arc(ef.x, ef.y, (20 + q * 20) * R, 0, Math.PI * 2); g.stroke();
        } else if (ef.type === 'camera') {
          drawCamera(g, ef.find, q);
        } else if (ef.type === 'magnify') {
          drawMagnifier(g, ef.h, q);
        }
      }

      // 도구와 손가락 표시
      for (var id in pointers) {
        var st = pointers[id];
        drawToolCursor(g, st, t);
      }
    }

    function drawStar(g, x, y, s, col) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
      g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s);
      g.fill();
    }

    var PCOL = ['#e8553e', '#3e8acb', '#4caf6a', '#b55bd6'];
    function drawToolCursor(g, st, t) {
      var tool = TOOLS[st.tool];
      var r = (tool.radius || 30) * R;
      g.strokeStyle = PCOL[st.player % 4];
      g.lineWidth = 3 * R; g.globalAlpha = 0.85;
      g.beginPath(); g.arc(st.x, st.y, r, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      var img = icons[st.tool];
      if (img && img.complete) {
        var size = (st.tool === 'shovel' ? 120 : st.tool === 'record' ? 90 : 100) * R;
        g.save();
        g.translate(st.x, st.y);
        var moving = Math.abs(st.vx) + Math.abs(st.vy) > 1;
        var wig = (st.tool === 'brush' || st.tool === 'fine') && moving ? Math.sin(t / 55) * 0.16 : 0;
        // 아이콘의 끝(오른쪽 아래)이 손가락 위치에 오도록 하고, 움직이는 방향으로 살짝 기운다
        g.rotate(clamp(st.vx * 0.012, -0.35, 0.35) + wig);
        if (st.tool === 'record') g.drawImage(img, -size * 0.5, -size * 0.5, size, size);
        else g.drawImage(img, -size * 0.77, -size * 0.89, size, size);
        st.vx *= 0.85; st.vy *= 0.85;
        g.restore();
      }
    }

    function drawCamera(g, f, q) {
      var k = 1 - Math.min(1, q * 2.2);
      var hw = f.w * 0.6 + k * 120 * R, hh = f.h * 0.6 + k * 90 * R;
      g.save(); g.translate(f.x, f.y);
      g.strokeStyle = '#fff'; g.lineWidth = 6 * R;
      var L2 = 34 * R;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        g.beginPath();
        g.moveTo(s[0] * hw, s[1] * hh + -s[1] * L2); g.lineTo(s[0] * hw, s[1] * hh); g.lineTo(s[0] * hw - s[0] * L2, s[1] * hh);
        g.stroke();
      });
      if (q > 0.45 && q < 0.75) {
        g.fillStyle = 'rgba(255,255,255,' + (1 - (q - 0.45) / 0.3) * 0.85 + ')';
        g.fillRect(-hw, -hh, hw * 2, hh * 2);
      }
      g.restore();
    }

    function drawMagnifier(g, h, q) {
      var a = q < 0.12 ? q / 0.12 : q > 0.85 ? (1 - q) / 0.15 : 1;
      var rad = 105 * R, zoom = 2.1;
      var mx = clamp(h.x, rad + 10, Wp - rad - 10), my = clamp(h.y - rad * 0.4, rad + 10, Hp - rad - 10);
      g.save();
      g.globalAlpha = a;
      g.beginPath(); g.arc(mx, my, rad, 0, Math.PI * 2); g.closePath();
      g.save(); g.clip();
      g.drawImage(cvFloor, h.x - rad / zoom, h.y - rad / zoom, rad * 2 / zoom, rad * 2 / zoom, mx - rad, my - rad, rad * 2, rad * 2);
      var hg = g.createRadialGradient(mx - rad * 0.4, my - rad * 0.4, 5, mx, my, rad);
      hg.addColorStop(0, 'rgba(255,255,255,0.35)'); hg.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = hg; g.fillRect(mx - rad, my - rad, rad * 2, rad * 2);
      g.restore();
      g.strokeStyle = '#2a3a40'; g.lineWidth = 12 * R; g.stroke();
      g.strokeStyle = '#e8c06a'; g.lineWidth = 4 * R; g.stroke();
      g.lineCap = 'round';
      g.strokeStyle = '#2a3a40'; g.lineWidth = 18 * R;
      g.beginPath(); g.moveTo(mx + rad * 0.72, my + rad * 0.72); g.lineTo(mx + rad * 1.15, my + rad * 1.15); g.stroke();
      var label = '🔍 ' + h.label;
      g.font = 'bold ' + (24 * R) + 'px "Malgun Gothic",sans-serif';
      var tw = g.measureText(label).width + 28 * R;
      g.fillStyle = 'rgba(40,26,10,0.85)';
      roundRect(g, mx - tw / 2, my + rad + 10 * R, tw, 40 * R, 14 * R); g.fill();
      g.fillStyle = '#ffe9a8'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, mx, my + rad + 30 * R);
      g.restore();
    }

    function roundRect(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }

    var revealCb = null;

    return {
      start: start,
      stop: stop,
      setTool: function (player, tool) { playerTools[player] = tool; for (var id in pointers) if (pointers[id].player === player) pointers[id].tool = tool; },
      getTool: function (player) { return playerTools[player]; },
      setTurn: function (p) { turnPlayer = p; pointers = {}; },   // 앞사람이 누르고 있던 손가락은 차례가 바뀌면 끊는다
      setFrozen: function (v) {
        frozen = !!v;
        if (v) pointers = {};
        else { lastProgressT = performance.now(); hintTimer = 0; }   // 쉬는 시간은 '진행 없음'으로 치지 않는다
      },
      stats: function () { return running ? emitStats() : (lastStats || computeStats()); },
      finds: function () { return finds; },
      hotspots: function () { return hotspots; },
      reveal: function (done) { revealing = true; revealCb = done || null; },
      recordAll: function () { finds.forEach(function (f) { if (!f.recorded) recordFind(f, 0); }); },
      // 자가 진단용: 실제 도구 처리(applyDab, 삽 충격 판정)를 그대로 사용해 영역을 문지른다 (발굴 현장 좌표)
      scrub: function (toolName, x0, y0, x1, y1, stepPx, player) {
        stepPx = stepPx || 12;
        var st = { player: player || 0 };
        for (var y = y0; y <= y1; y += stepPx) for (var x = x0; x <= x1; x += stepPx) {
          var info = applyDab(x * R, y * R, toolName, st.player);
          if (info && (info.hit || info.nearHit)) shovelPenalty(st, info.hit, x * R, y * R);
        }
      },
      resolution: function () { return R; },
      layers: function () { return L; },
      activePointers: function () { return Object.keys(pointers).length; },
      tools: TOOLS
    };
  }

  window.DigEngine = { create: create, TOOLS: TOOLS, DIFF: DIFF };
})();
