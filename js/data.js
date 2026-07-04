/* ============================================================
   星垦 · 银河纪元 — 数据层
   开发等级 / 资源 / 银河系 10 星系 / 行星(手作 + 程序生成)/ 剧情
   ============================================================ */

/* ── 开发阶段 v4:阈值单位 = 开发点,全部来自玩家可影响的量 ──
   开发点 = 建成区划×100 + 建成建筑×150 + 人口里程碑×150
          + 出口驱动(资源星)/ 落户驱动(居住星,对数)
   th(n) = 25(n-1)² + 75(n-1) —— LV20 是「建满 + 亿级人口」的长线目标,不再是日历目标 */
const LEVELS = [
  { name: '未开发',     th: -1 },
  { name: '前哨站',     th: 0 },
  { name: '聚居点',     th: 100 },
  { name: '拓荒镇',     th: 250 },
  { name: '殖民地',     th: 450 },
  { name: '自治市',     th: 700 },
  { name: '行星城邦',   th: 1000 },
  { name: '工业枢纽',   th: 1350 },
  { name: '行星都市',   th: 1750 },
  { name: '环带都会',   th: 2200 },
  { name: '行星首府',   th: 2700 },
  { name: '轨道文明',   th: 3250 },
  { name: '共生都市群', th: 3850 },
  { name: '行星议会',   th: 4500 },
  { name: '改造纪元',   th: 5200 },
  { name: '绿洲网络',   th: 5950 },
  { name: '生态走廊',   th: 6750 },
  { name: '行星花园',   th: 7600 },
  { name: '盖娅雏形',   th: 8500 },
  { name: '盖娅之境',   th: 9450 },
  { name: '生态文明',   th: 10450 },
];
const MAX_LEVEL = 20;
/* 开发点权重 */
const DEV_PER_DISTRICT = 100, DEV_PER_BUILDING = 150, DEV_PER_POP_TIER = 150;
const EXPORT_DEV_K = 100, EXPORT_DEV_BASE = 1000;   // 资源星:累计出口 → 开发(对数)
const SETTLE_DEV_K = 80,  SETTLE_DEV_BASE = 500;    // 居住星:累计落户 → 开发(对数)

/* 人口里程碑(tier 表:消耗档位 / 开发点 / 区划节奏共用) */
const POP_MILESTONES = [0, 100, 500, 2e3, 5e3, 1.5e4, 4e4, 1e5, 2.5e5, 6e5,
  1.5e6, 3e6, 6e6, 1.2e7, 2.5e7, 5e7, 1e8, 2e8, 4e8, 8e8, 1.2e9, 1.5e9];

/* ── v4 殖民经济常数 ── */
const POP_GROWTH_PER_MIN = 0.02;     // 基础增长 2%/分 × 宜居度 × 修正(逻辑斯谛)
const FOOD_SURPLUS_MULT  = 1.25;     // 本地仓消费品存量 ≥ 30 分钟 → 增长加成
const POP_CAP_BASE    = 5e4;         // 基础承载 × capScale
const POP_CAP_PER_HAB = 8e5;         // 每座民生区承载 × capScale
const CONSUME_CHEM_K = 0.5, CONSUME_POW = 1.6;   // 消费品/分 = K × tier^POW
const CONSUME_ICE_HABIT = 0.7;                   // 宜居 < 0.7 需水冰生命支持
const CONSUME_HE3_PER_DISTRICT = 0.3;            // 工/研/军区划能源(首座自供)
const RES_BASE_PER_MIN = 30;                     // 资源星基础产出/分(× 丰度 × 区域 × 区划)
const STORE_CAP_BASE = 3000, STORE_CAP_PER_TRADE = 4000;   // 本地仓上限(商贸区扩容)
const OFFLINE_CAP_SEC = 8 * 3600, OFFLINE_EFF = 0.5;       // 离线:8 小时封顶,效率减半
/* 区划建设(玩家亲手):成本/工期随本星已建数递增 */
const DISTRICT_COST_BASE = 120, DISTRICT_COST_GROWTH = 1.22;
const DISTRICT_TIME_BASE = 60,  DISTRICT_TIME_GROWTH = 0.15;

const CIV_TIERS = [
  [0,'蛰伏'], [2,'星火'], [6,'拓荒纪元'], [11,'行星文明'],
  [16,'跨行星文明'], [22,'恒星文明'], [28,'星系文明']
];

/* ── 资源种类(全银河统一货币) ── */
const RESOURCES = {
  metal: { name:'稀有金属',   color:'#f59e0b' },
  chem:  { name:'大气化合物', color:'#a3e635' },
  he3:   { name:'氦-3',      color:'#22d3ee' },
  ice:   { name:'水冰',       color:'#93c5fd' },
  deut:  { name:'氘',         color:'#8b5cf6' },
};
/* ── 资源层级 × 星图区域产能:全种类初始可获取,卡的是数量 ──
   基础(金属/化合物)哪里都管饱;稀有(氦-3/氘)在垦曦仅够自给,
   大宗稀有要列车去引擎解锁的远星区背回来 ── */
const RES_TIERS = { metal:'basic', chem:'basic', ice:'mid', he3:'rare', deut:'rare' };
/* 收集/摆渡优先级:稀有 > 中级 > 基础(同级按键序) */
const RES_TIER_RANK = { rare:2, mid:1, basic:0 };
function resPrioKeys(store){
  return Object.keys(store).sort((a, b) => (RES_TIER_RANK[RES_TIERS[b]] || 0) - (RES_TIER_RANK[RES_TIERS[a]] || 0));
}
const REGION_RES_MULT = [
  { basic:1.3, mid:0.6, rare:0.10 },   // 安全区(垦曦):稀有低产,自给级(配平滑产率模型)
  { basic:1.2, mid:1.0, rare:0.45 },   // 近域
  { basic:1.5, mid:1.4, rare:1.0  },   // 边域(引擎 LV2-3)
  { basic:1.8, mid:2.0, rare:2.0  },   // 深空(引擎 LV6+)
  { basic:2.2, mid:2.8, rare:3.2  },   // 外环(引擎 LV8+)
];
function resRegionMult(p){
  const rg = regionOf(sysById(p.sysId));
  return REGION_RES_MULT[rg][RES_TIERS[p.res.key]] || 1;
}

