/* ============================================================
   星垦 · 银河纪元 — 数据层
   开发等级 / 资源 / 银河系 10 星系 / 行星(手作 + 程序生成)/ 剧情
   ============================================================ */

/* ── 开发阶段:阈值单位 = 开发点(1 点 = 1 真实秒 × 宜居度系数) ── */
const LEVELS = [
  { name: '未开发',   th: -1 },
  { name: '前哨站',   th: 0 },
  { name: '聚居点',   th: 300 },
  { name: '殖民地',   th: 1800 },
  { name: '行星都市', th: 14400 },
  { name: '生态文明', th: 86400 },
];
const MAX_LEVEL = 5;

const POP_MILESTONES = [0, 200, 5e3, 2e5, 2e8, 5e9, 1.2e10];
const RES_MILESTONES = [0, 50, 2e3, 8e4, 3e6, 8e7];
const RES_RATE_MAX = 1200;

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
  { id:'zhulong', name:'烛龙', en:'ZHULONG', star:'M 型红矮星', pos:[5,3],
    hazard:1, rich:1.2, bias:'metal', n:[3,4], req:{},
    sunCol:[[0.9,0.25,0.1],[1.0,0.55,0.3]], nodeCol:'#ff7a55',
    desc:'离垦曦最近的红矮星,昏暗的红光下藏着重元素异常富集的岩石行星带。第一条采矿航线的天然终点。' },
  { id:'zhiyue', name:'织月', en:'ZHIYUE', star:'K 型橙矮星 · 双星', pos:[-6,2],
    hazard:1, rich:1.15, bias:'chem', n:[3,4], req:{},
    sunCol:[[1.0,0.5,0.18],[1.0,0.75,0.45]], nodeCol:'#ffb070',
    desc:'一对互相缠绕的橙矮星。双星引力把行星大气搅成永不停歇的风暴织机,大气化合物在云层里以工业品位沉积。' },
  { id:'shuanghuan', name:'霜环', en:'FROSTRING', star:'F 型黄白星', pos:[3,-8],
    hazard:2, rich:1.3, bias:'ice', n:[4,5], req:{engine:2},
    sunCol:[[0.85,0.85,0.95],[1.0,0.97,0.85]], nodeCol:'#cfe0ff',
    desc:'雪线以外挤满冰巨星与碎冰带,环系在星光下像叠起来的银戒指。采冰船队眼中的应许之地。' },
  { id:'chichao', name:'赤潮', en:'REDTIDE', star:'红巨星', pos:[-9,-6],
    hazard:2, rich:1.35, bias:'he3', n:[3,4], req:{engine:2},
    sunCol:[[0.95,0.2,0.08],[1.0,0.5,0.25]], nodeCol:'#ff5540',
    desc:'垂暮的红巨星正缓慢吞噬内行星,膨胀的外层大气是一座敞开的氦-3 矿。在恒星的葬礼上拾取薪火。' },
  { id:'mingsha', name:'鸣沙', en:'MINGSHA', star:'G 型黄矮星', pos:[12,-2],
    hazard:3, rich:1.45, bias:'metal', n:[4,5], req:{engine:3},
    sunCol:[[1.0,0.6,0.2],[1.0,0.9,0.55]], nodeCol:'#ffd080',
    desc:'行星际尘埃浓得能听见——撞击航线护盾时像沙暴掠过车窗。尘埃来自一颗碎裂的金属行星,矿藏与危险等量齐观。' },
  { id:'cangwu', name:'苍梧', en:'CANGWU', star:'G 型黄矮星', pos:[-4,13],
    hazard:2, rich:1.2, bias:'hab', n:[4,5], req:{engine:3, civ:10},
    sunCol:[[1.0,0.6,0.2],[1.0,0.93,0.62]], nodeCol:'#9fe8c0',
    desc:'勘测档案标记为「第二摇篮」:不止一颗行星位于宜居带内。若垦曦是家,苍梧就是人类写给银河的第二行字。' },
  { id:'xuanshu', name:'玄枢', en:'XUANSHU', star:'中子星', pos:[15,9],
    hazard:4, rich:1.6, bias:'deut', n:[3,4], req:{engine:4},
    sunCol:[[0.5,0.65,1.0],[0.85,0.92,1.0]], nodeCol:'#7fa8ff',
    desc:'一颗以毫秒为脉搏的中子星。潮汐撕碎过路天体,也把氘像盐一样撒满整个星系。靠近它,仪表盘会先于人心跳加速。' },
  { id:'baiju', name:'白驹', en:'BAIJU', star:'B 型蓝白星', pos:[-16,-12],
    hazard:4, rich:1.7, bias:'he3', n:[3,4], req:{engine:4},
    sunCol:[[0.55,0.7,1.0],[0.9,0.95,1.0]], nodeCol:'#9fc4ff',
    desc:'年轻而暴烈的蓝白星,恒星风把行星大气剥成长长的彗尾。高能粒子流里淘金的人,赚的是文明的快钱。' },
  { id:'hengyao', name:'衡曜', en:'HENGYAO', star:'古老 G 型星 · 银心侧', pos:[2,26],
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
};
// [id, name, 星类, pos, hazard, rich, bias, 引擎需求, desc]
const EXTRA_SYSTEMS = [
  ['halcyon','Halcyon','f',[29,5],3,1.6,'ice',5,'风平浪静得反常的星域,冰环在白光下纹丝不动。老船员说,太安静的地方,要么真安全,要么有东西在听。'],
  ['noctis','Noctis','wd',[-13,27],3,1.6,'deut',5,'白矮星的光像一盏临终的灯。行星永远处于深蓝色的黄昏里,氘冰在暮色中缓慢结晶。'],
  ['aurelia','Aurelia','k',[-29,-11],3,1.7,'metal',5,'橙矮星把一切镀成金色。小行星带的金属丰度高得离谱——这里曾经也许有过一颗行星,现在它是矿。'],
  ['vesper','Vesper','bin',[16,-28],3,1.8,'chem',5,'一对互绕的恒星,每十一天交食一次。大气行星的化合物云在双重日落下呈现出无法命名的颜色。'],
  ['meridian','Meridian','g',[25,25],4,1.9,'he3',6,'与垦曦惊人相似的黄矮星——只是这里的气巨多了一倍。氦-3 矿团叫它"正午",因为产量永远在峰值。'],
  ['caldera','Caldera','rg',[-35,13],4,1.9,'metal',6,'红巨星膨胀时熔毁了内行星,留下一圈凝固的金属熔渣带。采矿船在恒星的余烬里淘洗。'],
  ['thule','Thule','m',[-13,-36],4,2.0,'ice',6,'古地图把世界尽头标作 Thule。红矮星微弱的光照不化任何东西——整个星系是一座天然冷库。'],
  ['cinder','Cinder','m',[34,-20],4,2.1,'metal',6,'恒星耀斑反复炙烤着近轨行星,地壳被烧成了富金属的烬层。窗口期很短,收益很高。'],
  ['lyra','Lyra','a',[7,42],4,2.2,'chem',7,'白星的光经过气巨环系折射,在舷窗上拉出竖琴弦一样的光痕。化合物云层深处有规律的闪电。'],
  ['orpheus','Orpheus','ns',[-44,-4],4,2.3,'deut',7,'中子星每秒自转七百次。靠得太近的人说,能在仪表噪声里听见歌声——回头的人,什么也没带回来。'],
  ['sable','Sable','b',[15,-42],4,2.4,'he3',7,'蓝白星的辐射把行星大气剥得只剩贴地一层。黑色的地表吸收一切光——除了采集站的灯。'],
  ['aquila','Aquila','b',[43,20],5,2.5,'he3',8,'年轻的蓝白星群,恒星风像鹰的俯冲。高能粒子流是最好的氦-3 富集器,也是最坏的航线天气。'],
  ['borealis','Borealis','f',[-38,31],5,2.6,'ice',8,'整个星系笼罩在一片发光的尘埃极光里。冰巨星的环在极光中若隐若现,美得让护航员分心。'],
  ['seraph','Seraph','a',[-29,-41],5,2.7,'deut',8,'六颗行星排成近乎完美的共振链,像某种刻意的排列。勘测报告用了一个不科学的词:神迹。'],
  ['erebus','Erebus','ns',[-5,53],5,2.8,'deut',9,'幽暗的中子星域,监听阵列在这里收到过三次无法解码的窄带信号。氘储量全银河第二,没人问第一名为什么空着。'],
  ['quintessa','Quintessa','bin',[-49,-23],5,2.9,'chem',9,'五体引力系统,航线计算要精确到秒。化合物丰度是教科书级的——前提是你能活着把货装满。'],
  ['solstice','Solstice','rg',[42,-35],5,3.0,'he3',9,'垂死的红巨星正在最后的膨胀期。它的外层大气是一片无边的氦海——文明的薪柴,恒星的遗产。'],
  ['avalon','Avalon','g',[30,51],6,3.2,'hab',10,'传说中的应许之地:三颗行星同时位于宜居带。距离是唯一的考验——只有最强的引擎配得上它。'],
  ['outremer','Outremer','wd',[-60,5],6,3.3,'metal',10,'"海外之地"。白矮星周围的行星残骸带是整个旋臂最富的金属矿场,也是袭击者舰队的母港。'],
  ['terminus','Terminus','ns',[11,-61],6,3.5,'deut',10,'已知航图的最后一站。轨道上漂浮着锈蚀的巨型环状结构——像一座废弃的车站。深空监听站的备注只有一句:它在等下一班车。'],
];
for (const [id, name, cls, pos, hazard, rich, bias, eng, desc] of EXTRA_SYSTEMS){
  const c = STAR_CLASSES[cls];
  SYSTEMS.push({ id, name, en:name.toUpperCase(), star:c.star, pos, hazard, rich,
    bias, n: hazard >= 5 ? [4,6] : [3,5], req:{ engine: eng },
    sunCol:c.sun, nodeCol:c.node, desc });
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
  { name:'近域',   maxD:12,       hpS:1.0, atkS:1.0, loot:1  },
  { name:'边域',   maxD:26,       hpS:1.8, atkS:1.5, loot:4  },
  { name:'深空',   maxD:45,       hpS:3.2, atkS:2.3, loot:12 },
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
    unlock:[ {planetLv:{id:'canglan', lv:3}} ],
    radius:0.45, orbitR:16,  period:26,  tilt:0.03, habit:0.30, au:0.31,
    seed:3.1, c1:[0.32,0.22,0.18], c2:[0.55,0.33,0.2], c3:[0.16,0.1,0.09],
    atmo:[1.0,0.45,0.2], atmoS:0.25,
    desc:'距恒星最近的灼热岩石世界,向阳面温度足以熔化铅。岩浆翻涌将地核重元素带至浅层——全系品位最高的稀有金属矿脉。只有殖民地级的工业体系,才造得出能在这里存活的采矿设备。' },
  { id:'shamu',   name:'纱幕', type:'温室行星', shader:'venus',
    role:'res', res:{ key:'chem', rich:0.9 },
    unlock:[ {story:2}, {planetLv:{id:'canglan', lv:3}} ],
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
    unlock:[ {planetLv:{id:'canglan', lv:3}} ],
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
    const radius = shader==='gas' ? 1.8+rng()*1.4 : shader==='ice' ? 1.2+rng()*0.8 : 0.4+rng()*0.6;
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
  engine:  { name:'动力车头', en:'LOCOMOTIVE',
    desc:'列车的核心聚变堆与曲率帆。升级引擎可提升航速,并解锁更远的星系航线。' },
  cargo:   { name:'货运车厢', en:'CARGO',  cap:800,
    desc:'标准化货舱。基础装载 800/节,容量随引擎等级几何增长(×2.5/级),决定每次靠站能收取多少资源。' },
  weapon:  { name:'武器平台', en:'WEAPON',
    desc:'装甲化武器底座,可安装并升级一门列车武器,用于击退航线上的袭击者。' },
  habitat: { name:'生活舱段', en:'HABITAT', cdRed:30, def:18,
    desc:'乘员轮换与医疗舱。收取冷却 -30 秒,乘员协防使列车防御 +18。' },
  eng:     { name:'工程舱段', en:'ENGINEERING', collectBuff:0.15,
    desc:'移动精炼线。靠站收取资源时现场提纯,收取量 +15%。' },
};

