/* ============================================================
   程序化着色器(GLSL)— 行星 / 恒星 / 轨迹 / 行星环
   ============================================================ */

const NOISE_GLSL = `
float hash31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000=hash31(i), n100=hash31(i+vec3(1,0,0)), n010=hash31(i+vec3(0,1,0)), n110=hash31(i+vec3(1,1,0));
  float n001=hash31(i+vec3(0,0,1)), n101=hash31(i+vec3(1,0,1)), n011=hash31(i+vec3(0,1,1)), n111=hash31(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
}
float fbm(vec3 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.13 + vec3(7.3); a *= 0.5; }
  return v;
}
float ridge(vec3 p){ return 1.0 - abs(2.0*fbm(p) - 1.0); }
`;

const PLANET_VERT = `
varying vec3 vNormal; varying vec3 vObjPos; varying vec3 vWorldPos;
void main(){
  vNormal = normalize(mat3(modelMatrix) * normal);
  vObjPos = position;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/* 统一行星着色器:uType 0=岩石 1=宜居 2=气态 3=温室云 4=冰巨 */
const PLANET_FRAG = `
precision highp float;
varying vec3 vNormal; varying vec3 vObjPos; varying vec3 vWorldPos;
uniform float uTime, uSeed, uDev, uAtmoS, uBandFreq, uPolarIce, uSea, uArch;
uniform int uType;
uniform vec3 uC1, uC2, uC3, uAtmo, uSunPos;
uniform vec3 uDistDir[20];
uniform vec3 uDistCol[20];
uniform float uDistR[20];
uniform float uDistProg[20];
${NOISE_GLSL}

