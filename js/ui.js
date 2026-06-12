/* ============================================================
   UI 层 — 侧面板(行星/星系)/ 底部坞 / 剧情 / 系统设置 / 主刷新
   ============================================================ */
const $ = id => document.getElementById(id);
let panelPlanet = null;        // 当前面板显示的行星
let panelSys = null;           // 当前面板显示的星系(银河视图)
const prevLevels = {};
const prevUnlocked = {};
let prevSlots = null;
const prevWeaponUn = {};
let battleAutoOpened = false;

function dotColor(d){
  const c = d.c2;
  return `rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`;
}

/* ── 美术资产:行星头图 / 区划与星港横幅 ── */
function planetArtOf(d){
  if (d.key === 'kenxi/canglan') return 'img/planet_canglan.jpg';
  return 'img/planet_' + d.shader + '.jpg';
}
function artBanner(src, cap, h){
  return `<div class="art-banner" style="background-image:url('${src}');${h ? `height:${h}px` : ''}"><span class="art-cap">${cap}</span></div>`;
}

/* ════════ 行星面板 ════════ */
function openPanel(d){
  panelPlanet = d; panelSys = null;
  const roleTag = d.role === 'hab'
    ? `<span class="role-tag hab">${DIST_ICONS.habitation} ${d.key==='kenxi/canglan' ? '主殖民地' : '居住型'} · 容量 ${(d.capScale*100).toFixed(0)}%</span>`
    : `<span class="role-tag res">${RES_ICONS[d.res.key]} 资源型 · ${RESOURCES[d.res.key].name} ×${d.res.rich.toFixed(1)}</span>`;
  const alias = d.alias ? `<span style="font-size:.85rem;font-weight:600;color:var(--text-dim)">(${d.alias})</span>` : '';
  $('panel-body').innerHTML = `
    <h2><span style="color:${dotColor(d)}">${iconOf(d)}</span>${d.name}${alias}</h2>
    <div class="type-tag">${d.type} · ${d.id.toUpperCase()}</div>
    <div class="art-banner hero" style="background-image:url('${planetArtOf(d)}')"><span class="art-cap">${d.id.toUpperCase()} · ORBITAL SURVEY</span></div>
    <p class="desc">${roleTag}<p style="margin-top:.7rem">${d.desc}</p></p>
    <div class="divider"></div>
    <div class="sec-label">行星参数</div>
    <div class="phys">
      <div class="item"><div class="k">半径</div><div class="v">${d.radius.toFixed(2)} R⊕</div></div>
      <div class="item"><div class="k">轨道半径</div><div class="v">${d.moonOf ? '环沧澜轨道' : d.au.toFixed(2)+' AU'}</div></div>
      <div class="item"><div class="k">公转周期</div><div class="v">${d.moonOf ? '3.2 标准日' : d.period+' 标准日'}</div></div>
      <div class="item"><div class="k">宜居度</div><div class="v">${(d.habit*100).toFixed(0)} %</div></div>
    </div>
    <div class="divider"></div>
    <div class="sec-label">星球开发</div>
    <div id="dev-block"></div>`;
  renderDevBlock();
  $('panel').classList.add('show');
}

function renderDevBlock(){
  if (!panelPlanet || mode !== 'system') return;
  const d = panelPlanet, blk = $('dev-block');
  if (!blk) return;
  const pts = devPoints(d), lv = devLevel(d);

  if (lv === 0){
    const conds = condList(d);
    const locked = !conds.every(c => c.met);
    const dockHtml = dockControlHtml(d);
    const roleHint = d.role === 'hab'
      ? `这是一${d.moonOf?'颗卫星':'颗'}<b style="color:var(--green)">居住型</b>${d.moonOf?'殖民地':'星球'}:开发后人口将随真实时间持续增长,人口上限由开发阶段与容量(${(d.capScale*100).toFixed(0)}%)决定,并受全银河资源型星球加成。`
      : `这是一颗<b style="color:var(--amber)">资源型</b>星球:开发后将持续产出<b style="color:var(--amber)">${RESOURCES[d.res.key].name}</b>(丰度 ×${d.res.rich.toFixed(1)}),满级后产出永不停止。产出需列车靠站收取,方可注入金库。`;
    const condHtml = conds.length ? `
      <div class="cond-box">
        <div class="cond-title">${locked ? '殖民许可 · 待满足条件' : '殖民许可 · 已批准'}</div>
        ${conds.map(c => `<div class="cond-item ${c.met?'met':''}">${c.met?'✓':'○'} ${c.text}</div>`).join('')}
      </div>` : '';
    blk.innerHTML = `
      ${dockHtml}
      ${condHtml}
      <button id="establish-btn" class="act-btn" ${locked?'disabled':''}>${locked ? '条 件 未 满 足' : `建 立 前 哨(移民 ${fmtNum(ESTABLISH_COLONISTS)})`}</button>
      <p class="hint">${roleHint}</p>
      <p class="hint">建立殖民地将消耗随车移民 ${fmtNum(ESTABLISH_COLONISTS)} 人。部署后开发度只随<b>真实时间流逝</b>累积,离线也不会停止。宜居度 ${(d.habit*100).toFixed(0)}% 决定发展速率。</p>`;
    bindDockBtn(d);
    if (!locked){
      $('establish-btn').onclick = () => {
        if (save.train.pax < ESTABLISH_COLONISTS){ sfx('err'); return; }
        save.train.pax -= ESTABLISH_COLONISTS;
        save.est[d.key] = Date.now();
        if (d.role === 'hab') save.popExtra[d.key] = (save.popExtra[d.key] || 0) + ESTABLISH_COLONISTS;
        addInfluence(INF_FX.establish);   // 开拓殖民影响力
        persistSave();
        showToast(`<b>${d.name}</b> · ${fmtNum(ESTABLISH_COLONISTS)} 名拓荒者登陆,前哨已建立`, {sfx:'confirm', say:'Outpost established.'});
        renderDevBlock(); refreshDock(); refreshLabelText();
      };
    }
    return;
  }

  const prog = devProgress(d);
  const isMax = lv >= MAX_LEVEL;
  let nextHtml, etaHtml = '';
  if (isMax){
    nextHtml = `<div class="next-info">已达最高阶段 <b>生态文明</b>${d.role==='res' ? ',资源产出进入永续模式。' : ',行星已完全融入文明网络。'}</div>`;
  } else {
    const remain = (LEVELS[lv+1].th - pts) / d.habit;
    nextHtml = `<div class="next-info">下一阶段 <b>${LEVELS[lv+1].name}</b> · 预计还需 <b>${fmtDuration(remain)}</b></div>`;
    etaHtml = `<span>${Math.floor(pts)} / ${LEVELS[lv+1].th} pts</span>`;
  }
  const elapsed = (Date.now() - save.est[d.key]) / 1000;

  let ecoHtml = '';
  if (d.role === 'hab'){
    const pop = popOf(d), cap = popCapOf(d);
    ecoHtml = `
      <div class="eco-box">
        <div class="eco-k">行星人口</div>
        <div class="eco-v pop">${fmtNum(pop)}</div>
        <div class="eco-sub">本阶段上限 <span>${fmtNum(cap)}</span></div>
        <div class="bar"><div class="fill" style="width:${Math.min(100, pop/cap*100)}%"></div></div>
        <div class="buff-line">资源协同:全银河资源型星球等级和 ${sumLevels('res')} → 人口上限 <b>×${capBuff().toFixed(2)}</b></div>
      </div>`;
  } else {
    const avail = resAvail(d);
    const docked = save.train.status === 'docked' && save.train.sys === d.sysId;
    const info = collectInfo(d.sysId);
    const canCollect = docked && info.avail > 0 && info.cdLeft <= 0;
    ecoHtml = `
      <div class="eco-box">
        <div class="eco-k">${RESOURCES[d.res.key].name} · 累计产出</div>
        <div class="eco-v resv">${fmtNum(resOf(d))}</div>
        <div class="eco-sub">当前产率 <span>${fmtNum(resRateOf(d))}/s</span> · 丰度 ×${d.res.rich.toFixed(1)}</div>
        <div class="eco-sub">仓内待收取 <span style="color:var(--amber)">${fmtNum(avail)}</span></div>
        <div class="buff-line">劳动力协同:全银河居住型星球等级和 ${sumLevels('hab')} → 产率 <b>×${rateBuff().toFixed(2)}</b></div>
        ${docked ? `<button id="collect-btn" class="act-btn amber" style="margin-top:.7rem" ${canCollect?'':'disabled'}>${info.cdLeft > 0 ? '装载冷却 · ' + fmtDuration(info.cdLeft) : info.avail <= 0 ? '仓 内 无 资 源' : '装 载 本 星 系 资 源'}</button>`
          : `<div class="buff-line" style="color:var(--text-muted)">⚠ 产出滞留仓内 —— 需星际列车靠站收取</div>`}
      </div>`;
  }

  blk.innerHTML = `
    ${dockControlHtml(d)}
    <div class="level-row">
      <div class="level-name">${LEVELS[lv].name}</div>
      <div class="level-num">LV ${lv} / ${MAX_LEVEL}</div>
    </div>
    <div class="bar"><div class="fill ${isMax?'max':''}" style="width:${(isMax?1:prog)*100}%"></div></div>
    <div class="bar-meta"><span>${isMax ? 'MAX' : (prog*100).toFixed(1)+'%'}</span>${etaHtml}</div>
    ${nextHtml}
    ${ecoHtml}
    ${migBoxHtml(d)}
    ${storeHtml(d)}
    ${starportHtml(d)}
    <div class="rate-line">发展速率 <span>${d.habit.toFixed(2)} pts/s</span> · 已运转 ${fmtDuration(elapsed)}</div>
    <div class="divider"></div>
    <div class="sec-label" style="--c:var(--purple)">殖民区划</div>
    ${districtsHtml(d)}
    <p class="hint">开发等级越高,夜面城市灯光越密集——切换到星球背阳面即可观察。</p>`;
  const cb = $('collect-btn');
  if (cb) cb.onclick = () => doCollect(d.sysId);
  bindDockBtn(d);
  bindMigBtns(d);
  bindPortBtns(d);
  const ib = $('invest-btn');
  if (ib) ib.onclick = () => {
    if (investColony(d.key)){
      showToast(`物资已注入 <b>${d.name}</b> —— 施工即刻完成`, {sfx:'confirm', say:'Construction complete.'});
      renderDevBlock(); refreshDock();
      if (typeof updateDistrictUniforms === 'function') updateDistrictUniforms();
    } else sfx('err');
  };
  const ab = $('inf-accel-btn');
  if (ab) ab.onclick = () => {
    if (accelConstruction(d.key)){
      showToast(`影响力动员 —— <b>${d.name}</b> 当前工程即刻竣工`, {sfx:'confirm', say:'Mobilization complete.'});
      renderDevBlock(); refreshDock();
      if (typeof updateDistrictUniforms === 'function') updateDistrictUniforms();
    } else sfx('err');
  };
  const tb = $('terraform-btn');
  if (tb) tb.onclick = () => {
    if (terraformPlanet(d.key)){
      showToast(`<b>${d.name}</b> 类地化改造完成 —— 区划容量升至 <b>${maxSlotsOf(d)} 格</b>`, {sfx:'unlock', say:'Terraforming complete.'});
      renderDevBlock(); refreshDock();
    } else sfx('err');
  };
}

