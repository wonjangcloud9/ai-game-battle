(() => {
  'use strict';

  const limit = 10;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function clock(time) {
    const sec = Math.max(0,Math.floor(time));
    return String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
  }
  function category(event,game) {
    switch (event.kind) {
      case 'alert':
        if (event.approaches || event.text.includes('정찰')) return {label:'정찰',tone:'scout',urgent:true};
        return {label:event.text.includes('파괴')?'손실':'경보',tone:'enemy',urgent:true};
      case 'rescue': return {label:'귀환',tone:'own'};
      case 'bell': return {label:'종울림',tone:event.side==='enemy'?'enemy':'beacon'};
      case 'beacon':
        return {label:'봉화',tone:event.side==='enemy'?'enemy':'beacon',urgent:event.side==='enemy'};
      case 'ability':
        return {label:'전술',tone:event.side==='enemy'?'enemy':'own',urgent:event.side==='enemy'};
      case 'ash': return {label:'착탄 경보',tone:'enemy',urgent:true};
      case 'salvage':
        if(event.recoveryWorkerLost)return {label:'재파견',tone:'scout',urgent:true};
        return {label:game.mapId==='lantern'?'짐배':'금고',tone:event.side==='enemy'?'enemy':'beacon'};
      case 'repair': return {label:'수리',tone:'own'};
      case 'doctrine': return {label:'교리',tone:event.side==='enemy'?'enemy':'own'};
      case 'siege': return {label:'공성',tone:event.side==='own'?'enemy':'own',urgent:true};
      case 'build':
        if(event.constructionSiteId)return {label:'공사 중단',tone:'scout',urgent:true};
        return event.text.includes('완료') ? {label:'건설',tone:'own'} : null;
      case 'battle': return {label:'교전',tone:'own'};
      case 'result': return {label:'결과',tone:game.result==='win'?'own':'enemy',urgent:true};
      case 'info': return event.time===0 ? {label:'개시',tone:'neutral'} : null;
      default: return null;
    }
  }
  function location(event,game) {
    if (Number.isFinite(event.x) && Number.isFinite(event.y)) return {x:event.x,y:event.y};
    if (event.kind==='beacon' && game.beacon) return {x:game.beacon.x,y:game.beacon.y};
    if (event.kind==='info' && event.time===0 && game.terrain?.layout?.player?.hq) {
      const [x,y]=game.terrain.layout.player.hq;
      return {x,y};
    }
    return null;
  }
  function stopButtonShortcut(event) {
    // Preserve native button activation when Space normally pauses the match.
    if (event.key===' ' || event.key==='Enter') event.stopPropagation();
  }
  function focus(node) { node?.focus({preventScroll:true}); }

  function headquartersAlert(field,actions) {
    const objective=field.querySelector('.mission .objective');
    if (!objective) return ()=>{};
    const row=element('div','hq-distress');
    row.hidden=true;
    const home=element('button','hq-distress-home');
    const title=element('strong','','사령부 피격');
    const health=element('span','hq-distress-health');
    home.type='button';
    home.append(title,health);
    const repair=element('button','hq-distress-repair');
    const dispatch=element('strong',''),crew=element('span','');
    repair.type='button';
    repair.append(dispatch,crew);
    row.append(home,repair);
    objective.after(row);
    let match,base;
    function ready() { return !row.hidden && !match?.result && actions.canOpen?.()!==false; }
    home.addEventListener('click',()=>{
      if (ready()) { actions.home(); focus(field.querySelector('#world')); }
    });
    repair.addEventListener('click',()=>{
      if (ready() && !repair.disabled) { actions.repairHQ(base); focus(field.querySelector('#world')); }
    });
    row.addEventListener('keydown',stopButtonShortcut);

    return function update(game) {
      if (match!==game) {
        match=game;
        base=game?.entities.find(unit=>unit.type==='hq' && unit.faction===game.faction);
      }
      const recent=Boolean(base && !game.result && base.hp>0 && base.lastHurt>=0 && game.time-base.lastHurt<8);
      if (row.hidden===recent) {
        if (!recent && row.contains(document.activeElement)) focus(field.querySelector('#world'));
        objective.hidden=recent;
        row.hidden=!recent;
      }
      if (!recent) return;
      const hp=Math.ceil(base.hp)+' / '+base.maxHp;
      health.textContent=hp;
      home.title=game.name('hq')+' 선택 · 사령부 체력 '+hp;
      home.setAttribute('aria-label','사령부 피격 · 체력 '+hp+' · 본진으로 이동');
      home.disabled=!ready();
      row.classList.toggle('hq-critical',base.hp/base.maxHp<.3);
      row.style.setProperty('--hq-health',100*base.hp/base.maxHp+'%');
      const workers=game.entities.filter(unit=>unit.type==='worker' && unit.faction===game.faction && unit.hp>0);
      const assigned=workers.filter(w=>(w.action==='repair' && w.targetId===base.id) ||
        w.waypoints.some(p=>p.mode==='repair' && p.targetId===base.id)).length;
      const available=workers.some(w=>!w.waypoints.length && ['idle','gather','return'].includes(w.action));
      const reason=game.repairReason(base);
      let label=assigned?'수리 증원':'긴급 수리', status=assigned?assigned+'기 배정':'일꾼 파견';
      if (reason) {
        label='수리';
        status=base.hp>=base.maxHp?'완료':'불씨광 부족';
      } else if (assigned>=2 || !available) {
        label=assigned?'수리 중':'수리';
        status=assigned?assigned+'기 배정':'일꾼 없음';
      }
      dispatch.textContent=label;
      crew.textContent=status;
      repair.disabled=home.disabled || Boolean(reason) || assigned>=2 || !available;
      repair.title=reason || (assigned>=2?'수리 일꾼 '+assigned+'기 배정됨':!available?'파견할 유휴 또는 채집 일꾼이 없습니다.':'수리 일꾼 한 기 파견 · 불씨광 1로 체력을 최대 4 회복합니다.');
      repair.setAttribute('aria-label','사령부 '+label+' · '+status);
    };
  }

  class FieldLog {
    constructor(field,trigger,actions) {
      this.field=field;
      this.trigger=trigger;
      this.actions=actions;
      this.latest=null;
      this.game=null;
      this.updateHeadquarters=headquartersAlert(field,actions);
      this.records=[];
      this.unread=false;
      this.drawer=element('section','field-log');
      this.drawer.id='fieldLogPanel';
      this.drawer.hidden=true;
      const header=element('header','field-log-header');
      const title=element('h3','field-log-title','전황 기록');
      title.id='fieldLogTitle';
      this.drawer.setAttribute('aria-labelledby',title.id);
      this.closeButton=element('button','field-log-close','×');
      this.closeButton.type='button';
      this.closeButton.setAttribute('aria-label','전황 기록 닫기');
      this.closeButton.title='전황 기록 닫기 (Esc)';
      this.closeButton.addEventListener('click',()=>this.close({restoreFocus:true}));
      header.append(title,this.closeButton);
      this.list=element('ol','field-log-list');
      this.empty=element('p','field-log-empty','아직 전황 보고가 없습니다.');
      this.drawer.append(header,this.empty,this.list);
      field.append(this.drawer);
      trigger.classList.add('field-log-toggle');
      trigger.setAttribute('aria-controls',this.drawer.id);
      trigger.setAttribute('aria-expanded','false');
      trigger.setAttribute('aria-keyshortcuts','L');
      trigger.setAttribute('aria-label','전황 기록');
      trigger.title='전황 기록 열기 (L)';
      trigger.addEventListener('click',()=>this.toggle());
      trigger.addEventListener('keydown',stopButtonShortcut);
      this.drawer.addEventListener('keydown',event=>this._key(event));
    }

    get isOpen() { return !this.drawer.hidden; }

    open({focus:moveFocus=true}={}) {
      if (this.isOpen || !this.game || this.actions.canOpen?.()===false) return;
      this.actions.onOpen?.();
      this.drawer.hidden=false;
      this.trigger.setAttribute('aria-expanded','true');
      this._unread(false);
      this.list.scrollTop=0;
      if (moveFocus) focus(this.list.querySelector('button')||this.closeButton);
    }
    close({restoreFocus=false}={}) {
      if (!this.isOpen) return;
      this.drawer.hidden=true;
      this.trigger.setAttribute('aria-expanded','false');
      if (restoreFocus) focus(this.trigger);
    }
    toggle() {
      if (this.isOpen) this.close({restoreFocus:true});
      else this.open();
    }
    _unread(value) {
      if (this.unread===value) return;
      this.unread=value;
      this.trigger.classList.toggle('field-log-unread',value);
      this.trigger.setAttribute('aria-label',value?'전황 기록 · 새 경보':'전황 기록');
    }
    _key(event) {
      if (event.key==='Escape') {
        event.stopPropagation();
        event.preventDefault();
        this.close({restoreFocus:true});
        return;
      }
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        stopButtonShortcut(event);
        return;
      }
      const buttons=Array.from(this.list.querySelectorAll('button'));
      event.stopPropagation();
      event.preventDefault();
      if (!buttons.length) return;
      const current=buttons.indexOf(document.activeElement),last=buttons.length-1;
      let next;
      switch(event.key) {
        case 'Home': next=0; break;
        case 'End': next=last; break;
        case 'ArrowDown': next=Math.min(current+1,last); break;
        case 'ArrowUp': next=Math.max(current-1,0); break;
      }
      focus(buttons[next]);
      buttons[next].scrollIntoView({block:'nearest'});
    }
    _locate(point,event) {
      this.close();
      this.actions.center(point.x,point.y,event);
      focus(this.field.querySelector('#world'));
    }
    update(game) {
      this.updateHeadquarters(game);
      if (this.game!==game) {
        this.close({restoreFocus:this.drawer.contains(document.activeElement)});
        this.game=game;
        this.latest=null;
        this.records=[];
        this.list.replaceChildren();
        this.empty.hidden=false;
        this._unread(false);
      }
      const events=game?.events;
      const newest=events?.[events.length-1];
      if (!newest || newest===this.latest) return;
      // The engine retains a bounded history. Read every event between HUD updates,
      // even if a routine deployment arrived just after a combat warning.
      const start=this.latest ? events.lastIndexOf(this.latest)+1 : 0;
      this.latest=newest;
      for (let i=start;i<events.length;i++) {
        const event=events[i],detail=category(event,game);
        if (detail) this._add(event,detail,location(event,game));
      }
    }
    _add(event,detail,point) {
      const previous=this.records[0];
      const sameAlarm=event.kind==='alert' && previous?.event.kind==='alert' &&
        previous.event.text===event.text && point && previous.point &&
        Math.hypot(point.x-previous.point.x,point.y-previous.point.y)<60 &&
        event.time>=previous.event.time && event.time-previous.event.time<=20;
      if (sameAlarm) {
        previous.event=event;
        previous.point=point;
        previous.repeats++;
        this._label(previous);
      } else {
        const record={event,point,detail,repeats:1};
        record.row=element('li','field-log-record');
        record.content=element(point?'button':'div','field-log-entry field-log-'+detail.tone);
        record.badge=element('span','field-log-kind',detail.label);
        record.copy=element('span','field-log-copy',event.text);
        record.when=element('time','field-log-time');
        record.content.append(record.badge,record.copy,record.when);
        if (point) {
          record.content.type='button';
          const pin=element('span','field-log-pin');
          pin.setAttribute('aria-hidden','true');
          record.content.append(pin);
          record.content.addEventListener('click',()=>this._locate(record.point,record.event));
        }
        this._label(record);
        record.row.append(record.content);
        const approaches=event.approaches;
        if (approaches?.length) {
          const primary=approaches[0];
          const detail=approaches.length>1?primary.label+' · '+primary.composition:primary.composition;
          record.content.append(element('small','field-log-composition',detail));
          for (const lane of approaches.slice(1)) {
            const alternate=element('button','field-log-alternate',lane.label+' · '+lane.composition);
            alternate.type='button';
            alternate.title=lane.label+' 위치 보기';
            alternate.setAttribute('aria-label',clock(event.time)+' '+alternate.textContent+' · 위치 보기');
            const pin=element('span','field-log-pin');
            pin.setAttribute('aria-hidden','true');
            alternate.append(pin);
            alternate.addEventListener('click',()=>this._locate(lane,event));
            record.row.append(alternate);
          }
        }
        this.list.prepend(record.row);
        this.records.unshift(record);
        this.empty.hidden=true;
        if (this.records.length>limit) {
          const removed=this.records.pop();
          if (removed.row.contains(document.activeElement)) {
            const oldest=this.records.at(-1);
            focus(oldest.point?oldest.content:this.closeButton);
          }
          removed.row.remove();
        }
      }
      if (detail.urgent && !this.isOpen) this._unread(true);
    }
    _label(record) {
      const {event,point,repeats}=record,time=clock(event.time);
      const count=repeats>1?' · '+repeats+'회':'';
      record.when.textContent=time;
      record.when.dateTime='PT'+Math.max(0,Math.floor(event.time))+'S';
      record.copy.textContent=event.text+count;
      if (point) {
        const primary=event.approaches?.[0];
        const site=primary?primary.label+' 위치 보기':'보고 위치 보기';
        record.content.title=site+' · '+time;
        const intel=primary?' · '+primary.composition:'';
        record.content.setAttribute('aria-label',time+' '+event.text+count+intel+' · '+site);
      }
    }
  }
  window.FieldLog=FieldLog;
})();
