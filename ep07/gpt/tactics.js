/* The three field arts of Riftwake. Durations and cooldowns share the simulation clock. */
(() => {
  'use strict';
  const RADIUS = 64, DURATION = 8, COOLDOWN = 40, HEAL_RATE = 5;
  const TAU = Math.PI * 2;
  const abilities = {
    velari: {name:'잔광 장막', description:'8초 동안 범위 안의 아군 전투 유닛이 받는 피해가 45% 감소합니다.', tone:'#c9a9f2'},
    cinder: {name:'화맥 과열', description:'8초 동안 범위 안의 아군 전투 유닛의 공격 간격이 32% 짧아집니다.', tone:'#ffac79'},
    myren:  {name:'새봄 파동', description:'8초 동안 범위 안의 아군 전투 유닛이 초당 체력 5를 회복합니다.', tone:'#a6e8b0'}
  };
  for(const art of Object.values(abilities)){
    Object.assign(art,{radius:RADIUS,duration:DURATION,cooldown:COOLDOWN});
    Object.freeze(art);
  }
  const aiTiming = {
    easy:{scan:12,recast:80}, normal:{scan:6,recast:55}, hard:{scan:4,recast:46}
  };
  const troop = e => e && e.hp>0 && (e.type==='soldier'||e.type==='heavy'||e.type==='specialist');
  const inRange = (e,x,y,r) => (e.x-x)**2+(e.y-y)**2<=r*r;
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  // Each field has a distinct silhouette even when its team color is hard to distinguish.
  const sigils = {
    velari:['..t..','.twt.','tw.st','.tst.','..s..'],
    cinder:['...t.','..ts.','t.tw.','ttwwt','.sss.'],
    myren: ['s...t','st.tw','.stt.','..t..','..s..']
  };
  const shadows = {velari:'#665987',cinder:'#ad5b4b',myren:'#547760'};
  function sigil(ctx,faction,x,y){
    const motif=sigils[faction], colors={t:abilities[faction].tone,s:shadows[faction],w:'#fff7dc'};
    x=Math.round(x)-3;y=Math.round(y)-3;
    for(let j=0;j<motif.length;j++)for(let i=0;i<motif[j].length;i++){
      const c=colors[motif[j][i]];
      if(c){ctx.fillStyle=c;ctx.fillRect(x+i,y+j,1,1);}
    }
  }
  function ringMarks(ctx,x,y,radius,tone,preview){
    // Crisp separated marks indicate the true circular effect area on the playable plane.
    ctx.fillStyle=tone;
    const count=preview?48:32;
    for(let i=0;i<count;i++){
      const a=TAU*i/count, size=i%(count/4)===0?4:2;
      const px=Math.round(x+Math.cos(a)*radius),py=Math.round(y+Math.sin(a)*radius);
      ctx.fillRect(px-1,py-1,size,2);
    }
  }
  function fieldParticles(ctx,field,age,opacity){
    const faction=field.faction,tone=abilities[faction].tone;
    for(let i=0;i<12;i++){
      const phase=(age*(faction==='cinder' ? .76 : .52)+i*.618034)%1;
      const angle=i*2.399963+(faction==='myren' ? .27*phase : 0);
      const distance=faction==='myren'?13+phase*44:26+(i*19)%34;
      const travel=faction==='cinder'?phase*17:phase*8;
      const x=Math.round(field.x+Math.cos(angle)*distance);
      const y=Math.round(field.y+Math.sin(angle)*distance-travel);
      ctx.globalAlpha=opacity*Math.sin(phase*Math.PI)*.9;
      if(i%3===0){sigil(ctx,faction,x,y);continue;}
      ctx.fillStyle=tone;
      if(faction==='velari'){
        ctx.fillRect(x-2,y,5,1);ctx.fillRect(x,y-2,1,5);
      }else if(faction==='cinder'){
        ctx.fillRect(x,y,2,3);ctx.fillRect(x+1,y-2,1,2);
        ctx.fillStyle='#ffe5a6';ctx.fillRect(x,y+2,1,1);
      }else{
        ctx.fillRect(x-2,y,3,1);ctx.fillRect(x,y-2,2,2);
      }
    }
  }
  class FieldTactics {
    constructor(game){
      this.game=game;
      this.fields=[];
      this.readyAt=new Map();
      this.aiNext=game.time+(aiTiming[game.difficulty]||aiTiming.normal).scan;
    }
    ability(faction){return Object.hasOwn(abilities,faction)?abilities[faction]:null;}
    remaining(faction){return Math.max(0,(this.readyAt.get(faction)||0)-this.game.time);}
    recipients(faction,x,y){
      return this.game.entities.filter(e=>troop(e)&&e.faction===faction&&inRange(e,x,y,RADIUS));
    }
    suggestCenter(faction,selectedEntities){
      if(faction!==this.game.faction||!this.ability(faction))return null;
      const selected=new Set(selectedEntities);
      const allies=this.game.entities.filter(e=>troop(e)&&e.faction===faction);
      const candidates=allies.filter(e=>selected.has(e));
      let best=null,bestHealing=0,bestCoverage=0;
      for(const center of candidates){
        let healing=0,coverage=0;
        for(const ally of allies){
          if(!inRange(ally,center.x,center.y,RADIUS))continue;
          if(selected.has(ally))coverage++;
          if(faction==='myren')healing+=clamp(ally.maxHp-ally.hp,0,DURATION*HEAL_RATE);
        }
        if(healing>bestHealing||(healing===bestHealing&&coverage>bestCoverage)){
          best=center;bestHealing=healing;bestCoverage=coverage;
        }
      }
      return best?{x:best.x,y:best.y}:null;
    }
    _reason(faction,x,y){
      const g=this.game;
      if(g.result)return '종료된 교전입니다.';
      if(!this.ability(faction)||(faction!==g.faction&&faction!==g.enemyFaction))return '진영을 확인하세요.';
      const left=this.remaining(faction);
      if(left>0)return `다시 사용하려면 ${Math.ceil(left)}초가 필요합니다.`;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=1280||y>=640)return '전장 안의 지점을 지정하세요.';
      if(!g.entities.some(e=>troop(e)&&e.faction===faction&&inRange(e,x,y,RADIUS)))return '범위 안에 아군 전투 유닛이 필요합니다.';
      return '';
    }
    canCast(faction,x,y){return !this._reason(faction,x,y);}
    cast(faction,x,y){
      const g=this.game, reason=this._reason(faction,x,y);
      if(reason){if(faction===g.faction)g.feedback=reason;return false;}
      const start=g.time;
      this.fields.push({faction,x,y,radius:RADIUS,start,end:start+DURATION,healedUntil:start,healed:0});
      this.readyAt.set(faction,start+COOLDOWN);
      const name=this.ability(faction).name, own=faction===g.faction;
      if(own)g.feedback=name+' 발동 · 8초 동안 지속됩니다.';
      g._event?.((own?'아군':'적군')+' 전술 · '+name+' 발동','ability',{x,y,faction},own?'own':'enemy');
      return true;
    }
    _insideOwnField(e,faction){
      return troop(e)&&e.faction===faction&&this.fields.some(f=>f.faction===faction&&this.game.time>=f.start&&this.game.time<f.end&&inRange(e,f.x,f.y,f.radius));
    }
    damageScale(target){return this._insideOwnField(target,'velari') ? .55 : 1;}
    cooldownScale(attacker){return this._insideOwnField(attacker,'cinder') ? .68 : 1;}
    _tryEnemyCast(){
      const g=this.game,faction=g.enemyFaction;
      if(!this.ability(faction)||this.remaining(faction)>0)return false;
      const army=g.entities.filter(e=>troop(e)&&e.faction===faction);
      let best=null,bestScore=0;
      for(const e of army){
        const target=g.byId?.get(e.targetId);
        const exchanging=e.action==='attack'&&target?.hp>0&&target.faction===g.faction&&inRange(target,e.x,e.y,112);
        if(!exchanging && !(g.time-e.lastHurt<2.5))continue;
        let score=0;
        for(const ally of army){
          if(!inRange(ally,e.x,e.y,RADIUS))continue;
          score+=faction==='myren'?Math.min(DURATION*HEAL_RATE,ally.maxHp-ally.hp):1+(ally.type==='heavy' ? .3 : 0);
        }
        if(score>bestScore){best=e;bestScore=score;}
      }
      return !!best&&this.cast(faction,best.x,best.y);
    }
    update(dt){
      const g=this.game;
      if(g.result||!Number.isFinite(dt)||dt<=0)return;
      for(const field of this.fields){
        if(field.faction!=='myren')continue;
        const end=Math.min(g.time,field.end);
        const elapsed=end-Math.max(g.time-dt,field.start,field.healedUntil);
        if(elapsed<=0)continue;
        for(const e of g.entities){
          if(troop(e)&&e.faction===field.faction&&inRange(e,field.x,field.y,field.radius)){
            const amount=Math.min(e.maxHp-e.hp,HEAL_RATE*elapsed);
            if(amount>0){
              e.hp+=amount;field.healed+=amount;e.lastFieldHeal=g.time;
            }
          }
        }
        field.healedUntil=end;
      }
      if(this.fields.some(f=>g.time>=f.end))this.fields=this.fields.filter(f=>g.time<f.end);
      if(g.time>=this.aiNext){
        const timing=aiTiming[g.difficulty]||aiTiming.normal;
        this.aiNext=g.time+(this._tryEnemyCast()?timing.recast:timing.scan);
      }
    }
    draw(ctx){
      for(const field of this.fields){
        const age=this.game.time-field.start,left=field.end-this.game.time;
        if(age<0||left<=0)continue;
        const opacity=clamp((age+.12)*3,0,1)*clamp(left*2,0,1),tone=abilities[field.faction].tone;
        ctx.save();ctx.globalAlpha=opacity*.065;ctx.fillStyle=tone;
        ctx.beginPath();ctx.arc(field.x,field.y,field.radius,0,TAU);ctx.fill();
        ctx.globalAlpha=opacity*.66;ringMarks(ctx,field.x,field.y,field.radius,tone,false);
        // A brief outward pulse marks activation, then the lighter faction-specific particles take over.
        if(age<.7){ctx.globalAlpha=(1-age/.7)*.8;ringMarks(ctx,field.x,field.y,8+age/.7*(field.radius-8),tone,false);}
        fieldParticles(ctx,field,age,opacity);
        ctx.restore();
      }
    }
    markTroop(ctx,e,top){
      if(!this.fields.length||!this._insideOwnField(e,e.faction))return;
      const x=Math.round(e.x+10),y=Math.round(top);
      ctx.save();
      ctx.fillStyle='#1d2930';ctx.fillRect(x-2,y-2,8,8);
      sigil(ctx,e.faction,x+2,y+2);
      if(e.faction==='myren'&&this.game.time-e.lastFieldHeal<.3){
        const drift=(this.game.time+e.phase)%1;
        ctx.globalAlpha=1-drift;ctx.fillStyle='#c4ffbb';
        const cy=y-3-Math.floor(drift*10);
        ctx.fillRect(x-1,cy,5,1);ctx.fillRect(x+1,cy-2,1,5);
      }
      ctx.restore();
    }
    preview(ctx,faction,x,y){
      const a=this.ability(faction);
      if(!a||!Number.isFinite(x)||!Number.isFinite(y))return;
      const members=this.recipients(faction,x,y);
      const valid=this.canCast(faction,x,y),tone=valid?a.tone:'#f39b8b';
      ctx.save();ctx.globalAlpha=.10;ctx.fillStyle=tone;
      ctx.beginPath();ctx.arc(x,y,a.radius,0,TAU);ctx.fill();
      ctx.globalAlpha=.94;ringMarks(ctx,x,y,a.radius,tone,true);
      x=Math.round(x);y=Math.round(y);ctx.fillStyle=tone;
      if(valid){ctx.fillRect(x-8,y,4,2);ctx.fillRect(x+4,y,4,2);ctx.fillRect(x,y-8,2,4);ctx.fillRect(x,y+4,2,4);}
      else{for(let i=-3;i<=3;i++){ctx.fillRect(x+i,y+i,2,2);ctx.fillRect(x-i,y+i,2,2);}}
      for(const unit of members){
        ctx.strokeStyle=tone;ctx.lineWidth=1.5;ctx.beginPath();
        ctx.ellipse(unit.x,unit.y+1,11,5,0,0,TAU);ctx.stroke();
      }
      const injured=members.filter(e=>e.hp<e.maxHp-0.5).length;
      const label='아군 '+members.length+'기'+(faction==='myren'&&members.length?' · 부상 '+injured+'기':'');
      ctx.font='bold 11px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      const w=Math.ceil(ctx.measureText(label).width)+12,py=y-20;
      ctx.fillStyle='#20232cf2';ctx.fillRect(x-w/2,py-13,w,17);ctx.textAlign='center';ctx.fillStyle=tone;ctx.fillText(label,x,py);
      ctx.restore();
    }
  }
  window.FieldTactics=FieldTactics;
})();
