/* ============================================================
   星际列车面板 — 编组可视化 / 武器安装升级 / 引擎 / 收取 / 日志
   界面原型:《Interstellar Train》武器更换系统(Slot + Upgrade)
   ============================================================ */
let selCar = 0;   // 选中车厢索引;-1 = 空位;-2 = 锁定位

const CAR_COLORS = { engine:'var(--amber)', cargo:'#b9a684', weapon:'#e08f8f', habitat:'#7fd6a8', eng:'#7fc4d6' };

function carSvg(type, car){
  const wheels = `<circle cx="26" cy="46" r="4.5" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/>
    <circle cx="74" cy="46" r="4.5" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/>`;
  const hull = (extra) => `<svg viewBox="0 0 100 54" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    ${extra}${wheels}</svg>`;
  switch(type){
    case 'engine': return hull(`
      <path class="hull" d="M8 40 V30 Q8 16 24 16 H80 Q92 16 92 28 V40 Z" fill="rgba(245,158,11,.07)"/>
      <path d="M8 31 Q20 24 30 24" opacity=".5"/>
      <rect x="64" y="22" width="18" height="9" rx="2" opacity=".7"/>
      <path d="M14 12 V16 M22 10 V16" opacity=".6"/>
      <path d="M2 36 L8 33 V40 Z" fill="currentColor" stroke="none" opacity=".8"/>`);
    case 'cargo': return hull(`
      <rect class="hull" x="8" y="16" width="84" height="24" rx="5" fill="rgba(185,166,132,.06)"/>
      <path d="M30 16 V40 M50 16 V40 M70 16 V40" opacity=".4"/>`);
    case 'weapon': {
      const turret = car && car.wid ? `
        <rect x="40" y="6" width="20" height="10" rx="3" fill="rgba(224,143,143,.15)"/>
        ${car.wid==='laser' ? '<path d="M60 10 H84" opacity=".9"/>'
          : car.wid==='missile' ? '<path d="M45 6 V0 M50 6 V0 M55 6 V0" opacity=".9"/>'
          : '<path d="M60 9 H76 M60 13 H72" opacity=".9"/>'}`
        : `<circle cx="50" cy="11" r="5" stroke-dasharray="2.5 2.5" opacity=".6"/>`;
      return hull(`
        <rect class="hull" x="8" y="16" width="84" height="24" rx="5" fill="rgba(224,143,143,.06)"/>
        ${turret}<path d="M20 28 H34 M66 28 H80" opacity=".35"/>`);
    }
    case 'habitat': return hull(`
      <rect class="hull" x="8" y="16" width="84" height="24" rx="8" fill="rgba(127,214,168,.06)"/>
      <circle cx="28" cy="28" r="4" opacity=".7"/><circle cx="50" cy="28" r="4" opacity=".7"/><circle cx="72" cy="28" r="4" opacity=".7"/>`);
    case 'eng': return hull(`
      <rect class="hull" x="8" y="16" width="84" height="24" rx="5" fill="rgba(127,196,214,.06)"/>
      <circle cx="50" cy="28" r="7" opacity=".75"/>
      <path d="M50 18 V21 M50 35 V38 M40 28 H43 M57 28 H60 M43 21 L45 23 M55 33 L57 35 M57 21 L55 23 M45 33 L43 35" opacity=".75"/>`);
  }
  return hull(`<rect class="hull" x="8" y="16" width="84" height="24" rx="5"/>`);
}

function openTrain(){
  selCar = 0;
  renderTrainCard();
  $('train-overlay').classList.add('show');
  sfx('open');
}

function trainStatusHtml(){
  const tr = save.train;
  if (tr.status === 'travel'){
    const prog = travelProgress();
    const left = Math.max(0, (tr.arriveAt - Date.now()) / 1000);
    return `航行中:<span>${sysById(tr.from).name}</span> → <span>${sysById(tr.to).name}</span> · 剩余 <span>${fmtDuration(left)}</span>
      <div class="bar" style="margin-top:.45rem"><div class="fill amber" id="t-progress" style="width:${(prog*100).toFixed(1)}%"></div></div>`;
  }
  const info = collectInfo(tr.sys);
  return `驻留于 <span class="ok">${sysById(tr.sys).name}</span> 星系 · 本地仓内待收取 <span>${fmtNum(info.avail)}</span>`;
}

function deckChipsHtml(){
  const counts = {};
  for (const id of save.deck) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).map(([id, n]) => {
    const c = CARDS[id];
    if (!c) return '';
    const col = CARD_RARITY[c.rarity].color;
    return `<div class="res-chip" title="${c.desc}" style="border-color:${col}55">
      <span class="rdot" style="background:${col}"></span>
      <span class="rv">${c.name}</span>${n > 1 ? `<span class="rn">×${n}</span>` : ''}</div>`;
  }).join('');
}