/* ── 星系内停靠控制 ── */
/* 任务讯号提示(行星面板,停靠按钮旁):该星是讯号源时显示状态 */
function questHintHtml(p){
  const here = questPendingList().filter(q => q.loc === p.key);
  if (!here.length) return '';
  const names = { main:'深空讯号', side:'异常讯号', port:'航运公报' };
  return here.map(q => {
    const ok = atQuestLoc(q.track);
    return `<div class="buff-line" style="margin-bottom:.45rem;color:${QUEST_COLORS[q.track]}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="width:13px;height:13px;vertical-align:-2px"><path d="M3.5 9.5a12 12 0 0 1 17 0"/><path d="M6.5 12.8a8 8 0 0 1 11 0"/><path d="M9.4 16a4 4 0 0 1 5.2 0"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>
      ${names[q.track] || '讯号'}源在此 —— ${ok ? '<b>已停靠,点击左下角信号按钮接收</b>' : '停靠本星系后即可接收'}</div>`;
  }).join('');
}
function dockControlHtml(p){
  const tr = save.train;
  if (mode !== 'system' || tr.status !== 'docked' || tr.sys !== p.sysId) return questHintHtml(p);
  if (localTransit()){
    const left = Math.max(0, (tr.localArriveAt - Date.now()) / 1000);
    const to = planetsOf(tr.sys).find(x => x.id === tr.localTo);
    return questHintHtml(p) + `<div class="buff-line" style="margin-bottom:.6rem">🚆 轨道转移中 → ${to ? to.name : ''} · 剩余 ${Math.ceil(left)}s</div>`;
  }
  if (dockedAtPlanet(p))
    return questHintHtml(p) + `<div class="buff-line" style="margin-bottom:.6rem;color:var(--green)">🚆 列车已停靠本星锚地${p.moonOf || planetsOf(p.sysId).some(x=>x.moonOf===p.id) ? '(卫星/母星泊位通用)' : ''}</div>`;
  return questHintHtml(p) + `<button id="dock-btn" class="act-btn cyan" style="margin-bottom:.7rem;padding:.55rem">停 靠 本 星 · ${localTravelTime(p.id)}s</button>`;
}
function bindDockBtn(p){
  const b = $('dock-btn');
  if (!b) return;
  b.onclick = () => {
    const sec = startLocalTravel(p.id);
    if (sec){ showToast(`列车转移至 <b>${p.name}</b> 轨道 · ${sec}s`, {sfx:'blip'}); renderDevBlock(); }
    else sfx('err');
  };
}
/* ── 移民池(居住星) ── */
function migBoxHtml(p){
  if (p.role !== 'hab' || devLevel(p) === 0) return '';
  const mi = migInfo(p);
  const docked = dockedAtPlanet(p);
  const space = paxCapacity() - save.train.pax;
  const emigratable = canEmigrate(p);
  let btns = '';
  if (docked){
    btns = `<div style="display:flex;gap:.5rem;margin-top:.55rem">
      <button id="board-btn" class="act-btn cyan" style="margin:0;padding:.5rem" ${emigratable&&mi.pool>0&&space>0?'':'disabled'}>装载移民(${fmtNum(Math.min(mi.pool, space))})</button>
      <button id="unload-btn" class="act-btn" style="margin:0;padding:.5rem" ${save.train.pax>0?'':'disabled'}>落户(随车 ${fmtNum(save.train.pax)})</button>
    </div>`;
  }
  if (!emigratable)
    btns += `<div class="buff-line" style="margin-top:.45rem;color:var(--text-muted)">⚠ 输出移民需「聚居点」(LV2)以上且建有民生区 —— 新殖民地留人扎根</div>`;
  else {
    const cc = conscriptCost(p);
    if (cc.amount > 0)
      btns += `<button id="conscript-btn" class="close-btn" style="margin-top:.45rem;color:var(--purple);border-color:rgba(139,92,246,.4)" ${(save.influence||0) >= cc.cost ? '' : 'disabled'}>影响力征集 —— 立即补满迁移池(+${fmtNum(cc.amount)} 人,${cc.cost} 影响力,可远程)</button>`;
  }
  return `<div class="eco-box">
    <div class="eco-k">可迁移人口池(上限 = 人口 ${MIG_CAP_RATIO*100}%)</div>
    <div class="eco-v pop">${fmtNum(mi.pool)}</div>
    <div class="eco-sub">池上限 <span>${fmtNum(mi.cap)}</span> · 每 ${Math.round(MIG_STEP_MS/60000)} 分钟补充人口 ${MIG_RATE_RATIO*100}%(下次 ${fmtDuration(mi.nextIn)})</div>
    ${btns}</div>`;
}
function bindMigBtns(p){
  const bb = $('board-btn');
  if (bb) bb.onclick = () => {
    const n = boardMigrants(p);
    if (n > 0){ showToast(`<b>${fmtNum(n)}</b> 名移民登车(随车 ${fmtNum(save.train.pax)} / ${fmtNum(paxCapacity())})`, {sfx:'confirm', say:'Boarding complete.'}); renderDevBlock(); }
    else sfx('err');
  };
  const ub = $('unload-btn');
  if (ub) ub.onclick = () => {
    const n = unloadMigrants(p);
    if (n > 0){ showToast(`<b>${fmtNum(n)}</b> 名移民在 <b>${p.name}</b> 落户`, {sfx:'confirm', say:'Colonists settled.'}); renderDevBlock(); }
    else sfx('err');
  };
  const cs = $('conscript-btn');
  if (cs) cs.onclick = () => {
    if (conscriptMigrants(p)){ showToast(`<b>${p.name}</b> 迁移池已补满(影响力动员)`, {sfx:'confirm', say:'Mobilization complete.'}); renderDevBlock(); }
    else sfx('err');
  };
}

