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

function carEff(c){ return carEffOf(c.clv); }   // 车厢等级:每级效果 +30%
function carArmed(c){
  return (c.type === 'weapon' || c.type === 'general') && c.wid && carOk(c) && !c.paxMode;
}
function firepower(){
  let fp = 0;
  for (const c of trainCars()){
    if (!carArmed(c)) continue;
    // 通用车厢集成机炮:火力随车厢等级成长;战斗车厢 = 武器等级 × 车厢等级系数
    fp += c.type === 'general'
      ? Math.round(WEAPONS.autogun.fp * carEff(c))
      : Math.round(WEAPONS[c.wid].fp * (c.wlv || 1) * carEff(c) * (c.uw && UNIQUE_WEAPONS[c.uw] ? UNIQUE_WEAPONS[c.uw].mult : 1));
  }
  return Math.round(fp * (1 + officerFx().dmg));
}
/* ── 载客(车头 1000 / 休眠舱 4000 / 通用 500 / 改装运输 1000 / 改装战斗 100,随车厢等级成长) ── */
function carPax(c){
  if (!carOk(c)) return 0;
  if (c.type === 'engine') return CAR_TYPES.engine.pax;   // 车头乘务舱常驻载员
  if (c.type === 'general') return Math.round(CAR_TYPES.general.pax * carEff(c));   // 固定 1/4 载人
  if (c.paxMode && c.type === 'cargo') return Math.round(CAR_TYPES.cargo.pax * carEff(c));
  return 0;   // 休眠舱=火种,不载人
}
function paxCapacity(){ return trainCars().reduce((s, c) => s + carPax(c), 0); }

