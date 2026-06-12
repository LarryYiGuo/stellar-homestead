/* ============================================================
   渲染层 — Three.js
   双场景:银河系总图(galaxy) / 星系视图(system)
   ============================================================ */

let renderer, camera, raycaster, clock;
let scene = null;                 // 当前活动场景
let galaxyScene = null, systemScene = null;
let mode = 'galaxy';              // 'galaxy' | 'system'
let curSysId = 'kenxi';

const planetObjs = [];            // 当前星系 {data, mesh, pivot?, mat, trailMat?, angle0, isMoon?}
const moonsList = [];
const ringMats = [];
let sunMat = null;

const sysNodes = [];              // 银河节点 {sys, mesh, glow, here}
let galaxyGroup = null;
let routeLine = null, trainMarker = null;
let galaxySel = null;             // 银河视图中选中的星系

const TYPE_MAP = { rocky:0, terra:1, gas:2, venus:3, ice:4 };

function makeGlowTexture(inner, outer){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128,128,0,128,128,128);
  grad.addColorStop(0, inner); grad.addColorStop(0.25, inner);
  grad.addColorStop(0.55, outer); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(c);
}

function addStarfield(sc){
  const starGeo = new THREE.BufferGeometry();
  const N = 3500, pos = new Float32Array(N*3), col = new Float32Array(N*3);
  for (let i=0;i<N;i++){
    const u = Math.random()*2-1, ph = Math.random()*Math.PI*2, s = Math.sqrt(1-u*u);
    const R = 900 + Math.random()*800;
    pos.set([s*Math.cos(ph)*R, u*R, s*Math.sin(ph)*R], i*3);
    const t = Math.random();
    const c = t<0.7 ? [1,1,1] : t<0.85 ? [0.7,0.8,1] : [1,0.85,0.7];
    const b = 0.4 + Math.random()*0.6;
    col.set([c[0]*b, c[1]*b, c[2]*b], i*3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col,3));
  sc.add(new THREE.Points(starGeo, new THREE.PointsMaterial({size:1.6, vertexColors:true, sizeAttenuation:false, transparent:true, opacity:0.9})));
}

function disposeScene(sc){
  if (!sc) return;
  sc.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms){ if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
}

function initRenderer(){
  camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 4000);
  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('canvas-wrap').appendChild(renderer.domElement);
  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();
}

/* ============================================================
   银河系总图
   ============================================================ */
function buildGalaxyScene(){
  galaxyScene = new THREE.Scene();
  addStarfield(galaxyScene);

  galaxyGroup = new THREE.Group();
  galaxyScene.add(galaxyGroup);

  // 旋臂点云(2 条对数螺旋臂 + 核球)
  const N = 9000;
  const pos = new Float32Array(N*3), col = new Float32Array(N*3);
  for (let i=0;i<N;i++){
    let x, y, z, r;
    if (i < N*0.18){                       // 核球
      r = Math.pow(Math.random(), 2) * 7;
      const u = Math.random()*2-1, ph = Math.random()*Math.PI*2, s = Math.sqrt(1-u*u);
      x = s*Math.cos(ph)*r; z = s*Math.sin(ph)*r; y = u*r*0.55;
    } else {                                // 旋臂
      r = 4 + Math.pow(Math.random(), 0.72) * 58;
      const arm = (i % 2) * Math.PI;
      const ang = r*0.26 + arm + (Math.random()-0.5)*(0.5 + 7/r);
      x = Math.cos(ang)*r; z = Math.sin(ang)*r;
      y = (Math.random()-0.5) * 1.8 * Math.max(0.22, 1 - r/64);
    }
    pos.set([x, y, z], i*3);
    const t = Math.min(1, r/56);
    const warm = [1.0, 0.85, 0.62], cool = [0.55, 0.68, 1.0];
    const b = 0.25 + Math.random()*0.75;
    col.set([ (warm[0]*(1-t)+cool[0]*t)*b, (warm[1]*(1-t)+cool[1]*t)*b, (warm[2]*(1-t)+cool[2]*t)*b ], i*3);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  gg.setAttribute('color', new THREE.BufferAttribute(col,3));
  galaxyGroup.add(new THREE.Points(gg, new THREE.PointsMaterial({
    size:1.3, vertexColors:true, sizeAttenuation:false, transparent:true, opacity:0.8,
    depthWrite:false, blending:THREE.AdditiveBlending })));

  // 银心辉光
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,225,170,0.9)','rgba(255,150,60,0.18)'),
    blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
  core.scale.setScalar(22);
  galaxyScene.add(core);

  // 星系节点
  sysNodes.length = 0;
  for (const sys of SYSTEMS){
    const colHex = new THREE.Color(sys.nodeCol);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 24),
      new THREE.MeshBasicMaterial({ color: colHex }));
    mesh.position.set(sys.pos[0], 0, sys.pos[1]);
    mesh.userData.sysId = sys.id;
    galaxyScene.add(mesh);
    // 拾取热区(透明大球)
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 8, 8),
      new THREE.MeshBasicMaterial({ visible:false }));
    hit.position.copy(mesh.position);
    hit.userData.sysId = sys.id;
    galaxyScene.add(hit);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(`rgba(${colHex.r*255|0},${colHex.g*255|0},${colHex.b*255|0},0.85)`, 'rgba(0,0,0,0)'),
      blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
    glow.position.copy(mesh.position);
    glow.scale.setScalar(4.5);
    galaxyScene.add(glow);
    sysNodes.push({ sys, mesh, hit, glow, pulse: Math.random()*6.28 });
  }

  // 列车标记 + 航线
  trainMarker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(120,235,255,1)','rgba(34,211,238,0.25)'),
    blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
  trainMarker.scale.setScalar(2.6);
  galaxyScene.add(trainMarker);

  const rlGeo = new THREE.BufferGeometry();
  rlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  routeLine = new THREE.Line(rlGeo, new THREE.LineBasicMaterial({
    color:0xf59e0b, transparent:true, opacity:0.85 }));
  routeLine.visible = false;
  galaxyScene.add(routeLine);

  // 流光点(沿当前航线移动,数量/颜色随引擎成长)
  flowGroup = new THREE.Group();
  galaxyScene.add(flowGroup);

  // 航线履历(发丝弧线,默认隐藏,列车面板开关)
  routeHistGroup = new THREE.Group();
  galaxyScene.add(routeHistGroup);
  buildRouteHistory();
}

