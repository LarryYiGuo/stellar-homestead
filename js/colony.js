/* ============================================================
   殖民区划与建筑 — 状态机
   全自动开辟/建造(同一星球同时只施工一项,真实时间推进);
   列车驻留本星系 → 建设速度 ×2(商贸加速);注资 → 立即完工
   ============================================================ */

/* 全局效果聚合(每秒由 tickUI 重算);rp = 科研值产率(/秒) */
let COLONY_FX = { wcost:1, ecost:1, cd:0, amt:1, cargo:1, loot:1, civ:0, def:0, crew:0, rp:0, prod:{}, cap:{} };

/* ── 星球带别:决定区划数量档(类地 16–36 / 标准 5–10 / 严酷 1–3) ── */
function planetBand(p){
  if (save.terraformed && save.terraformed[p.key]) return 'terra';   // 已类地化
  if (p.habit < 0.35) return 'harsh';
  return p.shader === 'terra' ? 'terra' : 'std';
}
/* 区划数:浮动制,严格按 环境带 × 星球半径 连续曲线
   类地  slots = 28·r^1.35,夹在 [12, 50] —— r0.4→12 / r0.7→17 / r1.0→28 / r1.45→46
   标准  slots =  9·r^0.9, 夹在 [4, 12]  —— r0.3→4 / r0.55(赤峁)→5 / r0.92(纱幕)→8
   严酷  按体量分档:r<0.6→1 / r<1.6→2 / 巨行星→3 */
function maxSlotsOf(p){
  const r = p.radius;
  switch (planetBand(p)){
    case 'terra': return Math.max(12, Math.min(50, Math.round(28 * Math.pow(r, 1.35))));
    case 'harsh': return r < 0.6 ? 1 : r < 1.6 ? 2 : 3;
    default:      return Math.max(4,  Math.min(12, Math.round(9 * Math.pow(r, 0.9))));
  }
}
/* 区划位随开发等级 1/5 → 5/5 逐步解锁 */
function unlockedSlots(p){
  const lv = devLevel(p);
  if (lv === 0) return 0;
  return Math.ceil(maxSlotsOf(p) * lv / MAX_LEVEL);
}
/* 类地化改造:仅火星类岩石行星(标准带 + rocky),卫星与温室星均不可;严酷无法改造 */
function canTerraform(p){
  return planetBand(p) === 'std' && p.shader === 'rocky' && !p.moonOf
      && devLevel(p) >= TERRAFORM_REQ.lv && civIndex() >= TERRAFORM_REQ.civ;
}
function terraformPlanet(key){
  const p = planetByKey(key);
  if (!p || !canTerraform(p) || !payCost(TERRAFORM_COST)) return false;
  if (!save.terraformed) save.terraformed = {};
  save.terraformed[key] = true;
  pushLog(`${p.name} 类地化改造完成 —— 区划容量提升至类地档(${maxSlotsOf(p)} 格)`);
  persistSave();
  return true;
}
/* 居住承载:全银河非居住区划总数 ≤ 居住区划 ×2,约束扩张 */
function habCapacityInfo(){
  let hab = 0, other = 0;
  for (const key in save.colony)
    for (const d of save.colony[key].districts)
      if (dDone(d)) (d.type === 'habitation' ? hab++ : other++);
  return { hab, other, limit: hab * 2, ok: other <= hab * 2 };
}
/* 月球军工前置:第一个军工区必须建在卫星上 */
function moonArsenalExists(){
  for (const key in save.colony){
    const p = planetByKey(key);
    if (!p || !p.moonOf) continue;
    for (const d of save.colony[key].districts)
      if (d.type === 'arsenal' && dDone(d)) return true;
  }
  return false;
}

function colonyState(p){
  if (!save.colony) save.colony = {};
  if (!save.colony[p.key]) save.colony[p.key] = { districts: [] };
  return save.colony[p.key];
}
function dDone(d){ return Date.now() >= d.startAt + d.dur * 1000; }
function dProg(d){ return Math.min(1, (Date.now() - d.startAt) / (d.dur * 1000)); }
function dRemain(d){ return Math.max(0, (d.startAt + d.dur * 1000 - Date.now()) / 1000); }

