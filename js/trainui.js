/* ============================================================
   星际列车面板 — 编组可视化 / 武器安装升级 / 引擎 / 收取 / 日志
   界面原型:《Interstellar Train》武器更换系统(Slot + Upgrade)
   ============================================================ */
let selCar = 0;   // 选中车厢索引;-1 = 空位;-2 = 锁定位
let _buildLv = 1;  // 建造等级选择(方案 B:可造低级省资源)

/* 车厢配色:货=黄棕 / 载人=浅绿 / 战斗=红 / 通用=车头同款橙 */
const CAR_COLORS = { engine:'var(--amber)', cargo:'#c9974a', weapon:'#e85959', habitat:'#8fe3b0', eng:'#7fc4d6', general:'#f59e0b', cryo:'#7fd6c9', lab:'#5ed0ee' };

/* 车厢几何符号(列车标牌用):嵌套方形=货 / 方框人形=载人 / 方框三角=战斗 */
const CCELL_ICONS = {
  cargo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>`,
  person:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="12" cy="9.5" r="2.4"/><path d="M7.5 18c.8-3 2.8-4.3 4.5-4.3s3.7 1.3 4.5 4.3"/></svg>`,
  weapon:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M12 7.5l5 9H7z"/></svg>`,
  general: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7.5 11h9M7.5 15h9"/><path d="M12 7.5l4-3M14.5 7.5h-5"/></svg>`,
  eng:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="12" cy="12" r="3.4"/><path d="M12 6.5v2M12 15.5v2M6.5 12h2M15.5 12h2"/></svg>`,
  cryo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  lab:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><ellipse cx="12" cy="12" rx="5.5" ry="2.4"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>`,
};
function ccellIcon(c){
  if (c.paxMode || c.type === 'habitat') return CCELL_ICONS.person;
  return CCELL_ICONS[c.type] || CCELL_ICONS.general;
}

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
    case 'general': {
      const gun = car && car.wid ? `<rect x="44" y="8" width="12" height="8" rx="2" opacity=".7"/><path d="M56 11 H68" opacity=".8"/>` : '';
      return hull(`
      <rect class="hull" x="8" y="16" width="84" height="24" rx="6" fill="rgba(154,176,214,.06)"/>
      ${gun}<rect x="14" y="22" width="10" height="7" rx="1.5" opacity=".6"/><rect x="28" y="22" width="10" height="7" rx="1.5" opacity=".6"/>
      <path d="M46 24 H86 M46 31 H86" opacity=".35"/>`);
    }
    case 'cryo': return hull(`
      <rect class="hull" x="8" y="16" width="84" height="24" rx="9" fill="rgba(127,214,201,.06)"/>
      <circle cx="22" cy="28" r="4.5" opacity=".7"/><circle cx="40" cy="28" r="4.5" opacity=".7"/><circle cx="58" cy="28" r="4.5" opacity=".7"/><circle cx="76" cy="28" r="4.5" opacity=".7"/>
      <path d="M22 25 v6 M40 25 v6 M58 25 v6 M76 25 v6" opacity=".45"/>`);
    case 'lab': return hull(`
      <rect class="hull" x="8" y="16" width="84" height="24" rx="5" fill="rgba(94,208,238,.06)"/>
      <ellipse cx="50" cy="28" rx="14" ry="5" opacity=".7"/><circle cx="50" cy="28" r="2" fill="currentColor" stroke="none" opacity=".8"/>
      <path d="M20 10 V16 M24 12 V16" opacity=".5"/>`);
  }
  return hull(`<rect class="hull" x="8" y="16" width="84" height="24" rx="5"/>`);
}

function openTrain(){
  selCar = 0;
  renderTrainCard();
  $('train-overlay').classList.add('show');
  sfx('open');
  speak('Systems online.');
  tickBlueprintLayer();
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
  const dp = dockedPlanet();
  const where = localTransit()
    ? `轨道转移中 → <span>${(planetsOf(tr.sys).find(x=>x.id===tr.localTo)||{}).name || ''}</span> · ${Math.ceil(Math.max(0,(tr.localArriveAt-Date.now())/1000))}s`
    : `泊于 <span class="ok">${dp ? dp.name : '?'}</span> 轨道`;
  const crew = `<span class="ok">乘员 ${crewTeams()} 组(全车维护)</span>`;
  const holdTxt = Object.entries(holdOf()).filter(([,v]) => v >= 1)
    .map(([k,v]) => `<span style="color:${RESOURCES[k].color}">${RESOURCES[k].name} ${fmtNum(Math.floor(v))}</span>`).join(' · ');
  return `驻留 <span class="ok">${sysById(tr.sys).name}</span> 星系 · ${where} · 随车移民 <span>${fmtNum(tr.pax)}</span>/${fmtNum(paxCapacity())} · ${crew}<br>货舱 <span>${fmtNum(holdTotal())}/${fmtNum(cargoCap())}</span>${holdTxt ? '(' + holdTxt + ')' : ''} · 本系仓内待收取 <span>${fmtNum(info.avail)}</span> · 弹药 <span>${tr.ammo}/${ammoMax()}</span>${tr.ammo < ammoMax() ? '<span class="ammo-dot" title="弹药不满 —— 停靠军事区锚地补充"></span>' : ''}${anchorHasArsenal() ? ' <span class="ok">(军事区补给中)</span>' : ''}`;
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
  const chips = Object.entries(RESOURCES).map(([k, r]) =>
    `<div class="res-chip"><span class="ricon" style="color:${r.color}">${RES_ICONS[k]}</span>
      <span class="rv">${fmtNum(save.treasury[k] || 0)}</span><span class="rn">${r.name}</span></div>`).join('');
  return chips + `<div class="res-chip" title="由科研区与科研建筑积累,用于列车研发"><span class="ricon" style="color:var(--cyan)">${RP_ICON}</span>
      <span class="rv">${fmtNum(save.research || 0)}</span><span class="rn">科研值 +${(typeof rpRate==='function'?rpRate():COLONY_FX.rp).toFixed(2)}/s</span></div>`
    + `<div class="res-chip" title="来自剧情抉择、开拓殖民、物流运输与战斗胜利;可远程加速建设与工期"><span class="ricon" style="color:var(--purple)">${DIST_ICONS.trade}</span>
      <span class="rv">${fmtNum(save.influence || 0)}</span><span class="rn">影响力</span></div>`;
}