/* ── 航线履历:走过的航线长成发丝弧线网,跑得越多越实 ── */
let routeHistGroup = null, flowGroup = null;
const _flowDots = [];
function buildRouteHistory(){
  if (!routeHistGroup) return;
  while (routeHistGroup.children.length){
    const c = routeHistGroup.children.pop();
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }
  for (const key in (save.routes || {})){
    const [a, b] = key.split('|');
    if (!sysById(a) || !sysById(b)) continue;
    const n = save.routes[key];
    const A = nodePos(a), B = nodePos(b);
    // 平面外凸弧:中点垂直偏移,模拟图纸上的椭圆弧
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const d = A.distanceTo(B);
    const perp = new THREE.Vector3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(d * 0.14);
    const ctrl = mid.clone().add(perp).setY(1.0 + d * 0.04);
    const curve = new THREE.QuadraticBezierCurve3(A.clone().setY(0.3), ctrl, B.clone().setY(0.3));
    const pts = curve.getPoints(30);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0x9fb4d8, transparent: true,
      opacity: Math.min(0.45, 0.10 + n * 0.06) }));   // 跑得越多越实
    routeHistGroup.add(line);
    // 弧中点小圆点(图纸节点)
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xc8d6f0, transparent: true, opacity: 0.7 }));
    dot.position.copy(curve.getPoint(0.5));
    routeHistGroup.add(dot);
  }
  routeHistGroup.visible = !!(save.ui && save.ui.routes);
}

function nodePos(sysId){
  const s = sysById(sysId);
  return new THREE.Vector3(s.pos[0], 0, s.pos[1]);
}

function updateGalaxy(t){
  if (galaxyGroup) galaxyGroup.rotation.y = t * 0.004;
  for (const n of sysNodes){
    const k = 1 + 0.18 * Math.sin(t*1.8 + n.pulse);
    n.glow.scale.setScalar((n.sys.id === curTrainSys() ? 5.5 : 4.5) * k);
  }
  if (routeHistGroup) routeHistGroup.visible = !!(save.ui && save.ui.routes);
  // 列车位置 + 当前航线流光(随引擎成长更醒目)
  const tr = save.train;
  const lv = tr.engineLv;
  const tierCol = lv >= 7 ? 0x9fe8ff : lv >= 4 ? 0xffc46b : 0xf59e0b;
  trainMarker.material.color.setHex(tierCol);
  trainMarker.scale.setScalar(2.6 + lv * 0.18);
  if (tr.status === 'travel'){
    const a = nodePos(tr.from), b = nodePos(tr.to);
    const p = a.clone().lerp(b, travelProgress());
    trainMarker.position.set(p.x, 0.6, p.z);
    const arr = routeLine.geometry.attributes.position.array;
    arr[0]=a.x; arr[1]=0.4; arr[2]=a.z; arr[3]=b.x; arr[4]=0.4; arr[5]=b.z;
    routeLine.geometry.attributes.position.needsUpdate = true;
    routeLine.material.color.setHex(tierCol);
    routeLine.visible = true;
    // 流光车队:数量随引擎等级
    const want = 2 + Math.floor(lv / 2);
    while (_flowDots.length < want){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(255,200,120,0.12)'),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(1.1);
      flowGroup.add(s); _flowDots.push(s);
    }
    flowGroup.visible = true;
    for (let i = 0; i < _flowDots.length; i++){
      const s = _flowDots[i];
      s.visible = i < want;
      if (!s.visible) continue;
      const ft = (t * 0.12 + i / want) % 1;
      const q = a.clone().lerp(b, ft);
      s.position.set(q.x, 0.5, q.z);
      s.material.color.setHex(tierCol);
      s.material.opacity = 0.4 + 0.6 * Math.sin(ft * Math.PI);   // 两端淡入淡出
    }
  } else {
    const p = nodePos(tr.sys);
    trainMarker.position.set(p.x + 0.9, 0.9, p.z + 0.9);
    routeLine.visible = false;
    if (flowGroup) flowGroup.visible = false;
  }
}
function curTrainSys(){ return save.train.status === 'travel' ? '' : save.train.sys; }

/* ============================================================
   星系视图(按星系数据构建,可重建)
   ============================================================ */
