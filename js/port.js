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
function lineTargets(p){             // 可建线的同星系对象(卫星与母星算一家,不作为线端)
  return planetsOf(p.sysId).filter(o =>
    o.key !== p.key && !o.moonOf && portDone(o.key) && !lineExists(p.key, o.key)
    && anchorageOf(o.id, p.sysId) !== anchorageOf(p.id, p.sysId)
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
  if (b.moonOf || anchorageOf(a.id, a.sysId) === anchorageOf(b.id, b.sysId)) return false;   // 地月一家,不互开线
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
function lineCycleSec(l){ return planetTravelSec(l.a, l.b) + SHIP_HANDLING; }   // 货船 2 倍速:双程航时减半
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

/* ── 星港船坞(统一容量升级)+ 星门物流港 ── */
function dockLvOf(key){ return (save.docks && save.docks[key]) || 1; }
function upgradeDock(key){
  const lv = dockLvOf(key) + 1;
  if (lv > save.train.engineLv) return false;          // 船坞等级 ≤ 车头等级
  if (!payCost(dockUpCost(lv))) return false;
  save.docks[key] = lv;
  pushLog(`星港船坞升级 → LV${lv}(航线单船容量 ${SHIP_CAP * lv})`);
  persistSave();
  return true;
}
function lineCapPerTrip(l){              // 单趟容量 = 单船容量 × 每航道船数;船容量取两端船坞较高者
  const dock = Math.max(dockLvOf(l.a), dockLvOf(l.b), l.lv || 1);
  return SHIP_CAP * dock * SHIPS_PER_LANE;
}
function gateOf(sysId){ return save.gates && save.gates[sysId]; }
function gateDone(sysId){ const g = gateOf(sysId); return !!g && Date.now() >= g.at + g.dur * 1000; }
function sysFirstPort(sysId){            // 该星系最早建成的星港(首星星港)
  let best = null;
  for (const key in save.starport){
    if (!key.startsWith(sysId + '/') || !portDone(key)) continue;
    if (!best || save.starport[key].startAt < save.starport[best].startAt) best = key;
  }
  return best;
}
function buildGate(sysId, free){
  if (!save.gateUnlocked || gateOf(sysId)) return false;     // 地疤中期解锁;一系一门
  if (!free && !payCost(GATE_COST)) return false;
  save.gates[sysId] = { at: Date.now(), dur: GATE_TIME, speedLv:1, lineLv:1, storeLv:1, store:{}, lastT: 0 };
  pushLog(`${sysById(sysId).name} 星门奠基 —— 工期 ${fmtDuration(GATE_TIME)}(跨星系货运摆渡)`);
  persistSave();
  return true;
}
function unlockGates(){                  // 地疤中期:解锁技术,仅母港星系星门自动建成
  if (save.gateUnlocked) return;
  save.gateUnlocked = 1;
  for (const sysId of GATE_AUTO) buildGate(sysId, true);
  persistSave();
}
function gateNextHop(sysId){             // 朝母港方向、单跳范围内、离母港更近的已建成星门
  const home = homeSysId();
  if (sysId === home) return null;
  const dHome = sysDist(sysId, home);
  let best = null, bestD = Infinity;
  for (const gid in save.gates){
    if (gid === sysId || !gateDone(gid)) continue;
    if (sysDist(sysId, gid) > GATE_RANGE) continue;
    const d = sysDist(gid, home);
    if (d < dHome && d < bestD){ best = gid; bestD = d; }
  }
  return best;
}
function upgradeGate(sysId, branch){
  const g = gateOf(sysId);
  if (!g || !gateDone(sysId)) return false;
  const cur = g[branch + 'Lv'] || 1;
  if (cur >= GATE_MAXLV) return false;
  if (!payCost(gateUpCost(branch, cur + 1))) return false;
  g[branch + 'Lv'] = cur + 1;
  pushLog(`${sysById(sysId).name} 星门升级:${branch === 'speed' ? '传送速度' : branch === 'line' ? '传送线路' : '枢纽仓储'} → LV${cur + 1}`);
  persistSave();
  return true;
}
function homeSysId(){ return (save.homePort || 'kenxi/canglan').split('/')[0]; }
function gateSystemsInRange(sysId){      // 作用圈内的其他星系
  return SYSTEMS.filter(s => s.id !== sysId && sysDist(sysId, s.id) <= GATE_RANGE).map(s => s.id);
}
function gateCollectScope(sysId){        // 本门收集范围:本系 + 圈内未建门星系(已建门星系归其自有门)
  return [sysId, ...gateSystemsInRange(sysId).filter(sid => !(save.gates[sid] && gateDone(sid)))];
}
function gateTick(){                     // 货船网络:a)收集作用圈 b)接力输送目标门 c)本地分发
  const now = Date.now();
  const hubSys = homeSysId();
  for (const sysId in save.gates){
    if (!gateDone(sysId)) continue;
    const g = save.gates[sysId];
    const cyc = gateCycleSec(g) * 1000;
    if (!g.lastT){ g.lastT = now; continue; }
    const trips = Math.min(20, Math.floor((now - g.lastT) / cyc));
    if (trips <= 0) continue;
    g.lastT += trips * cyc;
    const batch = gateBatch(g) * trips;
    if (!g.store) g.store = {};
    const isHub = sysId === hubSys;
    const cap = isHub ? gateHubCap(g) : Infinity;
    // a) 收集:作用圈内资源星的星港仓 → 本门仓(稀有优先;居住星补给仓不动;枢纽受容量限)
    if (g.collect !== 0){
      let room = batch;
      for (const sid of gateCollectScope(sysId)){
        if (room <= 0) break;
        for (const key in save.pstore){
          if (!key.startsWith(sid + '/') || room <= 0) continue;
          const pl = planetByKey(key);
          if (!pl || pl.role !== 'res') continue;
          const st = save.pstore[key];
          for (const k of resPrioKeys(st)){
            if (st[k] <= 0 || room <= 0) continue;
            let take = Math.min(st[k], room);
            if (cap !== Infinity) take = Math.min(take, Math.max(0, cap - (g.store[k] || 0)));
            if (take <= 0) continue;
            st[k] -= take; room -= take;
            g.store[k] = (g.store[k] || 0) + take;
            if (k === pl.res.key){       // 星门吸取特产 = 出口,驱动资源星开发
              if (!save.exported) save.exported = {};
              save.exported[key] = (save.exported[key] || 0) + take;
            }
          }
        }
      }
    }
    // b) 输送:目标星门(默认自动朝母港),单跳 ≤ 作用圈;母港枢纽默认不外送
    const want = g.target || (isHub ? null : gateNextHop(sysId));
    const dest = want && want !== sysId && save.gates[want] && gateDone(want)
      && sysDist(sysId, want) <= GATE_RANGE ? want : null;
    if (dest){
      const dg = save.gates[dest];
      if (!dg.store) dg.store = {};
      const dcap = dest === hubSys ? gateHubCap(dg) : Infinity;
      let ship = batch;
      for (const k of resPrioKeys(g.store)){
        if (g.store[k] <= 0 || ship <= 0) continue;
        let take = Math.min(g.store[k], ship);
        if (dcap !== Infinity) take = Math.min(take, Math.max(0, dcap - (dg.store[k] || 0)));
        if (take <= 0) continue;
        g.store[k] -= take; ship -= take;
        dg.store[k] = (dg.store[k] || 0) + take;
      }
    }
    // c) 本地分发(终点卸货):门仓 → 本系居住星需求补给(优先,每班每星 ≤500)→ 首个居住星星港仓
    if (g.deliver){
      let give = batch;
      for (const pl of planetsOf(sysId)){
        if (give <= 0) break;
        if (pl.role !== 'hab' || !save.est[pl.key]) continue;
        const dk = demandOf(pl);
        if ((g.store[dk] || 0) <= 0) continue;
        const take = Math.min(g.store[dk], give, 500);
        g.store[dk] -= take; give -= take;
        const st2 = pstoreOf(pl.key);
        st2[dk] = (st2[dk] || 0) + take;
      }
      const habPort = planetsOf(sysId).find(pl => pl.role === 'hab' && portDone(pl.key));
      if (habPort && give > 0){
        const st2 = pstoreOf(habPort.key);
        for (const k of resPrioKeys(g.store)){
          if (g.store[k] <= 0 || give <= 0) continue;
          const take = Math.min(g.store[k], give);
          g.store[k] -= take; give -= take;
          st2[k] = (st2[k] || 0) + take;
        }
      }
    }
  }
}

/* ── 自动运输结算(自动装载/卸载;没货也跑);pstoreOf 见 economy.js ── */
function shipSend(srcKey, dstKey, what, cap){
  if (!what || what === 'none') return;
  if (what === 'pax'){
    const src = planetByKey(srcKey), dst = planetByKey(dstKey);
    if (!src || !dst || src.role !== 'hab' || devLevel(src) < 2 || !save.est[dstKey] || dst.role !== 'hab') return;
    const mi = migInfo(src);
    const take = Math.min(cap, mi.pool, Math.floor(popOf(src)));
    if (take <= 0) return;
    save.mig[srcKey].pool -= take;
    save.pop[srcKey] = Math.max(0, (save.pop[srcKey] || 0) - take);
    save.pop[dstKey] = (save.pop[dstKey] || 0) + take;
    if (!save.settled) save.settled = {};
    save.settled[dstKey] = (save.settled[dstKey] || 0) + take;
    return;
  }
  // 资源:源星本地仓 → 目的星本地仓;资源星运出特产计入出口(驱动其开发)
  const st = pstoreOf(srcKey);
  const take = Math.min(cap, st[what] || 0);
  if (take <= 0) return;
  st[what] -= take;
  const src = planetByKey(srcKey);
  if (src && src.role === 'res' && src.res.key === what){
    if (!save.exported) save.exported = {};
    save.exported[srcKey] = (save.exported[srcKey] || 0) + take;
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
    const cap = lineCapPerTrip(l);                   // 单趟 = 单船容量 × 每航道 2 艘
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
function infRatePerMin(){                // 商贸/民生区划常驻产出;列车停靠锚地 ×1.5
  let rate = 0;
  const tr = save.train;
  const dockedAnchor = (tr.status === 'docked' && !localTransit()) ? anchorageOf(tr.planet, tr.sys) : null;
  for (const key in save.est){
    const p = planetByKey(key);
    if (!p) continue;
    const c = districtCounts(key);
    let r = c.hab * INF_DOCK_HAB + c.trade * INF_DOCK_TRADE;
    if (r <= 0) continue;
    if (shortOf(p).chem) r *= 0.5;       // 消费品断供:民心低落
    if (dockedAnchor && p.sysId === tr.sys && anchorageOf(p.id, p.sysId) === dockedAnchor) r *= 1.5;
    if (key === save.homePort) r *= 1.25;  // 母港枢纽
    rate += r;
  }
  rate += (save.lines || []).filter(l => l.on).length * INF_LINE_PER_MIN;
  return rate * (1 + officerFx().inf);
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

/* ── 需求判定:当前覆盖时间最短的消耗资源(消费品/生命支持/能源) ── */
function demandOf(p){
  const need = consumptionOf(p);
  const st = pstoreOf(p.key);
  let worst = null, worstCover = Infinity;
  for (const k of ['chem','ice','he3']){
    if ((need[k] || 0) <= 0) continue;
    const cover = (st[k] || 0) / need[k];   // 覆盖分钟数
    if (cover < worstCover){ worstCover = cover; worst = k; }
  }
  return worst;
}
function supplyStore(p, amount){     // 从金库远程调拨最缺的资源入本星仓
  const k = demandOf(p);
  if (!k || (save.treasury[k] || 0) < amount) return false;
  save.treasury[k] -= amount;
  const st = pstoreOf(p.key);
  st[k] = (st[k] || 0) + amount;
  pushLog(`${p.name} 资源仓入库:${RESOURCES[k].name} ${fmtNum(amount)}`);
  persistSave();
  return true;
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
  const fx = ch.choices[ci].fx || {};
  if (fx.grantPorts){                      // 剧情承建:前哨与星港即刻落成
    for (const key of fx.grantPorts){
      if (!save.est[key]) save.est[key] = Date.now();
      if (!portState(key)) save.starport[key] = { startAt: Date.now() - 1000, dur: 0, story: 1 };
      const pl = planetByKey(key);
      pushLog(`${pl ? pl.name : key} 星港落成(规划院承建)`);
    }
    setTimeout(() => showToast('⚓ 规划院工程完工 —— 星港已落成,可开通贸易线', { sfx:'unlock', say:'Starport network expanded.' }), 1200);
  }
  applyChoiceFx(fx);
  save.portStory.idx++;
  persistSave();
}
/* ── 自动化经济:世界自己也会运转(仅便利性,不替代物流玩法) ──
   · 「殖民地」级居住星自动开建星港(不耗金库,工期 ×2;玩家出资=正常工期,即"加速") ── */
let _autoEcoAt = 0;
function autoEconomyTick(){
  const now = Date.now();
  if (now - _autoEcoAt < 5000) return;       // 5 秒节流,防卡
  _autoEcoAt = now;
  for (const key in save.est){
    const p = planetByKey(key);
    if (!p || p.moonOf || devLevel(p) < 3 || portState(key)) continue;   // LV3 起自动建星港;卫星不入贸易网,不自动建
    if (!save.starport) save.starport = {};
    save.starport[key] = { startAt: now, dur: STARPORT_TIME * 2, auto: 1 };
    pushLog(`${p.name} 殖民地自筹开建星港(本地产能,工期 ${fmtDuration(STARPORT_TIME * 2)};注资可加速)`);
    break;
  }
}

let _portAnn = {};
function portTick(){
  settleLines();
  influenceTick();
  autoEconomyTick();
  gateTick();
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
