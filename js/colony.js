/* ============================================================
   殖民区划与建筑 — 状态机
   全自动开辟/建造(同一星球同时只施工一项,真实时间推进);
   列车驻留本星系 → 建设速度 ×2(商贸加速);注资 → 立即完工
   ============================================================ */

/* 全局效果聚合(每秒由 tickUI 重算) */
let COLONY_FX = { wcost:1, ecost:1, cd:0, amt:1, cargo:1, loot:1, civ:0, def:0, crew:0, prod:{}, cap:{} };

function colonyState(p){
  if (!save.colony) save.colony = {};
  if (!save.colony[p.key]) save.colony[p.key] = { districts: [] };
  return save.colony[p.key];
}
function dDone(d){ return Date.now() >= d.startAt + d.dur * 1000; }
function dProg(d){ return Math.min(1, (Date.now() - d.startAt) / (d.dur * 1000)); }
function dRemain(d){ return Math.max(0, (d.startAt + d.dur * 1000 - Date.now()) / 1000); }

/* 区划在星球表面的位置(确定性种子,随星球自转) */
function districtDir(p, i){
  const rng = mulberry32(hashStr(p.key + ':' + i));
  const ang = rng() * 6.2832, y = (rng() * 2 - 1) * 0.6;
  const s = Math.sqrt(1 - y * y);
  return [Math.cos(ang) * s, y, Math.sin(ang) * s];
}

function pickDistrictType(p, st){
  const existing = st.districts.map(d => d.type);
  const order = DISTRICT_PREF[p.role] || DISTRICT_PREF.res;
  const pool = order.filter(t => !existing.includes(t));
  const list = pool.length ? pool : order;
  return list[Math.floor(Math.pow(Math.random(), 1.7) * list.length)];   // 偏向角色倾向前列
}

/* 建筑条件 */
function buildingCond(p, def){
  const out = [];
  if (def.cond.role) out.push({ met: p.role === def.cond.role, text: def.cond.role === 'hab' ? '需居住型星球' : '需资源型星球' });
  if (def.cond.lv) out.push({ met: devLevel(p) >= def.cond.lv, text: `星球达到「${LEVELS[def.cond.lv].name}」` });
  if (def.cond.civ) out.push({ met: civIndex() >= def.cond.civ, text: `文明指数 ≥ ${def.cond.civ}` });
  return out;
}
function builtIds(st){
  const ids = [];
  for (const d of st.districts) for (const b of d.builds) ids.push(b.id);
  return ids;
}
/* 该区划的下一候选建筑(含条件未满足的,用于展示) */
function nextBuildingFor(p, st, d){
  const used = builtIds(st);
  for (const id in BUILDINGS){
    const def = BUILDINGS[id];
    if (def.district !== d.type || used.includes(id)) continue;
    const conds = buildingCond(p, def);
    return { id, def, ready: conds.every(c => c.met), conds };
  }
  return null;
}

/* 当前施工项(全星球同时只一项) */
function activeConstruction(st){
  for (let i = 0; i < st.districts.length; i++){
    const d = st.districts[i];
    if (!dDone(d)) return { kind:'district', obj:d, label: DISTRICT_TYPES[d.type].name, type:d.type };
    for (const b of d.builds)
      if (!dDone(b)) return { kind:'building', obj:b, label: BUILDINGS[b.id].name, type:d.type };
  }
  return null;
}

/* 注资完工:费用随星球已建成结构数指数上升;需列车驻留本星系 */
function investCost(p, st){
  let done = 0;
  for (const d of st.districts){
    if (dDone(d)) done++;
    for (const b of d.builds) if (dDone(b)) done++;
  }
  const base = Math.round(500 * Math.pow(2.2, done));
  const act = activeConstruction(st);
  const cost = { metal: base };
  if (act){
    const sec = DISTRICT_TYPES[act.type].investRes;
    if (sec) cost[sec] = Math.round(base * 0.6);
    else cost.metal = Math.round(base * 1.5);   // 商贸区:纯金属注资
  }
  return cost;
}
function investColony(pKey){
  const p = planetByKey(pKey);
  const st = colonyState(p);
  const act = activeConstruction(st);
  if (!act) return false;
  if (!(save.train.status === 'docked' && save.train.sys === p.sysId) || save.pendingRaid) return false;
  if (!payCost(investCost(p, st))) return false;
  act.obj.startAt = Date.now() - act.obj.dur * 1000 - 1000;   // 立即完工
  pushLog(`列车物资注入 ${p.name} —— 「${act.label}」即刻竣工`);
  persistSave();
  return true;
}