/* ── 科研速率:列车基础 + 星球区划(×环境系数)→ ×车头科研系数 × 停靠加成 ── */
function trainRP(){
  let rp = TRAIN_RP_BASE;
  for (const c of trainCars()){
    if (!carOk(c)) continue;
    if (c.type === 'lab') rp += CAR_TYPES.lab.rp * carEff(c);
    if (c.type === 'general') rp += CAR_TYPES.general.rp * carEff(c);
  }
  return rp;
}
function rpCoef(){ return 1 + 0.2 * (save.train.rpLv || 0); }   // 科研主机
function dockResearchBonus(){                                    // 停靠科研星加速(产出+工期)
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit()) return 0;
  const anchor = anchorageOf(tr.planet, tr.sys);
  let b = 0;
  for (const p of planetsOf(tr.sys)){
    if (anchorageOf(p.id, tr.sys) !== anchor) continue;
    const st = save.colony && save.colony[p.key];
    if (!st) continue;
    const mult = envTier(p).mult;
    for (const d of st.districts)
      if (d.type === 'research' && dDone(d)) b += DOCK_RP_PER_DISTRICT * mult;
  }
  return Math.min(DOCK_RP_CAP, b);
}
function rpRate(){
  return (1 + officerFx().rp) * ((trainRP() + COLONY_FX.rp) * rpCoef() * (1 + dockResearchBonus()) * RP_SCALE);
}
/* ── 乘员组:全车生效,一组即可维护整列(简化制) ── */
function crewTeams(){ return CREW_BASE + COLONY_FX.crew; }
function crewNeeded(){ return 1; }
function crewOk(){ return crewTeams() >= 1; }
/* ── 弹药:每门 30 发基数 +10/车厢等级,军事区停靠补满;打空后伤害减半;强武器耗弹多 ── */
function ammoMax(){
  const base = trainCars().filter(carArmed).reduce((s, c) => s + AMMO_PER_GUN + AMMO_PER_CLV * ((c.clv || 1) - 1), 0);
  return Math.round(base * (1 + officerFx().ammo));
}
function anchorHasArsenal(){
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit()) return false;
  const anchor = anchorageOf(tr.planet, tr.sys);
  for (const p of planetsOf(tr.sys)){
    if (anchorageOf(p.id, tr.sys) !== anchor) continue;
    const st = save.colony && save.colony[p.key];
    if (st && st.districts.some(d => d.type === 'arsenal' && dDone(d))) return true;
  }
  return false;
}
function resupplyAmmo(){          // 每秒由 tickUI 调用
  const max = ammoMax();
  if (save.train.ammo > max) save.train.ammo = max;
  if (save.train.ammo < max && anchorHasArsenal()){
    save.train.ammo = max;
    showToast('军事区补给完成 —— 弹药装填至满额', { sfx:'confirm', say:'Ammunition replenished.' });
    persistSave();
  }
}
function defense(){
  const habDef = trainCars().reduce((s, c) =>
    s + (c.type === 'habitat' && carOk(c) ? CAR_TYPES.habitat.def * carEff(c) : 0), 0);
  return Math.round(10 + habDef + COLONY_FX.def);
}
function cargoCap(){
  // 温和成长:大宗运输由星港-星门物流网承担,列车货舱只服务主动收取
  // 载人模式的运输车厢不运货;通用车厢兼运 1/4;均随车厢等级 +30%/级
  const units = trainCars().reduce((s, c) => {
    if (!carOk(c)) return s;
    if (c.type === 'cargo' && !c.paxMode) return s + 1 * carEff(c);
    if (c.type === 'general') return s + 0.25 * carEff(c);
    return s;
  }, 0);
  return Math.round(units * CAR_TYPES.cargo.cap * Math.pow(1.6, save.train.engineLv - 1) * COLONY_FX.cargo * (1 + officerFx().cargo));   // ×1.6/级 × 司货长
}
function battleHpScale(){             // 战斗中车厢耐久随引擎成长;研发:复合装甲
  return (1 + officerFx().hp) * (1 + 0.35 * (save.train.engineLv - 1)) * (1 + 0.12 * techLv('armor'));
}
function collectBuff(){
  return 1 + trainCars().reduce((s, c) =>
    s + (c.type === 'eng' && carOk(c) ? CAR_TYPES.eng.collectBuff * carEff(c) : 0), 0);
}
function collectCd(){
  const habRed = trainCars().reduce((s, c) =>
    s + (c.type === 'habitat' && carOk(c) ? CAR_TYPES.habitat.cdRed * carEff(c) : 0), 0);
  const base = (COLLECT_CD_BASE - habRed - COLONY_FX.cd)
             * Math.pow(0.92, techLv('logi'));               // 研发:物流调度
  return (1 - officerFx().cd) * Math.max(10, Math.round(base));
}
function trainSpeed(){                      // 单位/分钟;引擎受损减半;研发:曲率精调
  return (1 + officerFx().speed) * engineSpeed(save.train.engineLv) * (engineDamaged() ? 0.5 : 1) * (1 + 0.1 * techLv('warp'));
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
/* 星系是否已有殖民地(决定拓荒是否需要火种舱) */
function sysHasColony(sysId){ return planetsOf(sysId).some(p => save.est[p.key]); }
function seedCryoIndex(){ return save.train.cars.findIndex(c => c.type === 'cryo' && !c.damaged); }

function travelTimeTo(sysId){            // 秒
  const d = sysDist(save.train.sys, sysId);
  return d / trainSpeed() * 60;
}

/* ============================================================
   星系内停靠 — 列车泊于具体行星轨道,转移 5–30 秒
   只有停靠该星(或其卫星/母星,视作同一锚地)才能:
   建立殖民地 / 装卸移民 / 军事区补给
   ============================================================ */
function anchorageOf(pid, sysId){        // 卫星与母星共用锚地(停靠地月任一即可访问两者)
  const p = planetsOf(sysId).find(x => x.id === pid);
  return p && p.moonOf ? p.moonOf : pid;
}
function localTransit(){ return !!save.train.localTo && Date.now() < save.train.localArriveAt; }
function dockedAtPlanet(p){
  const tr = save.train;
  if (tr.status !== 'docked' || tr.sys !== p.sysId || localTransit()) return false;
  return anchorageOf(tr.planet, tr.sys) === anchorageOf(p.id, p.sysId);
}
function dockedPlanet(){
  const tr = save.train;
  return planetsOf(tr.sys).find(x => x.id === tr.planet) || null;
}
function localTravelTime(toId){          // 秒,按轨道半径差,5–30s
  const tr = save.train;
  const ps = planetsOf(tr.sys);
  const orbit = id => { const p = ps.find(x => x.id === id); if (!p) return 0; return p.moonOf ? (ps.find(h => h.id === p.moonOf) || p).orbitR : p.orbitR; };
  const d = Math.abs(orbit(tr.planet) - orbit(toId));
  return Math.min(LOCAL_T_MAX, Math.max(LOCAL_T_MIN, Math.round(LOCAL_T_MIN + d * 0.3)));
}
function startLocalTravel(toId){
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit() || save.pendingRaid) return false;
  if (toId === tr.planet || !planetsOf(tr.sys).some(x => x.id === toId)) return false;
  const sec = localTravelTime(toId);
  save.boarding = null;                  // 轨道转移打断装载
  tr.localTo = toId;
  tr.localDepartAt = Date.now();
  tr.localArriveAt = Date.now() + sec * 1000;
  persistSave();
  return sec;
}
function checkLocalArrival(){            // tickUI 每秒调用
  const tr = save.train;
  if (!tr.localTo || Date.now() < tr.localArriveAt) return null;
  tr.planet = tr.localTo;
  tr.localTo = null; tr.localArriveAt = 0;
  persistSave();
  return dockedPlanet();
}

