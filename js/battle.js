/* ============================================================
   列车遭遇战 — 回合制自走棋 + 指令卡组构筑
   部署阶段:从卡组抽手牌,消耗指挥点打出;结算阶段自动交火
   敌方:兵种针对车厢(炮塔/引擎/随机)· 精英词缀 · Boss 技能
   击伤持久化;胜利可选新指令卡入组
   ============================================================ */
let B = null;

function battleOpen(){ return $('battle-overlay').classList.contains('show'); }
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ── 开战 ── */
function mkEnemy(tid, i, rg){
  const t = ENEMY_TYPES[tid];
  const jit = 0.85 + Math.random() * 0.3;
  return {
    tid, icon: t.icon, prefer: t.prefer,
    name: t.name + '-' + String.fromCharCode(65 + i),
    hp: Math.round(t.hp * rg.hpS * jit), maxHp: Math.round(t.hp * rg.hpS * jit),
    atk: Math.round(t.atk * rg.atkS * (0.9 + Math.random() * 0.2)),
    affix: null, intent: null, stunned: false, negated: false,
  };
}
function openBattle(sysId, pirate){
  if (B && B.sys.id === sysId && B.phase !== 'done'){   // 续战
    $('battle-overlay').classList.add('show');
    musicBattle(true, !!B.boss);
    renderBattle();
    return;
  }
  const sys = sysById(sysId);
  const tutorial = !pirate && save.pendingRaid && save.pendingRaid.tutorial;   // 新手战:脱轨陨星
  const rg = tutorial ? { name:'碎石带', ...TUT_SCALE } : REGIONS[regionOf(sys)];
  if (!rg.hpS) return;                        // 安全区无战斗(新手战除外)
  const isBoss = !pirate && !tutorial && !!(save.pendingRaid && save.pendingRaid.boss) && !!BOSSES[sysId];
  const h = Math.min(6, Math.max(1, sys.hazard));

  let enemies = [], boss = null;
  if (tutorial){
    const conf = Object.values(TUT_RAIDS).find(t => t.stage === tutorial) || TUT_RAIDS[2];
    enemies = conf.comp.map((tid, i) => {
      const t = TUT_ENEMIES[tid];
      const jit = 0.9 + Math.random() * 0.2;
      return { tid, icon: t.icon, prefer: t.prefer, name: t.name + '-' + String.fromCharCode(65 + i),
        hp: Math.round(t.hp * rg.hpS * jit), maxHp: Math.round(t.hp * rg.hpS * jit),
        atk: Math.round(t.atk * rg.atkS) || 1,
        affix: null, intent: null, stunned: false, negated: false };
    });
  } else if (pirate){
    // 小行星带海盗基地:固定火力平台 + 危险度编队护卫
    const bhp = Math.round(260 * rg.hpS + firepower() * 2);
    enemies = [{
      tid:'pbase', icon:'☠', prefer:'weapon', isBase:true,
      name:'海盗基地 · 火力平台',
      hp: bhp, maxHp: bhp,
      atk: Math.round(16 * rg.atkS),
      affix: null, intent: null, stunned: false, negated: false,
    }, ...RAID_COMPS[h].slice(0, 3).map((tid, i) => mkEnemy(tid, i, rg))];
  } else if (isBoss){
    boss = BOSSES[sysId];
    const bhp = Math.round(boss.hpBase * rg.hpS * 0.7 + firepower() * 3);
    const bu = {
      tid:'boss', icon: boss.icon, prefer: boss.prefer, isBoss: true,
      name: boss.name,
      hp: bhp, maxHp: bhp,
      atk: Math.round(boss.atkBase * rg.atkS * 0.85),
      affix: null, intent: null, stunned: false, negated: false, charging: false,
    };
    enemies = [bu, ...boss.escorts.map((tid, i) => mkEnemy(tid, i, rg))];
  } else {
    enemies = RAID_COMPS[h].map((tid, i) => mkEnemy(tid, i, rg));
    // 精英词缀:危险度 3-4 一个,5+ 两个;精英体质 ×1.4
    const nElite = h >= 5 ? 2 : h >= 3 ? 1 : 0;
    const keys = Object.keys(AFFIXES);
    const cand = shuffle(enemies.slice());
    for (let i = 0; i < Math.min(nElite, cand.length); i++){
      const e = cand[i];
      e.affix = keys[Math.floor(Math.random() * keys.length)];
      e.hp = Math.round(e.hp * 1.4); e.maxHp = e.hp;
      e.name = '★' + e.name;
    }
  }
  const hpS = battleHpScale();                // 车厢耐久随引擎成长
  const cars = save.train.cars.map((c, idx) => {
    const mh = Math.round((CAR_HP[c.type] || 80) * hpS);
    return {
      idx, type: c.type, wid: c.wid || null, wlv: c.wlv || 0, clv: c.clv || 1,
      paxMode: !!c.paxMode,
      maxHp: mh, hp: c.damaged ? 0 : mh,
      down: !!c.damaged, immune: false,
    };
  });
  B = {
    sys, boss, pirate: !!pirate, tutorial: tutorial || 0, region: rg, round: 1, maxRounds: isBoss ? 12 : BATTLE_MAX_ROUNDS,
    phase: 'plan', enemies, cars,
    value: enemies.reduce((s, e) => s + e.maxHp + e.atk * 4, 0),
    drawPile: shuffle(save.deck.slice()), discardPile: [], hand: [], exhausted: [],
    cp: 0, cpMax: 0, fx: {}, escapePlanned: false,
    log: [], targeting: null, result: null, cardChoices: null, chosen: false,
  };
  if (isBoss) blog(boss.intro);
  blog(isBoss ? `⚠ 旗舰级目标:${boss.name} —— ${boss.skillText}`
    : tutorial ? `一群脱轨陨星切入沧澜轨道 —— ${enemies.length} 个目标,武器系统这就有了用武之地。击毁后残骸归我们。`
    : pirate ? `逼近 ${sys.name} 小行星带深处的海盗巢穴 —— 基地火力平台与 ${enemies.length - 1} 艘护卫上线`
    : `遭遇 ${sys.name} 空域的袭击者舰队 —— ${enemies.length} 个目标进入射程`);
  newPlanPhase(true);
  drawIntents();
  $('battle-overlay').classList.add('show');
  musicBattle(true, isBoss);
  renderBattle();
  sfx('err'); speak(isBoss ? 'Capital-class hostile detected.'
    : tutorial ? 'Debris field ahead. Weapons hot.'
    : pirate ? 'Pirate stronghold in range. Weapons free.'
    : 'Hostiles detected. Battle stations.');
  tickBlueprintLayer();
}