let beltObj = null, pirateBase = null;
function buildSystemScene(sysId){
  if (systemScene) disposeScene(systemScene);
  planetObjs.length = 0; moonsList.length = 0; ringMats.length = 0;
  beltObj = null; pirateBase = null;

  const sys = sysById(sysId);
  systemScene = new THREE.Scene();
  addStarfield(systemScene);

  // 恒星
  sunMat = new THREE.ShaderMaterial({ vertexShader:PLANET_VERT, fragmentShader:SUN_FRAG,
    uniforms:{ uTime:{value:0},
      uCol1:{value:new THREE.Vector3(...sys.sunCol[0])},
      uCol2:{value:new THREE.Vector3(...sys.sunCol[1])} } });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 64, 64), sunMat);
  systemScene.add(sun);
  const c1 = sys.sunCol[1];
  const glowCol = `rgba(${c1[0]*255|0},${c1[1]*255|0},${c1[2]*255|0},`;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(glowCol+'0.95)', glowCol+'0.25)'),
    blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
  glow.scale.setScalar(46); systemScene.add(glow);
  const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(glowCol+'0.5)', glowCol+'0.08)'),
    blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
  glow2.scale.setScalar(120); systemScene.add(glow2);

  const distUniforms = () => ({
    uDistDir:{value: Array.from({length:20}, () => new THREE.Vector3(0,1,0))},
    uDistCol:{value: Array.from({length:20}, () => new THREE.Vector3())},
    uDistR:{value: new Array(20).fill(0)},
    uDistProg:{value: new Array(20).fill(0)},
  });
  const mkPlanetMat = (d) => new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
    uniforms:{
      uTime:{value:0}, uSeed:{value:d.seed}, uDev:{value:0},
      uType:{value:TYPE_MAP[d.shader]},
      ...distUniforms(),
      uC1:{value:new THREE.Vector3(...d.c1)},
      uC2:{value:new THREE.Vector3(...d.c2)},
      uC3:{value:new THREE.Vector3(...d.c3)},
      uAtmo:{value:new THREE.Vector3(...d.atmo)},
      uAtmoS:{value:d.atmoS},
      uBandFreq:{value:d.bandFreq || 6.0},
      uPolarIce:{value:d.polarIce ? 1.0 : 0.0},
      uSea:{value:d.sea !== undefined ? d.sea : 0.46},
      uArch:{value:d.arch || 0.0},
      uSunPos:{value:new THREE.Vector3(0,0,0)},
    }});

  for (const d of planetsOf(sysId)){
    if (d.moonOf){
      const mat = mkPlanetMat(d);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.radius, 48, 48), mat);
      mesh.userData.planetKey = d.key;
      systemScene.add(mesh);
      moonsList.push({ mesh, hostId: d.moonOf, dist: d.mdist, speed: d.mspeed, angle: Math.random()*6.28, incl: 0.12, mat });
      planetObjs.push({ data:d, mesh, mat, isMoon:true, angle0:0 });
      continue;
    }
    const pivot = new THREE.Object3D();
    pivot.rotation.x = (Math.random()-0.5)*0.06;
    systemScene.add(pivot);

    const mat = mkPlanetMat(d);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.radius, 64, 64), mat);
    mesh.rotation.z = d.tilt;
    mesh.userData.planetKey = d.key;
    pivot.add(mesh);

    // 运行轨迹
    const segs = 360;
    const op = new Float32Array(segs*3), oa = new Float32Array(segs);
    for (let i=0;i<segs;i++){
      const a = i/segs*Math.PI*2;
      op.set([Math.cos(a)*d.orbitR, 0, Math.sin(a)*d.orbitR], i*3);
      oa[i] = a;
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(op,3));
    og.setAttribute('aAng', new THREE.BufferAttribute(oa,1));
    const c2 = d.c2;
    const trailMat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
      uniforms:{ uAng:{value:0}, uColor:{value:new THREE.Vector3(
        Math.min(1, c2[0]*1.25+0.15), Math.min(1, c2[1]*1.25+0.15), Math.min(1, c2[2]*1.25+0.15)) } },
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending });
    pivot.add(new THREE.LineLoop(og, trailMat));

    if (d.hasRings){
      const inner = d.radius*1.5, outer = d.radius*2.7;
      const rg = new THREE.RingGeometry(inner, outer, 128, 1);
      const uv = rg.attributes.uv, p3 = rg.attributes.position;
      for (let i=0;i<uv.count;i++){
        const x = p3.getX(i), y = p3.getY(i);
        const rr = Math.sqrt(x*x+y*y) / outer;
        uv.setXY(i, 0.5 + rr*0.5, 0.5);
      }
      const rm = new THREE.ShaderMaterial({ vertexShader:RING_VERT, fragmentShader:RING_FRAG,
        uniforms:{ uSunPos:{value:new THREE.Vector3()}, uInner:{value:inner}, uOuter:{value:outer}, uSeed:{value:d.seed} },
        transparent:true, side:THREE.DoubleSide, depthWrite:false });
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = Math.PI/2 - 0.35;
      mesh.add(ring);
      ringMats.push(rm);
    }

    if (d.decoMoons){
      for (const m of d.decoMoons){
        const mm = new THREE.ShaderMaterial({
          vertexShader:PLANET_VERT, fragmentShader:PLANET_FRAG,
          uniforms:{
            uTime:{value:0}, uSeed:{value:d.seed*3.7 + m.dist}, uDev:{value:0}, uType:{value:0},
            uC1:{value:new THREE.Vector3(0.52,0.52,0.55)},
            uC2:{value:new THREE.Vector3(0.7,0.7,0.72)},
            uC3:{value:new THREE.Vector3(0.3,0.3,0.33)},
            uAtmo:{value:new THREE.Vector3(0.6,0.6,0.7)}, uAtmoS:{value:0.04},
            uBandFreq:{value:6}, uPolarIce:{value:0}, uSea:{value:0.46}, uArch:{value:0},
            uSunPos:{value:new THREE.Vector3()},
            ...distUniforms(),
          }});
        const moon = new THREE.Mesh(new THREE.SphereGeometry(m.r, 24, 24), mm);
        systemScene.add(moon);
        moonsList.push({ mesh:moon, hostId:d.id, dist:m.dist, speed:m.speed, angle:Math.random()*6.28, incl:m.incl||0, mat:mm });
      }
    }

    planetObjs.push({ data:d, mesh, pivot, mat, trailMat, angle0: (d.seed*1.37) % (Math.PI*2) });
  }

  // 小行星带(确定性点云)+ 海盗基地
  const belt = beltOf(sys);
  if (belt){
    const rng = mulberry32(belt.seed);
    const N = 520;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++){
      const a = rng() * Math.PI * 2;
      const rr = belt.r + (rng() - 0.5) * belt.width;
      pos.set([Math.cos(a) * rr, (rng() - 0.5) * 0.9, Math.sin(a) * rr], i * 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    beltObj = new THREE.Points(bg, new THREE.PointsMaterial({
      color: 0x9a948c, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.72, depthWrite: false }));
    systemScene.add(beltObj);

    if (!REGIONS[regionOf(sys)].hpS) return;   // 安全区:只有带,没有海盗
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.85),
      new THREE.MeshBasicMaterial({ color: 0xe85959, wireframe: true }));
    group.add(core);
    const pg = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(232,89,89,0.9)', 'rgba(232,89,89,0.18)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    pg.scale.setScalar(4.2); group.add(pg);
    systemScene.add(group);
    pirateBase = { group, core, sysId: sys.id, r: belt.r, angle: rng() * Math.PI * 2 };
    group.position.set(Math.cos(pirateBase.angle) * belt.r, 0, Math.sin(pirateBase.angle) * belt.r);
  }
}

