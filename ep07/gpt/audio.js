(() => {
  'use strict';
  let ctx, master;
  let running = true, nextPulse = null, lastTick = null, step = 0, tension = 0;
  let scoreFaction = 'velari', lastCombat = -Infinity, lastGather = -Infinity;
  const specialCueGap={specialist:.27,mark:.74,splash:.42,heal:.72,repair:1.15,ashImpact:.22,dewCast:.20,dewBreak:.22,dewMend:.32,volleyPrime:.28,volleyRelease:.24,volleyHit:.19};
  const nextSpecialCue=new Map();
  const voices = new Set();
  const scales = {
    velari: {root:62, degrees:[0,2,3,5,7,9,10], lead:'sine', bass:'triangle', echo:.34},
    cinder: {root:55, degrees:[0,2,3,5,7,8,10], lead:'triangle', bass:'triangle', echo:.20},
    myren: {root:60, degrees:[0,2,4,5,7,9,10], lead:'triangle', bass:'sine', echo:.27}
  };
  // Each four-bar phrase has its own rhythm and contour. Empty eighth notes let the battlefield breathe.
  const phraseA = [
    [4,null,null,6,null,5,null,null], [null,2,null,null,4,null,null,null],
    [5,null,null,7,null,4,null,null], [null,3,null,1,null,null,2,null]
  ];
  const phraseB = [
    [null,7,null,null,5,null,4,null], [6,null,null,4,null,null,2,null],
    [null,3,4,null,null,6,null,null], [4,null,null,2,null,0,null,null]
  ];
  const harmony = [0,-2,-4,-3, -2,-4,-3,0];
  const hidden = () => document.hidden;
  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.osc.onended = null;
    voice.osc.disconnect();
    voice.gain.disconnect();
  }
  function silence(musicOnly = false) {
    nextPulse = null;
    lastTick = null;
    for (const voice of voices) {
      if (musicOnly && !voice.music) continue;
      try { voice.osc.stop(ctx.currentTime); } catch {}
      release(voice);
    }
  }
  function note(at,hz,end,dur,wave,volume,attack,music=false) {
    if (voices.size >= 40 || !(dur > 0)) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const voice = {osc,gain,music};
    voices.add(voice);
    osc.type = wave;
    osc.frequency.setValueAtTime(hz,at);
    if (end !== hz) osc.frequency.exponentialRampToValueAtTime(Math.max(12,end),at+dur);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+Math.min(attack,dur*.45));
    gain.gain.exponentialRampToValueAtTime(.0001,at+dur);
    osc.connect(gain);
    gain.connect(master);
    osc.onended = () => release(voice);
    osc.start(at);
    osc.stop(at+dur+.012);
  }
  function pitch(palette,degree) {
    const oct = Math.floor(degree/7), midi = palette.root+oct*12+palette.degrees[degree-oct*7];
    return 440*Math.pow(2,(midi-69)/12);
  }
  function pulse(at,beat) {
    const palette = scales[scoreFaction], bar = Math.floor(step/8)%8, pos = step%8;
    const root = harmony[bar], degree = (bar<4?phraseA:phraseB)[bar%4][pos];
    if (degree !== null) {
      const hz = pitch(palette,degree+7);
      note(at,hz,hz,beat*1.75,palette.lead,.17,.025,true);
      note(at+beat*.46,hz,hz,beat*1.35,'sine',.13*palette.echo,.038,true);
    }
    if (pos===0 || (pos===5 && tension>.37)) {
      const hz = pitch(palette,root-7+(pos===5?4:0));
      note(at,hz,hz,beat*(pos===0?3.8:1.3),palette.bass,.19,.06,true);
    }
    if (pos===3 || (pos===7 && tension>.18)) {
      const hz = pitch(palette,root+4+(bar%2?2:0));
      note(at,hz,hz,beat*1.55,'sine',.065+.025*tension,.034,true);
    }
    if (tension>.26 && (pos===0 || pos===4 || (pos===6 && tension>.70))) {
      note(at,95,44,.15,'sine',.15*tension,.012,true);
      if (pos===4) note(at+beat*.55,240,135,.065,'triangle',.068*tension,.007,true);
    }
    step=(step+1)%64;
  }
  const sound = {
    enabled:true,
    musicEnabled:false,
    unlock(){
      if (!this.enabled || hidden()) return;
      try {
        if (!ctx) {
          ctx = new (window.AudioContext||window.webkitAudioContext)();
          master = ctx.createGain();
          master.gain.value = .11;
          master.connect(ctx.destination);
        }
        if (ctx.state==='suspended') Promise.resolve(ctx.resume()).catch(()=>{});
      } catch {}
    },
    toggle(){
      this.enabled = !this.enabled;
      if (this.enabled) this.unlock();
      else silence();
      return this.enabled;
    },
    toggleMusic(){
      this.musicEnabled = !this.musicEnabled;
      if (this.musicEnabled) this.unlock();
      else silence(true);
      return this.musicEnabled;
    },
    tick({running:active=true,combat=false,faction='velari'}={}){
      running=Boolean(active);
      if (!running || hidden() || !this.enabled) {
        if (voices.size || nextPulse!==null) silence();
        return;
      }
      if (!this.musicEnabled || !ctx || ctx.state!=='running') return;
      if (!Object.prototype.hasOwnProperty.call(scales,faction)) faction='velari';
      if (faction!==scoreFaction) {
        silence(true);
        scoreFaction=faction; step=0; tension=0;
      }
      const now=ctx.currentTime;
      const dt=lastTick===null?0:Math.max(0,Math.min(.5,now-lastTick));
      lastTick=now;
      const target=combat?1:0;
      tension+=(target-tension)*(1-Math.exp(-dt/(combat?2.8:5.8)));
      const beat=30/(74+13*tension);
      if (nextPulse===null || nextPulse<now-.05) nextPulse=now+.03;
      if (nextPulse<=now+.205) {
        pulse(Math.max(now,nextPulse),beat);
        nextPulse+=beat;
      }
    },
    play(name,faction='velari'){
      if (!ctx || !this.enabled || !running || hidden() || ctx.state!=='running') return;
      const now=ctx.currentTime, tune=faction==='myren'?1.18:faction==='cinder'?.78:1;
      if(Object.prototype.hasOwnProperty.call(specialCueGap,name)){
        if(now<(nextSpecialCue.get(name)??-Infinity))return;
        nextSpecialCue.set(name,now+specialCueGap[name]);
      }
      const tone=(hz,dur,wave,volume=1,delay=0,end=hz)=>{
        note(now+delay,hz*tune,end*tune,dur,wave,volume,.009);
      };
      switch(name){
        case 'select': tone(430,.065,'sine',.26,0,555);tone(722,.06,'triangle',.13,.038);break;
        case 'order': tone(510,.07,'triangle',.27,0,400);break;
        case 'retreat': tone(548,.08,'triangle',.25,0,478);tone(369,.17,'sine',.33,.08,327);break;
        case 'volley': tone(510,.09,'triangle',.23,0,665);tone(760,.12,'sine',.25,.044);tone(1030,.19,'sine',.16,.078);break;
        case 'volleyPrime': tone(373,.12,'sine',.20,0,430);tone(574,.21,'triangle',.13,.085,548);break;
        case 'volleyRelease': tone(548,.08,'triangle',.23,0,821);tone(1096,.16,'sine',.17,.036,1034);break;
        case 'volleyHit': tone(1276,.065,'triangle',.16,0,692);tone(822,.12,'sine',.14,.018,793);break;
        case 'ashLaunch': tone(212,.13,'triangle',.38,0,420);tone(535,.23,'sine',.20,.05,803);break;
        case 'ashImpact': tone(173,.24,'triangle',.40,0,66);tone(734,.11,'sine',.20,.04,349);tone(570,.15,'triangle',.13,.08,268);break;
        case 'ashWarning': tone(722,.11,'triangle',.22,0,620);tone(722,.15,'triangle',.25,.15,530);break;
        case 'dewCast': tone(510,.12,'sine',.23,0,702);tone(837,.21,'sine',.16,.087,621);tone(422,.23,'triangle',.10,.10);break;
        case 'dewBreak': tone(917,.07,'triangle',.14,0,481);tone(585,.12,'sine',.16,.043,264);break;
        case 'dewMend': tone(453,.18,'sine',.19,0,488);tone(680,.29,'sine',.14,.093,733);break;
        case 'escort': tone(482,.09,'triangle',.24,0,540);tone(638,.13,'sine',.28,.065,640);break;
        case 'post': tone(330,.11,'triangle',.29,0,350);tone(495,.15,'sine',.27,.08);break;
        case 'build': tone(205,.09,'triangle',.55);tone(327,.1,'triangle',.43,.08);tone(491,.19,'sine',.33,.15);break;
        case 'train': tone(330,.09,'triangle',.4);tone(550,.13,'sine',.42,.065);break;
        case 'error': tone(141,.13,'triangle',.4,0,101);tone(110,.10,'triangle',.22,.1);break;
        case 'hit':
          if(now-lastCombat<.17)return;
          lastCombat=now;
          if(faction==='cinder'){tone(162,.10,'sawtooth',.16,0,40);tone(397,.05,'square',.13,0,87);}
          else if(faction==='myren'){tone(580,.09,'triangle',.25,0,129);tone(196,.11,'sine',.31,.015,93);}
          else{tone(946,.085,'sine',.3,0,355);tone(1320,.08,'triangle',.16,.022,880);}
          break;
        case 'gather':
          if(now-lastGather<3.9)return;
          lastGather=now;
          tone(840,.12,'sine',.10);tone(1320,.17,'sine',.06,.025);break;
        case 'specialist':
          if(faction==='velari'){
            tone(735,.075,'triangle',.16,0,1120);tone(1092,.095,'sine',.14,.025,798);
          }else if(faction==='cinder'){
            tone(210,.12,'triangle',.30,0,88);tone(510,.075,'sawtooth',.08,.018,179);
          }else{
            tone(421,.10,'sine',.21,0,326);tone(614,.08,'triangle',.10,.022,502);
          }
          break;
        case 'mark':
          tone(712,.09,'sine',.14);tone(1068,.14,'sine',.18,.077);break;
        case 'repair':
          tone(684,.036,'triangle',.13,0,430);tone(916,.078,'sine',.09,.061,821);break;
        case 'splash':
          tone(175,.24,'triangle',.30,0,45);tone(91,.17,'sine',.19,.024,51);break;
        case 'heal':
          tone(359,.17,'sine',.16,0,372);tone(447,.21,'sine',.18,.065,467);
          tone(591,.25,'triangle',.12,.13,596);break;
        case 'ability':
          tone(244,.20,'triangle',.34,0,488);tone(730,.27,'sine',.37,.10,975);tone(1095,.34,'sine',.24,.17);break;
        case 'beacon':
          tone(572,.19,'sine',.45);tone(858,.26,'triangle',.27,.14);tone(1144,.38,'sine',.22,.27);break;
        case 'bell':
          tone(236,1.15,'sine',.43);tone(489,.72,'sine',.22);tone(673,.38,'triangle',.09,.012);tone(915,.2,'sine',.1);break;
        case 'ferryArrival':
          tone(196,.34,'triangle',.18,0,201);tone(392,.30,'sine',.07,.025);
          tone(261,.46,'triangle',.16,.38,257);tone(522,.40,'sine',.065,.41);break;
        case 'coffer':
          tone(388,.14,'sine',.22,0,465);tone(582,.15,'triangle',.20,.085,616);tone(776,.25,'sine',.25,.17,812);break;
        case 'research':
          tone(277,.19,'triangle',.19,0,293);tone(415,.23,'sine',.21,.09);
          tone(554,.34,'triangle',.18,.19);tone(698,.33,'sine',.13,.25);break;
        case 'alert':
          tone(349,.12,'triangle',.51,0,373);tone(466,.14,'triangle',.44,.15,440);break;
        case 'destroy':
          tone(127,.38,'triangle',.66,0,35);tone(355,.14,'sawtooth',.20,.015,58);
          tone(197,.20,'triangle',.31,.09,45);break;
        case 'win': [330,415,495,660,830].forEach((n,i)=>tone(n,.4,'triangle',.38,i*.12));break;
        case 'loss': [294,247,196,147].forEach((n,i)=>tone(n,.4,'triangle',.35,i*.16));break;
        default: tone(590,.07,'sine',.25);
      }
    }
  };
  document.addEventListener('visibilitychange',()=>{if(hidden())silence();});
  window.addEventListener('pagehide',()=>silence());
  window.GameSound=sound;
})();
