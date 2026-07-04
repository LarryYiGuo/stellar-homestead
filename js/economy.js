/* ============================================================
   经济模型 v4 — 「物流驱动 × 殖民自生长」
   开发度 = 建成区划/建筑 + 人口里程碑 + 出口/落户(不再随时间)
   人口 = 显式状态,逻辑斯谛增长,吃消费品/生命支持
   产出 → 本地仓(pstore);消耗 ← 本地仓;缺口 = 物流需求
   ============================================================ */

/* ── 开发度:全部来自玩家可影响的量 ── */
function popTier(p){                     // 已达成的人口里程碑数(消耗/开发共用)
  const pop = popOf(p);
  let t = 0;
  for (let i = 1; i < POP_MILESTONES.length; i++) if (pop >= POP_MILESTONES[i]) t = i;
  return t;
}
function devPoints(p){
  if (!save.est[p.key]) return -1;
  const st = save.colony && save.colony[p.key];
  let pts = 0;
  if (st) for (const d of st.districts){
    if (dDone(d)) pts += DEV_PER_DISTRICT;
    for (const b of d.builds) if (dDone(b)) pts += DEV_PER_BUILDING;
  }
  if (p.role === 'hab'){
    pts += popTier(p) * DEV_PER_POP_TIER;
    const settled = (save.settled && save.settled[p.key]) || 0;
    pts += SETTLE_DEV_K * Math.log2(1 + settled / SETTLE_DEV_BASE);
  } else {
    const exported = (save.exported && save.exported[p.key]) || 0;
    pts += EXPORT_DEV_K * Math.log2(1 + exported / EXPORT_DEV_BASE);
  }
  return pts;
}
function devLevel(p){
  const pts = devPoints(p);
  if (pts < 0) return 0;
  let lv = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (pts >= LEVELS[i].th) lv = i;
  return lv;
}
function devProgress(p){
  const pts = devPoints(p), lv = devLevel(p);
  if (pts < 0) return 0;
  if (lv >= MAX_LEVEL) return 1;
  const a = LEVELS[lv].th, b = LEVELS[lv+1].th;
  return Math.min(1, (pts - a) / (b - a));
}
function devNorm(p){                    // 0~1,驱动夜面灯光强度
  const lv = devLevel(p);
  if (lv === 0) return 0;
  return (lv - 1 + devProgress(p)) / MAX_LEVEL + 0.12;
}

/* ── 解锁条件 ──
   硬条件(剧情/等级等)决定"🔒未解锁";满足后即显示"可建立",
   后勤条件(停靠/移民/承载)只影响建立按钮 */
function hardCondList(p){
  return (p.unlock || []).map(c => {
    if (c.story !== undefined)
      return { met: save.story && save.story.idx >= c.story, text: `完成主线「${STORY[c.story-1].title}」章节` };
    if (c.planetLv){
      const t = planetsOf(p.sysId).find(x => x.id === c.planetLv.id);
      return { met: devLevel(t) >= c.planetLv.lv, text: `${t.name} 达到「${lvName(t, c.planetLv.lv)}」` };
    }
    if (c.sumRole)
      return { met: sumLevels(c.sumRole.role) >= c.sumRole.lv, text: `${c.sumRole.role==='hab'?'居住':'资源'}型星球等级和 ≥ ${c.sumRole.lv}` };
    if (c.est){
      const t = planetsOf(p.sysId).find(x => x.id === c.est);
      return { met: !!save.est[t.key], text: `${t.name} 已建立前哨` };
    }
    return { met:true, text:'' };
  });
}
function condList(p){
  const conds = hardCondList(p);
  conds.push({
    met: dockedAtPlanet(p),
    text: '星际列车停靠本星轨道(卫星/母星泊位通用)',
  });
  conds.push({
    met: save.train.pax >= ESTABLISH_COLONISTS,
    text: `随车移民 ≥ ${fmtNum(ESTABLISH_COLONISTS)}(当前 ${fmtNum(save.train.pax)})`,
  });
  return conds;
}
function isUnlocked(p){ return condList(p).every(c => c.met); }
function hardUnlocked(p){ return hardCondList(p).every(c => c.met); }   // 仅差后勤 → "可建立"

/* ── 协同加成(全银河) ── */
function sumLevels(role){
  let s = 0;
  for (const p of allPlanets()) if (p.role === role) s += devLevel(p);
  return s;
}
function sumLevelsAll(){
  let s = 0;
  for (const p of allPlanets()) s += devLevel(p);
  return s;
}
/* 劳动力红利:全银河总人口 → 全资源星产能(对数增长,封顶 ×1.45;5 秒缓存防热路径重算) */
let _wfAt = 0, _wfVal = 1;
function workforceBuff(){
  if (Date.now() - _wfAt > 5000){
    _wfAt = Date.now();
    _wfVal = Math.min(1.45, 1 + 0.06 * Math.log10(1 + totalPop() / 1e4));
  }
  return _wfVal;
}
function capBuff(){ return Math.min(1.6, 1 + 0.02 * sumLevels('res')); }   // 资源体系反哺承载
function rateBuff(){ return 1 + 0.03 * sumLevels('hab'); }                 // 居住体系反哺产能
/* 剧情《来自地球的歌》的人口/产率加成仅作用于垦曦全系(初始星系) */
function storyCap(p){ return p.sysId === 'kenxi' && save.story ? save.story.buffs.cap : 1; }
function storyRate(p){ return p.sysId === 'kenxi' && save.story ? save.story.buffs.rate : 1; }