/* ── 陆地掩码:用 GPU 跑与行星着色器同源的高度场,保证核心区划落在陆地 ── */
const LANDMASK_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const LANDMASK_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uSeed, uSea, uArch;
${NOISE_GLSL}
void main(){
  float lon = (vUv.x * 2.0 - 1.0) * 3.14159265;
  float lat = (vUv.y - 0.5) * 3.14159265;
  vec3 P = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));
  vec3 sp = P + vec3(uSeed);
  float base = (fbm(sp*2.6) + 0.4*fbm(sp*6.5)*0.5) / 1.2;
  float cluster = smoothstep(0.5, 0.68, fbm(sp*1.3 + 7.7));
  float arcs = (ridge(sp*4.2)*0.72 + 0.28*fbm(sp*9.0 + 3.3)) * mix(0.5, 1.0, cluster);
  float e = mix(base, arcs, uArch);
  gl_FragColor = vec4(e > uSea + 0.02 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
}`;
const MASK_W = 96, MASK_H = 48;
const _landMasks = {};
function landMaskOf(d){
  if (d.shader !== 'terra') return null;            // 无海洋星球不需要
  if (_landMasks[d.key] !== undefined) return _landMasks[d.key];
  try{
    const rt = new THREE.WebGLRenderTarget(MASK_W, MASK_H);
    const sc = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({ vertexShader: LANDMASK_VERT, fragmentShader: LANDMASK_FRAG,
      uniforms: { uSeed:{value:d.seed}, uSea:{value:d.sea !== undefined ? d.sea : 0.46}, uArch:{value:d.arch || 0} } });
    sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    renderer.setRenderTarget(rt);
    renderer.render(sc, cam);
    const buf = new Uint8Array(MASK_W * MASK_H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, MASK_W, MASK_H, buf);
    renderer.setRenderTarget(null);
    rt.dispose(); mat.dispose();
    _landMasks[d.key] = buf;
  }catch(e){ _landMasks[d.key] = null; }
  return _landMasks[d.key];
}
function dirIsLand(mask, pt){
  const u = (Math.atan2(pt[2], pt[0]) / Math.PI + 1) / 2;
  const v = Math.asin(Math.max(-1, Math.min(1, pt[1]))) / Math.PI + 0.5;
  const x = Math.min(MASK_W - 1, Math.floor(u * MASK_W));
  const y = Math.min(MASK_H - 1, Math.floor(v * MASK_H));
  return mask[(y * MASK_W + x) * 4] > 128;
}

/* ── 区划布点:斐波那契球面均匀分布(互不重叠),核心点优先陆地 ── */
const _placements = {};
function districtPlacements(p){
  const N = Math.max(1, maxSlotsOf(p));
  const ck = p.key + ':' + N;
  if (_placements[ck]) return _placements[ck];
  const rng = mulberry32(hashStr(p.key + ':place'));
  const rot = rng() * Math.PI * 2;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const pts = [];
  for (let i = 0; i < N; i++){
    let y = (1 - (i + 0.5) * 2 / N) * 0.92;        // 压离两极(避开冰盖)
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i + rot;
    const pt = [Math.cos(th) * r, y, Math.sin(th) * r];
    const l = Math.hypot(pt[0], pt[1], pt[2]);
    pts.push([pt[0]/l, pt[1]/l, pt[2]/l]);
  }
  // 核心(0 号)必须在陆地上:换最近的陆地点到首位
  const mask = landMaskOf(p);
  if (mask){
    const idx = pts.findIndex(pt => dirIsLand(mask, pt));
    if (idx > 0){ const t = pts[0]; pts[0] = pts[idx]; pts[idx] = t; }
  }
  _placements[ck] = pts;
  return pts;
}
function districtDir(p, i){
  const pts = districtPlacements(p);
  return pts[i % pts.length];
}

/* ── 贸易线货船:菱形标记(实心=去程满载,空心=返程) ── */
function makeDiamondTex(filled){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32); g.rotate(Math.PI / 4);
  g.strokeStyle = 'rgba(255,210,140,0.95)'; g.lineWidth = 5;
  if (filled){ g.fillStyle = 'rgba(255,190,110,0.9)'; g.fillRect(-13, -13, 26, 26); }
  g.strokeRect(-13, -13, 26, 26);
  return new THREE.CanvasTexture(c);
}
let _diaFill = null, _diaHollow = null;
const _shipPool = [];
let shipGroup = null;
function updateTradeShips(){
  if (mode !== 'system' || !systemScene) { if (shipGroup) shipGroup.visible = false; return; }
  if (!shipGroup || shipGroup.parent !== systemScene){
    _diaFill = _diaFill || makeDiamondTex(true);
    _diaHollow = _diaHollow || makeDiamondTex(false);
    shipGroup = new THREE.Group();
    systemScene.add(shipGroup);
    _shipPool.length = 0;
  }
  shipGroup.visible = true;
  const lines = (save.lines || []).filter(l => l.on && l.a.startsWith(curSysId + '/'));
  while (_shipPool.length < lines.length){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _diaFill, depthWrite: false, transparent: true }));
    s.scale.setScalar(0.9);
    shipGroup.add(s); _shipPool.push(s);
  }
  const find = key => planetObjs.find(o => o.data.key === key);
  for (let i = 0; i < _shipPool.length; i++){
    const s = _shipPool[i];
    const l = lines[i];
    if (!l){ s.visible = false; continue; }
    const A = find(l.a), B = find(l.b);
    if (!A || !B){ s.visible = false; continue; }
    const cyc = lineCycleSec(l) * 1000;
    const phase = ((Date.now() - l.t0) % cyc) / cyc;
    const going = phase < 0.5;
    const t = going ? phase * 2 : (phase - 0.5) * 2;
    A.mesh.getWorldPosition(_ta); B.mesh.getWorldPosition(_tb);
    const from = going ? _ta : _tb, to = going ? _tb : _ta;
    s.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + 0.6, from.z + (to.z - from.z) * t);
    s.material.map = going ? _diaFill : _diaHollow;   // 实心=运送 / 空心=返回
    s.visible = true;
  }
  updateNpcShips(lines.length);
}

/* ── NPC 民间贸易船:已开发行星间的背景航运,纯视觉,让星系热闹起来 ── */
let _npcPool = [], _npcRoutes = null, _npcSysId = null;
function updateNpcShips(playerLines){
  // 路线缓存:同星系内已开发(est)行星按轨道顺序串成链 + 港口对
  const npcSig = curSysId + ':' + Object.keys(save.est).length;   // 新殖民地建立时失效重算
  if (_npcSysId !== npcSig || !_npcRoutes){
    _npcSysId = npcSig;
    const devs = planetObjs.filter(o => save.est[o.data.key]).map(o => o.data.key);
    _npcRoutes = [];
    for (let i = 0; i < devs.length; i++)
      for (let j = i + 1; j < devs.length; j++) _npcRoutes.push([devs[i], devs[j]]);
  }
  if (!_npcRoutes.length){ for (const s of _npcPool) s.visible = false; return; }
  // 数量 ≈ 玩家贸易船 ×1.75,夹 [2, 8],防卡
  const want = Math.min(8, Math.max(2, Math.round(Math.max(playerLines, 1) * 1.75)));
  while (_npcPool.length < want){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _npcPool.length % 2 ? _diaHollow : _diaFill,
      depthWrite: false, transparent: true, opacity: 0.45, color: 0xbfc6d4 }));
    s.scale.setScalar(0.62);
    shipGroup.add(s); _npcPool.push(s);
  }
  const find = key => planetObjs.find(o => o.data.key === key);
  const now = Date.now();
  for (let i = 0; i < _npcPool.length; i++){
    const s = _npcPool[i];
    if (i >= want){ s.visible = false; continue; }
    const route = _npcRoutes[i % _npcRoutes.length];
    const A = find(route[0]), B = find(route[1]);
    if (!A || !B){ s.visible = false; continue; }
    const cyc = (planetTravelSec(route[0], route[1]) * 2 + SHIP_HANDLING) * 1000;
    const phase = ((now + i * 37117) % cyc) / cyc;     // 相位错开,各跑各的
    const going = phase < 0.5;
    const t = going ? phase * 2 : (phase - 0.5) * 2;
    A.mesh.getWorldPosition(_ta); B.mesh.getWorldPosition(_tb);
    const from = going ? _ta : _tb, to = going ? _tb : _ta;
    s.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + 0.35, from.z + (to.z - from.z) * t);
    s.visible = true;
  }
}

/* ── 区划表面投影:把殖民区划状态同步到行星着色器 ── */
function updateDistrictUniforms(){
  if (mode !== 'system') return;
  for (const o of planetObjs){
    const u = o.mat.uniforms;
    if (!u.uDistR) continue;
    const st = save.colony && save.colony[o.data.key];
    const N = Math.max(1, maxSlotsOf(o.data));
    const base = Math.min(0.34, 0.85 / Math.sqrt(N));       // 均匀间隔下的安全半径
    let doneCount = 0;
    if (st) for (const d of st.districts) if (dDone(d)) doneCount++;
    // 核心区划随殖民发展扩张(封顶以防吞掉邻区)
    const coreR = Math.min(base * (1 + 0.12 * Math.max(0, doneCount - 1)), 1.6 / Math.sqrt(N), 0.48);
    for (let i = 0; i < 20; i++){
      const d = st && st.districts[i];
      if (d){
        const dir = districtDir(o.data, i);
        u.uDistDir.value[i].set(dir[0], dir[1], dir[2]);
        const c = DISTRICT_TYPES[d.type].col3;
        u.uDistCol.value[i].set(c[0], c[1], c[2]);
        u.uDistR.value[i] = i === 0 ? coreR : base;
        u.uDistProg.value[i] = dDone(d) ? 1.0 : Math.max(0.02, Math.min(0.99, dProg(d)));
      } else {
        u.uDistR.value[i] = 0;
      }
    }
  }
}

/* ============================================================
   相机 / 输入
   ============================================================ */
const view = {
  target: new THREE.Vector3(0,0,0), targetGoal: new THREE.Vector3(0,0,0),
  theta: 0.6, phi: 1.12, dist: 150, distGoal: 150,
  focus: null,
};
function applyCamera(){
  view.target.lerp(view.targetGoal, 0.07);
  view.dist += (view.distGoal - view.dist) * 0.07;
  const sp = Math.sin(view.phi), cp = Math.cos(view.phi);
  camera.position.set(
    view.target.x + view.dist * sp * Math.cos(view.theta),
    view.target.y + view.dist * cp,
    view.target.z + view.dist * sp * Math.sin(view.theta));
  camera.lookAt(view.target);
}

let dragging = false, moved = 0, lastX = 0, lastY = 0, pinchD = 0;
function setupInput(){
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    el.classList.add('dragging'); el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    view.theta += dx * 0.005;
    view.phi = Math.max(0.12, Math.min(Math.PI-0.12, view.phi + dy * 0.005));
  });
  el.addEventListener('pointerup', e => {
    dragging = false; el.classList.remove('dragging');
    if (moved < 6) pickAt(e.clientX, e.clientY);
  });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    zoomBy(1 + e.deltaY * 0.0012);
  }, { passive:false });
  el.addEventListener('touchstart', e => { if (e.touches.length===2){ pinchD = pinch(e); } }, {passive:true});
  el.addEventListener('touchmove', e => {
    if (e.touches.length===2){
      const d = pinch(e);
      if (pinchD > 0) zoomBy(pinchD / d);
      pinchD = d;
      dragging = false;
    }
  }, {passive:true});
  function pinch(e){ const a=e.touches[0], b=e.touches[1]; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }
}
function zoomBy(f){
  let minD, maxD;
  if (mode === 'galaxy'){ minD = galaxySel ? 8 : 22; maxD = 300; }
  else { minD = view.focus ? view.focus.data.radius * 2.2 : 14; maxD = view.focus ? view.focus.data.radius * 30 : 320; }
  view.distGoal = Math.max(minD, Math.min(maxD, view.distGoal * f));
}

function pickAt(x, y){
  const ndc = new THREE.Vector2((x/innerWidth)*2-1, -(y/innerHeight)*2+1);
  raycaster.setFromCamera(ndc, camera);
  if (mode === 'galaxy'){
    const hits = raycaster.intersectObjects(sysNodes.flatMap(n => [n.mesh, n.hit]), false);
    if (hits.length) focusSystemNode(hits[0].object.userData.sysId);
  } else {
    const hits = raycaster.intersectObjects(planetObjs.map(o => o.mesh), false);
    if (hits.length) focusPlanet(hits[0].object.userData.planetKey);
  }
}

/* ── 星系节点聚焦(银河视图) ── */
function focusSystemNode(sysId){
  const sys = sysById(sysId);
  if (galaxySel !== sys && typeof sfx === 'function') sfx('blip');
  galaxySel = sys;
  view.targetGoal.copy(nodePos(sysId));
  view.distGoal = 20;
  document.getElementById('back-btn').classList.add('show');
  openSysPanel(sys);
  refreshDock();
}
function unfocusSystemNode(){
  galaxySel = null;
  view.targetGoal.set(0,0,0);
  view.distGoal = 125;
  document.getElementById('panel').classList.remove('show');
  refreshBackBtn();
  refreshDock();
}

/* ── 行星聚焦(星系视图) ── */
function focusPlanet(key){
  const obj = planetObjs.find(o => o.data.key === key);
  if (!obj) return;
  if (view.focus !== obj && typeof sfx === 'function') sfx('blip');
  view.focus = obj;
  view.distGoal = obj.data.radius * 5.2;
  document.getElementById('back-btn').classList.add('show');
  document.getElementById('nav-prev').classList.add('show');
  document.getElementById('nav-next').classList.add('show');
  document.getElementById('tip').classList.add('hidden');
  openPanel(obj.data);
  refreshDock();
}
function unfocus(){
  view.focus = null;
  view.targetGoal.set(0,0,0);
  view.distGoal = 150;
  document.getElementById('panel').classList.remove('show');
  document.getElementById('nav-prev').classList.remove('show');
  document.getElementById('nav-next').classList.remove('show');
  refreshBackBtn();
  refreshDock();
}

function navList(){
  return planetObjs.filter(o => !(o.data.moonOf && !save.est[o.data.key] && !hardUnlocked(o.data)));
}
function navPlanet(dir){
  if (mode !== 'system' || !view.focus) return;
  const list = navList();
  let i = list.indexOf(view.focus);
  if (i < 0) i = 0;
  i = (i + dir + list.length) % list.length;
  focusPlanet(list[i].data.key);
}

/* ── 视图切换 ── */
function setMode(m, sysId){
  if (m === 'system'){
    if (!systemScene || sysId !== curSysId) buildSystemScene(sysId);
    curSysId = sysId;
    scene = systemScene;
    view.focus = null;
    view.target.set(0,0,0); view.targetGoal.set(0,0,0);
    view.dist = 260; view.distGoal = 150; view.theta = 0.6; view.phi = 1.12;
  } else {
    if (!galaxyScene) buildGalaxyScene();
    scene = galaxyScene;
    view.focus = null; galaxySel = null;
    view.target.set(0,0,0); view.targetGoal.set(0,0,0);
    view.dist = 230; view.distGoal = 125; view.theta = 0.45; view.phi = 0.8;
  }
  mode = m;
  document.getElementById('panel').classList.remove('show');
  document.getElementById('nav-prev').classList.remove('show');
  document.getElementById('nav-next').classList.remove('show');
  buildLabels();
  refreshBackBtn();
  if (typeof onModeChanged === 'function') onModeChanged();
}

/* ============================================================
   3D 悬浮标签(银河节点 / 行星共用一套 DOM 池)
   ============================================================ */
let labelEls = {};
function buildLabels(){
  const wrap = document.getElementById('labels');
  wrap.innerHTML = '';
  labelEls = {};
  if (mode === 'galaxy'){
    for (const n of sysNodes){
      const el = document.createElement('div');
      el.className = 'p-label sysnode';
      el.style.color = n.sys.nodeCol;
      el.onclick = () => focusSystemNode(n.sys.id);
      wrap.appendChild(el);
      labelEls[n.sys.id] = el;
    }
  } else {
    for (const o of planetObjs){
      const d = o.data;
      const el = document.createElement('div');
      el.className = 'p-label';
      el.style.color = dotColor(d);
      el.onclick = () => focusPlanet(d.key);
      wrap.appendChild(el);
      labelEls[d.key] = el;
    }
    if (pirateBase){
      const el = document.createElement('div');
      el.className = 'p-label pirate';
      el.onclick = () => pirateLabelClick(pirateBase.sysId);
      wrap.appendChild(el);
      labelEls['__pirate'] = el;
    }
  }
  refreshLabelText();
}
function refreshLabelText(){
  if (mode === 'galaxy'){
    for (const n of sysNodes){
      const el = labelEls[n.sys.id];
      if (!el) continue;
      const here = save.train.status === 'docked' && save.train.sys === n.sys.id;
      const status = here ? '<span class="lvb">🚆 列车驻留</span>'
        : save.visited[n.sys.id] ? '<span class="lvb">已探索</span>'
        : sysUnlocked(n.sys) ? '<span class="lockb">可航行</span>'
        : '<span class="lockb">🔒</span>';
      el.innerHTML = `${SYS_ICON}<span style="color:var(--text-dim)">${n.sys.name}</span>${status}`;
    }
  } else {
    for (const o of planetObjs){
      const d = o.data, lv = devLevel(d), el = labelEls[d.key];
      if (!el) continue;
      el.innerHTML = `${iconOf(d)}<span style="color:var(--text-dim)">${d.name}</span>` +
        (lv>0 ? `<span class="lvb">${LEVELS[lv].name}</span>` : '');
    }
    const pe = labelEls['__pirate'];
    if (pe && pirateBase){
      if (pirateAlive(pirateBase.sysId))
        pe.innerHTML = `☠<span>海盗基地</span><span class="lockb" style="color:#e85959;border-color:rgba(232,89,89,.45)">可进攻</span>`;
      else {
        const s = pirateRespawnLeft(pirateBase.sysId);
        pe.innerHTML = `☠<span style="opacity:.55">海盗残骸</span><span class="lockb">重建 ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}</span>`;
      }
    }
  }
}
const _wp = new THREE.Vector3();
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
/* 列车标记定位:泊于行星下方;星内转移时在两星间滑行 */
function positionTrainTag(){
  const tag = document.getElementById('train-tag');
  if (!tag || tag.classList.contains('hidden')) return;
  const tr = save.train;
  // 银河总图:锁定所在星系节点下方;跨星系航行沿航线滑行
  if (mode === 'galaxy'){
    let p;
    if (tr.status === 'travel') p = nodePos(tr.from).lerp(nodePos(tr.to), travelProgress());
    else p = nodePos(tr.sys);
    _ta.set(p.x, p.y - 1.2, p.z).project(camera);
    if (_ta.z > 1 || _ta.z < -1){ tag.style.opacity = 0; return; }
    tag.style.opacity = 1;
    tag.style.transform = `translate(${(_ta.x*0.5+0.5)*innerWidth}px, ${(-_ta.y*0.5+0.5)*innerHeight}px) translate(-50%, 14px)`;
    return;
  }
  const find = id => planetObjs.find(o => o.data.id === id);
  const a = find(tr.planet);
  if (!a){ tag.classList.add('hidden'); return; }
  a.mesh.getWorldPosition(_ta);
  let px = _ta.x, py = _ta.y - a.data.radius * 1.6, pz = _ta.z;
  // 放大停靠星时:标记锚定到核心区划(0 号)表面位置
  if (!localTransit() && view.focus === a && view.dist < a.data.radius * 9){
    const st = save.colony && save.colony[a.data.key];
    if (st && st.districts.length){
      const dir = districtDir(a.data, 0);
      _tb.set(dir[0], dir[1], dir[2]).applyQuaternion(a.mesh.quaternion).multiplyScalar(a.data.radius * 1.06);
      px = _ta.x + _tb.x; py = _ta.y + _tb.y; pz = _ta.z + _tb.z;
    }
  }
  if (localTransit()){
    const b = find(tr.localTo);
    if (b){
      b.mesh.getWorldPosition(_tb);
      const t = Math.min(1, Math.max(0, (Date.now() - (tr.localDepartAt || 0)) / Math.max(1, tr.localArriveAt - (tr.localDepartAt || 0))));
      px = _ta.x + (_tb.x - _ta.x) * t;
      py = _ta.y + (_tb.y - _ta.y) * t - a.data.radius * 1.6;
      pz = _ta.z + (_tb.z - _ta.z) * t;
    }
  }
  _ta.set(px, py, pz).project(camera);
  if (_ta.z > 1 || _ta.z < -1){ tag.style.opacity = 0; return; }
  tag.style.opacity = 1;
  tag.style.transform = `translate(${(_ta.x*0.5+0.5)*innerWidth}px, ${(-_ta.y*0.5+0.5)*innerHeight}px) translate(-50%, 0)`;
}
/* ── 任务讯号标记(wifi 竖立图标 + 呼吸渐变 + 涟漪;可点击飞往该行星;已停靠时换锚) ── */
const QUEST_WIFI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 9.5a12 12 0 0 1 17 0"/><path d="M6.5 12.8a8 8 0 0 1 11 0"/><path d="M9.4 16a4 4 0 0 1 5.2 0"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>`;
const QUEST_ANCHOR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5.5" r="2.2"/><path d="M12 7.7V19"/><path d="M5 13a7 7 0 0 0 14 0"/><path d="M8.5 10.5h7"/></svg>`;
function questTagClick(loc){
  const sysId = loc.split('/')[0];
  sfx('blip');
  if (mode === 'system' && curSysId === sysId){ focusPlanet(loc); return; }
  if (mode === 'galaxy'){
    setMode('system', sysId);
    setTimeout(() => focusPlanet(loc), 400);
  }
}
let _questSig = '';
function updateQuestTags(){
  const wrap = document.getElementById('quest-tags');
  if (!wrap || typeof questPendingList !== 'function') return;
  const list = questPendingList();
  const sig = list.map(q => q.track + q.loc).join('|') + ':' + mode + ':' + curSysId;
  if (sig !== _questSig){
    _questSig = sig;
    wrap.innerHTML = list.map(q => `
      <div class="quest-tag" data-loc="${q.loc}" title="点击前往讯号源" style="color:${QUEST_COLORS[q.track]}">
        <span class="qrip"></span><span class="qrip r2"></span><span class="qrip r3"></span>
        <span class="qicon">${QUEST_WIFI_SVG}</span>
      </div>`).join('');
    wrap.querySelectorAll('.quest-tag').forEach(el => el.onclick = () => questTagClick(el.dataset.loc));
  }
  const els = wrap.children;
  for (let i = 0; i < list.length; i++){
    const q = list[i], el = els[i];
    if (!el) continue;
    const sysId = q.loc.split('/')[0], pid = q.loc.split('/')[1];
    let ok = false;
    if (mode === 'galaxy'){
      const n = sysNodes.find(n => n.sys.id === sysId);
      if (n){ _wp.copy(n.mesh.position); _wp.y += 3.2; ok = true; }
    } else if (curSysId === sysId){
      const o = planetObjs.find(o => o.data.id === pid);
      if (o){ o.mesh.getWorldPosition(_wp); _wp.y += o.data.radius * 1.6 + 1.4; ok = true; }
    }
    if (!ok){ el.style.display = 'none'; continue; }
    _wp.project(camera);
    if (_wp.z > 1 || _wp.z < -1){ el.style.display = 'none'; continue; }
    // 同一地点多任务:横向错开
    const sibs = list.filter(x => x.loc === q.loc);
    const k = sibs.indexOf(q);
    const dx = (k - (sibs.length - 1) / 2) * 30;
    el.style.display = '';
    el.style.transform = `translate(${(_wp.x*0.5+0.5)*innerWidth + dx}px, ${(-_wp.y*0.5+0.5)*innerHeight}px) translate(-50%,-100%)`;
  }
}