/* ── 资源图标(晶体/分子/原子/冰晶/重氢,stroke 继承 color) ── */
const RES_ICONS = {
  metal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l6.5 5.2L16 20H8L5.5 8.2z"/><path d="M5.5 8.2h13M12 3l-1.5 17M12 3l1.5 17"/></svg>`,
  chem:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7.5" cy="9" r="2.6"/><circle cx="16.5" cy="7" r="2.2"/><circle cx="13" cy="16.5" r="2.8"/><path d="M9.8 10.2l1.8 3.8M14.5 8.2l-1 5.6M9.9 8.4l4.4-1"/></svg>`,
  he3:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4" transform="rotate(64 12 12)"/><circle cx="19.5" cy="9.6" r="1" fill="currentColor" stroke="none"/></svg>`,
  ice:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 3l-2 2.2M12 3l2 2.2M12 21l-2-2.2M12 21l2-2.2M4.2 7.5l3 .4M19.8 16.5l-3-.4M19.8 7.5l-3 .4M4.2 16.5l3-.4"/></svg>`,
  deut:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10.6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="13.8" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1.1" fill="currentColor" stroke="none"/></svg>`,
};
/* 科研值图标(轨道电子) */
const RP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/></svg>`;

function fmtNum(n){
  if (n < 1e4) return Math.round(n).toLocaleString();
  if (n < 1e8) return (n/1e4).toFixed(n<1e6?1:0) + ' 万';
  if (n < 1e12) return (n/1e8).toFixed(2) + ' 亿';
  return (n/1e12).toFixed(2) + ' 万亿';
}
function fmtDuration(sec){
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + ' 秒';
  if (sec < 3600) return Math.floor(sec/60) + ' 分 ' + (sec%60) + ' 秒';
  if (sec < 86400) return Math.floor(sec/3600) + ' 小时 ' + Math.floor(sec%3600/60) + ' 分';
  return Math.floor(sec/86400) + ' 天 ' + Math.floor(sec%86400/3600) + ' 小时';
}

/* ============================================================
   银河系 — 10 个星系
   pos: 银河盘面坐标(光年抽象单位);req: 列车引擎等级 / 文明指数门槛
   ============================================================ */
const SYSTEMS = [
  { id:'kenxi', name:'垦曦', en:'KENXI', star:'G 型黄矮星', pos:[0,0],
    hazard:0, rich:1.0, handmade:true,
    sunCol:[[1.0,0.55,0.15],[1.0,0.92,0.6]], nodeCol:'#ffd9a0',
    desc:'人类在猎户臂的新摇篮。「晨昏号」播种船四百年航程的终点,八颗行星环绕温和的黄矮星——文明的全部根系都扎在这里。' },
  { id:'zhulong', name:'烛龙', en:'ZHULONG', star:'M 型红矮星', pos:[4,17],
    hazard:1, rich:1.2, bias:'metal', n:[3,4], req:{},
    sunCol:[[0.9,0.25,0.1],[1.0,0.55,0.3]], nodeCol:'#ff7a55',
    desc:'离垦曦最近的红矮星,昏暗的红光下藏着重元素异常富集的岩石行星带。第一条采矿航线的天然终点。' },
  { id:'zhiyue', name:'织月', en:'ZHIYUE', star:'K 型橙矮星 · 双星', pos:[-10,-22],
    hazard:1, rich:1.15, bias:'chem', n:[3,4], req:{},
    sunCol:[[1.0,0.5,0.18],[1.0,0.75,0.45]], nodeCol:'#ffb070',
    desc:'一对互相缠绕的橙矮星。双星引力把行星大气搅成永不停歇的风暴织机,大气化合物在云层里以工业品位沉积。' },
  { id:'shuanghuan', name:'霜环', en:'FROSTRING', star:'F 型黄白星', pos:[25,42],
    hazard:2, rich:1.3, bias:'ice', n:[4,5], req:{engine:2},
    sunCol:[[0.85,0.85,0.95],[1.0,0.97,0.85]], nodeCol:'#cfe0ff',
    desc:'雪线以外挤满冰巨星与碎冰带,环系在星光下像叠起来的银戒指。采冰船队眼中的应许之地。' },
  { id:'chichao', name:'赤潮', en:'REDTIDE', star:'红巨星', pos:[-32,-26],
    hazard:2, rich:1.35, bias:'he3', n:[3,4], req:{engine:2},
    sunCol:[[0.95,0.2,0.08],[1.0,0.5,0.25]], nodeCol:'#ff5540',
    desc:'垂暮的红巨星正缓慢吞噬内行星,膨胀的外层大气是一座敞开的氦-3 矿。在恒星的葬礼上拾取薪火。' },
  { id:'mingsha', name:'鸣沙', en:'MINGSHA', star:'G 型黄矮星', pos:[27,-46],
    hazard:3, rich:1.45, bias:'metal', n:[4,5], req:{engine:3},
    sunCol:[[1.0,0.6,0.2],[1.0,0.9,0.55]], nodeCol:'#ffd080',
    desc:'行星际尘埃浓得能听见——撞击航线护盾时像沙暴掠过车窗。尘埃来自一颗碎裂的金属行星,矿藏与危险等量齐观。' },
  { id:'cangwu', name:'苍梧', en:'CANGWU', star:'G 型黄矮星', pos:[-44,23],
    hazard:2, rich:1.2, bias:'hab', n:[4,5], req:{engine:3, civ:10},
    sunCol:[[1.0,0.6,0.2],[1.0,0.93,0.62]], nodeCol:'#9fe8c0',
    desc:'勘测档案标记为「第二摇篮」:不止一颗行星位于宜居带内。若垦曦是家,苍梧就是人类写给银河的第二行字。' },
  { id:'xuanshu', name:'玄枢', en:'XUANSHU', star:'中子星', pos:[-13,83],
    hazard:4, rich:1.6, bias:'deut', n:[3,4], req:{engine:4},
    sunCol:[[0.5,0.65,1.0],[0.85,0.92,1.0]], nodeCol:'#7fa8ff',
    desc:'一颗以毫秒为脉搏的中子星。潮汐撕碎过路天体,也把氘像盐一样撒满整个星系。靠近它,仪表盘会先于人心跳加速。' },
  { id:'baiju', name:'白驹', en:'BAIJU', star:'B 型蓝白星', pos:[18,105],
    hazard:4, rich:1.7, bias:'he3', n:[3,4], req:{engine:4},
    sunCol:[[0.55,0.7,1.0],[0.9,0.95,1.0]], nodeCol:'#9fc4ff',
    desc:'年轻而暴烈的蓝白星,恒星风把行星大气剥成长长的彗尾。高能粒子流里淘金的人,赚的是文明的快钱。' },
  { id:'hengyao', name:'衡曜', en:'HENGYAO', star:'古老 G 型星 · 银心侧', pos:[-136,82],
    hazard:5, rich:2.0, bias:'deut', n:[5,6], req:{engine:5, civ:16},
    sunCol:[[1.0,0.75,0.35],[1.0,0.95,0.75]], nodeCol:'#ffe9b0',
    desc:'比垦曦古老四十亿年的恒星,行星表面有疑似非自然的几何结构残骸。深空监听站称之为「第一站台」——仿佛很久以前,也有列车在这里停靠。' },
];
/* ── 深空扩展:20 个远征星系(纯引擎等级门控) ── */
const STAR_CLASSES = {
  m:  { star:'M 型红矮星', sun:[[0.9,0.25,0.1],[1.0,0.55,0.3]],   node:'#ff7a55' },
  k:  { star:'K 型橙矮星', sun:[[1.0,0.5,0.18],[1.0,0.75,0.45]],  node:'#ffb070' },
  g:  { star:'G 型黄矮星', sun:[[1.0,0.6,0.2],[1.0,0.92,0.6]],    node:'#ffd9a0' },
  f:  { star:'F 型黄白星', sun:[[0.85,0.85,0.95],[1.0,0.97,0.85]],node:'#cfe0ff' },
  a:  { star:'A 型白星',   sun:[[0.8,0.85,1.0],[0.95,0.97,1.0]],  node:'#dfe8ff' },
  b:  { star:'B 型蓝白星', sun:[[0.55,0.7,1.0],[0.9,0.95,1.0]],   node:'#9fc4ff' },
  rg: { star:'红巨星',     sun:[[0.95,0.2,0.08],[1.0,0.5,0.25]],  node:'#ff5540' },
  wd: { star:'白矮星',     sun:[[0.85,0.9,1.0],[1.0,1.0,1.0]],    node:'#e8f0ff' },
  ns: { star:'中子星',     sun:[[0.5,0.65,1.0],[0.85,0.92,1.0]],  node:'#7fa8ff' },
  bin:{ star:'联星系统',   sun:[[1.0,0.5,0.18],[1.0,0.8,0.5]],    node:'#ffc890' },
  /* ── 特殊天体 ── */
  bh:   { star:'黑洞 · 吸积盘',     sun:[[0.55,0.25,1.0],[0.9,0.6,1.0]],   node:'#b78bff' },
  neb:  { star:'弥散星云 · 育婴房', sun:[[0.95,0.45,0.75],[0.7,0.85,1.0]], node:'#ff9fd6' },
  pul:  { star:'毫秒脉冲双星',     sun:[[0.55,0.7,1.0],[1.0,1.0,1.0]],    node:'#a8c8ff' },
  rem:  { star:'超新星遗迹',       sun:[[1.0,0.4,0.2],[1.0,0.8,0.5]],     node:'#ff8a5c' },
  rogue:{ star:'流浪恒星 · 星际荒原', sun:[[0.5,0.6,0.8],[0.85,0.9,1.0]],  node:'#93a7c8' },
  ark:  { star:'古老 F 型星 · 遗迹带', sun:[[0.85,0.85,0.95],[1.0,0.97,0.85]], node:'#7fd6c9' },
};
// [id, name, 星类, pos, hazard, rich, bias, 引擎需求, desc]
const EXTRA_SYSTEMS = [
  ['halcyon','Halcyon','f',[17,61],3,1.6,'ice',5,'风平浪静得反常的星域,冰环在白光下纹丝不动。老船员说,太安静的地方,要么真安全,要么有东西在听。'],
  ['noctis','Noctis','wd',[-88,-59],3,1.6,'deut',5,'白矮星的光像一盏临终的灯。行星永远处于深蓝色的黄昏里,氘冰在暮色中缓慢结晶。'],
  ['aurelia','Aurelia','k',[-42,-46],3,1.7,'metal',5,'橙矮星把一切镀成金色。小行星带的金属丰度高得离谱——这里曾经也许有过一颗行星,现在它是矿。'],
  ['vesper','Vesper','bin',[-69,-43],3,1.8,'chem',5,'一对互绕的恒星,每十一天交食一次。大气行星的化合物云在双重日落下呈现出无法命名的颜色。'],
  ['meridian','Meridian','g',[31,88],4,1.9,'he3',6,'与垦曦惊人相似的黄矮星——只是这里的气巨多了一倍。氦-3 矿团叫它"正午",因为产量永远在峰值。'],
  ['caldera','Caldera','rg',[-64,-6],4,1.9,'metal',6,'红巨星膨胀时熔毁了内行星,留下一圈凝固的金属熔渣带。采矿船在恒星的余烬里淘洗。'],
  ['thule','Thule','m',[-57,-99],4,2.0,'ice',6,'古地图把世界尽头标作 Thule。红矮星微弱的光照不化任何东西——整个星系是一座天然冷库。'],
  ['cinder','Cinder','m',[-38,-81],4,2.1,'metal',6,'恒星耀斑反复炙烤着近轨行星,地壳被烧成了富金属的烬层。窗口期很短,收益很高。'],
  ['lyra','Lyra','a',[-19,113],4,2.2,'chem',7,'白星的光经过气巨环系折射,在舷窗上拉出竖琴弦一样的光痕。化合物云层深处有规律的闪电。'],
  ['orpheus','Orpheus','ns',[-95,-4],4,2.3,'deut',7,'中子星每秒自转七百次。靠得太近的人说,能在仪表噪声里听见歌声——回头的人,什么也没带回来。'],
  ['sable','Sable','b',[64,68],4,2.4,'he3',7,'蓝白星的辐射把行星大气剥得只剩贴地一层。黑色的地表吸收一切光——除了采集站的灯。'],
  ['aquila','Aquila','b',[61,120],5,2.5,'he3',8,'年轻的蓝白星群,恒星风像鹰的俯冲。高能粒子流是最好的氦-3 富集器,也是最坏的航线天气。'],
  ['borealis','Borealis','f',[7,138],5,2.6,'ice',8,'整个星系笼罩在一片发光的尘埃极光里。冰巨星的环在极光中若隐若现,美得让护航员分心。'],
  ['seraph','Seraph','a',[75,101],5,2.7,'deut',8,'六颗行星排成近乎完美的共振链,像某种刻意的排列。勘测报告用了一个不科学的词:神迹。'],
  ['erebus','Erebus','ns',[-43,153],5,2.8,'deut',9,'幽暗的中子星域,监听阵列在这里收到过三次无法解码的窄带信号。氘储量全银河第二,没人问第一名为什么空着。'],
  ['quintessa','Quintessa','bin',[-161,-47],5,2.9,'chem',9,'五体引力系统,航线计算要精确到秒。化合物丰度是教科书级的——前提是你能活着把货装满。'],
  ['solstice','Solstice','rg',[67,142],5,3.0,'he3',9,'垂死的红巨星正在最后的膨胀期。它的外层大气是一片无边的氦海——文明的薪柴,恒星的遗产。'],
  ['avalon','Avalon','g',[6,163],6,3.2,'hab',10,'传说中的应许之地:三颗行星同时位于宜居带。距离是唯一的考验——只有最强的引擎配得上它。'],
  ['outremer','Outremer','wd',[-153,62],6,3.3,'metal',10,'"海外之地"。白矮星周围的行星残骸带是整个旋臂最富的金属矿场,也是袭击者舰队的母港。'],
  ['terminus','Terminus','ns',[-128,-92],6,3.5,'deut',10,'已知航图的最后一站。轨道上漂浮着锈蚀的巨型环状结构——像一座废弃的车站。深空监听站的备注只有一句:它在等下一班车。'],
  /* ── 特殊星系:天体奇观,资源与风险都写在脸上 ── */
  ['cocoon','茧云','neb',[48,-48],2,2.4,'chem',6,
    '整个星系裹在粉色的弥散星云里,新生恒星在茧中一颗颗点亮。化合物在星云尘埃中自然富集——温柔、丰饶,连海盗都不愿在这里开火。','星云育婴房'],
  ['twinbell','双铃','pul',[-18,-69],5,2.6,'deut',6,
    '两颗毫秒脉冲星互相绕转,射电束像双铃齐鸣扫过整个星系。导航条件恶劣至极,氘矿品位却是教科书上不存在的数字。','脉冲双星'],
  ['cindercrown','烬冕','rem',[72,47],4,2.8,'metal',7,
    '超新星爆发把一颗恒星的一生锻成一圈金属残冕。重元素丰度高到勘测仪自动报错——这里每一块碎片都曾是恒星的心脏。','超新星遗迹'],
  ['nameless','无名者','rogue',[75,-75],3,2.2,'ice',8,
    '一颗被抛出旋臂的流浪恒星,孤悬在两条旋臂之间的黑暗里。它不属于任何星图——但冰封的行星上,有人留下过一盏还亮着的灯。','流浪恒星'],
  ['maw','噬星之喉','bh',[-98,50],6,3.6,'deut',8,
    '一颗恒星质量黑洞蜷伏在银心侧翼,吸积盘的光比正午更亮。行星在潮汐边缘摇摇欲坠——那里的氘,浓得像宇宙欠下的债。','黑洞'],
  ['ark','静默方舟','ark',[-38,125],5,2.0,'hab',9,
    '轨道上悬着一艘长九百公里的环形残骸,自转周期精确得像钟表。勘测队叫它方舟;它的建造者没有留下名字,只留下三颗被改造到近乎宜居的行星。','远古遗迹'],
];
for (const [id, name, cls, pos, hazard, rich, bias, eng, desc, special] of EXTRA_SYSTEMS){
  const c = STAR_CLASSES[cls];
  SYSTEMS.push({ id, name, en: /[a-z]/i.test(name) ? name.toUpperCase() : id.toUpperCase(),
    star:c.star, pos, hazard, rich,
    bias, n: hazard >= 5 ? [4,6] : [3,5], req:{ engine: eng },
    sunCol:c.sun, nodeCol:c.node, desc, special });
}

function sysById(id){ return SYSTEMS.find(s => s.id === id); }
function sysDist(a, b){
  const A = sysById(a).pos, B = sysById(b).pos;
  return Math.hypot(A[0]-B[0], A[1]-B[1]);
}

/* ── 星图区域:按距母星系的距离划分,决定敌人强度与战利品规模 ──
   母星系 = 永久安全区,绝不触发遭遇战 */
const REGIONS = [
  { name:'安全区', maxD:0,        hpS:0,   atkS:0,   loot:0  },
  { name:'近域',   maxD:30,       hpS:1.0, atkS:1.0, loot:1  },
  { name:'边域',   maxD:65,       hpS:1.8, atkS:1.5, loot:4  },
  { name:'深空',   maxD:115,      hpS:3.2, atkS:2.3, loot:12 },
  { name:'外环',   maxD:Infinity, hpS:5.5, atkS:3.7, loot:30 },
];
function regionOf(sys){
  if (sys.id === 'kenxi') return 0;
  const d = Math.hypot(sys.pos[0], sys.pos[1]);
  for (let i = 1; i < REGIONS.length; i++) if (d <= REGIONS[i].maxD) return i;
  return REGIONS.length - 1;
}

/* ============================================================
   垦曦星系 — 手作行星(原版 v12 全量保留)
   ============================================================ */
const KENXI_PLANETS = [
  { id:'jinyan',  name:'烬岩', type:'熔岩行星', shader:'rocky',
    role:'res', res:{ key:'metal', rich:1.4 },
    unlock:[ {planetLv:{id:'canglan', lv:4}} ],
    radius:0.45, orbitR:16,  period:26,  tilt:0.03, habit:0.30, au:0.31,
    seed:3.1, c1:[0.32,0.22,0.18], c2:[0.55,0.33,0.2], c3:[0.16,0.1,0.09],
    atmo:[1.0,0.45,0.2], atmoS:0.25,
    desc:'距恒星最近的灼热岩石世界,向阳面温度足以熔化铅。岩浆翻涌将地核重元素带至浅层——全系品位最高的稀有金属矿脉。只有殖民地级的工业体系,才造得出能在这里存活的采矿设备。' },
  { id:'shamu',   name:'纱幕', type:'温室行星', shader:'venus',
    role:'res', res:{ key:'chem', rich:0.9 },
    unlock:[ {story:2}, {planetLv:{id:'canglan', lv:4}} ],
    radius:0.92, orbitR:23,  period:46,  tilt:0.02, habit:0.40, au:0.68,
    seed:7.7, c1:[0.85,0.72,0.5], c2:[0.95,0.85,0.62], c3:[0.6,0.48,0.34],
    atmo:[1.0,0.85,0.55], atmoS:0.85,
    desc:'被永不消散的浓密云层包裹,失控的温室效应令地表高温高压。破译地球讯号时重建的高增益通讯技术,正好用来穿透它的云层遥控浮空平台。' },
  { id:'canglan', name:'沧澜', alias:'新萨拉萨', type:'海洋行星', shader:'terra',
    role:'hab', capScale:1.0, sea:0.62, arch:0.85,
    radius:1.0,  orbitR:31,  period:72,  tilt:0.41, habit:1.00, au:1.0,
    seed:12.4, c1:[0.1,0.38,0.16], c2:[0.4,0.36,0.26], c3:[0.02,0.16,0.36],
    atmo:[0.35,0.55,1.0], atmoS:0.9,
    desc:'温暖的海洋覆盖近乎全部表面,只有几条火山岛弧露出水面。大气含氧,洋流终年温和——殖民者在第一份勘测报告的页脚写道:"它让我们想起一本古老小说里的星球——萨拉萨。我们提议给它一个别名:新萨拉萨。"' },
  { id:'ximoon',  name:'汐月', type:'卫星殖民地', shader:'rocky',
    role:'hab', capScale:0.08, moonOf:'canglan', mdist:2.6, mspeed:0.0042,
    unlock:[ {planetLv:{id:'canglan', lv:4}} ],
    radius:0.27, orbitR:0, period:0, tilt:0.0, habit:0.60, au:1.0,
    seed:99.3, c1:[0.5,0.5,0.54], c2:[0.7,0.7,0.73], c3:[0.28,0.28,0.32],
    atmo:[0.6,0.65,0.8], atmoS:0.08,
    desc:'沧澜唯一的天然卫星,潮汐锁定。近沧澜面是整个星系最好的观景地——也是最理想的低重力船坞与中转港。当母星的工业成熟到殖民地规模,在这里铺设穹顶只是时间问题。' },
  { id:'chimao',  name:'赤峁', type:'荒漠行星', shader:'rocky',
    role:'hab', capScale:0.35,
    unlock:[ {story:1} ],
    radius:0.55, orbitR:40,  period:108, tilt:0.44, habit:0.80, au:1.52,
    seed:21.8, c1:[0.6,0.32,0.18], c2:[0.78,0.5,0.3], c3:[0.4,0.2,0.13],
    atmo:[0.9,0.55,0.35], atmoS:0.35, polarIce:true,
    decoMoons:[ {r:0.08, dist:1.05, speed:0.012, incl:0.2} ],
    desc:'锈红色的干燥世界,稀薄大气与极地冰冠暗示曾有海洋。穹顶城市与地下冰层使其成为第二居住地——「晨昏号」的工程团队苏醒后,首先勘定的就是这里。' },
  { id:'juxiao',  name:'巨霄', type:'气态巨行星', shader:'gas',
    role:'res', res:{ key:'he3', rich:1.6 },
    unlock:[ {story:4}, {sumRole:{role:'res', lv:2}} ],
    radius:3.1,  orbitR:58,  period:210, tilt:0.05, habit:0.25, au:5.2,
    seed:31.2, c1:[0.72,0.55,0.4], c2:[0.88,0.78,0.62], c3:[0.5,0.33,0.25],
    atmo:[0.95,0.8,0.6], atmoS:0.45, bandFreq:9.0,
    decoMoons:[ {r:0.16, dist:5.4, speed:0.006, incl:0.1}, {r:0.12, dist:6.6, speed:0.0042, incl:-0.14}, {r:0.1, dist:7.8, speed:0.003, incl:0.05} ],
    desc:'本星系质量最大的行星,氢氦风暴层深不见底。轨道气矿持续抽取氦-3——知道母星已逝之后,能源自立不再是选项,而是义务。' },
  { id:'huanmian',name:'环冕', type:'环带巨行星', shader:'gas',
    role:'res', res:{ key:'ice', rich:1.1 },
    unlock:[ {story:5}, {est:'chimao'} ],
    radius:2.6,  orbitR:76,  period:340, tilt:0.46, habit:0.25, au:9.5,
    seed:44.6, c1:[0.78,0.7,0.52], c2:[0.9,0.84,0.68], c3:[0.62,0.52,0.38],
    atmo:[0.95,0.88,0.7], atmoS:0.4, bandFreq:7.0, hasRings:true,
    decoMoons:[ {r:0.13, dist:8.4, speed:0.0045, incl:0.12}, {r:0.09, dist:9.8, speed:0.0032, incl:-0.08} ],
    desc:'壮丽的冰环系统延伸数十万公里,环内富含水冰与硅酸盐。赤峁的穹顶农场要扩张,就需要稳定的水冰航线——采冰船无需着陆即可装载。' },
  { id:'linyuan', name:'凛渊', type:'冰巨星', shader:'ice',
    role:'res', res:{ key:'deut', rich:1.0 },
    unlock:[ {story:3} ],
    radius:1.7,  orbitR:92,  period:520, tilt:0.71, habit:0.35, au:19.2,
    seed:58.3, c1:[0.25,0.45,0.75], c2:[0.5,0.72,0.92], c3:[0.15,0.28,0.55],
    atmo:[0.45,0.65,1.0], atmoS:0.55, bandFreq:5.0,
    decoMoons:[ {r:0.11, dist:3.4, speed:0.005, incl:0.3} ],
    desc:'幽蓝的冰冷世界,甲烷大气下是超临界水与氨的海洋。「冰下之声」事件后,议会批准了前哨建设——既为氘,也为离它近一点。' },
];

/* ============================================================
   程序化行星生成 — 其余 9 个星系
   同一星系永远生成相同结果(种子取自星系 id)
   ============================================================ */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PAL = {
  rocky: [
    { c1:[0.6,0.32,0.18], c2:[0.78,0.5,0.3],  c3:[0.4,0.2,0.13],  atmo:[0.9,0.55,0.35] },
    { c1:[0.45,0.42,0.4], c2:[0.66,0.63,0.58], c3:[0.24,0.22,0.21], atmo:[0.6,0.62,0.7] },
    { c1:[0.5,0.38,0.52], c2:[0.7,0.55,0.68], c3:[0.27,0.2,0.3],  atmo:[0.7,0.5,0.85] },
    { c1:[0.55,0.45,0.28],c2:[0.75,0.65,0.4], c3:[0.3,0.24,0.15], atmo:[0.85,0.7,0.4] },
  ],
  terra: [
    { c1:[0.1,0.38,0.16], c2:[0.4,0.36,0.26], c3:[0.02,0.16,0.36], atmo:[0.35,0.55,1.0] },
    { c1:[0.16,0.42,0.2], c2:[0.5,0.45,0.28], c3:[0.03,0.2,0.3],  atmo:[0.4,0.65,0.95] },
  ],
  gas: [
    { c1:[0.72,0.55,0.4], c2:[0.88,0.78,0.62], c3:[0.5,0.33,0.25], atmo:[0.95,0.8,0.6] },
    { c1:[0.55,0.4,0.55], c2:[0.78,0.65,0.8], c3:[0.35,0.22,0.4], atmo:[0.8,0.6,0.95] },
    { c1:[0.65,0.5,0.3],  c2:[0.85,0.72,0.5], c3:[0.42,0.3,0.18], atmo:[0.9,0.75,0.5] },
  ],
  ice: [
    { c1:[0.25,0.45,0.75],c2:[0.5,0.72,0.92], c3:[0.15,0.28,0.55], atmo:[0.45,0.65,1.0] },
    { c1:[0.3,0.55,0.6],  c2:[0.55,0.8,0.82], c3:[0.18,0.35,0.42], atmo:[0.5,0.8,0.9] },
  ],
  venus: [
    { c1:[0.85,0.72,0.5], c2:[0.95,0.85,0.62], c3:[0.6,0.48,0.34], atmo:[1.0,0.85,0.55] },
    { c1:[0.8,0.6,0.4],   c2:[0.92,0.78,0.55], c3:[0.55,0.4,0.28], atmo:[1.0,0.75,0.45] },
  ],
};
const TYPE_NAMES = { rocky:'岩石行星', terra:'类地行星', gas:'气态巨行星', ice:'冰巨星', venus:'温室行星' };
const ROMAN = ['I','II','III','IV','V','VI'];

const GEN_DESC = {
  hab: [
    '自动勘测船的报告只有一行加粗:可呼吸大气概率高。殖民许可的印章几乎是烫着盖上去的。',
    '陆地与浅海的比例近乎理想,极冠规整。档案备注:适合作为本星系的居住核心。',
    '重力与昼夜节律都对人类友好。先遣队在登陆点留下的第一件东西,是一面手缝的旗。',
  ],
  res: [
    '无人采集阵列可直接部署。矿脉品位曲线在报告里画出了一道令人愉快的陡坡。',
    '轨道光谱扫描显示资源富集层接近地表,开采窗口期长,是远征航线上的优质补给点。',
    '环境对人类并不友好,但对机器刚刚好。前哨的灯火将是这里第一次出现的人造光。',
  ],
};

function genPlanets(sys){
  const rng = mulberry32(hashStr(sys.id));
  const n = sys.n[0] + Math.floor(rng() * (sys.n[1] - sys.n[0] + 1));
  const out = [];
  let orbit = 14 + rng() * 6;
  const RESKEYS = Object.keys(RESOURCES);
  for (let i = 0; i < n; i++){
    orbit += 9 + rng() * 9;
    // 行星类型权重:内圈偏岩石/温室,外圈偏气态/冰
    const t = rng(), inner = i / Math.max(1, n - 1);
    let shader;
    if (inner < 0.45) shader = t < 0.5 ? 'rocky' : (t < 0.75 ? 'venus' : 'terra');
    else shader = t < 0.42 ? 'gas' : (t < 0.75 ? 'ice' : 'rocky');
    if (sys.bias === 'hab' && i <= 1 && rng() < 0.65) shader = 'terra';

    // 角色:类地 → 居住;岩石 → 居住/资源;其余 → 资源
    let role, res = null, capScale = 0, habit;
    if (shader === 'terra'){ role = 'hab'; habit = 0.8 + rng()*0.2; capScale = 0.5 + rng()*0.5; }
    else if (shader === 'rocky' && rng() < 0.45){ role = 'hab'; habit = 0.4 + rng()*0.35; capScale = 0.15 + rng()*0.3; }
    else {
      role = 'res';
      habit = 0.2 + rng()*0.25;
      // 资源种类与行星类型匹配:气态出气体燃料,冰巨出冰/氘,岩石出金属
      const allowed = shader === 'gas' ? ['he3','chem']
        : shader === 'ice' ? ['ice','deut']
        : shader === 'venus' ? ['chem']
        : ['metal','metal','ice'];
      let key;
      if (sys.bias && sys.bias !== 'hab' && allowed.includes(sys.bias) && rng() < 0.7) key = sys.bias;
      else key = allowed[Math.floor(rng()*allowed.length)];
      res = { key, rich: +(sys.rich * (0.8 + rng()*0.7)).toFixed(2) };
    }

    const pals = PAL[shader];
    const pal = pals[Math.floor(rng()*pals.length)];
    const jit = a => a.map(v => Math.min(1, Math.max(0, v + (rng()-0.5)*0.12)));
    const radius = shader==='gas' ? 1.8+rng()*1.4 : shader==='ice' ? 1.2+rng()*0.8 : shader==='terra' ? 0.55+rng()*0.85 : 0.4+rng()*0.6;
    const p = {
      id: sys.id + '_p' + i,
      name: sys.name + ' ' + ROMAN[i],
      type: TYPE_NAMES[shader], shader,
      role, habit: +habit.toFixed(2),
      radius: +radius.toFixed(2),
      orbitR: +orbit.toFixed(1),
      period: Math.round(20 + orbit * (2.2 + rng()*2.5)),
      tilt: +(rng()*0.5).toFixed(2),
      au: +(orbit/31).toFixed(2),
      seed: +(rng()*120).toFixed(1),
      c1: jit(pal.c1), c2: jit(pal.c2), c3: jit(pal.c3),
      atmo: pal.atmo.slice(),
      atmoS: shader==='venus' ? 0.8 : shader==='terra' ? 0.85 : 0.2 + rng()*0.3,
      bandFreq: 5 + rng()*5,
      hasRings: (shader==='gas'||shader==='ice') && rng() < 0.3,
      polarIce: shader==='rocky' && rng() < 0.4,
      sea: shader==='terra' ? 0.45 + rng()*0.2 : undefined,
      arch: shader==='terra' ? rng()*0.6 : undefined,
      remote: true,   // 远征星球:建立前哨需列车驻留本星系
    };
    if (role === 'hab') p.capScale = +capScale.toFixed(2);
    else p.res = res;
    if (shader === 'gas' && rng() < 0.5)
      p.decoMoons = [ { r:0.1+rng()*0.06, dist:radius*1.8+1, speed:0.004+rng()*0.004, incl:(rng()-0.5)*0.3 } ];
    p.desc = (role==='hab' ? GEN_DESC.hab : GEN_DESC.res)[Math.floor(rng()*3) % 3]
      + (res ? `主要产出:${RESOURCES[res.key].name}。` : '');
    out.push(p);
  }
  // 保底:至少一颗资源星
  if (!out.some(p => p.role === 'res')){
    const p = out[out.length-1];
    p.role = 'res'; delete p.capScale;
    p.res = { key: sys.bias && sys.bias!=='hab' ? sys.bias : 'metal', rich: +(sys.rich).toFixed(2) };
  }
  // 保底:特产星系必有特产行星(小行星带轨道采集的设定兜底)
  if (sys.bias && sys.bias !== 'hab' && !out.some(p => p.res && p.res.key === sys.bias)){
    const t = out.filter(p => p.role === 'res').pop();
    if (t) t.res.key = sys.bias;
  }
  return out;
}

/* ── 卫星与卫星港 ──
   独立种子流 hashStr(p.key+':moons'),绝不动 genPlanets 的 rng 调用序列(改了会重写全银河);
   垦曦手作地月系(沧澜-汐月)排除,初始系统产出保持原样。
   卫星港随母星发展自动建立(第 1/2/3 颗卫星于 LV2/3/4),每港 = 小1 / 中2 / 大3 额外区划 */
const MOON_SIZES = {
  s: { name:'小型卫星', slots:1, r:0.085 },
  m: { name:'中型卫星', slots:2, r:0.13 },
  l: { name:'大型卫星', slots:3, r:0.18 },
};
const _moonCache = {};
function moonsOf(p){
  if (!p || p.moonOf || p.sysId === 'kenxi') return [];
  if (_moonCache[p.key]) return _moonCache[p.key];
  const rng = mulberry32(hashStr(p.key + ':moons'));
  const big = p.shader === 'gas' || p.shader === 'ice';
  const maxN = big ? 3 : p.shader === 'terra' ? 2 : 1;
  const pHave = big ? 0.8 : p.shader === 'terra' ? 0.55 : 0.3;
  const GREEK = ['α','β','γ'];
  const out = [];
  for (let i = 0; i < maxN; i++){
    const roll = rng();
    if (roll >= pHave * (1 - i * 0.22)) continue;
    const t = rng();
    const size = t < (big ? 0.34 : 0.58) ? 's' : t < (big ? 0.72 : 0.9) ? 'm' : 'l';
    out.push({
      id: p.id + '_m' + out.length,
      name: p.name + '-' + GREEK[out.length],
      size, slots: MOON_SIZES[size].slots,
      r: +(MOON_SIZES[size].r * (0.85 + rng() * 0.3) * Math.min(1.6, 0.7 + p.radius * 0.45)).toFixed(3),
      dist: +(p.radius * 1.9 + 0.9 + out.length * 0.8 + rng() * 0.35).toFixed(2),
      speed: +(0.0046 - out.length * 0.0009 + rng() * 0.001).toFixed(4),
      incl: +((rng() - 0.5) * 0.24).toFixed(2),
      unlockLv: Math.min(MAX_LEVEL, 4 + out.length * 3),   // 第 1/2/3 颗卫星于 LV4/7/10 建港
    });
  }
  _moonCache[p.key] = out;
  return out;
}
function activeMoonPorts(p){
  const lv = devLevel(p);
  return moonsOf(p).filter(m => lv >= m.unlockLv);
}
function moonPortSlots(p){ return activeMoonPorts(p).reduce((s, m) => s + m.slots, 0); }
/* 产出再分配:卫星 >2 颗且全部建港 → 母星 -10%;每个卫星港区划 +4% 母星基准产出。
   净效果:多卫星体系满配略高于纯行星(3 港最少 0.9+0.12=×1.02,最多 0.9+0.36=×1.26) */
function moonPortMult(p){
  const ms = moonsOf(p);
  if (!ms.length) return 1;
  const act = activeMoonPorts(p);
  const host = ms.length > 2 && act.length === ms.length ? 0.9 : 1;
  return host + act.reduce((s, m) => s + m.slots * 0.04, 0);
}

const _sysPlanets = {};
function planetsOf(sysId){
  if (_sysPlanets[sysId]) return _sysPlanets[sysId];
  const sys = sysById(sysId);
  const list = sys.handmade ? KENXI_PLANETS : genPlanets(sys);
  for (const p of list){ p.key = sysId + '/' + p.id; p.sysId = sysId; }
  _sysPlanets[sysId] = list;
  return list;
}
function allPlanets(){
  const out = [];
  for (const s of SYSTEMS) out.push(...planetsOf(s.id));
  return out;
}
function planetByKey(key){
  const sysId = key.split('/')[0];
  return planetsOf(sysId).find(p => p.key === key);
}

/* ── 星球图标 ── */
const ICONS = {
  jinyan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M5.5 9.5l4 1.5 2.5-2.5 3 2 3.5-1"/><path d="M9.5 11l-1 4M14 10.5l1.5 4.5M12 9l-.5 3"/></svg>`,
  shamu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M4.5 10c3-1.6 6-1.6 9 0s4.5 1.4 6 .4"/><path d="M4.8 14.5c2.6 1.4 5.4 1.4 8 0s4.4-1.5 6.4-.6"/></svg>`,
  canglan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><path d="M8 5.2c1.2 1.4.4 2.8-1 3.4S5 10.8 5.6 12c.7 1.4 2.6.8 3.4 2.2.7 1.2-.2 2.6-1.6 3.2"/><path d="M14.5 4.8c-.6 1.6.6 2.4 2.2 2.6 1.4.2 2.4 1 2.6 2.2"/><path d="M15 19.4c-.4-1.6.8-2.6 2.4-2.8"/></svg>`,
  chimao: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><circle cx="9" cy="9.5" r="1.7"/><circle cx="14.8" cy="13.8" r="2.3"/><circle cx="9.5" cy="15.5" r="1"/></svg>`,
  juxiao: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M4.2 9.5h15.6M4.2 14.5h7.5M16.5 14.5h3.3"/><ellipse cx="13.8" cy="14.5" rx="2.1" ry="1.3"/></svg>`,
  huanmian: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="5.6"/><path d="M3.2 14.8c2.2 1.6 6 1.4 9.8.2s7-3 7.8-4.8M3.2 14.8c-.6-1.4 1-3.2 3.4-4.6"/></svg>`,
  ximoon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M14.5 4.2A8.2 8.2 0 0 0 14.5 19.8 6.5 6.5 0 0 1 14.5 4.2z" fill="currentColor" stroke="none" opacity=".35"/><path d="M7 14.5a3 3 0 0 1 5.5-1.6"/></svg>`,
  linyuan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><path d="M12 6.5v11M7.2 9.2l9.6 5.6M16.8 9.2l-9.6 5.6"/><path d="M12 6.5l-1.4 1.6M12 6.5l1.4 1.6"/></svg>`,
};
const TYPE_ICONS = {
  rocky: ICONS.chimao, terra: ICONS.canglan, gas: ICONS.juxiao,
  ice: ICONS.linyuan, venus: ICONS.shamu,
};
const SYS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 3.5"/><circle cx="19" cy="8.5" r="1.1" fill="currentColor" stroke="none"/></svg>`;
function iconOf(d){ return ICONS[d.id] || TYPE_ICONS[d.shader] || SYS_ICON; }

