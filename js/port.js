/* ============================================================
   星港经济 — 星港(独立建筑)/ 贸易线 / 自动航运 / 资源仓 /
   人口资源加速 / 影响力收入 / 母港
   ============================================================ */

/* ── 星港(每星一座,不占区划) ── */
function portState(key){ return save.starport && save.starport[key]; }
function portDone(key){
  const st = portState(key);
  return !!st && Date.now() >= st.startAt + st.dur * 1000;
}
function portBuilding(key){
  const st = portState(key);
  return !!st && !portDone(key);
}
function starportCount(){ return Object.keys(save.starport || {}).length; }
function buildStarport(p){
  if (!save.est[p.key] || devLevel(p) < 2 || portState(p.key)) return false;
  if (!payCost(starportCost(starportCount() + 1))) return false;
  if (!save.starport) save.starport = {};
  save.starport[p.key] = { startAt: Date.now(), dur: STARPORT_TIME };
  pushLog(`${p.name} 星港开工,工期 ${fmtDuration(STARPORT_TIME)}`);
  persistSave();
  return true;
}

/* ── 贸易线(同星系、两端均有星港) ── */
function lineCapacityOf(p){          // 容量 = 其他区划/3 + 商贸区划(星港自带 1 泊位保底)
  const st = save.colony && save.colony[p.key];
  let trade = 0, other = 0;
  if (st) for (const d of st.districts) if (dDone(d)) (d.type === 'trade' ? trade++ : other++);
  return Math.max(1, Math.floor(other / 3) + trade);
}
function linesAt(key){ return (save.lines || []).filter(l => l.a === key || l.b === key); }
function lineExists(a, b){ return (save.lines || []).some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a)); }
function lineTargets(p){             // 可建线的同星系对象
  return planetsOf(p.sysId).filter(o =>
    o.key !== p.key && portDone(o.key) && !lineExists(p.key, o.key)
    && linesAt(o.key).length < lineCapacityOf(o));
}
function defaultSend(p){
  if (p.role === 'res') return p.res.key;
  if (p.role === 'hab') return 'pax';
  return 'none';
}
function buildLine(aKey, bKey){
  const a = planetByKey(aKey), b = planetByKey(bKey);
  if (!a || !b || a.sysId !== b.sysId) return false;
  if (!portDone(aKey) || !portDone(bKey) || lineExists(aKey, bKey)) return false;
  if (linesAt(aKey).length >= lineCapacityOf(a) || linesAt(bKey).length >= lineCapacityOf(b)) return false;
  if (!payCost(LINE_COST)) return false;
  if (!save.lines) save.lines = [];
  save.lines.push({ a: aKey, b: bKey, lv: 1, aSend: defaultSend(a), bSend: defaultSend(b), on: false, t0: 0, settled: 0 });
  pushLog(`贸易线开通:${a.name} ⇄ ${b.name}`);
  persistSave();
  return true;
}
function planetTravelSec(aKey, bKey){     // 与列车星内转移同源的距离时间
  const a = planetByKey(aKey), b = planetByKey(bKey);
  const ps = planetsOf(a.sysId);
  const orbit = p => p.moonOf ? (ps.find(h => h.id === p.moonOf) || p).orbitR : p.orbitR;
  const d = Math.abs(orbit(a) - orbit(b));
  return Math.min(LOCAL_T_MAX, Math.max(LOCAL_T_MIN, Math.round(LOCAL_T_MIN + d * 0.3)));
}
function lineCycleSec(l){ return planetTravelSec(l.a, l.b) * 2 + SHIP_HANDLING; }
function toggleLine(i){
  const l = save.lines[i];
  if (!l) return false;
  l.on = !l.on;
  if (l.on){ l.t0 = Date.now(); l.settled = 0; }
  pushLog(`贸易线 ${planetByKey(l.a).name} ⇄ ${planetByKey(l.b).name} ${l.on ? '开始持续运输' : '停运'}`);
  persistSave();
  return true;
}
function upgradeLine(i){
  const l = save.lines[i];
  if (!l || l.lv >= save.train.engineLv) return false;   // 线路等级 ≤ 车头等级
  if (!payCost(lineUpCost(l.lv + 1))) return false;
  l.lv++;
  pushLog(`贸易线升级 → LV${l.lv}(容量 ${SHIP_CAP * l.lv})`);
  persistSave();
  return true;
}