/* ── 每秒推进 ── */
function colonyTick(){
  const events = [];
  for (const p of allPlanets()){
    if (!save.est[p.key]) continue;
    const st = colonyState(p);
    const lv = devLevel(p);
    const docked = save.train.status === 'docked' && save.train.sys === p.sysId && !save.pendingRaid;

    // 商贸加速:列车驻留 → 施工双倍速(每秒额外推进 1 秒)
    if (docked){
      for (const d of st.districts){
        if (!dDone(d)) d.startAt -= 1000;
        for (const b of d.builds) if (!dDone(b)) b.startAt -= 1000;
      }
    }
    // 竣工播报
    for (const d of st.districts){
      if (dDone(d) && !d.ann){ d.ann = 1; events.push(`<b>${p.name}</b> · ${DISTRICT_TYPES[d.type].name} 开辟完成`); }
      for (const b of d.builds)
        if (dDone(b) && !b.ann){ b.ann = 1; events.push(`<b>${p.name}</b> · 「${BUILDINGS[b.id].name}」落成 —— ${BUILDINGS[b.id].desc}`); }
    }
    // 自动开工(一次一项):先开区划,后建建筑
    if (!activeConstruction(st)){
      if (st.districts.length < Math.min(lv, DISTRICT_MAX)){
        st.districts.push({
          type: pickDistrictType(p, st),
          startAt: Date.now(), dur: 300 * (st.districts.length + 1),
          builds: [],
        });
        persistSave();
      } else {
        for (const d of st.districts){
          if (!dDone(d) || d.builds.length >= BUILDS_PER_DISTRICT) continue;
          const next = nextBuildingFor(p, st, d);
          if (next && next.ready){
            d.builds.push({ id: next.id, startAt: Date.now(), dur: next.def.time });
            persistSave();
            break;
          }
        }
      }
    }
  }
  if (events.length){
    showToast(events[0], { sfx:'levelup' });
    persistSave();
  }
}

/* ── 效果聚合 ── */
function computeColonyFx(){
  const fx = { wcost:1, ecost:1, cd:0, amt:1, cargo:1, loot:1, civ:0, def:0, crew:0, prod:{}, cap:{} };
  if (!save.colony) { COLONY_FX = fx; return; }
  for (const key in save.colony){
    const st = save.colony[key];
    for (const d of st.districts){
      if (!dDone(d)) continue;
      for (const b of d.builds){
        if (!dDone(b)) continue;
        const e = BUILDINGS[b.id].fx;
        if (e.prod) fx.prod[key] = (fx.prod[key] || 1) + e.prod;
        if (e.cap)  fx.cap[key]  = (fx.cap[key]  || 1) + e.cap;
        if (e.amt)  fx.amt += e.amt;
        if (e.cargo)fx.cargo += e.cargo;
        if (e.cd)   fx.cd += e.cd;
        if (e.loot) fx.loot += e.loot;
        if (e.civ)  fx.civ += e.civ;
        if (e.def)  fx.def += e.def;
        if (e.crew) fx.crew += e.crew;
        if (e.wcost) fx.wcost *= (1 - e.wcost);
        if (e.ecost) fx.ecost *= (1 - e.ecost);
      }
    }
  }
  fx.wcost = Math.max(0.5, fx.wcost);
  fx.ecost = Math.max(0.5, fx.ecost);
  COLONY_FX = fx;
}
function colonyProd(p){ return COLONY_FX.prod[p.key] || 1; }
function colonyCap(p){ return COLONY_FX.cap[p.key] || 1; }
