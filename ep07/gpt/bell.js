(() => {
  'use strict';

  class KilnBell {
    constructor(game) {
      this.game = game;
      this.nextRing = 45;
      this.radius = game.beacon.radius + 20;
      this.lastRing = null;
      for (const report of Object.values(game.report)) report.bellRings = 0;
    }

    update() {
      const g = this.game;
      if (g.result || g.time + 1e-8 < this.nextRing) return;
      const time = this.nextRing;
      this.nextRing += 30;
      const b = g.beacon;
      const disputed = b.contested || (b.claimant && b.claimant !== b.owner);
      let count = 0;
      if (b.owner && !disputed) {
        for (const unit of g.entities) {
          if (unit.hp <= 0 || unit.faction !== b.owner ||
              !['soldier', 'heavy', 'specialist'].includes(unit.type)) continue;
          if (Math.hypot(unit.x - b.x, unit.y - b.y) > this.radius) continue;
          unit.marchUntil = time + 12;
          count++;
        }
      }
      this.lastRing = {time, faction: count ? b.owner : null, count,
        reason: count ? '가속' : b.contested ? '경합' : b.claimant ? '점령 중' : b.owner ? '병력 부재' : '중립'};
      if (count) {
        g.report[b.owner].bellRings++;
        const own = b.owner === g.faction;
        g._event('종울림 · '+(own ? '아군 ' : '적군 ')+count+'기 행군 가속', 'bell', b, own ? 'own' : 'enemy');
      }
    }
  }

  window.KilnBell = KilnBell;
})();