/* ── 星港 / 贸易线 / 资源仓 / 母港 ── */
function starportHtml(p){
  if (!save.est[p.key] || devLevel(p) < 2) return '';
  const key = p.key;
  let inner = '';
  if (!portState(key)){
    const cost = starportCost(starportCount() + 1);
    const costTxt = Object.entries(cost).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
    inner = `<button id="port-build" class="act-btn cyan" ${canAfford(cost) ? '' : 'disabled'}>建 造 星 港(${costTxt} · 工期 ${fmtDuration(STARPORT_TIME)})</button>
      <p class="hint">星港为轨道独立建筑,不占区划。第 ${starportCount() + 1} 座成本 +${(starportCount()) * 20}%。</p>`;
  } else if (portBuilding(key)){
    const st = portState(key);
    const remain = Math.max(0, (st.startAt + st.dur * 1000 - Date.now()) / 1000);
    const rush = infRushCost(remain);
    inner = `<div class="bld building">⚒ 星港建设中 ${(Math.min(1,(Date.now()-st.startAt)/(st.dur*1000))*100).toFixed(0)}% · 剩余 ${fmtDuration(remain)}${st.auto ? ' · 殖民地自筹' : ''}</div>
      <button id="port-rush" class="close-btn" style="margin-top:.4rem" ${(save.influence||0) >= rush ? '' : 'disabled'}>影响力注资,即刻完工(${fmtNum(rush)} 影响力)</button>`;
  } else {
    const capN = lineCapacityOf(p), used = linesAt(key).length;
    inner = `<div class="buff-line">⬡ 星港运营中 · 贸易线 ${used}/${capN}(容量 = 其他区划/3 + 商贸区划)</div>`;
    // 既有线路
    (save.lines || []).forEach((l, i) => {
      if (l.a !== key && l.b !== key) return;
      const other = planetByKey(l.a === key ? l.b : l.a);
      const sendOpts = w => ['none','pax', ...Object.keys(RESOURCES)].map(o =>
        `<option value="${o}" ${w === o ? 'selected' : ''}>${o === 'none' ? '不运' : o === 'pax' ? '移民' : RESOURCES[o].name}</option>`).join('');
      inner += `<div class="opt"><div class="ol">⇄ ${other ? other.name : '?'} · LV${l.lv} · 容量 ${SHIP_CAP * l.lv}/趟 · 周期 ${lineCycleSec(l)}s
          <span class="od">去程 <select data-lsend="${i}:a">${sendOpts(l.aSend)}</select> · 返程 <select data-lsend="${i}:b">${sendOpts(l.bSend)}</select></span></div>
        <div style="display:flex;flex-direction:column;gap:.3rem">
          <button data-ltoggle="${i}">${l.on ? '停运' : '开始运输'}</button>
          <button data-lup="${i}" ${l.lv < save.train.engineLv && canAfford(lineUpCost(l.lv + 1)) ? '' : 'disabled'} title="线路等级不可超过车头等级(${save.train.engineLv})">升级 ${fmtNum(lineUpCost(l.lv + 1).metal)}金属</button>
        </div></div>`;
    });
    // 新建线
    const targets = lineTargets(p);
    if (used < capN && targets.length){
      inner += `<div class="opt"><div class="ol">开通新贸易线(${fmtNum(LINE_COST.metal)}金属 + ${fmtNum(LINE_COST.chem)}化合物)
        <span class="od">对象需同星系且已建星港</span></div>
        <select id="line-target">${targets.map(t => `<option value="${t.key}">${t.name}</option>`).join('')}</select>
        <button id="line-build" ${canAfford(LINE_COST) ? '' : 'disabled'}>开线</button></div>`;
    } else if (used < capN){
      inner += `<div class="bld locked">○ 暂无可连接对象(同星系其他行星需先建星港)</div>`;
    }
  }
  // 母港设置
  const isHome = save.homePort === key;
  inner += isHome
    ? `<div class="buff-line" style="color:var(--purple)">⚓ 母港 —— 列车不在时,居住/商贸区划仍按 1/3 速率产出影响力</div>`
    : (p.role === 'hab' && portDone(key) ? `<button id="set-home" class="close-btn" style="margin-top:.4rem">设为母港(影响力基地)</button>` : '');
  const banner = portDone(key) ? artBanner('img/starport.jpg', `STARPORT · ${p.name}`, 96) : '';
  return `<div class="divider"></div><div class="sec-label" style="--c:var(--cyan)">星港 · 自动航运</div>${banner}${inner}`;
}
function storeHtml(p){
  if (!save.est[p.key] || p.role !== 'hab') return '';
  const st = pstoreOf(p.key);
  const dk = demandOf(p);
  const items = Object.keys(RESOURCES).filter(k => (st[k] || 0) > 0.5 || k === dk)
    .map(k => `<span style="color:${RESOURCES[k].color}">${RESOURCES[k].name} ${fmtNum(Math.floor(st[k] || 0))}${k === dk ? '(需求)' : ''}</span>`).join(' · ');
  const active = boostActive(p);
  const b = save.boost && save.boost[p.key];
  const stateTxt = active ? `<b style="color:var(--green)">加速中(+${BOOST_GROWTH_PER_H*100}%/小时)${b === -1 ? ' · 永久' : ' · 剩余 ' + fmtDuration((b - Date.now())/1000)}</b>`
    : (b && (st[dk]||0) <= 0 ? '<b style="color:var(--red)">需求资源耗尽,加速暂停</b>' : '');
  const btns = BOOST_DURATIONS.map(([h, label]) => `<button data-boost="${h}" class="close-btn">${label}</button>`).join('');
  return `<div class="eco-box">
    <div class="eco-k">星球资源仓 · 需求:${RESOURCES[dk].name}</div>
    <div class="eco-sub" style="margin-top:.4rem">${items || '空'}</div>
    <div class="buff-line">${stateTxt || '补给需求资源后启动加速:人口增速 +10%/小时,持续消耗仓内资源(星港航线可自动补给)'}</div>
    <div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap">
      <button id="store-supply" class="close-btn" ${(save.treasury[dk]||0) >= 500 && dockedAtPlanet(p) ? '' : 'disabled'} title="需列车停靠本星">列车补给 500</button>
      ${btns}
    </div></div>`;
}
function bindPortBtns(p){
  const pb = $('port-build');
  if (pb) pb.onclick = () => { if (buildStarport(p)){ showToast(`<b>${p.name}</b> 星港开工`, {sfx:'confirm', say:'Starport under construction.'}); renderDevBlock(); } else sfx('err'); };
  const pr = $('port-rush');
  if (pr) pr.onclick = () => {
    const st = portState(p.key);
    const remain = st ? Math.max(0, (st.startAt + st.dur * 1000 - Date.now()) / 1000) : 0;
    const cost = infRushCost(remain);
    if (!st || (save.influence || 0) < cost){ sfx('err'); return; }
    save.influence -= cost;
    st.startAt = Date.now() - st.dur * 1000 - 1000;
    persistSave();
    showToast(`<b>${p.name}</b> 星港即刻竣工(影响力注资)`, { sfx:'levelup', say:'Starport operational.' });
    renderDevBlock();
  };
  const lb = $('line-build');
  if (lb) lb.onclick = () => {
    const t = $('line-target').value;
    if (buildLine(p.key, t)){ showToast(`贸易线开通:<b>${p.name} ⇄ ${planetByKey(t).name}</b>`, {sfx:'unlock', say:'Trade lane established.'}); renderDevBlock(); } else sfx('err');
  };
  const sh = $('set-home');
  if (sh) sh.onclick = () => { save.homePort = p.key; persistSave(); showToast(`<b>${p.name}</b> 已设为母港`, {sfx:'confirm', say:'Home port registered.'}); renderDevBlock(); };
  document.querySelectorAll('[data-ltoggle]').forEach(b => b.onclick = () => {
    const i = +b.dataset.ltoggle;
    if (toggleLine(i)){
      showToast(save.lines[i].on ? '货船入列 —— 贸易线开始持续运输' : '贸易线已停运',
        { sfx:'confirm', say: save.lines[i].on ? 'Trade lane running.' : 'Trade lane suspended.' });
      renderDevBlock();
    }
  });
  document.querySelectorAll('[data-lup]').forEach(b => b.onclick = () => {
    const i = +b.dataset.lup;
    if (upgradeLine(i)){ showToast(`贸易线升级 → <b>LV${save.lines[i].lv}</b> · 单趟容量 ${SHIP_CAP * save.lines[i].lv}`, {sfx:'levelup', say:'Trade lane upgraded.'}); renderDevBlock(); }
    else sfx('err');
  });
  document.querySelectorAll('[data-lsend]').forEach(sel => sel.onchange = () => {
    const [i, side] = sel.dataset.lsend.split(':');
    const l = save.lines[+i];
    if (l){ if (side === 'a') l.aSend = sel.value; else l.bSend = sel.value; persistSave(); }
  });
  const ss = $('store-supply');
  if (ss) ss.onclick = () => {
    if (supplyStore(p, 500)){ showToast(`<b>${p.name}</b> 资源仓补给完成`, {sfx:'confirm', say:'Supplies delivered.'}); renderDevBlock(); }
    else sfx('err');
  };
  document.querySelectorAll('[data-boost]').forEach(b => b.onclick = () => {
    setBoost(p, +b.dataset.boost);
    showToast(`<b>${p.name}</b> 资源加速已设定`, {sfx:'confirm', say:'Growth acceleration engaged.'});
    renderDevBlock();
  });
}