/* ── 船官:在岗 3 槽 + 名册(点击上岗/卸任) ── */
function officersHtml(){
  const of = save.officers || { owned: [], active: [] };
  if (!of.owned.length) return '';
  const av = id => `<img src="img/off_${id}.jpg" onerror="this.style.display='none'" style="width:24px;height:32px;object-fit:cover;border-radius:4px;vertical-align:-10px;margin-right:.4rem">`;
  const slot = id => {
    const o = OFFICERS[id];
    return `<button data-offdown="${id}" class="close-btn" style="color:var(--green);border-color:rgba(62,207,142,.5);display:inline-flex;align-items:center" title="${o.desc} —— 点击卸任">${av(id)}${o.nick}${o.name} · ${o.role}</button>`;
  };
  const bench = of.owned.filter(id => !of.active.includes(id)).map(id => {
    const o = OFFICERS[id];
    const full = of.active.length >= OFFICER_SLOTS;
    return `<button data-offup="${id}" class="close-btn" ${full ? 'disabled' : ''} style="opacity:${full ? .5 : .85};display:inline-flex;align-items:center" title="${o.desc}${full ? ' —— 在岗已满,先卸任一人' : ' —— 点击上岗'}">${av(id)}${o.nick}${o.name} · ${o.role}</button>`;
  }).join('');
  return `<div class="divider"></div><div class="sec-label" style="--c:var(--green)">船官 · 在岗 ${of.active.length}/${OFFICER_SLOTS}</div>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap">${of.active.map(slot).join('') || '<span class="bld locked" style="border:none;padding:0">无人在岗 —— 从名册点击上岗</span>'}</div>
    ${bench ? `<div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.4rem;border-top:1px dashed rgba(255,255,255,.08);padding-top:.4rem">${bench}</div>` : ''}`;
}
/* 列车研发(科研值立项 → 工期 → 影响力可加速) */
function techHtml(){
  const q = save.techQueue;
  return Object.entries(TRAIN_TECHS).map(([id, t]) => {
    const lv = techLv(id);
    const maxed = lv >= t.max;
    if (q && q.id === id){
      return `<div class="opt">
        <div class="ol">${t.name} → LV${q.to} <span style="font-family:var(--mono);font-size:.58rem;color:var(--amber)">研发中 ${(queueProg(q)*100).toFixed(0)}%</span>
          <span class="od">剩余 ${fmtDuration(queueRemain(q))}</span></div>
        <div class="cost"><span class="${(save.influence||0) >= accelCost(q) ? 'ok' : 'no'}">影响力 ${accelCost(q)}</span></div>
        <button data-taccel="1" ${(save.influence||0) >= accelCost(q) ? '' : 'disabled'}>加速</button>
      </div>`;
    }
    const cost = maxed ? 0 : techCost(id, lv + 1);
    return `<div class="opt ${maxed ? 'locked' : ''}">
      <div class="ol">${t.name} <span style="font-family:var(--mono);font-size:.58rem;color:${lv > 0 ? 'var(--cyan)' : 'var(--text-muted)'}">LV ${lv}/${t.max}</span>
        <span class="od">${t.desc}${maxed ? '' : ' · 工期 ' + fmtDuration(techTime(lv + 1))}</span></div>
      <div class="cost">${maxed ? '<span class="ok">已满级</span>' : `<span class="${(save.research||0) >= cost ? 'ok' : 'no'}">科研值 ${fmtNum(cost)}</span>`}</div>
      <button data-tech="${id}" ${!maxed && !q && (save.research||0) >= cost ? '' : 'disabled'}>立项</button>
    </div>`;
  }).join('');
}
/* 升级工期行(引擎/武器共用) */
function upgradeRowHtml(){
  const up = save.upgrade;
  if (!up) return '';
  const label = up.kind === 'engine' ? `引擎升级 → LV${up.to}` : `${WEAPONS[up.wid].name} ${up.to === 1 ? '安装' : '升级 → LV' + up.to}`;
  return `<div class="opt">
    <div class="ol">⚒ ${label} <span style="font-family:var(--mono);font-size:.58rem;color:var(--amber)">${(queueProg(up)*100).toFixed(0)}%</span>
      <span class="od">剩余 ${fmtDuration(queueRemain(up))}</span></div>
    <div class="cost"><span class="${(save.influence||0) >= accelCost(up) ? 'ok' : 'no'}">影响力 ${accelCost(up)}</span></div>
    <button data-uaccel="1" ${(save.influence||0) >= accelCost(up) ? '' : 'disabled'}>加速</button>
  </div>`;
}

