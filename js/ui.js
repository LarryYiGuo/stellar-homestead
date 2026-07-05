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

/* ── 二段确认:第一次点击进入确认态(5 秒过期),再次点击才执行 ──
   行星面板每秒重渲染 → 渲染时用 armedNow(key) 恢复确认态;
   confirmGate(key) 在点击处调用:返回 true 表示已确认可执行 */
let _armKey = null, _armAt = 0;
function armedNow(key){ return _armKey === key && Date.now() - _armAt < 5000; }
function confirmGate(key, rerender){
  if (armedNow(key)){ _armKey = null; return true; }
  _armKey = key; _armAt = Date.now();
  sfx('blip');
  (rerender || renderDevBlock)();
  return false;
}
function armCls(key){ return armedNow(key) ? ' armed' : ''; }
function armTxt(key, normal, confirm){ return armedNow(key) ? '⚠ ' + (confirm || '再次点击确认') : normal; }
/* 列车面板等非每秒重渲染处:按钮原地变形确认 */
function btnConfirm(btn, run){
  if (btn.dataset.armed){ delete btn.dataset.armed; btn.classList.remove('armed'); run(); return; }
  btn.dataset.armed = '1';
  btn.classList.add('armed');
  const old = btn.innerHTML;
  btn.innerHTML = '再次点击确认';
  sfx('blip');
  setTimeout(() => {
    if (btn.isConnected && btn.dataset.armed){
      delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = old;
    }
  }, 4000);
}

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
function planetInfoHtml(d){
  const roleTag = d.role === 'hab'
    ? `<span class="role-tag hab">${DIST_ICONS.habitation} ${d.key==='kenxi/canglan' ? '主殖民地' : '居住型'} · 容量 ${(d.capScale*100).toFixed(0)}%</span>`
    : `<span class="role-tag res">${RES_ICONS[d.res.key]} 资源型 · ${RESOURCES[d.res.key].name} ×${d.res.rich.toFixed(1)}</span>`;
  return `
    <div class="art-banner hero" style="background-image:url('${planetArtOf(d)}')"><span class="art-cap">${d.id.toUpperCase()} · ORBITAL SURVEY</span></div>
    <p class="desc">${roleTag}<p style="margin-top:.7rem">${d.desc}</p></p>
    <div class="divider"></div>
    <div class="sec-label">行星参数</div>
    <div class="phys">
      <div class="item"><div class="k">半径</div><div class="v">${d.radius.toFixed(2)} R⊕</div></div>
      <div class="item"><div class="k">轨道半径</div><div class="v">${d.moonOf ? '环沧澜轨道' : d.au.toFixed(2)+' AU'}</div></div>
      <div class="item"><div class="k">公转周期</div><div class="v">${d.moonOf ? '3.2 标准日' : d.period+' 标准日'}</div></div>
      <div class="item"><div class="k">宜居度</div><div class="v">${(d.habit*100).toFixed(0)} %</div></div>
      ${moonsOf(d).length ? `<div class="item"><div class="k">卫星</div><div class="v">${moonsOf(d).length} 颗(${moonsOf(d).map(m => MOON_SIZES[m.size].name[0]).join('/')})</div></div>
      <div class="item"><div class="k">卫星港潜力</div><div class="v" style="color:var(--cyan)">+${moonsOf(d).reduce((s,m)=>s+m.slots,0)} 区划</div></div>` : ''}
    </div>`;
}
let panelTab = '概览';
function openPanel(d){
  panelPlanet = d; panelSys = null;
  panelTab = '概览';
  const alias = d.alias ? `<span style="font-size:.85rem;font-weight:600;color:var(--text-dim)">(${d.alias})</span>` : '';
  $('panel-body').innerHTML = `
    <h2><span style="color:${dotColor(d)}">${iconOf(d)}</span>${d.name}${alias}</h2>
    <div class="type-tag">${d.type} · ${d.id.toUpperCase()}</div>
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
      ? `这是一${d.moonOf?'颗卫星':'颗'}<b style="color:var(--green)">居住型</b>${d.moonOf?'殖民地':'星球'}:人口自行增长(宜居度 ${(d.habit*100).toFixed(0)}% 决定速度),但要吃<b>消费品</b>${d.habit < CONSUME_ICE_HABIT ? '和<b>生命支持</b>' : ''}——供得上才长得动。民生区决定承载上限(容量 ${(d.capScale*100).toFixed(0)}%)。`
      : `这是一颗<b style="color:var(--amber)">资源型</b>星球:建立后持续产出<b style="color:var(--amber)">${RESOURCES[d.res.key].name}</b>(丰度 ×${d.res.rich.toFixed(1)})进本地仓。<b>运出去才算数</b>:出口量直接推动本星开发等级。`;
    const condHtml = conds.length ? `
      <div class="cond-box">
        <div class="cond-title">${locked ? '殖民许可 · 待满足条件' : '殖民许可 · 已批准'}</div>
        ${conds.map(c => `<div class="cond-item ${c.met?'met':''}">${c.met?'✓':'○'} ${c.text}</div>`).join('')}
      </div>` : '';
    blk.innerHTML = `
      ${dockHtml}
      ${condHtml}
      ${(() => {                                   // 火种规则:星系首殖民消耗休眠舱
        const seed = !sysHasColony(d.sysId);
        const hasCryo = seedCryoIndex() >= 0;
        const label = locked ? '条 件 未 满 足'
          : seed ? '播 撒 火 种(消耗 休眠舱 ×1)'
          : `建 立 前 哨(移民 ${fmtNum(ESTABLISH_COLONISTS)})`;
        const ek = 'est:' + d.key;
        return `<button id="establish-btn" class="act-btn${armCls(ek)}" ${locked || (seed && !hasCryo) ? 'disabled' : ''}>${locked ? label : armTxt(ek, label, seed ? '确认播撒火种(整舱消耗休眠舱)' : `确认建立前哨(移民 −${fmtNum(ESTABLISH_COLONISTS)})`)}</button>
          ${seed ? `<div class="bld ${hasCryo ? 'done' : 'locked'}" style="margin-top:.35rem">${hasCryo ? '✓' : '○'} 无人星系的第一块殖民地只能由<b>休眠舱(火种)</b>建立${hasCryo ? '(编组就绪)' : '(编组中没有休眠舱)'}</div>` : ''}`;
      })()}
      <p class="hint">${roleHint}</p>
      <p class="hint">${!sysHasColony(d.sysId)
        ? '本星系尚无人定居:建立将整舱消耗一节休眠舱(内含 1000 名深眠拓荒者与种子库),不占用随车移民。'
        : `建立殖民地将消耗随车移民 ${fmtNum(ESTABLISH_COLONISTS)} 人。`}开发等级来自你的经营:开辟区划、建造建筑、运入移民、运出产出。</p>
      <div class="divider"></div>
      ${planetInfoHtml(d)}`;
    bindDockBtn(d);
    if (!locked){
      const eb = $('establish-btn');
      if (eb) eb.onclick = () => {
        if (!confirmGate('est:' + d.key)) return;
        const seed = !sysHasColony(d.sysId);
        const found = () => {
          save.est[d.key] = Date.now();
          if (d.role === 'hab') save.pop[d.key] = (save.pop[d.key] || 0) + ESTABLISH_COLONISTS;
          addInfluence(INF_FX.establish);   // 开拓殖民影响力
        };
        if (seed){
          const i = seedCryoIndex();
          if (i < 0){ sfx('err'); return; }
          save.train.cars.splice(i, 1);            // 火种舱整舱消耗
          found();
          persistSave();
          showToast(`火种舱降下 <b>${d.name}</b> 轨道 —— 1000 名拓荒者苏醒,本星系第一块殖民地建立`, {sfx:'unlock', say:'Seed colony deployed.'});
        } else {
          if (save.train.pax < ESTABLISH_COLONISTS){ sfx('err'); return; }
          save.train.pax -= ESTABLISH_COLONISTS;
          found();
          persistSave();
          showToast(`<b>${d.name}</b> · ${fmtNum(ESTABLISH_COLONISTS)} 名拓荒者登陆,前哨已建立`, {sfx:'confirm', say:'Outpost established.'});
        }
        renderDevBlock(); refreshDock(); refreshLabelText();
      };
    }
    return;
  }

  const prog = devProgress(d);
  const isMax = lv >= MAX_LEVEL;
  let nextHtml, etaHtml = '';
  if (isMax){
    nextHtml = `<div class="next-info">已达最高阶段 <b>${lvName(d, MAX_LEVEL)}</b>${d.role==='res' ? ',资源产出进入永续模式。' : ',行星已完全融入文明网络。'}</div>`;
  } else {
    nextHtml = `<div class="next-info">下一阶段 <b>${lvName(d, lv+1)}</b> · 还差 <b>${Math.ceil(LEVELS[lv+1].th - pts)}</b> 开发点 —— ${d.role === 'hab' ? '开区划 / 建建筑 / 涨人口 / 运移民' : '开区划 / 建建筑 / 出口产出'}皆可推进</div>`;
    etaHtml = `<span>${Math.floor(pts)} / ${LEVELS[lv+1].th} pts</span>`;
  }

  let ecoHtml = '';
  if (d.role === 'hab'){
    const pop = popOf(d), cap = popCapOf(d);
    const g = popGrowthInfo(d);
    const growLine = g.blocked
      ? `<b style="color:var(--red)">⚠ ${g.blocked} —— 增长停滞</b>`
      : g.rate > 0
        ? `增长 <b style="color:var(--green)">+${fmtNum(g.rate)}/分</b>${g.mults.map(([n,v]) => ` · ${n} ×${v.toFixed(2)}`).join('')}`
        : pop >= cap * 0.98 ? '<b style="color:var(--amber)">承载饱和 —— 开辟民生区可继续增长</b>' : '';
    ecoHtml = `
      <div class="eco-box">
        <div class="eco-k">行星人口</div>
        <div class="eco-v pop">${fmtNum(pop)}</div>
        <div class="eco-sub">承载上限 <span>${fmtNum(cap)}</span>(基础 + 民生区 ×${habDistrictCount(d)})</div>
        <div class="bar"><div class="fill" style="width:${Math.min(100, pop/cap*100)}%"></div></div>
        <div class="buff-line">${growLine}</div>
        <div class="buff-line">资源协同:全银河资源型星球等级和 ${sumLevels('res')} → 承载 <b>×${capBuff().toFixed(2)}</b></div>
      </div>`;
  } else {
    const avail = resAvail(d);
    const docked = save.train.status === 'docked' && save.train.sys === d.sysId;
    const info = collectInfo(d.sysId);
    const canCollect = docked && info.avail > 0 && info.cdLeft <= 0 && info.space > 0;
    const exported = (save.exported && save.exported[d.key]) || 0;
    ecoHtml = `
      <div class="eco-box">
        <div class="eco-k">${RESOURCES[d.res.key].name} · 产出</div>
        <div class="eco-v resv">${fmtNum(resRateOf(d))}<span style="font-size:.55em;color:var(--text-muted)"> /分</span></div>
        <div class="eco-sub">本地仓 <span style="color:var(--amber)">${fmtNum(avail)}</span> / ${fmtNum(storeCapOf(d))} · 丰度 ×${d.res.rich.toFixed(1)} · 累计出口 <span>${fmtNum(exported)}</span></div>
        <div class="buff-line">劳动力协同:居住星等级和 ${sumLevels('hab')} → 产率 <b>×${rateBuff().toFixed(2)}</b> · 总人口红利 <b>×${workforceBuff().toFixed(2)}</b></div>
        ${docked ? `<button id="collect-btn" class="act-btn amber" style="margin-top:.7rem" ${canCollect?'':'disabled'}>${info.cdLeft > 0 ? '装载冷却 · ' + fmtDuration(info.cdLeft) : info.avail <= 0 ? '仓 内 无 资 源' : info.space <= 0 ? '货 舱 已 满' : '装 载 本 星 系 资 源'}</button>`
          : `<div class="buff-line" style="color:var(--text-muted)">⚠ 产出滞留仓内 —— 列车收取 / 贸易线 / 星门运出,出口才推动开发</div>`}
      </div>`;
  }

  // ── 标签页:导航固定最顶端,每次只渲染当前页(告别长滚动) ──
  const migHtml = migBoxHtml(d);
  const portHtml = starportHtml(d);
  const sh = shortOf(d);
  const shortDot = (sh.chem || sh.ice || sh.he3) ? '<span class="tab-dot red"></span>' : '';
  const cst = colonyState(d);
  const idleDot = (!activeConstruction(cst) && cst.districts.length < unlockedSlots(d)) ? '<span class="tab-dot amber"></span>' : '';
  const tabs = [
    ['概览', ''],
    migHtml ? ['迁移', ''] : null,
    ['仓储', shortDot],
    portHtml ? ['星港', ''] : null,
    ['区划', idleDot],
    ['资料', ''],
  ].filter(Boolean);
  if (!tabs.some(([t]) => t === panelTab)) panelTab = '概览';
  const navHtml = `<div class="panel-nav">${tabs.map(([t, dot]) =>
    `<button data-ptab="${t}" class="${panelTab === t ? 'on' : ''}">${t}${dot}</button>`).join('')}</div>`;

  let body;
  if (panelTab === '概览'){
    body = `
      <div class="level-row">
        <div class="level-name">${lvName(d, lv)}</div>
        <div class="level-num">LV ${lv} / ${MAX_LEVEL}</div>
      </div>
      <div class="bar"><div class="fill ${isMax?'max':''}" style="width:${(isMax?1:prog)*100}%"></div></div>
      <div class="bar-meta"><span>${isMax ? 'MAX' : (prog*100).toFixed(1)+'%'}</span>${etaHtml}</div>
      ${nextHtml}
      ${ecoHtml}`;
  } else if (panelTab === '迁移'){
    body = migHtml;
  } else if (panelTab === '仓储'){
    body = storeHtml(d);
  } else if (panelTab === '星港'){
    body = portHtml;
  } else if (panelTab === '区划'){
    body = `<div class="sec-label" style="--c:var(--purple)">殖民区划</div>
      ${districtsHtml(d)}
      <p class="hint">开发等级越高,夜面城市灯光越密集——切换到星球背阳面即可观察。</p>`;
  } else {
    body = planetInfoHtml(d);
  }
  blk.innerHTML = navHtml + dockControlHtml(d) + body;
  blk.querySelectorAll('[data-ptab]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    if (panelTab === b.dataset.ptab) return;
    panelTab = b.dataset.ptab;
    sfx('blip');
    renderDevBlock();
    const inner = document.querySelector('#panel .inner');
    if (inner) inner.scrollTop = 0;
  });
  const cb = $('collect-btn');
  if (cb) cb.onclick = () => doCollect(d.sysId);
  bindDockBtn(d);
  bindMigBtns(d);
  bindPortBtns(d);
  const ib = $('invest-btn');
  if (ib) ib.onclick = () => {
    if (!confirmGate('inv:' + d.key)) return;
    if (investColony(d.key)){
      showToast(`物资已注入 <b>${d.name}</b> —— 施工即刻完成`, {sfx:'confirm', say:'Construction complete.'});
      renderDevBlock(); refreshDock();
      if (typeof updateDistrictUniforms === 'function') updateDistrictUniforms();
    } else sfx('err');
  };
  const ab = $('inf-accel-btn');
  if (ab) ab.onclick = () => {
    if (!confirmGate('acc:' + d.key)) return;
    if (accelConstruction(d.key)){
      showToast(`影响力动员 —— <b>${d.name}</b> 当前工程即刻竣工`, {sfx:'confirm', say:'Mobilization complete.'});
      renderDevBlock(); refreshDock();
      if (typeof updateDistrictUniforms === 'function') updateDistrictUniforms();
    } else sfx('err');
  };
  const tb = $('terraform-btn');
  if (tb) tb.onclick = () => {
    if (!confirmGate('tf:' + d.key)) return;
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
    return questHintHtml(p) + `<div class="dock-badge">🚆 列车已停靠本星锚地${p.moonOf || planetsOf(p.sysId).some(x=>x.moonOf===p.id) ? '(卫星/母星泊位通用)' : ''}</div>`;
  return questHintHtml(p) + `<button id="dock-btn" class="act-btn dockable" style="margin-bottom:.7rem;padding:.55rem">🚆 停 靠 本 星 · ${localTravelTime(p.id)}s</button>`;
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
    const bd = save.boarding && save.boarding.key === p.key ? save.boarding : null;
    const prog = bd ? Math.min(1, (Date.now() - bd.at) / (bd.dur * 1000)) : 0;
    const boardBtn = bd
      ? `<button class="act-btn cyan boarding" disabled style="margin:0;padding:.5rem;--bdur:${bd.dur}s;--bdelay:-${((Date.now()-bd.at)/1000).toFixed(2)}s"><span>装载中 ${Math.max(0,(bd.at+bd.dur*1000-Date.now())/1000).toFixed(1)}s</span></button>`
      : `<button id="board-btn" class="act-btn cyan" style="margin:0;padding:.5rem" ${emigratable&&mi.pool>0&&space>0?'':'disabled'}>装载移民(${fmtNum(Math.min(mi.pool, space))})</button>`;
    btns = `<div style="display:flex;gap:.5rem;margin-top:.55rem">
      ${boardBtn}
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
    if (save.boarding){ sfx('err'); return; }
    const sec = startBoarding(p);
    if (sec){ showToast(`移民登车中 —— 预计 <b>${sec}s</b>`, {sfx:'blip', say:'Boarding in progress.'}); renderDevBlock(); }
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
    inner = `<button id="port-build" class="act-btn cyan${armCls('portb:'+key)}" ${canAfford(cost) ? '' : 'disabled'}>${armTxt('portb:'+key, `建 造 星 港(${costTxt} · 工期 ${fmtDuration(STARPORT_TIME)})`, `确认建造星港(${costTxt})`)}</button>
      <p class="hint">星港为轨道独立建筑,不占区划。第 ${starportCount() + 1} 座成本 +${(starportCount()) * 20}%。</p>`;
  } else if (portBuilding(key)){
    const st = portState(key);
    const remain = Math.max(0, (st.startAt + st.dur * 1000 - Date.now()) / 1000);
    const rush = infRushCost(remain);
    inner = `<div class="bld building">⚒ 星港建设中 ${(Math.min(1,(Date.now()-st.startAt)/(st.dur*1000))*100).toFixed(0)}% · 剩余 ${fmtDuration(remain)}${st.auto ? ' · 殖民地自筹' : ''}</div>
      <button id="port-rush" class="close-btn" style="margin-top:.4rem" ${(save.influence||0) >= rush ? '' : 'disabled'}>影响力注资,即刻完工(${fmtNum(rush)} 影响力)</button>`;
  } else {
    const capN = lineCapacityOf(p), used = linesAt(key).length;
    const dlv = dockLvOf(key), duc = dockUpCost(dlv + 1);
    inner = `<div class="buff-line">⬡ 星港运营中 · 贸易线 ${used}/${capN} · 船坞 LV${dlv}(单船 ${SHIP_CAP * dlv} × ${SHIPS_PER_LANE} 艘/航道)</div>
      <button data-dock="1" class="close-btn${armCls('dock:'+key)}" style="margin:.3rem 0" ${dlv < save.train.engineLv && canAfford(duc) ? '' : 'disabled'} title="船坞等级不可超过车头等级">${armTxt('dock:'+key, `船坞升级 → LV${dlv + 1}(${fmtNum(duc.metal)} 金属,全部航线生效)`, `确认升级船坞(${fmtNum(duc.metal)} 金属)`)}</button>`;
    // 既有线路
    (save.lines || []).forEach((l, i) => {
      if (l.a !== key && l.b !== key) return;
      const other = planetByKey(l.a === key ? l.b : l.a);
      const sendOpts = w => ['none','pax', ...Object.keys(RESOURCES)].map(o =>
        `<option value="${o}" ${w === o ? 'selected' : ''}>${o === 'none' ? '不运' : o === 'pax' ? '移民' : RESOURCES[o].name}</option>`).join('');
      inner += `<div class="opt"><div class="ol">⇄ ${other ? other.name : '?'} · 容量 ${fmtNum(lineCapPerTrip(l))}/趟(${SHIPS_PER_LANE} 艘货轮)· 周期 ${lineCycleSec(l)}s
          <span class="od">去程 <select data-lsend="${i}:a">${sendOpts(l.aSend)}</select> · 返程 <select data-lsend="${i}:b">${sendOpts(l.bSend)}</select></span></div>
        <button data-ltoggle="${i}">${l.on ? '停运' : '开始运输'}</button></div>`;
    });
    // 新建线
    const targets = lineTargets(p);
    if (used < capN && targets.length){
      inner += `<div class="opt"><div class="ol">开通新贸易线(${fmtNum(LINE_COST.metal)}金属 + ${fmtNum(LINE_COST.chem)}化合物)
        <span class="od">对象需同星系且已建星港</span></div>
        <select id="line-target">${targets.map(t => `<option value="${t.key}">${t.name}</option>`).join('')}</select>
        <button id="line-build" class="${armCls('lineb:'+key).trim()}" ${canAfford(LINE_COST) ? '' : 'disabled'}>${armTxt('lineb:'+key, '开线', '确认开线')}</button></div>`;
    } else if (used < capN){
      inner += `<div class="bld locked">○ 暂无可连接对象(同星系其他行星需先建星港)</div>`;
    }
  }
  // 星港仓库:随时可见仓内物资
  if (portDone(key)){
    const wst = pstoreOf(key);
    const rows = Object.keys(RESOURCES).filter(k => (wst[k] || 0) > 0.5)
      .map(k => `<span class="dchip" style="--dc:${RESOURCES[k].color}" title="${RESOURCES[k].name}">${RES_ICONS[k]}<b>${fmtNum(Math.floor(wst[k]))}</b></span>`).join('');
    inner += `<div class="eco-box" style="margin-top:.5rem"><div class="eco-k">星港仓库 · ${p.role === 'res' ? '产出待转运(星门货船定期收取)' : '殖民地补给储备'}</div>
      <div class="dchip-row" style="margin-top:.35rem">${rows || '<span class="bld locked" style="border:none;padding:0">仓内无物资</span>'}</div></div>`;
  }
  // 母港设置
  const isHome = save.homePort === key;
  inner += isHome
    ? `<div class="buff-line" style="color:var(--purple)">⚓ 母港 —— 本星影响力产出 ×1.25;货舱可在此入库金库</div>`
    : (p.role === 'hab' && portDone(key) ? `<button id="set-home" class="close-btn" style="margin-top:.4rem">设为母港(影响力基地)</button>` : '');
  // ── 星门(一系一门,设于首星星港旁) ──
  const fp = sysFirstPort(p.sysId);
  if (fp === key){
    const g = gateOf(p.sysId);
    const isHub = p.sysId === homeSysId();
    if (!save.gateUnlocked){
      inner += `<div class="bld locked" style="margin-top:.35rem">⌬ 星门技术未解锁 —— 跟进《地疤》残响(第六弧)</div>`;
    } else if (!g){
      const gateCostTxt = Object.entries(GATE_COST).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
      inner += `<div class="opt"><div class="ol">⌬ 建造星门(作用圈物流网)<span class="od">货船在作用圈(${GATE_RANGE} 银河单位)内收集资源星产出,并可向圈内另一座星门接力输送;${gateCostTxt} · 工期 ${fmtDuration(GATE_TIME)}</span></div>
        <button data-gate-build="1" class="${armCls('gateb:'+p.sysId).trim()}" ${canAfford(GATE_COST) ? '' : 'disabled'}>${armTxt('gateb:'+p.sysId, '奠基', '确认奠基')}</button></div>`;
    } else if (!gateDone(p.sysId)){
      inner += artBanner('img/stargate.jpg', 'STARGATE · UNDER CONSTRUCTION', 88)
        + `<div class="bld building">⌬ 星门建设中 · 剩余 ${fmtDuration(Math.max(0, (g.at + g.dur * 1000 - Date.now()) / 1000))}</div>`;
    } else {
      const hop = gateNextHop(p.sysId);
      const inRange = gateSystemsInRange(p.sysId);
      const ownGates = inRange.filter(sid => save.gates[sid] && gateDone(sid));
      const coveredN = gateCollectScope(p.sysId).length;
      const collectOn = g.collect !== 0;
      const deliverOn = !!g.deliver;
      const curTarget = g.target && save.gates[g.target] && gateDone(g.target) && sysDist(p.sysId, g.target) <= GATE_RANGE ? g.target : '';
      const targetOpts = `<option value="">自动(朝母港${hop ? ':' + sysById(hop).name : isHub ? '' : ' — 圈内无节点'})</option>`
        + ownGates.map(sid => `<option value="${sid}" ${curTarget === sid ? 'selected' : ''}>${sysById(sid).name}(${sysDist(p.sysId, sid).toFixed(1)} 单位)</option>`).join('');
      const gateCtl = `<div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.35rem;align-items:center">
        <button data-gate-collect="1" class="close-btn" style="${collectOn ? 'color:var(--green);border-color:rgba(62,207,142,.5)' : ''}">收集圈内物资:${collectOn ? '开' : '关'}(覆盖 ${coveredN} 系)</button>
        ${isHub ? '' : `<button data-gate-deliver="1" class="close-btn" style="${deliverOn ? 'color:var(--green);border-color:rgba(62,207,142,.5)' : ''}">本地分发:${deliverOn ? '开' : '关'}</button>
        <span class="eco-sub" style="margin:0">输送至 <select data-gate-target>${targetOpts}</select></span>`}
      </div>`;
      const ups = [['line', `货船等级`, `批量 ${gateBatch(g)}/班`], ['speed', '班次速度', `周期 ${gateCycleSec(g)}s`], ['store', '枢纽仓储', `容量 ${fmtNum(gateHubCap(g))}/资源`]]
        .map(([b, name, eff]) => {
          const lv = g[b + 'Lv'] || 1;
          if (lv >= GATE_MAXLV) return `<button disabled>${name} MAX</button>`;
          const c = gateUpCost(b, lv + 1);
          const ak = 'gup:' + p.sysId + ':' + b;
          return `<button data-gate-up="${b}" class="${armCls(ak).trim()}" ${canAfford(c) ? '' : 'disabled'} title="${Object.entries(c).map(([k,v]) => RESOURCES[k].name + ' ' + fmtNum(v)).join(' + ')}">${armTxt(ak, `${name} LV${lv}→${lv + 1}`, '确认升级')}</button>`;
        }).join('');
      const eff = `货船 LV${g.lineLv || 1}(${gateBatch(g)}/班)· 班次 ${gateCycleSec(g)}s · 作用圈 ${GATE_RANGE} 单位` + (isHub ? ` · 枢纽容量 ${fmtNum(gateHubCap(g))}/资源` : (curTarget || hop ? '' : ' · <b style="color:var(--red)">圈内无接力节点 —— 物资滞留本门</b>'));
      const storeTxt = isHub
        ? Object.entries(g.store || {}).filter(([, v]) => v > 0.5).map(([k, v]) => `<span class="dchip" style="--dc:${RESOURCES[k].color}" title="${RESOURCES[k].name} ${fmtNum(Math.floor(v))} / ${fmtNum(gateHubCap(g))}">${RES_ICONS[k]}<b>${fmtNum(Math.floor(v))}</b></span>`).join('') || '<span class="bld locked" style="border:none;padding:0">暂无库存</span>'
        : '';
      inner += artBanner('img/stargate.jpg', `STARGATE · ${sysById(p.sysId).name}`, 88)
        + `<div class="buff-line" style="color:var(--purple)">⌬ 星门运转中 —— ${eff}</div>
        ${isHub ? `<div class="eco-sub" style="margin:.3rem 0">枢纽库存:${storeTxt}<br>列车停靠本星系任一星港锚地时,所有升级/建造可直接调用枢纽库存</div>` : `<div class="eco-sub" style="margin:.3rem 0">门仓:${Object.entries(g.store || {}).filter(([,v]) => v > 0.5).map(([k,v]) => `<span style="color:${RESOURCES[k].color}">${RESOURCES[k].name} ${fmtNum(Math.floor(v))}</span>`).join(' · ') || '空'}<br>收集圈内资源星产出(稀有优先)→ 接力输送至目标星门;开启本地分发则优先补给本系殖民地</div>`}
        ${gateCtl}
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.3rem">${ups}</div>`;
    }
  } else if (portDone(key)){
    inner += `<div class="bld locked" style="margin-top:.35rem">⌬ 星门统一设于本系首星星港</div>`;
  }
  const banner = portDone(key) ? artBanner('img/starport.jpg', `STARPORT · ${p.name}`, 96) : '';
  return `<div class="divider"></div><div class="sec-label" style="--c:var(--cyan)">星港 · 自动航运 · 星门</div>${banner}${inner}`;
}
/* ── 收支表:本地仓 存量/产出/消耗/覆盖时间,缺口红字(群星式) ── */
function storeHtml(p){
  if (!save.est[p.key]) return '';
  const st = pstoreOf(p.key);
  const need = consumptionOf(p);
  const sh = shortOf(p);
  const prodKey = p.role === 'res' ? p.res.key : null;
  const NEED_NAMES = { chem:'消费品', ice:'生命支持', he3:'区划能源' };
  const rows = [];
  const keys = Object.keys(RESOURCES).filter(k =>
    (st[k] || 0) > 0.5 || (need[k] || 0) > 0 || k === prodKey);
  for (const k of keys){
    const have = Math.floor(st[k] || 0);
    const inRate = k === prodKey ? resRateOf(p) : 0;
    const outRate = need[k] || 0;
    const net = inRate - outRate;
    let status = '';
    if (outRate > 0){
      if (sh[k]) status = `<b style="color:var(--red)">断供!${NEED_NAMES[k] || ''}停摆</b>`;
      else if (net < 0) status = `覆盖 <b style="color:${have / outRate < 20 ? 'var(--amber)' : 'var(--green)'}">${fmtDuration(have / outRate * 60)}</b>`;
    } else if (inRate > 0 && have >= storeCapOf(p) - 1){
      status = `<b style="color:var(--amber)">仓满 —— 产出溢出中,尽快收取</b>`;
    }
    rows.push(`<div class="opt" style="padding:.28rem 0"><div class="ol">
      <span class="dchip" style="--dc:${RESOURCES[k].color}">${RES_ICONS[k]}<b>${fmtNum(have)}</b></span>
      <span class="od">${inRate > 0 ? `<b style="color:var(--green)">+${fmtNum(inRate)}/分</b>` : ''}
      ${outRate > 0 ? ` <b style="color:${sh[k] ? 'var(--red)' : 'var(--text)'}">−${outRate.toFixed(1)}/分</b>(${NEED_NAMES[k]})` : ''}
      ${status ? ' · ' + status : ''}</span></div></div>`);
  }
  // 列车补给/收取操作
  const docked = dockedAtPlanet(p) && !save.pendingRaid;
  const h = holdOf();
  const holdSupply = ['chem','ice','he3'].reduce((s,k) => s + Math.floor(h[k] || 0), 0);
  const dk = demandOf(p);
  const btns = [];
  if (docked && holdSupply > 0)
    btns.push(`<button id="store-unload" class="close-btn">卸货补给本星(货舱消耗品 ${fmtNum(holdSupply)})</button>`);
  if (dk && (availOf(dk) >= 500))
    btns.push(`<button id="store-supply" class="close-btn" title="从金库远程调拨,无需列车">金库调拨 500 ${RESOURCES[dk].name}</button>`);
  const capTxt = p.role === 'res' ? ` · 仓储上限 ${fmtNum(storeCapOf(p))}(商贸区可扩容)` : '';
  return `<div class="eco-box">
    <div class="eco-k">本地仓 · 收支${capTxt}</div>
    <div style="margin-top:.3rem">${rows.join('') || '<div class="eco-sub">无存量,无消耗</div>'}</div>
    ${p.role === 'hab' ? `<div class="eco-sub" style="margin-top:.25rem">人口消耗消费品${p.habit < CONSUME_ICE_HABIT ? '与生命支持' : ''};工/研/军区划消耗能源(首座自供)。断供将拖停增长、产出减半 —— 用列车、贸易线或星门补货</div>` : ''}
    ${btns.length ? `<div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap">${btns.join('')}</div>` : ''}
  </div>`;
}
function bindPortBtns(p){
  const pb = $('port-build');
  if (pb) pb.onclick = () => {
    if (!confirmGate('portb:' + p.key)) return;
    if (buildStarport(p)){ showToast(`<b>${p.name}</b> 星港开工`, {sfx:'confirm', say:'Starport under construction.'}); renderDevBlock(); } else sfx('err');
  };
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
    if (!confirmGate('lineb:' + p.key)) return;
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
  const dk = document.querySelector('[data-dock]');
  if (dk) dk.onclick = () => {
    if (!confirmGate('dock:' + p.key)) return;
    if (upgradeDock(p.key)){ showToast(`<b>${p.name}</b> 船坞升级 → LV${dockLvOf(p.key)} · 全部航线容量提升`, {sfx:'levelup', say:'Dock upgraded.'}); renderDevBlock(); }
    else sfx('err');
  };
  const gb = document.querySelector('[data-gate-build]');
  if (gb) gb.onclick = () => {
    if (!confirmGate('gateb:' + p.sysId)) return;
    if (buildGate(p.sysId)){ showToast(`<b>${sysById(p.sysId).name}</b> 星门奠基 —— 跨星系物流即将贯通`, {sfx:'unlock', say:'Stargate under construction.'}); renderDevBlock(); }
    else sfx('err');
  };
  document.querySelectorAll('[data-gate-collect]').forEach(b => b.onclick = () => {
    const g = gateOf(p.sysId); if (!g) return;
    g.collect = g.collect === 0 ? 1 : 0; persistSave(); sfx('blip'); renderDevBlock();
  });
  document.querySelectorAll('[data-gate-deliver]').forEach(b => b.onclick = () => {
    const g = gateOf(p.sysId); if (!g) return;
    g.deliver = g.deliver ? 0 : 1; persistSave(); sfx('blip'); renderDevBlock();
  });
  document.querySelectorAll('[data-gate-target]').forEach(sel => sel.onchange = () => {
    const g = gateOf(p.sysId); if (!g) return;
    g.target = sel.value || null; persistSave(); sfx('confirm'); renderDevBlock();
  });
  document.querySelectorAll('[data-gate-up]').forEach(b => b.onclick = () => {
    if (!confirmGate('gup:' + p.sysId + ':' + b.dataset.gateUp)) return;
    if (upgradeGate(p.sysId, b.dataset.gateUp)){ showToast('星门升级完成', {sfx:'levelup', say:'Stargate upgraded.'}); renderDevBlock(); }
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
  const su = $('store-unload');
  if (su) su.onclick = () => {
    const moved = unloadSupply(p.key);
    if (moved){ showToast(`<b>${p.name}</b> 补给卸货完成`, {sfx:'confirm', say:'Supplies delivered.'}); renderDevBlock(); refreshDock(); }
    else sfx('err');
  };
  // 玩家开辟区划 / 建造建筑(二段确认)
  document.querySelectorAll('[data-newdist]').forEach(b => b.onclick = () => {
    const t = b.dataset.newdist;
    if (!confirmGate('nd:' + p.key + ':' + t)) return;
    if (startDistrict(p.key, t)){
      showToast(`<b>${p.name}</b> 开辟「${DISTRICT_TYPES[t].name}」`, {sfx:'confirm', say:'District under construction.'});
      renderDevBlock(); if (typeof updateDistrictUniforms === 'function') updateDistrictUniforms();
    } else sfx('err');
  });
  document.querySelectorAll('[data-newbuild]').forEach(b => b.onclick = () => {
    const [di, id] = b.dataset.newbuild.split(':');
    if (!confirmGate('nb:' + p.key + ':' + id)) return;
    if (startBuilding(p.key, +di, id)){
      showToast(`<b>${p.name}</b> 开工「${BUILDINGS[id].name}」`, {sfx:'confirm', say:'Construction started.'});
      renderDevBlock();
    } else sfx('err');
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

  // 卫星港:随母星发展自动建立,作为额外区划并再分配产出
  const _ms = moonsOf(p);
  if (_ms.length){
    const _act = activeMoonPorts(p);
    const _mult = moonPortMult(p);
    const _chips = _ms.map(m => {
      const on = devLevel(p) >= m.unlockLv;
      return `<span class="dchip" title="${MOON_SIZES[m.size].name} · ${on ? '卫星港已建立' : 'LV' + m.unlockLv + ' 时自动建港'} · +${m.slots} 区划" style="--dc:${on ? 'var(--cyan)' : 'var(--text-muted)'};${on ? '' : 'opacity:.55'}">${on ? '🛰' : '🌑'} ${m.name.split('-').pop()}<b>+${m.slots}</b></span>`;
    }).join('');
    rows.push(`<div class="buff-line" style="margin:0 0 .55rem">卫星港 <b style="color:var(--cyan)">${_act.length}/${_ms.length}</b> · 额外区划 +${moonPortSlots(p)}${p.role === 'res' ? ` · 产出合计 <b style="color:var(--cyan)">×${_mult.toFixed(2)}</b>` : ''}${_ms.length > 2 ? '(全港后母星 -10%)' : ''}<div class="dchip-row" style="margin-top:.3rem">${_chips}</div></div>`);
  }
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
    <div class="bar-meta" style="margin-top:.35rem"><span>区划 ${st.districts.length} / ${slots}</span><span>本星上限 ${maxSlotsOf(p)}${moonPortSlots(p) ? ' <b style="color:var(--cyan)">+' + moonPortSlots(p) + '🛰</b>' : ''}</span></div>`);

  // 当前施工(全星球同时一项:区划或建筑);横幅:施工中显示该区划,否则显示主导区划
  const act = activeConstruction(st);
  const domType = act ? act.type
    : Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t)[0];
  if (domType && DISTRICT_TYPES[domType]){
    const envKey = domType + '_' + p.shader;
    const distImg = DIST_ENV_ART.has(envKey) ? `img/dist_${envKey}.jpg` : `img/dist_${domType}.jpg`;
    rows.push(artBanner(distImg,
      act ? `${DISTRICT_TYPES[domType].name} · UNDER CONSTRUCTION` : `${DISTRICT_TYPES[domType].name} ×${counts[domType]} · DISTRICT`, 96));
  }
  if (act){
    const dt = DISTRICT_TYPES[act.type];
    rows.push(`<div class="bld building" style="margin-top:.45rem"><span class="dchip-ico" style="color:${dt.color}">${DIST_ICONS[act.type]}</span> ⚒ ${act.label} · ${(dProg(act.obj)*100).toFixed(0)}% · 剩余 ${fmtDuration(dRemain(act.obj))}${docked ? ' · 🚆商贸加速×2' : ''}</div>`);
  }

  // ── 开辟新区划(玩家规划) ──
  if (!act && st.districts.length < slots){
    const hcap = habCapacityInfo();
    const dtime = districtTime(p);
    const distBtns = Object.keys(DISTRICT_TYPES).map(t => {
      const chk = canStartDistrict(p, t);
      const cost = districtCost(p, t);
      const costTxt = Object.entries(cost).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
      const dt = DISTRICT_TYPES[t];
      const ak = 'nd:' + p.key + ':' + t;
      return `<button data-newdist="${t}" class="close-btn${armCls(ak)}" ${chk.ok ? '' : 'disabled'}
        style="display:inline-flex;align-items:center;gap:.3rem;${chk.ok ? `color:${dt.color};border-color:${dt.color}55` : ''}"
        title="${dt.desc} · ${costTxt} · 工期 ${fmtDuration(dtime)}${chk.ok ? '' : ' —— ' + chk.why}">
        <span class="dchip-ico" style="color:${dt.color}">${DIST_ICONS[t]}</span>${armedNow(ak) ? `确认开辟 ${dt.name}(${costTxt})` : dt.name}</button>`;
    }).join('');
    rows.push(`<div class="eco-box" style="margin-top:.45rem">
      <div class="eco-k">开辟区划 · 第 ${st.districts.length + 1} 座(${fmtNum(districtCost(p,'trade').metal)} 金属起 · 工期 ${fmtDuration(dtime)})</div>
      <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.4rem">${distBtns}</div>
      <div class="eco-sub" style="margin-top:.3rem">居住承载:全银河非居住区划 ${hcap.other} / ${hcap.limit}(民生区 ×2 + 4)${hcap.other >= hcap.limit ? ' —— <b style="color:var(--amber)">触顶,先开民生区</b>' : ''}</div>
    </div>`);
  }

  // ── 建筑清单:已建成 + 每类区划的可建选项(玩家点建) ──
  const builtList = [];
  for (const dd of st.districts){
    if (!dDone(dd)) continue;
    for (const b of dd.builds) if (dDone(b)) builtList.push(BUILDINGS[b.id]);
  }
  if (builtList.length)
    rows.push(`<div class="bld done" style="margin-top:.4rem">${builtList.map(b => `✓ ${b.name}`).join(' · ')}</div>`);
  if (!act){
    const seenType = {};
    const buildBtns = [];
    st.districts.forEach((dd, di) => {
      if (!dDone(dd) || dd.builds.length >= BUILDS_PER_DISTRICT || seenType[dd.type]) return;
      seenType[dd.type] = 1;
      for (const c of buildingChoicesFor(p, st, dd)){
        const chk = canStartBuilding(p, dd, c.id);
        const costTxt = Object.entries(c.def.cost || {}).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
        const dt = DISTRICT_TYPES[dd.type];
        const ak = 'nb:' + p.key + ':' + c.id;
        buildBtns.push(`<button data-newbuild="${di}:${c.id}" class="close-btn${armCls(ak)}" ${chk.ok ? '' : 'disabled'}
          title="${c.def.desc} · ${costTxt} · 工期 ${fmtDuration(c.def.time)}${chk.ok ? '' : ' —— ' + chk.why}"
          style="${chk.ok ? `color:${dt.color};border-color:${dt.color}55` : ''}">${armedNow(ak) ? `确认建造 ${c.def.name}(${costTxt})` : c.def.name + (chk.ok ? '' : ' 🔒')}</button>`);
      }
    });
    if (buildBtns.length)
      rows.push(`<div class="eco-box" style="margin-top:.45rem">
        <div class="eco-k">可建建筑(建于对应区划,悬停查看效果/成本)</div>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.4rem">${buildBtns.join('')}</div>
      </div>`);
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
      ? `<button id="invest-btn" class="act-btn cyan${armCls('inv:'+p.key)}" style="margin-top:.6rem" ${canAfford(cost)?'':'disabled'}>${armTxt('inv:'+p.key, `注 资 完 工 · ${act.label}(${costTxt})`, `确认注资完工(${costTxt})`)}</button>`
      : `<div class="buff-line" style="margin-top:.5rem">列车驻留本星系可商贸加速 ×2,或注资(${costTxt})立即完工</div>`;
    const infCost = infRushCost(dRemain(act.obj));
    investHtml += `<button id="inf-accel-btn" class="act-btn${armCls('acc:'+p.key)}" style="margin-top:.5rem;border-color:rgba(139,92,246,.4);background:rgba(139,92,246,.08);color:var(--purple)" ${(save.influence||0) >= infCost ? '' : 'disabled'}>${armTxt('acc:'+p.key, `影响力动员 · 即刻竣工(${infCost} 影响力,可远程)`, `确认动员(−${infCost} 影响力)`)}</button>`;
  }
  // 类地化改造(仅火星类岩石行星 · LV5 · 文明指数门槛 · 巨量资源)
  let tfHtml = '';
  if (planetBand(p) === 'std' && p.shader === 'rocky' && !p.moonOf){
    const ok = canTerraform(p);
    const after = Math.max(12, Math.min(50, Math.round(28 * Math.pow(p.radius, 1.35))));
    const costTxt = Object.entries(TERRAFORM_COST).map(([k,v]) => `${RESOURCES[k].name} ${fmtNum(v)}`).join(' + ');
    tfHtml = `<button id="terraform-btn" class="act-btn amber${armCls('tf:'+p.key)}" style="margin-top:.55rem" ${ok && canAfford(TERRAFORM_COST) ? '' : 'disabled'}>${armTxt('tf:'+p.key, `类 地 化 改 造 → ${after} 区划`, `确认改造(${costTxt})`)}</button>
      <p class="hint">仅火星类岩石行星可改造(卫星/温室星不可)· 需本星达到「${lvName(p, TERRAFORM_REQ.lv)}」+ 文明指数 ≥ ${TERRAFORM_REQ.civ} · 耗资:${costTxt}</p>`;
  }
  return rows.join('') + investHtml + tfHtml;
}

