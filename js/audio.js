/* ============================================================
   BGM — 生成式合成器引擎(Web Audio):10 首环境曲 + 3 首战斗曲
   每首 = 和弦进行 + 振荡器配方 + 滤波/LFO + 琶音器 + 打击乐声部
   ============================================================ */
const MUSIC = {
  ctx:null, master:null, padBus:null, fxBus:null, sfxBus:null,
  filt:null, lfoOsc:null, lfoG:null, noiseBuf:null,
  running:false, wantOn:true, ci:0, ti:0, battle:-1, prevTi:0,
  chordTimer:null, sparkleTimer:null, arpTimer:null, percTimer:null, rotTimer:null,
  curChord:null, step:0, arpStep:0,
};
const A1 = 55;
const st = s => A1 * Math.pow(2, s/12);
const PENTA = [36,39,41,43,46,48,51];
const BGM_VOL = 0.3, BGM_BATTLE_VOL = 0.34, TRACK_ROTATE_MS = 170000;

/* ── 环境曲目(合成器 Ambient,慢和声 + 回声琶音 + 高频星尘) ── */
const TRACKS = [
  { name:'深空漂流', en:'ADRIFT', dur:16, noteVol:.05,
    chords:[{notes:[12,19,26,27,31],bass:0},{notes:[8,15,19,24,27],bass:-4},{notes:[15,22,26,29,31],bass:3},{notes:[10,17,24,26,29],bass:-2}],
    types:[['sawtooth',-5],['triangle',6]], filt:1000, lfo:[.035,420],
    scale:PENTA, sp:[4.5,10] },
  { name:'恒星黎明', en:'STELLAR DAWN', dur:14, noteVol:.05,
    chords:[{notes:[15,22,31,34],bass:3},{notes:[13,20,29,32],bass:1},{notes:[10,17,26,29],bass:-2},{notes:[12,19,28,33],bass:0}],
    types:[['triangle',-4],['sawtooth',5]], filt:1500, lfo:[.045,500],
    arp:{steps:[0,1,2,3,2,1], rate:.42, type:'triangle', vol:.038, oct:12},
    scale:[27,31,34,36,39,43], sp:[5,8] },
  { name:'殖民船团', en:'THE COLONY FLEET', dur:12, noteVol:.048,
    chords:[{notes:[17,24,29,33],bass:5},{notes:[12,19,24,28],bass:0},{notes:[14,21,26,29],bass:2},{notes:[10,17,22,26],bass:-2}],
    types:[['sawtooth',-6],['triangle',5]], filt:1250, lfo:[.05,380],
    arp:{steps:[0,2,1,3], rate:.5, type:'square', vol:.02, oct:12},
    scale:[29,31,34,36,41], sp:[4,7] },
  { name:'环世界', en:'RINGWORLD', dur:17, noteVol:.055,
    chords:[{notes:[12,19,24,26],bass:0},{notes:[14,21,26,28],bass:2},{notes:[9,16,21,23],bass:-3},{notes:[7,14,19,24],bass:-5}],
    types:[['triangle',-6],['triangle',6]], filt:1300, lfo:[.03,350],
    scale:[31,33,36,38,43,45], sp:[3.5,6] },
  { name:'气态巨人', en:'GAS GIANT', dur:20, noteVol:.045,
    chords:[{notes:[3,10,15,19],bass:-9},{notes:[1,8,15,17],bass:-11},{notes:[5,12,17,20],bass:-7},{notes:[0,7,14,15],bass:-12}],
    types:[['sawtooth',-8],['sawtooth',7]], filt:620, lfo:[.018,300],
    scale:[24,27,29,31], sp:[8,13] },
  { name:'超空间航线', en:'HYPERLANE', dur:8, noteVol:.042,
    chords:[{notes:[12,19,24,27],bass:0},{notes:[8,15,20,24],bass:-4},{notes:[15,22,27,31],bass:3},{notes:[10,17,22,26],bass:-2}],
    types:[['sawtooth',-5],['square',4]], filt:1150, lfo:[.06,450],
    arp:{steps:[0,1,2,3,2,3,1,2], rate:.25, type:'sine', vol:.032, oct:24},
    scale:[24,27,31,36], sp:[6,9] },
  { name:'寂静星云', en:'SILENT NEBULA', dur:21, noteVol:.05,
    chords:[{notes:[12,15,19,26],bass:0},{notes:[8,12,15,22],bass:-4},{notes:[10,13,17,24],bass:-2},{notes:[5,8,12,19],bass:-7}],
    types:[['sine',-3],['triangle',4]], filt:900, lfo:[.025,320],
    scale:[27,29,32,36,39], sp:[7,11] },
  { name:'先驱者遗迹', en:'PRECURSOR RUINS', dur:18, noteVol:.048,
    chords:[{notes:[12,19,24,27],bass:0},{notes:[13,20,25,29],bass:1},{notes:[10,17,22,25],bass:-2},{notes:[12,19,24,28],bass:0}],
    types:[['sawtooth',-5],['triangle',7]], filt:850, lfo:[.022,360],
    arp:{steps:[0,3,1,3,2,3], rate:.6, type:'sine', vol:.03, oct:12},
    scale:[24,25,29,31,36], sp:[6,10] },
  { name:'冻土星', en:'TUNDRA', dur:15, noteVol:.06,
    chords:[{notes:[19,26,31,36],bass:7},{notes:[15,22,27,34],bass:3},{notes:[17,24,29,33],bass:5},{notes:[14,21,28,33],bass:2}],
    types:[['sine',-5],['sine',8]], filt:2000, lfo:[.05,600],
    scale:[36,38,41,43,46,48], sp:[3,5.5] },
  { name:'银心', en:'GALACTIC CORE', dur:19, noteVol:.045,
    chords:[{notes:[12,19,26,31,35],bass:0},{notes:[8,15,22,27,31],bass:-4},{notes:[10,17,24,29,34],bass:-2},{notes:[15,22,29,34,38],bass:3}],
    types:[['sawtooth',-8],['triangle',6]], filt:1050, lfo:[.03,400],
    arp:{steps:[0,1,2,3,4,3,2,1], rate:.5, type:'sine', vol:.028, oct:0},
    scale:[31,34,36,39,43], sp:[5,8] },
  { name:'低温休眠', en:'CRYOSLEEP', dur:22, noteVol:.052,
    chords:[{notes:[12,19,26,31],bass:0},{notes:[10,17,24,29],bass:-2},{notes:[7,14,21,26],bass:-5},{notes:[8,15,22,27],bass:-4}],
    types:[['sine',-4],['sine',5]], filt:1100, lfo:[.015,250],
    scale:[31,34,38,43,46], sp:[9,14] },
  { name:'矿脉', en:'THE LODE', dur:16, noteVol:.042,
    chords:[{notes:[5,12,17,24],bass:-7},{notes:[3,10,15,22],bass:-9},{notes:[7,14,19,26],bass:-5},{notes:[5,12,15,20],bass:-7}],
    types:[['square',-6],['sawtooth',7]], filt:700, lfo:[.04,280],
    arp:{steps:[0,0,1,0,2,0,1,0], rate:.8, type:'triangle', vol:.034, oct:0},
    scale:[17,20,24,29], sp:[7,11] },
  { name:'迁徙', en:'EXODUS', dur:13, noteVol:.05,
    chords:[{notes:[10,17,24,29],bass:-2},{notes:[15,22,27,34],bass:3},{notes:[12,19,26,31],bass:0},{notes:[17,24,29,36],bass:5}],
    types:[['triangle',-5],['sawtooth',4]], filt:1350, lfo:[.05,420],
    arp:{steps:[0,2,3,2,1,2,3,2], rate:.33, type:'triangle', vol:.03, oct:12},
    scale:[29,31,36,41,43], sp:[4.5,7.5] },
  { name:'灯塔', en:'THE BEACON', dur:18, noteVol:.046,
    chords:[{notes:[12,19,24,31],bass:0},{notes:[12,19,26,31],bass:0},{notes:[10,17,22,29],bass:-2},{notes:[12,19,24,31],bass:0}],
    types:[['sine',-3],['triangle',6]], filt:1600, lfo:[.025,380],
    arp:{steps:[3,3,3,3], rate:2.2, type:'sine', vol:.05, oct:24},
    scale:[36,43,48], sp:[6,10] },
  { name:'回廊', en:'CORRIDORS', dur:11, noteVol:.044,
    chords:[{notes:[12,19,24,26],bass:0},{notes:[9,16,21,23],bass:-3},{notes:[14,21,26,28],bass:2},{notes:[12,17,24,29],bass:0}],
    types:[['triangle',-7],['square',4]], filt:1200, lfo:[.07,460],
    arp:{steps:[0,3,1,2,0,2,1,3], rate:.275, type:'sine', vol:.036, oct:12},
    scale:[26,29,33,38,41], sp:[5,8] },
];

