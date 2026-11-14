/* AI 안경(스마트 글래스) 기기 — 전원, 문항 인식 → 글자 읽기 → 답 생성의 딜레이, 배터리, 발열.
 *  · 안경다리를 톡 건드리면(toggle) 켜지고 꺼진다. 켜는 데도, 불빛이 사그라지는 데도 잠깐 걸린다
 *  · 켜진 채로 문제지를 보고 있으면 스스로 문항을 찾아 읽고 답을 만든다. 다 보여 주고 나면 얼마 뒤 스스로 꺼진다
 *  · 쓸수록 배터리가 닳고 안경다리가 뜨거워진다. 뜨거우면 느려지고, 너무 뜨거우면 저절로 꺼져 식을 때까지 안 켜진다
 * 화면·소리는 직접 다루지 않는다. 일어난 일을 events 에 쌓아 두면 진행 쪽(flow.js)이 꺼내 쓴다.
 */
(function (GX) {
  'use strict';

  var CFG = {
    BOOT: 0.9,                 /* 켜지는 데 걸리는 시간(초) */
    FADE: 0.28,                /* 끈 뒤 렌즈 불빛이 사그라지는 시간 */
    LOCK: [0.55, 1.05],        /* 문항 테두리를 찾는 시간 */
    READ_BASE: 0.45, READ_CHAR: 0.0055,   /* 글자 읽기: 글자 수에 비례 */
    THINK: [1.0, 2.5],         /* 답 생성 */
    RETRY: 0.9, RETRY_P: 0.25, /* 가끔 한 번 더 읽는다 */
    STREAM: 0.6,               /* 답이 글자로 흘러나오는 시간 */
    SHOW_SLEEP: 8, IDLE_SLEEP: 7,
    LOST: 1.2,                 /* 읽는 중에 고개를 이만큼 돌리면 문항을 놓친다 */
    DRAIN: { boot: 0.4, idle: 0.10, lock: 0.45, read: 0.45, think: 0.7, stream: 0.45, show: 0.16 },   /* %/초 */
    DRAIN_PRE: 0.03, BOOT_COST: 0.6,
    POWER: { boot: 3, idle: 1.2, lock: 5, read: 5, think: 9, stream: 5, show: 1.6 },                /* 발열(초당) */
    POWER_PRE: 0.5,
    COOL: 0.05, AMBIENT: 24,
    WARM: 60,                  /* 이보다 뜨거우면 손으로 만져서 안다(검사에서 들킴) */
    HOT: 78,                   /* 느려지기 시작 */
    SHUTDOWN: 100, RESTART: 62,
    LOW: 20, CRIT: 8,
    LUM: { boot: 0.55, idle: 0.22, lock: 0.4, read: 0.5, think: 0.62, stream: 0.6, show: 0.42 }
  };

  var THINK_NOTES = ['보기 대조 중', '근거 검색 중', '답 정리 중'];

  function Glasses(rnd) {
    this.rnd = rnd || Math.random;
    this.reset();
  }

  /* o: { battery, power('on'|'off') } */
  Glasses.prototype.reset = function (o) {
    o = o || {};
    this.power = o.power || 'off';      /* off | boot | on | fade */
    this.mode = 'idle';                 /* idle | lock | read | think | stream | show */
    this.k = 0;                         /* 지금 단계의 진행 0..1 */
    this.q = -1;                        /* 지금 다루는 문항(-1 없음) */
    this.plan = null;                   /* 그 문항의 단계별 시간 */
    this.battery = o.battery === undefined ? 58 : o.battery;
    this.heat = CFG.AMBIENT;
    this.lum = this.power === 'on' ? CFG.LUM.idle : 0;      /* 남의 눈에 보이는 렌즈 밝기 0..1 */
    this.flash = 0;                     /* 켜지는 순간의 번쩍임 */
    this.events = [];
    this.idleT = 0; this.showT = 0; this.awayT = 0; this.fadeT = 0; this.bootT = 0;
    this.locked = false;                /* 과열로 꺼져서 식는 중 */
    this.dead = false;                  /* 배터리 방전 */
    this.retried = false; this.note = 0;
    this.warned = { low: false, crit: false, warm: false, hot: false };
    this.stats = { boots: 0, onTime: 0, maxHeat: this.heat, thermal: 0, aborted: 0 };
    this.t = 0;
  };

  Glasses.prototype.emit = function (type, data) {
    var e = data || {};
    e.type = type;
    this.events.push(e);
  };
  /* 쌓인 사건을 꺼내고 비운다 */
  Glasses.prototype.drain = function () {
    var e = this.events;
    this.events = [];
    return e;
  };

  Glasses.prototype.isOff = function () { return this.power === 'off'; };
  /* 렌즈에 뭔가 떠 있는가(꺼지는 중의 잔광 포함) */
  Glasses.prototype.isLit = function () { return this.lum > 0.04; };
  Glasses.prototype.busy = function () { return this.power === 'on' && (this.mode === 'lock' || this.mode === 'read' || this.mode === 'think' || this.mode === 'stream'); };
  /* 섭씨로 바꾼 안경다리 온도(표시용) */
  Glasses.prototype.tempC = function () { return Math.round(26 + this.heat * 0.3); };
  Glasses.prototype.warm = function () { return this.heat >= CFG.WARM; };
  /* 0 차가움 · 1 미지근 · 2 따뜻함(만지면 안다) · 3 뜨거움(느려짐) */
  Glasses.prototype.heatZone = function () { return this.heat >= CFG.HOT ? 3 : (this.heat >= CFG.WARM ? 2 : (this.heat >= 42 ? 1 : 0)); };

  /* 안경다리를 건드린다. 돌려주는 값: 'on' 켜지기 시작 / 'off' 꺼짐 / 'dead' 방전이라 반응 없음 / 'hot' 식는 중이라 안 켜짐 */
  Glasses.prototype.toggle = function () {
    if (this.power === 'on' || this.power === 'boot') { this.off('user'); return 'off'; }
    if (this.dead) return 'dead';
    if (this.locked) return 'hot';
    this.power = 'boot'; this.bootT = 0; this.flash = 1;
    this.battery = Math.max(0, this.battery - CFG.BOOT_COST);
    this.stats.boots++;
    this.emit('boot');
    return 'on';
  };

  /* why: user(내가 끔) · auto(스스로 절전) · thermal(과열) · dead(방전) · force(빼앗김) */
  Glasses.prototype.off = function (why) {
    if (this.power === 'off' || this.power === 'fade') return;
    var was = this.mode, busy = this.busy() || this.power === 'boot';
    if (busy && this.power === 'on') this.stats.aborted++;
    this.power = why === 'force' ? 'off' : 'fade';
    this.fadeT = 0;
    if (why === 'force') this.lum = 0;
    this.mode = 'idle'; this.k = 0; this.q = -1; this.plan = null;
    this.idleT = 0; this.showT = 0; this.awayT = 0;
    this.emit('sleep', { why: why, was: was, busy: busy });
  };

  function planFor(dev, chars) {
    var r = dev.rnd;
    return {
      lock: CFG.LOCK[0] + r() * (CFG.LOCK[1] - CFG.LOCK[0]),
      read: CFG.READ_BASE + chars * CFG.READ_CHAR,
      think: CFG.THINK[0] + r() * (CFG.THINK[1] - CFG.THINK[0]),
      retry: r() < CFG.RETRY_P ? 0.45 + r() * 0.3 : -1       /* 답을 만들다가 이 지점에서 한 번 더 읽는다 */
    };
  }

  Glasses.prototype._start = function (q, chars) {
    this.q = q; this.mode = 'lock'; this.k = 0; this.awayT = 0; this.retried = false; this.note = 0;
    this.plan = planFor(this, chars || 120);
    this.emit('lock', { q: q });
  };

  /* 지금 처리 속도(뜨거우면 느려지고, 배터리가 바닥이면 절전) */
  Glasses.prototype.speed = function () {
    var s = 1 / (1 + 1.3 * GX.smoothstep(CFG.HOT - 8, 100, this.heat));
    if (this.battery < CFG.CRIT) s *= 0.7;
    return s;
  };

  /* ctx: { gaze(문제지를 보고 있는가), q(지금 펼친 문항, 없으면 -1), scanned[], chars(그 문항의 글자 수),
   *        pre(시험 전: 글자만 알아보는 대기 상태라 전기를 거의 안 쓰고 스스로 꺼지지도 않는다) } */
  Glasses.prototype.update = function (dt, ctx) {
    var m, i, C = CFG;
    this.t += dt;
    ctx = ctx || {};
    var gaze = !!ctx.gaze, cq = ctx.q === undefined ? -1 : ctx.q, scanned = ctx.scanned || [], pre = !!ctx.pre;

    if (this.power === 'boot') {
      this.bootT += dt;
      this.battery -= C.DRAIN.boot * dt;
      if (this.bootT >= C.BOOT) { this.power = 'on'; this.mode = 'idle'; this.idleT = 0; this.emit('booted'); }
    } else if (this.power === 'fade') {
      this.fadeT += dt;
      if (this.fadeT >= C.FADE) this.power = 'off';
    } else if (this.power === 'on') {
      /* 시험 밖(pre)에서는 문항을 다루지 않는다: 하던 일이 있었다면 조용히 내려놓는다 */
      if (pre && this.mode !== 'idle') { this.mode = 'idle'; this.k = 0; this.q = -1; this.plan = null; this.idleT = 0; }
      m = this.mode;
      this.stats.onTime += dt;
      this.battery -= (pre ? C.DRAIN_PRE : C.DRAIN[m]) * dt;
      var sp = this.speed();
      if (m === 'idle') {
        if (pre) this.idleT = 0;
        else if (gaze && cq >= 0) {
          if (scanned[cq]) { this.mode = 'show'; this.q = cq; this.showT = 0; this.k = 1; this.emit('recall', { q: cq }); }
          else this._start(cq, ctx.chars);
        } else {
          this.idleT += dt;
          if (this.idleT >= C.IDLE_SLEEP) this.off('auto');
        }
      } else if (m === 'lock' || m === 'read') {
        /* 문항을 붙잡고 읽는 동안에는 그 문항을 계속 보고 있어야 한다 */
        if (cq !== this.q) { this.mode = 'idle'; this.k = 0; this.q = -1; this.idleT = 0; this.emit('lost', { why: 'page' }); }
        else if (!gaze) {
          this.awayT += dt;
          this.k = Math.max(0, this.k - dt * 0.7);
          if (this.awayT >= C.LOST) { this.mode = 'idle'; this.k = 0; this.q = -1; this.idleT = 0; this.emit('lost', { why: 'gaze' }); }
        } else {
          this.awayT = 0;
          this.k += dt * sp / (m === 'lock' ? this.plan.lock : this.plan.read);
          if (this.k >= 1) {
            this.k = 0;
            if (m === 'lock') { this.mode = 'read'; this.emit('read', { q: this.q }); }
            else { this.mode = 'think'; this.emit('think', { q: this.q }); }
          }
        }
      } else if (m === 'think') {
        /* 읽은 뒤에는 고개를 들어도 계산은 이어진다 */
        this.k += dt * sp / this.plan.think;
        i = Math.min(THINK_NOTES.length - 1, Math.floor(this.k * THINK_NOTES.length));
        if (i !== this.note) this.note = i;
        if (!this.retried && this.plan.retry > 0 && this.k >= this.plan.retry) {
          this.retried = true;
          this.plan.think += C.RETRY;
          this.k = this.k * (this.plan.think - C.RETRY) / this.plan.think;
          this.emit('retry', { q: this.q });
        }
        if (this.k >= 1) { this.mode = 'stream'; this.k = 0; this.emit('answer', { q: this.q }); }
      } else if (m === 'stream') {
        this.k += dt / C.STREAM;
        if (this.k >= 1) { this.mode = 'show'; this.k = 1; this.showT = 0; }
      } else if (m === 'show') {
        this.showT += dt;
        if (gaze && cq >= 0 && cq !== this.q) {
          if (scanned[cq]) { this.q = cq; this.showT = 0; this.emit('recall', { q: cq }); }
          else this._start(cq, ctx.chars);                  /* 책장을 넘기면 이어서 다음 문항을 읽는다 */
        } else if (this.showT >= C.SHOW_SLEEP) this.off('auto');
      }
    }

    /* 배터리 */
    if (this.battery < 0) this.battery = 0;
    if (this.power !== 'off' && this.power !== 'fade') {
      if (!this.warned.low && this.battery <= C.LOW) { this.warned.low = true; this.emit('low'); }
      if (!this.warned.crit && this.battery <= C.CRIT) { this.warned.crit = true; this.emit('crit'); }
      if (this.battery <= 0 && !this.dead) { this.dead = true; this.off('dead'); this.emit('dead'); }
    }

    /* 발열: 켜져 있으면 하는 일만큼 데워지고, 주변보다 뜨거운 만큼 식는다 */
    var P = 0;
    if (this.power === 'boot') P = C.POWER.boot;
    else if (this.power === 'on') P = pre ? C.POWER_PRE : C.POWER[this.mode];
    this.heat += (P - (this.heat - C.AMBIENT) * C.COOL) * dt;
    if (this.heat < C.AMBIENT) this.heat = C.AMBIENT;
    if (this.heat > this.stats.maxHeat) this.stats.maxHeat = this.heat;
    if (!this.warned.warm && this.heat >= C.WARM) { this.warned.warm = true; this.emit('warm'); }
    if (this.warned.warm && this.heat < C.WARM - 12) this.warned.warm = false;
    if (!this.warned.hot && this.heat >= C.HOT) { this.warned.hot = true; this.emit('hot'); }
    if (this.warned.hot && this.heat < C.HOT - 10) this.warned.hot = false;
    if (this.heat >= C.SHUTDOWN && (this.power === 'on' || this.power === 'boot')) {
      this.heat = C.SHUTDOWN;
      this.locked = true; this.stats.thermal++;
      this.off('thermal');
      this.emit('thermal');
    }
    if (this.locked && this.heat < C.RESTART) { this.locked = false; this.emit('cool'); }

    /* 렌즈 밝기: 단계마다 다르고, 답을 만드는 동안에는 일렁인다. 끄면 잔광이 잠깐 남는다 */
    var want = 0;
    if (this.power === 'boot') want = C.LUM.boot;
    else if (this.power === 'on') {
      want = C.LUM[this.mode];
      if (this.mode === 'think') want += 0.08 * Math.sin(this.t * 13);
      if (this.battery < C.LOW) want *= 0.8;               /* 배터리가 모자라면 화면이 어두워진다 */
    }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt / 0.18); want = Math.max(want, 0.9 * this.flash); }
    if (this.power === 'fade') this.lum = Math.max(0, this.lum - dt / C.FADE * 0.7);
    else if (this.power === 'off') this.lum = 0;
    else this.lum = GX.damp(this.lum, want, 14, dt);
  };

  /* 지금 단계의 전체 진행(켜짐 0 → 답 1). 화면 가운데 고리에 쓴다 */
  Glasses.prototype.progress = function () {
    if (this.power === 'boot') return this.bootT / CFG.BOOT;
    if (this.power !== 'on') return 0;
    var m = this.mode, k = GX.clamp(this.k, 0, 1);
    if (m === 'lock') return k * 0.2;
    if (m === 'read') return 0.2 + k * 0.3;
    if (m === 'think') return 0.5 + k * 0.5;
    return m === 'stream' || m === 'show' ? 1 : 0;
  };

  /* AI 가 읽은 문제 문장의 끝부분(잘못 읽었으면 잘못 읽은 대로) */
  function tailOf(text, n) {
    var a = Array.from(String(text));
    return a.length > n ? '…' + a.slice(a.length - n).join('') : a.join('');
  }
  GX.stemTail = tailOf;

  /* 렌즈에 띄울 내용. ex: GX.Exam(문항 정보). 꺼져 있으면 on:false */
  Glasses.prototype.view = function (ex) {
    var v = {
      on: this.power === 'boot' || this.power === 'on', power: this.power, stage: this.power === 'boot' ? 'boot' : this.mode,
      lum: this.lum, pct: this.progress(), head: '', line: '', tail: '', answer: null, dot: 'ok',
      battery: Math.ceil(this.battery), temp: this.tempC(), zone: this.heatZone(), low: this.battery <= CFG.LOW,
      dead: this.dead, locked: this.locked, slow: this.speed() < 0.8
    };
    if (!v.on) return v;
    var q = ex && this.q >= 0 ? ex.qs[this.q] : null, m = this.mode, C = GX.CIRC;
    if (this.power === 'boot') { v.head = '켜는 중'; v.dot = 'busy'; v.line = '시야 보정 · 글자 인식 준비'; return v; }
    if (m === 'idle') { v.head = '대기'; v.line = ex && ex.state === 'open' ? '문제지를 보면 문항을 읽습니다' : '글자를 보면 읽어 드립니다'; }
    else if (m === 'lock') { v.head = '문항 찾는 중'; v.dot = 'busy'; v.line = this.awayT > 0 ? '고개를 문제지에 두세요' : '문항 ' + (this.q + 1) + ' 테두리 인식'; }
    else if (m === 'read') {
      v.head = '글자 읽는 중 ' + Math.min(99, Math.round(this.k * 100)) + '%'; v.dot = 'busy';
      v.line = this.awayT > 0 ? '고개를 문제지에 두세요' : '문항 ' + (this.q + 1) + ' · 보기 5개';
      if (q) {
        var t = tailOf(q.ai.readAs, 17), a = Array.from(t);
        v.tail = a.slice(0, Math.max(1, Math.round(a.length * GX.clamp(this.k * 1.25, 0, 1)))).join('');
      }
    } else if (m === 'think') {
      v.head = this.retried && this.k < this.plan.retry + 0.25 ? '다시 읽는 중' : '답 생성 중'; v.dot = 'busy';
      v.line = THINK_NOTES[this.note] + (v.slow ? ' · 발열로 느려짐' : '');
      if (q) v.tail = tailOf(q.ai.readAs, 17);
    } else if (q) {
      var low = q.ai.conf < 80, why = q.ai.why, typed = m === 'stream' ? GX.clamp(this.k, 0, 1) : 1, wa = Array.from(why);
      v.head = '문항 ' + (this.q + 1) + ' 답'; v.dot = low ? 'warn' : 'ok';
      v.tail = tailOf(q.ai.readAs, 17);
      v.answer = { n: C[q.ai.pick], conf: q.ai.conf, low: low, why: wa.slice(0, Math.round(wa.length * typed)).join(''), typed: typed };
      v.line = m === 'show' ? '따를지 말지는 직접 정하세요' : '';
    }
    return v;
  };

  GX.Glasses = Glasses;
  GX.GLASSES_CFG = CFG;
})(window.GX = window.GX || {});
