/* ============================================================
   入口 — 初始化与主循环
   ============================================================ */
async function init(){
  await loadSave();
  initRenderer();
  setupInput();

  // 开局视图:列车所在星系(航行中则回垦曦视角)
  const startSys = save.train.status === 'docked' ? save.train.sys : (save.train.from || 'kenxi');
  setMode('system', startSys);

  $('back-btn').onclick = backAction;
  $('signal-btn').onclick = openStory;
  $('galaxy-btn').onclick = () => { if (mode !== 'galaxy') setMode('galaxy'); };
  $('train-btn').onclick = (e) => {
    e.stopPropagation();
    if (save.pendingRaid) openBattle(save.pendingRaid.sysId);   // 未决遭遇战优先
    else openTrain();
  };
  $('train-tag').onclick = () => {
    if (save.pendingRaid) openBattle(save.pendingRaid.sysId);
    else openTrain();
  };
  $('set-btn').onclick = (e) => { e.stopPropagation(); openSettings(); };

  MUSIC.wantOn = save.bgm !== false;
  $('bgm-btn').classList.toggle('on', MUSIC.wantOn);
  $('bgm-btn').onclick = (e) => { e.stopPropagation(); bgmToggle(); };
  if (MUSIC.wantOn) musicStart();
  addEventListener('pointerdown', bgmFirstGesture, { once:false });

  $('settings-overlay').onclick = (e) => { if (e.target === $('settings-overlay')) $('settings-overlay').classList.remove('show'); };
  $('train-overlay').onclick = (e) => { if (e.target === $('train-overlay')) $('train-overlay').classList.remove('show'); };

  $('nav-prev').onclick = () => navPlanet(-1);
  $('nav-next').onclick = () => navPlanet(1);
  addEventListener('keydown', e => {
    if ($('story-overlay').classList.contains('show') || $('settings-overlay').classList.contains('show')) return;
    if ($('train-overlay').classList.contains('show')){
      if (e.key === 'Escape') $('train-overlay').classList.remove('show');
      return;
    }
    if (e.key === 'ArrowLeft') navPlanet(-1);
    else if (e.key === 'ArrowRight') navPlanet(1);
    else if (e.key === 'Escape') backAction();
    else if (e.key === 'g' || e.key === 'G'){ if (mode !== 'galaxy') setMode('galaxy'); }
    else if (e.key === 't' || e.key === 'T') openTrain();
  });

  refreshDock();
  tickUI();
  setInterval(tickUI, 1000);
  const ra = document.getElementById('raid-alert');
  if (ra) ra.onclick = () => {
    if (save.pendingRaid){ save.pendingRaid.openAt = 0; battleAutoOpened = false; tickUI(); }
  };
  animate();
  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  setTimeout(() => $('loader').classList.add('hidden'), 900);
  setTimeout(() => $('tip').classList.add('hidden'), 12000);

  // 回访问候
  if (save._migrated){
    delete save._migrated;
    persistSave();
    setTimeout(() => showToast('检测到单星系时代的旧存档 —— <b>已迁移至银河纪元</b>,殖民进度完整保留', {sfx:'unlock', say:'Archive migrated. Welcome to the galactic era.'}), 1600);
  } else {
    const deved = allPlanets().filter(p => devLevel(p) > 0);
    if (deved.length > 1){
      const best = deved.reduce((a,b) => devLevel(a) >= devLevel(b) ? a : b);
      setTimeout(() => showToast(`欢迎回来,指挥官 —— <b>${best.name}</b> 当前阶段:<b>${LEVELS[devLevel(best)].name}</b>`, {say:'Welcome back, Commander.'}), 1400);
    }
  }
}
init();
