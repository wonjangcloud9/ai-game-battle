/* 어스름 전선 — net: 친구 방 (온라인으로 친구와 같이 하기)
   · 방 만들기 → 다섯 글자 방 코드 → 친구가 코드를 넣으면 들어온다. 1대1(같은 편/상대 편)부터 2대2까지, 빈자리는 봇.
   · 서로 찾기만 PeerJS 무료 공용 서버(0.peerjs.com)로 하고, 연결은 브라우저끼리 직접(WebRTC 데이터 채널).
     STUN 은 stun:stun.cloudflare.com:3478 하나만 쓴다. TURN(대신 전달해 주는 서버)은 쓰지 않는다 →
     직접 연결이 안 되는 망이면 "이 인터넷에서는 친구와 직접 연결이 안 돼요"라고 알린다.
   · 게임 화면이 아니라 '누가 몇 번째 틱에 무엇을 눌렀는지'만 주고받는다 (락스텝):
       친구 → 방장 : 내 입력 묶음 { t:'i', k:틱, c:[명령…] }  — 틱마다 하나 (비어 있어도 보낸다: '이 틱엔 누른 게 없다')
       방장 → 모두 : 그 틱의 모든 사람 입력 { t:'f', k, c:[[사람 번호, 명령]…] }  — 방장이 모두의 묶음을 받아야 그 틱을 돌린다
     모든 화면이 같은 씨앗·같은 틱·같은 명령 순서로 돌므로 같은 경기가 된다.
   · 1초(30틱)마다 게임 상태의 지문(해시: 모든 유닛의 위치·체력·골드… 와 난수를 뽑은 횟수)을 서로 보내 견준다 → 어긋나면 화면에 알린다.
   · 방장은 자기 입력을 다음 틱에 바로 넣는다(혼자 하기와 같은 손맛). 친구의 입력은 왕복 지연만큼 몇 틱 뒤에 들어간다 — 누른 순간의 몸 돌리기·클릭 표시·소리는 바로 그린다.
   · 누가 나가면(연결이 끊기거나 3.5초 동안 소식이 없으면) 그 자리를 봇이 이어받는다. 방장이 나가면 남은 사람은 혼자 봇들과 이어서 한다. */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U;
  const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];          // STUN 하나만. TURN 없음
  const PREFIX = 'eoseureum-v13-';                                  // 공용 서버에서 우리 방 이름이 남과 겹치지 않게
  const ALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';                   // 헷갈리는 글자(0 O 1 I L) 뺌
  const PROTO = 1, HASH_EVERY = 30, MAX_PLAYERS = 4, PER_TEAM = 2;
  const CONNECT_TIMEOUT = 15000, SILENT_DROP = 3500;
  const NO_DIRECT = '이 인터넷에서는 친구와 직접 연결이 안 돼요';
  const NO_DIRECT_SUB = '두 사람 중 한쪽의 공유기·회사·학교·휴대폰 망이 브라우저끼리의 직접 연결을 막고 있어요. 이 게임은 대신 전달해 주는 서버를 쓰지 않아서 이런 망에서는 같이 할 수 없어요. 다른 와이파이나 집 인터넷으로 바꿔 다시 해 보세요.';
  const now = () => (globalThis.performance && performance.now ? performance.now() : Date.now());

  const N = TW.Net = {
    live: false, lobbyOpen: false, host: false, pid: -1, code: '', status: '', err: '',
    players: [], diff: 'normal', rtt: -1, rttLog: [], log: [],
  };
  let peer = null, conns = new Map(), hostConn = null, pingTimer = null, L = null, ui = null, nextPid = 1;
  const say = (msg) => { N.log.push(Math.round(now()) + ' ' + msg); if (N.log.length > 200) N.log.shift(); };

  /* =====================================================================
     게임 상태의 지문: 두 화면이 같은지 견준다 (부동소수점 값은 비트 그대로 섞는다 → 아주 작은 어긋남도 잡는다)
     ===================================================================== */
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  function stateHash(G) {
    let h = 0x811c9dc5 >>> 0;
    const mix = (v) => { h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; };
    const num = (x) => { f64[0] = x; mix(u32[0]); mix(u32[1]); };
    num(G.t); mix(G.rngN || 0); mix(G.nextId); mix(G.units.length); mix(G.projs.length); mix(G.zones.length); mix(G.strikes.length); mix(G.timers.length);
    const us = G.units;
    for (let i = 0; i < us.length; i++) { const u = us[i]; mix(u.id); num(u.x); num(u.y); num(u.hp); mix(u.dead ? 1 : 0); }
    for (const hh of G.heroes) { num(hh.gold); num(hh.xp); mix(hh.level); num(hh.facing); mix(hh.kills); mix(hh.deaths); mix(hh.cs); for (let k = 0; k < 4; k++) num(hh.cds[k]); mix(hh.brain ? 1 : 0); }
    for (const p of G.projs) { num(p.x); num(p.y); }
    mix(G.teams[0].kills); mix(G.teams[1].kills); mix(G.over ? 1 : 0);
    return h >>> 0;
  }
  N.stateHash = stateHash;

  /* =====================================================================
     연결
     ===================================================================== */
  function randomCode(n) { let s = ''; for (let i = 0; i < n; i++) s += ALPH[(Math.random() * ALPH.length) | 0]; return s; }
  function makePeer(id) {
    if (typeof Peer === 'undefined') throw new Error('PeerJS 를 불러오지 못했습니다 (js/vendor/peerjs.min.js)');
    return new Peer(id, { config: { iceServers: ICE }, debug: 0 });       // 기본 서버 = PeerJS 무료 공용 서버(0.peerjs.com:443)
  }
  function send(conn, m) { try { if (conn && conn.open) conn.send(m); } catch (e) { say('send fail ' + e.message); } }
  function broadcast(m) { for (const c of conns.values()) send(c.conn, m); }
  function serverError(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return '그 코드의 방을 찾지 못했어요 — 코드를 다시 확인해 주세요 (방을 만든 사람이 창을 닫았을 수도 있어요)';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '친구를 찾아 주는 공용 서버(PeerJS)에 닿지 못했어요 — 인터넷 연결을 확인하고 다시 해 보세요';
    if (t === 'browser-incompatible') return '이 브라우저는 직접 연결(WebRTC)을 지원하지 않아요 — 크롬·엣지·파이어폭스·사파리 최신판으로 열어 주세요';
    if (t === 'webrtc' || t === 'negotiation-failed') return NO_DIRECT;
    return '연결 오류: ' + (t || (e && e.message) || '알 수 없음');
  }
  /* 직접 연결 지켜보기: ICE 가 'failed' 가 되거나 15초 안에 열리지 않으면 = 직접 연결이 안 되는 망 */
  function watchDirect(conn, onFail) {
    const t0 = now(); let done = false;
    const iv = setInterval(() => {
      if (done) return;
      if (conn.open) { done = true; clearInterval(iv); return; }
      const pc = conn.peerConnection, st = pc ? pc.iceConnectionState : '';
      if (st === 'failed' || now() - t0 > CONNECT_TIMEOUT) { done = true; clearInterval(iv); say('direct fail ice=' + st + ' t=' + Math.round(now() - t0)); onFail(st || 'timeout'); }
    }, 250);
    return () => { done = true; clearInterval(iv); };
  }
  /* 연결된 길이 무엇인지(같은 망 안 / 공유기 밖 주소) — 시험 기록용 */
  async function routeOf(conn) {
    try {
      const pc = conn.peerConnection; if (!pc) return null;
      const st = await pc.getStats(); let pair = null; const cand = {};
      st.forEach(r => { if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r; if (r.type === 'local-candidate' || r.type === 'remote-candidate') cand[r.id] = r; });
      if (!pair) return null;
      const lo = cand[pair.localCandidateId] || {}, re = cand[pair.remoteCandidateId] || {};
      return { local: lo.candidateType, remote: re.candidateType, proto: lo.protocol, rtt: pair.currentRoundTripTime };
    } catch (e) { return null; }
  }

  function resetAll() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    for (const c of conns.values()) { try { c.conn.close(); } catch (e) { /* */ } }
    conns.clear();
    if (hostConn) { try { hostConn.close(); } catch (e) { /* */ } hostConn = null; }
    if (peer) { try { peer.destroy(); } catch (e) { /* */ } peer = null; }
    N.host = false; N.pid = -1; N.code = ''; N.players = []; N.rtt = -1; N.rttLog = []; N.live = false; L = null; nextPid = 1;
  }
  N.leave = function () {
    try { if (hostConn) send(hostConn, { t: 'bye' }); else broadcast({ t: 'bye' }); } catch (e) { /* */ }
    resetAll(); closeLobby();
  };
  window.addEventListener('beforeunload', () => { try { if (hostConn) send(hostConn, { t: 'bye' }); else broadcast({ t: 'bye' }); } catch (e) { /* */ } });

  const myPick = () => { const S = TW.UI.sel; return { hero: S.hero, pos: S.pos || TW.bestPos(S.hero) }; };
  function teamCount(team, except) { let n = 0; for (const p of N.players) if (p.team === team && p.pid !== except) n++; return n; }

  /* ----- 방장: 방 만들기 ----- */
  function createRoom(tries) {
    resetAll(); tries = tries || 0;
    const code = randomCode(5);
    setStatus('공용 서버에 방을 여는 중…');
    try { peer = makePeer(PREFIX + code); } catch (e) { setErr(e.message); return; }
    peer.on('open', () => {
      N.host = true; N.pid = 0; N.code = code;
      const pk = myPick();
      N.players = [{ pid: 0, name: '방장', hero: pk.hero, pos: pk.pos, team: 0, rtt: 0 }];
      say('room open ' + code);
      setStatus('친구에게 방 코드를 알려 주세요. 친구가 들어오면 여기에 보입니다.');
      startPings(); render();
    });
    peer.on('connection', onIncoming);
    peer.on('disconnected', () => { say('signal server disconnected'); if (peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* */ } } });
    peer.on('error', (e) => {
      say('host peer error ' + e.type);
      if (e.type === 'unavailable-id' && tries < 4) { createRoom(tries + 1); return; }
      if (!N.code || e.type !== 'peer-unavailable') setErr(serverError(e));
    });
  }
  function onIncoming(conn) {
    say('incoming ' + conn.peer);
    const stop = watchDirect(conn, () => { setErr('친구가 들어오려 했지만 — ' + NO_DIRECT, NO_DIRECT_SUB); try { conn.close(); } catch (e) { /* */ } });
    conn.on('open', () => {
      stop();
      const md = conn.metadata || {};
      if (md.proto !== PROTO) { send(conn, { t: 'no', why: '게임 판이 서로 달라요 — 두 사람 모두 새로 고침(F5) 해 주세요' }); setTimeout(() => conn.close(), 300); return; }
      if (L || N.live) { send(conn, { t: 'no', why: '이미 경기가 시작된 방이에요' }); setTimeout(() => conn.close(), 300); return; }
      if (N.players.length >= MAX_PLAYERS) { send(conn, { t: 'no', why: '방이 꽉 찼어요 (4명까지)' }); setTimeout(() => conn.close(), 300); return; }
      const pid = nextPid++;
      const team = teamCount(1) < PER_TEAM && (teamCount(1) <= teamCount(0)) ? 1 : 0;       // 둘째는 상대 편(1대1)으로 — 대기실에서 바꿀 수 있다
      const pl = { pid, name: '친구 ' + pid, hero: md.hero && TW.Heroes[md.hero] ? md.hero : TW.HeroOrder[pid % TW.HeroOrder.length], pos: TW.POS.indexOf(md.pos) >= 0 ? md.pos : 'mid', team, rtt: -1 };
      const c = { pid, conn, last: now(), rtt: -1, rtts: [], route: null };
      conns.set(pid, c); N.players.push(pl);
      conn.on('data', (m) => onHostData(c, m));
      conn.on('close', () => lost(pid, 'close'));
      conn.on('error', (e) => { say('conn err ' + pid + ' ' + (e && e.type)); });
      send(conn, { t: 'hi', pid, code: N.code });
      routeOf(conn).then(r => { c.route = r; });
      say('joined pid=' + pid);
      setStatus(pl.name + '가 들어왔어요');
      lobbySync(); render();
    });
  }
  function lobbySync() { broadcast({ t: 'lb', players: N.players.map(p => ({ pid: p.pid, name: p.name, hero: p.hero, pos: p.pos, team: p.team, rtt: p.rtt })), diff: N.diff }); }
  function lost(pid, why) {
    const c = conns.get(pid); if (!c) return;
    conns.delete(pid); say('lost pid=' + pid + ' ' + why);
    try { c.conn.close(); } catch (e) { /* */ }
    const pl = N.players.find(p => p.pid === pid);
    N.players = N.players.filter(p => p.pid !== pid);
    if (L && L.host && L.active.has(pid)) { L.active.delete(pid); L.dropNow.push({ pid, name: pl ? pl.name : '친구' }); L.inbox.delete(pid); }
    else if (!L) { setStatus((pl ? pl.name : '친구') + '가 나갔어요'); lobbySync(); render(); }
  }
  function onHostData(c, m) {
    c.last = now();
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'i': if (L && L.host) { let b = L.inbox.get(c.pid); if (!b) L.inbox.set(c.pid, b = new Map()); b.set(m.k, m.c || []); L.lastIn.set(c.pid, m.k); c.lastInT = now(); pumpIfHidden(); } break;
      case 'quit': if (L && L.host && L.active.has(c.pid)) { const pl = N.players.find(p => p.pid === c.pid); L.active.delete(c.pid); L.dropNow.push({ pid: c.pid, name: pl ? pl.name : '친구' }); L.inbox.delete(c.pid); } break;
      case 'p': send(c.conn, { t: 'q', s: m.s }); break;
      case 'q': { const r = now() - m.s; c.rtt = r; c.rtts.push(r); if (c.rtts.length > 8) c.rtts.shift(); const pl = N.players.find(p => p.pid === c.pid); if (pl) pl.rtt = Math.round(r); recordRtt(r); break; }
      case 'h': if (L) gotHash(c.pid, m.k, m.h); break;
      case 'pk': {
        const pl = N.players.find(p => p.pid === c.pid); if (!pl || L) break;
        if (TW.Heroes[m.hero]) pl.hero = m.hero; if (TW.POS.indexOf(m.pos) >= 0) pl.pos = m.pos;
        if ((m.team === 0 || m.team === 1) && m.team !== pl.team && teamCount(m.team, pl.pid) < PER_TEAM) pl.team = m.team;
        lobbySync(); render(); break;
      }
      case 'bye': lost(c.pid, 'bye'); break;
      default: break;
    }
  }

  /* ----- 친구: 코드로 들어가기 ----- */
  function joinRoom(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { setErr('방 코드는 다섯 글자예요'); return; }
    resetAll();
    setStatus('방 ' + code + '을(를) 찾는 중…');
    try { peer = makePeer(PREFIX + 'g' + randomCode(10).toLowerCase()); } catch (e) { setErr(e.message); return; }
    peer.on('open', () => {
      setStatus('방을 찾았어요 — 친구와 직접 연결하는 중…');
      const pk = myPick();
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { proto: PROTO, hero: pk.hero, pos: pk.pos } });
      hostConn = conn; N.code = code;
      const stop = watchDirect(conn, () => { setErr(NO_DIRECT, NO_DIRECT_SUB); resetAll(); render(); });
      conn.on('open', () => { stop(); say('connected to host'); startPings(); routeOf(conn).then(r => { N.route = r; }); });
      conn.on('data', onClientData);
      conn.on('close', () => hostLost('close'));
      conn.on('error', (e) => say('host conn err ' + (e && e.type)));
    });
    peer.on('disconnected', () => { say('signal server disconnected (client)'); });
    peer.on('error', (e) => { say('client peer error ' + e.type); if (!hostConn || !hostConn.open) { setErr(serverError(e), e.type === 'webrtc' || e.type === 'negotiation-failed' ? NO_DIRECT_SUB : ''); } });
  }
  let hostLast = 0;
  function onClientData(m) {
    hostLast = now();
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'f': if (L) { L.frames.set(m.k, m.c || []); if (m.k > L.maxFrame) L.maxFrame = m.k; pumpIfHidden(); } break;
      case 'p': send(hostConn, { t: 'q', s: m.s }); break;
      case 'q': { const r = now() - m.s; N.rtt = r; recordRtt(r); break; }
      case 'h': if (L) gotHash(0, m.k, m.h); break;
      case 'ds': say('host saw desync k=' + m.k); break;
      case 'hi': N.pid = m.pid; N.host = false; setStatus('들어왔어요! 방장이 시작하기를 기다리는 중…'); render(); break;
      case 'lb': N.players = m.players; N.diff = m.diff; render(); break;
      case 'no': setErr(m.why); resetAll(); render(); break;
      case 'go': startMatch(m.cfg); break;
      case 'lobby': backToLobbyUI(); break;
      case 'bye': hostLost('bye'); break;
      default: break;
    }
  }
  function hostLost(why) {
    if (!hostConn) return;
    say('host lost ' + why);
    hostConn = null;
    if (L && !L.host) orphan();
    else if (!L) { setErr('방장과의 연결이 끊겼어요'); resetAll(); render(); }
  }

  /* ----- 지연 재기: 0.5초마다 왕복 ----- */
  function recordRtt(r) { N.rttLog.push(Math.round(r * 10) / 10); if (N.rttLog.length > 4000) N.rttLog.shift(); }
  function startPings() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      const t = now();
      if (N.host) {
        for (const c of conns.values()) {
          send(c.conn, { t: 'p', s: t });
          // 아무 소식(입력 묶음·지연 재기 대답)이 없는 시간으로 본다. 입력 묶음만 보면 안 된다:
          // 한 사람이 끊겨 방장이 기다리는 동안에는 다른 친구도 새 틱을 못 받아 묶음을 못 보낸다 → 멀쩡한 친구까지 끊어 버린다 (2대2 시험에서 잡음)
          const playing = L && L.active.has(c.pid), quiet = t - c.last;
          if (quiet > (playing ? SILENT_DROP : 15000)) lost(c.pid, 'silent');
        }
        let mx = -1; for (const c of conns.values()) if (c.rtt > mx) mx = c.rtt; N.rtt = mx;
      } else if (hostConn) {
        send(hostConn, { t: 'p', s: t });
        if (L && !L.host && hostLast && t - hostLast > SILENT_DROP) hostLost('silent');
      }
      if (L) adaptDelay();
      if (ui && N.lobbyOpen) renderRtt();
    }, 500);
  }

  /* =====================================================================
     경기: 락스텝
     ===================================================================== */
  /* 팀 짜기: 사람은 고른 영웅·자리로 앞에 서고, 남은 자리는 혼자 하기와 같은 방식으로 봇을 고른다 (방장이 정해 모두에게 보낸다) */
  function buildTeams(players, rng) {
    const teams = [[], []], humans = [];
    for (let team = 0; team < 2; team++) {
      const used = new Set(), open = TW.POS.slice(), out = teams[team];
      for (const p of players.filter(q => q.team === team)) {
        let id = p.hero; if (!TW.Heroes[id] || used.has(id)) id = TW.HeroOrder.find(x => !used.has(x));
        let pos = p.pos; if (open.indexOf(pos) < 0) pos = open.slice().sort((a, b) => (TW.Heroes[id].pos[b] || 0) - (TW.Heroes[id].pos[a] || 0))[0];
        used.add(id); open.splice(open.indexOf(pos), 1);
        humans.push({ pid: p.pid, team, idx: out.length, hero: id, pos, name: p.name });
        out.push({ id, pos });
      }
      const order = ['carry', 'jg', 'mid', 'sup', 'top'].filter(p => open.indexOf(p) >= 0);
      for (const pos of order) {
        let pool = [], best = 0;
        for (const id of TW.HeroOrder) { if (used.has(id)) continue; const a = TW.Heroes[id].pos[pos] || 0; if (a > best) best = a; }
        for (const id of TW.HeroOrder) { if (used.has(id)) continue; const a = TW.Heroes[id].pos[pos] || 0; if (a >= Math.max(1, best - 1) || best === 0) pool.push({ id, w: best === 0 ? 1 : a * a }); }
        let sum = 0; for (const p of pool) sum += p.w;
        let r = rng() * sum, pick = pool[0];
        for (const p of pool) { r -= p.w; if (r <= 0) { pick = p; break; } }
        out.push({ id: pick.id, pos }); used.add(pick.id);
      }
    }
    return { teams, humans };
  }
  function hostStart() {
    if (!N.host || L) return;
    if (N.players.length < 2) { setErr('친구가 한 명 이상 들어와야 시작할 수 있어요'); return; }
    if (teamCount(0) > PER_TEAM || teamCount(1) > PER_TEAM) { setErr('한 편에는 사람이 둘까지예요'); return; }
    const seed = (Math.random() * 1e9) | 0;
    const tb = buildTeams(N.players, U.mulberry32(seed ^ 0x2f6b1d3));
    const cfg = { proto: PROTO, seed, diff: N.diff, teams: tb.teams, humans: tb.humans };
    say('start seed=' + seed + ' players=' + N.players.length);
    broadcast({ t: 'go', cfg });
    startMatch(cfg);
  }
  function startMatch(cfg) {
    const humans = cfg.humans, heroIdx = new Map();
    for (const q of humans) heroIdx.set(q.pid, q.team * 5 + q.idx);
    L = {
      cfg, host: N.host, myPid: N.pid, heroIdx, k: 0, began: false,
      pending: [], hashes: new Map(), remote: new Map(), checks: 0, matches: 0, desync: null, hashLog: [], flog: [], dsLog: [], pressT: [], lat: [],
      // 방장
      inbox: new Map(), active: new Set(N.host ? humans.filter(q => q.pid !== 0).map(q => q.pid) : []), dropNow: [], lastIn: new Map(),
      // 친구
      frames: new Map(), maxFrame: -1, sealed: -1, D: 2, Dlog: [],
      stallT: 0, stalls: 0, waitStart: 0, ticksRun: 0, startedAt: now(), cmdsSent: 0, cmdsApplied: 0, orphan: null, takeovers: [],
    };
    if (N.host) for (const pid of L.active) if (!conns.has(pid)) { L.active.delete(pid); L.dropNow.push({ pid, name: '친구' }); }
    N.live = true;
    adaptDelay();
    closeLobby();
    const G = TW.App.startNetGame(cfg, N.pid);
    say('match start my pid=' + N.pid + ' hero=' + G.heroes[heroIdx.get(N.pid)].heroId);
  }
  /* 친구의 입력 지연(틱): 왕복 지연 + 화면 한 장(16ms) + 여유가 그 틱 수 안에 들어오게 — 지연이 커지면 늘리고 줄면 줄인다 */
  function adaptDelay() {
    if (!L || L.host) return;
    const rs = N.rttLog.slice(-8); if (!rs.length) return;
    const r = Math.max.apply(null, rs);
    const D = U.clamp(Math.ceil((r + 20) / (C.DT * 1000)), 1, 8);
    if (D !== L.D) { L.Dlog.push({ k: L.k, D }); L.D = D; }
  }
  /* main.js 가 부르는 것들 */
  N.cmd = function (c) {
    if (!L) return;
    if (c[0] === 'am') { for (let i = L.pending.length - 1; i >= 0; i--) if (L.pending[i][0] === 'am') { L.pending[i] = c; return; } }      // 조준점은 틱마다 하나면 된다
    L.pending.push(c); L.cmdsSent++;
    if (c[0] !== 'am') L.pressT.push(now());          // 누른 시각 — 내 명령이 게임에 들어간 시각과 견준다 (손맛 기록)
  };
  N.aimSlotFree = () => true;
  N.holdSec = () => (L ? (L.host ? 1 : L.D + 1) * C.DT + 0.05 : 0);         // 누른 순간 돌린 몸을 잡아 둘 시간
  N.began = function () {
    if (!L) return;
    L.began = true; L.startedAt = now();
    if (!L.host) seal();
  };
  N.ready = function () {
    if (!L || !L.began) return false;
    if (L.orphan && L.k >= L.orphan.at) becomeSolo();
    if (L.host) { for (const pid of L.active) { const b = L.inbox.get(pid); if (!b || !b.has(L.k)) return false; } return true; }
    return L.frames.has(L.k);
  };
  N.behind = () => (L && !L.host ? Math.max(0, L.maxFrame - L.k) : 0);
  N.wait = function (sec) { if (!L) return; if (!L.waitStart) { L.waitStart = now(); L.stalls++; } L.stallT += sec; };
  N.step = function (fn) {
    const k = L.k;
    if (L.waitStart) { const w = now() - L.waitStart; L.waitStart = 0; if (w > 60) say('stall ' + Math.round(w) + 'ms @' + k); }
    let wire;
    if (L.host) {
      wire = [];
      for (const d of L.dropNow) { wire.push([d.pid, ['drop', d.name]]); L.takeovers.push({ k, pid: d.pid }); }
      L.dropNow = [];
      for (const c of L.pending) wire.push([L.myPid, c]);
      L.pending = [];
      const ids = Array.from(L.active).sort((a, b) => a - b);
      for (const pid of ids) { const b = L.inbox.get(pid), cs = b.get(k); b.delete(k); for (const c of cs) wire.push([pid, c]); }
      if (conns.size) broadcast({ t: 'f', k, c: wire.length ? wire : undefined });
    } else {
      wire = L.frames.get(k); L.frames.delete(k);
      for (const w of wire) if (w[1][0] === 'drop') L.takeovers.push({ k, pid: w[0] });
    }
    const frame = [];
    for (const w of wire) { const hi = L.heroIdx.get(w[0]); if (hi !== undefined) frame.push([hi, w[1]]); }
    L.cmdsApplied += frame.length;
    L.flog[k] = frame.length ? frame : 0;          // 받은(만든) 틱별 명령 기록 — 어긋났을 때 처음부터 다시 돌려 맞춘다
    for (const w of wire) if (w[0] === L.myPid && w[1][0] !== 'am' && w[1][0] !== 'drop' && L.pressT.length) { const d = now() - L.pressT.shift(); L.lat.push(Math.round(d * 10) / 10); if (L.lat.length > 5000) L.lat.shift(); }
    fn(frame);
    L.k = k + 1; L.ticksRun++;
    if (L.k % HASH_EVERY === 0) {
      const G = TW.App.G, h = stateHash(G);
      L.hashes.set(L.k, h); L.hashLog.push([L.k, h, G.rngN || 0]); if (L.hashLog.length > 3000) L.hashLog.shift();
      if (L.host) broadcast({ t: 'h', k: L.k, h }); else if (hostConn) send(hostConn, { t: 'h', k: L.k, h });
      checkHash(L.k);
      if (L.hashes.size > 120) { const old = L.k - 120 * HASH_EVERY; for (const kk of L.hashes.keys()) if (kk < old) L.hashes.delete(kk); }
    }
    if (!L.host) seal();
  };
  /* 친구: 내 입력을 틱 번호에 묶어 방장에게 보낸다 (지금 틱 + 입력 지연까지, 빠짐없이) */
  function seal() {
    if (!L || L.host || !hostConn) return;
    const target = L.k + L.D - 1;
    while (L.sealed < target) {
      L.sealed++;
      const c = L.pending; L.pending = [];
      send(hostConn, c.length ? { t: 'i', k: L.sealed, c } : { t: 'i', k: L.sealed });
    }
  }
  function gotHash(pid, k, h) {
    if (!L) return;
    let r = L.remote.get(k); if (!r) L.remote.set(k, r = new Map());
    r.set(pid, h);
    checkHash(k);
  }
  function checkHash(k) {
    const mine = L.hashes.get(k), r = L.remote.get(k); if (mine === undefined || !r) return;
    L.remote.delete(k);
    for (const [pid, h] of r) {
      L.checks++;
      if (h === mine) {
        L.matches++;
        if (L.desync && L.desync.pid === pid && k > L.desync.k) {         // 다시 같아졌다
          const d = L.desync; d.okK = k; L.desync = null; say('resynced (seen) k=' + k);
          if (!d.fixedHere) TW.UI.toast('친구 화면과 다시 맞았어요 (틱 ' + d.k + ' → ' + k + ')', '#8dffb4');
        }
        continue;
      }
      if (L.desync) continue;
      const d = { k, mine, theirs: h, pid, at: Math.round(now()) };
      L.desync = d; L.dsLog.push(d);
      say('DESYNC k=' + k + ' mine=' + mine + ' theirs=' + h + ' pid=' + pid);
      // 친구 화면: 방장 화면이 기준이다 → 받은 명령으로 처음부터 다시 돌려 맞춰 본다
      if (!L.host && pid === 0 && resync(k, h)) { d.fixedHere = true; d.fixMs = Math.round(now() - d.at); L.desync = null; d.okK = k; continue; }
      TW.UI.announce('두 화면이 어긋났어요', '#ff8a8a', '틱 ' + k + '에서 게임 상태가 서로 다릅니다' + (L.host ? ' — 친구 화면이 다시 맞추는 중…' : ' — 다시 맞추지 못했어요. 이 판의 결과는 두 화면에서 다를 수 있어요'), 5);
    }
  }
  /* 맞추기: 처음부터 받은 명령 그대로 다시 돌려(그림 없이) 틱 kBad 의 지문이 방장 것과 같으면 그 경기로 갈아탄다 */
  function resync(kBad, want) {
    const App = TW.App; if (!App.replayNetGame || L.k > 60 * 60 * 30) return false;
    const t0 = now(); let got = null; const hs = new Map();
    const r = App.replayNetGame(L.cfg, L.myPid, L.flog, L.k, (G, k) => { if (k % HASH_EVERY === 0) { const h = stateHash(G); hs.set(k, h); if (k === kBad) got = h; } });
    const ok = got === want;
    say('resync replay ' + L.k + ' ticks in ' + Math.round(now() - t0) + 'ms → ' + (ok ? 'OK' : 'FAIL got=' + got + ' want=' + want));
    if (!ok) { App.keepNetGame(r); return false; }
    App.adoptNetGame(r);
    for (const [k, h] of hs) if (L.hashes.has(k)) L.hashes.set(k, h);        // 앞으로 견줄 값만 고친다 (hashLog 는 그때 본 그대로 둔다)
    L.hashLog.push([L.k, -1, r.G.rngN, 'resync']);
    TW.UI.toast('화면이 어긋나서 방장 화면에 다시 맞췄어요 (' + Math.round(now() - t0) + 'ms)', '#8dffb4');
    return true;
  }
  /* 방장이 나갔다: 이미 받은 틱까지 같이 돌고, 그다음 틱부터 다른 사람 자리를 모두 봇이 이어받아 혼자 이어 간다 */
  function orphan() {
    if (!L || L.orphan) return;
    const at = Math.max(L.k, L.maxFrame + 1);
    L.orphan = { at, drops: L.cfg.humans.filter(q => q.pid !== L.myPid).map(q => ({ pid: q.pid, name: q.pid === 0 ? '방장' : q.name })) };
    say('orphan at ' + at);
  }
  function becomeSolo() {
    const o = L.orphan; L.orphan = null;
    L.host = true; L.active = new Set(); L.dropNow = o.drops; L.inbox = new Map();
    TW.UI.toast('방장과 연결이 끊겨 혼자 이어 갑니다 — 나간 자리는 봇이 맡아요', '#cfe6ff');
  }
  /* 탭이 가려져 화면이 멈춰도(requestAnimationFrame 이 안 돈다) 받은 틱은 계속 돌린다 → 나 때문에 친구가 멈추지 않는다 */
  let lastPump = 0;
  function pumpIfHidden() {
    if (typeof document === 'undefined' || !document.hidden || !L) return;
    const App = TW.App, t = now();
    if (App.state === 'loading') App.beginPlay();
    const dt = lastPump ? Math.min(0.25, (t - lastPump) / 1000) : C.DT; lastPump = t;
    App.netSim(dt);
  }
  const hiddenIv = setInterval(() => { if (typeof document !== 'undefined' && document.hidden) pumpIfHidden(); }, 50);
  if (hiddenIv && hiddenIv.unref) hiddenIv.unref();          // node 시험 도구에서 이 타이머 때문에 끝나지 않는 일이 없게

  /* 시험 도구가 읽는 숫자 */
  N.stats = function () {
    const G = TW.App.G;
    return {
      live: N.live, host: N.host, pid: N.pid, code: N.code, players: N.players.length, k: L ? L.k : -1, t: G ? +G.t.toFixed(2) : -1,
      D: L ? L.D : 0, rtt: N.rtt, stalls: L ? L.stalls : 0, stallT: L ? +L.stallT.toFixed(2) : 0, checks: L ? L.checks : 0, matches: L ? L.matches : 0,
      desync: L ? L.desync : null, cmdsSent: L ? L.cmdsSent : 0, cmdsApplied: L ? L.cmdsApplied : 0, takeovers: L ? L.takeovers : [], route: N.route || (conns.size ? Array.from(conns.values()).map(c => c.route) : null),
      over: G ? G.over : false, rngN: G ? G.rngN : 0, behind: N.behind(), orphan: !!(L && L.orphan), dsLog: L ? L.dsLog : [],
    };
  };
  N.hashLog = (from) => (L ? L.hashLog.filter(e => e[0] >= (from || 0)) : []);
  N.rtts = (from) => N.rttLog.slice(from || 0);
  N.lat = () => (L ? L.lat.slice() : []);          // 누른 순간 → 내 명령이 게임 틱에 들어간 순간 (ms)

  /* ----- 경기 화면 구석: 작은 지연 숫자 · 연결 알림 ----- */
  N.hud = function (ctx) {
    if (!L) return;
    const UI = TW.UI, X = TW.X;
    const r = N.rtt, txt = conns.size || hostConn ? (r >= 0 ? '지연 ' + Math.round(r) + 'ms' : '지연 재는 중') : '혼자 (봇과)';
    X.text(ctx, txt + (L.host ? '' : ' · 입력 ' + L.D + '틱'), 14, UI.H - 12, 11.5, r > 150 ? '#ffb0a0' : 'rgba(220,226,255,0.72)', 'left', 700, 'rgba(4,6,18,0.85)', 3);
    if (L.waitStart && now() - L.waitStart > 700) {
      const s = L.host ? '친구의 입력을 기다리는 중…' : '방장의 화면을 기다리는 중…';
      X.text(ctx, s, UI.W / 2, UI.H / 2 - 120, 18, '#ffe2a6', 'center', 900, 'rgba(4,6,18,0.9)', 5);
    }
    if (L.desync) X.text(ctx, '⚠ 두 화면이 어긋남 (틱 ' + L.desync.k + ')', 14, UI.H - 30, 11.5, '#ff9a9a', 'left', 800, 'rgba(4,6,18,0.85)', 3);
  };

  /* =====================================================================
     대기실 (HTML 겹창: 글자 칸·복사가 쉬워서)
     ===================================================================== */
  const CSS = '#netui{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:20;background:rgba(5,7,20,0.62);font-family:inherit;color:#eef0ff}' +
    '#netui .box{width:560px;max-width:94vw;background:rgba(12,14,36,0.97);border:1px solid rgba(255,217,138,0.45);border-radius:18px;padding:22px 26px;box-shadow:0 20px 60px rgba(0,0,0,0.6)}' +
    '#netui h2{margin:0 0 4px;font-size:24px;color:#ffd98a;letter-spacing:.04em}#netui .sub{color:#9aa0c4;font-size:13px;margin-bottom:16px}' +
    '#netui button{font:inherit;font-weight:800;font-size:15px;color:#0b0d22;background:#ffd98a;border:0;border-radius:14px;padding:10px 18px;cursor:pointer}' +
    '#netui button.ghost{background:rgba(40,44,90,0.9);color:#eef0ff;border:1px solid rgba(200,206,255,0.3)}#netui button:disabled{opacity:.45;cursor:default}' +
    '#netui input{font:inherit;font-size:22px;font-weight:900;letter-spacing:.25em;text-transform:uppercase;width:150px;padding:8px 12px;border-radius:12px;border:1px solid rgba(200,206,255,0.4);background:#0b0d22;color:#fff}' +
    '#netui select{font:inherit;font-size:14px;padding:5px 8px;border-radius:10px;background:#0b0d22;color:#eef0ff;border:1px solid rgba(200,206,255,0.35)}' +
    '#netui .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}#netui .code{font-size:44px;font-weight:900;letter-spacing:.22em;color:#fff;margin:4px 0}' +
    '#netui .pl{display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(30,34,72,0.7);margin:6px 0;font-size:14px}' +
    '#netui .pl .nm{min-width:74px;font-weight:800}#netui .pl .ms{margin-left:auto;color:#9aa0c4;font-size:12px}' +
    '#netui .tm{padding:5px 10px;border-radius:10px;font-weight:800;font-size:13px;border:1px solid rgba(200,206,255,0.3);background:#0b0d22;color:#cfd6ee;cursor:pointer}' +
    '#netui .tm.on0{background:#ffb84a;color:#0b0d22}#netui .tm.on1{background:#b57bff;color:#0b0d22}#netui .tm.lock{cursor:default}' +
    '#netui .st{min-height:20px;font-size:14px;color:#cfe6ff;margin-top:12px}#netui .er{color:#ffb0b8;font-weight:800}#netui .ers{color:#e8b8c0;font-size:12.5px;margin-top:4px;line-height:1.5}' +
    '#netui .note{color:#9aa0c4;font-size:12px;margin-top:14px;line-height:1.5}';
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') { for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]); } else e.setAttribute(k, attrs[k]); }
    for (const c of kids || []) e.appendChild(c);
    return e;
  }
  function buildUI() {
    if (ui || typeof document === 'undefined' || !document.body) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = el('div', { id: 'netui' }); const box = el('div', { class: 'box' }); root.appendChild(box);
    // 막는다: 겹창 위의 누름이 뒤의 게임 화면으로 새지 않게
    for (const ev of ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) root.addEventListener(ev, (e) => e.stopPropagation());
    document.body.appendChild(root);
    ui = { root, box };
  }
  function setStatus(s) { N.status = s; N.err = ''; N.errSub = ''; if (ui) render(); }
  function setErr(s, sub) { N.err = s; N.errSub = sub || ''; say('ERR ' + s); if (ui) render(); }
  function renderRtt() { const e = document.getElementById('nl-rtt'); if (e) e.textContent = N.rtt >= 0 ? '지연 ' + Math.round(N.rtt) + 'ms' : ''; for (const p of N.players) { const m = document.getElementById('nl-ms-' + p.pid); if (m) m.textContent = p.pid === N.pid ? '나' : (N.host ? (p.rtt >= 0 ? p.rtt + 'ms' : '') : (p.pid === 0 && N.rtt >= 0 ? Math.round(N.rtt) + 'ms' : '')); } }
  function render() {
    if (!ui || !N.lobbyOpen) return;
    const old = document.getElementById('nl-code'), typed = old ? old.value : '';
    const box = ui.box; box.innerHTML = '';
    box.appendChild(el('h2', { text: '친구 방' }));
    const inRoom = N.pid >= 0 && N.code;
    if (!inRoom) {
      box.appendChild(el('div', { class: 'sub', text: '방을 만들어 코드를 친구에게 알려 주거나, 친구에게 받은 코드를 넣으세요. 1대1(같은 편·상대 편)부터 2대2까지, 빈자리는 봇이 채웁니다.' }));
      box.appendChild(el('div', { class: 'row' }, [el('button', { id: 'nl-create', text: '방 만들기', on: { click: () => { createRoom(); } } })]));
      const inp = el('input', { id: 'nl-code', maxlength: '5', placeholder: 'ABCDE', autocomplete: 'off', spellcheck: 'false' }); inp.value = typed;
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') joinRoom(inp.value); });
      inp.addEventListener('keyup', (e) => e.stopPropagation());
      box.appendChild(el('div', { class: 'row' }, [inp, el('button', { id: 'nl-join', text: '코드로 들어가기', on: { click: () => joinRoom(inp.value) } })]));
    } else {
      box.appendChild(el('div', { class: 'sub', text: N.host ? '친구에게 이 코드를 알려 주세요' : '들어온 방' }));
      box.appendChild(el('div', { class: 'row' }, [el('div', { class: 'code', id: 'nl-roomcode', text: N.code }),
        el('button', { class: 'ghost', id: 'nl-copy', text: '코드 복사', on: { click: () => { try { navigator.clipboard.writeText(N.code); setStatus('코드를 복사했어요'); } catch (e) { setStatus('복사가 안 되면 코드를 직접 적어 주세요'); } } } }),
        el('span', { id: 'nl-rtt', style: 'color:#9aa0c4;font-size:13px;margin-left:auto' })]));
      const list = el('div', { id: 'nl-players' });
      for (const p of N.players) {
        const mine = p.pid === N.pid;
        const row = el('div', { class: 'pl' });
        row.appendChild(el('span', { class: 'nm', text: p.name + (p.pid === 0 ? ' ★' : '') }));
        if (mine) {
          const sh = el('select', { id: 'nl-hero' }); for (const id of TW.MenuOrder || TW.HeroOrder) { const o = el('option', { value: id, text: TW.Heroes[id].name }); if (id === p.hero) o.selected = true; sh.appendChild(o); }
          const sp = el('select', { id: 'nl-pos' }); for (const q of TW.POS) { const o = el('option', { value: q, text: TW.POS_NAME[q] }); if (q === p.pos) o.selected = true; sp.appendChild(o); }
          sh.addEventListener('change', () => { p.hero = sh.value; p.pos = TW.bestPos(sh.value); TW.UI.sel.hero = p.hero; TW.UI.sel.pos = p.pos; pushPick(p); });
          sp.addEventListener('change', () => { p.pos = sp.value; TW.UI.sel.pos = p.pos; pushPick(p); });
          row.appendChild(sh); row.appendChild(sp);
        } else row.appendChild(el('span', { text: (TW.Heroes[p.hero] ? TW.Heroes[p.hero].name : '?') + ' · ' + (TW.POS_NAME[p.pos] || '') }));
        for (let tm = 0; tm < 2; tm++) {
          const on = p.team === tm, b = el('span', { class: 'tm' + (on ? ' on' + tm : '') + (mine ? '' : ' lock'), id: mine ? 'nl-team' + tm : '', text: C.TEAM_NAMES[tm] });
          if (mine && !on) b.addEventListener('click', () => { if (teamCount(tm, p.pid) >= PER_TEAM) { setErr(C.TEAM_NAMES[tm] + ' 편에는 이미 사람이 둘이에요'); return; } p.team = tm; pushPick(p); });
          row.appendChild(b);
        }
        row.appendChild(el('span', { class: 'ms', id: 'nl-ms-' + p.pid }));
        list.appendChild(row);
      }
      box.appendChild(list);
      const n0 = teamCount(0), n1 = teamCount(1);
      box.appendChild(el('div', { class: 'sub', style: 'margin:8px 0 0', text: '새벽 ' + n0 + '명 · 황혼 ' + n1 + '명 — ' + (N.players.length < 2 ? '친구를 기다리는 중…' : (n0 && n1 ? '서로 다른 편 (' + n0 + '대' + n1 + ')' : '같은 편으로 봇과 겨루기')) + ' · 빈자리 ' + (10 - N.players.length) + '곳은 봇' }));
      if (N.host) {
        const sd = el('select', { id: 'nl-diff' }); for (const d of ['easy', 'normal', 'hard']) { const o = el('option', { value: d, text: '봇 수준: ' + TW.Difficulty[d].name }); if (d === N.diff) o.selected = true; sd.appendChild(o); }
        sd.addEventListener('change', () => { N.diff = sd.value; lobbySync(); });
        const go = el('button', { id: 'nl-start', text: '시작', on: { click: hostStart } }); if (N.players.length < 2) go.disabled = true;
        box.appendChild(el('div', { class: 'row' }, [go, sd]));
      }
    }
    box.appendChild(el('div', { class: 'row' }, [el('button', { class: 'ghost', id: 'nl-back', text: inRoom ? '방 나가기' : '돌아가기', on: { click: () => { if (inRoom) { N.leave(); openLobby(); } else closeLobby(); } } })]));
    if (N.err) { box.appendChild(el('div', { class: 'st er', id: 'nl-status', text: N.err })); if (N.errSub) box.appendChild(el('div', { class: 'ers', text: N.errSub })); }
    else box.appendChild(el('div', { class: 'st', id: 'nl-status', text: N.status }));
    box.appendChild(el('div', { class: 'note', text: '연결은 두 브라우저끼리 직접 합니다(친구를 찾을 때만 PeerJS 공용 서버를 씁니다). 게임 화면이 아니라 누른 입력만 오갑니다. 친구 방에서는 멈춤(Esc)을 해도 경기가 멈추지 않아요.' }));
    renderRtt();
  }
  function pushPick(p) {
    if (N.host) { lobbySync(); render(); }
    else { send(hostConn, { t: 'pk', hero: p.hero, pos: p.pos, team: p.team }); render(); }
  }
  function openLobby() {
    buildUI(); if (!ui) return;
    N.lobbyOpen = true; ui.root.style.display = 'flex';
    if (!N.code) { N.err = ''; N.status = ''; }
    render();
  }
  function closeLobby() { N.lobbyOpen = false; if (ui) ui.root.style.display = 'none'; }
  /* 경기가 끝나고 '다시 하기': 같은 방의 대기실로 (연결은 그대로) */
  function backToLobbyUI() {
    N.live = false; L = null;
    if (TW.App.state !== 'menu' && TW.App.toMenuSilently) TW.App.toMenuSilently();
    openLobby(); setStatus(N.host ? '다시 시작할 수 있어요' : '방장이 다시 시작하기를 기다리는 중…');
  }
  N.toLobby = function () {
    if (L && !L.host && hostConn) send(hostConn, { t: 'quit' });          // 경기에서 빠진다 → 방장 화면에서는 내 자리를 봇이 잇는다
    N.live = false; L = null;
    if (N.host) { broadcast({ t: 'lobby' }); N.players = N.players.filter(p => p.pid === 0 || conns.has(p.pid)); lobbySync(); }
    if (!N.code) { openLobby(); return; }
    openLobby(); setStatus(N.host ? '다시 시작할 수 있어요' : '방장이 다시 시작하기를 기다리는 중…');
  };
  N.openLobby = openLobby; N.closeLobby = closeLobby;
  N.create = createRoom; N.join = joinRoom; N.start = hostStart;      // 시험 도구용
})();