/* 区划在星球表面的位置:见 render.js districtPlacements(斐波那契均匀布点 + 核心落陆地) */

/* ── 环境分级与可开辟区划 ── */
function envTier(p){
  if (save.terraformed && save.terraformed[p.key]) return ENV_TIERS[2];   // 类地化 → 宜居
  for (const t of ENV_TIERS) if (p.habit < t.th) return t;
  return ENV_TIERS[ENV_TIERS.length - 1];
}
/* 返回 [type, weight] 列表:严酷仅工业/科研;艰苦不建民生;卫星军工权重大增;
   类地化后视同宜居;第一个军工区必须在卫星上 */
function allowedDistricts(p){
  const tf = save.terraformed && save.terraformed[p.key];
  let list;
  if (!tf && p.habit < 0.35){
    list = [['industry', 4], ['research', 2]];
  } else if (!tf && p.habit < 0.6){
    list = [['industry', 3], ['arsenal', 2], ['research', 2], ['trade', 1]];
  } else if (p.role === 'hab' || tf){
    list = [['habitation', 4], ['trade', 2], ['research', 2], ['industry', 1.5], ['arsenal', 1]];
  } else {
    list = [['industry', 3], ['trade', 2], ['research', 1.5], ['habitation', 1.5], ['arsenal', 1]];
  }
  if (p.moonOf){                       // 卫星 = 天然军事要冲
    const i = list.findIndex(([t]) => t === 'arsenal');
    const top = Math.max(...list.map(([,w]) => w));
    if (i >= 0) list[i][1] = top * 1.6;
    else list.push(['arsenal', top * 1.6]);
  } else if (!moonArsenalExists()){
    list = list.filter(([t]) => t !== 'arsenal');   // 首个军工区未落月,行星禁开
  }
  return list;
}
function pickDistrictType(p, st, habOnly){
  let allowed = allowedDistricts(p);
  if (habOnly) allowed = allowed.filter(([t]) => t === 'habitation');   // 居住承载触顶
  if (!allowed.length) return null;
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
    const nt = pickDistrictType(p, { districts: st.districts.filter(x => x !== d) });
    if (!nt) continue;
    d.type = nt;
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
        // 居住承载触顶时,只允许开辟民生区
        const cap = habCapacityInfo();
        const habOnly = cap.other + 1 > cap.limit;
        const nt = pickDistrictType(p, st, habOnly);
        if (nt){
          st.districts.push({
            type: nt,
            startAt: Date.now(), dur: Math.round(240 * (1 + st.districts.length * 0.4)),
            builds: [],
          });
          persistSave();
        }
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
    addInfluence(events.length * INF_FX.structure);   // 竣工产生影响力
    showToast(events[0], { sfx:'levelup', say:'Construction complete.' });
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
  const rate = (typeof rpRate === 'function') ? rpRate() : COLONY_FX.rp;
  if (dt > 0 && rate > 0)
    save.research = (save.research || 0) + rate * dt;
  save.rpAt = now;
}
function techLv(id){ return (save.tech && save.tech[id]) || 0; }