function doCollect(sysId){
  const got = collectSystem(sysId);
  if (!got) return;
  const summary = Object.entries(got).map(([k,v]) => `<b>${RESOURCES[k].name}</b> ${fmtNum(v)}`).join(' · ');
  showToast(`货舱装载完成:${summary} —— 运到需要它的地方去`, {sfx:'confirm', say:'Cargo loaded.'});
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
        <span>${lv>0 ? lvName(p, lv) : (p.role==='hab'?'宜居':RESOURCES[p.res.key].name)}</span></div>`;
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
      ${sys.special ? `<span class="role-tag" style="color:#b78bff;border-color:rgba(183,139,255,.5)">◆ 特殊星系 · ${sys.special}</span>` : ''}
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
      <div class="lv" style="${lv>0 ? `color:${d.role==='hab'?'var(--green)':'var(--amber)'}` : (locked ? '' : 'color:var(--cyan)')}">${lv>0 ? lvName(d, lv) : (locked ? '🔒 未解锁' : '可建立')}</div>`;
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
  const tr = save.train;
  // 残骸场:回收物资(每趟受货舱限)
  if (pirateWreckOf(sysId)){
    if (tr.status !== 'docked' || tr.sys !== sysId || localTransit()){ showToast('列车需停靠本星系才能回收残骸', { sfx:'err' }); return; }
    if (!salvageWreck(sysId)) sfx('err');
    return;
  }
  if (!pirateAlive(sysId)){ sfx('err'); return; }
  if (tr.status !== 'docked' || tr.sys !== sysId || localTransit()){
    showToast('列车需停靠本星系,才能突入小行星带清剿海盗', { sfx:'err' });
    return;
  }
  if (save.pirateRun && save.pirateRun[sysId]){ showToast('突击航线进行中 —— 接近基地时自动接敌', { sfx:'blip' }); return; }
  startPirateRun(sysId);   // 飞向基地:途中可能遭拦截,抵达后开战
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
/* ── 新手航路:目标链 —— 开局唯一的"现在该干嘛"(顺序推进,完成即隐藏) ── */
const OBJECTIVES = [
  { t:'接收深空讯号', d:'点左下角「深空讯号 · 接收」,读完第一章 —— 故事会告诉你这列火车为什么在这里',
    done: () => save.story && save.story.idx >= 1 },
  { t:'规划第一座区划', d:'点击行星「沧澜」→ 面板「区划」页 →「开辟区划」。四类区划四种产出:民生=人口承载 · 工业=产率 · 科研=科研值(供列车研发)· 商贸=影响力与仓储。人口是一切产出的乘数',
    done: () => { const st = save.colony && save.colony['kenxi/canglan']; return !!(st && st.districts.length >= 4); } },
  { t:'装载 1000 名移民', d:'沧澜面板「迁移」页 →「装载移民」。人口就是劳动力 —— 运到哪,哪里就成长',
    done: () => save.train.pax >= ESTABLISH_COLONISTS || !!save.est['kenxi/jinyan'] },
  { t:'泊入烬岩,建立前哨', d:'底部行星列表点「烬岩」→「泊入轨道」→「建立前哨」。资源星负责挖,居住星负责长 —— 你的列车就是它们之间的血管',
    done: () => !!save.est['kenxi/jinyan'] },
  { t:'收取矿石入货舱', d:'烬岩投产后(一两分钟),在其面板点「装载本星系资源」。矿石=金库的钱:区划、车厢、引擎全靠它;出口量还会直接推动矿星升级',
    done: () => ((save.exported || {})['kenxi/jinyan'] || 0) > 0 },
  { t:'返航沧澜,货舱入库', d:'泊回沧澜(母港)→ 列车面板(快捷键 T)→「货舱入库金库」—— 入了库的才是能花的钱',
    done: () => !!(save.flags && save.flags.banked) },
  { t:'殖民汐月(沧澜卫星)', d:'汐月与沧澜共用锚地,不用挪车:再「装载移民」攒够 1000 人,底部行星列表选汐月 →「建立前哨」。卫星是军事要冲 —— 首个军工区只能建在卫星上,建成后停靠锚地即可补满弹药',
    done: () => !!save.est['kenxi/ximoon'] },
  { t:'殖民纱幕(化合物产地)', d:'沧澜的人口吃「消费品」,原料就是纱幕的大气化合物。读完主线第 2 章解锁;带 1000 移民泊入纱幕 →「建立前哨」—— 以后仓储页亮红点,就是该找它补货了',
    done: () => !!save.est['kenxi/shamu'] },
  { t:'升级引擎至 LV2', d:'列车面板 → 点选动力车头 →「升级」(500 金属,点两次确认)。不够就再去烬岩拉一趟 —— 引擎等级解锁更远的星系',
    done: () => save.train.engineLv >= 2 || !!(save.upgrade && save.upgrade.kind === 'engine') },
  { t:'远航烛龙星系', d:'右上银河总图(快捷键 G)→ 点「烛龙」→「启程」—— 最近的金属富矿星系;小心,域外有袭击者',
    done: () => !!save.visited.zhulong },
  { t:'在烛龙播撒火种', d:'无人星系的第一块殖民地需要「休眠舱」—— 主线第 4 章会赠送一节。挂上它去烛龙的行星「播撒火种」。多殖民地 = 多条产线,银河才转得起来',
    done: () => Object.keys(save.est).some(k => !k.startsWith('kenxi/')) },
  { t:'开通第一条贸易线', d:'殖民地到「采掘站/拓荒镇」级会自动开建星港;两端星港建成后,在行星面板「星港」页开通贸易线并点「开始运输」(推荐 纱幕⇄沧澜:消费品从此自动补给)—— 货轮替你跑腿,列车去挣更远的钱',
    done: () => (save.lines || []).some(l => l.on) },
];
let _obSig = '';
function objectivesTick(){
  const box = $('objectives');
  if (!box) return;
  if (save.tutDone){ box.classList.add('hidden'); return; }
  if (typeof save.tutStep !== 'number') save.tutStep = 0;
  while (save.tutStep < OBJECTIVES.length && OBJECTIVES[save.tutStep].done()){
    const s = OBJECTIVES[save.tutStep];
    save.tutStep++;
    persistSave();
    if (save.tutStep < OBJECTIVES.length)
      showToast(`✅ 目标完成:<b>${s.t}</b> —— 下一步:${OBJECTIVES[save.tutStep].t}`, {sfx:'levelup', say:'Objective complete.'});
  }
  if (save.tutStep >= OBJECTIVES.length){
    save.tutDone = 1;
    addInfluence(30);
    persistSave();
    showToast('🎉 新手航路完成 —— 奖励 <b>30 影响力</b>。银河从这里开始是你的了,指挥官', {sfx:'unlock', say:'The galaxy is yours, Commander.'});
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const min = save.ui && save.ui.obMin;
  const cur = OBJECTIVES[save.tutStep];
  const body = min
    ? `<div class="ob-step cur"><span class="ob-dot"></span><span><span class="ob-t">${cur.t}</span></span></div>`
    : OBJECTIVES.map((s, i) => {
        const st = i < save.tutStep ? 'done' : i === save.tutStep ? 'cur' : '';
        return `<div class="ob-step ${st}"><span class="ob-dot"></span><span><span class="ob-t">${s.t}</span>${i === save.tutStep ? `<span class="ob-desc">${s.d}</span>` : ''}</span></div>`;
      }).join('');
  const html = `<div class="ob-head"><span>新手航路 ${save.tutStep} / ${OBJECTIVES.length}</span><button id="ob-min" title="${min ? '展开' : '折叠'}">${min ? '▸' : '▾'}</button></div>${body}`;
  if (_obSig !== html){
    _obSig = html;
    box.innerHTML = html;
    const mb = $('ob-min');
    if (mb) mb.onclick = (e) => {
      e.stopPropagation();
      save.ui.obMin = !save.ui.obMin;
      persistSave(); _obSig = ''; objectivesTick();
    };
  }
}

/* ── 指挥官简报:核心玩法一次性提示(条件首次满足时触发,绝不重复) ── */
function briefTick(){
  if (!save.hints) save.hints = {};
  const H = (key, cond, msg, say) => {
    if (save.hints[key] || !cond()) return;
    save.hints[key] = 1;
    showToast('📋 ' + msg, { sfx:'signal', say });
    persistSave();
  };
  const cg = planetByKey('kenxi/canglan');
  // 0. 建设:开局即点拨 —— 玩家亲手规划
  H('build', () => cg && (save.treasury.metal || 0) >= 150,
    '简报:殖民地由你亲手规划 —— 行星面板「区划」页选类型开工;民生区涨承载,工业区提产率,科研区出科研值',
    'Colonial planning authorized.');
  // 1. 收取:首次本星系有待收取资源且列车停靠
  H('collect', () => save.train.status === 'docked' && planetsOf(save.train.sys).some(p => p.role === 'res' && resAvail(p) > 20),
    '简报:资源星产出滞留本地仓 —— 行星面板点「装载」进货舱,运到星港「入库金库」;出口量会直接推动资源星升级',
    'Resources ready for collection.');
  // 2. 移民循环:首次迁移池可装载
  H('migrate', () => cg && save.train.status === 'docked' && save.train.sys === 'kenxi' && migInfo(cg).pool >= 500,
    '简报:沧澜迁移池已有志愿者 —— 「装载移民」上车,飞抵新行星后「落户」即可建立前哨,这是殖民循环的核心',
    'Colonists awaiting boarding.');
  // 2.5 影响力:首次攒到 10 点
  H('influence', () => (save.influence || 0) >= 10,
    '简报:顶栏紫色数字是「影响力」—— 政治动员力。用途:远程加速任何建设/科技/升级工期、征集移民、注资星港;来自民生/商贸区划、物流运转与战斗胜利',
    'Influence accumulating.');
  // 3. 补给线:首次出现消耗覆盖不足 30 分钟
  H('supply', () => allPlanets().some(p => {
    if (!save.est[p.key]) return false;
    const need = consumptionOf(p), st = pstoreOf(p.key);
    return ['chem','ice','he3'].some(k => need[k] > 0 && (st[k] || 0) / need[k] < 30);
  }),
    '简报:有殖民地的补给撑不过 30 分钟了 —— 断供会拖停人口增长。用列车运一舱化合物过去「卸货补给」,或开通贸易线自动化',
    'Supply lines running thin.');
  // 4. 车厢科技:科研值首次够 LV2 研发
  H('cartech', () => (save.research || 0) >= 250,
    '简报:科研值可用于车厢改装方案 —— 列车面板选中车厢点「研发」,完成后全列同型车厢自动升级;也别忘了列车研发的五大科技',
    'Refit research available.');
  // 5. 车厢库:引擎 LV2 首次(解锁科研车厢建造)
  H('depot', () => save.train.engineLv >= 2,
    '简报:停靠有工业区划的类地行星可「建造车厢」入库(可选建造等级)并替换编组 —— 新车型随引擎等级逐步解锁',
    'Car workshop available.');
  // 6.5 贸易网第二节点:首港建成但同系无资源星港 → 指路建前哨
  H('resport', () => {
    const done = Object.keys(save.starport || {}).filter(k => portDone(k));
    if (!done.length) return false;
    const sysId = done[0].split('/')[0];
    return !planetsOf(sysId).some(pl => pl.role === 'res' && save.est[pl.key]);
  },
    '简报:星港要成网才能运输 —— 列车停靠同星系的资源星建立「前哨」,它发展到殖民地级会自动建港,贸易线与自动补给随即贯通',
    'Establish a resource outpost to link the trade network.');
  // 6. 弹药:首次不满
  H('ammo', () => save.train.ammo < ammoMax(),
    '简报:弹药不满(列车面板有闪烁灯)—— 停靠建有军事区划的锚地会自动补满;武器越强耗弹越多',
    'Ammunition running low.');
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
  if (OFFICER_SCAR[save.scar.idx]) unlockOfficer(OFFICER_SCAR[save.scar.idx], '地疤残响');
  // 地疤中期(第六弧·直线委员会读完):星门技术解锁,垦曦母港门自动开建
  if (save.scar.idx >= 60 && !save.gateUnlocked){
    unlockGates();
    setTimeout(() => showToast('⌬ <b>星门技术解锁</b> —— 委员会的遗产:垦曦星门已自动开工,作用圈覆盖周边星系;远域物流需自建接力节点', { sfx:'unlock', say:'Stargate network initialized.' }), 1500);
  }
  persistSave();
}
/* ── 拦截警报浮标:pendingRaid 预警窗口内显示倒计时,点击立即接敌 ── */
function raidAlertTick(){
  const el = $('raid-alert');
  if (!el) return;
  const pr = save.pendingRaid;
  const active = pr && pr.openAt && Date.now() < pr.openAt && !battleOpen();
  el.classList.toggle('show', !!active);
  if (active){
    const left = Math.ceil((pr.openAt - Date.now()) / 1000);
    el.innerHTML = `⚠ 陨星拦截 · <b>${left}s</b> 后自动接敌 —— 点击立即出击`;
  }
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
    ? `<div class="art-banner" style="background-image:url('img/port_story.jpg');height:128px;margin:.2rem 0 .8rem"><span class="art-cap">CANGLAN ORBITAL STARPORT</span></div>`
    : track === 'side'
    ? `<div class="art-banner" style="background-image:url('img/solaris_story.jpg');height:128px;margin:.2rem 0 .8rem"><span class="art-cap">BENEATH THE ICE · LINYUAN</span></div>`
    : track === 'scar'
    ? `<div class="art-banner" style="background-image:url('img/scar_story.jpg');height:118px;margin:.2rem 0 .8rem"><span class="art-cap">THE SCAR · ORBITAL SURVEY</span></div>`
    : track === 'main'
    ? `<div class="art-banner" style="background-image:url('img/dawnship.jpg');height:118px;margin:.2rem 0 .8rem"><span class="art-cap">THE SEED SHIP · 400-YEAR VOYAGE</span></div>` : '';
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
  // 剧情卡语音:仅锚点/终章播特制英文广播腔(全游戏统一音色),其余静默
  const special = (QUEST_CARD_SAY[track] || {})[state.idx];
  if (special) speak(special);
  tickBlueprintLayer();
}
/* 锚点章 / 终章特制语音 */
const QUEST_CARD_SAY = {
  main: { 0:'Awakening sequence complete.', 2:'First signal received.', 6:'A voice beneath the ice.',
          10:'The truth of the exodus.', 14:'A lullaby from Earth.', 18:'The voyager passes.',
          21:'The last song of Earth.', 25:'A new song begins.' },
  side: { 0:'The ocean is mimicking us.', 8:'The symmetrical sea.' },
  port: { 0:'The iron dock.', 2:'Trade arteries open.' },
  scar: { 59:'The committee disbands.', 119:'The scar remains. So do we.' },
};
function resolveStory(ch, ci, track){
  const choice = ch.choices[ci];
  if (track === 'main'){
    applyStoryChoice(ch, ci);
    // 事件推进 → 新手小行星战:碎石群切入沧澜轨道
    // 船官:主线里程碑入列
    if (track === 'main' && OFFICER_STORY[save.story.idx]) unlockOfficer(OFFICER_STORY[save.story.idx], '主线剧情');
    if (track === 'side' && save.side && save.side.idx >= SIDE_STORY.length) unlockOfficer(OFFICER_SIDE_DONE, '《索拉里斯之海》终章');
    if (track === 'port' && save.portStory && save.portStory.idx >= PORT_STORY.length) unlockOfficer(OFFICER_PORT_DONE, '《钢铁码头》完结');
    const tut = TUT_RAIDS[save.story.idx];
    if (tut && !save.tutRaids[save.story.idx]){
      save.tutRaids[save.story.idx] = 1;
      save.pendingRaid = { sysId:'kenxi', at: Date.now(), tutorial: tut.stage, openAt: Date.now() + 20000 };
      persistSave();
      // 20 秒预警窗口:警报浮标可点击立即接敌,倒计时耗尽自动进入
      setTimeout(() => showToast('⚠ 深空雷达回波:脱轨陨星切入沧澜轨道 —— 点击屏幕下方警报浮标立即拦截,或 20 秒后自动接敌', { sfx:'err', say:'Debris field inbound.' }), 1200);
      setTimeout(() => { if (save.pendingRaid && save.pendingRaid.tutorial) showToast('武器系统预热完毕 —— 拦截后残骸归我们(金属·化合物·科研值)', { sfx:'blip', say:'Weapons hot. Standing by.' }); }, 9000);
    }
    // 事件推进 → 晨昏号移交火种舱(共 3 节,保障跨星系殖民不被科技卡死)
    if (CRYO_GIFTS[save.story.idx] && !save.cryoGifts[save.story.idx]){
      save.cryoGifts[save.story.idx] = 1;
      const nc = { type:'cryo', clv:1 };
      let where;
      if (carCount() < carSlots()){ save.train.cars.push(nc); where = '已挂入编组'; }
      else {
        if (!save.depot['kenxi/canglan']) save.depot['kenxi/canglan'] = [];
        save.depot['kenxi/canglan'].push(nc); where = '存入沧澜车厢库';
      }
      persistSave();
      setTimeout(() => showToast(`晨昏号移交一节<b>休眠舱(火种)</b> —— ${where}。无人星系的第一块殖民地由它建立`, { sfx:'unlock', say:'Seed vault transferred.' }), 2200);
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
  sfx('confirm');
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
      if (data.ver !== 4) throw 0;   // v4 玩法纪元:不兼容旧档
      save = data;
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
  // 经济内核:生产/消耗/人口 → 区划竣工 → 效果聚合 → 科研值积累
  colonyTick();
  computeColonyFx();
  economyTick();
  accrueResearch();
  tickQueues();
  portTick();
  objectivesTick();
  questHintTick();
  briefTick();
  boardingTick();
  pirateRunTick();
  raidAlertTick();
  thrusterTick(save.train.status === 'travel' || localTransit());
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
    showToast(msg, {sfx:'levelup', say: arrival.firstVisit ? 'New system charted.' : 'Arrival confirmed.'});
    if (arrival.raidPending) setTimeout(() => openBattle(arrival.sys.id), 1300);
    if (mode === 'galaxy'){ refreshDock(); if (panelSys) renderSysPanel(); }
    if ($('train-overlay').classList.contains('show')) renderTrainCard();
  }
  // 离线期间抵达留下的未决遭遇战:本次会话首次自动弹出
  if (save.pendingRaid && !battleAutoOpened && !battleOpen()
      && (!save.pendingRaid.openAt || Date.now() >= save.pendingRaid.openAt)){
    battleAutoOpened = true;
    openBattle(save.pendingRaid.sysId);
  }

  // 升级检测(当前星系行星)
  for (const o of planetObjs){
    const d = o.data, lv = devLevel(d);
    if (prevLevels[d.key] !== undefined && lv > prevLevels[d.key] && prevLevels[d.key] > 0){
      showToast(`<b>${d.name}</b> 已发展为 <b>${lvName(d, lv)}</b>`, {sfx:'levelup', say:'Expansion complete.'});
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
  const balPart = 0.0625 * Math.min(sumLevels('hab'), sumLevels('res'));
  const bonusPart = (save.story ? save.story.buffs.civ : 0) + COLONY_FX.civ;
  $('civ-index').parentElement.title =
    `文明指数构成(均衡发展收益最大):\n人口规模 log10(总人口) = ${popPart.toFixed(2)}\n物资储备 log10(金库+全银河仓储) = ${resPart.toFixed(2)}\n均衡协同 0.0625×min(居住等级和, 资源等级和) = ${balPart.toFixed(2)}\n剧情与科研区加成 = ${bonusPart.toFixed(2)}`;
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


/* ════════ 银河总图:星系 hover 预览缩略图(复用 5 类星球图) ════════ */
function showSysPreview(sysId, el){
  const box = $('sys-preview');
  if (!box) return;
  const sys = sysById(sysId);
  const ps = planetsOf(sysId);
  const sig = ps.find(x => x.shader === 'terra' && !x.moonOf) || ps.find(x => x.role === 'hab' && !x.moonOf) || ps[0];
  const visited = !!save.visited[sysId];
  const planets = ps.filter(x => !x.moonOf);
  const hab = planets.filter(x => x.role === 'hab').length;
  const moons = ps.filter(x => x.moonOf).length + planets.reduce((s, x) => s + moonsOf(x).length, 0);
  const rg = REGIONS[regionOf(sys)];
  const rgCol = rg.name === '安全区' ? 'var(--green)' : rg.name === '近域' ? 'var(--cyan)' : rg.name === '边域' ? 'var(--amber)' : 'var(--red)';
  const bias = sys.bias && sys.bias !== 'hab' && RESOURCES[sys.bias] ? `特产 ${RESOURCES[sys.bias].name}` : sys.bias === 'hab' ? '宜居偏向' : '';
  const belt = typeof beltOf === 'function' && beltOf(sys) ? ' · 小行星带' : '';
  box.innerHTML = `<div class="spv-img${visited ? '' : ' unk'}" style="background-image:url('${planetArtOf(sig)}')">${visited ? '' : '<span class="spv-unk">未 勘 测</span>'}</div>
    <div class="spv-body">
      <div class="spv-name">${sys.name}<span>${sys.en || ''}</span></div>
      <div class="spv-meta"><b style="color:${rgCol}">${rg.name}</b> · ${sys.star || '恒星系'}${belt}</div>
      <div class="spv-meta">${visited
        ? `行星 ${planets.length} · 卫星 ${moons} · 宜居 ${hab} · 资源 ${planets.length - hab}${bias ? ' · ' + bias : ''}`
        : `行星 ${planets.length} · 抵达后解锁勘测详情`}</div>
    </div>`;
  const r = el.getBoundingClientRect();
  let x = r.right + 14, y = r.top - 36;
  if (x + 240 > innerWidth) x = r.left - 248;
  y = Math.max(56, Math.min(innerHeight - 190, y));
  box.style.left = x + 'px'; box.style.top = y + 'px';
  box.classList.add('show');
}
function hideSysPreview(){
  const box = $('sys-preview');
  if (box) box.classList.remove('show');
}