function treasuryHtml(){
  return Object.entries(RESOURCES).map(([k, r]) =>
    `<div class="res-chip"><span class="rdot" style="background:${r.color}"></span>
      <span class="rv">${fmtNum(save.treasury[k] || 0)}</span><span class="rn">${r.name}</span></div>`).join('');
}

function renderTrainCard(){
  const card = $('train-card');
  const tr = save.train;
  const slots = carSlots(), cars = tr.cars;

  // 编组条:已有车厢 + 可购空位 + 锁定位
  let strip = '';
  cars.forEach((c, i) => {
    const def = CAR_TYPES[c.type];
    const wlv = c.type === 'weapon' && c.wid ? `<div class="wlv">LV${c.wlv}</div>` : '';
    const dmg = c.damaged ? `<div class="dmg-badge">⚠ 受损</div>` : '';
    strip += `<div class="car ${selCar===i?'sel':''} ${c.damaged?'damaged':''}" data-i="${i}" style="color:${CAR_COLORS[c.type]}">
      ${wlv}${dmg}${carSvg(c.type, c)}<div class="car-name">${c.type==='engine' ? def.name+' LV'+tr.engineLv : c.type==='weapon'&&c.wid ? WEAPONS[c.wid].name : def.name}</div></div>`;
  });
  for (let i = cars.length; i < slots; i++)
    strip += `<div class="car empty ${selCar===-1?'sel':''}" data-i="-1" style="color:var(--text-muted)">
      <svg viewBox="0 0 100 54" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"><rect x="8" y="16" width="84" height="24" rx="5"/><path d="M50 21 V35 M43 28 H57" stroke-dasharray="0"/></svg>
      <div class="car-name">可加挂</div></div>`;
  for (let i = slots; i < 8; i++)
    strip += `<div class="car locked" data-i="-2" style="color:var(--text-muted)">
      <svg viewBox="0 0 100 54" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"><rect x="8" y="16" width="84" height="24" rx="5"/><path d="M44 28 a6 6 0 0 1 12 0 M42 28 h16 v8 h-16 z" stroke-dasharray="0"/></svg>
      <div class="car-name">未解锁</div></div>`;

  const info = tr.status === 'docked' ? collectInfo(tr.sys) : null;
  const canCollect = info && info.avail > 1 && info.cdLeft <= 0 && info.cap > 0;
  const collectLabel = tr.status !== 'docked' ? '航行中无法收取'
    : info.cdLeft > 0 ? `装载冷却 · ${fmtDuration(info.cdLeft)}`
    : info.avail <= 1 ? '本星系仓内无资源'
    : `收取本星系资源(上限 ${fmtNum(info.cap)})`;

  card.innerHTML = `
    <h3>晨昏号 · 星际列车<span class="en">INTERSTELLAR TRAIN</span></h3>
    <div class="train-status" id="t-status">${trainStatusHtml()}</div>
    <div class="train-strip" id="t-strip">${strip}</div>
    <div class="train-stats">
      <div class="tstat"><div class="k">火力</div><div class="v fp">${firepower()}</div></div>
      <div class="tstat"><div class="k">货舱容量</div><div class="v cg">${fmtNum(cargoCap())}</div></div>
      <div class="tstat"><div class="k">航速</div><div class="v sp">${trainSpeed().toFixed(1)} /分</div></div>
      <div class="tstat"><div class="k">防御</div><div class="v df">${defense()}</div></div>
    </div>
    <div class="sec-label">资源金库</div>
    <div class="treasury" id="t-treasury">${treasuryHtml()}</div>
    <div class="sec-label">指令卡组 · ${save.deck.length} 张(遭遇战胜利可获取新指令)</div>
    <div class="treasury">${deckChipsHtml()}${COLONY_FX.crew > 0 ? `<div class="res-chip" title="由各殖民地的乘员训练营培养"><span class="rdot" style="background:var(--green)"></span><span class="rv">${COLONY_FX.crew}</span><span class="rn">乘员储备 · 车组系统筹备中</span></div>` : ''}</div>
    <button class="act-btn amber" id="t-collect" ${canCollect?'':'disabled'}>${collectLabel}</button>
    <div id="t-detail">${carDetailHtml()}</div>
    <div class="tlog">
      <div class="sec-label" style="margin-top:1rem">航行日志</div>
      ${save.log.slice(0,6).map(l => `<div class="log-line"><b>${new Date(l.t).toLocaleTimeString('zh-CN',{hour12:false})}</b> ${l.txt}</div>`).join('') || '<div class="log-line">尚无记录 —— 列车整备完毕,等待第一次远航。</div>'}
    </div>
    <div class="close-row"><button class="close-btn">关闭</button></div>`;

  card.querySelectorAll('.car').forEach(el => {
    el.onclick = () => { selCar = +el.dataset.i; renderTrainCard(); };
  });
  const cbtn = $('t-collect');
  if (cbtn) cbtn.onclick = () => { doCollect(tr.sys); renderTrainCard(); };
  card.querySelector('.close-row .close-btn').onclick = () => $('train-overlay').classList.remove('show');
  bindDetailActions();
}

