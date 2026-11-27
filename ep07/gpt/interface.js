(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const factions={
    velari:{name:'벨라리 연맹',tone:'#c3a0ea',brief:'원거리 교전 · 결정 채집',info:'결정 운반량이 많고 전투 유닛의 사거리가 길다.'},
    cinder:{name:'신더 화로단',tone:'#eb9a7e',brief:'강한 화력 · 광석 채집',info:'광석 운반량이 많고 전투 유닛의 공격력과 중장 유닛의 체력이 높다.'},
    myren:{name:'미렌 수관회',tone:'#9ccfa7',brief:'빠른 증원 · 생명 회복',info:'일꾼 비용이 적고 훈련이 빠르다. 거주지 수용량이 크고 교전 후 체력을 회복한다.'}
  };
  const difficulties={easy:'쉬움',normal:'보통',hard:'어려움'};
  const unitTypes=['worker','soldier','heavy','specialist'];
  const specialists={
    velari:{role:'표식병',detail:'공격한 적에게 4초간 표식을 남깁니다. 다른 아군이 그 적을 공격하면 피해가 20% 늘어납니다. C를 누르면 사거리 안의 병력이 한 발씩 집중 사격합니다. 표식이 생기기 전에는 최대 8초 동안 첫 사격을 예약합니다.'},
    cinder:{role:'범위 포격',detail:'일반 포탄은 목표 주변의 적 최대 3기에도 피해를 줍니다. C로 잿꽃탄을 쏘면 지정한 자리에 잠시 뒤 불꽃이 피어납니다. 적이 들어올 길목을 겨누세요.'},
    myren:{role:'전장 치유',detail:'주변에서 교전 중인 아군 중 체력 비율이 가장 낮은 전투병을 2.6초마다 최대 13 치유합니다. 호위(P)를 맡기면 지정한 아군부터 치료합니다. C로 아군 한 기에 이슬매듭을 묶어 피해를 막을 수 있습니다.'}
  };
  const bellBrief='첫 종은 45초에, 이후에는 30초마다 울립니다. 점령을 지키면 종 주변의 아군 전투병은 12초간 35% 빠르게 이동합니다.';
  const ferryBrief='금고 회수를 마칠 때 나루 봉화를 단독 점령하고 있으면 짐배가 자원을 50% 더 내립니다.';
  const mapBrief=id=>Terrain.maps[id].description+(id==='kiln'?' '+bellBrief:id==='lantern'?' '+ferryBrief:'');
  const buildings=['barracks','house','tower','depot'];
  const deposits=[{type:'crystal',name:'빛결정',button:'assignCrystal'},{type:'ore',name:'불씨광',button:'assignOre'}];
  const roles={hq:'사령부',barracks:'병영',house:'거주지',tower:'방어탑',depot:'자원 집하장',worker:'일꾼',soldier:'전투병',heavy:'중장병'};
  const unitRole=(type,faction)=>type==='specialist'?specialists[faction].role:roles[type];
  function unitDetail(type,faction){
    const applied=g.report[faction]?.doctrine;
    if(type==='specialist'){
      if(applied==='afterimage')return '공격한 적에게 7초 동안 표식을 남깁니다. 다른 아군의 후속 공격이 35%의 추가 피해를 줍니다. C로 표식에 집중 사격하거나 다리를 건너기 전에 8초간 사격을 예약할 수 있습니다.';
      if(applied==='furnace')return '일반 포탄의 폭발 반경이 48로 넓어져 주변 적 최대 4기에도 피해를 줍니다. C로 쏘는 잿꽃탄은 반경 52 안의 적 최대 5기를 타격합니다.';
      if(applied==='nectar')return '치유 사거리가 90, 1회 치유량이 20으로 늘어납니다. 호위(P)를 맡기면 교전 후에도 지정한 아군부터 치료합니다. C로 이슬매듭 보호막을 걸 수 있습니다.';
      return specialists[faction].detail;
    }
    if(type==='heavy'&&applied==='fault')return '건물을 공격할 때 피해가 2배가 됩니다. 전투병의 엄호를 받으며 적 사령부를 공략하세요.';
    return {
    worker:'빛결정과 불씨광을 가까운 아군 집하장이나 사령부로 나릅니다. 건물을 짓고, 불씨광을 사용해 피해를 입은 아군 건물을 수리합니다.',
    soldier:'빠르게 충원할 수 있는 기본 전투병입니다. 봉화를 선점하거나 중장병의 전진을 엄호하기 좋습니다.',
    heavy:'건물에 50%의 추가 피해를 줍니다. 전투병과 함께 적의 방어선을 뚫고 사령부를 공격하세요.'
    }[type];
  }
  const prettyTime=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
  const makeButton=(cls,txt,click)=>{const b=el('button',cls,txt);b.addEventListener('click',click);return b};
  const world=$('world'),modal=$('modal'),view=new Viewport(world,$('minimap'));
  let g,paused=false,page='battle',buildMenu=false,recruitMenu=false,mode=null,infoKey=null,cmdKey='',lastEvent=null,lastBank=null,resultShown=false;
  let nextFaction='velari',nextDifficulty='normal',guideFaction='velari',pointer=null,toastUntil=0,touchTime=null;
  let speed=1,nextEnemy='cinder',finalDelay=null,latestCombat=-20,nextMap='shoals',addingOrders=false;
  const keys=new Set(),soundedEffects=new WeakSet(),soundedFields=new WeakSet();
  const squads=new SquadBar($('squads'),{getGame:()=>g,canAct:normalPlay,select:ids=>select(ids),center:(x,y)=>view.center(x,y),notify:toast});
  let alertGuardUntil=0,alertRank=0;
  const fieldLogAvailable=()=>Boolean(g && !paused && !modal.open && (!g.result || resultShown));
  const fieldLog=new FieldLog($('field'),$('fieldLogToggle'),{
    canOpen:fieldLogAvailable,
    home:()=>{focusQueue(false);returnHome();world.focus({preventScroll:true})},
    repairHQ:hq=>{if(normalPlay()){GameSound.unlock();accept(g.assignRepair(hq),'order')}},
    onOpen:()=>{focusQueue(false);squads.close();keys.clear();clearDrag();GameSound.unlock();},
    center:(x,y,event)=>{
      focusConstruction(event);
      view.center(x,y);
      const danger=event.kind==='alert'||event.side==='enemy';
      view.marker={x,y,stamp:performance.now(),color:danger?'#ffb195':'#f0d28d'};
      if(event.kind==='beacon'||event.kind==='bell')view.beaconUntil=performance.now()+2200;
    }
  });
  const getSelected=()=>g.selected.map(id=>g.byId.get(id)).filter(Boolean);
  const owned=e=>e.faction===g.faction;
  const ownFighter=e=>owned(e)&&unitTypes.includes(e.type)&&e.type!=='worker';
  const wounded=new WoundedSelection({getGame:()=>g,canAct:normalPlay,select:ids=>select(ids),isFighter:ownFighter,notify:toast});
  const friendlyReport=e=>e&&(e.kind==='siege'?e.side==='enemy':e.side==='own'&&e.kind!=='alert');
  const ashAimPrompt='잿꽃탄이 떨어질 육지나 다리를 지정하세요.';
  function focusConstruction(event){
    if(!event?.constructionSiteId||!normalPlay())return;
    const site=g.byId.get(event.constructionSiteId);
    if(site&&site.hp>0&&site.progress<1&&owned(site))select([site.id],true);
  }
  function toast(text,ms=2200,urgent=false,location=null){
    if(!text)return;
    const message=$('message');
    message.textContent=text;message.classList.add('visible');
    message.classList.toggle('field-alert-notice',urgent);
    message.classList.toggle('friendly-notice',urgent&&Boolean(friendlyReport(location)));
    message.classList.toggle('work-notice',Boolean(location?.constructionSiteId));
    if(urgent&&location&&Number.isFinite(location.x)&&Number.isFinite(location.y)){
      const jump=makeButton('toast-jump',location.constructionSiteId?'공사 현장':'위치 보기',()=>{
        fieldLog.close();focusQueue(false);focusConstruction(location);view.center(location.x,location.y);
        view.marker={x:location.x,y:location.y,stamp:performance.now(),color:friendlyReport(location)?'#bce8b2':'#ffbe94'};
        world.focus({preventScroll:true});
      });
      jump.title=text+' · 보고 위치로 이동';
      jump.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()});
      message.append(jump);
    }else if((mode?.command==='dew'||(mode?.command==='ash'&&mode.ashPoint))&&normalPlay()){
      const cancel=makeButton('toast-jump',mode.command==='dew'?'지정 취소':'조준 취소',()=>{
        cancelMode();refresh();world.focus({preventScroll:true});
      });
      cancel.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()});
      message.append(cancel);
    }
    toastUntil=performance.now()+ms;
  }
  function cancelMode(){
    mode=null;view.mode=null;buildMenu=false;recruitMenu=false;cmdKey='';
    const message=$('message');
    if(performance.now()>=alertGuardUntil || !message.classList.contains('field-alert-notice'))message.classList.remove('visible');
  }
  function setMode(command,build=null){
    fieldLog.close();
    mode={command,build};view.mode=mode;cmdKey='';
    const message=build==='depot'?'자주 캘 광맥 옆 육지에 '+g.name(build)+' 위치를 지정하세요.':build?g.name(build)+' 건설 위치를 클릭하세요.':({dew:'보호할 아군을 누르세요. C를 다시 누르면 추천 대상을 보호합니다.',ash:ashAimPrompt,attackmove:'공격할 대상이나 지점을 클릭하세요.',move:'이동할 지점을 클릭하세요.',gather:'채집할 빛결정이나 불씨광을 클릭하세요.',escort:'호위할 아군 유닛이나 경비할 아군 건물을 누르세요.',repair:'수리할 아군 건물을 클릭하세요. 불씨광 1로 체력을 최대 4 회복합니다.',rally:'생산된 유닛이 모일 지점을 누르세요.',rallyAll:'전장이나 미니맵에서 모든 병영의 집결지를 누르세요.',ability:'전술을 펼칠 위치를 누르세요. 선택 부대에 쓰려면 전술 버튼이나 T를 한 번 더 누르세요.'})[command];
    mode.prompt=command==='dew'?message:message+'  ·  Esc 취소';toast(mode.prompt,Infinity);refresh();
  }
  function select(ids,quiet=false){fieldLog.close();addingOrders=false;g.select(ids);cancelMode();if(ids.length&&!quiet)GameSound.play('select',g.faction);infoKey=null;refresh()}
  function selectForce(expedition=false){
    const army=expedition?g.expeditionArmy():g.entities.filter(e=>e.hp>0&&ownFighter(e));
    if(!army.length){
      toast(expedition?'지금 출격할 병력이 없습니다. 경비·호위·사수·후퇴 중인 병력은 임무를 유지합니다.':'전투 부대가 없습니다. 병영에서 병력을 훈련하세요.');
      return false;
    }
    select(army.map(e=>e.id));
    if(expedition)toast('출격대 '+army.length+'기 선택');
    return true;
  }
  function returnHome(){const h=g.entities.find(e=>owned(e)&&e.type==='hq');if(h){select([h.id]);view.center(h.x,h.y)}}
  function chooseIdle(){
    const idle=g.entities.filter(e=>owned(e)&&e.type==='worker'&&e.action==='idle');
    if(!idle.length){toast('모든 일꾼이 작업 중입니다.');return}
    const previous=idle.findIndex(e=>g.selected.includes(e.id));
    const worker=idle[(previous+1)%idle.length];select([worker.id]);view.reveal(worker);
  }
  function focusQueue(show){
    $('intelTray').hidden=!show;$('queue').setAttribute('aria-expanded',String(show));
    if(show){fieldLog.close();GameSound.unlock();refresh()}
  }
  function useAbility(){
    if(!normalPlay())return;
    if(mode?.command==='ability'){
      const center=g.tactics.suggestCenter(g.faction,getSelected());
      if(center)castAt(center);
      else toast('선택한 전투병이 없습니다. 전술을 펼칠 아군 부대 주변을 누르세요.');
      return;
    }
    GameSound.unlock();const wait=g.tactics.remaining(g.faction);
    if(wait>0){toast('전술 재충전까지 '+Math.ceil(wait)+'초');return}
    cancelMode();focusQueue(false);setMode('ability');
  }
  function castAt(point){
    const ok=g.tactics.cast(g.faction,point.x,point.y);
    if(ok){cancelMode();const field=g.tactics.fields.at(-1);if(field)soundedFields.add(field)}
    accept(ok,'ability');
  }
  function finishDew(ok){
    if(ok)cancelMode();
    else GameSound.play('error',g.faction);
    toast(g.feedback);refresh();
  }
  function useDew(){
    if(mode?.command==='dew'){
      const target=mode.dewPlan?.suggested;
      if(target)finishDew(g.tieDew(target));
      else toast('추천할 아군이 없습니다. 보호할 아군을 직접 누르세요.');
      return;
    }
    const plan=g.dewPlan();
    if(plan.selected.every(e=>e.action==='retreat')){finishDew(g.requestDew());return}
    if(!plan.ready.length){toast(plan.reason);return}
    cancelMode();focusQueue(false);setMode('dew');
  }
  function shootAsh(point){
    const fired=g.fireAsh(point.x,point.y);
    if(fired)cancelMode();
    else if(mode?.ashPoint){mode.ashPoint=null;mode.prompt=ashAimPrompt}
    accept(fired,'ashLaunch');
  }
  function aimAsh(point,touch){
    if(!touch){shootAsh(point);return}
    const pinned=mode.ashPoint;
    if(pinned&&Math.hypot(pinned.x-point.x,pinned.y-point.y)*view.scale<=16){
      shootAsh(pinned);return;
    }
    const plan=g.ashPlan(point.x,point.y);
    mode.ashPoint=plan.ok?point:null;
    if(!plan.ok){mode.prompt=ashAimPrompt;toast(plan.reason);refresh();return}
    mode.prompt='같은 곳을 다시 누르거나 ‘여기 발사’를 누르세요.';
    toast(mode.prompt,Infinity);refresh();
  }
  function normalPlay(){return !paused&&!g.result&&!modal.open}
  function accept(ok,sound){GameSound.play(ok?sound:'error',g.faction);if(g.feedback)toast(g.feedback);cmdKey='';refresh();return ok}
  function command(id){
    fieldLog.close();
    if(g.result){
      if(id==='recap')openPage('result');
      if(id==='new')openPage('new');
      if(id==='home')returnHome();
      if(id==='army')selectForce();
      return;
    }
    if(!normalPlay()){if(paused)toast('전투를 재개한 뒤 명령을 내리세요.');return}
    GameSound.unlock();
    if(id==='dew'){useDew();return}
    if(id==='ash'){
      if(mode?.command==='ash'){
        if(mode.ashPoint)shootAsh(mode.ashPoint);
        else {cancelMode();refresh()}
      }else{
        const plan=g.ashPlan();
        if(!plan.ready.length){toast(plan.reason);return}
        cancelMode();focusQueue(false);setMode('ash');
      }
      return;
    }
    if(id==='volley'){
      const plan=g.volleyPlan(),ok=g.volley();
      if(ok)cancelMode();
      accept(ok,plan.waiting?'order':plan.canPrime?'volleyPrime':'volley');return;
    }
    if(id==='localCrystal'||id==='localOre'){
      const site=getSelected().find(e=>owned(e)&&e.type==='depot');
      if(site)accept(g.assignDepot(site,id==='localCrystal'?'crystal':'ore'),'order');
      return;
    }
    if(id==='idle'){chooseIdle();return}
    if(id==='ability'){useAbility();return}
    if(id==='doctrine'){cancelMode();openPage('doctrine');return}
    if(id==='rallyAll'){
      if(!g.entities.some(e=>owned(e)&&e.type==='barracks'&&e.progress===1&&e.hp>0)){toast('공동 집결지를 지정할 완성된 병영이 없습니다.');return}
      focusQueue(false);cancelMode();setMode('rallyAll');return;
    }
    const current=getSelected();
    const repairTarget=current.length===1&&owned(current[0])&&['hq',...buildings].includes(current[0].type)&&current[0].progress===1&&current[0].hp<current[0].maxHp?current[0]:null;
    if((id==='repair'||id==='repairHere')&&repairTarget){accept(g.assignRepair(repairTarget),'order');return}
    if(id==='back'){cancelMode();refresh();return}
    if(id==='recruit'){cancelMode();recruitMenu=true;GameSound.play('select',g.faction);refresh();return}
    if(id==='build'){cancelMode();buildMenu=true;GameSound.play('select',g.faction);refresh();return}
    if(buildings.includes(id)){
      const shortage=g.shortage(id);if(shortage){toast(shortage);GameSound.play('error');return}
      if(!g.count('worker')){toast('건설할 일꾼을 먼저 훈련하세요.');return}
      setMode('build',id);return;
    }
    if(unitTypes.includes(id)){accept(g.train(id),'train');return}
    if(id==='split'){squads.split();return}
    if(id==='convoy'){
      const ok=g.formConvoy();
      if(ok){cancelMode();focusQueue(false);addingOrders=false;infoKey=null}
      accept(ok,'escort');return;
    }
    if(id==='expedition'){selectForce(true);return}
    const site=current.length===1&&owned(current[0])&&!unitTypes.includes(current[0].type)?current[0]:null;
    if(id==='resumeBuild'){
      if(site)accept(g.resumeConstruction(site),'build');
      return;
    }
    if(id==='callGuard'||(id==='escort'&&site?.progress===1)){
      if(site)accept(g.assignGuard(site),'post');
      return;
    }
    if(id==='escort'&&!current.some(ownFighter)){
      toast('호위나 경비를 맡을 전투병을 먼저 선택하세요.');return;
    }
    if(id==='army'){selectForce();return}
    if(id==='home'){returnHome();return}
    if(id==='attackmove'&&!getSelected().some(e=>owned(e)&&unitTypes.includes(e.type))&&!selectForce(true))return;
    if(id==='stop'){cancelMode();accept(g.stop(),'order');return}
    if(id==='retreat'){cancelMode();addingOrders=false;accept(g.retreat(),'retreat');return}
    if(id==='hold'){cancelMode();addingOrders=false;accept(g.hold(),'order');return}
    if((id==='gather'||id==='repair')&&!getSelected().some(e=>owned(e)&&e.type==='worker')){
      const worker=g.entities.find(e=>owned(e)&&e.type==='worker'&&e.action==='idle')||g.entities.find(e=>owned(e)&&e.type==='worker');if(!worker){toast('일꾼을 먼저 훈련하세요.');return}select([worker.id],true);
    }
    if(id==='rally'&&!getSelected().some(e=>owned(e)&&['hq','barracks'].includes(e.type)&&e.progress===1)){
      toast('집결 지점을 설정할 사령부나 완성된 병영을 선택하세요.');return;
    }
    setMode(id);
  }
  function specs(){
    const sel=getSelected(),own=sel.filter(owned),type=own[0]?.type;
    if(g.result)return [['recap','rally','교전 결과','↵'],['home','house','사령부','H'],['army','army','부대 선택','F'],['new','attack','새 교전','N']];
    const specialist=['specialist','specialist',specialists[g.faction].role,'U'];
    const army=['army','army','부대 선택','F'];
    const repairOrArmy=own.length===1&&own[0].progress===1&&own[0].hp<own[0].maxHp?['repairHere','repair','수리 요청','J']:army;
    if(recruitMenu)return [['soldier','soldier',g.name('soldier'),'W'],['heavy','heavy',g.name('heavy'),'E'],specialist,['back','back','돌아가기','Esc']];
    if(buildMenu)return [
      ['house','house','거주지','Z'],['barracks','barracks','병영','X'],['tower','tower','방어탑','C'],['depot','depot','집하장','V'],['back','back','돌아가기','Esc']
    ];
    if(!own.length)return [['home','house','사령부','H'],['gather','worker','자원 채집','G'],['army','army','부대 선택','F'],['attackmove','attack','공격 이동','A']];
    const site=own.length===1&&['hq',...buildings].includes(type)?own[0]:null;
    if(site&&site.progress<1)return [['resumeBuild','build','공사 재개','J'],['build','build','건물 건설','B'],army];
    const callGuard=['callGuard','post','경비병 호출','P'];
    if(type==='hq')return [['worker','worker','일꾼 훈련','Q'],['recruit','soldier','병력 훈련','D'],['build','build','건물 건설','B'],repairOrArmy,['rally','rally','집결 지점','R'],callGuard];
    if(type==='depot'&&own[0].progress===1)return [['localCrystal','crystal','결정 배정','G'],['localOre','ore','광석 배정','O'],['build','build','건물 건설','B'],repairOrArmy,callGuard];
    if(type==='barracks')return [['soldier','soldier',g.name('soldier'),'W'],['heavy','heavy',g.name('heavy'),'E'],specialist,repairOrArmy,['rally','rally','집결 지점','R'],callGuard];
    if(own.every(e=>e.type==='worker'))return [['gather','gather','자원 채집','G'],['build','build','건물 건설','B'],['repair','repair','건물 수리','J'],['move','move','이동','M'],['stop','stop','정지','S']];
    if(own.some(e=>unitTypes.includes(e.type)))return [['attackmove','attack','공격 이동','A'],['move','move','이동','M'],['hold','hold','위치 사수','K'],['escort','escort','호위·경비','P'],['retreat','retreat','후퇴','R'],['army','army','부대 선택','F'],['stop','stop','정지','S']];
    return [['home','house','사령부','H'],['build','build','건물 건설','B'],repairOrArmy,['attackmove','attack','공격 이동','A'],callGuard];
  }
  function renderCommands(){
    const list=specs(),stats=g.stats();
    const key=list.map(([id])=>{const cost=g.cost(id);return id+(unitTypes.includes(id)?g.canTrain(id):stats.crystal>=cost.crystal&&stats.ore>=cost.ore)}).join('/')+(mode?.build||mode?.command||'')+(g.report[g.faction].doctrine||'');
    const localDepot=getSelected().find(e=>owned(e)&&e.type==='depot'&&e.progress===1);
    const localTypes=localDepot&&list.some(([id])=>id==='localCrystal')?['crystal','ore'].map(type=>g.depotNode(localDepot,type)):null;
    const site=getSelected()[0];
    const reserve=list.some(([id])=>id==='callGuard')?g.guardReserve(site):null;
    const builders=list.some(([id])=>id==='resumeBuild')?g.constructionCrew(site):[];
    const panelKey=key+(localTypes?localTypes.map(node=>node?.id||0).join('-'):'')+'/'+(reserve?.type||'')+'/'+builders.length;
    if(panelKey===cmdKey)return;cmdKey=panelKey;
    $('commandsTitle').textContent=buildMenu?'건설 목록':recruitMenu?'병력 훈련':'지휘 명령';$('back').hidden=!(buildMenu||recruitMenu);
    const container=$('commands');container.replaceChildren();
    for(const [id,symbol,label,hotkey] of list){
      const c=g.cost(id),buy=unitTypes.includes(id)||buildings.includes(id);
      const unavailable=buy&&(stats.crystal<c.crystal||stats.ore<c.ore||(unitTypes.includes(id)&&!g.canTrain(id)));
      const b=makeButton('command'+(unavailable?' dim':'')+((mode?.build||mode?.command)===id?' active':''),undefined,()=>command(id));
      b.dataset.order=id;
      const local=id==='localCrystal'||id==='localOre';
      if(local)b.disabled=!localTypes?.[id==='localCrystal'?0:1];
      if(id==='callGuard'&&!reserve)b.classList.add('dim');
      if(id==='resumeBuild'&&builders.length)b.disabled=true;
      const icon=el('i');
      if(buildings.includes(id)||unitTypes.includes(id)&&id!=='worker'){
        const cv=el('canvas');cv.width=38;cv.height=34;
        const size=id==='specialist'?.70:buildings.includes(id)?.49:1.12;
        Art.draw(cv.getContext('2d'),id,g.faction,19,31,{size});icon.append(cv);
      }else icon.append(UIArt.art(symbol));
      b.append(el('kbd','',hotkey),icon,el('span','command-label',id==='resumeBuild'&&builders.length?'공사 중':label));
      if(local)b.setAttribute('aria-description',b.disabled?'주변에 연결된 광맥이 없습니다.':'집하장 근처 광맥에 일꾼 한 기 배정');
      const costText=buy?'빛결정 '+c.crystal+(c.ore?' · 불씨광 '+c.ore:'')+(unitTypes.includes(id)?' · 인구 '+g.population(id):''):'';
      const hint=id==='depot'?' · 인근 일꾼의 빛결정과 불씨광을 받습니다.':local?(b.disabled?' · 주변에 연결된 광맥이 없습니다.':' · 집하장 근처 광맥에 일꾼 한 기 배정'):id==='specialist'?' · '+unitDetail(id,g.faction):id==='retreat'?' · 선택한 전투병이 전투를 끊고 아군 사령부 뒤로 이동합니다.':id==='callGuard'?(reserve?' · 대기 중인 '+g.name(reserve.type)+' 한 기를 부릅니다.':' · 대기 중인 전투병이 필요합니다.'):id==='resumeBuild'?(builders.length?' · 건설 일꾼 '+builders.length+'기 배정됨':' · 일꾼 한 기를 불러 남은 공사를 이어갑니다.'):id==='escort'?' · 유닛을 누르면 따라가며 호위하고, 완성된 건물을 누르면 그 주변을 지킵니다.':id==='hold'?' · 제자리에서 사거리 안의 적만 공격합니다.':id==='repair'?' · 불씨광 1로 아군 건물의 체력을 최대 4 회복합니다.':id==='repairHere'?' · 일꾼 한 기를 불러 이 건물을 수리합니다.':'';
      b.title=(buy?g.name(id)+' · '+costText:label)+' ('+hotkey+')'+hint;
      if((buildMenu||recruitMenu)&&buy)b.append(el('span','cost-label',c.crystal+' ◆  '+c.ore+' ▰'));
      b.setAttribute('aria-label',(id==='specialist'?g.name(id)+' · '+label:id==='resumeBuild'&&builders.length?'공사 중 · 일꾼 '+builders.length+'기 배정':label)+(costText?', '+costText:''));container.append(b);
    }
  }
  function picture(e,faction,inspect){
    const box=inspect?makeButton('portrait portrait-link',undefined,()=>openPage('factions',{faction,type:e.type})):el('div','portrait');
    const pic=el('canvas');pic.width=80;pic.height=80;
    if(inspect){box.title=g.name(e.type,faction)+' 도감 열기';box.setAttribute('aria-label',box.title)}
    const c=pic.getContext('2d');
    if(e&&e.type==='hq')Art.portrait(c,faction,0,0,80,80);
    else {
      c.fillStyle='#333241';c.fillRect(0,0,80,80);
      for(let y=0;y<80;y+=8){c.fillStyle=y%16?'#373443':'#393646';c.fillRect(0,y,80,4)}
      const size=e.type==='specialist'?1.48:unitTypes.includes(e.type)?2.15:buildings.includes(e.type)?1.1:1.7;
      Art.draw(c,e.type,faction,40,Math.min(76,50+size*6),{size});
    }
    box.append(pic);return box;
  }
  function groupPortrait(selected){
    const wrap=el('div','group-portraits');
    wrap.setAttribute('role','group');wrap.setAttribute('aria-label','병종별 선택');
    const types=unitTypes.filter(type=>selected.some(e=>e.type===type));
    for(const type of types){
      const members=selected.filter(e=>e.type===type);
      const choose=makeButton('group-type',undefined,()=>{
        select(getSelected().filter(e=>owned(e)&&e.type===type).map(e=>e.id));
        world.focus({preventScroll:true});
      });
      choose.title=g.name(type)+' '+members.length+'기만 선택';
      choose.setAttribute('aria-label',choose.title);
      choose.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()});
      const cv=el('canvas');cv.width=42;cv.height=33;
      Art.draw(cv.getContext('2d'),type,g.faction,20,29,{size:type==='specialist'?.72:.95});
      const health=el('i');health.dataset.group=type;
      choose.append(cv,el('b','',members.length),health);wrap.append(choose);
    }
    return wrap;
  }
  function renderSelection(){
    const selected=getSelected(),e=selected[0],count=selected.length,health=selected.reduce((s,v)=>s+v.hp,0),max=selected.reduce((s,v)=>s+v.maxHp,0);
    const split=$('splitForce');
    split.hidden=Boolean(g.result)||selected.filter(ownFighter).length<2;
    split.disabled=!normalPlay();
    const research=$('hqDoctrine');
    research.hidden=!(e&&count===1&&owned(e)&&e.type==='hq'&&!g.result);
    if(!research.hidden){
      const state=g.doctrine.status(),choice=g.doctrine.options().find(o=>o.id===state.id);
      const label=state.phase==='researching'?'연구 '+Math.ceil(state.remaining)+'초':state.phase==='active'?'교리 적용':'교리 연구';
      research.querySelector('span').textContent=label;research.disabled=!normalPlay();
      research.title=(choice?choice.name+' · ':'')+label+' (Y)';
      research.setAttribute('aria-label',research.title);
    }
    const key=selected.map(v=>v.id).join(',');
    if(key!==infoKey||!$('unitInfo').children.length){
      infoKey=key;const info=$('unitInfo');info.replaceChildren();$('selectionCount').textContent=count>1?count+' 선택':'';
      if(!e){info.append(el('p','no-selection','유닛이나 건물을 선택하세요.'))}
      else {
        const team=factions[e.faction],details=el('div','info-details'),teamLabel=el('p','faction-text',team?team.name+(count===1?' · '+unitRole(e.type,e.faction):''):'중립 자원');teamLabel.style.color=team?.tone||'#d9c19b';
        const title=count>1?(selected.every(v=>v.type===e.type)?g.name(e.type,e.faction)+' × '+count:'혼성 부대 · '+count):g.name(e.type,e.faction);
        const track=el('div','hp-track');track.append(el('b'));const hp=el('div','hptext');
        const mixed=count>1&&selected.every(v=>owned(v)&&unitTypes.includes(v.type))&&selected.some(v=>v.type!==e.type);
        details.append(teamLabel,el('h3','info-name',title),track);
        if(count===1&&owned(e)&&['hq',...buildings].includes(e.type)){
          const vitals=el('div','post-vitals');
          const crew=makeButton('post-crew',undefined,()=>{
            if(!normalPlay())return;
            const guards=g.postedGuards(e);
            if(guards.length)select(guards.map(unit=>unit.id));
          });
          crew.type='button';crew.hidden=true;
          crew.addEventListener('keydown',event=>{if(event.code==='Space'||event.code==='Enter')event.stopPropagation()});
          vitals.append(hp,crew);details.append(vitals);
        }else details.append(hp);
        if(count===1&&owned(e)&&e.type==='depot'){
          const receipt=el('div','depot-receipt');receipt.append(el('span','','입고'));
          for(const [type,label] of [['crystal','빛결정'],['ore','불씨광']]){
            const number=el('b');number.dataset.received=type;number.title=label;
            const item=el('span');item.append(UIArt.art(type),number);receipt.append(item);
          }
          details.append(receipt);
        }
        if(count===1&&owned(e)&&e.type==='specialist'&&e.faction==='velari')details.append(el('p','mark-readout'));
        if(count===1&&owned(e)&&e.type==='specialist'&&e.faction==='myren')details.append(el('p','medic-readout'));
        info.append(mixed?groupPortrait(selected):picture(e,e.faction,count===1&&unitTypes.includes(e.type)),details);
      }
    }
    if(e){const bar=$('unitInfo').querySelector('.hp-track b'),hp=$('unitInfo').querySelector('.hptext');bar.style.width=(Math.max(0,health)/max*100)+'%';hp.textContent=e.faction==='neutral'?'매장량 '+Math.ceil(health):'HP  '+Math.ceil(health)+' / '+max}
    for(const bar of $('unitInfo').querySelectorAll('[data-group]')){
      const members=selected.filter(v=>v.type===bar.dataset.group);
      const ratio=members.reduce((sum,v)=>sum+v.hp,0)/members.reduce((sum,v)=>sum+v.maxHp,0);
      bar.style.setProperty('--group-hp',(ratio*100)+'%');
      bar.classList.toggle('wounded',ratio<.45);
    }
    if(e&&owned(e)&&count===1&&unitTypes.includes(e.type)){
      let state=$('unitInfo').querySelector('.info-action');if(!state){state=el('span','info-action');$('unitInfo').querySelector('.hptext').append(state)}
      state.textContent=({idle:'대기',move:'이동',retreat:'본진 후퇴 중',attackmove:'공격 이동',attack:'교전',hold:'위치 사수',repair:'건물 수리',salvage:'금고 회수',gather:'채집',return:'운반',build:'건설'})[e.action]||'';
      if(e.action==='escort'){
        const anchor=g.byId.get(e.escortId);
        if(anchor)state.textContent=g.name(anchor.type,anchor.faction)+' 호위'+(e.escortThreatId?' · 교전':' 중');
      }
    }
    if(count===1&&e.action==='guard'&&owned(e)){
      const post=g.byId.get(e.targetId);
      const state=$('unitInfo').querySelector('.info-action');
      if(post&&state)state.textContent=g.name(post.type)+' 경비'+(e.guardThreatId?' · 교전':' 중');
    }
    const postButton=$('unitInfo').querySelector('.post-crew');
    if(postButton){
      const guards=g.postedGuards(e);
      postButton.hidden=!guards.length||!normalPlay();
      postButton.textContent='경비대 '+guards.length+'기';
      postButton.title=g.name(e.type)+'에 배치된 경비대 선택';
      postButton.setAttribute('aria-label',postButton.title+' · '+guards.length+'기');
    }
    const receipt=$('unitInfo').querySelector('.depot-receipt');
    if(receipt){
      receipt.querySelector('[data-received="crystal"]').textContent=e.receivedCrystal||0;
      receipt.querySelector('[data-received="ore"]').textContent=e.receivedOre||0;
      receipt.setAttribute('aria-label','입고한 빛결정 '+(e.receivedCrystal||0)+'개, 불씨광 '+(e.receivedOre||0)+'개');
    }
    const tracker=$('unitInfo').querySelector('.mark-readout');
    if(tracker)tracker.textContent='표식 추가 피해 '+Number((e.markAssistDamage||0).toFixed(1));
    const medic=$('unitInfo').querySelector('.medic-readout');
    if(medic){
      const plan=g.healPlan(e), remaining=Math.max(0,(e.lastHealTime??-5)+2.6-g.time);
      const charge=remaining>0?'치유 '+remaining.toFixed(1)+'초':'치유 준비';
      const total=Math.round(e.healedHp||0);
      medic.textContent=charge+(total?' · 누적 '+total+' HP':'');
      medic.title=(plan.target?'다음 치료 대상 · '+g.name(plan.target.type,plan.target.faction)+' / ':'')+'치유 반경 '+plan.radius+' · 1회 최대 '+plan.amount+' HP';
    }
    if(count===1&&e.dewWard){
      const ward=e.dewWard;
      const status='보호막 '+Math.ceil(ward.shield)+' / '+ward.capacity+' · '+Math.ceil(ward.end-g.time)+'초';
      $('unitInfo').querySelector('.hptext').append(el('span','info-action dew-readout',status));
    }
    if(count&&['cinder','myren'].includes(g.faction)&&selected.every(v=>owned(v)&&v.type==='specialist')){
      const covered=new Set(g.selected);
      const escorts=g.entities.filter(v=>v.hp>0&&v.faction===g.faction&&v.action==='escort'&&covered.has(v.escortId));
      if(escorts.length)$('unitInfo').querySelector('.hptext').append(el('span','info-action','엄호 병력 '+escorts.length+'기'));
    }
    if(count>1&&selected.some(v=>v.action==='guard')){
      const guards=selected.filter(v=>v.action==='guard');
      $('unitInfo').querySelector('.hptext').append(el('span','info-action','경비 '+guards.length+'기'));
    }
    if(count>1&&selected.some(v=>v.action==='escort')){
      const escorts=selected.filter(v=>v.action==='escort');
      $('unitInfo').querySelector('.hptext').append(el('span','info-action','호위 '+escorts.length+'기'));
    }
    if(count>1&&selected.some(v=>v.action==='retreat')){
      const withdrawing=selected.filter(v=>v.action==='retreat').length;
      $('unitInfo').querySelector('.hptext').append(el('span','info-action','후퇴 '+withdrawing+'기'));
    }
    if(count>1&&selected.some(v=>v.action==='hold')){
      const countHeld=selected.filter(v=>v.action==='hold').length;
      $('unitInfo').querySelector('.hptext').append(el('span','info-action','사수 '+countHeld+'기'));
    }
    if(count===1&&e.markedUntil>g.time){
      $('unitInfo').querySelector('.hptext').append(el('span','info-action marked-note','결맥 표식 '+Math.ceil(e.markedUntil-g.time)+'초'));
    }
    if(g.bell){
      const marching=selected.filter(v=>v.marchUntil>g.time);
      if(marching.length){
        const seconds=Math.ceil(marching[0].marchUntil-g.time);
        const label=(count>1?marching.length+'기 ':'')+'행군 +35% · '+seconds+'초';
        $('unitInfo').querySelector('.hptext').append(el('span','info-action march-note',label));
      }
    }
    const region=$('production'),job=selected.find(v=>v.queue?.length||v.progress<1);let text='',pct=0;
    const assigned=job?.progress<1&&owned(job)?g.constructionCrew(job):null;
    region.classList.toggle('construction-stalled',Boolean(assigned&&!assigned.length));
    if(job?.progress<1){
      pct=job.progress;
      text=(assigned&&!assigned.length?'공사 중단 · 일꾼 없음':assigned?'건설 일꾼 '+assigned.length+'기':'건설 중')+' · '+Math.floor(pct*100)+'%';
    }
    else if(job?.queue?.length){const q=job.queue[0];pct=1-q.remaining/q.total;text=g.name(q.type)+' 훈련 중'+(job.queue.length>1?' · 대기 '+(job.queue.length-1):'')}
    if(text){
      if(!region.firstChild){const row=el('div','production-info');row.append(el('span'),el('progress'));region.append(row)}
      region.querySelector('span').textContent=text;const p=region.querySelector('progress');p.value=pct;p.max=1;
    }else region.replaceChildren();
    wounded.refresh();
  }
  function refreshDewControl(){
    const control=$('dewOrder'),myren=g.faction==='myren'&&!g.result;
    const units=myren?getSelected().filter(e=>owned(e)&&unitTypes.includes(e.type)):[];
    const casters=units.some(e=>e.type==='specialist'&&e.action!=='retreat');
    const rescue=!casters&&units.some(e=>e.hp<e.maxHp)?g.dewRescuePlan():null;
    control.hidden=!casters&&!rescue?.healers.length;
    if(mode?.command==='dew'&&!casters){
      cancelMode();toast('이슬매듭을 걸 꽃실 엮음이가 선택에서 빠졌습니다.');
    }
    if(control.hidden)return;
    const aiming=mode?.command==='dew';
    let name='이슬매듭',status,hint,ready;
    if(rescue){
      name='매듭 요청';
      ready=rescue.ok;
      status=ready?g.name(rescue.target.type):rescue.remaining?'재사용 '+Math.ceil(rescue.remaining)+'초':rescue.shortReason;
      hint=ready?'가까운 꽃실 엮음이가 '+status+' 보호 (C)':rescue.reason;
    }else{
      const plan=g.dewPlan(),suggested=aiming&&plan.suggested;
      if(aiming)mode.dewPlan=plan;
      ready=Boolean(plan.ready.length);
      if(suggested)name='추천 보호';
      if(aiming){
        status=suggested?g.name(suggested.type):'아군 지정';
        hint=suggested?'다시 눌러 '+status+' 보호 (C)':'전장에서 보호할 아군을 누르세요.';
      }else{
        status=ready?'준비 '+plan.ready.length+'기':plan.remaining?'재사용 '+Math.ceil(plan.remaining)+'초':'임무 수행 중';
        hint=ready?'이슬매듭 대상 지정 (C) · C 두 번으로 추천 아군 보호':plan.reason;
      }
    }
    $('dewState').textContent=status;$('dewName').textContent=name;
    control.disabled=!normalPlay()||(!aiming&&!ready);
    control.classList.toggle('ready',ready);
    control.setAttribute('aria-pressed',String(aiming));
    control.setAttribute('aria-label','이슬매듭 · '+(name==='이슬매듭'?'':name+' · ')+status);
    control.title=hint;
  }
  function refreshOperations(){
    const all=g.entities.filter(owned),idle=all.filter(e=>e.type==='worker'&&e.action==='idle');
    const producing=all.filter(e=>e.queue.length), jobs=producing.reduce((sum,e)=>sum+e.queue.length,0);
    const convoy=$('convoy');
    const convoyPlan=['myren','cinder'].includes(g.faction)&&normalPlay()&&!buildMenu&&!recruitMenu&&g.selected.length>1?g.convoyPlan():null;
    convoy.hidden=!convoyPlan||Boolean(convoyPlan.reason);
    if(!convoy.hidden){
      const support=g.faction==='myren';
      convoy.classList.toggle('dew-escort',support);
      convoy.querySelector('span').textContent=support?'치유병 동행':'풀무차 엄호';
      convoy.title=(support?'치유병 ':'풀무차 ')+convoyPlan.leaders.length+'기에 엄호 병력 '+convoyPlan.guards.length+'기 배정 (Shift+P)';
    }
    const expedition=$('expedition'),available=g.expeditionArmy();
    expedition.hidden=!normalPlay()||buildMenu||recruitMenu||available.length===all.filter(ownFighter).length;
    if(!expedition.hidden){
      expedition.disabled=!available.length;
      expedition.querySelector('b').textContent=available.length+'기';
      expedition.setAttribute('aria-label','출격대 '+available.length+'기 선택');
    }
    const canRoute=normalPlay()&&getSelected().some(e=>owned(e)&&unitTypes.includes(e.type));
    if(!canRoute)addingOrders=false;
    $('routeToggle').disabled=!canRoute;$('routeToggle').setAttribute('aria-pressed',String(addingOrders));
    $('routeToggle').title=addingOrders?'경유 명령 끄기':'경유 명령 켜기 · 이동과 공격을 순서대로 예약합니다';
    $('idleN').textContent=idle.length;$('idle').disabled=!idle.length||!normalPlay();
    $('queue').disabled=!normalPlay();$('ability').hidden=!!g.result;$('recap').hidden=!resultShown;
    $('queueN').textContent=jobs;$('queueTime').textContent=jobs?'· '+Math.ceil(Math.min(...producing.map(e=>e.queue[0].remaining)))+'초':'';
    if(!$('intelTray').hidden){
      $('rallyBarracks').disabled=!normalPlay()||!all.some(e=>e.type==='barracks'&&e.progress===1);
      Operations.queue($('intelBody'),g,{
        doctrine:()=>command('doctrine'),
        focus:e=>{focusQueue(false);select([e.id]);view.center(e.x,e.y)},
        cancel:(e,q)=>{const index=e.queue.indexOf(q);if(normalPlay()&&index>=0)accept(g.cancelTraining(e.id,index),'order')},
        auto:(e,type)=>{if(normalPlay())accept(g.setAutoTrain(e.id,type),'order')}
      });
    }
    const b=g.beacon;
    const state=b.contested?'경합':b.claimant?(b.claimant===g.faction?'아군 ':'적군 ')+Math.floor(b.progress*100)+'%':b.owner===g.faction?'아군 점령':b.owner?'적군 점령':'중립';
    $('beaconStatus').textContent=state;$('beaconFocus').style.setProperty('--beacon-tone',factions[b.claimant||b.owner]?.tone||'#e9ce97');
    const bellClock=$('bellClock');bellClock.hidden=!g.bell;
    if(g.bell){
      const ring=g.bell.lastRing,seconds=Math.max(0,Math.ceil(g.bell.nextRing-g.time));
      bellClock.textContent=ring && g.time-ring.time<3
        ? (ring.count?(ring.faction===g.faction?'아군 ':'적군 ')+ring.count+'기 가속':ring.reason+' · 가속 없음')
        : '종울림 '+seconds+'초';
      bellClock.classList.toggle('imminent',seconds<=5);
    }
    const cache=g.salvage?.getStatus();
    const lamp=$('ferrySignal');
    lamp.hidden=!cache||g.mapId!=='lantern';
    if(!lamp.hidden){
      const owner=g.salvage.signalOwner();
      lamp.textContent=owner?(owner===g.faction?'아군':'적군')+' 추가 화물':'화물 신호 꺼짐';
      lamp.style.color=owner?factions[owner].tone:'';
    }
    $('salvageRow').hidden=!cache||Boolean(g.result);
    if(cache){
      $('salvageLabel').textContent=cache.label;
      $('salvageState').textContent=cache.state;
      $('salvageFocus').title=cache.description;
      $('salvageFocus').setAttribute('aria-label',cache.label+' · '+cache.state+' · 위치 보기');
      $('salvageRow').style.setProperty('--opening',Math.max(0,Math.min(1,cache.progress||0))*100+'%');
      const dispatch=$('salvageDispatch');
      dispatch.disabled=!normalPlay()||cache.dispatched;
      dispatch.textContent=cache.dispatched?'파견됨':cache.needsReplacement?'재파견':'파견';
      dispatch.setAttribute('aria-label',cache.label+(cache.dispatched?' · 회수 일꾼 파견됨':cache.needsReplacement?'에 새 일꾼 한 기 재파견':'에 일꾼 한 기 파견'));
      dispatch.title=cache.label+' · '+(cache.dispatched?'회수할 일꾼이 출발했습니다.':cache.needsReplacement?'회수 일꾼을 잃었습니다. 다른 일꾼 한 기를 보냅니다.':'일꾼 한 기를 보내 화물을 회수합니다.');
    }
    const a=g.tactics.ability(g.faction),remaining=g.tactics.remaining(g.faction);
    const field=g.tactics.fields.find(f=>f.faction===g.faction);
    $('abilityName').textContent=a.name;
    $('abilityState').textContent=mode?.command==='ability'?'다시 눌러 부대에 사용':field?g.tactics.recipients(g.faction,field.x,field.y).length+'기 적용 · '+Math.ceil(field.end-g.time)+'초':remaining>0?'재충전 · '+Math.ceil(remaining)+'초':'진영 전술 · 준비';
    const control=$('ability');control.classList.toggle('cooling',remaining>0);control.classList.toggle('targeting',mode?.command==='ability');
    control.style.setProperty('--charge',Math.min(100,(1-remaining/a.cooldown)*100)+'%');control.style.setProperty('--skill-tone',a.tone);
    control.title=field&&g.faction==='myren'?'현재까지 회복한 체력 '+Math.round(field.healed):a.description+' T로 위치 지정 · T 두 번으로 선택 부대에 사용 · 재사용 '+a.cooldown+'초';
    control.setAttribute('aria-label',a.name+' · '+$('abilityState').textContent);
    const volley=$('volley'),canVolley=g.faction==='velari'&&!g.result&&getSelected().some(ownFighter);
    const marked=canVolley&&g.entities.some(e=>e.hp>0&&e.markedBy===g.faction&&e.markedUntil>g.time);
    volley.hidden=!canVolley||(!marked&&!all.some(e=>e.type==='specialist'||e.volleyWatch));
    if(!volley.hidden){
      const plan=g.volleyPlan(),ready=plan.units.length;
      let name='표식 일제사격',status;
      if(plan.waiting){name='예약 취소';status=plan.waiting+'기 대기 · '+Math.ceil(plan.waitRemaining)+'초'}
      else if(plan.pending)status='조준 중 · '+plan.pending+'기';
      else if(ready)status=g.name(plan.target.type,plan.target.faction)+' · '+ready+'기';
      else if(plan.canPrime){name='일제사격 예약';status=plan.primers.length+'기 · 8초'}
      else status=marked?'후속 병력 대기':'표식 대기';
      $('volleyName').textContent=name;$('volleyState').textContent=status;
      volley.disabled=!normalPlay()||!(ready||plan.canPrime||plan.waiting);
      volley.title=plan.reason+' (C)';
      volley.setAttribute('aria-label',name+' · '+status);
      volley.setAttribute('aria-pressed',String(Boolean(plan.waiting)));
      volley.classList.toggle('ready',Boolean(ready||plan.canPrime||plan.waiting));
    }
    refreshDewControl();
    const ash=$('ashOrder');
    ash.hidden=g.faction!=='cinder'||Boolean(g.result)||!getSelected().some(e=>owned(e)&&e.type==='specialist');
    if(!ash.hidden){
      const plan=g.ashPlan(),aiming=mode?.command==='ash',pinned=aiming&&mode.ashPoint;
      const target=pinned&&g.ashPlan(pinned.x,pinned.y);
      const status=target?(target.ok?'예상 명중 '+target.targets.length:'위치 재지정'):aiming?'착탄점 지정':plan.ready.length?'준비 '+plan.ready.length+'기':plan.remaining>0?'재장전 '+Math.ceil(plan.remaining)+'초':'임무 수행 중';
      $('ashState').textContent=status;
      $('ashName').textContent=pinned?'여기 발사':'잿꽃탄';
      ash.querySelector('kbd').hidden=Boolean(pinned);
      ash.disabled=!normalPlay()||(!aiming&&!plan.ready.length);
      ash.setAttribute('aria-label','잿꽃탄 · '+status+(pinned?' · 여기 발사':''));
      ash.setAttribute('aria-pressed',String(aiming));
      ash.classList.toggle('ready',Boolean(plan.ready.length));
      ash.title=target?(target.ok?'지정한 착탄점으로 발사':target.reason):aiming?'조준 취소 (C)':plan.ready.length?'잿꽃탄 착탄점 지정 (C) · 풀무차 한 기가 발사합니다.':plan.reason;
    }
    if(ash.hidden&&mode?.command==='ash'){cancelMode();toast('잿꽃탄을 쏠 노을풀무차가 선택되어 있지 않습니다.')}
    $('speed').textContent=speed+'×';$('speed').setAttribute('aria-label','게임 속도 '+speed+'배. 클릭해 변경');
    $('musicState').textContent=GameSound.musicEnabled?'켜짐':'꺼짐';$('music').setAttribute('aria-pressed',String(GameSound.musicEnabled));
    GameSound.tick({running:!document.hidden&&!modal.open&&!paused&&(!g.result||finalDelay!==null),combat:g.time-latestCombat<4,faction:g.faction});
  }
  function refresh(){
    fieldLog.update(g);
    Operations.observe(g);
    $('fieldLogToggle').disabled=!fieldLogAvailable();
    const stats=g.stats();for(const key of ['crystal','ore','cap','pop'])$(key).textContent=Math.floor(stats[key]).toString();
    const housing=$('buildHousing'),houseCost=g.cost('house'),inProgress=g.entities.filter(e=>owned(e)&&e.type==='house'&&e.hp>0&&e.progress<1).length;
    housing.disabled=!normalPlay();housing.classList.toggle('at-cap',stats.pop>=stats.cap);
    housing.title='거주지 건설 · 빛결정 '+houseCost.crystal+' / 불씨광 '+houseCost.ore+' · 배치 '+stats.units+' / 훈련 예약 '+stats.queued+(inProgress?' · 거주지 '+inProgress+'채 건설 중':'');
    housing.setAttribute('aria-label','인구 '+stats.pop+' / '+stats.cap+' · '+housing.title);
    for(const {type,name,button} of deposits){
      const control=$(button),status=g.gatherStatus(type);
      $(type+'Workers').textContent=status.workers+'기';
      control.disabled=!normalPlay();
      control.classList.toggle('unavailable',!status.available);
      control.title=name+' 채집 중 '+status.workers+'기 · '+(status.available?'누르면 일꾼 한 기 배정':'지금은 추가로 배정할 일꾼이나 자원 지대가 없습니다.');
      control.setAttribute('aria-label',name+' '+Math.floor(stats[type])+'개 · 채집 '+status.workers+'기 · 일꾼 한 기 배정');
    }
    $('clock').textContent=prettyTime(g.time);$('zoomReset').textContent=view.zoom.toFixed(1)+'×';
    $('speed').disabled=Boolean(g.result);$('pause').disabled=Boolean(g.result);
    $('statusText').textContent=g.result?'교전 종료':paused||modal.open?'일시정지':'교전 중';
    $('matchInfo').textContent='AI '+difficulties[g.difficulty];
    $('zoomOut').disabled=view.zoom<=1;$('zoomIn').disabled=view.zoom>=2.5;
    document.querySelectorAll('.live-dot').forEach(d=>d.style.background=paused||modal.open||g.result?'#c3ad87':'');
    renderSelection();renderCommands();refreshOperations();squads.refresh();view.drawMinimap(g,factions);
    if(lastBank&&(stats.crystal>lastBank.crystal||stats.ore>lastBank.ore))GameSound.play('gather',g.faction);lastBank=stats;
  }
  function order(p,target,forced=null,append=false){
    const m=forced||mode?.command||'context';if(!normalPlay())return;
    const queue=(append||addingOrders)&&['context','move','attackmove','escort'].includes(m);
    const ok=g.order(p.x,p.y,(m==='move'?null:target?.id),m,queue);
    if(ok){
      const escort=m==='escort'||(m==='context'&&target&&owned(target)&&getSelected().some(e=>{
        const next=e.waypoints?.at(-1);
        return e.escortId===target.id||(next?.mode==='escort'&&next.targetId===target.id);
      }));
      if(!queue||!['attackmove','move'].includes(mode?.command))cancelMode();
      if(queue){const pending=Math.max(0,...getSelected().map(e=>e.waypoints?.length||0));if(pending)toast('다음 명령 '+pending+'개 예약',1300)}
      if(m==='rally'||m==='rallyAll'||escort)toast(g.feedback,1800);
      if(m==='rallyAll')view.flashRallies(g);
      view.marker={x:target?.x??p.x,y:target?.y??p.y,stamp:performance.now(),color:target&&target.faction===g.enemyFaction?'#ffaa8c':'#d6ffc4'};GameSound.play(m==='escort'&&target?.progress===1&&!unitTypes.includes(target.type)?'post':escort?'escort':'order',g.faction)}
    else{toast(g.feedback);GameSound.play('error',g.faction)}refresh();
  }
  function activateAt(p,e,shift,touch){
    const target=view.pick(g,p.x,p.y);
    if(mode?.command==='dew'){finishDew(g.tieDew(target));return}
    if(mode?.command==='ash'){aimAsh(p,touch);return}
    if(mode?.command==='ability'){
      castAt(p);return;
    }
    if(mode?.build){
      const ok=g.build(mode.build,p.x,p.y);if(ok){cancelMode();const site=g.entities[g.entities.length-1];if(site?.faction===g.faction)select([site.id],true)}accept(ok,'build');return;
    }
    if(mode){order(p,target,null,shift);return}
    if(touch&&!g.result&&target&&owned(target)&&unitTypes.includes(target.type)&&g.salvage?.hit(p.x,p.y)&&getSelected().some(v=>owned(v)&&v.type==='worker')){
      order(p,target,'gather');return;
    }
    if(touch&&!g.result&&target&&owned(target)&&['hq',...buildings].includes(target.type)&&target.progress===1&&target.hp<target.maxHp&&getSelected().some(v=>owned(v)&&v.type==='worker')){
      order(p,target,'repair');return;
    }
    if((touch||addingOrders)&&!g.result&&getSelected().some(v=>owned(v)&&unitTypes.includes(v.type))&&(!target||!owned(target))){order(p,target);return}
    if(!target){if(!shift)select([],true);return}
    if(shift&&owned(target)){const ids=new Set(getSelected().filter(owned).map(v=>v.id));if(ids.has(target.id))ids.delete(target.id);else ids.add(target.id);select([...ids]);return}
    select([target.id]);
  }
  world.addEventListener('pointerdown',e=>{
    if(modal.open||paused||(g.result&&!resultShown))return;
    fieldLog.close();focusQueue(false);GameSound.unlock();world.focus({preventScroll:true});
    const p=view.point(e);view.trackPointer(e);world.setPointerCapture(e.pointerId);
    pointer={id:e.pointerId,start:p,end:p,button:e.button,screenX:e.clientX,screenY:e.clientY,camX:view.x,camY:view.y,box:false,pan:e.button===1||e.altKey,touch:e.pointerType==='touch',hold:false};
    if(e.button===2){if(mode||buildMenu||recruitMenu){cancelMode();refresh()}else order(p,view.pick(g,p.x,p.y),null,e.shiftKey);return}
    if(pointer.touch&&!mode&&!g.result){touchTime=setTimeout(()=>{if(pointer&&!pointer.box&&!pointer.pan){order(p,view.pick(g,p.x,p.y));pointer.hold=true}},520)}
  });
  world.addEventListener('pointermove',e=>{
    const p=view.point(e);view.trackPointer(e);if(!pointer||e.pointerId!==pointer.id)return;
    const dx=e.clientX-pointer.screenX,dy=e.clientY-pointer.screenY;
    if(pointer.pan){view.center(pointer.camX-dx/view.scale,pointer.camY-dy/view.scale);return}
    if(pointer.button===0&&!mode&&Math.hypot(dx,dy)>6){clearTimeout(touchTime);pointer.box=true;pointer.end=p;view.drag=pointer}
  });
  world.addEventListener('pointerleave',()=>{if(!pointer)view.clearPointer()});
  function clearDrag(){clearTimeout(touchTime);pointer=null;view.drag=null}
  world.addEventListener('pointercancel',clearDrag);
  world.addEventListener('pointerup',e=>{
    clearTimeout(touchTime);if(!pointer||pointer.id!==e.pointerId){return}
    const pr=pointer;clearDrag();if(modal.open||paused||(g.result&&!resultShown)||pr.button!==0||pr.pan||pr.hold)return;
    const p=view.point(e);
    if(pr.box){const l=Math.min(p.x,pr.start.x),r=Math.max(p.x,pr.start.x),t=Math.min(p.y,pr.start.y),b=Math.max(p.y,pr.start.y);
      const ids=g.entities.filter(v=>owned(v)&&unitTypes.includes(v.type)&&v.x>=l&&v.x<=r&&v.y-8>=t&&v.y-8<=b).map(v=>v.id);
      select(e.shiftKey?[...getSelected().filter(owned).map(v=>v.id),...ids]:ids);
    }else activateAt(p,e,e.shiftKey,pr.touch);
  });
  world.addEventListener('contextmenu',e=>e.preventDefault());
  world.addEventListener('dblclick',e=>{if(!normalPlay()||mode)return;const p=view.point(e),v=view.pick(g,p.x,p.y);if(v&&owned(v)&&unitTypes.includes(v.type))select(g.entities.filter(q=>owned(q)&&q.type===v.type).map(q=>q.id))});
  function zoomBy(amount){view.setZoom(view.zoom+amount);refresh()}
  world.addEventListener('wheel',e=>{e.preventDefault();const before=view.point(e);view.setZoom(view.zoom+(e.deltaY<0?.25:-.25));const after=view.point(e);view.center(view.x+before.x-after.x,view.y+before.y-after.y);refresh()},{passive:false});
  $('zoomIn').onclick=()=>zoomBy(.25);$('zoomOut').onclick=()=>zoomBy(-.25);$('zoomReset').onclick=()=>{view.reset();refresh()};
  $('expand').onclick=()=>{document.body.classList.toggle('expanded');clearDrag();requestAnimationFrame(()=>{view.resize();refresh()})};
  function miniPoint(e){
    const b=$('minimap').getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*1280,y:(e.clientY-b.top)/b.height*640};
  }
  function panMini(e){const p=miniPoint(e);view.center(p.x,p.y);view.drawMinimap(g,factions)}
  let miniPanId=null;
  $('minimapButton').oncontextmenu=e=>e.preventDefault();
  $('minimapButton').onpointerdown=e=>{
    fieldLog.close();
    if(e.button===2){
      e.preventDefault();GameSound.unlock();
      if(mode&&!['attackmove','move','rally','rallyAll'].includes(mode.command)){cancelMode();refresh()}
      else order(miniPoint(e),null,mode?.command||'context',e.shiftKey);
      return;
    }
    if(e.button===0&&['rally','rallyAll'].includes(mode?.command)){
      GameSound.unlock();order(miniPoint(e),null,mode.command);return;
    }
    if(e.button===0){miniPanId=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);panMini(e)}
  };
  $('minimapButton').onpointermove=e=>{if(e.buttons===1&&e.pointerId===miniPanId)panMini(e)};
  $('minimapButton').onlostpointercapture=()=>{miniPanId=null};
  $('splitForce').onclick=()=>command('split');
  $('hqDoctrine').onclick=()=>command('doctrine');
  $('rallyBarracks').onclick=()=>command('rallyAll');
  for(const control of [$('hqDoctrine'),$('rallyBarracks'),$('splitForce')]){
    control.onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  }
  $('buildHousing').onclick=()=>{if(normalPlay()){addingOrders=false;focusQueue(false);command('house')}};
  $('buildHousing').onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  $('beaconFocus').onclick=()=>{fieldLog.close();focusQueue(false);view.center(g.beacon.x,g.beacon.y);view.beaconUntil=performance.now()+2600;
    toast(g.bell?bellBrief:g.mapId==='lantern'?ferryBrief:g.beaconName+' · 전투 유닛으로 7초 점령하면 12초마다 빛결정 18, 불씨광 8을 받습니다.',3900);refresh()};
  $('salvageFocus').onclick=()=>{
    const cache=g.salvage?.getStatus();if(!cache)return;
    fieldLog.close();focusQueue(false);view.center(cache.x,cache.y);
    view.marker={x:cache.x,y:cache.y,stamp:performance.now(),color:'#ffdd94'};
    toast(cache.description,3800);refresh();
  };
  $('salvageDispatch').onclick=()=>{
    if(!normalPlay()||!g.salvage?.getStatus())return;
    GameSound.unlock();accept(g.salvage.dispatch(),'order');
  };
  for(const {type,button} of deposits){
    const control=$(button);
    control.addEventListener('click',()=>{
      if(!normalPlay())return;
      GameSound.unlock();accept(g.assignGather(type),'order');
    });
    control.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()});
  }
  $('routeToggle').onclick=()=>{
    if(!normalPlay())return;
    addingOrders=!addingOrders;
    if(addingOrders){cancelMode();toast('경유할 지점이나 적을 차례로 누르세요.')}
    refresh();
  };
  $('convoy').onclick=()=>command('convoy');
  $('convoy').onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  $('expedition').onclick=()=>command('expedition');
  $('expedition').onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  $('dewOrder').onclick=()=>command('dew');
  $('dewOrder').onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  $('ashOrder').onclick=()=>command('ash');
  $('ashOrder').onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  $('volley').onclick=()=>command('volley');
  $('volley').onkeydown=e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation()};
  $('ability').onclick=useAbility;$('idle').onclick=()=>{if(normalPlay())chooseIdle()};
  $('recap').onclick=()=>openPage('result');
  $('queue').onclick=()=>{if(normalPlay())focusQueue($('intelTray').hidden)};$('intelClose').onclick=()=>focusQueue(false);
  $('speed').onclick=()=>{if(g.result)return;speed=speed===1?1.5:speed===1.5?2:1;refresh()};
  $('music').onclick=()=>{if(!GameSound.enabled&&!GameSound.musicEnabled)$('sound').click();GameSound.toggleMusic();refresh()};
  function pause(value=!paused){if(g.result||modal.open)return;paused=value;clearDrag();if(paused)cancelMode();fieldLog.close();focusQueue(false);$('pauseOverlay').hidden=!paused;$('pause').setAttribute('aria-label',paused?'전투 재개':'일시정지');$('pause').title=(paused?'전투 재개':'일시정지')+' (Space)';$('pause').replaceChildren(UIArt.icon(paused?'play':'pause'));refresh()}
  $('pause').onclick=()=>pause();$('resume').onclick=()=>pause(false);
  $('sound').onclick=()=>{const enabled=GameSound.toggle();$('sound').replaceChildren(UIArt.icon(enabled?'sound':'mute'));$('sound').setAttribute('aria-label',enabled?'소리 끄기':'소리 켜기');$('sound').title=enabled?'소리 끄기':'소리 켜기';if(enabled)GameSound.play('select',g.faction)};
  $('back').onclick=()=>command('back');
  function begin(faction,difficulty,enemy,mapId='shoals'){
    if(modal.open)modal.close();
    alertGuardUntil=0;alertRank=0;
    paused=false;addingOrders=false;g=new Game(faction,difficulty,enemy,mapId);finalDelay=null;latestCombat=-20;page='battle';infoKey=null;cmdKey='';resultShown=false;lastEvent=g.events.at(-1);lastBank=null;
    $('pauseOverlay').hidden=true;$('pause').replaceChildren(UIArt.icon('pause'));$('pause').setAttribute('aria-label','일시정지');$('pause').title='일시정지 (Space)';
    focusQueue(false);clearDrag();cancelMode();view.clearPointer();view.reset();view.marker=null;view.threat=null;view.beaconUntil=0;
    const map=Terrain.maps[g.mapId];$('mapName').textContent=map.name;document.title='Riftwake · '+map.name;
    $('beaconLabel').textContent=map.beaconName;$('beaconFocus').title=map.beaconName+' 위치 보기 · '+mapBrief(g.mapId);
    drawAbilityIcon(faction);refresh();view.render(g,factions);
  }
  function drawAbilityIcon(faction){
    const c=$('abilityIcon').getContext('2d');c.clearRect(0,0,32,32);
    const rows={
      velari:['     w     ','    wht    ','   whhdt   ','  thhhddt  ',' thhhddddt ','  tdtdtdt  ',' t dhdhd t ',' t  tdt  t ','  t  t  t  ','   tt tt   '],
      cinder:['      h    ','     hh t  ','  t thh ht ','  httww hh ',' thhhwwwhht','thhwwwdwhht',' thhwwddht ',' tthwdddt  ','  tddddd   ','   tttt    '],
      myren:['       hhht',' tht  hwwht','thhht hwhdt',' thwhtwhdt ','  thwhhdt  ','   twhht   ','  thhhdtht ',' twhhdt hht','  ttt h  ht','     ht    ']
    }[faction];const palette={w:'#fff5ce',h:factions[faction].tone,t:faction==='cinder'?'#a25f52':faction==='myren'?'#598e75':'#916db5',d:'#514557'};
    rows.forEach((r,y)=>[...r].forEach((v,x)=>{if(palette[v]){c.fillStyle=palette[v];c.fillRect(5+x*2,5+y*2,2,2)}}));
  }
  function abilityDetail(root,faction){
    const a=g.tactics.ability(faction),p=el('p','faction-ability');p.style.setProperty('--skill-tone',a.tone);
    p.append(el('b','',a.name),document.createTextNode(a.description));root.append(p);
  }
  let guideUnit='specialist';
  const numberLabel=n=>String(Number(n.toFixed(1)));
  function showRoster(root,faction){
    const options=el('div','roster roster-units'),detail=el('section','unit-sheet');
    const buttons=new Map();
    const item=(type,size)=>{
      const cv=el('canvas');cv.width=70;cv.height=48;cv.setAttribute('aria-hidden','true');
      Art.draw(cv.getContext('2d'),type,faction,35,43,{size});
      return cv;
    };
    function describe(type){
      guideUnit=type;
      const stats=g.unitStats(type,faction);
      const head=el('div','unit-sheet-head');
      head.append(el('strong','',g.name(type,faction)),el('span','',unitRole(type,faction)));
      const values=el('dl','unit-values');
      for(const [label,value] of [['체력',stats.hp],['공격력',numberLabel(stats.power)],['사거리',stats.range],['인구',stats.pop]]){
        const cell=el('div');cell.append(el('dt','',label),el('dd','',value));values.append(cell);
      }
      const cost='빛결정 '+stats.crystal+(stats.ore?' · 불씨광 '+stats.ore:'')+' · 훈련 '+numberLabel(stats.seconds)+'초';
      detail.replaceChildren(head,el('p','unit-detail',unitDetail(type,faction)),values,el('p','unit-cost',cost));
      for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(id===type));
    }
    for(const type of unitTypes){
      const b=makeButton('roster-item',undefined,()=>describe(type));
      b.append(item(type,type==='specialist'?1.08:1.28),el('span','',g.name(type,faction)),el('small','roster-role',unitRole(type,faction)));
      b.setAttribute('aria-controls','unitSheet');buttons.set(type,b);options.append(b);
    }
    detail.id='unitSheet';detail.setAttribute('aria-live','polite');
    detail.style.setProperty('--roster-tone',factions[faction].tone);options.style.setProperty('--roster-tone',factions[faction].tone);
    describe(guideUnit);
    const structures=el('div','roster roster-buildings');
    for(const type of ['hq',...buildings]){
      const card=el('div','roster-item');card.append(item(type,type==='hq'?.41:.64),el('span','',g.name(type,faction)),el('small','roster-role',roles[type]));structures.append(card);
    }
    root.append(el('h3','roster-title','병력 도감'),options,detail,el('h3','roster-title','건물'),structures);
  }
  function updateNav(){document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('current',b.dataset.tab===page||(page==='new'||page==='result')&&b.dataset.tab==='battle'))}
  function closeModal(){if(modal.open)modal.close()}
  modal.addEventListener('close',()=>{page='battle';updateNav();refresh();world.focus({preventScroll:true})});
  modal.querySelector('.dialog-close').onclick=closeModal;
  modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal()}});
  function heading(root,over,title){root.append(el('div','eyebrow',over),el('h2','dialog-title',title))}
  const researchPlates={
    afterimage:{units:['specialist'],sign:['   o   ','  o o  ',' o * o ','o * * o',' o * o ','  o o  ','   o   ']},
    farlens:{units:['soldier','heavy'],sign:['  oo   ',' o  o  ','o  **o ','o *  o ',' o  o *','  oo  *','      *']},
    fault:{units:['heavy'],sign:['    xxx','   x**x','  x**x ',' x**x  ',' xx    ','x x  xx',' x xx  ']},
    furnace:{units:['specialist'],sign:['  x   x',' x*  xx',' xx x*x','x *x* x','x ** xx',' x* *x ','  xxx  ']},
    budding:{units:['worker','soldier'],sign:['xx   xx','x*x x*x',' xx xx ','   x   ','   x xx','  xx*x ',' xxx   ']},
    nectar:{units:['specialist'],sign:['   *   ',' * x * ','  x*x  ','   *   ',' x x x ','  x x  ','   x   ']}
  };
  function researchArt(faction,id){
    const plate=researchPlates[id],tone=factions[faction].tone;
    const cv=el('canvas','research-plate');cv.width=136;cv.height=55;cv.setAttribute('aria-hidden','true');
    const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
    c.fillStyle={velari:'#322b40',cinder:'#3a2c2c',myren:'#283732'}[faction];c.fillRect(0,0,136,55);
    c.globalAlpha=.12;c.fillStyle=tone;
    for(let y=7;y<55;y+=8)for(let x=4;x<136;x+=8)c.fillRect(x,y,1,1);
    c.globalAlpha=.38;c.fillRect(9,45,75,1);c.fillRect(88,45,5,1);c.globalAlpha=1;
    plate.units.forEach((type,i)=>Art.draw(c,type,faction,plate.units.length===1?46:28+i*36,44,{size:type==='specialist'?.97:1.12}));
    c.fillStyle=tone;c.globalAlpha=.28;c.fillRect(91,8,1,32);c.fillRect(91,8,6,1);c.fillRect(124,40,5,1);c.fillRect(128,11,1,30);c.globalAlpha=1;
    plate.sign.forEach((row,y)=>[...row].forEach((v,x)=>{
      if(v===' ')return;c.fillStyle=v==='*'?'#fff0c7':tone;c.fillRect(100+x*3,14+y*3,3,3);
    }));
    return cv;
  }
  function renderDoctrine(root){
    const research=g.doctrine,state=research.status(),choices=research.options(),price=research.cost();
    const unchosen=state.phase==='none',working=state.phase==='researching';
    heading(root,'HEADQUARTERS',factions[g.faction].name+' 교리 연구');
    root.append(el('p','dialog-desc',unchosen?'이번 교전에 적용할 교리 하나를 고르세요. 연구 중에도 유닛을 훈련할 수 있습니다.':
      working?'전장으로 돌아가면 연구가 이어집니다. 완료 전에는 취소하고 자원을 전부 돌려받을 수 있습니다.':'이 교리는 교전이 끝날 때까지 아군에 적용됩니다.'));
    const terms=el('div','research-terms');
    for(const [symbol,label] of [['crystal','빛결정 '+price.crystal],['ore','불씨광 '+price.ore]]){
      const item=el('span');item.append(UIArt.art(symbol),document.createTextNode(label));terms.append(item);
    }
    terms.append(el('span','', '연구 '+state.duration+'초'));
    if(unchosen)root.append(terms);
    const list=el('div','research-options');
    list.style.setProperty('--research-tone',factions[g.faction].tone);
    for(const choice of choices){
      if(!unchosen&&choice.id!==state.id)continue;
      const card=el('article','research-card');
      card.append(researchArt(g.faction,choice.id),el('h3','',choice.name),el('p','',choice.description));
      if(unchosen){
        const start=makeButton('research-start','연구 시작',()=>{
          const ok=research.research(choice.id);
          if(ok)closeModal();
          accept(ok,ok?'build':'error');
        });
        start.disabled=Boolean(research.reason(choice.id));
        start.setAttribute('aria-label',choice.name+' 연구 시작');
        card.append(start);
      }else if(working){
        const progress=el('progress');progress.max=state.duration;progress.value=state.duration-state.remaining;
        progress.setAttribute('aria-label',choice.name+' 연구 진행률');
        card.append(el('b','research-state','완료까지 '+Math.ceil(state.remaining)+'초'),progress);
      }else card.append(el('b','research-state','연구 완료'));
      list.append(card);
    }
    list.classList.toggle('committed',!unchosen);root.append(list);
    if(unchosen&&research.reason(choices[0].id))root.append(el('p','research-shortage',research.reason(choices[0].id)));
    const actions=el('div','modal-actions');
    if(working)actions.append(makeButton('secondary-button','연구 취소 · 전액 환불',()=>{
      const ok=research.cancel();if(ok)closeModal();accept(ok,'order');
    }));
    actions.append(makeButton('secondary-button','전장으로',closeModal));root.append(actions);
  }
  function cards(root,selected,choose){
    const wrap=el('div','faction-cards');
    for(const [id,f] of Object.entries(factions)){
      const b=makeButton('faction-card'+(selected===id?' chosen':''),undefined,()=>choose(id));
      b.setAttribute('aria-pressed',selected===id?'true':'false');b.style.setProperty('--card-tone',f.tone);
      const cv=el('canvas');cv.width=cv.height=64;Art.portrait(cv.getContext('2d'),id,0,0,64,64);
      b.append(cv,el('strong','',f.name),el('span','',f.brief));wrap.append(b);
    }root.append(wrap);
  }
  const mapPreviews=new Map();
  function placeMapPin(ctx,worldX,worldY,shape,tone){
    const x=Math.round(worldX*ctx.canvas.width/1280),y=Math.round(worldY*ctx.canvas.height/640);
    ctx.save();ctx.translate(x,y);
    if(shape==='beacon'){
      ctx.fillStyle=tone;ctx.strokeStyle='#292638';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(4,0);ctx.lineTo(0,4);ctx.lineTo(-4,0);ctx.closePath();ctx.fill();ctx.stroke();
    }else if(shape==='cargo'){
      ctx.fillStyle='#1b2532';ctx.fillRect(-4,-3,8,6);ctx.fillStyle=tone;ctx.fillRect(-3,-2,6,2);ctx.fillRect(-3,1,6,1);
    }else{
      ctx.fillStyle='#1b2532';ctx.fillRect(-4,-4,8,8);ctx.fillStyle=tone;ctx.fillRect(-3,-3,6,6);
    }
    ctx.restore();
  }
  function mapChoices(root){
    const block=el('section','map-picker'),heading=el('h3','roster-title','전장 선택'),list=el('div','map-options');
    const summary=el('p','map-description',mapBrief(nextMap));
    const buttons=new Map();
    for(const [id,meta] of Object.entries(Terrain.maps)){
      const terrain=Terrain.get(id);
      const button=makeButton('map-choice',undefined,()=>{
        nextMap=id;
        for(const [key,item] of buttons)item.setAttribute('aria-pressed',String(key===id));
        summary.textContent=mapBrief(id);
      });
      const preview=el('canvas');preview.width=180;preview.height=90;preview.setAttribute('aria-hidden','true');
      const c=preview.getContext('2d');
      if(!mapPreviews.has(id)){
        const base=el('canvas');base.width=180;base.height=90;
        const scene=base.getContext('2d');scene.scale(180/1280,90/640);terrain.draw(scene);
        mapPreviews.set(id,base);
      }
      c.drawImage(mapPreviews.get(id),0,0);
      placeMapPin(c,...terrain.layout.player.hq,'base',factions[nextFaction].tone);
      placeMapPin(c,...terrain.layout.enemy.hq,'base',factions[nextEnemy].tone);
      placeMapPin(c,terrain.beacon.x,terrain.beacon.y,'beacon','#f7d48e');
      const cache=DriftSalvage.landingFor(id);
      if(cache)placeMapPin(c,...cache,'cargo','#96dbd8');
      button.append(preview,el('span','',meta.name));button.setAttribute('aria-pressed',String(id===nextMap));
      list.append(button);buttons.set(id,button);
    }
    const legend=el('div','map-legend');
    for(const [type,label,tone] of [['base','아군',factions[nextFaction].tone],['base','적군',factions[nextEnemy].tone],['beacon','봉화','#f7d48e'],['cargo','금고','#96dbd8']]){
      const item=el('span'),pin=el('i',type);
      pin.style.setProperty('--pin',tone);pin.setAttribute('aria-hidden','true');
      item.append(pin,label);legend.append(item);
    }
    const title=el('div','map-heading');title.append(heading,legend);
    block.append(title,list,summary);root.append(block);
  }
  function renderModal(){
    modal.dataset.page=page;
    const root=$('modalContent');root.replaceChildren();
    if(page==='new'){
      heading(root,'SKIRMISH','새 교전');
      cards(root,nextFaction,id=>{nextFaction=id;if(nextEnemy===id)nextEnemy=Object.keys(factions).find(f=>f!==id);renderModal()});
      root.append(el('p','faction-description',factions[nextFaction].info));abilityDetail(root,nextFaction);
      const specialty=el('p','faction-ability');specialty.style.setProperty('--skill-tone',factions[nextFaction].tone);
      specialty.append(el('b','',g.name('specialist',nextFaction)),document.createTextNode(specialists[nextFaction].detail));root.append(specialty);
      mapChoices(root);
      const opponent=el('div','settings-row'),options=el('div','segmented');opponent.append(el('strong','','상대 진영'));
      for(const [id,f] of Object.entries(factions))if(id!==nextFaction){const b=makeButton(id===nextEnemy?'chosen':'',f.name,()=>{nextEnemy=id;renderModal()});b.setAttribute('aria-pressed',String(id===nextEnemy));options.append(b)}
      opponent.append(options);root.append(opponent);
      const row=el('div','settings-row');row.append(el('strong','','상대 AI 난이도'));const seg=el('div','segmented');
      for(const [key,name] of Object.entries(difficulties)){const b=makeButton(key===nextDifficulty?'chosen':'',name,()=>{nextDifficulty=key;renderModal()});b.setAttribute('aria-pressed',String(nextDifficulty===key));seg.append(b)}row.append(seg);root.append(row);
      const actions=el('div','modal-actions');actions.append(makeButton('secondary-button','취소',closeModal),makeButton('primary-button','교전 시작',()=>{begin(nextFaction,nextDifficulty,nextEnemy,nextMap);GameSound.play('build',g.faction)}));root.append(actions);
    }else if(page==='doctrine'){
      renderDoctrine(root);
    }else if(page==='factions'){
      heading(root,'FACTION CODEX','진영 도감');cards(root,guideFaction,id=>{guideFaction=id;renderModal()});root.append(el('p','faction-description',factions[guideFaction].info));abilityDetail(root,guideFaction);
      showRoster(root,guideFaction);
      const research=el('details','codex-research');research.append(el('summary','','사령부 교리'));
      for(const choice of g.doctrine.options(guideFaction)){
        const line=el('p');line.append(el('b','',choice.name),document.createTextNode(choice.description));research.append(line);
      }
      root.append(research);
    }else if(page==='guide'){
      heading(root,'FIELD MANUAL','플레이 가이드');root.append(el('p','dialog-desc','일꾼으로 빛결정과 불씨광을 모아 거주지와 병영을 건설하세요. 병영에서 훈련한 부대로 다리를 건너 적 사령부를 파괴하면 승리합니다.'));
      const dl=el('dl','guide-list');
      const guides=[
        ['선택','아군을 클릭하거나 드래그해 여러 유닛을 선택합니다. Shift와 클릭으로 선택을 바꿉니다. 혼성 부대는 선택 정보의 병종 그림을 누르면 해당 병종만 고를 수 있습니다.'],
        ['전방 채집','B를 누른 뒤 V로 집하장을 골라 먼 광맥 옆에 지으세요. 완성된 집하장의 결정 배정(G)이나 광석 배정(O)을 누르면 인근 광맥으로 일꾼을 한 기씩 보냅니다. 자원은 일꾼이 도착할 때 들어옵니다.'],
        ['이슬매듭','꽃실 엮음이를 선택하고 C를 누른 뒤 아군 한 기를 누르세요. C를 두 번 누르거나 이슬매듭 버튼을 두 번 누르면 가까운 추천 아군을 보호합니다. 5초 동안 피해를 32까지 막고, 남은 보호막의 절반만큼 체력을 회복합니다. 엮음이마다 18초 뒤 다시 쓸 수 있습니다.'],
        ['치유병 동행','꽃실 엮음이와 전투병을 함께 선택하고 Shift+P를 누르세요. 전투병들이 치유병에게 모여 호위합니다. 편성 뒤 치유병에 이동 명령을 내리면 한 부대로 다리를 건널 수 있습니다.'],
        ['풀무차 엄호','신더의 노을풀무차와 잿날병 또는 적철 파쇄기를 함께 선택하고 Shift+P를 누르세요. 보병과 중장병이 차량을 따라가며 지킵니다. 편성 직후에는 풀무차만 선택되므로 다음 목적지를 바로 지정할 수 있습니다.'],
        ['잿꽃탄','신더의 노을풀무차를 선택하고 C를 누른 뒤 육지나 다리를 클릭하세요. 가장 가까운 발사 가능 차량 한 기가 쏩니다. 약 1.5초 뒤 착탄 범위 안에 있는 적이 피해를 입습니다. 차량마다 재장전에 16초가 걸립니다. 터치에서는 한 번 눌러 겨눈 뒤 같은 곳을 다시 탭해 발사하거나, 조준 취소를 눌러 명령을 거두세요.'],
        ['표식 일제사격','벨라리의 결맥 추적자가 적에게 표식을 남기면 다른 전투병의 공격에 추가 피해가 붙습니다. C 또는 표식 일제사격을 누르면 사거리 안의 병력이 장전되는 대로 한 발씩 쏩니다. 아직 쏠 표식이 없을 때는 8초간 사격을 예약합니다. 공격 이동을 먼저 지시한 뒤 예약하세요. 다른 부대를 선택해도 예약은 유지됩니다. 대기 병력에 새 명령을 내리거나 C를 다시 누르면 취소됩니다.'],
        ['이동과 공격','선택 후 땅이나 적을 우클릭합니다. A를 누르고 지점을 클릭하면 교전하며 이동합니다.'],
        ['거점 경비','전투병을 고르고 P를 누른 뒤 완성된 아군 건물을 지정하세요. 경비병이 주변의 적을 요격하고 건물로 복귀합니다. 건물을 선택하면 P로 대기 병력 한 기를 호출하거나 경비대 인원수를 눌러 배치된 병력을 고를 수 있습니다.'],
        ['출격대 선택','Shift+F 또는 지휘 명령의 출격대 버튼은 경비·호위·사수·후퇴 임무를 맡은 병력을 남겨 둡니다. 전체 전투병을 선택하려면 F를 누르세요.'],
        ['공사 재개','공사 중인 건물에서 일꾼이 이탈하면 공사가 멈춥니다. 건물을 선택하고 J를 누르면 일꾼 한 기가 남은 공사를 이어갑니다.'],
        ['호위','전투병을 고르고 아군 일꾼이나 전투병을 우클릭하면 계속 따라가며 지켜 줍니다. P 또는 호위 버튼을 누른 뒤 대상을 탭해도 됩니다. 미렌의 꽃실 엮음이는 지정한 아군이 다치면 호위 중에 우선 치료합니다. 전선을 떠난 일꾼이나 후퇴하는 전투병도 치료할 수 있습니다.'],
        ['부상병 후퇴','체력 60% 이하인 전투병이 섞여 있으면 Z 또는 부상병 버튼으로 그 병력만 고릅니다. R을 누르면 적을 지나쳐 본진 뒤로 후퇴합니다. 미렌은 후퇴하는 부상병을 선택한 채 C 또는 매듭 요청을 누르면 가까운 꽃실 엮음이가 보호막을 겁니다. Z를 다시 누르면 원래 선택했던 생존 병력이 선택됩니다.'],
        ['경유 명령','Shift를 누른 채 지점이나 적을 우클릭하면 이동과 공격을 차례로 예약합니다. 터치에서는 부대를 고르고 전장의 경유 버튼을 켠 뒤 목적지를 순서대로 누르세요. 정지(S)는 예약까지 취소합니다.'],
        ['채집과 건설','상단의 빛결정이나 불씨광을 누를 때마다 그 자원에 일꾼 한 기를 배정합니다. 쉬는 일꾼을 먼저 보내고, 모두 일하는 중이면 다른 자원의 채집 일꾼을 옮깁니다. I로 쉬는 일꾼을 선택해 특정 자원을 우클릭할 수도 있습니다. B로 건물을 고른 뒤 육지를 클릭해 짓습니다.'],
        ['사수와 수리','K로 제자리를 지키며 사거리 안의 적을 공격합니다. 손상된 건물을 고르고 J를 눌러 수리 일꾼을 부르세요. 사령부가 공격받으면 전장 왼쪽 위에 체력과 수리 버튼이 나타납니다. 불씨광 1로 체력을 최대 4 회복합니다.'],
        ['공성 중 수리 차단','공격받는 적 사령부를 수리한 일꾼 위에 렌치가 뜹니다. 전투병을 선택하고 렌치를 우클릭하면 해당 일꾼을 공격합니다. 터치 화면에서는 렌치를 한 번 누르세요.'],
        g.mapId==='lantern'
          ? ['달등 짐배','첫 배는 50초에 갈대 부두에 닿습니다. 입항 예고가 뜨면 파견 버튼을 누르거나, 일꾼을 선택해 배를 우클릭하세요. 터치 화면에서는 배를 탭하세요. 부두에서 5초간 짐을 내리면 빛결정 72개와 불씨광 26개를 얻습니다. 적이 가까이 있으면 하역이 멈춥니다. '+ferryBrief]
          : ['물결 금고','첫 금고는 50초에 도착합니다. 금고가 예고되면 파견을 눌러 일꾼을 보내세요. 도착한 일꾼이 5초간 회수하면 빛결정 72와 불씨광 26을 얻습니다. 적이 다가오면 호위 병력으로 밀어내세요.'],
        ['생산','사령부에서 일꾼(Q)을, 병영에서 전투병(W), 중장병(E), 진영 고유 특수병(U)을 훈련합니다. 상단 인구의 +를 누르고 지을 곳을 지정하면 일꾼이 거주지를 건설해 인구 한도를 늘립니다. 훈련을 예약한 병력도 인구에 포함됩니다. 유닛 초상화를 누르면 도감에서 능력과 비용을 볼 수 있습니다.'],
        [g.beaconName,Terrain.maps[g.mapId].description+' 봉화의 원 안에 아군 전투 유닛만 7초간 머물면 봉화를 점령합니다. 12초마다 빛결정 18과 불씨광 8이 들어옵니다. 양쪽 병력이 함께 있으면 점령이 멈춥니다.'+(g.bell?' '+bellBrief:'')],
        ['진영 전술','T를 누른 뒤 위치를 클릭하거나, 부대를 선택하고 T를 두 번 눌러 부대에 바로 쓰세요. 터치에서는 전술 버튼을 두 번 누릅니다. 효과는 8초간 지속되며 40초 뒤 다시 쓸 수 있습니다.'],
        ['교리 연구','사령부의 교리 연구 또는 Y로 진영 전용 교리 두 가지를 비교합니다. 빛결정 75와 불씨광 30을 들여 22초 동안 하나를 연구하면 교전 끝까지 적용됩니다. 완료 전에는 취소하고 자원을 돌려받을 수 있습니다.'],
        ['생산 관리','D로 병력 훈련, V로 생산 대기열을 엽니다. 병영마다 자동 충원할 병종을 정할 수 있습니다. Shift+R 또는 대기열의 병영 공동 집결을 누르고 전장이나 미니맵을 누르면 모든 병영의 증원이 한 지점으로 모입니다.'],
        ['전황 기록','L 또는 전황 버튼으로 최근 보고를 엽니다. 보고를 누르면 당시 위치를 전장에 표시합니다. 기록을 읽는 동안에도 교전은 계속됩니다.'],
        ['부대 나누기','전투병을 두 기 이상 선택하고 X 또는 부대 나누기를 누르면 병종과 인원을 고르게 나눠 빈 부대 번호에 저장합니다. 첫 부대에 명령을 내린 뒤 안내된 다른 번호를 눌러 두 번째 경로를 지시하세요.'],
        ['부대 관리','F는 전투 부대 전체, H는 사령부를 선택합니다. 하단의 빈 부대 칸을 클릭하거나 Ctrl/⌘ + 숫자를 눌러 현재 선택을 저장하세요. Shift + 숫자는 병력을 추가하고 숫자를 두 번 누르면 부대 위치로 갑니다.'],
        ['시점과 시간','방향키와 미니맵으로 시점을 옮기고 휠로 확대합니다. 시계 옆 배율을 눌러 속도를 바꿉니다. Space로 일시정지해 배경 음악을 켤 수 있습니다.'],
        ['터치 조작','아군을 탭한 뒤 목적지나 적을 탭합니다. 길게 누르면 현재 선택한 대상에 명령을 내립니다.']
      ];for(const [key,detail] of guides)dl.append(el('dt','',key),el('dd','',detail));root.append(dl);
    }else if(page==='result'){
      Operations.result(root,g,factions,{
        locate:event=>{
          closeModal();view.center(event.x,event.y);
          if(event.kind==='beacon'||event.kind==='bell')view.beaconUntil=performance.now()+2600;
          view.marker={x:event.x,y:event.y,stamp:performance.now(),color:event.side==='enemy'?'#ffb28e':'#f2cc97'};
          view.drawMinimap(g,factions);toast(prettyTime(event.time)+' · '+event.text,3000);
        },
        rematch:()=>begin(g.faction,g.difficulty,g.enemyFaction,g.mapId),newGame:()=>openPage('new'),inspect:closeModal
      });
    }
  }
  function openPage(next,entry){fieldLog.close();clearDrag();keys.clear();GameSound.unlock();
    if(next==='battle'){closeModal();return}
    if(next==='new'){nextFaction=g.faction;nextEnemy=g.enemyFaction;nextDifficulty=g.difficulty;nextMap=g.mapId}
    if(next==='factions'){guideFaction=entry?.faction||g.faction;guideUnit=entry?.type||'specialist'}
    focusQueue(false);page=next;updateNav();renderModal();if(!modal.open)modal.showModal();refresh();
    if(next==='factions'&&entry){
      const active=modal.querySelector('.roster-units [aria-pressed=true]');
      active?.focus({preventScroll:true});
      $('unitSheet')?.scrollIntoView({block:'nearest'});
    }
  }
  document.querySelectorAll('.nav-button').forEach(b=>b.onclick=()=>openPage(b.dataset.tab));
  $('newGame').onclick=()=>openPage('new');$('helpOpen').onclick=()=>openPage('guide');
  document.addEventListener('keydown',e=>{
    if(modal.open||e.target.closest?.('select,input,textarea,[contenteditable=true]'))return;
    const k=e.key.toLowerCase(),code=e.code;
    if(e.altKey&&!['AltLeft','AltRight'].includes(code))return;
    if(e.repeat&&!code.startsWith('Arrow'))return;
    if(code.startsWith('Arrow')){e.preventDefault();keys.add(code);return}
    if(code==='Escape'){
      if(fieldLog.isOpen){e.preventDefault();fieldLog.close({restoreFocus:true})}
      else if(mode||buildMenu||recruitMenu){cancelMode();refresh()}
      else if(addingOrders){addingOrders=false;refresh()}
      else if(!$('intelTray').hidden)focusQueue(false);
      else if(paused)pause(false);
      else if(document.body.classList.contains('expanded'))$('expand').click();
      else select([],true);
      return;
    }
    if(code==='Space'){e.preventDefault();GameSound.unlock();pause();return}
    if(k==='?'||code==='F1'){e.preventDefault();openPage('guide');return}
    if(code==='KeyL'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();if(fieldLogAvailable())fieldLog.toggle();return}
    if(g.result&&resultShown&&!e.ctrlKey&&!e.metaKey){
      if(code==='Enter'&&(e.target===world||e.target===document.body)){e.preventDefault();openPage('result')}
      if(code==='KeyN')openPage('new');
      if(code==='KeyH')returnHome();
      if(code==='KeyF')selectForce();
      return;
    }
    if(!normalPlay())return;
    if(code==='KeyV'&&!buildMenu&&!e.ctrlKey&&!e.metaKey){e.preventDefault();focusQueue($('intelTray').hidden);return}
    if(squads.handleKey(e))return;
    if(e.ctrlKey||e.metaKey)return;
    if(code==='KeyY'||(code==='KeyR'&&e.shiftKey)){e.preventDefault();command(code==='KeyY'?'doctrine':'rallyAll');return}
    if(!buildMenu&&code==='KeyC'){
      e.preventDefault();
      if(mode?.command==='ash'){cancelMode();refresh()}
      else command({myren:'dew',cinder:'ash',velari:'volley'}[g.faction]);
      return;
    }
    if(!buildMenu&&(code==='KeyG'||code==='KeyO')){
      const selected=getSelected();
      if(selected.length===1&&owned(selected[0])&&selected[0].type==='depot'&&selected[0].progress===1){
        e.preventDefault();command(code==='KeyG'?'localCrystal':'localOre');return;
      }
    }
    if(code==='KeyP'&&e.shiftKey&&['myren','cinder'].includes(g.faction)){e.preventDefault();command('convoy');return}
    if(code==='KeyF'&&e.shiftKey){e.preventDefault();command('expedition');return}
    if(code==='KeyJ'&&!buildMenu){
      const site=getSelected()[0];
      if(g.selected.length===1&&site&&owned(site)&&site.progress<1){e.preventDefault();command('resumeBuild');return}
    }
    if(code==='KeyZ'&&!buildMenu){e.preventDefault();wounded.toggle();return}
    if(code==='KeyR'&&!buildMenu){
      const group=getSelected().filter(owned);
      if(group.some(ownFighter)&&!['hq','barracks'].includes(group[0]?.type)){e.preventDefault();command('retreat');return}
    }
    if(code==='KeyX'&&!buildMenu){e.preventDefault();command('split');return}
    const id=({KeyQ:'worker',KeyW:'soldier',KeyE:'heavy',KeyU:'specialist',KeyB:'build',KeyD:'recruit',KeyT:'ability',KeyI:'idle',KeyA:'attackmove',KeyM:'move',KeyG:'gather',KeyJ:'repair',KeyK:'hold',KeyP:'escort',KeyS:'stop',KeyF:'army',KeyH:'home',KeyR:'rally'})[code]||(buildMenu?({KeyZ:'house',KeyX:'barracks',KeyC:'tower',KeyV:'depot'})[code]:null);
    if(id){e.preventDefault();command(id)}
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();clearDrag()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();clearDrag();GameSound.tick({running:false})}});
  function reportRank(event){
    switch(event.kind){
      case 'ash': return 4;
      case 'alert': return event.side==='enemy'?4:5;
      case 'beacon': return 4;
      case 'ability': return event.side==='enemy'?3:0;
      case 'doctrine': return event.text.endsWith('완료')?3:0;
      case 'siege': return event.side==='own'?5:3;
      case 'bell': return 3;
      case 'rescue': return 2;
      case 'battle': return 2;
      case 'salvage': return event.recoveryWorkerLost?3:2;
      case 'repair': return 1;
      case 'build': return event.constructionSiteId?3:event.text.includes('완료')?1:0;
      case 'train': return 1;
      default: return 0;
    }
  }
  function announceReports(now){
    const events=g.events,latest=events.at(-1);
    if(!latest||latest===lastEvent)return;
    const first=lastEvent?events.lastIndexOf(lastEvent)+1:0;
    lastEvent=latest;
    let notice=null,rank=0,threat=null,beacon=null,cacheEvent=null;
    for(let i=first;i<events.length;i++){
      const event=events[i],value=reportRank(event);
      if(value>0 && value>=rank){notice=event;rank=value;}
      if(event.kind==='alert'&&(!threat||value>=reportRank(threat)))threat=event;
      if(event.kind==='beacon')beacon=event;
      if(event.kind==='ash'&&event.side==='enemy')GameSound.play('ashWarning',g.enemyFaction);
      if(event.kind==='bell')GameSound.play('bell',event.side==='own'?g.faction:g.enemyFaction);
      if(event.kind==='salvage')cacheEvent=event;
      if(event.kind==='doctrine'&&event.side==='own'&&event.text.endsWith('완료'))GameSound.play('research',g.faction);
    }
    if(threat){
      if(Number.isFinite(threat.x)&&Number.isFinite(threat.y))view.threat=threat;
      GameSound.play('alert',g.faction);
    }
    if(beacon)GameSound.play('beacon',beacon.side==='enemy'?g.enemyFaction:g.faction);
    if(cacheEvent?.ferryArrival&&!threat)GameSound.play('ferryArrival');
    if(cacheEvent?.side==='own'&&!cacheEvent.recoveryWorkerLost)GameSound.play('coffer',g.faction);
    if(!notice || g.result || (mode?.prompt && rank<3) || (now<alertGuardUntil && rank<alertRank))return;
    const urgent=rank>=3;
    const duration=notice.kind==='ash'?Math.max(350,1450/speed):notice.approaches?.length?4200:2800;
    toast(notice.text,duration,urgent,notice);
    if(urgent){alertGuardUntil=now+duration-300;alertRank=rank;}
  }
  let prev=performance.now(),hudTime=0;
  function frame(now){
    const dt=Math.min(.1,Math.max(0,(now-prev)/1000));prev=now;
    if(!document.hidden){
      if(normalPlay())g.update(dt*speed);
      if(g.result&&!resultShown){
        if(finalDelay===null){
          finalDelay=0;fieldLog.close();focusQueue(false);cancelMode();const burst=g.effects.findLast(f=>f.type==='burst'&&f.targetType==='hq');
          $('message').classList.remove('visible');$('message').textContent='';
          if(burst)view.center(burst.tx,burst.ty+32);GameSound.play('destroy',g.faction);GameSound.play(g.result,g.faction);
        }else{
          finalDelay+=dt;for(const fx of g.effects)fx.age+=dt;g.effects=g.effects.filter(fx=>fx.age<fx.life);
          if(finalDelay>=1.05){finalDelay=null;resultShown=true;openPage('result')}
        }
      }
      if(keys.size&&!modal.open){const dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),dy=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));view.center(view.x+dx*330*dt/view.scale,view.y+dy*330*dt/view.scale)}
      view.render(g,factions);
      if(normalPlay()){
        for(const effect of g.effects)if(!soundedEffects.has(effect)){
          soundedEffects.add(effect);
          if(effect.type==='markFollowup')continue;
          if(['repair','dewCast','dewBreak','dewMend','volleyRelease'].includes(effect.type)){
            GameSound.play(effect.type,effect.faction);continue;
          }
          latestCombat=g.time;
          let cue='hit';
          if(effect.type==='burst'&&['hq',...buildings].includes(effect.targetType))cue='destroy';
          else if(effect.type==='shot'&&effect.commanded)cue='volleyHit';
          else if(effect.type==='shot'&&effect.sourceType==='specialist')cue='specialist';
          else if(['ashImpact','mark','splash','heal'].includes(effect.type))cue=effect.type;
          GameSound.play(cue,effect.faction);
        }
        for(const field of g.tactics.fields)if(!soundedFields.has(field)){
          soundedFields.add(field);GameSound.play('ability',field.faction);
        }
      }
      announceReports(now);
      if(now>=hudTime){hudTime=now+140;refresh()}
      if(now>toastUntil){
        if(mode?.prompt&&normalPlay())toast(mode.prompt,Infinity);
        else $('message').classList.remove('visible');
      }
    }
    requestAnimationFrame(frame);
  }
  begin('velari','normal');
  view.onresize=()=>{view.render(g,factions);view.drawMinimap(g,factions)};
  requestAnimationFrame(frame);
})();
