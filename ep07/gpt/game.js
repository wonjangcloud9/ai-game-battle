/* Riftwake — the battlefield clock, economy and opposing commander. */
(() => {
  'use strict';

  const FACTIONS = ['velari', 'cinder', 'myren'];
  const NAMES = {
    velari: { hq: '자수정 첨성', barracks: '파편 공방', house: '결빛 둥지', tower: '공명 첨탑', depot: '결빛 계량소', worker: '채광령', soldier: '결창수', heavy: '프리즘 거신', specialist: '결맥 추적자' },
    cinder: { hq: '잿불 용광성', barracks: '홍로 병기창', house: '화맥 굴', tower: '석탄 봉화', depot: '잿불 하역장', worker: '불씨꾼', soldier: '잿날병', heavy: '적철 파쇄기', specialist: '노을풀무차' },
    myren: { hq: '푸른숨 모수', barracks: '포자 배양소', house: '이슬 봉오리', tower: '가시 수관', depot: '이슬 갈무리집', worker: '이슬지기', soldier: '갈잎 사수', heavy: '수피 거목', specialist: '꽃실 엮음이' }
  };
  const RULES = {
    hq:       { hp: 650, size: [43, 19], range: 90, power: 7, cooldown: 1.45, cap: 12 },
    barracks: { hp: 320, size: [30, 16], cost: [95, 35], seconds: 13 },
    depot:    { hp: 220, size: [21, 12], cost: [80, 20], seconds: 10 },
    house:    { hp: 180, size: [22, 13], cost: [60, 10], seconds: 9, cap: 6 },
    tower:    { hp: 260, size: [19, 11], cost: [105, 48], seconds: 16, range: 112, power: 16, cooldown: 1.35 },
    worker:   { hp: 42, size: [5, 4], cost: [38, 0], seconds: 6, pop: 1, speed: 34, range: 9, power: 4, cooldown: 1.15 },
    soldier:  { hp: 93, size: [7, 4], cost: [55, 12], seconds: 8, pop: 1, speed: 38, range: 46, power: 12, cooldown: 1.12 },
    heavy:    { hp: 182, size: [10, 6], cost: [106, 46], seconds: 14, pop: 2, speed: 28, range: 38, power: 22, cooldown: 1.55 },
    crystal:  { hp: 3400, size: [18, 11] },
    ore:      { hp: 2400, size: [17, 9] }
  };
  const SPECIALISTS = {
    velari: { hp: 72, size: [7, 4], cost: [82, 29], seconds: 10, pop: 1, speed: 48, range: 67, power: 6, cooldown: 1.4 },
    cinder: { hp: 148, size: [11, 7], cost: [98, 39], seconds: 13.5, pop: 3, speed: 25, range: 34, power: 18, cooldown: 1.8 },
    myren:  { hp: 78, size: [7, 5], cost: [76, 34], seconds: 12, pop: 2, speed: 35, range: 54, power: 6, cooldown: 1.35 }
  };
  const rulesFor = (type, faction) => type === 'specialist' ? SPECIALISTS[faction] : RULES[type];
  const BUILDINGS = ['hq', 'barracks', 'house', 'tower', 'depot'];
  const BUILDABLE = ['barracks', 'house', 'tower', 'depot'];
  const UNITS = ['worker', 'soldier', 'heavy', 'specialist'];
  const SIEGE_DAMAGE = {soldier:0.8, heavy:1.5, specialist:0.7};
  const ASH = {range:145, flight:1.45, reload:16, power:27, buildingPower:16};
  const DEW = {range:102, capacity:32, duration:5, reload:18};
  const VOLLEY_WAIT = 8;
  const volleyDuty = e => ['idle','hold','attackmove','attack','guard','escort'].includes(e.action);
  const isUnit = e => UNITS.includes(e.type);
  const isBuilding = e => BUILDINGS.includes(e.type);
  const isResource = e => e.type === 'crystal' || e.type === 'ore';
  const dropoff = e => e && (e.type === 'hq' || e.type === 'depot') && e.progress === 1 && e.hp > 0;
  const military = e => e.type === 'soldier' || e.type === 'heavy' || e.type === 'specialist';
  const guardable = e => e && isBuilding(e) && e.hp > 0 && e.progress === 1;
  const AI = {
    easy:   { workers: 6, defence: 1, towerTime: 220, interval: 100, queue: 1, intercept: 0,   scoutTime: 98 },
    normal: { workers: 7, defence: 1, towerTime: 110, interval: 80,  queue: 2, intercept: 180, scoutTime: 84 },
    hard:   { workers: 9, defence: 2, towerTime: 30,  interval: 60,  queue: 3, intercept: 225, scoutTime: 62 }
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (items, point) => items.reduce((best, item) => !best || distance(item, point) < distance(best, point) ? item : best, null);
  const bounded = (v, low, high) => Math.max(low, Math.min(high, v));

  // Navigation uses the same island silhouettes and bridges the player sees.
  const CELL = 8;
  const COLS = 160;
  const ROWS = 80;
  const GRID_SIZE = COLS * ROWS;
  const TX = id => (id % COLS) * CELL + CELL / 2;
  const TY = id => Math.floor(id / COLS) * CELL + CELL / 2;

  class Navigation {
    constructor(terrain, land) {
      this.ground = terrain.ground;
      this.land = land || new Uint8Array(GRID_SIZE);
      this.open = new Uint8Array(GRID_SIZE);
      this.region = new Uint16Array(GRID_SIZE);
      this.seen = new Uint32Array(GRID_SIZE);
      this.done = new Uint32Array(GRID_SIZE);
      this.best = new Float32Array(GRID_SIZE);
      this.previous = new Int32Array(GRID_SIZE);
      this.epoch = 0;
      this.revision = 0;
      if (!land) {
        const ground = this.ground;
        for (let i = 0; i < GRID_SIZE; i++) {
          const x = TX(i), y = TY(i);
          this.land[i] = ground(x,y) && ground(x-2,y) && ground(x+2,y) && ground(x,y-2) && ground(x,y+2) ? 1 : 0;
        }
      }
      this.open.set(this.land);
    }

    rebuild(entities) {
      this.open.set(this.land);
      this.revision++;
      for (const e of entities) {
        if (!isBuilding(e) || e.hp <= 0) continue;
        const [rx, ry] = RULES[e.type].size;
        for (let gy = Math.max(0, Math.floor((e.y - ry - 3) / CELL)); gy <= Math.min(ROWS - 1, Math.ceil((e.y + ry + 3) / CELL)); gy++) {
          for (let gx = Math.max(0, Math.floor((e.x - rx - 3) / CELL)); gx <= Math.min(COLS - 1, Math.ceil((e.x + rx + 3) / CELL)); gx++) {
            const i = gy * COLS + gx;
            if (((TX(i) - e.x) / (rx + 3)) ** 2 + ((TY(i) - e.y) / (ry + 3)) ** 2 < 1) this.open[i] = 0;
          }
        }
      }
      // Diagonal movement requires both adjacent cardinal cells to be open.
      // Four-connected components therefore exactly describe legal destinations.
      this.region.fill(0);
      const pending = new Uint16Array(GRID_SIZE);
      let region = 0;
      for (let cell = 0; cell < GRID_SIZE; cell++) {
        if (!this.open[cell] || this.region[cell]) continue;
        let head = 0, tail = 0;
        const visit = id => {
          if (this.open[id] && !this.region[id]) {
            this.region[id] = region;
            pending[tail++] = id;
          }
        };
        region++;
        visit(cell);
        while (head < tail) {
          const at = pending[head++];
          if (at % COLS) visit(at - 1);
          if (at % COLS < COLS - 1) visit(at + 1);
          if (at >= COLS) visit(at - COLS);
          if (at + COLS < GRID_SIZE) visit(at + COLS);
        }
      }
    }

    pass(x, y) {
      if (x < 0 || y < 0 || x >= CELL * COLS || y >= CELL * ROWS) return false;
      return this.open[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)] === 1 && this.ground(x, y);
    }

    component(point) { return this.region[this.cell(point.x,point.y)] || 0; }

    clearLine(from, to) {
      const steps = Math.ceil(distance(from,to) / (CELL / 2));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (!this.pass(from.x + (to.x-from.x)*t, from.y + (to.y-from.y)*t)) return false;
      }
      return true;
    }

    cell(x, y) {
      const gx = bounded(Math.floor(x / CELL), 0, COLS - 1);
      const gy = bounded(Math.floor(y / CELL), 0, ROWS - 1);
      for (let r = 0; r <= 15; r++) {
        let best = -1, bestDist = Infinity;
        for (let j = -r; j <= r; j++) {
          for (let i = -r; i <= r; i++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r || gx + i < 0 || gx + i >= COLS || gy + j < 0 || gy + j >= ROWS) continue;
            const id = (gy + j) * COLS + gx + i;
            if (!this.open[id]) continue;
            const d = (TX(id) - x) ** 2 + (TY(id) - y) ** 2;
            if (d < bestDist) { best = id; bestDist = d; }
          }
        }
        if (best !== -1) return best;
      }
      return -1;
    }

    formation(units, x, y) {
      const slots = new Map();
      if (!units.length) return slots;
      const center = this.cell(x, y), region = this.region[center];
      const meanX = units.reduce((sum,e) => sum + e.x, 0) / units.length;
      const meanY = units.reduce((sum,e) => sum + e.y, 0) / units.length;
      const width = Math.ceil(Math.sqrt(units.length));
      const candidates = [];
      // Offset alternate even ranks by half a slot to centre small formations.
      const half = width % 2 ? 0 : 0.5;
      const span = Math.max(3, width * 2);
      for (let row = -span; row <= span; row++) {
        for (let col = -span; col <= span; col++) {
          const dx = (col + half) * 16, dy = row * 13;
          const px = x + dx, py = y + dy;
          if (!this.pass(px, py)) continue;
          const cell = Math.floor(py / CELL) * COLS + Math.floor(px / CELL);
          if (this.region[cell] === region) candidates.push({x:px, y:py, rank:dx*dx + dy*dy*1.44});
        }
      }
      candidates.sort((a,b) => a.rank - b.rank);
      candidates.length = Math.min(units.length, candidates.length);
      for (const unit of units) {
        const position = {x:x+unit.x-meanX, y:y+unit.y-meanY};
        const spot = nearest(candidates, position);
        if (!spot) continue;
        slots.set(unit.id, spot);
        candidates.splice(candidates.indexOf(spot), 1);
      }
      return slots;
    }

    // A* on eight neighbours. Reuse the search arrays between unit orders.
    route(from, dest) {
      const start = this.cell(from.x, from.y);
      const end = this.cell(dest.x, dest.y);
      if (start < 0 || end < 0 || this.region[start] !== this.region[end]) return [];
      const exact = this.pass(dest.x, dest.y);
      const finish = exact ? { x: dest.x, y: dest.y } : { x: TX(end), y: TY(end) };
      if (start === end) return [finish];
      const stamp = ++this.epoch;
      const heap = [];
      const push = (id, f) => {
        let i = heap.length;
        const entry = { id, f };
        heap.push(entry);
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p].f <= f) break;
          heap[i] = heap[p];
          i = p;
        }
        heap[i] = entry;
      };
      const pop = () => {
        const root = heap[0].id;
        const last = heap.pop();
        if (!heap.length) return root;
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let j = i * 2 + 1;
          if (j + 1 < heap.length && heap[j + 1].f < heap[j].f) j++;
          if (heap[j].f >= last.f) break;
          heap[i] = heap[j];
          i = j;
        }
        heap[i] = last;
        return root;
      };
      const ex = end % COLS, ey = Math.floor(end / COLS);
      this.seen[start] = stamp;
      this.best[start] = 0;
      this.previous[start] = -1;
      push(start, 0);
      while (heap.length) {
        const id = pop();
        if (this.done[id] === stamp) continue;
        if (id === end) {
          const path = [];
          let at = end, previousDirection = 0;
          while (at !== start) {
            const before = this.previous[at], direction = at - before;
            if (direction !== previousDirection && previousDirection) path.push({ x: TX(at), y: TY(at) });
            previousDirection = direction;
            at = before;
          }
          path.reverse();
          path.push(finish);
          return path;
        }
        this.done[id] = stamp;
        const x = id % COLS, y = Math.floor(id / COLS);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < 0 || x + dx >= COLS || y + dy < 0 || y + dy >= ROWS) continue;
            const next = id + dy * COLS + dx;
            if (!this.open[next] || this.done[next] === stamp) continue;
            if (dx && dy && (!this.open[id + dx] || !this.open[id + dy * COLS])) continue;
            const cost = this.best[id] + (dx && dy ? 1.4142 : 1);
            if (this.seen[next] === stamp && cost >= this.best[next] - 0.00005) continue;
            this.seen[next] = stamp;
            this.best[next] = cost;
            this.previous[next] = id;
            const ax = Math.abs(ex - x - dx), ay = Math.abs(ey - y - dy);
            push(next, cost + Math.max(ax, ay) + 0.4142 * Math.min(ax, ay));
          }
        }
      }
      return [];
    }
  }

  class Game {
    constructor(faction = 'velari', difficulty = 'normal', enemyFaction, mapId = 'shoals') {
      this.terrain = window.Terrain.setMap(mapId);
      this.mapId = this.terrain.id;
      this.beaconName = window.Terrain.maps[this.mapId].beaconName;
      this.faction = FACTIONS.includes(faction) ? faction : 'velari';
      this.enemyFaction = FACTIONS.includes(enemyFaction) && enemyFaction !== this.faction
        ? enemyFaction : FACTIONS[(FACTIONS.indexOf(this.faction) + 1) % FACTIONS.length];
      this.difficulty = ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
      this.entities = [];
      this.byId = new Map();
      this.nextId = 1;
      this.time = 0;
      this.result = null;
      this.events = [];
      this.effects = [];
      this.ashBlooms = [];
      this.volleyWatches = new Set();
      this.feedback = '';
      this.selected = [];
      this.report = {};
      this.dropoffVersion = 0;
      this.vacatedSites = new Set();
      for (const side of [this.faction, this.enemyFaction]) {
        this.report[side] = { trained: 0, kills: 0, guardKills: 0, harvestedCrystal: 0, harvestedOre: 0, buildings: 0, captures: 0, repairedHp: 0, repairedHQ: 0, depotCrystal: 0, depotOre: 0, specialImpact: 0, rescued: 0, volleyHits: 0, volleyBonus: 0, volleysPrimed: 0, volleysReleased: 0, ashShots: 0, ashHits: 0, ashDamage: 0, dewCasts: 0, dewBlocked: 0, dewHealed: 0 };
      }
      this.beacon = {
        ...this.terrain.beacon, owner: null, claimant: null, progress: 0, contested: false,
        captureSeconds: 7, incomePeriod: 12, incomeClock: 0, crystalIncome: 18, oreIncome: 8
      };
      this.bell = this.mapId === 'kiln' && window.KilnBell ? new window.KilnBell(this) : null;
      this.bank = {
        [this.faction]: { crystal: 245, ore: 110 },
        [this.enemyFaction]: {
          crystal: this.difficulty === 'hard' ? 245 : 148,
          ore: this.difficulty === 'hard' ? 110 : 60
        }
      };
      this.nav = new Navigation(this.terrain);
      this.aiClock = { easy: 10, normal: 6, hard: 2 }[this.difficulty];
      this.nextScout = AI[this.difficulty].scoutTime;
      this.nextRaid = { easy: 152, normal: 110, hard: 75 }[this.difficulty];
      this.raidNumber = 0;
      this.separationClock = 0;
      this.lastAlarm = -50;
      this._seed();
      this.doctrine = window.Doctrines ? new window.Doctrines(this) : null;
      this.tactics = window.FieldTactics ? new window.FieldTactics(this) : null;
      this.salvage = window.DriftSalvage ? new window.DriftSalvage(this) : null;
    }

    name(type, faction = this.faction) {
      return NAMES[faction]?.[type] || ({ crystal: '빛결정', ore: '불씨광' })[type] || type;
    }

    population(type, faction = this.faction) { return rulesFor(type, faction)?.pop || 0; }
    unitStats(type, faction = this.faction) {
      if (!UNITS.includes(type) || !FACTIONS.includes(faction)) return null;
      const r = rulesFor(type, faction), weapon = this._combatStats({type, faction});
      return {
        hp: type === 'heavy' && faction === 'cinder' ? Math.round(r.hp * 1.14) : r.hp,
        speed: r.speed, ...weapon, seconds: this._trainingTime(type, faction), pop: r.pop,
        ...this.cost(type, faction)
      };
    }
    count(type, faction = this.faction) {
      return this.entities.filter(e => e.type === type && e.faction === faction && e.hp > 0).length;
    }
    cost(type, faction = this.faction) {
      const [c, o] = rulesFor(type, faction)?.cost || [0, 0];
      const workerBonus = type === 'worker' && faction === 'myren';
      return { crystal: workerBonus ? Math.round(c * 0.75) : c, ore: o };
    }
    stats(faction = this.faction) {
      let pop = 0, queued = 0, cap = 0;
      for (const e of this.entities) {
        if (e.faction !== faction || e.hp <= 0) continue;
        pop += this.population(e.type, faction);
        if (e.progress === 1) cap += (rulesFor(e.type, faction).cap || 0) + (e.type === 'house' && faction === 'myren' ? 3 : 0);
        for (const q of e.queue || []) queued += this.population(q.type, faction);
      }
      return { ...this.bank[faction], pop: pop + queued, units: pop, queued, cap };
    }

    _spawn(type, faction, x, y) {
      const r = rulesFor(type, faction);
      const entity = {
        id: this.nextId++, type, faction, x, y, hp: r.hp, maxHp: r.hp, progress: 1,
        facing: faction === this.enemyFaction ? -1 : 1, phase: (this.nextId * 1.618) % 6.28,
        moving: false, action: 'idle', targetId: null, lastHurt: -100,
        attackClock: 0, scanClock: (this.nextId % 7) / 13,
        queue: [], path: [], pathIndex: 0, routeClock: 0, carried: 0,
        resourceType: null, depositId: null, workClock: 0,
        rally: null, destination: null, followDestination: null
      };
      if (faction === 'cinder' && type === 'heavy') {
        entity.maxHp = Math.round(entity.maxHp * 1.14);
        entity.hp = entity.maxHp;
      }
      if (faction === 'cinder' && type === 'specialist') entity.ashReadyAt = 0;
      if (faction === 'myren' && type === 'specialist') entity.dewReadyAt = 0;
      if (type === 'depot') {
        entity.receivedCrystal = 0;
        entity.receivedOre = 0;
      }
      if (type === 'barracks') {
        entity.autoTrain = null;
        entity.nextAutoAttempt = 0;
      }
      if (isUnit(entity)) {
        entity.dewWard = null;
        entity.waypoints = [];
        entity.escortId = null;
        entity.escortThreatId = null;
      }
      if (isResource(entity)) entity.amount = r.hp;
      this.entities.push(entity);
      this.byId.set(entity.id, entity);
      return entity;
    }

    _seed() {
      const p = this.faction, a = this.enemyFaction;
      const { player, enemy, expansion } = this.terrain.layout;
      const home = this._spawn('hq', p, ...player.hq);
      this._spawn('barracks', p, ...player.barracks);
      this._spawn('house', p, ...player.house);
      for (const type of ['hq', 'barracks', 'house']) this._spawn(type, a, ...enemy[type]);
      const nodes = (side,homeFaction = null) => ['crystal', 'ore'].map(type => {
        const node = this._spawn(type, 'neutral', ...side[type]);
        node.homeFaction = homeFaction;
        return node;
      });
      const playerNodes = nodes(player,p), enemyNodes = nodes(enemy,a);
      nodes(expansion);
      this.nav.rebuild(this.entities);
      const deploy = (side, faction, deposits) => {
        side.workers.forEach((point, i) => {
          const worker = this._spawn('worker', faction, ...point);
          if (i < 4) this._gather(worker, deposits[i < 2 ? 0 : 1]);
        });
        for (const point of side.soldiers) this._spawn('soldier', faction, ...point);
      };
      deploy(player, p, playerNodes);
      deploy(enemy, a, enemyNodes);
      this.selected = [home.id];
      this._event('작전 개시 · 적의 본진을 파괴하세요.', 'info', home);
    }

    _event(text, kind = 'info', location, side) {
      const event = { time: this.time, text, kind };
      if (location) {
        event.x = location.x;
        event.y = location.y;
        event.side = side || (location.faction === this.faction ? 'own' : location.faction === this.enemyFaction ? 'enemy' : 'neutral');
        if (location.approaches) event.approaches = location.approaches;
      }
      this.events.push(event);
      if (this.events.length > 80) this.events.shift();
      return event;
    }
    _say(text, success = false) {
      this.feedback = text;
      return success;
    }
    _owned(faction, predicate) {
      return this.entities.filter(e => e.faction === faction && e.hp > 0 && predicate(e));
    }
    _enemy(a, b) {
      return b && b.hp > 0 && b.faction !== a.faction && b.faction !== 'neutral';
    }
    _canPay(faction, type) {
      const price = this.cost(type, faction), bank = this.bank[faction];
      return bank.crystal >= price.crystal && bank.ore >= price.ore;
    }
    shortage(type, faction = this.faction) {
      const cost = this.cost(type, faction), bank = this.bank[faction], missing = [];
      for (const [resource, name] of [['crystal', '빛결정'], ['ore', '불씨광']]) {
        const amount = cost[resource] - bank[resource];
        if (amount > 0) missing.push(name + ' ' + amount);
      }
      return missing.length ? missing.join(' · ') + ' 부족' : '';
    }
    _pay(faction, type) {
      const price = this.cost(type, faction);
      this.bank[faction].crystal -= price.crystal;
      this.bank[faction].ore -= price.ore;
    }
    select(ids) {
      this.selected = [...new Set(ids || [])].filter(id => this.byId.get(id)?.hp > 0);
      return this.selected;
    }
    _clearPath(e) {
      e.path = [];
      e.pathIndex = 0;
      e.routeClock = 0;
      e.pathGoal = null;
      e.moving = false;
    }
    _set(e, action, target = null) {
      if (e.action === 'build' && e.faction === this.faction && (action !== 'build' || e.targetId !== target?.id)) {
        this.vacatedSites.add(e.targetId);
      }
      if (e.action === 'guard' || action === 'guard') {
        e.guardPoint = null;
        e.guardThreatId = null;
        e.guardIntercept = null;
      }
      if (e.escortId && (action !== 'escort' || target?.id !== e.escortId)) {
        this.byId.get(e.escortId)?.marchCompanions?.delete(e.id);
      }
      e.volleyTargetId = null;
      e.rescueCandidate = false;
      e.action = action;
      if (e.type === 'worker') {
        e.haulPlan = null;
        e.buildApproach = null;
        e.orderedDropoffId = action === 'return' ? target?.id : null;
      }
      e.targetId = target?.id ?? null;
      e.escortId = action === 'escort' ? e.targetId : null;
      e.escortThreatId = null;
      e.autoTarget = false;
      e.followDestination = null;
      e.workClock = 0;
      this._clearPath(e);
    }
    _gather(w, node, unloadFirst = false) {
      w.depositId = node.id;
      w.gatherType = node.type;
      if (w.carried > 0 && (unloadFirst || w.resourceType !== node.type)) {
        if (w.action !== 'return') this._set(w,'return');
      } else this._set(w,'gather',node);
    }
    _gatherPlan(type, measureRoutes) {
      const home = this.entities.find(e => e.type === 'hq' && e.faction === this.faction && e.hp > 0);
      const region = home && this.nav.component(home);
      const available = [];
      let workers = 0, node = null, bestRisk = Infinity, bestTrip = Infinity;
      for (const e of this.entities) {
        if (e.hp <= 0) continue;
        if (e.type === 'worker' && e.faction === this.faction) {
          const working = e.action === 'gather' || e.action === 'return';
          const job = working && (e.gatherType || this.byId.get(e.depositId)?.type || e.resourceType);
          if (job === type) workers++;
          else if (!e.waypoints.length && (e.action === 'idle' || job) && region && this.nav.component(e) === region) available.push(e);
        } else if (e.type === type && e.amount > 0 && region && this.nav.component(e) === region) {
          if (!measureRoutes) { node = e; continue; }
          const risk = e.homeFaction === this.faction ? 0 : e.homeFaction === this.enemyFaction ? 2 : 1;
          if (risk > bestRisk) continue;
          const route = this.nav.route(home,e);
          if (!route.length) continue;
          let previous = home, trip = 0;
          for (const point of route) { trip += distance(previous,point); previous = point; }
          if (risk < bestRisk || trip < bestTrip) { node = e; bestRisk = risk; bestTrip = trip; }
        }
      }
      if (!node || !available.length) return {workers,node,worker:null};
      if (!measureRoutes) return {workers,node,worker:available[0]};
      const idle = available.filter(w => w.action === 'idle');
      return {workers,node,worker:nearest(idle.length ? idle : available,node)};
    }
    gatherStatus(type) {
      if (type !== 'crystal' && type !== 'ore') return {workers:0,available:false};
      const plan = this._gatherPlan(type,false);
      return {workers:plan.workers,available:!!plan.worker && !this.result};
    }
    assignGather(type) {
      if (this.result) return this._say('종료된 교전입니다.');
      if (type !== 'crystal' && type !== 'ore') return this._say('채집할 자원 종류를 선택하세요.');
      const {node,worker} = this._gatherPlan(type,true);
      if (!node) return this._say('사령부에서 갈 수 있는 '+this.name(type)+' 광맥이 없습니다.');
      if (!worker) return this._say('배정할 유휴 일꾼이나 다른 자원을 채집 중인 일꾼이 없습니다.');
      const unload = worker.carried > 0;
      this._gather(worker,node,true);
      const message = unload ? '운반 중인 자원을 반납한 뒤 '+this.name(type)+' 채집을 시작합니다.' : this.name(type)+' 채집에 일꾼 한 기를 배정했습니다.';
      return this._say(message,true);
    }
    _setMove(e, dest, attack) {
      this._set(e, attack ? 'attackmove' : 'move');
      e.destination = { x: dest.x, y: dest.y };
    }
    _startWaypoint(e, point) {
      if (point.mode === 'salvage') return this.salvage?.start(e,point) || false;
      if (point.mode === 'return') {
        if (!e.carried) return false;
        const site = this.byId.get(point.targetId);
        this._set(e,'return',dropoff(site) && site.faction === e.faction ? site : null);
        return true;
      }
      if (!point.targetId) {
        this._setMove(e, point, point.mode === 'attackmove');
        return true;
      }
      const target = this.byId.get(point.targetId);
      if (!target || target.hp <= 0 || (point.mode === 'build' && target.progress === 1)) return false;
      if (point.mode === 'guard') {
        if (!guardable(target) || target.faction !== e.faction || !military(e)) return false;
        const spot = this._guardStation(e,target);
        if (!spot) return false;
        this._set(e,'guard',target);
        e.guardPoint = spot;
        e.guardRevision = this.nav.revision;
        e.scanClock = 0;
        return true;
      }
      if (point.mode === 'escort' && this._escortLeaders(target).has(e.id)) return false;
      if (point.mode === 'repair' && this.repairReason(target,e.faction)) return false;
      if (point.mode === 'gather') this._gather(e, target);
      else this._set(e, point.mode, target);
      return true;
    }
    _issueWaypoint(e, point, append) {
      this._leaveVolleyWatch(e);
      if (!append) e.waypoints.length = 0;
      // A standing guard or escort is always the last order. A later waypoint relieves it.
      else if (['escort','guard'].includes(e.waypoints.at(-1)?.mode)) e.waypoints.pop();
      if (append && !['idle','hold','escort','guard'].includes(e.action)) e.waypoints.push(point);
      else this._startWaypoint(e, point);
    }
    _finishOrder(e) {
      while (e.waypoints.length) {
        if (this._startWaypoint(e, e.waypoints.shift())) return;
      }
      this._set(e, 'idle');
    }

    repairReason(target, faction = this.faction) {
      if (!target || target.faction !== faction || !isBuilding(target) || target.hp <= 0 || target.progress !== 1)
        return '수리할 아군의 완성된 건물을 지정하세요.';
      if (target.hp >= target.maxHp) return '이미 건물 체력이 가득 찼습니다.';
      if (this.bank[faction].ore < 1) return '수리에 불씨광 1이 필요합니다.';
      return '';
    }
    assignRepair(site) {
      if (this.result) return this._say('종료된 교전입니다.');
      const target = this.byId.get(site?.id ?? site);
      const reason = this.repairReason(target);
      if (reason) return this._say(reason);
      const workers = this._owned(this.faction,e => e.type === 'worker');
      const committed = workers.filter(w => (w.action === 'repair' && w.targetId === target.id) ||
        w.waypoints.some(p => p.mode === 'repair' && p.targetId === target.id));
      if (committed.length >= 2) return this._say('이 건물에는 이미 수리 인력이 충분합니다.');
      const worker = this._repairHand(workers,target);
      if (!worker) return this._say('수리에 보낼 수 있는 유휴 또는 채집 일꾼이 없습니다.');
      this._set(worker,'repair',target);
      return this._say(this.name(target.type)+' 수리 일꾼 '+(committed.length+1)+'기 배정',true);
    }
    _repairHand(workers,site) {
      const eligible = workers.filter(w => ['idle','gather','return'].includes(w.action) && !w.waypoints.length);
      eligible.sort((a,b) => Number(b.action === 'idle') - Number(a.action === 'idle') || distance(a,site) - distance(b,site));
      return eligible.find(w => this._gap(w,site) <= 10 || this.nav.route(w,this._approach(w,site,5)).length);
    }

    guardRadius() { return 104; }
    postedGuards(site) {
      const id = site?.id ?? site;
      return this._owned(this.faction,e => e.action === 'guard' && (!id || e.targetId === id) && guardable(this.byId.get(e.targetId)));
    }
    expeditionArmy() {
      return this._owned(this.faction,e => military(e) && !['guard','escort','hold','retreat'].includes(e.action) &&
        !e.waypoints.some(p => p.mode === 'guard' || p.mode === 'escort'));
    }
    convoyPlan() {
      const plan = {leaders:[],carts:[],guards:[],reason:''};
      if (this.result || !['cinder','myren'].includes(this.faction)) {
        plan.reason = this.result ? '종료된 교전입니다.' : '신더와 미렌의 특수병 동행 명령입니다.';
        return plan;
      }
      const selected = new Set(this.selected);
      const available = this.expeditionArmy().filter(e => selected.has(e.id));
      plan.leaders = available.filter(e => e.type === 'specialist');
      if (this.faction === 'cinder') plan.carts = plan.leaders;
      if (!plan.leaders.length) {
        plan.reason = '출격 가능한 '+this.name('specialist')+'를 선택하세요.';
        return plan;
      }
      const guards = available.filter(e => e.type === 'soldier' || e.type === 'heavy');
      const regions = new Set(plan.leaders.map(e => this.nav.component(e)).filter(Boolean));
      plan.guards = guards.filter(e => regions.has(this.nav.component(e)));
      if (!plan.guards.length) {
        const healing = this.faction === 'myren';
        plan.reason = guards.length ? (healing ? '치유병' : '풀무차')+'까지 이어진 길이 없습니다.' :
          (healing ? '치유병과 동행할' : '풀무차와 함께 엄호를 맡을')+' 전투병이나 중장병을 선택하세요.';
      }
      return plan;
    }
    formConvoy() {
      const {leaders,guards,reason} = this.convoyPlan();
      if (reason) return this._say(reason);
      const loads = new Map(leaders.map(leader => [leader,0]));
      for (const ally of this._owned(this.faction,military)) {
        const queued = ally.waypoints.at(-1);
        const id = ally.escortId || (queued?.mode === 'escort' && queued.targetId);
        const leader = this.byId.get(id);
        if (loads.has(leader)) loads.set(leader,loads.get(leader)+1);
      }
      for (const guard of guards) {
        const region = this.nav.component(guard);
        const reachable = leaders.filter(leader => this.nav.component(leader) === region);
        const least = Math.min(...reachable.map(leader => loads.get(leader)));
        const leader = nearest(reachable.filter(leader => loads.get(leader) === least),guard);
        this._issueWaypoint(guard,{mode:'escort',x:leader.x,y:leader.y,targetId:leader.id},false);
        if (this.faction === 'myren') {
          leader.marchCompanions ??= new Set();
          leader.marchCompanions.add(guard.id);
        }
        loads.set(leader,least+1);
      }
      this.select(leaders.map(leader => leader.id));
      const duty = this.faction === 'myren' ? '동행 병력' : '엄호병';
      return this._say(this.name('specialist')+' '+leaders.length+'기 선택 · '+duty+' '+guards.length+'기 배치',true);
    }
    guardReserve(site) {
      site = this.byId.get(site?.id ?? site);
      if (this.result || !guardable(site) || site.faction !== this.faction) return null;
      const regions = new Set(this._guardPositions(site).map(point => point.region));
      const idle = this._owned(this.faction,e => military(e) && e.action === 'idle' && !e.waypoints.length && regions.has(this.nav.component(e)));
      return nearest(idle,site);
    }
    assignGuard(site) {
      site = this.byId.get(site?.id ?? site);
      if (this.result) return this._say('종료된 교전입니다.');
      if (!guardable(site) || site.faction !== this.faction) return this._say('경비할 아군의 완성된 건물을 선택하세요.');
      const guard = this.guardReserve(site);
      if (!guard) return this._say('지금 이 건물에 파견할 대기 전투병이 없습니다.');
      this._issueWaypoint(guard,{mode:'guard',x:site.x,y:site.y,targetId:site.id},false);
      return this._say(this.name(guard.type)+' 1기 · '+this.name(site.type)+' 경비 배치',true);
    }
    _guardPositions(site) {
      if (site.guardLayout?.revision === this.nav.revision) return site.guardLayout.points;
      const front = Math.atan2(this.beacon.y-site.y,this.beacon.x-site.x);
      const points = [], [rx,ry] = RULES[site.type].size;
      for (const margin of [16,32]) {
        for (const turn of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6]) {
          const angle = front + turn*Math.PI/6, dx = Math.cos(angle), dy = Math.sin(angle);
          const rim = 1/Math.hypot(dx/rx,dy/ry);
          const edge = {x:site.x+dx*(rim+5),y:site.y+dy*(rim+5)};
          const point = {x:site.x+dx*(rim+margin),y:site.y+dy*(rim+margin)};
          // A slot beside the footprint must stand on the same bank as the building.
          if (!this.nav.pass(point.x,point.y) || !this.nav.clearLine(edge,point)) continue;
          point.region = this.nav.component(point);
          points.push(point);
        }
      }
      site.guardLayout = {revision:this.nav.revision,points};
      return points;
    }
    _guardStation(e,site) {
      const region = this.nav.component(e);
      const slots = this._guardPositions(site).filter(point => point.region === region);
      const others = this.postedGuards(site).filter(guard => guard !== e && guard.guardPoint);
      return slots.find(point => others.every(guard => distance(guard.guardPoint,point) >= 14)) || slots[0];
    }

    _escortLeaders(anchor) {
      const ids = new Set(), pending = [anchor];
      while (pending.length) {
        const unit = pending.pop();
        if (!unit || ids.has(unit.id)) continue;
        ids.add(unit.id);
        if (unit.escortId) pending.push(this.byId.get(unit.escortId));
        const last = unit.waypoints.at(-1);
        if (last?.mode === 'escort') pending.push(this.byId.get(last.targetId));
      }
      return ids;
    }
    _escortPlan(target,selected) {
      if (!target || target.hp <= 0 || target.faction !== this.faction || !(isUnit(target) || isBuilding(target)))
        return {reason:'호위할 아군 유닛이나 경비할 아군 건물을 지정하세요.'};
      const troops = selected.filter(military);
      if (!troops.length) return {reason:isBuilding(target)?'거점 경비를 맡을 아군 전투병을 선택하세요.':'호위를 맡길 아군 전투 유닛을 선택하세요.'};
      if (isBuilding(target)) {
        if (!guardable(target)) return {reason:'완성된 건물에 경비를 배치할 수 있습니다.'};
        const regions = new Set(this._guardPositions(target).map(p => p.region));
        const guards = troops.filter(e => regions.has(this.nav.component(e)));
        return guards.length ? {guards,reason:''} : {reason:'거점 경비 위치까지 이어진 길이 없습니다.'};
      }
      const leaders = this._escortLeaders(target);
      const guards = troops.filter(e => !leaders.has(e.id));
      if (!guards.length) return {reason:troops.every(e => e === target) ? '다른 아군 유닛을 호위 대상으로 지정하세요.' : '서로를 호위하는 명령은 내릴 수 없습니다.'};
      const region = this.nav.component(target);
      const available = guards.filter(e => region && this.nav.component(e) === region);
      return available.length ? {guards:available,reason:''} : {reason:'호위 대상까지 이어진 길이 없습니다.'};
    }
    escortReason(target) {
      if (this.result) return '종료된 교전입니다.';
      const selected = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 && e.faction === this.faction);
      return this._escortPlan(this.byId.get(target?.id ?? target),selected).reason;
    }
    order(x, y, targetId, mode = 'context', append = false) {
      if (this.result || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      const selected = this.selected.map(id => this.byId.get(id)).filter(e => e && e.hp > 0 && e.faction === this.faction);
      const target = this.byId.get(typeof targetId === 'object' && targetId ? targetId.id : targetId);
      if (mode === 'rally' || mode === 'rallyAll') {
        const all = mode === 'rallyAll';
        const producers = all ? this._owned(this.faction,e => e.type === 'barracks' && e.progress === 1)
          : selected.filter(e => (e.type === 'hq' || e.type === 'barracks') && e.progress === 1);
        if (!producers.length) return this._say(all ? '집결 지점을 지정할 완성된 아군 병영이 없습니다.' : '집결 지점을 지정할 완성된 아군 사령부나 병영을 선택하세요.');
        const destination = target ? { x: target.x, y: target.y, targetId: target.id } : { x, y };
        if (!this.terrain.ground(destination.x, destination.y)) return this._say('육지나 다리 위를 지정하세요.');
        for (const producer of producers) {
          const start = this.reinforcementOrigin(producer);
          if (!start || !this.nav.route(start,destination).length) return this._say('다리로 연결된 육지를 지정하세요.');
        }
        for (const producer of producers) producer.rally = { ...destination };
        return this._say(all ? '병영 '+producers.length+'곳의 집결 지점을 지정했습니다.' : '집결 지점을 지정했습니다.', true);
      }
      if (!selected.length) return this._say('명령을 내릴 아군을 선택하세요.');
      const attackMove = ['attack', 'attackmove', 'attack-move'].includes(mode);
      const gather = mode === 'gather' || mode === 'harvest';
      const workers = selected.filter(e => e.type === 'worker');
      const cofferAccessible = !target || (target.faction === this.faction && isUnit(target));
      if (workers.length && (gather || (mode === 'context' && cofferAccessible)) && this.salvage?.hit(x,y)) {
        return this.salvage.order(selected,append);
      }
      if (mode === 'escort' || (mode === 'context' && target?.faction === this.faction && isUnit(target) && selected.some(military))) {
        const {guards,reason} = this._escortPlan(target,selected);
        if (reason) return this._say(reason);
        const post = isBuilding(target);
        for (const guard of guards) this._issueWaypoint(guard,{mode:post?'guard':'escort',x:target.x,y:target.y,targetId:target.id},append);
        return this._say(this.name(target.type)+(post?' 거점 경비':' 호위')+(append ? ' 명령' : '')+' · '+guards.length+'기',true);
      }
      const damagedAlly = target?.faction === this.faction && isBuilding(target) && target.hp > 0 && target.progress === 1 && target.hp < target.maxHp;
      const contextRepair = mode === 'context' && workers.length && damagedAlly;
      // A loaded worker unloads at a depot. An injured HQ still takes repair priority if affordable.
      const unload = contextRepair && dropoff(target) && workers.some(w => w.carried) &&
        (target.type === 'depot' || this.bank[this.faction].ore < 1);
      if (mode === 'repair' || (contextRepair && !unload)) {
        if (!workers.length) return this._say('건물을 수리할 일꾼을 선택하세요.');
        const reason = this.repairReason(target);
        if (reason) return this._say(reason);
        for (const worker of workers) {
          this._issueWaypoint(worker,{mode:'repair',x:target.x,y:target.y,targetId:target.id},append);
        }
        return this._say(append ? '건물 수리를 예약했습니다.' : this.name(target.type)+' 수리 · 체력 최대 4당 불씨광 1', true);
      }
      if (gather && (!target || !isResource(target))) return this._say('채취할 자원 지대를 지정하세요.');
      if (gather && !selected.some(e => e.type === 'worker')) return this._say('채취할 일꾼을 선택하세요.');
      if ((!target || mode === 'move') && !this.terrain.ground(x, y)) return this._say('육지나 다리 위를 지정하세요.');
      const units = selected.filter(isUnit);
      if (append && !units.length) return this._say('경유 명령을 내릴 아군 유닛을 선택하세요.');
      if (!target && !this.nav.route(selected[0], {x, y}).length) return this._say('다리로 연결된 육지를 지정하세요.');
      const form = units.length > 1 && (!target || mode === 'move' || target.faction === this.faction)
        ? this.nav.formation(units, x, y) : null;
      let did = false;
      for (const e of selected) {
        if (isBuilding(e)) {
          if (['hq', 'barracks'].includes(e.type) && !units.length) {
            e.rally = { x, y, targetId: target?.id };
            did = true;
          }
          continue;
        }
        if (!isUnit(e)) continue;
        let interaction = null;
        if (target && mode !== 'move') {
          if (this._enemy(e, target)) interaction = 'attack';
          else if (!attackMove && e.type === 'worker') {
            if (isResource(target)) interaction = 'gather';
            else if (target.faction === e.faction && target.progress < 1) interaction = 'build';
            else if (target.faction === e.faction && dropoff(target) && e.carried) interaction = 'return';
          }
        }
        if (interaction) {
          this._issueWaypoint(e, {mode:interaction, x:target.x, y:target.y, targetId:target.id}, append);
        } else {
          if (gather) continue;
          const dest = form?.get(e.id) || {x, y};
          this._issueWaypoint(e, {mode:attackMove ? 'attackmove' : 'move', x:dest.x, y:dest.y}, append);
        }
        did = true;
      }
      return this._say(did ? (units.length ? (append ? '연속 명령을 전달했습니다.' : '명령을 전달했습니다.') : '집결 지점을 지정했습니다.') : '이 대상은 명령을 수행할 수 없습니다.', did);
    }
    _halt(action) {
      if (this.result) return this._say('종료된 교전입니다.');
      const units = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 && e.faction === this.faction && isUnit(e));
      const hold = action === 'hold';
      if (!units.length) return this._say(hold ? '위치를 사수할 아군 유닛을 선택하세요.' : '멈출 유닛을 선택하세요.');
      for (const e of units) {
        e.waypoints.length = 0;
        this._leaveVolleyWatch(e);
        this._set(e, action);
        if (hold) e.scanClock = 0;
      }
      return this._say(hold ? '현재 위치를 사수합니다.' : '현재 명령을 중지했습니다.', true);
    }
    stop() { return this._halt('idle'); }
    hold() { return this._halt('hold'); }
    _retreatSlots(units, home) {
      const intruders = this.entities.filter(e => this._enemy(home,e) && military(e) && distance(home,e) < 180);
      const [frontX,frontY] = this.terrain.layout.enemy.hq;
      const threat = nearest(intruders,home) || {x:frontX,y:frontY};
      const rear = Math.atan2(home.y - threat.y, home.x - threat.x);
      const regions = new Map();
      for (const unit of units) {
        const region = this.nav.component(unit);
        if (!regions.has(region)) regions.set(region,[]);
        regions.get(region).push(unit);
      }
      const slots = new Map();
      for (const turn of [0,-1,1,-2,2,-3,3,4]) {
        const angle = rear + turn * Math.PI/4;
        const x = home.x + Math.cos(angle)*65, y = home.y + Math.sin(angle)*65;
        const cell = this.nav.cell(x,y);
        if (cell < 0) continue;
        const group = regions.get(this.nav.region[cell]);
        if (!group) continue;
        const point = {x:TX(cell),y:TY(cell)};
        if (distance(home,point) > 88) continue;
        for (const [id,spot] of this.nav.formation(group,point.x,point.y)) slots.set(id,spot);
        regions.delete(this.nav.region[cell]);
        if (!regions.size) break;
      }
      return slots;
    }
    retreat() {
      if (this.result) return this._say('종료된 교전입니다.');
      const troops = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 && e.faction === this.faction && military(e));
      if (!troops.length) return this._say('본진으로 후퇴할 아군 전투병을 선택하세요.');
      const home = this._owned(this.faction,e => e.type === 'hq')[0];
      if (!home) return this._say('후퇴할 아군 사령부가 없습니다.');
      const slots = this._retreatSlots(troops,home);
      if (!slots.size) return this._say('아군 사령부로 이어진 길이 없습니다.');
      for (const e of troops) {
        const spot = slots.get(e.id);
        if (!spot) continue;
        const inDanger = e.rescueCandidate || (e.hp <= e.maxHp*0.6 && distance(e,home) >= 125);
        e.waypoints.length = 0;
        this._leaveVolleyWatch(e);
        this._set(e,'retreat',home);
        e.rescueCandidate = !e.rescued && inDanger;
        e.destination = {x:spot.x,y:spot.y};
      }
      const unavailable = troops.length - slots.size;
      return this._say('본진으로 후퇴 · '+slots.size+'기'+(unavailable ? ' · 경로 없음 '+unavailable+'기' : ''), true);
    }
    _buildReason(type, x, y, faction) {
      if (!BUILDABLE.includes(type)) return '건설할 수 없는 건물입니다.';
      if (!Number.isFinite(x) || !Number.isFinite(y)) return '건설 지점을 지정하세요.';
      if (!this._canPay(faction, type)) return this.shortage(type, faction);
      if (!this.count('worker', faction)) return '건설할 일꾼이 필요합니다.';
      const [rx, ry] = RULES[type].size;
      if (((x - this.beacon.x) / (rx + 24)) ** 2 + ((y - this.beacon.y) / (ry + 14)) ** 2 < 1) return '봉화 주변은 비워 두세요.';
      if (this.salvage?.blocksBuild(x,y,rx,ry)) return '물결 금고의 회수 지점은 비워 두세요.';
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4;
        if (!this.terrain.ground(x + (rx + 8) * Math.cos(angle), y + (ry + 8) * Math.sin(angle))) return '건물을 지을 넓은 평지를 선택하세요.';
      }
      for (const other of this.entities) {
        if (isUnit(other) || other.hp <= 0) continue;
        const [ox, oy] = RULES[other.type].size;
        if (((x - other.x) / (rx + ox + 9)) ** 2 + ((y - other.y) / (ry + oy + 9)) ** 2 < 1) return '다른 건물이나 자원과 거리를 두세요.';
      }
      for (const bridge of this.terrain.bridges) {
        const [ax, ay] = bridge.a, [bx, by] = bridge.b;
        const dx = bx - ax, dy = by - ay;
        const t = bounded(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < 22 + ry) return '다리 입구는 비워 두세요.';
      }
      return '';
    }
    buildReason(type,x,y) { return this.result?'종료된 교전입니다.':this._buildReason(type,x,y,this.faction); }
    canBuild(type,x,y) { return !this.buildReason(type,x,y); }
    footprint(type) { return BUILDABLE.includes(type)?RULES[type].size:null; }
    _foundation(site) {
      const current = this.byId.get(site?.id ?? site);
      return current && (typeof site !== 'object' || current === site) && current.faction === this.faction &&
        BUILDABLE.includes(current.type) && current.hp > 0 && current.progress < 1 ? current : null;
    }
    constructionCrew(site) {
      const foundation = this._foundation(site);
      return foundation ? this._owned(this.faction,w => w.type === 'worker' && w.action === 'build' && w.targetId === foundation.id) : [];
    }
    _reportVacatedSites() {
      for (const id of this.vacatedSites) {
        const site = this._foundation(id);
        if (!site || this.constructionCrew(site).length) continue;
        const event = this._event(this.name(site.type)+' 공사 중단 · 일꾼을 다시 배정하세요.','build',site,'own');
        event.constructionSiteId = id;
      }
      this.vacatedSites.clear();
    }
    resumeConstruction(site) {
      if (this.result) return this._say('종료된 교전입니다.');
      const foundation = this._foundation(site);
      if (!foundation) return this._say('완공 전인 아군 건물을 선택하세요.');
      if (this.constructionCrew(foundation).length) return this._say('이미 이 공사에 일꾼이 배정되어 있습니다.');
      const workers = this._owned(this.faction,w => w.type === 'worker' && !w.waypoints.length && ['idle','gather','return'].includes(w.action));
      if (!workers.length) return this._say('파견할 유휴 또는 채집 일꾼이 없습니다.');
      workers.sort((a,b) => Number(a.action !== 'idle') - Number(b.action !== 'idle') || distance(a,foundation) - distance(b,foundation));
      for (const worker of workers) {
        const route = this._haulRoute(worker,foundation);
        if (!route) continue;
        this._set(worker,'build',foundation);
        worker.buildApproach = {revision:this.nav.revision,dock:route.dock};
        return this._say(this.name(foundation.type)+' 공사 재개 · 일꾼 1기 파견',true);
      }
      return this._say('공사 현장까지 갈 수 있는 일꾼이 없습니다.');
    }
    build(type, x, y) { return this._build(type, x, y, this.faction); }
    _build(type, x, y, faction) {
      if (this.result) return false;
      const reason = this._buildReason(type, x, y, faction);
      if (reason) return faction === this.faction ? this._say(reason) : false;
      const all = this._owned(faction, e => e.type === 'worker');
      const selected = faction === this.faction ? all.filter(e => this.selected.includes(e.id)) : [];
      let builders = selected;
      if (!builders.length) {
        const idle = all.filter(e => e.action === 'idle');
        const available = all.filter(e => e.action !== 'build');
        const uncommitted = available.filter(e => !['hold','repair','salvage'].includes(e.action));
        const crew = [idle,uncommitted,available,all].find(group => group.length);
        builders = [nearest(crew, { x, y })];
      }
      if (!this.nav.route(builders[0], { x, y }).length) return faction === this.faction ? this._say('일꾼이 도달할 수 없는 지점입니다.') : false;
      this._pay(faction, type);
      const site = this._spawn(type, faction, x, y);
      site.progress = 0;
      site.hp = Math.ceil(site.maxHp * 0.17);
      this._refreshNav();
      for (const w of builders) {
        w.waypoints.length = 0;
        this._set(w, 'build', site);
      }
      if (faction === this.faction) {
        this._event(this.name(type) + ' 건설을 시작했습니다.', 'build', site);
        this._say('일꾼이 건설 지점으로 이동합니다.', true);
      }
      return true;
    }
    _refreshNav() {
      this.nav.rebuild(this.entities);
      for (const e of this.entities) if (isUnit(e)) this._clearPath(e);
    }

    _producer(type, faction) {
      if (!UNITS.includes(type)) return null;
      const sourceType = type === 'worker' ? 'hq' : 'barracks';
      const candidates = this._owned(faction, e => e.type === sourceType && e.progress === 1);
      return candidates.sort((a, b) => {
        const pick = e => faction === this.faction && this.selected.includes(e.id) && e.queue.length < 5 ? 1 : 0;
        return pick(b) - pick(a) || a.queue.length - b.queue.length;
      })[0];
    }
    _trainReason(type, faction, producer) {
      if (!UNITS.includes(type)) return '생산할 수 없는 유닛입니다.';
      if (!producer) return this.name(type === 'worker' ? 'hq' : 'barracks', faction) + ' 건물을 먼저 완성하세요.';
      if (producer.queue.length >= 5) return '생산 대기열이 가득 찼습니다.';
      if (!this._canPay(faction, type)) return this.shortage(type, faction);
      const stats = this.stats(faction);
      const needed = this.population(type,faction);
      if (stats.pop + needed > stats.cap) {
        return '남은 인구 '+Math.max(0,stats.cap-stats.pop)+' · '+this.name(type,faction)+' 훈련에 '+needed+' 필요. 상단 인구 +로 거주지를 지으세요.';
      }
      return '';
    }
    canTrain(type) { return !this.result && !this._trainReason(type, this.faction, this._producer(type, this.faction)); }
    train(type) { return this._train(type, this.faction); }
    _train(type, faction) {
      if (this.result) return false;
      const producer = this._producer(type, faction);
      const reason = this._trainReason(type, faction, producer);
      if (reason) return faction === this.faction ? this._say(reason) : false;
      this._enqueueTraining(producer, type);
      return faction === this.faction ? this._say(this.name(type) + ' 생산을 예약했습니다.', true) : true;
    }
    _trainingTime(type, faction) {
      const basicRecruit = type === 'worker' || type === 'soldier';
      const budding = basicRecruit && this.doctrine?.active(faction,'budding');
      return rulesFor(type, faction).seconds * (faction === 'myren' ? 0.86 : 1) * (budding ? 0.75 : 1);
    }
    _enqueueTraining(producer, type, automatic = false) {
      this._pay(producer.faction, type);
      const duration = this._trainingTime(type, producer.faction);
      producer.queue.push({ type, remaining: duration, total: duration, automatic });
    }
    setAutoTrain(buildingId, type) {
      const producer = this.byId.get(buildingId);
      if (this.result || producer?.faction !== this.faction || producer.type !== 'barracks' || producer.hp <= 0 || producer.progress < 1) return this._say('반복 생산을 설정할 완성된 아군 병영을 선택하세요.');
      if (type !== null && (!UNITS.includes(type) || type === 'worker')) return this._say('반복 생산할 전투 유닛을 선택하세요.');
      producer.autoTrain = type;
      producer.nextAutoAttempt = this.time;
      this._repeatTraining(producer);
      return this._say(type ? this.name(type) + ' 반복 생산을 설정했습니다.' : '반복 생산을 해제했습니다.', true);
    }
    _repeatTraining(producer) {
      const type = producer.autoTrain;
      if (!type || producer.queue.length || this.time < producer.nextAutoAttempt) return;
      if (this._trainReason(type, producer.faction, producer)) {
        producer.nextAutoAttempt = this.time + 0.75;
        return;
      }
      this._enqueueTraining(producer, type, true);
    }
    cancelTraining(buildingId, index) {
      const producer = this.byId.get(buildingId);
      if (this.result || producer?.faction !== this.faction || !Number.isInteger(index) || index < 0 || !producer.queue[index]) return this._say('취소할 아군 생산 예약을 선택하세요.');
      const [entry] = producer.queue.splice(index, 1);
      if (entry.automatic) producer.autoTrain = null;
      const refund = this.cost(entry.type);
      this.bank[this.faction].crystal += refund.crystal;
      this.bank[this.faction].ore += refund.ore;
      return this._say(this.name(entry.type) + ' 생산을 취소하고 자원을 돌려받았습니다.', true);
    }

    _rim(target, unit) {
      const dx = unit.x - target.x, dy = unit.y - target.y, d = Math.hypot(dx, dy) || 1;
      const [rx, ry] = rulesFor(target.type, target.faction).size;
      return 1 / (Math.hypot(dx / (d * rx), dy / (d * ry)) || (1 / ry));
    }
    _gap(unit, target) { return Math.max(0, distance(unit, target) - this._rim(target, unit)); }
    _approach(e, target, standOff) {
      let angle = Math.atan2(e.y - target.y, e.x - target.x);
      if (distance(e, target) < 1) angle = e.phase;
      const [rx, ry] = rulesFor(target.type, target.faction).size;
      const rim = 1 / Math.hypot(Math.cos(angle) / rx, Math.sin(angle) / ry);
      return {
        x: target.x + Math.cos(angle) * (rim + standOff),
        y: target.y + Math.sin(angle) * (rim + standOff)
      };
    }
    _needsRoute(e, dest) {
      return !e.pathGoal || (e.routeClock <= 0 && (distance(e.pathGoal, dest) > 9 || (e.routeFailed && e.pathIndex >= e.path.length)));
    }
    _walk(e, dest, dt, clearLine = false) {
      if (!dest) return true;
      if (clearLine) {
        e.path = [dest];
        e.pathIndex = 0;
        e.pathGoal = dest;
        e.routeFailed = false;
        e.routeClock = 0;
      } else if (this._needsRoute(e, dest)) {
        e.path = this.nav.route(e, dest);
        e.pathIndex = 0;
        e.pathGoal = { x:dest.x, y:dest.y };
        e.routeFailed = !e.path.length;
        e.routeClock = e.routeFailed ? 2 : 0.65;
      }
      const marchBonus = e.marchUntil > this.time ? 1.35 : 1;
      let speed = rulesFor(e.type,e.faction).speed * marchBonus;
      if (e.marchCompanions?.size && (e.action === 'move' || e.action === 'attackmove')) {
        const bend = e.path[e.pathIndex];
        let nearby = false, covered = false;
        for (const id of e.marchCompanions) {
          const guard = this.byId.get(id);
          if (!guard || guard.hp <= 0 || guard.escortId !== e.id) { e.marchCompanions.delete(id); continue; }
          const guardBonus = guard.marchUntil > this.time ? 1.35 : 1;
          speed = Math.min(speed,rulesFor(guard.type,guard.faction).speed*guardBonus);
          if (bend && distance(e,guard) <= 68) {
            nearby = true;
            const ahead = (guard.x-e.x)*(bend.x-e.x) + (guard.y-e.y)*(bend.y-e.y);
            covered ||= ahead >= 8*distance(e,bend);
          }
        }
        // Give a close companion time to pass at the outset and after sharp turns.
        if (nearby && !covered) speed *= .65;
      }
      let budget = speed * dt;
      while (budget > 0 && e.pathIndex < e.path.length) {
        const node = e.path[e.pathIndex], d = distance(e, node);
        if (d < 0.2) { e.pathIndex++; continue; }
        const step = Math.min(budget, d), dx = node.x - e.x;
        const x = e.x + dx * step / d, y = e.y + (node.y - e.y) * step / d;
        if (!this.nav.pass(x, y) && this.nav.pass(e.x, e.y)) {
          // A passing unit can push a marcher off the line to its next bend.
          // Rejoin the centre of its current open cell before following the route again.
          const cell = this.nav.cell(e.x, e.y), center = {x: TX(cell), y: TY(cell)};
          const route = this.nav.route(center, dest);
          e.path = route.length ? [center, ...route] : [];
          e.pathIndex = 0;
          e.routeFailed = !route.length;
          e.routeClock = 0.65;
          break;
        }
        if (Math.abs(dx) > 0.5) e.facing = dx >= 0 ? 1 : -1;
        e.x = x;
        e.y = y;
        e.moving = true;
        budget -= step;
        if (step >= d - 0.001) e.pathIndex++;
      }
      return e.pathIndex >= e.path.length;
    }
    _reach(e, target, range, dt) {
      if (this._gap(e, target) <= range) return true;
      const point = this._approach(e, target, Math.max(4, range - 5));
      const done = this._walk(e, point, dt);
      if (!done || e.routeFailed) return false;
      // A grid centre next to a wide building can lie half a cell outside its rim.
      return this._gap(e, target) <= range + CELL;
    }

    // Find a reachable standing point on the receiving building's rim. Compare actual walking
    // lengths so a storehouse across a channel loses to one reached by a shorter bridge route.
    _haulRoute(from, site, limit = Infinity, nav = this.nav) {
      if (this._gap(from,site) <= 11) return {dock:{x:from.x,y:from.y},length:0};
      const angle = Math.atan2(from.y-site.y,from.x-site.x);
      const [rx,ry] = RULES[site.type].size;
      const region = nav.component(from);
      if (!region) return null;
      let best = null;
      for (const turn of [0,1,-1,2,-2,3,-3,4]) {
        const direction = angle + turn*Math.PI/4;
        const dx = Math.cos(direction), dy = Math.sin(direction);
        const radius = 1/Math.hypot(dx/rx,dy/ry) + 7;
        const dock = {x:site.x+dx*radius,y:site.y+dy*radius};
        if (!nav.pass(dock.x,dock.y) || nav.component(dock) !== region) continue;
        const direct = distance(from,dock);
        if (direct > limit || (best && direct >= best.length)) continue;
        let length = direct;
        if (!nav.clearLine(from,dock)) {
          const route = nav.route(from,dock);
          if (!route.length) continue;
          let previous = from;
          length = 0;
          for (const point of route) { length += distance(previous,point); previous = point; }
        }
        if (length <= limit && (!best || length < best.length)) best = {dock,length};
      }
      return best;
    }
    dropoffFor(worker) {
      if (worker?.type !== 'worker' || worker.action !== 'return' || worker.hp <= 0) return null;
      const last = worker.haulPlan, known = this.byId.get(last?.id);
      if (last && last.nav === this.nav.revision && last.version === this.dropoffVersion &&
          (!last.id || (dropoff(known) && known.faction === worker.faction))) return known || null;
      const sites = this._owned(worker.faction,dropoff);
      const ordered = this.byId.get(worker.orderedDropoffId);
      let route = sites.includes(ordered) ? this._haulRoute(worker,ordered) : null;
      let best = route ? ordered : null;
      if (!route) {
        for (const site of sites) {
          const candidate = this._haulRoute(worker,site,route?.length);
          if (candidate && (!route || candidate.length < route.length)) { best = site; route = candidate; }
        }
      }
      worker.haulPlan = {id:best?.id,dock:route?.dock,nav:this.nav.revision,version:this.dropoffVersion};
      worker.targetId = best?.id ?? null;
      this._clearPath(worker);
      return best;
    }
    depotNode(site, type, nav = this.nav) {
      if (site?.type !== 'depot' || !dropoff(site) || !['crystal','ore'].includes(type)) return null;
      const entry = site.localNodes?.[type], known = this.byId.get(entry?.id);
      if (entry && entry.nav === nav.revision && (!entry.id || (known?.hp > 0 && known.amount > 0))) return known || null;
      let node = null, best = 180;
      for (const candidate of this.entities) {
        if (candidate.type !== type || candidate.amount <= 0 || candidate.hp <= 0) continue;
        const route = this._haulRoute(candidate,site,best,nav);
        if (route && (!node || route.length < best)) { node = candidate; best = route.length; }
      }
      site.localNodes ??= {};
      site.localNodes[type] = {id:node?.id,nav:nav.revision};
      return node;
    }
    depotPreview(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return {crystal:null,ore:null};
      const cell = Math.floor(y/CELL)*COLS+Math.floor(x/CELL);
      const cached = this.lastDepotPreview;
      if (cached && cached.cell === cell && cached.nav === this.nav.revision &&
          (!cached.nodes.crystal || cached.nodes.crystal.amount > 0) &&
          (!cached.nodes.ore || cached.nodes.ore.amount > 0)) return cached.nodes;
      const proposal = {type:'depot',faction:this.faction,x,y,hp:RULES.depot.hp,progress:1};
      // Its own footprint can cut off a short approach. Preview on an independent obstacle grid.
      const nav = this.depotPreviewNav ??= new Navigation(this.terrain,this.nav.land);
      nav.rebuild([...this.entities,proposal]);
      const nodes = {crystal:this.depotNode(proposal,'crystal',nav),ore:this.depotNode(proposal,'ore',nav)};
      this.lastDepotPreview = {cell,nav:this.nav.revision,nodes};
      return nodes;
    }
    assignDepot(site, type) {
      if (this.result) return this._say('종료된 교전입니다.');
      if (site?.faction !== this.faction || !dropoff(site) || site.type !== 'depot') return this._say('완성된 아군 집하장을 선택하세요.');
      const node = this.depotNode(site,type);
      if (!node) return this._say('주변에 연결된 '+this.name(type)+' 광맥이 없습니다.');
      const crew = this._owned(site.faction,w => {
        if (w.type !== 'worker' || w.waypoints.length) return false;
        if (w.action === 'idle' || (w.action === 'build' && w.targetId === site.id)) return true;
        return (w.action === 'gather' || w.action === 'return') && w.depositId !== node.id;
      });
      const alternate = this.depotNode(site,type === 'crystal' ? 'ore' : 'crystal');
      const otherLocalJob = w => alternate && (w.action === 'gather' || w.action === 'return') && w.depositId === alternate.id;
      const score = w => distance(w,node) + (w.action === 'gather' || w.action === 'return' ? 70 : 0);
      crew.sort((a,b) => Number(!!otherLocalJob(a))-Number(!!otherLocalJob(b)) || score(a)-score(b));
      const worker = crew.find(w => this.nav.route(w,node).length);
      if (!worker) return this._say('이 광맥에 추가로 배정할 수 있는 일꾼이 없습니다.');
      this._gather(worker,node,true);
      return this._say(this.name(site.type)+' 주변 '+this.name(type)+' 채집에 일꾼 한 기를 배정했습니다.',true);
    }

    _nextNode(worker, type) {
      const region = this.nav.component(worker);
      return nearest(this.entities.filter(e => e.hp > 0 && e.type === type && region && this.nav.component(e) === region),worker);
    }
    _resumeWorker(worker) {
      if (worker.waypoints.length) { this._finishOrder(worker); return; }
      if (worker.carried > 0) { this._set(worker, 'return'); return; }
      const old = this.byId.get(worker.depositId);
      const next = old?.hp > 0 ? old : worker.depositId && this._nextNode(worker,worker.gatherType || worker.resourceType || 'crystal');
      if (next) this._gather(worker,next);
      else this._set(worker,'idle');
    }
    _repair(worker, dt) {
      const site = this.byId.get(worker.targetId);
      if (!site || site.hp <= 0 || site.faction !== worker.faction || !isBuilding(site) || site.progress !== 1 || site.hp >= site.maxHp) {
        this._resumeWorker(worker);
        return;
      }
      const bank = this.bank[worker.faction];
      if (bank.ore < 1) {
        if (worker.faction === this.faction && this.time >= (this.nextRepairWarning || 0)) {
          this._event('불씨광 부족 · '+this.name(site.type)+' 수리 중단','repair',site);
          this.nextRepairWarning = this.time + 8;
        }
        this._resumeWorker(worker);
        return;
      }
      if (!this._reach(worker,site,10,dt)) return;
      worker.facing = site.x >= worker.x ? 1 : -1;
      worker.workClock = Math.min(1, worker.workClock + dt);
      if (worker.workClock < 1 - 1e-8 || this.time + 1e-8 < (site.nextRepairAt || 0)) return;
      // Every pulse is paid on contact. The shared interval caps a whole crew at eight HP per second.
      worker.workClock = 0;
      site.nextRepairAt = this.time + .5;
      const restored = Math.min(4,site.maxHp-site.hp);
      bank.ore--;
      site.hp += restored;
      this.report[worker.faction].repairedHp += restored;
      if (site.type === 'hq') {
        worker.lastHQRepairAt = this.time;
        this.report[worker.faction].repairedHQ += restored;
      }
      this._effect('repair',worker,site,.48);
      if (site.hp >= site.maxHp) {
        if (site.faction === this.faction) this._event(this.name(site.type)+' 수리 완료','repair',site);
        this._resumeWorker(worker);
      }
    }
    _work(e, dt) {
      if (e.action === 'build') {
        const site = this.byId.get(e.targetId);
        if (!site || site.hp <= 0 || site.progress >= 1) {
          this._resumeWorker(e);
          return;
        }
        if (e.buildApproach) {
          // Approach the reachable side chosen at dispatch even if a wall separates the nearest side.
          if (e.buildApproach.revision !== this.nav.revision) {
            const route = this._haulRoute(e,site);
            if (!route) { this._resumeWorker(e); return; }
            e.buildApproach = {revision:this.nav.revision,dock:route.dock};
          }
          if (this._gap(e,site) > 11) {
            if (!this._walk(e,e.buildApproach.dock,dt)) return;
            if (this._gap(e,site) > 11) { this._clearPath(e); return; }
          }
        } else if (!this._reach(e,site,10,dt)) return;
        e.facing = site.x >= e.x ? 1 : -1;
        const step = Math.min(1 - site.progress, dt / RULES[site.type].seconds);
        site.progress = Math.min(1, site.progress + step);
        site.hp = Math.min(site.maxHp, site.hp + step * site.maxHp * 0.83);
        if (site.progress >= 0.999999) {
          site.progress = 1;
          if (site.type === 'depot') this.dropoffVersion++;
          this.report[site.faction].buildings++;
          if (site.faction === this.faction) this._event(this.name(site.type) + ' 건설 완료', 'build', site);
        }
        return;
      }
      if (e.action === 'return') {
        const base = this.dropoffFor(e);
        if (!base) return;
        if (this._gap(e,base) > 11) {
          if (!this._walk(e,e.haulPlan.dock,dt) || e.routeFailed || this._gap(e,base) > 11) return;
        }
        if (e.carried && e.resourceType) {
          this.bank[e.faction][e.resourceType] += e.carried;
          base.lastDelivery = this.time;
          base.deliveredResource = e.resourceType;
          if (base.type === 'depot') {
            const crystal = e.resourceType === 'crystal';
            base[crystal ? 'receivedCrystal' : 'receivedOre'] += e.carried;
            this.report[e.faction][crystal ? 'depotCrystal' : 'depotOre'] += e.carried;
          }
          const total = e.resourceType === 'crystal' ? 'harvestedCrystal' : 'harvestedOre';
          this.report[e.faction][total] += e.carried;
        }
        e.carried = 0;
        if (e.waypoints.length) { this._finishOrder(e); return; }
        const old = this.byId.get(e.depositId);
        const next = old?.hp > 0 ? old : this._nextNode(e, e.gatherType || e.resourceType || 'crystal');
        if (next) this._gather(e, next);
        else this._set(e, 'idle');
        return;
      }
      let node = this.byId.get(e.depositId);
      if (!node || node.hp <= 0) {
        if (e.waypoints.length && !e.carried) { this._finishOrder(e); return; }
        node = this._nextNode(e, e.gatherType || node?.type || e.resourceType || 'crystal');
        if (node) this._gather(e, node);
        else this._set(e, e.carried ? 'return' : 'idle');
        return;
      }
      if (!this._reach(e, node, 9, dt)) return;
      e.facing = node.x >= e.x ? 1 : -1;
      e.workClock += dt;
      if (e.workClock < 2.4) return;
      const carry = node.type === 'crystal' && e.faction === 'velari' ? 14 : (node.type === 'ore' && e.faction === 'cinder' ? 12 : (node.type === 'crystal' ? 11 : 9));
      const amount = Math.min(carry - e.carried, node.amount);
      node.amount -= amount;
      node.hp = node.amount;
      e.carried += amount;
      e.resourceType = node.type;
      this._set(e, 'return');
    }

    _combatStats(e) {
      const r = rulesFor(e.type, e.faction);
      const velariWeapon = e.faction === 'velari' && military(e);
      const cinderWeapon = e.faction === 'cinder' && military(e);
      const lens = (e.type === 'soldier' || e.type === 'heavy') && this.doctrine?.active(e.faction,'farlens');
      return { range: r.range + (velariWeapon ? 17 : 0) + (lens ? 13 : 0), power: cinderWeapon ? r.power * 119 / 100 : r.power, cooldown: r.cooldown };
    }
    _findTarget(e, range, protect = null) {
      let best = null, score = Infinity;
      for (const t of this.entities) {
        if (!this._enemy(e, t)) continue;
        const attacksAnchor = protect && t.action === 'attack' && t.targetId === protect.id;
        if (protect && (this._gap(protect,t) > (attacksAnchor ? 104 : 82) || !(military(t) || t.type === 'tower' || t.type === 'hq' || attacksAnchor))) continue;
        const d = this._gap(e, t);
        if (d > range + (attacksAnchor ? 50 : 0)) continue;
        const rank = d + (military(t) ? 0 : (t.type === 'tower' ? 8 : 20));
        if (rank < score) { best = t; score = rank; }
      }
      return best;
    }
    _effect(type, e, target, life) {
      const height = entity => isBuilding(entity) ? (entity.type === 'hq' ? 47 : 29) : (entity.type === 'heavy' || entity.type === 'specialist' ? 16 : 11);
      const effect = {
        type, faction: e.faction, x: e.x, y: e.y - height(e), tx: target.x, ty: target.y - height(target),
        age: 0, life, sourceType: e.type, targetType: target.type
      };
      this.effects.push(effect);
      return effect;
    }
    _damage(e, target, power, impact, guardPostId = e.action === 'guard' ? e.targetId : null) {
      target.lastHurt = this.time;
      let siege = 1;
      if (isBuilding(target)) {
        const fault = e.type === 'heavy' && this.doctrine?.active(e.faction,'fault');
        siege = fault ? 2 : (SIEGE_DAMAGE[e.type] ?? 1);
      }
      const marked = target.markedBy === e.faction && this.time < target.markedUntil && e.id !== target.markSource;
      const before = target.hp, normalDamage = power * siege * (this.tactics?.damageScale(target) ?? 1);
      const followUp = marked ? (this.doctrine?.active(e.faction,'afterimage') ? 1.35 : 1.2) : 1;
      const shield = target.dewWard?.shield || 0;
      const blocked = Math.min(shield,normalDamage*followUp);
      if (blocked > 0) {
        target.dewWard.shield -= blocked;
        this.report[target.faction].dewBlocked += blocked;
        if (target.dewWard.shield <= 0) {
          target.dewWard = null;
          this._dewEffect('dewBreak',target,target,blocked);
        }
      }
      target.hp = Math.max(0, before - (normalDamage*followUp - blocked));
      if (marked) {
        const bonus = Math.max(0,before - Math.max(0,normalDamage-shield)) - target.hp;
        this.report[e.faction].specialImpact += bonus;
        const commanded = impact?.type === 'shot' && e.volleyTargetId === target.id;
        if (commanded) {
          impact.commanded = true;
          this.report[e.faction].volleyHits++;
          this.report[e.faction].volleyBonus += bonus;
        }
        if (bonus > 0) {
          const tracker = this.byId.get(target.markSource);
          if (tracker) tracker.markAssistDamage = (tracker.markAssistDamage || 0) + bonus;
          if (impact) impact.markBonus = bonus;
          let echo = this.effects.findLast(fx => fx.type === 'markFollowup' && fx.targetId === target.id);
          if (!echo) {
            echo = this._effect('markFollowup',e,target,.86);
            echo.targetId = target.id;
            echo.amount = 0;
          }
          echo.age = Math.min(echo.age,.39);
          echo.tx = target.x;
          echo.ty = impact?.ty ?? echo.ty;
          echo.amount += bonus;
          echo.commanded ||= commanded;
        }
      }
      if (target.type === 'hq' && !target.siegeReported && target.hp < before) {
        target.siegeReported = true;
        this._event((target.faction === this.faction ? '아군' : '적군')+' 사령부 피격','siege',target);
      }
      if (target.type === 'hq' && target.faction === this.enemyFaction && target.hp > 0 && target.hp < before) {
        this._defendHQ(target,e);
      }
      if (isBuilding(target) && target.faction === this.faction && this.time - this.lastAlarm > 16) {
        this._event('아군 기지가 공격받고 있습니다.', 'alert', target);
        this.lastAlarm = this.time;
      }
      if (target.hp <= 0 && before > 0) {
        if (isUnit(target)) {
          this.report[e.faction].kills++;
          if (guardPostId && guardable(this.byId.get(guardPostId)) && target.faction !== e.faction && target.faction !== 'neutral') this.report[e.faction].guardKills++;
        }
        this._effect('burst', target, target, isBuilding(target) ? 0.8 : 0.4);
        if (target.type === 'hq') {
          this.result = target.faction === this.faction ? 'loss' : 'win';
          this.doctrine?.update();
          this._event(this.result === 'win' ? '적의 본진을 파괴했습니다. 승리!' : '아군 본진이 파괴되었습니다.', 'result', target);
        } else if (isBuilding(target)) this._event(this.name(target.type, target.faction) + ' 파괴', target.faction === this.faction ? 'alert' : 'battle', target);
      }
      return before - target.hp;
    }
    _canVolley(e,target,remaining) {
      if (!this._enemy(e,target) || target.markedBy !== e.faction || target.markSource === e.id ||
          remaining <= e.attackClock || this._gap(e,target) > this._combatStats(e).range) return false;
      if (e.action === 'escort') {
        const anchor = this.byId.get(e.escortId);
        return anchor?.hp > 0 && e.escortThreatId === target.id && distance(e,anchor) <= 68;
      }
      if (e.action === 'guard') {
        const site = this.byId.get(e.targetId);
        return guardable(site) && e.guardThreatId === target.id && distance(e,site) <= this.guardRadius(site) && distance(target,site) <= this.guardRadius(site);
      }
      return volleyDuty(e);
    }
    _volleyMarks() {
      return this.entities.filter(target => target.hp > 0 && target.markedBy === this.faction && target.markedUntil > this.time);
    }
    _volleyTarget(fighters,marks) {
      let best = null, bestWait = Infinity;
      for (const target of marks) {
        const remaining = target.markedUntil - this.time;
        const units = fighters.filter(e => this._canVolley(e,target,remaining));
        if (!units.length || (best && units.length < best.units.length)) continue;
        const wait = Math.min(...units.map(e => e.attackClock));
        if (best && units.length === best.units.length && wait >= bestWait) continue;
        best = {target,units,remaining};
        bestWait = wait;
      }
      return best;
    }
    _leaveVolleyWatch(unit) {
      const watch = unit.volleyWatch;
      if (!watch) return;
      unit.volleyWatch = null;
      watch.ids.delete(unit.id);
      if (!watch.ids.size) this.volleyWatches.delete(watch);
    }
    _stepVolleyWatches() {
      const marks = this._volleyMarks();
      for (const watch of this.volleyWatches) {
        const fighters = [];
        for (const id of watch.ids) {
          const e = this.byId.get(id);
          if (e?.hp > 0 && this.time+1e-8 < watch.end && !this.result) fighters.push(e);
          else if (e) this._leaveVolleyWatch(e);
          else watch.ids.delete(id);
        }
        if (!fighters.length) { this.volleyWatches.delete(watch); continue; }
        const shot = this._volleyTarget(fighters,marks);
        if (!shot) continue;
        // A group commits once. Out-of-range members keep their previous orders.
        for (const e of fighters) this._leaveVolleyWatch(e);
        for (const e of shot.units) e.volleyTargetId = shot.target.id;
        this.report[this.faction].volleysReleased++;
        const cue = this._effect('volleyRelease',shot.units[0],shot.target,.8);
        cue.targetId = shot.target.id;
        cue.count = shot.units.length;
      }
    }
    volleyPlan() {
      const plan = {target:null,units:[],remaining:0,pending:0,waiting:0,waitRemaining:0,canPrime:false,primers:[],reason:'결맥 추적자가 표식을 남긴 뒤 사용하세요.'};
      if (this.result || this.faction !== 'velari') {
        plan.reason = this.result ? '종료된 교전입니다.' : '벨라리 연맹의 전투 명령입니다.';
        return plan;
      }
      const fighters = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 && e.faction === this.faction && military(e));
      if (!fighters.length) { plan.reason = '일제사격할 아군 전투병을 선택하세요.'; return plan; }
      const waiting = fighters.filter(e => e.volleyWatch?.end > this.time);
      if (waiting.length) {
        plan.waiting = waiting.length;
        plan.waitRemaining = Math.min(...waiting.map(e => e.volleyWatch.end-this.time));
        plan.reason = '선택한 '+plan.waiting+'기 일제사격 대기 · 다시 누르면 대기 취소';
        return plan;
      }
      for (const e of fighters) {
        const target = this.byId.get(e.volleyTargetId);
        if (!target || !this._canVolley(e,target,target.markedUntil - this.time)) continue;
        plan.pending++;
        plan.target ||= target;
      }
      if (plan.pending) {
        plan.remaining = plan.target.markedUntil - this.time;
        plan.reason = plan.pending+'기 사격 대기';
        return plan;
      }
      const marks = this._volleyMarks();
      const shot = this._volleyTarget(fighters,marks);
      if (shot) {
        Object.assign(plan,shot);
        plan.reason = this.name(shot.target.type,shot.target.faction)+' · '+shot.units.length+'기 사격 가능';
        return plan;
      }
      const trackers = this._owned(this.faction,e => e.type === 'specialist');
      if (!trackers.length) {
        plan.reason = marks.length ? '표식이 끝나기 전에 사거리 안에서 발사할 전투병이 필요합니다.' : '결맥 추적자를 먼저 훈련하세요.';
        return plan;
      }
      plan.primers = fighters.filter(e => volleyDuty(e) && (trackers.length > 1 || e !== trackers[0]));
      plan.canPrime = plan.primers.length > 0;
      plan.reason = plan.canPrime ? '8초 동안 표식 대기 · 사거리 안의 첫 표식에 한 번 일제사격합니다.' :
        '공격·사수·호위 중이거나 대기 중인 후속 전투병을 선택하세요.';
      return plan;
    }
    volley() {
      const plan = this.volleyPlan();
      if (plan.waiting) {
        for (const id of this.selected) {
          const e = this.byId.get(id);
          if (e?.volleyWatch) this._leaveVolleyWatch(e);
        }
        return this._say('선택한 '+plan.waiting+'기 일제사격 대기 취소',true);
      }
      if (plan.canPrime) {
        const watch = {end:this.time+VOLLEY_WAIT,ids:new Set(plan.primers.map(e => e.id))};
        this.volleyWatches.add(watch);
        for (const e of plan.primers) e.volleyWatch = watch;
        this.report[this.faction].volleysPrimed++;
        return this._say('일제사격 대기 · '+plan.primers.length+'기 · '+VOLLEY_WAIT+'초',true);
      }
      if (!plan.units.length) return this._say(plan.reason);
      for (const unit of plan.units) unit.volleyTargetId = plan.target.id;
      return this._say('표식 일제사격 · '+this.name(plan.target.type,plan.target.faction)+'에 '+plan.units.length+'기 조준',true);
    }
    _ashDutyAllows(cart,point,radius) {
      if (cart.action === 'retreat') return false;
      if (cart.action === 'guard') {
        const post = this.byId.get(cart.targetId);
        return guardable(post) && distance(cart,post) <= this.guardRadius(post) &&
          (!point || distance(point,post) <= this.guardRadius(post));
      }
      if (cart.action === 'escort') {
        const anchor = this.byId.get(cart.escortId), threat = this.byId.get(cart.escortThreatId);
        return anchor?.hp > 0 && this._enemy(cart,threat) && distance(cart,anchor) <= 68 &&
          (!point || (distance(point,anchor) <= 104 && distance(point,threat) <= radius));
      }
      return true;
    }
    _ashTargets(point,radius,limit) {
      const targets = this.entities.filter(e => this._enemy(point,e) &&
        (isBuilding(e) ? this._gap(point,e) : distance(e,point)) <= radius);
      targets.sort((a,b) => distance(a,point)-distance(b,point) || a.id-b.id);
      return targets.slice(0,limit);
    }
    ashPlan(x,y) {
      const selected = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 &&
        e.faction === this.faction && e.faction === 'cinder' && e.type === 'specialist');
      const upgraded = this.doctrine?.active('cinder','furnace');
      const plan = {selected,ready:[],source:null,range:ASH.range,radius:upgraded?52:42,
        limit:upgraded?5:4,remaining:0,targets:[],ok:false,reason:''};
      if (this.result) { plan.reason = '종료된 교전입니다.'; return plan; }
      if (!selected.length) { plan.reason = '노을풀무차를 선택하세요.'; return plan; }
      const eligible = selected.filter(e => this._ashDutyAllows(e,null,plan.radius));
      if (!eligible.length) { plan.reason = '후퇴하거나 경계를 벗어난 노을풀무차는 쏠 수 없습니다.'; return plan; }
      plan.remaining = Math.max(0,Math.min(...eligible.map(e => e.ashReadyAt-this.time)));
      plan.ready = eligible.filter(e => e.ashReadyAt <= this.time);
      if (!plan.ready.length) { plan.reason = '잿꽃탄 재충전 · '+Math.ceil(plan.remaining)+'초'; return plan; }
      if (x === undefined && y === undefined) {
        plan.ok = true; plan.source = plan.ready[0]; plan.reason = '착탄할 육지나 다리를 지정하세요.';
        return plan;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1280 || y >= 640 || !this.terrain.ground(x,y)) {
        plan.reason = '육지나 다리 위를 지정하세요.'; return plan;
      }
      const point = {x,y,faction:this.faction};
      const inRange = plan.ready.filter(e => distance(e,point) <= ASH.range);
      if (!inRange.length) { plan.reason = '잿꽃탄 사거리 밖입니다.'; return plan; }
      plan.source = nearest(inRange.filter(e => this._ashDutyAllows(e,point,plan.radius)),point);
      if (!plan.source) { plan.reason = '경비 또는 호위 범위 밖입니다.'; return plan; }
      plan.targets = this._ashTargets(point,plan.radius,plan.limit);
      plan.ok = true;
      plan.reason = '착탄 예상 · '+(plan.targets.length?'적 '+plan.targets.length+'기':'빈 지점');
      return plan;
    }
    _launchAsh(cart,x,y,radius,limit) {
      const pulse = {x,y,fromX:cart.x,fromY:cart.y,sourceId:cart.id,faction:cart.faction,
        start:this.time,end:this.time+ASH.flight,radius,limit,guardPostId:cart.action === 'guard'?cart.targetId:null};
      this.ashBlooms.push(pulse);
      cart.ashReadyAt = this.time+ASH.reload;
      cart.attackClock = Math.max(cart.attackClock,this._combatStats(cart).cooldown*(this.tactics?.cooldownScale(cart)??1));
      this.report[cart.faction].ashShots++;
      if (cart.faction !== this.faction) this._event('적 잿꽃탄 · 착탄 지점을 벗어나세요.','ash',pulse,'enemy');
    }
    fireAsh(x,y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return this._say('착탄할 육지나 다리를 지정하세요.');
      const plan = this.ashPlan(x,y);
      if (!plan.ok) return this._say(plan.reason);
      this._launchAsh(plan.source,x,y,plan.radius,plan.limit);
      return this._say('잿꽃탄 발사 · 1.45초 후 착탄',true);
    }
    _landAsh() {
      while (this.ashBlooms.length && this.ashBlooms[0].end <= this.time+1e-8 && !this.result) {
        const pulse = this.ashBlooms.shift();
        // The seed keeps its own destination and launch duty after the cart moves or is lost.
        const source = this.byId.get(pulse.sourceId) || {id:pulse.sourceId,type:'specialist',faction:pulse.faction,x:pulse.fromX,y:pulse.fromY};
        const effect = this._effect('ashImpact',source,pulse,.76);
        effect.footX = pulse.x; effect.footY = pulse.y; effect.radius = pulse.radius; effect.hits = [];
        const report = this.report[pulse.faction];
        for (const target of this._ashTargets(pulse,pulse.radius,pulse.limit)) {
          const warded = Boolean(target.dewWard);
          const damage = this._damage(source,target,isBuilding(target)?ASH.buildingPower:ASH.power,null,pulse.guardPostId);
          if (warded || damage > 0) {
            report.ashHits++; report.ashDamage += damage;
            effect.hits.push({id:target.id,x:target.x,y:target.y,type:target.type});
          }
          if (this.result) break;
        }
      }
    }
    splashPlan(source, target) {
      const furnace = this.doctrine?.active(source.faction,'furnace');
      const radius = furnace ? 48 : 35;
      const targets = this.entities.filter(e => e !== target && this._enemy(source,e) && distance(e,target) <= radius);
      targets.sort((a,b) => distance(a,target) - distance(b,target));
      return {radius,targets:targets.slice(0,furnace ? 4 : 3)};
    }
    _attack(e, target, dt, mobile) {
      const stats = this._combatStats(e);
      if (mobile && !this._reach(e, target, stats.range, dt)) return;
      if (!mobile && this._gap(e, target) > stats.range) return;
      e.facing = target.x >= e.x ? 1 : -1;
      if (e.attackClock > 0) return;
      e.attackClock = stats.cooldown * (this.tactics?.cooldownScale(e) ?? 1);
      const impact = this._effect(e.type === 'worker' ? 'hit' : 'shot', e, target, 0.27);
      this._damage(e, target, stats.power, impact);
      if (e.type !== 'specialist' || this.result) return;
      if (e.faction === 'velari' && target.hp > 0) {
        if (!(target.markedUntil > this.time)) this._effect('mark', e, target, 0.45);
        target.markedBy = e.faction;
        target.markSource = e.id;
        target.markedUntil = this.time + (this.doctrine?.active(e.faction,'afterimage') ? 7 : 4);
      }
      if (e.faction === 'cinder') {
        const plan = this.splashPlan(e,target);
        const splash = this._effect('splash', e, target, 0.62);
        splash.radius = plan.radius;
        splash.footX = target.x;
        splash.footY = target.y;
        splash.hits = [];
        for (const t of plan.targets) {
          const warded = Boolean(t.dewWard);
          const damage = this._damage(e, t, stats.power * (isBuilding(t) ? 0.18 : 0.60));
          this.report[e.faction].specialImpact += damage;
          if (warded || damage > 0) splash.hits.push({id:t.id,x:t.x,y:t.y,type:t.type});
          if (this.result) break;
        }
      }
    }
    _dewDutyAllows(healer,patient) {
      if (healer.action === 'retreat') return false;
      if (healer.action === 'guard') {
        const site = this.byId.get(healer.targetId);
        return guardable(site) && distance(healer,site) <= this.guardRadius(site) &&
          (!patient || distance(patient,site) <= this.guardRadius(site));
      }
      if (healer.action === 'escort') {
        const anchor = this.byId.get(healer.escortId);
        return anchor?.hp > 0 && distance(healer,anchor) <= 57 && (!patient || distance(patient,anchor) <= 57);
      }
      return true;
    }
    _canReachDew(healer,patient) {
      return distance(healer,patient) <= DEW.range && this._dewDutyAllows(healer,patient) && this.nav.clearLine(healer,patient);
    }
    _dewSource(healers,patient) {
      return nearest(healers.filter(h => this._canReachDew(h,patient)),patient);
    }
    _dewSuggestion(healers,reactive = false,patients = null) {
      if (!healers.length) return null;
      const side = healers[0].faction;
      const threatened = new Set();
      for (const foe of this.entities) {
        if (foe.hp <= 0 || foe.faction === side || foe.faction === 'neutral') continue;
        const id = foe.guardThreatId || foe.escortThreatId || foe.targetId;
        const patient = this.byId.get(id);
        if (patient?.faction === side && isUnit(patient) && this._gap(foe,patient) <= this._combatStats(foe).range+14) threatened.add(id);
      }
      let best = null, high = -1;
      for (const patient of patients ?? this._owned(side,isUnit)) {
        if (patient.dewWard) continue;
        const incoming = this.ashBlooms.some(seed => seed.faction !== side && distance(seed,patient) <= seed.radius);
        const danger = incoming || threatened.has(patient.id) || this.time-patient.lastHurt < 3;
        const missing = 1-patient.hp/patient.maxHp;
        if (!danger && (reactive || missing <= 0)) continue;
        const score = (incoming ? 2 : 0) + (danger ? 1 : 0) + missing;
        if (score <= high) continue;
        const source = this._dewSource(healers,patient);
        if (source) { best = {source,target:patient}; high = score; }
      }
      return best;
    }
    dewPlan(target) {
      const selected = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 &&
        e.faction === this.faction && e.type === 'specialist' && e.faction === 'myren');
      const plan = {selected,ready:[],remaining:0,range:DEW.range,capacity:DEW.capacity,duration:DEW.duration,
        source:null,target:null,suggested:null,ok:false,reason:''};
      if (this.result) { plan.reason = '종료된 교전입니다.'; return plan; }
      if (!selected.length) { plan.reason = '꽃실 엮음이를 선택하세요.'; return plan; }
      const available = selected.filter(e => this._dewDutyAllows(e));
      if (!available.length) { plan.reason = '후퇴 중이거나 경계 범위를 벗어난 꽃실 엮음이입니다.'; return plan; }
      plan.ready = available.filter(e => e.dewReadyAt <= this.time);
      if (!plan.ready.length) {
        plan.remaining = Math.max(0,Math.min(...available.map(e => e.dewReadyAt-this.time)));
        plan.reason = '이슬매듭 재사용까지 '+Math.ceil(plan.remaining)+'초'; return plan;
      }
      if (target === undefined) {
        const pick = this._dewSuggestion(plan.ready);
        if (pick) { plan.source = pick.source; plan.suggested = plan.target = pick.target; }
        plan.ok = true; plan.reason = '보호할 아군 유닛을 지정하세요.'; return plan;
      }
      const unit = typeof target === 'number' ? this.byId.get(target) : target;
      if (!unit || this.byId.get(unit.id) !== unit || unit.faction !== this.faction || unit.hp <= 0 || !isUnit(unit)) {
        plan.reason = '보호할 아군 유닛을 지정하세요.'; return plan;
      }
      plan.target = unit;
      if (unit.dewWard) { plan.reason = '이미 이슬매듭으로 보호 중입니다.'; return plan; }
      if (!plan.ready.some(e => distance(e,unit) <= DEW.range)) { plan.reason = '이슬매듭 사거리 밖입니다.'; return plan; }
      plan.source = this._dewSource(plan.ready,unit);
      if (!plan.source) { plan.reason = '가로막힌 지형이나 경계 범위 밖에는 매듭을 이을 수 없습니다.'; return plan; }
      plan.ok = true; plan.reason = this.name(unit.type,unit.faction)+' · 보호막 '+DEW.capacity;
      return plan;
    }
    dewRescuePlan() {
      const plan = {patients:[],healers:[],source:null,target:null,reason:'',shortReason:'',ok:false,remaining:0};
      if (this.result) { plan.reason = '종료된 교전입니다.'; return plan; }
      if (this.faction !== 'myren') { plan.reason = '미렌 수관회의 지원 명령입니다.'; return plan; }
      const selected = this.selected.map(id => this.byId.get(id)).filter(e => e?.hp > 0 && e.faction === this.faction && isUnit(e));
      if (selected.some(e => e.type === 'specialist' && e.action !== 'retreat')) {
        plan.reason = '꽃실 엮음이로 보호할 아군을 지정하세요.'; return plan;
      }
      plan.patients = selected.filter(e => e.hp < e.maxHp);
      if (!plan.patients.length) { plan.reason = '보호를 요청할 부상 아군을 선택하세요.'; return plan; }
      plan.healers = this._owned(this.faction,e => e.type === 'specialist');
      const exposed = plan.patients.filter(e => !e.dewWard);
      if (!exposed.length) { plan.shortReason = '보호 중'; plan.reason = '선택한 부상병이 이미 보호 중입니다.'; return plan; }
      if (!plan.healers.length) { plan.shortReason = '치유병 없음'; plan.reason = '지원할 꽃실 엮음이가 없습니다.'; return plan; }
      const ready = plan.healers.filter(e => e.dewReadyAt <= this.time);
      const pick = this._dewSuggestion(ready,false,exposed);
      if (pick) {
        plan.source = pick.source; plan.target = pick.target; plan.ok = true;
        plan.reason = this.name(pick.target.type)+' · 보호막 '+DEW.capacity;
        return plan;
      }
      const nearby = plan.healers.filter(h => exposed.some(p => distance(h,p) <= DEW.range));
      if (!nearby.length) { plan.shortReason = '사거리 밖'; plan.reason = '부상병이 꽃실 엮음이의 사거리 밖에 있습니다.'; return plan; }
      const reachable = nearby.filter(h => exposed.some(p => this._canReachDew(h,p)));
      if (!reachable.length) { plan.shortReason = '연결 불가'; plan.reason = '가로막힌 지형이나 치유병의 현재 임무로 지원할 수 없습니다.'; return plan; }
      plan.remaining = Math.max(0,Math.min(...reachable.map(h => h.dewReadyAt-this.time)));
      plan.reason = '이슬매듭 재사용까지 '+Math.ceil(plan.remaining)+'초';
      return plan;
    }
    requestDew() {
      const plan = this.dewRescuePlan();
      if (!plan.ok) return this._say(plan.reason);
      this._tieDew(plan.source,plan.target);
      return this._say(this.name(plan.target.type)+' 지원 · 이슬매듭 보호막 '+DEW.capacity,true);
    }
    _dewEffect(kind,source,target,amount) {
      const effect = this._effect(kind,source,target,kind === 'dewCast' ? .65 : .85);
      effect.targetId = target.id;
      effect.amount = amount;
    }
    _tieDew(healer,patient) {
      patient.dewWard = {sourceId:healer.id,start:this.time,end:this.time+DEW.duration,capacity:DEW.capacity,shield:DEW.capacity};
      healer.dewReadyAt = this.time+DEW.reload;
      this.report[healer.faction].dewCasts++;
      this._dewEffect('dewCast',healer,patient,DEW.capacity);
    }
    tieDew(target) {
      if (target == null) return this._say('보호할 아군 유닛을 지정하세요.');
      const plan = this.dewPlan(target);
      if (!plan.ok) return this._say(plan.reason);
      this._tieDew(plan.source,plan.target);
      return this._say(this.name(plan.target.type)+' · 이슬매듭 보호막 '+DEW.capacity,true);
    }
    _mendDew(patient) {
      const amount = Math.min(patient.maxHp-patient.hp,patient.dewWard.shield/2);
      patient.dewWard = null;
      patient.hp += amount;
      this.report[patient.faction].dewHealed += amount;
      this._dewEffect('dewMend',patient,patient,amount);
    }
    healPlan(e) {
      const nectar = e?.faction === 'myren' && this.doctrine?.active(e.faction,'nectar');
      const plan = {target:null,radius:nectar ? 90 : 75,amount:nectar ? 20 : 13};
      if (!e || e.hp <= 0 || e.type !== 'specialist' || e.faction !== 'myren') return plan;
      const patientId = e.action === 'escort' ? e.escortId : null;
      let lowestHealth = 1;
      for (const unit of this.entities) {
        if (unit === e || unit.faction !== e.faction || unit.hp <= 0 || unit.hp >= unit.maxHp) continue;
        if (this.time < (unit.healLockUntil || 0) || distance(e,unit) > plan.radius) continue;
        if (unit.id === patientId && isUnit(unit)) {
          if (!this.nav.clearLine(e,unit)) continue;
          plan.target = unit;
          break;
        }
        if (!military(unit)) continue;
        if (this.time - unit.lastHurt > 6 && !(unit.attackClock > 0 && ['attack','hold','escort','guard'].includes(unit.action))) continue;
        const health = unit.hp / unit.maxHp;
        if (health < lowestHealth) { lowestHealth = health; plan.target = unit; }
      }
      return plan;
    }
    _support(e) {
      if (this.time < (e.nextHeal || 0)) return;
      const {target:ally,amount} = this.healPlan(e);
      e.nextHeal = this.time + (ally ? 2.6 : 0.40);
      if (ally) {
        const restored = Math.min(amount, ally.maxHp - ally.hp);
        e.lastHealTime = this.time;
        e.lastHealTargetId = ally.id;
        e.healedHp = (e.healedHp || 0) + restored;
        ally.hp += restored;
        this.report[e.faction].specialImpact += restored;
        ally.healLockUntil = this.time + 2.6;
        const heal = this._effect('heal', e, ally, 0.93);
        heal.amount = restored;
        heal.targetId = ally.id;
      }
    }
    _companionScreen(guard,healer,threat) {
      if (healer.action === 'retreat') return null;
      const marching = healer.action === 'move' || healer.action === 'attackmove';
      const facing = this._enemy(healer,threat) && this._gap(healer,threat) <= 104 ? threat :
        marching && (healer.path[healer.pathIndex] || healer.destination);
      if (!facing) return null;
      const length = distance(healer,facing);
      if (length < 1) return null;
      const dx = (facing.x-healer.x)/length, dy = (facing.y-healer.y)/length;
      const flank = (guard.id%3-1)*7;
      // Close ranks at the ordered destination instead of entering an unrequested fight beyond it.
      const reach = marching && healer.destination ? Math.min(22,distance(healer,healer.destination)+9) : 22;
      for (const [lead,side] of [[reach,flank],[Math.min(reach,20),0],[Math.min(reach,12),0]]) {
        const point = {x:healer.x+dx*lead-dy*side,y:healer.y+dy*lead+dx*side};
        if (this.nav.pass(point.x,point.y) && this.nav.clearLine(healer,point) && this.nav.clearLine(guard,point)) return point;
      }
      return null;
    }
    _escort(e,dt) {
      const anchor = this.byId.get(e.escortId);
      if (!anchor || anchor.hp <= 0) { this._finishOrder(e); return; }
      const healing = e.faction === 'myren' && e.type === 'specialist';
      const separation = distance(e,anchor);
      if (separation > (healing ? 57 : 68)) {
        e.escortThreatId = null;
        this._walk(e,anchor,dt);
        return;
      }
      const range = this._combatStats(e).range;
      if (e.scanClock <= 0) {
        e.scanClock = 0.36 + e.id % 5 * 0.02;
        const focus = anchor.action === 'attack' && this.byId.get(anchor.targetId);
        const assist = this._enemy(anchor,focus) && this._gap(anchor,focus) <= this._combatStats(anchor).range + 5;
        const threat = assist ? focus : this._findTarget(e,range + 25,anchor);
        if (e.escortThreatId !== (threat?.id ?? null)) this._clearPath(e);
        e.escortThreatId = threat?.id ?? null;
      }
      const threat = this.byId.get(e.escortThreatId);
      const companion = anchor.marchCompanions?.has(e.id);
      const spacing = healing ? 30 : 22;
      if (this._enemy(e,threat)) {
        if (this._gap(e,threat) <= range) {
          this._attack(e,threat,dt,false);
        } else if (!companion && !healing && !anchor.moving && separation < 58 && this._gap(anchor,threat) <= (threat.targetId === anchor.id ? 104 : 64)) {
          this._attack(e,threat,dt,true);
          return;
        }
      }
      if (companion) {
        const screen = this._companionScreen(e,anchor,threat);
        if (screen) {
          if (distance(e,screen)>3) this._walk(e,screen,dt,true);
          return;
        }
      }
      if (separation > spacing || (healing && anchor.hp < anchor.maxHp && !this.nav.clearLine(e,anchor))) this._walk(e,anchor,dt);
    }
    _guardContact(e,site,range) {
      const radius = this.guardRadius(site);
      const rivals = this.entities.filter(t => isUnit(t) && this._enemy(e,t) && distance(site,t) <= radius);
      const score = t => (t.action === 'attack' && t.targetId === site.id ? -180 : 0) +
        (t.type === 'worker' ? 90 : 0) + distance(e,t);
      rivals.sort((a,b) => score(a)-score(b));
      for (const target of rivals) {
        if (this._gap(e,target) <= range) return {target,intercept:null};
        const intercept = this._approach(e,target,Math.max(4,range-5));
        if (!this.nav.pass(intercept.x,intercept.y) || distance(site,intercept)>radius) continue;
        if (!this.nav.clearLine(e,intercept)) {
          const route = this.nav.route(e,intercept);
          // Both banks may share a map component via a distant bridge. Stay inside the post's boundary.
          if (!route.length || route.some(p => distance(site,p)>radius)) continue;
        }
        return {target,intercept};
      }
      return {target:null,intercept:null};
    }
    _guard(e,dt) {
      const site = this.byId.get(e.targetId);
      if (!guardable(site)) {
        this._finishOrder(e);
        if (e.action !== 'idle') return;
        const home = this._owned(e.faction,b => b.type === 'hq')[0];
        const destination = home && this._retreatSlots([e],home).get(e.id);
        if (destination) { this._set(e,'retreat',home); e.destination = destination; }
        return;
      }
      if (e.guardRevision !== this.nav.revision) {
        e.guardRevision = this.nav.revision;
        e.guardPoint = this._guardStation(e,site);
        e.guardThreatId = null;
        e.guardIntercept = null;
        e.scanClock = 0;
        this._clearPath(e);
      }
      if (!e.guardPoint) return;
      const radius = this.guardRadius(site),range = this._combatStats(e).range;
      if (distance(e,site) <= radius) {
        if (e.scanClock <= 0) {
          e.scanClock = .38+e.id%5*.03;
          const {target,intercept} = this._guardContact(e,site,range);
          if ((target?.id ?? null) !== e.guardThreatId) this._clearPath(e);
          e.guardThreatId = target?.id ?? null;
          e.guardIntercept = intercept;
        }
        const target = this.byId.get(e.guardThreatId);
        if (this._enemy(e,target) && distance(site,target) <= radius) {
          if (this._gap(e,target) <= range) this._attack(e,target,dt,false);
          else if (e.guardIntercept) this._walk(e,e.guardIntercept,dt);
          return;
        }
      }
      if (e.guardThreatId) { e.guardThreatId = null; e.guardIntercept = null; this._clearPath(e); }
      if (distance(e,e.guardPoint)>4) this._walk(e,e.guardPoint,dt);
    }
    _unit(e, dt) {
      e.moving = false;
      e.routeClock -= dt;
      e.scanClock -= dt;
      if (e.volleyTargetId) {
        const target = this.byId.get(e.volleyTargetId);
        if (target && this._canVolley(e,target,target.markedUntil-this.time)) {
          if (e.attackClock > 0) return;
          this._attack(e,target,dt,false);
          e.volleyTargetId = null;
          return;
        }
        e.volleyTargetId = null;
      }
      if (e.type === 'specialist' && e.faction === 'myren') this._support(e);
      if (e.action === 'guard') { this._guard(e,dt); return; }
      if (e.action === 'escort') { this._escort(e,dt); return; }
      if (e.type === 'worker' && this.salvage?.work(e,dt)) return;
      if (e.action === 'repair') { this._repair(e,dt); return; }
      if (e.action === 'hold') {
        if (e.attackClock <= 0 && e.scanClock <= 0) {
          const target = this._findTarget(e, this._combatStats(e).range);
          e.targetId = target?.id ?? null;
          if (target) this._attack(e, target, dt, false);
          else e.scanClock = 0.24;
        }
        return;
      }
      if (e.action === 'build' || e.action === 'gather' || e.action === 'return') { this._work(e, dt); return; }
      if (e.action === 'retreat') {
        const home = this.byId.get(e.targetId);
        if (!home || home.hp <= 0) { this._finishOrder(e); return; }
        if (this._walk(e,e.destination,dt)) {
          if (e.routeFailed) {
            const spot = this._retreatSlots([e],home).get(e.id);
            if (spot) { e.destination = spot; this._clearPath(e); return; }
          } else if (e.rescueCandidate && !e.rescued && e.hp > 0) {
            e.rescued = true;
            const report = this.report[e.faction];
            if (++report.rescued === 1) this._event('부상병 귀환 · '+this.name(e.type,e.faction),'rescue',e);
          }
          this._finishOrder(e);
        }
        return;
      }
      if (e.action === 'move') {
        if (this._walk(e, e.destination, dt)) this._finishOrder(e);
        return;
      }
      if (e.action === 'attack') {
        let target = this.byId.get(e.targetId);
        if (e.autoTarget && e.scanClock <= 0) {
          e.scanClock = 0.42;
          const range = this._combatStats(e).range;
          if (!this._enemy(e,target) || this._gap(e,target) > range) {
            const inRange = this._findTarget(e,range);
            if (inRange) {
              target = inRange;
              e.targetId = inRange.id;
              this._clearPath(e);
            }
          }
        }
        if (this._enemy(e, target)) { this._attack(e, target, dt, true); return; }
        const dest = e.followDestination;
        if (dest) this._setMove(e, dest, true);
        else { this._finishOrder(e); return; }
      }
      if (e.scanClock <= 0 && military(e)) {
        e.scanClock = 0.4 + (e.id % 7) * 0.017;
        const target = this._findTarget(e, this._combatStats(e).range + 46);
        if (target) {
          const dest = e.action === 'attackmove' ? e.destination : null;
          this._set(e, 'attack', target);
          e.autoTarget = true;
          e.followDestination = dest;
          this._attack(e, target, dt, true);
          return;
        }
      }
      if (e.action === 'attackmove' && this._walk(e, e.destination, dt)) this._finishOrder(e);
    }
    reinforcementOrigin(building) {
      if (!building || !['hq','barracks'].includes(building.type) || building.hp <= 0) return null;
      const [rx, ry] = RULES[building.type].size;
      const cell = this.nav.cell(building.x + (building.id % 2 ? 1 : -1) * rx * 0.42, building.y + ry + 13);
      return cell < 0 ? null : {x:TX(cell),y:TY(cell)};
    }
    _building(e, dt) {
      if (e.progress < 1) return;
      if (e.queue.length) {
        const q = e.queue[0];
        q.remaining = Math.max(0, q.remaining - dt);
        const origin = q.remaining === 0 ? this.reinforcementOrigin(e) : null;
        if (origin) {
          e.queue.shift();
          const u = this._spawn(q.type, e.faction, origin.x, origin.y);
          this.report[e.faction].trained++;
          if (e.rally) {
            const target = this.byId.get(e.rally.targetId);
            if (isUnit(u) && u.type === 'worker' && target?.hp > 0 && isResource(target)) this._gather(u, target);
            else this._setMove(u, e.rally, military(u));
          }
          if (e.faction === this.faction) this._event(this.name(q.type) + ' 배치 완료', 'train', u);
        }
      }
      if (e.autoTrain) this._repeatTraining(e);
      if (!RULES[e.type].power || e.attackClock > 0) return;
      e.scanClock -= dt;
      if (e.scanClock > 0) return;
      e.scanClock = 0.38;
      const enemy = this._findTarget(e, RULES[e.type].range);
      if (enemy) this._attack(e, enemy, dt, false);
    }

    _separate() {
      const units = this.entities.filter(e => isUnit(e) && e.hp > 0);
      for (let i = 0; i < units.length; i++) {
        for (let j = i + 1; j < units.length; j++) {
          const a = units[i], b = units[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) > 13 || Math.abs(dy) > 11) continue;
          const d = Math.hypot(dx, dy);
          const desired = (rulesFor(a.type, a.faction).size[0] + rulesFor(b.type, b.faction).size[0]) * 0.86;
          if (d >= desired) continue;
          // A marching companion can pass its healer on a narrow bridge. Withdrawing columns can compress too.
          const together = (a.faction === b.faction && a.action === 'retreat' && b.action === 'retreat') ||
            a.marchCompanions?.has(b.id) || b.marchCompanions?.has(a.id);
          const amount = Math.min(together ? 0.55 : 2.2, (desired - d) * 0.45);
          const ox = d > 0.01 ? dx / d * amount : Math.cos(a.id * 2 + b.id) * amount;
          const oy = d > 0.01 ? dy / d * amount : Math.sin(a.id * 2 + b.id) * amount;
          if (a.action !== 'hold' && this.nav.pass(a.x + ox, a.y + oy)) { a.x += ox; a.y += oy; }
          if (b.action !== 'hold' && this.nav.pass(b.x - ox, b.y - oy)) { b.x -= ox; b.y -= oy; }
        }
      }
    }

    _beaconStep(dt) {
      const b = this.beacon;
      let player = false, enemy = false;
      for (const unit of this.entities) {
        if (!military(unit) || unit.hp <= 0 || distance(unit,b) > b.radius) continue;
        if (unit.faction === this.faction) player = true;
        else enemy = true;
      }
      b.contested = player && enemy;
      if (!b.contested) {
        const side = player ? this.faction : (enemy ? this.enemyFaction : null);
        if (side && side !== b.owner) {
          if (b.claimant !== side) b.progress = 0;
          b.claimant = side;
          b.progress = Math.min(1, b.progress + dt / b.captureSeconds);
          if (b.progress >= 1 - 1e-9) {
            b.owner = side;
            b.claimant = null;
            b.progress = 0;
            b.incomeClock = 0;
            this.report[side].captures++;
            this._event((player ? '아군이 ' : '적군이 ') + this.beaconName + '를 점령했습니다.', 'beacon', b, player ? 'own' : 'enemy');
            return;
          }
        } else {
          b.claimant = null;
          b.progress = 0;
        }
      }
      if (!b.owner) return;
      b.incomeClock += dt;
      if (b.incomeClock >= b.incomePeriod) {
        b.incomeClock -= b.incomePeriod;
        this.bank[b.owner].crystal += b.crystalIncome;
        this.bank[b.owner].ore += b.oreIncome;
      }
    }

    _aiHouse(type) {
      const layout = this.terrain.layout;
      const positions = type === 'tower' ? [...layout.towerSites, ...layout.buildSites] : layout.buildSites;
      for (const [x, y] of positions) {
        if (!this._buildReason(type, x, y, this.enemyFaction) && this._build(type, x, y, this.enemyFaction)) return true;
      }
      return false;
    }
    _aiDepot(workers, army, base) {
      if (this.time < (this.nextDepotCheck || 120)) return;
      this.nextDepotCheck = this.time + 20;
      const side = base.faction, bank = this.bank[side];
      if (workers.length < 5 || army.length < 3 || bank.crystal < 195 || bank.ore < 65 || this.count('depot',side)) return;
      const remote = workers.filter(w => w.action === 'gather' || w.action === 'return').map(w => this.byId.get(w.depositId)).find(node =>
        node && isResource(node) && !node.homeFaction && node.amount >= 200 && distance(node,base) > 220);
      if (!remote || this.entities.some(e => this._enemy(base,e) && military(e) && distance(e,remote) < 150)) return;
      const expansion = this.terrain.layout.expansion;
      const x = (expansion.crystal[0]+expansion.ore[0])/2;
      const y = (expansion.crystal[1]+expansion.ore[1])/2;
      for (const r of [0,24,42,62,80]) {
        for (let i=0; i<(r ? 8 : 1); i++) {
          const a = i*Math.PI/4, px = x+Math.cos(a)*r, py = y+Math.sin(a)*r;
          if (!this._buildReason('depot',px,py,side) && this._build('depot',px,py,side)) return;
        }
      }
    }
    _nearHome(base, unit) {
      if (distance(base, unit) >= 282) return false;
      const route = this.nav.route(base, unit);
      if (!route.length) return false;
      let from = base, length = 0;
      for (const point of route) {
        length += distance(from, point);
        if (length > 335) return false;
        from = point;
      }
      return true;
    }
    _defendHQ(base, source) {
      if (this.time < (base.nextDefenceAt || 0)) return;
      base.nextDefenceAt = this.time + 3;
      const threats = this.entities.filter(e => this._enemy(base,e) && (e === source ||
        (e.targetId === base.id && e.action === 'attack' && this._gap(e,base) <= this._combatStats(e).range + 1)));
      if (!threats.length) return;
      const home = this._owned(base.faction,e => military(e) && !e.scouting && distance(e,base) <= 225);
      const fighting = home.filter(e => e.action === 'attack' && threats.includes(this.byId.get(e.targetId)));
      const cap = {easy:2,normal:5,hard:7}[this.difficulty];
      let needed = Math.min(cap,threats.length + 2) - fighting.length;
      if (needed <= 0) return;
      // Idle reserves can hear the alarm across their base. Marching armies keep their orders.
      const guards = home.filter(e => e.action === 'idle' || e.action === 'move');
      guards.sort((a,b) => distance(a,source) - distance(b,source));
      for (const guard of guards) {
        const threat = nearest(threats,guard);
        if (!this.nav.route(guard,this._approach(guard,threat,5)).length) continue;
        this._set(guard,'attack',threat);
        guard.defending = true;
        if (--needed === 0) break;
      }
    }
    _aiRepair(workers,base) {
      const side = base.faction;
      if (workers.length < 3 || this.bank[side].ore < 15 || workers.some(w => w.action === 'repair')) return;
      const threshold = {easy:.70, normal:.83, hard:.90}[this.difficulty];
      const damaged = this._owned(side,e => isBuilding(e) && e.progress === 1 && e.hp < e.maxHp * threshold);
      if (!damaged.length) return;
      const site = damaged.includes(base) ? base : damaged.reduce((a,b) => a.hp/a.maxHp < b.hp/b.maxHp ? a : b);
      const worker = this._repairHand(workers,site);
      if (worker) this._set(worker,'repair',site);
    }
    _aiRecruit(barracks, army, stats, underAttack) {
      const side = this.enemyFaction;
      const specials = army.filter(u => u.type === 'specialist').length + barracks.queue.filter(q => q.type === 'specialist').length;
      const due = army.length >= 4 && specials < 1 + Math.floor((army.length - 4) / 8);
      if (due && stats.cap - stats.pop >= this.population('specialist', side)) {
        if (this._train('specialist', side)) { this.specialSavingSince = null; return; }
        const cost = this.cost('specialist', side);
        if (!underAttack && stats.ore >= cost.ore * 0.65 && stats.crystal >= cost.crystal * 0.5) {
          this.specialSavingSince ??= this.time;
          if (this.time - this.specialSavingSince < 11) return;
        }
      }
      this.specialSavingSince = null;
      const heavy = army.filter(e => e.type === 'heavy').length;
      const wantHeavy = army.length >= 4 && heavy < Math.floor(army.length / 3);
      if (!wantHeavy || !this._train('heavy', side)) this._train('soldier', side);
    }
    _aiAsh(army) {
      const carts = army.filter(e => e.type === 'specialist' && e.ashReadyAt <= this.time);
      if (!carts.length) return;
      const upgraded = this.doctrine?.active('cinder','furnace');
      const radius = upgraded?52:42, limit = upgraded?5:4;
      const opponents = this._owned(this.faction,military);
      let best = null;
      for (const cart of carts) {
        const close = opponents.filter(t => distance(cart,t) <= ASH.range && this.terrain.ground(t.x,t.y));
        for (const target of close) {
          if (!this._ashDutyAllows(cart,target,radius)) continue;
          const group = close.filter(t => distance(t,target) <= radius).length;
          if (group < 3 || (best && best.group >= group)) continue;
          best = {cart,target,group};
        }
      }
      if (!best) return;
      this._launchAsh(best.cart,best.target.x,best.target.y,radius,limit);
      this.nextAiAsh = this.time+(this.difficulty === 'hard'?18:26);
    }
    _ai() {
      const armySide = this.enemyFaction;
      const base = this._owned(armySide, e => e.type === 'hq')[0];
      const enemy = this._owned(this.faction, e => e.type === 'hq')[0];
      if (!base || !enemy) return;
      const workers = this._owned(armySide, e => e.type === 'worker');
      const army = this._owned(armySide, military);
      if (armySide === 'cinder' && this.difficulty !== 'easy' && this.time >= (this.nextAiAsh ?? 70)) this._aiAsh(army);
      if (armySide === 'myren' && this.difficulty !== 'easy' && this.time >= (this.nextAiDew ?? 0)) {
        const ready = army.filter(e => e.type === 'specialist' && e.dewReadyAt <= this.time && this._dewDutyAllows(e));
        const pick = this._dewSuggestion(ready,true);
        if (pick) {
          this._tieDew(pick.source,pick.target);
          this.nextAiDew = this.time + (this.difficulty === 'hard' ? 8 : 13);
        }
      }
      const barracks = this._owned(armySide, e => e.type === 'barracks')[0];
      const assignedOre = workers.filter(w => this.byId.get(w.depositId)?.type === 'ore');
      for (const w of workers) {
        if (w.action !== 'idle') continue;
        const type = assignedOre.length < Math.max(1, Math.floor(workers.length * 0.3)) ? 'ore' : 'crystal';
        const node = this._nextNode(w, type);
        if (node) {
          this._gather(w, node);
          if (type === 'ore') assignedOre.push(w);
        }
      }
      const stats = this.stats(armySide);
      const settings = AI[this.difficulty];
      const incoming = this._owned(this.faction, u => military(u) && this._nearHome(base, u));
      const underAttack = incoming.length > 0 || this.time - base.lastHurt < 4;
      for (const guard of army) {
        if (guard.defending && !underAttack) {
          this._setMove(guard, { x: base.x - 19 + guard.id % 35, y: base.y + 60 }, true);
          guard.defending = false;
          continue;
        }
        if (!settings.intercept || distance(guard, base) > 285) continue;
        const intruder = nearest(incoming, guard);
        if (intruder && distance(intruder, guard) < settings.intercept) {
          const current = this.byId.get(guard.targetId);
          if (!guard.defending || guard.action !== 'attack' || !current || distance(current,guard) > distance(intruder,guard) + 30) {
            guard.waypoints.length = 0;
            this._set(guard, 'attack', intruder);
            guard.defending = true;
            guard.scouting = false;
          }
        }
      }
      const inProgress = this._owned(armySide, e => e.progress < 1);
      // Replace destroyed facilities and resume an interrupted construction site.
      for (const site of inProgress) {
        if (!workers.some(w => w.action === 'build' && w.targetId === site.id)) {
          const w = nearest(workers.filter(u => u.action !== 'build'), site);
          if (w) this._set(w, 'build', site);
        }
      }
      const saveForTower = !underAttack && this.time >= settings.towerTime && army.length >= 4 && !this.count('tower', armySide);
      if (!barracks && !inProgress.length) this._aiHouse('barracks');
      else if (stats.cap - stats.pop < 3 && !inProgress.length) this._aiHouse('house');
      else if (saveForTower && !inProgress.length) this._aiHouse('tower');
      else if (!underAttack && !inProgress.length) this._aiDepot(workers,army,base);
      if (!saveForTower && barracks?.progress === 1) this.doctrine?.considerResearch(army,underAttack);
      if (!saveForTower && workers.length < settings.workers && !base.queue.length && (!underAttack || army.length > incoming.length)) this._train('worker', armySide);
      if (!saveForTower && barracks?.progress === 1 && barracks.queue.length < settings.queue) {
        this._aiRecruit(barracks, army, stats, underAttack);
      }
      this._aiRepair(workers,base);
      for (const scout of army) {
        if (scout.scouting && scout.action === 'idle' && distance(scout, this.beacon) > this.beacon.radius) {
          this._setMove(scout, {x: this.beacon.x, y: this.beacon.y + 15}, true);
        }
      }
      const homeArmy = army.filter(e => !e.scouting && ['idle', 'move'].includes(e.action) && distance(e, base) < 290);
      if (this.time < this.nextRaid) {
        const b = this.beacon;
        if (!underAttack && this.time >= this.nextScout && b.owner !== armySide && homeArmy.length >= settings.defence + 3 && !army.some(e => e.scouting)) {
          const size = this.difficulty === 'hard' && homeArmy.length >= 7 ? 2 : 1;
          for (const scout of homeArmy.slice(-size)) {
            scout.scouting = true;
            scout.defending = false;
            this._setMove(scout, {x:b.x + scout.id % 18 - 9, y:b.y + 15}, true);
          }
          this.nextScout = this.time + 75;
        }
        return;
      }
      const reserve = Math.max(settings.defence, incoming.length * 2 + (underAttack ? 1 : 0));
      if (homeArmy.length < reserve + 2) { this.nextRaid = this.time + 9; return; }
      this.raidNumber++;
      const size = Math.min(homeArmy.length - reserve, (this.difficulty === 'easy' ? 2 : 3) + this.raidNumber);
      const raiders = homeArmy.slice(0,size);
      raiders.forEach((e, i) => {
        e.defending = false;
        this._setMove(e, { x: enemy.x + (i % 3 - 1) * 14, y: enemy.y + 19 + (i % 2) * 9 }, true);
      });
      this.nextRaid = this.time + settings.interval;
      const sighting = window.Scouting ? window.Scouting.launch(this,raiders,underAttack) : {text:'정찰 보고 · 적 '+size+'기가 출진했습니다.',x:raiders[0].x,y:raiders[0].y};
      if (sighting) this._event(sighting.text,'alert',sighting,'enemy');
    }

    update(seconds) {
      if (this.result || !Number.isFinite(seconds) || seconds <= 0) return;
      // Substeps keep movement and combat consistent with the visible clock at higher speeds.
      let remaining = seconds;
      while (remaining > 0.000001 && !this.result) {
        const dt = Math.min(remaining, 0.18);
        remaining -= dt;
        this.time += dt;
        for (const e of this.entities) {
          if (e.dewWard && e.hp > 0 && e.dewWard.end <= this.time+1e-8) this._mendDew(e);
        }
        this.doctrine?.update();
        this.tactics?.update(dt);
        for (const effect of this.effects) effect.age += dt;
        this.effects = this.effects.filter(fx => fx.age < fx.life);
        const length = this.entities.length;
        for (let i = 0; i < length; i++) {
          const e = this.entities[i];
          if (e.hp <= 0 || isResource(e)) continue;
          e.attackClock = Math.max(0, e.attackClock - dt);
          if (e.faction === 'myren' && e.progress === 1 && this.time - e.lastHurt > 12) e.hp = Math.min(e.maxHp, e.hp + dt * (isBuilding(e) ? 0.6 : 1.1));
          if (isUnit(e)) this._unit(e, dt);
          else this._building(e, dt);
          if (this.result) break;
        }
        if (this.ashBlooms.length && !this.result) this._landAsh();
        if (this.volleyWatches.size) this._stepVolleyWatches();
        if (this.result) this.ashBlooms.length = 0;
        let lostBuilding = false;
        if (this.entities.some(e => e.hp <= 0)) {
          this.entities = this.entities.filter(e => {
            if (e.hp > 0) return true;
            if (e.action === 'build' && e.faction === this.faction) this.vacatedSites.add(e.targetId);
            lostBuilding ||= isBuilding(e);
            this.byId.delete(e.id);
            return false;
          });
          this.selected = this.selected.filter(id => this.byId.has(id));
          for (const unit of this.entities) {
            if (unit.waypoints?.length) unit.waypoints = unit.waypoints.filter(p =>
              p.mode === 'return' || !p.targetId || this.byId.has(p.targetId));
          }
          if (lostBuilding) this._refreshNav();
        }
        if (this.result) break;
        if (this.vacatedSites.size) this._reportVacatedSites();
        this._beaconStep(dt);
        this.bell?.update();
        this.salvage?.update(dt);
        this.aiClock -= dt;
        if (this.aiClock <= 0) {
          this.aiClock = { easy: 8, normal: 5.4, hard: 3.6 }[this.difficulty];
          this._ai();
        }
        this.separationClock -= dt;
        if (this.separationClock <= 0) { this.separationClock = 0.10; this._separate(); }
      }
    }
  }
  window.Game = Game;
})();