/* 车厢详情 / 商店 */
function carDetailHtml(){
  const tr = save.train;
  if (selCar === -2){
    return `<div class="car-detail"><h4>锁定车厢位<span class="sub">LOCKED</span></h4>
      <div class="cd-desc">${SLOT_RULE_TEXT}。<br>当前全银河开发等级和:<b style="color:var(--green)">${sumLevelsAll()}</b> → 可挂载 ${carSlots()} 节。继续发展殖民地以扩编列车。</div></div>`;
  }
  if (selCar === -1){
    const cost = nextCarCost();
    if (!cost) return `<div class="car-detail"><h4>加挂车厢</h4><div class="cd-desc">编组已达框架上限。</div></div>`;
    const opts = ['cargo','weapon','habitat','eng'].map(t => {
      const def = CAR_TYPES[t];
      return `<div class="opt">
        <div class="ol">${def.name}<span class="od">${def.desc}</span></div>
        <div class="cost">${costHtml(cost)}</div>
        <button data-buy="${t}" ${canAfford(cost)?'':'disabled'}>加挂</button>
      </div>`;
    }).join('');
    return `<div class="car-detail"><h4>加挂第 ${carCount()+1} 节车厢<span class="sub">NEW CAR</span></h4>
      <div class="cd-desc">选择车厢类型。造价随编组长度递增。</div>
      <div class="opt-row">${opts}</div></div>`;
  }
  const car = tr.cars[selCar];
  if (!car) return '';
  const def = CAR_TYPES[car.type];

  // 受损车厢:先修复,其余操作全部挂起
  if (car.damaged){
    const cost = repairCarCost(car);
    return `<div class="car-detail"><h4>${def.name} · ⚠ 受损<span class="sub">DAMAGED</span></h4>
      <div class="cd-desc">该车厢在遭遇战中被击瘫:功能完全失效${car.type==='engine' ? ',列车半速航行' : ''},修复前无法升级。</div>
      <div class="opt-row"><div class="opt">
        <div class="ol">船坞修复<span class="od">恢复全部功能</span></div>
        <div class="cost">${costHtml(cost)}</div>
        <button data-repair="1" ${canAfford(cost)?'':'disabled'}>修复</button>
      </div></div></div>`;
  }

  if (car.type === 'engine'){
    const lv = tr.engineLv;
    let opt;
    if (lv >= ENGINE_MAXLV) opt = `<div class="opt"><div class="ol">引擎已达最高等级<span class="od">曲率帆全展 —— 银河任意角落都在航程之内。</span></div></div>`;
    else {
      const cost = engineCostOf(lv+1);
      const unlocks = SYSTEMS.filter(s => s.req && s.req.engine === lv+1).map(s => s.name).join('、');
      opt = `<div class="opt">
        <div class="ol">升级引擎 → LV${lv+1}<span class="od">航速 ${engineSpeed(lv).toFixed(1)} → ${engineSpeed(lv+1).toFixed(1)} 单位/分${unlocks ? ' · 解锁航线:'+unlocks : ''}</span></div>
        <div class="cost">${costHtml(cost)}</div>
        <button data-engup="1" ${canAfford(cost)?'':'disabled'}>升级</button>
      </div>`;
    }
    return `<div class="car-detail"><h4>${def.name} · LV${lv}<span class="sub">${def.en}</span></h4>
      <div class="cd-desc">${def.desc}</div><div class="opt-row">${opt}</div></div>`;
  }

  if (car.type === 'weapon'){
    if (!car.wid){
      const opts = Object.entries(WEAPONS).map(([wid, w]) => {
        const un = weaponUnlocked(wid);
        const cost = weaponCost(wid, 1);
        return `<div class="opt ${un?'':'locked'}">
          <div class="ol">${w.name} <span style="font-family:var(--mono);font-size:.58rem;color:var(--text-muted)">${w.en} · 火力 ${w.fp}/级</span>
            <span class="od">${un ? w.desc : '🔒 ' + w.unlock.text}</span></div>
          <div class="cost">${un ? costHtml(cost) : ''}</div>
          <button data-install="${wid}" ${un && canAfford(cost) ? '' : 'disabled'}>安装</button>
        </div>`;
      }).join('');
      return `<div class="car-detail"><h4>${def.name} · 空载<span class="sub">${def.en}</span></h4>
        <div class="cd-desc">${def.desc}</div><div class="opt-row">${opts}</div></div>`;
    }
    const w = WEAPONS[car.wid];
    let opt;
    if (car.wlv >= WEAPON_MAXLV) opt = `<div class="opt"><div class="ol">已达最高等级<span class="od">这门炮的名字,会出现在袭击者的噩梦里。</span></div></div>`;
    else {
      const cost = weaponCost(car.wid, car.wlv+1);
      opt = `<div class="opt">
        <div class="ol">升级 → LV${car.wlv+1}<span class="od">火力 ${w.fp*car.wlv} → ${w.fp*(car.wlv+1)}</span></div>
        <div class="cost">${costHtml(cost)}</div>
        <button data-wup="1" ${canAfford(cost)?'':'disabled'}>升级</button>
      </div>`;
    }
    return `<div class="car-detail"><h4>${w.name} · LV${car.wlv}<span class="sub">${w.en} · 火力 ${w.fp*car.wlv}</span></h4>
      <div class="cd-desc">${w.desc}</div><div class="opt-row">${opt}</div></div>`;
  }

  // cargo / habitat / eng
  const effect = car.type==='cargo' ? `装载容量 +${CAR_TYPES.cargo.cap}(引擎等级再 +25%/级)`
    : car.type==='habitat' ? `收取冷却 -${CAR_TYPES.habitat.cdRed}s · 防御 +${CAR_TYPES.habitat.def}`
    : `靠站收取量 +${CAR_TYPES.eng.collectBuff*100}%`;
  return `<div class="car-detail"><h4>${def.name}<span class="sub">${def.en}</span></h4>
    <div class="cd-desc">${def.desc}<br><b style="color:var(--text-dim)">当前效果:</b>${effect}</div></div>`;
}