/* ============================================================
   星际列车 — 车厢 / 武器 / 升级表
   武器原型来自《Interstellar Train》(2020 HDC 最佳体验奖):
   导弹井 / 激光炮 / 机关炮
   ============================================================ */
const CAR_TYPES = {
  engine:  { name:'动力车头', en:'LOCOMOTIVE', pax:1000,
    desc:'列车的核心聚变堆与曲率帆,乘务舱常驻载员 1000 人。升级引擎可提升航速并解锁更远航线;科研主机升级可提升全列科研系数。' },
  cargo:   { name:'运输车厢', en:'TRANSPORT',  cap:800, pax:1000,
    desc:'标准化双模式车厢:载货模式装载 800/节(随引擎 ×2.5/级,随车厢等级 +30%/级);可切换为载人模式(1000 人),载人时不运货。全列唯一可改装车厢。' },
  weapon:  { name:'战斗车厢', en:'COMBAT',
    desc:'装甲化武器底座,可安装 双联机关炮 / 激光炮 / 导弹井 并独立升级。纯战斗职能,不可改装。' },
  habitat: { name:'生活舱段', en:'HABITAT', cdRed:30, def:18,
    desc:'乘员轮换与医疗舱。收取冷却 -30 秒,乘员协防使列车防御 +18(随车厢等级 +30%/级)。' },
  eng:     { name:'工程舱段', en:'ENGINEERING', collectBuff:0.15,
    desc:'移动精炼线。靠站收取资源时现场提纯,收取量 +15%(随车厢等级 +30%/级)。' },
  general: { name:'通用车厢', en:'MULTIROLE', cap:200, pax:250, rp:0.02,
    desc:'四合一舱段:1/4 货运(200)+ 1/4 载人(250)+ 1/4 科研,自带一门小型机关炮(火力随车厢等级成长,不可换装)。各项固定生效、不可切换,随车厢等级 +30%/级。' },
  cryo:    { name:'休眠舱单元', en:'SEED VAULT', seed:1,
    desc:'文明火种舱:封存 1000 名深眠拓荒者与全套殖民种子库。在无人星系建立第一块殖民地时整舱消耗。一旦星系有人,后续拓荒改用随车移民。' },
  lab:     { name:'科研车厢', en:'LABORATORY', rp:0.08,
    desc:'移动实验室阵列。列车基础科研值 +0.08/s(随车厢等级 +30%/级)。' },
};

/* ── 车厢升级体系:全车厢 5 级,每级效果 +30%(工期制,影响力可加速) ── */
const CAR_MAXLV = 5;
function carUpCost(type, to){          // 升至 to 级的资源
  const base = {
    cargo:  { metal:500 },
    habitat:{ metal:400, chem:200 },
    eng:    { metal:400, ice:200 },
    cryo:   { metal:600, chem:300 },
    general:{ metal:500, he3:200 },
    lab:    { metal:500, deut:250 },
    weapon: { metal:450 },
  }[type] || { metal:500 };
  const out = {};
  for (const k in base) out[k] = Math.round(base[k] * Math.pow(2.3, to - 2));
  return out;
}
function carTime(to){ return Math.round(60 * Math.pow(1.8, to - 2)); }   // 1分 → LV5 ≈ 5.8分
function carEffOf(clv){ return 1 + 0.3 * ((clv || 1) - 1); }           // 每级 +30%

/* ── 车厢替换/车厢库:仅「有工业区划的类地行星」可替换,旧车厢存入该星 ── */
function refitCost(n){
  const base = CAR_COSTS[Math.min(8, Math.max(4, n))] || { metal:800 };
  const out = {};
  for (const k in base) out[k] = Math.round(base[k] * 0.5);
  return out;
}

/* ── 科研速率模型 ──
   速率 = (列车基础 + Σ各星球[科研区划/建筑基础 × 星球环境系数]) × 车头科研系数 × 停靠加成 */
const TRAIN_RP_BASE = 0.02;            // 列车自带基础科研
const RP_SCALE = 8;                    // 科研产出全局倍率(费用表按此校准:工期为主门槛,科研值为次门槛)
const RPCOEF_MAX = 5;                  // 车头科研主机(+20% 全局/级)
function rpcoefCost(to){
  return { metal: Math.round(800 * Math.pow(2.5, to - 1)), deut: Math.round(200 * Math.pow(2.5, to - 1)) };
}
function rpcoefTime(to){ return Math.round(90 * Math.pow(1.7, to - 1)); }
const DOCK_RP_PER_DISTRICT = 0.08;     // 停靠锚地每座科研区划(×环境系数)→ 产出与工期 +8%
const DOCK_RP_CAP = 0.6;               // 停靠加成上限 +60%

/* ── 人口迁移 / 殖民 / 弹药 / 乘员维护 ── */
const MIG_CAP_RATIO  = 0.2;       // 可迁移人口池上限 = 当前人口 20%
const MIG_RATE_RATIO = 0.02;      // 每 1 分钟补充 当前人口 2%(10 分钟从空到满)
const MIG_STEP_MS    = 60000;     // 池刷新周期 1 分钟
const ESTABLISH_COLONISTS = 1000; // 建立前哨需随车移民数
const AMMO_PER_GUN = 30;          // 每门武器弹药基数(军事区停靠补满)
const AMMO_PER_CLV = 10;          // 战斗车厢每级 +10 容量(与武器耗弹成长对齐)
const AMMO_COST = { autogun:1, twin:2, laser:3, missile:4 };   // 武器越强耗弹越多
const CREW_BASE = 3;              // 基础乘员组(每组维护 2 节车厢,过半数方可运行)
const LOCAL_T_MIN = 5, LOCAL_T_MAX = 30;   // 星系内停靠转移耗时(秒)

/* ── 星港经济:影响力收入 / 星港 / 贸易线 / 资源仓 ── */
const INF_DOCK_HAB   = 0.2;  // 每座居住区划 0.2 影响力/分(常驻产出,停靠锚地 ×1.5)
const INF_DOCK_TRADE = 1;    // 每座商贸区划 1 影响力/分
const INF_LINE_PER_MIN = 0.5;// 每条运行中的贸易线 0.5 影响力/分(每 2 分钟 1 点)

const STARPORT_TIME = 240;   // 星港工期 4 分钟(独立建筑,不占区划)
function starportCost(nth){  // 第 N 座星港成本 +20%/座(100%/120%/140%…)
  const base = { metal: 4000, chem: 1200 };
  const out = {};
  for (const k in base) out[k] = Math.round(base[k] * (1 + 0.2 * (nth - 1)));
  return out;
}
const LINE_COST = { metal: 1200, chem: 300 };   // 建一条贸易线
const SHIPS_PER_LANE = 2;                 // 每条航道 2 艘货轮
function dockUpCost(lv){ return { metal: Math.round(5e3 * Math.pow(2.2, lv - 2)) }; }   // 星港船坞(统一容量升级)

/* ── 星门物流港:作用圈收集 + 圈内接力输送(范围 ≤ GATE_RANGE 的圆) ──
   地疤中期解锁,仅垦曦门自动建成(作用圈覆盖周边近域);远域自建接力节点
   每门三开关:收集圈内资源星产出 / 输送目标星门 / 本地分发(终点卸货)
   货船 5 级 ↔ 引擎 LV6-10 的升级需求(每级吞吐 ×2);speed=班次周期 store=枢纽仓容 */
const GATE_COST = { metal:3e4, chem:9e3, he3:3e3 };   // 后期自动化的门票
const GATE_TIME = 420;                               // 建造工期(秒)
const GATE_MAXLV = 5;
const GATE_RANGE = 30;                               // 作用圈半径:收集范围 = 单跳输送上限(银河边缘必须接力)
const GATE_AUTO = ['kenxi'];   // 解锁时仅母港星系自动建成(作用圈已覆盖四邻)
function gateUpCost(branch, lv){
  const base = { speed:{metal:8e4, he3:2e4}, line:{metal:1e5, ice:3e4}, store:{metal:1.2e5, chem:4e4} }[branch];
  const out = {};
  for (const k in base) out[k] = Math.round(base[k] * Math.pow(2.2, lv - 2));
  return out;
}
function gateCycleSec(g){ return Math.round(180 * Math.pow(0.85, (g.speedLv || 1) - 1)); }   // 班次 180s → 94s
function gateBatch(g){ return 150 * Math.pow(2, (g.lineLv || 1) - 1); }                      // 货船等级:150→2400/班/资源
function gateHubCap(g){ return 1e5 * Math.pow(2, (g.storeLv || 1) - 1); }                    // 枢纽仓容/每资源
function lineUpCost(lv){ return { metal: Math.round(800 * Math.pow(2, lv - 1)) }; }
const SHIP_CAP = 100;        // 货船容量 100 × 线路等级(线路等级 ≤ 车头等级)
const SHIP_HANDLING = 40;    // 每周期装卸耗时(秒)

/* 类地化改造:仅「标准带」星球可改造(严酷星球无法改造),巨量资源 + 后期门槛 */
const TERRAFORM_COST = { metal:1.2e5, chem:4e4, ice:5e4, deut:2.5e4 };   // 终局工程
const TERRAFORM_REQ  = { lv:14, civ:18 };   // 「改造纪元」起可类地化

/* ── 船官(Sunless Sea 式,测试版):3 个在岗槽位,任务解锁 + 随机招募 ──
   姓名全英文(虚构,避开历史人物),绰号中文;数值对齐当前数值层(科技每级 +8-12% 量级) */