/* ── 人口:显式状态 + 承载 ── */
function popOf(p){
  if (p.role !== 'hab') return 0;
  return (save.pop && save.pop[p.key]) || 0;
}
function habDistrictCount(p){
  const st = save.colony && save.colony[p.key];
  let n = 0;
  if (st) for (const d of st.districts) if (d.type === 'habitation' && dDone(d)) n++;
  return n;
}
function popCapOf(p){
  if (p.role !== 'hab' || !save.est[p.key]) return 0;
  const cs = p.capScale || 0.3;
  return (POP_CAP_BASE + POP_CAP_PER_HAB * habDistrictCount(p)) * cs
       * colonyCap(p) * capBuff() * storyCap(p);
}
/* 人口增长率(/分,含全部修正;供 tick 与 UI 共用) */
function popGrowthInfo(p){
  const pop = popOf(p), cap = popCapOf(p);
  if (pop <= 0 || cap <= 0) return { rate:0, mults:[], blocked:'' };
  const sh = shortOf(p);
  if (sh.chem) return { rate:0, mults:[], blocked:'消费品断供(化合物)' };
  if (sh.ice)  return { rate: -pop * 0.005, mults:[], blocked:'生命支持断供(水冰)' };
  const mults = [];
  let m = p.habit;
  mults.push(['宜居度', p.habit]);
  const st = pstoreOf(p.key);
  if ((st.chem || 0) > consumptionOf(p).chem * 30){ m *= FOOD_SURPLUS_MULT; mults.push(['物资盈余', FOOD_SURPLUS_MULT]); }
  const dev = 1 + officerFx().dev;
  if (dev > 1){ m *= dev; mults.push(['生态学家', dev]); }
  const logistic = Math.max(-0.5, 1 - pop / cap);
  return { rate: pop * POP_GROWTH_PER_MIN * m * logistic, mults, blocked:'' };
}

/* ── 本地仓与收支 ── */
function pstoreOf(key){
  if (!save.pstore) save.pstore = {};
  if (!save.pstore[key]) save.pstore[key] = {};
  return save.pstore[key];
}
function tradeDistrictCount(p){
  const st = save.colony && save.colony[p.key];
  let n = 0;
  if (st) for (const d of st.districts) if (d.type === 'trade' && dDone(d)) n++;
  return n;
}
function storeCapOf(p){ return STORE_CAP_BASE + STORE_CAP_PER_TRADE * tradeDistrictCount(p); }
function poweredDistrictCount(p){        // 需能源的区划(工/研/军),首座自供
  const st = save.colony && save.colony[p.key];
  let n = 0;
  if (st) for (const d of st.districts)
    if (dDone(d) && (d.type === 'industry' || d.type === 'research' || d.type === 'arsenal')) n++;
  return Math.max(0, n - 1);
}
/* 每分钟消耗表:消费品(化合物)/ 生命支持(水冰)/ 区划能源(氦-3) */
function consumptionOf(p){
  const out = { chem:0, ice:0, he3:0 };
  if (!save.est[p.key]) return out;
  if (p.role === 'hab'){
    const t = popTier(p);
    if (t > 0){
      const base = CONSUME_CHEM_K * Math.pow(t, CONSUME_POW);
      out.chem = base;
      if (p.habit < CONSUME_ICE_HABIT) out.ice = base * (CONSUME_ICE_HABIT - p.habit) * 3;
    }
  }
  out.he3 = CONSUME_HE3_PER_DISTRICT * poweredDistrictCount(p);
  return out;
}
function shortOf(p){ return (save.short && save.short[p.key]) || {}; }
function shortageMult(p){                // 能源/生命支持缺口 → 本星产出减半
  const sh = shortOf(p);
  return (sh.he3 || sh.ice) ? 0.5 : 1;
}

/* ── 资源星产出(/分)── */
function resRateOf(p){
  if (p.role !== 'res' || !save.est[p.key]) return 0;
  return RES_BASE_PER_MIN * p.res.rich * resRegionMult(p) * colonyProd(p) * moonPortMult(p)
       * rateBuff() * workforceBuff() * storyRate(p) * shortageMult(p);
}
function resAvail(p){                    // 本地仓内本星特产待运量
  if (p.role !== 'res') return 0;
  return Math.floor(pstoreOf(p.key)[p.res.key] || 0);
}

