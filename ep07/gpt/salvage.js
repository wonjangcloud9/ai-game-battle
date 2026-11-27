/* Riftwake — a tidal coffer brought ashore between the two armies. */
(() => {
  'use strict';
  const firstLanding=50, forecast=16, openFor=40, period=110, workSeconds=5;
  const crystal=72, ore=26, reach=21, guardRange=46;
  const military=new Set(['soldier','heavy','specialist']);
  const sites={
    shoals:{name:'가운데 여울',points:[[639,340],[649,324],[639,352],[672,339],[674,313],[690,353],[688,308]]},
    delta:{name:'남쪽 돌다리',points:[[640,456],[640,408],[617,464],[662,464],[592,440],[687,440]]},
    kiln:{name:'북쪽 재받이',points:[[640,134],[656,145],[620,143],[643,157],[615,127],[665,131],[630,113]]},
    lantern:{name:'갈대 부두',freight:{crystal:36,ore:13},points:[[695,551],[678,553],[710,545],[666,545],[704,531],[680,536]]}
  };
  const near=(a,b,r)=>(a.x-b.x)**2+(a.y-b.y)**2<=r*r;
  const crate=[
    '       ss        ',
    '    sssttss      ',
    '  sstttwwttss    ',
    'sstttsswwssttss  ',
    'sdssggswwsggssts ',
    'sddsggsssggsddgs ',
    'sdddsdggddgsddgs ',
    ' ssdsdgwddgsddgs ',
    '   ssswwddgssgs  ',
    '     sggssgsss   ',
    '       ssss      '
  ];
  const palette={s:'#29313c',g:'#79bfba',d:'#9c6845',t:'#e6af69',w:'#fff0bc'};

  class DriftSalvage {
    static landingFor(mapId){return sites[mapId]?.points[0]}
    constructor(game){
      this.game=game;
      this.site=sites[game.mapId];
      this.ferry=this.site.freight&&window.LanternFerry?new window.LanternFerry():null;
      this.epoch=0;
      this.landing=firstLanding;
      this.phase='sleep';
      this.x=this.site.points[0][0];this.y=this.site.points[0][1];
      this.progress=0;this.claimant=null;this.contested=false;
      this.crew=new Set();this.needsReplacement=false;this.lossReported=false;
      for(const side of [game.faction,game.enemyFaction]){
        game.report[side].salvaged=0;
        if(this.site.freight)game.report[side].lanternLoads=0;
      }
    }
    signalOwner(){
      const beacon=this.game.beacon;
      return this.site.freight&&!beacon.contested&&!beacon.claimant?beacon.owner:null;
    }
    visible(){return this.phase!=='sleep'&&!this.game.result}
    ferryPose(){return this.ferry?.pose(this.game.time,this.phase,this.landing,forecast)}
    hit(x,y){
      if(!this.visible())return false;
      return near(this,{x,y},reach)||near({x:this.x,y:this.y-16},{x,y},17)||
        Boolean(this.ferry?.hit(x,y,this.ferryPose(),this.game.time));
    }
    blocksBuild(x,y,rx,ry){
      if(!this.visible())return false;
      return ((x-this.x)/(rx+18))**2+((y-this.y)/(ry+18))**2<1;
    }
    _signal(){
      const g=this.game;
      const bases=g.entities.filter(e=>e.type==='hq'&&e.hp>0);
      const point=this.site.points.find(([x,y])=>g.nav.pass(x,y)&&
        !g.entities.some(e=>e.hp>0&&['hq','barracks','house','tower','depot'].includes(e.type)&&
          g._gap({x,y},e)<20)&&bases.every(base=>g.nav.route(base,{x,y}).length));
      if(!point){this.landing+=period;return}
      [this.x,this.y]=point;
      this.epoch++;this.phase='incoming';this.aiSent=false;
      this.lossReported=false;
      this.aiAt=this.landing+({easy:12,normal:2,hard:-4}[g.difficulty]);
      const arrival=this.site.freight?'에 달등 짐배가 들어옵니다.':'에 물결 금고가 밀려옵니다.';
      const event=g._event(this.site.name+arrival+' 일꾼을 보내세요.','salvage',this,'neutral');
      if(this.site.freight)event.ferryArrival=true;
      for(const w of g.entities){
        if(w.type==='worker'&&w.hp>0&&w.action==='idle'&&near(w,this,reach))this.start(w,{epoch:this.epoch});
      }
    }
    order(selected,append){
      const g=this.game;
      const workers=selected.filter(e=>e.type==='worker'&&g.nav.route(e,this).length);
      if(!workers.length)return g._say('금고까지 갈 수 있는 일꾼을 선택하세요.');
      const point={mode:'salvage',x:this.x,y:this.y,epoch:this.epoch};
      for(const w of workers){
        g._issueWaypoint(w,point,append);
        if(append)this._trackWorker(w);
      }
      const guards=selected.filter(e=>military.has(e.type));
      const slots=g.nav.formation(guards,this.x,this.y+11);
      for(const unit of guards){
        const slot=slots.get(unit.id);
        if(slot)g._issueWaypoint(unit,{mode:'attackmove',x:slot.x,y:slot.y},append);
      }
      return g._say(append?'금고 회수를 예약했습니다.':'일꾼이 물결 금고를 회수하러 갑니다.',true);
    }
    _onTrip(w){
      return (w.action==='salvage'&&w.salvageEpoch===this.epoch)||w.waypoints.some(p=>p.mode==='salvage'&&p.epoch===this.epoch);
    }
    _assigned(){
      return this.game.entities.some(w=>w.faction===this.game.faction&&w.type==='worker'&&w.hp>0&&this._onTrip(w));
    }
    _trackWorker(w){
      if(!this.site.freight||w.faction!==this.game.faction)return;
      this.crew.add(w);this.needsReplacement=false;
    }
    _checkCrew(){
      let lost=false;
      for(const w of this.crew){
        if(!this._onTrip(w))this.crew.delete(w);
        else if(w.hp<=0){this.crew.delete(w);lost=true}
      }
      if(!lost||this.crew.size)return;
      this.needsReplacement=true;
      if(this.lossReported)return;
      this.lossReported=true;
      const event=this.game._event('회수 일꾼을 잃었습니다. 다시 파견하세요.','salvage',this,'own');
      event.recoveryWorkerLost=true;
    }
    dispatch(){
      const g=this.game;
      if(!this.visible())return g._say('지금은 회수할 물결 금고가 없습니다.');
      if(this._assigned())return g._say('이미 금고에 일꾼을 파견했습니다.');
      const candidates=g.entities.filter(w=>w.faction===g.faction&&w.type==='worker'&&w.hp>0&&
        ['idle','gather','return'].includes(w.action)&&!w.waypoints.length);
      candidates.sort((a,b)=>Number(b.action==='idle')-Number(a.action==='idle')||
        Number(a.carried>0)-Number(b.carried>0)||Math.hypot(a.x-this.x,a.y-this.y)-Math.hypot(b.x-this.x,b.y-this.y));
      const worker=candidates.find(w=>g.nav.route(w,this).length);
      if(!worker)return g._say('파견할 수 있는 유휴 또는 채집 일꾼이 없습니다.');
      const returnTo=worker.action==='idle'?{x:worker.x,y:worker.y}:null;
      g._issueWaypoint(worker,{mode:'salvage',x:this.x,y:this.y,epoch:this.epoch,returnTo},false);
      return g._say(g.name('worker')+' 한 기를 파견했습니다.',true);
    }
    start(w,point){
      if(!this.visible()||w.type!=='worker'||point.epoch!==this.epoch)return false;
      if(w.action!=='salvage'){
        w.salvageMine=['gather','return'].includes(w.action)?w.depositId:null;
        w.salvageResource=this.game.byId.get(w.salvageMine)?.type||null;
        w.salvageReturn=point.returnTo||null;
      }
      this.game._set(w,'salvage');
      w.salvageEpoch=this.epoch;
      this._trackWorker(w);
      return true;
    }
    work(w,dt){
      if(w.type!=='worker')return false;
      // A plain ground order into the coffer also works. Marchers passing it en route keep their orders.
      if(w.action==='move'&&this.visible()&&!w.waypoints.length&&w.destination&&
         near(w.destination,this,reach)&&near(w,this,reach)){
        this.start(w,{epoch:this.epoch});
      }
      if(w.action!=='salvage')return false;
      if(!this.visible()||w.salvageEpoch!==this.epoch){this._release(w);return true}
      if(!near(w,this,reach))this.game._walk(w,{x:this.x,y:this.y},dt);
      else w.facing=this.x>=w.x?1:-1;
      return true;
    }
    _release(w){
      const g=this.game;
      w.salvageEpoch=null;
      if(w.waypoints.length){g._finishOrder(w);return}
      const original=g.byId.get(w.salvageMine);
      const node=original?.hp>0?original:(w.salvageResource?g._nextNode(w,w.salvageResource):null);
      if(w.carried)g._set(w,'return');
      else if(node?.hp>0)g._gather(w,node);
      else if(w.salvageReturn)g._setMove(w,w.salvageReturn,false);
      else g._set(w,'idle');
    }
    _ai(){
      const g=this.game;
      if(this.aiSent||g.time<this.aiAt||this.landing+openFor-g.time<14)return;
      this.aiAt=g.time+4;
      const workers=g.entities.filter(e=>e.faction===g.enemyFaction&&e.type==='worker'&&e.hp>0);
      if(workers.length<5)return;
      if(g.entities.some(e=>e.faction===g.faction&&e.hp>0&&military.has(e.type)&&near(e,this,guardRange+10)))return;
      const available=workers.filter(w=>['idle','gather','return'].includes(w.action)&&g.time-w.lastHurt>6);
      available.sort((a,b)=>Number(a.carried>0)-Number(b.carried>0)||
        Math.hypot(a.x-this.x,a.y-this.y)-Math.hypot(b.x-this.x,b.y-this.y));
      const worker=available.find(w=>g.nav.route(w,this).length);
      if(!worker)return;
      this.aiSent=true;
      g._issueWaypoint(worker,{mode:'salvage',x:this.x,y:this.y,epoch:this.epoch},false);
    }
    _finish(side){
      const g=this.game;
      this.phase='sleep';
      this.crew.clear();this.needsReplacement=false;
      if(this.ferry)this.ferry.departure=g.time;
      if(side){
        const freight=this.signalOwner()===side?this.site.freight:null;
        const crystalPayout=crystal+(freight?.crystal||0),orePayout=ore+(freight?.ore||0);
        g.bank[side].crystal+=crystalPayout;g.bank[side].ore+=orePayout;
        g.report[side].salvaged++;
        if(freight)g.report[side].lanternLoads++;
        const own=side===g.faction;
        this.flash={x:this.x,y:this.y,start:g.time};
        const event=g._event((own?'아군':'적군')+' 물결 금고 회수'+(freight?' · 봉화 추가 화물':'')+' · 빛결정 +'+crystalPayout+' / 불씨광 +'+orePayout,'salvage',this,own?'own':'enemy');
        if(freight)event.lanternLoad=true;
      }else g._event(this.site.freight?'회수 시간이 지나 달등 짐배가 출항했습니다.':'회수 시간이 지나 물결 금고가 떠내려갔습니다.','salvage',this,'neutral');
      for(const w of g.entities){
        if(w.type==='worker'&&w.action==='salvage'&&w.salvageEpoch===this.epoch&&w.hp>0)this._release(w);
      }
      this.claimant=null;this.progress=0;this.contested=false;
      this.landing+=period;
    }
    update(dt){
      const g=this.game;
      if(g.result||!(dt>0))return;
      if(this.phase==='sleep'&&g.time>=this.landing-forecast)this._signal();
      if(this.phase==='sleep')return;
      this._ai();
      if(g.time<this.landing){this._checkCrew();return}
      this.phase='open';
      const end=this.landing+openFor;
      const elapsed=Math.max(0,Math.min(g.time,end)-Math.max(g.time-dt,this.landing));
      let ownWorker=false,enemyWorker=false,ownPresence=false,enemyPresence=false;
      for(const u of g.entities){
        if(u.hp<=0||(!military.has(u.type)&&u.type!=='worker')||!near(u,this,guardRange))continue;
        const working=u.type==='worker'&&u.action==='salvage'&&u.salvageEpoch===this.epoch&&near(u,this,reach);
        if(u.faction===g.faction){ownPresence=true;ownWorker||=working}
        else if(u.faction===g.enemyFaction){enemyPresence=true;enemyWorker||=working}
      }
      this.contested=(ownWorker&&enemyPresence)||(enemyWorker&&ownPresence);
      if((this.claimant===g.faction&&!ownWorker)||(this.claimant===g.enemyFaction&&!enemyWorker)){
        this.claimant=null;this.progress=0;
      }
      if(!this.contested&&(ownWorker||enemyWorker)){
        this.claimant=ownWorker?g.faction:g.enemyFaction;
        this.progress=Math.min(1,this.progress+elapsed/workSeconds);
        if(this.progress>=1-1e-8){this._finish(this.claimant);return}
      }
      if(g.time>=end)this._finish(null);
      else this._checkCrew();
    }
    getStatus(){
      if(!this.visible())return null;
      const incoming=this.phase==='incoming', own=this.claimant===this.game.faction;
      const remaining=Math.max(0,Math.ceil(this.landing+(incoming?0:openFor)-this.game.time));
      const state=incoming?remaining+'초 후':this.contested?'경합':this.claimant?
        (own?'아군 ':'적군 ')+Math.floor(this.progress*100)+'%':remaining+'초 남음';
      const freight=this.site.freight;
      const extra=freight?' 회수를 마칠 때 나루 봉화를 단독 점령한 쪽은 빛결정 '+freight.crystal+'개와 불씨광 '+freight.ore+'개를 더 받습니다.':'';
      const target=freight?'짐배나 부두의 금고':'금고';
      return {phase:this.phase,label:freight?'달등 짐배':'물결 금고',state,remaining,x:this.x,y:this.y,dispatched:this._assigned(),needsReplacement:this.needsReplacement,
        progress:this.progress,claimant:this.claimant,contested:this.contested,
        description:this.site.name+' · 일꾼으로 '+target+'를 지정해 5초간 회수하면 빛결정 '+crystal+'개와 불씨광 '+ore+'개를 얻습니다. 적 유닛이 접근하면 회수가 멈춥니다.'+extra};
    }
    draw(ctx){
      if(this.ferry&&!this.game.result){
        this.ferry.draw(ctx,this.ferryPose(),this.game.time,this.signalOwner());
      }
      if(this.flash&&!this.game.result){
        const k=(this.game.time-this.flash.start)/1.1;
        if(k<1){
          ctx.save();ctx.translate(this.flash.x,this.flash.y-12);
          ctx.globalAlpha=Math.min(1,(1-k)*2);
          for(let i=0;i<10;i++){
            const a=i*Math.PI*.2, x=Math.round(Math.cos(a)*(5+16*k)), y=Math.round(Math.sin(a)*(3+9*k)-18*Math.sin(k*Math.PI));
            ctx.fillStyle=i%2?'#edbb74':'#d3a7ee';ctx.fillRect(x-2,y,4,2);ctx.fillRect(x-1,y-2,2,5);
          }
          ctx.restore();
        }
      }
      if(!this.visible())return;
      const g=this.game, incoming=this.phase==='incoming';
      const tone=this.contested?'#ff9c82':this.claimant===g.enemyFaction?'#fcaa87':'#a9e5d7';
      const px=Math.round(this.x),py=Math.round(this.y),tick=Math.floor(g.time*2);
      ctx.save();ctx.translate(px,py);
      // The perimeter is the real radius in which an enemy interrupts recovery.
      ctx.globalAlpha=incoming?.55:.68;
      for(let i=0;i<20;i++){
        const a=Math.PI*2*i/20;
        ctx.fillStyle=i%5===0?'#ffe1a4':tone;
        ctx.fillRect(Math.round(Math.cos(a)*guardRange)-1,Math.round(Math.sin(a)*guardRange)-1,i%5===0?4:2,2);
      }
      ctx.globalAlpha=1;
      if(incoming){
        ctx.fillStyle='#244c52';ctx.fillRect(-12,-2,24,5);ctx.fillStyle='#9bdbc9';
        for(let i=-1;i<=1;i++){
          const shift=(tick+i+6)%4;
          ctx.fillRect(i*7-3,-4-shift,5,2);ctx.fillRect(i*7-1,-2-shift,3,2);
        }
      }else{
        ctx.fillStyle='#293c4299';ctx.fillRect(-15,-1,31,5);
        const lift=Math.floor(g.time*1.5)%3===1?1:0;
        for(let j=0;j<crate.length;j++)for(let i=0;i<crate[j].length;i++){
          const c=palette[crate[j][i]];
          if(c){ctx.fillStyle=c;ctx.fillRect(i*2-16,j*2-20-lift,2,2)}
        }
        ctx.fillStyle='#fff1b6';ctx.fillRect(-3,1,6,2);
        if(this.claimant||this.contested){
          ctx.fillStyle='#222c36';ctx.fillRect(-17,-30,34,5);
          ctx.fillStyle=tone;ctx.fillRect(-16,-29,Math.round(this.progress*32),3);
          if(this.contested){ctx.fillStyle='#feaa83';ctx.fillRect(-3,-34,2,4);ctx.fillRect(1,-34,2,4)}
        }
      }
      ctx.restore();
    }
    drawMinimap(ctx,width,height,dpr=1){
      if(this.ferry&&!this.game.result){
        this.ferry.drawMini(ctx,this.ferryPose(),width,height,dpr,this.signalOwner());
      }
      if(!this.visible())return;
      const x=Math.round(this.x*width/1280),y=Math.round(this.y*height/640);
      const k=Math.max(1,Math.round(dpr));
      ctx.save();
      ctx.fillStyle='#21353b';ctx.fillRect(x-4*k,y-3*k,8*k,6*k);
      ctx.fillStyle=this.phase==='incoming'?'#a1d3c5':'#f3c27b';
      ctx.fillRect(x-3*k,y-2*k,6*k,k);ctx.fillRect(x-3*k,y,6*k,2*k);
      ctx.fillStyle='#fff1c0';ctx.fillRect(x-k,y-k,2*k,2*k);
      ctx.restore();
    }
  }
  window.DriftSalvage=DriftSalvage;
})();
