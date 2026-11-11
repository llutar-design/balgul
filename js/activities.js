/* 백제 보물 발굴 탐험대 — 발굴 뒤 활동
 * 발견 연출, 토기 맞추기, 글자 관찰, 사리기 구조 탐구, 장식 찾기, 역사 퀴즈 */
(function () {
  'use strict';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function isFlipped(node) {
    var f = document.body.classList.contains('orient-flip');
    if (node.closest && node.closest('.flipped')) f = !f;
    return f;
  }

  // 화면 좌표 → 요소 내부 좌표 (화면 크기 조절, 180° 회전, 확대·축소 모두 반영)
  function boardPoint(e, node) {
    var r = node.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * node.offsetWidth;
    var y = (e.clientY - r.top) / r.height * node.offsetHeight;
    if (isFlipped(node)) { x = node.offsetWidth - x; y = node.offsetHeight - y; }
    return { x: x, y: y };
  }

  function tierOf(grade) { return grade <= 2 ? 'low' : grade <= 4 ? 'mid' : 'high'; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function hiDpi(canvas, w, h) {
    var k = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * (window.App ? App.scale() : 1)));
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    var g = canvas.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    return g;
  }

  /* ================= 발견 연출 ================= */
  function ceremony(root, o) {
    // o: { artifact, tier, grand, onDone, points, badges }
    var a = o.artifact;
    root.innerHTML = '';
    root.classList.add('act-ceremony');
    if (o.grand) root.classList.add('grand');
    var rays = el('div', 'rays'); root.appendChild(rays);
    var left = el('div', 'cer-left');
    var stageBox = el('div', 'cer-art');
    var cv = el('canvas'); stageBox.appendChild(cv);
    var g = hiDpi(cv, 620, 640);
    left.appendChild(stageBox);
    var views = el('div', 'cer-views');
    var viewDefs = [['정면', 0], ['옆면', Math.PI / 2], ['뒷면', Math.PI], ['자세히', 'zoom']];
    var angle = 0, target = 0, zoomIdx = -1, autoSpin = a.art !== 'pot';
    viewDefs.forEach(function (v) {
      var b = el('button', 'pill', v[0]);
      b.addEventListener('click', function () {
        Sound.play('tap'); autoSpin = false;
        if (v[1] === 'zoom') {
          var hs = a.hotspots || [];
          zoomIdx = hs.length ? (zoomIdx + 1) % hs.length : -1;
          target = 0;
        } else { zoomIdx = -1; target = v[1]; }
      });
      views.appendChild(b);
    });
    left.appendChild(views);
    left.appendChild(el('div', 'cer-tip', '👆 그림을 좌우로 밀면 돌려 볼 수 있어요'));
    root.appendChild(left);

    var right = el('div', 'cer-right');
    right.appendChild(el('div', 'cer-found', o.grand ? '✨ 전설의 보물 발견! ✨' : '🎉 유물 발견!'));
    var nameEl = el('h2', 'cer-name', a.name);
    right.appendChild(nameEl);
    var info = el('div', 'info-card');
    info.innerHTML =
      '<div class="row"><b>출토 장소</b><span>' + a.site + '</span></div>' +
      '<div class="row"><b>시대</b><span>' + a.era + '</span></div>' +
      '<div class="row"><b>재료</b><span>' + a.material + '</span></div>' +
      (a.discovered ? '<div class="row"><b>발견</b><span>' + a.discovered + '</span></div>' : '') +
      (a.designation ? '<div class="row"><b>문화유산</b><span>' + a.designation + ' · ' + a.museum + ' 소장</span></div>' : '') +
      '<p class="desc">' + a.desc[o.tier] + '</p>' +
      (o.tier !== 'low' ? '<ul class="feat">' + a.features.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' : '') +
      (a.isReal === false ? '<p class="note">※ 이 유물은 연습용으로 만든 가상의 유물이에요.</p>' : '');
    right.appendChild(info);
    if (o.points) {
      var pts = el('div', 'cer-points', '<span>⭐ 발견 점수 <b>+' + o.points + '</b></span>' + (o.badges || []).map(function (b) { return '<span class="badge-chip">' + b.icon + ' ' + b.name + '</span>'; }).join(''));
      right.appendChild(pts);
    }
    var next = el('button', 'big-btn primary', '<span>' + (o.nextLabel || '다음으로') + ' →</span>');
    next.addEventListener('click', function () { Sound.play('select'); stop(); o.onDone && o.onDone(); });
    right.appendChild(next);
    root.appendChild(right);

    // 돌려 보기: 좌우 드래그
    var drag = null;
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, a: target }; autoSpin = false; zoomIdx = -1; try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.x) / (window.App ? App.scale() : 1);
      if (isFlipped(cv)) dx = -dx;
      target = drag.a + dx * 0.012;
    });
    var endDrag = function () { drag = null; };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

    var particles = [];
    var running = true, t0 = performance.now(), raf;
    function frame(t) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (t - t0 > 1000 && !cv.isConnected) { stop(); return; }   // 창이 닫히면 그리기 중단
      var el2 = Math.max(0, (t - t0) / 1000);
      if (autoSpin) target = Math.sin(el2 * 0.6) * 0.7;
      angle += (target - angle) * 0.12;
      g.clearRect(0, 0, 620, 640);
      var pop = Math.min(1, el2 / 0.7);
      var s = 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3));
      // 받침대와 조명
      var lg = g.createRadialGradient(310, 300, 30, 310, 320, 330);
      lg.addColorStop(0, o.grand ? 'rgba(255,220,130,0.55)' : 'rgba(255,240,200,0.4)');
      lg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lg; g.fillRect(0, 0, 620, 640);
      g.fillStyle = 'rgba(60,35,15,0.25)';
      g.beginPath(); g.ellipse(310, 600, 210 * s, 26 * s, 0, 0, Math.PI * 2); g.fill();
      g.save();
      var hs = (a.hotspots || [])[zoomIdx];
      var bw = 540, bh = 560;
      if (hs) {
        var z = 2.2;
        var asp = Art.aspect(a.art), dh = bh, dw = dh * asp;
        if (dw > bw) { dw = bw; dh = dw / asp; }
        var ax = 310 - dw / 2 + hs.x * dw, ay = 330 - dh / 2 + hs.y * dh;
        g.translate(310, 320); g.scale(z, z); g.translate(-ax, -ay);
        Art.draw(g, a.art, 310 - bw / 2, 330 - bh / 2, bw, bh, { angle: 0 });
      } else {
        g.translate(310, 600); g.scale(s, s); g.translate(-310, -600);
        Art.draw(g, a.art, 310 - bw / 2, 330 - bh / 2, bw, bh, { angle: angle });
      }
      g.restore();
      if (hs) {
        g.fillStyle = 'rgba(40,26,10,0.85)'; g.fillRect(20, 560, 580, 64);
        g.fillStyle = '#ffe9a8'; g.font = 'bold 26px "Malgun Gothic",sans-serif'; g.textAlign = 'center';
        g.fillText('🔍 ' + hs.label + ' — ' + hs.info, 310, 600, 560);
        g.textAlign = 'start';
      }
      // 금속 유물 반짝임
      if (a.metal && Math.random() < (o.grand ? 0.5 : 0.2)) particles.push({ x: 140 + Math.random() * 340, y: 100 + Math.random() * 460, t: 0 });
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i]; p.t += 0.025; p.y -= o.grand ? 0.8 : 0.3;
        if (p.t > 1) { particles.splice(i, 1); continue; }
        var k = Math.sin(p.t * Math.PI), r = 9 * k;
        g.fillStyle = 'rgba(255,244,190,' + k + ')';
        g.beginPath(); g.moveTo(p.x, p.y - r); g.quadraticCurveTo(p.x, p.y, p.x + r, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y + r); g.quadraticCurveTo(p.x, p.y, p.x - r, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y - r); g.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    function stop() { running = false; cancelAnimationFrame(raf); }
    Sound.play(o.grand ? 'grand' : 'fanfare');
    return { stop: stop };
  }

  /* ================= 토기 조각 맞추기 (훈련소) ================= */
  function puzzle(root, o) {
    root.innerHTML = '';
    root.classList.add('act-puzzle');
    root.appendChild(el('h2', 'act-title', '🧩 토기 조각을 맞추어 보세요'));
    root.appendChild(el('p', 'act-sub', '조각을 손가락으로 끌어 점선 그림 위에 놓으면 딱 맞춰져요. 여러 명이 동시에 옮겨도 돼요!'));
    var board = el('div', 'puzzle-board');
    root.appendChild(board);
    var BW = 1400, BH = 640, SIZE = 440;
    var tx = (BW - SIZE) / 2, ty = (BH - SIZE) / 2 + 10;
    var ghost = el('canvas', 'puzzle-ghost');
    var gg = hiDpi(ghost, SIZE, SIZE);
    ghost.style.left = tx + 'px'; ghost.style.top = ty + 'px';
    gg.globalAlpha = 0.18; Art.draw(gg, 'pot', 0, 0, SIZE, SIZE, { noCustom: true }); gg.globalAlpha = 1;
    board.appendChild(ghost);
    var pieces = Art.potPieces(SIZE);
    var homes = [[40, 40], [BW - 340, 30], [70, BH - 300], [BW - 330, BH - 290]];
    shuffle(homes);
    var placed = 0;
    pieces.forEach(function (pc, i) {
      var c = pc.canvas;
      c.className = 'puzzle-piece';
      c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
      var st = { x: homes[i][0], y: homes[i][1], rot: (Math.random() - 0.5) * 70, done: false };
      function apply() { c.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) rotate(' + st.rot + 'deg)'; }
      apply();
      board.appendChild(c);
      var drag = null;
      c.addEventListener('pointerdown', function (e) {
        if (st.done) return;
        e.preventDefault();
        try { c.setPointerCapture(e.pointerId); } catch (er) {}
        var p = boardPoint(e, board);
        drag = { id: e.pointerId, dx: p.x - st.x, dy: p.y - st.y };
        st.rot = 0; c.classList.add('lifted'); apply();
        Sound.play('tap');
      });
      c.addEventListener('pointermove', function (e) {
        if (!drag || drag.id !== e.pointerId) return;
        var p = boardPoint(e, board);
        st.x = Math.max(-40, Math.min(BW - 60, p.x - drag.dx));
        st.y = Math.max(-40, Math.min(BH - 60, p.y - drag.dy));
        apply();
      });
      function up(e) {
        if (!drag || drag.id !== e.pointerId) return;
        drag = null; c.classList.remove('lifted');
        var gx = tx + pc.ox, gy = ty + pc.oy;
        if (Math.abs(st.x - gx) < 60 && Math.abs(st.y - gy) < 60) {
          st.x = gx; st.y = gy; st.done = true; c.classList.add('snapped'); apply();
          Sound.play('snap');
          placed++;
          if (placed === pieces.length) finish();
        }
      }
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    });
    function finish() {
      Sound.play('fanfare');
      ghost.classList.add('complete');
      board.classList.add('complete');
      var msg = el('div', 'puzzle-done', '토기 완성! 🎉');
      board.appendChild(msg);
      setTimeout(function () { o.onDone && o.onDone({ research: true }); }, o.testAuto ? 50 : 1600);
    }
    if (o.testAuto) setTimeout(function () { placed = pieces.length - 1; finish(); }, 100);
  }

  /* ================= 글자 관찰 (석조사리감) ================= */
  function inscription(root, o) {
    var a = o.artifact, ins = a.inscription;
    root.innerHTML = '';
    root.classList.add('act-inscription');
    root.appendChild(el('h2', 'act-title', '🔍 새겨진 글자를 관찰해요'));
    root.appendChild(el('p', 'act-sub', o.tier === 'low'
      ? '반짝이는 글자를 눌러 보세요. 4개를 찾으면 성공!'
      : '옛 글은 위에서 아래로, 오른쪽 줄부터 읽어요. 뜻이 있는 글자를 눌러 4개 이상 찾아보세요.'));
    var wrap = el('div', 'ins-wrap');
    var artBox = el('div', 'ins-art');
    var cv = el('canvas'); artBox.appendChild(cv);
    var g = hiDpi(cv, 420, 520);
    Art.draw(g, 'sarigam', 10, 10, 400, 500, { angle: 0 });
    wrap.appendChild(artBox);

    var full = ins.right + ins.left;     // 0~9 오른쪽 줄, 10~19 왼쪽 줄
    var groups = [
      { idx: [0, 1], word: '百濟 (백제)', mean: '나라 이름 백제예요.' },
      { idx: [2, 3], word: '昌王 (창왕)', mean: '위덕왕을 가리켜요. 위덕왕의 이름이 \'창\'이에요.' },
      { idx: [4, 5, 6], word: '十三季 (13년)', mean: '창왕이 왕이 된 지 13년째라는 뜻이에요. 여기서 \'季\'는 해(年)를 뜻하는 글자로 쓰였다고 봐요.' },
      { idx: [10, 11], word: '丁亥 (정해)', mean: '정해년, 곧 567년이에요. 옛날에는 해를 이런 이름(간지)으로 불렀어요.' },
      { idx: [14, 15], word: '公主 (공주)', mean: '왕의 딸이에요. 앞의 \'妹兄\'과 함께 어떻게 읽을지는 여러 견해가 있어요.' },
      { idx: [16, 17], word: '供養 (공양)', mean: '부처님께 정성껏 바친다는 뜻이에요.' },
      { idx: [18, 19], word: '舍利 (사리)', mean: '부처님의 유골, 또는 그것을 상징하는 구슬이에요.' }
    ];
    var foundN = 0, need = 4;
    var cols = el('div', 'ins-cols');
    var tiles = [];
    [[ins.left, 10, '왼쪽 줄 (둘째)'], [ins.right, 0, '오른쪽 줄 (첫째)']].forEach(function (col) {
      var c = el('div', 'ins-col');
      c.appendChild(el('div', 'ins-col-label', col[2]));
      for (var i = 0; i < 10; i++) {
        var idx = col[1] + i;
        var b = el('button', 'ins-char', full[idx]);
        b.dataset.idx = idx;
        tiles[idx] = b;
        c.appendChild(b);
      }
      cols.appendChild(c);
    });
    wrap.appendChild(cols);
    var side = el('div', 'ins-side');
    var bubble = el('div', 'ins-bubble', '글자를 눌러 보세요!');
    var counter = el('div', 'ins-count', '찾은 낱말 0 / ' + need);
    var meaning = el('div', 'ins-meaning hidden', '<b>글 전체의 뜻</b><p>' + ins.meaning + '</p><p class="small">읽기: ' + ins.reading + '</p>');
    var next = el('button', 'big-btn primary hidden', '<span>다음으로 →</span>');
    side.appendChild(counter); side.appendChild(bubble); side.appendChild(meaning); side.appendChild(next);
    wrap.appendChild(side);
    root.appendChild(wrap);

    groups.forEach(function (gr) { gr.idx.forEach(function (i) { tiles[i].classList.add('hint-glow'); }); });
    if (o.tier !== 'low') groups.forEach(function (gr) { gr.idx.forEach(function (i) { tiles[i].classList.remove('hint-glow'); }); });

    cols.addEventListener('click', function (e) {
      var b = e.target.closest('.ins-char'); if (!b) return;
      var idx = +b.dataset.idx;
      var gr = groups.filter(function (x) { return x.idx.indexOf(idx) >= 0; })[0];
      if (!gr) {
        Sound.play('tap');
        bubble.innerHTML = '<b>' + full[idx] + '</b> — 이 글자도 문장의 일부예요. 뜻을 가진 낱말을 더 찾아보세요.';
        return;
      }
      gr.idx.forEach(function (i) { tiles[i].classList.add('found'); tiles[i].classList.remove('hint-glow'); });
      bubble.innerHTML = '<b class="word">' + gr.word + '</b><p>' + gr.mean + '</p>';
      if (!gr.found) {
        gr.found = true; foundN++;
        Sound.play('correct');
        counter.textContent = '찾은 낱말 ' + foundN + ' / ' + need;
        if (foundN >= need) { meaning.classList.remove('hidden'); next.classList.remove('hidden'); Sound.play('fanfare'); }
      } else Sound.play('tap');
    });
    next.addEventListener('click', function () { Sound.play('select'); o.onDone && o.onDone({ research: true, found: foundN }); });
    if (o.testAuto) setTimeout(function () { groups.slice(0, 4).forEach(function (gr) { tiles[gr.idx[0]].click(); }); next.click(); }, 50);
  }

  /* ================= 사리기 구조 탐구 (왕흥사지) ================= */
  function nesting(root, o) {
    root.innerHTML = '';
    root.classList.add('act-nesting');
    root.appendChild(el('h2', 'act-title', '🏺 사리기 속을 살펴보아요'));
    var sub = el('p', 'act-sub', '청동 그릇의 뚜껑을 눌러 열어 보세요.');
    root.appendChild(sub);
    var stageEl = el('div', 'nest-stage');
    var cv = el('canvas'); stageEl.appendChild(cv);
    var CW = 1300, CH = 450;
    var g = hiDpi(cv, CW, CH);
    root.appendChild(stageEl);
    var note = el('div', 'nest-note', '');
    root.appendChild(note);
    var matchArea = el('div', 'match-area hidden');
    root.appendChild(matchArea);

    // 단계: 0 닫힘, 1 청동합 열림(은호 나옴), 2 은호 열림(금병 나옴), 3 관찰 완료
    var phase = 0, running = true, raf;
    var items = [
      { key: 'hap', name: '청동제사리합', x: 260, h: 310, lid: 0 },
      { key: 'ho', name: '은제사리호', x: 650, h: 220, lid: 0, rise: 0 },
      { key: 'byeong', name: '금제사리병', x: 1010, h: 170, lid: 0, rise: 0 }
    ];
    function draw() {
      g.clearRect(0, 0, CW, CH);
      var base = 395;
      g.fillStyle = 'rgba(60,35,15,0.2)';
      items.forEach(function (it, i) {
        var vis = i === 0 || (i === 1 && phase >= 1) || (i === 2 && phase >= 2);
        if (!vis) return;
        var rise = i === 0 ? 1 : it.rise;
        var asp = Art.aspect(it.key), w = it.h * asp;
        var x = i === 0 ? it.x : items[i - 1].x + (it.x - items[i - 1].x) * rise;
        var y = base - it.h - (1 - rise) * 40;
        g.globalAlpha = Math.min(1, rise * 1.5);
        g.beginPath(); g.ellipse(x, base + 4, w * 0.45, 12, 0, 0, Math.PI * 2); g.fill();
        var opened = (i === 0 && phase >= 1) || (i === 1 && phase >= 2) || (i === 2 && phase >= 3);
        if (opened) {
          Art.draw(g, it.key, x - w / 2, y, w, it.h, { part: 'body', noCustom: true });
          Art.draw(g, it.key, x - w / 2 + w * 0.55 * it.lid, y, w, it.h, { part: 'lid', lift: 22 * it.lid, noCustom: true });
        } else {
          Art.draw(g, it.key, x - w / 2, y, w, it.h, { noCustom: true });
        }
        g.globalAlpha = 1;
        g.fillStyle = '#4a2f14'; g.font = 'bold 30px "Malgun Gothic",sans-serif'; g.textAlign = 'center';
        if (rise > 0.9) g.fillText(phase >= 3 || o.tier !== 'low' || phase > i ? it.name : '?', x, base + 46);
        g.fillStyle = 'rgba(60,35,15,0.2)';
      });
      g.textAlign = 'start';
      // 바깥 → 안쪽 화살표
      if (phase >= 2) {
        g.strokeStyle = 'rgba(120,80,30,0.6)'; g.lineWidth = 6; g.setLineDash([14, 10]);
        g.beginPath(); g.moveTo(400, 260); g.lineTo(540, 260); g.moveTo(780, 290); g.lineTo(900, 290); g.stroke(); g.setLineDash([]);
      }
    }
    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!cv.isConnected) { running = false; cancelAnimationFrame(raf); return; }
      items.forEach(function (it, i) {
        var openTarget = (i === 0 && phase >= 1) || (i === 1 && phase >= 2) ? 1 : 0;
        it.lid += (openTarget - it.lid) * 0.12;
        if (i > 0) { var rt = phase >= i ? 1 : 0; it.rise += (rt - it.rise) * 0.08; }
      });
      draw();
    }
    raf = requestAnimationFrame(frame);
    cv.addEventListener('pointerdown', function (e) {
      var p = boardPoint(e, cv);
      var target = items[phase];
      if (!target || phase > 1) return;
      if (Math.abs(p.x - target.x) < 180) {
        phase++;
        Sound.play('whoosh');
        setTimeout(function () { Sound.play('sparkle'); }, 300);
        if (phase === 1) { sub.textContent = '안에서 은 그릇이 나왔어요! 은 그릇의 뚜껑도 눌러 보세요.'; note.innerHTML = '<b>청동제사리합</b> 안에 <b>은제사리호</b>가 들어 있었어요.'; }
        if (phase === 2) {
          sub.textContent = '가장 안쪽에서 금 병이 나왔어요!';
          note.innerHTML = '바깥부터 <b>청동 → 은 → 금</b>. 안쪽으로 갈수록 더 귀한 재료로 만들었어요.' + (o.tier === 'high' ? ' 사리를 겹겹이 귀하게 모시려는 마음이 담겨 있어요.' : '');
          setTimeout(startMatch, 1400);
        }
      }
    });

    function startMatch() {
      phase = 3;
      matchArea.classList.remove('hidden');
      matchArea.innerHTML = '';
      matchArea.appendChild(el('div', 'match-title', '이름표를 끌어서 알맞은 그릇 아래에 놓아 보세요'));
      var slots = el('div', 'match-slots');
      var labels = el('div', 'match-labels');
      var slotEls = {};
      items.forEach(function (it) {
        var s = el('div', 'match-slot', '<span>' + ({ hap: '청동', ho: '은', byeong: '금' })[it.key] + '으로 만든 그릇</span>');
        s.style.left = (it.x - 150) + 'px';
        s.dataset.key = it.key;
        slots.appendChild(s); slotEls[it.key] = s;
      });
      matchArea.appendChild(slots);
      var done = 0;
      shuffle(items.slice()).forEach(function (it) {
        var lb = el('div', 'match-label', it.name);
        lb.dataset.key = it.key;
        labels.appendChild(lb);
        dragLabel(lb, slotEls, function (ok, slot) {
          if (ok) {
            Sound.play('correct');
            slot.classList.add('ok'); slot.innerHTML = '<b>' + it.name + '</b>';
            lb.remove(); done++;
            if (done === 3) {
              Sound.play('fanfare');
              note.innerHTML = '<b>훌륭해요!</b> 세 그릇의 재료와 이름, 그리고 겹쳐진 관계를 모두 알아냈어요.';
              var next = el('button', 'big-btn primary', '<span>다음으로 →</span>');
              next.addEventListener('click', function () { running = false; cancelAnimationFrame(raf); o.onDone && o.onDone({ research: true }); });
              matchArea.appendChild(next);
              if (o.testAuto) next.click();
            }
          } else { Sound.play('wrong'); slot.classList.add('shake'); setTimeout(function () { slot.classList.remove('shake'); }, 400); }
        });
      });
      matchArea.appendChild(labels);
      if (o.testAuto) items.forEach(function (it) { var s = slotEls[it.key]; s.classList.add('ok'); done++; });
      if (o.testAuto) { running = false; cancelAnimationFrame(raf); o.onDone && o.onDone({ research: true }); }
    }

    function dragLabel(lb, slotEls, cbk) {
      var drag = null;
      lb.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { lb.setPointerCapture(e.pointerId); } catch (er) {}
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
        lb.classList.add('lifted'); Sound.play('tap');
      });
      lb.addEventListener('pointermove', function (e) {
        if (!drag || drag.id !== e.pointerId) return;
        var k = window.App ? App.scale() : 1, f = isFlipped(lb) ? -1 : 1;
        lb.style.transform = 'translate(' + ((e.clientX - drag.sx) / k * f) + 'px,' + ((e.clientY - drag.sy) / k * f) + 'px) scale(1.08)';
      });
      function up(e) {
        if (!drag || drag.id !== e.pointerId) return;
        drag = null; lb.classList.remove('lifted');
        var hit = null;
        for (var key in slotEls) {
          var r = slotEls[key].getBoundingClientRect();
          if (e.clientX >= r.left - 20 && e.clientX <= r.right + 20 && e.clientY >= r.top - 30 && e.clientY <= r.bottom + 30) hit = slotEls[key];
        }
        lb.style.transform = '';
        if (hit && !hit.classList.contains('ok')) cbk(hit.dataset.key === lb.dataset.key, hit);
      }
      lb.addEventListener('pointerup', up); lb.addEventListener('pointercancel', up);
    }
    if (o.testAuto) { phase = 2; startMatch(); }
  }

  /* ================= 장식 찾기 (백제금동대향로) ================= */
  function decoration(root, o) {
    var a = o.artifact;
    root.innerHTML = '';
    root.classList.add('act-decoration');
    root.appendChild(el('h2', 'act-title', '✨ 향로의 장식을 찾아보아요'));
    root.appendChild(el('p', 'act-sub', '아래 이름을 보고 향로 그림에서 그 장식을 눌러 보세요. 모두 찾으면 성공!'));
    var wrap = el('div', 'deco-wrap');
    var box = el('div', 'deco-art');
    var cv = el('canvas'); box.appendChild(cv);
    var CW = 520, CH = 680;
    var g = hiDpi(cv, CW, CH);
    var bw = 500, bh = 660, asp = Art.aspect('hyangno');
    var dh = bh, dw = dh * asp; if (dw > bw) { dw = bw; dh = dw / asp; }
    var ox = (CW - dw) / 2, oy = (CH - dh) / 2;
    wrap.appendChild(box);
    var side = el('div', 'deco-side');
    var list = el('div', 'deco-list');
    var hs = (a.hotspots || []).map(function (h) { return { h: h, found: false }; });
    hs.forEach(function (x) { var c = el('div', 'deco-chip', x.h.label); x.chip = c; list.appendChild(c); });
    side.appendChild(list);
    var bubble = el('div', 'ins-bubble', '어디에 있을까요? 👀');
    side.appendChild(bubble);
    var next = el('button', 'big-btn primary hidden', '<span>다음으로 →</span>');
    side.appendChild(next);
    wrap.appendChild(side);
    root.appendChild(wrap);

    var marks = [], t0 = performance.now(), running = true, raf;
    function frame(t) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!cv.isConnected) { running = false; cancelAnimationFrame(raf); return; }
      g.clearRect(0, 0, CW, CH);
      var lg = g.createRadialGradient(CW / 2, CH / 2, 40, CW / 2, CH / 2, 360);
      lg.addColorStop(0, 'rgba(255,225,150,0.45)'); lg.addColorStop(1, 'rgba(255,225,150,0)');
      g.fillStyle = lg; g.fillRect(0, 0, CW, CH);
      Art.draw(g, 'hyangno', ox, oy, dw, dh, { angle: Math.sin((t - t0) / 3000) * 0.25, noCustom: true });
      marks.forEach(function (m) {
        m.t = Math.min(1, m.t + 0.05);
        g.strokeStyle = m.ok ? 'rgba(80,200,120,0.95)' : 'rgba(255,255,255,' + (1 - m.t) + ')';
        g.lineWidth = 5;
        g.beginPath(); g.arc(m.x, m.y, m.ok ? 44 : 30 + m.t * 30, 0, Math.PI * 2); g.stroke();
      });
      marks = marks.filter(function (m) { return m.ok || m.t < 1; });
    }
    raf = requestAnimationFrame(frame);
    cv.addEventListener('pointerdown', function (e) {
      var p = boardPoint(e, cv);
      var best = null, bd = 1e9;
      hs.forEach(function (x) {
        var hx = ox + x.h.x * dw, hy = oy + x.h.y * dh;
        var d = Math.hypot(p.x - hx, p.y - hy);
        if (d < bd) { bd = d; best = x; }
      });
      if (best && bd < 75) {
        var hx = ox + best.h.x * dw, hy = oy + best.h.y * dh;
        bubble.innerHTML = '<b class="word">' + best.h.label + '</b><p>' + best.h.info + '</p>';
        if (!best.found) {
          best.found = true; best.chip.classList.add('found');
          marks.push({ x: hx, y: hy, t: 0, ok: true });
          Sound.play('correct');
          if (hs.every(function (x) { return x.found; })) {
            Sound.play('fanfare');
            bubble.innerHTML += '<p class="good">모든 장식을 찾았어요! 백제 장인의 솜씨가 정말 놀랍지요?</p>';
            next.classList.remove('hidden');
          }
        } else Sound.play('tap');
      } else {
        marks.push({ x: p.x, y: p.y, t: 0 });
        Sound.play('tap');
      }
    });
    next.addEventListener('click', function () { running = false; cancelAnimationFrame(raf); Sound.play('select'); o.onDone && o.onDone({ research: true }); });
    if (o.testAuto) setTimeout(function () { running = false; cancelAnimationFrame(raf); o.onDone && o.onDone({ research: true }); }, 50);
  }

  /* ================= 역사 퀴즈 ================= */
  var ICON = { brush: 'assets/icons/brush.svg', shovel: 'assets/icons/shovel.svg', fine: 'assets/icons/finebrush.svg', camera: 'assets/icons/camera.svg' };
  var EMOJI = { x: '🎒', stone: '🪨', wood: '🪵' };

  function quiz(root, o) {
    // o: { questions:[], onDone(result{correct, total}) }
    var qs = o.questions, qi = 0, correct = 0;
    root.innerHTML = '';
    root.classList.add('act-quiz');
    function show() {
      var q = qs[qi];
      root.innerHTML = '';
      root.appendChild(el('div', 'quiz-head', '📜 백제 역사 퀴즈 <span>' + (qi + 1) + ' / ' + qs.length + '</span>'));
      root.appendChild(el('h2', 'quiz-q', q.q));
      var opts = el('div', 'quiz-opts n' + q.options.length);
      var order = shuffle(q.options.map(function (x, i) { return i; }));
      var tries = 0, locked = false;
      var fb = el('div', 'quiz-fb hidden');
      order.forEach(function (oi) {
        var op = q.options[oi];
        var b = el('button', 'quiz-opt');
        if (op.art) {
          var c = el('canvas'); var g = hiDpi(c, 200, 200);
          Art.draw(g, op.art, 10, 10, 180, 180);
          b.appendChild(c);
        } else if (op.icon && ICON[op.icon]) {
          var im = el('img'); im.src = ICON[op.icon]; im.alt = ''; b.appendChild(im);
        } else if (op.icon && EMOJI[op.icon]) {
          b.appendChild(el('div', 'quiz-emoji', EMOJI[op.icon]));
        }
        b.appendChild(el('span', '', op.text));
        b.addEventListener('click', function () {
          if (locked) return;
          tries++;
          if (oi === q.answer) {
            locked = true;
            if (tries === 1) correct++;
            b.classList.add('right');
            Sound.play('correct');
            fb.className = 'quiz-fb right';
            fb.innerHTML = '<b>' + (tries === 1 ? '정답이에요! 🎉' : '맞았어요! 👏') + '</b><p>' + q.explain + '</p>';
            var nx = el('button', 'big-btn primary', '<span>' + (qi + 1 < qs.length ? '다음 문제 →' : '결과 보기 →') + '</span>');
            nx.addEventListener('click', function () { Sound.play('select'); qi++; if (qi < qs.length) show(); else o.onDone && o.onDone({ correct: correct, total: qs.length }); });
            fb.appendChild(nx);
            if (o.testAuto) setTimeout(function () { nx.click(); }, 10);
          } else {
            b.classList.add('wrong'); b.disabled = true;
            Sound.play('wrong');
            fb.className = 'quiz-fb wrong';
            fb.innerHTML = '<b>아쉬워요, 다시 생각해 볼까요? 🤔</b><p>' + q.hint + '</p>';
          }
        });
        opts.appendChild(b);
        if (o.testAuto && oi === q.answer) setTimeout(function () { b.click(); }, 10);
      });
      root.appendChild(opts);
      root.appendChild(fb);
    }
    if (!qs.length) { o.onDone && o.onDone({ correct: 0, total: 0 }); return; }
    show();
  }

  window.Activities = {
    ceremony: ceremony, puzzle: puzzle, inscription: inscription, nesting: nesting,
    decoration: decoration, quiz: quiz, tierOf: tierOf, boardPoint: boardPoint, isFlipped: isFlipped,
    el: el, hiDpi: hiDpi, shuffle: shuffle
  };
})();