function renderTrainCard(){
  const card = $('train-card');
  const tr = save.train;
  const slots = carSlots(), cars = tr.cars;

  // 编组条:已有车厢 + 可购空位 + 锁定位
  let strip = '';
  cars.forEach((c, i) => {
    const def = CAR_TYPES[c.type];
    const lvb = `<div class="wlv">LV${c.type === 'engine' ? tr.engineLv : (c.clv || 1)}</div>`;   // 所有车厢常驻等级角标
    const pax = c.paxMode ? `<div class="wlv pax-b" style="color:#7fd6c9;border-color:rgba(127,214,201,.4)">载人</div>` : '';
    const dmg = c.damaged ? `<div class="dmg-badge">⚠ 受损</div>` : '';
    strip += `<div class="car ${selCar===i?'sel':''} ${c.damaged?'damaged':''}" data-i="${i}" style="color:${CAR_COLORS[c.type]}">
      ${lvb}${pax}${dmg}${carSvg(c.type, c)}<div class="car-name">${c.type==='engine' ? def.name : (c.type==='weapon'&&c.wid&&!c.paxMode ? WEAPONS[c.wid].name : def.name)}</div></div>`;
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
  const canCollect = info && info.avail > 1 && info.cdLeft <= 0 && info.space > 0;
  const collectLabel = tr.status !== 'docked' ? '航行中无法收取'
    : info.cdLeft > 0 ? `装载冷却 · ${fmtDuration(info.cdLeft)}`
    : info.avail <= 1 ? '本星系仓内无资源'
    : info.space <= 0 ? '货舱已满 —— 先卸货或入库'
    : `收取本星系资源(货舱余位 ${fmtNum(info.space)})`;
  const canBank = holdTotal() >= 1 && canBankHere();

  card.innerHTML = `
    <h3>晨昏号 · 星际列车<span class="en">INTERSTELLAR TRAIN</span></h3>
    <div class="train-status" id="t-status">${trainStatusHtml()}</div>
    <div class="train-strip" id="t-strip">${strip}</div>
    <div class="train-stats">
      <div class="tstat"><div class="k">火力</div><div class="v fp">${firepower()}</div></div>
      <div class="tstat"><div class="k">货舱容量</div><div class="v cg">${fmtNum(cargoCap())}</div></div>
      <div class="tstat"><div class="k">航速</div><div class="v sp">${trainSpeed().toFixed(1)} /分</div></div>
      <div class="tstat"><div class="k">防御</div><div class="v df">${defense()}</div></div>
      <div class="tstat"><div class="k">载客</div><div class="v" style="color:#7fd6c9">${fmtNum(tr.pax)}/${fmtNum(paxCapacity())}</div></div>
      <div class="tstat"><div class="k">弹药${tr.ammo < ammoMax() ? '<span class="ammo-dot" title="弹药不满 —— 停靠军事区锚地补充"></span>' : ''}</div><div class="v" style="color:${tr.ammo>0?'var(--text)':'var(--red)'}">${tr.ammo}/${ammoMax()}</div></div>
      <div class="tstat"><div class="k">乘员组</div><div class="v" style="color:var(--green)">${crewTeams()}</div></div>
    </div>
    <div style="display:flex;gap:.5rem;margin:.1rem 0 .7rem;flex-wrap:wrap">
      <button class="close-btn" id="t-tagtoggle">地图列车标牌:${save.ui.tag ? '开' : '关'}</button>
      <button class="close-btn" id="t-routetoggle" style="${save.ui.routes ? 'color:var(--cyan);border-color:rgba(34,211,238,.4)' : ''}">航线履历:${save.ui.routes ? '显示中' : '隐藏'}</button>
    </div>
    <div class="sec-label">资源金库</div>
    <div class="treasury" id="t-treasury">${treasuryHtml()}</div>
    <div class="sec-label">指令卡组 · ${save.deck.length} 张(遭遇战胜利可获取新指令)</div>
    <div class="treasury">${deckChipsHtml()}${COLONY_FX.crew > 0 ? `<div class="res-chip" title="由各殖民地的乘员训练营培养"><span class="rdot" style="background:var(--green)"></span><span class="rv">${COLONY_FX.crew}</span><span class="rn">乘员储备 · 车组系统筹备中</span></div>` : ''}</div>
    <button class="act-btn amber" id="t-collect" ${canCollect?'':'disabled'}>${collectLabel}</button>
    <button class="act-btn cyan" id="t-bank" ${canBank?'':'disabled'} title="需停靠有星港的锚地或母港">${holdTotal() >= 1 ? `货舱入库金库(${fmtNum(holdTotal())})` : '货舱为空'}</button>
    <div class="sec-label" style="margin-top:1rem;--c:var(--cyan)">列车研发 · 科研值立项,工期先快后慢,影响力可加速</div>
    <div class="opt-row" id="t-techs">${techHtml()}</div>
    ${save.upgrade ? `<div class="sec-label" style="margin-top:.8rem;--c:var(--amber)">升级工坊</div><div class="opt-row" id="t-upgrade">${upgradeRowHtml()}</div>` : ''}
    ${depotHtml()}
    <div id="t-detail">${carDetailHtml()}</div>
    ${officersHtml()}
    <div class="tlog">
      <div class="sec-label" style="margin-top:1rem">航行日志</div>
      ${save.log.slice(0,6).map(l => `<div class="log-line"><b>${new Date(l.t).toLocaleTimeString('zh-CN',{hour12:false})}</b> ${l.txt}</div>`).join('') || '<div class="log-line">尚无记录 —— 列车整备完毕,等待第一次远航。</div>'}
    </div>
    <div class="close-row"><button class="close-btn">关闭</button></div>`;

  card.querySelectorAll('.car').forEach(el => {
    el.onclick = () => { selCar = +el.dataset.i; sfx('blip'); renderTrainCard(); };
  });
  $('t-tagtoggle').onclick = () => {
    save.ui.tag = !save.ui.tag; persistSave();
    refreshTrainTag(); renderTrainCard(); sfx('blip');
    speak(save.ui.tag ? 'Beacon on.' : 'Beacon off.');
  };
  $('t-routetoggle').onclick = () => {
    save.ui.routes = !save.ui.routes; persistSave();
    if (typeof buildRouteHistory === 'function') buildRouteHistory();
    renderTrainCard(); sfx('blip');
    speak(save.ui.routes ? 'Route history displayed.' : 'Route history hidden.');
  };
  const cbtn = $('t-collect');
  if (cbtn) cbtn.onclick = () => { doCollect(tr.sys); renderTrainCard(); };
  const bbtn = $('t-bank');
  if (bbtn) bbtn.onclick = () => {
    const moved = bankHold();
    if (moved){ showToast('货舱物资已入库金库', {sfx:'confirm', say:'Cargo transferred to treasury.'}); renderTrainCard(); }
    else sfx('err');
  };
  card.querySelector('.close-row .close-btn').onclick = () => $('train-overlay').classList.remove('show');
  bindDetailActions();
}

/* 车厢升级选项(全类型 5 级,+30%/级) */
function carUpOptHtml(car){
  const lv = carTechLv(car.type);
  if (lv >= CAR_MAXLV) return `<div class="opt locked"><div class="ol">改装方案已满级 LV${lv}<span class="od">全列 ${CAR_TYPES[car.type].name} 效果 ×${carEffOf(lv).toFixed(1)}</span></div></div>`;
  const cost = carTechCost(lv + 1);
  const n = trainCars().filter(x => x.type === car.type).length;
  return `<div class="opt"><div class="ol">研发改装方案 → LV${lv + 1}<span class="od">消耗科研值,完成后全列 ${n} 节同型车厢自动升级 · 效果 ×${carEffOf(lv).toFixed(1)} → ×${carEffOf(lv + 1).toFixed(1)} · 研发 ${fmtDuration(carTechTime(lv + 1))}(走研发槽)</span></div>
    <div class="cost"><span class="${(save.research||0) >= cost ? 'ok' : 'no'}">科研值 ${fmtNum(cost)}</span></div>
    <button data-carresearch="${car.type}" ${(save.research||0) >= cost && !save.techQueue ? '' : 'disabled'}>研发</button></div>`;
}
/* 车厢替换:只能与车厢库现成车厢交换;没建造的先建造入库 */
function replaceOptHtml(car){
  const p = refitPlanet();
  if (!p) return `<div class="bld locked" style="margin-top:.45rem">○ 车厢替换/建造:需停靠「有工业区划的类地行星」</div>`;
  const cost = refitCost(carCount());
  const costTxt = Object.entries(cost).map(([k, v]) => RESOURCES[k].name + ' ' + fmtNum(v)).join(' + ');
  const list = (save.depot && save.depot[p.key]) || [];
  const stock = list.map((c, i) =>
    `<button data-replace="${i}" ${canAfford(cost) && !save.upgrade ? '' : 'disabled'} title="${CAR_TYPES[c.type].desc}">${CAR_TYPES[c.type].name} LV${c.clv || 1}${c.wid ? '·' + WEAPONS[c.wid].name : ''}</button>`).join('');
  const lvChips = [1,2,3,4,5].map(l =>
    `<button data-buildlv="${l}" class="close-btn" style="padding:.25rem .6rem;${_buildLv === l ? 'color:var(--cyan);border-color:rgba(34,211,238,.55)' : ''}">LV${l}</button>`).join('');
  const buildBtns = ['cargo','general','weapon','lab','eng','habitat','cryo'].map(t => {
    const lock = !carUnlocked(t);
    const techLv = carTechLv(t);
    const lv = Math.min(_buildLv, techLv);
    const bc = carBuildCost(t, lv);
    const bcTxt = Object.entries(bc).map(([k, v]) => RESOURCES[k].name + ' ' + fmtNum(v)).join('+');
    return `<button data-build="${t}" ${!lock && canAfford(bc) && !save.upgrade ? '' : 'disabled'}
      title="${lock ? '引擎 LV' + CAR_UNLOCK[t] + ' 解锁' : '建造 LV' + lv + (lv < _buildLv ? '(方案上限 LV' + techLv + ')' : '') + ' · ' + bcTxt + ' · 工期 ' + fmtDuration(carBuildTime(lv))}">${lock ? '🔒' : '⚒'} ${CAR_TYPES[t].name} LV${lv}</button>`;
  }).join('');
  return `<div class="opt"><div class="ol">替换车厢 —— 与 <b>${p.name}</b> 车厢库现货交换<span class="od">作业费 ${costTxt};没建造的车厢需先建造入库(下方 ⚒)</span>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.45rem">${stock || '<span class="bld locked">库内无现货</span>'}</div>
    <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.5rem;align-items:center"><span class="eco-sub" style="margin:0">建造等级</span>${lvChips}</div>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.4rem;opacity:.85">${buildBtns}</div></div></div>`;
}
/* 武器库:具名武器(战利品)列表,战斗车厢详情页装备 */
function armoryHtml(){
  if (!save.armory || !save.armory.length) return '';
  const items = save.armory.map((uid, i) => {
    const uw = UNIQUE_WEAPONS[uid];
    if (!uw) return '';
    return `<div class="opt"><div class="ol" style="color:var(--amber)">★ ${uw.name}<span class="od">${WEAPONS[uw.base].name}基座 · 火力 ×${uw.mult} · 来源:${uw.src} —— ${uw.desc}</span></div>
      <button data-equip="${i}">装备</button></div>`;
  }).join('');
  return `<div class="opt locked" style="border:none;padding:.2rem 0"><div class="ol">武器库(具名战利品 ${save.armory.length} 件)</div></div>` + items;
}
function carDetailHtml(){
  let core = carDetailCore();
  const car = save.train.cars[selCar];
  // 车厢图鉴头图(7 类,引擎暂无)
  if (selCar >= 0 && car && CAR_TYPES[car.type])
    core = core.replace('<div class="car-detail">',
      '<div class="car-detail">' + artBanner(car.type === 'engine' ? 'img/engine_loco.jpg' : 'img/car_' + car.type + '.jpg', CAR_TYPES[car.type].name + (CAR_TYPES[car.type].en ? ' · ' + CAR_TYPES[car.type].en : ''), 88));
  if (selCar < 0 || !car || car.type === 'engine' || car.damaged) return core;
  const extras = `<div class="opt-row" style="margin-top:.55rem">${carUpOptHtml(car)}${replaceOptHtml(car)}</div>`;
  return core.replace(/<\/div>\s*$/, extras + '</div>');
}
/* 车厢详情 / 商店 */
function carDetailCore(){
  const tr = save.train;
  if (selCar === -2){
    return `<div class="car-detail"><h4>锁定车厢位<span class="sub">LOCKED</span></h4>
      <div class="cd-desc">${SLOT_RULE_TEXT}。<br>当前全银河开发等级和:<b style="color:var(--green)">${sumLevelsAll()}</b> → 可挂载 ${carSlots()} 节。继续发展殖民地以扩编列车。</div></div>`;
  }
  if (selCar === -1){
    const cost = nextCarCost();
    if (!cost) return `<div class="car-detail"><h4>加挂车厢</h4><div class="cd-desc">编组已达框架上限。</div></div>`;
    const opts = ['cargo','general','weapon','lab','eng','habitat','cryo'].map(t => {
      const def = CAR_TYPES[t];
      const lock = !carUnlocked(t);
      return `<div class="opt ${lock ? 'locked' : ''}">
        <div class="ol">${def.name}${lock ? ` <span style="color:var(--text-muted)">🔒 引擎 LV${CAR_UNLOCK[t]} 解锁</span>` : ''}<span class="od">${def.desc}</span></div>
        <div class="cost">${lock ? '' : costHtml(cost)}</div>
        <button data-buy="${t}" ${!lock && canAfford(cost) ? '' : 'disabled'}>加挂</button>
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
        <button data-engup="1" ${canAfford(cost)&&!save.upgrade?'':'disabled'}>升级</button>
      </div>`;
    }
    const rl = tr.rpLv || 0;
    let ropt;
    if (rl >= RPCOEF_MAX) ropt = `<div class="opt locked"><div class="ol">科研主机已满级<span class="od">全列科研 ×${(1 + 0.2 * rl).toFixed(1)}</span></div></div>`;
    else {
      const rc = rpcoefCost(rl + 1);
      ropt = `<div class="opt"><div class="ol">科研主机 → LV${rl + 1}<span class="od">全列科研 ×${(1 + 0.2 * rl).toFixed(1)} → ×${(1 + 0.2 * (rl + 1)).toFixed(1)} · 工期 ${fmtDuration(rpcoefTime(rl + 1))}</span></div>
        <div class="cost">${costHtml(rc)}</div>
        <button data-rpup="1" ${canAfford(rc) && !save.upgrade ? '' : 'disabled'}>升级</button></div>`;
    }
    return `<div class="car-detail"><h4>${def.name} · LV${lv}<span class="sub">${def.en}</span></h4>
      <div class="cd-desc">${def.desc}</div><div class="opt-row">${opt}${ropt}</div></div>`;
  }

  // 载人模式切换(仅运输车厢:载货 ⇄ 载人 1000;载人时不运货)
  const paxToggle = (car.type === 'cargo')
    ? `<div class="opt"><div class="ol">${car.paxMode ? '恢复原始用途' : `改装为载人模式(${CAR_TYPES[car.type].pax} 人)`}
        <span class="od">${car.paxMode ? '拆除座席,恢复' + (car.type==='cargo'?'货运':'武器') + '功能' : '加装维生座席 —— 改装后' + (car.type==='cargo'?'无法运货':'武器离线') + '(原舱本为弹药与货物设计)'}</span></div>
        <button data-paxmode="1">${car.paxMode ? '恢复' : '改装'}</button></div>`
    : '';

  if (car.type === 'general'){
    let wopt;
    if (!car.wid){
      const un = weaponUnlocked('autogun');
      const cost = weaponCost('autogun', 1);
      wopt = `<div class="opt"><div class="ol">加装机关炮(仅限基础武器)<span class="od">${WEAPONS.autogun.desc}</span></div>
        <div class="cost">${costHtml(cost)}</div>
        <button data-install="autogun" ${un && canAfford(cost) && !save.upgrade ? '' : 'disabled'}>安装</button></div>`;
    } else {
      wopt = `<div class="opt locked"><div class="ol">集成机关炮 · 火力 ${Math.round(WEAPONS.autogun.fp * carEffOf(car.clv))}<span class="od">火力随车厢等级成长(LV${car.clv || 1}),不可换装其他武器</span></div></div>`;
    }
    return `<div class="car-detail"><h4>${def.name}${car.wid ? ' · 机关炮 LV'+car.wlv : ''}<span class="sub">${def.en}</span></h4>
      <div class="cd-desc">${def.desc}<br><b style="color:var(--text-dim)">当前:</b>兼运货物 ${fmtNum(Math.round(CAR_TYPES.cargo.cap*0.25*Math.pow(2.5,tr.engineLv-1)))} · ${car.wid?'武装':'未武装'}</div>
      <div class="opt-row">${wopt}</div></div>`;
  }
  if (car.type === 'cryo'){
    return `<div class="car-detail"><h4>${def.name}<span class="sub">${def.en}</span></h4>
      <div class="cd-desc">${def.desc}<br><b style="color:var(--text-dim)">当前效果:</b>载客 ${fmtNum(Math.round(CAR_TYPES.cryo.pax * carEffOf(car.clv)))} 人</div></div>`;
  }
  if (car.type === 'lab'){
    return `<div class="car-detail"><h4>${def.name}<span class="sub">${def.en}</span></h4>
      <div class="cd-desc">${def.desc}<br><b style="color:var(--text-dim)">当前效果:</b>列车基础科研 +${(CAR_TYPES.lab.rp * carEffOf(car.clv)).toFixed(3)}/s · 全列实时速率 ${rpRate().toFixed(3)}/s</div></div>`;
  }

  if (car.type === 'weapon'){
    if (car.paxMode){
      return `<div class="car-detail"><h4>${def.name} · 载人改装<span class="sub">${def.en}</span></h4>
        <div class="cd-desc">载人模式运行中。</div>
        <div class="opt-row">${paxToggle}</div></div>`;
    }
    if (!car.wid){
      const opts = Object.entries(WEAPONS).filter(([wid]) => wid !== 'autogun').map(([wid, w]) => {
        const un = weaponUnlocked(wid);
        const cost = weaponCost(wid, 1);
        return `<div class="opt ${un?'':'locked'}">
          <div class="ol">${w.name} <span style="font-family:var(--mono);font-size:.58rem;color:var(--text-muted)">${w.en} · 火力 ${w.fp}/级</span>
            <span class="od">${un ? w.desc : '🔒 ' + w.unlock.text}</span></div>
          <div class="cost">${un ? costHtml(cost) : ''}</div>
          <button data-install="${wid}" ${un && canAfford(cost) && !save.upgrade ? '' : 'disabled'}>安装</button>
        </div>`;
      }).join('');
      return `<div class="car-detail"><h4>${def.name} · 空载<span class="sub">${def.en}</span></h4>
        <div class="cd-desc">${def.desc}</div><div class="opt-row">${opts}${armoryHtml()}${paxToggle}</div></div>`;
    }
    const w = WEAPONS[car.wid];
    let opt;
    if (car.wlv >= WEAPON_MAXLV) opt = `<div class="opt"><div class="ol">已达最高等级<span class="od">这门炮的名字,会出现在袭击者的噩梦里。</span></div></div>`;
    else {
      const cost = weaponCost(car.wid, car.wlv+1);
      opt = `<div class="opt">
        <div class="ol">升级 → LV${car.wlv+1}<span class="od">火力 ${Math.round(w.fp*car.wlv*carEffOf(car.clv))} → ${Math.round(w.fp*(car.wlv+1)*carEffOf(car.clv))}</span></div>
        <div class="cost">${costHtml(cost)}</div>
        <button data-wup="1" ${canAfford(cost)&&!save.upgrade?'':'disabled'}>升级</button>
      </div>`;
    }
    const um = car.uw && UNIQUE_WEAPONS[car.uw] ? UNIQUE_WEAPONS[car.uw].mult : 1;
    const fpNow = Math.round(w.fp * car.wlv * carEffOf(car.clv) * um);
    const uHead = car.uw ? `<div class="buff-line" style="color:var(--amber)">★ ${UNIQUE_WEAPONS[car.uw].name} —— 火力 ×${um}(${UNIQUE_WEAPONS[car.uw].desc})
      <button data-unequip="1" class="close-btn" style="margin-left:.5rem;padding:.2rem .6rem">拆下入库</button></div>` : '';
    return `<div class="car-detail"><h4>${car.uw ? UNIQUE_WEAPONS[car.uw].name : w.name} · LV${car.wlv}<span class="sub">${w.en} · 火力 ${fpNow}</span></h4>
      ${uHead}
      <div class="cd-desc">${w.desc}</div><div class="opt-row">${opt}${armoryHtml()}${paxToggle}</div></div>`;
  }

  // cargo / habitat / eng
  const effect = car.type==='cargo'
    ? (car.paxMode ? `载人改装中:容纳 ${CAR_TYPES.cargo.pax} 人,货运离线` : `装载容量 +${CAR_TYPES.cargo.cap}(随引擎 ×2.5/级)`)
    : car.type==='habitat' ? `收取冷却 -${CAR_TYPES.habitat.cdRed}s · 防御 +${CAR_TYPES.habitat.def}`
    : car.type==='cryo' ? '文明火种 ×1:在无人星系建立首块殖民地时整舱消耗(1000 名深眠拓荒者)'
    : car.type==='lab' ? `科研产率 +${CAR_TYPES.lab.rp}/s(随车厢等级 +30%/级)`
    : `靠站收取量 +${CAR_TYPES.eng.collectBuff*100}%`;
  return `<div class="car-detail"><h4>${def.name}${car.paxMode ? ' · 载人改装' : ''}<span class="sub">${def.en}</span></h4>
    <div class="cd-desc">${def.desc}<br><b style="color:var(--text-dim)">当前效果:</b>${effect}</div>
    ${car.type==='cargo' ? `<div class="opt-row">${paxToggle}</div>` : ''}</div>`;
}

function bindDetailActions(){
  const card = $('train-card');
  card.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    if (buyCar(b.dataset.buy)){
      selCar = carCount() - 1;
      showToast(`已加挂 <b>${CAR_TYPES[b.dataset.buy].name}</b> · 现编组 ${carCount()} 节`, {sfx:'confirm', say:'Car coupled.'});
      renderTrainCard();
    } else sfx('err');
  }));
  card.querySelectorAll('[data-offup]').forEach(b => b.onclick = () => {
    const of = save.officers;
    if (of.active.length < OFFICER_SLOTS && !of.active.includes(b.dataset.offup)){
      of.active.push(b.dataset.offup);
      const o = OFFICERS[b.dataset.offup];
      showToast(`👤 <b>${o.nick}${o.name}</b> 上岗 —— ${o.desc.split(' —— ')[0]}`, {sfx:'confirm', say:'Officer on duty.'});
      persistSave(); renderTrainCard();
    } else sfx('err');
  });
  card.querySelectorAll('[data-offdown]').forEach(b => b.onclick = () => {
    const of = save.officers;
    of.active = of.active.filter(x => x !== b.dataset.offdown);
    persistSave(); sfx('blip'); renderTrainCard();
  });
  card.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
    const uid = save.armory[+b.dataset.equip];
    if (equipUnique(selCar, uid)){
      showToast(`★ <b>${UNIQUE_WEAPONS[uid].name}</b> 已装备 —— 火力 ×${UNIQUE_WEAPONS[uid].mult}`, {sfx:'unlock', say:'Unique armament mounted.'});
      renderTrainCard();
    } else sfx('err');
  });
  const ue = card.querySelector('[data-unequip]');
  if (ue) ue.onclick = () => {
    if (unequipUnique(selCar)){ showToast('具名武器已拆下入库,普通炮架保留', {sfx:'blip'}); renderTrainCard(); }
    else sfx('err');
  };
  card.querySelectorAll('[data-install]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    if (installWeapon(selCar, b.dataset.install)){
      showToast(`武器平台装备 <b>${WEAPONS[b.dataset.install].name}</b>`, {sfx:'confirm', say:'Weapon online.'});
      renderTrainCard();
    } else sfx('err');
  }));
  const wup = card.querySelector('[data-wup]');
  if (wup) wup.onclick = () => btnConfirm(wup, () => {
    if (upgradeWeapon(selCar)){
      const car = save.train.cars[selCar];
      showToast(`<b>${WEAPONS[car.wid].name}</b> 升级至 LV${car.wlv}`, {sfx:'levelup', say:'Weapon upgraded.'});
      renderTrainCard();
    } else sfx('err');
  });
  const eup = card.querySelector('[data-engup]');
  if (eup) eup.onclick = () => btnConfirm(eup, () => {
    if (upgradeEngine()){
      showToast(`引擎升级开工 → <b>LV${save.upgrade ? save.upgrade.to : save.train.engineLv}</b>`, {sfx:'levelup', say:'Engine upgrading.'});
      renderTrainCard();
    } else sfx('err');
  });
  bindTechActions(card);
  const cu = card.querySelector('[data-carresearch]');
  if (cu) cu.onclick = () => btnConfirm(cu, () => {
    const type = cu.dataset.carresearch;
    if (startCarResearch(type)){
      showToast(`改装方案研发立项:<b>${CAR_TYPES[type].name}</b> LV${save.techQueue.to} —— 完成后全列同型自动升级`, {sfx:'confirm', say:'Refit research started.'});
      renderTrainCard();
    } else sfx('err');
  });
  card.querySelectorAll('[data-buildlv]').forEach(b => b.onclick = () => { _buildLv = +b.dataset.buildlv; sfx('blip'); renderTrainCard(); });
  card.querySelectorAll('[data-build]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    const type = b.dataset.build;
    const lv = Math.min(_buildLv, carTechLv(type));
    if (buildToDepot(type, lv)){
      showToast(`<b>${CAR_TYPES[type].name}</b> LV${lv} 开始建造 —— 完工后存入车厢库`, {sfx:'confirm', say:'Car construction started.'});
      renderTrainCard();
    } else sfx('err');
  }));
  card.querySelectorAll('[data-replace]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    const old = CAR_TYPES[save.train.cars[selCar].type].name;
    if (replaceCar(selCar, +b.dataset.replace)){
      showToast(`「${old}」已入库,换装 <b>${CAR_TYPES[b.dataset.replace].name}</b>`, {sfx:'confirm', say:'Car exchanged.'});
      renderTrainCard();
    } else sfx('err');
  }));
  card.querySelectorAll('[data-recouple]').forEach(b => b.onclick = () => {
    const [key, idx] = b.dataset.recouple.split('::');
    if (recoupleCar(key, +idx)){
      showToast('库存车厢已重新挂载', {sfx:'confirm', say:'Car coupled.'});
      renderTrainCard();
    } else sfx('err');
  });
  const ru = card.querySelector('[data-rpup]');
  if (ru) ru.onclick = () => btnConfirm(ru, () => {
    if (upgradeRpcoef()){
      showToast(`科研主机升级开工 → LV${save.upgrade.to}`, {sfx:'confirm', say:'Research core upgrading.'});
      renderTrainCard();
    } else sfx('err');
  });
  const rep = card.querySelector('[data-repair]');
  if (rep) rep.onclick = () => {
    if (repairCar(selCar)){
      showToast(`<b>${CAR_TYPES[save.train.cars[selCar].type].name}</b> 修复完成`, {sfx:'confirm', say:'Repairs complete.'});
      renderTrainCard();
    } else sfx('err');
  };
  const pm = card.querySelector('[data-paxmode]');
  if (pm) pm.onclick = () => {
    if (togglePaxMode(selCar)){
      const c = save.train.cars[selCar];
      showToast(`<b>${CAR_TYPES[c.type].name}</b> ${c.paxMode ? '已改装为载人模式' : '已恢复原始用途'}`, {sfx:'confirm', say:'Refit complete.'});
      renderTrainCard();
    } else sfx('err');
  };
}