/* ── 自动运输结算(自动装载/卸载;没货也跑) ── */
function pstoreOf(key){
  if (!save.pstore) save.pstore = {};
  if (!save.pstore[key]) save.pstore[key] = {};
  return save.pstore[key];
}
function shipSend(srcKey, dstKey, what, cap){
  if (!what || what === 'none') return;
  if (what === 'pax'){
    const src = planetByKey(srcKey), dst = planetByKey(dstKey);
    if (!src || !dst || src.role !== 'hab' || devLevel(src) < 2 || !save.est[dstKey] || dst.role !== 'hab') return;
    const mi = migInfo(src);
    const take = Math.min(cap, mi.pool);
    if (take <= 0) return;
    save.mig[srcKey].pool -= take;
    save.popExtra[srcKey] = (save.popExtra[srcKey] || 0) - take;
    save.popExtra[dstKey] = (save.popExtra[dstKey] || 0) + take;
    return;
  }
  // 资源:优先源星本地产出仓,其次源星资源仓
  const src = planetByKey(srcKey);
  let take = 0;
  if (src && src.role === 'res' && src.res.key === what){
    take = Math.min(cap, resAvail(src));
    if (take > 0) save.taken[srcKey] = (save.taken[srcKey] || 0) + take;
  }
  if (take <= 0){
    const st = pstoreOf(srcKey);
    take = Math.min(cap, st[what] || 0);
    if (take <= 0) return;
    st[what] -= take;
  }
  const dst = pstoreOf(dstKey);
  dst[what] = (dst[what] || 0) + Math.round(take);
}
function settleLines(){
  if (!save.lines) return;
  for (const l of save.lines){
    if (!l.on) continue;
    const cyc = lineCycleSec(l) * 1000;
    const trips = Math.floor((Date.now() - l.t0) / cyc) - (l.settled || 0);
    if (trips <= 0) continue;
    const cap = SHIP_CAP * l.lv;
    for (let i = 0; i < Math.min(trips, 50); i++){   // 离线补结,封顶 50 周期
      shipSend(l.a, l.b, l.aSend, cap);
      shipSend(l.b, l.a, l.bSend, cap);
    }
    l.settled = (l.settled || 0) + trips;
  }
}

/* ── 影响力收入:停靠锚地 / 母港 / 贸易线 ── */
function districtCounts(key){
  const st = save.colony && save.colony[key];
  let hab = 0, trade = 0;
  if (st) for (const d of st.districts) if (dDone(d)) (d.type === 'habitation' ? hab++ : d.type === 'trade' ? trade++ : 0);
  return { hab, trade };
}
function infRatePerMin(){
  let rate = 0;
  const tr = save.train;
  const dockedKeys = [];
  if (tr.status === 'docked' && !localTransit()){
    const anchor = anchorageOf(tr.planet, tr.sys);
    for (const p of planetsOf(tr.sys)){
      if (anchorageOf(p.id, tr.sys) !== anchor) continue;
      dockedKeys.push(p.key);
      const c = districtCounts(p.key);
      rate += c.hab * INF_DOCK_HAB + c.trade * INF_DOCK_TRADE;
    }
  }
  // 母港:列车不在场时按 1/3 速率
  const hp = save.homePort;
  if (hp && save.est[hp] && !dockedKeys.includes(hp)){
    const c = districtCounts(hp);
    rate += (c.hab * INF_DOCK_HAB + c.trade * INF_DOCK_TRADE) / INF_HOMEPORT_DIV;
  }
  rate += (save.lines || []).filter(l => l.on).length * INF_LINE_PER_MIN;
  return rate;
}
function influenceTick(){
  save.infFrac = (save.infFrac || 0) + infRatePerMin() / 60;
  if (save.infFrac >= 1){
    const whole = Math.floor(save.infFrac);
    save.infFrac -= whole;
    save.influence = (save.influence || 0) + whole;
  }
}

/* ── 影响力征集移民(直接从行星人口抓取,瞬间补满迁移池) ── */
function conscriptCost(p){
  const mi = migInfo(p);
  const amount = Math.max(0, mi.cap - mi.pool);
  return { amount, cost: Math.max(1, Math.ceil(amount / 500)) };
}
function conscriptMigrants(p){
  if (!canEmigrate(p)) return false;
  const { amount, cost } = conscriptCost(p);
  if (amount <= 0 || (save.influence || 0) < cost) return false;
  save.influence -= cost;
  save.mig[p.key].pool += amount;          // 人口在登车时才真正离开行星(与自然补充口径一致)
  pushLog(`影响力动员 —— ${p.name} ${fmtNum(amount)} 人加入迁移池`);
  persistSave();
  return true;
}

/* ── 星球资源仓 + 人口资源加速 ── */
function demandOf(p){                // 每星的"需求资源"(确定性,排除自产)
  const keys = Object.keys(RESOURCES).filter(k => !(p.res && p.res.key === k));
  return keys[hashStr(p.key + ':demand') % keys.length];
}
function supplyStore(p, amount){     // 列车从金库补给需求资源
  const k = demandOf(p);
  if ((save.treasury[k] || 0) < amount) return false;
  save.treasury[k] -= amount;
  const st = pstoreOf(p.key);
  st[k] = (st[k] || 0) + amount;
  pushLog(`${p.name} 资源仓入库:${RESOURCES[k].name} ${fmtNum(amount)}`);
  persistSave();
  return true;
}
function boostActive(p){
  const b = save.boost && save.boost[p.key];
  if (!b) return false;
  if (b !== -1 && Date.now() > b) return false;
  return (pstoreOf(p.key)[demandOf(p)] || 0) > 0;
}
function setBoost(p, hours){
  if (!save.boost) save.boost = {};
  save.boost[p.key] = hours === -1 ? -1 : Date.now() + hours * 3600000;
  pushLog(`${p.name} 启动资源加速(${hours === -1 ? '永久' : hours + ' 小时'})`);
  persistSave();
}
function boostTick(){                // 每秒:消耗需求资源,人口 +10%/小时
  if (!save.boost) return;
  for (const key in save.boost){
    const p = planetByKey(key);
    if (!p || !save.est[key] || p.role !== 'hab') continue;
    const b = save.boost[key];
    if (b !== -1 && Date.now() > b){ delete save.boost[key]; continue; }
    const st = pstoreOf(key), k = demandOf(p);
    if ((st[k] || 0) <= 0) continue;
    const pop = popOf(p);
    const burn = Math.max(0.5, pop * 1e-6);            // 消耗随人口规模
    st[k] = Math.max(0, st[k] - burn);
    save.popExtra[key] = (save.popExtra[key] || 0) + pop * BOOST_GROWTH_PER_H / 3600;
  }
}

