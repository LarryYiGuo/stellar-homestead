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

/* ════════ 行星面板 ════════ */
function openPanel(d){
  panelPlanet = d; panelSys = null;
  const roleTag = d.role === 'hab'
    ? `<span class="role-tag hab">◆ ${d.key==='kenxi/canglan' ? '主殖民地' : '居住型'} · 容量 ${(d.capScale*100).toFixed(0)}%</span>`
    : `<span class="role-tag res">◆ 资源型 · ${RESOURCES[d.res.key].name} ×${d.res.rich.toFixed(1)}</span>`;
  const alias = d.alias ? `<span style="font-size:.85rem;font-weight:600;color:var(--text-dim)">(${d.alias})</span>` : '';
  $('panel-body').innerHTML = `
    <h2><span style="color:${dotColor(d)}">${iconOf(d)}</span>${d.name}${alias}</h2>
    <div class="type-tag">${d.type} · ${d.id.toUpperCase()}</div>
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
    const roleHint = d.role === 'hab'
      ? `这是一${d.moonOf?'颗卫星':'颗'}<b style="color:var(--green)">居住型</b>${d.moonOf?'殖民地':'星球'}:开发后人口将随真实时间持续增长,人口上限由开发阶段与容量(${(d.capScale*100).toFixed(0)}%)决定,并受全银河资源型星球加成。`
      : `这是一颗<b style="color:var(--amber)">资源型</b>星球:开发后将持续产出<b style="color:var(--amber)">${RESOURCES[d.res.key].name}</b>(丰度 ×${d.res.rich.toFixed(1)}),满级后产出永不停止。产出需列车靠站收取,方可注入金库。`;
    const condHtml = conds.length ? `
      <div class="cond-box">
        <div class="cond-title">${locked ? '殖民许可 · 待满足条件' : '殖民许可 · 已批准'}</div>
        ${conds.map(c => `<div class="cond-item ${c.met?'met':''}">${c.met?'✓':'○'} ${c.text}</div>`).join('')}
      </div>` : '';
    blk.innerHTML = `
      ${condHtml}
      <button id="establish-btn" class="act-btn" ${locked?'disabled':''}>${locked ? '条 件 未 满 足' : '建 立 前 哨'}</button>
      <p class="hint">${roleHint}</p>
      <p class="hint">部署后开发度只随<b>真实时间流逝</b>累积,离线也不会停止。宜居度 ${(d.habit*100).toFixed(0)}% 决定发展速率。</p>`;
    if (!locked){
      $('establish-btn').onclick = () => {
        save.est[d.key] = Date.now();
        persistSave();
        showToast(`<b>${d.name}</b> · ${d.role==='hab'?'居住':'采集'}前哨已建立,开发进程启动`, {sfx:'confirm', say:'Outpost established.'});
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
    <div class="level-row">
      <div class="level-name">${LEVELS[lv].name}</div>
      <div class="level-num">LV ${lv} / ${MAX_LEVEL}</div>
    </div>
    <div class="bar"><div class="fill ${isMax?'max':''}" style="width:${(isMax?1:prog)*100}%"></div></div>
    <div class="bar-meta"><span>${isMax ? 'MAX' : (prog*100).toFixed(1)+'%'}</span>${etaHtml}</div>
    ${nextHtml}
    ${ecoHtml}
    <div class="rate-line">发展速率 <span>${d.habit.toFixed(2)} pts/s</span> · 已运转 ${fmtDuration(elapsed)}</div>
    <p class="hint">开发等级越高,夜面城市灯光越密集——切换到星球背阳面即可观察。</p>`;
  const cb = $('collect-btn');
  if (cb) cb.onclick = () => doCollect(d.sysId);
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
    if (d.moonOf && lv === 0 && !isUnlocked(d)) continue;
    const locked = lv === 0 && !isUnlocked(d);
    const el = document.createElement('div');
    el.className = 'dock-item' + (lv>0?' developed':'') + (view.focus===o?' active':'') + (locked?' locked':'');
    const nm = d.key==='kenxi/canglan' ? '★ '+d.name : (d.moonOf ? '☾ '+d.name : d.name);
    el.innerHTML = `
      <div class="pic" style="color:${dotColor(d)}">${iconOf(d)}</div>
      <div class="nm">${nm}</div>
      <div class="lv" style="${lv>0 ? `color:${d.role==='hab'?'var(--green)':'var(--amber)'}` : ''}">${lv>0 ? LEVELS[lv].name : (locked ? '🔒 未解锁' : '可开发')}</div>`;
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

/* ════════ 剧本系统 ════════ */
function storyReady(){
  return save.story && save.story.idx < STORY.length && Date.now() >= save.story.nextAt;
}
function sideReady(){
  return save.side && save.side.idx < SIDE_STORY.length && Date.now() >= save.side.nextAt;
}
let prevSignal = '';
function checkSignal(){
  const btn = $('signal-btn');
  const modalOpen = $('story-overlay').classList.contains('show');
  if (modalOpen){ btn.classList.remove('show'); return; }
  let cur = '';
  if (storyReady()){
    btn.classList.add('show'); btn.classList.remove('anom');
    btn.innerHTML = '<span class="sdot"></span>深空讯号 · 接收';
    cur = 'main';
  } else if (sideReady()){
    btn.classList.add('show'); btn.classList.add('anom');
    btn.innerHTML = '<span class="sdot"></span>异常讯号 · 凛渊';
    cur = 'side';
  } else {
    btn.classList.remove('show');
  }
  if (cur && cur !== prevSignal){
    sfx('signal');
    speak(cur === 'main' ? 'Incoming transmission.' : 'Anomalous signal detected.');
  }
  prevSignal = cur;
}
function openStory(){
  const isMain = storyReady();
  if (!isMain && !sideReady()) return;
  const state = isMain ? save.story : save.side;
  const book = isMain ? STORY : SIDE_STORY;
  const ch = book[state.idx];
  const card = $('story-card');
  card.classList.toggle('anom', !isMain);
  card.innerHTML = `
    <div class="eyebrow">${ch.eyebrow}</div>
    <h3>${ch.title}</h3>
    <div class="sbody">${ch.body.map(p=>`<p>${p}</p>`).join('')}</div>
    <div class="schoices">${ch.choices.map((c,i)=>`
      <button class="schoice" data-i="${i}"><div class="cl">${c.label}</div><div class="cs">▸ ${c.sub}</div></button>`).join('')}
    </div>`;
  card.querySelectorAll('.schoice').forEach(btn => {
    btn.onclick = () => resolveStory(ch, +btn.dataset.i, isMain);
  });
  $('story-overlay').classList.add('show');
  $('signal-btn').classList.remove('show');
  sfx('open');
}
function resolveStory(ch, ci, isMain){
  const choice = ch.choices[ci];
  if (isMain) applyStoryChoice(ch, ci); else applySideChoice(ch, ci);
  const card = $('story-card');
  const done = isMain ? save.story.idx >= STORY.length : save.side.idx >= SIDE_STORY.length;
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
}
function renderSettings(){
  const card = $('settings-card');
  const ago = lastSavedAt ? fmtDuration((Date.now()-lastSavedAt)/1000) + ' 前' : '—';
  card.innerHTML = `
    <h3>系统</h3>
    <div class="save-meta">
      存档状态 · ${storageOK ? '<span>自动持久化已启用</span>' : '<span class="warn">仅本次会话(环境不支持持久化,请用导出备份)</span>'}<br>
      上次保存 · ${storageOK ? ago : '—'}
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
    $('io-area').classList.add('show');
    $('io-apply').style.display = 'none';
    $('io-copy').style.display = '';
    const txt = $('io-text');
    txt.value = JSON.stringify(save);
    txt.focus(); txt.select();
  };
  $('io-copy').onclick = async () => {
    const txt = $('io-text');
    txt.focus(); txt.select();
    try{ await navigator.clipboard.writeText(txt.value); showToast('存档已复制到剪贴板', {sfx:'blip'}); }
    catch(e){ showToast('请手动全选复制文本框内容'); }
  };
  $('s-import').onclick = () => {
    $('io-area').classList.add('show');
    $('io-apply').style.display = '';
    $('io-copy').style.display = 'none';
    const txt = $('io-text');
    txt.value = '';
    txt.placeholder = '粘贴之前导出的存档 JSON…';
    txt.focus();
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
    const un = isUnlocked(p);
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
  checkSignal();
  refreshTopbar();
  $('civ-index').textContent = civIndex().toFixed(2);
  $('civ-tier').textContent = '文明指数 · ' + civTier();
  $('pop-total').textContent = fmtNum(totalPop());
  $('dev-count').textContent = devCountAll() + ' / ' + allPlanets().length;
  if (panelPlanet) renderDevBlock();
  if (panelSys && mode === 'galaxy' && save.train.status === 'travel') renderSysPanel();
  if ($('train-overlay').classList.contains('show')) refreshTrainDynamic();
}
