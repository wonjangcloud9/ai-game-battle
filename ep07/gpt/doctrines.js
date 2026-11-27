/* Riftwake — headquarters research, paid from the same stockpile as reinforcements. */
(() => {
  'use strict';
  const price = Object.freeze({crystal:75, ore:30});
  const duration = 22;
  const catalogue = {
    velari:[
      {id:'afterimage', name:'잔향 각인', description:'결맥 추적자의 표식이 4초에서 7초로 늘고, 표식에 대한 아군 후속 공격의 추가 피해가 20%에서 35%로 증가합니다.'},
      {id:'farlens', name:'겹빛 렌즈', description:'결창수와 프리즘 거신의 사거리가 13 늘어납니다. 이미 배치된 병력에도 적용됩니다.'}
    ],
    cinder:[
      {id:'fault', name:'균열 쐐기', description:'적철 파쇄기의 건물 공격 배율이 1.5배에서 2배로 증가합니다.'},
      {id:'furnace', name:'겹불 화실', description:'노을풀무차의 폭발 반경이 35에서 48로 늘고, 함께 맞는 주변 적이 최대 4기가 됩니다. 잿꽃탄도 반경 52 안의 적 5기까지 타격합니다.'}
    ],
    myren:[
      {id:'budding', name:'쌍눈 발아', description:'연구 완료 후 예약하는 이슬지기와 갈잎 사수의 훈련 시간이 25% 단축됩니다.'},
      {id:'nectar', name:'별꿀 도관', description:'꽃실 엮음이의 1회 치유량이 13에서 20으로 늘고, 치유 사거리가 75에서 90으로 증가합니다.'}
    ]
  };
  for (const pair of Object.values(catalogue)) {
    pair.forEach(Object.freeze);
    Object.freeze(pair);
  }

  class Doctrines {
    constructor(game) {
      this.game = game;
      this.jobs = new Map();
      for (const faction of [game.faction,game.enemyFaction]) game.report[faction].doctrine = null;
    }
    options(faction = this.game.faction) {
      return Object.hasOwn(catalogue,faction) ? catalogue[faction] : [];
    }
    cost() { return price; }
    active(faction,id) { return this.game.report[faction]?.doctrine === id; }
    status(faction = this.game.faction) {
      const job = this.jobs.get(faction);
      if (job) return {phase:'researching',id:job.choice.id,duration,remaining:Math.max(0,job.end - this.game.time)};
      const id = this.game.report[faction]?.doctrine || null;
      return {phase:id ? 'active' : 'none',id,remaining:0,duration};
    }
    _base(faction) {
      return this.game.entities.find(e => e.faction === faction && e.type === 'hq' && e.progress === 1 && e.hp > 0);
    }
    reason(id,faction = this.game.faction) {
      const g = this.game;
      if (g.result) return '종료된 교전입니다.';
      if (!this.options(faction).some(option => option.id === id)) return '이 진영의 교리를 선택하세요.';
      if (g.report[faction]?.doctrine) return '이미 이번 교전의 교리를 확정했습니다.';
      if (this.jobs.has(faction)) return '이미 교리를 연구 중입니다.';
      if (!this._base(faction)) return '교리를 연구할 사령부가 필요합니다.';
      const bank = g.bank[faction], missing = [];
      if (bank.crystal < price.crystal) missing.push('빛결정 ' + Math.ceil(price.crystal - bank.crystal));
      if (bank.ore < price.ore) missing.push('불씨광 ' + Math.ceil(price.ore - bank.ore));
      return missing.length ? missing.join(' · ') + ' 부족' : '';
    }
    _announce(faction,job,stage) {
      const side = faction === this.game.faction ? '아군' : '적군';
      this.game._event(side+' 교리 · '+job.choice.name+' 연구 '+stage,'doctrine',job.base);
    }
    _start(id,faction) {
      const g = this.game, own = faction === g.faction;
      const reason = this.reason(id,faction);
      if (reason) return own ? g._say(reason) : false;
      const choice = this.options(faction).find(option => option.id === id);
      const job = {choice,base:this._base(faction),end:g.time + duration};
      g.bank[faction].crystal -= price.crystal;
      g.bank[faction].ore -= price.ore;
      this.jobs.set(faction,job);
      this._announce(faction,job,'시작');
      return own ? g._say(choice.name+' 연구를 시작했습니다.',true) : true;
    }
    research(id) { return this._start(id,this.game.faction); }
    cancel() {
      const g = this.game, faction = g.faction, job = this.jobs.get(faction);
      if (g.result) return g._say('종료된 교전입니다.');
      if (!job) return g._say('취소할 교리 연구가 없습니다.');
      this.jobs.delete(faction);
      g.bank[faction].crystal += price.crystal;
      g.bank[faction].ore += price.ore;
      this._announce(faction,job,'취소');
      return g._say(job.choice.name+' 연구를 취소하고 자원을 돌려받았습니다.',true);
    }
    update() {
      for (const [faction,job] of this.jobs) {
        if (job.base.hp <= 0 || this.game.result) {
          this.jobs.delete(faction);
        } else if (this.game.time + 1e-8 >= job.end) {
          this.game.report[faction].doctrine = job.choice.id;
          this.jobs.delete(faction);
          this._announce(faction,job,'완료');
        }
      }
    }
    considerResearch(army,underAttack) {
      const g = this.game, faction = g.enemyFaction;
      const earliest = {easy:103,normal:68,hard:48}[g.difficulty];
      if (g.time < earliest || army.length < 3 || underAttack || this.jobs.has(faction) || g.report[faction].doctrine) return;
      if (g.bank[faction].crystal < price.crystal || g.bank[faction].ore < price.ore) return;
      let id;
      if (faction === 'velari') id = g.faction === 'cinder' || g.count('heavy') >= 2 ? 'afterimage' : 'farlens';
      else if (faction === 'cinder') id = g.count('tower') || (g.mapId === 'delta' && g.count('soldier') < 6) ? 'fault' : 'furnace';
      else id = g.faction === 'cinder' || g.count('specialist') >= 2 ? 'nectar' : 'budding';
      this._start(id,faction);
    }
  }
  window.Doctrines = Doctrines;
})();