const OFFICER_SLOTS = 3;
const OFFICERS = {
  vance:     { nick:'「铁手」',   name:'Vance',     role:'炮术长',   fx:{ dmg:0.12 },      desc:'全武器伤害 +12% —— 他校炮不用仪器,用耳朵。' },
  mercer:    { nick:'「保险丝」', name:'Mercer',    role:'军械师',   fx:{ ammo:0.25 },     desc:'弹药容量 +25% —— 弹药库被她重新排过,连缝隙里都是弹链。' },
  quinn:     { nick:'「顺风」',   name:'Quinn',     role:'领航员',   fx:{ speed:0.15 },    desc:'列车航速 +15% —— 他说星图是死的,航线是活的。' },
  holloway:  { nick:'「斗篷」',   name:'Holloway',  role:'打捞长',   fx:{ loot:0.20 },     desc:'战利品 +20% —— 残骸还没冷下来,他的钩索已经搭上去了。' },
  lindqvist: { nick:'「白鸦」',   name:'Lindqvist', role:'科学官',   fx:{ rp:0.15 },       desc:'科研速率 +15% —— 她的报告永远比深空信号早到一步。' },
  okafor:    { nick:'「锚链」',   name:'Okafor',    role:'司货长',   fx:{ cargo:0.18 },    desc:'货舱容量 +18% —— 他装的货,卸货的人找不到缝。' },
  reyes:     { nick:'「人望」',   name:'Reyes',     role:'政务官',   fx:{ inf:0.20 },      desc:'影响力产出 +20% —— 每个停靠港都有人欠她一份人情。' },
  bellamy:   { nick:'「摆渡人」', name:'Bellamy',   role:'乘务长',   fx:{ boardSec:2 },    desc:'装载移民 -2 秒 —— 他记得每一位乘客上车时的表情。' },
  moreau:    { nick:'「绿拇指」', name:'Moreau',    role:'生态学家', fx:{ dev:0.10 },      desc:'全行星开发增速 +10% —— 她在驾驶室窗台上种活了一株地球薄荷。' },
  ashford:   { nick:'「碎星」',   name:'Ashford',   role:'攻坚专家', fx:{ siege:0.25 },    desc:'对基地/旗舰伤害 +25% —— 他只对打不动的东西感兴趣。' },
  voss:      { nick:'「快门」',   name:'Voss',      role:'收取调度', fx:{ cd:0.20 },       desc:'收取冷却 -20% —— 她合上舱门的速度比快门还快。' },
  carter:    { nick:'「夜班」',   name:'Carter',    role:'总工程师', fx:{ hp:0.15 },       desc:'战斗车厢耐久 +15% —— 凌晨三点,焊枪的光是列车的第二盏灯。' },
};
/* 任务解锁:主线/支线/港线/地疤里程碑 → 指定船官;其余进入随机招募池(战斗胜利 8% / 首访新星系 15%) */
const OFFICER_STORY = { 5:'quinn', 9:'vance', 14:'okafor', 22:'reyes' };
const OFFICER_SIDE_DONE = 'lindqvist';
const OFFICER_PORT_DONE = 'bellamy';
const OFFICER_SCAR = { 30:'moreau', 90:'ashford' };
const OFFICER_RANDOM_POOL = ['mercer', 'holloway', 'voss', 'carter'];
function officerFx(){
  const fx = { dmg:0, ammo:0, speed:0, loot:0, rp:0, cargo:0, inf:0, boardSec:0, dev:0, siege:0, cd:0, hp:0 };
  const act = (save.officers && save.officers.active) || [];
  for (const id of act){
    const o = OFFICERS[id];
    if (!o) continue;
    for (const k in o.fx) fx[k] += o.fx[k];
  }
  return fx;
}
function unlockOfficer(id, how){
  if (!OFFICERS[id] || !save.officers) return false;
  if (save.officers.owned.includes(id)) return false;
  save.officers.owned.push(id);
  const o = OFFICERS[id];
  setTimeout(() => showToast(`👤 船官入列:<b>${o.nick}${o.name}</b>(${o.role})—— ${o.desc.split(' —— ')[0]};列车面板可安排上岗(${how})`, { sfx:'unlock', say:'New officer aboard.' }), 1000);
  persistSave();
  return true;
}
/* ── 具名武器(战利品,不可建造):装在战斗车厢上,乘算火力 ──
   督军池:督军击杀必掉(未拥有的随机一件);巢穴核心 35% 掉督军池;Boss 首杀必掉专属 */
const UNIQUE_WEAPONS = {
  cutthroat:     { name:'「割喉」连射机关炮', base:'twin',    mult:1.35, src:'海盗督军',
    desc:'督军旗舰的主炮,膛线里还卡着上一个目标的合金碎屑。' },
  blacktide:     { name:'「黑潮」海盗激光阵', base:'laser',   mult:1.35, src:'海盗督军',
    desc:'走私改装的聚束阵列,光束发暗紫色 —— 不符合任何安全规范。' },
  rockking:      { name:'「碎石王」集束导弹', base:'missile', mult:1.40, src:'海盗督军',
    desc:'弹头里填的是带放射性的小行星碎屑,海盗们叫它"会回家的陨石"。' },
  rustfang:      { name:'「锈鲸之牙」重型机关炮', base:'twin',    mult:1.60, src:'劫掠王「锈鲸」',
    desc:'从锈鲸残骸上整根拆下的舰首炮,牙痕一样的弹痕排成阵列。' },
  platformlight: { name:'「站台之光」脊柱激光', base:'laser',   mult:1.60, src:'第一站台守望者',
    desc:'守望者脊柱轨道炮的聚焦段,启动时整列车厢的灯光会暗一拍。' },
  nexttrain:     { name:'「下一班车」相位导弹', base:'missile', mult:1.65, src:'环卫者',
    desc:'弹体会在命中前一瞬相位消失,然后从目标内部出现。没人解释得了。' },
};
const WARLORD_POOL = ['cutthroat', 'blacktide', 'rockking'];
const BOSS_WEAPON = { outremer:'rustfang', hengyao:'platformlight', terminus:'nexttrain' };
const WEAPONS = {
  autogun: { name:'机关炮', en:'AUTOMATIC GUN', fp:20,
    desc:'高射速弹幕武器,可靠的近程防御网。通用车厢集成武装(火力随车厢等级成长)。',
    unlock:null, base:{ metal:300 } },
  twin:    { name:'双联机关炮', en:'TWIN AUTOGUN', fp:36,
    desc:'双联装弹幕炮塔,战斗车厢专属。两倍射速编织出近乎不透风的弹幕网。',
    unlock:null, base:{ metal:550 } },
  laser:   { name:'激光炮', en:'LASER CANNON', fp:38,
    desc:'高伤害定向能武器,需要充能间隙。射线在尘埃带里会划出一条笔直的霞光。',
    unlock:{ planet:'kenxi/jinyan', lv:5, text:'烬岩 达到「自治市」(稀有金属工业)' },
    base:{ metal:1500, he3:400 } },
  missile: { name:'导弹井', en:'MISSILE LAUNCHER', fp:58,
    desc:'垂直发射井,追踪导弹造成大范围杀伤。可锁定攻击多个目标。',
    unlock:{ planet:'kenxi/shamu', lv:5, text:'纱幕 达到「自治市」(化合物推进剂)' },
    base:{ metal:900, chem:1200 } },
};
const WEAPON_MAXLV = 5;
function weaponCost(wid, lv){          // 升到 lv 级的花费(lv1 = 安装);弹药工厂提供折扣
  const base = WEAPONS[wid].base, out = {};
  const disc = (typeof COLONY_FX !== 'undefined') ? COLONY_FX.wcost : 1;
  for (const k in base) out[k] = Math.round(base[k] * Math.pow(2.5, lv - 1) * disc);
  return out;
}

/* 车厢槽位:由全银河殖民等级和决定 —— 殖民地发展拓展列车节数 */
function slotsByDev(sumAll){ return Math.min(8, 3 + Math.floor(sumAll / 20)); }
const SLOT_RULE_TEXT = '全银河星球开发等级和每 +20,列车可挂载车厢 +1(上限 8 节)';

/* 主线赠送火种舱:读完第 N 章送 1 节(防止引擎 LV5 前无法殖民新星系) */
const CRYO_GIFTS = { 4:1, 11:1, 19:1 };
/* 车厢解锁链:开局 货运/通用/战斗;科研 LV2 → 工程 LV3 → 生活(医疗)LV4 → 休眠舱 LV5 */
const CAR_UNLOCK = { cargo:1, general:1, weapon:1, lab:2, eng:3, habitat:4, cryo:5 };
const CAR_BUILD_TIME = 180;        // 建造入库工期(秒)
/* ── 车厢科技(方案 B):升级按类型研发,消耗科研值,完成后全列同类型车厢自动改装 ── */
const CAR_TECH_RP   = { 2:250, 3:700, 4:2000, 5:5500 };        // 研发科研值(全类型统一,类型差异在建造资源)
const CAR_TECH_TIME = { 2:90, 3:180, 4:400, 5:900 };           // 研发工期(秒):1.5分→15分,走研发槽不占工程槽
function carTechCost(to){ return CAR_TECH_RP[to] || 1e9; }
function carTechTime(to){ return CAR_TECH_TIME[to] || 3600; }
function carBuildCost(type, lv){   // 建造入库:按类型计价 × 等级乘数(玩家可选级,高级车贵)
  const base = {
    cargo:  { metal:1200 },
    weapon: { metal:1500, chem:400 },
    general:{ metal:1800, chem:500 },
    lab:    { metal:2200, deut:300 },
    eng:    { metal:2000, ice:500 },
    habitat:{ metal:2400, chem:800 },
    cryo:   { metal:3000, chem:1000, ice:400 },
  }[type] || { metal:1500 };
  const m = Math.pow(1.8, (lv || 1) - 1);
  const out = {};
  for (const k in base) out[k] = Math.round(base[k] * m);
  return out;
}
function carBuildTime(lv){ return Math.round(CAR_BUILD_TIME * Math.pow(1.4, (lv || 1) - 1)); }
/* 新购车厢花费(按购入后的总节数) */
const CAR_COSTS = {
  4: { metal:600 },
  5: { metal:2.4e3, chem:800 },
  6: { metal:8e3,   ice:2.5e3 },
  7: { metal:2e4,   he3:6e3 },
  8: { metal:5e4,   deut:1.5e4 },
};

/* 引擎升级(LV6+ 解锁深空扩展星系) */
const ENGINE_MAXLV = 10;
/* 成本锚定货舱:升至 LV(n) 的主资源 ≈ 当级货舱 1.5-2 趟运载量 */
const ENGINE_COSTS = {
  2:  { metal:800 },
  3:  { metal:2.5e3, ice:800 },
  4:  { metal:6e3,   he3:1.5e3 },
  5:  { metal:1.4e4, deut:3.5e3 },
  6:  { metal:3e4,   he3:1e4 },
  7:  { metal:6e4,   ice:2e4 },
  8:  { metal:1.2e5, chem:4e4 },
  9:  { metal:2.4e5, deut:8e4 },
  10: { metal:5e5,   he3:1.2e5, deut:6e4 },
};
function engineSpeed(lv){ return 6.0 * (1 + 0.6 * (lv - 1)); }   // 银河单位 / 分钟(全银河布局尺度)

/* 收取冷却(秒)—— 象征性节流;真正的节流是货舱容量与产量积累 */
const COLLECT_CD_BASE = 45;

/* ============================================================
   殖民区划与建筑 — 殖民地深度玩法
   区划:圈定在星球表面的功能分区,随开发等级自动开辟(LV n = n 个区划位)
   建筑:图鉴列表,条件满足后在对应区划内自动排队建造
   列车驻留本星系 = 商贸加速(建设 ×2);注资可立即完工
   ============================================================ */
const DISTRICT_MAX = 20;           // 区划位绝对上限(宜居星球满级)
const BUILDS_PER_DISTRICT = 2;     // 每个区划容纳建筑数

/* ── 区划图标(穹顶/齿轮/盾徽/烧瓶/集装箱,stroke 继承 color) ── */
const DIST_ICONS = {
  habitation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16a7.5 7.5 0 0 1 15 0"/><path d="M3 16h18M9.5 16v-3.5h5V16"/><path d="M12 5.5V8.5M8 6.8l1 2.4M16 6.8l-1 2.4"/></svg>`,
  industry:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 5V7.4M12 16.6V19M5 12h2.4M16.6 12H19M7 7l1.7 1.7M15.3 15.3L17 17M17 7l-1.7 1.7M8.7 15.3L7 17"/></svg>`,
  arsenal:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 2.8v5.4c0 4.6-3.2 7.7-7 9.8-3.8-2.1-7-5.2-7-9.8V5.8z"/><path d="M12 8v5M9.5 10.5h5"/></svg>`,
  research:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5v5.6l-5.2 9a1.8 1.8 0 0 0 1.6 2.7h11.2a1.8 1.8 0 0 0 1.6-2.7L14 9.1V3.5"/><path d="M8.5 3.5h7M8.2 14.5h7.6"/></svg>`,
  trade:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h12.5L13.8 6.8M20 14.5H7.5l2.7 2.7"/><circle cx="19" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="14.5" r="1" fill="currentColor" stroke="none"/></svg>`,
};

/* 区划环境美术:键 = '<区划>_<星球shader>',列在此表的用环境专属图,否则回退 dist_<区划>.jpg。
   随 A01 批次生成逐步补全(目标 5 区划 × 5 星型 = 25)。 */
const DIST_ENV_ART = new Set([
  'habitation_ice','industry_ice','arsenal_ice','research_ice','trade_ice',
  'habitation_terra','industry_terra','arsenal_terra','research_terra','trade_terra',
  'habitation_rocky','industry_rocky','arsenal_rocky','research_rocky','trade_rocky',
  'habitation_gas','industry_gas','arsenal_gas','research_gas','trade_gas',
  'habitation_venus','industry_venus','arsenal_venus','research_venus','trade_venus',
]);
const DISTRICT_TYPES = {
  habitation: { name:'民生区', color:'#3ecf8e', col3:[0.24,0.81,0.56], investRes:'chem',
    desc:'居住穹顶与生活设施 · 区划本身:本星人口上限 +4%' },
  industry:   { name:'工业区', color:'#f59e0b', col3:[0.96,0.62,0.04], investRes:'ice',
    desc:'采掘与精炼集群 · 区划本身:本星产率 +4%' },
  arsenal:    { name:'军工区', color:'#ef4444', col3:[0.94,0.27,0.27], investRes:'he3',
    desc:'军事工业带 · 区划本身:列车防御 +2' },
  research:   { name:'科研区', color:'#22d3ee', col3:[0.13,0.83,0.93], investRes:'deut',
    desc:'实验室阵列 · 区划本身:文明指数 +0.05' },
  trade:      { name:'商贸区', color:'#8b5cf6', col3:[0.55,0.36,0.96], investRes:null,
    desc:'星港与市场 · 区划本身:列车收取量 +2%' },
};
/* 区划固有加成(建成即生效,同类可叠加,× 环境效率系数)
   rp = 科研值产率(/秒);民生区承载走 POP_CAP_PER_HAB,不在此表 */
const DISTRICT_FX = {
  industry:   { prod:0.12 },
  arsenal:    { def:2 },
  research:   { civ:0.05, rp:0.05 },
  trade:      { amt:0.02 },
};

/* ── 列车研发(科研值驱动的永久科技) ── */
/* 科技上限 10 级;费用 ×2.2/级,工期 ×2.6/级(LV1 1分 → LV5 46分 → LV10 ≈ 3.8天)
   与科研速率匹配:开局 ~0.1/s 十几分钟出第一个科技;
   中期(科研车厢+科研星)~0.5-1/s 撑 LV5-7;后期(严酷科研网+主机)3-5/s 消化 LV8-10 */
const TRAIN_TECHS = {
  armor: { name:'复合装甲', max:10, base:80,  desc:'战斗中车厢耐久 +12% / 级' },
  fire:  { name:'火控算法', max:10, base:80,  desc:'武器伤害 +8% / 级' },
  warp:  { name:'曲率精调', max:10, base:100, desc:'列车航速 +10% / 级' },
  logi:  { name:'物流调度', max:10, base:60,  desc:'收取冷却 -8% / 级' },
  cmd:   { name:'指挥链路', max:3,  base:400, desc:'遭遇战指挥点 +1 / 级' },
};
function techCost(id, lv){ return Math.round(TRAIN_TECHS[id].base * Math.pow(1.9, lv - 1)); }

/* ── 升级耗时(分钟级,主动游玩节奏)+ 影响力加速 ── */
function techTime(lv){   return Math.round(40 * Math.pow(1.65, lv - 1)); }  // 40秒 → LV5 5分 → LV10 ≈ 60分
function weaponTime(lv){ return Math.round(45 * Math.pow(2,   lv - 1)); }   // 45秒 → LV5 12分
function engineTime(lv){ return Math.round(60 * Math.pow(1.55, lv - 2)); }  // LV2 1分 → LV10 ≈ 33分
const ACCEL_INF_PER_MIN = 1;       // (旧线性系数,保留兼容)
/* 影响力加速定价:超线性 —— 小工程便宜,大工程(天级科技)昂贵,防止后期影响力收入碾压一切工期 */
function infRushCost(sec){
  const m = Math.max(1, Math.ceil(sec / 60));
  return Math.ceil(m + m * m / 240);
}

/* ── 影响力:来自剧情抉择 / 开拓殖民 / 物流运输 / 战斗胜利 / 任务(预留)
   用途:远程加速殖民地建设、科技与升级工期 ── */
const INF_FX = {
  establish: 15,    // 建立殖民地
  firstVisit: 10,   // 首探星系
  collect: 2,       // 收取资源
  settlePer1k: 1,   // 每落户 1000 移民
  victory: 5,       // 遭遇战胜利
  structure: 1,     // 区划/建筑竣工
};
/* 环境分级:决定区划类型准入与效率(区划数量另由星球类型+大小决定,见 maxSlotsOf)
   类地行星 16–36 格(按大小);标准带(火星类/温室等)5–10 格,可类地化改造至类地档;
   严酷星球 1–3 格、无法改造,但区划效率 ×3 —— 单格工业/科研产出冠绝全银河
   卫星:天然军事要冲 —— 军工权重大幅提高 */
const ENV_TIERS = [
  { th:0.35, name:'严酷', note:'无人化作业 · 1–3 格 · 无法改造 · 区划效率 ×3', mult:3   },
  { th:0.6,  name:'艰苦', note:'轮换驻员,不建民生 · 区划效率 ×1.5',           mult:1.5 },
  { th:9,    name:'宜居', note:'全类型区划可开辟',                              mult:1   },
];

/* 建筑图鉴:cond = 解锁条件;fx = 效果
   fx 键:cap 本星人口上限 / prod 本星产率 / amt 收取量 / cargo 货舱
          wcost 武器费率 / ecost 引擎费率 / cd 收取冷却减秒 / loot 战利品
          civ 文明指数 / def 列车防御 / crew 可招募乘员(车组系统预留) */
