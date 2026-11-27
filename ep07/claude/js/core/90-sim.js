/* 해돌전쟁 — 시뮬레이션 한 틱 */
'use strict';
(function (g) {
  var R = g.RTS, DT = R.DT;
  var World = R.World;

  World.prototype.step = function () {
    if (this.over) return;
    this.tick++; this.time = this.tick * DT;
    var i, n;
    this.rebuildGrid();
    if (this.tick % 6 === 0) this.updateFog();

    // 자원 노드의 채굴 자리 점검 (죽었거나 떠난 일꾼 정리)
    for (i = 0; i < this.nodes.length; i++) {
      var node = this.nodes[i];
      if (!node.miners.length) continue;
      for (var k = node.miners.length - 1; k >= 0; k--) {
        var m = this.byId.get(node.miners[k]);
        if (!m || m.dead || m.order.type !== 'gather' || m.order.nodeId !== node.id || m.order.state !== 'mine') node.miners.splice(k, 1);
      }
    }

    for (i = 0; i < this.teams.length; i++) if (this.teams[i].ai) this.teams[i].ai.update();

    var units = this.units;
    n = units.length;
    for (i = 0; i < n; i++) if (!units[i].dead) R.Units.update(this, units[i]);
    R.Units.integrate(this);

    var blds = this.buildings;
    n = blds.length;
    for (i = 0; i < n; i++) if (!blds[i].dead) R.Buildings.update(this, blds[i]);

    R.Units.updateProjectiles(this);
    R.Powers.update(this);
    this.cleanup();
    if (this.tick % 15 === 0) this.checkVictory();
    else if (this.tick % 31 === 0) for (i = 0; i < this.teams.length; i++) if (this.teams[i].alive) this.recount(this.teams[i]);
  };

  /* 게임 만들기
     opts: { seed, mapSize, players: [{ faction, ai: 난이도(0~2) 또는 생략, name }], keepEvents } */
  R.createGame = function (opts) {
    var W = new World(opts);
    for (var i = 0; i < W.teams.length; i++) if (W.teams[i].isAI) W.teams[i].ai = new R.AI(W, i);
    return W;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
