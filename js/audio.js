/* 백제 보물 발굴 탐험대 — 자체 제작 효과음 (Web Audio 합성)
 * 외부 음원 파일 없이 코드로 소리를 만들어 저작권 문제와 네트워크 의존이 없다. */
(function () {
  'use strict';

  var ctx = null, master = null, noiseBuf = null;
  var volume = 0.7, muted = false;
  var last = {};               // 소리별 마지막 재생 시각 (과도한 중복 재생 방지)

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; return false; }
    return true;
  }

  function throttle(name, ms) {
    var now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now;
    return true;
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(freq, dur, opt) {
    opt = opt || {};
    var t = ctx.currentTime + (opt.delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opt.slide) o.frequency.exponentialRampToValueAtTime(opt.slide, t + dur);
    env(g, t, opt.attack || 0.01, opt.gain || 0.3, dur);
    o.connect(g); g.connect(opt.dest || master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, opt) {
    opt = opt || {};
    var t = ctx.currentTime + (opt.delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = opt.rate || 1;
    var f = ctx.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.value = opt.freq || 800;
    f.Q.value = opt.q || 0.8;
    var g = ctx.createGain();
    env(g, t, opt.attack || 0.005, opt.gain || 0.3, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  var SFX = {
    tap: function () { tone(880, 0.08, { type: 'triangle', gain: 0.12 }); },
    select: function () { tone(660, 0.07, { type: 'triangle', gain: 0.14 }); tone(990, 0.1, { type: 'triangle', gain: 0.12, delay: 0.05 }); },
    dig: function (p) {
      if (!throttle('dig', 75)) return;
      var k = Math.min(1, p || 0.6);
      noise(0.12, { freq: 380 + Math.random() * 300, gain: 0.22 * k + 0.05, q: 1.2 });
      if (Math.random() < 0.35) noise(0.05, { freq: 1600, filter: 'bandpass', gain: 0.06, delay: 0.03 });
    },
    brush: function (p) {
      if (!throttle('brush', 90)) return;
      noise(0.16, { freq: 2600 + Math.random() * 1200, filter: 'bandpass', q: 0.6, gain: 0.07 + 0.08 * Math.min(1, p || 0.5), attack: 0.03 });
    },
    fine: function (p) {
      if (!throttle('fine', 110)) return;
      noise(0.12, { freq: 5200 + Math.random() * 1500, filter: 'bandpass', q: 0.9, gain: 0.05 + 0.04 * Math.min(1, p || 0.5), attack: 0.03 });
    },
    clink: function () {
      if (!throttle('clink', 220)) return;
      tone(1750, 0.25, { type: 'sine', gain: 0.18 });
      tone(2630, 0.18, { type: 'sine', gain: 0.1 });
      noise(0.04, { freq: 3000, filter: 'highpass', gain: 0.1 });
    },
    sparkle: function () {
      if (!throttle('sparkle', 400)) return;
      [1568, 2093, 2637, 3136].forEach(function (f, i) { tone(f, 0.25, { gain: 0.06, delay: i * 0.06 }); });
    },
    glint: function () {
      if (!throttle('glint', 160)) return;
      tone(2400 + Math.random() * 1600, 0.2, { gain: 0.035 });
    },
    found: function () {
      [523, 659, 784].forEach(function (f, i) { tone(f, 0.5, { type: 'triangle', gain: 0.16, delay: i * 0.09 }); });
      tone(1046, 0.8, { type: 'sine', gain: 0.1, delay: 0.3 });
    },
    shutter: function () {
      noise(0.03, { freq: 4000, filter: 'highpass', gain: 0.3 });
      noise(0.05, { freq: 1800, filter: 'bandpass', gain: 0.2, delay: 0.07 });
      tone(1200, 0.05, { type: 'square', gain: 0.03, delay: 0.07 });
    },
    note: function () { tone(740, 0.12, { type: 'triangle', gain: 0.12 }); tone(1110, 0.18, { type: 'triangle', gain: 0.1, delay: 0.08 }); },
    correct: function () { tone(784, 0.18, { type: 'triangle', gain: 0.2 }); tone(1175, 0.4, { type: 'triangle', gain: 0.18, delay: 0.12 }); },
    wrong: function () { tone(330, 0.25, { type: 'sine', gain: 0.16, slide: 260 }); },
    snap: function () { tone(520, 0.07, { type: 'triangle', gain: 0.18 }); noise(0.05, { freq: 900, gain: 0.12 }); },
    fanfare: function () {
      var seq = [523, 659, 784, 1046, 784, 1046];
      seq.forEach(function (f, i) { tone(f, i === seq.length - 1 ? 0.9 : 0.22, { type: 'triangle', gain: 0.17, delay: i * 0.13 }); });
      tone(262, 1.4, { type: 'sine', gain: 0.12, delay: 0.5 });
    },
    place: function () {
      tone(196, 0.3, { type: 'sine', gain: 0.25 });
      [1318, 1760, 2093].forEach(function (f, i) { tone(f, 0.6, { gain: 0.07, delay: 0.15 + i * 0.08 }); });
    },
    grand: function () {
      // 백제금동대향로: 웅장하지만 부드러운 종소리 + 화음
      tone(110, 3.2, { type: 'sine', gain: 0.22, attack: 0.02 });
      tone(220.5, 2.6, { type: 'sine', gain: 0.1, attack: 0.02 });
      tone(331, 2.0, { type: 'sine', gain: 0.06, attack: 0.02 });
      [392, 494, 587, 784].forEach(function (f, i) { tone(f, 2.2, { type: 'triangle', gain: 0.07, delay: 0.4 + i * 0.25, attack: 0.3 }); });
      [1568, 1976, 2349, 3136].forEach(function (f, i) { tone(f, 0.8, { gain: 0.04, delay: 1.2 + i * 0.12 }); });
    },
    rumble: function () {
      if (!throttle('rumble', 600)) return;
      noise(0.5, { freq: 140, gain: 0.25, attack: 0.05 });
    },
    whoosh: function () { noise(0.35, { freq: 1200, filter: 'bandpass', q: 0.5, gain: 0.1, attack: 0.12 }); },
    // 체험관 공통 효과음 (마을·낱말·방어 게임)
    build: function () {
      [0, 0.12, 0.24].forEach(function (d) { noise(0.08, { freq: 500, filter: 'bandpass', q: 1.5, gain: 0.22, delay: d }); });
      tone(392, 0.25, { type: 'triangle', gain: 0.14, delay: 0.36 }); tone(587, 0.4, { type: 'triangle', gain: 0.12, delay: 0.46 });
    },
    coin: function () { if (!throttle('coin', 120)) return; tone(1320, 0.08, { type: 'square', gain: 0.05 }); tone(1760, 0.16, { type: 'square', gain: 0.05, delay: 0.07 }); },
    tile: function () { tone(700 + Math.random() * 120, 0.07, { type: 'triangle', gain: 0.14 }); },
    erase: function () { tone(500, 0.08, { type: 'triangle', gain: 0.1, slide: 300 }); },
    word: function () { [659, 880, 1175].forEach(function (f, i) { tone(f, 0.3, { type: 'triangle', gain: 0.14, delay: i * 0.07 }); }); },
    word2: function () { [587, 784, 988, 1318].forEach(function (f, i) { tone(f, 0.3, { type: 'sine', gain: 0.14, delay: i * 0.06 }); }); },
    arrow: function () { if (!throttle('arrow', 70)) return; noise(0.09, { freq: 2400, filter: 'bandpass', q: 2, gain: 0.07, attack: 0.02 }); },
    hit: function () { if (!throttle('hit', 60)) return; tone(260, 0.06, { type: 'triangle', gain: 0.1 }); },
    poof: function () { if (!throttle('poof', 90)) return; noise(0.3, { freq: 700, gain: 0.12, attack: 0.03 }); tone(880, 0.2, { gain: 0.04, slide: 1500 }); },
    thud: function () { if (!throttle('thud', 200)) return; tone(90, 0.25, { type: 'sine', gain: 0.3, slide: 50 }); noise(0.12, { freq: 300, gain: 0.15 }); },
    horn: function () { tone(220, 0.9, { type: 'sawtooth', gain: 0.06, attack: 0.15 }); tone(330, 0.9, { type: 'triangle', gain: 0.06, attack: 0.15, delay: 0.05 }); },
    alarm: function () { if (!throttle('alarm', 800)) return; [880, 660, 880].forEach(function (f, i) { tone(f, 0.14, { type: 'square', gain: 0.05, delay: i * 0.16 }); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.4, { type: 'triangle', gain: 0.14, delay: i * 0.22 }); }); }
  };

  var unlocked = false;       // 브라우저 정책상 첫 터치 이후에만 소리를 만든다

  window.Sound = {
    unlock: function () { unlocked = true; ensure(); },
    play: function (name, p) {
      if (!unlocked || muted || volume <= 0) return;
      if (!ensure() || !SFX[name]) return;
      try { SFX[name](p); } catch (e) { /* 소리 실패는 게임 진행에 영향 없음 */ }
    },
    // 게임별 효과음 추가: Sound.define('이름', function (a) { a.tone(주파수, 길이, {type, gain, delay, slide}); a.noise(길이, {freq, filter, q, gain, delay}); })
    define: function (name, fn) {
      SFX[name] = function (p) { fn({ tone: tone, noise: noise, throttle: throttle }, p); };
    },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = muted ? 0 : volume;
    },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : volume;
    },
    get muted() { return muted; },
    get volume() { return volume; }
  };
})();
