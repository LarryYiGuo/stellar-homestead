/* ============================================================
   经济模型 — 开发等级 / 人口 / 资源 / 协同 / 文明指数
   全部由时间戳确定性推算,离线进度天然成立
   ============================================================ */

function devPoints(p){
  const t = save.est[p.key];
  if (!t) return -1;
  // 资源星按工业开发推进,不吃宜居度惩罚(速率下限 0.8,约 75 天满级);居住星按宜居度
  const k = p.role === 'res' ? Math.max(0.8, p.habit) : p.habit;
  return Math.max(0, (Date.now() - t) / 1000) * k;
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
      return { met: devLevel(t) >= c.planetLv.lv, text: `${t.name} 达到「${LEVELS[c.planetLv.lv].name}」` };
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
  // 建立殖民地的后勤条件:列车停靠本星轨道 + 随车移民 + 居住承载
  conds.push({
    met: dockedAtPlanet(p),
    text: '星际列车停靠本星轨道(卫星/母星泊位通用)',
  });
  conds.push({
    met: save.train.pax >= ESTABLISH_COLONISTS,
    text: `随车移民 ≥ ${fmtNum(ESTABLISH_COLONISTS)}(当前 ${fmtNum(save.train.pax)})`,
  });
  const cap = habCapacityInfo();
  conds.push({
    met: cap.ok,
    text: `居住承载:非居住区划 ${cap.other} ≤ 居住区划×2(${cap.limit})`,
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
function capBuff(){ return Math.min(1.6, 1 + 0.02 * sumLevels('res')); }   // 20 级体系:系数 ÷4,封顶 ×1.6(生态承载有极限)
function rateBuff(){ return 1 + 0.03 * sumLevels('hab'); }                 // 20 级体系:系数 ÷4,等效原节奏
/* 剧情《来自地球的歌》的人口/产率加成仅作用于垦曦全系(初始星系) */
function storyCap(p){ return p.sysId === 'kenxi' && save.story ? save.story.buffs.cap : 1; }
function storyRate(p){ return p.sysId === 'kenxi' && save.story ? save.story.buffs.rate : 1; }

function popOf(p){
  if (p.role !== 'hab') return 0;
  const lv = devLevel(p);
  if (lv === 0) return 0;
  const extra = (save.popExtra && save.popExtra[p.key]) || 0;   // 迁入/迁出的人口偏移
  const mult = p.capScale * capBuff() * colonyCap(p) * storyCap(p);
  let base;
  if (lv >= MAX_LEVEL){
    // 环境承载力:最终阶段渐近逼近上限,越接近增长越慢
    const a = POP_MILESTONES[MAX_LEVEL], b = POP_MILESTONES[MAX_LEVEL + 1];
    const tIn = Math.max(0, devPoints(p) - LEVELS[MAX_LEVEL].th);
    base = b - (b - a) * Math.exp(-tIn / 600000);   // 满级后约一周逼近生态极限
  } else {
    const prog = devProgress(p);
    const a = POP_MILESTONES[lv], bb = POP_MILESTONES[lv+1];
    base = a * Math.pow(bb/a, prog);
  }
  return Math.max(0, base * mult + extra);
}
function popCapOf(p){
  if (p.role !== 'hab') return 0;
  const lv = devLevel(p);
  if (lv === 0) return 0;
  return POP_MILESTONES[lv+1] * p.capScale * capBuff() * colonyCap(p) * storyCap(p);
}
function resOf(p){                       // 累计产出(含已收取部分)
  if (p.role !== 'res') return 0;
  const lv = devLevel(p);
  if (lv === 0) return 0;
  const rich = p.res.rich * resRegionMult(p) * colonyProd(p) * storyRate(p) * moonPortMult(p);   // 区域 × 资源层级 × 卫星港再分配
  // 产率模型:满级前从 6% 线性爬坡到 100% 满级率(无段初锯齿),满级后恒定 RES_RATE_MAX
  const T = LEVELS[MAX_LEVEL].th;
  const pts = devPoints(p);
  const t = Math.min(pts, T);
  let cum = RES_RATE_MAX * (0.06 * t + 0.47 * t * t / T);   // ∫(0.06+0.94·t/T)dt
  if (pts > T) cum += (pts - T) * RES_RATE_MAX;
  return cum * rich * rateBuff() * workforceBuff() * RES_SCALE;   // 劳动力红利:人口反哺产能
}
function resRateOf(p){
  if (p.role !== 'res' || devLevel(p) === 0) return 0;
  const dt = 30;
  const now = resOf(p);
  const t0 = save.est[p.key];
  save.est[p.key] = t0 + dt*1000;
  const past = resOf(p);
  save.est[p.key] = t0;
  return Math.max(0, (now - past) / dt);
}
function resAvail(p){                    // 仓内待收取量
  if (p.role !== 'res') return 0;
  return Math.max(0, resOf(p) - (save.taken[p.key] || 0));
}

function totalPop(){ let s=0; for (const p of allPlanets()) s += popOf(p); return s; }
function totalRes(){ let s=0; for (const p of allPlanets()) s += resOf(p); return s; }
function devCountAll(){ let c=0; for (const p of allPlanets()) if (devLevel(p) > 0) c++; return c; }

/* 文明指数 = log10(总人口) + log10(资源储量) + 0.25 × min(居住等级和, 资源等级和) */
function civIndex(){
  return Math.log10(1 + totalPop()) + Math.log10(1 + totalRes())
       + 0.0625 * Math.min(sumLevels('hab'), sumLevels('res'))   // 20 级体系:系数 ÷4
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