/* ── 区划与建筑(紧凑图标布局,适配最多 36 区划) ── */
function districtsHtml(p){
  const st = colonyState(p);
  const docked = save.train.status === 'docked' && save.train.sys === p.sysId && !save.pendingRaid;
  const rows = [];

  // 环境分级:类型准入 · 槽位 20:8:4 · 效率系数
  const env = envTier(p);
  const envCol = env.name === '严酷' ? 'var(--red)' : env.name === '艰苦' ? 'var(--amber)' : 'var(--green)';
  const allowed = allowedDistricts(p)
    .map(([t]) => `<span class="dchip-ico" style="color:${DISTRICT_TYPES[t].color}">${DIST_ICONS[t]}</span>`).join('');
  const band = planetBand(p);
  const bandTxt = band === 'terra' ? (save.terraformed && save.terraformed[p.key] ? '已类地化' : '类地行星')
    : band === 'harsh' ? '严酷星球(无法改造)'
    : (p.shader === 'rocky' && !p.moonOf ? '标准星球(火星类 · 可类地化)' : '标准星球(不可改造)');
  rows.push(`<div class="buff-line" style="margin:0 0 .55rem">环境 <b style="color:${envCol}">${env.name}</b> · ${bandTxt}${p.moonOf ? ' · <b style="color:var(--red)">卫星要冲(军工优先)</b>' : ''} —— ${env.note}<br><span style="display:inline-flex;align-items:center;gap:.15rem">可开辟:${allowed}</span> · 本星区划上限 <b style="color:${envCol}">${maxSlotsOf(p)}</b></div>`);

  // 已建成区划:按类型聚合为图标计数
  const counts = {};
  for (const dd of st.districts)
    if (dDone(dd)) counts[dd.type] = (counts[dd.type] || 0) + 1;
  const chips = Object.entries(counts).map(([t, n]) => {
    const dt = DISTRICT_TYPES[t];
    return `<span class="dchip" title="${dt.name} ×${n} · ${dt.desc}${env.mult > 1 ? '(×' + env.mult + ' 环境效率)' : ''}" style="--dc:${dt.color}">${DIST_ICONS[t]}<b>×${n}</b></span>`;
  }).join('');
  const slots = unlockedSlots(p);
  rows.push(`<div class="dchip-row">${chips || '<span class="bld locked">尚无建成区划</span>'}</div>
    <div class="bar-meta" style="margin-top:.35rem"><span>区划 ${st.districts.length} / ${slots} 已解锁</span><span>本星上限 ${maxSlotsOf(p)}</span></div>`);
  // 居住承载触顶提示
  const hcap = habCapacityInfo();
  if (hcap.other + 1 > hcap.limit && st.districts.length < slots)
    rows.push(`<div class="bld locked" style="margin-top:.3rem">⚠ 居住承载触顶(非居住 ${hcap.other} / 上限 ${hcap.limit})—— 仅民生区可继续开辟,请在宜居星球扩建居住规划</div>`);

  // 当前施工(全星球同时一项:区划或建筑);横幅:施工中显示该区划,否则显示主导区划
  const act = activeConstruction(st);
  const domType = act ? act.type
    : Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t)[0];
  if (domType && DISTRICT_TYPES[domType])
    rows.push(artBanner(`img/dist_${domType}.jpg`,
      act ? `${DISTRICT_TYPES[domType].name} · UNDER CONSTRUCTION` : `${DISTRICT_TYPES[domType].name} ×${counts[domType]} · DISTRICT`, 96));
  if (act){
    const dt = DISTRICT_TYPES[act.type];
    rows.push(`<div class="bld building" style="margin-top:.45rem"><span class="dchip-ico" style="color:${dt.color}">${DIST_ICONS[act.type]}</span> ⚒ ${act.label} · ${(dProg(act.obj)*100).toFixed(0)}% · 剩余 ${fmtDuration(dRemain(act.obj))}${docked ? ' · 🚆商贸加速×2' : ''}</div>`);
  }

  // 建筑清单(已建成 + 下一候选)
  const builtList = [];
  let nextCand = null;
  for (const dd of st.districts){
    if (!dDone(dd)) continue;
    for (const b of dd.builds) if (dDone(b)) builtList.push(BUILDINGS[b.id]);
    if (!nextCand && dd.builds.length < BUILDS_PER_DISTRICT){
      const next = nextBuildingFor(p, st, dd);
      if (next && (!act || !next.ready)) nextCand = next;
    }
  }
  if (builtList.length)
    rows.push(`<div class="bld done" style="margin-top:.4rem">${builtList.map(b => `✓ ${b.name}`).join(' · ')}</div>`);
  if (nextCand && !nextCand.ready){
    const unmet = nextCand.conds.filter(c => !c.met).map(c => c.text).join(' · ');
    rows.push(`<div class="bld locked">○ 下一建筑「${nextCand.def.name}」待条件:${unmet}</div>`);
  }

  // 科研产出展示
  if (counts.research)
    rows.push(`<div class="buff-line">本星科研区 ${counts.research} 座 × 环境效率 ${env.mult} —— 正在为「列车研发」积累科研值</div>`);

  // 注资完工(需列车驻留本星系)/ 影响力远程动员
  let investHtml = '';
  if (act){
    const cost = investCost(p, st);
    const costTxt = Object.entries(cost).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
    investHtml = docked
      ? `<button id="invest-btn" class="act-btn cyan" style="margin-top:.6rem" ${canAfford(cost)?'':'disabled'}>注 资 完 工 · ${act.label}(${costTxt})</button>`
      : `<div class="buff-line" style="margin-top:.5rem">列车驻留本星系可商贸加速 ×2,或注资(${costTxt})立即完工</div>`;
    const infCost = infRushCost(dRemain(act.obj));
    investHtml += `<button id="inf-accel-btn" class="act-btn" style="margin-top:.5rem;border-color:rgba(139,92,246,.4);background:rgba(139,92,246,.08);color:var(--purple)" ${(save.influence||0) >= infCost ? '' : 'disabled'}>影响力动员 · 即刻竣工(${infCost} 影响力,可远程)</button>`;
  }
  // 类地化改造(仅火星类岩石行星 · LV5 · 文明指数门槛 · 巨量资源)
  let tfHtml = '';
  if (planetBand(p) === 'std' && p.shader === 'rocky' && !p.moonOf){
    const ok = canTerraform(p);
    const after = Math.max(12, Math.min(50, Math.round(28 * Math.pow(p.radius, 1.35))));
    const costTxt = Object.entries(TERRAFORM_COST).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
    tfHtml = `<button id="terraform-btn" class="act-btn amber" style="margin-top:.55rem" ${ok && canAfford(TERRAFORM_COST) ? '' : 'disabled'}>类 地 化 改 造 → ${after} 区划</button>
      <p class="hint">仅火星类岩石行星可改造(卫星/温室星不可)· 需「生态文明」+ 文明指数 ≥ ${TERRAFORM_REQ.civ} · 耗资:${costTxt}</p>`;
  }
  return rows.join('') + investHtml + tfHtml;
}

