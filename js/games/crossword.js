/* 백제 십자 낱말풀이 — 가로·세로 낱말이 서로 엇갈리는 진짜 십자말풀이
 * 한글 조합(두벌식), 퍼즐 검사·자동 배치, 격자판·문제 목록·글자판, 협동(1~4명), 보상·저장, 선생님 편집기.
 * 연결 규약은 docs/GAME_API.md 참고. */
(function () {
  'use strict';

  /* ================= 한글 자모 조합 (순수 함수) ================= */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var VCOMB = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' };
  var JCOMB = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' };
  var SPLIT = {};
  Object.keys(VCOMB).forEach(function (k) { SPLIT[VCOMB[k]] = [k[0], k[1]]; });
  Object.keys(JCOMB).forEach(function (k) { SPLIT[JCOMB[k]] = [k[0], k[1]]; });
  // 두벌식 표준 자판 (영문 상태로 눌러도 한글 자모로 바꾼다)
  var KEYMAP = { KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyO: 'ㅐ', KeyP: 'ㅔ',
    KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ',
    KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ' };
  var SHIFTMAP = { 'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ' };

  function isV(k) { return JUNG.indexOf(k) >= 0; }
  function isSyl(ch) { var c = ch ? ch.charCodeAt(0) : 0; return ch && ch.length === 1 && c >= 0xAC00 && c <= 0xD7A3; }
  // 한 칸(한 음절)을 이루는 자모 입력 목록 → 초성·중성·종성
  function parse(keys) {
    var s = { cho: '', jung: '', jong: '' };
    keys.forEach(function (k) {
      if (isV(k)) s.jung = s.jung ? (VCOMB[s.jung + k] || s.jung) : k;
      else if (!s.cho && !s.jung) s.cho = k;
      else s.jong = s.jong ? (JCOMB[s.jong + k] || s.jong) : k;
    });
    return s;
  }
  function render(keys) {
    var s = parse(keys);
    if (s.cho && s.jung) return String.fromCharCode(0xAC00 + (CHO.indexOf(s.cho) * 21 + JUNG.indexOf(s.jung)) * 28 + JONG.indexOf(s.jong));
    return s.cho || s.jung || '';
  }
  // 자모 하나를 더 눌렀을 때: 지금 칸(cur)과, 다음 칸으로 넘어갈 자모(next)
  function step(keys, k) {
    if (!keys.length) return { cur: [k], next: null };
    var s = parse(keys), last = keys[keys.length - 1];
    if (isV(k)) {
      if (s.jong) return { cur: keys.slice(0, -1), next: [last, k] };          // 받침이 다음 글자의 첫소리로 (감+ㅏ → 가마, 닭+ㅏ → 달가)
      if (s.jung) return (s.jung === last && VCOMB[s.jung + k]) ? { cur: keys.concat(k), next: null } : { cur: keys, next: [k] };
      return { cur: keys.concat(k), next: null };
    }
    if (!s.cho || !s.jung) return { cur: keys, next: [k] };
    if (!s.jong) return JONG.indexOf(k) > 0 ? { cur: keys.concat(k), next: null } : { cur: keys, next: [k] };   // ㄸㅃㅉ 은 받침이 될 수 없음
    if (s.jong === last && JCOMB[s.jong + k]) return { cur: keys.concat(k), next: null };   // 겹받침 (ㄳ ㄺ …)
    return { cur: keys, next: [k] };
  }
  // 글자 → 자모 입력 목록 (지우기를 한 단계씩 하기 위해)
  function decompose(ch) {
    if (!ch) return [];
    if (!isSyl(ch)) return SPLIT[ch] ? SPLIT[ch].slice() : [ch];
    var c = ch.charCodeAt(0) - 0xAC00;
    var out = [CHO[Math.floor(c / 588)]];
    var v = JUNG[Math.floor((c % 588) / 28)], j = JONG[c % 28];
    out = out.concat(SPLIT[v] || [v]);
    if (j) out = out.concat(SPLIT[j] || [j]);
    return out;
  }

  // 낱말 한 개의 입력 편집기: 빈칸 n개(고정 글자는 제외)를 앞에서부터 채운다
  function Editor(n, init) {
    var ed = { n: n, slots: [], cur: 0, keys: [] };
    for (var i = 0; i < n; i++) ed.slots.push((init && init[i]) || '');
    ed.cur = 0;
    while (ed.cur < n && ed.slots[ed.cur]) ed.cur++;
    if (ed.cur >= n) ed.cur = n;                       // 모두 차 있으면 끝에 둔다
    ed.finalize = function () {
      if (ed.keys.length) { ed.keys = []; if (ed.slots[ed.cur]) ed.cur = Math.min(n, ed.cur + 1); }
    };
    ed.key = function (k) {
      if (ed.cur >= n) return false;
      var r = step(ed.keys, k);
      if (r.next) {
        if (ed.cur + 1 >= n) return false;               // 다음 칸이 없으면 받아들이지 않는다
        ed.slots[ed.cur] = render(r.cur);
        ed.cur++; ed.keys = r.next; ed.slots[ed.cur] = render(r.next);
      } else { ed.keys = r.cur; ed.slots[ed.cur] = render(r.cur); }
      return true;
    };
    ed.syl = function (s) {
      ed.finalize();
      if (ed.cur >= n) return false;
      ed.slots[ed.cur] = s; ed.cur = Math.min(n, ed.cur + 1);
      return true;
    };
    // whole: 글자 타일 방식은 한 글자 통째로, 자모 방식은 한 단계씩 지운다
    ed.back = function (whole) {
      if (ed.keys.length && !whole) {
        ed.keys.pop(); ed.slots[ed.cur] = render(ed.keys);
        return true;
      }
      if (ed.keys.length) { ed.keys = []; ed.slots[ed.cur] = ''; return true; }
      var t = ed.cur;
      if (t >= n || !ed.slots[t]) t--;
      if (t < 0) return false;
      ed.cur = t;
      if (whole) { ed.slots[t] = ''; return true; }
      ed.keys = decompose(ed.slots[t]); ed.keys.pop();
      ed.slots[t] = render(ed.keys);
      return true;
    };
    ed.clear = function () { ed.keys = []; for (var i = 0; i < n; i++) ed.slots[i] = ''; ed.cur = 0; };
    ed.moveTo = function (i) { ed.finalize(); ed.cur = Math.max(0, Math.min(n, i)); };
    // IME 등으로 들어온 완성 글자 묶음을 채운다
    ed.text = function (str) {
      var ok = false;
      String(str).split('').forEach(function (ch) {
        if (isSyl(ch)) ok = ed.syl(ch) || ok;
        else if (CHO.indexOf(ch) >= 0 || isV(ch) || SPLIT[ch]) { decompose(ch).forEach(function (k) { ok = ed.key(k) || ok; }); }
      });
      return ok;
    };
    ed.value = function () { return ed.slots.join(''); };
    return ed;
  }
  // 시험용: 'ㄱㅏㅁㅏ⌫' 같은 입력 → 결과 문자열
  function typeKeys(seq, n) {
    var ed = Editor(n || 30);
    seq.split('').forEach(function (k) {
      if (k === '⌫') ed.back(false);
      else if (k === '|') ed.finalize();
      else ed.key(k);
    });
    return ed.value();
  }
  function hangulSelfTest() {
    var cases = [
      ['ㄱㅏㅁ', '감'], ['ㄱㅏㅁㅏ', '가마'], ['ㄷㅏㄹㄱ', '닭'], ['ㄷㅏㄹㄱㅏ', '달가'], ['ㄱㅏㅂㅅ', '값'], ['ㄱㅏㅂㅅㅣ', '갑시'],
      ['ㄱㅗㅏ', '과'], ['ㅇㅡㅣㅈㅏㅇㅗㅏㅇ', '의자왕'], ['ㅂㅐㄱㅈㅔ', '백제'], ['ㅂㅐㄱㅁㅏㄱㅏㅇ', '백마강'],
      ['ㄱㅡㅁㄷㅗㅇㄷㅐㅎㅑㅇㄹㅗ', '금동대향로'], ['ㅈㅓㅇㄹㅣㅁㅅㅏㅈㅣ', '정림사지'], ['ㅇㅗㅏㅇㅎㅡㅇㅅㅏ', '왕흥사'],
      ['ㄱㅏㅁㅏ⌫', '가ㅁ'], ['ㄱㅏㅁㅏ⌫⌫', '가'], ['ㄱㅏㅁㅏ⌫⌫⌫', 'ㄱ'], ['ㄱㅏㅁㅏ⌫⌫⌫⌫', ''],
      ['ㄷㅏㄹㄱ⌫', '달'], ['ㄱㅗㅏ⌫', '고'], ['ㄱㅏㅂㅅ⌫', '갑'], ['ㅂㅐㄱㅈㅔ⌫⌫⌫', '배'],
      ['ㄲㅗㅊ', '꽃'], ['ㅆㅏㅇ', '쌍'], ['ㄱㅏㄸ', '가ㄸ'], ['ㄱㄴ', 'ㄱㄴ'], ['ㅏㄱ', 'ㅏㄱ'], ['ㄱㅏ|ㄴㅏ', '가나'],
      ['ㅇㅝㄴ', '원'], ['ㅇㅙ', '왜'], ['ㅇㅢ', '의'], ['ㅎㅏㄴㄱㅡㄹ', '한글'], ['ㅇㅣㄺㄷㅏ', '읽다']
    ];
    var out = { pass: 0, fail: 0, failed: [] };
    cases.forEach(function (c) {
      var got = typeKeys(c[0].replace(/ㄺ/g, 'ㄹㄱ'));
      if (got === c[1]) out.pass++; else { out.fail++; out.failed.push(c[0] + ' → ' + got + ' (기대 ' + c[1] + ')'); }
    });
    // 칸 수 제한: 마지막 칸에서 받침이 넘어갈 자리가 없으면 그대로 둔다
    var e2 = Editor(1); 'ㄱㅏㅁㅏ'.split('').forEach(function (k) { e2.key(k); });
    if (e2.value() === '감') out.pass++; else { out.fail++; out.failed.push('1칸 제한 → ' + e2.value()); }
    var e3 = Editor(3); e3.syl('백'); e3.syl('마'); e3.back(true);
    if (e3.value() === '백' && e3.cur === 1) out.pass++; else { out.fail++; out.failed.push('타일 지우기 → ' + e3.value()); }
    var e4 = Editor(3); e4.text('백마강');
    if (e4.value() === '백마강') out.pass++; else { out.fail++; out.failed.push('IME 글자 → ' + e4.value()); }
    return out;
  }

  /* ================= 퍼즐 검사 ================= */
  var DIRS = { across: [0, 1], down: [1, 0] };
  var DNAME = { across: '가로', down: '세로' };
  function syls(s) { return String(s || '').split(''); }
  function wordCells(w) {
    var d = DIRS[w.direction], out = [];
    for (var i = 0; i < syls(w.answer).length; i++) out.push([w.row + d[0] * i, w.col + d[1] * i]);
    return out;
  }
  function wname(w) { return (w.number || '?') + '번 ' + (DNAME[w.direction] || '?') + ' 「' + w.answer + '」'; }
  // 퍼즐 전체를 검사한다: 칸 안에 들어가는지, 번호, 엇갈리는 글자, 의도하지 않은 이웃 글자, 모두 이어져 있는지
  function validatePuzzle(p) {
    var errs = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['퍼즐 형식이 아니에요.'] };
    var R = p.rows | 0, C = p.cols | 0;
    if (!p.id) errs.push('퍼즐 id 가 없어요.');
    if (R < 2 || C < 2 || R > 15 || C > 15) errs.push('격자 크기(rows·cols)가 올바르지 않아요: ' + p.rows + '×' + p.cols);
    if (!Array.isArray(p.words) || p.words.length < 2) { errs.push('낱말이 2개 이상 있어야 해요.'); return { ok: false, errors: errs }; }
    var grid = {}, seen = {}, bad = false;
    p.words.forEach(function (w, i) {
      if (!w || typeof w.answer !== 'string' || !/^[가-힣]{2,10}$/.test(w.answer)) { errs.push((i + 1) + '번째 낱말의 정답은 2~10글자의 완성된 한글이어야 해요: ' + (w && w.answer)); bad = true; return; }
      if (!DIRS[w.direction]) { errs.push(wname(w) + ': 방향은 across(가로) 또는 down(세로)여야 해요.'); bad = true; return; }
      if (!(w.row >= 0 && w.col >= 0 && (w.row | 0) === w.row && (w.col | 0) === w.col)) { errs.push(wname(w) + ': 시작 칸(row, col)이 올바르지 않아요.'); bad = true; return; }
      if (!w.hint || !String(w.hint).trim()) errs.push(wname(w) + ': 힌트가 비어 있어요.');
      var key = w.direction + ':' + w.row + ',' + w.col;
      if (seen[key]) errs.push(wname(w) + ': 같은 칸에서 같은 방향으로 시작하는 낱말이 또 있어요.');
      seen[key] = true;
      var out = false;
      wordCells(w).forEach(function (rc, k) {
        if (rc[0] >= R || rc[1] >= C) { if (!out) errs.push(wname(w) + ': 격자 밖으로 나가요 (' + R + '×' + C + ').'); out = bad = true; return; }
        var id = rc[0] + ',' + rc[1], ch = w.answer[k];
        var g = grid[id] || (grid[id] = { ch: ch, across: null, down: null });
        if (g.ch !== ch) errs.push('엇갈리는 칸 (' + (rc[0] + 1) + '행 ' + (rc[1] + 1) + '열)의 글자가 달라요: ' + wname(g.across || g.down) + '의 「' + g.ch + '」 ≠ ' + wname(w) + '의 「' + ch + '」');
        if (g[w.direction]) errs.push(wname(g[w.direction]) + ', ' + wname(w) + ' 낱말이 같은 방향으로 겹쳐요.');
        else g[w.direction] = w;
      });
    });
    if (bad) return { ok: false, errors: errs };
    function at(r, c) { return grid[r + ',' + c]; }
    // 이어진 글자 줄(2칸 이상)은 모두 낱말과 정확히 같아야 한다
    var numbers = {}, n = 0;
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) {
      if (!at(r, c)) continue;
      var sa = !at(r, c - 1) && at(r, c + 1), sd = !at(r - 1, c) && at(r + 1, c);
      if (sa || sd) numbers[r + ',' + c] = ++n;
      ['across', 'down'].forEach(function (dir) {
        if (!(dir === 'across' ? sa : sd)) return;
        var d = DIRS[dir], len = 0, txt = '';
        while (at(r + d[0] * len, c + d[1] * len)) { txt += at(r + d[0] * len, c + d[1] * len).ch; len++; }
        var w = p.words.filter(function (x) { return x.direction === dir && x.row === r && x.col === c; })[0];
        if (!w) errs.push((r + 1) + '행 ' + (c + 1) + '열에서 ' + DNAME[dir] + '로 의도하지 않은 글자 줄이 생겨요(이웃한 글자가 붙어 있어요): 「' + txt + '」');
        else if (w.answer.length !== len) errs.push(wname(w) + ' 앞뒤에 다른 글자가 붙어 있어요: 「' + txt + '」');
      });
    }
    p.words.forEach(function (w) {
      var k = w.row + ',' + w.col;
      var d = DIRS[w.direction], prev = at(w.row - d[0], w.col - d[1]);
      if (prev) errs.push(wname(w) + '의 시작 칸 앞에 다른 글자가 붙어 있어요.');
      if (numbers[k] && w.number !== numbers[k]) errs.push(wname(w) + '의 번호는 ' + numbers[k] + '번이어야 해요.');
    });
    // 한 덩어리로 이어져 있는지
    var keys = Object.keys(grid), visit = {}, stack = keys.length ? [keys[0]] : [];
    while (stack.length) {
      var id = stack.pop(); if (visit[id]) continue; visit[id] = 1;
      var rc = id.split(',').map(Number);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var k2 = (rc[0] + d[0]) + ',' + (rc[1] + d[1]); if (grid[k2] && !visit[k2]) stack.push(k2); });
    }
    if (Object.keys(visit).length !== keys.length) errs.push('서로 이어지지 않은 낱말이 있어요. 모든 낱말은 엇갈리며 한 덩어리로 이어져야 해요.');
    return { ok: !errs.length, errors: errs, numbers: numbers, grid: grid };
  }

  /* ================= 자동 배치 (검사를 통과한 결과만 사용) ================= */
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  // items: [{answer, hint, ...}] → 가로·세로가 엇갈린 퍼즐
  function generate(items, opt) {
    opt = opt || {};
    var maxR = opt.maxRows || 11, maxC = opt.maxCols || 13, tries = opt.tries || 300;
    var rand = rng(opt.seed || 7);
    var list = items.map(function (it, i) { return { it: it, i: i, a: String(it.answer || '').trim() }; });
    var errs = [];
    list.forEach(function (x) { if (!/^[가-힣]{2,10}$/.test(x.a)) errs.push('「' + x.a + '」: 정답은 2~10글자의 완성된 한글이어야 해요.'); });
    var dup = {};
    list.forEach(function (x) { if (dup[x.a]) errs.push('「' + x.a + '」 낱말이 두 번 들어 있어요.'); dup[x.a] = 1; });
    if (list.length < 2) errs.push('낱말을 2개 이상 넣어 주세요.');
    if (errs.length) return { ok: false, errors: errs };
    // 다른 낱말과 같은 글자가 하나도 없으면 엇갈릴 수 없다
    if (!opt.partial) list.forEach(function (x) {
      var share = list.some(function (y) { return y !== x && y.a.split('').some(function (ch) { return x.a.indexOf(ch) >= 0; }); });
      if (!share) errs.push('「' + x.a + '」 낱말은 다른 낱말과 같은 글자가 하나도 없어서 엇갈려 놓을 수 없어요.');
    });
    if (errs.length) return { ok: false, errors: errs };
    var best = null;
    for (var t = 0; t < tries; t++) {
      var order = list.slice();
      if (t === 0) order.sort(function (a, b) { return b.a.length - a.a.length; });
      else { for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var tmp = order[i]; order[i] = order[j]; order[j] = tmp; } }
      var res = tryLayout(order, maxR, maxC, rand, t % 2 === 1);
      if (!best || res.score > best.score) best = res;
      if (best.placed.length === list.length && t > tries / 3) break;
    }
    if (!best || (best.placed.length < list.length && !opt.partial)) {
      var placed = best ? best.placed.map(function (p) { return p.x.a; }) : [];
      var miss = list.filter(function (x) { return placed.indexOf(x.a) < 0; }).map(function (x) { return '「' + x.a + '」'; });
      return { ok: false, errors: ['낱말을 모두 엇갈리게 놓지 못했어요. 놓지 못한 낱말: ' + miss.join(', ') + ' — 같은 글자를 가진 낱말을 더 넣거나 빼 보세요.'] };
    }
    var minR = 99, minC = 99, mxR = 0, mxC = 0;
    best.placed.forEach(function (p) { minR = Math.min(minR, p.r); minC = Math.min(minC, p.c); var e = endOf(p); mxR = Math.max(mxR, e[0]); mxC = Math.max(mxC, e[1]); });
    var words = best.placed.map(function (p) {
      var w = {}; Object.keys(p.x.it).forEach(function (k) { w[k] = p.x.it[k]; });
      w.answer = p.x.a; w.direction = p.dir; w.row = p.r - minR; w.col = p.c - minC;
      return w;
    });
    var puzzle = { id: opt.id || 'gen', title: opt.title || '새 퍼즐', difficulty: opt.difficulty || 'normal', rows: mxR - minR + 1, cols: mxC - minC + 1, words: words };
    numberWords(puzzle);
    var v = validatePuzzle(puzzle);
    if (!v.ok) return { ok: false, errors: v.errors };
    return { ok: true, puzzle: puzzle, errors: [] };
  }
  function endOf(p) { var d = DIRS[p.dir], L = p.x.a.length - 1; return [p.r + d[0] * L, p.c + d[1] * L]; }
  function tryLayout(order, maxR, maxC, rand, wide) {
    var grid = {}, placed = [];
    function put(x, r, c, dir) {
      var d = DIRS[dir];
      for (var i = 0; i < x.a.length; i++) { var k = (r + d[0] * i) + ',' + (c + d[1] * i); var g = grid[k] || (grid[k] = { ch: x.a[i] }); g[dir] = true; }
      placed.push({ x: x, r: r, c: c, dir: dir });
    }
    function box(extra) {
      var a = placed.concat(extra ? [extra] : []), r0 = 99, c0 = 99, r1 = -99, c1 = -99;
      a.forEach(function (p) { var e = endOf(p); r0 = Math.min(r0, p.r); c0 = Math.min(c0, p.c); r1 = Math.max(r1, e[0]); c1 = Math.max(c1, e[1]); });
      return { h: r1 - r0 + 1, w: c1 - c0 + 1 };
    }
    function can(x, r, c, dir) {
      var d = DIRS[dir], o = [d[1], d[0]], cross = 0;
      if (grid[(r - d[0]) + ',' + (c - d[1])] || grid[(r + d[0] * x.a.length) + ',' + (c + d[1] * x.a.length)]) return -1;
      for (var i = 0; i < x.a.length; i++) {
        var rr = r + d[0] * i, cc = c + d[1] * i, g = grid[rr + ',' + cc];
        if (g) { if (g.ch !== x.a[i] || g[dir]) return -1; cross++; }
        else if (grid[(rr + o[0]) + ',' + (cc + o[1])] || grid[(rr - o[0]) + ',' + (cc - o[1])]) return -1;
      }
      return cross;
    }
    var first = order[0];
    put(first, 0, 0, rand() < 0.5 ? 'across' : 'across');
    var rest = order.slice(1), guard = 0;
    while (rest.length && guard++ < 50) {
      var progressed = false;
      for (var q = 0; q < rest.length; q++) {
        var x = rest[q], cands = [];
        Object.keys(grid).forEach(function (k) {
          var g = grid[k], rc = k.split(',').map(Number);
          for (var i = 0; i < x.a.length; i++) {
            if (x.a[i] !== g.ch) continue;
            ['across', 'down'].forEach(function (dir) {
              if (g[dir]) return;
              var d = DIRS[dir], r = rc[0] - d[0] * i, c = rc[1] - d[1] * i;
              var cr = can(x, r, c, dir);
              if (cr < 1) return;
              var b = box({ x: x, r: r, c: c, dir: dir });
              if (b.h > maxR || b.w > maxC) return;
              // 엇갈림이 많고, 격자가 정사각형에 가깝고 작을수록 좋다
              cands.push({ r: r, c: c, dir: dir, s: cr * 30 - b.h * b.w - Math.abs(b.h * 1.25 - b.w) * 3 + rand() * 6 });
            });
          }
        });
        if (cands.length) {
          cands.sort(function (a, b) { return b.s - a.s; });
          var pick = cands[Math.floor(rand() * Math.min(cands.length, wide ? 4 : 1))];   // 가끔은 덜 촘촘한 자리를 골라 막힘을 피한다
          put(x, pick.r, pick.c, pick.dir);
          rest.splice(q, 1); q--; progressed = true;
        }
      }
      if (!progressed) break;
    }
    var b = box(), crosses = 0;
    Object.keys(grid).forEach(function (k) { if (grid[k].across && grid[k].down) crosses++; });
    return { placed: placed, score: placed.length * 1000 + crosses * 25 - b.h * b.w - Math.abs(b.h * 1.25 - b.w) * 4 };
  }
  // 번호를 표준 규칙(왼쪽 위부터, 가로·세로 시작 칸)으로 매긴다
  function numberWords(p) {
    var starts = {};
    p.words.forEach(function (w) { starts[w.row + ',' + w.col] = true; });
    var ks = Object.keys(starts).map(function (k) { return k.split(',').map(Number); }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var num = {};
    ks.forEach(function (rc, i) { num[rc[0] + ',' + rc[1]] = i + 1; });
    p.words.forEach(function (w) { w.number = num[w.row + ',' + w.col]; });
    p.words.sort(function (a, b) { return (a.direction === b.direction ? 0 : a.direction === 'across' ? -1 : 1) || a.number - b.number; });
    return p;
  }

  var Core = { parse: parse, render: render, step: step, decompose: decompose, Editor: Editor, typeKeys: typeKeys, hangulSelfTest: hangulSelfTest,
    validatePuzzle: validatePuzzle, generate: generate, numberWords: numberWords, wordCells: wordCells, KEYMAP: KEYMAP, SHIFTMAP: SHIFTMAP };

  /* ================= 공통 도우미 ================= */
  var KEY_CUSTOM = 'baekje-hub.crosswordCustom', KEY_EDITS = 'baekje-hub.crosswordEdits';
  var DIFFS = [['easy', '쉬움', '1~2학년'], ['normal', '보통', '3~4학년'], ['hard', '어려움', '5~6학년']];
  var DIFF_OK = { easy: 1, normal: 1, hard: 1 };
  var HINTS = { easy: 5, normal: 3, hard: 2 };
  var BADGE = { easy: { id: 'easy', name: '새싹 낱말 탐험가', icon: '🌱' }, normal: { id: 'normal', name: '백제 역사 탐구가', icon: '📜' }, hard: { id: 'hard', name: '백제 문화유산 박사', icon: '🏅' } };
  var ARTKEYS = ['sarigam', 'hap', 'ho', 'byeong', 'hyangno'];
  var EXTRA_SYL = '백제사비부여공주성왕궁남지산강마나리기와탑석동향로금대흥무령의자위덕계도읍천불교연꽃못집초가절터'.split('');
  var JAMO_STD = [['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'], ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'], ['⇧', 'ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']];
  var JAMO_CMP = [['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ'], ['ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'], ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅗ', 'ㅛ', 'ㅜ'], ['ㅠ', 'ㅡ', 'ㅣ', 'ㅐ', 'ㅔ', '⇧']];

  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function store() { return window.App && App.store; }
  function today() { var d = new Date(); return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.'; }
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // 버튼: 여러 손가락이 동시에 눌러도 pointerId 별로 따로 처리한다. el.click()(키보드·시험용)도 받는다
  function tap(node, fn) {
    var downs = {};
    function clear(e) { if (downs[e.pointerId]) { delete downs[e.pointerId]; if (!Object.keys(downs).length) node.classList.remove('down'); } }
    node.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      downs[e.pointerId] = 1; node.classList.add('down');
      try { node.setPointerCapture(e.pointerId); } catch (x) { /* 시험용 가짜 포인터 */ }
    });
    node.addEventListener('pointerup', function (e) {
      if (!downs[e.pointerId]) return;
      clear(e);
      var r = node.getBoundingClientRect();
      if (e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12) fn(e);
    });
    node.addEventListener('pointercancel', clear);
    node.addEventListener('lostpointercapture', clear);
    node.addEventListener('click', function (e) { if (e.detail === 0) fn(e); });
    return node;
  }
  /* 직접 그린 작은 그림: 석탑, 기와지붕 건물, 성벽, 연꽃무늬 수막새 (이모지로는 백제 느낌이 나지 않는 것들) */
  function drawPagoda(g, s) {
    var cx = s / 2, y = s * 0.92;
    g.fillStyle = '#8f8a80'; g.fillRect(cx - s * 0.3, y - s * 0.07, s * 0.6, s * 0.07);
    g.fillStyle = '#a7a196'; g.fillRect(cx - s * 0.25, y - s * 0.12, s * 0.5, s * 0.05);
    y -= s * 0.12;
    for (var i = 0; i < 5; i++) {
      var w = s * (0.2 - i * 0.024), bh = s * (0.08 - i * 0.008), rw = w * 2, rh = s * 0.032;
      g.fillStyle = '#c3bdb0'; g.fillRect(cx - w / 2, y - bh, w, bh);
      g.strokeStyle = 'rgba(80,74,64,.45)'; g.lineWidth = Math.max(1, s * 0.006); g.beginPath(); g.moveTo(cx - w / 2 + w * 0.12, y); g.lineTo(cx - w / 2 + w * 0.12, y - bh); g.moveTo(cx + w / 2 - w * 0.12, y); g.lineTo(cx + w / 2 - w * 0.12, y - bh); g.stroke();
      y -= bh;
      g.fillStyle = '#7d776c'; g.beginPath(); g.moveTo(cx - rw / 2, y); g.lineTo(cx + rw / 2, y); g.lineTo(cx + rw / 2 - rh * 1.6, y - rh); g.lineTo(cx - rw / 2 + rh * 1.6, y - rh); g.closePath(); g.fill();
      y -= rh;
    }
    g.fillStyle = '#6d675c'; g.fillRect(cx - s * 0.016, y - s * 0.09, s * 0.032, s * 0.09);
  }
  function drawHall(g, s) {
    g.fillStyle = '#b9a88a'; g.fillRect(s * 0.1, s * 0.78, s * 0.8, s * 0.09);
    g.fillStyle = '#efe3c6'; g.fillRect(s * 0.18, s * 0.54, s * 0.64, s * 0.24);
    g.fillStyle = '#9b3b2a';
    [0.19, 0.35, 0.5, 0.65, 0.81].forEach(function (x) { g.fillRect(s * x - s * 0.02, s * 0.54, s * 0.04, s * 0.24); });
    g.fillStyle = '#4f535e'; g.beginPath();
    g.moveTo(s * 0.02, s * 0.45); g.quadraticCurveTo(s * 0.2, s * 0.58, s * 0.5, s * 0.57); g.quadraticCurveTo(s * 0.8, s * 0.58, s * 0.98, s * 0.45);
    g.lineTo(s * 0.78, s * 0.3); g.lineTo(s * 0.22, s * 0.3); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Math.max(1, s * 0.008);
    for (var x = 0.26; x < 0.76; x += 0.06) { g.beginPath(); g.moveTo(s * x, s * 0.32); g.lineTo(s * (x + (x - 0.5) * 0.35), s * 0.55); g.stroke(); }
    g.fillStyle = '#383b44'; g.fillRect(s * 0.2, s * 0.26, s * 0.6, s * 0.05);
  }
  function drawFortress(g, s) {
    g.fillStyle = '#86a86a'; g.beginPath(); g.moveTo(0, s * 0.95); g.quadraticCurveTo(s * 0.5, s * 0.25, s, s * 0.95); g.closePath(); g.fill();
    g.fillStyle = '#c9b895'; g.fillRect(s * 0.14, s * 0.5, s * 0.72, s * 0.22);
    for (var i = 0; i < 6; i++) g.fillRect(s * (0.14 + i * 0.13), s * 0.43, s * 0.08, s * 0.08);
    g.strokeStyle = 'rgba(90,70,40,.5)'; g.lineWidth = Math.max(1, s * 0.008);
    for (var r = 0; r < 3; r++) { g.beginPath(); g.moveTo(s * 0.14, s * (0.57 + r * 0.06)); g.lineTo(s * 0.86, s * (0.57 + r * 0.06)); g.stroke(); }
    g.fillStyle = '#4a3420'; g.beginPath(); g.moveTo(s * 0.43, s * 0.72); g.lineTo(s * 0.43, s * 0.6); g.quadraticCurveTo(s * 0.5, s * 0.52, s * 0.57, s * 0.6); g.lineTo(s * 0.57, s * 0.72); g.fill();
  }
  var DRAWN = { pagoda: drawPagoda, hall: drawHall, fortress: drawFortress, roundel: function (g, s) { drawRoundel(g, s / 2, s / 2, s * 0.44, 1, 0); } };
  function picture(img, size) {
    var box = el('div', 'cw-pic');
    box.style.width = box.style.height = size + 'px';
    if (img && DRAWN[img] && window.Activities) {
      var dc = el('canvas'), dg = Activities.hiDpi(dc, size, size);
      try { DRAWN[img](dg, size); } catch (e) { box.textContent = '📜'; }
      box.appendChild(dc);
    } else if (img && ARTKEYS.indexOf(img) >= 0 && window.Art && window.Activities) {
      var cv = el('canvas'), g = Activities.hiDpi(cv, size, size);
      var a = (Art.aspect && Art.aspect(img)) || 1, w = size * 0.9, h = size * 0.9;
      if (a < 1) w = h * a; else h = w / a;
      try { Art.draw(g, img, (size - w) / 2, (size - h) / 2, w, h); } catch (e) { box.textContent = '🏺'; }
      box.appendChild(cv);
    } else { box.textContent = img || '📜'; box.style.fontSize = Math.round(size * 0.6) + 'px'; }
    return box;
  }

  // 기본 퍼즐 + 선생님 퍼즐을 읽고, 선생님이 고친 힌트·설명을 반영한 뒤 모두 검사한다
  function loadPuzzles(data) {
    var base = (data && data.crossword && data.crossword.puzzles) || [];
    var st = store();
    var custom = ((st && st.get(KEY_CUSTOM)) || {}).puzzles || [];
    var edits = (st && st.get(KEY_EDITS)) || {};
    var ok = [], bad = [], ids = {};
    base.map(function (p) { var c = clone(p); c.builtin = true; return c; })
      .concat(custom.map(function (p) { var c = clone(p); c.custom = true; return c; }))
      .forEach(function (p) {
        try {
          if (!DIFF_OK[p.difficulty]) p.difficulty = 'normal';
          var ed = edits[p.id] || {};
          (p.words || []).forEach(function (w) {
            var e = w && ed[w.answer + '|' + w.direction];
            if (e) { if (e.hint && String(e.hint).trim()) w.hint = e.hint; if (e.explain != null && String(e.explain).trim()) w.explain = e.explain; }
          });
          var v = validatePuzzle(p);
          if (v.ok && ids[p.id]) v = { ok: false, errors: ['퍼즐 id 「' + p.id + '」가 겹쳐요.'] };
          if (v.ok) { ids[p.id] = 1; p.words.sort(function (a, b) { return (a.direction === b.direction ? 0 : a.direction === 'across' ? -1 : 1) || a.number - b.number; }); ok.push(p); }
          else bad.push({ id: p.id, title: p.title || p.id || '(이름 없음)', errors: v.errors, custom: !!p.custom });
        } catch (e) { bad.push({ id: p && p.id, title: (p && p.title) || '(이름 없음)', errors: ['퍼즐을 읽는 중 문제가 생겼어요: ' + e.message], custom: !!(p && p.custom) }); }
      });
    return { list: ok, bad: bad };
  }

  if (window.Sound && Sound.define) {
    Sound.define('cw-bloom', function (a) {
      [523, 659, 784, 988, 1175, 1568].forEach(function (f, i) { a.tone(f, 0.9, { type: 'sine', gain: 0.07, delay: i * 0.11, attack: 0.05 }); });
      a.tone(262, 2, { type: 'triangle', gain: 0.08, attack: 0.2 });
    });
  }

  /* ================= 연꽃무늬 수막새 (완성 축하) ================= */
  function drawRoundel(g, cx, cy, R, t, glowA) {
    var e = function (x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };
    var back = function (x) { x = Math.max(0, Math.min(1, x)); var c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    g.save(); g.translate(cx, cy);
    var gl = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.7);
    gl.addColorStop(0, 'rgba(255,220,120,' + (0.55 * glowA) + ')'); gl.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gl; g.fillRect(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4);
    // 수막새 바탕과 테두리
    var k = e(t / 0.25);
    g.globalAlpha = k;
    var bg = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R * 1.05);
    bg.addColorStop(0, '#8a6324'); bg.addColorStop(1, '#4a3210');
    g.fillStyle = bg; g.beginPath(); g.arc(0, 0, R * 1.02 * k, 0, Math.PI * 2); g.fill();
    g.lineWidth = R * 0.07; g.strokeStyle = '#f2c75c'; g.beginPath(); g.arc(0, 0, R * 0.98 * k, 0, Math.PI * 2); g.stroke();
    g.lineWidth = R * 0.02; g.strokeStyle = 'rgba(255,236,170,.7)'; g.beginPath(); g.arc(0, 0, R * 0.88 * k, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    // 여덟 장의 연꽃잎이 차례로 핀다
    for (var i = 0; i < 8; i++) {
      var s = back((t - 0.18 - i * 0.055) / 0.28);
      if (s <= 0) continue;
      g.save(); g.rotate(i * Math.PI / 4); g.scale(s, s);
      var pg = g.createLinearGradient(0, -R * 0.25, 0, -R * 0.82);
      pg.addColorStop(0, '#fff0b8'); pg.addColorStop(0.55, '#f2c75c'); pg.addColorStop(1, '#c9921f');
      g.fillStyle = pg; g.strokeStyle = '#7a5310'; g.lineWidth = R * 0.018;
      g.beginPath(); g.moveTo(0, -R * 0.26);
      g.bezierCurveTo(R * 0.26, -R * 0.36, R * 0.24, -R * 0.7, 0, -R * 0.82);
      g.bezierCurveTo(-R * 0.24, -R * 0.7, -R * 0.26, -R * 0.36, 0, -R * 0.26);
      g.fill(); g.stroke();
      // 꽃잎 끝의 작은 반전(백제 수막새의 특징을 단순하게 표현)
      g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(0, -R * 0.71, R * 0.035, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(122,83,16,.55)'; g.beginPath(); g.moveTo(0, -R * 0.3); g.lineTo(0, -R * 0.64); g.stroke();
      g.restore();
    }
    // 가운데 씨방과 연밥
    var c = e((t - 0.62) / 0.25);
    if (c > 0) {
      g.fillStyle = '#f7d77a'; g.strokeStyle = '#7a5310'; g.lineWidth = R * 0.02;
      g.beginPath(); g.arc(0, 0, R * 0.22 * c, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#8a6324';
      g.beginPath(); g.arc(0, 0, R * 0.04 * c, 0, Math.PI * 2); g.fill();
      for (i = 0; i < 8; i++) { g.beginPath(); g.arc(Math.cos(i * Math.PI / 4) * R * 0.13 * c, Math.sin(i * Math.PI / 4) * R * 0.13 * c, R * 0.03 * c, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }

  /* ================= 게임 ================= */
  function mount(root, host) {
    var opts = host.options || {};
    var NP = Math.max(1, Math.min(4, (opts.players | 0) || 1));
    var LAY = NP === 1
      ? { board: [132, 104, 1208, 574], side: [1356, 104, 536, 910], pads: [66, 690, 1274, 382] }
      : { board: [132, 104, 1158, 456], side: [1306, 104, 586, 456], pads: [66, 572, 1788, 500] };
    var dead = false, paused = false, screen = 'select';
    var timers = {}, docL = [], clock = 0, lastT = 0, rafId = 0, saveT = 0, chooserT = 0;
    function safe(fn) { return function () { if (dead) return; try { return fn.apply(this, arguments); } catch (e) { host.error(e); } }; }
    function later(fn, ms) { var id = setTimeout(function () { delete timers[id]; safe(fn)(); }, ms); timers[id] = 1; return id; }
    function cancel(id) { if (id) { clearTimeout(id); delete timers[id]; } }
    function listen(t, ev, fn, o) { t.addEventListener(ev, fn, o); docL.push([t, ev, fn, o]); }

    var save = host.load() || {};
    if (!save.done) save.done = {};
    var PZ = loadPuzzles(host.data);
    var G = null, players = [], kb = 0;
    var tab = DIFF_OK[opts.difficulty] ? opts.difficulty : 'easy';
    var limitMin = (opts.timeLimit | 0) > 0 ? (opts.timeLimit | 0) : 8;
    var timerOn = save.timerOn != null ? !!save.timerOn : (opts.timeLimit | 0) > 0;

    /* ---------- 화면 뼈대 ---------- */
    root.classList.add('cw-root', 'cw-n' + NP);
    var ime = el('input', 'cw-ime');
    ime.setAttribute('inputmode', 'none'); ime.setAttribute('autocomplete', 'off'); ime.setAttribute('spellcheck', 'false'); ime.tabIndex = -1;
    root.appendChild(ime);
    var top = el('div', 'cw-top'); root.appendChild(top);
    var boardWrap = el('div', 'cw-boardwrap'); root.appendChild(boardWrap);
    box(boardWrap, LAY.board);
    var side = el('div', 'cw-side'); root.appendChild(side); box(side, LAY.side);
    var hintBox = NP === 1 ? el('div', 'cw-hintbox') : null;
    if (hintBox) side.appendChild(hintBox);
    var clueBox = el('div', 'cw-clues'); side.appendChild(clueBox);
    var padLayer = el('div', 'cw-pads'); root.appendChild(padLayer);
    var layer = el('div', 'cw-layer'); root.appendChild(layer);
    function box(n, b) { n.style.left = b[0] + 'px'; n.style.top = b[1] + 'px'; n.style.width = b[2] + 'px'; n.style.height = b[3] + 'px'; }
    // 버튼을 눌러도 숨은 입력 칸의 포커스(한글 IME)가 빠지지 않게 한다 (글자 입력 칸은 예외)
    listen(root, 'mousedown', function (e) { var t = e.target; if (t !== ime && !(t.closest && t.closest('input,textarea,select'))) e.preventDefault(); });
    function focusIme() { try { if (!dead && document.activeElement !== ime) ime.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }

    /* ---------- 퍼즐 시작 ---------- */
    function startPuzzle(p, rs) {
      closeLayer();
      var limit = (p.difficulty === 'hard' && timerOn) ? limitMin * 60 : 0;
      G = { p: p, cells: {}, words: [], order: [], score: 0, hintsLeft: HINTS[p.difficulty], hintsUsed: 0, wrongs: 0, elapsed: 0, limit: limit, over: false, newCodex: [] };
      p.words.forEach(function (w, i) {
        var W = { i: i, d: w, cells: [], solved: false, owner: -1, wrongs: 0 };
        wordCells(w).forEach(function (rc, k) {
          var key = rc[0] + ',' + rc[1];
          var c = G.cells[key] || (G.cells[key] = { key: key, r: rc[0], c: rc[1], ans: w.answer[k], letter: '', locked: false, words: [], num: 0, bad: false, comp: false, gold: 0 });
          c.words.push(i); W.cells.push(c);
        });
        G.words.push(W); G.order.push(i);
      });
      G.words.forEach(function (W) { W.cells[0].num = W.d.number; });
      if (rs) {
        G.score = rs.score | 0; G.hintsLeft = rs.hintsLeft != null ? rs.hintsLeft : G.hintsLeft; G.hintsUsed = rs.hintsUsed | 0; G.wrongs = rs.wrongs | 0;
        G.elapsed = +rs.elapsed || 0; G.limit = rs.limit != null ? rs.limit : G.limit;
        Object.keys(rs.letters || {}).forEach(function (k) { if (G.cells[k]) G.cells[k].letter = rs.letters[k]; });
        (rs.locked || []).forEach(function (k) { if (G.cells[k]) { G.cells[k].locked = true; G.cells[k].letter = G.cells[k].ans; } });
        (rs.solved || []).forEach(function (i) { var W = G.words[i]; if (W) { W.solved = true; W.cells.forEach(function (c) { c.locked = true; c.letter = c.ans; }); } });
        (rs.ww || []).forEach(function (n, i) { if (G.words[i]) G.words[i].wrongs = n | 0; });
      }
      var defMode = p.difficulty === 'easy' || NP >= 3 ? 'tile' : 'jamo';
      players = [];
      for (var i = 0; i < NP; i++) players.push({ i: i, col: host.PCOL[i], name: host.PNAME[i], sel: -1, ed: null, free: [], mode: defMode, shift: false, tiles: [], view: 'keys', exq: [], sig: '', msgT: 0, last: -1 });
      kb = 0;
      buildBoard(); buildClues(); buildPads();
      screen = 'play';
      for (i = 0; i < NP; i++) autoPick(i, true);
      startClock();
      render();
      saveProgress();
      focusIme();
    }

    /* ---------- 격자판 ---------- */
    var boardEl = null, cellEls = {}, CS = 80;
    function buildBoard() {
      boardWrap.innerHTML = '';
      var p = G.p, W = LAY.board[2] - 40, H = LAY.board[3] - 40;
      CS = Math.floor(Math.min(W / p.cols, H / p.rows, 128));
      boardEl = el('div', 'cw-board');
      boardEl.style.width = (CS * p.cols + 28) + 'px'; boardEl.style.height = (CS * p.rows + 28) + 'px';
      boardEl.style.setProperty('--cs', CS + 'px');
      cellEls = {};
      for (var r = 0; r < p.rows; r++) for (var c = 0; c < p.cols; c++) {
        var key = r + ',' + c, cell = G.cells[key];
        var d = el('div', cell ? 'cw-cell' : 'cw-block');
        d.style.left = (14 + c * CS + 2) + 'px'; d.style.top = (14 + r * CS + 2) + 'px';
        d.style.width = d.style.height = (CS - 4) + 'px';
        if (cell) {
          d.dataset.key = key;
          if (cell.num) d.appendChild(el('span', 'cw-num', String(cell.num)));
          d.appendChild(el('span', 'cw-ch', ''));
          cellEls[key] = d;
        }
        boardEl.appendChild(d);
      }
      // 칸 누르기: pointerId 별로 누른 칸을 기억했다가 같은 칸에서 떼면 선택
      var downs = {};
      boardEl.addEventListener('pointerdown', function (e) { var t = e.target.closest && e.target.closest('.cw-cell'); if (t) downs[e.pointerId] = t; });
      boardEl.addEventListener('pointerup', safe(function (e) {
        var t = e.target.closest && e.target.closest('.cw-cell'), d0 = downs[e.pointerId];
        delete downs[e.pointerId];
        if (t && t === d0) cellTap(G.cells[t.dataset.key], e);
      }));
      boardEl.addEventListener('pointercancel', function (e) { delete downs[e.pointerId]; });
      boardEl.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') delete downs[e.pointerId]; });
      boardWrap.appendChild(boardEl);
    }
    function cellTap(cell, e) {
      if (!G || G.over || !cell) return;
      if (NP === 1) return pickCell(0, cell);
      var w0 = cell.words.filter(function (w) { return !G.words[w].solved; })[0];
      openChooser(e, w0 != null ? wordLabel(G.words[w0]) : '완성된 칸', function (pi) { pickCell(pi, cell); });
    }
    function pickCell(pi, cell) {
      var pl = players[pi];
      var ws = cell.words.filter(function (w) { return !G.words[w].solved; });
      if (!ws.length) { showExplain(pi, cell.words[cell.words.length - 1], true); return; }
      if (pl.sel >= 0 && cell.words.indexOf(pl.sel) >= 0) {
        var other = ws.filter(function (w) { return w !== pl.sel; })[0];
        var idx = pl.free.indexOf(cell);
        if (other != null && (idx < 0 || pl.ed.cur === idx)) { selectWord(pi, other); return; }
        if (idx >= 0) { pl.ed.moveTo(idx); sync(pl); host.sound('tap'); render(); }
        return;
      }
      var ok = ws.filter(function (w) { return canSelect(pi, w).ok; });
      selectWord(pi, ok.length ? ok[0] : ws[0]);
    }

    /* ---------- 문제 목록 ---------- */
    var clueEls = [];
    function buildClues() {
      clueBox.innerHTML = '';
      clueEls = [];
      [['across', '➡️ 가로 낱말'], ['down', '⬇️ 세로 낱말']].forEach(function (sec) {
        clueBox.appendChild(el('h4', '', sec[1]));
        G.words.forEach(function (W) {
          if (W.d.direction !== sec[0]) return;
          var b = el('button', 'cw-clue');
          b.tabIndex = -1;
          b.innerHTML = '<span class="n">' + W.d.number + '</span>' + 
            '<span class="t">' + esc(W.d.hint) + '</span><span class="s"></span>';
          if (G.p.difficulty === 'easy') b.insertBefore(picture(W.d.image, 44), b.querySelector('.t'));
          tap(b, safe(function (e) {
            if (!G || G.over) return;
            if (NP === 1) { if (W.solved) showExplain(0, W.i, true); else selectWord(0, W.i); return; }
            openChooser(e, wordLabel(W), function (pi) { if (W.solved) showExplain(pi, W.i, true); else selectWord(pi, W.i); });
          }));
          clueEls[W.i] = b;
          clueBox.appendChild(b);
        });
      });
    }
    function wordLabel(W) { return W.d.number + '번 ' + DNAME[W.d.direction]; }

    /* ---------- 여러 명: 누가 풀지 고르기 ---------- */
    var chooser = null;
    function openChooser(e, label, fn) {
      closeChooser();
      var pt = e && e.clientX != null ? host.mapPoint(e.clientX, e.clientY) : { x: 960, y: 400 };
      var bx = el('div', 'cw-chooser');
      bx.appendChild(el('div', 'cw-ch-t', esc(label) + ' · 누가 풀까요?'));
      var row = el('div', 'cw-ch-row');
      players.forEach(function (pl) {
        var b = el('button', 'cw-ch-b', '<b>' + esc(pl.name) + '</b>');
        b.tabIndex = -1; b.style.background = pl.col;
        tap(b, safe(function () { closeChooser(); fn(pl.i); }));
        row.appendChild(b);
      });
      var x = el('button', 'cw-ch-x', '✕'); x.tabIndex = -1;
      tap(x, function () { closeChooser(); });
      row.appendChild(x);
      bx.appendChild(row);
      var w = NP * 132 + 120, h = 170;
      bx.style.left = Math.max(130, Math.min(1920 - w - 70, pt.x - w / 2)) + 'px';
      bx.style.top = Math.max(100, Math.min(1080 - h - 20, pt.y - h - 30)) + 'px';
      root.appendChild(bx); chooser = bx;
      chooserT = later(closeChooser, 6000);
      host.sound('tap');
    }
    function closeChooser() { cancel(chooserT); chooserT = 0; if (chooser && chooser.parentNode) chooser.parentNode.removeChild(chooser); chooser = null; }

    /* ---------- 낱말 고르기와 잠금 ---------- */
    function who(q) { return players[q] ? players[q].name : ''; }
    function canSelect(pi, wi) {
      var W = G.words[wi];
      if (!W) return { ok: false, why: '없는 낱말이에요.' };
      if (W.solved) return { ok: false, why: '이미 완성한 낱말이에요.' };
      if (W.owner >= 0 && W.owner !== pi) return { ok: false, why: who(W.owner) + ' 친구가 풀고 있는 낱말이에요.', q: W.owner };
      for (var q = 0; q < NP; q++) {
        if (q === pi || players[q].sel < 0) continue;
        var O = G.words[players[q].sel];
        if (W.cells.some(function (c) { return !c.locked && O.cells.indexOf(c) >= 0; })) return { ok: false, why: who(q) + ' 친구가 쓰고 있는 낱말과 겹치는 칸이 있어요. 그 낱말을 다 풀 때까지 기다려요.', q: q };
      }
      return { ok: true };
    }
    function selectWord(pi, wi, o) {
      var pl = players[pi];
      if (!G || G.over || !pl) return false;
      kb = pi;
      if (pl.sel === wi) { pl.view = 'keys'; pl.exq = []; render(); return true; }
      var r = canSelect(pi, wi);
      if (!r.ok) {
        padMsg(pi, '🔒 ' + r.why, 'warn');
        if (!(o && o.quiet)) host.sound('wrong');
        if (clueEls[wi]) { clueEls[wi].classList.remove('nope'); void clueEls[wi].offsetWidth; clueEls[wi].classList.add('nope'); }
        return false;
      }
      release(pi);
      var W = G.words[wi];
      W.owner = pi; pl.sel = wi; pl.last = wi; pl.view = 'keys'; pl.exq = [];
      bindEditor(pl);
      if (!(o && o.quiet)) host.sound('select');
      if (clueEls[wi] && clueEls[wi].scrollIntoView && NP === 1) try { clueEls[wi].scrollIntoView({ block: 'nearest' }); } catch (e) { /* 무시 */ }
      render();
      return true;
    }
    function release(pi) {
      var pl = players[pi];
      if (pl.sel >= 0) { if (pl.ed) { pl.ed.finalize(); sync(pl); } G.words[pl.sel].owner = -1; }
      pl.sel = -1; pl.ed = null; pl.free = []; pl.tiles = []; pl.shift = false;
    }
    function bindEditor(pl) {
      var W = G.words[pl.sel];
      pl.free = W.cells.filter(function (c) { return !c.locked; });
      pl.ed = Editor(pl.free.length, pl.free.map(function (c) { return isSyl(c.letter) ? c.letter : ''; }));
      pl.free.forEach(function (c) { if (!isSyl(c.letter)) c.letter = ''; c.comp = false; });
      pl.tiles = makeTiles(pl);
    }
    // 1명: 다음 낱말을 자동으로, 여러 명: 서로 겹치지 않는 낱말을 하나씩
    function autoPick(pi, quiet) {
      var pl = players[pi], n = G.order.length;
      var start = Math.max(0, G.order.indexOf(pl.last) + 1);
      for (var k = 0; k < n; k++) {
        var wi = G.order[(start + k) % n];
        if (canSelect(pi, wi).ok) return selectWord(pi, wi, { quiet: quiet });
      }
      return false;
    }
    function navWord(pi, dir) {
      var pl = players[pi], n = G.order.length;
      var at = G.order.indexOf(pl.sel >= 0 ? pl.sel : pl.last);
      for (var k = 1; k <= n; k++) {
        var wi = G.order[((at < 0 ? (dir > 0 ? -1 : 0) : at) + dir * k + n * 4) % n];
        if (canSelect(pi, wi).ok) { selectWord(pi, wi); return; }
      }
      padMsg(pi, '지금 고를 수 있는 다른 낱말이 없어요.', 'warn');
    }

    /* ---------- 글자 입력 ---------- */
    function sync(pl) {
      if (!pl.ed) return;
      pl.free.forEach(function (c, i) {
        var v = pl.ed.slots[i] || '';
        if (v !== c.letter) c.bad = false;
        c.letter = v; c.comp = pl.ed.keys.length > 0 && i === pl.ed.cur;
      });
    }
    function ready(pi) {
      var pl = players[pi];
      if (!G || G.over || paused || screen !== 'play' || !pl) return null;
      kb = pi;
      if (pl.view === 'explain') { pl.view = 'keys'; pl.exq = []; }
      if (pl.sel < 0) { padMsg(pi, '먼저 격자판의 칸이나 오른쪽 문제를 눌러 낱말을 골라요.'); host.sound('tap'); render(); return null; }
      return pl;
    }
    function typed(pl, ok, snd) {
      if (!ok) { padMsg(pl.i, '칸이 다 찼어요. ✔ 정답 확인을 눌러 보세요.'); host.sound('tap'); }
      else host.sound(snd || 'tile');
      sync(pl); render(); dirty();
    }
    function inJamo(pi, k) {
      var pl = ready(pi); if (!pl) return;
      if (pl.shift && Core.SHIFTMAP[k]) k = Core.SHIFTMAP[k];
      pl.shift = false;
      typed(pl, pl.ed.key(k));
    }
    function inSyl(pi, s) { var pl = ready(pi); if (!pl) return; typed(pl, pl.ed.syl(s)); }
    function inText(pi, str) { var pl = ready(pi); if (!pl) return; typed(pl, pl.ed.text(str)); }
    function inErase(pi) { var pl = ready(pi); if (!pl) return; var ok = pl.ed.back(pl.mode === 'tile'); sync(pl); host.sound(ok ? 'erase' : 'tap'); render(); dirty(); }
    function inClear(pi) { var pl = ready(pi); if (!pl) return; pl.ed.clear(); sync(pl); host.sound('erase'); padMsg(pi, '입력을 모두 지웠어요.'); render(); dirty(); }
    function setMode(pi, m) { var pl = players[pi]; if (pl.mode === m) return; if (pl.ed) { pl.ed.finalize(); sync(pl); } pl.mode = m; pl.shift = false; host.sound('tap'); render(); }

    function check(pi) {
      var pl = ready(pi); if (!pl) return;
      pl.ed.finalize(); sync(pl);
      var W = G.words[pl.sel];
      if (W.cells.some(function (c) { return !isSyl(c.letter); })) {
        padMsg(pi, '아직 비어 있거나 덜 쓴 칸이 있어요.', 'warn'); host.sound('tap'); shake(W); render(); return;
      }
      if (W.cells.every(function (c) { return c.letter === c.ans; })) { solveWord(W.i, pi); return; }
      W.wrongs++; G.wrongs++; G.score = Math.max(0, G.score - 10);
      host.sound('wrong'); shake(W);
      if (W.wrongs >= 2) {
        W.cells.forEach(function (c) { if (!c.locked && c.letter !== c.ans) c.bad = true; });
        padMsg(pi, '빨간 줄이 있는 칸을 다시 생각해 봐요. 💡 힌트를 써도 좋아요!', 'warn');
      } else padMsg(pi, '아쉬워요! 다시 한 번 생각해 볼까요?', 'warn');
      render(); dirty();
    }
    function hint(pi) {
      var pl = ready(pi); if (!pl) return;
      if (G.hintsLeft <= 0) { padMsg(pi, '이번 퍼즐의 힌트를 모두 썼어요.', 'warn'); host.sound('wrong'); return; }
      pl.ed.finalize(); sync(pl);
      var cur = pl.free[Math.min(pl.ed.cur, pl.free.length - 1)];
      var t = cur && cur.letter !== cur.ans ? cur : pl.free.filter(function (c) { return c.letter !== c.ans; })[0];
      if (!t) { padMsg(pi, '글자가 모두 맞아요! ✔ 정답 확인을 눌러 보세요.'); host.sound('tap'); return; }
      G.hintsLeft--; G.hintsUsed++; G.score = Math.max(0, G.score - 30);
      t.letter = t.ans; t.locked = true; t.bad = false; t.comp = false; t.gold = Date.now();
      bindEditor(pl);
      host.sound('sparkle');
      padMsg(pi, '💡 「' + t.ans + '」 글자를 열었어요. (힌트 ' + G.hintsLeft + '번 남음)');
      autoSolve(pi);
      render(); dirty();
    }
    // 모든 칸이 고정된 낱말은 저절로 완성된다 (엇갈리는 낱말이 모두 풀렸을 때)
    function autoSolve(pi) {
      G.words.forEach(function (W) { if (!W.solved && W.cells.every(function (c) { return c.locked; })) solveWord(W.i, W.owner >= 0 ? W.owner : pi, { auto: true }); });
    }
    function solveWord(wi, pi, o) {
      var W = G.words[wi];
      if (W.solved) return;
      W.solved = true;
      var now = Date.now();
      W.cells.forEach(function (c, k) { c.letter = c.ans; c.locked = true; c.bad = false; c.comp = false; c.gold = now + k * 110; });
      var gain = 100 + W.d.answer.length * 10;
      G.score += gain;
      if (W.owner >= 0) { var q = players[W.owner]; q.sel = -1; q.ed = null; q.free = []; q.tiles = []; W.owner = -1; }
      host.sound(W.d.direction === 'across' ? 'word' : 'word2');
      later(function () { host.sound('sparkle'); }, 380);
      var res = W.d.card ? host.award({ codex: [W.d.card], silent: true }) : null;
      var card = res && res.newCodex && res.newCodex[0];
      if (card) G.newCodex.push(card);
      W.gain = gain; W.newCard = card || null;
      // 엇갈리는 칸이 고정되었으니 그 칸을 쓰던 다른 친구의 입력 칸을 다시 묶는다
      players.forEach(function (q) { if (q.sel >= 0 && G.words[q.sel].cells.some(function (c) { return W.cells.indexOf(c) >= 0; })) bindEditor(q); });
      var pl = players[pi];
      if (pl) { pl.exq.push(wi); pl.view = 'explain'; pl.last = wi; }
      autoSolve(pi);
      // 기록·보상은 바로 남기고, 결과 화면은 마지막 설명을 잠깐 본 뒤에 (그 사이 다른 퍼즐을 시작해도 기록이 섞이지 않게)
      if (!G.done && G.words.every(function (x) { return x.solved; })) { var g0 = G; finish(false, true); later(function () { if (G === g0 && screen === 'play') showResult(g0.result); }, 2200); }
      render(); dirty();
    }
    function showExplain(pi, wi, again) {
      var pl = players[pi];
      if (!pl || wi == null) return;
      if (pl.sel >= 0) release(pi);
      pl.exq = [wi]; pl.view = 'explain'; pl.again = !!again;
      host.sound('select'); render();
    }
    function cont(pi) {
      var pl = players[pi];
      pl.exq.shift();
      if (!pl.exq.length) { pl.view = 'keys'; pl.again = false; if (pl.sel < 0 && G && !G.over) autoPick(pi, true); }
      host.sound('tap'); render();
    }
    function shake(W) {
      W.cells.forEach(function (c) { var d = cellEls[c.key]; if (!d) return; d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); });
    }

    /* ---------- 글자 타일 ---------- */
    function padSize(pl) {
      var pw = NP === 1 ? LAY.pads[2] : (LAY.pads[2] - (NP - 1) * 12) / NP;
      if (NP === 1) return { w: pw - 16 - 264 - 10, h: 286 };
      return { w: pw - 16, h: 244 };
    }
    function makeTiles(pl) {
      var need = pl.free.map(function (c) { return c.ans; });
      var sz = padSize(pl), ts = Math.min(124, Math.floor((sz.h - 10) / 2));
      var cols = Math.max(3, Math.floor((sz.w + 10) / (ts + 10)));
      var cap = cols * 2;
      var extra = G.p.difficulty === 'easy' ? 3 : 5;
      var total = Math.max(need.length + 1, Math.min(cap, need.length + extra));
      var rnd = rng((Date.now() & 0xffff) + pl.i * 97 + pl.sel * 13);
      var pool = [];
      G.words.forEach(function (W) { W.d.answer.split('').forEach(function (s) { pool.push(s); }); });
      pool = pool.concat(EXTRA_SYL).filter(function (s, i, a) { return need.indexOf(s) < 0 && a.indexOf(s) === i; });
      shuffle(pool, rnd);
      var tiles = need.concat(pool.slice(0, total - need.length));
      return shuffle(tiles, rnd).map(function (s, i) { return { s: s, id: i }; });
    }
    function tileUsage(pl) {
      var cnt = {}; pl.free.forEach(function (c) { if (isSyl(c.letter)) cnt[c.letter] = (cnt[c.letter] || 0) + 1; });
      return pl.tiles.map(function (t) { if (cnt[t.s]) { cnt[t.s]--; return true; } return false; });
    }

    /* ---------- 글자판 (사람마다 하나) ---------- */
    var padEls = [];
    function buildPads() {
      padLayer.innerHTML = '';
      padEls = [];
      var pw = NP === 1 ? LAY.pads[2] : (LAY.pads[2] - (NP - 1) * 12) / NP;
      players.forEach(function (pl, i) {
        var pad = el('div', 'cw-pad');
        pad.style.setProperty('--pc', pl.col);
        box(pad, [LAY.pads[0] + i * (pw + 12), LAY.pads[1], pw, LAY.pads[3]]);
        var head = el('div', 'cw-ph');
        var prev = el('button', 'cw-nav', '◀'), next = el('button', 'cw-nav', '▶');
        prev.title = '이전 낱말'; next.title = '다음 낱말';
        var lab = el('div', 'cw-pw');
        var mode = el('div', 'cw-mode');
        var mt = el('button', 'seg', '가<small>글자</small>'), mj = el('button', 'seg', 'ㄱ<small>자모</small>');
        [prev, next, mt, mj].forEach(function (b) { b.tabIndex = -1; });
        tap(prev, safe(function () { navWord(i, -1); }));
        tap(next, safe(function () { navWord(i, 1); }));
        tap(mt, safe(function () { setMode(i, 'tile'); }));
        tap(mj, safe(function () { setMode(i, 'jamo'); }));
        mode.appendChild(mt); mode.appendChild(mj);
        if (NP > 1) head.appendChild(el('div', 'cw-who', esc(pl.name)));
        head.appendChild(prev); head.appendChild(lab); head.appendChild(next); head.appendChild(mode);
        pad.appendChild(head);
        var ph = NP > 1 ? el('div', 'cw-phint') : null;
        if (ph) pad.appendChild(ph);
        var body = el('div', 'cw-pbody');
        var keys = el('div', 'cw-keys');
        var acts = el('div', 'cw-acts');
        var A = {};
        [['hint', '💡', '힌트 보기'], ['erase', '⌫', '한 글자 지우기'], ['clear', '✖', '입력 취소'], ['check', '✔', '정답 확인']].forEach(function (a) {
          var b = el('button', 'cw-act' + (a[0] === 'check' ? ' ok' : ''), '<i>' + a[1] + '</i><span>' + a[2] + '</span>');
          b.tabIndex = -1; b.dataset.act = a[0];
          tap(b, safe(function () { ({ hint: hint, erase: inErase, clear: inClear, check: check })[a[0]](i); }));
          acts.appendChild(b); A[a[0]] = b;
        });
        body.appendChild(keys); body.appendChild(acts);
        pad.appendChild(body);
        var msg = el('div', 'cw-pmsg'); pad.appendChild(msg);
        var ex = el('div', 'cw-explain hidden'); pad.appendChild(ex);
        padLayer.appendChild(pad);
        padEls[i] = { pad: pad, lab: lab, mt: mt, mj: mj, ph: ph, keys: keys, acts: A, msg: msg, ex: ex };
      });
    }
    function buildKeys(pl) {
      var pe = padEls[pl.i], k = pe.keys, sz = padSize(pl);
      k.innerHTML = '';
      pe.tileEls = []; pe.keyEls = [];
      if (pl.sel < 0) { k.appendChild(el('div', 'cw-idle', NP === 1 ? '격자판의 칸이나 오른쪽 문제를 눌러<br>풀 낱말을 골라요.' : '격자판의 칸이나 문제를 눌러<br>낱말을 골라요.')); return; }
      if (pl.mode === 'tile') {
        var ts = Math.min(124, Math.floor((sz.h - 10) / 2));
        var cols = Math.max(3, Math.floor((sz.w + 10) / (ts + 10)));
        var n = pl.tiles.length, rows = n > cols ? 2 : 1, per = Math.ceil(n / rows);
        ts = Math.min(ts, Math.floor((sz.w - (per - 1) * 10) / per));
        for (var r = 0; r < rows; r++) {
          var row = el('div', 'cw-krow');
          pl.tiles.slice(r * per, (r + 1) * per).forEach(function (t) {
            var b = el('button', 'cw-tile', esc(t.s));
            b.tabIndex = -1; b.dataset.s = t.s;
            b.style.width = b.style.height = ts + 'px'; b.style.fontSize = Math.round(ts * 0.46) + 'px';
            tap(b, safe(function () { if (!b.classList.contains('used')) inSyl(pl.i, t.s); }));
            row.appendChild(b); pe.tileEls.push(b);
          });
          k.appendChild(row);
        }
      } else {
        var lay = NP >= 3 ? JAMO_CMP : JAMO_STD, maxc = lay[0].length, gap = NP >= 3 ? 6 : 6;
        var kw = Math.floor((sz.w - (maxc - 1) * gap) / maxc), kh = Math.floor((sz.h - (lay.length - 1) * 8) / lay.length);
        kw = Math.min(kw, 110); kh = Math.min(kh, 96);
        lay.forEach(function (rowK) {
          var row = el('div', 'cw-krow');
          rowK.forEach(function (j) {
            var sh = j === '⇧', lab = sh ? '⇧<small>쌍</small>' : (pl.shift && Core.SHIFTMAP[j] ? Core.SHIFTMAP[j] : j);
            var b = el('button', 'cw-key' + (sh ? ' sh' + (pl.shift ? ' on' : '') : isV(j) ? ' v' : ''), lab);
            b.tabIndex = -1; b.dataset.j = j;
            b.style.width = (sh ? Math.round(kw * 1.3) : kw) + 'px'; b.style.height = kh + 'px'; b.style.fontSize = Math.round(Math.min(kw, kh) * 0.46) + 'px';
            tap(b, safe(function () { if (sh) { pl.shift = !pl.shift; host.sound('tap'); render(); } else inJamo(pl.i, j); }));
            row.appendChild(b); pe.keyEls.push(b);
          });
          k.appendChild(row);
        });
      }
    }
    function padMsg(pi, text, cls) {
      var pe = padEls[pi]; if (!pe) { host.toast(text); return; }
      pe.msg.textContent = text; pe.msg.className = 'cw-pmsg show' + (cls ? ' ' + cls : '');
      cancel(players[pi].msgT);
      players[pi].msgT = later(function () { pe.msg.className = 'cw-pmsg'; }, 2800);
    }
    function renderPad(pl) {
      var pe = padEls[pl.i]; if (!pe) return;
      var W = pl.sel >= 0 ? G.words[pl.sel] : null;
      pe.pad.classList.toggle('idle', !W);
      pe.lab.innerHTML = W ? '<b>' + wordLabel(W) + '</b> · ' + W.d.answer.length + '글자' : '낱말을 골라요';
      pe.mt.classList.toggle('on', pl.mode === 'tile'); pe.mj.classList.toggle('on', pl.mode === 'jamo');
      if (pe.ph) {
        var hsig = W ? 'w' + W.i : 'none';
        if (pe.ph.dataset.sig !== hsig) {
          pe.ph.dataset.sig = hsig; pe.ph.innerHTML = '';
          if (W) { pe.ph.appendChild(picture(W.d.image, 56)); pe.ph.appendChild(el('div', 'cw-phint-t', '<b>' + wordLabel(W) + ' (' + W.d.answer.length + '글자)</b> ' + esc(W.d.hint))); }
          else pe.ph.appendChild(el('div', 'cw-phint-t', '◀ ▶ 버튼으로 낱말을 바꿀 수 있어요.'));
        }
      }
      pe.acts.hint.querySelector('span').textContent = '힌트 보기 (' + G.hintsLeft + ')';
      pe.acts.hint.classList.toggle('off', G.hintsLeft <= 0);
      var sig = [pl.sel, pl.mode, pl.shift, pl.tiles.map(function (t) { return t.s; }).join('')].join('|');
      if (pe.sig !== sig) { pe.sig = sig; buildKeys(pl); }
      if (pl.mode === 'tile' && pe.tileEls) { var u = tileUsage(pl); pe.tileEls.forEach(function (b, k) { b.classList.toggle('used', !!u[k]); }); }
      // 정답 뒤 설명 카드
      var exw = pl.view === 'explain' && pl.exq.length ? G.words[pl.exq[0]] : null;
      var esig = exw ? exw.i + ':' + pl.exq.length + ':' + !!pl.again : '';
      if (pe.esig !== esig) {
        pe.esig = esig;
        pe.ex.innerHTML = '';
        pe.ex.classList.toggle('hidden', !exw);
        if (exw) buildExplain(pl, exw, pe.ex);
      }
    }
    function buildExplain(pl, W, node) {
      var sz = NP === 1 ? 210 : NP === 2 ? 150 : 96;
      node.appendChild(picture(W.d.image, sz));
      var tx = el('div', 'cw-ex-t');
      var head = pl.again ? '📖 ' + wordLabel(W) + ' 「' + esc(W.d.answer) + '」' : '🎉 정답! ' + wordLabel(W) + ' 「' + esc(W.d.answer) + '」 <span class="cw-gain">+' + (W.gain || 0) + '점</span>';
      tx.appendChild(el('h3', '', head));
      tx.appendChild(el('p', '', esc(W.d.explain || W.d.hint)));
      var meta = '📚 출처: ' + esc(W.d.source || '-');
      if (W.newCard && !pl.again) meta += ' · <b>도감 카드 「' + esc(W.newCard.title) + '」 등록!</b>';
      tx.appendChild(el('div', 'cw-ex-src', meta));
      node.appendChild(tx);
      var b = el('button', 'big-btn primary cw-ex-go', '<span>' + (pl.exq.length > 1 ? '다음 ▶' : '계속하기 ▶') + '</span>');
      b.tabIndex = -1;
      tap(b, safe(function () { cont(pl.i); }));
      node.appendChild(b);
    }

    /* ---------- 그리기 ---------- */
    var topEls = null;
    function buildTop() {
      top.innerHTML = '';
      topEls = {};
      topEls.title = el('div', 'cw-title'); top.appendChild(topEls.title);
      function stat(k, icon) { var s = el('div', 'cw-stat cw-s-' + k, '<span>' + icon + '</span><b></b>'); top.appendChild(s); topEls[k] = s; return s; }
      stat('prog', '🧩'); topEls.prog.appendChild(el('div', 'cw-prog', '<i></i>'));
      stat('hint', '💡'); stat('score', '⭐'); stat('time', '⏱');
      var pick = el('button', 'cw-topbtn', '📋 퍼즐 고르기'); pick.tabIndex = -1;
      tap(pick, safe(function () { if (G && !G.over) saveProgress(); showSelect(); }));
      top.appendChild(pick);
    }
    function renderTop() {
      if (!topEls || !G) return;
      var n = G.words.length, s = G.words.filter(function (w) { return w.solved; }).length;
      topEls.title.textContent = G.p.title;
      topEls.prog.querySelector('b').textContent = '낱말 ' + s + '/' + n;
      topEls.prog.querySelector('i').style.width = Math.round(s / n * 100) + '%';
      topEls.hint.querySelector('b').textContent = '힌트 ' + G.hintsLeft;
      topEls.score.querySelector('b').textContent = G.score + '점';
      var tb = topEls.time.querySelector('b');
      if (G.limit) { var left = G.limit - G.elapsed; tb.textContent = '남은 시간 ' + mmss(left); topEls.time.classList.toggle('warn', left <= 60); }
      else { tb.textContent = mmss(G.elapsed); topEls.time.classList.remove('warn'); }
    }
    function renderBoard() {
      var now = Date.now(), selBy = {}, curBy = {};
      players.forEach(function (pl) {
        if (pl.sel < 0) return;
        G.words[pl.sel].cells.forEach(function (c) { selBy[c.key] = pl; });
        if (pl.ed && pl.free[pl.ed.cur]) curBy[pl.free[pl.ed.cur].key] = pl;
      });
      Object.keys(G.cells).forEach(function (k) {
        var c = G.cells[k], d = cellEls[k]; if (!d) return;
        var ch = d.querySelector('.cw-ch');
        if (ch.textContent !== c.letter) ch.textContent = c.letter;
        var p = curBy[k] || selBy[k];
        d.classList.toggle('sel', !!selBy[k]);
        d.classList.toggle('cur', !!curBy[k]);
        if (p) d.style.setProperty('--pc', p.col); else d.style.removeProperty('--pc');
        d.classList.toggle('lock', c.locked);
        d.classList.toggle('comp', !!c.comp || (!!c.letter && !isSyl(c.letter)));
        d.classList.toggle('bad', !!c.bad);
        if (c.gold && !d.classList.contains('gold') && c.gold - now < 2000) {
          var delay = Math.max(0, c.gold - now);
          d.style.animationDelay = delay + 'ms';
          d.classList.add('gold');
          (function (dd, cc) { later(function () { dd.classList.remove('gold'); dd.style.animationDelay = ''; cc.gold = 0; }, delay + 1500); })(d, c);
        }
      });
    }
    function renderClues() {
      G.words.forEach(function (W) {
        var b = clueEls[W.i]; if (!b) return;
        var owner = W.owner >= 0 ? players[W.owner] : null;
        b.classList.toggle('done', W.solved);
        b.classList.toggle('mine', !!owner);
        if (owner) b.style.setProperty('--pc', owner.col); else b.style.removeProperty('--pc');
        var s = b.querySelector('.s');
        var html = W.solved ? '✔' : owner ? (NP > 1 ? '<i class="who">' + esc(owner.name) + '</i>' : '✏️') : W.d.answer.length + '칸';
        if (s.innerHTML !== html) s.innerHTML = html;
      });
    }
    function renderHintBox() {
      if (!hintBox) return;
      var pl = players[0], W = pl.sel >= 0 ? G.words[pl.sel] : null;
      var sig = W ? W.i + ':' + W.wrongs + ':' + G.hintsLeft + ':' + W.cells.filter(function (c) { return c.locked; }).length : 'none:' + G.words.filter(function (w) { return w.solved; }).length;
      if (hintBox.dataset.sig === sig) return;
      hintBox.dataset.sig = sig; hintBox.innerHTML = '';
      hintBox.style.setProperty('--pc', pl.col);
      if (!W) {
        hintBox.appendChild(el('div', 'cw-hb-empty', G.over ? '🎉 모든 낱말을 채웠어요!' : '격자판의 칸이나 아래 문제를 눌러<br>풀 낱말을 골라요.'));
        return;
      }
      hintBox.appendChild(picture(W.d.image, 150));
      var tx = el('div', 'cw-hb-txt');
      tx.appendChild(el('div', 'cw-hb-head', '✏️ ' + wordLabel(W) + ' · ' + W.d.answer.length + '글자'));
      tx.appendChild(el('div', 'cw-hb-hint', esc(W.d.hint)));
      var boxes = W.cells.map(function (c) { return c.locked ? '<i class="on">' + esc(c.ans) + '</i>' : '<i></i>'; }).join('');
      tx.appendChild(el('div', 'cw-hb-len', boxes + (W.wrongs ? '<span>다시 생각한 횟수 ' + W.wrongs + '</span>' : '')));
      hintBox.appendChild(tx);
    }
    function render() {
      if (!G || dead) return;
      renderTop(); renderBoard(); renderClues(); renderHintBox();
      players.forEach(renderPad);
    }

    /* ---------- 시간 ---------- */
    function startClock() { stopClock(); lastT = performance.now(); clock = setInterval(safe(tick), 250); }
    function stopClock() { if (clock) clearInterval(clock); clock = 0; }
    function tick() {
      var now = performance.now();
      if (G && !G.over && !paused && screen === 'play') G.elapsed += (now - lastT) / 1000;
      lastT = now;
      renderTop();
      if (G && !G.over && G.limit && G.elapsed >= G.limit) finish(true);
    }

    /* ---------- 저장 ---------- */
    function snapshot() {
      var letters = {}, locked = [];
      Object.keys(G.cells).forEach(function (k) { var c = G.cells[k]; if (c.locked) locked.push(k); else if (isSyl(c.letter)) letters[k] = c.letter; });
      return { pid: G.p.id, title: G.p.title, letters: letters, locked: locked, solved: G.words.filter(function (w) { return w.solved; }).map(function (w) { return w.i; }),
        ww: G.words.map(function (w) { return w.wrongs; }), score: G.score, hintsLeft: G.hintsLeft, hintsUsed: G.hintsUsed, wrongs: G.wrongs,
        elapsed: Math.round(G.elapsed), limit: G.limit, total: G.words.length, date: today() };
    }
    function persist() { save.timerOn = timerOn; host.save(save); }
    function saveProgress() { cancel(saveT); saveT = 0; if (G && !G.over) { save.cur = snapshot(); persist(); } }
    function dirty() { if (!saveT) saveT = later(function () { saveT = 0; saveProgress(); }, 600); }
    function record() {
      var ids = PZ.list.map(function (p) { return p.id; });
      var done = ids.filter(function (id) { return save.done[id] && save.done[id].stars; }).length;
      var best = 0; ids.forEach(function (id) { if (save.done[id]) best = Math.max(best, save.done[id].best || 0); });
      host.setRecord('퍼즐 ' + done + '/' + ids.length + ' 완성 · 최고 점수 ' + best);
    }

    /* ---------- 끝 ---------- */
    function finish(timeUp, quiet) {
      if (!G || G.done) return;
      G.over = true; G.done = true; stopClock(); closeChooser();
      players.forEach(function (pl, i) { if (pl.sel >= 0) release(i); if (timeUp) { pl.view = 'keys'; pl.exq = []; } });
      var p = G.p, n = G.words.length, solved = G.words.filter(function (w) { return w.solved; }).length;
      var R = { timeUp: timeUp, solved: solved, n: n, bonus: 0, tbonus: 0, stars: 0, badge: null, codex: G.newCodex.slice() };
      if (!timeUp) {
        R.bonus = 200; if (G.limit) R.tbonus = Math.max(0, Math.round(G.limit - G.elapsed));
        G.score += R.bonus + R.tbonus;
        R.stars = (G.hintsUsed <= 1 && G.wrongs <= 2) ? 3 : (G.hintsUsed + G.wrongs <= n) ? 2 : 1;
        var res = host.award({ key: 'puzzle-' + p.id, stars: R.stars, badge: BADGE[p.difficulty], silent: true });
        R.badge = res && res.newBadge;
      }
      var d = save.done[p.id] || {};
      d.plays = (d.plays || 0) + 1;
      if (!timeUp) { d.stars = Math.max(d.stars || 0, R.stars); d.best = Math.max(d.best || 0, G.score); d.date = today(); }
      save.done[p.id] = d; save.cur = null; persist(); record();
      R.score = G.score; R.best = d.best || 0; R.hints = G.hintsUsed; R.wrongs = G.wrongs; R.time = G.limit ? Math.min(G.elapsed, G.limit) : G.elapsed;
      G.result = R;
      render();
      if (!quiet) showResult(R);
    }

    /* ---------- 결과 화면과 수막새 ---------- */
    function closeLayer() { layer.innerHTML = ''; layer.className = 'cw-layer'; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
    function showResult(R) {
      closeLayer(); screen = 'result';
      layer.className = 'cw-layer on cw-res';
      var cv = el('canvas', 'cw-bloom'); var g = Activities.hiDpi(cv, 1920, 1080);
      layer.appendChild(cv);
      var card = el('div', 'cw-rcard');
      card.appendChild(el('h2', '', R.timeUp ? '⏰ 시간이 다 됐어요!' : '🎉 퍼즐 완성!'));
      card.appendChild(el('div', 'cw-r-title', esc(G.p.title)));
      card.appendChild(el('div', 'cw-stars', R.timeUp ? '<span class="off">☆☆☆</span>' : '★★★'.slice(0, R.stars) + '<span class="off">' + '☆☆☆'.slice(R.stars) + '</span>'));
      var rows = [['채운 낱말', R.solved + ' / ' + R.n], ['점수', R.score + '점' + (R.bonus ? ' (완성 +' + R.bonus + (R.tbonus ? ', 남은 시간 +' + R.tbonus : '') + ')' : '')],
        ['힌트 사용', R.hints + '번'], ['다시 생각한 횟수', R.wrongs + '번'], ['걸린 시간', mmss(R.time)]];
      card.appendChild(el('div', 'cw-r-rows', rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('')));
      var gifts = [];
      if (R.badge) gifts.push('<span class="badge-chip">' + R.badge.icon + ' ' + esc(R.badge.name) + ' 배지 획득!</span>');
      R.codex.slice(0, 6).forEach(function (c) { gifts.push('<span class="badge-chip cw-codex">' + (c.icon || '📜') + ' ' + esc(c.title) + '</span>'); });
      if (R.codex.length > 6) gifts.push('<span class="badge-chip cw-codex">외 ' + (R.codex.length - 6) + '장</span>');
      if (gifts.length) card.appendChild(el('div', 'cw-gifts', '<p>' + (R.codex.length ? '📚 역사 도감에 새 카드가 등록됐어요' : '') + '</p>' + gifts.join('')));
      if (R.timeUp) card.appendChild(el('p', 'cw-r-note', '괜찮아요! 다시 도전하면 이번에 찾은 낱말을 떠올리며 더 빨리 풀 수 있어요.'));
      var bt = el('div', 'cw-r-btns');
      var again = el('button', 'big-btn', '<span>🔁 다시 하기</span>'), pick = el('button', 'big-btn', '<span>📋 퍼즐 고르기</span>');
      var nx = nextPuzzle(G.p), go = nx ? el('button', 'big-btn primary', '<span>▶ 다음 퍼즐</span>') : null;
      var cur = G.p;
      tap(again, safe(function () { host.sound('select'); startPuzzle(cur); }));
      tap(pick, safe(function () { host.sound('select'); showSelect(); }));
      bt.appendChild(again); bt.appendChild(pick);
      if (go) { tap(go, safe(function () { host.sound('select'); startPuzzle(nx); })); bt.appendChild(go); }
      card.appendChild(bt);
      layer.appendChild(card);
      if (!R.timeUp) {
        host.sound('fanfare');
        later(function () { host.sound('cw-bloom'); }, 700);
        var t0 = performance.now();
        var frame = function () {
          if (dead) return;
          var t = Math.min(1, (performance.now() - t0) / 3200);
          g.clearRect(0, 0, 1920, 1080);
          drawRoundel(g, 960, 225, 170, t, 0.6 + 0.4 * Math.sin(t * Math.PI));
          var rnd = rng(11);
          for (var i = 0; i < 70; i++) {
            var a = rnd() * Math.PI * 2, sp = 200 + rnd() * 700, life = Math.max(0, t * 1.3 - rnd() * 0.3);
            var x = 960 + Math.cos(a) * sp * life, y = 225 + Math.sin(a) * sp * life * 0.8 + life * life * 160;
            g.fillStyle = 'rgba(255,' + (200 + (rnd() * 55 | 0)) + ',120,' + Math.max(0, 1 - life) + ')';
            g.beginPath(); g.arc(x, y, 3 + rnd() * 5, 0, Math.PI * 2); g.fill();
          }
          rafId = t < 1 ? requestAnimationFrame(frame) : 0;
        };
        rafId = requestAnimationFrame(frame);
        card.classList.add('withbloom');
      } else host.sound('lose');
    }
    function nextPuzzle(p) {
      var L = PZ.list, i = L.indexOf(p);
      for (var k = 1; k < L.length; k++) { var q = L[(i + k) % L.length]; if (q.difficulty === p.difficulty && !(save.done[q.id] && save.done[q.id].stars)) return q; }
      for (k = 1; k < L.length; k++) { q = L[(i + k) % L.length]; if (q.difficulty === p.difficulty) return q; }
      return null;
    }

    /* ---------- 퍼즐 고르기 화면 ---------- */
    function showSelect() {
      closeLayer(); closeChooser();
      screen = 'select';
      layer.className = 'cw-layer on cw-sel';
      var wrap = el('div', 'cw-selbox');
      wrap.appendChild(el('h1', '', '🧩 백제 십자 낱말풀이'));
      wrap.appendChild(el('p', 'cw-sel-sub', '가로와 세로 낱말이 엇갈리는 진짜 십자말풀이예요. 난이도를 고르고 퍼즐을 눌러요!'));
      var tabs = el('div', 'cw-tabs');
      DIFFS.forEach(function (d) {
        var list = PZ.list.filter(function (p) { return p.difficulty === d[0]; });
        var dn = list.filter(function (p) { return save.done[p.id] && save.done[p.id].stars; }).length;
        var b = el('button', 'cw-tab' + (tab === d[0] ? ' on' : ''), d[1] + '<small>' + d[2] + ' · ' + dn + '/' + list.length + ' 완성</small>');
        b.tabIndex = -1;
        tap(b, safe(function () { tab = d[0]; host.sound('tap'); showSelect(); }));
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);
      var cur = save.cur && PZ.list.filter(function (p) { return p.id === save.cur.pid; })[0];
      if (cur) {
        var rb = el('div', 'cw-resume');
        rb.appendChild(el('div', 'cw-resume-t', '⏸ 하던 퍼즐이 있어요: <b>「' + esc(cur.title) + '」</b> 낱말 ' + (save.cur.solved || []).length + '/' + cur.words.length + ' · ' + (save.cur.score | 0) + '점'));
        var go = el('button', 'big-btn primary', '<span>▶ 이어 하기</span>');
        tap(go, safe(function () { host.sound('select'); startPuzzle(cur, save.cur); }));
        rb.appendChild(go);
        wrap.appendChild(rb);
      }
      var grid = el('div', 'cw-cards');
      var list = PZ.list.filter(function (p) { return p.difficulty === tab; });
      if (!list.length) grid.appendChild(el('p', 'cw-empty', '이 난이도에는 아직 퍼즐이 없어요.'));
      list.forEach(function (p) {
        var d = save.done[p.id] || {};
        var c = el('button', 'cw-card' + (d.stars ? ' done' : ''));
        c.tabIndex = -1;
        var mini = el('div', 'cw-mini');
        var ms = Math.floor(Math.min(150 / p.cols, 110 / p.rows));
        mini.style.width = (ms * p.cols) + 'px'; mini.style.height = (ms * p.rows) + 'px';
        var cells = {};
        p.words.forEach(function (w) { wordCells(w).forEach(function (rc) { cells[rc[0] + ',' + rc[1]] = 1; }); });
        Object.keys(cells).forEach(function (k) { var rc = k.split(','); var q = el('i'); q.style.left = (rc[1] * ms) + 'px'; q.style.top = (rc[0] * ms) + 'px'; q.style.width = q.style.height = (ms - 2) + 'px'; mini.appendChild(q); });
        c.appendChild(mini);
        var tx = el('div', 'cw-card-t');
        tx.appendChild(el('b', '', esc(p.title)));
        tx.appendChild(el('span', '', esc(p.desc || '') ));
        tx.appendChild(el('small', '', '낱말 ' + p.words.length + '개 · ' + p.rows + '×' + p.cols + (p.custom ? ' · ✏️ 선생님 퍼즐' : '')));
        tx.appendChild(el('div', 'cw-card-s', (d.stars ? '<span class="st">' + '★★★'.slice(0, d.stars) + '<i>' + '☆☆☆'.slice(d.stars) + '</i></span> 최고 ' + (d.best | 0) + '점' : '<span class="st"><i>☆☆☆</i></span> 아직 안 풀었어요') + (save.cur && save.cur.pid === p.id ? ' · ⏸ 하던 중' : '')));
        c.appendChild(tx);
        tap(c, safe(function () { host.sound('select'); startPuzzle(p); }));
        grid.appendChild(c);
      });
      wrap.appendChild(grid);
      if (tab === 'hard') {
        var tr = el('div', 'cw-timer');
        tr.appendChild(el('span', '', '⏱ 어려움 제한 시간'));
        [[false, '없음'], [true, limitMin + '분']].forEach(function (o) {
          var b = el('button', 'seg' + (timerOn === o[0] ? ' on' : ''), o[1]); b.tabIndex = -1;
          tap(b, safe(function () { timerOn = o[0]; persist(); host.sound('tap'); showSelect(); }));
          tr.appendChild(b);
        });
        wrap.appendChild(tr);
      }
      if (PZ.bad.length) wrap.appendChild(el('p', 'cw-badnote', '⚠️ 검사를 통과하지 못한 퍼즐 ' + PZ.bad.length + '개는 건너뛰었어요. (선생님 설정 → 십자 낱말 문제 수정에서 이유를 볼 수 있어요)'));
      layer.appendChild(wrap);
    }

    /* ---------- 실제 키보드 (한글 IME + 영문 상태 두벌식) ---------- */
    var imeOn = false, imeSnap = null, imeP = 0;
    function imePlayer() { var pl = players[kb]; return pl && pl.sel >= 0 ? pl : null; }
    function snap(ed) { return { slots: ed.slots.slice(), cur: ed.cur, keys: ed.keys.slice() }; }
    function restore(ed, s) { ed.slots = s.slots.slice(); ed.cur = s.cur; ed.keys = s.keys.slice(); }
    listen(ime, 'compositionstart', safe(function () {
      var pl = imePlayer(); imeOn = true;
      if (!pl || screen !== 'play') { imeSnap = null; return; }
      pl.ed.finalize(); imeP = pl.i; imeSnap = snap(pl.ed);
    }));
    function imePreview(text, commit) {
      var pl = players[imeP];
      if (!imeSnap || !pl || !pl.ed || !G || G.over) return;
      restore(pl.ed, imeSnap);
      if (text) pl.ed.text(text);
      if (commit) { pl.ed.finalize(); imeSnap = null; if (text) host.sound('tile'); }
      sync(pl); render(); if (commit) dirty();
    }
    listen(ime, 'compositionupdate', safe(function (e) { imePreview(e.data || ime.value, false); }));
    listen(ime, 'compositionend', safe(function (e) {
      imeOn = false;
      imePreview(e.data != null ? e.data : ime.value, true);
      ime.value = '';
    }));
    listen(ime, 'input', safe(function (e) {
      if (imeOn || e.isComposing) { imePreview(ime.value, false); return; }
      var v = ime.value; ime.value = '';
      if (v && imePlayer()) inText(kb, v);
    }));
    listen(document, 'keydown', safe(function (e) {
      if (screen !== 'play' || paused || !G || G.over) return;
      if (window.App && App.modalCount && App.modalCount() > 0) return;
      var t = e.target;
      if (t && t !== ime && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (imeOn || e.isComposing || (e.keyCode === 229 && document.activeElement === ime)) return;   // IME 가 조합 중
      var pi = kb, pl = players[pi];
      if (e.key === 'Enter') { e.preventDefault(); if (pl.view === 'explain') cont(pi); else check(pi); return; }
      if (e.key === 'Backspace') { e.preventDefault(); inErase(pi); return; }
      if (e.key === 'Delete' || e.key === 'Escape') { e.preventDefault(); inClear(pi); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); navWord(pi, e.shiftKey ? -1 : 1); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); navWord(pi, -1); return; }
      var j = Core.KEYMAP[e.code];
      if (!j && e.key && /^[a-z]$/i.test(e.key)) j = Core.KEYMAP['Key' + e.key.toUpperCase()];
      if (!j) return;
      e.preventDefault();
      if (e.shiftKey && Core.SHIFTMAP[j]) j = Core.SHIFTMAP[j];
      if (players[pi].shift) players[pi].shift = false;
      inJamo(pi, j);
      focusIme();
    }));

    /* ---------- 시작 ---------- */
    buildTop();
    record();
    showSelect();
    focusIme();

    /* ---------- 시험용 도구 (BaekjeHub.activeInstance().debug) ---------- */
    function fire(node, x, y) {
      var r = node.getBoundingClientRect(), cx = x != null ? x : r.left + r.width / 2, cy = y != null ? y : r.top + r.height / 2;
      var id = 100 + Math.floor(Math.random() * 1000);
      ['pointerdown', 'pointerup'].forEach(function (type) { node.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: cx, clientY: cy, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true })); });
      return true;
    }
    function wIndex(num, dir) { var W = G.words.filter(function (w) { return w.d.number === num && w.d.direction === dir; })[0]; return W ? W.i : -1; }
    var debug = {
      core: Core,
      hangulTests: function () { return Core.hangulSelfTest(); },
      puzzles: function () { return { ok: PZ.list.map(function (p) { return p.id + ':' + p.difficulty + ':' + p.words.length; }), bad: PZ.bad }; },
      reloadPuzzles: function () { PZ = loadPuzzles(host.data); if (screen === 'select') showSelect(); return debug.puzzles(); },
      validate: function (p) { return validatePuzzle(p); },
      generate: function (items, o) { return generate(items, o); },
      start: function (id, resume) { var p = PZ.list.filter(function (x) { return x.id === id; })[0]; if (!p) return false; startPuzzle(p, resume ? save.cur : null); return true; },
      screen: function () { return screen; },
      state: function () {
        if (!G) return { screen: screen };
        return { screen: screen, pid: G.p.id, over: !!G.over, solved: G.words.filter(function (w) { return w.solved; }).length, total: G.words.length, score: G.score, hintsLeft: G.hintsLeft, wrongs: G.wrongs, elapsed: Math.round(G.elapsed), limit: G.limit,
          players: players.map(function (pl) { return { sel: pl.sel, word: pl.sel >= 0 ? G.words[pl.sel].d.answer : null, cur: pl.ed ? pl.ed.cur : null, value: pl.ed ? pl.ed.value() : '', mode: pl.mode, view: pl.view }; }) };
      },
      words: function () { return G.words.map(function (W) { return { i: W.i, n: W.d.number, dir: W.d.direction, a: W.d.answer, solved: W.solved, owner: W.owner, text: W.cells.map(function (c) { return c.letter || '_'; }).join('') }; }); },
      wordIndex: wIndex,
      cell: function (r, c) { var x = G.cells[r + ',' + c], d = cellEls[r + ',' + c]; return x ? { letter: x.letter, locked: x.locked, bad: x.bad, cls: d ? d.className : '' } : null; },
      select: function (pi, num, dir) { return selectWord(pi, typeof num === 'number' && dir ? wIndex(num, dir) : num); },
      canSelect: function (pi, num, dir) { return canSelect(pi, wIndex(num, dir)); },
      tapCell: function (r, c) { var d = cellEls[r + ',' + c]; return d ? fire(d) : false; },
      tapClue: function (num, dir) { var b = clueEls[wIndex(num, dir)]; return b ? fire(b) : false; },
      tapTile: function (pi, s) { var pe = padEls[pi]; var b = (pe.tileEls || []).filter(function (x) { return x.dataset.s === s && !x.classList.contains('used'); })[0]; return b ? fire(b) : false; },
      tapKey: function (pi, j) { var pe = padEls[pi]; var b = (pe.keyEls || []).filter(function (x) { return x.dataset.j === j; })[0]; return b ? fire(b) : false; },
      typeJamo: function (pi, seq) { var n = 0; seq.split('').forEach(function (j) { if (j === '⇧' || debug.tapKey(pi, j)) n++; }); return n; },
      tapAct: function (pi, a) { var pe = padEls[pi]; var b = pe && pe.acts[a]; return b ? fire(b) : false; },
      tapMode: function (pi, m) { var pe = padEls[pi]; return fire(m === 'tile' ? pe.mt : pe.mj); },
      tapNav: function (pi, d) { var pe = padEls[pi]; return fire(pe.pad.querySelectorAll('.cw-nav')[d > 0 ? 1 : 0]); },
      tapContinue: function (pi) { var b = padEls[pi].ex.querySelector('.cw-ex-go'); return b ? fire(b) : false; },
      tapChooser: function (pi) { var b = chooser && chooser.querySelectorAll('.cw-ch-b')[pi]; return b ? fire(b) : false; },
      tapSel: function (selector, i) { var b = layer.querySelectorAll(selector)[i || 0]; return b ? fire(b) : false; },
      padText: function (pi) { var pe = padEls[pi]; return { msg: pe.msg.textContent, label: pe.lab.textContent, explain: pe.ex.classList.contains('hidden') ? '' : pe.ex.textContent }; },
      tilesOf: function (pi) { var pe = padEls[pi]; return (pe.tileEls || []).map(function (b) { return b.dataset.s + (b.classList.contains('used') ? '*' : ''); }); },
      // 타일만 눌러 퍼즐 전체를 푼다 (선택 → 글자 타일 → 정답 확인 → 계속)
      solveByTiles: function (pi) {
        pi = pi || 0;
        var guard = 0;
        while (G && !G.over && guard++ < 40) {
          var pl = players[pi];
          if (pl.view === 'explain') { debug.tapContinue(pi); continue; }
          if (pl.sel < 0 && !autoPick(pi, true)) break;
          if (pl.mode !== 'tile') debug.tapMode(pi, 'tile');
          debug.tapAct(pi, 'clear');
          pl.free.forEach(function (c) { debug.tapTile(pi, c.ans); });
          debug.tapAct(pi, 'check');
        }
        return debug.state();
      },
      setTime: function (sec) { if (G) G.elapsed = sec; tick(); return debug.state(); },
      resources: function () { return { timers: Object.keys(timers).length, clock: !!clock, raf: !!rafId, docListeners: docL.length, dead: dead }; },
      ime: ime,
      layer: layer
    };

    return {
      unmount: function () {
        try { if (G && !G.over) saveProgress(); } catch (e) { /* 저장 실패는 무시 */ }
        dead = true;
        stopClock(); closeChooser();
        Object.keys(timers).forEach(function (id) { clearTimeout(+id); });
        timers = {};
        if (rafId) cancelAnimationFrame(rafId); rafId = 0;
        docL.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        docL = [];
        try { ime.blur(); } catch (e) { /* 무시 */ }
      },
      pause: function () { paused = true; stopClock(); },
      resume: function () { paused = false; if (G && !G.over) startClock(); focusIme(); },
      debug: debug
    };
  }

  /* ================= 선생님 편집기 ================= */
  function teacher(host) {
    var st = store();
    var bx = el('div', 'cw-teacher');
    var PZ = loadPuzzles(host.data);
    bx.appendChild(el('h2', '', '✏️ 백제 십자 낱말풀이 문제 수정'));
    bx.appendChild(el('p', 'cw-t-note', '고친 내용은 이 컴퓨터에 저장되고, 다음에 퍼즐을 시작할 때 반영돼요. 기본 퍼즐은 <b>data/crossword.json</b> 파일을 직접 고친 뒤 <b>「데이터 갱신.bat」</b>을 실행해도 바꿀 수 있어요.'));
    // 1) 검사 결과
    var rep = el('div', 'cw-t-sec');
    function renderReport() {
      rep.innerHTML = '<h3>🔍 퍼즐 검사 결과</h3>';
      var nb = PZ.list.filter(function (p) { return p.builtin; }).length, nc = PZ.list.length - nb;
      rep.appendChild(el('p', '', '✅ 정상 퍼즐 ' + PZ.list.length + '개 (기본 ' + nb + ' · 선생님 ' + nc + ') — 칸 크기, 번호, 엇갈리는 글자, 이웃 글자, 낱말 연결을 모두 검사했어요.'));
      PZ.bad.forEach(function (b) {
        rep.appendChild(el('div', 'cw-t-bad', '<b>⚠️ 「' + esc(b.title) + '」(' + esc(b.id) + ')' + (b.custom ? ' · 선생님 퍼즐' : ' · 기본 퍼즐') + ' — 게임에서 건너뛰었어요</b><ul>' + b.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'));
      });
    }
    renderReport();
    bx.appendChild(rep);
    // 2) 힌트·설명 고치기
    var ed = el('div', 'cw-t-sec');
    ed.appendChild(el('h3', '', '📝 낱말 힌트·설명 고치기'));
    var sel = el('select', 'cw-t-in');
    var list = el('div', 'cw-t-words');
    function fillSel() {
      sel.innerHTML = '';
      PZ.list.forEach(function (p) { var o = el('option', '', esc(p.title) + ' (' + DIFFS.filter(function (d) { return d[0] === p.difficulty; })[0][1] + (p.custom ? ' · 선생님' : '') + ')'); o.value = p.id; sel.appendChild(o); });
    }
    function fillWords() {
      list.innerHTML = '';
      var p = PZ.list.filter(function (x) { return x.id === sel.value; })[0];
      if (!p) return;
      p.words.forEach(function (w) {
        var row = el('div', 'cw-t-word');
        row.appendChild(el('div', 'cw-t-wl', '<b>' + w.number + '번 ' + DNAME[w.direction] + '</b> · ' + esc(w.answer)));
        var h = el('textarea', 'cw-t-in cw-t-h'); h.value = w.hint || ''; h.dataset.k = w.answer + '|' + w.direction;
        var x = el('textarea', 'cw-t-in cw-t-x'); x.value = w.explain || '';
        row.appendChild(el('label', '', '힌트')); row.appendChild(h);
        row.appendChild(el('label', '', '정답 뒤 설명')); row.appendChild(x);
        list.appendChild(row);
      });
    }
    fillSel(); fillWords();
    sel.addEventListener('change', fillWords);
    ed.appendChild(sel); ed.appendChild(list);
    var er = el('div', 'cw-t-btns');
    var sv = el('button', 'seg big', '💾 힌트·설명 저장'), rs = el('button', 'seg big', '↺ 이 퍼즐 원래대로');
    sv.addEventListener('click', function () {
      var all = st.get(KEY_EDITS) || {}, o = {};
      Array.prototype.forEach.call(list.querySelectorAll('.cw-t-word'), function (row) {
        var h = row.querySelector('.cw-t-h'), x = row.querySelector('.cw-t-x');
        if (!h.value.trim()) return;
        o[h.dataset.k] = { hint: h.value.trim(), explain: x.value.trim() };
      });
      all[sel.value] = o; st.set(KEY_EDITS, all);
      PZ = loadPuzzles(host.data); renderReport();
      host.toast('힌트와 설명을 저장했어요'); host.sound('correct');
    });
    rs.addEventListener('click', function () {
      var all = st.get(KEY_EDITS) || {}; delete all[sel.value]; st.set(KEY_EDITS, all);
      PZ = loadPuzzles(host.data); fillWords(); host.toast('원래 내용으로 되돌렸어요');
    });
    er.appendChild(sv); er.appendChild(rs); ed.appendChild(er);
    bx.appendChild(ed);
    // 3) 새 퍼즐 만들기 (자동 배치 → 검사 통과 시에만 저장)
    var mk = el('div', 'cw-t-sec');
    mk.appendChild(el('h3', '', '🧩 새 퍼즐 만들기 (자동 배치)'));
    mk.appendChild(el('p', 'cw-t-note', '한 줄에 낱말 하나씩 <b>낱말 / 힌트 / 설명(없어도 돼요)</b> 처럼 써 주세요. 낱말은 2~10글자 한글이고, 다른 낱말과 같은 글자가 있어야 엇갈려 놓을 수 있어요. 검사를 통과한 퍼즐만 저장돼요.'));
    var tIn = el('input', 'cw-t-in'); tIn.placeholder = '퍼즐 이름 (예: 우리 반 백제 퍼즐)';
    var dSel = el('div', 'segs'), diff = 'normal';
    DIFFS.forEach(function (d) {
      var b = el('button', 'seg' + (d[0] === diff ? ' on' : ''), d[1] + ' <small>' + d[2] + '</small>');
      b.addEventListener('click', function () { diff = d[0]; Array.prototype.forEach.call(dSel.children, function (x) { x.classList.toggle('on', x === b); }); });
      dSel.appendChild(b);
    });
    var ta = el('textarea', 'cw-t-in cw-t-list');
    ta.placeholder = '백마강 / 부여를 감싸 흐르는 금강의 한 구간\n백제 / 538년 사비로 도읍을 옮긴 나라\n…';
    var ex = el('button', 'seg', '예시 넣기');
    ex.addEventListener('click', function () { ta.value = '사비 / 538년부터 660년까지 백제의 도읍\n정림사지 / 사비 도성 한가운데 있던 절터\n궁남지 / 「궁궐 남쪽의 연못」이라는 뜻의 연못\n남부여 / 성왕이 붙인 또 하나의 나라 이름\n부여 / 사비가 있던 곳의 오늘날 이름\n왕궁 / 왕이 나랏일을 보던 곳\n성왕 / 538년 도읍을 사비로 옮긴 왕\n나성 / 사비 도성의 동쪽과 북쪽을 감싼 바깥 성곽'; if (!tIn.value) tIn.value = '사비 도성 탐험 (예시)'; });
    var gen = el('button', 'seg big', '🧩 자동 배치하고 검사하기'), keep = el('button', 'seg big', '💾 이 퍼즐 저장'); keep.disabled = true;
    var out = el('div', 'cw-t-out');
    var made = null;
    ta.addEventListener('input', function () { made = null; keep.disabled = true; });
    gen.addEventListener('click', function () {
      made = null; keep.disabled = true; out.innerHTML = '';
      var known = {};
      PZ.list.forEach(function (p) { p.words.forEach(function (w) { if (w.builtin !== false) known[w.answer] = w; }); });
      var items = ta.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
        var a = l.split(/\s*[\/|]\s*/), ans = (a[0] || '').replace(/\s+/g, ''), k = known[ans] || {};
        return { answer: ans, hint: (a[1] || '').trim(), explain: (a[2] || '').trim() || (a[1] || '').trim(), difficulty: diff, image: k.image || '✏️', source: k.source || '선생님 제작', card: k.card || '' };
      });
      var miss = items.filter(function (it) { return !it.hint; }).map(function (it) { return '「' + it.answer + '」'; });
      if (miss.length) { out.appendChild(el('div', 'cw-t-bad', '힌트가 없는 낱말이 있어요: ' + esc(miss.join(', ')))); return; }
      var r = generate(items, { id: 'c-' + Date.now().toString(36), title: tIn.value.trim() || '선생님 퍼즐', difficulty: diff, seed: (Date.now() & 0xffff) || 7, tries: 600, maxRows: 11, maxCols: 13 });
      if (!r.ok) { out.appendChild(el('div', 'cw-t-bad', '<b>⚠️ 저장할 수 없어요</b><ul>' + r.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>')); host.sound('wrong'); return; }
      made = r.puzzle; made.desc = '선생님이 만든 퍼즐'; made.words.forEach(function (w) { if (!w.card) delete w.card; });
      out.appendChild(el('div', 'cw-t-ok', '✅ 검사 통과! 낱말 ' + made.words.length + '개 · ' + made.rows + '×' + made.cols + ' 격자'));
      out.appendChild(preview(made));
      keep.disabled = false; host.sound('correct');
    });
    keep.addEventListener('click', function () {
      if (!made) return;
      var v = validatePuzzle(made);
      if (!v.ok) { out.appendChild(el('div', 'cw-t-bad', esc(v.errors.join(' / ')))); return; }
      var c = st.get(KEY_CUSTOM) || {}; c.puzzles = c.puzzles || []; c.puzzles.push(made); st.set(KEY_CUSTOM, c);
      made = null; keep.disabled = true; out.appendChild(el('div', 'cw-t-ok', '💾 저장했어요. 퍼즐 고르기 화면의 해당 난이도에 나타나요.'));
      PZ = loadPuzzles(host.data); renderReport(); fillSel(); fillWords(); renderCustom(); host.sound('correct');
    });
    mk.appendChild(tIn); mk.appendChild(dSel); mk.appendChild(ta);
    var mb = el('div', 'cw-t-btns'); mb.appendChild(ex); mb.appendChild(gen); mb.appendChild(keep); mk.appendChild(mb);
    mk.appendChild(out);
    bx.appendChild(mk);
    // 4) 선생님 퍼즐 목록
    var cl = el('div', 'cw-t-sec');
    function renderCustom() {
      cl.innerHTML = '<h3>📂 선생님이 만든 퍼즐</h3>';
      var c = (st.get(KEY_CUSTOM) || {}).puzzles || [];
      if (!c.length) { cl.appendChild(el('p', 'cw-t-note', '아직 없어요.')); return; }
      c.forEach(function (p, i) {
        var row = el('div', 'cw-t-crow', '<span>' + esc(p.title) + ' · ' + (p.words || []).length + '낱말 · ' + esc(p.difficulty) + '</span>');
        var del = el('button', 'seg danger', '🗑️ 지우기');
        del.addEventListener('click', function () {
          if (!del.dataset.c) { del.dataset.c = '1'; del.textContent = '정말 지울까요?'; return; }
          var cc = st.get(KEY_CUSTOM) || {}; (cc.puzzles || []).splice(i, 1); st.set(KEY_CUSTOM, cc);
          PZ = loadPuzzles(host.data); renderReport(); fillSel(); fillWords(); renderCustom();
        });
        row.appendChild(del); cl.appendChild(row);
      });
    }
    renderCustom();
    bx.appendChild(cl);
    function preview(p) {
      var cs = Math.floor(Math.min(46, 520 / p.cols)), g = el('div', 'cw-t-prev');
      g.style.width = (cs * p.cols) + 'px'; g.style.height = (cs * p.rows) + 'px';
      p.words.forEach(function (w) {
        wordCells(w).forEach(function (rc, k) {
          var q = el('i', '', esc(w.answer[k])); q.style.left = rc[1] * cs + 'px'; q.style.top = rc[0] * cs + 'px'; q.style.width = q.style.height = (cs - 2) + 'px'; q.style.fontSize = Math.round(cs * 0.5) + 'px';
          if (k === 0) q.appendChild(el('sup', '', String(w.number)));
          g.appendChild(q);
        });
      });
      return g;
    }
    // 입력 칸에서는 키보드·한글 입력이 되도록 (전역 터치·메뉴 막기와 상관없이)
    Array.prototype.forEach.call(bx.querySelectorAll('input,textarea,select'), function (n) { n.addEventListener('pointerdown', function (e) { e.stopPropagation(); }); });
    var m = host.modal(bx, { close: true, cls: 'wide' });
    return { root: bx, modal: m, generateButton: gen, saveButton: keep, textarea: ta, title: tIn, example: ex, output: out };
  }

  if (window.BaekjeHub) BaekjeHub.register({
    id: 'crossword',
    notice: '낱말의 힌트와 설명은 『삼국사기』·『삼국유사』, 국가유산청, 국립부여박물관 자료를 바탕으로 초등학생 눈높이에 맞게 간추렸어요. 서동요는 설화(옛이야기)예요.',
    teacher: teacher,
    teacherLabel: '✏️ 십자 낱말 문제 수정',
    core: Core,
    mount: mount
  });
})();