function updateLabels(){
  if (mode === 'galaxy'){
    for (const n of sysNodes){
      const el = labelEls[n.sys.id];
      if (!el) continue;
      _wp.copy(n.mesh.position); _wp.y += 1.4;
      _wp.project(camera);
      if (_wp.z > 1 || _wp.z < -1){ el.classList.add('hidden'); continue; }
      el.classList.remove('hidden');
      el.style.transform = `translate(${(_wp.x*0.5+0.5)*innerWidth}px, ${(-_wp.y*0.5+0.5)*innerHeight}px) translate(-50%,-130%)`;
      el.style.opacity = galaxySel && galaxySel.id !== n.sys.id ? 0.4 : 1;
    }
    return;
  }
  for (const o of planetObjs){
    const el = labelEls[o.data.key];
    if (!el) continue;
    if (view.focus === o){ el.classList.add('hidden'); continue; }
    if (o.isMoon && (view.dist > 45 || (!save.est[o.data.key] && !hardUnlocked(o.data)))){ el.classList.add('hidden'); continue; }
    o.mesh.getWorldPosition(_wp);
    _wp.y += o.data.radius * 1.15;
    const dist = camera.position.distanceTo(_wp);
    _wp.project(camera);
    if (_wp.z > 1 || _wp.z < -1){ el.classList.add('hidden'); continue; }
    el.classList.remove('hidden');
    el.style.transform = `translate(${(_wp.x*0.5+0.5)*innerWidth}px, ${(-_wp.y*0.5+0.5)*innerHeight}px) translate(-50%,-130%)`;
    el.style.opacity = view.focus ? 0.45 : Math.max(0.5, Math.min(1, 220/dist));
  }
  const pl = labelEls['__pirate'];
  if (pl && pirateBase){
    _wp.copy(pirateBase.group.position); _wp.y += 1.6;
    _wp.project(camera);
    if (_wp.z > 1 || _wp.z < -1){ pl.classList.add('hidden'); return; }
    pl.classList.remove('hidden');
    pl.style.transform = `translate(${(_wp.x*0.5+0.5)*innerWidth}px, ${(-_wp.y*0.5+0.5)*innerHeight}px) translate(-50%,-130%)`;
    pl.style.opacity = view.focus ? 0.45 : 1;
  }
}