const BUILDINGS = {
  /* 民生区 */
  dome:       { name:'穹顶居住群',   district:'habitation', time:120, cost:{metal:250, chem:100},
    cond:{role:'hab', lv:4}, fx:{cap:0.15},  desc:'本星人口承载 +15%' },
  medbay:     { name:'再生医疗中心', district:'habitation', time:180, cost:{metal:400, chem:200},
    cond:{role:'hab', lv:7}, fx:{cap:0.12},  desc:'本星人口承载 +12%' },
  academy:    { name:'乘员训练营',   district:'habitation', time:240, cost:{metal:500, chem:150},
    cond:{lv:7, civ:8},      fx:{crew:1},    desc:'培养 1 组列车乘员(每组可维护 2 节车厢)' },
  /* 工业区 */
  mine:       { name:'自动化矿场',   district:'industry', time:120, cost:{metal:300},
    cond:{role:'res', lv:4}, fx:{prod:0.15}, desc:'本星资源产率 +15%' },
  refinery:   { name:'行星精炼厂',   district:'industry', time:180, cost:{metal:500, ice:150},
    cond:{role:'res', lv:7}, fx:{amt:0.08},  desc:'列车收取量 +8%(全银河)' },
  elevator:   { name:'轨道电梯',     district:'industry', time:300, cost:{metal:900, he3:200},
    cond:{lv:11},             fx:{cargo:0.10},desc:'列车货舱容量 +10%(全银河)' },
  /* 军工区 */
  ammo:       { name:'弹药联合工厂', district:'arsenal', time:120, cost:{metal:400, chem:150},
    cond:{lv:11},             fx:{wcost:0.12},desc:'武器安装/升级费 -12%(可叠加,下限 50%)' },
  foundry:    { name:'聚变弹头铸造坊', district:'arsenal', time:180, cost:{metal:500, he3:150},
    cond:{lv:7},             fx:{loot:0.10}, desc:'遭遇战战利品 +10%' },
  fortress:   { name:'轨道防御平台', district:'arsenal', time:300, cost:{metal:900, deut:150},
    cond:{lv:11},             fx:{def:10},    desc:'列车防御 +10(全银河)' },
  /* 科研区 */
  observatory:{ name:'深空天文台',   district:'research', time:120, cost:{metal:400, deut:100},
    cond:{lv:11},             fx:{civ:0.15, rp:0.05},  desc:'文明指数 +0.15 · 科研值 +0.05/s' },
  enginst:    { name:'引擎研究所',   district:'research', time:240, cost:{metal:600, ice:200},
    cond:{lv:7},             fx:{ecost:0.10},desc:'引擎升级费 -10%(可叠加,下限 50%)' },
  lab:        { name:'量子实验室',   district:'research', time:300, cost:{metal:900, deut:250},
    cond:{lv:11, civ:10},     fx:{civ:0.30, rp:0.15},  desc:'文明指数 +0.30 · 科研值 +0.15/s' },
  /* 商贸区 */
  port:       { name:'自由贸易港',   district:'trade', time:120, cost:{metal:400},
    cond:{lv:11},             fx:{cd:15},     desc:'收取冷却 -15 秒(全银河)' },
  bazaar:     { name:'星港集市',     district:'trade', time:180, cost:{metal:500, chem:150},
    cond:{lv:7},             fx:{amt:0.08},  desc:'列车收取量 +8%(全银河)' },
  clearing:   { name:'星际清算所',   district:'trade', time:300, cost:{metal:900, he3:150},
    cond:{lv:11, civ:12},     fx:{loot:0.10, civ:0.10}, desc:'战利品 +10% · 文明指数 +0.10' },
};

/* ============================================================
   列车遭遇战 — 回合制自走棋(部署指令 → 自动结算)
   敌方会针对性攻击车厢:炮塔 / 车头引擎 / 随机
   ============================================================ */
const CAR_HP = { engine:130, cargo:75, weapon:85, habitat:95, eng:80, general:80, cryo:90, lab:80 };

const ENEMY_TYPES = {
  raider:  { name:'掠袭艇',   hp:46,  atk:13, prefer:null,     icon:'◢', desc:'机动袭扰,攻击随机车厢' },
  breaker: { name:'破城炮舰', hp:100, atk:21, prefer:'weapon', icon:'▣', desc:'重炮平台,优先轰击炮塔' },
  driller: { name:'钻头舱',   hp:72,  atk:15, prefer:'engine', icon:'◈', desc:'抵近作业,直扑动力车头' },
  swarmer: { name:'蜂群子机', hp:26,  atk:7,  prefer:null,     icon:'⁘', desc:'数量众多的自杀式子机' },
};
// 各危险度的敌方编队模板
const RAID_COMPS = {
  1: ['raider','raider'],
  2: ['raider','raider','swarmer','swarmer'],
  3: ['breaker','raider','raider','swarmer'],
  4: ['breaker','driller','raider','raider'],
  5: ['breaker','breaker','driller','raider','swarmer'],
  6: ['breaker','breaker','driller','driller','raider','raider'],
};
// 敌方编队构成由危险度决定(兵种混编),强度由星图区域决定(REGIONS)

/* ── 战术指令卡(卡组构筑:胜利后可选新卡入组) ── */
const CARD_RARITY = {
  common: { name:'常规', color:'#9298a8' },
  rare:   { name:'精锐', color:'#22d3ee' },
  epic:   { name:'传奇', color:'#8b5cf6' },
};
const CARDS = {
  /* 常规 */
  focus:    { name:'集火齐射', cp:1, rarity:'common', needTarget:true,
    desc:'锁定一艘敌舰,本回合全部武器对其伤害 +35%' },
  shield:   { name:'偏导护盾', cp:1, rarity:'common',
    desc:'本回合全列受到的伤害 -50%' },
  repair:   { name:'损管抢修', cp:1, rarity:'common',
    desc:'立即修复受损最重的车厢 35% 耐久' },
  evade:    { name:'规避机动', cp:1, rarity:'common',
    desc:'本回合敌方攻击 40% 概率落空' },
  overload: { name:'武器过载', cp:1, rarity:'common',
    desc:'本回合武器伤害 +100%,每座炮塔自损 10% 耐久' },
  patch:    { name:'装甲重组', cp:1, rarity:'common',
    desc:'全部未瘫痪车厢立即恢复 12% 耐久' },
  calibrate:{ name:'精确校射', cp:0, rarity:'common',
    desc:'本回合武器暴击率 +40%(暴击 ×1.6)' },
  engsupport:{ name:'工程支援', cp:0, rarity:'common', requires:'eng',
    desc:'本回合工程舱修复效率 ×3(需挂载工程舱段)' },
  /* 精锐 */
  salvo:    { name:'齐射协议', cp:2, rarity:'rare',
    desc:'本回合全部武器额外开火一轮' },
  pierce:   { name:'穿甲弹药', cp:1, rarity:'rare',
    desc:'本回合武器伤害 +25%,并无视「装甲」词缀' },
  emp:      { name:'电磁脉冲', cp:1, rarity:'rare', needTarget:true,
    desc:'瘫痪一艘敌舰的火控,本回合无法行动' },
  decoy:    { name:'诱饵无人机', cp:1, rarity:'rare',
    desc:'放出诱饵,本回合至多两艘敌舰的攻击落空' },
  seal:     { name:'紧急封舱', cp:1, rarity:'rare',
    desc:'受损最重的车厢本回合免疫全部伤害' },
  bigshield:{ name:'超载护盾', cp:2, rarity:'rare',
    desc:'倾注引擎功率,本回合全列受到的伤害 -80%' },
  missilerain:{ name:'全弹发射', cp:2, rarity:'rare', requires:'missile',
    desc:'每座导弹井立即向全部敌舰倾泻一轮(120% 伤害)' },
  /* 传奇 */
  revive:   { name:'野战重启', cp:2, rarity:'epic', exhaust:true,
    desc:'重新激活一节瘫痪车厢(40% 耐久)· 本场限一次' },
  railgun:  { name:'轨道支援', cp:2, rarity:'epic', needTarget:true,
    desc:'呼叫殖民地轨道炮:对目标造成 60 + 引擎等级×25 伤害' },
  timewarp: { name:'跃迁脉冲', cp:2, rarity:'epic', exhaust:true,
    desc:'扭曲局部时空,敌方全体本回合无法行动 · 本场限一次' },
};
const BASE_DECK = ['focus','focus','shield','repair','evade','overload'];
const HAND_SIZE = 4;
const ESCAPE_COST = 2;           // 全速脱离:固定指令,不占卡组
const BATTLE_MAX_ROUNDS = 9;     // 超时敌方撤退,战利品减半(Boss 战 12 回合)

/* ── 精英词缀(危险度 ≥3 出现) ── */
const AFFIXES = {
  armored: { name:'装甲', color:'#9298a8', desc:'受到伤害 -30%(穿甲弹药可破解)' },
  swift:   { name:'迅捷', color:'#22d3ee', desc:'先于列车武器行动' },
  volatile:{ name:'自爆', color:'#f59e0b', desc:'被击毁时炸伤随机车厢 12% 耐久' },
  regen:   { name:'自愈', color:'#3ecf8e', desc:'每回合末恢复 8 点' },
  sniper:  { name:'狙击', color:'#ef4444', desc:'专挑残血车厢攻击' },
  command: { name:'旗舰', color:'#8b5cf6', desc:'存活时,其余敌舰火力 +25%' },
};

/* ── Boss 编队(首次抵达必战;血量随列车火力动态成长) ── */
const BOSSES = {
  outremer: { name:'劫掠王「锈鲸」', icon:'☠', hpBase:420, atkBase:26, prefer:'cargo',
    skill:'summon', skillText:'每 3 回合放出 2 艘掠袭艇增援',
    escorts:['raider','raider'], lootMult:4,
    intro:'母港的灯一盏盏熄灭——锈鲸号横在航道正中,像一截生锈的山脉。所有袭击者舰队的航路,都从它的阴影下出发。' },
  hengyao:  { name:'第一站台守望者', icon:'◉', hpBase:480, atkBase:23, prefer:'weapon',
    skill:'charge', skillText:'主炮充能一回合后,齐射全列车厢',
    escorts:['breaker','driller'], lootMult:4,
    intro:'它从环形结构的阴影里展开,古老得超出数据库的任何条目。它守护这座站台已经很久了——久到忘了在等谁。' },
  terminus: { name:'环卫者「下一班车」', icon:'Ω', hpBase:560, atkBase:30, prefer:'engine',
    skill:'phase', skillText:'相位护盾:奇数回合受到的伤害 -70%',
    escorts:['swarmer','swarmer'], lootMult:5,
    intro:'废弃车站的信号灯突然全部转绿。环卫者驶出站台,广播在所有频段同时响起:误点列车,请立即离开本站。' },
};

/* 战斗击伤 → 持续损伤,需回库修复(费用 × 引擎等级) */
const REPAIR_COSTS = {
  engine:{ metal:600 }, weapon:{ metal:400 }, cargo:{ metal:250 },
  habitat:{ metal:300 }, eng:{ metal:300 },
};
/* 武器在战斗中的特性 */
const WEAPON_BATTLE = {
  autogun: { mode:'burst',  note:'每回合连射两次(每次 55% 伤害),拦截蜂群利器' },
  twin:    { mode:'burst',  note:'双联连射两次(每次 55% 伤害),弹幕密度更高' },
  laser:   { mode:'crit',   note:'单发全额伤害,25% 概率暴击 ×1.6' },
  missile: { mode:'splash', note:'主目标全额伤害,其余敌舰溅射 35%' },
};

/* ============================================================
   互动剧本《来自地球的歌》 + 支线《索拉里斯之海》(原版保留)
   ============================================================ */