function doCollect(sysId){
  const got = collectSystem(sysId);
  if (!got) return;
  const summary = Object.entries(got).map(([k,v]) => `<b>${RESOURCES[k].name}</b> ${fmtNum(v)}`).join(' · ');
  showToast(`资源已装载入库:${summary}`, {sfx:'confirm', say:'Cargo loaded.'});
  if (panelPlanet) renderDevBlock();
  if ($('train-overlay').classList.contains('show')) renderTrainCard();
}

/* ════════ 星系面板(银河视图) ════════ */
function openSysPanel(sys){
  panelSys = sys; panelPlanet = null;
  renderSysPanel();
  $('panel').classList.add('show');
}
function renderSysPanel(){
  if (!panelSys || mode !== 'galaxy') return;
  const sys = panelSys;
  const tr = save.train;
  const here = tr.status === 'docked' && tr.sys === sys.id;
  const visited = !!save.visited[sys.id];
  const conds = sysUnlockConds(sys);
  const unlocked = conds.every(c => c.met);
  const d = tr.status === 'docked' ? sysDist(tr.sys, sys.id) : null;
  const hazardStars = sys.hazard ? '⚠'.repeat(sys.hazard) : '—';
  const spec = sys.bias === 'hab' ? '宜居行星带' : sys.bias ? RESOURCES[sys.bias].name : '综合';

  // 行星概览(仅已探索)
  let planetsHtml;
  if (visited){
    const ps = planetsOf(sys.id);
    planetsHtml = ps.map(p => {
      const lv = devLevel(p);
      return `<div class="cond-item ${lv>0?'met':''}" style="display:flex;justify-content:space-between">
        <span>${p.name} · ${p.type}</span>
        <span>${lv>0 ? LEVELS[lv].name : (p.role==='hab'?'宜居':RESOURCES[p.res.key].name)}</span></div>`;
    }).join('');
    planetsHtml = `<div class="cond-box"><div class="cond-title">行星概览 · ${ps.length} 颗</div>${planetsHtml}</div>`;
  } else {
    planetsHtml = `<div class="cond-box"><div class="cond-title">行星概览</div>
      <div class="cond-item">未探索 —— 列车抵达后方可获得详细星图</div></div>`;
  }

  const condHtml = conds.length ? `
    <div class="cond-box">
      <div class="cond-title">${unlocked ? '航线许可 · 已批准' : '航线许可 · 待满足'}</div>
      ${conds.map(c => `<div class="cond-item ${c.met?'met':''}">${c.met?'✓':'○'} ${c.text}</div>`).join('')}
    </div>` : '';

  let actions = '';
  if (here){
    actions = `<button class="act-btn cyan" id="sys-enter">进 入 星 系(列车驻留中)</button>`;
  } else {
    const eta = tr.status === 'docked' ? fmtDuration(d / trainSpeed() * 60) : null;
    const travelLabel = tr.status !== 'docked' ? '列车航行中…'
      : !unlocked ? '航 线 未 解 锁'
      : `启 程 · 预计 ${eta}`;
    actions = `<button class="act-btn amber" id="sys-travel" ${tr.status!=='docked'||!unlocked?'disabled':''}>${travelLabel}</button>`;
    if (visited) actions += `<button class="act-btn cyan" id="sys-enter" style="margin-top:.55rem">查 看 星 系</button>`;
  }

  $('panel-body').innerHTML = `
    <h2><span style="color:${sys.nodeCol}">${SYS_ICON}</span>${sys.name}</h2>
    <div class="type-tag">${sys.star} · ${sys.en || sys.id.toUpperCase()}</div>
    <p class="desc">
      ${sys.hazard >= 3 ? `<span class="role-tag haz">◆ 高危空域 ${hazardStars}</span>` : ''}
      <span class="role-tag res">◆ 特产 · ${spec}</span>
      ${here ? '<span class="role-tag hab">◆ 列车驻留中</span>' : ''}
      <p style="margin-top:.7rem">${sys.desc}</p></p>
    <div class="divider"></div>
    <div class="sec-label">星系参数</div>
    <div class="phys">
      <div class="item"><div class="k">星图区域</div><div class="v" style="color:${['var(--green)','var(--text)','var(--amber)','#fb923c','var(--red)'][regionOf(sys)]}">${REGIONS[regionOf(sys)].name}</div></div>
      <div class="item"><div class="k">危险度</div><div class="v">${regionOf(sys) === 0 ? '无 · 安全区' : hazardStars}</div></div>
      <div class="item"><div class="k">距列车位置</div><div class="v">${here ? '0' : d === null ? '航行中' : d.toFixed(1) + ' 单位'}</div></div>
      <div class="item"><div class="k">资源丰度</div><div class="v">×${sys.rich.toFixed(1)}</div></div>
      <div class="item"><div class="k">状态</div><div class="v">${here?'驻留':visited?'已探索':'未探索'}</div></div>
    </div>
    <div class="divider"></div>
    ${planetsHtml}
    ${condHtml}
    ${actions}
    ${sys.hazard ? `<p class="hint">高危空域有概率遭遇袭击者 —— 列车<b>火力 + 防御</b>(当前 ${firepower()+defense()})决定缴获还是损失。</p>` : ''}`;

  const tb = $('sys-travel');
  if (tb) tb.onclick = () => {
    if (startTravel(sys.id)){
      showToast(`列车自 <b>${sysById(save.train.from).name}</b> 启程,目的地 <b>${sys.name}</b>`, {sfx:'jump', say:'Departure confirmed.'});
      if (typeof buildRouteHistory === 'function') buildRouteHistory();   // 航线履历更新
      renderSysPanel(); refreshDock(); refreshLabelText(); refreshTopbar();
    }
  };
  const eb = $('sys-enter');
  if (eb) eb.onclick = () => setMode('system', sys.id);
}

/* ════════ 底部坞 ════════ */
function refreshDock(){
  const dock = $('dock');
  dock.innerHTML = '';
  if (mode === 'galaxy'){
    for (const sys of SYSTEMS){
      const visited = !!save.visited[sys.id];
      const unlocked = sysUnlocked(sys);
      const here = save.train.status === 'docked' && save.train.sys === sys.id;
      const el = document.createElement('div');
      el.className = 'dock-item' + (visited?' developed':'') + (galaxySel===sys?' active':'') + (!unlocked&&!visited?' locked':'');
      el.innerHTML = `
        <div class="pic" style="color:${sys.nodeCol}">${SYS_ICON}</div>
        <div class="nm">${here ? '🚆 ' : ''}${sys.name}</div>
        <div class="lv" style="${visited?'color:var(--green)':''}">${here?'驻留':visited?'已探索':unlocked?'可航行':'🔒'}</div>`;
      el.onclick = () => focusSystemNode(sys.id);
      dock.appendChild(el);
    }
    return;
  }
  for (const o of planetObjs){
    const d = o.data, lv = devLevel(d);
    if (d.moonOf && lv === 0 && !hardUnlocked(d)) continue;
    const locked = lv === 0 && !hardUnlocked(d);
    const el = document.createElement('div');
    el.className = 'dock-item' + (lv>0?' developed':'') + (view.focus===o?' active':'') + (locked?' locked':'');
    const nm = d.key==='kenxi/canglan' ? '★ '+d.name : (d.moonOf ? '☾ '+d.name : d.name);
    el.innerHTML = `
      <div class="pic" style="color:${dotColor(d)}">${iconOf(d)}</div>
      <div class="nm">${nm}</div>
      <div class="lv" style="${lv>0 ? `color:${d.role==='hab'?'var(--green)':'var(--amber)'}` : (locked ? '' : 'color:var(--cyan)')}">${lv>0 ? LEVELS[lv].name : (locked ? '🔒 未解锁' : '可建立')}</div>`;
    el.onclick = () => focusPlanet(d.key);
    dock.appendChild(el);
  }
  refreshLabelText();
}