/* ============================================================
   人口迁移 — 每颗居住星维护"可迁移人口池"
   池上限 = 当前人口 20%;每 10 分钟补充 当前人口 1%
   ============================================================ */
function migInfo(p){
  if (!save.mig) save.mig = {};
  const pop = Math.floor(popOf(p));
  const cap = Math.floor(pop * MIG_CAP_RATIO);
  if (!save.mig[p.key]) save.mig[p.key] = { pool: cap, at: Date.now() };   // 初始即满池
  const st = save.mig[p.key];
  const steps = Math.floor((Date.now() - st.at) / MIG_STEP_MS);
  if (steps > 0){
    st.pool = Math.min(cap, Math.floor(st.pool + pop * MIG_RATE_RATIO * steps));
    st.at += steps * MIG_STEP_MS;
  }
  st.pool = Math.min(st.pool, cap);
  return { pool: st.pool, cap, nextIn: Math.max(0, MIG_STEP_MS - (Date.now() - st.at)) / 1000 };
}
function canEmigrate(p){                 // 输出移民门槛:LV2+ 且建有民生区(防止刚移民就被装走)
  if (p.role !== 'hab' || devLevel(p) < 2) return false;
  const st = save.colony && save.colony[p.key];
  return !!(st && st.districts.some(d => d.type === 'habitation' && dDone(d)));
}
/* 装载耗时:基础 5 秒,每节完好货运车厢 -1s,最小 1s */
function boardingSec(){ return Math.max(1, 5 - countCarType('cargo') - officerFx().boardSec); }
function startBoarding(p){
  if (save.boarding) return 0;
  if (!dockedAtPlanet(p) || !canEmigrate(p)) return 0;
  const info = migInfo(p);
  if (info.pool <= 0 || paxCapacity() - save.train.pax <= 0) return 0;
  const sec = boardingSec();
  save.boarding = { key: p.key, at: Date.now(), dur: sec };
  persistSave();
  return sec;
}
function boardingTick(){                 // 每秒由 tickUI 调用:装载完成 → 实际登车
  const b = save.boarding;
  if (!b) return;
  if (Date.now() < b.at + b.dur * 1000) return;
  save.boarding = null;
  const p = planetByKey(b.key);
  const n = p ? boardMigrants(p) : 0;
  if (n > 0) showToast(`<b>${fmtNum(n)}</b> 名移民完成登车(随车 ${fmtNum(save.train.pax)} / ${fmtNum(paxCapacity())})`, { sfx:'confirm', say:'Boarding complete.' });
  if (typeof renderDevBlock === 'function' && panelPlanet && panelPlanet.key === b.key) renderDevBlock();
  persistSave();
}
function boardMigrants(p){               // 装载移民(需停靠该星 + 满足输出门槛)
  if (!dockedAtPlanet(p) || !canEmigrate(p)) return 0;
  const info = migInfo(p);
  const space = paxCapacity() - save.train.pax;
  const take = Math.min(info.pool, space, Math.floor(popOf(p)));
  if (take <= 0) return 0;
  save.mig[p.key].pool -= take;
  save.pop[p.key] = Math.max(0, (save.pop[p.key] || 0) - take);
  save.train.pax += take;
  pushLog(`${p.name} 登车移民 ${fmtNum(take)} 人(随车 ${fmtNum(save.train.pax)})`);
  persistSave();
  return take;
}
function unloadMigrants(p){              // 卸载移民(需停靠该星,已殖民的居住星)
  if (!dockedAtPlanet(p) || p.role !== 'hab' || !save.est[p.key]) return 0;
  const move = save.train.pax;
  if (move <= 0) return 0;
  save.pop[p.key] = (save.pop[p.key] || 0) + move;
  if (!save.settled) save.settled = {};
  save.settled[p.key] = (save.settled[p.key] || 0) + move;   // 落户驱动居住星开发
  save.train.pax = 0;
  addInfluence(Math.ceil(move / 1000) * INF_FX.settlePer1k);   // 安置移民影响力
  pushLog(`${fmtNum(move)} 名移民在 ${p.name} 落户`);
  persistSave();
  return move;
}

