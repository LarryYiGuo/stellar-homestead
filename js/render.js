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
    color:0xf59e0b, transparent:true, opacity:0.55 }));
  routeLine.visible = false;
  galaxyScene.add(routeLine);
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
  // 列车位置
  const tr = save.train;
  if (tr.status === 'travel'){
    const a = nodePos(tr.from), b = nodePos(tr.to);
    const p = a.lerp(b, travelProgress());
    trainMarker.position.set(p.x, 0.6, p.z);
    const arr = routeLine.geometry.attributes.position.array;
    const A = nodePos(tr.from), B = nodePos(tr.to);
    arr[0]=A.x; arr[1]=0.4; arr[2]=A.z; arr[3]=B.x; arr[4]=0.4; arr[5]=B.z;
    routeLine.geometry.attributes.position.needsUpdate = true;
    routeLine.visible = true;
  } else {
    const p = nodePos(tr.sys);
    trainMarker.position.set(p.x + 0.9, 0.9, p.z + 0.9);
    routeLine.visible = false;
  }
}
function curTrainSys(){ return save.train.status === 'travel' ? '' : save.train.sys; }

/* ============================================================
   星系视图(按星系数据构建,可重建)
   ============================================================ */
function buildSystemScene(sysId){
  if (systemScene) disposeScene(systemScene);
  planetObjs.length = 0; moonsList.length = 0; ringMats.length = 0;

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
    uDistDir:{value: Array.from({length:5}, () => new THREE.Vector3(0,1,0))},
    uDistCol:{value: Array.from({length:5}, () => new THREE.Vector3())},
    uDistR:{value: new Array(5).fill(0)},
    uDistProg:{value: new Array(5).fill(0)},
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
}

/* ── 区划表面投影:把殖民区划状态同步到行星着色器 ── */
function updateDistrictUniforms(){
  if (mode !== 'system') return;
  for (const o of planetObjs){
    const u = o.mat.uniforms;
    if (!u.uDistR) continue;
    const st = save.colony && save.colony[o.data.key];
    for (let i = 0; i < 5; i++){
      const d = st && st.districts[i];
      if (d){
        const dir = districtDir(o.data, i);
        u.uDistDir.value[i].set(dir[0], dir[1], dir[2]);
        const c = DISTRICT_TYPES[d.type].col3;
        u.uDistCol.value[i].set(c[0], c[1], c[2]);
        u.uDistR.value[i] = 0.34;
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
  return planetObjs.filter(o => !(o.data.moonOf && !save.est[o.data.key] && !isUnlocked(o.data)));
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
  }
}
const _wp = new THREE.Vector3();
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
    if (o.isMoon && (view.dist > 45 || (!save.est[o.data.key] && !isUnlocked(o.data)))){ el.classList.add('hidden'); continue; }
    o.mesh.getWorldPosition(_wp);
    _wp.y += o.data.radius * 1.15;
    const dist = camera.position.distanceTo(_wp);
    _wp.project(camera);
    if (_wp.z > 1 || _wp.z < -1){ el.classList.add('hidden'); continue; }
    el.classList.remove('hidden');
    el.style.transform = `translate(${(_wp.x*0.5+0.5)*innerWidth}px, ${(-_wp.y*0.5+0.5)*innerHeight}px) translate(-50%,-130%)`;
    el.style.opacity = view.focus ? 0.45 : Math.max(0.5, Math.min(1, 220/dist));
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
    if (view.focus) view.focus.mesh.getWorldPosition(view.targetGoal);
  }

  updateLabels();
  applyCamera();
  renderer.render(scene, camera);
}
