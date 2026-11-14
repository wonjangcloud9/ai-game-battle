'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const {Renderer,Geometry:G,model,clamp}=DuneGL;
  const TAU=Math.PI*2,ROAD=8.6,LAPS=3,START=34;
  const wrap=(x,m)=>(x%m+m)%m,angle=x=>wrap(x+Math.PI,TAU)-Math.PI,lerp=(a,b,t)=>a+(b-a)*t;
  let rng=73051;
  const random=()=>{rng=(rng*1664525+1013904223)>>>0;return rng/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const formatTime=s=>{if(!Number.isFinite(s))return '— — : — —';const ms=Math.floor(Math.max(0,s)*1000);return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
  let renderer;
  try{renderer=new Renderer($('game'));}catch(error){$('error').classList.remove('hidden');console.error(error);return;}
  const gl=renderer.gl;
  class Track{
    constructor(){
      this.points=[[-72,-105],[-72,-42],[-63,29],[-29,88],[38,100],[91,70],[101,20],[63,-6],[22,19],[-7,2],[11,-38],[69,-59],[84,-104],[34,-133],[-30,-132]];
      this.samples=[];this.length=0;let last=null;
      for(let i=0;i<=1800;i++){const p=this.interpolate(i/1800*this.points.length);if(last)this.length+=Math.hypot(p.x-last.x,p.z-last.z);this.samples.push({...p,s:this.length});last=p;}
      for(let i=0;i<this.samples.length;i++){const a=this.samples[wrap(i-2,1800)],b=this.samples[wrap(i+2,1800)],len=Math.hypot(b.x-a.x,b.z-a.z);Object.assign(this.samples[i],{tx:(b.x-a.x)/len,tz:(b.z-a.z)/len,h:Math.atan2(b.x-a.x,b.z-a.z)});}
    }
    interpolate(t){const n=this.points.length,i=Math.floor(t),u=t-i;const [a,b,c,d]=[-1,0,1,2].map(o=>this.points[wrap(i+o,n)]);const f=k=>.5*((2*b[k])+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u);return{x:f(0),z:f(1)};}
    at(distance,offset=0){const s=wrap(distance,this.length);let lo=0,hi=this.samples.length-1;while(lo<hi-1){const m=(lo+hi)>>1;if(this.samples[m].s<s)lo=m;else hi=m;}const a=this.samples[lo],b=this.samples[hi],t=(s-a.s)/(b.s-a.s||1),h=a.h+angle(b.h-a.h)*t,tx=Math.sin(h),tz=Math.cos(h);return{x:lerp(a.x,b.x,t)+tz*offset,z:lerp(a.z,b.z,t)-tx*offset,h,tx,tz,s};}
    nearest(x,z){let best=Infinity,index=0;for(let i=0;i<1800;i+=3){const p=this.samples[i],d=(p.x-x)**2+(p.z-z)**2;if(d<best){best=d;index=i;}}for(let j=-3;j<=3;j++){const i=wrap(index+j,1800),p=this.samples[i],d=(p.x-x)**2+(p.z-z)**2;if(d<best){best=d;index=i;}}
      const a=this.samples[index],next=this.samples[(index+1)%1800],prev=this.samples[wrap(index-1,1800)];let result={x:a.x,z:a.z,s:a.s,h:a.h,d:Math.sqrt(best)};
      for(const b of [next,prev]){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(x-px,z-pz);if(d<result.d){let ds=b.s-a.s;if(ds>this.length/2)ds-=this.length;if(ds<-this.length/2)ds+=this.length;result={x:px,z:pz,s:wrap(a.s+ds*t,this.length),h:a.h+angle(b.h-a.h)*t,d};}}
      result.offset=(x-result.x)*Math.cos(result.h)-(z-result.z)*Math.sin(result.h);return result;
    }
  }
  const track=new Track(),labels=[];
  function label(text,x,y,z,w,h,r,bg='#293b34',fg='#fff3d6',fontSize=86){const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=fg;ctx.font=`900 italic ${fontSize}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,135,950);labels.push({texture:renderer.texture(c),x,y,z,w,h,r});}
  function buildWorld(){
    const geo=new G();geo.box(0,-1.6,0,1600,3,1600,'#e6bb83');
    // Broad dunes: hand-coloured low polygons, with the actual race ribbon laid above them.
    for(let i=0;i<110;i++){const x=range(-340,340),z=range(-340,340),d=track.nearest(x,z).d;if(d>76)geo.sphere(x,-2,z,range(18,42),range(3,10),range(17,42),['#e7bd88','#e9c491','#e3b67d','#efc994'][i%4],8,3);}
    const n=1100;
    const strip=(p,q,inner,outer,y,col)=>{const point=(p,o)=>[p.x+p.tz*o,y,p.z-p.tx*o];geo.quad(point(p,inner),point(q,inner),point(q,outer),point(p,outer),col,[0,1,0]);};
    for(let i=0;i<n;i++){
      const p=track.at(i/n*track.length),q=track.at((i+1)/n*track.length);
      strip(p,q,-ROAD-1.6,ROAD+1.6,.055,'#d6ab78');strip(p,q,-ROAD,ROAD,.13,i%11===0?'#737878':'#777d7b');
      const curb=Math.floor(i/4)%2===0?'#ef7750':'#fff0d0';strip(p,q,-ROAD-1.05,-ROAD,.18,curb);strip(p,q,ROAD,ROAD+1.05,.18,curb);
      strip(p,q,-ROAD+.3,-ROAD+.45,.145,'#d7d2b5');strip(p,q,ROAD-.45,ROAD-.3,.145,'#d7d2b5');
      if(i%16<6)strip(p,q,-.085,.085,.142,'#c8c6ad');
      const curve=Math.abs(angle(track.at(p.s+6).h-track.at(p.s-6).h));
      if(curve>.22&&i%5===0){const side=angle(track.at(p.s+6).h-track.at(p.s-6).h)>0?-1:1,off=side*(ROAD+3.2),x=p.x+p.tz*off,z=p.z-p.tx*off;geo.box(x,.65,z,.45,1.3,.45,'#fff1d0',p.h);geo.box(x,1.13,z,.51,.25,.51,'#ec7551',p.h);}
    }
    // Start grid and a broad checkerboard finish stripe.
    for(let row=0;row<3;row++)for(let col=0;col<14;col++){const a=track.at(START+row*.95),b=track.at(START+(row+1)*.95);strip(a,b,-ROAD+col*ROAD*2/14,-ROAD+(col+1)*ROAD*2/14,.155,(row+col)%2?'#343f3b':'#fff3d7');}
    for(let i=0;i<8;i++){const p=track.at(START-6-i*4.7,i%2?-3.3:3.3);geo.box(p.x,.16,p.z,2.4,.02,.14,'#e3dfc4',p.h);for(const side of [-1,1])geo.box(p.x+Math.cos(p.h)*side*1.2,.16,p.z-Math.sin(p.h)*side*1.2+.5, .12,.02,1.1,'#e3dfc4',p.h);}
    const gate=track.at(START);
    for(const side of [-1,1]){const p=track.at(START,side*(ROAD+2.1));geo.box(p.x,4.5,p.z,.8,9,1.1,'#344b43',p.h);geo.box(p.x,1.1,p.z,1.4,2.2,1.8,'#f38b5a',p.h);}
    geo.box(gate.x,8.7,gate.z,ROAD*2+5,2.3,1.2,'#33463e',gate.h);geo.box(gate.x,10.02,gate.z,ROAD*2+5.1,.24,1.3,'#e8edaa',gate.h);
    label('DUNE / DRIFT',gate.x-gate.tx*.63,8.8,gate.z-gate.tz*.63,17.8,1.65,gate.h,'#33463e','#fff2d4',112);
    label('SUNSET CIRCUIT',gate.x+gate.tx*.63,8.8,gate.z+gate.tz*.63,17.8,1.65,gate.h+Math.PI,'#33463e','#dcf487',100);
    // Desert grandstands, shelters, painted barriers, banners.
    for(const side of [-1,1]){
      const p=track.at(65,side*24),r=p.h;
      for(let j=0;j<4;j++){const off=side*j*1.8;geo.box(p.x+Math.cos(r)*off,.6+j*.6,p.z-Math.sin(r)*off,1.7,1.1+j*1.2,24,'#d5b796',r);for(let k=-5;k<=5;k++){const q=track.at(65+k*1.8,side*(24+j*1.8));geo.box(q.x,1.6+j*.65,q.z,.5,.85,.6,['#446c61','#f8e3b8','#de714c','#719695'][wrap(k+j,4)],r);geo.sphere(q.x,2.25+j*.65,q.z,.26,.29,.26,'#c68c61',6,4);}}
      const roof=track.at(65,side*27);geo.box(roof.x,6.3,roof.z,9,.3,27,'#e4774e',r);for(const o of [-13,13]){const q=track.at(65+o,side*30);geo.box(q.x,3,q.z,.23,6,.23,'#556d5b');}
    }
    for(let i=0;i<20;i++){const s=START+12+i*8,p=track.at(s,-ROAD-4.5);geo.box(p.x,3.4,p.z,.16,6.8,.16,'#5a705d');const flag=new G();flag.quad([0,6.7,0],[0,4.1,0],[1.2,3.6,.15],[1.5,6.7,.15],i%2?'#f6e6b8':'#ee794e');geo.add(flag,model(p.x,0,p.z,p.h));}
    for(const [s,text,col] of [[146,'FIND YOUR FLOW.','#2e5649'],[270,'STAY SIDEWAYS.','#e47c50'],[402,'CHASE THE APEX.','#2e5649'],[548,'DRIFT. CHARGE. BOOST.','#e47c50'],[677,'ONE MORE CORNER.','#2e5649']]){const p=track.at(s,-ROAD-6);geo.box(p.x,2.6,p.z,10,3,.3,col,p.h);for(const d of [-4,4])geo.box(p.x+Math.cos(p.h)*d,1.4,p.z-Math.sin(p.h)*d,.2,2.8,.2,'#52634f');label(text,p.x-Math.sin(p.h)*.18,2.7,p.z-Math.cos(p.h)*.18,9.8,2.8,p.h,col,'#fff0d0',68);}
    for(let i=0;i<26;i++){const s=95+i*25,curve=angle(track.at(s+12).h-track.at(s-12).h);if(Math.abs(curve)<.17)continue;const side=curve>0?-1:1,p=track.at(s,side*(ROAD+3.5)),r=p.h;geo.box(p.x,1.8,p.z,2.4,1.5,.2,'#344f43',r);geo.box(p.x,.8,p.z,.14,1.6,.14,'#637660');label(side<0?'‹ ‹':'› ›',p.x-Math.sin(r)*.12,1.8,p.z-Math.cos(r)*.12,2.3,1.4,r,'#344f43','#dcf487',155);}
    function rock(x,z,size,col){geo.sphere(x,size*.28-.1,z,size,size*.8,size*.85,col,6,4);}
    function cactus(x,z,size,r){const c=new G(),col='#59745a';c.cylinder(0,0,0,.38,.32,3.7,col,7);c.sphere(0,3.7,0,.32,.35,.32,col,7,4);c.box(-.65,1.8,0,1.3,.5,.5,col);c.cylinder(-1.2,1.65,0,.26,.23,1.25,col,7);c.sphere(-1.2,2.9,0,.23,.25,.23,col,7,4);c.box(.6,2.4,0,1.1,.43,.43,col);c.cylinder(1.1,2.2,0,.23,.2,1.15,col,7);c.sphere(1.1,3.35,0,.2,.23,.2,col,7,4);geo.disk(x+1.5*size,.01,z+size,size*1.3,size*.6,'#c5a373',10,.8);geo.add(c,model(x,0,z,r,size));}
    function palm(x,z,size,r){const c=new G();for(let i=0;i<7;i++)c.cylinder(i*.07,i*.85,0,.27-i*.018,.25-i*.018,.87,i%2?'#987956':'#ae8961',7);const top=[.49,6,0];for(let k=0;k<7;k++){const a=k/7*TAU,dx=Math.cos(a),dz=Math.sin(a),right=[-dz,0,dx],mid=[top[0]+dx*1.7,6.75,dz*1.7],tip=[top[0]+dx*3.6,5.65,dz*3.6];c.tri(top,[mid[0]+right[0]*.62,mid[1],mid[2]+right[2]*.62],tip,k%2?'#547c61':'#739368');c.tri(top,tip,[mid[0]-right[0]*.62,mid[1]+.15,mid[2]-right[2]*.62],k%2?'#618768':'#849b6b');}geo.disk(x+2.7*size,.01,z+size,3.5*size,.9*size,'#c6a576',9,.7);geo.add(c,model(x,0,z,r,size));}
    for(let i=0;i<370;i++){const x=range(-200,205),z=range(-213,183),near=track.nearest(x,z);if(near.d<ROAD+5||Math.hypot(x+64,z+65)<34)continue;if(i%5===0&&near.d<53)palm(x,z,range(.9,1.65),range(0,TAU));else if(i%3===0)cactus(x,z,range(.65,1.55),range(0,TAU));else rock(x,z,range(.45,2.7),['#ca9766','#dda976','#d0a070'][i%3]);}
    // Ochre mesas around the skyline, each built from irregular layered sandstone.
    for(let i=0;i<32;i++){const a=i/32*TAU,dist=range(260,430),x=Math.cos(a)*dist,z=Math.sin(a)*dist,h=range(28,83),w=range(22,58),r=range(0,TAU);geo.cylinder(x,-2,z,w*1.25,w,h*.5,'#c48c69',6,r);geo.cylinder(x,h*.5-2,z,w,w*.73,h*.35,'#ce9874',6,r);geo.cylinder(x,h*.85-2,z,w*.73,w*.65,h*.15,'#e2af81',6,r);}
    for(const [x,z,w,h] of [[-126,48,15,22],[136,82,20,33],[39,143,16,20],[-115,-138,18,27]]){geo.cylinder(x,0,z,w,w*.6,h*.7,'#c68f63',5,.5);geo.cylinder(x,h*.7,z,w*.6,w*.48,h*.3,'#deb182',5,.5);}
    // A little oasis and a hot-air balloon beyond the circuit.
    geo.disk(46,.015,55,16,11,'#a7b89b',48,.2);geo.disk(46,.025,55,14,9,'#71a9a0',48,.2);geo.disk(45,.03,55,10,6,'#82b9aa',40,.2);
    for(const [x,z] of [[29,59],[39,68],[57,63],[62,52]])palm(x,z,1.25,range(0,TAU));
    const bx=142,bz=-28;geo.sphere(bx,50,bz,8,11,8,'#df845d',12,9);for(let k=0;k<6;k++){const a=k/6*TAU;geo.sphere(bx+Math.cos(a)*6.2,50,bz+Math.sin(a)*6.2,2.1,9,2.1,k%2?'#f6d39d':'#e99865',6,6);}geo.cylinder(bx,38,bz,1.7,3.4,4,'#e5b781',10);geo.box(bx,34,bz,3,2.3,3,'#805f49');for(const o of [-1.3,1.3])geo.box(bx+o,36,bz,.08,3.8,.08,'#6d6650');
    return renderer.mesh(geo);
  }
  const world=buildWorld();
  function buildKart(paint){
    const g=new G();
    g.box(0,.52,-.15,1.7,.28,2.7,'#273e39');g.box(0,.77,.12,1.75,.38,2.35,paint);g.box(0,.8,1.23,1.85,.26,.6,paint);g.box(0,.91,1.33,.41,.05,.65,'#fff1c9');
    g.box(0,.64,1.63,2.15,.2,.18,'#344841');g.box(0,.6,-1.52,2.1,.24,.17,'#344841');
    for(const side of [-1,1]){g.box(side*.94,.73,-.05,.32,.5,1.45,paint);g.box(side*.94,.99,-.1,.34,.09,1.2,'#fff0cc');g.box(side*.62,1.05,-1.15,.12,.68,.13,'#2d413b');}
    g.box(0,1.43,-1.23,2.15,.15,.55,paint);g.box(0,1.53,-1.23,.38,.03,.55,'#fff0ce');g.box(0,1.02,-.3,.87,.57,.72,'#364b43');g.box(0,1.45,-.65,.83,.7,.17,'#2f423a');
    g.sphere(0,1.42,-.3,.4,.49,.36,'#eee4ca',8,5);g.sphere(0,2.02,-.12,.48,.49,.45,'#fff2ce',12,8);g.box(0,2.02,.275,.71,.24,.13,'#294b49');g.box(0,2.27,.05,.2,.08,.72,paint);g.box(0,1.78,.35,.77,.15,.3,'#eae4c8');
    for(const side of [-1,1]){g.sphere(side*.39,1.5,.32,.14,.15,.2,'#344a3e',6,4);g.box(side*.56,.67,-1.55,.2,.2,.3,'#71847b');g.box(side*.64,.83,1.54,.25,.13,.08,'#faf3c7');}
    return renderer.mesh(g);
  }
  const tireGeo=new G();tireGeo.cylinder(0,-.18,0,.39,.39,.36,'#263731',12); // Rotated into the X axis below.
  const tireSide=new G();tireSide.cylinder(0,-.188,0,.22,.22,.376,'#c1c8b3',10);tireSide.cylinder(0,-.195,0,.09,.09,.39,'#667d6d',8);
  function rotateWheelGeo(g){const out=new G();for(let i=0;i<g.data.length;i+=9){const d=g.data;out.data.push(d[i+1],-d[i],d[i+2],d[i+4],-d[i+3],d[i+5],...d.slice(i+6,i+9));}return out;}
  const wheels=renderer.mesh(rotateWheelGeo(tireGeo)),hubs=renderer.mesh(rotateWheelGeo(tireSide));
  const kartMeshes=['#f2774c','#69adac','#d5db77','#b89cbd'].map(buildKart);
  const shadow=renderer.mesh(new G().disk(0,0,0,1.6,2,'#293a32',24));
  const particleMesh=renderer.mesh(new G(),true),markMesh=renderer.mesh(new G(),true);
  const flameMesh=renderer.mesh(new G().sphere(0,0,0,.23,.23,1,'#d7f38a',7,5));
  const boostCore=renderer.mesh(new G().sphere(0,0,0,.12,.12,.72,'#fff6d8',6,4));
  const keys=new Set(),particles=[],marks=[];
  let state='menu',pausedFrom='racing',time=0,raceTime=0,lapStart=0,lapTimes=[],count=3.7,lastCount=-1,driftBank=0,driftWas=false,driftMessageTime=0,notifyTimer=0,boostNotice=0,skidTimer=0,particleTimer=0,uiTimer=0,wrongTime=0,finishRank=0;
  let muted=false,savedBest=Infinity,allBestLap=Infinity;
  try{const record=JSON.parse(localStorage.getItem('dune-drift-records-v1')||'{}');if(record.race>0)savedBest=record.race;if(record.lap>0)allBestLap=record.lap;}catch{}
  if(Number.isFinite(savedBest))$('menu-best').textContent='PERSONAL BEST  /  '+formatTime(savedBest);
  const player={x:0,z:0,h:0,vx:0,vz:0,speed:0,steer:0,boost:0,boosting:false,drifting:false,progress:-18,s:START-18,lastS:START-18,safeS:START-18,lap:1,slip:0,offroad:false,miniBoost:0,collision:0};
  const rivals=[{name:'MILO',color:'#70b8b7',mesh:1,lane:-2.6,pace:30.5},{name:'NOVA',color:'#c5cc69',mesh:2,lane:2.6,pace:31.5},{name:'RIO',color:'#b69aba',mesh:3,lane:-2.4,pace:32.5}];
  let camera={x:0,y:7,z:0,targetX:0,targetY:1,targetZ:0,h:0,fov:Math.PI/3.3},attractS=START-25;
  const touch=matchMedia('(pointer:coarse)').matches;
  document.body.classList.toggle('touch-device',touch);

  class AudioSystem{
    init(){if(this.ctx){this.ctx.resume().catch(()=>{});return;}try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=this.ctx=new C();this.master=c.createGain();this.master.gain.value=muted?0:.2;this.master.connect(c.destination);this.engine=c.createOscillator();this.engine.type='sawtooth';this.engineGain=c.createGain();this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=330;this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engineGain.gain.value=0;this.engine.start();const buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;this.noise=c.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;this.noiseFilter=c.createBiquadFilter();this.noiseFilter.type='bandpass';this.noiseFilter.frequency.value=1100;this.noiseGain=c.createGain();this.noiseGain.gain.value=0;this.noise.connect(this.noiseFilter);this.noiseFilter.connect(this.noiseGain);this.noiseGain.connect(this.master);this.noise.start();}catch(e){console.warn('Audio unavailable',e);}}
    tone(f,d=.12,type='sine',volume=.35){if(!this.ctx||muted)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,c.currentTime);o.connect(g);g.connect(this.master);g.gain.setValueAtTime(volume,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);o.start();o.stop(c.currentTime+d);}
    update(){if(!this.ctx)return;const t=this.ctx.currentTime,active=state==='racing';this.master.gain.setTargetAtTime(muted?0:.2,t,.08);this.engineGain.gain.setTargetAtTime(active?.17+Math.abs(player.speed)*.002:0,t,.1);this.engine.frequency.setTargetAtTime(48+Math.abs(player.speed)*2.3+(player.boosting?30:0),t,.06);this.filter.frequency.setTargetAtTime(220+Math.abs(player.speed)*9,t,.08);this.noiseGain.gain.setTargetAtTime(active?(player.drifting?.12:player.boosting?.14:player.offroad?.06:0):0,t,.08);this.noiseFilter.frequency.setTargetAtTime(player.drifting?1600:550,t,.08);}
  }
  const audio=new AudioSystem();
  function notification(text,duration=2){$('notification').textContent=text;$('notification').classList.add('show');notifyTimer=duration;}
  function setKartAt(kart,s,lane=0){const p=track.at(s,lane);Object.assign(kart,{x:p.x,z:p.z,h:p.h,s:wrap(s,track.length)});}
  function initializeRace(){
    Object.assign(player,{vx:0,vz:0,speed:0,steer:0,boost:0,boosting:false,drifting:false,progress:-18,lastS:START-18,safeS:START-18,lap:1,slip:0,offroad:false,miniBoost:0,collision:0});setKartAt(player,START-18,2.3);
    rivals.forEach((r,i)=>{r.progress=-13+i*5;r.speed=0;r.finished=false;setKartAt(r,START+r.progress,r.lane);});
    raceTime=0;lapStart=0;lapTimes=[];count=3.7;lastCount=-1;driftBank=0;driftWas=false;driftMessageTime=0;wrongTime=0;finishRank=0;keys.clear();particles.length=0;marks.length=0;
    camera.h=player.h;camera.x=player.x-Math.sin(player.h)*12;camera.z=player.z-Math.cos(player.h)*12;camera.y=7;camera.targetX=player.x;camera.targetZ=player.z+Math.cos(player.h)*7;
    state='countdown';$('menu').classList.add('hidden');$('pause').classList.add('hidden');$('finish').classList.add('hidden');$('hud').classList.remove('hidden');$('pause-button').classList.remove('hidden');$('countdown').classList.remove('hidden');$('notification').classList.remove('show');$('drift-message').classList.remove('visible');$('wrong-way').classList.add('hidden');$('driving-tip').style.opacity='1';if(touch){$('touch-controls').classList.remove('hidden');$('touch-controls').style.display='flex';}audio.init();updateHUD();
  }
  function menu(){state='menu';keys.clear();$('menu').classList.remove('hidden');for(const id of ['pause','finish','hud','countdown','pause-button','touch-controls'])$(id).classList.add('hidden');document.body.classList.remove('boosting','drifting');$('notification').classList.remove('show');particles.length=0;attractS=START-25;}
  function pause(){if(state==='paused'){state=pausedFrom;$('pause').classList.add('hidden');if(state==='countdown')$('countdown').classList.remove('hidden');audio.init();}else if(state==='racing'||state==='countdown'){pausedFrom=state;state='paused';keys.clear();$('pause').classList.remove('hidden');$('countdown').classList.add('hidden');document.body.classList.remove('boosting');}audio.update();}
  function resetKart(){if(state!=='racing')return;setKartAt(player,player.safeS,0);player.lastS=player.safeS;player.vx=player.vz=0;player.speed=0;player.drifting=false;player.boosting=false;player.miniBoost=0;player.collision=1;driftBank=0;driftWas=false;camera.h=player.h;notification('다시 트랙으로. 다음 코너를 노려보세요.',1.7);}
  function toggleSound(){muted=!muted;$('sound').classList.toggle('muted',muted);$('sound').setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');audio.init();audio.update();}
  function endRace(){
    state='finished';keys.clear();finishRank=getRanking().findIndex(r=>r.player)+1;player.boosting=false;player.drifting=false;document.body.classList.remove('boosting','drifting');$('drift-message').classList.remove('visible');$('touch-controls').classList.add('hidden');$('pause-button').classList.add('hidden');$('finish-position').textContent=finishRank;$('finish-suffix').textContent=['ST','ND','RD','TH'][finishRank-1];$('finish-title').textContent=finishRank===1?'DUST. SETTLED.':'WHAT A RIDE.';$('finish-copy').textContent=finishRank===1?'선셋 서킷의 가장 빠른 드라이버. 우승입니다!':'더 깊은 드리프트, 더 빠른 다음 레이스.';$('finish-time').textContent=formatTime(raceTime);$('finish-best').textContent=formatTime(Math.min(...lapTimes));$('lap-results').innerHTML=lapTimes.map((t,i)=>`<div>LAP 0${i+1}<b>${formatTime(t)}</b></div>`).join('');const record=raceTime<savedBest;$('new-record').classList.toggle('hidden',!record);savedBest=Math.min(savedBest,raceTime);allBestLap=Math.min(allBestLap,...lapTimes);try{localStorage.setItem('dune-drift-records-v1',JSON.stringify({race:savedBest,lap:allBestLap}));}catch{}$('menu-best').textContent='PERSONAL BEST  /  '+formatTime(savedBest);$('finish').classList.remove('hidden');audio.tone(523,.4);setTimeout(()=>audio.tone(659,.4),170);setTimeout(()=>audio.tone(784,.7),340);
  }
  $('start').addEventListener('click',initializeRace);$('resume').addEventListener('click',pause);$('pause-button').addEventListener('click',pause);$('restart').addEventListener('click',initializeRace);$('race-again').addEventListener('click',initializeRace);$('back-menu').addEventListener('click',menu);$('finish-menu').addEventListener('click',menu);$('sound').addEventListener('click',toggleSound);$('brand').addEventListener('click',e=>{e.preventDefault();if(state==='racing'||state==='countdown')pause();else if(state==='finished')menu();});
  const gameKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyR','Escape','KeyP','KeyM'];
  window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;if(gameKeys.includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Escape'||e.code==='KeyP'){pause();return;}if(e.code==='KeyM'){toggleSound();return;}if(e.code==='KeyR'){resetKart();return;}if(e.code==='Enter'&&(state==='menu'||state==='finished')){initializeRace();return;}if(state==='racing'||state==='countdown')keys.add(e.code);});
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();if(state==='racing'||state==='countdown')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state==='racing'||state==='countdown'))pause();});
  for(const button of document.querySelectorAll('[data-key]')){button.addEventListener('pointerdown',e=>{e.preventDefault();if(state!=='racing'&&state!=='countdown')return;button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);button.classList.add('pressed');});const release=()=>{keys.delete(button.dataset.key);button.classList.remove('pressed');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);}
  const down=(...codes)=>codes.some(c=>keys.has(c));
  function spawnParticle(x,y,z,vx,vy,vz,life,size,col){if(particles.length>200)particles.shift();particles.push({x,y,z,vx,vy,vz,life,max:life,size,col});}
  function updatePlayer(dt){
    const throttle=down('KeyW','ArrowUp'),brake=down('KeyS','ArrowDown'),steer=(down('KeyA','ArrowLeft')?1:0)-(down('KeyD','ArrowRight')?1:0);
    const near=track.nearest(player.x,player.z);player.offroad=near.d>ROAD+.65;player.steer=lerp(player.steer,steer,1-Math.exp(-dt*9));
    player.drifting=down('Space')&&Math.abs(player.speed)>10&&Math.abs(player.steer)>.15&&!player.offroad;
    const boostInput=down('ShiftLeft','ShiftRight');player.boosting=boostInput&&player.boost>(player.boosting?0:5)&&throttle&&!player.offroad&&!player.drifting;
    if(boostInput&&player.boost<5&&boostNotice<=0){notification('SPACE + 방향키로 드리프트해 부스터를 채우세요.',2);boostNotice=5;}
    const boosting=player.boosting||player.miniBoost>0,maxSpeed=player.offroad?18:boosting?64:43;
    let acceleration=throttle?25:-(4+Math.abs(player.speed)*.055)*Math.sign(player.speed);
    if(throttle&&player.speed<0)acceleration=38;
    if(brake)acceleration=player.speed>1?-40:-12;
    if(boosting&&throttle)acceleration+=20;
    if(player.drifting)acceleration-=3.3;
    player.speed+=acceleration*dt;
    if(!throttle&&!brake&&Math.abs(player.speed)<.16)player.speed=0;
    if(player.speed>maxSpeed)player.speed=Math.max(maxSpeed,player.speed-dt*(player.offroad?32:16));player.speed=clamp(player.speed,-9,70);
    const speedFactor=clamp(Math.abs(player.speed)/18,0,1),yawRate=(player.drifting?1.68:1.08)*speedFactor*(player.speed<0?-1:1);
    player.h+=player.steer*yawRate*dt;
    const grip=player.offroad?3.5:player.drifting?2.45:10,gripStep=1-Math.exp(-grip*dt);
    player.vx=lerp(player.vx,Math.sin(player.h)*player.speed,gripStep);player.vz=lerp(player.vz,Math.cos(player.h)*player.speed,gripStep);
    player.x+=player.vx*dt;player.z+=player.vz*dt;player.slip=angle(player.h-Math.atan2(player.vx,player.vz));
    if(player.boosting)player.boost=Math.max(0,player.boost-32*dt);
    if(!driftWas&&player.drifting)driftBank=0;
    if(player.drifting){const gain=dt*(13+clamp(Math.abs(player.slip),0,.7)*25)*clamp(player.speed/26,.45,1.3);const added=Math.min(100-player.boost,gain);player.boost+=added;driftBank+=added;driftMessageTime=.7;}
    if(driftWas&&!player.drifting){if(driftBank>=8){$('drift-title').textContent=driftBank>35?'SUPER DRIFT!':'NICE DRIFT!';$('drift-sub').textContent=driftBank>18?'MINI TURBO + BOOST CHARGED':'BOOST CHARGED';$('drift-gain').textContent='+'+Math.round(driftBank);driftMessageTime=1.15;if(driftBank>18)player.miniBoost=.65;audio.tone(driftBank>35?880:660,.16);}else driftMessageTime=0;}
    driftWas=player.drifting;
    if(player.drifting){$('drift-title').textContent=player.boost>=99?'BOOST FULL':'DRIFTING';$('drift-gain').textContent='+'+Math.round(driftBank);$('drift-sub').textContent=player.boost>=99?'RELEASE · SHIFT TO BOOST':'KEEP IT SIDEWAYS';}
    player.miniBoost=Math.max(0,player.miniBoost-dt);player.collision=Math.max(0,player.collision-dt);
    const after=track.nearest(player.x,player.z);let delta=after.s-player.lastS;if(delta>track.length/2)delta-=track.length;if(delta<-track.length/2)delta+=track.length;
    if(Math.abs(delta)<Math.max(6,Math.abs(player.speed)*dt*3)&&after.d<ROAD+6){player.progress+=delta;player.safeS=after.s;}
    player.lastS=after.s;player.s=after.s;
    if(after.d>30){resetKart();return;}
    if(angle(player.h-after.h)>Math.PI*.6||angle(player.h-after.h)<-Math.PI*.6)wrongTime+=dt;else wrongTime=Math.max(0,wrongTime-dt*2);$('wrong-way').classList.toggle('hidden',wrongTime<1.5||Math.abs(player.speed)<5);
    const newLap=Math.floor(Math.max(0,player.progress)/track.length)+1;
    if(newLap>player.lap){lapTimes.push(raceTime-lapStart);lapStart=raceTime;player.lap=newLap;if(newLap>LAPS){endRace();return;}notification(newLap===LAPS?'FINAL LAP — 마지막 한 바퀴!':'LAP 02 — '+formatTime(lapTimes[lapTimes.length-1]),2.4);audio.tone(784,.25);}
    for(const r of rivals){const dx=player.x-r.x,dz=player.z-r.z,d=Math.hypot(dx,dz);if(d<2&&player.collision<=0){const n=d||1;player.x+=dx/n*.45;player.z+=dz/n*.45;player.speed*=.78;player.collision=.5;audio.tone(75,.07,'triangle',.4);}}
    skidTimer+=dt;particleTimer+=dt;
    if((player.drifting||brake&&player.speed>18)&&skidTimer>.035){skidTimer=0;for(const side of [-1,1]){const x=player.x+Math.cos(player.h)*side*.94-Math.sin(player.h)*.95,z=player.z-Math.sin(player.h)*side*.94-Math.cos(player.h)*.95;marks.push({x,z,h:Math.atan2(player.vx,player.vz),life:14});}if(marks.length>700)marks.splice(0,marks.length-700);}
    if(particleTimer>.035&&Math.abs(player.speed)>5){particleTimer=0;for(const side of [-1,1]){const x=player.x+Math.cos(player.h)*side,z=player.z-Math.sin(player.h)*side;const backX=x-Math.sin(player.h)*1.1,backZ=z-Math.cos(player.h)*1.1;if(player.drifting){spawnParticle(backX,.38,backZ,range(-2,2)-player.vx*.1,range(.3,1),range(-2,2)-player.vz*.1,range(.45,.8),range(.25,.45),'#e7dac1');spawnParticle(backX,.3,backZ,range(-3,3)-player.vx*.18,range(.8,2.5),range(-3,3)-player.vz*.18,.25,.07,driftBank>30?'#d8f58f':'#a6e5d7');}else if(player.offroad)spawnParticle(backX,.4,backZ,range(-2,2)-player.vx*.13,range(.3,1.5),range(-2,2)-player.vz*.13,.8,range(.35,.6),'#d6b27c');}}
  }
  function updateRivals(dt){for(let i=0;i<rivals.length;i++){const r=rivals[i],ahead=START+r.progress+14,curve=Math.abs(angle(track.at(ahead+10).h-track.at(ahead-10).h)),target=r.pace-clamp(curve*9,0,9)+Math.sin(time*.24+i)*1.2;r.speed=lerp(r.speed,target,1-Math.exp(-dt*.9));r.progress+=r.speed*dt;const lane=r.lane+Math.sin(time*.5+i*2)*.6;setKartAt(r,START+r.progress,lane);r.finished=r.progress>=track.length*LAPS;}}
  function getRanking(){return [{name:'YOU',color:'#ee774b',progress:player.progress,player:true},...rivals].sort((a,b)=>b.progress-a.progress);}
  function mapDraw(canvas,preview=false){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=preview?17:14;ctx.clearRect(0,0,w,h);const minX=-86,maxX=112,minZ=-145,maxZ=111,scale=Math.min((w-pad*2)/(maxX-minX),(h-pad*2)/(maxZ-minZ)),ox=(w-(maxX-minX)*scale)/2,oy=(h-(maxZ-minZ)*scale)/2;const xy=p=>[ox+(p.x-minX)*scale,oy+(maxZ-p.z)*scale];ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<track.samples.length;i+=5){const [x,y]=xy(track.samples[i]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle=preview?'#d8d9c3':'#d1d6c0';ctx.lineWidth=preview?10:9;ctx.stroke();ctx.strokeStyle=preview?'#788873':'#7e8c76';ctx.lineWidth=preview?3:2.5;ctx.stroke();const start=track.at(START),[sx,sy]=xy(start);ctx.fillStyle='#ed744c';ctx.fillRect(sx-4,sy-2,8,4);
    if(preview){ctx.font='700 8px Arial';ctx.fillStyle='#9a9d88';ctx.textAlign='center';ctx.fillText('START / FINISH',sx+25,sy+13);return;}
    for(const r of rivals){const [x,y]=xy(r);ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fillStyle=r.color;ctx.fill();ctx.strokeStyle='#f7f0d8';ctx.lineWidth=1.5;ctx.stroke();}const [x,y]=xy(player);ctx.save();ctx.translate(x,y);ctx.rotate(player.h);ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4.5,4);ctx.lineTo(0,2.5);ctx.lineTo(-4.5,4);ctx.closePath();ctx.fillStyle='#ef6e44';ctx.fill();ctx.strokeStyle='#fff7dc';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
  }
  mapDraw($('preview-map'),true);
  const tickElements=[...document.querySelectorAll('.speed-ticks i')];
  function updateHUD(){
    const ranking=getRanking();$('position').textContent=ranking.findIndex(r=>r.player)+1;$('lap').textContent=String(Math.min(LAPS,player.lap)).padStart(2,'0');$('time').textContent=formatTime(raceTime);$('best-lap').textContent=formatTime(lapTimes.length?Math.min(...lapTimes):allBestLap);const speed=Math.round(Math.hypot(player.vx,player.vz)*3.6);$('speed').textContent=String(speed).padStart(3,'0');$('boost-value').textContent=Math.round(player.boost)+'%';$('boost-fill').style.width=player.boost+'%';$('boost-status').textContent=player.boosting?'BOOSTING!':player.boost>=99?'FULL CHARGE':player.boost>=5?'READY':'DRIFT TO CHARGE';$('boost-help-text').textContent=player.boosting?'부스터 작동 중':player.boost>=5?'길게 눌러 부스터 사용':'드리프트로 부스터 충전';document.body.classList.toggle('boosting',player.boosting||player.miniBoost>0);document.body.classList.toggle('drifting',player.drifting);tickElements.forEach((el,i)=>el.classList.toggle('active',speed>i*19));$('leaderboard').innerHTML=ranking.map((r,i)=>`<div class="leader-row ${r.player?'you':''}"><span class="leader-rank">${i+1}</span><i class="leader-dot" style="background:${r.color}"></i><span class="leader-name">${r.name}</span><span class="leader-gap">${r.player?'YOU':Math.round((r.progress-player.progress)/3.6)*3.6>0?'+ '+Math.round((r.progress-player.progress))+'m':'− '+Math.round(player.progress-r.progress)+'m'}</span></div>`).join('');mapDraw($('minimap'));if(raceTime>13)$('driving-tip').style.opacity='0';
  }
  function drawKart(kart,index){const bob=state==='racing'?Math.sin(time*18+index)*clamp(Math.abs(kart.speed)/80,0,.035):0,baseY=.10+bob;renderer.draw(shadow,model(kart.x,.15,kart.z,kart.h,1),.25);renderer.draw(kartMeshes[index],model(kart.x,baseY,kart.z,kart.h));for(const side of [-1,1])for(const front of [-1,1]){const lx=side*1.02,lz=front*.96,x=kart.x+Math.cos(kart.h)*lx+Math.sin(kart.h)*lz,z=kart.z-Math.sin(kart.h)*lx+Math.cos(kart.h)*lz,steer=index===0?player.steer*(player.drifting?-.22:.27):0;const m=model(x,.44+baseY,z,kart.h+(front===1?steer:0));renderer.draw(wheels,m);renderer.draw(hubs,m);}
    if(index===0&&(player.boosting||player.miniBoost>0)){for(const side of [-1,1]){const lx=side*.56,lz=-2.25-lengthPulse(),x=kart.x+Math.cos(kart.h)*lx+Math.sin(kart.h)*lz,z=kart.z-Math.sin(kart.h)*lx+Math.cos(kart.h)*lz;renderer.draw(flameMesh,model(x,.78,z,kart.h,1,1,1+lengthPulse()),.85,1);renderer.draw(boostCore,model(x,.78,z,kart.h),1,1);}}
  }
  const lengthPulse=()=>Math.sin(time*55)*.16;
  function drawEffects(dt){const pg=new G();for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(state==='racing'){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=dt*.8;}if(p.life<=0){particles.splice(i,1);continue;}const size=p.size*(.5+p.life/p.max*.5);pg.sphere(p.x,p.y,p.z,size,size,size,p.col,5,3);}renderer.updateMesh(particleMesh,pg);gl.depthMask(false);renderer.draw(particleMesh,model(),.6);gl.depthMask(true);}
  function drawMarks(dt){const mg=new G();for(let i=marks.length-1;i>=0;i--){const m=marks[i];if(state==='racing')m.life-=dt;if(m.life<=0){marks.splice(i,1);continue;}const p=[Math.cos(m.h)*.13,-Math.sin(m.h)*.13],q=[Math.sin(m.h)*.67,Math.cos(m.h)*.67];mg.quad([m.x-p[0]-q[0],.151,m.z-p[1]-q[1]],[m.x+p[0]-q[0],.151,m.z+p[1]-q[1]],[m.x+p[0]+q[0],.151,m.z+p[1]+q[1]],[m.x-p[0]+q[0],.151,m.z-p[1]+q[1]],'#3b4c43',[0,1,0]);}renderer.updateMesh(markMesh,mg);renderer.draw(markMesh,model(),.36);}
  function updateCamera(dt){
    const menuMode=state==='menu',targetH=menuMode?player.h:Math.abs(player.speed)>4?Math.atan2(player.vx,player.vz):player.h;
    camera.h+=angle(targetH-camera.h)*(1-Math.exp(-dt*(menuMode?3:4.2)));
    const boosting=player.boosting||player.miniBoost>0,distance=menuMode?13.5:11.7+clamp(player.speed/43,0,1)*1.4,side=menuMode?5.6:0,backX=Math.sin(camera.h),backZ=Math.cos(camera.h),leftX=Math.cos(camera.h),leftZ=-Math.sin(camera.h);
    const desiredX=player.x-backX*distance+leftX*side,desiredZ=player.z-backZ*distance+leftZ*side,desiredY=menuMode?7.2:6.8;
    const ease=1-Math.exp(-dt*7);camera.x=lerp(camera.x,desiredX,ease);camera.z=lerp(camera.z,desiredZ,ease);camera.y=lerp(camera.y,desiredY,ease);camera.targetX=lerp(camera.targetX,player.x+backX*7+leftX*side,ease);camera.targetZ=lerp(camera.targetZ,player.z+backZ*7+leftZ*side,ease);camera.targetY=1.3;camera.fov=lerp(camera.fov,(boosting?70:59)*Math.PI/180,1-Math.exp(-dt*3));const shake=boosting?Math.sin(time*74)*.035:player.offroad&&player.speed>7?Math.sin(time*60)*.025:0;renderer.begin([camera.x,camera.y+shake,camera.z],[camera.targetX,camera.targetY,camera.targetZ],camera.fov);
  }
  function step(dt){
    time+=dt;
    if(state==='menu'){attractS+=dt*10;setKartAt(player,attractS,1.8);player.speed=10;player.boosting=false;player.drifting=false;player.miniBoost=0;player.steer=0;player.offroad=false;rivals.forEach((r,i)=>{setKartAt(r,attractS+14+i*15,r.lane);r.speed=10;});}
    if(state==='countdown'){count-=dt;const number=Math.ceil(count);if(number!==lastCount&&number<=3&&number>0){lastCount=number;audio.tone(430,.15,'sine');}$('count-number').textContent=number>3?'':Math.max(1,number);document.querySelectorAll('.count-lights i').forEach((el,i)=>el.classList.toggle('on',3-number>=i));document.querySelector('.count-lights').classList.remove('go');if(count<=0){state='racing';$('count-number').textContent='GO!';document.querySelector('.count-lights').classList.add('go');audio.tone(860,.45);}}
    if(state==='racing'){raceTime+=dt;if(raceTime>.85)$('countdown').classList.add('hidden');updateRivals(dt);updatePlayer(dt);driftMessageTime=Math.max(0,driftMessageTime-dt);$('drift-message').classList.toggle('visible',driftMessageTime>0);notifyTimer-=dt;boostNotice-=dt;if(notifyTimer<=0)$('notification').classList.remove('show');}
    if(state==='finished')player.speed=0;
    audio.update();uiTimer+=dt;if(uiTimer>.07&&(state==='racing'||state==='countdown')){updateHUD();uiTimer=0;}
    updateCamera(dt);renderer.draw(world);drawMarks(dt);const sorted=[{kart:player,index:0},...rivals.map((r,i)=>({kart:r,index:i+1}))].sort((a,b)=>Math.hypot(b.kart.x-camera.x,b.kart.z-camera.z)-Math.hypot(a.kart.x-camera.x,a.kart.z-camera.z));for(const item of sorted)drawKart(item.kart,item.index);renderer.labels(labels);drawEffects(dt);
  }
  setKartAt(player,attractS,1.8);camera.x=player.x-Math.sin(player.h)*14+Math.cos(player.h)*5.6;camera.z=player.z-Math.cos(player.h)*14-Math.sin(player.h)*5.6;camera.targetX=player.x+Math.cos(player.h)*5.6;camera.targetZ=player.z+Math.cos(player.h)*7;camera.h=player.h;
  let last=performance.now();function frame(now){const dt=Math.min((now-last)/1000,.035);last=now;step(dt);requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.addEventListener('resize',()=>renderer.resize());
  $('game').addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='racing'||state==='countdown')pause();$('error-message').textContent='그래픽 연결이 잠시 끊겼습니다. 페이지를 새로고침하면 다시 달릴 수 있습니다.';$('error').classList.remove('hidden');});
  // Read-only inspection surface for local QA. The game itself does not depend on it.
  window.DuneDrift=Object.freeze({get state(){return state;},get stats(){return {speed:player.speed,boost:player.boost,drifting:player.drifting,boosting:player.boosting,progress:player.progress,lap:player.lap,time:raceTime,offroad:player.offroad,x:player.x,z:player.z,heading:player.h,trackHeading:track.at(player.s).h,trackLength:track.length,rank:getRanking().findIndex(r=>r.player)+1,particles:particles.length};},get track(){return {length:track.length,at:s=>({...track.at(s)})};}});
})();