/* ── 星系视图列车标记:侧视流线型车头 + 连挂车厢 + 磁悬浮光轨 ── */
const LOCO_ICON = `<svg viewBox="0 0 64 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1" y="12.5" width="4.5" height="8" rx="1.6" fill="rgba(245,158,11,.28)" stroke-width="1.2"/>
  <path d="M6.5 21.5 V12.5 Q6.5 8.5 11.5 8.5 H36 Q48 8.5 59.5 18.2 Q61.6 20 61 21.7 Q60.5 23 57.5 23 H9.5 Q6.5 23 6.5 21.5 Z" fill="rgba(245,158,11,.12)"/>
  <path d="M38.5 11.2 H44 Q50 12.8 53.8 16.6 L38.5 16.6 Z" fill="currentColor" stroke="none" opacity=".9"/>
  <rect x="11" y="11.8" width="24" height="4.6" rx="2.3" fill="rgba(245,158,11,.4)" stroke="none"/>
  <path d="M10 19.6 H55" opacity=".4" stroke-width="1.1"/>
  <path d="M15 8.5 V5.8 H18.5" opacity=".7" stroke-width="1.2"/>
</svg>`;
/* 标牌车厢小徽记(无外框,车体即边框) */
const TCAR_GLYPHS = {
  cargo:   `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1"/></svg>`,
  person:  `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="4.2" r="1.9"/><path d="M2.6 10.2c.6-2.4 2-3.4 3.4-3.4s2.8 1 3.4 3.4"/></svg>`,
  weapon:  `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M6 2.4l4.2 7.2H1.8z"/></svg>`,
  general: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.4 4.4h7.2M2.4 7.6h7.2"/></svg>`,
  eng:     `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="6" r="2.4"/><path d="M6 1.6v1.6M6 8.8v1.6M1.6 6h1.6M8.8 6h1.6"/></svg>`,
  cryo:    `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="3.4"/><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/></svg>`,
  lab:     `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="6" cy="6" rx="4.2" ry="1.9"/><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"/></svg>`,
};
function tcarGlyph(c){
  if (c.paxMode || c.type === 'habitat') return TCAR_GLYPHS.person;
  return TCAR_GLYPHS[c.type] || TCAR_GLYPHS.general;
}
function refreshTrainTag(){
  const tag = $('train-tag');
  if (!tag) return;
  const tr = save.train;
  // 总图:常驻(锁定所在星系节点 / 沿航线滑行);星系视图:仅当列车在本星系;可在列车面板关闭
  const visible = (save.ui && save.ui.tag) && (mode === 'galaxy'
    ? true
    : (tr.status === 'docked' && tr.sys === curSysId));
  if (!visible){ tag.classList.add('hidden'); return; }
  tag.classList.remove('hidden');
  const moving = tr.status === 'travel' || localTransit();
  tag.classList.toggle('moving', moving);
  const status = tr.status === 'travel' ? ' · 航行中' : localTransit() ? ' · 转移中' : '';
  const cars = tr.cars.filter(c => c.type !== 'engine');
  // 车头朝右 = 行进方向;车厢自左至右为「尾 → 首」
  const cells = cars.slice().reverse().map(c =>
    `<div class="tcar ${c.damaged ? 'dmg' : ''}" title="${CAR_TYPES[c.type].name}${c.wid ? ' · ' + WEAPONS[c.wid].name + ' LV' + c.wlv : ''}${c.paxMode ? ' · 载人' : ''}${c.damaged ? ' · 受损' : ''}" style="--cc:${c.paxMode ? CAR_COLORS.habitat : CAR_COLORS[c.type]}">${tcarGlyph(c)}</div>`
  ).join('');
  tag.innerHTML = `<div class="ttitle">晨昏号 · LV${tr.engineLv}${status}</div>
    <div class="tstrip">${cells}<div class="tloco">${LOCO_ICON}</div></div>
    <div class="tmag"></div>`;
}