/* ════════ 返回按钮 / 顶栏 ════════ */
function refreshBackBtn(){
  const btn = $('back-btn');
  if (mode === 'system'){
    btn.classList.add('show');
    btn.textContent = view.focus ? '← 返回星系视图' : '← 银河系总图';
  } else if (galaxySel){
    btn.classList.add('show');
    btn.textContent = '← 返回总图';
  } else btn.classList.remove('show');
}
function backAction(){
  if (mode === 'system'){
    if (view.focus) unfocus();
    else setMode('galaxy');
  } else if (galaxySel) unfocusSystemNode();
}
function refreshTopbar(){
  if (mode === 'galaxy'){
    $('loc-name').textContent = '银河系 · 总图';
    $('loc-en').textContent = 'GALAXY MAP';
  } else {
    const sys = sysById(curSysId);
    $('loc-name').textContent = sys.name + '星系';
    $('loc-en').textContent = (sys.en || sys.id) + ' SYSTEM';
  }
  $('galaxy-btn').classList.toggle('active', mode === 'galaxy');
  const tr = save.train;
  $('train-btn').classList.toggle('travel', tr.status === 'travel');
  let ready = !!save.pendingRaid;
  if (!ready && tr.status === 'docked'){
    const info = collectInfo(tr.sys);
    ready = info.avail > 1 && info.cdLeft <= 0 && info.cap > 0;
  }
  $('train-badge').classList.toggle('show', ready);
}
function onModeChanged(){
  panelPlanet = null; panelSys = null;
  refreshDock();
  refreshTopbar();
  updateDistrictUniforms();
}

