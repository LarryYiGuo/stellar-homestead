/* ============================================================
   殖民区划与建筑 — 状态机
   全自动开辟/建造(同一星球同时只施工一项,真实时间推进);
   列车驻留本星系 → 建设速度 ×2(商贸加速);注资 → 立即完工
   ============================================================ */

/* 全局效果聚合(每秒由 tickUI 重算);rp = 科研值产率(/秒) */
let COLONY_FX = { wcost:1, ecost:1, cd:0, amt:1, cargo:1, loot:1, civ:0, def:0, crew:0, rp:0, prod:{}, cap:{} };

/* 区划位:环境上限(宜居20/艰苦8/严酷4)随开发等级 1/5 → 5/5 逐步解锁 */
function unlockedSlots(p){
  const lv = devLevel(p);
  if (lv === 0) return 0;
  return Math.ceil(envTier(p).slots * lv / MAX_LEVEL);
}

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

/* ── 环境分级与可开辟区划 ── */
function envTier(p){
  for (const t of ENV_TIERS) if (p.habit < t.th) return t;
  return ENV_TIERS[ENV_TIERS.length - 1];
}
/* 返回 [type, weight] 列表:恶劣星球仅工业/科研;艰苦不建民生;卫星军工权重大增 */
function allowedDistricts(p){
  let list;
  if (p.habit < 0.35){
    list = [['industry', 4], ['research', 2]];
  } else if (p.habit < 0.6){
    list = [['industry', 3], ['arsenal', 2], ['research', 2], ['trade', 1]];
  } else if (p.role === 'hab'){
    list = [['habitation', 4], ['trade', 2], ['research', 2], ['industry', 1.5], ['arsenal', 1]];
  } else {
    list = [['industry', 3], ['trade', 2], ['research', 1.5], ['habitation', 1.5], ['arsenal', 1]];
  }
  if (p.moonOf){                       // 卫星 = 天然军事要冲
    const i = list.findIndex(([t]) => t === 'arsenal');
    const top = Math.max(...list.map(([,w]) => w));
    if (i >= 0) list[i][1] = top * 1.6;
    else list.push(['arsenal', top * 1.6]);
  }
  return list;
}
function pickDistrictType(p, st){
  const allowed = allowedDistricts(p);
  const existing = st.districts.map(d => d.type);
  let pool = allowed.filter(([t]) => !existing.includes(t));   // 先求类型齐全
  if (!pool.length) pool = allowed;                            // 再允许同类叠开
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of pool){ r -= w; if (r <= 0) return t; }
  return pool[0][0];
}
/* 旧档迁移:已存在但环境不允许的区划 → 就地改建为允许类型(清空其建筑) */
function fixDistrictTypes(p, st){
  const ok = allowedDistricts(p).map(([t]) => t);
  let changed = false;
  for (const d of st.districts){
    if (ok.includes(d.type)) continue;
    d.type = pickDistrictType(p, { districts: st.districts.filter(x => x !== d) });
    d.builds = d.builds.filter(b => BUILDINGS[b.id].district === d.type);
    changed = true;
  }
  if (changed) persistSave();
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
  const base = Math.round(500 * Math.pow(2.2, Math.min(done, 14)));   // 封顶,避免后期注资价格失真
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
    fixDistrictTypes(p, st);
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
      if (st.districts.length < unlockedSlots(p)){
        st.districts.push({
          type: pickDistrictType(p, st),
          startAt: Date.now(), dur: Math.round(240 * (1 + st.districts.length * 0.4)),
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
  const fx = { wcost:1, ecost:1, cd:0, amt:1, cargo:1, loot:1, civ:0, def:0, crew:0, rp:0, prod:{}, cap:{} };
  if (!save.colony) { COLONY_FX = fx; return; }
  for (const key in save.colony){
    const st = save.colony[key];
    const p = planetByKey(key);
    const envMult = p ? envTier(p).mult : 1;     // 严酷 ×3 / 艰苦 ×1.5 / 宜居 ×1
    for (const d of st.districts){
      if (!dDone(d)) continue;
      // 区划固有加成(同类可叠加 × 环境效率)
      const dfx = DISTRICT_FX[d.type];
      if (dfx){
        if (dfx.prod) fx.prod[key] = (fx.prod[key] || 1) + dfx.prod * envMult;
        if (dfx.cap)  fx.cap[key]  = (fx.cap[key]  || 1) + dfx.cap;
        if (dfx.amt)  fx.amt += dfx.amt;
        if (dfx.civ)  fx.civ += dfx.civ * envMult;
        if (dfx.def)  fx.def += dfx.def;
        if (dfx.rp)   fx.rp  += dfx.rp * envMult;
      }
      for (const b of d.builds){
        if (!dDone(b)) continue;
        const e = BUILDINGS[b.id].fx;
        if (e.prod) fx.prod[key] = (fx.prod[key] || 1) + e.prod * envMult;
        if (e.cap)  fx.cap[key]  = (fx.cap[key]  || 1) + e.cap;
        if (e.amt)  fx.amt += e.amt;
        if (e.cargo)fx.cargo += e.cargo;
        if (e.cd)   fx.cd += e.cd;
        if (e.loot) fx.loot += e.loot;
        if (e.civ)  fx.civ += e.civ;
        if (e.def)  fx.def += e.def;
        if (e.crew) fx.crew += e.crew;
        if (e.rp)   fx.rp  += e.rp * envMult;
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

/* ── 科研值:积累与研发消费 ── */
function accrueResearch(){
  const now = Date.now();
  if (!save.rpAt) save.rpAt = now;
  const dt = Math.min(86400 * 3, (now - save.rpAt) / 1000);   // 离线累积,上限 3 天
  if (dt > 0 && COLONY_FX.rp > 0)
    save.research = (save.research || 0) + COLONY_FX.rp * dt;
  save.rpAt = now;
}
function techLv(id){ return (save.tech && save.tech[id]) || 0; }
function researchTech(id){
  const def = TRAIN_TECHS[id];
  const lv = techLv(id);
  if (!def || lv >= def.max) return false;
  const cost = techCost(id, lv + 1);
  if ((save.research || 0) < cost) return false;
  save.research -= cost;
  if (!save.tech) save.tech = {};
  save.tech[id] = lv + 1;
  pushLog(`列车研发完成:「${def.name}」LV${lv + 1}`);
  persistSave();
  return true;
}
