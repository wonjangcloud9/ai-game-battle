(() => {
  'use strict';
  const sizes={hq:[59,96],barracks:[37,60],house:[31,50],tower:[26,66],worker:[10,23],soldier:[13,26],heavy:[16,32],crystal:[31,40],ore:[31,32]};
  const specialistSizes={velari:[21,35],cinder:[25,33],myren:[23,36]};
  const depotSizes={velari:[42,70],cinder:[37,70],myren:[37,61]};
  const sizeOf=e=>e.type==='specialist'?specialistSizes[e.faction]:e.type==='depot'?depotSizes[e.faction]:sizes[e.type];
  const structures=['hq','house','barracks','tower','depot'];
  const isUnit=e=>['worker','soldier','heavy','specialist'].includes(e.type);
  const isResource=e=>e.type==='crystal'||e.type==='ore';
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  class Viewport {
    constructor(canvas,mini) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.mini=mini;this.mc=mini.getContext('2d');
      this.x=640;this.y=310;this.zoom=1;this.pointer=null;this.drag=null;this.marker=null;this.mode=null;
      this.rallyCache=new WeakMap();
      this.hudControls=canvas.parentElement?.querySelectorAll('.mission,.time-controls,.combat-tools,.map-tools')||[];
      this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.observer.observe(mini);
      for(const control of this.hudControls)this.observer.observe(control);
    }
    resize(){
      this.w=Math.max(1,this.canvas.clientWidth);this.h=Math.max(1,this.canvas.clientHeight);
      this.hudBounds=Array.from(this.hudControls,e=>({left:e.offsetLeft,top:e.offsetTop,right:e.offsetLeft+e.offsetWidth,bottom:e.offsetTop+e.offsetHeight}));
      this.dpr=Math.min(window.devicePixelRatio||1,2);
      for(const [canvas,w,h] of [[this.canvas,this.w,this.h],[this.mini,this.mini.clientWidth,this.mini.clientHeight]]){
        const width=Math.max(1,Math.round(w*this.dpr)),height=Math.max(1,Math.round(h*this.dpr));
        if(canvas.width!==width)canvas.width=width;
        if(canvas.height!==height)canvas.height=height;
      }
      this.fit=Math.max(this.w/1280,this.h/640);this.limit();this.onresize?.();
    }
    limit(){
      this.scale=this.fit*this.zoom;
      const hw=this.w/this.scale/2,hh=this.h/this.scale/2;
      this.x=clamp(this.x,hw,1280-hw);this.y=clamp(this.y,hh,640-hh);
      this.ox=this.w/2-this.x*this.scale;this.oy=this.h/2-this.y*this.scale;this.projectPointer();
    }
    reset(){
      const [homeX,homeY]=Terrain.layout.player.hq;
      this.zoom=1;this.x=this.w/this.h<1.45?homeX+40:640;
      this.y=Terrain.mapId==='shoals'?Math.min(homeY+24,64+this.h/this.fit/2):320;
      this.limit();
    }
    setZoom(value){this.zoom=clamp(Math.round(value*100)/100,1,2.5);this.limit()}
    center(x,y){this.x=x;this.y=y;this.limit()}
    reveal(e){
      const x=e.x*this.scale+this.ox,y=e.y*this.scale+this.oy;
      if(x<30||x>this.w-30||y<50||y>this.h-28)this.center(e.x,e.y);
    }
    projectPointer(){
      if(!this.pointerClient)return;
      const b=this.canvas.getBoundingClientRect(),x=this.pointerClient.x-b.left,y=this.pointerClient.y-b.top;
      this.pointer=x>=0&&y>=0&&x<=b.width&&y<=b.height?this.toWorld(x,y):null;
    }
    trackPointer(e){this.pointerClient={x:e.clientX,y:e.clientY};this.projectPointer()}
    clearPointer(){this.pointerClient=null;this.pointer=null}
    point(e){const b=this.canvas.getBoundingClientRect();return this.toWorld(e.clientX-b.left,e.clientY-b.top)}
    toWorld(x,y){return {x:(x-this.ox)/this.scale,y:(y-this.oy)/this.scale}}
    repairBadges(g){
      const badges=[];
      if(g.result)return badges;
      const scale=clamp(1/this.scale,.65,2.6);
      for(const worker of g.entities){
        if(worker.type!=='worker'||worker.faction!==g.enemyFaction||worker.hp<=0||worker.action!=='repair')continue;
        const age=g.time-worker.lastHQRepairAt;
        if(!(age>=0&&age<=1.15))continue;
        const base=g.byId.get(worker.targetId);
        if(base?.type!=='hq'||base.hp<=0||base.faction!==worker.faction)continue;
        const sinceHit=g.time-base.lastHurt;
        if(!(sinceHit>=0&&sinceHit<=10))continue;
        const x=Math.round(worker.x+8+6*scale),y=Math.round(worker.y-sizeOf(worker)[1]+5);
        badges.push({worker,x,y,scale});
      }
      return badges;
    }
    pick(g,x,y,badges){
      if(!this.mode||['attackmove','context'].includes(this.mode.command)){
        let closest=null,best=Infinity;
        for(const badge of badges||this.repairBadges(g)){
          const dx=x-badge.x,dy=y-badge.y,distance=dx*dx+dy*dy;
          const radius=6*badge.scale+2/this.scale;
          if(distance<=radius*radius&&distance<best){closest=badge.worker;best=distance}
        }
        if(closest)return closest;
      }
      const escort=this.mode?.command==='escort',dew=this.mode?.command==='dew';
      let front=null,priority=-1;
      for(const e of g.entities){
        if(e.hp<=0)continue;
        const [w,h]=sizeOf(e);if(x<e.x-w||x>e.x+w||y>e.y+7||y<e.y-h)continue;
        if(e.type==='depot'){
          if(!Art.hitDepot(e.faction,x-e.x,y-e.y))continue;
        }else if(!isUnit(e)&&!isResource(e)&&Math.abs(e.x-x)>=w*(.51+.48*clamp((y-e.y+h)/h,0,1)))continue;
        let rank=0;
        if(dew&&e.faction===g.faction&&isUnit(e))rank=2;
        else if(escort&&e.faction===g.faction){
          if(isUnit(e)&&!g.escortReason(e))rank=2;
          else if(structures.includes(e.type)&&e.progress===1)rank=1;
        }
        if(rank>priority||(rank===priority&&e.y>=front.y)){front=e;priority=rank}
      }
      return front;
    }
    ring(c,e,color){
      c.strokeStyle=color;c.lineWidth=1.6;
      const [width]=sizeOf(e),rx=isUnit(e)?width+2:width*.95,ry=isUnit(e)?5:rx*.4;
      c.beginPath();if(isUnit(e)){c.ellipse(e.x,e.y+1,rx,ry,0,0,Math.PI*2)}else{c.moveTo(e.x-rx,e.y);c.lineTo(e.x,e.y-ry);c.lineTo(e.x+rx,e.y);c.lineTo(e.x,e.y+ry);c.closePath()}c.stroke();
    }
    tag(c,e,g,factions){
      const f=factions[e.faction],yc=e.y-(e.type==='hq'?101:80);
      c.save();c.translate(Math.round(e.x),Math.round(yc));c.font='bold 11px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      const name=(e.faction===g.enemyFaction?'AI · ':'')+f.name,w=Math.ceil(c.measureText(name).width)+23,h=19,l=-Math.floor(w/2);
      c.fillStyle='#182028e8';c.fillRect(l,-h,w,h);c.fillStyle=f.tone;c.fillRect(l,-h,2,h);
      c.beginPath();c.moveTo(l+8,-10);c.lineTo(l+11,-13);c.lineTo(l+14,-10);c.lineTo(l+11,-7);c.closePath();c.fill();
      c.fillStyle='#f2ecf1';c.textBaseline='middle';c.fillText(name,l+17,-9);c.fillStyle='#182028';c.beginPath();c.moveTo(-3,0);c.lineTo(3,0);c.lineTo(0,3);c.fill();c.restore();
    }
    resource(c,e,t){
      const s=1+(e.hp/e.maxHp)*.03;
      Art.draw(c,e.type,'neutral',e.x-15,e.y-8,{size:.69*s});Art.draw(c,e.type,'neutral',e.x+16,e.y-6,{size:.66*s});Art.draw(c,e.type,'neutral',e.x,e.y+2,{size:s});
      if(e.type==='crystal'){const tick=t*.55+e.id;const a=tick%1;if(a<.28){let x=Math.round(e.x+(Math.floor(tick)%3-1)*10),y=Math.round(e.y-24-a*14);c.fillStyle='#f4dbff';c.fillRect(x-2,y,5,1);c.fillRect(x,y-2,1,5)}}
    }
    drawEntity(c,e,t,selected,hover,g){
      const unit=isUnit(e),resource=isResource(e);const friendly=e.faction===g.faction;
      if(unit&&e.moving&&e.marchUntil>t)Art.marchTrail(c,e,t);
      if(selected||hover)this.ring(c,e,selected?(friendly?'#bbe6b8':'#ffb8a7'):'#e2deb1');
      if(resource){this.resource(c,e,t);return}
      const height=sizeOf(e)[1],fraction=e.progress;
      c.save();
      if(fraction<1){
        c.globalAlpha=.24;Art.draw(c,e.type,e.faction,e.x,e.y);c.globalAlpha=1;
        c.beginPath();c.rect(e.x-70,e.y-(height+5)*fraction-6,140,(height+5)*fraction+20);c.clip();
      }
      Art.draw(c,e.type,e.faction,e.x,e.y,{time:t,phase:e.phase,moving:e.moving,facing:e.facing,size:unit?1.08:1});c.restore();
      if(structures.includes(e.type))Art.activity(c,e,t);
      if(unit&&e.carried>0){c.fillStyle=e.resourceType==='ore'?'#ffc66b':'#d9adfa';c.fillRect(Math.floor(e.x-6*e.facing),Math.floor(e.y-11),4,3)}
      if(e.action==='gather'&&!e.moving&&e.workClock>0){
        const k=(t*1.45+e.phase)%1;if(k<.3){const x=Math.round(e.x+e.facing*11),y=Math.round(e.y-7-k*17);c.fillStyle='#fff1bf';c.fillRect(x-2,y,5,1);c.fillRect(x,y-2,1,5)}
      }
      const ward=unit&&e.dewWard;
      if(ward&&ward.end>t)Art.dewWard(c,e,t,...sizeOf(e));
      const damaged=e.hp<e.maxHp-1,showBar=unit||selected||damaged||fraction<1;
      if(showBar){
        const w=unit?14:e.type==='hq'?45:30;
        const y=Math.round(e.y-(unit?height+2:height-1)),x=Math.round(e.x-w/2);
        c.fillStyle='#22252c';c.fillRect(x-1,y-1,w+2,4);c.fillStyle='#4c4b51';c.fillRect(x,y,w,2);
        c.fillStyle=fraction<1?'#e9c376':friendly?'#b2d8a9':'#ec8c78';c.fillRect(x,y,Math.max(1,Math.ceil(w*(fraction<1?fraction:e.hp/e.maxHp))),2);
        if(ward&&ward.end>t){
          c.fillStyle='#193c42';c.fillRect(x-1,y+3,w+2,3);
          c.fillStyle='#90e6dd';c.fillRect(x,y+4,Math.ceil(w*clamp(ward.shield/ward.capacity,0,1)),1);
        }
        if(friendly&&e.action==='hold'){
          const left=x-9;
          c.fillStyle='#243337';c.fillRect(left,y-2,7,5);c.fillRect(left+1,y+3,5,1);c.fillRect(left+2,y+4,3,1);
          c.fillStyle='#b8dbce';c.fillRect(left+1,y-1,5,3);c.fillRect(left+2,y+2,3,1);c.fillRect(left+3,y+3,1,1);
        }
        if(unit)g.tactics.markTroop(c,e,y);
      }
    }
    flashRallies(g){
      const ids=g.entities.filter(e=>e.type==='barracks'&&e.faction===g.faction&&e.progress===1&&e.hp>0&&e.rally).map(e=>e.id);
      this.rallyFlash={game:g,ids,until:performance.now()+3000};
    }
    rallyPlans(g){
      const plans=[];
      let ids=g.selected;
      if(this.rallyFlash){
        if(this.rallyFlash.game===g&&performance.now()<this.rallyFlash.until)ids=new Set([...ids,...this.rallyFlash.ids]);
        else this.rallyFlash=null;
      }
      for(const id of ids){
        const e=g.byId.get(id);
        if(!e?.rally||e.faction!==g.faction||e.hp<=0||e.progress<1)continue;
        const target=g.byId.get(e.rally.targetId);
        // Soldiers attack-move to the saved point. Only a worker born at HQ tracks a live deposit.
        const deposit=e.type==='hq'&&target?.hp>0&&isResource(target)?target:null;
        let entry=this.rallyCache.get(e);
        if(!entry||entry.order!==e.rally||entry.revision!==g.nav.revision||entry.deposit!==deposit){
          const origin=g.reinforcementOrigin(e);
          let path=[];
          if(origin){
            const destination=deposit?g._approach(origin,deposit,4):e.rally;
            path=deposit&&g._gap(origin,deposit)<=9?[origin]:g.nav.route(origin,destination);
          }
          entry={order:e.rally,revision:g.nav.revision,deposit,origin,path};
          this.rallyCache.set(e,entry);
        }
        if(entry.path.length)plans.push(entry);
      }
      return plans;
    }
    rallyTrails(c,plans,tone,time){
      if(!plans.length)return;
      const s=this.scale;
      c.save();c.lineCap='round';c.lineJoin='round';
      c.setLineDash([4/s,5/s]);c.lineDashOffset=(time*8%9)/s;
      const trace=({origin,path})=>{
        // Start at the flag so that factories meeting on a bridge share the same dash rhythm.
        const end=path.at(-1);
        c.moveTo(end.x,end.y);
        for(let i=path.length-2;i>=0;i--)c.lineTo(path[i].x,path[i].y);
        c.lineTo(origin.x,origin.y);
      };
      c.beginPath();for(const plan of plans)trace(plan);
      c.strokeStyle='#252530b5';c.lineWidth=3/s;c.stroke();
      const colors=new Map();
      for(const plan of plans){
        const color=plan.deposit?.type==='ore'?'#f3c38b':tone;
        if(!colors.has(color))colors.set(color,[]);
        colors.get(color).push(plan);
      }
      c.lineWidth=1.3/s;
      for(const [color,group] of colors){
        c.beginPath();for(const plan of group)trace(plan);
        c.strokeStyle=color;c.stroke();
      }
      c.restore();
    }
    rallyFlags(c,plans,tone,scaleX,scaleY,flagScale){
      if(!plans.length)return;
      const painted=new Set();
      for(const {path,deposit} of plans){
        const p=path.at(-1),x=Math.round(p.x*scaleX),y=Math.round(p.y*scaleY),key=x+','+y;
        if(painted.has(key))continue;
        painted.add(key);Art.rallyFlag(c,x,y,tone,deposit?.type,flagScale);
      }
    }
    depotVeins(c,veins){
      const s=this.scale;
      c.save();
      for(const node of [veins.crystal,veins.ore]){
        if(!node)continue;
        c.beginPath();
        for(const side of [-1,1]){
          c.moveTo(node.x+side*18,node.y-4);c.lineTo(node.x+side*25,node.y+1);c.lineTo(node.x+side*18,node.y+6);
        }
        c.strokeStyle='#342e41';c.lineWidth=3.4/s;c.stroke();
        c.strokeStyle=node.type==='ore'?'#f3c677':'#d7b0fb';c.lineWidth=1.6/s;c.stroke();
      }
      c.restore();
    }
    depotTraffic(c,g,depot){
      if(depot?.type!=='depot'||depot.faction!==g.faction||depot.progress<1||this.mode||this.drag)return;
      const s=this.scale;
      this.depotVeins(c,{crystal:g.depotNode(depot,'crystal'),ore:g.depotNode(depot,'ore')});
      c.save();
      for(const w of g.entities){
        if(w.type!=='worker'||w.action!=='return'||w.targetId!==depot.id||w.carried<=0||w.pathIndex>=w.path.length)continue;
        const ore=w.resourceType==='ore';
        c.beginPath();c.moveTo(w.x,w.y+1);
        for(let i=w.pathIndex;i<w.path.length;i++)c.lineTo(w.path[i].x,w.path[i].y+1);
        c.setLineDash([]);c.strokeStyle='#29273195';c.lineWidth=2.6/s;c.stroke();
        c.setLineDash([3/s,5/s]);c.lineDashOffset=-(g.time*9/s);
        c.strokeStyle=ore?'#f7ca84':'#ddc2f2';c.lineWidth=1.3/s;c.stroke();
      }
      c.restore();
    }
    escortPairs(g,selected){
      const pairs=new Map();
      for(const guard of g.entities){
        if(guard.escortId==null||guard.faction!==g.faction||guard.hp<=0)continue;
        if(!selected.has(guard.id)&&!selected.has(guard.escortId))continue;
        const anchor=g.byId.get(guard.escortId);
        if(!anchor||anchor.hp<=0)continue;
        const distance=Math.hypot(guard.x-anchor.x,guard.y-anchor.y);
        const old=pairs.get(anchor);
        if(!old||distance<old.distance)pairs.set(anchor,{guard,distance});
      }
      return pairs;
    }
    escortLinks(c,pairs,g){
      if(!pairs.size)return;
      const s=this.scale;
      c.save();c.beginPath();c.lineCap='round';
      for(const [anchor,{guard,distance}] of pairs){
        // This link identifies a nearby partner. Across water the badge alone identifies them.
        if(distance<12||distance>96||distance*s>140)continue;
        if(g.nav.clearLine(guard,anchor)){c.moveTo(guard.x,guard.y+1);c.lineTo(anchor.x,anchor.y+1)}
      }
      c.setLineDash([1/s,4/s]);c.strokeStyle='#273a40ce';c.lineWidth=2.7/s;c.stroke();
      c.strokeStyle='#c3e6cd';c.lineWidth=1.15/s;c.stroke();c.restore();
    }
    guardSites(g,hovered,escortReason){
      const sites=new Map();
      if(g.result||this.drag)return sites;
      const add=(site,preview=false)=>{
        if(!site||site.faction!==g.faction||site.hp<=0||site.progress<1||!structures.includes(site.type)||sites.has(site))return;
        const guards=g.postedGuards(site);
        if(preview||guards.length)sites.set(site,{guards,preview,engaged:guards.some(unit=>unit.guardThreatId!=null)});
      };
      if(this.mode){
        if(this.mode.command==='escort'&&!escortReason)add(hovered,true);
      }else{
        const inspect=e=>add(e?.action==='guard'?g.byId.get(e.targetId):e);
        inspect(hovered);
        for(const id of g.selected)inspect(g.byId.get(id));
      }
      return sites;
    }
    guardGround(c,g,sites,tone){
      if(!sites.size)return;
      const s=this.scale;
      c.save();c.lineCap='round';
      for(const [site,{guards,preview,engaged}] of sites){
        const radius=g.guardRadius(site),color=engaged?'#f6c189':tone;
        c.beginPath();
        // Leave openings at cliff edges. The marks on land show the actual detection radius.
        const steps=40,turn=2*Math.PI;
        for(let i=0;i<steps;i++){
          const a=turn*i/steps,half=turn*.22/steps;
          const x=site.x+Math.cos(a)*radius,y=site.y+Math.sin(a)*radius;
          if(!g.terrain.ground(x,y))continue;
          c.moveTo(site.x+Math.cos(a-half)*radius,site.y+Math.sin(a-half)*radius);
          c.arc(site.x,site.y,radius,a-half,a+half);
          if(i%5===0){c.moveTo(x,y);c.lineTo(x-4*Math.cos(a)/s,y-4*Math.sin(a)/s)}
        }
        c.globalAlpha=preview ? .86 : .69;c.strokeStyle='#2a313e';c.lineWidth=3/s;c.stroke();
        c.strokeStyle=color;c.lineWidth=1.2/s;c.stroke();
        c.globalAlpha=.90;c.beginPath();
        for(const guard of guards){
          const station=guard.guardPoint;
          if(!station||Math.hypot(guard.x-station.x,guard.y-station.y)<11)continue;
          c.moveTo(station.x-4/s,station.y);c.lineTo(station.x,station.y+2/s);c.lineTo(station.x+4/s,station.y);
        }
        c.strokeStyle='#2b3440';c.lineWidth=3/s;c.stroke();c.strokeStyle=tone;c.lineWidth=1.2/s;c.stroke();
      }
      c.restore();
    }
    artilleryPreview(g,target){
      if(!target||target.hp<=0||target.faction!==g.enemyFaction||g.faction!=='cinder'||g.result||this.drag)return null;
      if(this.mode&&this.mode.command!=='attackmove')return null;
      let hasCart=false;
      for(const id of g.selected){
        const cart=g.byId.get(id);
        if(cart?.type!=='specialist'||cart.faction!=='cinder'||cart.hp<=0)continue;
        hasCart=true;
        if(g._gap(cart,target)<=g.unitStats(cart.type,cart.faction).range)return g.splashPlan(cart,target);
      }
      return hasCart?{outOfRange:true}:null;
    }
    drawBlastPreview(c,target,plan){
      if(!plan||plan.outOfRange)return;
      const s=this.scale;
      c.save();c.fillStyle='#eeae6120';
      c.beginPath();c.arc(target.x,target.y,plan.radius,0,Math.PI*2);c.fill();
      c.setLineDash([4/s,4/s]);c.strokeStyle='#502f35';c.lineWidth=2.6/s;c.stroke();
      c.strokeStyle='#f4b574';c.lineWidth=1.15/s;c.stroke();c.setLineDash([]);
      for(const e of plan.targets){
        const radius=sizeOf(e)[0]+1;
        c.beginPath();
        for(const dx of [-1,1]){
          c.moveTo(e.x+dx*(radius-2),e.y+4);c.lineTo(e.x+dx*radius,e.y+1);c.lineTo(e.x+dx*(radius-2),e.y-2);
        }
        c.strokeStyle='#453138';c.lineWidth=3/s;c.stroke();c.strokeStyle='#ffe0a2';c.lineWidth=1.45/s;c.stroke();
      }
      c.restore();
    }
    ashGround(c,point,plan,blooms,time,side){
      if(!plan&&!blooms.length)return;
      const s=this.scale,turn=2*Math.PI;
      c.save();
      if(plan){
        // Show the union of available launch distances, even when the cursor is over water.
        c.setLineDash([5/s,5/s]);c.lineWidth=1/s;
        for(const cart of plan.ready){
          c.beginPath();c.arc(cart.x,cart.y,plan.range,0,turn);
          c.strokeStyle=cart===plan.source?'#ffdb8fbb':'#e6c78c80';c.stroke();
        }
        c.setLineDash([]);
        if(point){
          const color=plan.ok?'#ffdf99':'#eca7a0';
          c.beginPath();c.arc(point.x,point.y,plan.radius,0,turn);
          c.fillStyle=plan.ok?'#fbb75025':'#c45b5123';c.fill();
          c.setLineDash(plan.ok?[8/s,3/s]:[2/s,5/s]);
          c.strokeStyle='#45303c';c.lineWidth=3/s;c.stroke();
          c.strokeStyle=color;c.lineWidth=1.3/s;c.stroke();c.setLineDash([]);
          if(plan.source){
            c.beginPath();c.moveTo(plan.source.x,plan.source.y-6);c.lineTo(point.x,point.y);
            c.setLineDash([2/s,6/s]);c.strokeStyle='#ffe4aabb';c.lineWidth=1.2/s;c.stroke();c.setLineDash([]);
          }
          for(const unit of plan.targets){
            if(plan.ok)this.ring(c,unit,'#ffe8a6');
          }
        }
      }
      for(const seed of blooms){
        const danger=seed.faction!==side,remaining=clamp((seed.end-time)/(seed.end-seed.start),0,1);
        c.beginPath();c.arc(seed.x,seed.y,seed.radius,0,turn);
        c.fillStyle=danger?'#e160612e':'#edaa5624';c.fill();
        c.lineWidth=3/s;c.strokeStyle='#4b303b';c.stroke();
        c.setLineDash(danger?[6/s,3/s]:[]);c.strokeStyle=danger?'#ff9d92':'#fbd695';c.lineWidth=1.3/s;c.stroke();c.setLineDash([]);
        // Triangles point inward on hostile blooms. Allied blooms use four short outward ticks.
        c.beginPath();
        for(let i=0;i<4;i++){
          const dx=Math.cos(i*turn/4),dy=Math.sin(i*turn/4),x=seed.x+dx*seed.radius,y=seed.y+dy*seed.radius;
          if(danger){
            c.moveTo(x-dy*4/s,y+dx*4/s);c.lineTo(x-dx*6/s,y-dy*6/s);c.lineTo(x+dy*4/s,y-dx*4/s);c.closePath();
          }else{c.moveTo(x,y);c.lineTo(x+dx*4/s,y+dy*4/s)}
        }
        if(danger){c.fillStyle='#ffb2a0';c.fill()}else c.stroke();
        c.beginPath();c.arc(seed.x,seed.y,Math.max(2,seed.radius*remaining),0,turn);
        c.lineWidth=1/s;c.strokeStyle=danger?'#ffc8aabd':'#ffe5a4a2';c.stroke();
      }
      c.restore();
    }
    ashLabel(c,worldX,worldY,radius,text,enemy,occupied){
      const x=worldX*this.scale+this.ox,y=worldY*this.scale+this.oy,r=radius*this.scale;
      if(x+r<0||x-r>this.w||y+r<0||y-r>this.h)return;
      c.save();c.setTransform(this.dpr,0,0,this.dpr,0,0);
      c.font='bold 10px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      const w=Math.ceil(c.measureText(text).width)+10,left=clamp(Math.round(x-w/2),2,this.w-w-2);
      const blockers=occupied.filter(box=>box.left<left+w+2&&box.right>left-2);
      const options=[y+r+3,y-r-18,...blockers.flatMap(box=>[box.top-17,box.bottom+2])];
      const top=options.map(pos=>clamp(Math.round(pos),2,this.h-17)).find(pos=>!blockers.some(box=>box.top<pos+17&&box.bottom>pos-2));
      if(top===undefined){c.restore();return}
      c.fillStyle=enemy?'#442c37':'#393039';c.fillRect(left,top,w,15);
      c.fillStyle=enemy?'#ffb0a0':'#ffda91';c.fillRect(left,top,2,15);
      c.textAlign='left';c.textBaseline='middle';c.fillText(text,left+5,top+7.5);c.restore();
      occupied.push({left,top,right:left+w,bottom:top+15});
    }
    volleySight(c,target,locked,opening=0,alpha=1){
      if(!target||target.hp<=0)return;
      const s=this.scale,w=sizeOf(target)[0]+(locked?3:6)/s,h=Math.max(6,w*.44);
      const edge=w+opening/s,aim=locked?'#ffe1a1':'#dac0ee';
      c.save();c.globalAlpha=alpha;c.translate(target.x,target.y+1);c.beginPath();
      for(const sign of [-1,1]){
        const x=sign*edge;
        c.moveTo(x+sign*4/s,-4/s);c.lineTo(x,0);c.lineTo(x+sign*4/s,4/s);
        if(locked){
          c.moveTo(x+sign*7/s,-3/s);c.lineTo(x+sign*4/s,0);c.lineTo(x+sign*7/s,3/s);
        }
      }
      c.moveTo(0,h-1/s);c.lineTo(3/s,h+2/s);c.lineTo(0,h+5/s);c.lineTo(-3/s,h+2/s);c.closePath();
      c.strokeStyle='#402e51';c.lineWidth=3.5/s;c.stroke();
      c.strokeStyle=aim;c.lineWidth=1.35/s;c.stroke();
      if(locked){c.fillStyle='#fff0c8';c.fillRect(-1/s,h+1/s,2/s,2/s)}
      c.restore();
    }
    healingPlans(g){
      if(g.faction!=='myren'||g.result||this.drag||this.mode)return [];
      const plans=[];
      for(const id of g.selected){
        const healer=g.byId.get(id);
        if(healer?.type!=='specialist'||healer.faction!==g.faction||healer.hp<=0)continue;
        const plan=g.healPlan(healer);
        const remaining=Math.max(0,2.6-(g.time-(healer.lastHealTime??-Infinity)));
        const previous=remaining>0?g.byId.get(healer.lastHealTargetId):null;
        plans.push({...plan,healer,remaining,previous});
      }
      return plans;
    }
    dewGround(c,plan,hovered){
      if(!plan)return;
      const s=this.scale;
      c.save();c.lineWidth=1/s;c.setLineDash([6/s,3/s,1/s,3/s]);
      for(const healer of plan.ready){
        c.strokeStyle=healer===plan.source?'#aae8decc':'#9acbc199';
        c.beginPath();c.arc(healer.x,healer.y,plan.range,0,2*Math.PI);c.stroke();
      }
      const ally=hovered||plan.suggested;
      if(ally){
        const valid=plan.ok&&Boolean(plan.source);
        const color=valid?'#b4fae6':'#eda99e';
        if(valid&&plan.source!==ally){
          c.strokeStyle='#72cbb4';c.setLineDash([2/s,4/s]);
          c.beginPath();c.moveTo(plan.source.x,plan.source.y);c.lineTo(ally.x,ally.y);c.stroke();
        }
        c.setLineDash([]);this.ring(c,ally,color);
      }
      c.restore();
    }
    healingGround(c,plan,single){
      const {healer,target,radius}=plan,s=this.scale;
      c.save();
      if(single){
        c.beginPath();c.arc(healer.x,healer.y,radius,0,Math.PI*2);
        c.setLineDash([2/s,5/s]);c.strokeStyle='#344942b8';c.lineWidth=2.6/s;c.stroke();
        c.strokeStyle='#dbecb9c9';c.lineWidth=1/s;c.stroke();
      }
      if(target){
        c.setLineDash([2/s,4/s]);c.beginPath();c.moveTo(healer.x,healer.y+2);c.lineTo(target.x,target.y+2);
        c.strokeStyle='#344339ba';c.lineWidth=2.8/s;c.stroke();c.strokeStyle='#f4d6c1';c.lineWidth=1.2/s;c.stroke();
      }
      c.restore();
    }
    hoverText(c,label,entity,halfWidth,height){
      const s=this.scale,x=entity.x*s+this.ox,y=entity.y*s+this.oy;
      if(x+halfWidth*s<0||x-halfWidth*s>this.w||y+7*s<0||y-height*s>this.h)return;
      c.save();c.setTransform(this.dpr,0,0,this.dpr,0,0);c.font='bold 11px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      const w=Math.min(this.w-6,Math.ceil(c.measureText(label).width)+12),h=18;
      const left=clamp(Math.round(x-w/2),3,this.w-w-3);
      const above=y-height*s-h-4,below=y+7*s+4;
      const choices=above>=3?[above,below]:[below,above];
      const controls=this.hudBounds.filter(r=>r.right>left-3&&r.left<left+w+3);
      for(const r of controls)choices.push(r.bottom+3,r.top-h-3);
      for(const choice of choices){
        const top=clamp(Math.round(choice),3,this.h-h-3);
        if(controls.some(r=>r.bottom>top-3&&r.top<top+h+3))continue;
        c.fillStyle='#20232cf2';c.fillRect(left,top,w,h);
        c.fillStyle='#eee6ef';c.textBaseline='middle';c.textAlign='center';
        c.fillText(label,left+w/2,top+h/2,w-6);break;
      }
      c.restore();
    }
    pointerHint(c,text,x,y,tone){
      c.save();c.setTransform(this.dpr,0,0,this.dpr,0,0);
      c.font='bold 11px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      const width=Math.min(this.w-6,Math.ceil(c.measureText(text).width)+14);
      const left=clamp(Math.round(x*this.scale+this.ox-width/2),3,this.w-width-3);
      const top=clamp(Math.round(y*this.scale+this.oy+14),3,this.h-24);
      c.fillStyle='#20232cf2';c.fillRect(left,top,width,20);
      c.fillStyle=tone;c.fillRect(left,top,2,20);
      c.fillStyle='#f3edf4';c.textBaseline='middle';c.fillText(text,left+7,top+10,width-11);c.restore();
    }
    orderTrail(c,g){
      const recent=this.marker&&performance.now()-this.marker.stamp<=1700;
      const units=g.selected.map(id=>g.byId.get(id)).filter(e=>e&&e.faction===g.faction&&isUnit(e));
      const unit=units.find(e=>e.action==='retreat')||units.find(e=>e.waypoints?.length)||(recent&&units.find(e=>e.moving));
      if(!unit)return;
      c.save();
      if(unit.pathIndex<unit.path.length){
        c.globalAlpha=.65;c.strokeStyle=unit.action==='retreat'?'#9edce0':recent?this.marker.color:'#e7d694';c.lineWidth=1.4;c.setLineDash([3,5]);
        c.beginPath();c.moveTo(unit.x,unit.y);
        for(let i=unit.pathIndex;i<unit.path.length;i++)c.lineTo(unit.path[i].x,unit.path[i].y);
        c.stroke();c.setLineDash([]);c.globalAlpha=1;
      }
      if(unit.action==='retreat'&&unit.destination){
        Art.fallbackMark(c,unit.destination.x,unit.destination.y,clamp(1/this.scale,.65,2.6));
      }
      if(unit.waypoints?.length){
        const first=unit.followDestination||(['move','attackmove','retreat'].includes(unit.action)?unit.destination:g.byId.get(unit.targetId));
        const destinations=[first,...unit.waypoints.map(p=>g.byId.get(p.targetId)||p)];
        c.font='bold 9px monospace';c.textAlign='center';
        destinations.forEach((p,i)=>{
          if(!p)return;
          const x=Math.round(p.x),y=Math.round(p.y);
          c.fillStyle='#f0d6a0';c.fillRect(x,y-15,1,15);c.fillRect(x+1,y-16,14,11);
          c.fillStyle='#3b3241';c.fillText(String(i+1),x+8,y-7);
        });
      }
      c.restore();
    }
    render(g,factions){
      const c=this.ctx,s=this.scale,d=this.dpr;
      c.setTransform(s*d,0,0,s*d,this.ox*d,this.oy*d);c.imageSmoothingEnabled=false;Terrain.draw(c);if(Art.ambience)Art.ambience(c,g.time);
      const b=g.beacon,tone=factions[b.claimant||b.owner]?.tone||null;
      const overBeacon=this.pointer&&!this.drag&&Math.hypot(this.pointer.x-b.x,this.pointer.y-(b.y-12))<25;
      const focusingBeacon=this.beaconUntil>performance.now();
      const lastRing=g.bell?.lastRing;
      const ringAge=lastRing?.count>0&&lastRing.faction?g.time-lastRing.time:-1;
      if(g.bell)Art.bellResonance(c,b,g.bell,g.time,(overBeacon&&!this.mode)||focusingBeacon,s,ringAge,factions[lastRing?.faction]?.tone);
      Terrain.drawBeacon(c,g.time,tone,b.progress,b.contested,ringAge);
      g.salvage?.draw(c);
      g.tactics.draw(c);
      const rallies=this.rallyPlans(g),teamTone=factions[g.faction].tone;
      this.rallyTrails(c,rallies,teamTone,g.time);
      const selected=new Set(g.selected),escorts=this.escortPairs(g,selected);
      this.escortLinks(c,escorts,g);
      const single=g.selected.length===1?g.byId.get(g.selected[0]):null;
      this.depotTraffic(c,g,single);
      const artillery=single?.type==='specialist'&&single.faction==='cinder'&&single.faction===g.faction;
      if(this.mode?.command!=='ash'&&single?.faction===g.faction&&(single.action==='hold'||(artillery&&!this.mode&&!this.drag&&!g.result))){
        c.save();c.strokeStyle=artillery?'#e7bd8f8c':'#caead4a3';c.lineWidth=1/s;c.setLineDash([3,5]);
        c.beginPath();c.arc(single.x,single.y,g.unitStats(single.type,single.faction).range,0,Math.PI*2);c.stroke();c.restore();
      }
      const ordered=[...g.entities].sort((a,b)=>a.y-b.y);
      const repairers=this.repairBadges(g);
      const hovered=this.pointer&&!this.drag&&this.mode?.command!=='ash'?this.pick(g,this.pointer.x,this.pointer.y,repairers):null;
      const escortReason=this.mode?.command==='escort'&&hovered?g.escortReason(hovered):null;
      const posts=this.guardSites(g,hovered,escortReason);
      this.guardGround(c,g,posts,teamTone);
      const blast=this.artilleryPreview(g,hovered);
      const ashPoint=this.mode?.ashPoint||this.pointer;
      const ashPlan=this.mode?.command==='ash'&&!g.result&&!this.drag?g.ashPlan(ashPoint?.x,ashPoint?.y):null;
      const blooms=g.ashBlooms||[];
      this.ashGround(c,ashPoint,ashPlan,blooms,g.time,g.faction);
      const dewAim=this.mode?.command==='dew'&&!g.result&&!this.drag?(this.mode.dewPlan||g.dewPlan()):null;
      const dewPlan=dewAim&&hovered?g.dewPlan(hovered):dewAim;
      this.dewGround(c,dewPlan,hovered);
      const volley=g.faction==='velari'&&!g.result&&!this.mode&&!this.drag?g.volleyPlan():null;
      const plans=this.healingPlans(g);
      const focusedPlan=plans.find(p=>p.healer===hovered)||(plans.length===1?plans[0]:null);
      if(focusedPlan)this.healingGround(c,focusedPlan,focusedPlan.healer===single);
      const patients=new Map();
      for(const plan of plans){
        if(plan.target&&(!patients.has(plan.target)||patients.get(plan.target).remaining>plan.remaining))patients.set(plan.target,plan);
      }
      this.drawBlastPreview(c,hovered,blast);
      const volleyLock=volley?.target&&g.effects.some(fx=>fx.type==='volleyRelease'&&fx.targetId===volley.target.id);
      if(!volleyLock)this.volleySight(c,volley?.target,Boolean(volley?.pending));
      for(const e of ordered)this.drawEntity(c,e,g.time,selected.has(e.id),hovered===e,g);
      const badgeScale=clamp(.95/s,.65,2.6);
      if(volley?.waiting){
        for(const id of selected){
          const unit=g.byId.get(id);
          const remaining=(unit?.volleyWatch?.end??0)-g.time;
          if(unit?.hp>0&&unit.faction===g.faction&&remaining>0)Art.volleyWatch(c,unit.x,unit.y+9*badgeScale,badgeScale,remaining);
        }
      }
      if(dewAim?.suggested){
        const ally=dewAim.suggested;
        Art.dewBud(c,ally.x,ally.y-sizeOf(ally)[1]-8*badgeScale,badgeScale);
      }
      for(const patient of patients.keys()){
        Art.patientBud(c,patient.x,patient.y,sizeOf(patient)[0],badgeScale);
      }
      if(focusedPlan){
        const healer=focusedPlan.healer;
        Art.healCharge(c,healer.x+10,healer.y-sizeOf(healer)[1]-1,badgeScale,1-focusedPlan.remaining/2.6);
      }
      for(const e of ordered){
        if(e.markedUntil<=g.time||e.markedBy!=='velari')continue;
        const badgeScale=clamp(.93/s,.72,2.6);
        const barEdge=isUnit(e)?8:e.type==='hq'?24:16;
        const shield=e.faction===g.faction&&e.action==='hold'?9:0;
        Art.marked(c,e,g.time,e.x-barEdge-shield-14*badgeScale,e.y-sizeOf(e)[1],badgeScale);
      }
      this.orderTrail(c,g);
      this.rallyFlags(c,rallies,teamTone,1,1,clamp(.95/s,.65,2.6));
      for(const anchor of escorts.keys()){
        Art.escortBadge(c,anchor.x,anchor.y-sizeOf(anchor)[1]-5,clamp(.98/s,.72,2.6));
      }
      for(const [site,post] of posts){
        const [width]=sizeOf(site);
        Art.guardPennant(c,site.x-width*.44,site.y+5,site.faction,clamp(1/s,.68,2),post.engaged);
        for(const guard of post.guards){
          const x=Math.round(guard.x),y=Math.round(guard.y+5);
          c.fillStyle='#2a313e';c.fillRect(x-3/s,y,7/s,4/s);c.fillRect(x-1/s,y+4/s,3/s,1/s);
          c.fillStyle=guard.guardThreatId!=null?'#ffd19d':teamTone;
          c.fillRect(x-2/s,y+1/s,5/s,1/s);c.fillRect(x-1/s,y+2/s,3/s,1/s);
        }
      }
      for(const e of g.entities)if(e.type==='hq')this.tag(c,e,g,factions);
      for(const badge of repairers)Art.repairBadge(c,badge.x,badge.y,badge.scale);
      for(const seed of blooms)Art.fallingAsh(c,seed,g.time,badgeScale);
      const inspected=hovered||single;
      const marked=inspected?.markedBy==='velari'&&inspected.markedUntil>g.time;
      const repairInfo=hovered&&repairers.some(badge=>badge.worker===hovered)?' · 사령부 수리 중':'';
      const ward=inspected?.dewWard;
      if(ward&&ward.end>g.time&&!this.mode&&!this.drag){
        const text='이슬매듭 · 보호막 '+Math.ceil(ward.shield)+'/'+ward.capacity+' · '+Math.ceil(ward.end-g.time)+'초';
        this.hoverText(c,text,inspected,...sizeOf(inspected));
      }else if(blast){
        const label=blast.outOfRange?'일반 포탄 사거리 밖':'일반 포탄 · '+(blast.targets.length?'주변 '+blast.targets.length+'기':'단일 대상');
        this.hoverText(c,g.name(hovered.type,hovered.faction)+repairInfo+' · '+label,hovered,...sizeOf(hovered));
      }else if(hovered&&(patients.has(hovered)||focusedPlan?.healer===hovered||focusedPlan?.previous===hovered)){
        const plan=patients.get(hovered)||focusedPlan;
        const last=hovered===plan.previous&&hovered!==plan.target;
        const patient=last?plan.previous:plan.target||plan.previous;
        const state=plan.remaining>0?'다음 치유 '+(Math.max(1,Math.ceil(plan.remaining*10-1e-8))/10).toFixed(1)+'초':'치유 준비';
        let label=state+' · 범위 '+plan.radius;
        if(patient){
          const priority=plan.healer.action==='escort'&&plan.healer.escortId===patient.id?'전담 치유':'우선 치유';
          const subject=last||!plan.target?'직전 치유':priority;
          label=subject+' · '+g.name(patient.type,patient.faction)+' '+Math.ceil(patient.hp)+'/'+patient.maxHp+' · '+state;
        }
        this.hoverText(c,label,hovered,...sizeOf(hovered));
      }else if(marked&&!this.mode&&!this.drag){
        const px=inspected.x*s+this.ox,py=inspected.y*s+this.oy;
        if(px>=0&&px<=this.w&&py>=0&&py<=this.h){
          const seconds=Math.ceil(inspected.markedUntil-g.time);
          const volleyInfo=volley?.target===inspected?(volley.pending?' · '+volley.pending+'기 조준':' · '+volley.units.length+'기 일제사격 가능'):'';
          this.hoverText(c,g.name(inspected.type,inspected.faction)+repairInfo+' · 표식 '+seconds+'초'+volleyInfo,inspected,...sizeOf(inspected));
        }
      }else if(hovered&&posts.has(hovered)&&!this.mode){
        const post=posts.get(hovered);
        this.hoverText(c,g.name(hovered.type,hovered.faction)+' · 거점 경비 '+post.guards.length+'기'+(post.engaged?' · 교전 중':''),hovered,...sizeOf(hovered));
      }else if(hovered&&!this.mode&&hovered.type!=='hq'&&!this.drag){
        const h=hovered;
        let label=g.name(h.type,h.faction);
        if(h.faction===g.faction&&h.volleyWatch?.end>g.time)label+=' · 일제사격 대기 '+Math.ceil(h.volleyWatch.end-g.time)+'초';
        if(isResource(h))label+=' · '+Math.ceil(h.hp);
        label+=repairInfo;
        if(h.type==='depot')label+=h.progress<1?' · 건설 중':' · 빛결정·불씨광 납품';
        const site=h.action==='guard'?g.byId.get(h.targetId):null;
        if(posts.has(site))label+=' · '+g.name(site.type,site.faction)+(h.guardThreatId!=null?' 요격 중':' 경비 중');
        this.hoverText(c,label,h,...sizeOf(h));
      }
      if((overBeacon&&!hovered&&!this.mode)||b.progress>0||b.contested||focusingBeacon){
        const state=b.contested?'경합 중':b.claimant?(b.claimant===g.faction?'아군 ':'적군 ')+Math.floor(b.progress*100)+'%':b.owner===g.faction?'아군 점령':b.owner?'적군 점령':'중립';
        this.hoverText(c,g.beaconName+' · '+state,b,28,47);
      }
      const ashImpacts=[];
      for(const fx of g.effects){
        if(fx.type==='heal'||fx.type==='dewCast'||fx.type==='dewBreak'||fx.type==='dewMend'){
          const patient=g.byId.get(fx.targetId);
          const showAmount=patient?.hp>0&&(patient.faction===g.faction||hovered===patient||selected.has(patient.id));
          Art.combatEffect(c,fx,patient,showAmount?clamp(1/s,.72,2.6):0);
        }else if(fx.type==='volleyRelease'){
          const remaining=clamp(1-fx.age/fx.life,0,1);
          const stillAimed=volley?.target?.id===fx.targetId;
          this.volleySight(c,g.byId.get(fx.targetId),remaining>.18||Boolean(stillAimed&&volley.pending),
            remaining*remaining*12,stillAimed?1:Math.min(1,remaining*2));
        }else if(fx.type==='markFollowup'){
          const target=g.byId.get(fx.targetId);
          if(fx.commanded||target===inspected||(single?.type==='specialist'&&single.id===target?.markSource)){
            const labelScale=clamp(1/s,.72,2),[halfWidth,height]=target?sizeOf(target):[9,0];
            const x=target?.x??fx.tx,y=target?target.y-height*.62:fx.ty,pad=halfWidth+3*labelScale;
            const right=(x+pad+60*labelScale)*s+this.ox<this.w;
            Art.markBonusLabel(c,fx,x+(right?pad:-pad),y,right?'left':'right',labelScale);
          }
        }else if(fx.type==='splash'||fx.type==='ashImpact'){
          Art.combatEffect(c,fx,null,clamp(1/s,.72,2),g.byId);
          if(fx.type==='ashImpact')ashImpacts.push(fx);
        }else Art.combatEffect(c,fx);
      }
      const cacheUnderPointer=!hovered&&!this.mode&&this.pointer&&g.salvage?.hit(this.pointer.x,this.pointer.y);
      if(cacheUnderPointer){
        const cache=g.salvage.getStatus();
        if(cache)this.pointerHint(c,cache.label+' · '+cache.state,this.pointer.x,this.pointer.y,'#efc578');
      }
      if(this.mode?.command==='repair'&&hovered&&this.pointer){
        const why=g.repairReason(hovered);
        this.ring(c,hovered,why?'#f09383':'#aadcb2');
        const label=why||g.name(hovered.type)+' · 수리할 체력 '+Math.ceil(hovered.maxHp-hovered.hp);
        this.pointerHint(c,label,this.pointer.x,this.pointer.y,why?'#ed9a84':'#aadcb2');
      }
      if(this.mode?.command==='escort'&&hovered&&this.pointer){
        const why=escortReason;
        const tone=why?'#ed9a84':'#aadcca';
        this.ring(c,hovered,tone);
        const label=why||g.name(hovered.type)+(posts.has(hovered)?' · 눌러 경비 배치':' · 호위 대상');
        this.pointerHint(c,label,this.pointer.x,this.pointer.y,tone);
      }
      if(this.mode?.command==='ability'&&this.pointer)g.tactics.preview(c,g.faction,this.pointer.x,this.pointer.y);
      if(dewPlan){
        const recipient=hovered||dewPlan.suggested;
        if(recipient){
          const label=dewPlan.ok&&dewPlan.source
            ?(hovered?'이슬매듭 · ':'추천 · ')+g.name(recipient.type,recipient.faction)+' · 보호막 '+dewPlan.capacity
            :dewPlan.reason;
          const [width,height]=sizeOf(recipient);
          this.hoverText(c,label,recipient,width,height+(recipient===dewAim.suggested?13*badgeScale:0));
        }
      }
      if(ashPlan&&ashPoint){
        const p=ashPoint,valid=ashPlan.ok,ink=valid?'#ffdf99':'#f1a49a';
        c.save();c.translate(Math.round(p.x),Math.round(p.y));c.scale(1/s,1/s);
        c.strokeStyle=ink;c.lineWidth=1.6;c.beginPath();
        if(valid){
          c.moveTo(0,-5);c.lineTo(5,0);c.lineTo(0,5);c.lineTo(-5,0);c.closePath();
        }else{c.moveTo(-4,-4);c.lineTo(4,4);c.moveTo(-4,4);c.lineTo(4,-4)}
        c.stroke();c.restore();
        const label=valid?'잿꽃탄 · '+(ashPlan.targets.length?'예상 명중 '+ashPlan.targets.length+'기':'빈 지점'):ashPlan.reason;
        this.hoverText(c,label,p,ashPlan.radius,ashPlan.radius);
      }
      if(this.marker){const k=(performance.now()-this.marker.stamp)/900;if(k>=2){this.marker=null}else if(k<1){c.save();const m=this.marker;c.globalAlpha=1-k;c.strokeStyle=m.color;c.lineWidth=2;c.beginPath();c.ellipse(m.x,m.y,7+17*k,3+8*k,0,0,Math.PI*2);c.stroke();c.restore()}}
      if(this.mode?.build&&this.pointer){
        const p=this.pointer,type=this.mode.build,reason=g.buildReason(type,p.x,p.y),[rx,ry]=g.footprint(type);
        let line=reason?'#ff928b':'#b0e8af',fill=reason?'#ef756d4f':'#95d3a73d';
        let hint=reason||g.name(type)+' · 건설 가능';
        if(type==='depot'&&!reason){
          const veins=g.depotPreview(p.x,p.y);
          this.depotVeins(c,veins);
          const nearby=[veins.crystal?'빛결정':'',veins.ore?'불씨광':''].filter(Boolean);
          hint=g.name(type)+' · '+(nearby.length?nearby.join('·')+' 연결':'인근 광맥 없음');
          if(!nearby.length){line='#e5c48b';fill='#c8a46538'}
        }
        c.save();c.fillStyle=fill;c.strokeStyle=line;c.lineWidth=2;
        c.beginPath();c.ellipse(p.x,p.y,rx+4,ry+3,0,0,Math.PI*2);c.fill();c.stroke();
        Art.draw(c,type,g.faction,p.x,p.y,{ghost:true});c.restore();
        this.pointerHint(c,hint,p.x,p.y,line);
      }
      if(blooms.length||ashImpacts.length){
        const occupied=[...this.hudBounds];
        for(const seed of blooms){
          const enemy=seed.faction!==g.faction;
          const seconds=(Math.max(1,Math.ceil((seed.end-g.time)*10))/10).toFixed(1);
          this.ashLabel(c,seed.x,seed.y,seed.radius,(enemy?'위험 ':'낙하 ')+seconds+'초',enemy,occupied);
        }
        for(const fx of ashImpacts){
          const enemy=fx.faction!==g.faction,hits=fx.hits.length;
          const text=enemy?(hits?'아군 '+hits+'기 피격':'피격 없음'):(hits?hits+'기 명중':'명중 없음');
          this.ashLabel(c,fx.footX,fx.footY,fx.radius,text,enemy,occupied);
        }
      }
      if(this.drag?.box){const {x,y}=this.drag.start,p=this.drag.end;c.save();c.fillStyle='#c9bbff29';c.strokeStyle='#d4c5fd';c.lineWidth=1/s;c.fillRect(x,y,p.x-x,p.y-y);c.strokeRect(x,y,p.x-x,p.y-y);c.restore()}
      this.canvas.style.cursor=this.mode?'crosshair':hovered||cacheUnderPointer?'pointer':'crosshair';
    }
    drawMinimap(g,factions){
      const c=this.mc,w=this.mini.width,h=this.mini.height;c.imageSmoothingEnabled=false;Terrain.drawMap(c,w,h);
      for(const e of g.entities){
        const b=structures.includes(e.type),res=isResource(e),d=this.dpr;
        c.fillStyle=res?e.type==='ore'?'#e4b36e':'#bb97e0':factions[e.faction].tone;
        const r=(e.type==='hq'?4:b?2.5:res?1.6:1.2)*d;c.fillRect(Math.round(e.x/1280*w-r/2),Math.round(e.y/640*h-r/2),r,r);
      }
      const b=g.beacon,x=b.x/1280*w,y=b.y/640*h,r=3.1*this.dpr;
      c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.fillStyle=b.contested?'#f59f77':factions[b.claimant||b.owner]?.tone||'#f4d992';c.fill();
      c.lineWidth=this.dpr;c.strokeStyle='#352f37';c.stroke();
      g.salvage?.drawMinimap(c,w,h,this.dpr);
      this.rallyFlags(c,this.rallyPlans(g),factions[g.faction].tone,w/1280,h/640,this.dpr*.64);
      for(const seed of g.ashBlooms||[]){
        const sx=seed.x*w/1280,sy=seed.y*h/640,rx=Math.max(3*this.dpr,seed.radius*w/1280),ry=Math.max(3*this.dpr,seed.radius*h/640);
        c.beginPath();c.ellipse(sx,sy,rx,ry,0,0,Math.PI*2);
        c.lineWidth=2.5*this.dpr;c.strokeStyle='#48303a';c.stroke();
        c.lineWidth=this.dpr;c.strokeStyle=seed.faction===g.faction?'#ffda91':'#ffac9f';c.stroke();
      }
      const alertAge=g.time-this.threat?.time;
      if(alertAge>=0&&alertAge<6){
        const tick=alertAge%1;
        const approaches=this.threat.approaches?.length?this.threat.approaches:[this.threat];
        c.save();c.globalAlpha=1-tick*.75;c.strokeStyle='#ff9b7e';c.lineWidth=this.dpr;
        for(const p of approaches){
          if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>=1280||p.y<0||p.y>=640)continue;
          c.beginPath();c.arc(p.x/1280*w,p.y/640*h,(3+tick*7)*this.dpr,0,Math.PI*2);c.stroke();
        }
        c.restore();
      }
      c.lineWidth=this.dpr;c.strokeStyle='#ebeed5';
      c.strokeRect(Math.max(c.lineWidth/2,(this.x-this.w/this.scale/2)/1280*w),Math.max(c.lineWidth/2,(this.y-this.h/this.scale/2)/640*h),Math.min(w-c.lineWidth,this.w/this.scale/1280*w),Math.min(h-c.lineWidth,this.h/this.scale/640*h));
    }
  }
  window.Viewport=Viewport;
})();
