/* ============================================================
   星际列车 — 状态与逻辑
   养成主线:殖民地发展 → 车厢节数;资源 → 武器/引擎升级;
   远航 → 新星系资源 → 反哺殖民
   受损车厢(战斗击伤)功能失效,需消耗资源修复
   ============================================================ */

function trainCars(){ return save.train.cars; }
function carCount(){ return save.train.cars.length; }
function carSlots(){ return slotsByDev(sumLevelsAll()); }

function carOk(c){ return !c.damaged; }
function countCarType(type){ return trainCars().filter(c => c.type === type && carOk(c)).length; }
function engineDamaged(){ return !!trainCars().find(c => c.type === 'engine' && c.damaged); }

function firepower(){
  let fp = 0;
  for (const c of trainCars())
    if (c.type === 'weapon' && c.wid && carOk(c)) fp += WEAPONS[c.wid].fp * (c.wlv || 1);
  return fp;
}
function defense(){
  return 10 + countCarType('habitat') * CAR_TYPES.habitat.def + COLONY_FX.def;
}
function cargoCap(){
  // 几何成长:后期收取量必须跟上升级成本的数量级,否则流程卡死
  return Math.round(countCarType('cargo') * CAR_TYPES.cargo.cap * Math.pow(2.5, save.train.engineLv - 1) * COLONY_FX.cargo);
}
function battleHpScale(){             // 战斗中车厢耐久随引擎成长;研发:复合装甲
  return (1 + 0.35 * (save.train.engineLv - 1)) * (1 + 0.12 * techLv('armor'));
}
function collectBuff(){ return 1 + countCarType('eng') * CAR_TYPES.eng.collectBuff; }
function collectCd(){
  const base = (COLLECT_CD_BASE - countCarType('habitat') * CAR_TYPES.habitat.cdRed - COLONY_FX.cd)
             * Math.pow(0.92, techLv('logi'));               // 研发:物流调度
  return Math.max(30, Math.round(base));
}
function trainSpeed(){                      // 单位/分钟;引擎受损减半;研发:曲率精调
  return engineSpeed(save.train.engineLv) * (engineDamaged() ? 0.5 : 1) * (1 + 0.1 * techLv('warp'));
}
function damagedCars(){ return trainCars().filter(c => c.damaged); }

/* ── 星系可达性 ── */
function sysUnlockConds(sys){
  const out = [];
  const req = sys.req || {};
  if (req.engine) out.push({ met: save.train.engineLv >= req.engine, text: `列车引擎达到 LV${req.engine}` });
  if (req.civ) out.push({ met: civIndex() >= req.civ, text: `文明指数 ≥ ${req.civ}` });
  return out;
}
function sysUnlocked(sys){ return sysUnlockConds(sys).every(c => c.met); }

function travelTimeTo(sysId){            // 秒
  const d = sysDist(save.train.sys, sysId);
  return d / trainSpeed() * 60;
}

function startTravel(sysId){
  const tr = save.train;
  if (tr.status !== 'docked' || sysId === tr.sys) return false;
  if (save.pendingRaid) return false;        // 遭遇战未结束,不能离站
  const sys = sysById(sysId);
  if (!sysUnlocked(sys)) return false;
  const sec = travelTimeTo(sysId);
  tr.status = 'travel';
  tr.from = tr.sys; tr.to = sysId;
  tr.departAt = Date.now();
  tr.arriveAt = Date.now() + sec * 1000;
  pushLog(`列车自 ${sysById(tr.from).name} 启程,目的地 ${sys.name},预计航程 ${fmtDuration(sec)}${engineDamaged() ? '(引擎受损,半速航行)' : ''}`);
  persistSave();
  return true;
}
function travelProgress(){
  const tr = save.train;
  if (tr.status !== 'travel') return 0;
  return Math.min(1, (Date.now() - tr.departAt) / Math.max(1, tr.arriveAt - tr.departAt));
}

/* 抵达检查(主循环每秒调用);遭遇战不再立即结算,而是挂起交给战斗系统 */
function checkArrival(){
  const tr = save.train;
  if (tr.status !== 'travel' || Date.now() < tr.arriveAt) return null;
  tr.status = 'docked';
  tr.sys = tr.to;
  const sys = sysById(tr.sys);
  const firstVisit = !save.visited[sys.id];
  save.visited[sys.id] = true;
  let raidPending = false;
  const region = regionOf(sys);
  if (region > 0 && BOSSES[sys.id] && !save.bossKills[sys.id]){
    save.pendingRaid = { sysId: sys.id, at: Date.now(), boss: true };   // 首访 Boss 必战
    raidPending = true;
  } else if (region > 0 && sys.hazard > 0 &&
             Math.random() < Math.min(0.85, 0.3 + sys.hazard * 0.1)){   // 安全区(母星系)绝不遭遇
    save.pendingRaid = { sysId: sys.id, at: Date.now() };
    raidPending = true;
  }
  pushLog(`列车抵达 ${sys.name}${firstVisit ? '(首次探索)' : ''}${raidPending ? (save.pendingRaid.boss ? ' —— 巨大的舰影封锁了航道!' : ' —— 检测到袭击者舰队!') : ''}`);
  persistSave();
  return { sys, firstVisit, raidPending };
}

