/* The battlegrounds are painted once per map on a half-resolution pixel grid. */
(() => {
  'use strict';
  const maps = {
    shoals: {name:'유리여울 군도', beaconName:'남쪽 봉화', description:'가운데 섬의 좁은 다리를 확보하고, 남동쪽 봉화에서 보급을 받으세요.'},
    delta: {name:'너울문 삼각주', beaconName:'북쪽 봉화', description:'북쪽 봉화로 병력을 보내거나, 남쪽의 넓은 돌다리로 적 본진을 우회하세요.'},
    kiln: {name:'잿빛 종루', beaconName:'종루 봉화', description:'넓은 중앙 둑길의 종루를 점령하세요. 북쪽 사슬다리를 건너면 물결 금고와 추가 자원 지대가 있습니다.'},
    lantern: {name:'달등 나루', beaconName:'나루 봉화', description:'등불이 켜진 중앙 돌길은 적 본진까지 빠르게 이어집니다. 남쪽 갈대 부두로 돌아가면 추가 광맥과 물결 금고가 있습니다.'}
  };
  const shoalsLayout = {
    player: {hq:[310,280],barracks:[220,355],house:[414,336],crystal:[160,242],ore:[425,425],
      workers:[[182,251],[239,273],[327,346],[407,402],[270,324],[345,318]],soldiers:[[343,369],[368,378]]},
    enemy: {hq:[960,213],barracks:[1045,265],house:[907,255],crystal:[1075,170],ore:[865,300],
      workers:[[1037,181],[1003,196],[907,278],[875,293]],soldiers:[[946,289],[979,292]]},
    expansion: {crystal:[980,510],ore:[1032,530]},
    buildSites: [[988,312],[1120,240],[891,196],[1034,347],[984,146],[852,243],[1120,295],[1070,113]],
    towerSites: [[881,222],[944,283]]
  };
  const deltaLayout = {
    player: {hq:[280,326],barracks:[182,389],house:[330,410],crystal:[160,286],ore:[386,345],
      workers:[[183,296],[205,309],[346,340],[373,357],[247,363],[289,372]],soldiers:[[337,368],[367,383]]},
    enemy: {hq:[1000,326],barracks:[1098,389],house:[950,410],crystal:[1120,286],ore:[894,345],
      workers:[[1097,296],[1075,309],[934,340],[907,357]],soldiers:[[943,368],[913,383]]},
    expansion: {crystal:[598,117],ore:[683,117]},
    buildSites: [[1060,247],[1010,419],[920,267],[1120,335],[995,233],[1100,444],[864,286],[915,454],[1046,478],[1170,393]],
    towerSites: [[889,243],[865,391]]
  };
  // At the delta the central floodway divides passage between two independent routes.
  const deltaOutlines = [
    [[18,126],[29,102],[47,97],[51,77],[75,73],[89,55],[108,52],[122,62],[146,48],[163,51],[175,65],[195,66],[208,81],[222,82],[229,97],[243,103],[249,114],[242,127],[227,136],[220,152],[230,167],[226,178],[245,191],[250,207],[237,218],[225,221],[215,238],[201,240],[185,260],[166,265],[149,260],[131,274],[108,265],[91,269],[80,258],[61,258],[51,242],[34,237],[39,223],[23,210],[28,194],[16,182],[19,166],[11,157],[17,144]],
    [[394,103],[408,96],[415,82],[434,84],[447,67],[466,65],[480,56],[497,63],[511,50],[534,55],[548,69],[565,71],[568,85],[592,92],[595,111],[610,115],[619,132],[611,146],[627,159],[620,178],[628,194],[614,205],[614,224],[600,231],[598,247],[574,250],[562,262],[541,258],[522,272],[503,264],[488,267],[476,254],[456,250],[448,238],[430,240],[420,225],[407,222],[391,210],[399,197],[410,188],[406,176],[417,160],[407,149],[412,139],[399,131],[401,121],[390,114]],
    [[263,87],[271,76],[275,61],[288,59],[296,48],[309,52],[316,44],[330,48],[341,45],[348,55],[360,57],[359,69],[374,77],[372,92],[362,104],[346,104],[338,116],[321,112],[309,119],[294,110],[283,111],[279,100],[269,98]],
    [[262,216],[273,202],[290,198],[305,194],[323,198],[340,191],[355,197],[368,195],[380,205],[379,220],[365,226],[362,238],[345,240],[334,253],[312,250],[301,256],[288,246],[271,247],[270,235],[259,228]],
    [[-12,14],[5,14],[14,6],[34,9],[39,20],[48,23],[46,35],[33,39],[24,46],[7,43],[-7,50]],
    [[198,-12],[363,-12],[351,4],[333,7],[325,17],[311,15],[298,25],[287,24],[280,33],[266,28],[257,31],[248,23],[235,22],[227,10],[209,6]],
    [[551,-10],[649,-9],[652,66],[643,61],[633,64],[625,53],[610,52],[607,40],[592,41],[578,30],[573,16],[559,12]],
    [[-12,270],[1,273],[10,266],[24,270],[28,281],[43,283],[51,295],[67,297],[77,312],[87,318],[79,335],[-10,336]],
    [[184,334],[189,321],[202,320],[209,306],[224,302],[232,307],[244,303],[254,313],[270,315],[280,335]],
    [[350,335],[352,317],[366,313],[379,302],[389,300],[404,308],[415,300],[430,308],[444,309],[451,321],[459,336]],
    [[582,324],[590,306],[598,309],[613,298],[625,298],[634,285],[649,286],[649,328]]
  ];
  const deltaBridges = [
    {a:[454,220],b:[550,180],width:30},{a:[716,178],b:[812,225],width:30},
    {a:[466,412],b:[550,434],width:46},{a:[732,434],b:[822,405],width:46}
  ];
  const deltaPaths = [
    [[71,142],[91,148],[109,155],[130,166],[148,172],[163,179],[181,183],[202,193],[235,206]],
    [[159,177],[179,162],[192,146],[204,127],[228,110]],
    [[111,203],[130,187],[148,172]],
    [[406,112],[422,128],[433,146],[444,159],[463,173],[484,178],[511,167],[559,142]],
    [[410,203],[431,194],[450,184],[463,173]],
    [[461,176],[487,189],[516,198],[552,202]],
    [[272,90],[288,87],[305,86],[320,84],[336,85],[353,88],[360,90]],
    [[271,218],[286,220],[307,221],[320,218],[339,217],[354,219],[370,216]]
  ];
  // Pixel outlines are half size. Buildings, bridges and capture ranges use world coordinates.
  const kilnWest = [[6,122],[19,109],[23,93],[43,88],[54,72],[75,71],[83,57],[107,54],[116,43],[135,44],[146,38],[165,45],[181,42],[195,52],[201,66],[214,71],[218,87],[208,104],[214,120],[207,135],[219,146],[223,157],[238,162],[235,182],[224,190],[230,203],[216,214],[211,234],[191,239],[182,256],[165,259],[150,276],[132,270],[113,283],[94,276],[77,280],[61,266],[48,264],[43,247],[25,239],[29,221],[16,210],[19,193],[7,179],[13,163],[4,148],[12,136]];
  const kilnOutlines = [
    kilnWest,kilnWest.map(([x,y])=>[640-x,y]).reverse(),
    [[257,162],[269,155],[275,141],[292,141],[303,132],[315,136],[327,128],[341,137],[355,136],[364,149],[378,152],[384,165],[378,178],[383,189],[368,197],[362,210],[347,211],[339,221],[321,215],[308,225],[297,218],[282,219],[274,208],[261,204],[263,190],[253,181]],
    [[247,68],[256,60],[260,50],[275,48],[283,38],[297,40],[309,31],[323,36],[336,30],[345,37],[360,36],[366,45],[380,48],[382,61],[394,67],[389,82],[375,85],[368,97],[348,96],[334,103],[318,97],[302,103],[289,98],[271,99],[264,88],[251,85]],
    [[-9,-10],[148,-10],[142,4],[125,8],[110,19],[98,16],[80,27],[64,24],[51,36],[30,37],[19,48],[-9,44]],
    [[438,-12],[656,-12],[656,49],[632,54],[622,42],[606,43],[597,28],[576,31],[559,20],[537,23],[521,12],[507,17],[488,10],[468,12],[454,2]],
    [[-12,276],[4,270],[22,280],[33,278],[45,288],[63,291],[77,302],[99,305],[118,324],[-12,329]],
    [[229,326],[241,310],[244,292],[260,286],[272,269],[286,273],[302,259],[317,265],[335,255],[352,259],[371,248],[387,256],[384,269],[406,276],[407,288],[425,295],[431,313],[447,328]],
    [[548,332],[553,315],[569,308],[578,296],[595,298],[608,282],[622,286],[634,270],[651,269],[651,333]]
  ];
  const kilnBridges = [
    {a:[448,354],b:[558,350],width:64},{a:[722,350],b:[832,354],width:64},
    {a:[408,198],b:[540,144],width:29},{a:[740,144],b:[872,198],width:29}
  ];
  const kilnApproach=[[63,171],[90,173],[116,179],[145,183],[166,183],[188,176],[203,177],[225,177]];
  const kilnClimb=[[143,182],[158,168],[172,155],[180,135],[187,116],[204,99]];
  const kilnPaths=[kilnApproach,kilnClimb,...[kilnApproach,kilnClimb].map(path=>path.map(([x,y])=>[640-x,y])),
    [[277,175],[293,175],[309,181],[327,181],[347,175],[363,175]],
    [[269,72],[290,70],[305,67],[324,68],[343,74],[369,72]]];
  const kilnPlayer={hq:[248,365],barracks:[164,433],house:[318,454],crystal:[138,318],ore:[367,391],
    workers:[[163,327],[183,337],[331,394],[349,406],[222,408],[278,407]],soldiers:[[313,369],[335,353]]};
  const reflect=([x,y])=>[1280-x,y];
  const kilnLayout={
    player:kilnPlayer,
    enemy:{...Object.fromEntries(['hq','barracks','house','crystal','ore'].map(key=>[key,reflect(kilnPlayer[key])])),
      workers:kilnPlayer.workers.slice(0,4).map(reflect),soldiers:kilnPlayer.soldiers.map(reflect)},
    expansion:{crystal:[568,100],ore:[712,100]},
    buildSites:[[1054,246],[1134,354],[994,495],[968,291],[1200,408],[1090,493],[916,133],[1018,192],[1155,278],[886,338]],
    towerSites:[[897,323],[896,236]]
  };
  // The ferry channel cuts northeast across two terraced reed banks. The lower
  // pier connects behind the east bank and leaves the faster causeway exposed.
  const lanternOutlines = [
    [[5,192],[17,180],[16,163],[31,154],[40,135],[57,128],[67,108],[84,105],[98,89],[119,85],[132,94],[147,90],[160,96],[170,113],[185,118],[188,134],[201,144],[202,157],[216,161],[222,174],[219,184],[207,190],[200,205],[207,219],[218,222],[226,233],[223,246],[206,252],[192,264],[168,261],[151,278],[129,275],[111,287],[94,280],[77,286],[61,276],[46,276],[37,260],[20,249],[19,231],[8,221],[11,205]],
    [[392,104],[404,94],[410,79],[427,76],[434,58],[453,54],[468,43],[482,46],[501,35],[521,38],[532,29],[549,35],[569,32],[579,48],[597,53],[601,67],[618,72],[617,89],[631,100],[625,119],[630,134],[617,147],[614,163],[598,172],[591,188],[573,194],[561,208],[547,205],[534,222],[509,222],[495,232],[471,229],[456,239],[440,229],[440,213],[428,207],[432,187],[421,171],[425,155],[413,148],[412,133],[400,128],[406,116],[394,115]],
    [[253,145],[267,137],[269,124],[289,120],[297,106],[311,110],[321,97],[340,99],[351,93],[361,99],[371,98],[380,112],[375,126],[363,134],[362,146],[343,151],[332,164],[314,165],[303,179],[285,181],[279,171],[268,171],[263,158],[252,156]],
    [[261,249],[272,239],[290,239],[298,227],[314,224],[328,211],[348,214],[360,203],[376,210],[390,208],[407,220],[403,233],[410,245],[395,258],[391,272],[372,274],[360,286],[342,281],[333,290],[314,286],[303,291],[292,280],[277,279],[272,267],[260,261]]
  ];
  const lanternBridges = [
    {a:[416,350],b:[548,296],width:46},{a:[714,258],b:[836,214],width:46},
    {a:[432,468],b:[572,506],width:33},{a:[776,485],b:[900,429],width:33}
  ];
  const lanternPaths = [
    [[60,180],[94,198],[124,205],[155,197],[179,188],[209,175]],
    [[124,205],[146,220],[180,225],[201,231],[216,234]],
    [[419,107],[445,100],[467,101],[487,109],[512,105],[542,96],[565,83]],
    [[452,213],[466,193],[471,165],[481,144],[489,121],[512,105]],
    [[273,148],[288,147],[302,139],[316,142],[328,134],[342,134],[359,129]],
    [[285,253],[312,259],[333,250],[351,251],[368,243],[389,242]]
  ];
  const lanternLayout={
    player:{hq:[250,410],barracks:[154,462],house:[337,480],crystal:[139,349],ore:[358,409],
      workers:[[160,358],[180,373],[331,408],[344,426],[216,436],[277,448]],soldiers:[[314,368],[345,367]]},
    enemy:{hq:[1025,210],barracks:[1103,285],house:[921,199],crystal:[1139,145],ore:[909,301],
      workers:[[1114,155],[1097,171],[930,299],[946,289]],soldiers:[[955,246],[935,249]]},
    expansion:{crystal:[629,503],ore:[726,454]},
    buildSites:[[1047,317],[1171,226],[971,335],[1042,134],[1157,187],[1095,371],[938,148],[988,402],[906,368],[1018,262]],
    towerSites:[[882,235],[912,386]]
  };
  const instances = new Map();

  function createTerrain(mapId) {
  const delta = mapId === 'delta', kiln = mapId === 'kiln', lantern = mapId === 'lantern';
  const W = 640, H = 320;
  const outlines = lantern ? lanternOutlines : kiln ? kilnOutlines : delta ? deltaOutlines : [
    [[54,109],[69,101],[72,88],[88,84],[97,71],[120,68],[127,59],[151,57],[161,63],[183,60],[191,68],[212,69],[222,79],[242,82],[247,94],[264,103],[260,117],[271,128],[270,144],[282,152],[279,167],[260,174],[265,186],[251,197],[250,210],[236,214],[232,227],[212,229],[204,243],[185,244],[173,257],[150,254],[137,261],[118,255],[104,257],[97,246],[78,245],[76,232],[60,229],[61,217],[48,209],[51,195],[39,187],[46,174],[39,164],[45,149],[39,139],[48,130],[45,118]],
    [[386,89],[391,78],[408,76],[419,64],[432,63],[443,49],[463,47],[470,38],[492,41],[504,34],[519,38],[537,35],[547,46],[565,47],[572,58],[586,61],[585,74],[599,81],[596,94],[605,103],[600,115],[606,129],[594,140],[598,151],[581,157],[575,172],[557,175],[551,185],[534,184],[522,194],[506,189],[486,192],[475,184],[455,184],[448,175],[434,175],[425,162],[407,161],[404,151],[390,146],[394,135],[381,128],[384,117],[377,108]],
    [[300,164],[309,154],[319,153],[327,144],[340,145],[349,138],[361,143],[366,149],[375,151],[377,164],[369,171],[370,182],[357,185],[352,195],[337,198],[329,191],[318,191],[314,183],[304,183],[305,175],[297,172]],
    [[381,262],[391,253],[396,240],[412,236],[415,226],[432,227],[444,217],[462,219],[472,210],[487,215],[501,212],[514,220],[531,218],[542,209],[561,212],[571,203],[588,207],[599,196],[612,201],[625,197],[636,206],[650,203],[655,334],[421,337],[417,322],[405,317],[408,305],[395,301],[395,288],[384,283],[389,272]],
    [[-15,-18],[159,-14],[153,-2],[137,2],[129,13],[111,13],[100,22],[78,20],[69,29],[53,31],[46,41],[29,40],[19,49],[6,47],[-10,56]],
    [[-14,260],[-1,252],[14,256],[21,268],[38,267],[47,276],[61,279],[70,294],[83,296],[91,306],[112,313],[124,326],[-14,338]],
    [[612,-12],[651,-12],[656,57],[640,53],[634,43],[624,40],[626,30],[615,23],[618,12],[609,4]],
    [[225,-22],[378,-20],[366,-5],[351,-1],[341,9],[321,7],[314,14],[297,12],[284,17],[274,12],[249,10]],
    [[284,301],[292,297],[293,290],[304,288],[311,281],[325,282],[332,287],[346,284],[352,291],[363,293],[362,301],[371,307],[367,319],[376,326],[280,330],[277,314]],
    [[279,48],[285,45],[289,36],[297,37],[302,32],[313,34],[316,39],[325,40],[324,47],[316,50],[314,55],[303,56],[295,60],[289,54],[281,53]],
    [[33,78],[37,74],[43,74],[44,70],[50,70],[54,75],[50,80],[44,80],[40,84],[34,82]],
    [[555,200],[562,196],[571,198],[574,201],[569,205],[559,205]],
    [[184,293],[190,289],[195,288],[197,286],[205,289],[202,293],[194,296],[187,296]]
  ];
  const bridges = lantern ? lanternBridges : kiln ? kilnBridges : delta ? deltaBridges : [
    {a:[510,328],b:[623,343],width:32},
    {a:[725,322],b:[821,286],width:31},
    {a:[696,382],b:[827,477],width:31}
  ];
  const beacon = Object.freeze(lantern ? {x:632,y:284,radius:58} : kiln ? {x:640,y:350,radius:64} : delta ? {x:640,y:168,radius:64} : {x:900,y:508,radius:64});
  function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shapeRng = random(lantern ? 631806 : kiln ? 31153 : delta ? 76307 : 75303);
  function serrate(poly) {
    const out = [];
    poly.forEach((a,i) => {
      const b = poly[(i+1)%poly.length], dx=b[0]-a[0], dy=b[1]-a[1], d=Math.hypot(dx,dy), n=Math.max(1,Math.round(d/6));
      for(let k=0;k<n;k++) {
        const f=k/n, jitter=k ? (shapeRng()-.5)*3.1 : 0;
        out.push([Math.round(a[0]+dx*f-dy/d*jitter),Math.round(a[1]+dy*f+dx/d*jitter)]);
      }
    }); return out;
  }
  const shapes = outlines.map(serrate);
  const islands = shapes.map(poly=>poly.map(([x,y])=>[x*2,y*2]));
  const segments = bridges.map(({a,b,width})=>({x:a[0],y:a[1],dx:b[0]-a[0],dy:b[1]-a[1],r:width/2}));
  const palette = new Map();
  const deltaColors = {
    // Copper salt grass, lavender slate and cold tidal water.
    '697b65':'8b795c','718269':'93805d','78886b':'9b8966','788b6e':'a18f67','81916f':'a9966b','849371':'ae9b70','889673':'b29f71',
    '7f906e':'a38e66','788872':'a59672','647b66':'816e57','64775f':'8c7756','728361':'957e59','92a07a':'beb184',
    '74886a':'9a855f','7e8f6e':'a48d63','8b9974':'b2a071','82936f':'ad976b','718368':'978260','91a17a':'bcab79',
    '8a917b':'ac9b7e','9a9d85':'bfaf8a','747e70':'8f856e','84926d':'a38b63','96a174':'c0a675',
    '9caa82':'c8b58b','92a183':'c0b191','8a9c78':'ad9e76','62775f':'87775d',
    '728062':'92805c','84916b':'ac9467','98a57b':'c8b47e','617761':'847759','65795c':'8c7457','63775e':'947b57',
    '566f53':'7b705b','7f925f':'9e8d62','829563':'ad9567','758c62':'a58a5e','a6ad77':'c2aa72',
    '95957b':'b6a783','96967b':'bbad8d','92937a':'b3a384','99977e':'b8aa90','8f9276':'beac8b','899073':'aa9777','a3a087':'cec0a2',
    '193b46':'293b50','1b404a':'2b4056','1c424b':'2d435a','1d444e':'30485e','1e464e':'344b61','20494f':'364e65','214a51':'395268',
    '214752':'31485b','244b54':'344e61','2a5058':'395369','2b5459':'3c586e','2d5659':'40596c','173e49':'2a4155','234c54':'375266',
    '417073':'57798a','315c61':'49687a','315b62':'425d72','558084':'708f9d',
    '454d63':'53515e','50566b':'5b5965','4c5368':'595763','565b71':'635f69','434b61':'4d4d5d','394257':'434253',
    'b093a4':'bb885f','c4acbc':'d9ab77','a999aa':'c79772','c4af7b':'bdb0aa','d5c185':'d5bfb0','b0a36e':'ac998b'
  };
  const kilnColors = {
    '315b62':'693b3d','325f63':'71453f','2f585f':'59333c','3b6669':'804842','628986':'bd7752','487478':'8b4e45',
    '454d63':'514955','50566b':'5d525f','4c5368':'564c5c','565b71':'655863','434b61':'4b424f','394257':'443c48','313d51':'393440',
    '95957b':'94867d','96967b':'9b8b7e','92937a':'93877e','99977e':'9a8d82','8f9276':'958b83','899073':'8b817b','a3a087':'b2a08b',
    'b1a58e':'a69b93','a99b86':'aa9c90','aa9f8f':'a79a9b','b7ac98':'b5aaa3','a99d8a':'9f9395','686675':'5b515c',
    'c8baa3':'d1b79d','918778':'817678','c7aa87':'b69277','e2c598':'e6bf8f','bcab92':'c2aca0','2c4053':'39343f',
    '998470':'756978','a18a72':'817382','8f7d69':'706674','a99176':'847886','998673':'80737d','71675b':'514856','b3a087':'a59298',
    '4d514b':'4e414a','9f9478':'ba916d','bdab90':'d7a582','617761':'695f68','193c45':'342f38','3f4545':'48404a'
  };
  const lanternColors = {
    '315b62':'344d72','325f63':'395879','2f585f':'29435c','3b6669':'466182','628986':'75a0ab','487478':'537a93',
    '697b65':'536c68','718269':'5a736c','78886b':'647d72','788b6e':'698479','81916f':'708a7e','849371':'769182','889673':'819788',
    '7f906e':'6c8277','788872':'72877c','647b66':'546c65','64775f':'4c655e','728361':'6d806e','92a07a':'90a08a',
    '74886a':'637d72','7e8f6e':'6c8377','8b9974':'809384','82936f':'778c7b','718368':'61786d','91a17a':'899c86',
    '8a917b':'7a8984','9a9d85':'a0ada2','747e70':'64766e','84926d':'778a78','96a174':'9aa88c','9caa82':'a8b9aa',
    '92a183':'96b0a6','8a9c78':'819c92','62775f':'546c68',
    '95957b':'8c9187','96967b':'94978c','92937a':'86908a','99977e':'9b9e91','8f9276':'8c9389','899073':'808b80','a3a087':'a7ad9a',
    'b1a58e':'a5a69f','a99b86':'989f9a','aa9f8f':'a0a6a3','b7ac98':'adb2ac','a99d8a':'9ba49b','686675':'606e75',
    'c8baa3':'c8c7b2','918778':'81908a','c7aa87':'bda784','bcab92':'c6bca5','2c4053':'283848',
    '998470':'8f7d6e','a18a72':'998773','8f7d69':'8b7969','a99176':'a08e79','998673':'968471','71675b':'585a5b','b3a087':'b9a78c'
  };
  function color(hex) {
    if (typeof hex==='number') return hex;
    if (lantern) hex=lanternColors[hex] || hex;
    else if (kiln) hex=kilnColors[hex] || hex;
    else if (delta) hex=deltaColors[hex] || hex;
    if (!palette.has(hex)) {const n=parseInt(hex.replace('#',''),16); palette.set(hex, (0xff000000 | ((n&255)<<16) | (n&0xff00) | (n>>16))>>>0);}
    return palette.get(hex);
  }
  const pixels = new Uint32Array(W*H), surface = new Uint8Array(W*H);
  let clip=0;
  function row(x1,x2,y,c,target=pixels) {
    y=Math.round(y); if(y<0 || y>=H) return;
    const a=Math.max(0,Math.ceil(Math.min(x1,x2))), b=Math.min(W-1,Math.floor(Math.max(x1,x2)));
    if (b<a) return;
    const i=y*W; if (clip && target===pixels){ for(let x=a;x<=b;x++) if(surface[i+x]===clip) target[i+x]=c; }
    else target.fill(c,i+a,i+b+1);
  }
  function rect(x,y,w,h,c){c=color(c);x=Math.round(x);y=Math.round(y); for(let j=0;j<Math.round(h);j++) row(x,x+w-1,y+j,c);}
  function polygon(points,c,target=pixels){
    c=target===pixels?color(c):c;
    let min=H,max=-1; for(const p of points){min=Math.min(min,p[1]);max=Math.max(max,p[1]);}
    const hits=[];
    for(let y=Math.max(0,Math.ceil(min));y<=Math.min(H-1,Math.ceil(max)-1);y++) {
      hits.length=0; const sy=y+.5;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {const a=points[j],b=points[i]; if((a[1]<=sy && b[1]>sy)||(b[1]<=sy && a[1]>sy)) hits.push(a[0]+(sy-a[1])/(b[1]-a[1])*(b[0]-a[0]));}
      hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2) row(Math.ceil(hits[i]-.5),Math.ceil(hits[i+1]-.5)-1,y,c,target);
    }
  }
  function line(x1,y1,x2,y2,c){
    c=color(c); x1=Math.round(x1);y1=Math.round(y1);x2=Math.round(x2);y2=Math.round(y2);
    const dx=Math.abs(x2-x1),sx=x1<x2?1:-1,dy=-Math.abs(y2-y1),sy=y1<y2?1:-1;let e=dx+dy;
    for(;;){if(x1>=0&&x1<W&&y1>=0&&y1<H&&(!clip||surface[y1*W+x1]===clip)) pixels[y1*W+x1]=c;
      if(x1===x2&&y1===y2)break; const t=2*e;if(t>=dy){e+=dy;x1+=sx;}if(t<=dx){e+=dx;y1+=sy;}}
  }
  function ellipse(x,y,rx,ry,c){ c=color(c); for(let j=-Math.floor(ry);j<=Math.floor(ry);j++){ const reach=rx*Math.sqrt(Math.max(0,1-(j*j)/(ry*ry))); row(x-reach,x+reach,y+j,c); } }
  shapes.forEach((p,i)=>polygon(p,i+1,surface));
  function ground(x,y){
    if(x<0||y<0||x>=W*2||y>=H*2)return false;
    if(surface[Math.floor(y/2)*W+Math.floor(x/2)])return true;
    return segments.some(s=>{const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/(s.dx*s.dx+s.dy*s.dy))); return (s.x+s.dx*t-x)**2+(s.y+s.dy*t-y)**2<=s.r*s.r;});
  }
  const paths=lantern ? lanternPaths : kiln ? kilnPaths : delta ? deltaPaths : [
    [[77,123],[99,127],[119,139],[143,147],[159,154],[177,157],[197,161],[220,160],[244,165],[260,164]],
    [[108,182],[118,169],[133,160],[148,153],[157,151]],
    [[154,145],[159,159],[168,173],[184,185],[200,195],[212,212]],
    [[305,172],[321,173],[335,167],[347,164],[367,159]],
    [[340,166],[341,178],[348,192]],
    [[405,144],[423,141],[439,131],[452,127],[468,117],[481,113],[499,110],[517,102],[536,86]],
    [[460,122],[481,129],[495,136],[519,136]],
    [[410,236],[433,240],[449,246],[472,246],[495,249],[512,255],[528,266],[554,273]]
  ];
  let rng=random(413974);
  const rand=(a,b)=>Math.floor(rng()*(b-a+1))+a;
  const pick=arr=>arr[Math.floor(rng()*arr.length)];
  const move=(p,dx,dy)=>p.map(([x,y])=>[x+dx,y+dy]);
  function slag(){
    // Broken plates of cooling slag with isolated seams of exposed melt.
    const crust=['322a36','372c38','3d303b','41323b','49373e','4e3a40'];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const fold=Math.sin(x*.028+y*.044)+Math.cos(x*.011-y*.037)*.62+Math.sin(y*.115+x*.037)*.28;
      pixels[y*W+x]=color(crust[Math.max(0,Math.min(5,Math.round(2.45+fold*1.48)))]);
    }
    for(let i=0;i<215;i++){
      let x=rand(-40,W),y=rand(0,H);
      const drift=rng()<.5?-1:1, hot=i%7===0;
      for(let j=0,n=rand(2,6);j<n;j++){
        const dx=rand(5,23),dy=drift*rand(-2,6),a=x+dx,b=y+dy;
        line(x,y+1,a,b+1,hot?'774340':'4d3741');
        line(x,y,a,b,hot?pick(['a15a46','b16a4c','905144']):pick(['59414b','61434b','4e3944']));
        if(hot&&j%2===0)line(x+2,y,x+dx*.53,y+dy*.5,'d38a58');
        if(j===1)line(x,y,x+rand(7,14),y-drift*rand(2,6),hot?'855044':'543c46');
        x=a;y=b;
      }
    }
    for(let i=0;i<2050;i++)rect(rand(0,W-1),rand(0,H-1),rand(1,4),1,pick(['43323d','4c3741','553b44','3a2e39']));
    // Banked lava curls around a cooler raft at the two ends of the main fissure.
    for(const [cx,cy,k] of [[312,115,.75],[345,237,1.15],[222,263,.56],[422,112,.49]]){
      for(let i=0;i<5;i++){
        const r=(9+i*6)*k,start=-2.9+i*.6;
        for(let j=0;j<15;j++){
          const a=start+j*.27,b=a+.26;
          const pt=theta=>[cx+r*Math.cos(theta)+r*.28*Math.sin(theta),cy+r*.32*Math.sin(theta)];
          if(j===10||j%7===i)continue;
          line(...pt(a),...pt(b),pick(i<2?['b26d54','cf8d63','e6a775']:['71474b','895147','a45f4c']));
        }
      }
    }
  }
  function ashPlate(p,id){
    const tones=['736b78','7b727c','837980','8c8186','93888a','9b8f8e','a09693'];
    polygon(p,tones[3]);
    const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);
    const l=Math.max(0,Math.min(...xs)),r=Math.min(W-1,Math.max(...xs)),t=Math.max(0,Math.min(...ys)),b=Math.min(H-1,Math.max(...ys));
    for(let y=t;y<=b;y++)for(let x=l;x<=r;x++)if(surface[y*W+x]===id){
      const grain=Math.sin(x*.043-y*.074)*.57+Math.cos(x*.091+y*.086)*.28+Math.sin(x*.14-y*.031)*.16;
      pixels[y*W+x]=color(tones[Math.max(0,Math.min(6,Math.round(3+grain*3)))]);
    }
    clip=id;
    const area=(r-l)*(b-t);
    for(let i=0;i<area*.052;i++){
      const x=rand(l,r),y=rand(t,b);
      rect(x,y,rand(1,4),1,pick(['847a81','95878a','a89b93','817781','9e9291']));
      if(i%10===0){
        const w=rand(3,8);
        line(x-w,y+2,x,y,'7b737f');rect(x,y,w,1,'a99b94');
        if(i%30===0)line(x+1,y-1,x+w*.65,y-2,'c1ac96');
      }
    }
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length];
      line(a[0],a[1]-1,b[0],b[1]-1,b[0]<a[0]?'c0afa0':'a79b9a');
      if(i%2===0)line(a[0],a[1]-3,b[0],b[1]-3,'998b92');
    }
    clip=0;
  }
  function water(){
    const tones=['193b46','1b404a','1c424b','1d444e','1e464e','20494f','214a51'];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const v=(Math.sin(x*.012+y*.017)+Math.cos(y*.053-x*.007)*.65+Math.sin(x*.022+y*.034)*.35+2)/4;
      pixels[y*W+x]=color(tones[Math.max(0,Math.min(tones.length-1,Math.floor(v*tones.length)))]);
    }
    for(let i=0;i<3200;i++){
      const x=rand(0,W-1),y=rand(0,H-1),w=rand(1,7),col=pick(['214752','244b54','2a5058','2b5459','2d5659','173e49']);
      rect(x,y,w,1,col);
      if(i%9===0){rect(x+w+2,y-1,rand(2,5),1,col);rect(x+rand(-4,2),y+2,rand(1,4),1,'234c54');}
      if(i%14===0){rect(x,y,rand(1,3),1,'417073');rect(x+1,y-1,2,1,'315c61');}
    }
    for(let i=0;i<80;i++){
      const x=rand(-4,W+4),y=rand(1,H-1),a=rand(5,13);
      line(x-a,y,x-3,y+2,'315b62');rect(x-2,y+2,a+1,1,'315b62');line(x+a-1,y+2,x+a+4,y,'315b62');
      if(i%4===0)rect(x-2,y+2,4,1,'558084');
    }
  }
  function moonWater(){
    const tones=['17263e','192b47','1d314f','223752','243c59','29445f','2d4964'];
    const moonX=y=>302+Math.sin(y*.021)*16-y*.12;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const tide=Math.sin(x*.014+y*.042)*.78+Math.cos(y*.081-x*.011)*.48;
      const shimmer=Math.max(0,1-Math.abs(x-moonX(y))/62)*(1-y/H);
      pixels[y*W+x]=color(tones[Math.max(0,Math.min(6,Math.round(2.4+1.25*tide+2.1*shimmer)))]);
    }
    for(let i=0;i<2800;i++){
      const x=rand(0,W-1),y=rand(0,H-1);
      rect(x,y,rand(2,9),1,pick(['263f5f','2e4765','304c68','1d304b','223954','334d66']));
    }
    // Broken strokes, rather than a painted moon disc, place the moon in the water.
    for(let i=0;i<790;i++){
      const y=rand(-6,200), spread=5+y*.15+9*Math.abs(Math.sin(y*.052));
      const x=moonX(y)+(rng()+rng()+rng()-1.5)*spread;
      const w=rand(2,9),bright=y<76&&Math.abs(x-moonX(y))<9&&i%4===0;
      rect(x,y,w,1,bright?pick(['a3b8b3','ced2b7','90aab1']):pick(['395874','436682','52738b','647f95']));
    }
    for(let i=0;i<57;i++){
      const x=rand(2,W-4),y=rand(3,H-4),s=rand(3,8);
      line(x-s,y+1,x-2,y-1,'425f7b');rect(x-1,y-1,s,1,'425f7b');
      if(i%3===0)rect(x,y-2,3,1,'6a8090');
    }
  }
  function cliffDepth(x,y,id){
    const base=id===3?9:id<=4?15:id>=10?6:12;
    return Math.round(base+(Math.sin(x*.13+y*.082)+Math.cos(x*.063-y*.11))*base*.19);
  }
  function cliff(p,id){
    const ends=p.map(([x,y])=>[x-2,y+cliffDepth(x,y,id)]);
    for(let i=0;i<p.length;i++){
      const j=(i+1)%p.length,a=ends[i],b=ends[j];if(b[0]>a[0]+2)continue;
      const swell=rand(2,5);for(let k=0;k<swell;k++)line(a[0]-k*1.5,a[1]+k+2,b[0]+k,b[1]+k+2,pick(['315b62','325f63','2f585f','3b6669']));
      if(rng()<.55)line(a[0],a[1]+1,b[0],b[1]+1,'628986');
      if(rng()<.25)rect(a[0]+rand(-3,3),a[1]+rand(5,9),rand(2,7),1,'487478');
    }
    polygon(ends,'292e40');
    const faces=p.map((a,i)=>({a,b:p[(i+1)%p.length],c:ends[(i+1)%p.length],d:ends[i]})).sort((f,g)=>Math.max(f.a[1],f.b[1])-Math.max(g.a[1],g.b[1]));
    for(const {a,b,c,d} of faces){
      const dx=b[0]-a[0],dy=b[1]-a[1], bright=dy<0&&dx<=0;
      const col=bright?pick(['596071','626879','646b7a','6c7181','5d6876']):pick(['454d63','50566b','4c5368','565b71','434b61']);
      polygon([a,b,c,d],col);
      const mix=(p,q,t)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
      const seam=mix(b,c,.47), fold=mix(a,d,.73);
      polygon([mix(a,b,.48),b,seam,mix(d,c,.57),fold],bright?'555e70':'434b61');
      polygon([fold,mix(d,c,.55),seam,c,d],bright?'454f63':'394257');
      line(d[0],d[1],c[0],c[1],'313d51');
      if(dx<0||dy>0){
        if(rng()<.7){const k=mix(a,b,.22);line(k[0],k[1]+2,k[0]-1,k[1]+rand(3,8),bright?'78808c':'646b7f');}
        if(rng()<.5){const k=mix(a,d,.49), l=mix(b,c,.52);line(k[0],k[1],l[0],l[1],bright?'747988':'62697a');}
        if(rng()<.28){rect(d[0]+1,d[1]-2,rand(2,4),1,'68777e');}
      }
    }
  }
  function tuft(x,y,tone){
    line(x-2,y-1,x-1,y,tone);line(x,y,x,y-2,tone);line(x+1,y,x+2,y-1,tone);
  }
  function land(p,id){
    const cols=['697b65','718269','78886b','788b6e','81916f','849371','889673'];
    const base=id===3?'788872':'7f906e';polygon(p,base);
    const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);
    const x0=Math.max(0,Math.min(...xs)),x1=Math.min(W-1,Math.max(...xs)),y0=Math.max(0,Math.min(...ys)),y1=Math.min(H-1,Math.max(...ys));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(surface[y*W+x]!==id)continue;
      const n=Math.sin(x*.065+y*.055)*.55+Math.cos(y*.12-x*.041)*.41+Math.sin(x*.19+y*.056)*.2+Math.sin(x*.32-y*.24)*.08;
      pixels[y*W+x]=color(cols[Math.max(0,Math.min(6,Math.round(n*2.45+3)))]);
    }
    clip=id;
    const area=(x1-x0)*(y1-y0);
    for(let k=0;k<area*.19;k++){
      const x=rand(x0,x1),y=rand(y0,y1);if(surface[y*W+x]!==id)continue;
      if(k%8===0){tuft(x,y,pick(['647b66','64775f','728361','92a07a']));}
      else{rect(x,y,rand(1,3),1,pick(['74886a','7e8f6e','8b9974','82936f','718368','91a17a']));}
    }
    // Small stone shelves, exposed earth and pale meadows break the flat grass into connected patches.
    for(let k=0;k<area*.0028;k++){
      const x=rand(x0,x1), y=rand(y0,y1);if(surface[y*W+x]!==id)continue;
      const r=rand(3,9), tint=rng()<.35;
      polygon([[x-r,y],[x-3,y-2],[x+2,y-2],[x+r,y-1],[x+r+1,y],[x+3,y+2],[x-3,y+2]],tint?'8a917b':'84926d');
      if(tint){line(x-r+1,y,x-1,y-2,'9a9d85');rect(x+1,y,rand(2,4),1,'747e70');}
      else {for(let j=0;j<4;j++) rect(x+rand(-r,r),y+rand(-2,1),rand(1,3),1,'96a174');}
    }
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length],highlight=b[0]<a[0]?'9caa82':'92a183';
      if(rng()<.84)line(a[0],a[1]-1,b[0],b[1]-1,highlight);
      if(rng()<.48){line(a[0]+1,a[1]-2,b[0],b[1]-2,'8a9c78');}
      if(rng()<.52)line(a[0],a[1]+1,b[0],b[1]+1,'62775f');
    }clip=0;
  }
  function trail(points,id){
    clip=id;
    const C=['95957b','96967b','92937a','99977e','8f9276','899073','a3a087'];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for(let k=0;k<d;k++){
        const f=k/d,x=a[0]+(b[0]-a[0])*f,y=a[1]+(b[1]-a[1])*f;
        ellipse(x,y,rand(3,6),rand(2,3),pick(C.slice(0,5)));
        for(let j=0;j<5;j++){rect(x+rand(-6,6),y+rand(-4,4),rand(1,3),1,pick(C));}
      }
    }
    clip=0;
  }
  function rock(x,y,size,kind=0){
    const scale=size/12, px=(pts)=>pts.map(([dx,dy])=>[x+dx*scale,y+dy*scale]);
    ellipse(x+2*scale,y,size*.59,size*.2,'617761');
    const rocks=kind ? ['69757a','9b9c9c','8c9194','707d82','b0afa2'] : ['707879','a2a39c','909793','798585','b2b2a1'];
    polygon(px([[-7,-2],[-4,-7],[1,-9],[5,-8],[8,-4],[7,-1],[3,1],[-4,1]]),rocks[0]);
    polygon(px([[-7,-2],[-4,-7],[2,-8],[0,-4],[-4,-2]]),rocks[1]);
    polygon(px([[0,-4],[2,-8],[5,-7],[7,-4],[4,-2],[0,-1]]),rocks[2]);
    line(x-4*scale,y-7*scale,x+1*scale,y-8*scale,rocks[4]);
    if(size>13){line(x+1*scale,y-4*scale,x,y-2*scale,rocks[3]);line(x,y-2*scale,x-2*scale,y-1*scale,rocks[3]);}
  }
  function pine(x,y,h,variant){
    // Three staggered boughs, each with an irregular shaded side and stepped needles.
    const trees=[['26483e','335b48','426e50','54845d','71946a'],['2b4842','395c4e','487461','568773','75a08a'],['364d44','496653','587b5c','6b8e66','8ca77a']];
    const c=trees[variant%trees.length], s=h/30;
    const pt=(pts)=>pts.map(([dx,dy])=>[x+dx*s,y+dy*s]);
    ellipse(x+2*s,y+1,8*s,2.5*s,'5c725e');
    polygon(pt([[-2,0],[-2,-8],[1,-9],[2,-1],[4,0],[1,1]]),'4d514c');line(x-1*s,y-5*s,x-1*s,y-1,'978777');
    for(let i=0;i<3;i++){
      const Y=[-3,-10,-17][i],w=[9,7,4.8][i],rise=[17,16,13][i],skew=(variant%2?-.6:.5)-i*.2;
      const top=[skew,Y-rise],left=[-w,Y-2];
      const L=[[skew,Y-rise],[-w*.28,Y-rise*.61],[-w*.62,Y-rise*.47],[-w*.46,Y-rise*.44],[-w*.72,Y-rise*.25],[-w*.92,Y-rise*.18],[-w*.75,Y-rise*.2],left,[-w*.48,Y-2.8],[-w*.55,Y-.6],[-w*.2,Y-1.1],[0,Y+.8],[w*.31,Y-1],[w*.48,Y-.1],[w*.45,Y-2.5],[w*.82,Y-1.5],[w*.74,Y-3],[w,Y-2.9],[w*.53,Y-rise*.48],[w*.65,Y-rise*.43],[w*.27,Y-rise*.69]];
      polygon(pt(L),c[0]);
      polygon(pt([top,[-w*.31,Y-rise*.54],[-w*.52,Y-rise*.4],[-w*.43,Y-rise*.38],[-w*.77,Y-rise*.18],[-w*.55,Y-rise*.2],[-w*.77,Y-3],[-w*.38,Y-3.2],[-w*.2,Y-2.7],[w*.25,Y-3.8],[w*.52,Y-4.5],[w*.22,Y-rise*.45],[w*.35,Y-rise*.4],[w*.11,Y-rise*.67]]),c[1]);
      polygon(pt([top,[-w*.27,Y-rise*.56],[-w*.21,Y-rise*.52],[-w*.57,Y-rise*.28],[-w*.4,Y-rise*.3],[-w*.55,Y-4],[-w*.14,Y-5],[w*.09,Y-6],[w*.18,Y-7],[0,Y-7],[w*.12,Y-rise*.59]]),c[2]);
      const a=pt([[-w*.43,Y-rise*.35],[-w*.18,Y-rise*.56],[skew,Y-rise]]);line(...a[0],...a[1],c[3]);
      if(h>23) {const b=pt([[-w*.21,Y-rise*.64],[skew,Y-rise*.82]]);line(...b[0],...b[1],c[3]);}
      if(h>31) {const b=pt([[-w*.6,Y-4],[-w*.37,Y-5]]);line(...b[0],...b[1],c[4]);}
    }
  }
  function saltReeds(x,y,height,variant) {
    // Wind bends the copper reed plumes east; dark seedheads give each fan a readable silhouette.
    const scale=height/26;
    ellipse(x+2,y+1,9*scale,2*scale,'897957');
    const colors=[['67664c','a69151','d4b876','edcb87'],['656860','8e9678','b0ac86','d3c298'],['85674f','b18558','d49b67','e8b985']][variant];
    const point=(dx,dy)=>[x+dx*scale,y+dy*scale];
    for(const [foot,mid,top,rise] of [[-4,-7,-4,13],[-2,-4,-3,19],[0,1,6,25],[1,4,11,20],[2,6,14,14],[4,9,15,10]]){
      const a=point(foot,0),b=point(mid,-rise*.58),c=point(top,-rise);
      polygon([a,point(mid-1,-rise*.53),c,point(mid+1,-rise*.53),point(foot+1,0)],colors[0]);
      line(...a,...b,colors[1]);line(...b,...c,colors[1]);
      const tip=point(top+4,-rise-2);
      polygon([point(top-1,-rise+2),point(top,-rise-1),tip,point(top+3,-rise+1)],colors[2]);line(...c,...tip,colors[3]);
      if(rise>18)polygon([point(foot,-1),point(mid-4,-rise*.42),point(mid-4,-rise*.54),point(mid,-rise*.31)],colors[1]);
    }
  }
  function shrub(x,y,s){
    ellipse(x+1,y,s*1.35,s*.43,'65795c');
    for(let i=0;i<5;i++){const dx=rand(-s,s),dy=rand(-s/2,0),r=rand(2,Math.max(3,s*.68));ellipse(x+dx,y+dy-r*.3,r,r*.65,'566f53');ellipse(x+dx-1,y+dy-r*.55,r*.8,r*.5,pick(['7f925f','829563','758c62']));rect(x+dx-2,y+dy-r*.7,2,1,'a6ad77');}
  }
  function flowerPatch(x,y,n,kind){
    const c=kind?['c4af7b','d5c185','b0a36e']:['b093a4','c4acbc','a999aa'];
    for(let k=0;k<n;k++) {const xx=x+rand(-6,6),yy=y+rand(-3,3);rect(xx,yy,1,2,'63775e');rect(xx,yy-1,rand(1,2),1,pick(c));}
  }
  function waterfall(x,y,h){
    rect(x-2,y,7,1,'bbc5aa');rect(x-1,y+1,5,h,'547c80');
    for(let j=0;j<5;j++){const dx=rand(-1,3);rect(x+dx,y+rand(1,3),1,h-rand(3,7),pick(['82aa9f','719d97','9ab9a9']));}
    ellipse(x+2,y+h+1,5,1,'7c9e97');rect(x-7,y+h+3,7,1,'537f7e');rect(x+3,y+h+2,7,1,'688e87');
  }
  function footbridge({a,b,width}){
    const [ax,ay]=a.map(n=>n/2),[bx,by]=b.map(n=>n/2),dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy),ux=dx/d,uy=dy/d,nx=-uy,ny=ux,r=width*.25;
    const at=(t,v,h=0)=>[ax+ux*t+nx*v,ay+uy*t+ny*v+h];
    const beam=(from,to,side,thick,h,col)=>polygon([at(from,side,h),at(to,side,h),at(to,side,h+thick),at(from,side,h+thick)],col);
    polygon([at(0,-r,8),at(d,-r,8),at(d,r,8),at(0,r,8)],'193c45');
    for(let t=5;t<d;t+=19){for(const side of [-r+.6,r-1]){const [x,y]=at(t,side);rect(x-1,y+1,3,8,'3f4545');rect(x-1,y+2,1,7,'72685b');}}
    beam(-2,d+2,-r,3,0,'484843');beam(-2,d+2,r,3,0,'514d46');beam(-2,d+2,r,1,1,'7c6d5c');
    const count=Math.round(d/3.3);
    for(let i=0;i<count;i++){
      const left=i*d/count,right=(i+1)*d/count-.5,off=rand(-1,1)*.5;
      const corners=[at(left,-r+off),at(right,-r+off),at(right,r+off),at(left,r+off)];
      polygon(corners,pick(['998470','a18a72','8f7d69','a99176','998673']));
      line(...corners[0],...corners[3],'71675b');
      const q=at(left+.8,-r+off+1),qq=at(left+.8,r+off-1);line(...q,...qq,'b3a087');
      if(i%3===0){const q=at(right-.6,-r*.6),qq=at(right-.6,r*.1);line(...q,...qq,'827665');}
    }
    for(const side of [-r+.5,r-.5]){
      const spans=Math.max(2,Math.round(d/15));
      for(let j=0;j<spans;j++){
        const t1=1+j*(d-2)/spans,t2=1+(j+1)*(d-2)/spans;
        const h=side<0?-5:-4, start=at(t1,side,h),mid=at((t1+t2)/2,side,h+1.5),end=at(t2,side,h);
        line(...start,...mid,'4d514b');line(...mid,...end,'4d514b');line(start[0],start[1]-1,mid[0],mid[1]-1,'9f9478');line(mid[0],mid[1]-1,end[0],end[1]-1,'9f9478');
      }
      for(let j=0;j<=spans;j++){
        const [x,y]=at(1+j*(d-2)/spans,side);rect(x-1,y-7,3,9,'444945');rect(x-1,y-7,1,7,'998876');rect(x-1,y-7,3,1,'bdab90');rect(x-1,y-5,3,1,'807462');
      }
    }
  }
  function stoneCauseway({a,b,width}) {
    const [ax,ay]=a.map(v=>v/2),[bx,by]=b.map(v=>v/2),length=Math.hypot(bx-ax,by-ay);
    const ux=(bx-ax)/length,uy=(by-ay)/length,r=width/4;
    const p=(t,n,h=0)=>[ax+ux*t-uy*n,ay+uy*t+ux*n+h];
    const slab=(a,b,l,r,height,tint)=>polygon([p(a,l,height),p(b,l,height),p(b,r,height),p(a,r,height)],tint);
    slab(0,length,-r,r,7,'2c4053');
    const count=Math.ceil(length/6);
    for(let i=0;i<count;i++){
      const start=i*length/count,end=(i+1)*length/count;
      polygon([p(start,r),p(end,r),p(end,r,6),p(start,r,6)],i%2?'676475':'5c5a69');
      line(...p(start,r,5),...p(end,r,5),'444654');
      for(let j=0;j<3;j++){
        const l=-r+j*r*2/3,edge=l+r*2/3;
        slab(start,end,l,edge,0,pick(['b1a58e','a99b86','aa9f8f','b7ac98','a99d8a']));
        line(...p(start,l),...p(start,edge),'686675');
        line(...p(start+.8,l),...p(start+.8,edge-1),'c8baa3');
        line(...p(start,edge),...p(end,edge),'918778');
      }
      if(!(i%3)){
        const n=r-1,mid=(start+end)/2;
        for(const s of [-n,n]){
          const [x,y]=p(mid,s);rect(x-2,y+1,5,3,'605560');rect(x-2,y-3,5,5,'8a786d');rect(x-3,y-4,7,2,'c7aa87');rect(x-2,y-4,3,1,'e2c598');
        }
      }
    }
    for(const side of [-r,r])line(...p(0,side),...p(length,side),'bcab92');
  }
  function drownedGate() {
    // A broken tidewheel sits in the flooded channel between the two usable crossings.
    const cx=318,cy=158,rx=15,ry=13;
    const rim=(angle,r=1)=>[cx+Math.cos(angle)*rx*r,cy+Math.sin(angle)*ry*r];
    for(let step=0;step<14;step++){
      const a=step*Math.PI/7,b=(step+1)*Math.PI/7;
      if(step===3||step===4||step===12)continue;
      polygon([rim(a,1),rim(b,1),rim(b,.79),rim(a,.79)],step>6?'8b7c74':'666773');
      line(...rim(a,.98),...rim(b,.98),step>6?'b2987c':'7c7a7d');
      if(step%2===0)line(cx,cy,...rim(a,.83),'897e78');
    }
    for(const [x,y,h] of [[302,164,15],[335,161,10]]){
      polygon([[x-4,y],[x-2,y-h],[x+1,y-h-1],[x+4,y-h+2],[x+4,y+1]],'565a68');
      polygon([[x-4,y],[x-2,y-h],[x+1,y-h-1],[x,y]],'8e8581');rect(x-4,y,9,1,'6a8593');
    }
    rect(cx-3,cy-2,7,5,'565b68');rect(cx-2,cy-2,4,2,'b29b85');
    for(let j=0;j<11;j++)rect(cx+rand(-24,22),cy+rand(7,12),rand(3,9),1,pick(['425e73','517488','6a8995']));
  }
  function basaltColumn(x,y,r,h){
    const top=y-h;
    ellipse(x+2,y+1,r+2,Math.max(1,r*.45),'6a606b');
    polygon([[x-r,top],[x-1,top+2],[x-1,y+2],[x-r,y]],'5d5767');
    polygon([[x-1,top+2],[x+r,top],[x+r-1,y],[x-1,y+2]],'494653');
    polygon([[x-r,top],[x-r+2,top-2],[x+2,top-3],[x+r,top-1],[x+r,top],[x,top+2]],'8c8390');
    line(x-r+1,top,x-1,top+1,'aba0a1');line(x-1,top+2,x-1,y,'766d7a');
    if(h>11){rect(x-r+1,top+4,1,h-7,'736979');rect(x+1,y-3,2,1,'5a505e');}
  }
  function castRoad(bridge){
    stoneCauseway(bridge);
    // The kiln roads carry two dark inlaid rails across large, staggered ash-brick courses.
    const [[ax,ay],[bx,by]]=[bridge.a,bridge.b].map(([x,y])=>[x/2,y/2]);
    const n=Math.hypot(bx-ax,by-ay),dx=(bx-ax)/n,dy=(by-ay)/n;
    const at=(t,s)=>[ax+t*dx-s*dy,ay+t*dy+s*dx];
    const edge=bridge.width/4;
    for(let k=0;k<4;k++){
      const top=-edge+2+k*(edge-2)/2,bot=top+(edge-2)/2;
      for(let t=k%2?-5:0;t<n;t+=11){
        const a=Math.max(0,t),b=Math.min(n,t+11);
        polygon([at(a,top),at(b,top),at(b,bot),at(a,bot)],pick(['a49792','afa198','aca09a','b3a597']));
        line(...at(a,top),...at(b,top),'8f8182');line(...at(a,top),...at(a,bot),'8a7c7e');
        line(...at(a+1,top+1),...at(Math.min(b,a+6),top+1),'c2b0a1');
      }
    }
    for(const s of [-edge+5,edge-5]){
      line(...at(0,s),...at(n,s),'75656a');line(...at(0,s+1),...at(n,s+1),'d0ac89');
      for(let t=5;t<n;t+=11){const [x,y]=at(t,s);rect(x,y,2,1,'5d515c');}
    }
  }
  function crater(cx,cy){
    const rim=[[0,-10],[10,-9],[17,-5],[21,0],[16,5],[8,7],[-3,8],[-13,5],[-20,1],[-16,-5],[-9,-8]];
    const ring=(sx,sy,dx=0,dy=0)=>rim.map(([x,y])=>[cx+dx+x*sx,cy+dy+y*sy]);
    polygon(ring(1.55,1.8,0,3),'6e626e');
    polygon(ring(1.36,1.3,0,0),'95818a');
    polygon(ring(1.14,1.05,0,-1),'b29b8d');
    polygon(ring(.99,.93,0,-1),'65515d');
    polygon(ring(.83,.70,0,1),'b26f55');
    polygon(ring(.71,.45,0,2),'d3986b');
    polygon(ring(.54,.31,-1,2),'855658');
    line(cx-9,cy+3,cx+6,cy+5,'f0bf7e');rect(cx+2,cy,5,1,'d9a270');
    for(const [x,y] of [[-10,2],[6,-3],[11,-1]])rect(cx+x,cy+y,3,1,'e0ab77');
  }
  function kilnDetails(){
    const groups=[[36,131],[67,92],[115,72],[171,62],[186,82],[51,224],[103,256],[156,249],[204,221],
      [437,221],[481,248],[546,253],[601,219],[612,163],[592,100],[551,73],[484,68],[453,89],
      [281,194],[357,196],[299,153],[344,150],[273,83],[362,82],
      [65,17],[110,6],[558,9],[621,27],[24,295],[291,292],[340,279],[378,301],[619,301]];
    const columns=[];
    for(const [cx,cy] of groups){
      for(let i=0,n=rand(4,8);i<n;i++){
        const x=cx+rand(-7,7),y=cy+rand(-4,4);
        if(x<1||x>=W||y<1||y>=H||!surface[y*W+x])continue;
        columns.push([x,y,rand(2,4),rand(4,15)]);
      }
    }
    crater(321,286);
    columns.sort((a,b)=>a[1]-b[1]);
    for(const args of columns)basaltColumn(...args);
    // The broken circular casting bed matches the working bell above it.
    const cx=320,cy=175;
    for(let j=0;j<32;j++){
      if(j===3||j===12||j===23)continue;
      const a=j*Math.PI/16,b=a+Math.PI/20;
      const rim=(n,r)=>[cx+Math.cos(n)*r,cy+Math.sin(n)*r*.70];
      polygon([rim(a,23),rim(b,23),rim(b,20),rim(a,20)],j%3?'a29089':'aa998f');
      line(...rim(a,23),...rim(b,23),'756a75');
    }
  }
  function quayLamp(x,y,h=12){
    // Crooked bamboo hook with an amber paper globe, dark ribs and a tassel.
    ellipse(x+2,y+1,4,1,'586860');
    line(x,y,x,y-h,'4b514d');line(x+1,y-1,x+1,y-h,'a89872');
    line(x,y-h,x+5,y-h-2,'56554e');line(x+1,y-h-1,x+5,y-h-3,'c3ae7d');
    rect(x+5,y-h-2,1,3,'665756');
    polygon([[x+3,y-h+1],[x+7,y-h+1],[x+8,y-h+3],[x+7,y-h+7],[x+4,y-h+8],[x+2,y-h+5]],'806048');
    rect(x+3,y-h+2,4,4,'f1ae64');rect(x+4,y-h+2,2,4,'ffe1a0');
    rect(x+3,y-h,4,1,'645447');rect(x+4,y-h+6,3,1,'aa744d');rect(x+5,y-h+8,1,2,'c58657');
  }
  function rushBed(x,y,n){
    for(let i=0;i<n;i++){
      const bx=x+rand(-9,9),by=y+rand(-4,4),h=rand(4,11),s=rand(-3,3);
      ellipse(bx,by,2,1,'5d736d');
      line(bx,by,bx+s,by-h,pick(['566b65','627765','8a9471']));
      line(bx,by-2,bx-3,by-5,'94a180');
      if(i%3===0)rect(bx+s,by-h-2,1,3,pick(['d1b17c','bda27a']));
    }
  }
  function dryingNet(x,y){
    // A shore rack: the net sags between two forked posts just above the ground.
    for(const [dx,dy] of [[-8,2],[8,-2]]){
      rect(x+dx,y+dy-10,2,12,'4e5a56');
      line(x+dx+1,y+dy-6,x+dx+3,y+dy-10,'7c806c');
      rect(x+dx,y+dy-10,2,1,'c0b493');
    }
    const cords=[[-7,-7],[-4,-6],[-1,-5],[2,-6],[5,-8],[7,-10]];
    for(let i=0;i<cords.length-1;i++){
      const [ax,ay]=cords[i],[bx,by]=cords[i+1];
      line(x+ax,y+ay,x+bx,y+by,'b5ad87');
      line(x+ax,y+ay+1,x+bx,y+by+6,'677d76');
      line(x+bx,y+by+1,x+ax,y+ay+6,'8a9783');
    }
  }
  function ferryLanding(){
    // The picking point is on the bank. Only the short mooring apron projects over it.
    const x=348,y=278;
    polygon([[x-9,y-4],[x+8,y-5],[x+14,y+9],[x-3,y+11]],'3e4a50');
    for(let j=0;j<7;j++){
      const dx=j*.78,dy=j*1.8;
      line(x-9+dx,y-4+dy,x+8+dx,y-5+dy,j%2?'a08970':'b49b7b');
      line(x-9+dx,y-3+dy,x+8+dx,y-4+dy,'7b7061');
    }
    for(const [px,py] of [[x-8,y-3],[x+8,y-4],[x-3,y+9],[x+13,y+7]]){
      rect(px-1,py-2,2,5,'554f49');rect(px-1,py-3,3,2,'c0a781');
    }
    quayLamp(x-8,y,13);
    // Weathered roof and hanging net at the side of the receiving wharf.
    const nx=x+18,ny=y-9;
    rect(nx-6,ny-5,2,8,'605e55');rect(nx+5,ny-6,2,8,'665d50');
    polygon([[nx-9,ny-6],[nx-5,ny-13],[nx+4,ny-15],[nx+9,ny-10],[nx+8,ny-6],[nx-2,ny-3]],'4e6869');
    line(nx-8,ny-7,nx-3,ny-12,'afad8c');line(nx-3,ny-12,nx+4,ny-14,'a4b7a4');
    for(let i=0;i<4;i++)line(nx-5+i*2,ny-2,nx-2+i*2,ny+1,'8f907d');
  }
  function lanternDetails(){
    for(const [x,y,n] of [[33,204,21],[62,145,20],[102,110,15],[158,125,18],[181,141,14],
      [46,244,24],[84,263,14],[133,263,22],[188,248,16],[250,259,12],[284,161,10],[343,108,15],
      [426,110,14],[465,72,14],[547,53,23],[590,71,20],[605,109,18],[574,166,24],[522,201,22],
      [452,184,18],[298,266,12],[325,229,14],[385,233,11]]) {
      if(surface[y*W+x])rushBed(x,y,n);
    }
    for(const [x,y] of [[199,173],[279,143],[353,129],[427,102],[211,238],[289,258],[381,249],[455,218]]){
      quayLamp(x,y);
    }
    for(const [x,y] of [[61,240],[93,248],[562,164],[580,158],[298,274]])dryingNet(x,y);
    for(const {a,b,width} of bridges){
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const px=Math.round((a[0]+b[0])/4-dy/length*width/4);
      const py=Math.round((a[1]+b[1])/4+dx/length*width/4);
      quayLamp(px,py,14);
      // Reflections begin below the deck; keep the light off any walkable shore.
      for(let i=0;i<12;i++){
        const x=px+5+rand(-2,2),y=py+6+i;
        if(!ground(x*2,y*2))rect(x-i%2,y,rand(2,5),1,pick(['846f64','68616a','a18469','5e616c']));
      }
    }
    for(const [x,y] of [[181,218],[486,151],[327,164]]){
      rect(x-4,y-2,8,3,'62635c');
      polygon([[x-5,y-2],[x-3,y-8],[x,y-10],[x+3,y-7],[x+4,y-2]],'8b9b91');
      line(x-4,y-3,x-2,y-7,'bbc6b2');rect(x-1,y-6,2,3,'697a76');
    }
    ferryLanding();
  }
  const woods=delta ? [
    [45,126,15,10,11,23],[90,86,16,13,12,26],[151,71,15,10,15,30],[200,91,12,10,10,24],
    [48,193,20,12,12,24],[76,231,15,12,11,28],[159,245,16,11,10,24],[204,221,8,5,10,23],
    [435,103,12,9,11,23],[480,82,17,13,12,26],[559,93,17,12,10,25],[606,155,13,8,11,28],
    [596,214,17,11,12,30],[546,237,13,9,10,23],[455,227,12,7,11,20],
    [284,73,8,5,8,15],[351,67,8,6,9,14],[286,235,9,6,9,21],[345,239,10,7,9,21],
    [19,30,16,12,12,27],[268,14,22,19,12,28],[620,24,17,14,13,27],[30,299,18,15,11,29],
    [221,317,14,8,14,26],[410,317,20,12,11,25],[629,312,12,8,12,26]
  ] : [
    // x, y, grove radius, number of spruces, shortest and tallest tree (pixel coordinates)
    [85,91,16,9,16,32],[131,71,12,7,16,31],[182,78,13,6,15,28],
    [234,109,11,4,15,29],[62,180,10,7,16,31],[83,224,12,7,15,31],[150,241,10,5,16,30],
    [409,90,11,5,16,30],[464,61,13,6,17,32],[514,51,11,6,15,32],
    [576,88,14,7,16,32],[577,145,12,7,16,30],[535,168,10,4,14,25],
    [329,155,7,3,12,20],[356,183,5,2,10,15],
    [429,283,28,20,15,35],[476,301,22,14,15,35],[564,246,22,13,16,35],[614,244,26,18,16,37],[559,310,24,19,16,38],
    [22,23,27,20,18,40],[74,7,25,17,14,32],[16,284,20,16,15,33],[57,306,15,10,17,30],
    [642,22,16,8,15,33],[305,4,22,10,15,25],[323,304,14,11,14,29],[303,46,6,3,12,17]
  ];
  const protectedPlaces=delta ? [
    [140,163,40],[91,195,30],[165,205,26],[80,143,20],[193,173,20],[500,163,40],[549,195,30],
    [475,205,26],[560,143,20],[447,173,20],[320,84,32],[299,59,16],[342,59,16],
    [227,110,15],[406,112,15],[232,205,15],[410,203,15]
  ] : [[155,140,43],[110,177,29],[207,168,29],[480,106,42],[522,132,31],[80,121,21],[212,212,20],[538,85,16],[432,150,16],[500,250,18]];
  function clearForGrove(x,y){return protectedPlaces.every(([a,b,r])=>((x-a)/r)**2+((y-b)/(r*.7))**2>1);}
  function decorations(){
    const items=[];
    for(const [cx,cy,r,n,lo,hi] of woods){
      const already=[];
      for(let i=0,attempt=0;i<n&&attempt<n*14;attempt++){
        const x=Math.round(cx+(rng()+rng()-1)*r),y=Math.round(cy+(rng()+rng()-1)*r*.65);
        if(x<0||y<0||x>=W||y>=H||!surface[y*W+x]||!clearForGrove(x,y)||already.some(([a,b])=>(a-x)**2+(b-y)**2<15))continue;
        const height=rand(lo,hi),v=rand(0,6)%3;items.push({y,paint:()=>delta?saltReeds(x,y,height,v):pine(x,y,height,v)});already.push([x,y]);i++;
      }
    }
    const rubble=delta ? [[51,120,4],[114,79,5],[192,104,3],[208,152,4],[53,207,6],[113,235,5],[183,228,4],
      [438,115,4],[497,78,6],[570,111,3],[583,187,6],[551,231,4],[478,240,4],[315,105,3],[301,206,3],[359,229,4],
      [23,32,3],[277,19,5],[626,32,5],[40,305,6],[231,318,2],[405,316,3],[629,307,5]] : [[57,136,5],[102,79,5],[184,97,4],[248,144,3],[229,201,3],[105,237,6],[185,225,3],[52,198,4],
      [423,80,4],[451,162,4],[500,169,5],[567,122,5],[558,70,3],[343,153,2],[323,182,3],[448,235,5],[539,232,6],[587,285,9],[465,267,5],[522,300,7],
      [48,19,4],[23,272,4],[294,302,4],[305,44,3],[44,77,1],[187,291,2],[563,201,2]];
    for(const [cx,cy,n] of rubble){
      for(let i=0;i<n;i++){const x=cx+rand(-7,7),y=cy+rand(-4,4),s=i===0?rand(8,15):rand(3,8);if(surface[y*W+x]&&clearForGrove(x,y))items.push({y,paint:()=>rock(x,y,s,i%2)});}
    }
    for(let i=0;i<520;i++){
      const x=rand(0,W-1),y=rand(0,H-1),id=surface[y*W+x];if(!id||!clearForGrove(x,y))continue;
      if(i%7===0){const s=rand(2,4);items.push({y,paint:()=>shrub(x,y,s)});}
      else if(i%3===0){const n=rand(3,9),k=i%2;items.push({y,paint:()=>{clip=id;flowerPatch(x,y,n,k);clip=0;}});}
      else {const n=rand(4,11);items.push({y,paint:()=>{clip=id;for(let j=0;j<n;j++)tuft(x+rand(-5,5),y+rand(-3,3),pick(['728062','84916b','98a57b']));clip=0;}});}
    }
    items.sort((a,b)=>a.y-b.y);for(const it of items)it.paint();
  }
  let scene,mini;
  function render(){
    rng=random(lantern ? 415206 : kiln ? 65128 : delta ? 980413 : 413974);
    if(lantern)moonWater();else if(kiln)slag();else water();
    // Islands farther north paint first, with the nearer shore eclipsing any projected rock face.
    const order=lantern ? [1,2,0,3] : kiln ? [4,5,3,1,0,2,6,7,8] : delta ? [4,5,6,2,1,0,3,7,8,9,10] : [4,7,6,9,10,1,0,2,11,12,3,5,8];
    for(const i of order){cliff(shapes[i],i+1);if(kiln)ashPlate(shapes[i],i+1);else land(shapes[i],i+1);}
    const pathIslands=lantern||kiln ? [1,1,2,2,3,4] : delta ? [1,1,1,2,2,2,3,4] : [1,1,1,3,3,2,2,4];
    paths.forEach((path,i)=>trail(path,pathIslands[i]));
    if(delta){waterfall(324,112,9);waterfall(500,265,14);waterfall(173,263,14);}
    else if(!kiln&&!lantern){waterfall(170,256,14);waterfall(546,185,12);waterfall(95,22,9);}
    if(delta)drownedGate();
    bridges.forEach((bridge,i)=>{if(kiln&&i<2)castRoad(bridge);else if((delta&&i>=2)||(lantern&&i<2))stoneCauseway(bridge);else footbridge(bridge);});
    if(lantern)lanternDetails();else if(kiln)kilnDetails();else decorations();
    scene=document.createElement('canvas');scene.width=W;scene.height=H;
    const ctx=scene.getContext('2d'),img=ctx.createImageData(W,H);new Uint32Array(img.data.buffer).set(pixels);ctx.putImageData(img,0,0);
  }
  function draw(ctx){if(!scene)render();ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(scene,0,0,W*2,H*2);ctx.restore();}
  // Salt-dark stone, oxidized bronze ribs, and a split cradle for the suspended prism.
  const cradleRows=[
    '      SS             SS',
    '     SABS           SmBS',
    '     SAGB           SgBS',
    '     SAbS           SgbS',
    '    SABbS           SgbbS',
    '    SAmbSS         SSgmbS',
    '    SAmbgBS       SBgbmbS',
    '     SAmbGBS     SBGbmbS',
    '      SAbgGSSSSSSSGBbmS',
    '       SmBBGAAAAAGBbmS',
    '       SSmmGgggggGmSS',
    '      SAAAGBBBBBBBGbbS',
    '     SALAAAGGgggGGBmbbS',
    '   SSSALAAAABBBBmbmmbbSSS',
    '  SALALmmAAmmmGmbmbbbbbbbS',
    ' SALAAmmmLmmGgBGgBBmbbbbbSS',
    ' SmLmmmmmmmBGGGGGBbmbbbbbbS',
    '  SmAAAAmmmmBgggBmmmbbbbbS',
    '    SmmmLAAmmBBBmbmbbbbSS',
    '      SmmmLAmmmbmbbbbSS',
    '        SSmAAmmmmbbSS',
    '           SSmmmSS'
  ];
  const prismRows=[
    '    S',
    '   SLt',
    '   SLtS',
    '  SLwtt',
    ' SLwwtss',
    ' SLwttssS',
    '  Swttss',
    '   SttsS',
    '    StS',
    '     S'
  ];
  const stoneColors={S:'#36434a',b:'#506065',m:'#6d7c76',A:'#97a492',L:'#c6c5a4',B:'#726d62',G:'#d7be81',g:'#a58f69'};
  const spriteCache=new Map();
  function beaconSprite(key,rows,colors){
    if(spriteCache.has(key))return spriteCache.get(key);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(...rows.map(row=>row.length));canvas.height=rows.length;
    const ctx=canvas.getContext('2d');
    rows.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(colors[row[x]]){
      ctx.fillStyle=colors[row[x]];ctx.fillRect(x,y,1,1);
    }});
    spriteCache.set(key,canvas);
    return canvas;
  }
  const bellFrame=[
    '    EEEEEEEEEEEEEEEEEEEEee',
    '   EhhhhtthttttthhttthttEe',
    '   ELLllggggggggggggggggDe',
    '    DllD      GG      LdD',
    '    EllD      gg      LdD',
    '    EltD              LtD',
    '    EltD              LtD',
    '    EllD              LdD',
    '    DllD              LtD',
    '    EllD              LtD',
    '    EllD              LdD',
    '    EltD              LdD',
    '    EllD              LdD',
    '    DllD              LtD',
    '    EltD              LdD',
    '    EllD              LdD',
    '   EEllDD            ELdDE',
    '   ELttDD            ELtdD',
    '  ELLllDDD          ELLtdDD',
    '  EhhhtDDD          EhhttDD',
    ' EELttDDDD         eELttDDDe',
    'eEDDDDDDDDe       eEDDDDDDDe'
  ];
  const bellBowl=[
    '     gg',
    '    GhgG',
    '    gLlD',
    '   GccccD',
    '  GLLllttD',
    '  GLlHlltD',
    '  LllHHttD',
    '  LLllHttD',
    '  LllllttD',
    ' LLltlltttD',
    ' LllltltttD',
    'LLcccccccctD',
    'LHHhhltttttD',
    'DggggggggggD',
    '     Lg',
    '     gD'
  ];
  const frameInk={E:'#49404a',D:'#4e4856',e:'#5c535b',t:'#8b7d83',l:'#95888d',L:'#b3a299',h:'#c9af92',G:'#ad825c',g:'#73575b'};
  function drawBell(ctx,time,glow,active,ringAge){
    const frame=beaconSprite('bell frame',bellFrame,frameInk);
    ctx.drawImage(frame,-28,-45,frame.width*2,frame.height*2);
    const bowl=beaconSprite('bell '+glow,bellBowl,{g:'#6e5450',G:'#aa7d56',h:'#edd09a',l:'#bc915e',L:'#d4aa72',t:'#9e785b',D:'#5c4c50',c:glow,H:'#ead49f'});
    const ringing=ringAge>=0&&ringAge<1.35;
    const swing=ringing ? 2.5*Math.sin(ringAge*15)*Math.pow(1-ringAge/1.35,1.5) : active ? Math.sin(time*5.4) : 0;
    // Each band shifts by an integer pixel, preserving the silhouette while the bell swings.
    for(let y=0;y<bowl.height;y++){
      const dx=Math.round(swing*(y/bowl.height)*3)*2;
      ctx.drawImage(bowl,0,y,bowl.width,1,-12+dx,-38+y*2,bowl.width*2,2);
    }
  }
  const ferryLampRows=[
    '         pp       ',
    '       pphh       ',
    '      phk         ',
    '     phk          ',
    '     phk    pp    ',
    '     phk   phk    ',
    '      phppphk     ',
    '       phhhk      ',
    '        ktk       ',
    '       ktttk      ',
    '       ktltk      ',
    '       klllk      ',
    '        ktk       ',
    '        ksk       ',
    '       pkshp      ',
    '     pppskshpp    ',
    '    pshhssskskp   ',
    '   pkssssskskkkp  ',
    '    kkkkkkkkkkk   '
  ];
  function drawBeacon(ctx,time=0,ownerTone=null,progress=0,contested=false,ringAge=-1){
    const glow=contested && Math.floor(time*2.4)%2 ? '#f3a37b' : ownerTone || '#b7e1d0';
    const step=Math.round(Math.max(0,Math.min(1,progress))*32),twoPi=2*Math.PI;
    ctx.save();ctx.translate(beacon.x,beacon.y);ctx.imageSmoothingEnabled=false;
    // Small survey marks leave units and ground details legible inside the actual capture radius.
    for(let i=0;i<32;i++){
      const angle=twoPi*i/32-Math.PI/2;
      const x=Math.round(Math.cos(angle)*beacon.radius),y=Math.round(Math.sin(angle)*beacon.radius);
      const cardinal=i%8===0,active=i<step;
      const bright=active || cardinal || (ownerTone && i===Math.floor(time*2)%32);
      ctx.globalAlpha=bright ? .72 : .36;
      ctx.fillStyle='#354650';ctx.fillRect(x-2,y,cardinal?6:4,cardinal?4:2);
      ctx.fillStyle=bright?glow:'#d1d5b4';ctx.fillRect(x-2,y-1,cardinal?5:3,cardinal?3:2);
      if(cardinal){ctx.fillRect(x,y-3,1,2);}
    }
    ctx.globalAlpha=.29;ctx.fillStyle='#2a3e3c';
    ctx.beginPath();ctx.ellipse(4,2,28,8,0,0,twoPi);ctx.fill();
    ctx.globalAlpha=1;
    if(lantern){
      const ferryLamp=beaconSprite('ferry '+glow,ferryLampRows,{p:'#55696d',h:'#e2c183',k:'#384951',t:glow,l:'#ffedb8',s:'#8e8c76'});
      ctx.drawImage(ferryLamp,-ferryLamp.width,-33,ferryLamp.width*2,ferryLamp.height*2);
      const phase=(time*.8)%1;
      ctx.globalAlpha=.7*(1-phase);ctx.fillStyle=glow;
      ctx.fillRect(6+Math.round(phase*3),-12-Math.round(phase*18),2,2);
      ctx.restore();return;
    }
    if(kiln){
      drawBell(ctx,time,glow,contested||progress>0,ringAge);
      ctx.restore();return;
    }
    const cradle=beaconSprite('stone',cradleRows,stoneColors);
    ctx.drawImage(cradle,-Math.floor(cradle.width/2)*2,7-cradle.height*2,cradle.width*2,cradle.height*2);
    const lift=Math.round(Math.sin(time*2)*1.4);
    const prism=beaconSprite(glow,prismRows,{S:'#3d535c',L:'#eef1c8',w:'#d6f3d9',t:glow,s:'#649595'});
    ctx.drawImage(prism,-10,-46+lift,prism.width*2,prism.height*2);
    const glint=(time*.65)%1;
    if(glint<.34){
      const y=-44+lift-Math.floor(glint*12);
      ctx.globalAlpha=Math.sin(glint/.34*Math.PI);ctx.fillStyle='#fff6d8';
      ctx.fillRect(5,y,6,2);ctx.fillRect(7,y-2,2,6);
    }
    ctx.restore();
  }
  function drawMap(ctx,w,h){
    if(!mini){mini=document.createElement('canvas');mini.width=W;mini.height=H;const c=mini.getContext('2d');c.fillStyle=lantern?'#1c304e':kiln?'#392d39':delta?'#22364b':'#162d34';c.fillRect(0,0,W,H);
      for(let i=0;i<shapes.length;i++){const p=shapes[i];c.beginPath();p.forEach(([x,y],j)=>j?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=lantern?'#6b877b':kiln?(i<4?'#8b7c84':'#6a5d68'):delta?(i<4?'#887950':'#6f644d'):(i<4?'#536c5b':'#425b50');c.fill();c.strokeStyle=lantern?'#97aa9c':kiln?'#b5a090':delta?'#ae9771':'#738470';c.lineWidth=2;c.stroke();}
      for(const {a,b,width} of bridges){c.beginPath();c.moveTo(a[0]/2,a[1]/2);c.lineTo(b[0]/2,b[1]/2);c.lineWidth=(kiln||lantern)?width/3:6;c.strokeStyle=lantern?'#e7c697':kiln?'#b59c86':'#8b8170';c.stroke();}
    }
    ctx.drawImage(mini,0,0,w,h);
  }
  return {id:mapId,layout:lantern ? lanternLayout : kiln ? kilnLayout : delta ? deltaLayout : shoalsLayout,draw,ground,islands,bridges,drawMap,beacon,drawBeacon};
  }
  function get(id) {
    const key = Object.hasOwn(maps,id) ? id : 'shoals';
    if (!instances.has(key)) instances.set(key,createTerrain(key));
    return instances.get(key);
  }
  let current = get('shoals');
  const terrain = {maps,get,setMap(id){current=get(id);return current;},get mapId(){return current.id;}};
  for(const key of ['layout','draw','ground','islands','bridges','drawMap','beacon','drawBeacon']){
    Object.defineProperty(terrain,key,{get:()=>current[key]});
  }
  window.Terrain = terrain;
})();
