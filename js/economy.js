/* ============================================================
   经济模型 — 开发等级 / 人口 / 资源 / 协同 / 文明指数
   全部由时间戳确定性推算,离线进度天然成立
   ============================================================ */

function devPoints(p){
  const t = save.est[p.key];
  if (!t) return -1;
  return Math.max(0, (Date.now() - t) / 1000) * p.habit;
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
function capBuff(){ return 1 + 0.08 * sumLevels('res'); }
function rateBuff(){ return 1 + 0.12 * sumLevels('hab'); }
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
    base = b - (b - a) * Math.exp(-tIn / 250000);
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
  const rich = p.res.rich * colonyProd(p) * storyRate(p);
  if (lv >= MAX_LEVEL){
    const extra = Math.max(0, devPoints(p) - LEVELS[MAX_LEVEL].th) * RES_RATE_MAX;
    return (RES_MILESTONES[MAX_LEVEL] + extra) * rich * rateBuff() * RES_SCALE;
  }
  const prog = devProgress(p);
  const a = RES_MILESTONES[lv], b = RES_MILESTONES[lv+1];
  return a * Math.pow(b/a, prog) * rich * rateBuff() * RES_SCALE;
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
       + 0.25 * Math.min(sumLevels('hab'), sumLevels('res'))
       + (save.story ? save.story.buffs.civ : 0)
       + (typeof COLONY_FX !== 'undefined' ? COLONY_FX.civ : 0);
}
function civTier(){
  const ci = civIndex();
  let t = CIV_TIERS[0][1];
  for (const [th, name] of CIV_TIERS) if (ci >= th) t = name;
  return t;
}

/* ── 金库 ── */
function canAfford(cost){
  for (const k in cost) if ((save.treasury[k] || 0) < cost[k]) return false;
  return true;
}
function payCost(cost){
  if (!canAfford(cost)) return false;
  for (const k in cost) save.treasury[k] -= cost[k];
  persistSave();
  return true;
}
function costHtml(cost){
  return Object.entries(cost).map(([k, v]) => {
    const ok = (save.treasury[k] || 0) >= v;
    return `<span class="${ok?'ok':'no'}">${RESOURCES[k].name} ${fmtNum(v)}</span>`;
  }).join('<br>');
}
