/* The tide brings a lantern barge to the reed wharf on Lantern Ferry. */
(() => {
  'use strict';
  const channel=[[795,651],[766,620],[735,605],[704,590]];
  const lamps={velari:'#d4b1ff',cinder:'#ffae87',myren:'#a8eac1'};
  const awning=['#e3ba75','#c58b55','#83624d'];
  const outline=[[-29,-5],[-21,-7],[14,-6],[25,-2],[23,3],[12,8],[-13,7],[-23,2]];
  const rim=[[-28,-7],[-21,-5],[13,-6],[24,-2],[12,3],[-13,3],[-22,0]];
  const deck=[[-25,-5],[-15,-9],[9,-9],[20,-4],[10,0],[-13,0]];
  const canopy=[[-15,-16],[-8,-23],[3,-24],[13,-18],[14,-14],[-13,-13]];
  const bob=time=>Math.floor(time*4/3)%3===1?-1:0;

  function inside(x,y,points){
    let hit=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [ax,ay]=points[i],[bx,by]=points[j];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)hit=!hit;
    }
    return hit;
  }

  function hull(ctx,ink,points){
    ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(...points[0]);
    for(const point of points.slice(1))ctx.lineTo(...point);
    ctx.closePath();ctx.fill();
  }
  function lamp(ctx,x,y,color){
    ctx.fillStyle='#1d2c3b';ctx.fillRect(x-3,y-2,7,9);
    ctx.fillStyle='#c38b50';ctx.fillRect(x-3,y-2,7,2);ctx.fillRect(x-2,y+5,5,2);
    ctx.fillStyle=color;ctx.fillRect(x-2,y,5,5);
    ctx.fillStyle='#fff2c4';ctx.fillRect(x-1,y+1,2,3);
  }
  class LanternFerry{
    constructor(){this.departure=-Infinity}
    pose(time,phase,landing,forecast){
      let progress;
      if(phase==='incoming')progress=1-(landing-time)/forecast;
      else if(phase==='open')progress=1;
      else{
        const elapsed=time-this.departure;
        if(elapsed<0||elapsed>=10)return null;
        progress=1-elapsed/10;
      }
      const along=Math.max(0,Math.min(1,progress))*(channel.length-1);
      const i=Math.min(channel.length-2,Math.floor(along)),t=along-i;
      const a=channel[i],b=channel[i+1];
      return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,leaving:phase==='sleep',moving:phase!=='open'};
    }
    hit(x,y,pose,time){
      if(!pose||pose.leaving)return false;
      x-=Math.round(pose.x);y-=Math.round(pose.y)+bob(time);
      if(x < -29||x>25||y < -24||y>8)return false;
      if(inside(x,y,outline)||inside(x,y,rim)||inside(x,y,deck)||inside(x,y,canopy))return true;
      const rect=(left,top,w,h)=>x>=left&&x<left+w&&y>=top&&y<top+h;
      return rect(-22,-22,8,2)||rect(-20,-22,2,19)||rect(-16,-20,1,4)||rect(-19,-17,7,9)||
        rect(-10,-17,2,15)||rect(7,-17,2,16)||rect(-13,-14,25,2)||rect(13,-9,7,7);
    }
    draw(ctx,pose,time,owner){
      if(!pose)return;
      const {x,y,moving,leaving}=pose,color=lamps[owner]||'#ffca78';
      ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(leaving?-1:1,1);
      const tick=Math.floor(time*4);
      ctx.fillStyle='#142d43';ctx.fillRect(-21,3,40,5);ctx.fillRect(-15,7,25,2);
      ctx.fillStyle='#67849b';ctx.fillRect(-23,4,6,1);ctx.fillRect(13,7,7,1);
      if(moving)for(let i=0;i<3;i++){
        const offset=(tick+i*5)%13;
        ctx.globalAlpha=(13-offset)/19;ctx.fillStyle='#9bc5ce';
        ctx.fillRect(18+offset,4+i*3,6+i*2,1);
      }
      ctx.globalAlpha=1;ctx.translate(0,bob(time));
      hull(ctx,'#17212d',outline);
      hull(ctx,'#ae7950',rim);
      hull(ctx,'#705037',deck);
      ctx.fillStyle='#e1ad72';ctx.fillRect(-15,4,24,1);ctx.fillRect(13,2,6,1);
      for(let i=-9;i<=9;i+=6){ctx.fillStyle='#ad8057';ctx.fillRect(i,-6,1,4)}
      ctx.fillStyle='#342b36';ctx.fillRect(-10,-17,2,15);ctx.fillRect(7,-17,2,16);
      hull(ctx,'#493c43',canopy);
      hull(ctx,awning[0],[[-14,-16],[-8,-21],[2,-22],[11,-17],[10,-15],[-12,-14]]);
      ctx.fillStyle=awning[1];ctx.fillRect(-8,-19,3,5);ctx.fillRect(-2,-21,3,6);ctx.fillRect(4,-20,2,5);
      ctx.fillStyle=awning[2];ctx.fillRect(-13,-14,25,2);
      ctx.fillStyle='#8e694a';ctx.fillRect(-20,-22,2,19);ctx.fillRect(-22,-22,8,2);
      ctx.fillStyle='#795842';ctx.fillRect(-16,-20,1,4);
      lamp(ctx,-16,-15,color);
      ctx.fillStyle='#795232';ctx.fillRect(13,-9,7,7);ctx.fillStyle='#dfb371';ctx.fillRect(15,-9,2,7);
      ctx.fillStyle=color;ctx.globalAlpha=.55;ctx.fillRect(-20,8,7,1);ctx.globalAlpha=.32;ctx.fillRect(-17+(tick%3),10,5,1);
      ctx.restore();
    }
    drawMini(ctx,pose,width,height,dpr,owner){
      if(!pose)return;
      const x=Math.round(pose.x*width/1280),y=Math.round(pose.y*height/640),s=Math.max(1,Math.round(dpr));
      ctx.save();ctx.fillStyle='#172436';ctx.fillRect(x-4*s,y-2*s,8*s,4*s);
      ctx.fillStyle='#efbb7a';ctx.fillRect(x-3*s,y,6*s,s);ctx.fillStyle=lamps[owner]||'#ffe4ab';
      ctx.fillRect(x-s,y-2*s,2*s,2*s);ctx.restore();
    }
  }
  window.LanternFerry=LanternFerry;
})();
