/* Live control groups. Saved IDs are local to one match. */
(() => {
  'use strict';
  const priority=['heavy','specialist','soldier','worker','hq','barracks','tower','house','depot'];
  const unitTypes=new Set(['heavy','specialist','soldier','worker']);
  const clock=()=>performance.now();
  function element(tag,cls,label) {
    const node=document.createElement(tag);
    if(cls) node.className=cls;
    if(label!==undefined) node.textContent=label;
    return node;
  }
  function button(cls,text,callback){
    const node=element('button',cls,text);
    node.type='button';
    node.addEventListener('click',callback);
    return node;
  }
  function text(node,value) {
    if(node.textContent!==value) node.textContent=value;
  }
  function describe(g,entities){
    const counts=new Map();
    for(const e of entities) counts.set(e.type,(counts.get(e.type)||0)+1);
    const types=priority.filter(type=>counts.has(type));
    types.sort((a,b)=>counts.get(b)-counts.get(a));
    return {
      first:types[0],
      label:types.map(type=>g.name(type)+' '+counts.get(type)).join(' · '),
      n:entities.length
    };
  }
  class SquadBar {
    constructor(container,callbacks){
      this.container=container;
      this.actions=callbacks;
      this.g=null;
      this.groups=Array.from({length:10},()=>[]);
      this.page=0;
      this.open=0;
      this.lastRecall=null;
      this.strip=element('div','squad-strip');
      this.strip.setAttribute('role','group');
      this.strip.setAttribute('aria-label','부대 관리');
      const heading=element('span','squad-caption','부대');
      this.strip.append(heading);
      this.slots=[];
      for(let i=0;i<3;i++){
        const wrap=element('div','squad-slot');
        const main=button('squad-main','',()=>{
          const n=this.page*3+i+1;
          if(this.members(n).length) this.recall(n);
          else this.save(n);
        });
        const key=element('span','squad-key');
        const picture=element('canvas','squad-icon');
        picture.width=22; picture.height=22; picture.setAttribute('aria-hidden','true');
        const count=element('span','squad-count');
        main.append(key,picture,count);
        const more=button('squad-more','⋯',()=>{
          this.open=this.open===this.page*3+i+1?0:this.page*3+i+1;
          this.lastRecall=null;
          this.refresh();
          if(this.open) this.menu.querySelector('button:not(:disabled)').focus();
        });
        more.setAttribute('aria-haspopup','dialog');
        wrap.append(main,more);
        this.strip.append(wrap);
        this.slots.push({wrap,main,more,key,picture,count,skin:null});
      }
      this.next=button('squad-next','›',()=>{
        this.page=(this.page+1)%3;this.open=0;this.lastRecall=null;this.refresh();
      });
      this.strip.append(this.next);
      this.menu=element('div','squad-menu');
      this.menu.setAttribute('role','dialog');
      this.menu.hidden=true;
      const head=element('div','squad-menu-head');
      this.menuTitle=element('strong');
      const close=button('squad-menu-close','×',()=>this.close(true));
      close.setAttribute('aria-label','부대 편집 닫기');
      head.append(this.menuTitle,close);
      this.composition=element('small','squad-composition');
      const tools=element('div','squad-menu-tools');
      this.assign=button('squad-edit-action','선택 저장',()=>this.save(this.open));
      this.add=button('squad-edit-action','선택 추가',()=>this.append(this.open));
      this.remove=button('squad-edit-action','부대 해제',()=>this.clear(this.open));
      tools.append(this.assign,this.add,this.remove);
      this.menu.append(head,this.composition,tools);
      this.strip.append(this.menu);
      container.replaceChildren(this.strip);
      this.strip.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&this.open){ e.stopPropagation();e.preventDefault();this.close(true); }
        else if(e.key===' '||e.key==='Enter')e.stopPropagation();
      });
      this.outside=e=>{if(this.open&&!this.strip.contains(e.target))this.close(false);};
      document.addEventListener('pointerdown',this.outside);
      this.refresh();
    }
    close(restoreFocus=false){
      if(!this.open)return;
      const index=(this.open-1)%3;
      this.open=0;
      this.menu.hidden=true;
      this.slots[index].more.setAttribute('aria-expanded','false');
      if(restoreFocus)this.slots[index].more.focus();
    }
    destroy(){
      document.removeEventListener('pointerdown',this.outside);
      this.strip.remove();
    }
    sync(){
      const g=this.actions.getGame();
      if(this.g!==g){
        this.g=g;
        this.groups=Array.from({length:10},()=>[]);
        this.splitSlots=null;
        this.page=0;this.open=0;this.lastRecall=null;
      }
      return g;
    }
    live(ids){
      if(!this.g)return [];
      return [...new Set(ids)].filter(id=>{
        const e=this.g.byId.get(id);
        return e&&e.hp>0&&e.faction===this.g.faction;
      });
    }
    members(n){
      this.sync();
      if(!Number.isInteger(n)||n<1||n>9)return [];
      const ids=this.live(this.groups[n]);
      this.groups[n]=ids;
      return [...ids];
    }
    allowed(n){
      return Boolean(this.sync()&&Number.isInteger(n)&&n>=1&&n<=9&&this.actions.canAct());
    }
    split(){
      if(!this.sync()||!this.actions.canAct())return false;
      const fighters=this.live(this.g.selected).map(id=>this.g.byId.get(id))
        .filter(e=>unitTypes.has(e.type)&&e.type!=='worker');
      if(fighters.length<2){this.actions.notify('나눌 전투병을 두 기 이상 선택하세요.');return false;}
      const teams=[[],[]],strength=[0,0];
      for(const type of ['heavy','specialist','soldier']){
        const sameType=fighters.filter(e=>e.type===type).sort((a,b)=>b.hp-a.hp||a.id-b.id);
        const assigned=[0,0];
        for(const e of sameType){
          const balance=(assigned[0]-assigned[1])||(teams[0].length-teams[1].length)||(strength[0]-strength[1]);
          const side=balance>0?1:0;
          teams[side].push(e.id);assigned[side]++;strength[side]+=e.hp;
        }
      }
      const slots=Array.from({length:9},(_,i)=>(this.page*3+i)%9+1);
      const spaces=slots.filter(n=>!this.members(n).length);
      const chosen=new Set(fighters.map(e=>e.id));
      const previous=this.splitSlots?.flatMap(n=>this.members(n))||[];
      const reusing=previous.length>0&&previous.every(id=>chosen.has(id));
      const pair=reusing?[...this.splitSlots]:teams.map(team=>slots.find(n=>{
        const members=this.members(n);return members.length===team.length&&members.every(id=>team.includes(id));
      })||0);
      if(pair.filter(n=>!n).length>spaces.length){
        this.actions.notify('편성에 쓸 빈 부대 칸이 부족합니다. 부대의 ⋯ 메뉴에서 번호를 해제하세요.');return false;
      }
      const automatic=reusing||pair.every(n=>!n);
      for(let i=0;i<2;i++){
        if(!pair[i])pair[i]=spaces.shift();
        this.groups[pair[i]]=teams[i];
      }
      this.splitSlots=automatic?pair:null;
      this.lastRecall=null;this.close();this.page=Math.floor((pair[0]-1)/3);
      this.actions.select(teams[0]);this.refresh();
      this.actions.notify(pair[0]+'번 '+teams[0].length+'기 선택 · '+pair[1]+'번 '+teams[1].length+'기 편성. 번호를 눌러 교대하세요.');
      return true;
    }
    save(n){
      if(!this.allowed(n))return false;
      const selected=this.live(this.g.selected);
      if(!selected.length){
        if(!this.g.selected.length&&this.members(n).length)return this.clear(n);
        this.actions.notify('저장할 아군을 선택하세요.');return false;
      }
      this.groups[n]=selected;
      this.finish(n,n+'번 부대를 저장했습니다.');
      return true;
    }
    append(n){
      if(!this.allowed(n))return false;
      const selected=this.live(this.g.selected);
      if(!selected.length){this.actions.notify('추가할 아군을 선택하세요.');return false;}
      const previous=this.members(n);
      const combined=[...new Set([...previous,...selected])];
      const added=combined.length-previous.length;
      this.groups[n]=combined;
      this.finish(n,added?n+'번 부대에 '+added+'개 대상을 추가했습니다.':'선택한 대상이 이미 이 부대에 있습니다.');
      return true;
    }
    clear(n){
      if(!this.allowed(n))return false;
      this.groups[n]=[];
      this.finish(n,n+'번 부대를 해제했습니다.');
      return true;
    }
    finish(n,message){
      if(this.splitSlots?.includes(n))this.splitSlots=null;
      this.close(Boolean(this.open));
      this.page=Math.floor((n-1)/3);
      this.lastRecall=null;
      this.refresh();
      this.actions.notify(message);
    }
    recall(n){
      if(!this.allowed(n))return false;
      const group=this.members(n);
      if(!group.length){this.actions.notify(n+'번 부대가 비어 있습니다.');return false;}
      const stamp=clock();
      const twice=this.lastRecall?.n===n&&stamp-this.lastRecall.stamp<=440;
      this.close();
      this.page=Math.floor((n-1)/3);
      this.lastRecall=twice?null:{n,stamp};
      this.actions.select(group);
      if(twice){
        let x=0,y=0;
        for(const id of group){ const e=this.g.byId.get(id);x+=e.x;y+=e.y; }
        this.actions.center(x/group.length,y/group.length);
      }
      this.refresh();
      return true;
    }
    handleKey(e){
      if(!this.sync()||!this.actions.canAct()||e.altKey||e.isComposing||e.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return false;
      const digit=/^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1]||(/^[1-9]$/.test(e.key)?e.key:null);
      if(!digit)return false;
      e.preventDefault();
      if(e.repeat)return true;
      const n=Number(digit);
      if(e.ctrlKey||e.metaKey)this.save(n);
      else if(e.shiftKey)this.append(n);
      else this.recall(n);
      return true;
    }
    refresh(){
      const g=this.sync();
      if(!g){this.strip.hidden=true;return;}
      this.strip.hidden=false;
      const active=this.actions.canAct(), selected=this.live(g.selected);
      const selectedSet=new Set(selected);
      if(!active)this.open=0;
      this.next.disabled=!active;
      this.next.title='다음 부대 번호 '+((this.page+1)%3*3+1)+'–'+((this.page+1)%3*3+3);
      this.next.setAttribute('aria-label',this.next.title);
      for(let i=0;i<3;i++){
        const n=this.page*3+i+1,v=this.slots[i],ids=this.members(n);
        const info=describe(g,ids.map(id=>g.byId.get(id)));
        const chosen=ids.length>0&&ids.length===selected.length&&ids.every(id=>selectedSet.has(id));
        const message=info.n?n+'번 부대 호출 · '+info.label+(chosen?' · 선택됨':''):n+'번 부대에 현재 선택 저장';
        v.main.title=message;
        v.main.setAttribute('aria-label',message);
        v.main.setAttribute('aria-pressed',String(chosen));
        v.main.disabled=!active||(!info.n&&!selected.length);
        v.more.disabled=!active;
        v.more.title=n+'번 부대 편집';
        v.more.setAttribute('aria-label',v.more.title);
        v.more.setAttribute('aria-expanded',String(this.open===n));
        v.wrap.classList.toggle('squad-selected',chosen);
        v.wrap.classList.toggle('squad-filled',Boolean(info.n));
        text(v.key,String(n));
        text(v.count,info.n?String(info.n):'–');
        const skin=info.first?g.faction+'/'+info.first:'';
        v.picture.hidden=!skin;
        if(skin&&skin!==v.skin){
          const ctx=v.picture.getContext('2d');
          ctx.clearRect(0,0,22,22);
          const size=info.first==='specialist'?.46:unitTypes.has(info.first)?(info.first==='worker'?.82:.67):info.first==='hq'?.18:.31;
          Art.draw(ctx,info.first,g.faction,11,20,{size});
        }
        v.skin=skin;
        if(this.open===n){
          this.menu.setAttribute('aria-label',n+'번 부대 편집');
          text(this.menuTitle,n+'번 부대');
          text(this.composition,info.label||'빈 부대');
          this.assign.disabled=!selected.length;this.add.disabled=!selected.length;this.remove.disabled=!ids.length;
        }
      }
      this.menu.hidden=!this.open;
    }
  }
  window.SquadBar=SquadBar;
})();