/* ============================================================
   主循环
   ============================================================ */
const ORBIT_SPEED = 0.012;
const _hostP = new THREE.Vector3();
function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (mode === 'galaxy'){
    updateGalaxy(t);
  } else {
    sunMat.uniforms.uTime.value = t;
    for (const o of planetObjs){
      const d = o.data;
      o.mat.uniforms.uTime.value = t;
      o.mat.uniforms.uDev.value += (devNorm(d) - o.mat.uniforms.uDev.value) * 0.05;
      if (o.isMoon){ o.mesh.rotation.y += 0.0012; continue; }
      const ang = o.angle0 + t * ORBIT_SPEED * (200 / d.period);
      o.mesh.position.set(Math.cos(ang)*d.orbitR, 0, Math.sin(ang)*d.orbitR);
      o.mesh.rotation.y += 0.0016 * (d.shader==='gas'||d.shader==='ice' ? 2.2 : 1.0);
      o.trailMat.uniforms.uAng.value = ang % (Math.PI*2);
    }
    for (const m of moonsList){
      const host = planetObjs.find(o => o.data.id === m.hostId);
      if (!host) continue;
      m.angle += m.speed;
      host.mesh.getWorldPosition(_hostP);
      m.mesh.position.set(
        _hostP.x + Math.cos(m.angle)*m.dist,
        _hostP.y + Math.sin(m.angle*0.9)*m.dist*Math.sin(m.incl),
        _hostP.z + Math.sin(m.angle)*m.dist);
      if (m.mat) m.mat.uniforms.uTime.value = t;
    }
    if (beltObj) beltObj.rotation.y = t * 0.008;
    if (pirateBase){
      const alive = pirateAlive(pirateBase.sysId);
      pirateBase.group.visible = alive;
      if (alive){
        const a = pirateBase.angle + t * 0.008;   // 与带同步漂移
        pirateBase.group.position.set(Math.cos(a) * pirateBase.r, 0, Math.sin(a) * pirateBase.r);
        pirateBase.core.rotation.y = t * 0.6;
        pirateBase.core.rotation.x = t * 0.25;
      }
    }
    if (view.focus) view.focus.mesh.getWorldPosition(view.targetGoal);
  }

  updateLabels();
  positionTrainTag();
  updateQuestTags();
  updateTradeShips();
  applyCamera();
  renderer.render(scene, camera);
}