/* 研发/加速按钮统一绑定 */
function bindTechActions(root){
  root.querySelectorAll('[data-tech]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    if (researchTech(b.dataset.tech)){
      showToast(`研发立项:<b>${TRAIN_TECHS[b.dataset.tech].name}</b> · 工期 ${fmtDuration(save.techQueue.dur)}`, {sfx:'confirm', say:'Research started.'});
      renderTrainCard();
    } else sfx('err');
  }));
  root.querySelectorAll('[data-taccel]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    if (save.techQueue && accelQueue(save.techQueue)){ tickQueues(); renderTrainCard(); } else sfx('err');
  }));
  root.querySelectorAll('[data-uaccel]').forEach(b => b.onclick = () => btnConfirm(b, () => {
    if (save.upgrade && accelQueue(save.upgrade)){ tickQueues(); renderTrainCard(); } else sfx('err');
  }));
}

/* 车厢库:存放在本星锚地的替换车厢,可免费重新挂载 */
function depotHtml(){
  const tr = save.train;
  if (tr.status !== 'docked' || localTransit() || !save.depot) return '';
  const anchor = anchorageOf(tr.planet, tr.sys);
  let rows = '';
  for (const p of planetsOf(tr.sys)){
    if (anchorageOf(p.id, tr.sys) !== anchor) continue;
    const list = save.depot[p.key];
    if (!list || !list.length) continue;
    rows += list.map((c, i) =>
      `<div class="opt"><div class="ol">${CAR_TYPES[c.type].name} LV${c.clv || 1}${c.wid ? ' · ' + WEAPONS[c.wid].name + ' LV' + c.wlv : ''}<span class="od">存放于 ${p.name} 车厢库</span></div>
        <button data-recouple="${p.key}::${i}" ${carCount() < carSlots() ? '' : 'disabled'}>挂载</button></div>`).join('');
  }
  return rows ? `<div class="sec-label" style="margin-top:.8rem">车厢库 · 本星锚地</div><div class="opt-row">${rows}</div>` : '';
}