function newPlanPhase(first){
  B.cpMax = 3 + (B.cars.some(c => c.type === 'habitat' && !c.down) ? 1 : 0) + techLv('cmd');
  B.cp = B.cpMax;
  B.fx = { focusIdx: null, dmgMult: 0, shieldMult: 1, evadeP: 0, critP: 0,
           extraVolley: false, pierce: false, overload: false, engBoost: 1 };
  for (const c of B.cars) c.immune = false;
  for (const e of B.enemies){ e.stunned = false; e.negated = false; }
  // 弃手牌,抽新手牌
  B.discardPile.push(...B.hand);
  B.hand = [];
  drawCards(HAND_SIZE);
  if (!first) blog(`—— 第 ${B.round} 回合 · 部署阶段 ——`);
}
function drawCards(n){
  for (let i = 0; i < n; i++){
    if (!B.drawPile.length){
      if (!B.discardPile.length) break;
      B.drawPile = shuffle(B.discardPile);
      B.discardPile = [];
      blog('牌库洗切完毕');
    }
    B.hand.push(B.drawPile.pop());
  }
}

function aliveEnemies(){ return B.enemies.filter(e => e.hp > 0); }
function aliveCars(){ return B.cars.filter(c => !c.down); }
function carLabel(c){
  return c.type === 'weapon' && c.wid ? WEAPONS[c.wid].name : CAR_TYPES[c.type].name;
}
function worstCar(){
  return aliveCars().filter(c => c.hp < c.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
}
function commandAlive(){ return aliveEnemies().some(e => e.affix === 'command'); }

/* ── 敌方意图 ── */
function pickTargetCar(e){
  const alive = aliveCars();
  if (!alive.length) return null;
  if (e.affix === 'sniper')
    return alive.slice().sort((a, b) => a.hp - b.hp)[0];
  if (e.prefer){
    const pool = alive.filter(c => c.type === e.prefer);
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return alive[Math.floor(Math.random() * alive.length)];
}
function drawIntents(){
  for (const e of B.enemies){
    if (e.hp <= 0){ e.intent = null; continue; }
    if (e.isBoss && e.charging){
      e.intent = { special: `主炮充能完毕 —— 下回合齐射全列 -${Math.round(e.atk * 0.6)}/节` };
      continue;
    }
    const t = pickTargetCar(e);
    e.intent = t ? { carIdx: t.idx, dmg: e.atk } : null;
  }
}

/* ── 出牌 ── */
function cardPlayable(cid){
  const c = CARDS[cid];
  if (B.phase !== 'plan') return { ok:false, why:'' };
  if (B.cp < c.cp) return { ok:false, why:'指挥点不足' };
  if (c.requires === 'eng' && !B.cars.some(x => x.type === 'eng' && !x.down))
    return { ok:false, why:'需工程舱' };
  if (c.requires === 'missile' && !B.cars.some(x => x.type === 'weapon' && x.wid === 'missile' && !x.down))
    return { ok:false, why:'需导弹井' };
  if (cid === 'revive' && !B.cars.some(x => x.down && x.type !== 'engine'))
    return { ok:false, why:'无瘫痪车厢' };
  if (cid === 'focus' && B.fx.focusIdx !== null) return { ok:false, why:'已锁定' };
  return { ok:true };
}
function playCard(handIdx, targetIdx){
  const cid = B.hand[handIdx];
  if (cid === undefined) return;
  const c = CARDS[cid];
  const av = cardPlayable(cid);
  if (!av.ok){ sfx('err'); return; }
  if (c.needTarget && targetIdx === undefined){
    B.targeting = handIdx;          // 进入锁定模式
    renderBattle();
    return;
  }
  B.targeting = null;
  B.cp -= c.cp;
  B.hand.splice(handIdx, 1);
  (c.exhaust ? B.exhausted : B.discardPile).push(cid);
  applyCard(cid, targetIdx);
  sfx('confirm');
  renderBattle();
}
function applyCard(cid, ti){
  const fx = B.fx;
  const tgt = ti !== undefined ? B.enemies[ti] : null;
  switch(cid){
    case 'focus':
      fx.focusIdx = ti;
      blog(`全炮组锁定 ${tgt.name} —— 集火齐射`); break;
    case 'shield':
      fx.shieldMult = Math.min(fx.shieldMult, 0.5);
      blog('偏导护盾展开 —— 受到伤害 -50%'); break;
    case 'bigshield':
      fx.shieldMult = Math.min(fx.shieldMult, 0.2);
      blog('引擎功率灌入护盾 —— 受到伤害 -80%'); break;
    case 'repair': {
      const h = worstCar();
      if (h){ const amt = Math.round(h.maxHp * 0.35); h.hp = Math.min(h.maxHp, h.hp + amt); blog(`损管队抢修「${carLabel(h)}」 +${amt}`); }
      else blog('损管队待命 —— 无需抢修');
      break; }
    case 'patch':
      for (const c2 of aliveCars()) c2.hp = Math.min(c2.maxHp, c2.hp + Math.round(c2.maxHp * 0.12));
      blog('装甲重组 —— 全列车厢恢复 12% 耐久'); break;
    case 'evade':
      fx.evadeP = Math.max(fx.evadeP, 0.4);
      blog('列车开始规避机动'); break;
    case 'overload':
      fx.dmgMult += 1.0; fx.overload = true;
      blog('武器过载 —— 炮管温度逼近红线'); break;
    case 'calibrate':
      fx.critP += 0.4;
      blog('火控校准完成 —— 暴击率 +40%'); break;
    case 'engsupport':
      fx.engBoost = 3;
      blog('工程支援 —— 修复效率 ×3'); break;
    case 'salvo':
      fx.extraVolley = true;
      blog('齐射协议启动 —— 武器双倍射速'); break;
    case 'pierce':
      fx.pierce = true; fx.dmgMult += 0.25;
      blog('换装穿甲弹药 —— 伤害 +25%,无视装甲'); break;
    case 'emp':
      tgt.stunned = true;
      blog(`电磁脉冲命中 ${tgt.name} —— 火控瘫痪`); break;
    case 'decoy': {
      const pool = shuffle(aliveEnemies().filter(e => !e.stunned)).slice(0, 2);
      for (const e of pool) e.negated = true;
      blog(`诱饵无人机放出 —— ${pool.map(e => e.name).join('、') || '无目标'} 被引开`);
      break; }
    case 'seal': {
      const h = worstCar() || aliveCars()[0];
      if (h){ h.immune = true; blog(`「${carLabel(h)}」紧急封舱 —— 本回合免疫伤害`); }
      break; }
    case 'missilerain': {
      for (const car of B.cars){
        if (car.type !== 'weapon' || car.wid !== 'missile' || car.down) continue;
        const dmg = Math.round(WEAPONS.missile.fp * car.wlv * carEffOf(car.clv) * 1.2 * (1 + 0.08 * techLv('fire')));
        for (const e of aliveEnemies()) hitEnemy(e, dmg, '全弹发射');
      }
      break; }
    case 'revive': {
      const downs = B.cars.filter(x => x.down && x.type !== 'engine');
      const c2 = downs.find(x => x.type === 'weapon') || downs[0];
      if (c2){ c2.down = false; c2.hp = Math.round(c2.maxHp * 0.4); blog(`野战重启 —— 「${carLabel(c2)}」恢复运作(40%)`); }
      break; }
    case 'railgun':
      hitEnemy(tgt, 60 + save.train.engineLv * 25, '轨道炮支援');
      break;
    case 'timewarp':
      for (const e of aliveEnemies()) e.stunned = true;
      blog('跃迁脉冲 —— 局部时空冻结,敌方全体停摆'); break;
  }
}
function lockTarget(enemyIdx){
  if (B.targeting === null || B.enemies[enemyIdx].hp <= 0) return;
  playCard(B.targeting, enemyIdx);
}

/* ── 伤害结算 ── */
function hitEnemy(e, dmg, tag){
  let mult = 1;
  if (e.affix === 'armored' && !B.fx.pierce) mult *= 0.7;
  if (e.isBoss && B.boss.skill === 'phase' && B.round % 2 === 1) mult *= 0.3;
  dmg = Math.max(1, Math.round(dmg * mult));
  e.hp = Math.max(0, e.hp - dmg);
  blog(`${tag} ${e.name} -${dmg}${mult < 1 ? '(减伤)' : ''}`);
  if (e.hp <= 0){
    blog(`☄ ${e.name} 被击毁`);
    if (e.affix === 'volatile'){
      const t = aliveCars()[Math.floor(Math.random() * aliveCars().length)];
      if (t && !t.immune){
        const amt = Math.round(t.maxHp * 0.12);
        t.hp = Math.max(0, t.hp - amt);
        blog(`💥 ${e.name} 自爆,「${carLabel(t)}」 -${amt}`);
        checkCarDown(t);
      }
    }
  }
}
function hitCar(c, dmg, srcName){
  if (c.immune){ blog(`「${carLabel(c)}」封舱完好,挡下 ${srcName} 的攻击`); return; }
  c.hp = Math.max(0, c.hp - dmg);
  blog(`${srcName} 轰击「${carLabel(c)}」 -${dmg}`);
  checkCarDown(c);
}
function checkCarDown(c){
  if (c.hp <= 0 && !c.down){
    c.down = true;
    const eff = c.type === 'engine' ? '列车动力中断!'
      : c.type === 'weapon' ? '火力点哑火'
      : c.type === 'cargo' ? '货舱破裂,战利品散逸'
      : '舱段失能';
    blog(`💥 「${carLabel(c)}」被击瘫 —— ${eff}`);
  }
}

/* ── 回合结算 ── */
function enemyAttackStep(e){
  return () => {
    if (e.hp <= 0 || !aliveCars().length) return;
    if (e.stunned){ blog(`${e.name} 火控瘫痪,无法行动`); return; }
    if (e.negated){ blog(`${e.name} 追着诱饵打空了一轮`); return; }
    // Boss:充能齐射
    if (e.isBoss && e.charging){
      e.charging = false;
      blog(`☢ ${e.name} 主炮齐射!`);
      for (const c of aliveCars().slice()){
        if (B.fx.evadeP && Math.random() < B.fx.evadeP){ blog(`「${carLabel(c)}」躲过齐射`); continue; }
        hitCar(c, Math.round(e.atk * 0.6 * B.fx.shieldMult), e.name);
      }
      return;
    }
    let tCar = e.intent && e.intent.carIdx !== undefined && !B.cars[e.intent.carIdx].down
      ? B.cars[e.intent.carIdx] : pickTargetCar(e);
    if (!tCar) return;
    if (B.fx.evadeP && Math.random() < B.fx.evadeP){
      blog(`${e.name} 的攻击被规避机动甩开`);
      return;
    }
    const buff = (commandAlive() && e.affix !== 'command') ? 1.25 : 1;
    hitCar(tCar, Math.round(e.atk * buff * B.fx.shieldMult), e.name);
  };
}
function battleCarArmed(car){
  return (car.type === 'weapon' || car.type === 'general') && car.wid && !car.paxMode;
}
function weaponFireStep(car){
  return () => {
    if (car.down || !battleCarArmed(car) || !aliveEnemies().length) return;
    const w = WEAPONS[car.wid];
    const mode = WEAPON_BATTLE[car.wid].mode;
    let base = w.fp * car.wlv * carEffOf(car.clv);   // 车厢等级提升火力
    // 弹药:有弹 -1 发;打空后应急弹药,伤害减半
    if (save.train.ammo > 0) save.train.ammo--;
    else { base *= 0.5; blog(`「${carLabel(car)}」弹药耗尽 —— 应急弹药,威力减半`); }
    const target = () => {
      const foc = B.fx.focusIdx !== null ? B.enemies[B.fx.focusIdx] : null;
      if (foc && foc.hp > 0) return foc;
      return aliveEnemies().sort((a, b) => a.hp - b.hp)[0];
    };
    const volleys = 1 + (B.fx.extraVolley ? 1 : 0);
    for (let v = 0; v < volleys; v++){
      if (!aliveEnemies().length) break;
      let mult = (1 + B.fx.dmgMult) * (1 + 0.08 * techLv('fire'));   // 研发:火控算法
      const foc = B.fx.focusIdx !== null ? B.enemies[B.fx.focusIdx] : null;
      const critP = (car.wid === 'laser' ? 0.25 : 0) + B.fx.critP;
      const roll = () => Math.random() < critP ? 1.6 : 1;
      if (mode === 'burst'){
        for (let k = 0; k < 2; k++){
          const e = target(); if (!e) break;
          const fm = (foc && e === foc) ? 1.35 : 1;
          const cr = roll();
          hitEnemy(e, Math.round(base * 0.55 * mult * fm * cr), cr > 1 ? `${w.name} 暴击连射` : `${w.name} 连射`);
        }
      } else if (mode === 'crit'){
        const e = target(); if (!e) break;
        const fm = (foc && e === foc) ? 1.35 : 1;
        const cr = roll();
        hitEnemy(e, Math.round(base * mult * fm * cr), cr > 1 ? `${w.name} 暴击` : `${w.name} 灼穿`);
      } else {
        const e = target(); if (!e) break;
        const fm = (foc && e === foc) ? 1.35 : 1;
        hitEnemy(e, Math.round(base * mult * fm * roll()), w.name);
        for (const o of aliveEnemies()) if (o !== e)
          hitEnemy(o, Math.round(base * 0.35 * mult), `${w.name} 溅射`);
      }
    }
  };
}

function startRound(){
  if (B.phase !== 'plan') return;
  B.targeting = null;
  B.phase = 'anim';
  renderBattle();
  const steps = [];
  // 1. 迅捷敌舰抢先行动
  for (const e of B.enemies) if (e.affix === 'swift') steps.push(enemyAttackStep(e));
  // 2. 列车武器开火(武器平台 + 武装通用车厢;载人模式不参战)
  for (const car of B.cars) if (battleCarArmed(car)) steps.push(weaponFireStep(car));
  // 3. 过载自损
  if (B.fx.overload) steps.push(() => {
    for (const car of B.cars){
      if (!battleCarArmed(car) || car.down) continue;
      car.hp = Math.max(0, car.hp - Math.round(car.maxHp * 0.1));
      if (car.hp <= 0){ car.down = true; blog(`⚠ 「${carLabel(car)}」过载烧毁,瘫痪!`); }
    }
  });
  // 4. 其余敌舰行动
  for (const e of B.enemies) if (e.affix !== 'swift') steps.push(enemyAttackStep(e));
  // 5. 回合末
  steps.push(() => {
    for (const e of aliveEnemies()) if (e.affix === 'regen' && e.hp < e.maxHp){
      e.hp = Math.min(e.maxHp, e.hp + 8);
      blog(`${e.name} 自我修复 +8`);
    }
    for (const ec of B.cars.filter(c => c.type === 'eng' && !c.down)){
      const h = worstCar();
      if (h){ const amt = Math.round(h.maxHp * 0.08) * B.fx.engBoost; h.hp = Math.min(h.maxHp, h.hp + amt); blog(`工程舱自动修复「${carLabel(h)}」 +${amt}`); }
    }
    if (!aliveEnemies().length) return finishBattle('victory');
    if (B.cars.some(c => c.type === 'engine' && c.down)) return finishBattle('defeat');
    if (B.escapePlanned) return finishBattle('escape');
    if (B.round >= B.maxRounds) return finishBattle('withdraw');
    // Boss 技能调度
    const bu = B.enemies.find(e => e.isBoss && e.hp > 0);
    if (bu && B.boss.skill === 'summon' && B.round % 3 === 0 && aliveEnemies().length < 7){
      for (let i = 0; i < 2; i++) B.enemies.push(mkEnemy('raider', B.enemies.length, B.region));
      blog(`☠ ${bu.name} 放出增援 —— 2 艘掠袭艇入场`);
    }
    if (bu && B.boss.skill === 'charge' && B.round % 3 === 0 && !bu.charging){
      bu.charging = true;
      blog(`☢ ${bu.name} 主炮开始充能…`);
    }
    B.round++;
    newPlanPhase();
    drawIntents();
    B.phase = 'plan';
    renderBattle();
  });
  runSteps(steps, 0);
}
function runSteps(steps, i){
  if (i >= steps.length) return;
  steps[i]();
  if (B && B.phase === 'anim'){
    renderBattle();
    setTimeout(() => runSteps(steps, i + 1), 360);
  }
}

/* ── 全速脱离(固定指令)/ 委托结算 ── */
function planEscape(){
  if (B.phase !== 'plan' || B.escapePlanned) return;
  if (B.cp < ESCAPE_COST || B.cars.some(c => c.type === 'engine' && c.down)){ sfx('err'); return; }
  B.cp -= ESCAPE_COST;
  B.escapePlanned = true;
  blog('引擎推到红线 —— 本回合末全速脱离战斗');
  sfx('jump');
  renderBattle();
}
function autoResolveBattle(){
  if (B.phase !== 'plan' || B.round !== 1 || B.boss) return;   // Boss 战必须亲自打
  const power = firepower() + defense();
  const threat = Math.round(B.value / (4.5 * battleHpScale()));
  if (power >= threat){
    blog(`舰桥代理交战:火力 ${power} ≥ 威胁 ${threat},袭击者被击退`);
    B.autoMult = 0.85; B.noChoice = true;
    finishBattle('victory');
  } else {
    blog(`舰桥代理交战:火力 ${power} < 威胁 ${threat},列车强行突围`);
    const w = B.cars.filter(c => (c.type === 'weapon' || c.type === 'cargo') && !c.down);
    if (w.length){ const c = w[Math.floor(Math.random() * w.length)]; c.down = true; c.hp = 0; }
    finishBattle('defeat-light');
  }
}

/* ── 战斗收尾 ── */
function rollCardChoices(isBoss){
  const ids = Object.keys(CARDS);
  const byR = r => ids.filter(id => CARDS[id].rarity === r);
  const want = isBoss ? ['epic','epic','rare']
    : Math.random() < 0.3 ? ['rare','common','common'] : ['common','common','rare'];
  const picks = [];
  for (const r of want){
    const cand = byR(r).filter(id => !picks.includes(id));
    if (cand.length) picks.push(cand[Math.floor(Math.random() * cand.length)]);
  }
  return picks;
}
function finishBattle(result){
  B.phase = 'done';
  B.result = result;
  const sys = B.sys;
  const isBoss = !!B.boss;
  const cargoDown = B.cars.some(c => c.type === 'cargo' && c.down);
  let summary = '';

  if (result === 'victory' || result === 'withdraw' || result === 'escape'){
    let mult = result === 'victory' ? 1 : result === 'withdraw' ? 0.5 : 0.7;
    mult *= (B.autoMult || 1) * (cargoDown ? 0.6 : 1) * (isBoss ? B.boss.lootMult : 1);
    const total = Math.round(B.value * 3 * sys.rich * mult * (B.region ? B.region.loot : 1) * COLONY_FX.loot);
    const mainKey = (sys.bias && sys.bias !== 'hab') ? sys.bias : 'metal';
    const keys = Object.keys(RESOURCES).filter(k => k !== mainKey);
    const sideKey = keys[Math.floor(Math.random() * keys.length)];
    const loot = { [mainKey]: Math.round(total * 0.7), [sideKey]: Math.round(total * 0.3) };
    for (const k in loot) save.treasury[k] = (save.treasury[k] || 0) + loot[k];
    B.loot = loot;
    const lootTxt = Object.entries(loot).map(([k, v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' · ');
    summary = result === 'victory' ? `${isBoss ? 'Boss 被击沉' : '袭击者舰队被全歼'},缴获:${lootTxt}`
      : result === 'escape' ? `列车全速脱离战斗,带走部分战利品:${lootTxt}`
      : `敌方久攻不下后撤退,拾获残骸:${lootTxt}`;
    if (result === 'victory' && !B.noChoice) B.cardChoices = rollCardChoices(isBoss);
  } else {
    const lossRate = result === 'defeat' ? 0.18 : 0.1;
    for (const k in save.treasury) save.treasury[k] = Math.floor(save.treasury[k] * (1 - lossRate));
    B.lossRate = lossRate;
    summary = result === 'defeat'
      ? `引擎被击瘫,列车遭到劫掠 —— 金库损失 ${(lossRate * 100).toFixed(0)}%`
      : `突围成功但代价惨重 —— 金库损失 ${(lossRate * 100).toFixed(0)}%`;
  }

  // 击伤持久化(战斗中重启成功的车厢视为修复)
  let dmgCount = 0;
  for (const c of B.cars){
    const real = save.train.cars[c.idx];
    if (!real) continue;
    if (c.down && !real.damaged) dmgCount++;
    real.damaged = c.down ? true : undefined;
    if (!c.down) delete real.damaged;
  }
  if (dmgCount) summary += `;${dmgCount} 节车厢受损待修`;

  if (result === 'victory') addInfluence(INF_FX.victory);   // 武威影响力
  if (B.tutorial && result === 'victory'){                  // 残骸回收:矿物 + 科研值
    const lt = TUT_LOOT[B.tutorial] || TUT_LOOT[1];
    save.treasury.metal = (save.treasury.metal || 0) + lt.metal;
    save.treasury.chem = (save.treasury.chem || 0) + lt.chem;
    save.research = (save.research || 0) + lt.rp;
    summary += `;残骸回收:稀有金属 +${fmtNum(lt.metal)} · 化合物 +${fmtNum(lt.chem)} · 科研值 +${fmtNum(lt.rp)}`;
  }
  if (B.pirate && result === 'victory'){                    // 基地被毁:10-30 分钟后易地重建
    const delay = Math.round(PIRATE_RESPAWN_MIN + Math.random() * (PIRATE_RESPAWN_MAX - PIRATE_RESPAWN_MIN));
    save.pirates[sys.id] = Date.now() + delay * 1000;
    addInfluence(INF_FX.victory);                           // 清剿巢穴双倍武威
    summary += `;基地化为残骸,残党将在 ${fmtDuration(delay)} 后于带内重建`;
  }
  if (isBoss && result === 'victory'){
    save.bossKills[sys.id] = true;
    if (sys.id === 'terminus')
      summary += '。环卫者沉默坠向站台,最后一段广播响彻所有频段:"下一班车,正点进站。"';
    if (sys.id === 'hengyao')
      summary += '。守望者解体的瞬间,第一站台的灯光次第亮起——它等的也许从来不是敌人。';
  }

  if (!B.pirate) delete save.pendingRaid;   // 主动清剿不消耗挂起的遭遇战
  pushLog(`${sys.name} ${isBoss ? 'Boss 战' : B.pirate ? '清剿海盗基地' : B.tutorial ? '陨星拦截' : '遭遇战'}(第 ${B.round} 回合):${summary}`);
  persistSave();
  blog('—— 战斗结束 ——');
  speak(result === 'victory' ? (isBoss ? 'Capital ship destroyed. Outstanding, Commander.' : B.pirate ? 'Stronghold eliminated.' : 'Hostiles neutralized.')
    : result === 'escape' ? 'Emergency disengage complete.'
    : result === 'withdraw' ? 'We held the line.'
    : 'Disengaged. Damage report incoming.');
  musicBattle(false);
  renderBattle();
  if (typeof tickUI === 'function') tickUI();
}

function blog(txt){ B.log.push(txt); if (B.log.length > 80) B.log.shift(); }

/* ════════ 战斗界面 ════════ */
function cardHtml(cid, handIdx){
  const c = CARDS[cid];
  const av = cardPlayable(cid);
  const col = CARD_RARITY[c.rarity].color;
  return `<div class="hcard ${av.ok ? '' : 'off'} ${B.targeting === handIdx ? 'aiming' : ''}" data-h="${handIdx}" style="--rc:${col}">
    <div class="hc-top"><span class="hc-name">${c.name}</span><span class="hc-cp">${c.cp === 0 ? '◇' : '◆'.repeat(c.cp)}</span></div>
    <div class="hc-desc">${c.desc}</div>
    ${av.ok ? '' : `<div class="hc-why">${av.why}</div>`}
    ${c.exhaust ? '<div class="hc-ex">限一次</div>' : ''}
  </div>`;
}
function renderBattle(){
  if (!B) return;
  const card = $('battle-card');
  const planning = B.phase === 'plan';

  const enemiesHtml = B.enemies.map((e, i) => {
    const dead = e.hp <= 0;
    const afx = e.affix ? `<span class="afx" style="--ac:${AFFIXES[e.affix].color}" title="${AFFIXES[e.affix].desc}">${AFFIXES[e.affix].name}</span>` : '';
    const phased = e.isBoss && B.boss.skill === 'phase' && B.round % 2 === 1 && !dead;
    let intent = '';
    if (!dead && e.intent){
      const intentCar = e.intent.carIdx !== undefined ? B.cars[e.intent.carIdx] : null;
      intent = e.intent.special
        ? `<div class="intent">☢ ${e.intent.special}</div>`
        : `<div class="intent">▸ 下回合:轰击「${intentCar ? carLabel(intentCar) : '—'}」 -${e.intent.dmg}</div>`;
    }
    const marks = [
      e.stunned ? '<span class="emark">⚡瘫痪</span>' : '',
      e.negated ? '<span class="emark">🪤诱离</span>' : '',
      phased ? '<span class="emark">◈相位盾</span>' : '',
      e.charging ? '<span class="emark">☢充能</span>' : '',
    ].join('');
    const focused = B.fx.focusIdx === i;
    return `<div class="efoe ${dead ? 'dead' : ''} ${e.isBoss ? 'boss' : ''} ${B.targeting !== null && !dead ? 'targetable' : ''} ${focused ? 'focused' : ''}" data-e="${i}">
      <div class="ehead"><span class="eicon">${e.icon}</span>${e.name}${afx}${focused ? ' 🎯' : ''}</div>
      <div class="hpbar"><div class="hpfill foe" style="width:${e.hp / e.maxHp * 100}%"></div></div>
      <div class="emeta">${dead ? '已击毁' : `HP ${e.hp}/${e.maxHp} · 火力 ${e.atk}`} ${marks}</div>
      ${intent}</div>`;
  }).join('');

  const carsHtml = B.cars.map(c => `
    <div class="bcar ${c.down ? 'down' : ''}">
      <div class="bcar-name">${CAR_TYPES[c.type].name}${c.wid ? ' · ' + WEAPONS[c.wid].name + ' LV' + c.wlv : ''}${c.immune ? ' 🛡' : ''}</div>
      <div class="hpbar"><div class="hpfill ${c.hp / c.maxHp < 0.35 ? 'low' : ''}" style="width:${c.hp / c.maxHp * 100}%"></div></div>
      <div class="bcar-hp">${c.down ? '⚠ 瘫痪' : c.hp + '/' + c.maxHp}</div>
    </div>`).join('');

  let bottom;
  if (B.phase === 'done'){
    const rTxt = { victory: B.boss ? '🏆 BOSS 击破' : '🏆 胜利', escape:'💨 脱离', withdraw:'🛡 守住了', defeat:'☠ 战败', 'defeat-light':'☠ 突围' }[B.result];
    const lootTxt = B.loot ? `<div class="bloot">${Object.entries(B.loot).map(([k, v]) => `<span style="color:${RESOURCES[k].color}">${RESOURCES[k].name} +${fmtNum(v)}</span>`).join(' · ')}</div>` : '';
    let choices = '';
    if (B.cardChoices && !B.chosen){
      choices = `<div class="sec-label" style="margin-top:.9rem">战利品 · 新的战术指令(选一张入组)</div>
        <div class="pick-row">${B.cardChoices.map(cid => {
          const c = CARDS[cid];
          return `<div class="hcard pick" data-pick="${cid}" style="--rc:${CARD_RARITY[c.rarity].color}">
            <div class="hc-top"><span class="hc-name">${c.name}</span><span class="hc-cp">${c.cp === 0 ? '◇' : '◆'.repeat(c.cp)}</span></div>
            <div class="hc-desc">${c.desc}</div>
            <div class="hc-rar" style="color:${CARD_RARITY[c.rarity].color}">${CARD_RARITY[c.rarity].name}</div>
          </div>`;
        }).join('')}</div>
        <div style="text-align:right;margin-top:.5rem"><button class="close-btn" id="b-skip">跳过</button></div>`;
    }
    bottom = `<div class="bresult">${rTxt}</div>${lootTxt}${choices}
      ${(!B.cardChoices || B.chosen) ? '<button class="act-btn cyan" id="b-close">返 回 驾 驶 室</button>' : ''}`;
  } else if (planning){
    const escOk = B.cp >= ESCAPE_COST && !B.escapePlanned && !B.cars.some(c => c.type === 'engine' && c.down);
    bottom = `
      <div class="sec-label">手牌 · 牌库 ${B.drawPile.length} / 弃牌 ${B.discardPile.length}</div>
      <div class="hand">${B.hand.map((cid, i) => cardHtml(cid, i)).join('') || '<div class="hint">手牌耗尽</div>'}</div>
      <div class="bfoot">
        <div class="cpline">指挥点 <span>${'◆'.repeat(B.cp)}${'◇'.repeat(Math.max(0, B.cpMax - B.cp))}</span>${B.targeting !== null ? ' · <b style="color:var(--red)">点击敌舰锁定目标</b>' : ''}${B.escapePlanned ? ' · <b style="color:var(--cyan)">回合末脱离</b>' : ''}</div>
        <div class="bfoot-btns">
          ${B.round === 1 && !B.boss ? `<button class="close-btn" id="b-auto">委托结算</button>` : ''}
          <button class="close-btn" id="b-escape" ${escOk ? '' : 'disabled'}>全速脱离 ◆◆</button>
          <button class="close-btn" id="b-hide">暂时收起</button>
          <button class="act-btn amber" id="b-go" style="width:auto;padding:.7rem 2.2rem">开 始 回 合</button>
        </div>
      </div>`;
  } else {
    bottom = `<div class="bfoot"><div class="cpline">交战中…</div></div>`;
  }

  card.innerHTML = `
    <h3>${B.boss ? 'BOSS 战' : '遭遇战'} · ${B.sys.name}<span class="en">ROUND ${B.round} / ${B.maxRounds}</span></h3>
    ${B.boss ? `<div class="boss-skill">⚠ ${B.boss.skillText}</div>` : ''}
    <div class="sec-label" style="margin-top:.8rem">敌方编队</div>
    <div class="efoes">${enemiesHtml}</div>
    <div class="sec-label">列车编组</div>
    <div class="bcars">${carsHtml}</div>
    <div class="blog" id="blog">${B.log.slice(-12).map(l => `<div>${l}</div>`).join('')}</div>
    ${bottom}`;

  const lg = $('blog'); if (lg) lg.scrollTop = lg.scrollHeight;
  card.querySelectorAll('.hcard[data-h]').forEach(el => el.onclick = () => playCard(+el.dataset.h));
  card.querySelectorAll('.efoe.targetable').forEach(el => el.onclick = () => lockTarget(+el.dataset.e));
  card.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => {
    save.deck.push(el.dataset.pick);
    B.chosen = true;
    persistSave();
    showToast(`「<b>${CARDS[el.dataset.pick].name}</b>」已加入指令卡组(共 ${save.deck.length} 张)`, {sfx:'unlock', say:'New tactic acquired.'});
    renderBattle();
  });
  const go = $('b-go'); if (go) go.onclick = startRound;
  const auto = $('b-auto'); if (auto) auto.onclick = autoResolveBattle;
  const esc = $('b-escape'); if (esc) esc.onclick = planEscape;
  const hide = $('b-hide'); if (hide) hide.onclick = () => $('battle-overlay').classList.remove('show');
  const skip = $('b-skip'); if (skip) skip.onclick = () => { B.chosen = true; renderBattle(); };
  const close = $('b-close'); if (close) close.onclick = () => {
    $('battle-overlay').classList.remove('show');
    B = null;
    if ($('train-overlay').classList.contains('show')) renderTrainCard();
  };
}