function startTravel(sysId){
  const tr = save.train;
  if (tr.status !== 'docked' || sysId === tr.sys) return false;
  if (save.pendingRaid || localTransit()) return false;   // 遭遇战/星内转移中不能跨星系启程
  if (!crewOk()) return false;                            // 乘员不足半数,无法维护运行
  const sys = sysById(sysId);
  if (!sysUnlocked(sys)) return false;
  const sec = travelTimeTo(sysId);
  tr.status = 'travel';
  save.boarding = null;                  // 启程打断装载
  tr.from = tr.sys; tr.to = sysId;
  tr.departAt = Date.now();
  tr.arriveAt = Date.now() + sec * 1000;
  const rk = [tr.from, tr.to].sort().join('|');           // 航线履历
  save.routes[rk] = (save.routes[rk] || 0) + 1;
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
  tr.planet = (planetsOf(tr.sys)[0] || {}).id;   // 抵达后泊于最内侧行星
  tr.localTo = null; tr.localArriveAt = 0;
  const sys = sysById(tr.sys);
  const firstVisit = !save.visited[sys.id];
  save.visited[sys.id] = true;
  // 首访新星系:15% 概率随机招募船官(漂流者/落难者)
  if (firstVisit && Math.random() < 0.15){
    const pool = OFFICER_RANDOM_POOL.filter(id => !save.officers.owned.includes(id));
    if (pool.length) unlockOfficer(pool[Math.floor(Math.random() * pool.length)], '新星系遇到的漂流者');
  }
  if (firstVisit) addInfluence(INF_FX.firstVisit);   // 首探影响力
  if (save.scar && save.scar.idx < SCAR_STORY.length) save.scar.pending = true;   // 跃迁解锁《地疤》下一段
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

/* ── 货舱(实体载货):收取 → 货舱;停靠殖民星卸货补给 / 星港入库金库 ── */
function holdOf(){ if (!save.train.hold) save.train.hold = {}; return save.train.hold; }
function holdTotal(){ const h = holdOf(); let s = 0; for (const k in h) s += h[k]; return s; }
function holdSpace(){ return Math.max(0, cargoCap() - holdTotal()); }

/* ── 靠站收取资源(从资源星本地仓装入货舱) ── */
function collectInfo(sysId){
  const planets = planetsOf(sysId).filter(p => p.role === 'res' && devLevel(p) > 0);
  let avail = 0;
  for (const p of planets) avail += resAvail(p);
  const last = save.lastCollect[sysId] || 0;
  const cdLeft = Math.max(0, collectCd() - (Date.now() - last) / 1000);
  return { planets, avail, cdLeft, cap: cargoCap(), space: holdSpace() };
}
function collectSystem(sysId){
  const tr = save.train;
  if (tr.status !== 'docked' || tr.sys !== sysId) return null;
  if (save.pendingRaid) return null;         // 先打完仗再装货
  const info = collectInfo(sysId);
  if (info.cdLeft > 0 || info.avail <= 0 || info.space <= 0) return null;
  const hold = holdOf();
  const got = {};
  let remaining = info.space;
  for (const p of info.planets){
    if (remaining <= 0) break;
    const take = Math.min(resAvail(p), remaining);
    if (take <= 0) continue;
    pstoreOf(p.key)[p.res.key] -= take;
    if (!save.exported) save.exported = {};
    save.exported[p.key] = (save.exported[p.key] || 0) + take;   // 出口驱动资源星开发
    const gain = Math.round(take * collectBuff() * COLONY_FX.amt);   // 工程舱现场提纯
    hold[p.res.key] = (hold[p.res.key] || 0) + gain;
    got[p.res.key] = (got[p.res.key] || 0) + gain;
    remaining -= take;
  }
  save.lastCollect[sysId] = Date.now();
  addInfluence(INF_FX.collect);                      // 物流运转影响力
  const summary = Object.entries(got).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' · ');
  pushLog(`于 ${sysById(sysId).name} 收取资源入货舱:${summary || '0'}`);
  persistSave();
  return got;
}
/* 卸货补给:货舱 → 停靠殖民星本地仓(只卸消耗品:消费品/生命支持/能源) */
function unloadSupply(pKey){
  const p = planetByKey(pKey);
  if (!p || !save.est[pKey] || !dockedAtPlanet(p) || save.pendingRaid) return null;
  const hold = holdOf();
  const st = pstoreOf(pKey);
  const moved = {};
  for (const k of ['chem','ice','he3']){
    const q = Math.floor(hold[k] || 0);
    if (q <= 0) continue;
    st[k] = (st[k] || 0) + q;
    moved[k] = q;
    delete hold[k];
  }
  if (!Object.keys(moved).length) return null;
  addInfluence(INF_FX.collect);
  const summary = Object.entries(moved).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' · ');
  pushLog(`${p.name} 补给卸货:${summary}`);
  persistSave();
  return moved;
}
/* 入库金库:货舱 → 金库(需停靠锚地有建成星港,或母港) */
function canBankHere(){
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit() || save.pendingRaid) return false;
  const anchor = anchorageOf(tr.planet, tr.sys);
  return planetsOf(tr.sys).some(p => anchorageOf(p.id, tr.sys) === anchor
    && (portDone(p.key) || p.key === save.homePort));
}
function bankHold(){
  if (!canBankHere()) return null;
  const hold = holdOf();
  const moved = {};
  for (const k in hold){
    const q = Math.floor(hold[k] || 0);
    if (q <= 0) continue;
    save.treasury[k] = (save.treasury[k] || 0) + q;
    moved[k] = q;
  }
  save.train.hold = {};
  if (!Object.keys(moved).length) return null;
  if (!save.flags) save.flags = {};
  save.flags.banked = 1;                     // 新手航路:首次入库
  const summary = Object.entries(moved).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' · ');
  pushLog(`货舱入库金库:${summary}`);
  persistSave();
  return moved;
}