void main(){
  vec3 N = normalize(vNormal);
  vec3 P = normalize(vObjPos);
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float diff = max(dot(N, L), 0.0);
  float dayMix = smoothstep(-0.08, 0.25, dot(N, L));
  vec3 sp = P * 1.0 + vec3(uSeed);

  vec3 albedo = uC1;
  float spec = 0.0;
  float cloud = 0.0;
  float landMask = 1.0;

  if (uType == 0){
    float e = fbm(sp*3.2) + 0.35*ridge(sp*7.5);
    e /= 1.35;
    albedo = mix(uC3, uC1, smoothstep(0.25, 0.55, e));
    albedo = mix(albedo, uC2, smoothstep(0.55, 0.8, e));
    float crater = smoothstep(0.18, 0.0, ridge(sp*11.0)) * 0.5;
    albedo *= 1.0 - crater*0.35;
    if (uPolarIce > 0.5){
      float ice = smoothstep(0.78, 0.9, abs(P.y) + 0.12*fbm(sp*5.0));
      albedo = mix(albedo, vec3(0.92,0.94,0.97), ice);
    }
  }
  else if (uType == 1){
    float base = (fbm(sp*2.6) + 0.4*fbm(sp*6.5)*0.5) / 1.2;
    float cluster = smoothstep(0.5, 0.68, fbm(sp*1.3 + 7.7));
    float arcs = (ridge(sp*4.2)*0.72 + 0.28*fbm(sp*9.0 + 3.3)) * mix(0.5, 1.0, cluster);
    float e = mix(base, arcs, uArch);
    float sea = uSea;
    if (e < sea){
      float shelf = smoothstep(sea-0.14, sea, e);
      vec3 deep = uC3;
      vec3 lagoon = vec3(0.04,0.42,0.46);
      albedo = mix(mix(vec3(0.02,0.1,0.26), deep, 0.6), lagoon, shelf*shelf);
      spec = 1.0; landMask = 0.0;
    } else {
      float h = smoothstep(sea, sea+0.16, e);
      albedo = mix(vec3(0.88,0.8,0.6), uC1, smoothstep(0.0,0.3,h));
      albedo = mix(albedo, uC2, smoothstep(0.5,0.85,h));
      albedo = mix(albedo, vec3(0.95), smoothstep(0.88,0.97,h));
    }
    float ice = smoothstep(0.84, 0.93, abs(P.y) + 0.05*fbm(sp*4.0));
    albedo = mix(albedo, vec3(0.93,0.95,0.98), ice);
    cloud = smoothstep(0.54, 0.74, fbm(sp*3.4 + vec3(uTime*0.008, 0.0, uTime*0.005) + 13.7));
    albedo = mix(albedo, vec3(0.98), cloud*0.92);
    spec *= (1.0-cloud);
  }
  else if (uType == 2 || uType == 4){
    float warp = fbm(sp*vec3(1.2,3.5,1.2) + vec3(uTime*0.006,0.0,0.0));
    float band = 0.5 + 0.5*sin(P.y*uBandFreq + 2.6*warp + uSeed);
    albedo = mix(uC1, uC2, band);
    float storm = smoothstep(0.62, 0.85, fbm(sp*4.5 + vec3(uTime*0.01,0.0,0.0) + 3.3));
    albedo = mix(albedo, uC3, storm*0.55);
    if (uType == 4) albedo = mix(albedo, uC2, 0.25);
  }
  else if (uType == 3){
    float c1 = fbm(sp*2.8 + vec3(uTime*0.012, 0.0, 0.0));
    float c2 = fbm(sp*6.0 - vec3(uTime*0.02, uTime*0.004, 0.0) + 5.1);
    float sw = 0.5+0.5*sin(P.y*7.0 + 3.5*c1);
    albedo = mix(uC3, uC1, sw);
    albedo = mix(albedo, uC2, smoothstep(0.5,0.75,c2));
  }

  vec3 col = albedo * (0.035 + diff*1.05);

  if (spec > 0.0){
    vec3 H = normalize(L + V);
    col += vec3(1.0,0.95,0.8) * pow(max(dot(N,H),0.0), 90.0) * diff * 0.9;
  }

  if (uDev > 0.001){
    float cities = smoothstep(0.55, 0.82, fbm(sp*9.0 + 41.7));
    cities *= landMask * (1.0 - cloud*0.85);
    if (uType == 2 || uType == 4) cities = smoothstep(0.7,0.9,fbm(sp*7.0+41.7))*0.6;
    if (uType == 3) cities = smoothstep(0.72,0.9,fbm(sp*8.0+41.7))*0.5;
    float night = 1.0 - dayMix;
    col += vec3(1.0, 0.78, 0.45) * cities * night * uDev * 1.6;
  }

  // ── 殖民区划:数据可视化风格 ──
  // 核心区划(0 号):精密双环 + 旋转刻度环 + 脉冲核心
  // 其余区划:不规则多边形色块(省份感)+ 闪烁亮芯 + 流光弧线汇聚核心
  float night = 1.0 - dayMix;
  float vis = 0.55 + 0.45*night;                 // 夜面更醒目(数据灯光感)
  for (int i = 0; i < 20; i++){
    float rr = uDistR[i];
    if (rr < 0.01) continue;
    vec3 D = uDistDir[i];
    vec3 dc = uDistCol[i];
    float ang = acos(clamp(dot(P, D), -1.0, 1.0));
    float prog = uDistProg[i];
    float sd = float(i)*7.31 + uSeed;

    // 连接线:区划 → 核心区划(沿星球表面的大圆弧,光脉冲流向核心)
    if (i > 0 && uDistR[0] > 0.01 && prog >= 1.0){
      vec3 Bv = uDistDir[0];
      vec3 Nn = normalize(cross(D, Bv) + vec3(1e-5));
      float dLine = abs(dot(P, Nn));
      float segA = step(0.0, dot(cross(D, P), Nn));
      float segB = step(0.0, dot(cross(P, Bv), Nn));
      float line = smoothstep(0.014, 0.0, dLine) * segA * segB;
      if (line > 0.0){
        float angAB = max(acos(clamp(dot(D, Bv), -1.0, 1.0)), 1e-3);
        float s = acos(clamp(dot(P, D), -1.0, 1.0)) / angAB;
        float flow = smoothstep(0.32, 0.0, abs(fract(s*2.5 - uTime*0.35 + sd) - 0.5));
        col += mix(dc, vec3(0.75,0.85,1.0), 0.45) * line * (0.16 + 0.75*flow) * vis;
      }
    }
    if (ang > rr*1.7) continue;

    if (i == 0){
      // ── 核心殖民地:同心双环 + 旋转刻度 ──
      vec3 T1 = normalize(cross(D, vec3(0.0,1.0,0.0)) + vec3(1e-4,0.0,0.0));
      vec3 T2 = cross(D, T1);
      float phi = atan(dot(P,T2), dot(P,T1));
      float r1 = abs(ang - rr*0.92);
      float r2 = abs(ang - rr*0.55);
      float ticks = step(0.25, 0.5 + 0.5*sin(phi*14.0 + uTime*0.9));     // 旋转刻度环
      float ring1 = smoothstep(rr*0.08, 0.0, r1) * ticks;
      float ring2 = smoothstep(rr*0.05, 0.0, r2);
      col = mix(col, dc, (ring1 + ring2) * 0.6);                          // 白天也可见(替换混合)
      col += dc * (ring1 * 1.0 + ring2 * 0.7) * vis;                      // 夜面增辉
      float core = smoothstep(rr*0.26, 0.0, ang);
      float beat = 0.65 + 0.35*sin(uTime*2.6);
      col = mix(col, dc * 0.35, smoothstep(rr*0.32, rr*0.2, ang) * 0.7);  // 核心暗色衬底
      col += mix(dc, vec3(1.0), 0.6) * core * beat * 1.25 * (prog >= 1.0 ? 1.0 : 0.45);
      col = mix(col, dc, (1.0 - smoothstep(rr*0.8, rr, ang)) * 0.08);     // 极淡填充
    } else {
      // ── 普通区划:双层圆圈 + 闪烁亮芯 ──
      float wO = rr * 0.10;
      float ringO = smoothstep(wO, 0.0, abs(ang - rr));            // 外环
      float ringI = smoothstep(wO * 0.7, 0.0, abs(ang - rr*0.58)); // 内环
      float fillm = 1.0 - smoothstep(rr*0.82, rr, ang);
      if (prog >= 1.0){
        col = mix(col, dc, fillm * (0.14 + 0.08*night));                  // 淡色底
        col = mix(col, dc, ringO * 0.55 + ringI * 0.4);                   // 双环:替换混合压住亮背景
        col += dc * (ringO * 0.5 + ringI * 0.3) * vis;                    // 夜面增辉
        col = mix(col, dc * 0.3, smoothstep(rr*0.2, rr*0.12, ang) * 0.7); // 亮芯暗色衬底
        float cdot = smoothstep(rr*0.15, 0.0, ang);
        float blink = 0.45 + 0.55*sin(uTime*3.2 + sd*2.0);                // 闪烁亮芯
        col += mix(dc, vec3(1.0), 0.6) * cdot * blink * 1.2;
      } else {
        float pulse = 0.4 + 0.6*sin(uTime*2.4 + sd);
        col = mix(col, dc, ringO * 0.4 * pulse);
        col += dc * ringO * 0.5 * pulse;                                  // 施工:外环脉冲
        col = mix(col, dc, fillm * 0.05 * prog);
      }
    }
  }

  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col += uAtmo * fres * uAtmoS * (0.12 + 0.88*dayMix);

  gl_FragColor = vec4(col, 1.0);
}`;

/* 恒星:uCol1/uCol2 由星系数据决定 */
const SUN_FRAG = `
precision highp float;
varying vec3 vNormal; varying vec3 vObjPos; varying vec3 vWorldPos;
uniform float uTime;
uniform vec3 uCol1, uCol2;
${NOISE_GLSL}
void main(){
  vec3 P = normalize(vObjPos);
  float n = fbm(P*3.5 + vec3(uTime*0.04, uTime*0.03, 0.0));
  float n2 = fbm(P*8.0 - vec3(0.0, uTime*0.06, 0.0));
  vec3 col = mix(uCol1, uCol2, n);
  col += uCol2 * smoothstep(0.6,0.85,n2) * 0.6;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float limb = pow(max(dot(normalize(vNormal), V), 0.0), 0.55);
  col *= 0.55 + 0.45*limb;
  gl_FragColor = vec4(col*1.45, 1.0);
}`;

const RING_VERT = `
varying vec2 vUv; varying vec3 vWorldPos;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TRAIL_VERT = `
attribute float aAng; varying float vAng;
void main(){
  vAng = aAng;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TRAIL_FRAG = `
precision highp float;
uniform float uAng; uniform vec3 uColor;
varying float vAng;
void main(){
  float d = mod(uAng - vAng, 6.2831853);
  float trail = pow(smoothstep(1.9, 0.0, d), 1.4);
  float head  = smoothstep(0.10, 0.0, d) * 0.6;
  float a = 0.055 + trail * 0.5 + head;
  gl_FragColor = vec4(mix(vec3(0.55,0.62,0.78), uColor, trail), a);
}`;

const RING_FRAG = `
precision highp float;
varying vec2 vUv; varying vec3 vWorldPos;
uniform vec3 uSunPos; uniform float uInner, uOuter, uSeed;
${NOISE_GLSL}
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float rr = mix(uInner, uOuter, r);
  float bands = fbm(vec3(rr*14.0, uSeed, 0.0));
  float a = smoothstep(0.3, 0.62, bands);
  a *= smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.92, r);
  vec3 col = mix(vec3(0.55,0.5,0.42), vec3(0.85,0.82,0.72), bands);
  gl_FragColor = vec4(col*0.9, a*0.85);
}`;
