/* ============================================================
   BGM — 生成式 Ambient 合成器引擎(Web Audio)+ 交互音效 + 语音
   ============================================================ */
const MUSIC = {
  ctx:null, master:null, padBus:null, fxBus:null, sfxBus:null, lfo:null,
  running:false, wantOn:true, chordTimer:null, sparkleTimer:null, ci:0,
};
const A1 = 55;
const st = s => A1 * Math.pow(2, s/12);
const CHORDS = [
  { notes:[12,19,26,27,31], bass:0  },
  { notes:[8,15,19,24,27],  bass:-4 },
  { notes:[15,22,26,29,31], bass:3  },
  { notes:[10,17,24,26,29], bass:-2 },
];
const PENTA = [36,39,41,43,46,48,51];
const CHORD_DUR = 16;

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
    MUSIC.master.gain.setTargetAtTime(0.3, ctx.currentTime, 2.0);
    playChord();
    MUSIC.chordTimer = setInterval(playChord, CHORD_DUR*1000);
    scheduleSparkle();
    $('bgm-btn').classList.add('on');
  };
  if (ctx.state === 'suspended') ctx.resume().then(begin).catch(()=>{});
  else begin();
}
function musicStop(){
  if (!MUSIC.running) return;
  MUSIC.running = false;
  clearInterval(MUSIC.chordTimer);
  clearTimeout(MUSIC.sparkleTimer);
  MUSIC.master.gain.setTargetAtTime(0, MUSIC.ctx.currentTime, 0.8);
}

function playChord(){
  if (!MUSIC.running) return;
  const ctx = MUSIC.ctx, t = ctx.currentTime;
  const ch = CHORDS[MUSIC.ci % CHORDS.length];
  MUSIC.ci++;
  const dur = CHORD_DUR + 7;
  for (const s of ch.notes){
    const f = st(s);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 4.5);
    g.gain.setValueAtTime(0.05, t + dur - 6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(MUSIC.padBus);
    for (const [type, det] of [['sawtooth',-5],['triangle',6]]){
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = det + (Math.random()*4-2);
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  const bf = st(ch.bass) / 2;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0, t);
  bg.gain.linearRampToValueAtTime(0.11, t + 3.5);
  bg.gain.setValueAtTime(0.11, t + dur - 5);
  bg.gain.linearRampToValueAtTime(0, t + dur);
  bg.connect(MUSIC.master);
  const bo = ctx.createOscillator();
  bo.type = 'sine'; bo.frequency.value = bf;
  bo.connect(bg); bo.start(t); bo.stop(t + dur + 0.1);
}

function scheduleSparkle(){
  if (!MUSIC.running) return;
  MUSIC.sparkleTimer = setTimeout(() => {
    if (MUSIC.running){
      const ctx = MUSIC.ctx, t = ctx.currentTime;
      const f = st(PENTA[Math.floor(Math.random()*PENTA.length)]);
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
  }, 4500 + Math.random()*5500);
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