/* ── 星港竣工/里程碑播报 + 引导线《钢铁码头》 ── */
function portStoryContentReady(){
  const ps = save.portStory || { idx: 0 };
  if (ps.idx >= PORT_STORY.length) return false;
  const cg = planetByKey('kenxi/canglan');
  if (ps.idx === 0) return devLevel(cg) >= 3;
  if (ps.idx === 1) return Object.keys(save.starport || {}).some(k => portDone(k));
  if (ps.idx === 2) return (save.lines || []).some(l => l.on);
  return false;
}
function portStoryReady(){ return portStoryContentReady() && atQuestLoc('port'); }
function applyPortChoice(ch, ci){
  applyChoiceFx(ch.choices[ci].fx || {});
  save.portStory.idx++;
  persistSave();
}
/* ── 自动化经济:玩家是加速者,世界自己也会运转 ──
   · 殖民地 LV3+ 自动开建星港(不耗金库,工期 ×2;玩家出资=正常工期,即"加速")
   · 有星港的居住星自动从同系资源星小批量获取需求资源(自动航线,入资源仓) ── */
let _autoEcoAt = 0;
function autoEconomyTick(){
  const now = Date.now();
  if (now - _autoEcoAt < 5000) return;       // 5 秒节流,防卡
  _autoEcoAt = now;
  // ① 自动星港:每次最多开工一座,殖民地用本地产能慢慢建
  for (const key in save.est){
    const p = planetByKey(key);
    if (!p || devLevel(p) < 3 || portState(key)) continue;
    if (!save.starport) save.starport = {};
    save.starport[key] = { startAt: now, dur: STARPORT_TIME * 2, auto: 1 };
    pushLog(`${p.name} 殖民地自筹开建星港(本地产能,工期 ${fmtDuration(STARPORT_TIME * 2)};注资可加速)`);
    break;
  }
  // ② 自动补给航线:居住星(港成+有需求)← 同系资源星(港成+产出匹配),90 秒一班(离线补结,封顶 50 班)
  if (!save.autoShip) save.autoShip = {};
  for (const key in save.est){
    const p = planetByKey(key);
    if (!p || p.role !== 'hab' || !portDone(key)) continue;
    const dk = demandOf(p);
    const last = save.autoShip[key] || 0;
    const trips = Math.min(50, Math.floor((now - last) / 90000));
    if (trips <= 0) continue;
    const src = planetsOf(p.sysId).find(o =>
      o.role === 'res' && o.res.key === dk && portDone(o.key) && resAvail(o) > 10);
    if (!src) continue;
    const qty = Math.min(45 * trips, Math.floor(resAvail(src)));
    save.taken[src.key] = (save.taken[src.key] || 0) + qty;
    const st = pstoreOf(key);
    st[dk] = (st[dk] || 0) + qty;
    save.autoShip[key] = now;
  }
  // ③ 通商开发加成:仓内有需求资源的居住星,开发速度 ×(1+DEV_TRADE_BOOST)
  //    用 est 回拨实现(含离线时段;库存在,加成在)
  const lastCredit = save.devCreditAt || now;
  const dt = Math.min(now - lastCredit, 7 * 86400000);   // 单次封顶 7 天,防异常跳变
  save.devCreditAt = now;
  if (dt > 0){
    for (const key in save.est){
      const p = planetByKey(key);
      if (!p || p.role !== 'hab') continue;
      if ((pstoreOf(key)[demandOf(p)] || 0) <= 0) continue;
      if (devLevel(p) >= MAX_LEVEL) continue;
      save.est[key] -= dt * DEV_TRADE_BOOST;
    }
  }
}

let _portAnn = {};
function portTick(){
  settleLines();
  influenceTick();
  boostTick();
  autoEconomyTick();
  for (const key in (save.starport || {})){
    if (portDone(key) && !_portAnn[key]){
      _portAnn[key] = 1;
      if (!save.starport[key].ann){
        save.starport[key].ann = 1;
        const p = planetByKey(key);
        showToast(`<b>${p ? p.name : key}</b> 星港落成 —— 可开通贸易线`, { sfx:'unlock', say:'Starport operational.' });
        persistSave();
      }
    }
  }
}