/* ── 列车扩展 / 升级 / 修复 ── */
function nextCarCost(){ return CAR_COSTS[carCount() + 1] || null; }

function carUnlocked(type){ return save.train.engineLv >= (CAR_UNLOCK[type] || 1); }
function buyCar(type){
  if (!CAR_TYPES[type] || type === 'engine' || !carUnlocked(type)) return false;
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
  if (!car || car.wid || save.upgrade) return false;
  if (car.type === 'general' && wid !== 'autogun') return false;       // 通用:仅集成机关炮
  if (car.type === 'weapon' && wid === 'autogun') return false;        // 战斗车厢:双联/激光/导弹
  if (car.type !== 'weapon' && car.type !== 'general') return false;
  if (!weaponUnlocked(wid)) return false;
  if (!payCost(weaponCost(wid, 1))) return false;
  save.upgrade = { kind:'weapon', carIdx, wid, to:1, startAt: Date.now(), dur: weaponTime(1) };
  pushLog(`「${WEAPONS[wid].name}」开始安装,工期 ${fmtDuration(weaponTime(1))}`);
  persistSave();
  return true;
}

/* ── 车厢升级(全类型 5 级,每级 +30%,工期制) ── */
/* ── 车头科研主机升级 ── */
function upgradeRpcoef(){
  const lv = save.train.rpLv || 0;
  if (lv >= RPCOEF_MAX || save.upgrade) return false;
  if (!payCost(rpcoefCost(lv + 1))) return false;
  save.upgrade = { kind:'rpcoef', to: lv + 1, startAt: Date.now(), dur: rpcoefTime(lv + 1) };
  pushLog(`科研主机升级开工 → LV${lv + 1},工期 ${fmtDuration(rpcoefTime(lv + 1))}`);
  persistSave();
  return true;
}