const STORY = [
  { title:'苏醒', eyebrow:'信号 01 / 26 · 抵达第 7 年',
    body:[ '播种船「晨昏号」的休眠舱在沧澜轨道上依次开启。舷窗外是一整面温暖的海洋——没有大陆,只有几条火山岛弧像绿色的省略号,写在无边的蓝色之间。',
      '聚居点已由先遣 AI 在最大的岛弧上建成。但唤醒序列的能源只够优先一批人。' ],
    choices:[
      { label:'优先唤醒工程团队', sub:'沧澜在建工程立即完工 · 稀有金属 +300', fx:{ build:1, res:{metal:300} },
        out:'工程师们在四十八小时内让所有前哨的产能翻了一番。文明的齿轮开始加速咬合。' },
      { label:'优先唤醒农艺与医疗团队', sub:'沧澜可迁移人口 +2000 · 影响力 +20', fx:{ mig:2000, inf:20 },
        out:'第一季作物比预期提前成熟。沧澜的聚居点亮起了更多窗口的灯。' } ] },
  { title:'第一次点名', eyebrow:'信号 02 / 26 · 户籍登记日',
    body:[ '苏醒者陆续走出休眠区,殖民地举行了第一次全员点名。名单念到一半,登记官发现一个问题:出生地一栏,该填地球,还是填晨昏号?',
      '队伍安静了几秒。一个孩子举手说:"填沧澜吧,我们现在住这儿。"' ],
    choices:[
      { label:'出生地一律登记为「沧澜」', sub:'影响力 +25 · 沧澜可迁移人口 +800', fx:{ inf:25, mig:800 },
        out:'第一代殖民者的证件上,从此印着一颗海洋行星的名字。登记官把那个孩子的名字排在了名册第一页。' },
      { label:'保留原籍,加注「途经晨昏号」', sub:'科研值 +200 · 影响力 +15', fx:{ rp:200, inf:15 },
        out:'档案馆为此建立了完整的谱系数据库。许多年后,它成了研究大迁徙史最重要的一手资料。' } ] },
  { title:'第一缕讯号', eyebrow:'信号 03 / 26 · 量子信标',
    body:[ '深空信标捕获到一段微弱的相干信号——发自四个世纪前的地球方向。解码后不是数据,不是指令。',
      '是音乐。一首你们这代人从未听过的歌。' ],
    choices:[
      { label:'向全体殖民者公开播放', sub:'永久 · 垦曦全系人口上限 +10% · 影响力 +50', fx:{ cap:1.10, inf:50 },
        out:'那天晚上,整个聚居点的人都站在穹顶下听完了它。九个月后,沧澜迎来一波婴儿潮。' },
      { label:'录入档案馆,择期公布', sub:'永久 · 垦曦全系资源产率 +10% · 科研值 +500', fx:{ rate:1.10, rp:500 },
        out:'议会决定先稳住生产。但档案馆的管理员每晚都会偷偷播放一遍——隔着玻璃,矿区的灯火彻夜未熄。' } ] },
  { title:'盐与电', eyebrow:'信号 04 / 26 · 基建周',
    body:[ '海水淡化厂的第一条产线投产。副产物是堆成小山的海盐,和一套意外好用的咸水电池方案。',
      '工程组在例会上摊牌:人手只够把一件事做到底。' ],
    choices:[
      { label:'扩建淡水产线,保障人口', sub:'沧澜可迁移人口 +1200 · 影响力 +15', fx:{ mig:1200, inf:15 },
        out:'三个月后,聚居点的供水牌从黄色换成了绿色。孩子们第一次被允许用淡水打水仗。' },
      { label:'量产咸水电池,反哺工业', sub:'稀有金属 +350 · 化合物 +150', fx:{ res:{metal:350, chem:150} },
        out:'咸水电池组撑起了矿区的夜班照明。后来沧澜的工业标准里,多了一条以海盐浓度标定的电压单位。' } ] },
  { title:'灯塔水母', eyebrow:'信号 05 / 26 · 生物普查',
    body:[ '海洋普查队在夜里关掉了探照灯——因为根本不需要。沧澜的浅海里漂着成群的发光浮游生物,每隔十一秒同步明灭一次,像一座座没有塔身的灯塔。',
      '这是殖民地发现的第一种本土宏观生命。' ],
    choices:[
      { label:'设立保护区,只远距观测', sub:'永久 · 文明指数 +0.2', fx:{ civ:0.2 },
        out:'保护区的浮标圈成了沧澜的第一条生态红线。后来的城市规划图上,那片海始终是空白——所有人都默认它不属于人类。' },
      { label:'采样研究发光机制', sub:'科研值 +400', fx:{ rp:400 },
        out:'生物荧光蛋白被用进了低功耗照明。矿区巷道里那种幽蓝的常明灯,矿工们都叫它"水母灯"。' } ] },
  { title:'第一班通勤列车', eyebrow:'信号 06 / 26 · 轨道开通',
    body:[ '环岛轨道线通车,首班列车从聚居点开往新矿区。司机是从晨昏号上退役的领航员——她说反正都是开船,只是这次有轨道。',
      '通车仪式上,议会请你为这条线路定一个基调。' ],
    choices:[
      { label:'免费通勤,鼓励人口流动', sub:'沧澜可迁移人口 +1500', fx:{ mig:1500 },
        out:'头一个月,有人专门坐完全程再坐回来,只为看海。人口署的迁移登记表第一次排起了队。' },
      { label:'优先货运,产能为王', sub:'稀有金属 +300 · 影响力 +20', fx:{ res:{metal:300}, inf:20 },
        out:'矿石罐车昼夜不息。终点站的卸货臂磨出了第一道包浆,工人们说那是沧澜的第一道年轮。' } ] },
  { title:'冰下之声', eyebrow:'信号 07 / 26 · 凛渊轨道',
    body:[ '凛渊的冰壳下传来规律的低频震荡。不是地质活动——频谱太干净了。',
      '科学组分成两派:一派认为是冰层共振的自然现象,另一派坚持那是某种回应。' ],
    choices:[
      { label:'派出深潜无人器查证', sub:'科研值 +650', fx:{ rp:650 },
        out:'无人器带回的只有冰晶生长的声音。但为此研发的深潜技术,让所有矿业前哨受益。' },
      { label:'保持距离,持续监听', sub:'永久 · 文明指数 +0.3 · 影响力 +30', fx:{ civ:0.3, inf:30 },
        out:'你们没有惊动它——无论"它"是什么。这份克制本身,被写进了殖民地的第一部伦理法典。' } ] },
  { title:'解码小组', eyebrow:'信号 08 / 26 · 密码学夜班',
    body:[ '地球讯号的后续片段仍在缓慢抵达,但调制方式变了。解码小组连续三周睡在机房,墙上贴满了频谱图。',
      '组长申请追加算力——代价是挪用一部分工业调度系统的配额。' ],
    choices:[
      { label:'批准,真相优先', sub:'科研值 +500', fx:{ rp:500 },
        out:'解码进度条肉眼可见地动了起来。机房的白板上,有人写下倒计时:距离听懂地球,还剩 N 天。' },
      { label:'驳回,生产优先', sub:'稀有金属 +400 · 影响力 +15', fx:{ res:{metal:400}, inf:15 },
        out:'解码小组学会了在工业算力的间隙里跑任务。他们管这叫"捡地球的下脚料"——但没有人请假。' } ] },
  { title:'风暴季', eyebrow:'信号 09 / 26 · 气象警报',
    body:[ '沧澜的第一个风暴季来得比模型预测早了二十天。十二级风圈正面扫过主岛弧,聚居点第一次拉响全员警报。',
      '防灾指挥部需要一个原则:保设施,还是保进度。' ],
    choices:[
      { label:'全员入地下掩体,设备断电保全', sub:'沧澜在建工程立即完工(灾后抢修)', fx:{ build:1 },
        out:'风暴过境七十二小时,零伤亡。复电那一刻,整个掩体里响起的欢呼声,比风声还大。' },
      { label:'抢运露天物资,顶风加固', sub:'稀有金属 +450 · 影响力 +20', fx:{ res:{metal:450}, inf:20 },
        out:'抢回来的物资堆满了三个仓库。风暴季结束后,沧澜的建筑规范全部按这次的风速上限重写。' } ] },
  { title:'孩子们的问题', eyebrow:'信号 10 / 26 · 第一课堂',
    body:[ '殖民地学校开课第一周,老师收集了孩子们最想问的问题。排第一的是:"地球长什么样?"',
      '问题被转给了议会——因为没有任何一位老师见过地球。最年长的殖民者,登船时也只有九岁。' ],
    choices:[
      { label:'用档案影像开一门「地球学」', sub:'永久 · 文明指数 +0.2 · 科研值 +200', fx:{ civ:0.2, rp:200 },
        out:'第一节课放的是海洋纪录片。有孩子举手:"这不就是外面吗?"老师愣了一下,说:"对,所以我们叫它新萨拉萨。"' },
      { label:'回答:地球长什么样,由你们来想象', sub:'影响力 +35', fx:{ inf:35 },
        out:'美术课收上来一百多张"地球"。有方的,有发光的,有一张画的是一列火车绕着蓝色星球跑。校长把它们全部裱进了走廊。' } ] },
  { title:'大撤离的真相', eyebrow:'信号 11 / 26 · 解码完成',
    body:[ '信号的后续片段被完整解码:太阳氦闪前的最后一千年,地球向所有方向发射了上千艘播种船。',
      '「晨昏号」不是先驱,而是其中最普通的一艘。你们的母星,在你们沉睡的途中已经不存在了。' ],
    choices:[
      { label:'向全体公民公布真相', sub:'永久 · 文明指数 +0.5 · 影响力 +120', fx:{ civ:0.5, inf:60 },
        out:'哀悼日持续了一周。然后人们回到岗位——这一次,不再是为了"等待返航",而是为了在这里扎根。' },
      { label:'暂缓公布,先巩固殖民地', sub:'建设物资:稀有金属 +600 · 化合物 +300', fx:{ res:{metal:600, chem:300} },
        out:'议会选择让建设的节奏盖过流言。真相在半年后随纪念碑一起公布——那时,已没有人想回去了。' } ] },
  { title:'沉默的一周', eyebrow:'信号 12 / 26 · 哀悼与日常',
    body:[ '真相公布后的第一周,殖民地异常安静。食堂里没人说话,轨道列车准点率却到了历史最高——所有人都把自己钉在了岗位上。',
      '心理署提交了两套疏导方案。' ],
    choices:[
      { label:'设立公共追思空间,鼓励倾诉', sub:'影响力 +40', fx:{ inf:40 },
        out:'追思墙上很快贴满了字条。最多的一句话是:"我没见过你,但我替你看到了海。"' },
      { label:'组织集体劳动,以建设代替哀悼', sub:'沧澜在建工程立即完工', fx:{ build:1 },
        out:'那一周落成的水线,后来被居民自发称为"纪念渠"。没有立碑——渠水流过的声音就是碑文。' } ] },
  { title:'纪念碑', eyebrow:'信号 13 / 26 · 设计竞标',
    body:[ '议会决定为地球立一座纪念碑。征集到的方案里,呼声最高的有两个:一座面向地球方向的空心拱门,和一片种满地球作物的开放農园。',
      '预算只够建一个。' ],
    choices:[
      { label:'建拱门:每年氦闪日,日落穿过拱心', sub:'影响力 +45 · 文明指数 +0.1', fx:{ inf:45, civ:0.1 },
        out:'拱门落成那天没有仪式。但每年那一天,拱门下面总会自发地站满人,安静地看一次日落。' },
      { label:'建農园:让地球的种子继续活着', sub:'沧澜可迁移人口 +1000 · 科研值 +250', fx:{ mig:1000, rp:250 },
        out:'種子库里的地球作物在農园里活了下来。最受欢迎的是向日葵——它们朝着的方向,刚好是地球。' } ] },
  { title:'信标再醒', eyebrow:'信号 14 / 26 · 异常活跃',
    body:[ '沉寂数月的量子信标突然再次活跃——缓冲区里堆积着一段长得反常的新讯号,校验头显示:音频,多轨,未损坏。',
      '解码小组估算,完整解出需要连续七十小时的算力。机房的灯又亮了。' ],
    choices:[
      { label:'通宵排班,一次解完', sub:'科研值 +450', fx:{ rp:450 },
        out:'七十小时后,组长把第一段试听音轨放进了全员频道,然后在工位上睡了整整一天。没有人叫醒他。' },
      { label:'分段慢解,顺便重构解码管线', sub:'科研值 +250 · 稀有金属 +250', fx:{ rp:250, res:{metal:250} },
        out:'新管线把解码效率提了四倍。代价是所有人多等了一周——后来证明,这段讯号值得用最好的状态去听。' } ] },
  { title:'摇篮曲', eyebrow:'信号 15 / 26 · 第二段录音',
    body:[ '新解码的片段是一段儿童合唱,录制于地球最后的世纪。歌词的语言已经无人使用,但曲调被沧澜的母亲们学会了。',
      '现在它在每一个育婴舱里循环播放。' ],
    choices:[
      { label:'将它定为殖民地的摇篮曲', sub:'永久 · 垦曦全系人口上限 +8% · 沧澜可迁移人口 +1500', fx:{ cap:1.08, mig:1500 },
        out:'人口统计署注意到一个现象:听着地球摇篮曲长大的第一代孩子,把沧澜叫做"家",把地球叫做"老家"。' },
      { label:'鼓励创作沧澜自己的歌', sub:'永久 · 垦曦全系资源产率 +8% · 影响力 +30', fx:{ rate:1.08, inf:30 },
        out:'第一首本土民谣诞生在矿区夜班的休息舱里,歌词是关于双月和氦-3 罐车的。它很快传遍了全系。' } ] },
  { title:'摇篮曲变奏', eyebrow:'信号 16 / 26 · 民间传唱',
    body:[ '摇篮曲在传唱中长出了几十个版本:矿区版多了机械的节拍,渔队版被改成了号子,学校里的孩子甚至给它填上了沧澜语的新词。',
      '音乐档案馆请示:要不要规范一个标准版本?' ],
    choices:[
      { label:'不规范,让它自由生长', sub:'永久 · 文明指数 +0.2', fx:{ civ:0.2 },
        out:'档案馆改为「收集所有版本」。十年后,这套变奏合集成了沧澜文化输出的第一张名片。' },
      { label:'录制官方版,作为公共礼仪用曲', sub:'影响力 +40', fx:{ inf:40 },
        out:'官方版由三百人合唱团录制,用在每一次升旗与启航仪式上。但母亲们哄孩子时,唱的还是自己的那一版。' } ] },
  { title:'望远镜计划', eyebrow:'信号 17 / 26 · 深空之眼',
    body:[ '天文台提案:在汐月背面建一座深空望远镜阵列,理由写得很直白——"我们应该知道,除了地球的方向,天上还有什么。"',
      '预算委员会把提案转给了你。' ],
    choices:[
      { label:'全额批准,面向全天巡测', sub:'科研值 +550', fx:{ rp:550 },
        out:'阵列启用的第一晚,值班员在日志里写:今夜无新发现。然后顿了顿,补了一句:但每一颗星都被我们看过一遍了。' },
      { label:'缩减规模,优先盯紧航路', sub:'科研值 +250 · 稀有金属 +300', fx:{ rp:250, res:{metal:300} },
        out:'小阵列盯住了进出垦曦的所有航道。后来列车船员都知道:出航时回头看,汐月背面有一只不眨的眼睛在送行。' } ] },
  { title:'老工程师的信', eyebrow:'信号 18 / 26 · 晨昏号一代',
    body:[ '晨昏号的首席工程师申请退休。她在信里写:船上的最后一台休眠泵今天停机检修,我和它一起服役了四百年——它睡着的时候,我醒着;现在它该退了,我也是。',
      '她有一个请求:把那台泵留在博物馆,而不是回炉。' ],
    choices:[
      { label:'批准,并请她做博物馆首任馆长', sub:'影响力 +35 · 文明指数 +0.1', fx:{ inf:35, civ:0.1 },
        out:'博物馆的第一件展品就是那台泵。铭牌上没有参数,只有一行字:它送了两万人回家。' },
      { label:'回炉,但把零件编号刻进纪念墙', sub:'稀有金属 +400', fx:{ res:{metal:400} },
        out:'熔炉开炉那天,老工程师亲手按下了按钮。她说机器的归宿是变成新的机器——这句话后来被铸在了再生金属锭的模具上。' } ] },
  { title:'远行者', eyebrow:'信号 19 / 26 · 星系边缘',
    body:[ '另一艘播种船的尾焰掠过星系外缘——「曙光号」,目的地是更远的一颗橙矮星。',
      '它没有减速,也没有回应呼叫。按航程计算,它的乘员还要沉睡三百年。' ],
    choices:[
      { label:'向它发送完整星图与讯号档案', sub:'永久 · 垦曦全系资源产率 +12% · 科研值 +650', fx:{ rate:1.12, rp:650 },
        out:'为了把定向天线功率提上去,工程组顺手重构了全系的能源网。三百年后某个清晨,会有人因为你们的星图少走十年弯路。' },
      { label:'静默目送,不打扰它的航程', sub:'影响力 +50 · 稀有金属 +500', fx:{ inf:50, res:{metal:500} },
        out:'你们看着那个光点消失在猎户臂的尘埃里。然后转身,把省下的天线预算投进了轨道船坞。' } ] },
  { title:'航迹推演', eyebrow:'信号 20 / 26 · 轨道力学课',
    body:[ '天文台用三周时间反推了曙光号的完整航迹,意外发现它在四十年前做过一次没有记录的变轨——绕开了一片今天才被你们标注的尘埃带。',
      '结论只有两种:它的 AI 比档案记载的更聪明,或者,有人在那一年短暂醒来过。' ],
    choices:[
      { label:'把变轨数据并入领航数据库', sub:'科研值 +500', fx:{ rp:500 },
        out:'那次变轨被命名为"无名修正"。垦曦的每一份航线规划书末尾,从此都多了一行:感谢一位不知名的领航员。' },
      { label:'为"醒来的人"写一篇专栏', sub:'影响力 +40 · 文明指数 +0.1', fx:{ inf:40, civ:0.1 },
        out:'专栏的结尾是:他改完航向,看了一眼四百年后才会抵达的星星,然后回去继续睡。我们都是这样的人。' } ] },
  { title:'无线电静默夜', eyebrow:'信号 21 / 26 · 全系协定',
    body:[ '天文台发起一项一年一度的协定:在氦闪纪念日当晚,全系所有非必要射电设备静默一小时,把整片频谱让给深空。',
      '"万一那一小时里,有谁在喊我们呢。"提案的最后一句这样写。' ],
    choices:[
      { label:'签署协定,今晚就开始', sub:'永久 · 文明指数 +0.2 · 影响力 +30', fx:{ civ:0.2, inf:30 },
        out:'静默夜里没有听到任何呼喊。但有数据显示,那一小时的出生率、求婚率和望远镜销量,都是全年最高。' },
      { label:'改为自愿参与,不作强制', sub:'科研值 +300', fx:{ rp:300 },
        out:'第一年只有天文台自己静默。第二年多了矿区。第三年,连轨道列车都会在那一小时把广播调成只剩车轮声。' } ] },
  { title:'最后的歌', eyebrow:'信号 22 / 26 · 讯号终止',
    body:[ '地球方向的信号在今天凌晨归于平直。最后传来的是一段钢琴独奏,弹奏者在结尾即兴加了十几个小节——不属于任何已知曲谱。',
      '天文台确认:那是氦闪抵达前,地球发出的最后一段电磁波。' ],
    choices:[
      { label:'全系静默一分钟,然后继续建设', sub:'沧澜在建工程立即完工 · 文明指数 +0.2', fx:{ build:1, civ:0.2 },
        out:'静默结束的钟声敲响时,七颗星球的工地同时复工。没有什么纪念方式,比把文明延续下去更郑重。' },
      { label:'将最后十几个小节补写成完整的曲子', sub:'影响力 +80 · 文明指数 +0.2', fx:{ inf:80, civ:0.2 },
        out:'三百位市民提交了续写版本。最终入选的那一首,后来成了垦曦星系的非正式系歌。' } ] },
  { title:'歌词考据', eyebrow:'信号 23 / 26 · 语言学报告',
    body:[ '语言学组完成了全部地球讯号的歌词整理:十一种语言,四十七首歌,从摇篮曲到进行曲,从情歌到安魂曲。',
      '报告的附录里夹着一页手写纸条:有三个词在所有语言里都出现了——海、光,和回家。' ],
    choices:[
      { label:'出版《地球歌集》全民发行', sub:'影响力 +45 · 文明指数 +0.1', fx:{ inf:45, civ:0.1 },
        out:'歌集印了三版仍然脱销。最常被翻开的那一页,印刷厂特意加厚了纸——是那首摇篮曲。' },
      { label:'建立开放语料库,供研究与再创作', sub:'科研值 +450', fx:{ rp:450 },
        out:'语料库上线当晚就有人提交了第一首再创作。系统显示,他把"回家"那个词,替换成了"沧澜"。' } ] },
  { title:'回信草稿', eyebrow:'信号 24 / 26 · 全民征集',
    body:[ '议会启动「回信计划」:地球已经听不到了,但回信不是写给地球的——是写给所有还在路上的播种船,和未来可能听见的任何人。',
      '第一句话写什么,征集了整整一个月。' ],
    choices:[
      { label:'采用得票最高的:「我们到了,这里有海。」', sub:'影响力 +50', fx:{ inf:50 },
        out:'这七个字后来被刻在广播阵列的基座上。简单,但每一个从休眠中醒来的人,都会懂。' },
      { label:'采用评审团推荐的:「你们的歌,我们收到了。」', sub:'文明指数 +0.2 · 科研值 +200', fx:{ civ:0.2, rp:200 },
        out:'评审团的理由只有一句:回信的第一句,应该先回答对方,再介绍自己。这是地球教我们的礼貌。' } ] },
  { title:'天线阵列', eyebrow:'信号 25 / 26 · 工程奠基',
    body:[ '深空广播阵列在沧澜同步轨道奠基,主结构将使用晨昏号的船体残骸——这是它最后一次航行任务:停在原地,替你们说话。',
      '工期排到了极限,总工程师问:赶在氦闪纪念日完工,还是稳妥一点?' ],
    choices:[
      { label:'赶工,纪念日当天首播', sub:'沧澜在建工程立即完工 · 稀有金属 +300', fx:{ build:1, res:{metal:300} },
        out:'最后一块天线面板在纪念日凌晨四点合拢。安装工说,拧最后一颗螺栓的时候,手一点都没抖——晨昏号的钢很认人。' },
      { label:'按部就班,质量优先', sub:'科研值 +350 · 影响力 +25', fx:{ rp:350, inf:25 },
        out:'阵列晚了四十天完工,但首轮自检零故障。总工程师在验收单上写:它要替我们说很多年的话,值得等。' } ] },
  { title:'新的歌', eyebrow:'信号 26 / 26 · 尾声',
    body:[ '议会通过决议:启用「晨昏号」的残骸建造深空广播阵列,把沧澜的歌——连同地球的歌——朝一千个方向播出去。',
      '某一天,某颗陌生行星的天空下,会有人听到你们。就像你们听到地球那样。',
      '——《来自地球的歌》 完' ],
    choices:[
      { label:'按下广播键', sub:'永久 · 文明指数 +1.0 · 垦曦全系人口与产率 +5% · 影响力 +120', fx:{ civ:1.0, cap:1.05, rate:1.05, inf:120 },
        out:'广播阵列的第一束信号离开天线时,你正站在沧澜的夜面。脚下,城市的灯光连成了星座。' } ] },
];
const STORY_GAPS = [8000].concat(Array(25).fill(120000));  // 首章 8 秒,此后固定 2 分钟一章
const STORY_GAP = 30000;  // 兜底