/* ════════ 模态图纸层(编辑部蓝图风背景轨迹) ════════ */
let _bpShown = false;
function genBlueprintLayer(){
  const w = innerWidth, h = innerHeight;
  const R = (a, b) => a + Math.random() * (b - a);
  let svg = '';
  for (let i = 0; i < 3; i++){
    const cx = R(w*0.2, w*0.8), cy = R(h*0.15, h*0.85);
    const rx = R(w*0.3, w*0.62), ry = rx * R(0.3, 0.6), rot = R(-30, 30);
    svg += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot.toFixed(1)} ${cx} ${cy})" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"${i === 2 ? ' stroke-dasharray="3 7"' : ''}/>`;
    // 弧线上的小圆点(轨道上的天体)
    const rad = rot * Math.PI / 180;
    for (let k = 0; k < 2; k++){
      const th = R(0, Math.PI * 2);
      const ex = Math.cos(th) * rx, ey = Math.sin(th) * ry;
      const px = cx + ex * Math.cos(rad) - ey * Math.sin(rad);
      const py = cy + ex * Math.sin(rad) + ey * Math.cos(rad);
      svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${R(2, 3.4).toFixed(1)}" fill="rgba(255,255,255,${R(0.16, 0.28).toFixed(2)})"/>`;
    }
  }
  for (let i = 0; i < 4; i++){            // 散落十字基准线
    const x = R(w*0.06, w*0.94), y = R(h*0.08, h*0.92), s = R(5, 8);
    svg += `<path d="M${x - s} ${y} H${x + s} M${x} ${y - s} V${y + s}" stroke="rgba(255,255,255,.15)" stroke-width="1"/>`;
  }
  svg += `<circle cx="${R(w*0.12, w*0.88)}" cy="${R(h*0.12, h*0.88)}" r="${R(20, 42)}" fill="none" stroke="rgba(255,255,255,.08)" stroke-dasharray="2 6"/>`;
  $('bp-layer').innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svg}</svg>`;
}
function tickBlueprintLayer(){
  const anyOpen = ['story-overlay','train-overlay','settings-overlay','battle-overlay']
    .some(id => $(id).classList.contains('show'));
  if (anyOpen && !_bpShown){ genBlueprintLayer(); $('bp-layer').classList.remove('hidden'); _bpShown = true; }
  else if (!anyOpen && _bpShown){ $('bp-layer').classList.add('hidden'); _bpShown = false; }
}

/* ════════ Toast ════════ */
let toastTimer = null;
function showToast(html, cue){
  const t = $('toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  if (cue){
    if (cue.sfx) sfx(cue.sfx);
    if (cue.say) speak(cue.say);
  }
}

/* ════════ 海盗基地进攻入口 ════════ */
function pirateLabelClick(sysId){
  if (!pirateAlive(sysId)){ sfx('err'); return; }
  const tr = save.train;
  if (tr.status !== 'docked' || tr.sys !== sysId || localTransit()){
    showToast('列车需停靠本星系,才能突入小行星带清剿海盗', { sfx:'err' });
    return;
  }
  openBattle(sysId, true);
}

/* ════════ 剧本系统(事件绑定星球:讯号就绪 + 停靠对应星系才能接收) ════════ */
function questLocOf(track){            // 当前待接收事件的绑定行星 key(scar 不绑定)
  if (track === 'main') return QUEST_AT.main[Math.min(save.story.idx, QUEST_AT.main.length - 1)];
  if (track === 'side') return QUEST_AT.side;
  if (track === 'port') return QUEST_AT.port;
  return null;
}
function atQuestLoc(track){            // 宽松判定:停靠绑定行星所在星系即可;scar 停靠任意星系
  const tr = save.train;
  if (tr.status !== 'docked') return false;
  const loc = questLocOf(track);
  return !loc || tr.sys === loc.split('/')[0];
}
function storyReady(){
  return save.story && save.story.idx < STORY.length && Date.now() >= save.story.nextAt && atQuestLoc('main');
}
function sideReady(){
  return save.side && save.side.idx < SIDE_STORY.length && Date.now() >= save.side.nextAt && atQuestLoc('side');
}
/* 内容就绪但未到位的事件(用于地图 wifi 图标与新手提示) */
function questPendingList(){
  const out = [];
  if (save.story && save.story.idx < STORY.length && Date.now() >= save.story.nextAt)
    out.push({ track:'main', loc: questLocOf('main') });
  if (save.side && save.side.idx < SIDE_STORY.length && Date.now() >= save.side.nextAt)
    out.push({ track:'side', loc: questLocOf('side') });
  if (portStoryContentReady()) out.push({ track:'port', loc: questLocOf('port') });
  return out;
}
function questHintTick(){              // 新手提示:讯号源出现时播报一次"去哪接收"
  for (const q of questPendingList()){
    const idx = q.track === 'main' ? save.story.idx : q.track === 'side' ? save.side.idx : save.portStory.idx;
    const k = q.track + ':' + idx;
    if (save.questAnn[k] || atQuestLoc(q.track)) continue;
    save.questAnn[k] = 1;
    const p = planetByKey(q.loc);
    showToast(`检测到讯号源 —— 停靠 <b>${p ? p.name : q.loc}</b> 所在星系接收(地图上有标记)`, { sfx:'signal', say:'Signal source located.' });
    persistSave();
  }
}
function scarReady(){
  return save.scar && save.scar.pending && save.scar.idx < SCAR_STORY.length && atQuestLoc('scar');
}
function scarChapter(){                       // 《地疤》段落 → 伪章节(复用剧情卡)
  const seg = SCAR_STORY[save.scar.idx];
  return {
    title: scarArcTitle(save.scar.idx),
    eyebrow: `地疤 · 残响 ${String(save.scar.idx + 1).padStart(3, '0')} / ${SCAR_STORY.length}`,
    body: [seg.t],
    choices: seg.ask || [{ label:'收存这段残响,继续航行', sub: seg.sub || '信号存档', fx: seg.fx || {}, out: null }],
  };
}
function applyScarChoice(ch, ci){
  applyChoiceFx(ch.choices[ci].fx || {});
  save.scar.idx++;
  save.scar.pending = false;
  persistSave();
}
let prevSignal = '';
function checkSignal(){
  const btn = $('signal-btn');
  const modalOpen = $('story-overlay').classList.contains('show');
  if (modalOpen){ btn.classList.remove('show'); return; }
  let cur = '';
  if (storyReady()){
    btn.classList.add('show'); btn.classList.remove('anom', 'port', 'scar');
    btn.innerHTML = '<span class="sdot"></span>深空讯号 · 接收';
    cur = 'main';
  } else if (sideReady()){
    btn.classList.add('show'); btn.classList.add('anom'); btn.classList.remove('port', 'scar');
    btn.innerHTML = '<span class="sdot"></span>异常讯号 · 凛渊';
    cur = 'side';
  } else if (portStoryReady()){
    btn.classList.add('show'); btn.classList.remove('anom', 'scar'); btn.classList.add('port');
    btn.innerHTML = '<span class="sdot"></span>航运公报 · 接收';
    cur = 'port';
  } else if (scarReady()){
    btn.classList.add('show'); btn.classList.remove('anom', 'port'); btn.classList.add('scar');
    btn.innerHTML = '<span class="sdot"></span>残响频段 · 地疤';
    cur = 'scar';
  } else {
    btn.classList.remove('show');
  }
  if (cur && cur !== prevSignal){
    sfx('signal');
    speak({ main:'Incoming transmission.', side:'Anomalous signal detected.',
            port:'Logistics bulletin received.', scar:'Faint echo on the line.' }[cur]);
  }
  prevSignal = cur;
}
function openStory(){
  const track = storyReady() ? 'main' : sideReady() ? 'side' : portStoryReady() ? 'port' : scarReady() ? 'scar' : null;
  if (!track) return;
  const scar = track === 'scar';
  const state = track === 'main' ? save.story : track === 'side' ? save.side : track === 'port' ? save.portStory : save.scar;
  const book = track === 'main' ? STORY : track === 'side' ? SIDE_STORY : track === 'port' ? PORT_STORY : SCAR_STORY;
  const ch = scar ? scarChapter() : book[state.idx];
  const card = $('story-card');
  card.classList.toggle('anom', track === 'side');
  card.classList.toggle('scar', scar);
  card.dataset.track = track;
  const art = track === 'port'
    ? `<div class="art-banner" style="background-image:url('img/port_story.jpg');height:128px;margin:.2rem 0 .8rem"><span class="art-cap">CANGLAN ORBITAL STARPORT</span></div>` : '';
  card.innerHTML = `
    <div class="chapno">${String(state.idx + 1).padStart(scar ? 3 : 2, '0')} <span style="opacity:.5">/</span> ${String(book.length).padStart(2, '0')}</div>
    ${art}
    <div class="eyebrow">${ch.eyebrow}</div>
    <h3>${ch.title}</h3>
    <div class="sbody">${ch.body.map(p=>`<p>${p}</p>`).join('')}</div>
    <div class="schoices">${ch.choices.map((c,i)=>`
      <button class="schoice" data-i="${i}"><div class="cl">${c.label}</div><div class="cs">▸ ${c.sub}</div></button>`).join('')}
    </div>`;
  card.querySelectorAll('.schoice').forEach(btn => {
    btn.onclick = () => resolveStory(ch, +btn.dataset.i, track);
  });
  $('story-overlay').classList.add('show');
  $('signal-btn').classList.remove('show');
  sfx('open');
  tickBlueprintLayer();
}
function resolveStory(ch, ci, track){
  const choice = ch.choices[ci];
  if (track === 'main'){
    applyStoryChoice(ch, ci);
    // 事件推进 → 新手小行星战:碎石群切入沧澜轨道
    const tut = TUT_RAIDS[save.story.idx];
    if (tut && !save.tutRaids[save.story.idx]){
      save.tutRaids[save.story.idx] = 1;
      save.pendingRaid = { sysId:'kenxi', at: Date.now(), tutorial: tut.stage };
      persistSave();
      setTimeout(() => showToast('⚠ 航道警报:一群脱轨陨星正切入沧澜轨道 —— 拦截它们,残骸归你', { sfx:'err', say:'Debris field inbound.' }), 1200);
    }
  }
  else if (track === 'side') applySideChoice(ch, ci);
  else if (track === 'port') applyPortChoice(ch, ci);
  else applyScarChoice(ch, ci);
  if (!choice.out){                          // 无结语的段落(地疤普通残响):直接收卡
    $('story-overlay').classList.remove('show');
    sfx('confirm');
    tickUI(); refreshDock();
    return;
  }
  const card = $('story-card');
  const done = track === 'main' ? save.story.idx >= STORY.length
    : track === 'side' ? save.side.idx >= SIDE_STORY.length
    : track === 'port' ? save.portStory.idx >= PORT_STORY.length
    : save.scar.idx >= SCAR_STORY.length;
  card.querySelector('.schoices').remove();
  card.insertAdjacentHTML('beforeend', `
    <div class="outcome">${choice.out}</div>
    <div class="close-row"><button class="close-btn">${done ? '完' : '继续'}</button></div>`);
  card.querySelector('.close-btn').onclick = () => {
    $('story-overlay').classList.remove('show');
    tickUI(); refreshDock();
    if (panelPlanet) renderDevBlock();
  };
  if (choice.fx && choice.fx.jump) showToast(`时间跃迁完成 · 前哨开发度提升`, {sfx:'jump', say:'Temporal acceleration complete.'});
  else sfx('confirm');
  tickUI();
}

/* ════════ 系统设置 ════════ */
let resetArmed = false, resetTimer = null;
function openSettings(){
  resetArmed = false;
  renderSettings();
  $('settings-overlay').classList.add('show');
  tickBlueprintLayer();
}
function renderSettings(){
  const card = $('settings-card');
  const ago = lastSavedAt ? fmtDuration((Date.now()-lastSavedAt)/1000) + ' 前' : '—';
  card.innerHTML = `
    <h3>系统</h3>
    <div class="save-meta">
      存档状态 · ${storageOK ? '<span>自动持久化已启用</span>' : '<span class="warn">仅本次会话(环境不支持持久化,请用导出备份)</span>'}<br>
      上次保存 · ${storageOK ? ago : '—'}<br>
      提示 · 顶栏音乐按钮同时控制<span>音效与交互语音</span>(浏览器需先有一次点击才会出声)
    </div>
    <div class="set-btn-row">
      <button class="sbtn" id="s-save">立即保存<span class="k">SAVE</span></button>
      <button class="sbtn" id="s-export">导出存档<span class="k">EXPORT</span></button>
      <button class="sbtn" id="s-import">导入存档<span class="k">IMPORT</span></button>
      <button class="sbtn danger ${resetArmed?'armed':''}" id="s-reset">${resetArmed ? '确认抹除一切,重新开始?' : '重新开始'}<span class="k">RESET</span></button>
    </div>
    <div id="io-area">
      <textarea id="io-text" spellcheck="false"></textarea>
      <div class="io-actions">
        <button id="io-copy">复制</button>
        <button id="io-apply" style="display:none">确认导入</button>
      </div>
    </div>
    <div class="close-row"><button class="close-btn">关闭</button></div>`;
  card.querySelector('.close-btn').onclick = () => $('settings-overlay').classList.remove('show');
  $('s-save').onclick = async () => {
    if (!storageOK){ showToast('当前环境不支持持久化,请使用导出存档'); return; }
    const ok = await persistNow();
    showToast(ok ? '存档已写入' : '保存失败,请稍后重试或导出备份', ok ? {sfx:'blip', say:'Progress saved.'} : {sfx:'err'});
    renderSettings();
  };
  $('s-export').onclick = () => {
    // 直接下载 .json 存档文件;文本框保留作为剪贴板备份路径
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = `星垦存档_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    const blob = new Blob([JSON.stringify(save)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast(`存档文件已下载:<b>${name}</b>`, { sfx:'blip', say:'Archive exported.' });
    $('io-area').classList.add('show');
    $('io-apply').style.display = 'none';
    $('io-copy').style.display = '';
    const txt = $('io-text');
    txt.value = JSON.stringify(save);
  };
  $('io-copy').onclick = async () => {
    const txt = $('io-text');
    txt.focus(); txt.select();
    try{ await navigator.clipboard.writeText(txt.value); showToast('存档已复制到剪贴板', {sfx:'blip'}); }
    catch(e){ showToast('请手动全选复制文本框内容'); }
  };
  $('s-import').onclick = () => {
    // 优先走文件选择;文本框粘贴作为兜底
    let fi = $('io-file');
    if (!fi){
      fi = document.createElement('input');
      fi.type = 'file'; fi.accept = '.json,application/json'; fi.id = 'io-file';
      fi.style.display = 'none';
      document.body.appendChild(fi);
    }
    fi.onchange = () => {
      const f = fi.files && fi.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { $('io-text').value = String(rd.result || ''); $('io-apply').click(); };
      rd.readAsText(f);
      fi.value = '';
    };
    fi.click();
    $('io-area').classList.add('show');
    $('io-apply').style.display = '';
    $('io-copy').style.display = 'none';
    const txt = $('io-text');
    txt.value = '';
    txt.placeholder = '已打开文件选择器;也可直接粘贴存档 JSON 后点确认导入…';
  };
  $('io-apply').onclick = () => {
    try{
      const data = JSON.parse($('io-text').value.trim());
      if (!data || typeof data !== 'object' || !data.est) throw 0;
      save = data.ver === 2 ? data : migrateOld(data);
      normalizeSave();
      maybeUnlockSide();
      persistSave();
      afterSaveChanged();
      $('settings-overlay').classList.remove('show');
      showToast('存档已导入 · 欢迎回来,指挥官', {sfx:'confirm', say:'Archive restored. Welcome back, Commander.'});
    }catch(e){ showToast('导入失败:存档格式无效', {sfx:'err'}); }
  };
  $('s-reset').onclick = () => {
    if (!resetArmed){
      resetArmed = true;
      renderSettings();
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { resetArmed = false; if ($('settings-overlay').classList.contains('show')) renderSettings(); }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    resetGame();
    $('settings-overlay').classList.remove('show');
  };
}
function resetGame(){
  const bgm = save.bgm;
  save = freshSave();
  save.bgm = bgm;
  normalizeSave();
  persistSave();
  afterSaveChanged();
  showToast('星图已重置 · 新的拓荒开始了', {sfx:'confirm', say:'New campaign initialized.'});
}
function afterSaveChanged(){
  Object.keys(prevLevels).forEach(k => delete prevLevels[k]);
  Object.keys(prevUnlocked).forEach(k => delete prevUnlocked[k]);
  prevSlots = null;
  panelPlanet = null; panelSys = null;
  setMode('system', save.train.status === 'docked' ? save.train.sys : 'kenxi');
  tickUI();
}

/* ════════ 每秒主刷新 ════════ */
function tickUI(){
  // 殖民区划:自动开辟/建造推进 + 效果聚合 + 科研值积累 + 星球表面投影
  colonyTick();
  computeColonyFx();
  accrueResearch();
  tickQueues();
  portTick();
  questHintTick();
  updateDistrictUniforms();

  // 星系内停靠 / 弹药补给
  const localArr = checkLocalArrival();
  if (localArr){
    showToast(`列车泊入 <b>${localArr.name}</b> 轨道`, {sfx:'blip', say:'Docking complete.'});
    if (panelPlanet) renderDevBlock();
    if ($('train-overlay').classList.contains('show')) renderTrainCard();
  }
  resupplyAmmo();

  // 列车抵达检查
  const arrival = checkArrival();
  if (arrival){
    let msg = `列车已抵达 <b>${arrival.sys.name}</b>`;
    if (arrival.firstVisit) msg += ' · 星图已解锁';
    showToast(msg, {sfx:'levelup', say:'Arrival confirmed.'});
    if (arrival.raidPending) setTimeout(() => openBattle(arrival.sys.id), 1300);
    if (mode === 'galaxy'){ refreshDock(); if (panelSys) renderSysPanel(); }
    if ($('train-overlay').classList.contains('show')) renderTrainCard();
  }
  // 离线期间抵达留下的未决遭遇战:本次会话首次自动弹出
  if (save.pendingRaid && !battleAutoOpened && !battleOpen()){
    battleAutoOpened = true;
    openBattle(save.pendingRaid.sysId);
  }

  // 升级检测(当前星系行星)
  for (const o of planetObjs){
    const d = o.data, lv = devLevel(d);
    if (prevLevels[d.key] !== undefined && lv > prevLevels[d.key] && prevLevels[d.key] > 0){
      showToast(`<b>${d.name}</b> 已发展为 <b>${LEVELS[lv].name}</b>`, {sfx:'levelup', say:'Expansion complete.'});
      refreshDock();
    }
    prevLevels[d.key] = lv;
  }

  // 解锁瞬间提示(垦曦手作行星)
  for (const p of planetsOf('kenxi')){
    if (!p.unlock || save.est[p.key]) continue;
    const un = hardUnlocked(p);
    if (prevUnlocked[p.key] === false && un){
      showToast(`<b>${p.name}</b> 殖民许可已批准 · 可建立前哨`, {sfx:'unlock', say:'Colonization permit granted.'});
      refreshDock();
    }
    prevUnlocked[p.key] = un;
  }

  // 车厢槽位解锁提示
  const slots = carSlots();
  if (prevSlots !== null && slots > prevSlots)
    showToast(`殖民地工业达标 —— 列车可挂载车厢扩展至 <b>${slots} 节</b>`, {sfx:'unlock', say:'Train capacity expanded.'});
  prevSlots = slots;

  // 武器解锁提示
  for (const wid in WEAPONS){
    if (!WEAPONS[wid].unlock) continue;
    const un = weaponUnlocked(wid);
    if (prevWeaponUn[wid] === false && un)
      showToast(`军工解锁 —— 武器平台可装备 <b>${WEAPONS[wid].name}</b>`, {sfx:'unlock', say:'New weapon available.'});
    prevWeaponUn[wid] = un;
  }

  refreshLabelText();
  refreshTrainTag();
  tickBlueprintLayer();
  checkSignal();
  refreshTopbar();
  // 文明指数构成说明(悬停查看)
  const popPart = Math.log10(1 + totalPop()), resPart = Math.log10(1 + totalRes());
  const balPart = 0.25 * Math.min(sumLevels('hab'), sumLevels('res'));
  const bonusPart = (save.story ? save.story.buffs.civ : 0) + COLONY_FX.civ;
  $('civ-index').parentElement.title =
    `文明指数构成(均衡发展收益最大):\n人口规模 log10(总人口) = ${popPart.toFixed(2)}\n工业规模 log10(累计资源) = ${resPart.toFixed(2)}\n均衡协同 0.25×min(居住等级和, 资源等级和) = ${balPart.toFixed(2)}\n剧情与科研区加成 = ${bonusPart.toFixed(2)}`;
  $('civ-index').textContent = civIndex().toFixed(2);
  $('civ-tier').textContent = '文明指数 · ' + civTier();
  $('pop-total').textContent = fmtNum(totalPop());
  $('rp-total').textContent = fmtNum(save.research || 0);
  $('inf-total').textContent = fmtNum(save.influence || 0);
  $('dev-count').textContent = devCountAll() + ' / ' + allPlanets().length;
  if (panelPlanet) renderDevBlock();
  if (panelSys && mode === 'galaxy' && save.train.status === 'travel') renderSysPanel();
  if ($('train-overlay').classList.contains('show')) refreshTrainDynamic();
}
