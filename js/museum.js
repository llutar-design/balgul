/* 백제 보물 발굴 탐험대 — 나만의 백제 박물관
 * 수장고(트레이)에서 유물을 끌어 전시대에 올린다. 배치는 로컬 저장소에 기록된다. */
(function () {
  'use strict';

  var el = function (t, c, h) { return Activities.el(t, c, h); };
  var highlight = [];
  // 여러 명이 동시에 끌 때 한 명이 놓자마자 화면을 다시 그리면 다른 친구가 끌던 유물이 사라진다.
  // 그래서 끌고 있는 손가락이 모두 떨어진 뒤에 한 번에 다시 그린다.
  var activeDrags = 0, needRender = false;
  function requestRender() { if (activeDrags > 0) needRender = true; else render(); }

  function thumb(artKey, w, h, locked) {
    var c = el('canvas');
    var g = Activities.hiDpi(c, w, h);
    if (locked) {
      var s = Art.silhouette(artKey, h * 0.9, 'rgba(70,48,25,0.5)');
      var k = Math.min(w / s.width, h * 0.9 / s.height);
      g.drawImage(s, (w - s.width * k) / 2, (h - s.height * k) / 2, s.width * k, s.height * k);
      g.fillStyle = '#fff7e0'; g.font = 'bold 44px "Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', w / 2, h / 2);
    } else {
      Art.draw(g, artKey, 6, 6, w - 12, h - 12);
    }
    return c;
  }

  function render() {
    var save = App.save;
    var arts = App.data.artifacts;
    var hall = document.getElementById('museum-hall');
    var tray = document.getElementById('museum-tray');
    hall.innerHTML = ''; tray.innerHTML = '';
    document.getElementById('drag-layer').innerHTML = '';
    activeDrags = 0; needRender = false;
    var ids = arts.map(function (a) { return a.id; });
    var got = ids.filter(function (id) { return save.collected[id]; });
    document.getElementById('mp-fill').style.width = (got.length / ids.length * 100) + '%';
    document.getElementById('mp-text').textContent = '수집 ' + got.length + ' / ' + ids.length + ' · 전시 ' + Object.keys(save.placements).filter(function (k) { return save.placements[k]; }).length;

    var placed = {};
    for (var i = 0; i < ids.length; i++) {
      var pid = save.placements[i];
      // 교사가 artifacts.json에서 지우거나 이름을 바꾼 유물은 무시한다
      var valid = pid && save.collected[pid] && App.artifact(pid);
      if (valid) placed[pid] = i; else if (pid) delete save.placements[i];
      var ped = el('div', 'pedestal');
      ped.dataset.slot = i;
      var glass = el('div', 'ped-glass');
      if (valid) {
        var a = App.artifact(pid);
        var item = el('div', 'ped-item');
        item.appendChild(thumb(a.art, 220, 220));
        item.dataset.id = pid;
        glass.appendChild(item);
        ped.appendChild(glass);
        ped.appendChild(el('div', 'ped-label', a.short));
        makeDraggable(item, pid, i);
      } else {
        glass.appendChild(el('div', 'ped-empty', '빈 전시대'));
        ped.appendChild(glass);
        ped.appendChild(el('div', 'ped-label empty', '전시대 ' + (i + 1)));
      }
      hall.appendChild(ped);
    }

    arts.forEach(function (a) {
      if (placed[a.id] !== undefined) return;
      var owned = !!save.collected[a.id];
      var it = el('div', 'tray-item' + (owned ? '' : ' locked') + (highlight.indexOf(a.id) >= 0 ? ' new' : ''));
      it.appendChild(thumb(a.art, 150, 150, !owned));
      it.appendChild(el('span', '', owned ? a.short : '미발견'));
      it.dataset.id = a.id;
      tray.appendChild(it);
      if (owned) makeDraggable(it, a.id, null);
      else it.addEventListener('click', function () { Sound.play('tap'); App.toast('아직 발견하지 못한 유물이에요. 유적지를 발굴해 보세요!'); });
    });
    if (!tray.children.length) tray.appendChild(el('div', 'tray-empty', '모든 유물을 전시했어요! 🎉'));
  }

  function makeDraggable(node, id, fromSlot) {
    var drag = null;
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (drag) return;                   // 같은 유물에 두 번째 손가락이 닿으면 무시
      try { node.setPointerCapture(e.pointerId); } catch (er) {}
      var p = App.mapPoint(e.clientX, e.clientY);
      drag = { id: e.pointerId, x0: p.x, y0: p.y, moved: 0, ghost: null };
      activeDrags++;
    });
    function endDrag() {
      var d = drag; drag = null;
      node.classList.remove('dragging');
      if (d && d.ghost) d.ghost.remove();
      activeDrags = Math.max(0, activeDrags - 1);
      if (!activeDrags) clearHover();
      return d;
    }
    function flush() { if (!activeDrags && needRender) render(); }
    node.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var p = App.mapPoint(e.clientX, e.clientY);
      drag.moved = Math.max(drag.moved, Math.abs(p.x - drag.x0) + Math.abs(p.y - drag.y0));
      if (!drag.ghost && drag.moved > 14) {
        drag.ghost = el('div', 'drag-ghost');
        drag.ghost.appendChild(thumb(App.artifact(id).art, 200, 200));
        document.getElementById('drag-layer').appendChild(drag.ghost);
        node.classList.add('dragging');
        Sound.play('tap');
      }
      if (drag.ghost) drag.ghost.style.transform = 'translate(' + (p.x - 100) + 'px,' + (p.y - 120) + 'px) rotate(-4deg)';
      hoverPedestal(e);
    });
    function up(e) {
      if (!drag || drag.id !== e.pointerId) return;
      var d = endDrag();
      if (d.moved <= 14) { flush(); if (!activeDrags) detail(id); return; }
      var slot = pedestalAt(e);
      if (slot !== null) place(id, slot, fromSlot);
      else if (fromSlot !== null && overTray(e)) { delete App.save.placements[fromSlot]; App.persist(); requestRender(); }
      flush();
    }
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', function (e) { if (!drag || drag.id !== e.pointerId) return; endDrag(); flush(); });
  }

  function pedestalAt(e) {
    var peds = document.querySelectorAll('#museum-hall .pedestal');
    for (var i = 0; i < peds.length; i++) {
      var r = peds[i].getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return +peds[i].dataset.slot;
    }
    return null;
  }
  function overTray(e) {
    var r = document.getElementById('museum-tray').getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 40 && e.clientY <= r.bottom;
  }
  function hoverPedestal(e) {
    var s = pedestalAt(e);
    document.querySelectorAll('#museum-hall .pedestal').forEach(function (p) { p.classList.toggle('hover', +p.dataset.slot === s); });
  }
  function clearHover() { document.querySelectorAll('#museum-hall .pedestal.hover').forEach(function (p) { p.classList.remove('hover'); }); }

  function place(id, slot, fromSlot) {
    var pl = App.save.placements;
    var prev = pl[slot];
    for (var k in pl) if (pl[k] === id) delete pl[k];
    pl[slot] = id;
    if (prev && prev !== id && fromSlot !== null) pl[fromSlot] = prev;   // 전시대끼리 자리 바꾸기
    App.persist();
    highlight = highlight.filter(function (h) { return h !== id; });
    Sound.play('place');
    App.toast('🏛️ ' + App.artifact(id).short + '을(를) 전시했어요!');
    requestRender();
    if (!needRender) {
      var ped = document.querySelector('#museum-hall .pedestal[data-slot="' + slot + '"]');
      if (ped) ped.classList.add('placed-flash');
    }
    App.onDisplayed && App.onDisplayed(id);
  }

  function detail(id) {
    var a = App.artifact(id), rec = App.save.collected[id] || {};
    Sound.play('select');
    var box = el('div', 'museum-detail');
    var left = el('div', 'md-art');
    var cv = el('canvas'); left.appendChild(cv);
    var g = Activities.hiDpi(cv, 520, 560);
    var angle = 0, target = 0, running = true;
    function frame() {
      if (!running || !document.body.contains(cv)) { running = false; return; }
      requestAnimationFrame(frame);
      angle += (target - angle) * 0.12;
      g.clearRect(0, 0, 520, 560);
      Art.draw(g, a.art, 20, 20, 480, 520, { angle: angle });
    }
    var drag = null;
    cv.addEventListener('pointerdown', function (e) {
      if (drag) return;                   // 두 번째 손가락으로 그림이 튀지 않게
      drag = { id: e.pointerId, x: e.clientX, a: target };
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    });
    cv.addEventListener('pointermove', function (e) { if (drag && drag.id === e.pointerId) target = drag.a + (e.clientX - drag.x) / App.scale() * 0.012 * (Activities.isFlipped(cv) ? -1 : 1); });
    var endRot = function (e) { if (drag && drag.id === e.pointerId) drag = null; };
    cv.addEventListener('pointerup', endRot);
    cv.addEventListener('pointercancel', endRot);
    left.appendChild(el('div', 'cer-tip', '👆 좌우로 밀어 돌려 보기'));
    box.appendChild(left);
    var tier = Activities.tierOf(App.settings.grade);
    var right = el('div', 'md-info');
    right.innerHTML = '<h2>' + a.name + '</h2>' +
      '<div class="info-card">' +
      '<div class="row"><b>출토 장소</b><span>' + a.site + '</span></div>' +
      '<div class="row"><b>시대</b><span>' + a.era + '</span></div>' +
      '<div class="row"><b>재료</b><span>' + a.material + '</span></div>' +
      (a.designation ? '<div class="row"><b>문화유산</b><span>' + a.designation + ' · ' + a.museum + ' 소장</span></div>' : '') +
      '<p class="desc">' + a.desc[tier] + '</p>' +
      '<ul class="feat">' + a.features.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '<div class="record-card"><b>📒 발굴 기록</b>' +
      '<span>발굴한 날: ' + (rec.date || '-') + '</span>' +
      '<span>출토 위치: ' + (rec.grid || '-') + ' 구획</span>' +
      '<span>조사 품질: ' + (rec.quality !== undefined ? rec.quality + '점' : '-') + '</span>' +
      '<span>별: ' + '⭐'.repeat(rec.stars || 0) + '</span>' +
      '<span>발굴 인원: ' + (rec.team || 1) + '명</span></div>' +
      (Art.hasCustom(a.art) ? '<p class="note">※ 선생님이 등록한 이미지로 표시하고 있어요.</p>' : '');
    box.appendChild(right);
    App.modal(box, { close: true, onClose: function () { running = false; } });
    frame();      // 모달에 붙인 뒤에 그리기 시작
  }

  window.Museum = {
    open: function (newIds) { highlight = newIds || []; render(); },
    render: render,
    detail: detail
  };
})();
