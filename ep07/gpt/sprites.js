/* Original raster artwork for Riftwake. Each model is painted on its own pixel grid. */
(() => {
  'use strict';
  const bank = new Map();
  const unitTypes = new Set(['worker','soldier','heavy','specialist']);
  const rockTypes = new Set(['crystal','ore']);
  const ink = '#252537';
  const base = {
    velari: {left:'#ddcaa7',right:'#a292a0',top:'#fff0c6',joint:'#ad9da1',shadow:'#68657e',light:'#dac8ff',mid:'#9573cb',main:'#705394',deep:'#4d3c72',glow:'#f6f0ff',metal:'#f6d789'},
    cinder: {left:'#a88c80',right:'#6c626b',top:'#d5baa0',joint:'#7e6970',shadow:'#4e4d60',light:'#ffad75',mid:'#e37455',main:'#b14b45',deep:'#743840',glow:'#fff29b',metal:'#efb76e'},
    myren: {left:'#c2ae81',right:'#877d71',top:'#e9d6a4',joint:'#99846c',shadow:'#576365',light:'#a5e4c4',mid:'#6ec6a5',main:'#408773',deep:'#2f5e62',glow:'#dcfbb6',metal:'#e5cd84'}
  };
  function raster(w,h) {
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const c=canvas.getContext('2d');
    function rect(x,y,width,height,color) {
      c.fillStyle=color; c.fillRect(Math.round(x),Math.round(y),Math.round(width),Math.round(height));
    }
    function line(x,y,ex,ey,color) {
      x=Math.round(x); y=Math.round(y); ex=Math.round(ex); ey=Math.round(ey);
      const dx=Math.abs(ex-x), sx=x<ex?1:-1, dy=-Math.abs(ey-y), sy=y<ey?1:-1;
      let e=dx+dy;
      c.fillStyle=color;
      for(;;) {
        c.fillRect(x,y,1,1);
        if(x===ex && y===ey) break;
        const twice=e*2;
        if(twice>=dy){ e+=dy; x+=sx; }
        if(twice<=dx){ e+=dx; y+=sy; }
      }
    }
    // Scan-convert the faces so every edge lands on an opaque sprite pixel.
    function poly(points,color,stroke) {
      const ys=points.map(p=>p[1]);
      c.fillStyle=color;
      for(let y=Math.floor(Math.min(...ys));y<=Math.ceil(Math.max(...ys));y++) {
        const scan=y+0.5, xs=[];
        for(let i=0;i<points.length;i++){
          const [ax,ay]=points[i], [bx,by]=points[(i+1)%points.length];
          if((ay<=scan&&by>scan)||(by<=scan&&ay>scan)) xs.push(ax+(scan-ay)*(bx-ax)/(by-ay));
        }
        xs.sort((a,b)=>a-b);
        for(let j=0;j<xs.length;j+=2) {
          const l=Math.ceil(xs[j]-0.5),r=Math.ceil(xs[j+1]-0.5);
          if(r>l)c.fillRect(l,y,r-l,1);
        }
      }
      if(stroke)points.forEach(([x,y],i)=>line(x,y,...points[(i+1)%points.length],stroke));
    }
    function ellipse(x,y,rx,ry,color) {
      c.fillStyle=color;
      for(let j=-Math.floor(ry);j<=ry;j++){
        const edge=Math.round(rx*Math.sqrt(Math.max(0,1-j*j/(ry*ry))));
        c.fillRect(Math.round(x)-edge,Math.round(y)+j,2*edge+1,1);
      }
    }
    return {canvas,c,rect,line,poly,ellipse};
  }
  function gem(g,x,y,w,h,colors) {
    const [dark,shade,main,light,white]=colors;
    const shoulder=Math.round(h*.64), edge=Math.max(1,Math.round(w*.24));
    const p=[[x,y],[x-w,y-h*.32],[x-w+1,y-shoulder],[x+1,y-h],[x+w,y-shoulder+1],[x+w,y-h*.30]];
    g.poly(p,main,dark);
    g.poly([[x+1,y-h+1],[x-w+1,y-shoulder],[x-edge,y-shoulder+1],[x,y-1]],light);
    g.poly([[x-edge,y-shoulder+1],[x+1,y-h+1],[x+w-1,y-shoulder+1],[x+edge,y-shoulder+3],[x,y-1]],main);
    g.poly([[x+w-1,y-shoulder+1],[x+w-1,y-h*.3],[x,y-1],[x+edge,y-shoulder+3]],shade);
    g.line(x-w+1,y-shoulder+1,x+1,y-h+1,white);
  }
  const lilac=['#594e82','#8766c4','#bc90f0','#dfb9ff','#fff0ff'];
  const gold=['#65503f','#bd824b','#edb857','#ffdc7b','#fff3bd'];
  const green=['#345759','#4d9a8e','#83d6ac','#bbefbe','#efffd3'];
  function block(g,x,y,w,d,h,p,detail=true) {
    const a=[x-w,y-w*.48], b=[x,y], e=[x+d,y-d*.48], f=[x-w+d,y-(w+d)*.48];
    const top=pt=>[pt[0],pt[1]-h];
    g.poly([a,b,top(b),top(a)],p.left,ink);
    g.poly([b,e,top(e),top(b)],p.right,ink);
    g.poly([top(a),top(f),top(e),top(b)],p.top,ink);
    g.line(x-w+1,y-w*.48-h+1,x-1,y-h+1,p.top);
    if(!detail || h<5) return;
    for(let j=3;j<h-1;j+=4){
      for(let k=2+(j%3); k<w-2;k+=7) {
        const row=Math.round(y-k*.48-j);
        g.line(x-k-2,row-1,x-k,row,p.joint);
        if(j+2<h)g.rect(x-k,row-2,1,2,p.joint);
      }
      for(let k=2+(j%4);k<d-2;k+=7) {
        const row=Math.round(y-k*.48-j);
        g.line(x+k,row,x+k+2,row-1,p.shadow);
      }
    }
    g.line(x,y-h+1,x,y-1,p.joint);
  }
  function gate(g,x,y,w,h,p) {
    g.poly([[x-w,y-w*.36],[x-w,y-h+2],[x-1,y-h-1],[x+1,y-h],[x+2,y-h+3],[x+2,y+1]],p.top,ink);
    g.poly([[x-w+1,y-w*.36],[x-w+1,y-h+3],[x-1,y-h+1],[x,y-h+2],[x,y]],p.shadow);
    g.rect(x-w+2,y-h+4,1,h-5,ink);
    g.rect(x-1,y-h+3,1,h-3,ink);
  }
  function windowSlit(g,x,y,p,flame=false) {
    g.rect(x,y-3,2,4,ink);
    g.rect(x,y-2,1,2,flame?'#ffdc77':p.glow);
    g.rect(x-1,y+1,3,1,p.top);
  }
  function gable(g,x,y,w,d,h,p) {
    const a=[x-w,y-w*.48], b=[x,y], e=[x+d,y-d*.48], f=[x-w+d,y-(w+d)*.48];
    const m=[x-w*.52,y-w*.25-h], n=[m[0]+d,m[1]-d*.48];
    g.poly([a,f,n,m],p.light,ink);
    g.poly([m,n,e,b],p.mid,ink);
    g.poly([a,b,m],p.deep,ink);
    g.line(a[0]+1,a[1]-1,m[0],m[1]+1,p.light);
    g.line(m[0],m[1],n[0],n[1],p.light);
    for(let t=.23;t<.94;t+=.23){
      const sx=m[0]+(b[0]-m[0])*t, sy=m[1]+(b[1]-m[1])*t;
      g.line(sx,sy,sx+d,sy-d*.48,p.main);
      for(let j=2+Math.round(t*6)%3;j<d;j+=4)g.rect(sx+j,sy-j*.48-1,1,1,p.light);
    }
    g.line(b[0],b[1],e[0],e[1],p.deep);
    g.rect(m[0],m[1]+4,2,3,p.metal);
  }
  function flag(g,x,y,p,left=false) {
    g.rect(x,y-9,1,10,p.metal);
    const dx=left?-1:1;
    g.poly([[x+dx,y-9],[x+dx*5,y-8],[x+dx*7,y-8],[x+dx*5,y-6],[x+dx*2,y-6],[x+dx,y-5]],p.mid);
    g.line(x+dx,y-9,x+dx*4,y-8,p.light);
  }
  function spire(g,x,y,r,h,roof,p,adorn=false) {
    const top=y-h, a=x-r,b=x+r;
    g.poly([[a,y-2],[a,top],[x,top+2],[x,y+2]],p.left,ink);
    g.poly([[x,y+2],[x,top+2],[b,top],[b,y-2]],p.right,ink);
    g.line(a+1,top+2,a+1,y-2,p.top);
    if(h>10){ g.line(a+1,y-4,x,y-2,p.joint); g.line(x,y-2,b-1,y-4,p.shadow); }
    windowSlit(g,x-2,top+6,p);
    g.poly([[a-1,top],[x-1,top-roof],[x,top-roof-2],[b+1,top],[x,top+3]],p.main,ink);
    g.poly([[a,top-1],[x,top-roof],[x-1,top+1]],p.light);
    g.poly([[x,top-roof],[b,top],[x-1,top+2]],p.mid);
    g.line(x+1,top-roof+4,b,top,p.deep);
    for(let j=3;j<roof-2;j+=4){
      const rw=Math.round(r*(roof-j)/roof);
      g.line(x-rw,top-j,x,top-j+1,p.mid);
      g.line(x,top-j+1,x+rw-1,top-j,p.main);
    }
    g.rect(x,top-roof-3,1,4,p.metal);
    if(adorn)flag(g,x,top-roof-2,p);
  }
  function platform(g,x,y,w,d,p) {
    block(g,x,y,w+1,d+1,2,{...p,left:p.shadow,right:ink,top:p.joint},false);
    block(g,x,y-2,w,d,2,p,false);
  }
  function steps(g,x,y,w,p) {
    for(let j=0;j<3;j++)block(g,x-j,y+j,w,2,1,{...p,top:j===2?p.left:p.top},false);
  }
  function velari(g,type,p){
    if(type==='hq'){
      platform(g,37,69,31,30,p);
      spire(g,28,45,5,13,12,p,true);
      spire(g,53,44,5,12,11,p);
      block(g,38,60,17,18,21,p);
      gable(g,38,40,19,20,12,p);
      spire(g,43,39,7,11,13,p);
      gem(g,43,19,3,9,lilac);
      g.rect(43,9,1,2,'#fff2d3');
      spire(g,15,57,6,17,12,p,true);
      spire(g,61,53,5,14,12,p);
      block(g,36,65,12,14,12,p);
      gable(g,37,54,15,14,8,p);
      gate(g,32,62,6,9,p); steps(g,31,64,6,p);
      spire(g,46,62,5,10,8,p);
      windowSlit(g,40,57,p);
      g.poly([[22,43],[26,45],[26,51],[24,52],[22,49]],p.deep);
      g.line(23,44,23,48,p.mid);
      g.rect(24,46,1,2,p.metal);
    }else if(type==='barracks'){
      platform(g,39,68,19,20,p);
      block(g,39,64,17,17,13,p);
      gable(g,40,52,21,19,10,p);
      spire(g,53,55,4,12,8,p,true);
      gate(g,35,62,6,9,p); steps(g,33,64,5,p);
      windowSlit(g,44,58,p); windowSlit(g,50,55,p);
      g.poly([[23,47],[27,48],[27,55],[25,56],[23,53]],p.mid,ink);
    }else if(type==='depot'){
      platform(g,37,68,19,20,p);
      block(g,38,62,12,11,5,p);
      // Suspended weights sit at unequal heights on a tilted gilt beam.
      block(g,38,58,5,4,4,p,false);
      g.poly([[33,55],[35,49],[36,34],[39,32],[40,49],[43,53],[39,56]],p.main,ink);
      g.poly([[35,53],[37,35],[38,35],[38,52]],p.light);
      g.poly([[19,40],[34,35],[38,31],[41,33],[58,29],[56,33],[40,38],[36,38],[21,43]],p.metal,ink);
      g.line(22,40,55,31,p.top);
      gem(g,38,37,3,9,lilac);
      const pan=(x,y,baseY,load)=>{
        g.line(x,y,x-6,baseY,ink);g.line(x,y,x+6,baseY,p.shadow);
        g.line(x,y+2,x-5,baseY,p.metal);
        gem(g,x,baseY,3,7,load);
        g.poly([[x-7,baseY-1],[x+7,baseY-1],[x+4,baseY+3],[x,baseY+4],[x-4,baseY+3]],p.left,ink);
        g.line(x-6,baseY,x+5,baseY,p.metal);
      };
      pan(23,42,53,lilac);pan(54,33,46,gold);
      block(g,44,62,4,5,4,{...p,top:p.deep},false);
      g.line(42,57,46,55,p.top);g.rect(42,58,2,1,p.light);
      steps(g,34,64,6,p);
    }else if(type==='house'){
      platform(g,38,68,14,14,p);
      block(g,38,64,12,11,9,p);
      gable(g,39,56,16,14,9,p);
      block(g,44,48,2,2,6,p,false); gate(g,35,63,4,6,p); windowSlit(g,43,60,p);
    }else{
      platform(g,37,68,11,11,p);
      spire(g,37,64,8,19,10,p);
      gem(g,37,36,4,10,lilac);
      gate(g,35,64,3,6,p); steps(g,34,65,4,p);
    }
  }
  function stack(g,x,y,r,h,p) {
    block(g,x,y,r,r,h,{...p,left:p.joint,right:p.shadow,top:p.left},false);
    for(let j=4;j<h-2;j+=6) {
      g.line(x-r+1,y-r*.48-j,x,y-j,p.metal);
      g.line(x,y-j,x+r-1,y-r*.48-j,p.main);
    }
    block(g,x,y-h+2,r+1,r+1,3,p,false);
    g.poly([[x-r+1,y-h-1-r*.48],[x,y-h-1-r*.95],[x+r-1,y-h-1-r*.48],[x,y-h-2]],ink);
    g.rect(x-1,y-h-3,2,1,'#e08c53');
  }
  function furnace(g,x,y,w,h,p) {
    g.poly([[x-w,y-2],[x-w,y-h+2],[x-2,y-h-2],[x+2,y-h-1],[x+3,y-h+3],[x+3,y+1]],p.main,ink);
    g.poly([[x-w+2,y-3],[x-w+2,y-h+3],[x-2,y-h],[x+1,y-h+3],[x+1,y]],'#573c40');
    g.poly([[x-w+2,y-3],[x-w+3,y-6],[x-w+2,y-8],[x-3,y-6],[x-1,y-9],[x,y-3]],'#f39249');
    g.rect(x-4,y-5,3,3,'#ffe386');
    for(let j=x-w+2;j<x+2;j+=3)g.rect(j,y-h+3,1,h-3,'#533d46');
    g.line(x-w,y-2,x+1,y+1,p.metal);
  }
  function metalRoof(g,x,y,w,d,h,p) {
    const q={...p,left:p.mid,right:p.deep,top:p.main};
    block(g,x,y,w,d,h,q,false);
    block(g,x,y-h+1,w-2,d-2,2,{...q,top:p.mid,right:p.main},false);
    for(let j=3;j<w-3;j+=5){
      g.line(x-j,y-h-j*.48-1,x-j+d-3,y-h-(d+j-3)*.48-1,p.light);
      g.rect(x-j,y-j*.48-1,1,1,p.metal);
    }
  }
  function cinder(g,type,p){
    if(type==='hq'){
      platform(g,37,69,31,30,p);
      stack(g,22,45,4,22,p); stack(g,31,40,4,23,p);
      stack(g,48,38,5,18,p);
      block(g,37,59,20,19,15,p);
      metalRoof(g,37,45,23,21,5,p);
      block(g,39,40,12,13,9,p);
      metalRoof(g,39,33,14,14,4,p);
      stack(g,42,29,3,9,p);
      block(g,18,57,8,8,10,p); metalRoof(g,18,48,8,9,2,p);
      block(g,56,54,7,8,11,p); metalRoof(g,56,44,8,9,2,p);
      block(g,35,64,13,13,11,p);
      metalRoof(g,35,54,14,15,2,p);
      furnace(g,31,62,7,10,p); steps(g,30,64,6,p);
      for(let i=0;i<3;i++)windowSlit(g,39+i*3,59-i*1.5,p,true);
      g.poly([[26,35],[31,37],[31,42],[28,43],[26,40]],p.deep,ink);
      g.rect(28,37,1,3,p.glow);
    }else if(type==='barracks'){
      platform(g,38,68,19,21,p);
      stack(g,28,55,3,19,p); stack(g,47,48,3,12,p);
      block(g,38,64,17,18,12,p);
      metalRoof(g,38,53,20,20,4,p);
      furnace(g,34,61,6,8,p); steps(g,32,63,6,p);
      for(let i=0;i<3;i++)windowSlit(g,42+i*4,59-i*2,p,true);
    }else if(type==='depot'){
      platform(g,38,68,20,20,p);
      const iron={...p,left:p.main,right:p.deep,top:p.mid};
      block(g,29,61,5,5,7,iron);block(g,35,49,4,4,6,iron);
      g.poly([[25,54],[26,35],[31,33],[30,53]],p.main,ink);
      g.poly([[34,46],[35,30],[39,29],[38,45]],p.deep,ink);
      g.line(27,36,27,51,p.light);g.line(35,35,29,48,p.metal);
      // An open truss, toothed winch and hanging grab make an unloading crane.
      g.poly([[21,36],[53,28],[57,29],[56,33],[25,42],[21,41]],p.deep,ink);
      g.line(23,36,53,29,p.light);g.line(25,40,55,32,p.mid);
      for(let x=27;x<52;x+=7){
        const y=36-(x-22)*.25;
        g.line(x,y,x+3,y+2,p.metal);g.line(x+3,y+2,x+6,y-2,p.mid);
      }
      g.line(53,33,53,45,ink);g.line(54,33,54,43,p.joint);
      g.line(53,44,49,48,ink);g.line(53,44,56,47,ink);
      gem(g,53,51,3,5,gold);
      g.line(48,47,50,51,p.metal);g.line(57,47,55,51,p.metal);
      g.ellipse(27,48,5,5,ink);g.ellipse(27,48,4,4,p.shadow);
      g.ellipse(27,48,2,2,p.metal);g.rect(26,47,2,2,p.top);
      block(g,37,61,7,7,4,iron,false);
      gem(g,35,55,3,6,lilac);gem(g,39,55,2,5,lilac);
      g.line(31,56,37,59,p.metal);g.line(37,59,44,56,p.shadow);
      g.line(40,63,52,57,p.joint);g.line(42,64,54,58,p.metal);
    }else if(type==='house'){
      platform(g,38,68,15,14,p);
      block(g,38,64,12,12,9,p);
      metalRoof(g,38,56,15,14,3,p);
      stack(g,43,53,2,7,p);
      gate(g,35,63,4,6,p);windowSlit(g,43,60,p,true);
    }else{
      platform(g,37,68,12,11,p);
      block(g,37,64,7,7,17,p); block(g,37,49,10,10,4,p);
      metalRoof(g,37,46,9,9,4,p);
      stack(g,37,42,4,8,p);
      g.line(40,37,47,33,ink);g.line(40,38,47,34,p.metal);
      g.line(40,39,47,35,p.shadow);furnace(g,35,62,4,7,p);
    }
  }
  function trunk(g,x,y,w,h,p) {
    g.poly([[x-w-4,y],[x-w,y-5],[x-w+2,y-h*.48],[x-w,y-h+1],[x,y-h-2],[x+w-1,y-h],[x+w-1,y-h*.5],[x+w,y-5],[x+w+3,y-2],[x+3,y],[x,y-2],[x-2,y+2]],p.left,ink);
    g.poly([[x+1,y-h],[x+w-1,y-h],[x+w-1,y-h*.5],[x+w,y-5],[x+w+2,y-2],[x+2,y-1],[x,y-3],[x+2,y-h*.5]],p.right);
    g.line(x-w+2,y-2,x-1,y-h*.6,p.joint);g.line(x-w+3,y-4,x-2,y-h*.7,p.top);
    g.line(x+w+1,y-3,x+2,y-9,p.shadow);
  }
  function canopy(g,x,y,r,h,p){
    g.poly([[x-r,y],[x-r+2,y-h*.48],[x-r*.55,y-h*.78],[x-2,y-h],[x+2,y-h-1],[x+r*.55,y-h*.7],[x+r-2,y-h*.45],[x+r,y+1],[x+r*.60,y+4],[x+2,y+5],[x-r*.35,y+4],[x-r*.7,y+3]],p.main,ink);
    g.poly([[x-r+1,y],[x-r+3,y-h*.46],[x-r*.5,y-h*.72],[x-1,y-h+1],[x-3,y-h*.35],[x-r*.5,y+1]],p.mid);
    g.poly([[x-r+1,y],[x-r*.5,y+1],[x-2,y],[x+2,y+2],[x+r*.75,y],[x+r-1,y+1],[x+r*.6,y+3],[x+1,y+4],[x-r*.55,y+3]],p.deep);
    g.line(x-r+2,y-1,x-r*.52,y-h*.52,p.light);
    g.line(x-r*.45,y-h*.62,x-2,y-h+1,p.light);
    g.line(x+1,y-h+1,x+r*.70,y-1,p.mid);
    const marks=[[-.65,.24],[-.42,.42],[-.15,.66],[.22,.38],[.51,.26],[.12,.14]];
    for(const [dx,dy] of marks)g.rect(x+r*dx,y-h*dy,Math.max(1,Math.round(r*.14)),1,p.light);
    g.rect(x-1,y+4,2,1,p.glow);
  }
  function myren(g,type,p){
    if(type==='hq'){
      trunk(g,38,64,13,33,p);
      g.poly([[27,56],[24,45],[14,40],[11,33],[14,34],[18,39],[26,41],[29,38],[28,31],[32,37],[33,51]],p.left,ink);
      g.poly([[44,55],[45,41],[55,38],[62,29],[62,35],[59,41],[51,47],[48,57]],p.right,ink);
      canopy(g,18,40,13,12,p);canopy(g,56,41,12,12,p);
      canopy(g,40,34,22,20,p);
      gem(g,41,18,3,9,green);
      g.line(30,39,29,47,p.mid);g.rect(28,47,2,2,p.glow);
      g.line(48,38,49,45,p.main);g.rect(48,45,2,3,p.glow);
      canopy(g,32,49,14,9,p);
      gate(g,34,62,6,10,p);steps(g,33,64,5,p);
      trunk(g,52,60,3,10,p);canopy(g,53,51,8,6,p);
      for(const [x,y] of [[24,63],[19,60],[45,64],[55,61]]){g.line(x,y,x+2,y-3,p.main);g.rect(x,y-4,3,2,p.light);}
    }else if(type==='barracks'){
      trunk(g,37,64,9,20,p);trunk(g,50,57,4,13,p);
      canopy(g,50,46,9,7,p);canopy(g,35,46,19,13,p);
      gate(g,36,63,5,8,p);
      g.line(26,48,24,56,p.mid);g.rect(23,55,2,2,p.glow);
      canopy(g,45,56,9,6,p);
    }else if(type==='depot'){
      // Buttressed roots swell around a recessed store at ground level.
      g.poly([[20,61],[26,59],[29,53],[39,50],[47,53],[50,57],[55,60],[51,62],[44,62],[39,67],[31,66],[29,63],[23,64]],p.right,ink);
      g.poly([[22,61],[28,59],[31,54],[38,52],[33,61],[29,63]],p.left);
      trunk(g,37,65,6,18,p);
      g.poly([[34,62],[30,56],[24,52],[22,45],[25,46],[29,51],[35,52],[37,47],[39,42],[41,41],[40,51],[43,49],[49,44],[51,44],[49,51],[41,57],[39,64]],p.left,ink);
      g.line(35,61,32,55,p.top);g.line(41,54,48,48,p.joint);
      // Upturned leaves hold separate cargo, with a lengthwise vein and a curled lip.
      const cup=(x,y,r,load)=>{
        g.poly([[x-r,y-6],[x-r+4,y-8],[x,y-6],[x+r-3,y-9],[x+r,y-8],[x+r-1,y-2],[x+4,y+3],[x,y+5],[x-4,y+3],[x-r+1,y]],p.main,ink);
        g.poly([[x-r+2,y-5],[x-r+5,y-6],[x,y-4],[x+r-3,y-7],[x+r-2,y-5],[x+3,y-1],[x-3,y]],p.deep);
        gem(g,x,y-1,3,7,load);
        g.poly([[x-r,y-5],[x-4,y-2],[x,y-1],[x+r-1,y-6],[x+r-2,y-2],[x+2,y+4],[x-3,y+3],[x-r+2,y]],p.mid,ink);
        g.line(x-r+2,y-4,x-1,y,p.light);g.line(x,y+2,x+r-3,y-3,p.main);
      };
      cup(45,43,10,gold);cup(25,52,9,lilac);
      g.poly([[35,59],[38,51],[44,48],[48,47],[47,51],[43,56],[40,56],[37,62]],p.main,ink);
      g.line(37,58,45,50,p.light);
      g.poly([[30,64],[30,59],[32,56],[35,55],[38,57],[38,64],[35,66]],p.top,ink);
      g.poly([[32,64],[32,59],[34,57],[36,58],[36,64],[34,65]],p.shadow);
      g.rect(33,59,2,2,p.metal);
      g.poly([[42,64],[47,61],[51,60],[49,64],[44,66]],p.mid,ink);
      g.line(30,64,26,66,p.main);
    }else if(type==='house'){
      trunk(g,38,65,6,13,p);canopy(g,38,52,14,11,p);
      gate(g,37,64,3,6,p);windowSlit(g,42,60,p);
    }else{
      trunk(g,37,65,5,26,p);canopy(g,37,41,12,8,p);
      gem(g,37,35,4,10,green);
      g.line(30,45,28,53,p.main);g.rect(27,53,2,2,p.glow);
      gate(g,36,64,3,6,p);
    }
  }
  function resources(g,type) {
    const ore=type==='ore';
    g.ellipse(17,23,13,4,'#40504c');
    const boulder=(x,y,w,h)=>{
      g.poly([[x-w,y-1],[x-w+1,y-h*.6],[x-2,y-h],[x+2,y-h],[x+w,y-h*.48],[x+w-1,y],[x,y+2]],'#787986','#514e61');
      g.poly([[x-w+1,y-h*.54],[x-2,y-h+1],[x+2,y-h+1],[x,y-h*.5],[x-3,y-h*.35]],'#ac9c9c');
      g.poly([[x-3,y-h*.35],[x,y-h*.5],[x+w-1,y-h*.48],[x+w-2,y],[x,y+1]],'#686472');
      if(ore){
        g.poly([[x-w+1,y-1],[x-w+3,y-3],[x-2,y-3],[x-1,y-6],[x+2,y-7],[x+1,y-4],[x-1,y-3],[x-2,y-1]],'#e8a653');
        g.rect(x-1,y-6,2,1,'#ffe99c');
      }
    };
    boulder(10,19,6,9);boulder(22,18,6,9);boulder(17,21,8,9);
    if(ore){
      gem(g,10,19,3,8,gold);gem(g,18,17,3,10,gold);gem(g,23,20,3,7,gold);
      boulder(14,24,5,6);g.rect(21,24,3,2,'#e4af65');
    }else{
      gem(g,10,20,3,11,lilac);gem(g,22,19,3,13,lilac);
      gem(g,16,20,4,18,lilac);gem(g,22,23,3,9,lilac);gem(g,13,24,3,8,lilac);
      g.rect(6,23,3,1,'#b08dd1');g.rect(25,23,2,1,'#cfaaec');
    }
  }
  function units(g,type,faction,walk,step) {
    const p=base[faction], tank=type==='heavy', worker=type==='worker', soldier=type==='soldier';
    const bob=walk&&(step===1||step===3)?1:0, x=15,y=23;
    const face=faction==='velari'?'#dfc4aa':faction==='cinder'?'#bb8269':'#bcbd90';
    const boot=type==='heavy'?3:2, spread=tank?4:2;
    g.rect(x-spread-1,y-3,boot,3,ink);g.rect(x-spread-1-(walk&&step>1?1:0),y,boot+1,1,p.shadow);
    g.rect(x+spread-1,y-3,boot,3,ink);g.rect(x+spread-1+(walk&&step<2?1:0),y-1,boot+1,2,p.joint);
    const top=y-bob;
    if(faction==='velari'){
      if(tank){
        g.poly([[7,top-5],[8,top-12],[11,top-13],[12,top-16],[18,top-16],[21,top-13],[23,top-12],[22,top-5],[17,top-3],[12,top-3]],p.deep,ink);
        g.poly([[9,top-12],[13,top-15],[16,top-13],[14,top-9],[10,top-8]],p.light,ink);
        g.poly([[14,top-9],[16,top-13],[20,top-10],[18,top-5],[15,top-6]],p.mid);
        g.rect(14,top-17,6,4,p.left);g.rect(17,top-16,3,2,ink);g.rect(18,top-15,2,1,'#b9f4ff');
        gem(g,13,top-14,2,6,lilac);gem(g,8,top-7,2,7,lilac);
        g.line(21,top-4,24,top-14,p.top);g.rect(23,top-15,2,3,p.light);
      }else if(soldier){
        g.poly([[10,top-4],[11,top-11],[14,top-13],[18,top-11],[19,top-4],[15,top-3]],p.mid,ink);
        g.rect(13,top-16,5,5,p.left);g.rect(16,top-14,3,2,ink);
        g.poly([[11,top-14],[12,top-17],[15,top-18],[17,top-15]],p.light,ink);
        g.poly([[9,top-10],[12,top-11],[14,top-9],[12,top-4],[9,top-6]],p.main,ink);
        g.rect(10,top-9,1,3,p.metal);
        g.line(19,top-3,22,top-17,p.metal);g.line(21,top-15,23,top-20,p.top);
      }else{
        g.poly([[10,top-3],[12,top-10],[16,top-11],[19,top-7],[18,top-4]],p.mid,ink);
        g.rect(10,top-9,3,4,p.deep);g.rect(14,top-12,4,4,face);
        g.poly([[11,top-12],[13,top-15],[16,top-16],[18,top-12],[18,top-11],[13,top-12]],p.light,ink);
        g.rect(16,top-11,2,1,p.shadow);
        g.line(18,top-4,21,top-10,p.metal);g.line(19,top-10,23,top-9,p.top);
      }
    }else if(faction==='cinder'){
      if(tank){
        block(g,16,top-3,7,6,7,{...p,left:p.main,right:p.deep,top:p.mid},false);
        g.rect(9,top-16,2,7,ink);g.rect(9,top-16,2,1,p.metal);
        g.poly([[10,top-11],[11,top-15],[18,top-16],[21,top-13],[20,top-10],[16,top-8]],p.mid,ink);
        g.rect(14,top-13,6,2,ink);g.rect(16,top-13,3,1,p.glow);
        g.rect(19,top-9,6,4,ink);g.rect(20,top-9,5,2,p.left);g.rect(24,top-8,2,2,p.deep);
        g.line(11,top-7,16,top-5,p.metal);
      }else{
        g.poly([[10,top-5],[11,top-11],[15,top-12],[18,top-10],[19,top-5],[15,top-3]],p.main,ink);
        g.rect(13,top-15,5,5,face);g.rect(14,top-13,4,1,ink);
        g.poly([[11,top-13],[12,top-16],[16,top-17],[18,top-15],[19,top-13]],worker?p.metal:p.mid,ink);
        g.rect(10,top-10,3,4,p.shadow);g.rect(10,top-9,2,1,p.metal);
        g.rect(15,top-8,2,1,p.metal);
        if(worker){
          g.line(17,top-4,20,top-11,p.metal);g.rect(19,top-12,4,3,p.shadow);g.rect(20,top-12,3,1,p.left);
        }else{
          g.rect(16,top-9,7,3,ink);g.rect(17,top-9,6,1,p.left);g.rect(18,top-7,2,2,p.metal);
        }
      }
    }else{
      if(tank){
        g.poly([[7,top-3],[9,top-11],[8,top-15],[13,top-13],[16,top-18],[18,top-13],[23,top-15],[21,top-9],[22,top-3],[18,top-5],[12,top-4]],p.main,ink);
        g.poly([[10,top-5],[12,top-13],[16,top-10],[14,top-5]],p.left);
        g.rect(15,top-13,4,5,p.deep);g.rect(17,top-12,2,1,p.glow);
        g.line(10,top-12,7,top-18,p.mid);g.line(8,top-16,5,top-17,p.light);
        g.line(19,top-13,22,top-19,p.mid);g.rect(21,top-19,3,2,p.light);
        gem(g,17,top-5,2,5,green);
      }else{
        g.poly([[10,top-4],[12,top-10],[15,top-13],[18,top-8],[20,top-4],[15,top-5],[13,top-3]],p.main,ink);
        g.rect(14,top-13,4,4,face);g.rect(17,top-12,1,1,ink);
        if(worker){
          canopy(g,15,top-13,5,4,p);
          g.line(18,top-4,21,top-10,p.top);g.rect(20,top-11,3,1,p.mid);
        }else{
          g.poly([[11,top-13],[12,top-18],[14,top-16],[16,top-19],[17,top-15],[20,top-16],[18,top-12]],p.mid,ink);
          g.rect(11,top-9,2,4,p.light);
          g.line(19,top-3,22,top-17,p.left);g.poly([[21,top-16],[22,top-20],[24,top-19],[23,top-16]],p.light);
        }
      }
    }
  }
  // The surveyor runs on articulated split hooves beneath a suspended sighting prism.
  function surveyor(g,walk,frame){
    const p=base.velari, shift=walk?[0,-2,0,2][frame]:0, bob=frame===1||frame===3?-1:0;
    const y=17+bob;
    const legs=[[11,1,-1],[19,1,1],[9,0,1],[17,0,-1]];
    for(const [x,far,way] of legs){
      const heel=x+way*(far?2:3)+shift*way,foot=heel+way;
      g.line(x,y+1,heel,y+3,ink);g.line(heel,y+3,foot,22-far,ink);
      g.rect(foot-1,22-far,3,1,far?p.shadow:p.top);
      if(!far)g.rect(heel,y+3,2,1,p.metal);
    }
    g.poly([[6,y],[8,y-4],[15,y-5],[20,y-3],[22,y],[17,y+3],[12,y+2],[9,y+3]],p.deep,ink);
    g.poly([[8,y-3],[14,y-4],[19,y-2],[16,y],[11,y]],p.light);
    g.line(8,y,14,y+2,p.main);g.line(15,y+2,20,y-1,p.metal);
    g.poly([[8,y-2],[7,y-6],[4,y-8],[5,y-9],[9,y-7],[12,y-3]],p.mid,ink);
    gem(g,13,y-2,3,10,lilac);
    g.line(17,y-6,18,y-10,p.metal);g.line(18,y-10,16,y-13,p.top);
    g.rect(15,y-14,2,2,frame===2?p.glow:p.mid);
    g.poly([[16,y-2],[17,y-7],[21,y-9],[24,y-7],[27,y-7],[26,y-5],[22,y-4],[20,y]],p.mid,ink);
    g.line(18,y-7,21,y-8,p.light);g.rect(21,y-7,4,2,'#435c75');
    g.rect(22,y-7,2,1,frame===0?'#f3fffa':'#99e0de');
    g.line(21,y-9,22,y-12,p.metal);g.rect(22,y-13,2,2,p.glow);
  }
  function cartWheel(g,x,y,frame,p){
    g.poly([[x-3,y-2],[x-1,y-3],[x+1,y-3],[x+3,y-1],[x+3,y+1],[x+1,y+3],[x-1,y+3],[x-3,y+1]],p.shadow,ink);
    g.line(x-2,y-2,x+1,y-2,p.left);g.rect(x-2,y-1,1,2,p.left);
    g.rect(x-1,y-1,3,3,p.deep);g.rect(x,y,1,1,p.metal);
    const spokes=[[1,-1],[1,1],[-1,1],[-1,-1]];
    const [a,b]=spokes[frame];g.rect(x+a,y+b,1,1,p.light);
  }
  // A pair of leather air chambers feed the forward ceramic nozzle.
  function bellowsCart(g,walk,frame){
    const p=base.cinder, y=17+(walk&&frame%2?-1:0),compression=[0,1,2,1][frame];
    cartWheel(g,23,y+1,walk?frame:0,p);
    g.poly([[3,y-2],[7,y-5],[21,y-6],[28,y-3],[27,y+1],[12,y+5],[4,y+2]],p.deep,ink);
    g.poly([[5,y-2],[10,y-5],[21,y-5],[25,y-3],[13,y+1]],p.metal);
    g.rect(7,y-11,3,8,p.shadow);g.rect(6,y-12,5,2,p.left);
    if(frame!==0){g.rect(7,y-13,2,1,frame===2?'#fed585':'#ee985d');}
    g.poly([[4,y-3],[4,y-7],[8,y-9],[12,y-7],[12,y-2],[8,y]],p.main,ink);
    g.rect(6,y-6,4,2,'#663f40');g.rect(7,y-6,2,1,p.glow);
    const nozzle=23-compression;
    g.poly([[10,y-4],[11,y-8],[15,y-10],[nozzle,y-9],[nozzle+2,y-5],[nozzle,y-2],[14,y]],'#a87864',ink);
    for(let i=0;i<3;i++){
      const x=12+i*(compression===2?2:3);
      g.line(x,y-6,x+2,y-9,p.light);g.line(x,y-5,x+2,y-1,'#704c4d');
    }
    g.poly([[nozzle-1,y-8],[nozzle+2,y-10],[28,y-10],[30,y-7],[29,y-5],[25,y-5],[nozzle+1,y-3]],p.shadow,ink);
    g.line(nozzle+2,y-9,27,y-9,p.top);g.rect(27,y-8,3,2,p.main);
    g.rect(28,y-8,2,1,frame===2?p.glow:p.light);
    cartWheel(g,8,20,walk?frame:0,p);cartWheel(g,19,20,walk?frame:0,p);
  }
  function blossom(g,x,y,spread){
    g.poly([[x-5-spread,y-2],[x-4,y-4],[x-1,y-3],[x-1,y-6],[x+1,y-7],[x+3,y-4],[x+2,y-2],[x+6,y-4],[x+7,y-2],[x+4,y+1],[x+1,y+1],[x,y+3],[x-2,y+2],[x-2,y],[x-5,y]],'#d588a1',ink);
    g.rect(x-4-spread,y-2,3,1,'#f1b4b9');g.rect(x,y-5,2,2,'#f6c8c0');
    g.rect(x+3,y-2,3,1,'#fad4c4');g.rect(x-1,y-1,3,2,'#ffdb85');
  }
  // The weaver carries a loop of living fiber suspended from a seed lantern.
  function threadWeaver(g,walk,frame){
    const p=base.myren, y=18+(frame===2?-1:0),swing=frame===1?1:frame===3?-1:0;
    const foot=walk?swing*2:0;
    g.line(12,y,10+foot,22,p.shadow);g.line(17,y,19-foot,21,p.shadow);
    g.line(10+foot,22,8+foot,23,p.mid);g.line(19-foot,21,20-foot,22,p.top);
    g.poly([[8,y+2],[9,y-1],[11,y-6],[14,y-8],[17,y-6],[18,y-2],[20,y],[18,y+2],[14,y+1],[12,y+3]],p.main,ink);
    g.poly([[11,y],[13,y-5],[15,y-5],[14,y],[11,y+2]],p.light);
    g.poly([[16,y-5],[19,y-3],[21,y-3],[21,y-1],[18,y-1],[15,y-2]],p.left,ink);
    g.rect(13,y-10,5,5,p.left);g.rect(16,y-8,3,1,p.deep);g.rect(17,y-8,1,1,p.glow);
    g.line(13,y-7,10,y-5,p.mid);
    blossom(g,14+swing,y-9,frame===1?1:0);
    g.line(20,22,23,8,p.deep);g.line(21,20,23,9,p.top);
    g.line(23,8,26,6+swing,p.mid);g.line(26,6+swing,28,7+swing,p.light);
    g.line(28,8+swing,26,12+swing,'#99bb9d');g.rect(25,11+swing,2,2,'#eeb3b4');
    g.line(11,y-3,7,y-1+swing,p.light);g.line(7,y-1+swing,5,y-3+swing,p.mid);
  }
  function makeSprite(type,faction,walk,frame) {
    const unit=unitTypes.has(type), resource=rockTypes.has(type);
    const g=raster(unit||resource?34:76,unit||resource?28:77);
    const x=unit?15:resource?17:37, y=unit?23:resource?24:68;
    const radii=type==='hq'?[33,10]:type==='barracks'||type==='depot'?[21,7]:type==='house'?[16,5]:type==='tower'?[13,4]:
                 type==='heavy'||type==='specialist'?[8,3]:unit?[5,2]:[13,4];
    g.ellipse(x+1,y-1,...radii,'rgba(20,27,38,.32)');
    if(resource) resources(g,type);
    else if(type==='specialist')({velari:surveyor,cinder:bellowsCart,myren:threadWeaver}[faction])(g,walk,frame);
    else if(unit)units(g,type,faction,walk,frame);
    else ({velari,cinder,myren}[faction])(g,type,base[faction]);
    return {canvas:g.canvas,x,y,scale:unit?(type==='worker'?1.42:1.48):resource?1.60:1.72};
  }
  function paintPortrait(faction){
    const g=raster(64,64),p=base[faction];
    const back=faction==='velari'?['#24243e','#35304f','#45405f']:
               faction==='cinder'?['#342632','#49323b','#613c40']:['#20343b','#284349','#325652'];
    g.rect(0,0,64,64,back[0]);
    g.poly([[0,29],[25,2],[40,0],[14,32],[0,41]],back[1]);
    g.poly([[30,64],[64,21],[64,39],[47,64]],back[1]);
    for(let i=0;i<35;i++){
      const x=(i*19+7)%62,y=(i*i*13+4)%59;g.rect(x,y,i%4?1:2,1,back[2]);
    }
    if(faction==='velari')velariPortrait(g,p);
    else if(faction==='cinder')cinderPortrait(g,p);
    else myrenPortrait(g,p);
    return g.canvas;
  }
  function velariPortrait(g,p){
    const hair='#c3b5e5',hairLight='#eee0f6',hairShade='#8b82ae',skin='#deb7a6',skinLight='#f4d6c2',skinShade='#aa8798';
    // Cloak, tall jeweled collar, and silver hair surround an angled face.
    g.poly([[2,64],[4,51],[15,43],[18,28],[14,17],[26,9],[44,9],[51,17],[51,32],[54,46],[62,52],[64,64]],'#49405d',ink);
    g.poly([[10,56],[13,40],[15,25],[20,15],[36,10],[46,13],[43,23],[41,38],[43,50],[31,53]],hairShade,ink);
    g.poly([[12,47],[17,25],[23,18],[29,17],[23,27],[21,43],[17,54],[17,38]],hair);
    g.poly([[16,34],[20,21],[26,17],[22,25]],hairLight);
    g.poly([[27,45],[38,38],[42,43],[41,53],[37,59],[28,55]],skinShade,ink);
    g.poly([[23,23],[30,17],[41,17],[46,22],[45,28],[47,32],[49,35],[45,36],[44,42],[40,45],[33,46],[26,42],[23,37],[20,35],[19,29]],skin,ink);
    g.poly([[30,23],[37,19],[43,20],[45,23],[44,29],[47,34],[43,34],[42,37],[44,37],[42,41],[39,42],[35,40],[34,34],[30,31]],skinLight);
    g.poly([[21,29],[11,24],[14,31],[19,36],[25,38],[26,33]],skinShade,ink);
    g.line(13,26,21,32,skinLight);
    g.poly([[22,23],[26,18],[39,15],[45,19],[40,20],[34,20],[31,24],[27,26],[26,33],[23,34]],hair);
    g.line(28,21,36,17,hairLight);
    g.line(31,27,36,27,'#705975');g.line(31,28,35,29,ink);g.rect(34,28,2,1,'#b8eddf');
    g.line(41,26,44,25,'#705975');g.rect(42,27,3,1,ink);g.rect(42,27,1,1,'#c1f2e3');
    g.line(40,29,41,32,skinShade);g.rect(42,33,3,1,'#ad8091');
    g.line(39,37,43,37,'#9a647d');g.rect(39,38,3,1,'#edbdad');
    g.line(28,32,31,34,'#c39aaa');g.rect(30,34,3,1,'#e3aab2');
    g.poly([[19,24],[15,18],[10,12],[19,15],[17,7],[23,13],[27,6],[29,11],[37,6],[44,10],[49,7],[46,17],[40,19],[30,17],[22,23]],p.deep,ink);
    g.poly([[14,14],[21,17],[19,10],[24,15],[28,10],[27,17],[22,20]],p.mid);
    g.line(20,22,29,16,p.metal);g.line(29,16,40,17,p.metal);g.line(40,17,46,12,p.metal);
    gem(g,33,19,4,13,lilac);
    g.line(21,35,20,41,p.metal);g.rect(19,39,3,3,p.light);
    g.poly([[1,64],[4,52],[15,47],[21,39],[28,45],[32,52],[38,54],[46,46],[48,40],[56,45],[63,51],[64,64]],p.deep,ink);
    g.poly([[4,54],[15,49],[19,43],[26,48],[29,54],[22,56],[12,55],[3,60]],p.mid);
    g.poly([[43,52],[49,43],[55,46],[61,51],[54,52],[48,57]],p.mid);
    g.line(6,53,18,46,p.light);g.line(18,46,27,51,p.light);g.line(48,47,55,46,p.light);
    g.poly([[20,55],[29,57],[35,61],[39,61],[48,54],[44,61],[38,64],[30,63]],p.main);
    g.line(20,50,34,58,p.metal);g.line(34,58,46,49,p.metal);gem(g,35,62,3,7,lilac);
  }
  function cinderPortrait(g,p){
    const skin='#bc8266',lit='#da9e76',shade='#8d6059',beard='#573e46',blit='#795450',metal='#a78e83';
    g.poly([[0,64],[1,51],[11,44],[15,31],[14,19],[20,10],[30,6],[41,7],[50,13],[52,29],[49,43],[58,47],[64,55],[64,64]],'#4c424c',ink);
    g.poly([[19,24],[25,17],[40,16],[47,22],[46,28],[50,35],[46,37],[45,43],[35,49],[26,46],[20,40],[19,35],[15,33],[15,27]],skin,ink);
    g.poly([[32,22],[41,18],[45,23],[44,28],[49,34],[44,35],[41,33],[41,38],[35,40],[30,36],[28,28]],lit);
    g.poly([[17,34],[21,33],[22,37],[27,38],[31,35],[36,37],[40,36],[44,35],[46,38],[45,45],[39,49],[32,50],[24,46],[20,41]],beard,ink);
    g.poly([[27,41],[30,39],[34,41],[39,40],[42,38],[44,38],[42,43],[37,46],[32,46]],blit);
    g.line(33,41,40,40,'#432f35');g.rect(34,42,4,1,'#b58271');
    g.line(26,28,33,27,'#4b3439');g.rect(30,29,3,1,ink);g.rect(31,29,1,1,p.glow);
    g.line(40,26,44,26,beard);g.rect(42,28,2,1,ink);
    g.line(38,28,38,33,shade);g.rect(41,34,4,1,shade);
    g.poly([[13,28],[13,19],[17,12],[25,6],[38,5],[45,9],[48,15],[51,19],[49,22],[39,21],[28,23],[21,26],[20,31],[16,33]],p.deep,ink);
    g.poly([[15,20],[19,13],[26,8],[38,7],[44,10],[47,15],[34,15],[27,17],[22,20]],p.mid);
    g.poly([[20,14],[26,8],[34,7],[29,12],[26,18],[20,20]],p.light);
    g.poly([[14,23],[21,19],[32,15],[44,15],[50,17],[51,20],[39,19],[28,21],[18,26],[14,27]],metal,ink);
    g.poly([[23,20],[28,16],[35,15],[37,17],[36,22],[29,24],[24,24]],p.metal,ink);
    g.poly([[26,20],[30,17],[34,17],[34,20],[30,22],[26,22]],'#5d7479');g.rect(30,18,3,1,'#c6e0ca');
    g.poly([[38,16],[44,15],[48,17],[47,21],[41,22],[38,21]],p.metal,ink);
    g.rect(40,17,5,3,'#62787a');g.rect(42,17,3,1,'#c6e0ca');
    g.poly([[13,29],[17,26],[20,27],[19,38],[16,40],[13,37]],metal,ink);
    g.rect(15,31,2,4,p.metal);
    g.poly([[0,64],[0,52],[12,46],[21,42],[27,48],[34,53],[42,49],[46,42],[56,46],[62,51],[64,64]],p.deep,ink);
    g.poly([[1,53],[10,48],[19,45],[25,50],[20,55],[8,55],[2,60]],p.mid,ink);
    g.poly([[45,48],[48,44],[57,47],[62,52],[57,54],[47,53]],p.mid,ink);
    g.line(3,53,17,47,p.light);g.line(48,45,57,48,p.light);
    g.poly([[16,56],[24,52],[31,56],[34,63],[22,63]],'#6e6065',ink);
    g.poly([[40,56],[48,53],[57,56],[54,64],[37,64]],metal,ink);
    g.rect(43,58,8,3,ink);g.rect(44,58,6,1,p.mid);
    [[6,56],[19,50],[58,51],[49,55]].forEach(([x,y])=>g.rect(x,y,2,2,p.metal));
  }
  function myrenPortrait(g,p){
    const skin='#98baa2',light='#bfd5ac',gray='#678e82',wood='#755f56';
    g.poly([[0,64],[3,53],[16,45],[20,29],[16,22],[11,16],[17,16],[9,7],[19,10],[24,16],[27,4],[31,9],[31,15],[40,10],[49,10],[53,4],[52,14],[59,11],[55,19],[49,24],[49,38],[52,45],[61,49],[64,64]],p.deep,ink);
    g.poly([[18,46],[19,25],[25,15],[35,12],[42,15],[45,26],[42,49],[31,57]],'#5e796f');
    g.poly([[28,45],[38,41],[44,38],[42,46],[45,51],[39,55],[29,53]],gray,ink);
    g.poly([[22,25],[30,18],[40,17],[46,22],[45,28],[48,33],[47,35],[44,36],[43,41],[39,45],[34,46],[26,42],[22,36],[17,32],[16,27]],skin,ink);
    g.poly([[31,24],[39,20],[44,22],[43,29],[47,33],[44,34],[41,33],[42,38],[40,42],[36,43],[32,40],[34,34],[30,29]],light);
    g.poly([[23,30],[14,25],[11,23],[14,32],[21,38],[25,36]],gray,ink);g.line(14,27,21,33,light);
    g.line(28,27,34,26,p.deep);g.line(29,28,34,28,ink);g.rect(32,28,2,1,p.glow);
    g.line(40,25,44,25,p.deep);g.rect(41,27,3,1,ink);g.rect(41,27,1,1,p.glow);
    g.line(38,30,39,33,gray);g.rect(40,34,3,1,gray);
    g.line(37,38,42,37,'#577d74');
    for(const [x,y]of[[27,31],[29,33],[31,32],[42,30],[44,29]])g.rect(x,y,1,1,'#e1dfaa');
    g.poly([[17,26],[15,20],[8,18],[5,13],[12,16],[16,16],[12,12],[10,6],[13,6],[17,12],[21,14],[23,9],[23,2],[26,4],[27,12],[25,18],[30,20],[27,25],[22,25],[22,31]],wood,ink);
    g.line(13,9,20,16,p.metal);g.line(24,5,25,13,p.metal);
    g.poly([[39,18],[46,13],[49,7],[50,2],[52,3],[52,10],[49,15],[53,15],[58,10],[59,12],[55,18],[47,21]],wood,ink);
    g.line(48,15,51,8,p.metal);
    g.poly([[17,22],[24,19],[29,14],[30,9],[34,13],[35,9],[39,5],[40,12],[45,10],[44,15],[41,19],[33,22],[24,21],[21,26]],p.mid,ink);
    g.line(26,20,30,15,p.light);g.line(35,17,39,11,p.light);gem(g,35,23,2,6,green);
    g.poly([[0,64],[1,53],[11,48],[18,44],[25,43],[31,48],[36,52],[43,46],[47,42],[55,46],[63,52],[64,64]],p.deep,ink);
    g.poly([[2,56],[8,50],[15,49],[16,43],[22,45],[23,40],[29,45],[30,52],[26,55],[19,52],[16,55],[11,53],[5,59]],p.mid,ink);
    g.poly([[43,51],[43,46],[49,40],[50,45],[55,43],[57,48],[62,49],[61,54],[54,53],[50,56]],p.mid,ink);
    g.line(6,54,14,50,p.light);g.line(24,44,28,50,p.light);g.line(45,49,48,45,p.light);
    g.line(22,51,35,58,p.metal);g.line(35,58,47,48,p.metal);
    gem(g,36,63,3,8,green);
  }
  const ambienceMaps={
    shoals:{
      ripples:[[130,122],[366,61],[467,97],[540,136],[664,154],[705,214],[618,236],[568,281],[1193,46],
        [1232,328],[662,446],[510,494],[607,521],[762,543],[441,569],[302,589],[207,571],[77,469],[22,380],[1022,42]],
      motes:[[86,42],[283,138],[195,449],[598,83],[691,354],[1171,245],[905,534],[1158,460],[641,592]],
      reeds:[], glint:'#8bbfbb'
    },
    delta:{
      ripples:[[187,52],[329,53],[444,108],[530,120],[715,65],[817,99],[955,49],[1088,67],[15,168],[1258,206],
        [519,282],[564,314],[600,288],[656,337],[704,300],[748,365],[517,377],[764,483],[545,535],[601,568],
        [701,551],[825,568],[176,589],[303,602],[942,595],[1123,580]],
      motes:[], reeds:[[122,185],[208,131],[382,166],[67,339],[126,461],[217,505],[336,498],[557,167],
        [716,155],[577,454],[665,470],[699,413],[855,433],[966,493],[1112,484],[1204,424],[1153,219]],
      glint:'#9bb6c6'
    },
    kiln:{
      ripples:[],motes:[],reeds:[],glint:'#e49b61',
      vents:[[458,54],[586,68],[702,64],[805,85],[491,233],[706,239],[798,250],[473,452],[683,488],[796,522],[590,560],[839,595]]
    },
    lantern:{
      ripples:[[570,55],[605,83],[582,114],[618,151],[604,180],[240,119],[426,162],[817,74],
        [1042,53],[456,360],[555,423],[720,391],[834,459],[1112,567],[917,531],[182,599],[427,571],[712,605]],
      motes:[[150,316],[220,505],[580,327],[688,215],[960,147],[1044,401],[651,452]],
      reeds:[],glint:'#acc8cd'
    }
  };
  const atmosphereCache=new Map();
  function atmosphere(){
    const terrain=window.Terrain, id=terrain?.mapId||'shoals';
    if(atmosphereCache.has(id))return atmosphereCache.get(id);
    const preset=ambienceMaps[id];
    if(!terrain)return preset;
    const ground=terrain.ground;
    // Check the full moving mark and the cliff projection north of it once per map.
    const ripples=preset.ripples.filter(([x,y])=>{
      for(let dy=-3;dy<=3;dy+=2)for(let dx=-2;dx<=20;dx+=2)if(ground(x+dx,y+dy))return false;
      for(let dy=-45;dy<-3;dy+=7)for(let dx=-6;dx<=22;dx+=6)if(ground(x+dx,y+dy))return false;
      return true;
    });
    const onGrass=([x,y])=>{
      for(let dy=-7;dy<=7;dy+=2)for(let dx=-10;dx<=10;dx+=2)if(!ground(x+dx,y+dy))return false;
      return true;
    };
    const sites={...preset,ripples,motes:preset.motes.filter(onGrass),reeds:preset.reeds.filter(onGrass)};
    if(preset.vents)sites.vents=preset.vents.filter(([x,y])=>!ground(x,y)&&!ground(x,y-18));
    atmosphereCache.set(id,sites);
    return sites;
  }
  function saltReeds(ctx,stands,t){
    for(let i=0;i<stands.length;i++){
      const [x,y]=stands[i],wind=Math.sin(t*1.2+i*2.3);
      const bend=wind>.44?1:wind<-.70?-1:0;
      ctx.globalAlpha=.85;
      ctx.fillStyle='#796d51';
      ctx.fillRect(x-3,y-2,2,3);ctx.fillRect(x,y-4,2,5);ctx.fillRect(x+3,y-3,2,4);
      ctx.fillStyle='#d2ae72';
      ctx.fillRect(x-4+bend,y-4,2,3);ctx.fillRect(x+bend,y-7,2,4);ctx.fillRect(x+4+bend,y-5,2,3);
      const drift=(t*.16+i*.173)%1;
      if(drift<.40 && i%3===0){
        ctx.globalAlpha=Math.sin(drift*Math.PI/.4)*.72;
        ctx.fillStyle='#ead4a0';
        ctx.fillRect(x+Math.round(drift*16),y-6-Math.round(Math.sin(drift*Math.PI/.4)*3),2,1);
      }
    }
  }
  const birds=[[0,0],[-16,-5],[-27,3],[-39,1]];
  function ambience(ctx,time=0){
    const t=Math.max(0,time),{ripples,motes,reeds,glint,vents}=atmosphere();
    const map=window.Terrain?.mapId,delta=map==='delta',lantern=map==='lantern';
    ctx.save();
    if(vents){
      for(let i=0;i<vents.length;i++){
        const phase=(t*.24+i*.618)%1;
        if(phase>.53)continue;
        const [x,y]=vents[i],u=phase/.53;
        ctx.globalAlpha=.72*Math.sin(Math.PI*u);
        pixel(ctx,x+3*Math.sin(u*5+i),y-16*u,2,2,u<.42?'#ffce85':'#dc8c69');
        pixel(ctx,x-3+u*4,y+3-10*u,1,2,'#edaa74');
      }
      ctx.restore();return;
    }
    ctx.fillStyle=glint;
    for(let i=0;i<ripples.length;i++){
      const phase=(t*.14+i*.618)%1;
      if(phase>.53)continue;
      const [cx,cy]=ripples[i], wave=Math.sin(phase*Math.PI/.53);
      const x=2*Math.round((cx+phase*9)/2),y=cy;
      ctx.globalAlpha=.12+wave*.43;
      ctx.fillRect(x,y,2+2*Math.floor(wave*3),2);
      if(wave>.67)ctx.fillRect(x+10,y-2,2,2);
    }
    for(let i=0;i<motes.length;i++){
      const phase=t*.65+i*2.4, glow=Math.cos(phase);
      if(glow<.15)continue;
      const x=Math.round(motes[i][0]+Math.sin(phase*.67)*7),y=Math.round(motes[i][1]+Math.cos(phase*.85)*4);
      ctx.fillStyle=lantern?'#e5b266':'#b4e5ac';ctx.globalAlpha=glow*.17;ctx.fillRect(x-1,y-1,4,4);
      ctx.fillStyle=lantern?'#ffdc96':'#ecf6cb';ctx.globalAlpha=glow*.8;ctx.fillRect(x,y,2,2);
    }
    if(reeds.length)saltReeds(ctx,reeds,t);
    const age=(t+(delta?11:4))%(delta?47:39);
    if(!lantern&&age<14){
      const path=age/14, fade=Math.min(1,age,14-age);
      const cx=delta?553+path*213:493+path*278,cy=delta?302+path*44:119+path*109;
      for(let i=0;i<birds.length;i++){
        const x=Math.round(cx+birds[i][0]), y=Math.round(cy+birds[i][1]+Math.sin(t*.56+i*.36)*3);
        const raised=Math.sin(t*4+i*1.7)>.45, tip=raised?-2:1;
        ctx.globalAlpha=fade*.2;ctx.fillStyle='#172f38';
        ctx.fillRect(x+3,y+15,5,1);
        ctx.globalAlpha=fade*.86;ctx.fillStyle='#d6dbcd';
        ctx.fillRect(x-3,y+tip,2,1);ctx.fillRect(x-1,y+(raised?-1:0),2,1);
        ctx.fillRect(x+1,y,3,2);ctx.fillRect(x+3,y-1,2,1);
        ctx.fillRect(x+4,y+(raised?-2:0),2,1);
        ctx.fillStyle='#839da1';ctx.fillRect(x+1,y+2,2,1);
      }
    }
    ctx.restore();
  }
  const architecture=new Set(['hq','barracks','house','tower','depot']);
  const cargoSockets={
    velari:{crystal:[-24,-27],ore:[29,-39]},
    cinder:{crystal:[-3,-23],ore:[27,-31]},
    myren:{crystal:[-20,-30],ore:[14,-44]}
  };
  const battleColors={
    velari:['#604577','#ae7fe3','#e2beff','#ffedff'],
    cinder:['#6d484e','#dd754d','#ffbd64','#fff0ab'],
    myren:['#386964','#72bd89','#bce798','#edffbf']
  };
  function pixel(ctx,x,y,w,h,color) {
    ctx.fillStyle=color;
    ctx.fillRect(Math.round(x),Math.round(y),w,h);
  }
  function gleam(ctx,x,y,r,color) {
    pixel(ctx,x-r,y,r*2+1,1,color);
    pixel(ctx,x,y-r,1,r*2+1,color);
  }
  // Short square-ended marks preserve the pixel grid when the effect travels diagonally.
  function dash(ctx,x,y,ex,ey,width,color) {
    const dx=ex-x,dy=ey-y;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
    ctx.fillStyle=color;
    for(let i=0;i<=steps;i++)ctx.fillRect(Math.round(x+dx*i/steps),Math.round(y+dy*i/steps),width,width);
  }
  function puff(ctx,x,y,r,color) {
    const n=Math.max(2,Math.round(r));
    pixel(ctx,x-n+2,y-n,n*2-3,2*n,color);
    pixel(ctx,x-n,y-n+2,n*2,Math.max(1,2*n-4),color);
  }
  function scaffold(ctx,e,t){
    const w=e.type==='hq'?44:e.type==='barracks'||e.type==='depot'?29:e.type==='house'?21:16;
    const h=Math.round((e.type==='hq'?64:e.type==='tower'?44:30)*(.18+.82*e.progress))+5;
    const x=Math.round(e.x),y=Math.round(e.y);
    const left=x-w,mid=x+2,right=x+w-2, rise=Math.ceil(w*.31);
    const wood='#785a50',light='#c8a27b',lash='#e4c58d';
    for(let i=0;i<3;i++){
      const xx=i===0?left:i===1?mid:right, yy=i===1?y+1:y-rise;
      pixel(ctx,xx,yy-h-2,3,h+4,wood);
      pixel(ctx,xx,yy-h-2,1,h+3,light);
    }
    const tiers=h>20?2:1;
    for(let i=1;i<=tiers;i++){
      const dy=Math.round(i*h/tiers)-2;
      dash(ctx,left,y-rise-dy,mid,y+1-dy,2,wood);
      dash(ctx,mid,y+1-dy,right,y-rise-dy,2,wood);
      dash(ctx,left,y-rise-dy-1,mid,y-dy,1,light);
      dash(ctx,mid,y-dy,right,y-rise-dy-1,1,light);
      [left,mid,right].forEach((xx,j)=>pixel(ctx,xx-1,y-(j===1?-1:rise)-dy,5,1,lash));
    }
    dash(ctx,left+2,y-rise-2,mid-2,y+1-Math.min(h,18),1,light);
    dash(ctx,mid+2,y-2,right-2,y-rise-Math.min(h,18),1,wood);
    const cycle=t*1.45+(e.phase||0),k=cycle%1;
    if(k<.30&&e.progress>0){
      const side=Math.floor(cycle)%2?1:-1;
      const sx=x+side*w*.58,sy=y-rise*.6-h+2;
      const q=k/.30;ctx.globalAlpha=1-q*.8;
      if(q<.55)gleam(ctx,sx,sy,Math.floor(4-q*5),'#fff2bc');
      pixel(ctx,sx-3-q*5,sy-q*6,2,1,'#eeb66f');
      pixel(ctx,sx+2+q*6,sy-q*3,2,2,'#f5ca82');
    }
  }
  function activity(ctx,e,time=0){
    if(!architecture.has(e.type))return;
    const t=time+(e.phase||0),p=base[e.faction]||base.velari,main=e.type==='hq',working=Boolean(e.queue&&e.queue.length);
    ctx.save();
    if(e.progress<1){scaffold(ctx,e,time);ctx.restore();return;}
    if(e.type==='depot'){
      const elapsed=time-e.lastDelivery;
      if(elapsed>=0&&elapsed<.85){
        const ore=e.deliveredResource==='ore',mix=elapsed/.85;
        const [dx,dy]=cargoSockets[e.faction][ore?'ore':'crystal'];
        const col=ore?'#ffda8a':'#ead2ff';
        if(mix<.58){
          const lift=mix/.58;
          ctx.globalAlpha=.9;
          const x=e.x+dx*lift,y=e.y-2+(dy+2)*lift-5*Math.sin(lift*Math.PI);
          puff(ctx,x,y,2,ore?'#b58049':'#8f73b4');pixel(ctx,x-1,y-1,2,2,col);
        }else{
          const fade=(1-mix)/.42;
          ctx.globalAlpha=fade;gleam(ctx,e.x+dx,e.y+dy,Math.max(1,Math.round(fade*4)),col);
        }
      }
    }else if(e.faction==='cinder'){
      const vents=main?[[-25,-83],[-10,-88],[18,-86]]:e.type==='barracks'?[[-15,-60]]:e.type==='tower'?[[0,-58]]:[[10,-35]];
      for(let i=0;i<vents.length;i++){
        const [dx,dy]=vents[i];
        for(let n=0;n<(working?4:2);n++){
          const k=(t*(working?.55:.35)+i*.61+n*.39)%1;
          const sx=e.x+dx+k*k*8+Math.sin(k*5+i)*1.5,sy=e.y+dy-k*(working?22:16);
          ctx.globalAlpha=.32*Math.sin(Math.PI*k);
          puff(ctx,sx,sy,2+k*2,'#9a8c97');
          ctx.globalAlpha=.39*Math.sin(Math.PI*k);
          pixel(ctx,sx+1,sy-2,2,2,'#b8a2a0');
        }
      }
      if(main||working){
        const k=(t*.9)%1,dx=main?-8:-6;
        ctx.globalAlpha=.33+.20*Math.sin(t*6);
        pixel(ctx,e.x+dx-5,e.y-14,6,2,'#ffca77');
        ctx.globalAlpha=.8*(1-k);pixel(ctx,e.x+dx+k*3,e.y-17-k*8,2,2,'#ffd782');
      }
    }else if(e.faction==='myren'){
      const dx=main?6:e.type==='tower'?0:-4,dy=main?-86:e.type==='tower'?-58:e.type==='house'?-42:-55;
      for(let i=0;i<(main||working?4:2);i++){
        const k=(t*.24+i*.31)%1;
        ctx.globalAlpha=.74*Math.sin(k*Math.PI);
        const sx=e.x+dx+Math.sin(t*.9+i*2.2)*4+(i%2?1:-1)*(3+k*7);
        const sy=e.y+dy-14*k+i%2*4;
        pixel(ctx,sx,sy,i===0?3:2,2,i%2?p.glow:p.light);
      }
    }else{
      const dx=main?10:e.type==='house'?5:0;
      const dy=main?-94:e.type==='tower'?-66:e.type==='house'?-30:-49;
      const k=(t*(working?.52:.25))%1;
      if(main||e.type==='tower'){
        ctx.globalAlpha=.13+.12*Math.cos(t*2);
        puff(ctx,e.x+dx,e.y+dy,5,'#deb8ff');
      }
      if(k<.32){
        ctx.globalAlpha=Math.sin(Math.PI*k/.32)*.92;
        gleam(ctx,e.x+dx,e.y+dy,main||working?3:2,p.glow);
      }
    }
    // Recent deliveries flow into the entrance in the color of their cargo.
    const elapsed=time-e.lastDelivery;
    if(main&&elapsed>=0&&elapsed<.8){
      const ore=e.deliveredResource==='ore',k=elapsed/.8;
      for(let i=0;i<3;i++){
        const a=k-i*.12;
        if(a<0||a>1)continue;
        ctx.globalAlpha=Math.sin(a*Math.PI);
        pixel(ctx,e.x-16+a*8,e.y+3-a*14,3,3,ore?'#fbd17e':'#e2bcff');
      }
    }
    if(working){
      const k=(t*1.15)%1;
      ctx.globalAlpha=.35+.55*Math.sin(Math.PI*k);
      pixel(ctx,e.x-9,e.y-12,2,3,p.glow);
    }
    ctx.restore();
  }
  const scatter=[[.98,.17],[.48,.82],[-.27,.96],[-.85,.43],[-.91,-.31],[-.43,-.86],[.29,-.93],[.76,-.54],
                 [.82,.58],[.13,.98],[-.64,.76],[-.99,.03],[-.72,-.68],[-.10,-.99],[.61,-.79],[.96,-.25]];
  function impact(ctx,x,y,k,col,heavy,seed){
    if(k<0||k>=1)return;
    const count=heavy?12:6,extent=heavy?24:11;
    ctx.globalAlpha=Math.min(1,(1-k)*2);
    if(k<.4){
      const r=Math.max(1,Math.round((1-k/.4)*(heavy?7:4)));
      puff(ctx,x,y,r,col[2]);gleam(ctx,x,y,r+1,col[3]);
    }
    for(let i=0;i<count;i++){
      const [dx,dy]=scatter[(i+seed)%16];
      const reach=(.22+k)*extent*(.72+(i%3)*.16);
      const sx=x+dx*reach,sy=y+dy*reach*.79;
      dash(ctx,sx,sy,sx+dx*(heavy?4:2)*(1-k),sy+dy*(heavy?4:2)*(1-k),heavy&&i%3===0?3:2,col[1+i%3]);
    }
    if(heavy){
      ctx.globalAlpha=(1-k)*.42;
      for(let i=0;i<16;i++){
        const [dx,dy]=scatter[i];
        pixel(ctx,x+dx*(4+k*24),y+4+dy*(2+k*10),3,1,col[2]);
      }
    }
  }
  function destruction(ctx,fx,k,col,seed){
    const building=architecture.has(fx.targetType||fx.sourceType)||(!fx.targetType&&fx.life>=.7);
    const big=(fx.targetType||fx.sourceType)==='hq';
    const heavy=building||fx.targetType==='heavy',x=fx.tx,y=fx.ty;
    impact(ctx,x,y,Math.min(1,k*1.4),col,heavy,seed);
    if(!building)return;
    const spread=big?53:34;
    for(let i=0;i<12;i++){
      const [dx,dy]=scatter[(i+seed)%16];
      const shift=i*.041, age=(k-shift)/(1-shift);
      if(age<0)continue;
      const ax=x+dx*spread*.50+age*dx*11,ay=y+dy*spread*.32-age*(big?32:23);
      const r=Math.max(2,Math.round((big?5:3)+age*(big?7:5)));
      ctx.globalAlpha=Math.sin(age*Math.PI)*.65;
      puff(ctx,ax,ay,r,'#656071');
      puff(ctx,ax-1,ay-2,Math.max(2,r-2),i%2?'#8d7b80':'#a08c83');
      if(age<.40){
        ctx.globalAlpha=(.40-age)*2;
        puff(ctx,ax,ay,Math.max(2,r-2),col[2]);pixel(ctx,ax-1,ay-2,3,3,col[3]);
      }
    }
    ctx.globalAlpha=Math.min(1,2*(1-k));
    const material=base[fx.faction]||base.velari;
    for(let i=0;i<(big?16:10);i++){
      const [dx,dy]=scatter[(i+seed)%16],ax=x+dx*spread*k;
      const ay=y+(dy*.45-.68)*spread*k+spread*.92*k*k;
      const n=i%3===0?4:3;
      pixel(ctx,ax,ay,n+1,n,material.shadow);
      pixel(ctx,ax,ay,n,2,i%2?material.mid:material.left);
    }
  }
  function markPulse(ctx,x,y,k){
    const radius=4+Math.round(11*(1-k)*(1-k)),bright=k<.45?'#f8deff':'#d2b1f4';
    ctx.globalAlpha=Math.min(1,4*k+.3,2.8*(1-k));
    for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const sx=x+dx*radius,sy=y+dy*radius*.65;
      dash(ctx,sx,sy,sx-dx*3,sy,2,bright);dash(ctx,sx,sy,sx,sy-dy*2,2,'#b48ad6');
    }
    if(k>.36&&k<.68)gleam(ctx,x,y,3,'#fff1dc');
  }
  function marked(ctx,e,t,x,y,scale=1){
    if(e.markedBy!=='velari'||!(e.markedUntil>t)||e.hp<=0)return;
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    ctx.globalAlpha=Math.min(1,(e.markedUntil-t)*5);
    const lit=Math.sin(t*5.4+e.id)>.25?'#f7daff':'#d3a7ed';
    // The broken diamond is legible beside the health bar, including over pale terrain.
    pixel(ctx,2,-2,11,4,'#382740');pixel(ctx,4,-4,7,8,'#382740');pixel(ctx,6,-5,3,10,'#382740');
    pixel(ctx,3,-1,2,2,lit);pixel(ctx,10,-1,2,2,lit);
    pixel(ctx,5,-3,2,2,lit);pixel(ctx,8,-3,2,2,lit);
    pixel(ctx,5,1,2,2,'#bb84d5');pixel(ctx,8,1,2,2,'#bb84d5');
    pixel(ctx,7,-4,1,1,'#ffe7fc');pixel(ctx,7,3,1,1,'#dba7eb');pixel(ctx,7,-1,1,2,'#ffe7a8');
    ctx.restore();
  }
  function volleyWatch(ctx,x,y,scale,remaining){
    if(!(remaining>0))return;
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    // A tiny rack of three crystals empties from right to left as the ambush window closes.
    pixel(ctx,-7,-2,14,5,'#332a43');pixel(ctx,-6,3,12,1,'#332a43');
    for(let i=0;i<3;i++){
      const dx=-5+i*4,lit=remaining>i*8/3;
      pixel(ctx,dx,-1,2,1,lit?'#f9e6fa':'#6c5a77');
      pixel(ctx,dx-1,0,3,1,lit?'#d3a8ed':'#62526d');
      pixel(ctx,dx,1,2,1,lit?'#aa7bc7':'#56475f');
    }
    ctx.restore();
  }
  function rallyFlag(ctx,x,y,tone,resource,scale){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    const fill=resource==='ore'?'#eec485':resource==='crystal'?'#dfb7f9':tone;
    pixel(ctx,-3,0,8,2,'#283138');pixel(ctx,-1,-14,3,15,'#272831');
    pixel(ctx,0,-13,1,14,'#eee4c5');pixel(ctx,1,-15,12,11,'#272831');pixel(ctx,13,-14,2,9,'#272831');
    pixel(ctx,2,-14,10,9,fill);pixel(ctx,12,-13,2,3,fill);pixel(ctx,12,-8,2,2,fill);
    if(resource){
      // A faceted vertical crystal and a squat ore seam distinguish mining orders.
      if(resource==='crystal'){
        pixel(ctx,7,-13,2,2,'#593e70');pixel(ctx,6,-11,4,3,'#593e70');pixel(ctx,7,-8,2,2,'#593e70');
        pixel(ctx,7,-11,1,2,'#ffedff');
      }else{
        pixel(ctx,6,-11,4,2,'#77523e');pixel(ctx,4,-9,7,2,'#77523e');
        pixel(ctx,6,-10,2,1,'#fff0c4');
      }
    }else{
      pixel(ctx,5,-12,2,5,'#413747');pixel(ctx,7,-11,2,3,'#413747');pixel(ctx,9,-10,1,1,'#413747');
    }
    ctx.restore();
  }
  function escortBadge(ctx,x,y,scale){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    // Two folded wings shelter the gold point above the protected unit.
    pixel(ctx,-7,-12,4,8,'#26363a');pixel(ctx,3,-12,4,8,'#26363a');
    pixel(ctx,-5,-10,10,7,'#26363a');pixel(ctx,-3,-3,6,2,'#26363a');pixel(ctx,-1,-1,2,1,'#26363a');
    pixel(ctx,-6,-11,2,5,'#bbebd2');pixel(ctx,4,-11,2,5,'#bbebd2');
    pixel(ctx,-4,-7,2,3,'#8fc7b8');pixel(ctx,2,-7,2,3,'#8fc7b8');
    pixel(ctx,-2,-4,4,2,'#9cd5bf');pixel(ctx,-1,-9,2,4,'#f2d797');
    ctx.restore();
  }
  function guardPennant(ctx,x,y,faction,scale,engaged){
    const dye=base[faction],edge='#29303a';
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    // A hanging standard with a faction seal, distinct from the horizontal rally arrow.
    pixel(ctx,-6,0,16,2,'#3431399c');
    pixel(ctx,-5,-21,3,22,edge);pixel(ctx,-4,-20,1,20,'#d9c7a2');
    pixel(ctx,-6,-19,18,3,edge);pixel(ctx,-5,-18,16,1,engaged?'#ffb36f':dye.metal);
    pixel(ctx,-2,-16,13,11,edge);pixel(ctx,0,-5,9,2,edge);pixel(ctx,2,-3,5,2,edge);
    pixel(ctx,-1,-16,11,9,dye.deep);pixel(ctx,0,-15,9,9,dye.main);
    pixel(ctx,1,-6,7,2,dye.main);pixel(ctx,3,-4,3,2,dye.metal);
    pixel(ctx,8,-15,1,8,dye.deep);pixel(ctx,0,-16,9,1,dye.light);
    if(faction==='velari'){
      pixel(ctx,4,-14,2,6,dye.glow);pixel(ctx,3,-12,4,2,dye.light);pixel(ctx,4,-12,1,2,dye.deep);
    }else if(faction==='cinder'){
      pixel(ctx,5,-14,2,4,dye.metal);pixel(ctx,3,-12,2,3,dye.glow);pixel(ctx,4,-10,3,2,dye.light);
    }else{
      pixel(ctx,2,-13,2,2,dye.glow);pixel(ctx,3,-12,2,2,dye.light);pixel(ctx,4,-10,1,2,dye.glow);
      pixel(ctx,5,-12,2,2,dye.light);pixel(ctx,6,-14,2,2,dye.glow);
    }
    pixel(ctx,-5,-21,3,2,engaged?'#ffe3a5':dye.light);
    ctx.restore();
  }
  function repairBadge(ctx,x,y,scale){
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    // A short lower-left tail points back to the worker beside the open wrench.
    const edge='#382b33';
    pixel(ctx,-5,-6,10,12,edge);pixel(ctx,-6,-4,12,8,edge);
    pixel(ctx,-6,4,4,2,edge);pixel(ctx,-7,6,3,1,edge);
    dash(ctx,-4,3,1,-2,2,'#edbc72');pixel(ctx,-4,3,1,1,'#fff0bc');
    pixel(ctx,0,-5,2,4,'#ffdc87');pixel(ctx,1,-2,4,2,'#e5a85e');
    pixel(ctx,4,-4,1,3,'#ffdc87');pixel(ctx,1,-5,1,1,'#fff3bd');
    ctx.restore();
  }
  function patientBud(ctx,x,y,halfWidth,scale){
    ctx.save();ctx.translate(Math.round(x+halfWidth+1),Math.round(y-3));ctx.scale(scale,scale);
    pixel(ctx,0,-2,8,4,'#344a42');pixel(ctx,3,-5,6,7,'#344a42');
    pixel(ctx,2,0,3,2,'#adca91');pixel(ctx,4,-3,4,3,'#ebafbc');
    pixel(ctx,5,-4,3,2,'#ffe3cd');pixel(ctx,3,-1,2,2,'#f4c8ba');
    ctx.restore();
  }
  function healCharge(ctx,x,y,scale,charge){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    pixel(ctx,1,-4,6,9,'#32433e');pixel(ctx,0,-2,9,5,'#32433e');
    const petals=[[3,-3],[5,-1],[3,1],[1,-1]];
    for(let i=0;i<petals.length;i++){
      const [px,py]=petals[i];
      pixel(ctx,px,py,3,3,charge>=(i+1)/4?'#d6e6b3':'#687c72');
    }
    pixel(ctx,3,-1,3,3,charge>=1?'#ffdbac':'#4a5953');
    ctx.restore();
  }
  function dewBud(ctx,x,y,scale){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    pixel(ctx,-1,-6,3,10,'#1e464b');pixel(ctx,-3,-3,7,6,'#1e464b');
    pixel(ctx,-1,-4,2,5,'#e6ffe9');pixel(ctx,-2,-1,3,3,'#9fe6dd');
    pixel(ctx,1,-1,2,2,'#66b9c4');pixel(ctx,0,3,1,1,'#ddd99b');
    ctx.restore();
  }
  function dewWard(ctx,unit,time,halfWidth,height){
    const ward=unit.dewWard,full=Math.max(0,Math.min(1,ward.shield/ward.capacity));
    const w=halfWidth+2,h=height-2,pulse=Math.sin((time-ward.start)*4);
    ctx.save();ctx.translate(Math.round(unit.x),Math.round(unit.y+3));
    // Two overlapping willow leaves cup the unit. The gap in the silver edge grows as it takes damage.
    for(const side of [-1,1]){
      ctx.save();ctx.scale(side,1);
      ctx.beginPath();ctx.moveTo(-3,0);ctx.quadraticCurveTo(w+6,-5,w,-h*.48);
      ctx.quadraticCurveTo(w-1,-h*.73,1,-h);ctx.quadraticCurveTo(w*.72,-h*.52,w-3,-h*.34);
      ctx.quadraticCurveTo(w-1,-8,-3,0);ctx.closePath();
      ctx.fillStyle=side<0?'#73d7cb58':'#67afc557';ctx.fill();
      ctx.beginPath();ctx.moveTo(-3,0);ctx.quadraticCurveTo(w+6,-5,w,-h*.48);
      ctx.quadraticCurveTo(w-1,-h*.73,1,-h);
      ctx.strokeStyle='#234954d9';ctx.lineWidth=2.8;ctx.stroke();
      ctx.strokeStyle=side<0?'#b4f3dc':'#88d6db';ctx.lineWidth=1.5;
      ctx.setLineDash([h*(.46+.68*full),h*(1-full)+.1]);ctx.lineDashOffset=1+pulse*.5;ctx.stroke();
      const drift=(time*.65+(side+1)*.25)%1;
      pixel(ctx,w*(.68+.21*Math.sin(Math.PI*drift)),-h*(.2+.46*drift),2,2,'#d4ffef');
      ctx.restore();
    }
    dash(ctx,-5,-1,2,2,2,'#4b817c');dash(ctx,5,-1,-1,2,2,'#a9ddbd');
    pixel(ctx,-1,0,3,2,'#f6d995');ctx.restore();
  }
  function dewEffect(ctx,fx,k,patient,labelScale){
    const live=patient?.hp>0,tx=live?patient.x:fx.tx;
    const ty=live?patient.y-(['heavy','specialist'].includes(patient.type)?16:11):fx.ty;
    if(fx.type==='dewCast'){
      const flight=Math.min(1,k/.62),lift=Math.min(18,6+Math.abs(tx-fx.x)*.12);
      // A single pearly bead slides along the silk as the caster ties the far end.
      ctx.globalAlpha=Math.min(1,(1-k)*3);
      for(let i=4;i>=0;i--){
        const t=Math.max(0,flight-i*.065),x=fx.x+(tx-fx.x)*t,y=fx.y+(ty-fx.y)*t-lift*Math.sin(Math.PI*t);
        if(i){pixel(ctx,x,y,3,2,i%2?'#76c4b7':'#b3e8c4')}
        else{puff(ctx,x,y,3,'#5fa2ac');pixel(ctx,x-1,y-3,2,3,'#e7ffea')}
      }
      if(k>.55)gleam(ctx,tx,ty,2+Math.round(4*(1-k)),'#d2ffe9');
    }else if(fx.type==='dewBreak'){
      ctx.globalAlpha=Math.min(1,(1-k)*2);
      for(let i=0;i<6;i++){
        const side=i%2?1:-1,level=Math.floor(i/2);
        const x=tx+side*(6+(9+level*2)*k),y=ty-6+level*5-7*Math.sin(Math.PI*k)+9*k*k;
        dash(ctx,x,y,x+side*(3-level),y+2,2,i%3?'#a5e4de':'#e1f0b1');
      }
    }else{
      const gather=Math.min(1,k/.65);
      ctx.globalAlpha=Math.min(1,(1-k)*3);
      for(let i=0;i<3;i++){
        const a=(i+1)*Math.PI/2+gather*.3,r=(1-gather)*11;
        const x=tx+Math.cos(a)*r,y=ty-9+Math.sin(a)*r+gather*9;
        pixel(ctx,x-1,y-2,3,4,i===1?'#9de7cc':'#c9eed0');pixel(ctx,x,y-3,1,2,'#ecffe1');
      }
      if(live&&labelScale&&fx.amount>0&&k>.29){
        const amount=fx.amount<.1?'<0.1':Math.round(fx.amount*10)/10;
        ctx.translate(Math.round(tx+6*labelScale),Math.round(ty-(13+k*7)*labelScale));
        ctx.scale(labelScale,labelScale);ctx.font='bold 10px monospace';ctx.textAlign='left';ctx.textBaseline='bottom';
        ctx.lineWidth=3;ctx.strokeStyle='#26463d';ctx.strokeText('+'+amount,0,0);
        ctx.fillStyle='#cbf6d3';ctx.fillText('+'+amount,0,0);
      }
    }
  }
  function fallbackMark(ctx,x,y,scale){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
    pixel(ctx,-7,-2,14,4,'#34494c');pixel(ctx,-5,-4,10,8,'#34494c');
    for(const dx of [-3,2]){
      pixel(ctx,dx,-2,2,2,'#c0e5df');pixel(ctx,dx-2,0,2,2,'#c0e5df');pixel(ctx,dx,2,2,1,'#80bfc3');
    }
    ctx.restore();
  }
  function bellResonance(ctx,beacon,bell,time,hover,scale,ringAge,tone){
    const wait=bell.nextRing-time,soon=wait>=0&&wait<=5;
    const sounding=ringAge>=0&&ringAge<1.35;
    if(!hover&&!soon&&!sounding)return;
    const radius=bell.radius,turn=Math.PI*2;
    ctx.save();ctx.translate(beacon.x,beacon.y);
    if(soon||hover){
      const beat=soon?(1-wait/5)*(.5+.5*Math.cos(wait*turn)):0;
      ctx.beginPath();ctx.arc(0,0,radius,0,turn);
      ctx.setLineDash([6/scale,5/scale]);ctx.strokeStyle='#403039';ctx.lineWidth=2.7/scale;ctx.globalAlpha=.62;ctx.stroke();
      ctx.strokeStyle='#ffe0a3';ctx.lineWidth=1.2/scale;ctx.globalAlpha=.51+beat*.4;ctx.stroke();ctx.setLineDash([]);
      for(let i=0;i<4;i++){
        ctx.save();ctx.rotate(i*turn/4);
        ctx.fillStyle='#46343e';ctx.fillRect(radius-3,-3,6,6);
        ctx.fillStyle='#f7d598';ctx.fillRect(radius-2,-1,4,2);ctx.fillRect(radius-1,-2,2,4);
        ctx.restore();
      }
    }
    if(sounding){
      for(let i=0;i<2;i++){
        const u=(ringAge-i*.22)/1.12;
        if(u<=0||u>=1)continue;
        const r=6+(radius-6)*(1-(1-u)*(1-u));
        ctx.beginPath();ctx.arc(0,0,r,0,turn);
        ctx.globalAlpha=Math.sin(Math.PI*u)*(i===0 ? .8 : .38);
        ctx.strokeStyle=i?(tone||'#eac984'):'#ffe0a1';ctx.lineWidth=(i?1.6:2.3)/scale;ctx.stroke();
      }
    }
    ctx.restore();
  }
  function marchTrail(ctx,e,time){
    const next=e.path[e.pathIndex];
    let dx=next?next.x-e.x:0,dy=next?next.y-e.y:0;
    const length=Math.hypot(dx,dy);
    if(length>.5){dx/=length;dy/=length}else{dx=e.facing||1;dy=0}
    const step=(time*2.8+e.id*.381)%1,fade=Math.min(1,e.marchUntil-time);
    ctx.save();
    for(let i=0;i<3;i++){
      const u=(step+i)/3,back=6+u*16,side=i%2?3:-3;
      const x=e.x-dx*back-dy*side,y=e.y+1-dy*back+dx*side;
      ctx.globalAlpha=fade*(1-u)*.94;
      pixel(ctx,x-1,y,4,2,'#6d504a');pixel(ctx,x,y-1,3,2,'#ffe19c');
    }
    ctx.restore();
  }
  function fallingAsh(ctx,seed,time,detailScale){
    const t=Math.max(0,Math.min(1,(time-seed.start)/(seed.end-seed.start)));
    const fromY=seed.fromY-18,dx=seed.x-seed.fromX,dy=seed.y-fromY;
    const rise=26+Math.min(32,Math.hypot(dx,dy)*.2);
    const height=u=>fromY+dy*u-4*rise*u*(1-u);
    ctx.save();
    // The seed curls in a little shell of coal; its three tail sparks follow the launch arc.
    for(let i=3;i>=1;i--){
      const u=t-i*.029;
      if(u<0)continue;
      ctx.globalAlpha=1-.2*i;
      pixel(ctx,seed.fromX+dx*u,height(u),i===1?3:2,2,i%2?'#ffd182':'#e97763');
    }
    ctx.globalAlpha=1;
    ctx.translate(Math.round(seed.fromX+dx*t),Math.round(height(t)));
    ctx.scale(detailScale,detailScale);
    pixel(ctx,-3,-5,6,10,'#4c3442');pixel(ctx,-5,-2,10,5,'#4c3442');
    pixel(ctx,-4,-2,3,5,'#b3524d');pixel(ctx,1,-3,3,5,'#e18259');
    pixel(ctx,-2,-4,3,7,'#ffd07c');pixel(ctx,-1,-5,2,4,'#fff0ad');
    pixel(ctx,-3,2,6,2,'#8e4d4c');pixel(ctx,-1,2,2,2,'#d88756');
    ctx.restore();
  }
  function ashPetals(ctx,fx,k,detailScale){
    const x=fx.footX,y=fx.footY,radius=fx.radius;
    const open=Math.min(1,k*2.6),reach=radius*(.1+.75*(1-(1-open)*(1-open)));
    const lift=11*Math.sin(Math.PI*open),fade=Math.min(1,(1-k)*2.1);
    // Six narrow, stepped petals spread from a fixed seed. Ash stays inside the damage circle.
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3+.15,dx=Math.cos(a),dy=Math.sin(a);
      const tx=x+dx*reach,ty=y+dy*reach-lift;
      const mx=x+dx*reach*.54-dy*5*open,my=y+dy*reach*.54+dx*5*open-lift*.8;
      const width=2+3*Math.sin(open*Math.PI*.74);
      const shoulderX=tx-dx*reach*.33,shoulderY=ty-dy*reach*.33;
      ctx.globalAlpha=fade*.78;ctx.fillStyle=i%2?'#cb6956':'#d67956';
      ctx.beginPath();ctx.moveTo(Math.round(mx),Math.round(my));
      ctx.lineTo(Math.round(shoulderX-dy*width),Math.round(shoulderY+dx*width));
      ctx.lineTo(Math.round(tx),Math.round(ty));
      ctx.lineTo(Math.round(shoulderX+dy*width*.65),Math.round(shoulderY-dx*width*.65));ctx.closePath();ctx.fill();
      ctx.globalAlpha=fade*.83;
      dash(ctx,x+dx*3,y+dy*3,mx,my,2,'#bd5955');
      dash(ctx,mx,my,tx,ty,2,'#f6ac69');
      ctx.globalAlpha=fade;
      dash(ctx,tx-dx*7-dy*width,ty-dy*7+dx*width,tx,ty,2,'#e98662');
      dash(ctx,tx,ty,tx-dx*5+dy*width,ty-dy*5-dx*width,2,'#ffd488');
      if(k>.22){
        const drift=(k-.22)/.78;
        pixel(ctx,tx+dx*drift*5,ty-9*drift,2,2,i%2?'#ffca81':'#d48b78');
      }
    }
    ctx.globalAlpha=fade;
    puff(ctx,x,y,Math.max(2,7*(1-k)),'#df7857');
    gleam(ctx,x,y-1,Math.ceil(4*(1-k)),'#fff1b8');
    for(const hit of fx.hits){
      const h=architecture.has(hit.type)?(hit.type==='hq'?44:27):hit.type==='heavy'||hit.type==='specialist'?16:11;
      const s=detailScale||1,atY=hit.y-h-3*k;
      ctx.save();ctx.translate(Math.round(hit.x),Math.round(atY));ctx.scale(s,s);
      // Marks stay at confirmed impact positions even if a surviving unit walks out afterwards.
      for(const sign of [-1,1]){
        const edge=sign*(4+4*k);
        pixel(ctx,edge-1,-3,3,6,'#673e46');pixel(ctx,edge,-2,2,4,'#ffd18b');
      }
      ctx.restore();
    }
  }
  function pressureWave(ctx,fx,entities,detailScale){
    // The shell reaches its target at the end of the visible arc.
    const arrival=0.27*.76;
    if(fx.age<arrival)return;
    const k=(fx.age-arrival)/(fx.life-arrival);
    const r=(fx.radius||35)*(.12+.88*Math.sin(k*Math.PI/2)),x=fx.footX??fx.tx,y=fx.footY??fx.ty;
    ctx.globalAlpha=Math.min(1,3*(1-k));
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8,dx=Math.cos(a),dy=Math.sin(a);
      const ax=x+dx*r,ay=y+dy*r;
      dash(ctx,ax,ay,ax-dy*(2+3*k),ay+dx*(2+3*k),i%2?1:2,i%2?'#d89765':'#f6c47a');
      if(i%3===0){
        const spread=r*.74;
        pixel(ctx,x+dx*spread,y+dy*spread-9*Math.sin(k*Math.PI),2,2,'#ffe5ad');
      }
    }
    if(k<.62){
      const intensity=1-k/.62;
      puff(ctx,fx.tx,fx.ty,3+intensity*4,'#e4804c');
      gleam(ctx,fx.tx,fx.ty,1+Math.floor(intensity*6),'#ffedb3');
    }
    for(const hit of fx.hits||[]){
      const unit=entities?.get(hit.id),victim=unit?.hp>0?unit:hit;
      const height=architecture.has(hit.type)?(hit.type==='hq'?47:29):hit.type==='heavy'||hit.type==='specialist'?16:11;
      const hx=victim.x,hy=victim.y-height;
      const dx=hx-fx.tx,dy=hy-fx.ty;
      if(k<.48){
        // Each short fragment travels only toward an entity that actually took splash damage.
        const travel=Math.min(1,k/.3),tail=Math.max(0,travel-.24);
        dash(ctx,fx.tx+dx*tail,fx.ty+dy*tail,hx-dx*(1-travel),hy-dy*(1-travel),2,'#ffe3a2');
      }
      if(k>.17){
        const glow=Math.min(1,(k-.17)*6,(1-k)*4),s=detailScale||1;
        ctx.save();ctx.globalAlpha=glow;ctx.translate(Math.round(hx),Math.round(hy));ctx.scale(s,s);
        for(const sign of [-1,1]){
          const reach=4+Math.round(3*k);
          pixel(ctx,sign*reach-2,-2,4,3,'#5b353e');pixel(ctx,sign*reach-1,-2,2,2,'#ffd28c');
          pixel(ctx,sign*(reach-2),1,2,2,'#e88859');
        }
        if(k<.6)gleam(ctx,0,0,2,'#fff2c0');
        ctx.restore();
      }
    }
  }
  function repairStitch(ctx,fx,k,col){
    const x=fx.x+(fx.tx-fx.x)*.38,y=fx.y+(fx.ty-fx.y)*.38;
    // A bright rivet catches on the wall, followed by three short metallic filings.
    if(k<.4){
      const u=k/.4;
      dash(ctx,fx.x,fx.y,x-(x-fx.x)*(1-u),y-(y-fx.y)*(1-u),1,col[2]);
    }else{
      const u=(k-.4)/.6;
      ctx.globalAlpha=1-u;
      gleam(ctx,x,y,Math.round(3-2*u),'#fff1ae');
      for(let i=-1;i<=1;i++){
        const dx=i*(2+7*u),dy=-2-(1-Math.abs(i)*.25)*6*Math.sin(u*Math.PI);
        pixel(ctx,x+dx,y+dy,2,1,i===0?col[2]:'#ebc879');
      }
    }
  }
  function healingThreads(ctx,fx,k,patient,labelScale){
    const live=patient?.hp>0;
    const tx=live?patient.x:fx.tx;
    const ty=live?patient.y-(patient.type==='heavy'||patient.type==='specialist'?16:11):fx.ty;
    const dx=tx-fx.x,dy=ty-fx.y,d=Math.max(1,Math.hypot(dx,dy));
    const hx=-dy/d,hy=dx/d;
    // Each thread uncurls in a short arc, meets its partner, and sheds pollen at the recipient.
    const flight=fx.age/.42;
    if(flight<.45){
      ctx.globalAlpha=1-flight/.45;
      gleam(ctx,fx.x,fx.y-1,3,'#f6efbb');
    }
    for(let i=0;i<8;i++){
      const u=flight-i*.053;
      if(u<0||u>1)continue;
      const r=Math.sin(u*Math.PI)*Math.sin(u*Math.PI*2)*5;
      const x=fx.x+dx*u,y=fx.y+dy*u-8*Math.sin(u*Math.PI);
      ctx.globalAlpha=(1-i/11)*Math.min(1,flight*6+.2);
      pixel(ctx,x+r*hx,y+r*hy,3,2,'#d4f0ae');
      pixel(ctx,x-r*hx,y-r*hy,2,2,'#e6acc0');
    }
    if(flight>.84){
      const bloom=Math.min(1,(fx.age-.42*.84)/.48);
      ctx.globalAlpha=1-bloom;
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5+bloom*.45,r=2+7*bloom;
        pixel(ctx,tx+Math.cos(a)*r,ty+Math.sin(a)*r-bloom*6,3,2,i%2?'#f5d1ca':'#d8f4b2');
      }
      gleam(ctx,tx,ty-bloom*5,2,'#f2f9cb');
    }
    if(labelScale&&live&&fx.amount>0&&k>.19){
      const amount=fx.amount<.1?'<0.1':String(Math.round(fx.amount*10)/10);
      const label='+'+amount;
      ctx.globalAlpha=Math.min(1,(k-.19)*9,(1-k)*5);
      ctx.translate(Math.round(tx+9*labelScale),Math.round(ty-17-k*8*labelScale));
      ctx.scale(labelScale,labelScale);ctx.font='bold 10px monospace';ctx.textBaseline='bottom';ctx.textAlign='left';
      const width=Math.ceil(ctx.measureText(label).width)+6;
      pixel(ctx,0,-11,width,13,'#263939');pixel(ctx,0,-8,1,7,'#99cdaa');
      ctx.fillStyle='#d8f6b7';ctx.fillText(label,3,1);
    }
  }
  function specialistShot(ctx,fx,k,col,seed){
    if(k>=.76){impact(ctx,fx.tx,fx.ty,(k-.76)/.24,col,false,seed);return;}
    const u=k/.76,dx=fx.tx-fx.x,dy=fx.ty-fx.y,d=Math.max(1,Math.hypot(dx,dy));
    const vx=dx/d,vy=dy/d,x=fx.x+dx*u;
    const y=fx.y+dy*u-Math.sin(u*Math.PI)*(fx.faction==='cinder'?19:6);
    if(fx.faction==='cinder'){
      for(let i=3;i>0;i--){
        const a=Math.max(0,u-i*.048);
        ctx.globalAlpha=.45-i*.07;
        puff(ctx,fx.x+dx*a,fx.y+dy*a-Math.sin(a*Math.PI)*19,2+i,'#b59480');
      }
      ctx.globalAlpha=1;
      puff(ctx,x,y,4,'#935a4e');pixel(ctx,x-3,y-2,5,3,'#f49353');pixel(ctx,x-1,y-3,3,2,'#ffdf8b');
      return;
    }
    if(fx.faction==='velari'){
      for(let i=0;i<2;i++){
        const off=(i?1:-1)*Math.sin(u*Math.PI)*2;
        dash(ctx,x-vx*10-vy*off,y-vy*10+vx*off,x-vx*4,y-vy*4,1,i?'#86cacb':'#c79ce6');
      }
      dash(ctx,x-vx*4,y-vy*4,x+vx*3,y+vy*3,2,'#d2b3f5');
      pixel(ctx,x,y,2,2,'#fff3d9');return;
    }
    dash(ctx,x-vx*7,y-vy*7,x,y,1,'#88bd88');
    pixel(ctx,x-2,y,4,2,'#e4aabe');pixel(ctx,x,y-2,2,3,'#fae1c3');
  }
  function markBonusLabel(ctx,fx,x,y,align,scale){
    if(fx.age<=.15||fx.age>=fx.life)return;
    const label=fx.amount<.05?'표식 <0.1':'표식 +'+Math.round(fx.amount*10)/10;
    ctx.save();
    ctx.globalAlpha=Math.min(1,(fx.life-fx.age)*4.5,(fx.age-.15)*13);
    ctx.translate(x,y);ctx.scale(scale,scale);
    ctx.textAlign=align;ctx.textBaseline='bottom';ctx.font='bold 10px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    const rise=-5*fx.age/fx.life;
    ctx.strokeStyle='#382b42';ctx.lineWidth=2.8;ctx.strokeText(label,0,rise);
    ctx.fillStyle=fx.commanded?'#ffdf9c':'#ead3fa';ctx.fillText(label,0,rise);
    ctx.restore();
  }
  function volleyShot(ctx,fx,k){
    const flight=.7,dx=fx.tx-fx.x,dy=fx.ty-fx.y,d=Math.max(1,Math.hypot(dx,dy));
    const vx=dx/d,vy=dy/d;
    if(k<flight){
      const u=k/flight,ax=fx.x+dx*u,ay=fx.y+dy*u;
      const tail=Math.min(17,d*u),split=Math.sin(u*Math.PI)*3;
      for(const sign of [-1,1]){
        const wingX=ax-vx*tail-vy*sign*split,wingY=ay-vy*tail+vx*sign*split;
        dash(ctx,wingX,wingY,ax,ay,2,'#7d558e');
        dash(ctx,wingX,wingY,ax,ay,1,sign<0?'#d7b1eb':'#f6c37f');
      }
      dash(ctx,ax-vx*Math.min(4,tail),ay-vy*Math.min(4,tail),ax,ay,2,'#fff0cb');
      return;
    }
    const u=(k-flight)/(1-flight),reach=2+9*u;
    ctx.globalAlpha=Math.min(1,(1-u)*2.6);
    for(const sign of [-1,1]){
      const sx=fx.tx+vx*2-vy*sign*reach,sy=fx.ty+vy*2+vx*sign*reach;
      dash(ctx,sx,sy,sx-vx*4+vy*sign,sy-vy*4-vx*sign,2,'#603f70');
      dash(ctx,sx,sy,sx-vx*3,sy-vy*3,1,fx.markBonus?'#ffe2a3':'#ceb3ef');
    }
    if(u<.55)gleam(ctx,fx.tx,fx.ty,2,'#ffefde');
  }
  function combatEffect(ctx,fx,patient,labelScale,entities){
    if(!fx||!(fx.life>0))return;
    const k=Math.max(0,Math.min(1,fx.age/fx.life));
    if(k===1)return;
    const col=battleColors[fx.faction]||battleColors.velari;
    const heavy=fx.sourceType==='heavy',seed=(Math.abs(Math.round(fx.tx+fx.y))%16);
    ctx.save();
    if(fx.type==='shot'&&fx.commanded)volleyShot(ctx,fx,k);
    else if(fx.type==='mark')markPulse(ctx,fx.tx,fx.ty,k);
    else if(fx.type==='repair')repairStitch(ctx,fx,k,col);
    else if(fx.type==='splash')pressureWave(ctx,fx,entities,labelScale);
    else if(fx.type==='ashImpact')ashPetals(ctx,fx,k,labelScale);
    else if(fx.type==='dewCast'||fx.type==='dewBreak'||fx.type==='dewMend')dewEffect(ctx,fx,k,patient,labelScale);
    else if(fx.type==='heal')healingThreads(ctx,fx,k,patient,labelScale);
    else if(fx.type==='shot'&&fx.sourceType==='specialist')specialistShot(ctx,fx,k,col,seed);
    else if(fx.type==='burst')destruction(ctx,fx,k,col,seed);
    else if(fx.type==='hit')impact(ctx,fx.tx,fx.ty,k,col,heavy,seed);
    else if(fx.type==='shot'){
      const flight=.7,u=Math.min(1,k/flight),dx=fx.tx-fx.x,dy=fx.ty-fx.y;
      const dist=Math.max(1,Math.hypot(dx,dy)),vx=dx/dist,vy=dy/dist;
      const lift=fx.faction==='cinder'?(heavy?25:12):fx.faction==='myren'?(heavy?14:7):heavy?8:3;
      const x=fx.x+dx*u,y=fx.y+dy*u-Math.sin(Math.PI*u)*lift;
      if(k<flight){
        if(fx.faction==='cinder'){
          for(let i=1;i<=(heavy?5:3);i++){
            const a=Math.max(0,u-i*.035),ax=fx.x+dx*a,ay=fx.y+dy*a-Math.sin(Math.PI*a)*lift;
            ctx.globalAlpha=.57-i*.07;
            puff(ctx,ax,ay,heavy?3+i*.3:2,i===1?col[1]:'#95898a');
          }
          ctx.globalAlpha=1;
          puff(ctx,x,y,heavy?5:3,col[0]);puff(ctx,x,y,heavy?4:2,col[1]);
          pixel(ctx,x-1,y-2,heavy?4:2,2,col[3]);
          if(heavy)pixel(ctx,x+vx*3,y+vy*3,2,2,col[2]);
        }else if(fx.faction==='myren'){
          const n=heavy?3:1;
          for(let i=0;i<n;i++){
            const curl=(i-1)*Math.sin(Math.PI*u)*(heavy?8:0);
            const sx=x-vy*curl,sy=y+vx*curl,tail=heavy?9:6;
            ctx.globalAlpha=.60;dash(ctx,sx-vx*tail,sy-vy*tail,sx,sy,2,col[1]);
            ctx.globalAlpha=1;dash(ctx,sx-vx*3,sy-vy*3,sx+vx*2,sy+vy*2,3,col[2]);
            pixel(ctx,sx+vx*3,sy+vy*3,2,2,col[3]);
          }
        }else{
          const length=heavy?20:12;
          ctx.globalAlpha=.48;dash(ctx,x-vx*length,y-vy*length,x,y,heavy?3:2,col[1]);
          ctx.globalAlpha=1;
          for(let i=-4;i<=4;i++){
            const w=Math.max(1,(heavy?5:3)-Math.abs(i));
            dash(ctx,x+vx*i-vy*w*.5,y+vy*i+vx*w*.5,x+vx*i+vy*w*.5,y+vy*i-vx*w*.5,2,i<0?col[1]:col[2]);
          }
          dash(ctx,x,y,x+vx*4,y+vy*4,2,col[3]);
          if(heavy){
            const orbit=Math.sin(Math.PI*3*u)*6;
            for(const sign of [-1,1])pixel(ctx,x-5*vx+sign*vy*orbit,y-5*vy-sign*vx*orbit,3,3,col[2]);
          }
        }
      }else impact(ctx,fx.tx,fx.ty,(k-flight)/(1-flight),col,heavy,seed);
    }
    if(fx.markBonus&&!fx.commanded&&k>.58){
      // A second, amber fracture flashes when the marked target really takes bonus damage.
      const phase=(k-.58)/.42,reach=3+Math.round(phase*6);
      ctx.globalAlpha=Math.min(1,(1-phase)*3);
      for(const sign of [-1,1]){
        const ax=fx.tx+sign*reach,ay=fx.ty-sign*reach*.6;
        pixel(ctx,ax-1,ay-2,3,4,'#6a4384');pixel(ctx,ax,ay-2,1,3,'#ffe39b');
      }
      if(phase<.64)gleam(ctx,fx.tx,fx.ty,3,'#fff2d0');
    }
    ctx.restore();
  }
  window.Art={
    ambience,activity,combatEffect,marked,markBonusLabel,volleyWatch,rallyFlag,escortBadge,guardPennant,repairBadge,patientBud,healCharge,dewBud,dewWard,fallbackMark,bellResonance,marchTrail,fallingAsh,
    hitDepot(faction,dx,dy){
      const key='depot/'+faction+'/s0';
      if(!bank.has(key))bank.set(key,makeSprite('depot',faction,false,0));
      const s=bank.get(key),w=s.canvas.width,h=s.canvas.height;
      const x=Math.floor((dx-Math.round(-s.x*s.scale))*w/Math.round(w*s.scale));
      const y=Math.floor((dy-Math.round(-s.y*s.scale))*h/Math.round(h*s.scale));
      if(x<0||x>=w||y<0||y>=h)return false;
      if(!s.pixels)s.pixels=s.canvas.getContext('2d').getImageData(0,0,w,h).data;
      return s.pixels[(y*w+x)*4+3]>=150;
    },
    draw(ctx,type,faction,x,y,opts={}){
      faction=Object.prototype.hasOwnProperty.call(base,faction)?faction:'velari';
      const walk=Boolean(opts.moving&&unitTypes.has(type));
      const animated=walk||type==='specialist';
      const frame=animated?Math.floor((opts.time||0)*(walk?7:2)+(opts.phase||0))%4:0;
      const key=[type,rockTypes.has(type)?'':faction,(walk?'w':'s')+frame].join('/');
      if(!bank.has(key))bank.set(key,makeSprite(type,faction,walk,frame));
      const s=bank.get(key),scale=s.scale*(opts.size??1);
      ctx.save();ctx.imageSmoothingEnabled=false;
      ctx.translate(Math.round(x),Math.round(y));
      if(opts.facing<0&&unitTypes.has(type))ctx.scale(-1,1);
      if(opts.ghost)ctx.globalAlpha*=.58;
      ctx.drawImage(s.canvas,Math.round(-s.x*scale),Math.round(-s.y*scale),Math.round(s.canvas.width*scale),Math.round(s.canvas.height*scale));
      ctx.restore();
    },
    portrait(ctx,faction,x,y,w,h){
      faction=Object.prototype.hasOwnProperty.call(base,faction)?faction:'velari';
      const key='portrait/'+faction;
      if(!bank.has(key))bank.set(key,paintPortrait(faction));
      ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(bank.get(key),x,y,w,h);ctx.restore();
    }
  };
})();
