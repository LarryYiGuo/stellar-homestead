/* ============================================================
   存档层 — window.storage(Claude 环境)优先,localStorage 兜底
   兼容旧版单星系存档 stellar_homestead_v1 自动迁移
   ============================================================ */
const SAVE_KEY = 'stellar_galaxy_v1';
const OLD_KEY  = 'stellar_homestead_v1';

let save = null;
let storageOK = false;
let lastSavedAt = 0;

/* 统一存储后端 */
const Store = {
  async get(k){
    if (window.storage){ const r = await window.storage.get(k); return r && r.value; }
    return localStorage.getItem(k);
  },
  async set(k, v){
    if (window.storage){ await window.storage.set(k, v); return; }
    localStorage.setItem(k, v);
  },
  available(){
    if (window.storage) return true;
    try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return true; }
    catch(e){ return false; }
  }
};

function freshSave(){
  return {
    ver: 2,
    est: {},                 // est[planetKey] = 前哨建立时间戳(ms)
    taken: {},               // taken[planetKey] = 已收取的资源量
    treasury: { metal:0, chem:0, he3:0, ice:0, deut:0 },
    lastCollect: {},         // lastCollect[sysId] = 上次收取时间戳
    visited: { kenxi:true },
    train: {
      sys:'kenxi', status:'docked', from:null, to:null, departAt:0, arriveAt:0,
      engineLv: 1,
      cars: [ {type:'engine'}, {type:'cargo'}, {type:'weapon', wid:'autogun', wlv:1} ],
    },
    log: [],
    deck: BASE_DECK.slice(),
    bossKills: {},
    colony: {},
    research: 0, tech: {},
    story: null, side: null,
    bgm: true,
  };
}

function normalizeSave(){
  if (!save || typeof save !== 'object') save = freshSave();
  const f = freshSave();
  for (const k of ['est','taken','treasury','lastCollect','visited','log','bossKills'])
    if (!save[k]) save[k] = f[k];
  if (!save.colony) save.colony = {};
  if (typeof save.research !== 'number') save.research = 0;
  if (!save.tech) save.tech = {};
  if (!Array.isArray(save.deck) || !save.deck.length) save.deck = BASE_DECK.slice();
  save.deck = save.deck.filter(id => CARDS[id]);   // 剔除已废弃的卡 id
  for (const r in f.treasury) if (typeof save.treasury[r] !== 'number') save.treasury[r] = 0;
  if (!save.train) save.train = f.train;
  if (!save.train.cars || !save.train.cars.length) save.train.cars = f.train.cars;
  if (!save.train.engineLv) save.train.engineLv = 1;
  // 主殖民地:沧澜开局即为 LV2 聚居点
  if (!save.est['kenxi/canglan'])
    save.est['kenxi/canglan'] = Date.now() - LEVELS[2].th * 1000;
  if (!save.story) save.story = { idx:0, nextAt: Date.now() + 8000, buffs:{cap:1, rate:1, civ:0}, log:[] };
  if (!save.story.buffs) save.story.buffs = {cap:1, rate:1, civ:0};
}

/* 旧版(单星系)存档迁移:est.canglan → est['kenxi/canglan'] */
function migrateOld(old){
  const s = freshSave();
  if (old.est) for (const id in old.est) s.est['kenxi/' + id] = old.est[id];
  if (old.story) s.story = old.story;
  if (old.side) s.side = old.side;
  if (old.bgm !== undefined) s.bgm = old.bgm;
  return s;
}

async function loadSave(){
  storageOK = Store.available();
  try{
    const raw = await Store.get(SAVE_KEY);
    if (raw){ save = JSON.parse(raw); }
    else {
      const oldRaw = await Store.get(OLD_KEY);
      if (oldRaw){
        save = migrateOld(JSON.parse(oldRaw));
        save._migrated = true;
      }
    }
  }catch(e){ save = null; }
  normalizeSave();
  maybeUnlockSide();
  persistSave();
}

let saveTimer = null;
async function persistNow(){
  if (!storageOK) return false;
  try{
    await Store.set(SAVE_KEY, JSON.stringify(save));
    lastSavedAt = Date.now();
    return true;
  }catch(e){ return false; }
}
function persistSave(){
  if (!storageOK) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
}

/* 航行日志 */
function pushLog(txt){
  save.log.unshift({ t: Date.now(), txt });
  if (save.log.length > 30) save.log.length = 30;
  persistSave();
}

/* ── 剧情状态推进(主线/支线共用) ── */
function maybeUnlockSide(){
  if (!save.side && save.story && save.story.idx >= SIDE_UNLOCK_AT){
    save.side = { idx:0, nextAt: Date.now() + 45000, log:[] };
    persistSave();
  }
}
function applyChoiceFx(fx){
  if (fx.jump){
    for (const key in save.est){
      if (fx.jump.scope === 'all' || fx.jump.scope === key)
        save.est[key] -= fx.jump.sec * 1000;
    }
  }
  if (fx.cap) save.story.buffs.cap *= fx.cap;
  if (fx.rate) save.story.buffs.rate *= fx.rate;
  if (fx.civ) save.story.buffs.civ += fx.civ;
}
function applyStoryChoice(ch, ci){
  applyChoiceFx(ch.choices[ci].fx || {});
  save.story.log.push(ci);
  save.story.idx++;
  save.story.nextAt = Date.now() + STORY_GAP;
  maybeUnlockSide();
  persistSave();
}
function applySideChoice(ch, ci){
  applyChoiceFx(ch.choices[ci].fx || {});
  save.side.log.push(ci);
  save.side.idx++;
  save.side.nextAt = Date.now() + SIDE_GAP;
  persistSave();
}