/* ── 车厢替换与车厢库:仅「有工业区划的类地行星」可施工,旧车厢存入该星 ── */
function refitPlanet(){                  // 当前可施工的星球(锚地内)
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit()) return null;
  const anchor = anchorageOf(tr.planet, tr.sys);
  for (const p of planetsOf(tr.sys)){
    if (anchorageOf(p.id, tr.sys) !== anchor) continue;
    if (planetBand(p) !== 'terra') continue;
    const st = save.colony && save.colony[p.key];
    if (st && st.districts.some(d => d.type === 'industry' && dDone(d))) return p;
  }
  return null;
}
/* ── 车厢科技:类型等级(研发后全列生效) ── */
function carTechLv(type){ return (save.carTech && save.carTech[type]) || 1; }
function startCarResearch(type){           // 研发下一级:消耗科研值,走研发槽
  if (!CAR_TYPES[type] || type === 'engine' || !carUnlocked(type)) return false;
  const lv = carTechLv(type);
  if (lv >= CAR_MAXLV || save.techQueue) return false;
  const cost = carTechCost(lv + 1);
  if ((save.research || 0) < cost) return false;
  save.research -= cost;
  save.techQueue = { id: 'car:' + type, to: lv + 1, startAt: Date.now(), dur: carTechTime(lv + 1) };
  pushLog(`改装方案研发立项:「${CAR_TYPES[type].name}」LV${lv + 1},工期 ${fmtDuration(carTechTime(lv + 1))}`);
  persistSave();
  return true;
}
function applyCarTech(type, to){           // 研发完成:类型定级 + 现役/库存全部拉平(只升不降)
  if (!save.carTech) save.carTech = {};
  save.carTech[type] = to;
  for (const c of save.train.cars){
    if (c.type !== type) continue;
    c.clv = Math.max(c.clv || 1, to);
    if (c.type === 'general' && c.wid) c.wlv = c.clv;
  }
  if (save.depot) for (const key in save.depot)
    for (const c of save.depot[key]){
      if (c.type !== type) continue;
      c.clv = Math.max(c.clv || 1, to);
      if (c.type === 'general' && c.wid) c.wlv = c.clv;
    }
}
function buildToDepot(type, lv){           // 建造车厢入库(可选等级 ≤ 类型科技;高级车贵且工期长)
  const p = refitPlanet();
  if (!p || !CAR_TYPES[type] || type === 'engine' || !carUnlocked(type)) return false;
  if (save.upgrade) return false;
  lv = Math.max(1, Math.min(lv || 1, carTechLv(type)));
  if (!payCost(carBuildCost(type, lv))) return false;
  save.upgrade = { kind:'build', carType: type, lv, planetKey: p.key, startAt: Date.now(), dur: carBuildTime(lv) };
  pushLog(`${p.name} 车厢工坊开工:建造「${CAR_TYPES[type].name}」LV${lv},工期 ${fmtDuration(carBuildTime(lv))}`);
  persistSave();
  return true;
}
function replaceCar(carIdx, depotIdx){     // 替换 = 与车厢库现成车厢交换(没建造的先建造)
  const car = save.train.cars[carIdx];
  const p = refitPlanet();
  if (!car || car.type === 'engine' || !p) return false;
  const list = save.depot && save.depot[p.key];
  const nc = list && list[depotIdx];
  if (!nc || save.upgrade || save.train.pax > paxCapacity() - carPax(car)) return false;
  if (!payCost(refitCost(carCount()))) return false;
  list.splice(depotIdx, 1);
  if (car.uw){ save.armory.push(car.uw); pushLog(`${UNIQUE_WEAPONS[car.uw].name} 自动拆下回武器库(具名武器不随车入库)`); delete car.uw; }
  list.push({ ...car });                   // 旧车入库,库存车上线(基础武器随车保存)
  save.train.cars[carIdx] = nc;
  pushLog(`于 ${p.name} 完成车厢替换:「${CAR_TYPES[car.type].name}」入库,换装「${CAR_TYPES[nc.type].name}」LV${nc.clv || 1}`);
  persistSave();
  return true;
}
function recoupleCar(planetKey, depotIdx){             // 重新挂载库存车厢(免费,需空位)
  const p = planetByKey(planetKey);
  const list = save.depot && save.depot[planetKey];
  if (!p || !list || !list[depotIdx] || !dockedAtPlanet(p)) return false;
  if (carCount() >= carSlots()) return false;
  save.train.cars.push(list.splice(depotIdx, 1)[0]);
  pushLog(`自 ${p.name} 车厢库重新挂载「${CAR_TYPES[save.train.cars[carCount()-1].type].name}」`);
  persistSave();
  return true;
}
function togglePaxMode(carIdx){          // 仅运输车厢:载货 ⇄ 载人
  const car = save.train.cars[carIdx];
  if (!car || car.type !== 'cargo') return false;
  if (car.paxMode && save.train.pax > paxCapacity() - CAR_TYPES.cargo.pax) return false;   // 乘客占用中不可改回
  car.paxMode = !car.paxMode;
  pushLog(`「${CAR_TYPES[car.type].name}」${car.paxMode ? '改装为载人模式' : '恢复原始用途'}`);
  persistSave();
  return true;
}
function upgradeWeapon(carIdx){
  const car = save.train.cars[carIdx];
  if (!car || (car.type !== 'weapon' && car.type !== 'general') || !car.wid || car.wlv >= WEAPON_MAXLV) return false;
  if (car.damaged || save.upgrade) return false;
  if (!payCost(weaponCost(car.wid, car.wlv + 1))) return false;
  save.upgrade = { kind:'weapon', carIdx, wid: car.wid, to: car.wlv + 1, startAt: Date.now(), dur: weaponTime(car.wlv + 1) };
  pushLog(`「${WEAPONS[car.wid].name}」升级开工 → LV${car.wlv + 1},工期 ${fmtDuration(weaponTime(car.wlv + 1))}`);
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
  if (lv >= ENGINE_MAXLV || engineDamaged() || save.upgrade) return false;
  if (!payCost(engineCostOf(lv + 1))) return false;
  save.upgrade = { kind:'engine', to: lv + 1, startAt: Date.now(), dur: engineTime(lv + 1) };
  pushLog(`引擎升级开工 → LV${lv + 1},工期 ${fmtDuration(engineTime(lv + 1))}`);
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


/* ── 具名武器:装备/卸下(战利品即插即用,非战斗时随时可换) ── */
function equipUnique(carIdx, uid){
  const car = save.train.cars[carIdx];
  const uw = UNIQUE_WEAPONS[uid];
  if (!car || car.type !== 'weapon' || car.paxMode || car.damaged || !uw) return false;
  const i = save.armory.indexOf(uid);
  if (i < 0) return false;
  save.armory.splice(i, 1);
  if (car.uw) save.armory.push(car.uw);          // 原具名武器回库
  car.uw = uid;
  car.wid = uw.base;                              // 炮架切到对应基座
  if (!car.wlv) car.wlv = 1;
  pushLog(`${uw.name} 装上战斗车厢 —— 火力 ×${uw.mult}`);
  persistSave();
  return true;
}
function unequipUnique(carIdx){
  const car = save.train.cars[carIdx];
  if (!car || !car.uw) return false;
  save.armory.push(car.uw);
  pushLog(`${UNIQUE_WEAPONS[car.uw].name} 拆下入库 —— 普通炮架保留`);
  delete car.uw;
  persistSave();
  return true;
}