/* ── 工期队列:科技 / 升级支付后进入工期(EVE 式),影响力可加速 ── */
function queueRemain(q){ return Math.max(0, (q.startAt + q.dur * 1000 - Date.now()) / 1000); }
function queueProg(q){ return Math.min(1, (Date.now() - q.startAt) / (q.dur * 1000)); }
function accelCost(q){ return infRushCost(queueRemain(q)); }   // 超线性:大工程加速昂贵
function accelQueue(q){                  // 影响力加速 → 立即完工
  const cost = accelCost(q);
  if ((save.influence || 0) < cost) return false;
  save.influence -= cost;
  q.startAt = Date.now() - q.dur * 1000 - 1000;
  persistSave();
  return true;
}
function researchTech(id){               // 支付科研值 → 开始研发工期
  const def = TRAIN_TECHS[id];
  const lv = techLv(id);
  if (!def || lv >= def.max || save.techQueue) return false;
  const cost = techCost(id, lv + 1);
  if ((save.research || 0) < cost) return false;
  save.research -= cost;
  save.techQueue = { id, to: lv + 1, startAt: Date.now(), dur: techTime(lv + 1) };
  pushLog(`研发立项:「${def.name}」LV${lv + 1},工期 ${fmtDuration(techTime(lv + 1))}`);
  persistSave();
  return true;
}
function tickQueues(){                   // 每秒:工期完工检查 + 停靠科研星加速
  const drb = (typeof dockResearchBonus === 'function') ? dockResearchBonus() : 0;
  if (drb > 0){                          // 停靠有科研区划的星球 → 科技与工坊工期加速
    if (save.techQueue && queueRemain(save.techQueue) > 0) save.techQueue.startAt -= Math.round(drb * 1000);
    if (save.upgrade && queueRemain(save.upgrade) > 0) save.upgrade.startAt -= Math.round(drb * 1000);
  }
  const tq = save.techQueue;
  if (tq && Date.now() >= tq.startAt + tq.dur * 1000){
    if (!save.tech) save.tech = {};
    save.tech[tq.id] = tq.to;
    const name = TRAIN_TECHS[tq.id].name;
    save.techQueue = null;
    pushLog(`研发完成:「${name}」LV${save.tech[name] || ''}`.replace('LV', 'LV' + (save.tech[tq.id])));
    persistSave();
    showToast(`研发完成:<b>${name}</b> LV${save.tech[tq.id]}`, { sfx:'levelup', say:'Research complete.' });
  }
  const up = save.upgrade;
  if (up && Date.now() >= up.startAt + up.dur * 1000){
    let msg = '';
    if (up.kind === 'engine'){
      save.train.engineLv = up.to;
      msg = `引擎升级完工 → <b>LV${up.to}</b>`;
      pushLog(`引擎升级完工 → LV${up.to} · 航速 ${trainSpeed().toFixed(1)} 单位/分`);
    } else if (up.kind === 'rpcoef'){
      save.train.rpLv = up.to;
      msg = `科研主机升级完工 → <b>LV${up.to}</b>(全列科研 ×${(1 + 0.2 * up.to).toFixed(1)})`;
      pushLog(`科研主机升级完工 → LV${up.to}`);
    } else if (up.kind === 'car'){
      const car = save.train.cars[up.carIdx];
      if (car){
        car.clv = up.to;
        if (car.type === 'general' && car.wid) car.wlv = up.to;   // 通用集成机炮随级
      }
      msg = `<b>${car ? CAR_TYPES[car.type].name : '车厢'}</b> 改装完工 → LV${up.to}`;
      pushLog(`车厢改装完工 → LV${up.to}`);
    } else {
      const car = save.train.cars[up.carIdx];
      if (car){ car.wid = up.wid; car.wlv = up.to; }
      msg = `<b>${WEAPONS[up.wid].name}</b> ${up.to === 1 ? '安装完毕' : '升级至 LV' + up.to}`;
      pushLog(`${WEAPONS[up.wid].name} ${up.to === 1 ? '安装完毕' : '升级至 LV' + up.to}`);
    }
    save.upgrade = null;
    persistSave();
    showToast(msg, { sfx:'levelup', say:'Upgrade complete.' });
  }
}
/* 殖民地建设的影响力远程加速 */
function accelConstruction(pKey){
  const p = planetByKey(pKey);
  const st = colonyState(p);
  const act = activeConstruction(st);
  if (!act) return false;
  const cost = infRushCost(dRemain(act.obj));
  if ((save.influence || 0) < cost) return false;
  save.influence -= cost;
  act.obj.startAt = Date.now() - act.obj.dur * 1000 - 1000;
  pushLog(`影响力动员 —— ${p.name}「${act.label}」即刻竣工`);
  persistSave();
  return true;
}