/* ── 靠站收取资源 ── */
function collectInfo(sysId){
  const planets = planetsOf(sysId).filter(p => p.role === 'res' && devLevel(p) > 0);
  let avail = 0;
  for (const p of planets) avail += resAvail(p);
  const last = save.lastCollect[sysId] || 0;
  const cdLeft = Math.max(0, collectCd() - (Date.now() - last) / 1000);
  return { planets, avail, cdLeft, cap: cargoCap() };
}
function collectSystem(sysId){
  const tr = save.train;
  if (tr.status !== 'docked' || tr.sys !== sysId) return null;
  if (save.pendingRaid) return null;         // 先打完仗再装货
  const info = collectInfo(sysId);
  if (info.cdLeft > 0 || info.avail <= 0 || info.cap <= 0) return null;
  const load = Math.min(info.cap, info.avail);
  const got = {};
  let remaining = load;
  for (const p of info.planets){
    if (remaining <= 0) break;
    const take = Math.min(resAvail(p), remaining);
    if (take <= 0) continue;
    save.taken[p.key] = (save.taken[p.key] || 0) + take;
    const gain = Math.round(take * collectBuff() * COLONY_FX.amt);
    save.treasury[p.res.key] = (save.treasury[p.res.key] || 0) + gain;
    got[p.res.key] = (got[p.res.key] || 0) + gain;
    remaining -= take;
  }
  save.lastCollect[sysId] = Date.now();
  const summary = Object.entries(got).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' · ');
  pushLog(`于 ${sysById(sysId).name} 收取资源:${summary || '0'}`);
  persistSave();
  return got;
}

/* ── 列车扩展 / 升级 / 修复 ── */
function nextCarCost(){ return CAR_COSTS[carCount() + 1] || null; }

function buyCar(type){
  if (!CAR_TYPES[type] || type === 'engine') return false;
  if (carCount() >= carSlots()) return false;
  const cost = nextCarCost();
  if (!cost || !payCost(cost)) return false;
  const car = { type };
  if (type === 'weapon'){ car.wid = null; car.wlv = 0; }
  save.train.cars.push(car);
  pushLog(`列车加挂「${CAR_TYPES[type].name}」,现编组 ${carCount()} 节`);
  persistSave();
  return true;
}

function weaponUnlocked(wid){
  const u = WEAPONS[wid].unlock;
  if (!u) return true;
  const p = planetByKey(u.planet);
  return devLevel(p) >= u.lv;
}
function installWeapon(carIdx, wid){
  const car = save.train.cars[carIdx];
  if (!car || car.type !== 'weapon' || car.wid) return false;
  if (!weaponUnlocked(wid)) return false;
  if (!payCost(weaponCost(wid, 1))) return false;
  car.wid = wid; car.wlv = 1;
  pushLog(`武器平台装备「${WEAPONS[wid].name}」LV1`);
  persistSave();
  return true;
}
function upgradeWeapon(carIdx){
  const car = save.train.cars[carIdx];
  if (!car || car.type !== 'weapon' || !car.wid || car.wlv >= WEAPON_MAXLV) return false;
  if (car.damaged) return false;
  if (!payCost(weaponCost(car.wid, car.wlv + 1))) return false;
  car.wlv++;
  pushLog(`「${WEAPONS[car.wid].name}」升级至 LV${car.wlv}`);
  persistSave();
  return true;
}
function engineCostOf(lv){           // 引擎研究所折扣
  const base = ENGINE_COSTS[lv], out = {};
  for (const k in base) out[k] = Math.round(base[k] * COLONY_FX.ecost);
  return out;
}
function upgradeEngine(){
  const lv = save.train.engineLv;
  if (lv >= ENGINE_MAXLV || engineDamaged()) return false;
  if (!payCost(engineCostOf(lv + 1))) return false;
  save.train.engineLv++;
  pushLog(`引擎升级至 LV${save.train.engineLv} · 航速 ${trainSpeed().toFixed(1)} 单位/分`);
  persistSave();
  return true;
}
function repairCarCost(car){
  const base = REPAIR_COSTS[car.type] || { metal:300 };
  const out = {};
  for (const k in base) out[k] = base[k] * save.train.engineLv;
  return out;
}
function repairCar(carIdx){
  const car = save.train.cars[carIdx];
  if (!car || !car.damaged) return false;
  if (!payCost(repairCarCost(car))) return false;
  delete car.damaged;
  pushLog(`「${CAR_TYPES[car.type].name}」修复完成,恢复运作`);
  persistSave();
  return true;
}