const WEAPONS = {
  autogun: { name:'机关炮', en:'AUTOMATIC GUN', fp:20,
    desc:'高射速弹幕武器,可靠的近程防御网。出厂即可装备。',
    unlock:null, base:{ metal:300 } },
  laser:   { name:'激光炮', en:'LASER CANNON', fp:38,
    desc:'高伤害定向能武器,需要充能间隙。射线在尘埃带里会划出一条笔直的霞光。',
    unlock:{ planet:'kenxi/jinyan', lv:2, text:'烬岩 达到「聚居点」(稀有金属工业)' },
    base:{ metal:1500, he3:400 } },
  missile: { name:'导弹井', en:'MISSILE LAUNCHER', fp:58,
    desc:'垂直发射井,追踪导弹造成大范围杀伤。可锁定攻击多个目标。',
    unlock:{ planet:'kenxi/shamu', lv:2, text:'纱幕 达到「聚居点」(化合物推进剂)' },
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
function slotsByDev(sumAll){ return Math.min(8, 3 + Math.floor(sumAll / 5)); }
const SLOT_RULE_TEXT = '全银河星球开发等级和每 +5,列车可挂载车厢 +1(上限 8 节)';

/* 新购车厢花费(按购入后的总节数) */
const CAR_COSTS = {
  4: { metal:800 },
  5: { metal:4e3,  chem:1.2e3 },
  6: { metal:2e4,  ice:6e3 },
  7: { metal:1e5,  he3:2.5e4 },
  8: { metal:5e5,  deut:1.2e5 },
};

/* 引擎升级(LV6+ 解锁深空扩展星系) */
const ENGINE_MAXLV = 10;
const ENGINE_COSTS = {
  2:  { metal:1e3 },
  3:  { metal:6e3,   ice:2e3 },
  4:  { metal:4e4,   he3:1.2e4 },
  5:  { metal:2.5e5, deut:6e4 },
  6:  { metal:1.2e6, he3:4e5 },
  7:  { metal:6e6,   ice:2e6 },
  8:  { metal:3e7,   chem:8e6 },
  9:  { metal:1.5e8, deut:4e7 },
  10: { metal:8e8,   he3:2e8, deut:1e8 },
};
function engineSpeed(lv){ return 2.0 * (1 + 0.6 * (lv - 1)); }   // 银河单位 / 分钟

/* 收取冷却(秒) */
const COLLECT_CD_BASE = 180;

/* ============================================================
   殖民区划与建筑 — 殖民地深度玩法
   区划:圈定在星球表面的功能分区,随开发等级自动开辟(LV n = n 个区划位)
   建筑:图鉴列表,条件满足后在对应区划内自动排队建造
   列车驻留本星系 = 商贸加速(建设 ×2);注资可立即完工
   ============================================================ */
const DISTRICT_MAX = 5;            // 区划位上限 = 最高开发等级
const BUILDS_PER_DISTRICT = 2;     // 每个区划容纳建筑数

const DISTRICT_TYPES = {
  habitation: { name:'民生区', color:'#3ecf8e', col3:[0.24,0.81,0.56], investRes:'chem',
    desc:'居住穹顶与生活设施,承载人口与乘员类建筑' },
  industry:   { name:'工业区', color:'#f59e0b', col3:[0.96,0.62,0.04], investRes:'ice',
    desc:'采掘与精炼集群,承载产能类建筑' },
  arsenal:    { name:'军工区', color:'#ef4444', col3:[0.94,0.27,0.27], investRes:'he3',
    desc:'军事工业带,承载武器与防御类建筑' },
  research:   { name:'科研区', color:'#22d3ee', col3:[0.13,0.83,0.93], investRes:'deut',
    desc:'实验室阵列,承载文明与引擎类建筑' },
  trade:      { name:'商贸区', color:'#8b5cf6', col3:[0.55,0.36,0.96], investRes:null,
    desc:'星港与市场,承载物流与贸易类建筑' },
};
// 区划自动开辟的类型倾向(按星球角色)
const DISTRICT_PREF = {
  hab: ['habitation','trade','research','industry','arsenal'],
  res: ['industry','arsenal','trade','research','habitation'],
};

/* 建筑图鉴:cond = 解锁条件;fx = 效果
   fx 键:cap 本星人口上限 / prod 本星产率 / amt 收取量 / cargo 货舱
          wcost 武器费率 / ecost 引擎费率 / cd 收取冷却减秒 / loot 战利品
          civ 文明指数 / def 列车防御 / crew 可招募乘员(车组系统预留) */
const BUILDINGS = {
  /* 民生区 */
  dome:       { name:'穹顶居住群',   district:'habitation', time:600,
    cond:{role:'hab', lv:2}, fx:{cap:0.12},  desc:'本星人口上限 +12%' },
  medbay:     { name:'再生医疗中心', district:'habitation', time:900,
    cond:{role:'hab', lv:3}, fx:{cap:0.10},  desc:'本星人口上限 +10%' },
  academy:    { name:'乘员训练营',   district:'habitation', time:1200,
    cond:{lv:3, civ:8},      fx:{crew:1},    desc:'培养 1 名列车乘员(车组系统筹备中)' },
  /* 工业区 */
  mine:       { name:'自动化矿场',   district:'industry', time:600,
    cond:{role:'res', lv:2}, fx:{prod:0.15}, desc:'本星资源产率 +15%' },
  refinery:   { name:'行星精炼厂',   district:'industry', time:900,
    cond:{role:'res', lv:3}, fx:{amt:0.08},  desc:'列车收取量 +8%(全银河)' },
  elevator:   { name:'轨道电梯',     district:'industry', time:1500,
    cond:{lv:4},             fx:{cargo:0.10},desc:'列车货舱容量 +10%(全银河)' },
  /* 军工区 */
  ammo:       { name:'弹药联合工厂', district:'arsenal', time:600,
    cond:{lv:2},             fx:{wcost:0.12},desc:'武器安装/升级费 -12%(可叠加,下限 50%)' },
  foundry:    { name:'聚变弹头铸造坊', district:'arsenal', time:900,
    cond:{lv:3},             fx:{loot:0.10}, desc:'遭遇战战利品 +10%' },
  fortress:   { name:'轨道防御平台', district:'arsenal', time:1500,
    cond:{lv:4},             fx:{def:10},    desc:'列车防御 +10(全银河)' },
  /* 科研区 */
  observatory:{ name:'深空天文台',   district:'research', time:600,
    cond:{lv:2},             fx:{civ:0.15},  desc:'文明指数 +0.15' },
  enginst:    { name:'引擎研究所',   district:'research', time:1200,
    cond:{lv:3},             fx:{ecost:0.10},desc:'引擎升级费 -10%(可叠加,下限 50%)' },
  lab:        { name:'量子实验室',   district:'research', time:1500,
    cond:{lv:4, civ:10},     fx:{civ:0.30},  desc:'文明指数 +0.30' },
  /* 商贸区 */
  port:       { name:'自由贸易港',   district:'trade', time:600,
    cond:{lv:2},             fx:{cd:15},     desc:'收取冷却 -15 秒(全银河)' },
  bazaar:     { name:'星港集市',     district:'trade', time:900,
    cond:{lv:3},             fx:{amt:0.08},  desc:'列车收取量 +8%(全银河)' },
  clearing:   { name:'星际清算所',   district:'trade', time:1500,
    cond:{lv:4, civ:12},     fx:{loot:0.10, civ:0.10}, desc:'战利品 +10% · 文明指数 +0.10' },
};

/* ============================================================
   列车遭遇战 — 回合制自走棋(部署指令 → 自动结算)
   敌方会针对性攻击车厢:炮塔 / 车头引擎 / 随机
   ============================================================ */
const CAR_HP = { engine:130, cargo:75, weapon:85, habitat:95, eng:80 };

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
  laser:   { mode:'crit',   note:'单发全额伤害,25% 概率暴击 ×1.6' },
  missile: { mode:'splash', note:'主目标全额伤害,其余敌舰溅射 35%' },
};

/* ============================================================
   互动剧本《来自地球的歌》 + 支线《索拉里斯之海》(原版保留)
   ============================================================ */
const STORY = [
  { title:'苏醒', eyebrow:'信号 01 / 08 · 抵达第 7 年',
    body:[ '播种船「晨昏号」的休眠舱在沧澜轨道上依次开启。舷窗外是一整面温暖的海洋——没有大陆,只有几条火山岛弧像绿色的省略号,写在无边的蓝色之间。',
      '聚居点已由先遣 AI 在最大的岛弧上建成。但唤醒序列的能源只够优先一批人。' ],
    choices:[
      { label:'优先唤醒工程团队', sub:'全系前哨 · 时间跃迁 +15 分钟', fx:{ jump:{scope:'all', sec:900} },
        out:'工程师们在四十八小时内让所有前哨的产能翻了一番。文明的齿轮开始加速咬合。' },
      { label:'优先唤醒农艺与医疗团队', sub:'沧澜 · 时间跃迁 +45 分钟', fx:{ jump:{scope:'kenxi/canglan', sec:2700} },
        out:'第一季作物比预期提前成熟。沧澜的聚居点亮起了更多窗口的灯。' } ] },
  { title:'第一缕讯号', eyebrow:'信号 02 / 08 · 量子信标',
    body:[ '深空信标捕获到一段微弱的相干信号——发自四个世纪前的地球方向。解码后不是数据,不是指令。',
      '是音乐。一首你们这代人从未听过的歌。' ],
    choices:[
      { label:'向全体殖民者公开播放', sub:'永久 · 人口上限 +10%', fx:{ cap:1.10 },
        out:'那天晚上,整个聚居点的人都站在穹顶下听完了它。九个月后,沧澜迎来一波婴儿潮。' },
      { label:'录入档案馆,择期公布', sub:'永久 · 资源产率 +10%', fx:{ rate:1.10 },
        out:'议会决定先稳住生产。但档案馆的管理员每晚都会偷偷播放一遍——隔着玻璃,矿区的灯火彻夜未熄。' } ] },
  { title:'冰下之声', eyebrow:'信号 03 / 08 · 凛渊轨道',
    body:[ '凛渊的冰壳下传来规律的低频震荡。不是地质活动——频谱太干净了。',
      '科学组分成两派:一派认为是冰层共振的自然现象,另一派坚持那是某种回应。' ],
    choices:[
      { label:'派出深潜无人器查证', sub:'全系前哨 · 时间跃迁 +30 分钟', fx:{ jump:{scope:'all', sec:1800} },
        out:'无人器带回的只有冰晶生长的声音。但为此研发的深潜技术,让所有矿业前哨受益。' },
      { label:'保持距离,持续监听', sub:'永久 · 文明指数 +0.3', fx:{ civ:0.3 },
        out:'你们没有惊动它——无论"它"是什么。这份克制本身,被写进了殖民地的第一部伦理法典。' } ] },
  { title:'大撤离的真相', eyebrow:'信号 04 / 08 · 解码完成',
    body:[ '信号的后续片段被完整解码:太阳氦闪前的最后一千年,地球向所有方向发射了上千艘播种船。',
      '「晨昏号」不是先驱,而是其中最普通的一艘。你们的母星,在你们沉睡的途中已经不存在了。' ],
    choices:[
      { label:'向全体公民公布真相', sub:'永久 · 文明指数 +0.5', fx:{ civ:0.5 },
        out:'哀悼日持续了一周。然后人们回到岗位——这一次,不再是为了"等待返航",而是为了在这里扎根。' },
      { label:'暂缓公布,先巩固殖民地', sub:'全系前哨 · 时间跃迁 +30 分钟', fx:{ jump:{scope:'all', sec:1800} },
        out:'议会选择让建设的节奏盖过流言。真相在半年后随纪念碑一起公布——那时,已没有人想回去了。' } ] },
  { title:'摇篮曲', eyebrow:'信号 05 / 08 · 第二段录音',
    body:[ '新解码的片段是一段儿童合唱,录制于地球最后的世纪。歌词的语言已经无人使用,但曲调被沧澜的母亲们学会了。',
      '现在它在每一个育婴舱里循环播放。' ],
    choices:[
      { label:'将它定为殖民地的摇篮曲', sub:'永久 · 人口上限 +8%', fx:{ cap:1.08 },
        out:'人口统计署注意到一个现象:听着地球摇篮曲长大的第一代孩子,把沧澜叫做"家",把地球叫做"老家"。' },
      { label:'鼓励创作沧澜自己的歌', sub:'全系前哨 · 时间跃迁 +20 分钟', fx:{ jump:{scope:'all', sec:1200} },
        out:'第一首本土民谣诞生在矿区夜班的休息舱里,歌词是关于双月和氦-3 罐车的。它很快传遍了全系。' } ] },
  { title:'远行者', eyebrow:'信号 06 / 08 · 星系边缘',
    body:[ '另一艘播种船的尾焰掠过星系外缘——「曙光号」,目的地是更远的一颗橙矮星。',
      '它没有减速,也没有回应呼叫。按航程计算,它的乘员还要沉睡三百年。' ],
    choices:[
      { label:'向它发送完整星图与讯号档案', sub:'永久 · 资源产率 +12%', fx:{ rate:1.12 },
        out:'为了把定向天线功率提上去,工程组顺手重构了全系的能源网。三百年后某个清晨,会有人因为你们的星图少走十年弯路。' },
      { label:'静默目送,不打扰它的航程', sub:'全系前哨 · 时间跃迁 +1 小时', fx:{ jump:{scope:'all', sec:3600} },
        out:'你们看着那个光点消失在猎户臂的尘埃里。然后转身,把省下的天线预算投进了轨道船坞。' } ] },
  { title:'最后的歌', eyebrow:'信号 07 / 08 · 讯号终止',
    body:[ '地球方向的信号在今天凌晨归于平直。最后传来的是一段钢琴独奏,弹奏者在结尾即兴加了十几个小节——不属于任何已知曲谱。',
      '天文台确认:那是氦闪抵达前,地球发出的最后一段电磁波。' ],
    choices:[
      { label:'全系静默一分钟,然后继续建设', sub:'全系前哨 · 时间跃迁 +2 小时', fx:{ jump:{scope:'all', sec:7200} },
        out:'静默结束的钟声敲响时,七颗星球的工地同时复工。没有什么纪念方式,比把文明延续下去更郑重。' },
      { label:'将最后十几个小节补写成完整的曲子', sub:'跃迁 +90 分钟 · 文明指数 +0.2', fx:{ jump:{scope:'all', sec:5400}, civ:0.2 },
        out:'三百位市民提交了续写版本。最终入选的那一首,后来成了垦曦星系的非正式系歌。' } ] },
  { title:'新的歌', eyebrow:'信号 08 / 08 · 尾声',
    body:[ '议会通过决议:启用「晨昏号」的残骸建造深空广播阵列,把沧澜的歌——连同地球的歌——朝一千个方向播出去。',
      '某一天,某颗陌生行星的天空下,会有人听到你们。就像你们听到地球那样。',
      '——《来自地球的歌》 完' ],
    choices:[
      { label:'按下广播键', sub:'永久 · 文明指数 +1.0 · 人口与产率 +5%', fx:{ civ:1.0, cap:1.05, rate:1.05 },
        out:'广播阵列的第一束信号离开天线时,你正站在沧澜的夜面。脚下,城市的灯光连成了星座。' } ] },
];
const STORY_GAP = 30000;

const SIDE_STORY = [
  { title:'模仿体', eyebrow:'异常讯号 01 / 03 · 凛渊冰下',
    body:[ '凛渊轨道站报告:监听阵列收到了一段信号——是三天前无人潜航器自己发出的遥测包,被原样"复述"了回来。',
      '不,不是原样。校验和不对。有人逐帧比对后发现,数据里多出的部分,拼起来像一段没有学会语法的语言。冰下的海洋,在试着说话。或者只是在做梦。' ],
    choices:[
      { label:'建立对话实验组,持续回送信号', sub:'永久 · 文明指数 +0.3', fx:{ civ:0.3 },
        out:'实验持续了四十天。海洋复述了你们发去的一切——数学、音乐、问候语——但从不回答问题。语言学家在报告末尾写道:它不是在交流,它是在镜映。' },
      { label:'隔离频段,仅做被动监听', sub:'全系前哨 · 时间跃迁 +30 分钟', fx:{ jump:{scope:'all', sec:1800} },
        out:'议会把节省下来的算力拨给了工程网络。但监听员们私下都留着一份那段"复述"的拷贝——夜班的时候,有人会戴上耳机听一会儿。' } ] },
  { title:'访客', eyebrow:'异常讯号 02 / 03 · 轨道站',
    body:[ '凛渊轨道站的值班工程师申请紧急轮换。他声称在休眠舱走廊见到了自己的妹妹——她留在了地球,死于四个世纪前。',
      '脑扫描显示他睡眠期间的海马体活动被某种外源信号反复读取、重构。站内另有两人报告了类似的"访客"。心理学组组长凯文主动请缨驻站。' ],
    choices:[
      { label:'撤离全部驻站人员,改为无人化运作', sub:'永久 · 人口上限 +8%', fx:{ cap:1.08 },
        out:'撤离令下达那天,没有人反对,也没有人立刻动身——每个人都在走廊里多站了一会儿。后来制定的《深空驻站心理保护条例》,让所有殖民地的轮换制度都更人道了。' },
      { label:'批准凯文驻站,正面研究"访客"现象', sub:'永久 · 文明指数 +0.4', fx:{ civ:0.4 },
        out:'凯文驻站九十天,见到了他想见的人,也学会了与之告别。他的结题报告只有一句话被公开:"它读取我们的伤口,不是因为恶意,而是因为那是我们脑海里最深的刻痕。"' } ] },
  { title:'对称体', eyebrow:'异常讯号 03 / 03 · 终章',
    body:[ '今天凌晨,凛渊的冰壳裂开了一道三百公里的缝。海洋从裂隙中升起一座完全对称的晶体结构——尖塔、回廊、不断自我复制的几何,像一座在数学里生长的城市。',
      '它存在了六个小时,没有回应任何信号,然后自行崩解,沉回冰下。监听阵列从此再没有收到过"复述"。',
      '它来过,展示过,然后离开了。你们始终不知道那是问候、告别,还是仅仅——存在本身。' ],
    choices:[
      { label:'将凛渊冰下海域划为永久保护区', sub:'永久 · 文明指数 +0.6', fx:{ civ:0.6 },
        out:'保护区界碑上刻着凯文报告的最后一行:"宇宙中存在我们无法理解的事物,承认这一点,是理解的开始。"——支线《索拉里斯之海》完' },
      { label:'在冰面建立永久观测站,与它共存', sub:'跃迁 +1 小时 · 文明指数 +0.2', fx:{ jump:{scope:'all', sec:3600}, civ:0.2 },
        out:'观测站取名"凯文站"。它至今没有再观测到任何异常——但每年冬至,站员们会朝冰面播放一遍那段最早的"复述"。万一它在听呢。——支线《索拉里斯之海》完' } ] },
];
const SIDE_GAP = 35000;
const SIDE_UNLOCK_AT = 3;
