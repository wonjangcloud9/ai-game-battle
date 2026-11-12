/* LAST LIGHT — self-contained local battle royale. Three.js r180, MIT. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const show = (id, value = true) => $(id).classList.toggle('hidden', !value);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const clockText = t => `${Math.floor(Math.max(0, t) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, t) % 60).toString().padStart(2, '0')}`;
  const canvas = $('game');
  let renderer;
  try {
    if (typeof THREE === 'undefined') throw new Error('게임 엔진을 찾지 못했습니다. vendor 폴더를 index.html과 함께 보관해 주세요.');
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  } catch (error) {
    $('loading').style.display = 'none';
    show('error');
    if (typeof THREE === 'undefined') $('error-message').textContent = error.message;
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.17;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb4c5b1);
  scene.fog = new THREE.FogExp2(0xb9bf9e, .0042);
  const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .08, 650);
  camera.rotation.order = 'YXZ';
  const staticWorld = new THREE.Group();
  scene.add(staticWorld);
  const colliders = [], mapBuildings = [], loot = [], bots = [], effects = [], floaters = [];
  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  let seed = 90427;
  const rng = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const rand = (a, b) => a + rng() * (b - a);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const materials = new Map();
  function mat(color, roughness = .88) {
    const key = `${color}/${roughness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness, metalness: .04}));
    return materials.get(key);
  }
  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    rock: new THREE.DodecahedronGeometry(1, 0),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    cone: new THREE.ConeGeometry(1, 1, 7),
    plane: new THREE.PlaneGeometry(1, 1)
  };
  function mesh(geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, parent = staticWorld) {
    const obj = new THREE.Mesh(geometry, typeof material === 'number' ? mat(material) : material);
    obj.position.set(x, y, z); obj.scale.set(sx, sy, sz);
    obj.castShadow = true; obj.receiveShadow = true;
    parent.add(obj); return obj;
  }
  function box(x, y, z, w, h, d, color, parent = staticWorld) { return mesh(geo.box, color, x, y, z, w, h, d, parent); }
  function solid(x, y, z, w, h, d, color, parent = staticWorld) {
    const obj = box(x, y, z, w, h, d, color, parent);
    colliders.push({minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y - h / 2, maxY: y + h / 2});
    return obj;
  }
  const hemi = new THREE.HemisphereLight(0xe0f1d6, 0x6d7964, 2.25); scene.add(hemi);
  const sunlight = new THREE.DirectionalLight(0xffd3a0, 3.5);
  sunlight.position.set(-60, 85, -40); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, {left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 240});
  sunlight.shadow.bias = -.0006; sunlight.shadow.normalBias = .035;
  scene.add(sunlight);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {topColor: {value: new THREE.Color(0x487c79)}, horizonColor: {value: new THREE.Color(0xe4cba3)}},
    vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 topColor;uniform vec3 horizonColor;varying vec3 p;void main(){float h=normalize(p).y;gl_FragColor=vec4(mix(horizonColor,topColor,pow(max(0.,h),.65)),1.);}'
  })); scene.add(sky);
  const sun = mesh(geo.sphere, new THREE.MeshBasicMaterial({color: 0xffeac0, fog: false}), -180, 110, -270, 13, 13, 13, scene); sun.castShadow = false;

  function makeTexture(draw, w = 256, h = 256) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4); return tex;
  }
  const groundTexture = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#b6a17a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9500; i++) { ctx.fillStyle = rng() > .5 ? '#d4c39a30' : '#82785925'; ctx.fillRect(rng() * w, rng() * h, rand(1, 3), rand(1, 2)); }
  });
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping; groundTexture.repeat.set(95, 95);
  const ground = mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshStandardMaterial({map: groundTexture, roughness: 1}), 0, -.08, 0);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  // Roads and worn concrete are geometry: no external textures or file fetches.
  box(0, -.01, 5, 12, .04, 165, 0xa69979);
  box(2, .005, 0, 130, .04, 9, 0xa49776);
  box(0, .02, -7, 31, .12, 34, 0xb8b99a);
  for (let z = -74; z < 78; z += 9) box(0, .025, z, .15, .025, 3.7, 0xd3c69e);
  for (let i = 0; i < 28; i++) {
    const a = rng() * TAU, r = rand(135, 210), h = rand(18, 55);
    const rock = mesh(geo.rock, pick([0xa57e59, 0xb88e62, 0xa68b67, 0xc19a6d]), Math.cos(a) * r, h * .28 - 3, Math.sin(a) * r, rand(16, 35), h, rand(15, 28));
    rock.rotation.set(rand(-.15, .15), rng() * 6, rand(-.15, .15));
    rock.castShadow = false;
    if (i % 3 === 0) { const cap = mesh(geo.rock, 0xc5ab80, Math.cos(a) * r, h * .5, Math.sin(a) * r, 15, h * .4, 17); cap.rotation.y = a; cap.castShadow = false; }
  }
  function sign(text, sub, x, y, z, width = 4, color = '#d9dfbc', parent = staticWorld) {
    const texture = makeTexture(ctx => {
      ctx.fillStyle = '#284541'; ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = color; ctx.font = '900 68px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 92);
      ctx.font = '17px monospace'; ctx.fillStyle = '#b1bea1'; ctx.fillText(sub, 256, 144);
      ctx.fillStyle = color; ctx.fillRect(25, 168, 462, 3);
    }, 512, 192);
    const obj = mesh(geo.plane, new THREE.MeshStandardMaterial({map: texture, roughness: 1}), x, y, z, width, width * .375, 1, parent);
    obj.castShadow = false; return obj;
  }
  function building(x, z, w, d, h, number, color = 0xccbea0) {
    const wall = .5, door = 2.5;
    solid(x - w / 2, h / 2, z, wall, h, d, color);
    solid(x + w / 2, h / 2, z, wall, h, d, color);
    solid(x, h / 2, z - d / 2, w, h, wall, color);
    solid(x - (w + door) / 4, h / 2, z + d / 2, (w - door) / 2, h, wall, color);
    solid(x + (w + door) / 4, h / 2, z + d / 2, (w - door) / 2, h, wall, color);
    solid(x, h - .5, z + d / 2, door, 1, wall, color);
    solid(x, h + .15, z, w + .8, .3, d + .8, 0xd6c9ac);
    box(x, .06, z, w, .12, d, 0xa1a38c);
    for(const side of [-1,1])box(x + side * (w + door) / 4, .45, z + d / 2 + .28, (w - door) / 2, .6, .08, 0x54746a);
    box(x, 2.45, z + d / 2 + .6, door + .5, .14, 1.2, 0x4b736a);
    box(x - door / 2 - .09, 1.25, z + d / 2 + .27, .14, 2.5, .1, 0x34554f);
    box(x + door / 2 + .09, 1.25, z + d / 2 + .27, .14, 2.5, .1, 0x34554f);
    for (const side of [-1, 1]) {
      box(x + side * w * .32, 2.1, z + d / 2 + .3, 1.6, 1.2, .12, 0x294d49);
      box(x + side * w * .32, 2.15, z + d / 2 + .38, 1.5, .08, .12, 0xa6b49a);
      box(x + side * w * .32, 2.1, z + d / 2 + .4, .06, 1.2, .1, 0xa6b49a);
    }
    sign(number, 'DEADLANDS DIVISION', x - w * .28, h - .8, z + d / 2 + .28, 2.1);
    box(x + w * .25, h + .65, z - d * .18, 2.4, 1, 1.6, 0x79908a);
    for (let i = 0; i < 5; i++) box(x + w * .25, h + .7, z - d * .18 + .82, 2, .05, .03, 0x334f48).position.y += (i - 2) * .15;
    mesh(geo.cylinder, 0x65766b, x - w * .24, h + .5, z - d * .27, .22, 1, .22);
    mapBuildings.push({x, z, w: w + .8, d: d + .8});
  }
  building(-25, -17, 13, 10, 4.5, '01');
  building(-27, 23, 10, 9, 4, '02', 0xa8af95);
  building(26, 23, 13, 10, 5.4, '03');
  building(29, -27, 11, 12, 4.6, '04', 0xaab29b);
  building(-4, -49, 16, 9, 4.8, '05');
  building(56, 1, 10, 13, 4, '06', 0xc4ae89);
  building(-58, -39, 12, 9, 4, '07');
  building(1, 60, 12, 9, 4, '08', 0xadb59c);

  function beam(a, b, thickness, color, parent = staticWorld) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), mid = av.clone().add(bv).multiplyScalar(.5);
    const obj = box(mid.x, mid.y, mid.z, thickness, av.distanceTo(bv), thickness, color, parent);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize()); return obj;
  }
  // The outpost's silhouette: a braced communications tower and dish.
  const towerZ = -12;
  solid(0, .3, towerZ, 9, .6, 9, 0x8e9d89);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    beam([sx * 3, .6, towerZ + sz * 3], [sx * 1.9, 22, towerZ + sz * 1.9], .28, 0x415e57);
    solid(sx * 3, 1, towerZ + sz * 3, .6, 2, .6, 0x4f665a);
  }
  for (let y = 2; y < 22; y += 4) for (const side of [-1, 1]) {
    const r = 3 - y / 22;
    beam([-r, y, towerZ + side * r], [r - .18, y + 4, towerZ + side * (r - .18)], .15, 0x5b6f5d);
    beam([side * r, y, towerZ - r], [side * (r - .18), y + 4, towerZ + r - .18], .15, 0x5b6f5d);
    box(0, y, towerZ + side * r, r * 2, .12, .14, 0x435d54);
  }
  box(0, 21, towerZ, 5.5, .28, 5.5, 0x879980);
  box(0, 22.7, towerZ, 2.9, 3.2, 2.7, 0xc8bb95);
  box(0, 23, towerZ + 1.38, 2.5, .9, .05, 0x2f5951);
  box(0, 24.4, towerZ, 3.5, .3, 3.3, 0x395c53);
  mesh(geo.cylinder, 0x4e6857, 0, 27, towerZ, .12, 6, .12);
  const beacon = mesh(geo.sphere, new THREE.MeshBasicMaterial({color: 0xff7750}), 0, 30.1, towerZ, .22, .22, .22, scene);
  const dish = mesh(new THREE.SphereGeometry(3.2, 18, 10, 0, TAU, 0, Math.PI * .38), new THREE.MeshStandardMaterial({color: 0xd8ceb1, side: THREE.DoubleSide, roughness: .6}), 3.2, 17.7, towerZ, 1, .6, 1);
  dish.rotation.z = -1.1; dish.rotation.x = .4;
  beam([2, 17.5, towerZ], [5.5, 20, towerZ + .3], .12, 0x425f53);
  sign('OUTPOST 09', 'RESTRICTED AREA / KEEP CLEAR', 0, 4.5, -5, 7);
  beam([-5, 0, -5], [-5, 6, -5], .2, 0x596a54); beam([5, 0, -5], [5, 6, -5], .2, 0x596a54);
  beam([-5, 5.8, -5], [5, 5.8, -5], .22, 0x596a54);

  function crate(x, z, s = 1.6, color = 0x9b956e, y = s / 2) {
    solid(x, y, z, s, s, s, color);
    for (const dx of [-.35, .35]) box(x + dx * s, y, z + s / 2 + .02, .1, s, .04, 0x465c4e);
    box(x, y, z + s / 2 + .04, s, .12, .04, 0xc9bc8d);
    box(x, y + s / 2 + .02, z, s, .04, .13, 0x475e4d);
  }
  function barrel(x, z, color = 0x657f6d) {
    mesh(geo.cylinder, color, x, .8, z, .53, 1.6, .53);
    for (const y of [.3, 1.2]) mesh(geo.cylinder, 0x344e43, x, y, z, .55, .08, .55);
    colliders.push({minX:x-.52, maxX:x+.52, minZ:z-.52, maxZ:z+.52, minY:0, maxY:1.6});
  }
  for (const [x,z] of [[-13,-7],[-13,-9],[-12,11],[14,12],[15,14],[16,-20],[-37,15],[36,10],[-13,-37],[12,40],[-43,-8],[42,-42],[-38,35],[-7,39],[45,30]]) {
    crate(x, z, rand(1.2, 2)); if (rng() > .5) crate(x + 1.7, z, 1.4, 0x6f8971); else barrel(x + 2, z);
  }
  crate(-13,-7,1.3,0xaab18a,2.25);
  // Shipping containers, barriers, solar arrays and scattered cover.
  for (const [x,z,c] of [[-48,3,0x658a7b],[40,46,0xad8a61],[-25,-42,0x7d9584]]) {
    solid(x, 1.5, z, 9, 3, 3.6, c);
    for (let i=0;i<15;i++) box(x - 4.2 + i*.6, 1.5, z+1.83, .08, 2.8, .1, 0x4e7166);
    box(x, 3.04, z, 9.2, .12, 3.8, c); sign('09', 'CARGO', x+2.6, 1.6, z+1.9, 1.5);
    mapBuildings.push({x,z,w:9,d:3.6});
  }
  for (const [x,z] of [[-15,30],[15,32],[-17,-30],[17,-38],[-38,-26],[40,-10],[5,46],[-63,17],[63,-25]]) {
    solid(x,.6,z,5,1.2,1,0xb9b89a); box(x,.72,z+.51,4.5,.22,.03,0x667d67);
    for (let i = -1; i <= 1; i++) { const stripe=box(x+i*1.25,.73,z+.53,.3,.55,.02,0xd9bf6d); stripe.rotation.z=-.45; }
  }
  for (let i=0;i<3;i++) {
    const x=47+i*6,z=-40;
    beam([x,0,z],[x,2.2,z],.15,0x567361);
    const panel=box(x,2.4,z,5,.12,7,0x315c58); panel.rotation.x=.32;
    for(let j=-2;j<=2;j++) { const line=box(x+j,2.49,z,.03,.03,7,0x799e8d); line.rotation.x=.32; }
  }
  // One wrecked utility truck, built from simple primitives.
  solid(10,1.1,7,3.1,1.5,6.4,0x788d6e); box(10,2.3,5.9,3.1,1.2,2.4,0x94a17c);
  box(10,2.35,4.68,2.7,.7,.05,0x2d534b); box(10,1.85,8.9,2.9,.16,2.1,0xb2ab81);
  for (const x of [8.45,11.55]) for(const z of [5.2,8.7]) { const wheel=mesh(geo.cylinder,0x33413a,x,.65,z,.7,.3,.7); wheel.rotation.z=Math.PI/2; }
  for (let i=0;i<105;i++) {
    const a = rng()*TAU, r = rand(67,120), x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(rng()<.44) {
      const h=rand(1.4,4),color=pick([0x597a59,0x78905e,0x6d8659]);
      mesh(geo.cylinder,color,x,h*.5,z,.24,h,.24);
      mesh(geo.sphere,color,x,h,z,.24,.24,.24);
      const side=rng()>.5?1:-1;
      box(x+side*.45,h*.58,z,.9,.28,.28,color); mesh(geo.cylinder,color,x+side*.85,h*.7,z,.16,h*.38,.16);
      if(h>2.8) { box(x-side*.38,h*.4,z,.76,.25,.25,color); mesh(geo.cylinder,color,x-side*.7,h*.51,z,.14,.8,.14); }
    } else {
      const s=rand(.7,3.8); const rock=mesh(geo.rock,pick([0xafa07c,0xc6b18a,0x9f9270]),x,s*.3,z,s,s*.7,s*.8);rock.rotation.y=rng()*6;
      if(s>1.6) colliders.push({minX:x-s*.65,maxX:x+s*.65,minZ:z-s*.55,maxZ:z+s*.55,minY:0,maxY:s*.8});
    }
  }
  for(let i=0;i<170;i++) {
    const x=rand(-105,105),z=rand(-105,105);
    if(Math.abs(x)<8||Math.abs(z)<6||colliders.some(c=>x>c.minX-2&&x<c.maxX+2&&z>c.minZ-2&&z<c.maxZ+2))continue;
    const s=rand(.15,.5);
    for(let j=0;j<3;j++) { const blade=mesh(geo.cone,pick([0x929269,0xa8a26c,0x7e895c]),x+(rng()-.5)*.4,s*.5,z+(rng()-.5)*.4,.07,s,.07);blade.rotation.z=rand(-.6,.6);blade.castShadow=false; }
  }
  // Batch repeated static geometry, keeping the detailed map inexpensive to draw.
  function batchStatic() {
    staticWorld.updateMatrixWorld(true); const groups=new Map();
    staticWorld.traverse(o=>{if(!o.isMesh||!Object.values(geo).includes(o.geometry))return;const key=o.geometry.uuid+o.material.uuid+o.castShadow+o.receiveShadow;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});
    for(const list of groups.values()) {
      if(list.length<3)continue;
      const first=list[0], inst=new THREE.InstancedMesh(first.geometry,first.material,list.length);
      inst.castShadow=first.castShadow;inst.receiveShadow=first.receiveShadow;
      list.forEach((o,i)=>{inst.setMatrixAt(i,o.matrixWorld);o.removeFromParent();});
      staticWorld.add(inst);
    }
  }
  batchStatic();

  // Animated energy boundary. Scaling preserves a continuous wall during shrinking.
  const zoneMaterial = new THREE.ShaderMaterial({
    transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{time:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv;uniform float time;void main(){float grid=pow(max(0.,sin(vUv.x*720.)),28.)*.18+pow(max(0.,sin(vUv.y*90.-time*1.5)),20.)*.16;float fade=pow(1.-vUv.y,1.3);float pulse=.06+.03*sin(time+vUv.x*40.);gl_FragColor=vec4(.23,.68,.91,(pulse+grid)*fade);}'
  });
  const zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1,1,38,128,1,true),zoneMaterial);zoneWall.position.y=18;scene.add(zoneWall);
  const zoneRing = new THREE.Mesh(new THREE.TorusGeometry(1,.002,4,160),new THREE.MeshBasicMaterial({color:0x8ce6e7,transparent:true,opacity:.7}));zoneRing.rotation.x=Math.PI/2;zoneRing.position.y=.15;scene.add(zoneRing);

  const lootColors={ammo:0xe8cc7c,shield:0x78d5d1,med:0xc0e883};
  const lootInfo={ammo:['탄약 보급','소총 +60 · 산탄총 +12'],shield:['보호막 셀','보호막 +60'],med:['구급 키트','회복 아이템 +1']};
  function addLoot(x,z,type,initial=true) {
    const root=new THREE.Group();root.position.set(x,0,z);scene.add(root);
    const color=lootColors[type];
    box(0,.3,0,.8,.5,.6,0x364e40,root);box(0,.58,0,.9,.1,.7,color,root);
    box(0,.33,.31,.2,.23,.02,color,root);
    const glowMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.16,depthWrite:false});
    const glow=mesh(geo.cylinder,glowMat,0,1.1,0,.28,1.5,.28,root);glow.castShadow=false;
    const icon=new THREE.Group();icon.position.y=1.65;root.add(icon);
    if(type==='med') {box(0,0,0,.45,.15,.13,color,icon);box(0,0,0,.15,.45,.13,color,icon);}
    else if(type==='shield'){const gem=mesh(geo.rock,color,0,0,0,.22,.3,.13,icon);gem.castShadow=false;}
    else for(let i=-1;i<=1;i++)box(i*.16,0,0,.08,.33,.1,color,icon);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.65,.025,4,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7}));ring.rotation.x=Math.PI/2;ring.position.y=.04;root.add(ring);
    loot.push({x,z,type,root,icon,active:true,initial});
  }
  const lootLocations=[[-4,26,'ammo'],[3,25,'shield'],[5,29,'med'],[-25,-15,'med'],[-27,23,'ammo'],[26,23,'shield'],[29,-26,'ammo'],[-4,-48,'med'],[56,2,'shield'],[-58,-38,'ammo'],[1,60,'med'],[-11,12,'shield'],[18,-13,'med'],[-41,4,'ammo'],[41,39,'shield'],[-30,-39,'ammo'],[10,43,'shield'],[-36,33,'med'],[44,-23,'ammo'],[1,-27,'shield'],[-55,27,'med'],[34,4,'ammo'],[-15,-2,'ammo'],[63,25,'shield']];
  lootLocations.forEach(args=>addLoot(...args));

  // View-model scene stays crisp and never clips into a nearby wall.
  const gunScene=new THREE.Scene(),gunCamera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.01,10);
  gunScene.add(new THREE.HemisphereLight(0xe7f5d6,0x485e50,2.6));
  const gunLight=new THREE.DirectionalLight(0xffd4a5,2.8);gunLight.position.set(-2,4,2);gunScene.add(gunLight);
  const gunRoot=new THREE.Group();gunScene.add(gunRoot);
  const gunModels=[];
  function buildGun(shotgun=false) {
    const root=new THREE.Group();gunRoot.add(root);
    const metal=mat(0x314846,.45),dark=mat(0x1d3030,.6),green=mat(0x77846a,.7),tan=mat(0xb4a580,.8);
    box(0,0,-.13,.15,.18,.57,metal,root);
    box(0,-.015,.19,.11,.13,.28,tan,root);
    box(0,.103,-.15,.11,.025,.52,dark,root);
    for(let i=0;i<9;i++)box(0,.12,-.37+i*.05,.12,.015,.014,tan,root);
    const barrel=mesh(geo.cylinder,dark,0,.025,-.53,shotgun?.035:.023,.31,shotgun?.035:.023,root);barrel.rotation.x=Math.PI/2;
    box(0,-.11,-.08,.085,.22,.11,dark,root).rotation.x=-.18;
    box(0,-.13,.08,.08,.19,.095,green,root).rotation.x=.3;
    box(0,.17,-.17,.11,.12,.1,dark,root);
    box(0,.17,-.17,.055,.055,.104,new THREE.MeshBasicMaterial({color:0x96ccc0,transparent:true,opacity:.55}),root);
    if(shotgun){box(0,-.04,-.4,.19,.15,.2,tan,root);box(.076,.02,-.08,.008,.06,.22,0xe7c16b,root);}
    else{box(.078,.02,-.13,.01,.05,.18,0xd5dd8d,root);for(let i=0;i<4;i++)box(.078,0,-.28-i*.04,.012,.06,.018,dark,root);}
    // Gloved hands and sleeves.
    box(.035,-.2,.11,.12,.15,.18,0x445e4d,root).rotation.x=.35;
    box(.09,-.29,.25,.16,.18,.35,0x7e8869,root).rotation.x=-.3;
    box(-.04,-.13,-.32,.13,.12,.19,0x445e4d,root);
    const arm=box(-.18,-.29,-.12,.17,.18,.43,0x7e8869,root);arm.rotation.set(-.45,-.35,-.3);
    root.visible=!shotgun;gunModels.push(root);
  }
  buildGun();buildGun(true);
  const muzzle=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshBasicMaterial({color:0xffdf91}));muzzle.position.set(0,.025,-.73);muzzle.scale.set(.65,.65,2.4);muzzle.visible=false;gunRoot.add(muzzle);

  let state='lobby',elapsed=0,lastTime=0,visualTime=0,uiClock=0;
  let yaw=0,pitch=0,recoil=0,gunKick=0,muzzleTimer=0,hitTimer=0,damageFlash=0,toastTimer=0,announcementTimer=0;
  let shooting=false,aiming=false,sensitivity=1,audioEnabled=true,mapOpen=false;
  let difficulty='normal',currentWeapon=0,fireCooldown=0,reload=null,healing=null,nearestLoot=null;
  let matchKills=0,totalDamage=0,rank=16,footstepClock=0,grace=0;
  const keys=new Set();
  const player={x:0,z:30,y:0,vy:0,hp:100,shield:100,stamina:100,meds:2,alive:true,grounded:true,moving:false,sprinting:false};
  const weapons=[
    {name:'AR-09 VANGUARD',type:'ASSAULT RIFLE',mode:'AUTO',size:30,ammo:30,reserve:180,rate:.115,damage:27,pellets:1,spread:.012,reload:1.65,range:150},
    {name:'SG-12 BREACHER',type:'PUMP SHOTGUN',mode:'PUMP',size:8,ammo:8,reserve:40,rate:.82,damage:13,pellets:9,spread:.064,reload:2.15,range:55}
  ];
  const stages=[
    {x:0,z:0,r:108,wait:35,shrink:35},
    {x:8,z:-8,r:78,wait:25,shrink:30},
    {x:-7,z:-3,r:50,wait:20,shrink:25},
    {x:0,z:-10,r:28,wait:15,shrink:20},
    {x:4,z:-7,r:12,wait:10,shrink:20},
    {x:4,z:-7,r:2,wait:0,shrink:0}
  ];
  const zone={x:0,z:0,r:108,stage:0,timer:35,shrinking:false};

  // Everything below is driven by simulation time; pausing freezes AI and the storm.
  let audioContext=null,masterGain=null,noiseBuffer=null;
  function initAudio() {
    try {
      if(!audioContext) {
        const Context=window.AudioContext||window.webkitAudioContext;
        if(!Context)return;
        audioContext=new Context();masterGain=audioContext.createGain();masterGain.gain.value=audioEnabled?.38:0;masterGain.connect(audioContext.destination);
        noiseBuffer=audioContext.createBuffer(1,audioContext.sampleRate*.5,audioContext.sampleRate);
        const values=noiseBuffer.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=Math.random()*2-1;
        const wind=audioContext.createBufferSource();wind.buffer=noiseBuffer;wind.loop=true;
        const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=310;
        const gain=audioContext.createGain();gain.gain.value=.10;wind.connect(filter);filter.connect(gain);gain.connect(masterGain);wind.start();
      }
      if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    } catch (_) { /* Audio is optional; the game remains fully playable. */ }
  }
  function tone(frequency,duration,volume=.25,type='sine',delay=0,endFrequency=frequency) {
    if(!audioContext||!masterGain||!audioEnabled)return;
    const start=audioContext.currentTime+delay,osc=audioContext.createOscillator(),gain=audioContext.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(Math.max(10,endFrequency),start+duration);
    gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    osc.connect(gain);gain.connect(masterGain);osc.start(start);osc.stop(start+duration);
  }
  function noise(duration,volume=.4,frequency=1800) {
    if(!audioContext||!audioEnabled)return;
    const start=audioContext.currentTime,source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
    source.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.value=frequency;
    gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    source.connect(filter);filter.connect(gain);gain.connect(masterGain);source.start(start);source.stop(start+duration);
  }
  function sound(name,volume=1) {
    if(name==='rifle'){noise(.16,.9*volume,2400);tone(135,.12,.6*volume,'triangle',0,40);}
    if(name==='shotgun'){noise(.27,1.2*volume,1800);tone(100,.23,.85*volume,'triangle',0,28);}
    if(name==='bot'){noise(.1,.25*volume,1300);tone(115,.08,.13*volume,'triangle',0,55);}
    if(name==='hit'){tone(600,.07,.14,'triangle',0,380);tone(960,.05,.1,'sine');}
    if(name==='head'){tone(1050,.15,.22,'sine',0,1500);}
    if(name==='kill'){tone(440,.12,.2,'triangle');tone(660,.18,.22,'triangle',.08);}
    if(name==='pickup'){tone(500,.12,.15);tone(800,.17,.17,'sine',.08);}
    if(name==='reload'){noise(.07,.23,3800);tone(230,.06,.15,'square');}
    if(name==='empty')tone(130,.04,.13,'square');
    if(name==='hurt'){noise(.16,.28,600);tone(75,.15,.2,'sine',0,30);}
    if(name==='step')noise(.065,.13,550);
    if(name==='zone'){tone(240,.3,.13,'sine');tone(320,.45,.1,'sine',.35);}
    if(name==='win')[392,494,587,784].forEach((f,i)=>tone(f,.65,.2,'triangle',i*.16));
  }
  function toggleAudio() {
    audioEnabled=!audioEnabled;
    if(masterGain)masterGain.gain.value=audioEnabled?.38:0;
    document.querySelectorAll('.audio-toggle').forEach(b=>{b.textContent=audioEnabled?'♪':'×';b.setAttribute('aria-label',audioEnabled?'소리 끄기':'소리 켜기');});
    $('pause-audio').textContent=audioEnabled?'소리 켜짐':'소리 꺼짐';
  }
  function toast(text,duration=2.4){$('toast').textContent=text;toastTimer=duration;show('toast');}
  function announce(kicker,title,sub,duration=3.5){$('announcement-kicker').textContent=kicker;$('announcement-title').textContent=title;$('announcement-sub').textContent=sub;announcementTimer=duration;show('announcement');}
  const feed=[];
  function addFeed(killer,victim,isPlayer=false,storm=false) {
    const el=document.createElement('div');el.className='feed-item'+(isPlayer?' you':'');
    const a=document.createElement('b');a.textContent=killer;
    const b=document.createElement('span');b.className='feed-symbol';b.textContent=storm?'◉':'⌁';
    const c=document.createElement('b');c.textContent=victim;
    el.append(a,b,c);$('kill-feed').prepend(el);feed.push({el,time:elapsed+7});
    if(feed.length>5)feed.shift().el.remove();
  }
  function blocked(x,z,r=.36,y=0,height=1.8) {
    if(Math.abs(x)>126||Math.abs(z)>126)return true;
    for(const c of colliders) {
      if(y>=c.maxY-.07||y+height<=c.minY+.02)continue;
      const dx=x-clamp(x,c.minX,c.maxX),dz=z-clamp(z,c.minZ,c.maxZ);
      if(dx*dx+dz*dz<r*r)return true;
    }
    return false;
  }
  function floorAt(x,z,feet) {
    let floor=0;
    for(const c of colliders)if(c.maxY<=feet+.15&&c.maxY>floor&&x>c.minX-.15&&x<c.maxX+.15&&z>c.minZ-.15&&z<c.maxZ+.15)floor=c.maxY;
    return floor;
  }
  function moveEntity(entity,dx,dz,r=.38) {
    const oldX=entity.x,oldZ=entity.z,y=entity.y||0;
    if(!blocked(entity.x+dx,entity.z,r,y))entity.x+=dx;
    if(!blocked(entity.x,entity.z+dz,r,y))entity.z+=dz;
    return Math.hypot(entity.x-oldX,entity.z-oldZ);
  }
  // Slab intersection also gives real cover to AI: walls stop both sight and bullets.
  const slabAxes=[['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']];
  function rayBox(origin,direction,c,maxDistance) {
    let near=0,far=maxDistance;
    for(const [axis,min,max] of slabAxes) {
      if(Math.abs(direction[axis])<.000001){if(origin[axis]<c[min]||origin[axis]>c[max])return Infinity;continue;}
      let a=(c[min]-origin[axis])/direction[axis],b=(c[max]-origin[axis])/direction[axis];
      if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return Infinity;
    }
    return near;
  }
  function obstacleDistance(origin,direction,maxDistance) {
    let nearest=maxDistance;
    for(const c of colliders)nearest=Math.min(nearest,rayBox(origin,direction,c,nearest));
    if(direction.y<-.0001)nearest=Math.min(nearest,-origin.y/direction.y);
    return nearest;
  }
  function lineOfSight(a,b) {
    const origin=new THREE.Vector3(a.x,(a.y||0)+1.55,a.z),end=new THREE.Vector3(b.x,(b.y||0)+1.3,b.z);
    const distance=origin.distanceTo(end);return obstacleDistance(origin,end.sub(origin).normalize(),distance)>=distance-.5;
  }

  const botNames=['NOMAD','KESTREL','GHOST','EMBER','DUNE','VIPER','ROOK','WRAITH','ATLAS','ECHO','SABLE','DRIFT','COBRA','FLINT','RAVEN'];
  const botSpawns=[[14,8],[-19,44],[35,5],[-40,-9],[48,-53],[-52,49],[74,20],[-75,-28],[7,-73],[55,57],[-37,-68],[-76,5],[26,79],[-9,87],[82,-31]];
  function makeBot(index) {
    let [x,z]=botSpawns[index];x+=rand(-3,3);z+=rand(-3,3);
    while(blocked(x,z,.6)){x+=2;z+=1;}
    const root=new THREE.Group();scene.add(root);
    const color=pick([0x6f7961,0x9b8c6c,0x697b6d,0x8b866b]);
    const torso=box(0,1.28,0,.62,.7,.38,color,root);
    box(0,1.35,-.22,.52,.5,.1,0x2d4940,root);
    box(0,1.59,-.24,.65,.15,.09,0xd99a60,root);
    const head=mesh(geo.sphere,0x3a5145,0,1.9,0,.28,.29,.26,root);
    box(0,1.94,-.25,.43,.1,.06,0xf4bd77,root);
    box(0,2.1,0,.52,.13,.49,0x73816a,root);
    const legs=[];
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*.18,.92,0);root.add(leg);box(0,-.37,0,.24,.75,.27,0x465d4c,leg);box(0,-.78,-.06,.27,.17,.41,0x2a4238,leg);legs.push(leg);
      const arm=box(side*.4,1.2,-.15,.23,.55,.26,color,root);arm.rotation.x=-.65;
    }
    box(.22,1.28,-.47,.13,.16,.67,0x203c35,root);box(.22,1.3,-.86,.06,.07,.27,0x263c33,root);
    const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.09),new THREE.MeshBasicMaterial({color:0xf3a379}));marker.position.y=2.42;root.add(marker);
    const bot={index,name:botNames[index],x,z,y:0,hp:difficulty==='casual'?75:100,alive:true,root,legs,head,torso,target:null,think:rand(0,.6),cooldown:rand(.7,2),walk:0,stray:rand(-1,1)>0?1:-1,stuck:0,angle:rand(0,TAU),waypoint:{x:x+rand(-20,20),z:z+rand(-20,20)},mark:marker,markerTime:0};
    root.position.set(x,0,z);bots.push(bot);
  }
  function addTracer(start,end,color=0xffe2a1,life=.09) {
    const geometry=new THREE.BufferGeometry().setFromPoints([start,end]);
    const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.85});
    const line=new THREE.Line(geometry,material);scene.add(line);effects.push({kind:'line',obj:line,life,maxLife:life,disposable:true});
  }
  function particles(point,color,count=6) {
    for(let i=0;i<count;i++) {
      const m=new THREE.Mesh(geo.box,new THREE.MeshBasicMaterial({color,transparent:true}));m.position.copy(point);m.scale.setScalar(rand(.025,.075));scene.add(m);
      effects.push({kind:'particle',obj:m,life:rand(.2,.5),maxLife:.5,vx:rand(-2,2),vy:rand(1,4),vz:rand(-2,2)});
    }
  }
  function damageNumber(bot,amount,head=false) {
    const el=document.createElement('span');el.className='damage-number'+(head?' head':'');el.textContent=Math.round(amount);$('damage-numbers').append(el);
    floaters.push({el,x:bot.x,y:2.5,z:bot.z,life:.75,offset:rand(-15,15)});
  }
  function hurtPlayer(amount,source='경계 폭풍') {
    if(!player.alive||state!=='playing')return;
    if(source!=='경계 폭풍'&&grace>0)return;
    const absorbed=Math.min(player.shield,amount);player.shield-=absorbed;player.hp=Math.max(0,player.hp-(amount-absorbed));
    damageFlash=Math.max(damageFlash,.65);if(source!=='경계 폭풍')sound('hurt');
    if(healing){healing=null;toast('피격으로 회복이 중단되었습니다.');}
    if(player.hp<=0){player.alive=false;rank=bots.filter(b=>b.alive).length+1;finish(false,source);}
  }
  function killBot(bot,killer,storm=false) {
    if(!bot.alive)return;
    bot.alive=false;bot.hp=0;bot.root.visible=false;
    particles(new THREE.Vector3(bot.x,1,bot.z),0xd9b883,10);
    addLoot(bot.x,bot.z,pick(['ammo','ammo','shield','med']),false);
    addFeed(killer,bot.name,killer==='YOU',storm);
    if(killer==='YOU'){matchKills++;sound('kill');toast(`${bot.name} 처치  ·  ${matchKills} KILLS`,2);}
  }
  function damageBot(bot,amount,killer='YOU',headshot=false) {
    if(!bot.alive)return;
    const actual=Math.min(bot.hp,amount);bot.hp-=amount;
    if(killer==='YOU'){totalDamage+=actual;damageNumber(bot,actual,headshot);bot.target=player;bot.think=.8;}
    if(bot.hp<=0)killBot(bot,killer,killer==='경계 폭풍');
  }
  function chooseTarget(bot) {
    let best=null,bestScore=65;
    for(const actor of [player,...bots]) {
      if(actor===bot||!actor.alive)continue;
      if(actor===player&&grace>0)continue;
      const distance=Math.hypot(actor.x-bot.x,actor.z-bot.z);
      const score=distance*(actor===player?1.04:1);
      if(score<bestScore&&lineOfSight(bot,actor)){best=actor;bestScore=score;}
    }
    bot.target=best;
  }
  function updateBots(dt) {
    for(const bot of bots) {
      if(!bot.alive)continue;
      bot.think-=dt;bot.cooldown-=dt;
      if(bot.think<=0){chooseTarget(bot);bot.think=rand(.6,1.05);}
      if(bot.target&&!bot.target.alive)bot.target=null;
      const toCenter=Math.hypot(bot.x-zone.x,bot.z-zone.z),outside=toCenter>zone.r;
      let dx=0,dz=0,speed=2.6,faceX=0,faceZ=0;
      if(outside||toCenter>zone.r-8) {
        dx=zone.x-bot.x;dz=zone.z-bot.z;speed=outside?5.1:3.6;
      } else if(bot.target) {
        const tx=bot.target.x-bot.x,tz=bot.target.z-bot.z,d=Math.hypot(tx,tz);
        faceX=tx;faceZ=tz;
        const advance=d>24?1:d<11?-.65:0;
        dx=tx/(d||1)*advance+tz/(d||1)*bot.stray*.55;dz=tz/(d||1)*advance-tx/(d||1)*bot.stray*.55;
        speed=2.5;
      } else {
        if(Math.hypot(bot.waypoint.x-bot.x,bot.waypoint.z-bot.z)<3||Math.hypot(bot.waypoint.x-zone.x,bot.waypoint.z-zone.z)>zone.r-5) {
          const a=rand(0,TAU),r=rand(5,Math.max(7,zone.r*.75));bot.waypoint={x:zone.x+Math.cos(a)*r,z:zone.z+Math.sin(a)*r};
        }
        dx=bot.waypoint.x-bot.x;dz=bot.waypoint.z-bot.z;speed=2.5;
      }
      const length=Math.hypot(dx,dz);if(length>.001){dx=dx/length*speed*dt;dz=dz/length*speed*dt;}
      let moved=moveEntity(bot,dx,dz,.4);
      if(moved<speed*dt*.35) {
        bot.stuck+=dt;
        moved+=moveEntity(bot,-dz*bot.stray,dx*bot.stray,.4);
        if(bot.stuck>1.2){bot.stray*=-1;bot.stuck=0;bot.waypoint={x:bot.x+rand(-18,18),z:bot.z+rand(-18,18)};}
      }else bot.stuck=Math.max(0,bot.stuck-dt);
      if(!bot.target){faceX=dx;faceZ=dz;}
      if(Math.abs(faceX)+Math.abs(faceZ)>.001) {
        const desired=Math.atan2(-faceX,-faceZ);let diff=desired-bot.angle;diff=Math.atan2(Math.sin(diff),Math.cos(diff));bot.angle+=diff*Math.min(1,dt*9);
      }
      bot.root.position.set(bot.x,0,bot.z);bot.root.rotation.y=bot.angle;
      bot.walk+=moved*2.8;bot.legs[0].rotation.x=Math.sin(bot.walk)*.6;bot.legs[1].rotation.x=-Math.sin(bot.walk)*.6;
      bot.markerTime-=dt;
      if(bot.markerTime<=0){bot.mark.visible=Math.hypot(bot.x-player.x,bot.z-player.z)<42&&lineOfSight(player,bot);bot.markerTime=.12;}
      if(bot.target&&bot.cooldown<=0) {
        const distance=Math.hypot(bot.x-bot.target.x,bot.z-bot.target.z);
        if(distance<55&&lineOfSight(bot,bot.target)) {
          const target=bot.target,from=new THREE.Vector3(bot.x,1.35,bot.z),to=new THREE.Vector3(target.x,(target.y||0)+1.3,target.z);
          const factor=difficulty==='hard'?1.35:difficulty==='casual'?.62:1;
          const chance=clamp((.66-distance*.007)*factor,.13,.78);
          const hits=rng()<chance;
          if(!hits){to.x+=rand(-2,2);to.y+=rand(-.7,1);}
          addTracer(from,to,0xf9b176,.07);
          const volume=clamp(1-Math.hypot(bot.x-player.x,bot.z-player.z)/75,0,1);if(volume>.05)sound('bot',volume);
          if(hits){const damage=target===player?rand(7,12)*factor:rand(15,24);if(target===player)hurtPlayer(damage,bot.name);else damageBot(target,damage,bot.name);}
          bot.cooldown=rand(.48,.95)/(difficulty==='hard'?1.2:1);
        }else bot.cooldown=.2;
      }
      if(outside)damageBot(bot,dt*(3.5+zone.stage*2.6),'경계 폭풍');
    }
  }
  function fire() {
    if(state!=='playing'||reload||fireCooldown>0||mapOpen)return;
    const weapon=weapons[currentWeapon];
    if(weapon.ammo<=0){fireCooldown=.25;sound('empty');startReload();return;}
    if(healing){healing=null;toast('회복이 취소되었습니다.');}
    weapon.ammo--;fireCooldown=weapon.rate;muzzleTimer=.045;gunKick=currentWeapon===1?.12:.05;
    sound(currentWeapon===1?'shotgun':'rifle');
    camera.updateMatrixWorld(true);
    const origin=camera.position.clone(),direction=new THREE.Vector3();camera.getWorldDirection(direction);
    const baseSpread=weapon.spread*(aiming?.35:1)*(player.sprinting?2:1);
    let hitAny=false,headAny=false;const damages=new Map();
    for(let pellet=0;pellet<weapon.pellets;pellet++) {
      const rayDirection=direction.clone().add(new THREE.Vector3((Math.random()-.5)*baseSpread,(Math.random()-.5)*baseSpread,(Math.random()-.5)*baseSpread)).normalize();
      const ray=new THREE.Ray(origin,rayDirection);
      let nearest=obstacleDistance(origin,rayDirection,weapon.range),target=null,isHead=false;
      for(const bot of bots) {
        if(!bot.alive)continue;
        for(const [height,radius,head] of [[1.94,.29,true],[1.28,.43,false],[.65,.35,false]]) {
          const hit=ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(bot.x,height,bot.z),radius),v3);
          if(hit){const distance=origin.distanceTo(hit);if(distance<nearest){nearest=distance;target=bot;isHead=head;}}
        }
      }
      const end=origin.clone().addScaledVector(rayDirection,nearest);
      if(pellet<3) {
        const from=origin.clone().add(new THREE.Vector3(.17,-.16,-.3).applyQuaternion(camera.quaternion));addTracer(from,end,0xffe8b4,.055);
      }
      if(target) {
        const falloff=currentWeapon===1?clamp(1-nearest/65,.25,1):clamp(1-(nearest-40)/250,.72,1);
        const amount=weapon.damage*(isHead?2.25:1)*falloff;
        const prior=damages.get(target)||{amount:0,head:false};prior.amount+=amount;prior.head=prior.head||isHead;damages.set(target,prior);
        hitAny=true;headAny=headAny||isHead;
        if(pellet===0)particles(end,isHead?0xe6f48a:0xcce0ba,4);
      } else if(nearest<weapon.range&&pellet===0)particles(end,0xd3be8d,4);
    }
    for(const [bot,damage] of damages)damageBot(bot,damage.amount,'YOU',damage.head);
    if(hitAny){hitTimer=.18;$('hitmarker').classList.toggle('headshot',headAny);sound(headAny?'head':'hit');}
    recoil+=currentWeapon===1?.026:.009;pitch=clamp(pitch+(aiming?.0015:.003),-1.35,1.35);
    updateHUD();
  }
  function startReload() {
    const weapon=weapons[currentWeapon];
    if(state!=='playing'||reload||weapon.ammo>=weapon.size)return;
    if(weapon.reserve<=0){toast('예비 탄약이 없습니다. 보급품을 찾아보세요.');return;}
    healing=null;reload={time:0,total:weapon.reload,weapon:currentWeapon};sound('reload');
  }
  function switchWeapon(index) {
    if(state!=='playing'||index===currentWeapon)return;
    currentWeapon=index;reload=null;healing=null;fireCooldown=.2;gunKick=.15;
    gunModels.forEach((g,i)=>g.visible=i===index);sound('reload');updateHUD();
  }
  function heal() {
    if(state!=='playing'||healing)return;
    if(player.meds<=0){toast('구급 키트가 없습니다.');return;}
    if(player.hp>=100&&player.shield>=100){toast('체력과 보호막이 가득 차 있습니다.');return;}
    reload=null;healing={time:0,total:2.3};shooting=false;toast('회복 중 · 사격하거나 피격되면 중단됩니다.',2.3);sound('reload');
  }
  function pickup() {
    if(state!=='playing'||!nearestLoot)return;
    const item=nearestLoot;
    if(item.type==='ammo'){weapons[0].reserve=Math.min(480,weapons[0].reserve+60);weapons[1].reserve=Math.min(120,weapons[1].reserve+12);}
    if(item.type==='shield'){if(player.shield>=100){toast('보호막이 이미 가득 차 있습니다.');return;}player.shield=Math.min(100,player.shield+60);}
    if(item.type==='med'){if(player.meds>=5){toast('구급 키트는 최대 5개까지 휴대할 수 있습니다.');return;}player.meds++;}
    item.active=false;item.root.visible=false;nearestLoot=null;show('pickup-prompt',false);toast(`${lootInfo[item.type][0]} 획득`);sound('pickup');updateHUD();
  }
  let sprintExhausted=false;
  function updatePlayer(dt) {
    const f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
    player.moving=(f!==0||s!==0)&&!mapOpen;
    if(player.stamina<1)sprintExhausted=true;if(player.stamina>22)sprintExhausted=false;
    player.sprinting=player.moving&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!aiming&&!healing&&!sprintExhausted;
    const speed=healing?2.2:aiming?3.3:player.sprinting?9:5.7;
    if(player.moving) {
      const n=Math.hypot(f,s),dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)/n*speed*dt,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)/n*speed*dt;
      const moved=moveEntity(player,dx,dz);
      if(moved>.01&&player.grounded){footstepClock+=dt;if(footstepClock>(player.sprinting?.29:.44)){sound('step');footstepClock=0;}}
    }
    player.stamina=clamp(player.stamina+dt*(player.sprinting?-22:15),0,100);
    if(keys.has('Space')&&player.grounded&&!mapOpen&&!healing){player.vy=7.2;player.grounded=false;}
    const previousY=player.y;
    player.vy-=20*dt;player.y+=player.vy*dt;
    const floor=floorAt(player.x,player.z,Math.max(previousY,player.y));
    if(player.y<=floor){player.y=floor;player.vy=0;player.grounded=true;}else player.grounded=false;
    const bob=player.moving&&player.grounded?Math.sin(visualTime*(player.sprinting?16:11))*(player.sprinting?.055:.027):0;
    recoil*=Math.exp(-dt*10);
    camera.position.set(player.x,player.y+1.72+bob,player.z);
    camera.rotation.set(pitch+recoil,yaw,player.moving?-s*.008:0,'YXZ');
    const targetFov=aiming?51:player.sprinting?83:76;
    camera.fov=mix(camera.fov,targetFov,Math.min(1,dt*11));camera.updateProjectionMatrix();
    gunKick*=Math.exp(-dt*13);
    const reloadDip=reload?Math.sin(Math.PI*reload.time/reload.total)*.4:0;
    const targetX=aiming?0:.3,targetY=aiming?-.21:-.28;
    gunRoot.position.x=mix(gunRoot.position.x,targetX,Math.min(1,dt*14));
    gunRoot.position.y=mix(gunRoot.position.y,targetY-bob*.45-reloadDip-(healing?.3:0),Math.min(1,dt*14));
    gunRoot.position.z=-.48+gunKick+(player.sprinting?.06:0);
    gunRoot.rotation.set(gunKick*.9+reloadDip,player.sprinting?.15:0,reloadDip*.8+(player.moving?Math.sin(visualTime*6)*.008:0));
    muzzle.visible=muzzleTimer>0;muzzle.rotation.z=visualTime*80;
    if(shooting)fire();
    if(reload){reload.time+=dt;if(reload.time>=reload.total){const w=weapons[reload.weapon],amount=Math.min(w.size-w.ammo,w.reserve);w.ammo+=amount;w.reserve-=amount;reload=null;sound('reload');}}
    if(healing){healing.time+=dt;if(healing.time>=healing.total){player.hp=Math.min(100,player.hp+65);player.shield=Math.min(100,player.shield+35);player.meds--;healing=null;sound('pickup');toast('회복 완료 · 체력 +65 / 보호막 +35');}}
    const action=reload||healing;show('action-progress',!!action);
    if(action){$('action-label').textContent=reload?'재장전 중':'구급 키트 사용 중';$('action-fill').style.width=`${action.time/action.total*100}%`;}
    nearestLoot=null;let closest=2.8;
    for(const item of loot){if(!item.active)continue;const distance=Math.hypot(item.x-player.x,item.z-player.z);if(distance<closest&&player.y<1.8&&lineOfSight(player,{x:item.x,z:item.z,y:-.5})){closest=distance;nearestLoot=item;}}
    show('pickup-prompt',!!nearestLoot&&!mapOpen);
    if(nearestLoot){$('pickup-name').textContent=lootInfo[nearestLoot.type][0];$('pickup-detail').textContent=lootInfo[nearestLoot.type][1];}
  }
  let lastZonePhase='';
  function updateZone(dt) {
    let remaining=elapsed,stage=0;
    while(stage<stages.length-1&&remaining>=stages[stage].wait+stages[stage].shrink){remaining-=stages[stage].wait+stages[stage].shrink;stage++;}
    const current=stages[stage],next=stages[Math.min(stage+1,stages.length-1)];
    zone.stage=stage;zone.shrinking=remaining>=current.wait&&stage<stages.length-1;
    const progress=zone.shrinking?clamp((remaining-current.wait)/current.shrink,0,1):0;
    zone.x=mix(current.x,next.x,progress);zone.z=mix(current.z,next.z,progress);zone.r=mix(current.r,next.r,progress);
    zone.timer=zone.shrinking?current.wait+current.shrink-remaining:Math.max(0,current.wait-remaining);
    const phase=`${stage}/${zone.shrinking}`;
    if(lastZonePhase!==phase){if(lastZonePhase){sound('zone');announce(`PHASE ${stage+1} / ${zone.shrinking?'BOUNDARY COLLAPSE':'SAFE ZONE UPDATED'}`,zone.shrinking?'경계가 좁혀지고 있습니다':'새로운 안전 구역',zone.shrinking?'지도를 확인하고 안전 구역으로 이동하세요.':'점선 안으로 이동해 다음 축소에 대비하세요.',3.8);}lastZonePhase=phase;}
    zoneWall.position.set(zone.x,18,zone.z);zoneWall.scale.set(zone.r,1,zone.r);zoneRing.position.set(zone.x,.15,zone.z);zoneRing.scale.setScalar(zone.r);
    const distance=Math.hypot(player.x-zone.x,player.z-zone.z),outside=distance>zone.r;
    show('zone-alert',outside);$('storm-overlay').style.opacity=outside?'.85':'0';
    if(outside) {
      hurtPlayer(dt*(3+stage*2.8));
      const direction=Math.atan2(-(zone.x-player.x),-(zone.z-player.z))-yaw;
      const wrapped=Math.atan2(Math.sin(direction),Math.cos(direction));
      $('safe-distance').textContent=`${wrapped>.6?'←':wrapped<-.6?'→':'↑'} ${Math.ceil(distance-zone.r)}m`;
    }
  }
  const mapBase=document.createElement('canvas');mapBase.width=mapBase.height=900;
  const baseContext=mapBase.getContext('2d');
  function mapPos(x,size){return (x+128)/256*size;}
  function drawMapBase() {
    const ctx=baseContext,size=900,scale=size/256;
    ctx.fillStyle='#41574c';ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='#c9cda515';ctx.lineWidth=1;
    for(let i=0;i<=size;i+=size/16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke();}
    // Contour lines give a readable geographical frame around the outpost.
    for(let i=0;i<9;i++) {
      ctx.strokeStyle='#bfc49512';ctx.beginPath();
      for(let j=0;j<=80;j++){const a=j/80*TAU,r=355+i*14+Math.sin(a*5+i*.3)*18;const x=450+Math.cos(a)*r,z=450+Math.sin(a)*r;if(j===0)ctx.moveTo(x,z);else ctx.lineTo(x,z);}ctx.stroke();
    }
    ctx.fillStyle='#a4a88b35';ctx.fillRect(mapPos(-6,size),mapPos(-78,size),12*scale,160*scale);ctx.fillRect(mapPos(-66,size),mapPos(-4.5,size),132*scale,9*scale);
    ctx.fillStyle='#909a7977';ctx.fillRect(mapPos(-15,size),mapPos(-24,size),30*scale,34*scale);
    for(const building of mapBuildings){ctx.fillStyle='#b5ba96';ctx.fillRect(mapPos(building.x-building.w/2,size),mapPos(building.z-building.d/2,size),building.w*scale,building.d*scale);ctx.strokeStyle='#243f35';ctx.lineWidth=2;ctx.strokeRect(mapPos(building.x-building.w/2,size),mapPos(building.z-building.d/2,size),building.w*scale,building.d*scale);}
    for(const c of colliders){if(c.maxX-c.minX>6||c.maxZ-c.minZ>6)continue;ctx.fillStyle='#b2b28a75';ctx.fillRect(mapPos(c.minX,size),mapPos(c.minZ,size),(c.maxX-c.minX)*scale,(c.maxZ-c.minZ)*scale);}
    ctx.font='bold 19px monospace';ctx.textAlign='center';ctx.fillStyle='#d3d6ad60';ctx.fillText('OUTPOST 09',450,mapPos(-34,size));
    ctx.font='11px monospace';ctx.fillText('NORTH RIDGE',450,95);ctx.fillText('DEADLANDS',450,810);
  }
  drawMapBase();
  function drawMap(target,large=false) {
    const ctx=target.getContext('2d'),size=target.width,scale=size/256;
    ctx.clearRect(0,0,size,size);ctx.drawImage(mapBase,0,0,size,size);
    // Even-odd fill shades the storm while leaving the safe circle clear.
    ctx.fillStyle='#323f6470';ctx.beginPath();ctx.rect(0,0,size,size);ctx.arc(mapPos(zone.x,size),mapPos(zone.z,size),zone.r*scale,0,TAU,true);ctx.fill('evenodd');
    ctx.beginPath();ctx.arc(mapPos(zone.x,size),mapPos(zone.z,size),zone.r*scale,0,TAU);ctx.strokeStyle='#90ded2';ctx.lineWidth=large?3:2;ctx.stroke();
    const next=stages[Math.min(zone.stage+1,stages.length-1)];
    ctx.beginPath();ctx.setLineDash(large?[9,8]:[5,5]);ctx.arc(mapPos(next.x,size),mapPos(next.z,size),next.r*scale,0,TAU);ctx.strokeStyle='#edf1d4a8';ctx.lineWidth=large?2:1.6;ctx.stroke();ctx.setLineDash([]);
    if(large)for(const item of loot){if(!item.active)continue;ctx.fillStyle=item.type==='ammo'?'#dfc482':item.type==='shield'?'#83cfc5':'#bfd787';ctx.fillRect(mapPos(item.x,size)-3,mapPos(item.z,size)-3,6,6);}
    for(const bot of bots){if(!bot.alive)continue;if(Math.hypot(bot.x-player.x,bot.z-player.z)>38||!lineOfSight(player,bot))continue;ctx.fillStyle='#eea77d';ctx.beginPath();ctx.arc(mapPos(bot.x,size),mapPos(bot.z,size),large?4:3,0,TAU);ctx.fill();}
    const px=mapPos(player.x,size),pz=mapPos(player.z,size);
    ctx.save();ctx.translate(px,pz);ctx.rotate(-yaw);
    ctx.fillStyle='#e8f4911c';ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,large?52:25,-Math.PI*.69,-Math.PI*.31);ctx.closePath();ctx.fill();
    const s=large?10:7;ctx.fillStyle='#e5f58c';ctx.strokeStyle='#253f32';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(-s*.7,s*.65);ctx.lineTo(0,s*.3);ctx.lineTo(s*.7,s*.65);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle='#e5ebc8';ctx.textAlign='center';ctx.font=`bold ${large?15:13}px monospace`;ctx.fillText('N',size/2,large?25:19);
    if(large){ctx.font='11px monospace';ctx.fillStyle='#e7edd0bb';ctx.fillText('NEXT',mapPos(next.x,size),mapPos(next.z-next.r,size)-10);}
  }
  const compassTicks=[];
  for(let i=0;i<24;i++){const span=document.createElement('span');span.className='compass-tick'+(i%3===0?' major':'');span.textContent=({0:'N',3:'NE',6:'E',9:'SE',12:'S',15:'SW',18:'W',21:'NW'})[i]??`${i*15}`;$('compass').append(span);compassTicks.push(span);}
  function updateHUD() {
    $('alive').textContent=bots.filter(b=>b.alive).length+(player.alive?1:0);$('kills').textContent=matchKills;
    $('health-number').textContent=Math.ceil(player.hp);$('shield-number').textContent=Math.ceil(player.shield);
    $('health-fill').style.width=`${player.hp}%`;$('shield-fill').style.width=`${player.shield}%`;$('stamina-fill').style.width=`${player.stamina}%`;
    $('health-fill').style.background=player.hp<30?'#f28a6b':'';
    $('med-count').textContent=player.meds;$('player-status').textContent=player.sprinting?'OPERATOR / SPRINTING':player.hp<30?'OPERATOR / CRITICAL':'OPERATOR / ACTIVE';
    const w=weapons[currentWeapon];$('ammo').textContent=w.ammo.toString().padStart(2,'0');$('reserve').textContent=w.reserve;$('weapon-name').textContent=w.name;$('weapon-type').textContent=w.type;$('fire-mode').textContent=w.mode;
    $('ammo').parentElement.classList.toggle('low',w.ammo<6);
    $('slot-0').classList.toggle('selected',currentWeapon===0);$('slot-1').classList.toggle('selected',currentWeapon===1);
    $('zone-label').textContent=zone.shrinking?'안전 구역 축소 중':zone.stage===stages.length-1?'최종 안전 구역':`다음 축소 · ${zone.stage+1}단계`;
    $('zone-timer').textContent=zone.stage===stages.length-1?'FINAL':clockText(Math.ceil(zone.timer));
    const bearing=(((-yaw*180/Math.PI)%360)+360)%360;
    $('bearing').textContent=`${Math.round(bearing).toString().padStart(3,'0')}°`;
    const width=$('compass').clientWidth;
    compassTicks.forEach((span,i)=>{let diff=(i*15-bearing+540)%360-180;span.style.left=`${width/2+diff*3.1}px`;});
    $('crosshair').classList.toggle('aim',aiming);
    drawMap($('minimap'));if(mapOpen)drawMap($('tactical-map'),true);
  }
  function updateEffects(dt) {
    for(let i=effects.length-1;i>=0;i--){const effect=effects[i];effect.life-=dt;
      if(effect.kind==='particle'){effect.obj.position.x+=effect.vx*dt;effect.obj.position.y+=effect.vy*dt;effect.obj.position.z+=effect.vz*dt;effect.vy-=10*dt;effect.obj.rotation.x+=dt*5;}
      effect.obj.material.opacity=Math.max(0,effect.life/effect.maxLife);
      if(effect.life<=0){effect.obj.removeFromParent();if(effect.disposable)effect.obj.geometry.dispose();effect.obj.material.dispose();effects.splice(i,1);}
    }
    for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.life-=dt;f.y+=dt*.9;v4.set(f.x,f.y,f.z).project(camera);f.el.style.left=`${(v4.x*.5+.5)*innerWidth+f.offset}px`;f.el.style.top=`${(-v4.y*.5+.5)*innerHeight}px`;f.el.style.opacity=v4.z>1?'0':Math.min(1,f.life*3);if(f.life<=0){f.el.remove();floaters.splice(i,1);}}
    for(let i=feed.length-1;i>=0;i--)if(feed[i].time<elapsed){feed[i].el.remove();feed.splice(i,1);}
    hitTimer=Math.max(0,hitTimer-dt);$('hitmarker').style.opacity=hitTimer>0?'1':'0';
    damageFlash=Math.max(0,damageFlash-dt*2);$('damage-overlay').style.opacity=damageFlash;
    toastTimer-=dt;if(toastTimer<=0)show('toast',false);
    announcementTimer-=dt;if(announcementTimer<=0)show('announcement',false);
  }
  function disposeLoot(item) {
    item.root.traverse(o=>{if(!o.isMesh)return;if(!Object.values(geo).includes(o.geometry))o.geometry.dispose();if(o.material.isMeshBasicMaterial)o.material.dispose();});item.root.removeFromParent();
  }
  function clearMatch() {
    bots.forEach(b=>{b.mark.geometry.dispose();b.mark.material.dispose();b.root.removeFromParent();});bots.length=0;
    for(let i=loot.length-1;i>=0;i--){if(!loot[i].initial){disposeLoot(loot[i]);loot.splice(i,1);}else{loot[i].active=true;loot[i].root.visible=true;}}
    effects.forEach(e=>{e.obj.removeFromParent();if(e.disposable)e.obj.geometry.dispose();e.obj.material.dispose();});effects.length=0;
    floaters.forEach(f=>f.el.remove());floaters.length=0;feed.forEach(f=>f.el.remove());feed.length=0;
  }
  let pointerFallback=false,hadPointerLock=false;
  function requestLock() {
    if(!canvas.requestPointerLock){pointerFallback=true;toast('마우스를 누른 채 드래그하면 시점이 회전합니다.',5);return;}
    try {
      const promise=canvas.requestPointerLock();
      if(promise&&promise.catch)promise.catch(()=>{if(state==='playing'){pointerFallback=true;toast('드래그로 시점 회전 · Esc로 일시정지',5);}});
    }catch(_){pointerFallback=true;toast('드래그로 시점 회전 · Esc로 일시정지',5);}
  }
  function startMatch() {
    clearMatch();difficulty=$('difficulty').value;initAudio();
    Object.assign(player,{x:0,z:30,y:0,vy:0,hp:100,shield:100,stamina:100,meds:2,alive:true,grounded:true,moving:false,sprinting:false});
    weapons[0].ammo=30;weapons[0].reserve=180;weapons[1].ammo=8;weapons[1].reserve=40;
    currentWeapon=0;gunModels.forEach((g,i)=>g.visible=i===0);
    elapsed=0;matchKills=0;totalDamage=0;rank=16;grace=6;fireCooldown=.3;reload=null;healing=null;
    yaw=0;pitch=-.025;recoil=0;gunKick=0;shooting=false;aiming=false;sprintExhausted=false;
    damageFlash=0;hitTimer=0;muzzleTimer=0;toastTimer=0;mapOpen=false;nearestLoot=null;lastZonePhase='';
    keys.clear();camera.fov=76;camera.updateProjectionMatrix();gunRoot.position.set(.3,-.28,-.48);
    Object.assign(zone,{x:0,z:0,r:108,stage:0,timer:35,shrinking:false});
    for(let i=0;i<15;i++)makeBot(i);
    show('lobby',false);show('result',false);show('pause',false);show('controls',false);show('large-map',false);show('hud');show('zone-alert',false);show('pickup-prompt',false);show('action-progress',false);
    state='playing';$('storm-overlay').style.opacity=0;pointerFallback=false;
    updateZone(0);updatePlayer(0);updateHUD();requestLock();
    announce('OPERATION LAST LIGHT','마지막 한 명이 될 때까지','WASD 이동 · 좌클릭 사격 · E 보급품 획득',4.5);
    tone(330,.3,.17,'triangle');tone(494,.4,.14,'triangle',.18);
  }
  function pauseGame() {
    if(state!=='playing')return;state='paused';shooting=false;aiming=false;keys.clear();show('pause');
    if(document.pointerLockElement)document.exitPointerLock();
  }
  function resumeGame() {
    if(state!=='paused')return;state='playing';keys.clear();show('pause',false);initAudio();requestLock();
  }
  function returnLobby() {
    state='lobby';shooting=false;aiming=false;keys.clear();if(document.pointerLockElement)document.exitPointerLock();
    show('lobby');show('hud',false);show('pause',false);show('result',false);show('large-map',false);
    $('storm-overlay').style.opacity=0;$('damage-overlay').style.opacity=0;clearMatch();
    zoneWall.scale.set(108,1,108);zoneWall.position.set(0,18,0);zoneRing.position.set(0,.15,0);zoneRing.scale.setScalar(108);
  }
  function finish(won,killer='') {
    if(state!=='playing')return;
    state='result';shooting=false;aiming=false;keys.clear();reload=null;healing=null;
    if(document.pointerLockElement)document.exitPointerLock();
    show('hud',false);show('pause',false);show('result');$('storm-overlay').style.opacity=0;$('damage-overlay').style.opacity=0;
    $('result-rank').textContent=won?'#1':`#${rank}`;$('result-rank').style.color=won?'var(--acid)':'var(--paper)';
    $('result-kicker').textContent=won?'WINNER / LAST ONE STANDING':'ELIMINATED / UNTIL NEXT TIME';
    $('result-title').textContent=won?'마지막 생존자.':'빛은 아직 남아 있다.';
    $('result-sub').textContent=won?'이 전장의 마지막 빛은 당신입니다.':`${killer}에게 탈락했습니다. 다음 전장에서 다시 도전하세요.`;
    $('result-kills').textContent=matchKills;$('result-time').textContent=clockText(elapsed);$('result-damage').textContent=Math.round(totalDamage);
    try {
      let record=JSON.parse(localStorage.getItem('lastlight-record-v1')||'null')||{wins:0,bestKills:0,matches:0};
      record.wins+=won?1:0;record.bestKills=Math.max(record.bestKills,matchKills);record.matches++;
      localStorage.setItem('lastlight-record-v1',JSON.stringify(record));
      $('personal-best').textContent=`LOCAL RECORD / ${record.wins} WINS · BEST ${record.bestKills} KILLS · ${record.matches} MATCHES`;
    }catch(_){$('personal-best').textContent='LAST LIGHT / OUTPOST 09';}
    sound(won?'win':'zone');
  }
  function toggleMap() {mapOpen=!mapOpen;show('large-map',mapOpen);shooting=false;aiming=false;if(mapOpen)drawMap($('tactical-map'),true);}

  $('deploy').addEventListener('click',startMatch);
  $('resume').addEventListener('click',resumeGame);
  $('quit').addEventListener('click',returnLobby);
  $('play-again').addEventListener('click',startMatch);
  $('result-lobby').addEventListener('click',returnLobby);
  $('how-to').addEventListener('click',()=>show('controls'));
  $('close-controls').addEventListener('click',()=>show('controls',false));
  $('controls-ready').addEventListener('click',()=>show('controls',false));
  $('controls').addEventListener('click',e=>{if(e.target===$('controls'))show('controls',false);});
  document.querySelectorAll('.audio-toggle').forEach(button=>button.addEventListener('click',toggleAudio));
  $('pause-audio').addEventListener('click',toggleAudio);
  $('sensitivity').addEventListener('input',e=>{sensitivity=Number(e.target.value);$('sensitivity-value').textContent=sensitivity.toFixed(1);});
  document.querySelectorAll('.fullscreen-toggle').forEach(button=>button.addEventListener('click',()=>{
    if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});}
    else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{button.title='브라우저 메뉴에서 전체 화면을 선택해 주세요.';});
  }));
  document.querySelector('.brand').addEventListener('click',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{
    if(document.pointerLockElement===canvas){hadPointerLock=true;pointerFallback=false;}
    else {if(hadPointerLock&&state==='playing')pauseGame();hadPointerLock=false;}
  });
  document.addEventListener('pointerlockerror',()=>{if(state==='playing'){pointerFallback=true;toast('마우스 드래그로 시점을 움직일 수 있습니다.',4);}});
  document.addEventListener('mousemove',e=>{
    if(state!=='playing'||mapOpen)return;
    if(document.pointerLockElement===canvas||(pointerFallback&&e.buttons)){
      yaw-=e.movementX*.0021*sensitivity*(aiming?.65:1);pitch=clamp(pitch-e.movementY*.0021*sensitivity*(aiming?.65:1),-1.36,1.36);
    }
  });
  canvas.addEventListener('mousedown',e=>{
    if(state!=='playing'||mapOpen)return;
    if(!document.pointerLockElement&&!pointerFallback)requestLock();
    if(e.button===0)shooting=true;if(e.button===2)aiming=true;
  });
  document.addEventListener('mouseup',e=>{if(e.button===0)shooting=false;if(e.button===2)aiming=false;});
  document.addEventListener('contextmenu',e=>{if(state==='playing')e.preventDefault();});
  document.addEventListener('keydown',e=>{
    if(e.code==='Escape') {
      if(!$('controls').classList.contains('hidden')){show('controls',false);return;}
      if(state==='playing')pauseGame();else if(state==='paused')resumeGame();return;
    }
    if(state!=='playing')return;
    if(['Space','Tab','KeyW','KeyA','KeyS','KeyD','KeyM','KeyF','KeyE','KeyR','Digit1','Digit2','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.repeat)return;
    if(e.code==='KeyR')startReload();if(e.code==='Digit1')switchWeapon(0);if(e.code==='Digit2')switchWeapon(1);if(e.code==='KeyF')heal();if(e.code==='KeyE')pickup();if(e.code==='KeyM')toggleMap();
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
  window.addEventListener('blur',()=>pauseGame());
  window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();gunCamera.aspect=camera.aspect;gunCamera.updateProjectionMatrix();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pauseGame();$('error-message').textContent='그래픽 연결이 끊어졌습니다. 다시 시도를 눌러 게임을 다시 열어 주세요.';show('error');});

  function lobbyCamera(dt) {
    const angle=visualTime*.018;
    const target=new THREE.Vector3(63+Math.sin(angle)*13,33+Math.sin(angle*.7)*3,75+Math.cos(angle)*8);
    if(lastTime<.1)camera.position.copy(target);else camera.position.lerp(target,Math.min(1,dt*1.6));
    camera.lookAt(-5,4,-10);camera.fov=mix(camera.fov,55,Math.min(1,dt*3));camera.updateProjectionMatrix();
  }
  camera.position.set(67,35,83);camera.lookAt(-5,4,-10);camera.fov=55;camera.updateProjectionMatrix();
  zoneWall.scale.set(108,1,108);zoneRing.scale.setScalar(108);
  function animate(time) {
    requestAnimationFrame(animate);
    const now=time*.001,dt=Math.min(.04,Math.max(0,now-lastTime));lastTime=now;visualTime+=dt;
    zoneMaterial.uniforms.time.value=visualTime;beacon.visible=Math.sin(visualTime*2.5)>.1;
    for(const item of loot)if(item.active){item.icon.rotation.y=visualTime*.8;item.icon.position.y=1.45+Math.sin(visualTime*2+item.x)*.12;}
    if(state==='playing') {
      elapsed+=dt;grace-=dt;fireCooldown=Math.max(0,fireCooldown-dt);muzzleTimer=Math.max(0,muzzleTimer-dt);
      // Arrow keys also allow view control if pointer locking is unavailable.
      yaw+=((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*dt*1.6;
      pitch=clamp(pitch+((keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0))*dt,-1.36,1.36);
      updateZone(dt);
      if(state==='playing')updatePlayer(dt);
      if(state==='playing')updateBots(dt);
      if(state==='playing'&&bots.every(b=>!b.alive))finish(true);
      updateEffects(dt);uiClock+=dt;if(uiClock>.08){updateHUD();uiClock=0;}
    } else if(state==='lobby'||state==='result') {lobbyCamera(dt);updateEffects(dt);}
    renderer.clear();renderer.render(scene,camera);
    if(state==='playing'||state==='paused'){renderer.clearDepth();renderer.render(gunScene,gunCamera);}
  }
  // Read-only diagnostics make browser QA possible without changing a match.
  window.__LAST_LIGHT__=Object.freeze({
    version:'1.0.0',
    snapshot:()=>({state,elapsed,alive:bots.filter(b=>b.alive).length+(player.alive?1:0),kills:matchKills,player:{x:player.x,y:player.y,z:player.z,hp:player.hp,shield:player.shield,meds:player.meds},weapon:currentWeapon,ammo:weapons.map(w=>w.ammo),reserve:weapons.map(w=>w.reserve),reloading:!!reload,healing:!!healing,zone:{...zone},mapOpen,pointerLocked:document.pointerLockElement===canvas,drawCalls:renderer.info.render.calls})
  });
  requestAnimationFrame(animate);
  $('loading').style.opacity='0';setTimeout(()=>$('loading').style.display='none',420);
})();