/* ── 战斗曲目(步进音序器:底鼓/军鼓/镲 + 贝斯固定音型) ── */
const BTRACKS = [
  { name:'接敌警报', en:'RED ALERT', dur:8, noteVol:.04,
    chords:[{notes:[12,15,19,24],bass:0},{notes:[10,13,17,22],bass:-2}],
    types:[['sawtooth',-6],['sawtooth',6]], filt:1500, lfo:[.12,500],
    scale:[36,39,43], sp:[5,8],
    perc:{bpm:118, kick:[0,4,8,12,14], snare:[4,12], hat:[0,2,4,6,8,10,12,14], bass:[0,2,4,6,8,10,12,14], bassDecay:.16} },
  { name:'装甲护航', en:'IRON CONVOY', dur:10, noteVol:.042,
    chords:[{notes:[5,12,17,20],bass:-7},{notes:[3,10,15,18],bass:-9}],
    types:[['sawtooth',-7],['triangle',5]], filt:800, lfo:[.08,350],
    scale:[24,27,31], sp:[6,9],
    perc:{bpm:92, kick:[0,6,8,14], snare:[4,12], hat:[2,6,10,14], bass:[0,4,8,12], bassDecay:.3} },
  { name:'无畏旗舰', en:'THE DREADNOUGHT', dur:8, noteVol:.045,
    chords:[{notes:[12,15,18,24],bass:0},{notes:[11,14,18,23],bass:-1}],
    types:[['sawtooth',-8],['square',6]], filt:1700, lfo:[.15,650],
    scale:[36,39,42], sp:[3.5,5.5],
    perc:{bpm:126, kick:[0,3,6,8,11,14], snare:[4,12], hat:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], bass:[0,3,6,8,11,14], bassDecay:.14} },
  { name:'蜂群来袭', en:'SWARM', dur:6.8, noteVol:.038,
    chords:[{notes:[12,15,19,22],bass:0},{notes:[13,17,20,24],bass:1}],
    types:[['square',-5],['sawtooth',5]], filt:1900, lfo:[.2,550],
    scale:[36,39,43,46], sp:[4,6.5],
    perc:{bpm:140, kick:[0,4,8,12], snare:[4,12], hat:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], bass:[0,2,3,4,6,8,10,11,12,14], bassDecay:.1} },
  { name:'边域劫掠', en:'RIM RAIDERS', dur:9, noteVol:.042,
    chords:[{notes:[8,15,20,24],bass:-4},{notes:[10,13,17,22],bass:-2}],
    types:[['sawtooth',-6],['triangle',6]], filt:1000, lfo:[.09,400],
    scale:[24,27,32,36], sp:[5.5,8.5],
    perc:{bpm:104, kick:[0,3,8,10], snare:[4,12,15], hat:[2,4,6,7,10,12,14], bass:[0,3,7,8,10,14], bassDecay:.22} },
  { name:'相位风暴', en:'PHASE STORM', dur:7, noteVol:.046,
    chords:[{notes:[12,15,18,21],bass:0},{notes:[13,16,19,24],bass:-1},{notes:[11,14,18,23],bass:1}],
    types:[['sawtooth',-9],['sawtooth',8]], filt:1550, lfo:[.18,720],
    scale:[36,39,42,45], sp:[3,5],
    perc:{bpm:132, kick:[0,2,5,8,10,13], snare:[4,12,14], hat:[0,2,4,6,8,10,12,14], bass:[0,2,5,8,10,13], bassDecay:.13} },
];
const BATTLE_POOL = [0, 1, 3, 4], BOSS_POOL = [2, 5];   // 常规战曲池 / Boss 曲池
function curTrack(){ return MUSIC.battle >= 0 ? BTRACKS[MUSIC.battle] : TRACKS[MUSIC.ti]; }

