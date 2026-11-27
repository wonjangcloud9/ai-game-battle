(() => {
  'use strict';
  const panels = new WeakMap();
  const matchRecords = new WeakMap();
  const difficulty = {easy:'쉬움', normal:'보통', hard:'어려움'};
  const numbers = new Intl.NumberFormat('ko-KR');
  const records = [
    ['trained','훈련한 유닛'], ['kills','격파한 유닛'],
    ['harvestedCrystal','채집한 빛결정'], ['harvestedOre','채집한 불씨광'],
    ['buildings','완공한 건물'], ['captures','봉화 점령 횟수'],
    ['salvaged','회수한 물결 금고'], ['repairedHp','수리한 건물 체력']
  ];

  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }
  function button(className, label, callback) {
    const node = element('button',className,label);
    node.type = 'button';
    node.addEventListener('click',callback);
    return node;
  }
  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function clock(seconds) {
    const whole = Math.max(0,Math.floor(seconds));
    return [Math.floor(whole/60),whole%60].map(n=>String(n).padStart(2,'0')).join(':');
  }
  function art(width,height,paint) {
    const node = element('canvas','ops-art');
    node.width = width;
    node.height = height;
    node.setAttribute('aria-hidden','true');
    paint(node.getContext('2d'));
    return node;
  }
  function doctrineChoice(g,side) {
    const study=g.doctrine?.status(side);
    if (!study?.id) return null;
    const choice=g.doctrine.options(side).find(item=>item.id===study.id);
    return choice ? {name:choice.name,study} : null;
  }
  function buildingRow(state,e) {
    const {g} = state;
    const root = element('article','ops-building');
    const header = element('div','ops-building-header');
    const icon = art(42,38,c=>Art.draw(c,e.type,e.faction,21,34,{size:e.type==='hq'?.32:.46}));
    const identity = element('div','ops-building-identity');
    const name = g.name(e.type,e.faction);
    const status = element('small','ops-building-status');
    identity.append(element('h3','',name),status);
    const focus = button('ops-focus','건물 선택',()=>{
      if (e.hp>0 && g.entities.includes(e)) state.actions.focus(e);
    });
    focus.setAttribute('aria-label',name+' 건물 선택');
    header.append(icon,identity,focus);
    const list = element('ol','ops-jobs');
    root.append(header);
    let autoRow, autoSelect, doctrineButton;
    if (e.type==='hq') {
      doctrineButton=button('ops-doctrine-link','교리 연구',()=>state.actions.doctrine?.());
      doctrineButton.addEventListener('keydown',ev=>{if(ev.key===' '||ev.key==='Enter')ev.stopPropagation();});
      root.append(doctrineButton);
    }
    if (e.type==='barracks') {
      autoRow=element('label','ops-auto');
      autoSelect=element('select','ops-auto-select');
      autoSelect.setAttribute('aria-label',name+' 자동 충원');
      autoSelect.title='대기열이 비면 지정한 병종을 훈련합니다. 일반 훈련과 같은 자원과 인구가 필요하며, 부족하면 기다립니다.';
      for (const value of ['','soldier','heavy','specialist']) {
        const label=value?g.name(value,e.faction):'끔';
        const option=element('option','',label);
        option.value=value;
        autoSelect.append(option);
      }
      autoSelect.addEventListener('change',()=>{
        if (!g.result && e.hp>0 && e.progress===1 && g.entities.includes(e)) state.actions.auto(e,autoSelect.value||null);
      });
      for(const event of ['keydown','keyup']) autoSelect.addEventListener(event,ev=>ev.stopPropagation());
      autoRow.append(element('span','','자동 충원'),autoSelect);
      root.append(autoRow);
    }
    root.append(list);
    return {root,status,list,autoRow,autoSelect,doctrineButton,jobs:new Map()};
  }
  function jobRow(state,e,q) {
    const {g} = state, name = g.name(q.type,e.faction);
    const root = element('li','ops-job');
    const portrait = art(24,28,c=>Art.draw(c,q.type,e.faction,12,25,{size:q.type==='specialist'?.50:.79}));
    const details = element('div','ops-job-details');
    const labels = element('div','ops-job-labels');
    const countdown = element('small','ops-countdown');
    const progress = element('progress','ops-progress');
    progress.max = 100;
    progress.setAttribute('aria-label',name+' 훈련 진행률');
    const unit=element('strong','',name);
    if(q.automatic) unit.append(element('span','ops-auto-tag','자동'));
    labels.append(unit,countdown);
    details.append(labels,progress);
    const cancel = button('ops-cancel',q.automatic?'취소·중지':'취소',()=>{
      if (!g.result && e.hp>0 && g.entities.includes(e) && e.queue.includes(q)) state.actions.cancel(e,q);
    });
    const cost = g.cost(q.type,e.faction);
    cancel.title = '취소하면 빛결정 '+numbers.format(cost.crystal)+' · 불씨광 '+numbers.format(cost.ore)+' 환불';
    if(q.automatic) cancel.title+=' · 이 병영의 자동 충원도 중지';
    cancel.setAttribute('aria-label',name+' 훈련 취소. '+cancel.title);
    root.append(portrait,details,cancel);
    return {root,countdown,progress,cancel};
  }
  // Preserve the DOM nodes of surviving buildings and jobs, including keyboard focus.
  function syncItems(parent,collection,cache,create,update) {
    const live = new Set(collection);
    for (const [key,view] of cache) {
      if (live.has(key)) continue;
      view.root.remove();
      cache.delete(key);
    }
    collection.forEach((item,index)=>{
      let view = cache.get(item);
      if (!view) { view=create(item); cache.set(item,view); }
      if (parent.children[index]!==view.root) parent.insertBefore(view.root,parent.children[index]||null);
      update(item,view,index);
    });
  }
  function queue(panel,g,actions) {
    let state = panels.get(panel);
    if (!state || state.g!==g || state.root.parentNode!==panel) {
      const root = element('div','ops-queue');
      const summary = element('p','ops-queue-summary');
      const list = element('div','ops-building-list');
      const empty = element('p','ops-empty','아군 생산 건물이 없습니다.');
      root.append(summary,list,empty);
      panel.replaceChildren(root);
      state = {g,actions,root,summary,list,empty,buildings:new Map()};
      panels.set(panel,state);
    }
    state.actions=actions;
    const buildings=g.entities.filter(e=>e.hp>0 && e.faction===g.faction && (e.type==='hq'||e.type==='barracks'));
    const busy=buildings.filter(e=>e.queue.length>0).length;
    const pending=buildings.reduce((n,e)=>n+Math.max(0,e.queue.length-1),0);
    setText(state.summary,'생산 건물 '+buildings.length+' · 훈련 중 '+busy+' · 대기 '+pending);
    state.empty.hidden=buildings.length>0;
    syncItems(state.list,buildings,state.buildings,e=>buildingRow(state,e),(e,view)=>{
      const underConstruction=e.progress<1;
      let status='생산 대기';
      if(underConstruction){
        const phase=g.constructionCrew(e).length?'건설 중':'공사 중단 · 일꾼 없음';
        status=phase+' · '+Math.floor(e.progress*100)+'%';
      }
      if(e.autoTrain && !underConstruction) status='자동 충원 대기';
      if (e.queue.length) status='훈련 중'+(e.queue.length>1?' · 대기 '+(e.queue.length-1):'');
      setText(view.status,status);
      if(view.doctrineButton){
        const choice=doctrineChoice(g,e.faction);
        const progress=choice?.study.phase==='researching' ? Math.ceil(choice.study.remaining)+'초' : '적용 중';
        const label=choice ? choice.name+' · '+progress : '교리 연구';
        setText(view.doctrineButton,label);
        view.doctrineButton.title='사령부 교리 연구 열기';
        view.doctrineButton.setAttribute('aria-label','사령부 교리 연구 열기 · '+label);
        view.doctrineButton.disabled=!g.doctrine||typeof state.actions.doctrine!=='function'||Boolean(g.result);
      }
      if(view.autoRow){
        view.autoRow.hidden=underConstruction;
        view.autoSelect.disabled=underConstruction||Boolean(g.result);
        if(view.autoSelect.value!==(e.autoTrain||'')) view.autoSelect.value=e.autoTrain||'';
      }
      view.root.classList.toggle('ops-active',Boolean(e.queue.length));
      view.list.hidden=!e.queue.length;
      let elapsed=0;
      syncItems(view.list,e.queue,view.jobs,q=>jobRow(state,e,q),(q,entry,i)=>{
        const seconds=Math.max(0,q.remaining);
        const percent=q.total>0?Math.max(0,Math.min(100,Math.round((1-seconds/q.total)*100))):0;
        const time=i===0?'남은 '+Math.ceil(seconds)+'초':Math.ceil(elapsed)+'초 후 시작';
        setText(entry.countdown,time);
        entry.progress.hidden=i!==0;
        if (entry.progress.value!==percent) entry.progress.value=percent;
        entry.cancel.disabled=Boolean(g.result);
        elapsed+=seconds;
      });
    });
  }

  function readStat(report,key) {
    const value=report?.[key];
    return Number.isFinite(value)?value:null;
  }
  function eventType(event) {
    switch(event.kind){
      case 'info': return event.time===0?'opening':null;
      case 'salvage': return !event.recoveryWorkerLost&&['own','enemy'].includes(event.side)?'salvage':null;
      case 'doctrine': return event.text.endsWith('연구 완료')?'doctrine':null;
      case 'battle': return 'structure';
      case 'alert':
        if(event.text.includes('파괴')) return 'structure';
        return event.text.includes('정찰')?'scout':'base';
      case 'repair': return event.text.endsWith('수리 완료')?'repair':null;
      case 'build': return event.text.endsWith('건설 완료')?'build':null;
      case 'rescue': case 'bell': case 'beacon': case 'ability': case 'siege': case 'result': return event.kind;
      default: return null;
    }
  }
  // Keep the opening and latest entry of each kind per side even after the live log rolls over.
  function observe(g) {
    const events=g.events,latest=events.at(-1);
    if(!latest) return;
    let record=matchRecords.get(g);
    if(!record){record={seen:null,moments:new Map()};matchRecords.set(g,record);}
    if(latest===record.seen) return;
    const from=record.seen?events.lastIndexOf(record.seen)+1:0;
    for(let i=from;i<events.length;i++){
      const event=events[i],type=eventType(event);
      if(!type) continue;
      const key=type+'/'+event.side+(type==='structure'?'/'+event.text:''), moment={type,event};
      const slot=record.moments.get(key);
      if(slot) slot.last=moment;
      else record.moments.set(key,{first:moment,last:moment});
    }
    record.seen=latest;
  }
  function highlights(g) {
    observe(g);
    const slots=matchRecords.get(g)?.moments.values()||[];
    const moments=new Set();
    for(const slot of slots){moments.add(slot.first);moments.add(slot.last);}
    const ordered=[...moments].sort((a,b)=>a.event.time-b.event.time);
    const selected=new Set();
    const limit=5+Number(ordered.some(m=>m.type==='bell'))+Number(ordered.some(m=>m.type==='rescue'));
    const add=moment=>{if(moment&&selected.size<limit) selected.add(moment)};
    const objective=m=>m.type==='beacon'||m.type==='salvage';
    const defeated=g.result==='win'?'enemy':'own';
    const firstObjective=ordered.find(objective);
    const assault=ordered.find(m=>m.type==='siege'&&m.event.side===defeated);
    add(ordered.find(m=>m.type==='result'));
    add(firstObjective);
    add(assault);
    add(ordered.find(m=>m.type==='rescue'));
    const rings=ordered.filter(m=>m.type==='bell');
    add(rings.findLast(m=>m.event.side!==defeated&&m.event.time<=(assault?.event.time??g.time))||rings.at(-1));
    add(ordered.find(m=>m.type==='doctrine'&&m.event.side==='own')||ordered.find(m=>m.type==='doctrine'));
    add(ordered.find(m=>m.type==='siege'&&m.event.side!==defeated));
    const structures=ordered.filter(m=>m.type==='structure');
    add(structures.findLast(({event})=>{
      const side=event.side==='own'?g.faction:g.enemyFaction;
      return ['barracks','tower'].some(type=>event.text.startsWith(g.name(type,side)+' '));
    })||structures.at(-1));
    add(ordered.findLast(m=>objective(m)&&firstObjective&&m.event.side!==firstObjective.event.side));
    add(ordered.findLast(m=>objective(m)&&m.type!==firstObjective?.type));
    add(ordered.findLast(m=>m.type==='ability'&&m.event.side!==defeated));
    if(!assault) add(ordered.find(m=>m.type==='base'));
    if(selected.size<3) add(ordered.find(m=>m.type==='scout'||m.type==='build'||m.type==='repair'));
    if(selected.size<3) add(ordered.find(m=>m.type==='opening'));
    return ordered.filter(m=>selected.has(m)).sort((a,b)=>a.event.time-b.event.time||Number(a.type==='result')-Number(b.type==='result'));
  }
  function describeMoment(g,{event,type}) {
    const damaged=event.side==='own'?'enemy':'own';
    switch(type){
      case 'opening': return ['neutral','교전 개시'];
      case 'beacon': return [event.side,g.beaconName+' 점령'];
      case 'bell': return [event.side,event.text.replace(/· (아군|적군) /,'· ')];
      case 'salvage': return [event.side,g.mapId==='lantern'?(event.lanternLoad?'짐배 하역 · 봉화 추가 화물':'짐배 하역'):'물결 금고 회수'];
      case 'siege': return [damaged,(event.side==='own'?'아군':'상대')+' 사령부에 첫 타격'];
      case 'result': return [damaged,(event.side==='own'?'아군':'상대')+' 사령부 파괴'];
      case 'structure': return [damaged,event.text];
      case 'base': return ['enemy','아군 기지 공격'];
      case 'scout': return ['enemy','다리로 병력 진출'];
      default: return [event.side,event.text.replace(/^(아군|적군) (교리|전술) · /,'')];
    }
  }
  function timeline(g,factions,actions) {
    const section=element('section','ops-timeline'),heading=element('h3','','주요 전황');
    const list=element('ol','ops-moments');
    section.append(heading,list);
    for(const moment of highlights(g)){
      const {event}=moment,[side,description]=describeMoment(g,moment);
      const who={own:'아군',enemy:'상대',neutral:'전장'}[side]||'전장';
      const row=element('li'), locatable=Number.isFinite(event.x)&&Number.isFinite(event.y)&&typeof actions.locate==='function';
      const entry=locatable?button('ops-moment',undefined,()=>actions.locate(event)):element('div','ops-moment');
      const time=element('time','ops-moment-time',clock(event.time));
      time.dateTime='PT'+Math.max(0,Math.floor(event.time))+'S';
      const text=element('span','ops-moment-text');
      text.append(element('span','ops-moment-side',who),document.createTextNode(description));
      entry.style.setProperty('--moment-tone',side==='own'?factions[g.faction].tone:side==='enemy'?factions[g.enemyFaction].tone:'#b9b4c4');
      entry.append(time,text);
      if(locatable){
        entry.title='현재 전장에서 위치 보기';
        entry.setAttribute('aria-label',time.textContent+' · '+who+' · '+description+' · 현재 전장에서 위치 보기');
        const marker=UIArt.icon('select','#cbbbda',13);
        marker.setAttribute('aria-hidden','true');
        entry.append(marker);
      }
      row.append(entry);list.append(row);
    }
    return section;
  }
  function valueCell(value,max,tone) {
    const td=element('td','ops-stat-value');
    td.style.setProperty('--ops-tone',tone);
    const text=element('span','',value===null?'—':numbers.format(Math.round(value*10)/10));
    const fill=element('i','ops-stat-fill');
    fill.setAttribute('aria-hidden','true');
    fill.style.width=(max>0&&value!==null?Math.min(100,value/max*100):0)+'%';
    td.append(fill,text);
    return td;
  }
  function reportTable(g,factions) {
    const table=element('table','ops-report-table');
    table.setAttribute('aria-label','아군과 상대의 전투 실적');
    const header=element('thead'), headings=element('tr');
    const own=factions[g.faction], enemy=factions[g.enemyFaction];
    for (const [label,tone] of [['교전 기록',null],['아군',own.tone],['상대',enemy.tone]]) {
      const th=element('th','',label);
      th.scope='col';
      if(tone) th.style.color=tone;
      headings.append(th);
    }
    header.append(headings);
    const body=element('tbody');
    const rows=records.map(row=>g.mapId==='lantern'&&row[0]==='salvaged'?['salvaged','짐배 하역 횟수']:row);
    if(Object.values(g.report).some(side=>side.guardKills>0))rows.push(['guardKills','경비대가 격파한 유닛']);
    if(Object.values(g.report).some(side=>side.repairedHQ>0))rows.push(['repairedHQ','그중 사령부 수리량']);
    if(Object.values(g.report).some(side=>side.depotCrystal||side.depotOre)){
      rows.push(['depotCrystal','집하장으로 나른 빛결정'],['depotOre','집하장으로 나른 불씨광']);
    }
    if(Object.values(g.report).some(side=>side.volleysPrimed))rows.push(['volleysPrimed','일제사격 예약 횟수'],['volleysReleased','표식을 포착한 예약']);
    if(Object.values(g.report).some(side=>side.volleyHits))rows.push(['volleyHits','일제사격 명중탄'],['volleyBonus','일제사격 표식 추가 피해']);
    if(g.mapId==='lantern')rows.push(['lanternLoads','봉화 추가 화물 회수']);
    if(Object.values(g.report).some(side=>side.ashShots)){
      rows.push(['ashShots','잿꽃탄 발사 수'],['ashHits','잿꽃탄에 맞은 적 (누적)'],['ashDamage','잿꽃탄 피해']);
    }
    if(Object.values(g.report).some(side=>side.dewCasts)){
      rows.push(['dewCasts','이슬매듭 사용 횟수'],['dewBlocked','이슬매듭이 막은 피해'],['dewHealed','남은 매듭으로 회복한 체력']);
    }
    if(g.bell)rows.push(['bellRings','종울림 발동 횟수']);
    if(Object.values(g.report).some(side=>side.rescued>0))rows.push(['rescued','본진에 귀환한 부상병']);
    for (const [key,label] of rows) {
      const row=element('tr'), th=element('th','',label);
      th.scope='row';
      const a=readStat(g.report?.[g.faction],key), b=readStat(g.report?.[g.enemyFaction],key);
      const high=Math.max(a??0,b??0);
      row.append(th,valueCell(a,high,own.tone),valueCell(b,high,enemy.tone));
      body.append(row);
    }
    const impact=element('tr'), effectHead=element('th','','특수 유닛 기여');
    effectHead.scope='row';
    impact.append(effectHead);
    const metrics={velari:'표식 추가 피해',cinder:'일반 포탄 주변 피해',myren:'자동 치유로 회복한 체력'};
    for(const side of [g.faction,g.enemyFaction]){
      const value=readStat(g.report?.[side],'specialImpact');
      const td=element('td','ops-impact');
      td.append(element('strong','',value===null?'—':numbers.format(Math.round(value*10)/10)),
                element('small','',metrics[side]));
      impact.append(td);
    }
    body.append(impact);
    if(g.doctrine){
      const row=element('tr'),th=element('th','','완료한 교리');
      th.scope='row';row.append(th);
      for(const side of [g.faction,g.enemyFaction]){
        const choice=doctrineChoice(g,side);
        row.append(element('td','ops-doctrine-cell',choice?.study.phase==='active'?choice.name:'없음'));
      }
      body.append(row);
    }
    table.append(header,body);
    return table;
  }
  function result(root,g,factions,actions) {
    const won=g.result==='win',own=factions[g.faction],opponent=factions[g.enemyFaction];
    const page=element('section','ops-report '+(won?'ops-victory':'ops-defeat'));
    const banner=element('div','ops-result-banner');
    const portrait=art(64,64,c=>Art.portrait(c,g.faction,0,0,64,64));
    portrait.classList.add('ops-result-portrait');
    portrait.style.borderColor=own.tone;
    const title=element('div','ops-result-title');
    const team=element('p','ops-team-name',own.name+' · '+Terrain.maps[g.mapId].name);
    team.style.color=own.tone;
    const h=element('h2','',won?'작전 승리':'작전 패배');
    const story=won?opponent.name+'의 사령부를 파괴했습니다.':'아군 사령부가 파괴되었습니다.';
    title.append(team,h,element('p','ops-outcome',story));
    banner.append(portrait,title);
    const meta=element('dl','ops-match-meta');
    for(const [k,v] of [['교전 시간',clock(g.time)],['상대 진영',opponent.name],['AI 난이도',difficulty[g.difficulty]]]){
      const item=element('div');
      item.append(element('dt','',k),element('dd','',v));
      meta.append(item);
    }
    const controls=element('div','ops-result-actions');
    const again=button('primary-button','재대결',()=>actions.rematch());
    again.title='같은 전장, 진영과 난이도로 다시 교전';
    controls.append(button('secondary-button ops-inspect','전장 보기',()=>actions.inspect()),
                    button('secondary-button','새 교전 설정',()=>actions.newGame()),again);
    const review=element('div','ops-result-review');
    const stats=element('details','ops-report-stats');
    stats.open=window.matchMedia?.('(min-width: 701px) and (min-height: 510px)')?.matches ?? true;
    stats.append(element('summary','','전투 실적'),reportTable(g,factions));
    review.append(timeline(g,factions,actions),stats);
    page.append(banner,meta);
    const enemyHQ=g.entities.find(e=>e.faction===g.enemyFaction&&e.type==='hq');
    const restored=g.report[g.enemyFaction].repairedHQ;
    if(!won&&enemyHQ&&restored>=enemyHQ.maxHp*.25){
      const note=element('p','ops-siege-note');
      const wrench=UIArt.art('repair');
      wrench.setAttribute('aria-hidden','true');
      note.append(wrench,element('span','','상대 일꾼이 사령부 체력을 '+numbers.format(Math.round(restored*10)/10)+' 회복했습니다. 다음 공성에서는 렌치가 뜬 일꾼을 먼저 공격해 수리를 끊으세요.'));
      page.append(note);
    }
    page.append(review,controls);
    root.replaceChildren(page);
  }
  window.Operations={queue,result,observe};
})();