/* ── 经济主循环:生产 → 消耗 → 人口(时间戳积分,离线封顶) ── */
function economyTick(){
  const now = Date.now();
  if (!save.ecoAt) save.ecoAt = now;
  let dt = (now - save.ecoAt) / 1000;
  if (dt <= 0) return;
  save.ecoAt = now;
  let eff = 1;
  if (dt > 120){ dt = Math.min(dt, OFFLINE_CAP_SEC); eff = OFFLINE_EFF; }   // 离线:8h 封顶,效率减半
  if (!save.short) save.short = {};
  while (dt > 0){
    const step = Math.min(dt, 600);      // 分段积分,离线也遵守仓储/缺口
    dt -= step;
    const min = step / 60 * eff;
    for (const p of allPlanets()){
      if (!save.est[p.key]) continue;
      const st = pstoreOf(p.key);
      // ① 生产:特产入本地仓(受仓储上限)
      if (p.role === 'res'){
        const cap = storeCapOf(p);
        const k = p.res.key;
        st[k] = Math.min(cap, (st[k] || 0) + resRateOf(p) * min);
      }
      // ② 消耗:从本地仓扣,记录缺口
      const need = consumptionOf(p);
      const sh = {};
      for (const k of ['chem','ice','he3']){
        if (need[k] <= 0) continue;
        const want = need[k] * min;
        const got = Math.min(want, st[k] || 0);
        st[k] = (st[k] || 0) - got;
        if (got < want - 1e-9) sh[k] = 1;
      }
      save.short[p.key] = sh;
      // ③ 人口增长
      if (p.role === 'hab'){
        const g = popGrowthInfo(p);
        if (g.rate !== 0){
          save.pop[p.key] = Math.max(0, (save.pop[p.key] || 0) + g.rate * min);
        }
      }
    }
  }
}

function totalPop(){ let s=0; for (const p of allPlanets()) s += popOf(p); return s; }
function totalRes(){                     // 文明指数口径:金库 + 全银河仓储 + 枢纽
  let s = 0;
  for (const k in save.treasury) s += save.treasury[k] || 0;
  if (save.pstore) for (const key in save.pstore)
    for (const k in save.pstore[key]) s += save.pstore[key][k] || 0;
  if (save.gates) for (const sid in save.gates)
    for (const k in (save.gates[sid].store || {})) s += save.gates[sid].store[k] || 0;
  return s;
}
function devCountAll(){ let c=0; for (const p of allPlanets()) if (devLevel(p) > 0) c++; return c; }

/* 文明指数 = log10(总人口) + log10(资源储量) + 协同 + 剧情/建筑 */
function civIndex(){
  return Math.log10(1 + totalPop()) + Math.log10(1 + totalRes())
       + 0.0625 * Math.min(sumLevels('hab'), sumLevels('res'))
       + (save.story ? save.story.buffs.civ : 0)
       + (typeof COLONY_FX !== 'undefined' ? COLONY_FX.civ : 0);
}
function civTier(){
  const ci = civIndex();
  let t = CIV_TIERS[0][1];
  for (const [th, name] of CIV_TIERS) if (ci >= th) t = name;
  return t;
}

/* ── 金库(+ 星门枢纽仓) ── */
function hubReachable(){                 // 列车停靠母港星系、且该锚地有星港 → 可调用星门枢纽仓
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit()) return false;
  const homeSys = (save.homePort || 'kenxi/canglan').split('/')[0];
  if (tr.sys !== homeSys) return false;
  const g = save.gates[homeSys];
  if (!g || Date.now() < g.at + g.dur * 1000) return false;
  const anchor = anchorageOf(tr.planet, tr.sys);
  return planetsOf(tr.sys).some(p => anchorageOf(p.id, tr.sys) === anchor && portDone(p.key));
}
function availOf(k){                      // 金库 + (可达时)枢纽仓
  return (save.treasury[k] || 0) + (hubReachable() ? ((save.gates[(save.homePort||'kenxi/canglan').split('/')[0]].store || {})[k] || 0) : 0);
}
function canAfford(cost){ for (const k in cost) if (availOf(k) < cost[k]) return false; return true; }
function payCost(cost){
  if (!canAfford(cost)) return false;
  const hub = hubReachable() ? save.gates[(save.homePort||'kenxi/canglan').split('/')[0]] : null;
  for (const k in cost){
    let need = cost[k];
    const fromT = Math.min(need, save.treasury[k] || 0);
    save.treasury[k] -= fromT; need -= fromT;
    if (need > 0 && hub){ hub.store[k] = Math.max(0, (hub.store[k] || 0) - need); }
  }
  persistSave();
  return true;
}
function costHtml(cost){
  return Object.entries(cost).map(([k, v]) => {
    const ok = availOf(k) >= v;          // 红绿与按钮一致:金库 + 可达枢纽仓
    return `<span class="${ok?'ok':'no'}">${RESOURCES[k].name} ${fmtNum(v)}</span>`;
  }).join('<br>');
}