/* 每秒轻量刷新(不重建 DOM,避免打断点击) */
let _techSig = '';
function refreshTrainDynamic(){
  const st = $('t-status');
  if (st) st.innerHTML = trainStatusHtml();
  const tre = $('t-treasury');
  if (tre) tre.innerHTML = treasuryHtml();
  // 研发/工期区:有队列时每秒刷新倒计时,否则仅在可负担状态变化时重渲染
  const techs = $('t-techs');
  if (techs){
    const q = save.techQueue, up = save.upgrade;
    const sig = Object.keys(TRAIN_TECHS).map(id => {
      const lv = techLv(id);
      return lv >= TRAIN_TECHS[id].max ? 'M' : ((save.research||0) >= techCost(id, lv+1) ? '1' : '0');
    }).join('') + (q ? '|q' + q.id + Math.floor(queueRemain(q)) : '') + (up ? '|u' + Math.floor(queueRemain(up)) : '');
    if (sig !== _techSig){
      _techSig = sig;
      techs.innerHTML = techHtml();
      const upRow = $('t-upgrade');
      if (upRow) upRow.innerHTML = upgradeRowHtml();
      bindTechActions($('train-card'));
    }
  }
  const tr = save.train;
  const cbtn = $('t-collect');
  if (cbtn){
    const info = tr.status === 'docked' ? collectInfo(tr.sys) : null;
    const can = info && info.avail > 1 && info.cdLeft <= 0 && info.space > 0;
    cbtn.disabled = !can;
    cbtn.textContent = tr.status !== 'docked' ? '航行中无法收取'
      : info.cdLeft > 0 ? `装载冷却 · ${fmtDuration(info.cdLeft)}`
      : info.avail <= 1 ? '本星系仓内无资源'
      : info.space <= 0 ? '货舱已满 —— 先卸货或入库'
      : `收取本星系资源(货舱余位 ${fmtNum(info.space)})`;
  }
  const bbtn = $('t-bank');
  if (bbtn){
    bbtn.disabled = !(holdTotal() >= 1 && canBankHere());
    bbtn.textContent = holdTotal() >= 1 ? `货舱入库金库(${fmtNum(holdTotal())})` : '货舱为空';
  }
}