const SIDE_STORY = [
  { title:'模仿体', eyebrow:'异常讯号 01 / 09 · 凛渊冰下',
    body:[ '凛渊轨道站报告:监听阵列收到了一段信号——是三天前无人潜航器自己发出的遥测包,被原样"复述"了回来。',
      '不,不是原样。校验和不对。有人逐帧比对后发现,数据里多出的部分,拼起来像一段没有学会语法的语言。冰下的海洋,在试着说话。或者只是在做梦。' ],
    choices:[
      { label:'建立对话实验组,持续回送信号', sub:'永久 · 文明指数 +0.3', fx:{ civ:0.3 },
        out:'实验持续了四十天。海洋复述了你们发去的一切——数学、音乐、问候语——但从不回答问题。语言学家在报告末尾写道:它不是在交流,它是在镜映。' },
      { label:'隔离频段,仅做被动监听', sub:'科研值 +500', fx:{ rp:500 },
        out:'议会把节省下来的算力拨给了工程网络。但监听员们私下都留着一份那段"复述"的拷贝——夜班的时候,有人会戴上耳机听一会儿。' } ] },
  { title:'访客', eyebrow:'异常讯号 02 / 09 · 轨道站',
    body:[ '凛渊轨道站的值班工程师申请紧急轮换。他声称在休眠舱走廊见到了自己的妹妹——她留在了地球,死于四个世纪前。',
      '脑扫描显示他睡眠期间的海马体活动被某种外源信号反复读取、重构。站内另有两人报告了类似的"访客"。心理学组组长凯文主动请缨驻站。' ],
    choices:[
      { label:'撤回全部驻站人员,改为无人监测', sub:'科研值 +400 · 影响力 +20', fx:{ rp:400, inf:20 },
        out:'撤离舱升空时,有人最后看了一眼舷窗外的冰原。无人站继续运转,但再没有"访客"出现——它们似乎只对活人感兴趣。' },
      { label:'批准凯文的驻站申请', sub:'永久 · 文明指数 +0.3 · 影响力 +40', fx:{ civ:0.3, inf:40 },
        out:'凯文驻站九十天,见到了他想见的人,也学会了与之告别。他的结题报告只有一句话被公开:"它读取我们的伤口,不是因为恶意,而是因为那是我们脑海里最深的刻痕。"' } ] },
  { title:'红雨', eyebrow:'异常讯号 03 / 09 · 冰面气象',
    body:[ '凛渊的冰面下了一场红色的雨——裂隙喷泉把海水抛上高空,冻成绯色的冰晶,纷纷扬扬落了三天。',
      '采样结果让实验室连夜加班:冰晶里含有结构规整的有机大分子,排列方式在已知生化数据库里没有任何对应。它们不属于任何生命,但也很难说不属于。' ],
    choices:[
      { label:'全力分析分子结构', sub:'科研值 +550', fx:{ rp:550 },
        out:'分析做了三个月,结论是一张漂亮的结构图和一句坦白:我们能画出它,但不知道它为什么存在。这张图后来挂在实验室门口,标题是《谦逊》。' },
      { label:'封存样本,只记录不解读', sub:'影响力 +35 · 文明指数 +0.1', fx:{ inf:35, civ:0.1 },
        out:'三千支封存管整齐地躺在低温库里,编号从 RR-001 到 RR-3000。封条上写着同一句话:留给比我们更聪明的人。' } ] },
  { title:'凯文的日志', eyebrow:'异常讯号 04 / 09 · 驻站第 41 天',
    body:[ '凯文的驻站日志按协议每旬公开一页。第 41 天那页只有寥寥数行:今天她又来了。她坐在观测窗边,看了一个小时的冰原。她不说话——因为我妹妹生前就不爱说话。它连这个都读到了。',
      '心理署收到两种意见:有人要求终止驻站,有人请求加入。' ],
    choices:[
      { label:'尊重凯文,继续驻站计划', sub:'永久 · 文明指数 +0.2', fx:{ civ:0.2 },
        out:'凯文在回复里写:悲伤不是病,被读取也不是伤害。请放心,我每天都分得清窗外是冰,窗内是我。' },
      { label:'增派一名心理医生同驻', sub:'影响力 +30 · 科研值 +200', fx:{ inf:30, rp:200 },
        out:'增派的医生报到当晚也见到了"访客"——她已故的导师,正在批改一份不存在的论文。两位心理学家从此互为对方的医生。' } ] },
  { title:'潮汐表', eyebrow:'异常讯号 05 / 09 · 周期发现',
    body:[ '数据组发现"复述"信号的强度存在一个 17.3 小时的周期——与凛渊冰下海洋的潮汐完全吻合。涨潮时它话多,退潮时它沉默。',
      '更微妙的是:轨道站作息表上的午休时段,信号强度也会轻微下降。它在跟着你们休息。' ],
    choices:[
      { label:'按它的潮汐重排观测班表', sub:'科研值 +450', fx:{ rp:450 },
        out:'新班表实施后,数据质量提升了四成。值班员说感觉像在和一个看不见的同事倒班——交接的时候,得跟海洋道一声早。' },
      { label:'故意打乱作息,测试它的反应', sub:'科研值 +250 · 影响力 +20', fx:{ rp:250, inf:20 },
        out:'你们连续十天随机作息。第十一天,海洋的信号也变成了随机——但每一段的时长,精确等于你们前十天的平均值。它不被打乱,它消化混乱。' } ] },
  { title:'删除请求', eyebrow:'异常讯号 06 / 09 · 伦理听证',
    body:[ '一位曾经驻站的工程师提交了正式申请:删除站内存档中他的全部脑扫描数据。理由栏只写了一行——"它读过的东西,我不想再被别人读一遍。"',
      '但科学组反对:那批数据是研究"访客"机制的唯一对照组。听证会开到了深夜。' ],
    choices:[
      { label:'批准删除,隐私高于研究', sub:'永久 · 文明指数 +0.3', fx:{ civ:0.3 },
        out:'数据被当众物理销毁。这场听证会确立的「脑数据知情权」条款,后来被写进全系公民法的第一章。' },
      { label:'匿名化封存,百年后解密', sub:'科研值 +400 · 影响力 +20', fx:{ rp:400, inf:20 },
        out:'封存柜的倒计时定在一百年。工程师在封条上签了字,然后说:行吧,留给一群没见过我的人——这样它读到的就只是数据,不是我。' } ] },
  { title:'镜像测试', eyebrow:'异常讯号 07 / 09 · 主动实验',
    body:[ '对话实验组设计了一次大胆的测试:向海洋发送一段精心编造的"假记忆"——一个从未存在过的人的完整生平。',
      '七小时后,海洋把它复述了回来。但所有人都看出了不同:假记忆里那个人的结局被改了。原稿里他死于事故;复述版里,他活到了很老,死在海边。' ],
    choices:[
      { label:'继续发送,建立"修订对照库"', sub:'科研值 +500', fx:{ rp:500 },
        out:'七十二份假记忆,七十二份修订。规律只有一个:所有暴死都被改成了善终。语言学家在结题报告里写:它不会说话,但它会安慰。' },
      { label:'停止测试——不该用谎言喂它', sub:'永久 · 文明指数 +0.2 · 影响力 +30', fx:{ civ:0.2, inf:30 },
        out:'实验组解散前烧掉了全部假记忆底稿。组长说:它对我们只用过真话——哪怕是借来的真话。我们至少该还它这个。' } ] },
  { title:'退潮', eyebrow:'异常讯号 08 / 09 · 信号衰减',
    body:[ '"复述"信号开始以稳定的速率衰减,像一场不会回头的退潮。数据组推算,九十天后它将低于本底噪声。',
      '没有任何征兆,没有任何告别——或者说,这场长达数年的复述,本身就是一场漫长的告别。' ],
    choices:[
      { label:'抓紧最后窗口,全功率记录', sub:'科研值 +600', fx:{ rp:600 },
        out:'最后九十天的数据塞满了三个存储阵列。最后一段可辨识的复述,是很多年前第一台潜航器发出的第一声脉冲——它把你们说的第一句话,留到了最后说。' },
      { label:'降低观测强度,安静地陪它退场', sub:'影响力 +40 · 文明指数 +0.2', fx:{ inf:40, civ:0.2 },
        out:'监听室的音量旋钮被调到最小,但没有人关机。值班员们说,这就像守在一位入睡老人的床边——你不需要听清呼吸,你只需要在。' } ] },
  { title:'对称体', eyebrow:'异常讯号 09 / 09 · 终章',
    body:[ '今天凌晨,凛渊的冰壳裂开了一道三百公里的缝。海洋从裂隙中升起一座完全对称的晶体结构——尖塔、回廊、不断自我复制的几何,像一座在数学里生长的城市。',
      '它存在了六个小时,没有回应任何信号,然后自行崩解,沉回冰下。监听阵列从此再没有收到过"复述"。',
      '它来过,展示过,然后离开了。你们始终不知道那是问候、告别,还是仅仅——存在本身。' ],
    choices:[
      { label:'将凛渊冰下海域划为永久保护区', sub:'永久 · 文明指数 +0.6', fx:{ civ:0.6 },
        out:'保护区界碑上刻着凯文报告的最后一行:"宇宙中存在我们无法理解的事物,承认这一点,是理解的开始。"——支线《索拉里斯之海》完' },
      { label:'在冰面建立永久观测站,与它共存', sub:'影响力 +80 · 文明指数 +0.2', fx:{ inf:80, civ:0.2 },
        out:'观测站取名"凯文站"。它至今没有再观测到任何异常——但每年冬至,站员们会朝冰面播放一遍那段最早的"复述"。万一它在听呢。——支线《索拉里斯之海》完' } ] },
];
const SIDE_GAP = 120000;  // 支线间隔 2 分钟,与主线穿插
const SIDE_UNLOCK_AT = 3;

/* ── 星港建设引导线《钢铁码头》:按里程碑触发(非计时) ──
   ch1 沧澜达殖民地 → ch2 第一座星港落成 → ch3 第一条贸易线开通 */
const PORT_STORY = [
  { title:'钢铁码头', eyebrow:'航运公报 01 / 03 · 规划院',
    body:[ '随着殖民地扩张,行星之间的物资往来已经超出列车一己之力。规划院呈上一份蓝图:在行星轨道上建造「星港」——不占地表区划的独立空港,无人货船昼夜往返,物资自动流动。',
      '蓝图的最后一页写着真正的野心:先用星港吃透垦曦星系的每一颗资源星;待星门技术成熟,这张码头网络将沿着星门的作用圈,把提取范围延伸到周围的星系。列车开路,码头守成。',
      '规划院申请立即开工第一座:沧澜轨道星港。' ],
    choices:[
      { label:'批准蓝图,工程兵团即刻进场', sub:'沧澜星港即刻落成(规划院全额承建)', fx:{ grantPorts:['kenxi/canglan'] },
        out:'三班倒持续了两周。当环形泊位在沧澜同步轨道上展开时,地面有人拍下照片——后来它印在了第一版航运纪念邮票上。' },
      { label:'批准,并要求附带全民认购仪式', sub:'沧澜星港即刻落成 · 影响力 +60', fx:{ grantPorts:['kenxi/canglan'], inf:60 },
        out:'认购窗口排起长队。一位老工程师买了最大额度:"晨昏号载我们来的时候我就想过——总有一天,天上会有码头。"' } ] },
  { title:'资源走廊', eyebrow:'航运公报 02 / 03 · 成网',
    body:[ '沧澜星港运营第一周,调度中心就发现了瓶颈:码头有了,对岸却空着。星港必须成网才有意义——资源端也要有锚点。',
      '规划院圈定两处:烬岩的稀有金属矿脉、纱幕的化合物云海。方案是一步到位——前哨与星港同期铺设,让无人货船直接对接矿区。这套「资源走廊」一旦跑通,就是未来向邻近星系复制的模板。' ],
    choices:[
      { label:'双线并进,即刻铺设', sub:'烬岩·纱幕 前哨+星港即刻落成 —— 贸易线随即可开通', fx:{ grantPorts:['kenxi/jinyan', 'kenxi/shamu'] },
        out:'两支工程船队同日离港。三天后,烬岩的矿石第一次不经列车直上轨道——调度日志写道:"从今天起,运输不再等车。"' },
      { label:'铺设之余,为矿区争取安家补贴', sub:'同上 · 影响力 +50', fx:{ grantPorts:['kenxi/jinyan', 'kenxi/shamu'], inf:50 },
        out:'第一批驻矿家庭在烬岩穹顶下安了家。窗外是轨道电梯的灯,孩子们管它叫"通天的糖葫芦"。' } ] },
  { title:'贸易动脉', eyebrow:'航运公报 03 / 03 · 开线',
    body:[ '第一条贸易线开通了。菱形的无人货船沿固定航线往返,实心满载而去,空心轻盈而归。居住星的资源仓有了稳定补给,通商加成让殖民地的发展明显提速。',
      '从此,星系内的物资昼夜不停地流动——即使列车远在银河另一端。而当星门贯通的那一天,这张网会沿着作用圈伸进邻近星系,把它们的矿脉也接进同一条动脉。' ],
    choices:[
      { label:'将航线网命名为「晨昏动脉」', sub:'影响力 +100 · 文明指数 +0.3', fx:{ inf:100, civ:0.3 },
        out:'命名投票时,"晨昏动脉"以压倒性优势胜出。理由很简单:列车开拓的路,货船替它守着。——《钢铁码头》完' } ] },
];

/* ============================================================
   《地疤》— 跃迁残响剧集(每次跨星系跃迁解锁一段,共 120 段)
   改编自地疤式的"开放可能性"叙事:真相永不揭晓,每种解释都活着
   ============================================================ */
