(() => {
  'use strict';

  // Paired bridges run west to east across one intermediate island in each lane.
  const crossings = {
    shoals: {names:['가운데 다리','동쪽 다리','남쪽 봉화 다리']},
    delta: {names:['북쪽 나무다리','북쪽 나무다리','남쪽 돌다리','남쪽 돌다리'],paired:true},
    kiln: {names:['종루 둑길','종루 둑길','북쪽 사슬다리','북쪽 사슬다리'],paired:true},
    lantern: {names:['달등 돌길','달등 돌길','갈대 목교','갈대 목교'],paired:true}
  };

  // Follow the actual navigation route backwards from the target. Its last
  // crossing is the bridge where a defender on the home island can intercept.
  function defensiveBridge(origin, route, bridges) {
    for (let i = route.length - 1; i >= 0; i--) {
      const from = i ? route[i-1] : origin, to = route[i];
      let last = null;
      for (const bridge of bridges) {
        const {a,b,width} = bridge;
        const dx = b[0]-a[0], dy = b[1]-a[1];
        const cx = (a[0]+b[0])/2, cy = (a[1]+b[1])/2;
        const direction = (to.x-from.x)*dx + (to.y-from.y)*dy;
        if (!direction) continue;
        const t = ((cx-from.x)*dx + (cy-from.y)*dy)/direction;
        if (t < 0 || t > 1 || (last && t <= last.t)) continue;
        const x = from.x + t*(to.x-from.x), y = from.y + t*(to.y-from.y);
        if (Math.hypot(x-cx,y-cy) <= width/2) {
          last = {bridge,exit:direction > 0 ? b : a,t};
        }
      }
      if (last) return last;
    }
    return null;
  }

  function distanceToLane(unit,lane) {
    const points = [lane[0].a,lane[0].b,lane[1].a,lane[1].b];
    let shortest = Infinity;
    for (let i=1;i<points.length;i++) {
      const [x,y] = points[i-1], dx = points[i][0]-x, dy = points[i][1]-y;
      const t = Math.max(0,Math.min(1,((unit.x-x)*dx+(unit.y-y)*dy)/(dx*dx+dy*dy)));
      shortest = Math.min(shortest,Math.hypot(unit.x-x-t*dx,unit.y-y-t*dy));
    }
    return shortest;
  }

  function redirectFlank(game,marches) {
    const bridges = game.terrain.bridges;
    const lanes = [bridges.slice(0,2),bridges.slice(2,4)];
    const pressure = [0,0], weights = {tower:3,heavy:2,soldier:1,specialist:1};
    for (const unit of game.entities) {
      const weight = weights[unit.type];
      if (!weight || unit.faction!==game.faction || unit.hp<=0 || unit.progress<1) continue;
      for (let i=0;i<lanes.length;i++) {
        if (distanceToLane(unit,lanes[i]) <= (unit.type==='tower'?112:90)) pressure[i]+=weight;
      }
    }
    if (Math.abs(pressure[0]-pressure[1]) < (game.difficulty==='hard'?2:3)) return;
    const lane = lanes[pressure[0]<pressure[1]?0:1];
    let slots = Math.floor(marches.length/2)-marches.filter(m=>m.crossing?.bridge===lane[0]).length;
    if (slots<=0) return;
    const candidates = marches.filter(m=>m.crossing && m.crossing.bridge!==lane[0] &&
      (m.unit.type==='soldier' || (m.unit.type==='specialist' && m.unit.faction==='velari')));
    candidates.sort((a,b)=>game.unitStats(b.unit.type,b.unit.faction).speed-game.unitStats(a.unit.type,a.unit.faction).speed);
    const x = (lane[0].b[0]+lane[1].a[0])/2, y = (lane[0].b[1]+lane[1].a[1])/2;
    for (const march of candidates) {
      const unit = march.unit, goal = {...unit.destination,mode:'attackmove'};
      const via = {x:x+(unit.id%3-1)*8,y:y+(unit.id%2?4:-4),mode:'attackmove'};
      if (!game.nav.pass(via.x,via.y)) continue;
      const inbound = game.nav.route(unit,via), onward = game.nav.route(via,goal);
      if (!inbound.length || !onward.length) continue;
      const entry = defensiveBridge(unit,inbound,bridges), exit = defensiveBridge(via,onward,bridges);
      if ((entry && entry.bridge!==lane[1]) || exit?.bridge!==lane[0]) continue;
      game._issueWaypoint(unit,via,false);
      game._issueWaypoint(unit,goal,true);
      march.crossing=exit;
      if (--slots===0) break;
    }
  }

  function launch(game,raiders,defending) {
    const bridges = game.terrain.bridges, marches = [];
    for (const unit of raiders) {
      if (unit.hp<=0 || unit.faction!==game.enemyFaction || unit.action!=='attackmove' || !unit.destination) continue;
      const route = game.nav.route(unit,unit.destination);
      if (route.length) marches.push({unit,crossing:defensiveBridge(unit,route,bridges)});
    }
    if (!marches.length) return null;
    const map = crossings[game.mapId];
    if (map?.paired && game.difficulty!=='easy' && !defending && marches.length>=3) {
      redirectFlank(game,marches);
    }
    const groups = new Map();
    for (const {unit,crossing} of marches) {
      const key = crossing?.bridge || null;
      let group = groups.get(key);
      if (!group) {
        const [x,y] = crossing ? crossing.exit : [unit.x,unit.y];
        const label = crossing ? (map?.names[bridges.indexOf(key)] || '본진 진입로') : '본진 앞';
        group = {label,x,y,count:0,types:new Map()};
        groups.set(key,group);
      }
      group.count++;
      group.types.set(unit.type,(group.types.get(unit.type)||0)+1);
    }
    const approaches = Array.from(groups.values()).sort((a,b)=>b.count-a.count).map(group=>({
      label:group.label, x:group.x, y:group.y, count:group.count,
      composition:Array.from(group.types,([type,count])=>game.name(type,game.enemyFaction)+' '+count+'기').join(' · ')
    }));
    const primary = approaches[0];
    const summary = approaches.length===1 ? primary.label+'에 적 '+primary.count+'기 접근' :
      '적군 접근 · '+approaches.map(lane=>lane.label+' '+lane.count+'기').join(' / ');
    return {text:'정찰 보고 · '+summary,x:primary.x,y:primary.y,approaches};
  }

  window.Scouting = {launch};
})();