function makeIR(ctx, seconds, decay){
  const rate = ctx.sampleRate, len = Math.floor(rate*seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch=0; ch<2; ch++){
    const d = buf.getChannelData(ch);
    for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, decay);
  }
  return buf;
}

function buildAudio(){
  if (MUSIC.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  MUSIC.ctx = ctx;
  MUSIC.master = ctx.createGain();
  MUSIC.master.gain.value = 0;
  MUSIC.master.connect(ctx.destination);
  const rev = ctx.createConvolver();
  rev.buffer = makeIR(ctx, 4.5, 2.6);
  const revGain = ctx.createGain(); revGain.gain.value = 0.55;
  rev.connect(revGain); revGain.connect(MUSIC.master);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 1000; filt.Q.value = 0.6;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.035; lfoG.gain.value = 420;
  lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
  MUSIC.filt = filt; MUSIC.lfoOsc = lfo; MUSIC.lfoG = lfoG;
  // 打击乐用白噪声缓冲
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  MUSIC.noiseBuf = nb;
  const padG = ctx.createGain(); padG.gain.value = 0.5;
  filt.connect(padG);
  padG.connect(MUSIC.master); padG.connect(rev);
  MUSIC.padBus = filt;
  const dly = ctx.createDelay(2.0); dly.delayTime.value = 0.52;
  const fb = ctx.createGain(); fb.gain.value = 0.42;
  dly.connect(fb); fb.connect(dly);
  const fxG = ctx.createGain(); fxG.gain.value = 0.5;
  const fxIn = ctx.createGain();
  fxIn.connect(fxG); fxIn.connect(dly); dly.connect(fxG);
  fxG.connect(MUSIC.master); fxG.connect(rev);
  MUSIC.fxBus = fxIn;
  const sg = ctx.createGain(); sg.gain.value = 0.5;
  sg.connect(ctx.destination);
  MUSIC.sfxBus = sg;
}
function musicStart(){
  if (MUSIC.running) return;
  buildAudio();
  const ctx = MUSIC.ctx;
  const begin = () => {
    if (MUSIC.running || !MUSIC.wantOn) return;
    MUSIC.running = true;
    MUSIC.master.gain.cancelScheduledValues(ctx.currentTime);
    MUSIC.master.gain.setTargetAtTime(BGM_VOL, ctx.currentTime, 2.0);
    startTrack();
    $('bgm-btn').classList.add('on');
  };
  if (ctx.state === 'suspended') ctx.resume().then(begin).catch(()=>{});
  else begin();
}
function musicStop(){
  if (!MUSIC.running) return;
  MUSIC.running = false;
  stopTrackTimers();
  clearTimeout(MUSIC.rotTimer);
  MUSIC.master.gain.setTargetAtTime(0, MUSIC.ctx.currentTime, 0.8);
}

/* ── 曲目调度:启动/停止声部计时器、轮播、战斗切换 ── */
function stopTrackTimers(){
  clearInterval(MUSIC.chordTimer);
  clearInterval(MUSIC.arpTimer);
  clearInterval(MUSIC.percTimer);
  clearTimeout(MUSIC.sparkleTimer);
}
function applyTrack(tr){
  const t = MUSIC.ctx.currentTime;
  MUSIC.filt.frequency.setTargetAtTime(tr.filt, t, 1.2);
  MUSIC.lfoOsc.frequency.setValueAtTime(tr.lfo[0], t);
  MUSIC.lfoG.gain.setValueAtTime(tr.lfo[1], t);
  const b = $('bgm-btn');
  if (b) b.title = `背景音乐 · ♪ ${tr.name} ${tr.en}`;
}
function startTrack(){
  const tr = curTrack();
  applyTrack(tr);
  MUSIC.ci = 0; MUSIC.step = 0; MUSIC.arpStep = 0;
  playChord();
  MUSIC.chordTimer = setInterval(playChord, tr.dur * 1000);
  if (tr.arp) MUSIC.arpTimer = setInterval(playArpNote, tr.arp.rate * 1000);
  if (tr.perc) MUSIC.percTimer = setInterval(playPercStep, 60000 / tr.perc.bpm / 4);
  scheduleSparkle();
  if (MUSIC.battle < 0){
    clearTimeout(MUSIC.rotTimer);
    MUSIC.rotTimer = setTimeout(rotateTrack, TRACK_ROTATE_MS);
  }
}
function switchTrack(fadeSec){
  if (!MUSIC.running) return;
  stopTrackTimers();
  const t = MUSIC.ctx.currentTime;
  MUSIC.master.gain.setTargetAtTime(0.05, t, fadeSec);
  setTimeout(() => {
    if (!MUSIC.running) return;
    startTrack();
    MUSIC.master.gain.setTargetAtTime(MUSIC.battle >= 0 ? BGM_BATTLE_VOL : BGM_VOL, MUSIC.ctx.currentTime, fadeSec);
  }, fadeSec * 2200);
}
function rotateTrack(){
  if (!MUSIC.running || MUSIC.battle >= 0) return;
  MUSIC.ti = (MUSIC.ti + 1) % TRACKS.length;
  switchTrack(0.7);
}
function musicBattle(on, boss){
  if (on){
    if (MUSIC.battle >= 0) return;
    MUSIC.prevTi = MUSIC.ti;
    const pool = boss ? BOSS_POOL : BATTLE_POOL;
    MUSIC.battle = pool[Math.floor(Math.random() * pool.length)];
    clearTimeout(MUSIC.rotTimer);
  } else {
    if (MUSIC.battle < 0) return;
    MUSIC.battle = -1;
    MUSIC.ti = MUSIC.prevTi;
  }
  if (MUSIC.running) switchTrack(0.35);
}

/* ── 声部:和声垫 / 琶音 / 打击乐 / 星尘 ── */
function playChord(){
  if (!MUSIC.running) return;
  const ctx = MUSIC.ctx, t = ctx.currentTime, tr = curTrack();
  const ch = tr.chords[MUSIC.ci % tr.chords.length];
  MUSIC.ci++;
  MUSIC.curChord = ch;
  const dur = tr.dur + Math.max(4, tr.dur * 0.45);
  const atk = Math.min(4.5, tr.dur * 0.3), rel = Math.min(6, tr.dur * 0.4);
  for (const s of ch.notes){
    const f = st(s);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(tr.noteVol, t + atk);
    g.gain.setValueAtTime(tr.noteVol, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(MUSIC.padBus);
    for (const [type, det] of tr.types){
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = det + (Math.random()*4-2);
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, t);
  bg.gain.linearRampToValueAtTime(0.11, t + atk * 0.8);
  bg.gain.setValueAtTime(0.11, t + dur - rel * 0.9);
  bg.gain.linearRampToValueAtTime(0, t + dur);
  bg.connect(MUSIC.master);
  const bo = ctx.createOscillator();
  bo.type = 'sine'; bo.frequency.value = st(ch.bass) / 2;
  bo.connect(bg); bo.start(t); bo.stop(t + dur + 0.1);
}

function playArpNote(){
  if (!MUSIC.running) return;
  const tr = curTrack();
  if (!tr.arp || !MUSIC.curChord) return;
  const ctx = MUSIC.ctx, t = ctx.currentTime, a = tr.arp;
  const idx = a.steps[MUSIC.arpStep % a.steps.length];
  MUSIC.arpStep++;
  const s = MUSIC.curChord.notes[idx % MUSIC.curChord.notes.length] + a.oct;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(a.vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a.rate * 2.2);
  g.connect(MUSIC.fxBus);
  const o = ctx.createOscillator();
  o.type = a.type; o.frequency.value = st(s);
  o.connect(g); o.start(t); o.stop(t + a.rate * 2.4);
}

function playPercStep(){
  if (!MUSIC.running) return;
  const tr = curTrack();
  if (!tr.perc) return;
  const ctx = MUSIC.ctx, t = ctx.currentTime, pc = tr.perc;
  const s16 = MUSIC.step % 16;
  MUSIC.step++;
  const noise = (vol, dur, type, freq) => {
    const src = ctx.createBufferSource(); src.buffer = MUSIC.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(MUSIC.master);
    src.start(t); src.stop(t + dur + 0.02);
  };
  if (pc.kick.includes(s16)){
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(MUSIC.master);
    o.start(t); o.stop(t + 0.25);
  }
  if (pc.snare.includes(s16)) noise(0.15, 0.14, 'bandpass', 1800);
  if (pc.hat.includes(s16))   noise(0.05, 0.045, 'highpass', 7500);
  if (pc.bass.includes(s16) && MUSIC.curChord){
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = st(MUSIC.curChord.bass);
    g.gain.setValueAtTime(0.085, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (pc.bassDecay || 0.16));
    o.connect(g); g.connect(MUSIC.padBus);
    o.start(t); o.stop(t + (pc.bassDecay || 0.16) + 0.05);
  }
}

function scheduleSparkle(){
  if (!MUSIC.running) return;
  const tr = curTrack();
  const [mn, mx] = tr.sp;
  MUSIC.sparkleTimer = setTimeout(() => {
    if (MUSIC.running){
      const ctx = MUSIC.ctx, t = ctx.currentTime;
      const sc = curTrack().scale;
      const f = st(sc[Math.floor(Math.random()*sc.length)]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 + Math.random()*0.03, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      g.connect(MUSIC.fxBus);
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + 3.4);
      if (Math.random() < 0.35){
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        g2.gain.setValueAtTime(0, t+0.3);
        g2.gain.linearRampToValueAtTime(0.025, t+0.36);
        g2.gain.exponentialRampToValueAtTime(0.0001, t+2.8);
        o2.type='sine'; o2.frequency.value = f*1.5;
        o2.connect(g2); g2.connect(MUSIC.fxBus);
        o2.start(t+0.3); o2.stop(t+3.0);
      }
    }
    scheduleSparkle();
  }, (mn + Math.random() * (mx - mn)) * 1000);
}

/* ── 交互音效(纯合成) ── */
function sfx(name){
  if (!MUSIC.wantOn) return;
  buildAudio();
  const ctx = MUSIC.ctx;
  if (!ctx || ctx.state !== 'running' || !MUSIC.sfxBus) return;
  const t = ctx.currentTime;
  const tone = (freq, t0, dur, vol, type='sine', glide) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0+dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g); g.connect(MUSIC.sfxBus);
    o.start(t0); o.stop(t0+dur+0.05);
  };
  switch(name){
    case 'blip':    tone(740, t, 0.1, 0.16, 'sine', 980); break;
    case 'open':    tone(330, t, 0.16, 0.1, 'triangle', 520); tone(660, t+0.05, 0.14, 0.07); break;
    case 'confirm': tone(523, t, 0.16, 0.14); tone(784, t+0.07, 0.22, 0.13); break;
    case 'levelup': [523,659,784,1046].forEach((f,i)=>tone(f, t+i*0.07, 0.2, 0.12)); break;
    case 'unlock':  tone(392, t, 0.3, 0.11); tone(587, t, 0.3, 0.1); tone(784, t+0.14, 0.42, 0.12); break;
    case 'signal':  tone(1175, t, 0.4, 0.1); tone(1175, t+0.5, 0.32, 0.055); break;
    case 'jump':    tone(220, t, 0.5, 0.12, 'sawtooth', 880); tone(880, t+0.32, 0.3, 0.08, 'sine', 1320); break;
    case 'err':     tone(196, t, 0.18, 0.1, 'square', 150); break;
  }
}

/* ── 英文交互语音 ── */
let cachedVoice = null;
function pickVoice(){
  if (cachedVoice) return cachedVoice;
  try{
    const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith('en'));
    const prefer = ['Google UK English Female','Samantha','Microsoft Zira','Victoria','Karen','Female'];
    for (const key of prefer){
      const hit = vs.find(v => v.name.includes(key));
      if (hit){ cachedVoice = hit; return hit; }
    }
    cachedVoice = vs[0] || null;
  }catch(e){}
  return cachedVoice;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { cachedVoice = null; pickVoice(); };
function speak(text){
  if (!MUSIC.wantOn || !('speechSynthesis' in window)) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.96; u.pitch = 0.8; u.volume = 0.8;
    speechSynthesis.speak(u);
  }catch(e){}
}

function bgmToggle(){
  MUSIC.wantOn = !MUSIC.wantOn;
  save.bgm = MUSIC.wantOn;
  persistSave();
  if (MUSIC.wantOn) musicStart(); else { musicStop(); try{ speechSynthesis.cancel(); }catch(e){} }
  $('bgm-btn').classList.toggle('on', MUSIC.wantOn);
}
function bgmFirstGesture(){
  if (MUSIC.wantOn && !MUSIC.running) musicStart();
  $('bgm-btn').classList.toggle('on', MUSIC.wantOn && MUSIC.running);
}