const SCAR_ARCS = ['缄默之沟','测绘报告','一百种可能','第二道疤','画疤的人','直线委员会','疤底','汇点','虚空远征','轨床假说','静默年代','终点不设站'];
function scarArcTitle(i){ return SCAR_ARCS[Math.min(SCAR_ARCS.length - 1, Math.floor(i / 10))]; }
const SCAR_STORY = [
  // ── 弧一 · 缄默之沟 ──
  { t:'跃迁通道关闭的瞬间,通讯阵列捕捉到一段陌生的窄带广播。信源认证:深空矿业联合电台,《缄默之沟》节目,第一期。' },
  { t:'"……哈尔沃森-9 是颗没人多看一眼的矿星。直到测绘卫星在第 41 轨道周期,传回了那张照片。"' },
  { t:'照片上是一道沟。笔直,均匀,从北纬三十度划到南回归线——一千四百公里,没有一处转弯。' },
  { t:'矿业站长在日志里写:像有人用直尺,在行星的脸上划了一刀。' },
  { t:'第一支地面队抵达沟沿。沟宽九百米,深不见底,两壁光滑得能映出探照灯的光斑。' },
  { t:'没有喷出物,没有堆积的碎石。一道沟该有的一切残骸,都不在场。' },
  { t:'队长在沟沿站了很久,说了那天唯一一句被录下来的话:"它不像被挖出来的。像本来就在,只是今天才肯让我们看见。"' },
  { t:'当晚,矿星全体停工。不是命令——只是没有人按得下钻机的启动键。' },
  { t:'联合电台把这道沟命名为「地疤」。这个名字一夜之间传遍了深空频段。' },
  { t:'节目结尾,主持人停顿了三秒:"我们会继续报道。在那之前,请记住今晚的感觉——所有可能性都还活着。"', fx:{ inf:15 }, sub:'影响力 +15' },
  // ── 弧二 · 测绘报告 ──
  { t:'第二期。勘测队的激光测距仪在沟心丢失了三厘米——发射与回波对不上。仪器没坏。三厘米就是不见了。' },
  { t:'剖面扫描显示沟底是完美的 V 形,夹角五十二度,误差小于角秒。自然侵蚀做不到。人类工程也做不到。' },
  { t:'沟壁取样:同一块岩芯,上半段四十亿年;下半段——检测员复核了八遍——比殖民史还年轻。' },
  { t:'微震台网翻遍三十年存档。这颗星的地壳安静得像睡着了,从没有哪一天,容得下一场开膛破肚。' },
  { t:'红外测温:沟底比地表恒定低四度。没有热源,没有冷源。它只是固执地维持着自己的温度。' },
  { t:'一位年轻研究员注意到:沟的走向与自转轴的夹角,恰好等于这颗星的轨道倾角。"巧合,"她在报告里写。然后划掉。又写上。又划掉。' },
  { t:'探空气球放进沟里,风速为零。一千四百公里的峡谷,无风。气象学家拒绝在报告上署名。' },
  { t:'唯一的生物学发现:沟沿十米内的地衣,长势比别处好。没人敢解释为什么。' },
  { t:'报告终稿三百页。结论一页,只有一句:"现有学科无法归类该构造。"' },
  { t:'电台读完报告,沉默半晌:"科学没有失败。科学只是诚实。"', fx:{ rp:300 }, sub:'科研值 +300' },
  // ── 弧三 · 一百种可能 ──
  { t:'第三期改成了热线。第一位听众喊:"陨石!掠射角极小的陨石!"主持人:"没有溅射物。"电话那头想了想:"那……是颗很干净的陨石?"' },
  { t:'第二位是老矿工:"古河床。水走了,河道还在。"地质学家在线摇头:这颗星从未有过液态水。"那就是别的什么流过,"老矿工说,"流过的东西多了。"' },
  { t:'一位保险精算师怀疑这是矿业公司的骗保工程。他算了算成本:挖这道沟的钱,够把整颗星买下来一百次。' },
  { t:'有孩子打来电话:"是不是很大很大的动物,睡觉的时候压出来的?"主持人没有笑。那一晚的来信里,这个解释得票第三。' },
  { t:'退役领航员:"我见过废弃航道的引力残痕。这道疤,像极了什么东西刹车的地方。"' },
  { t:'神学院来信,引用了一句经文:大地的伤口,是它在学着说话。' },
  { t:'一位匿名听众只说了一句就挂断:"你们都在假设它已经完成了。"' },
  { t:'节目统计:两周收到四千一百种解释。电台把它们装订成册,书名《一百种可能》——"一百"是虚指。可能性不数数。' },
  { t:'主持人在卷首语里写:真相只有一个。但在它到场之前,每一种可能都拥有同等的居住权。' },
  { t:'那本册子后来加印了十七次。大多数买主在扉页写同一句话:我的猜想在第几页。', fx:{ inf:20 }, sub:'影响力 +20' },
  // ── 弧四 · 第二道疤 ──
  { t:'间隔四十多天,节目突然加播:卡洛维星区,一颗冰封行星的极地,测绘卫星拍到了第二道疤。' },
  { t:'同样笔直。同样的 V 形剖面。同样的五十二度。' },
  { t:'不同的是长度:两千一百公里。比第一道更长,也更"新"——如果"新旧"这个词还适用的话。' },
  { t:'两颗行星相隔一百四十光年。任何已知文明的工程能力,都够不到这种跨度上的一致。' },
  { t:'恐慌的版本说:这是武器试射的弹道。狂热的版本说:这是邀请函的第二个字。' },
  { t:'有人把两道疤的走向延长,宣布它们平行。三天后,一位中学教师指出了计算错误:不是平行——在极远处,它们会相交。' },
  { t:'"极远处是多远?"主持人问。教师在电话那头翻了很久笔记:"远到那个交点上,什么都不应该存在。"' },
  { t:'各殖民地的测绘卫星全部转向,开始扫描自家行星的每一寸地表。没人说在找什么。所有人都知道在找什么。' },
  { t:'那段时间深空频段安静得反常。后来有人统计,娱乐节目收听率跌了四成——大家都在听同一个频道。' },
  { t:'第四十天,主持人念了一封信:"我不怕疤。我怕的是,我们可能只是疤与疤之间的间隔。"', fx:{ rp:500 }, sub:'科研值 +500' },
  // ── 弧五 · 画疤的人 ──
  { t:'第一道人工疤出现在一颗农业星。三公里长,挖掘机干的,歪歪扭扭。挖它的人说:我只是想离真的近一点。' },
  { t:'模仿者越来越多。他们自称「画疤者」,在自家星球的荒地上,用各种工具刻下自己的直线。' },
  { t:'鉴别真伪成了一门生意。从业者总结出铁律:人工疤会风化,真疤不会;人工疤有起点,真疤——你找不到它从哪一笔开始。' },
  { t:'还有一条没人能解释的鉴别法:真疤在夜里,比白天深零点四毫米。仪器测得出来。理论接不住。' },
  { t:'画疤者的集会上有人宣读章程:"我们不解释疤。我们只练习接受它。"' },
  { t:'一位母亲带着孩子退出了集会。她对采访者说:"他们开始讨论疤选中了谁。可能性一旦排起座次,就死了。"' },
  { t:'某颗星的画疤者挖到第七公里时,挖穿了一条真正的矿脉。教派当场分裂成"天意派"和"巧合派",在矿脉边吵了一整夜。' },
  { t:'电台只为画疤者做过一期节目。结尾主持人说:"他们画的不是疤,是自己心里那道还没有名字的东西。"' },
  { t:'后来官方出了法规:人工疤必须申报备案。表格上有一栏"动机"。大多数人填的是:说不清。' },
  { t:'备案处的职员私下统计过,"说不清"之外,第二多的答案是:万一呢。', fx:{ inf:25 }, sub:'影响力 +25' },
  // ── 弧六 · 直线委员会 ──
  { t:'科学院终于立项,代号「直线委员会」。十一个学科,九十多位研究员,预算够建半座星港。' },
  { t:'第一次全体会议开了六小时,唯一的共识是:把"它是什么",暂时改成"它不是什么"。' },
  { t:'排除清单越列越长:不是侵蚀,不是断层,不是陨击,不是已知武器,不是已知工程,不是已知生物行为,不是测量误差。' },
  { t:'同位素组的报告让会议室的空气结了冰:两道疤的"年龄"彼此矛盾,而且各自内部也矛盾——仿佛时间在沟底打了个结。' },
  { t:'有委员提议封锁消息。主席否决:"可能性属于所有人。我们没有权力替别人害怕。"' },
  { t:'委员会唯一一次接近"突破":有人发现两道疤的深度之比,恰好等于两颗行星的质量之比。复核三遍,成立。从此再没人睡过好觉。' },
  { t:'"等比意味着设计,"年轻委员说。"等比也意味着我们渴望看见设计,"年长的那位说。两句话都进了纪要。' },
  { t:'第二年预算砍半。主席在听证会上只为一件事辩护:观测卫星不能停。"它们还在那儿。我们不看,不等于它们不在。"' },
  { t:'委员会解散那天,办公室搬空了。墙上留着一张没人舍得揭下的星图,图上两道红线,延向远处的同一个点。' },
  { t:'主席的离职信只有一段:"我们没有找到答案。但我们替后来者排除了一万条歧路——这也是答案的一部分。"委员会的残余基金流向,由各殖民地公投。你的列车,也有一票。',
    ask:[
      { label:'投给同位素悖论的后续研究', sub:'科研值 +800', fx:{ rp:800 },
        out:'拨款批文的附言是主席的笔迹:时间打的结,要用更多时间去解。基金更名为"沟底时计"。' },
      { label:'投给观测卫星网的维持运转', sub:'影响力 +30 · 科研值 +400', fx:{ inf:30, rp:400 },
        out:'卫星网又转了二十年。它们没等到新的疤,但等到了三颗彗星、一次超新星和无数个平静的黎明——这些也都被记了下来。' },
      { label:'投给《一百种可能》进校园计划', sub:'影响力 +60', fx:{ inf:60 },
        out:'新版扉页加了一行字:本书没有正确答案,所以每一页都值得怀疑。教师手册建议把这句话考进期末。' } ] },
  // ── 弧七 · 疤底 ──
  { t:'民间远征队接过了委员会的火炬。第一次载人下降,目标:第一道疤的底。' },
  { t:'下降舱走了九公里,声呐显示离底还有九公里。沟的官方深度,从这一天起改成了"待定"。' },
  { t:'十四公里处,探照灯照到沟壁上一段异样的光泽——不是岩石,也不是金属。取样钻头在它表面打滑,像在冰上。但它不冷。' },
  { t:'有队员对着沟底喊了一声。回声回来用了四十一秒——按深度算,应该是三十秒。多出来的十一秒,谁也不认领。' },
  { t:'第三次下降,一名队员的通讯断了五十二小时。救援队找到他时,他坐在下降舱里,仪表完好,氧气充足,像只是睡着了。' },
  { t:'他醒来后只说了一句话,之后再也不提:"下面不是底。下面是另一种还没开始。"' },
  { t:'心理评估说他一切正常。他退出远征队,回老家开了间面包房。据说生意很好。他总在天亮前第一个醒。' },
  { t:'远征队公开了全部数据。有人指责这不负责任,队长回答:"数据没有危险。危险的是只有一个人知道。"' },
  { t:'第六次下降取消在出发前夜——不是因为恐惧。仪器显示,沟底的"待定深度",比上个月浅了四米。' },
  { t:'它在变浅。或者它在生长。或者我们终于学会了测量它。三种说法,电台各播了一遍。', fx:{ inf:30 }, sub:'影响力 +30' },
  // ── 弧八 · 汇点 ──
  { t:'一位业余天文家做了件简单到没人做过的事:把所有已确认的疤——那时是五道——投影到同一张星图上。' },
  { t:'五条延长线,汇于一点。误差小于一个恒星系的直径。' },
  { t:'那一点的坐标,在所有星图上都是空白。没有恒星,没有星云,没有引力异常。一片教科书意义上的"无"。' },
  { t:'论文被三家期刊拒稿,理由相同:结论无法证伪。第四家收了。编辑批注:"无法证伪的事实,仍然是事实。"' },
  { t:'怀疑者说:五个点连什么线都行,人脑天生把噪声看成图案。支持者回答:那请画一张五条线不交汇的版本。没人画得出来。' },
  { t:'汇点被编号为 P-0。深空频段管它叫"那儿"。"那儿"从此成了一个不需要解释的地名。' },
  { t:'各殖民地的望远镜轮流盯着"那儿"。看了一年,什么都没有。"什么都没有"四个字,从没让这么多人睡不着过。' },
  { t:'有公司开始卖"汇点保险",理赔条件:P-0 出现可观测实体。精算师定不出费率。老板拍板:随便定。反正——他顿了顿——万一呢。' },
  { t:'主持人在节目里说:"我们这个物种最了不起的地方,是会为一片空白攒路费。"' },
  { t:'那一年的新生儿,名字里带"汇"的多了三倍。', fx:{ rp:1200 }, sub:'科研值 +1200' },
  // ── 弧九 · 虚空远征 ──
  { t:'远征"那儿"的船命名为「间隔号」——出处是那封信:我们可能只是疤与疤之间的间隔。出发那天,十一个殖民地直播了点火。' },
  { t:'航程十四个月。船员日志第一页贴着一张纸条:无论找到什么,先描述,再命名,最后才允许自己害怕。' },
  { t:'抵达 P-0。望远镜没有说谎:这里什么都没有。恒星的光从四面八方穿过这片空白,谁也不为谁停留。' },
  { t:'搜索第九天,声呐捕捉到一个两米长的物体。静静漂着。无自转,无信标。' },
  { t:'打捞上来,全船安静了。那是一根道钉。被某种巨大的力气掰弯过的、再普通不过的道钉。' },
  { t:'材质分析:与列车文明通用的轨钢同源——同源到化验员怀疑样本被污染。年代测定:比已知最早的轨钢配方,早九千年。' },
  { t:'道钉的弯折角度,经测算,与疤底的 V 形夹角互补。这一条没有写进正式报告。执笔人说:我不敢。' },
  { t:'「间隔号」在 P-0 停留四十天,再无所获。返航前,船长对着空白广播了一句:"我们来过。东西带走了。需要的话,知道去哪儿找我们。"' },
  { t:'没有回应。但全体船员都发誓,广播之后,船舱安静了一瞬——比真空更安静的那种安静。' },
  { t:'道钉装进充氮箱。箱子上贴的不是编号,是船上厨师写的一行字:别怕,它看起来也很累。', fx:{ inf:40 }, sub:'影响力 +40' },
  // ── 弧十 · 轨床假说 ──
  { t:'道钉公开后第三天,一个新假说出现在深空频段,没有署名:疤不是伤口。疤是道床——铺轨之前,预先压实的那道基槽。' },
  { t:'假说推演:每道疤是一段路基;P-0 是道岔;道钉是施工掉落的零件。整个推演只缺一样东西——那辆车。' },
  { t:'按疤的尺寸反推,"那辆车"的轴距比一颗行星的直径还宽。评论区第一条:那么,为它铺轨的,又是什么?' },
  { t:'工程学界联名反驳:荒谬。但反驳文章的结尾松了口:"当然,荒谬只意味着超出我们的工程学。不意味着超出工程学。"' },
  { t:'列车文明对这个假说有种说不清的偏爱。也许因为我们都记得:每一条铁轨铺下去的时候,沿线的小动物也不知道那是什么。' },
  { t:'有孩子在作文里写:可能我们就是沿线的小动物。老师给了满分。批语:愿你见到那班车。' },
  { t:'轨床假说无法验证,也无法埋葬。它和陨石说、河床说、巨兽说、邀请函说排在一起,在《一百种可能》新版里占了第一章——也只是一章。' },
  { t:'道钉巡展到每个殖民地。展柜前人们排着队,大多数人什么都不说,看一会儿,点点头,像在跟什么东西打招呼。' },
  { t:'巡展最后一站,有位老人在留言簿上写:我这辈子等过很多趟车。不差这一趟。' },
  { t:'那页留言,被做成了展览的结束语。', fx:{ rp:1800 }, sub:'科研值 +1800' },
  // ── 弧十一 · 静默年代 ──
  { t:'之后的许多年,再没有新的疤出现。卫星照常扫描。清单停在五道。' },
  { t:'画疤者解散了。最后一次集会,他们把工具埋进自己画的疤里,立了块碑:此处练习过接受。' },
  { t:'"汇点保险"停售,无一理赔。老板把保费全数退还,附言:谢谢各位,陪我赌了一场万一。' },
  { t:'委员会旧址改成了学校。那张没人舍得揭的星图还在墙上,新生入学的第一课,在它底下上。' },
  { t:'面包房老板还是天亮前第一个醒。有熟客问他怕不怕。他说:怕。但面得发,炉得开。日子是道床,我也是。' },
  { t:'道钉在博物馆有了固定展位。展签换了三版,最后一版只有八个字:来历待定,状态良好。' },
  { t:'《缄默之沟》停播了。最后一期没有嘉宾,主持人把四千一百种解释的目录,从头到尾读了一遍。读了六个小时。' },
  { t:'"有人问我难不难过,"他在结尾说,"我说不。问题没有死。它只是不饿了。"' },
  { t:'孩子们的教科书里,疤被放进《未解构造》一章,和球状闪电、快速射电暴排在一起。考试不考。但每年都有学生在这一页折角。' },
  { t:'静默年代被引用最多的一句话,出自某面墙上的无名涂鸦:它不回答,可能因为我们还没问完。', fx:{ inf:50 }, sub:'影响力 +50' },
  // ── 弧十二 · 终点不设站 ──
  { t:'多年后的一次例行航线,一列星际列车——也许就是你的这一列——恰好飞越第一道疤的上空。' },
  { t:'乘务广播提醒乘客向舷窗外看。一千四百公里的直线在云层下缓缓掠过,像大地保存完好的一道旧签名。' },
  { t:'司机说:我信轨床说。不为别的——跑了一辈子车,我认得出路基。哪怕它大得吓人。' },
  { t:'随车工程师说:我押陨石说。宇宙没义务有深意。但它顺手的一笔,确实漂亮。' },
  { t:'厨师说:我站巨兽说,万物都要睡觉,睡相不好很正常。乘务员笑了,没有反驳——名单上每一种可能,都还领着自己的口粮。' },
  { t:'一位小乘客把鼻子贴在舷窗上问:它会不会有一天变成真的铁路?她的母亲想了想,给出了全车最严谨的答案:会,或者不会。' },
  { t:'列车通过疤的正上方时,所有仪表正常。只有一台老式机械罗盘轻轻颤了一下。也可能是轨道接缝。也可能不是。' },
  { t:'飞越用了四分钟。四分钟里,车厢里没有人说话——不是恐惧的那种安静,是教堂和图书馆共用的那种。' },
  { t:'过了疤,广播放了首老歌。歌词大意:终点不设站,旅途自己知道在哪里停。' },
  { t:'乘务日志递到你面前。"备注"一栏,还空着。',
    ask:[
      { label:'写下:轨床说——总有一班车,配得上这条路', sub:'影响力 +120 · 科研值 +2500 · 文明指数 +0.3', fx:{ inf:120, rp:2500, civ:0.3 },
        out:'日志合上的那一刻,你听见车轮压过接缝的声音,比平时郑重了一点。也可能只是错觉。《地疤》——未完,亦不待续。' },
      { label:'写下:陨石说——宇宙随手,亦有笔锋', sub:'影响力 +120 · 科研值 +2500 · 文明指数 +0.3', fx:{ inf:120, rp:2500, civ:0.3 },
        out:'后来有研究员引用了你这句备注作论文题记。审稿人没有删。《地疤》——未完,亦不待续。' },
      { label:'写下:巨兽说——愿它睡得安稳', sub:'影响力 +120 · 科研值 +2500 · 文明指数 +0.3', fx:{ inf:120, rp:2500, civ:0.3 },
        out:'那一页日志被后来的乘务员画了只趴着的小兽。没人擦掉它。《地疤》——未完,亦不待续。' },
      { label:'留白——这一栏属于下一班车', sub:'影响力 +120 · 科研值 +2500 · 文明指数 +0.3', fx:{ inf:120, rp:2500, civ:0.3 },
        out:'你把笔帽合上。空白有空白的体面——所有可能性,都还活着。《地疤》——未完,亦不待续。' } ] },
];

/* ============================================================
   小行星带与海盗基地(随机生成 · 被毁后 10-30 分钟易地重建)
   ============================================================ */
const PIRATE_RESPAWN_MIN = 600, PIRATE_RESPAWN_MAX = 1800;   // 秒
function beltOf(sys){                       // 约四成星系有小行星带;半径取行星轨道间最大空隙的中点
  const h = hashStr(sys.id + ':belt');
  if (h % 10 >= 4) return null;
  const orbits = planetsOf(sys.id).filter(p => !p.moonOf).map(p => p.orbitR).sort((a, b) => a - b);
  if (orbits.length < 2) return null;
  let bi = 0, bg = 0;
  for (let i = 0; i < orbits.length - 1; i++){
    const gap = orbits[i + 1] - orbits[i];
    if (gap > bg){ bg = gap; bi = i; }
  }
  if (bg < 8) return null;                  // 空隙太窄塞不下带
  return { r: (orbits[bi] + orbits[bi + 1]) / 2, width: Math.min(6, bg * 0.35), seed: h };
}
const PIRATE_WRECK_SEC = 3600;        // 残骸场回收期:1 小时(每趟受货舱限,可多次往返)
const PIRATE_RUN_SEC = [26, 38];      // 突击航线航时区间(秒)
const PIRATE_INTERCEPTS = [ { at: 0.45, p: 0.35 }, { at: 0.8, p: 0.6 } ];   // 拦截判定点:越近基地概率越大
function pirateWreckOf(sysId){
  const w = save.pirateWreck && save.pirateWreck[sysId];
  if (!w) return null;
  if (Date.now() > w.until || !Object.values(w.pool).some(v => v > 0.5)){ delete save.pirateWreck[sysId]; return null; }
  return w;
}
/* ── 海盗巢穴战役:剥洋葱三阶段(外围清扫 → 压制阵地 → 巢穴核心),期间可返航补给 ── */
const PIRATE_PHASE_DEFS = {
  sweep:   { name:'外围清扫', icon:'◌', intro:'巢穴外围警戒圈 —— 掠袭艇与蜂群在碎石间游弋,先撕开缺口', say:'Perimeter hostiles engaged.' },
  siege:   { name:'压制阵地', icon:'◍', intro:'警戒圈已破 —— 防御炮台与破城炮舰组成第二道火力网,逐台压制', say:'Suppressing defensive emplacements.' },
  elite:   { name:'精锐拦截', icon:'◈', intro:'巢穴倾巢而出 —— 精英护卫舰队携词缀强化压上,这是他们最后的机动兵力', say:'Elite squadron engaging.' },
  warlord: { name:'督军旗舰', icon:'♛', intro:'海盗督军的私人旗舰横在巢穴前 —— 击沉它,巢穴再无指挥', say:'Warlord flagship on scope.' },
  core:    { name:'巢穴核心', icon:'●', intro:'火力网瘫痪 —— 基地本体暴露,这是最硬的一层', say:'Final assault on the stronghold core.' },
};
/* 战役层数随危险度:h≤3 三层;h4 四层(+精锐);h≥5 五层(+精锐+督军 Boss) */
function pirateCampaign(sys){
  const h = Math.min(6, Math.max(1, sys.hazard));
  const keys = h >= 5 ? ['sweep','siege','elite','warlord','core']
             : h >= 4 ? ['sweep','siege','elite','core']
             : ['sweep','siege','core'];
  return keys.map(k => ({ key: k, ...PIRATE_PHASE_DEFS[k] }));
}
function piratePhaseOf(sysId){
  return (save.pirateOps && save.pirateOps[sysId] && save.pirateOps[sysId].phase) || 0;
}
function pirateAlive(sysId){
  const sys = sysById(sysId);
  if (!sys || !beltOf(sys)) return false;
  if (!REGIONS[regionOf(sys)].hpS) return false;       // 安全区无海盗
  const t = save.pirates && save.pirates[sysId];
  return !t || Date.now() >= t;
}
function pirateRespawnLeft(sysId){
  const t = save.pirates && save.pirates[sysId];
  return t ? Math.max(0, Math.ceil((t - Date.now()) / 1000)) : 0;
}

/* ============================================================
   新手战斗(《遥远的地球之歌》事件推进触发)+ 任务地点绑定
   敌人=脱轨小行星;击毁留残骸,回收矿物/科研值
   ============================================================ */
const TUT_ENEMIES = {
  rockS: { name:'碎屑陨星', hp:34,  atk:4,  prefer:null, icon:'◦', desc:'松散的碎石团,撞击微弱但成群结队' },
  rockM: { name:'陨星核',   hp:85,  atk:8,  prefer:null, icon:'☄', desc:'致密的金属核体,够格称为一次撞击警报' },
};
const TUT_RAIDS = {      // 主线读完第 N 章 → 碎石群切入沧澜轨道
  2:  { comp:['rockS','rockS'],                 stage:1 },
  6:  { comp:['rockS','rockM','rockS'],         stage:2 },
  12: { comp:['rockM','rockM','rockS','rockS'], stage:3 },
};
const TUT_LOOT = {       // 残骸回收(胜利结算,叠加常规战利品)
  1: { metal:300,  chem:80,  rp:150 },
  2: { metal:700,  chem:200, rp:400 },
  3: { metal:1500, chem:450, rp:900 },
};
const TUT_SCALE = { hpS:0.9, atkS:0.7, loot:0.5 };   // 新手战强度(温和;loot 字段与 REGIONS 对齐,旧 lootS 曾致 NaN)

/* 任务地点绑定:剧情就绪后,需停靠对应星系才能接收;行星用于图标定位 */
const QUEST_AT = {
  main: Array.from({length: 26}, (_, i) => 'kenxi/' + ([6, 18, 19].includes(i) ? 'linyuan' : 'canglan')),
  side: 'kenxi/linyuan',
  port: 'kenxi/canglan',
};
const QUEST_COLORS = { main:'#22d3ee', side:'#8b5cf6', port:'#f59e0b', scar:'#7fd6c9' };