function bindDetailActions(){
  const card = $('train-card');
  card.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    if (buyCar(b.dataset.buy)){
      selCar = carCount() - 1;
      showToast(`已加挂 <b>${CAR_TYPES[b.dataset.buy].name}</b> · 现编组 ${carCount()} 节`, {sfx:'confirm', say:'Car coupled.'});
      renderTrainCard();
    } else sfx('err');
  });
  card.querySelectorAll('[data-install]').forEach(b => b.onclick = () => {
    if (installWeapon(selCar, b.dataset.install)){
      showToast(`武器平台装备 <b>${WEAPONS[b.dataset.install].name}</b>`, {sfx:'confirm', say:'Weapon online.'});
      renderTrainCard();
    } else sfx('err');
  });
  const wup = card.querySelector('[data-wup]');
  if (wup) wup.onclick = () => {
    if (upgradeWeapon(selCar)){
      const car = save.train.cars[selCar];
      showToast(`<b>${WEAPONS[car.wid].name}</b> 升级至 LV${car.wlv}`, {sfx:'levelup', say:'Weapon upgraded.'});
      renderTrainCard();
    } else sfx('err');
  };
  const eup = card.querySelector('[data-engup]');
  if (eup) eup.onclick = () => {
    if (upgradeEngine()){
      showToast(`引擎升级至 <b>LV${save.train.engineLv}</b> · 航速 ${trainSpeed().toFixed(1)} 单位/分`, {sfx:'levelup', say:'Engine upgraded.'});
      renderTrainCard();
    } else sfx('err');
  };
  const rep = card.querySelector('[data-repair]');
  if (rep) rep.onclick = () => {
    if (repairCar(selCar)){
      showToast(`<b>${CAR_TYPES[save.train.cars[selCar].type].name}</b> 修复完成`, {sfx:'confirm', say:'Repairs complete.'});
      renderTrainCard();
    } else sfx('err');
  };
}

/* 每秒轻量刷新(不重建 DOM,避免打断点击) */
function refreshTrainDynamic(){
  const st = $('t-status');
  if (st) st.innerHTML = trainStatusHtml();
  const tre = $('t-treasury');
  if (tre) tre.innerHTML = treasuryHtml();
  const tr = save.train;
  const cbtn = $('t-collect');
  if (cbtn){
    const info = tr.status === 'docked' ? collectInfo(tr.sys) : null;
    const can = info && info.avail > 1 && info.cdLeft <= 0 && info.cap > 0;
    cbtn.disabled = !can;
    cbtn.textContent = tr.status !== 'docked' ? '航行中无法收取'
      : info.cdLeft > 0 ? `装载冷却 · ${fmtDuration(info.cdLeft)}`
      : info.avail <= 1 ? '本星系仓内无资源'
      : `收取本星系资源(上限 ${fmtNum(info.cap)})`;
  }
}
