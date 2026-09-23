/* ---------------------------------------------------------------
   cloth.js: the live batik.

   Every element with data-cloth gets a canvas. One WebGL2 context,
   kept off-screen, paints each cloth in turn and copies the pixels
   into that element's canvas, so a page holds a single GPU context
   however many swatches it shows.

   The page's main cloth (hero, selvedge, or the burned 404 sheet)
   dyes in when it first comes into view, breathes slowly while on
   screen, and takes wax from the pointer. Swatches dye once, and
   again on hover. Without WebGL2 the build's still SVG stays.
   --------------------------------------------------------------- */

import { motif, COLORS, KAWUNG as K, PARANG as P, TRUNTUM as T } from "./motif.js";

const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const DPR_CAP = 1.5;
const DYE_MS = 2600;
const WAX_MS = 6000; // a wax stroke is gone after this long
const PEN_RADIUS = 8; // css px

const n = (x) => x.toFixed(4);
const vec3 = (hex) =>
  `vec3(${[1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(",")})`;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const TRAIL = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform vec2 uA;
uniform vec2 uB;
uniform float uR;
uniform float uDecay;
uniform float uStamp;
out vec4 o;
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  float v = texture(uPrev, gl_FragCoord.xy / uRes).r - uDecay;
  if (uStamp > 0.5) v = max(v, 1.0 - smoothstep(uR * 0.55, uR, seg(gl_FragCoord.xy, uA, uB)));
  o = vec4(max(v, 0.0), 0.0, 0.0, 1.0);
}`;

const CLOTH = `#version 300 es
precision highp float;
uniform vec2 uRes;       // device px
uniform float uDpr;      // device px per css px
uniform float uTime;     // seconds
uniform float uDye;      // dye-in progress, 0..1
uniform int uKind;
uniform float uScale;    // css px per motif cell
uniform float uAngle;    // radians
uniform float uPhase;
uniform float uScroll;   // css px
uniform sampler2D uMask; // r: wax letters, g: zones kept clear of motif
uniform int uHasMask;
uniform sampler2D uTrail;
uniform int uHasTrail;
uniform vec3 uHole;      // centre and radius in css px; radius 0 means none
out vec4 outColor;

const vec3 MORI = ${vec3(COLORS.mori)};
const vec3 NILA = ${vec3(COLORS.nila)};
const vec3 NILA_TUA = ${vec3(COLORS.nilaTua)};
const vec3 SOGA = ${vec3(COLORS.soga)};
const vec3 MALAM = ${vec3(COLORS.malam)};
const vec3 SCORCH = vec3(0.13, 0.07, 0.04);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v / 0.9375;
}
// Distance to the nearest Voronoi border: the cracks in the wax.
float crack(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    vec2 r = g + vec2(hash21(i + g), hash21(i + g + 19.7)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
float inside(float edge, float v, float aa) { return 1.0 - smoothstep(edge - aa, edge + aa, v); }

// Each motif returns coverage in cell units l: (wax, soga) for shapes
// owned by the cell around l, then (wax, soga) for shapes sitting on
// the cell corners (only kawung has those).
vec4 kawung(vec2 l, float px) {
  vec2 c = fract(l) - 0.5;
  float wax = 0.0, soga = 0.0;
  float aa = px / ${n(K.ry)};
  for (int k = 0; k < 4; k++) {
    vec2 o = k == 0 ? vec2(${n(K.off)}, 0) : k == 1 ? vec2(-${n(K.off)}, 0) : k == 2 ? vec2(0, ${n(K.off)}) : vec2(0, -${n(K.off)});
    vec2 r = k < 2 ? vec2(${n(K.rx)}, ${n(K.ry)}) : vec2(${n(K.ry)}, ${n(K.rx)});
    float e = length((c - o) / r);
    float seed = inside(${n(K.seed)}, e, aa);
    float line = inside(${n(K.line1)}, e, aa) - inside(${n(K.line0)}, e, aa);
    wax = max(wax, inside(1.0, e, aa) - line - seed);
    soga = max(soga, seed);
  }
  vec2 q = fract(l);
  float d = length(q - round(q));
  float seed = inside(${n(K.dotSeed)}, d, px);
  return vec4(clamp(wax, 0.0, 1.0), soga, inside(${n(K.dot)}, d, px) - seed, seed);
}
vec4 parang(vec2 l, float px) {
  float u = fract(l.x), v = l.y;
  float wax = inside(${n(P.border)}, u, px), soga = 0.0;
  float d = length(vec2(u - ${n(P.dotU)}, mod(v, ${n(P.dotStep)}) - ${n(P.dotStep / 2)}));
  float seed = inside(${n(P.dotSeed)}, d, px);
  wax = max(wax, inside(${n(P.dotR)}, d, px) - seed);
  soga = seed;
  float x = ${n(P.bladeX)} + ${n(P.amp)} * sin(6.2831853 * v / ${n(P.period)});
  float h = abs(u - x);
  wax = max(wax, inside(${n(P.half)}, h, px) - inside(${n(P.line)}, h, px));
  return vec4(clamp(wax, 0.0, 1.0), soga, 0.0, 0.0);
}
vec4 truntum(vec2 l, float px) {
  vec2 g = mod(l, 2.0);
  vec2 cell = floor(g);
  vec2 c = g - cell - 0.5;
  if (cell.x == cell.y) {
    float r = length(c);
    float R = ${n(T.r)} * (${n(T.base)} + ${n(1 - T.base)} * abs(cos(4.0 * atan(c.y, c.x))));
    float wax = inside(R, r, px) - inside(${n(T.hole)}, r, px);
    return vec4(clamp(wax, 0.0, 1.0), inside(${n(T.seed)}, r, px), 0.0, 0.0);
  }
  vec2 a = abs(c);
  float d = min(length(vec2(a.x - ${n(T.dotDist)}, a.y)), length(vec2(a.x, a.y - ${n(T.dotDist)})));
  return vec4(inside(${n(T.dotR)}, d, px), 0.0, 0.0, 0.0);
}

// Motif cells that come close to text are left out whole, so no shape
// is ever cut in half by a letter.
float keepAt(vec2 cellCentre, float ca, float sa) {
  vec2 at = mat2(ca, sa, -sa, ca) * cellCentre * uScale - vec2(0.0, uScroll);
  vec2 crowd = textureLod(uMask, vec2(at.x, uRes.y / uDpr - at.y) * uDpr / uRes, 6.0).rg;
  return 1.0 - max(step(0.004, crowd.r), step(0.02, crowd.g));
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = fc / uDpr;                 // css px, top-left origin
  vec2 pc = p + vec2(0.0, uScroll);   // position on the cloth itself
  vec2 uv = gl_FragCoord.xy / uRes;

  // Hand-drawn wax wanders a little off the ideal line.
  vec2 wob = vec2(noise(pc * 0.021 + uPhase * 10.0), noise(pc * 0.021 + 31.7)) - 0.5;
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 l = mat2(ca, -sa, sa, ca) * (pc + wob * 3.0) / uScale;
  float px = 0.8 / (uScale * uDpr);
  vec4 m = uKind == 0 ? kawung(l, px) : uKind == 1 ? parang(l, px) : truntum(l, px);

  float letters = 0.0, halo = 0.0, early = 0.0, keep = 1.0, keepCorner = 1.0;
  if (uHasMask == 1) {
    letters = texture(uMask, uv).r;
    vec4 near = textureLod(uMask, uv, 5.0);
    halo = near.r;
    early = smoothstep(0.03, 0.3, near.r) * 0.7 + smoothstep(0.1, 0.5, near.g) * 0.3;
    keep = keepAt(floor(l) + 0.5, ca, sa);
    keepCorner = keepAt(round(l), ca, sa);
  }
  float wax = max(max(m.x * keep, m.z * keepCorner), letters);
  float soga = max(m.y * keep, m.w * keepCorner) * (1.0 - letters);
  float ground = clamp(1.0 - wax - soga, 0.0, 1.0);

  // The dye creeps in along an uneven front, darkest at its tide line.
  // Zones kept clear take it first so text on the cloth reads early.
  float front = uDye * 1.6 - 0.15 + early;
  float nf = uDye < 1.0 ? fbm(pc / 220.0 + uPhase * 7.0) : 0.0;
  float dye = smoothstep(nf - 0.02, nf + 0.06, front);
  float sogaDye = smoothstep(nf - 0.02, nf + 0.06, front - 0.35);
  float tide = 1.0 - smoothstep(0.0, 0.05, abs(front - nf - 0.03));

  // Indigo is never flat: several dips, slowly drifting.
  vec2 q = pc / 340.0 + vec2(uTime * 0.012, -uTime * 0.008);
  float depth = fbm(q + noise(q * 1.7 + uPhase) * 0.9);
  vec3 ink = mix(NILA * 1.28, NILA, smoothstep(0.2, 0.55, depth));
  ink = mix(ink, NILA_TUA, smoothstep(0.5, 0.9, depth));
  ink = mix(ink, NILA_TUA, clamp(tide * 0.6 + halo * (1.0 - letters) * 0.9, 0.0, 1.0));

  vec3 col = MORI * wax + mix(MORI, SOGA, sogaDye) * soga + mix(MORI, ink, dye) * ground;

  // Remukan: dye seeps into the cracks of the wax. Only wax can crack,
  // so the rest of the cloth skips the work.
  if (wax * dye > 0.01) {
    float patchy = smoothstep(0.35, 0.7, noise(pc / 90.0 + uPhase * 3.0));
    vec2 cp = pc / (uScale * 0.42) + fbm(pc / 60.0) * 0.8;
    float vw = 0.9 / (uScale * 0.42);
    float vein = (1.0 - smoothstep(vw * 0.4, vw * 1.4, crack(cp))) * patchy;
    col = mix(col, NILA_TUA * 1.15, vein * wax * dye * 0.75);
  }

  // Wax from the pointer: warm while fresh, then cotton, then the dye
  // bleeds back in from a ragged edge.
  if (uHasTrail == 1) {
    // Wax never lands on text sitting on the cloth.
    float tw = texture(uTrail, uv).r * (1.0 - float(uHasMask) * texture(uMask, uv).g);
    if (tw > 0.03) {
      float th = 0.04 + 0.35 * noise(pc / 14.0);
      col = mix(col, mix(MORI, MALAM, smoothstep(0.55, 1.0, tw)), smoothstep(th, th + 0.08, tw));
    }
  }

  // Cotton: slubs along warp and weft, and a fine grain.
  float slub = noise(vec2(pc.x * 0.9, pc.y * 0.04)) * noise(vec2(pc.x * 0.04, pc.y * 0.9));
  col *= 0.97 + 0.045 * slub + 0.03 * (hash21(floor(pc)) - 0.5);

  float alpha = 1.0;
  if (uHole.z > 0.0) {
    float d = length(p - uHole.xy) + (fbm(p / 18.0 + uPhase) - 0.5) * uHole.z * 0.24;
    col = mix(col, SCORCH, 1.0 - smoothstep(uHole.z, uHole.z + 24.0, d));
    alpha = smoothstep(uHole.z - 0.75, uHole.z + 0.75, d);
  }
  outColor = vec4(col * alpha, alpha);
}`;

/* ---------- GL plumbing ---------- */

const glCanvas = document.createElement("canvas");
const gl = glCanvas.getContext("webgl2", {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: "low-power",
});

function program(frag, names) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return { p, u: Object.fromEntries(names.map((k) => [k, gl.getUniformLocation(p, k)])) };
}

function texture(w, h, mipmap = false) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

let cloth, trail, blank;

function setup() {
  cloth = program(CLOTH, [
    "uRes", "uDpr", "uTime", "uDye", "uKind", "uScale", "uAngle", "uPhase", "uScroll",
    "uMask", "uHasMask", "uTrail", "uHasTrail", "uHole",
  ]);
  trail = program(TRAIL, ["uPrev", "uRes", "uA", "uB", "uR", "uDecay", "uStamp"]);
  blank = texture(1, 1);
  gl.bindVertexArray(gl.createVertexArray());
}

/* ---------- targets ---------- */

const targets = [];
let primary = null;

function resize(t) {
  t.cssW = t.el.clientWidth;
  t.cssH = t.el.clientHeight;
  const scale = Math.min(devicePixelRatio || 1, DPR_CAP) * t.quality;
  t.w = Math.max(1, Math.round(t.cssW * scale));
  t.h = Math.max(1, Math.round(t.cssH * scale));
  t.canvas.width = t.w;
  t.canvas.height = t.h;
  if (glCanvas.width < t.w || glCanvas.height < t.h) {
    glCanvas.width = Math.max(glCanvas.width, t.w);
    glCanvas.height = Math.max(glCanvas.height, t.h);
  }
  if (t === primary) {
    t.fixed = getComputedStyle(t.el).position === "fixed";
    buildTrail(t);
    buildMask(t);
  }
  t.dirty = true;
}

function buildTrail(t) {
  if (t.trail) {
    for (const x of t.trail.tex) gl.deleteTexture(x);
    for (const x of t.trail.fbo) gl.deleteFramebuffer(x);
  }
  const w = Math.ceil(t.w / 2);
  const h = Math.ceil(t.h / 2);
  const tex = [texture(w, h), texture(w, h)];
  const fbo = tex.map((x) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, x, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return fb;
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  t.trail = { w, h, tex, fbo, i: 0, last: 0 };
}

// Letters marked data-wax are drawn as resist (red); boxes marked
// data-clear keep the motif away so their text reads (green).
function buildMask(t) {
  const wax = [...document.querySelectorAll("[data-wax]")];
  const clear = [...document.querySelectorAll("[data-clear]")];
  if (!wax.length && !clear.length) return;
  const c = document.createElement("canvas");
  c.width = t.w;
  c.height = t.h;
  const x = c.getContext("2d");
  const k = t.w / t.cssW;
  const base = t.canvas.getBoundingClientRect();
  x.fillStyle = "#000";
  x.fillRect(0, 0, t.w, t.h);
  x.globalCompositeOperation = "lighter";
  x.fillStyle = "#0f0";
  const pad = 18;
  for (const el of clear) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    x.fillRect((r.left - base.left - pad) * k, (r.top - base.top - pad) * k, (r.width + 2 * pad) * k, (r.height + 2 * pad) * k);
  }
  x.fillStyle = "#f00";
  for (const el of wax) {
    const cs = getComputedStyle(el);
    x.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * k}px ${cs.fontFamily}`;
    x.letterSpacing = `${(parseFloat(cs.letterSpacing) || 0) * k}px`;
    for (const line of el.querySelectorAll(".line")) {
      const r = line.getBoundingClientRect();
      const text = line.textContent;
      const mt = x.measureText(text);
      const asc = mt.fontBoundingBoxAscent;
      const baseline = (r.top - base.top) * k + (r.height * k - (asc + mt.fontBoundingBoxDescent)) / 2 + asc;
      x.fillText(text, (r.left - base.left) * k, baseline);
    }
  }
  if (!t.mask) t.mask = texture(1, 1, true);
  gl.bindTexture(gl.TEXTURE_2D, t.mask);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
}

/* ---------- drawing ---------- */

const ease = (x) => x * x * (3 - 2 * x);

function stepTrail(t, now) {
  const tr = t.trail;
  const dt = tr.last ? Math.min(now - tr.last, 100) : 16;
  tr.last = now;
  const stamp = t.penA && t.penB;
  if (!stamp && now - t.lastStamp > WAX_MS) return;
  const k = tr.w / t.cssW;
  gl.bindFramebuffer(gl.FRAMEBUFFER, tr.fbo[tr.i ^ 1]);
  gl.viewport(0, 0, tr.w, tr.h);
  gl.useProgram(trail.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tr.tex[tr.i]);
  gl.uniform1i(trail.u.uPrev, 0);
  gl.uniform2f(trail.u.uRes, tr.w, tr.h);
  gl.uniform1f(trail.u.uDecay, Math.max((dt / 1000) * 0.2, 1.001 / 255));
  gl.uniform1f(trail.u.uStamp, stamp ? 1 : 0);
  if (stamp) {
    gl.uniform2f(trail.u.uA, t.penA.x * k, tr.h - t.penA.y * k);
    gl.uniform2f(trail.u.uB, t.penB.x * k, tr.h - t.penB.y * k);
    gl.uniform1f(trail.u.uR, PEN_RADIUS * k);
    t.penA = t.penB;
    t.penB = null;
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  tr.i ^= 1;
}

function draw(t, now) {
  if (t.trail) stepTrail(t, now);
  const dye = reduce.matches ? 1 : t.dye0 === null ? 0 : ease(Math.min(1, (now - t.dye0) / DYE_MS));
  const u = cloth.u;
  gl.viewport(0, 0, t.w, t.h);
  gl.useProgram(cloth.p);
  gl.uniform2f(u.uRes, t.w, t.h);
  gl.uniform1f(u.uDpr, t.w / t.cssW);
  gl.uniform1f(u.uTime, reduce.matches ? 0 : now / 1000);
  gl.uniform1f(u.uDye, dye);
  gl.uniform1i(u.uKind, t.m.kind);
  gl.uniform1f(u.uScale, t.m.scale);
  gl.uniform1f(u.uAngle, (t.m.angle * Math.PI) / 180);
  gl.uniform1f(u.uPhase, t.m.phase);
  gl.uniform1f(u.uScroll, t.fixed ? scrollY : 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, t.mask || blank);
  gl.uniform1i(u.uMask, 0);
  gl.uniform1i(u.uHasMask, t.mask ? 1 : 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, t.trail ? t.trail.tex[t.trail.i] : blank);
  gl.uniform1i(u.uTrail, 1);
  gl.uniform1i(u.uHasTrail, t.trail ? 1 : 0);
  const hole = t === primary && document.querySelector("[data-hole]");
  if (hole) {
    const r = hole.getBoundingClientRect();
    const base = t.canvas.getBoundingClientRect();
    gl.uniform3f(u.uHole, r.left - base.left + r.width / 2, r.top - base.top + r.height / 2, r.width / 2);
  } else {
    gl.uniform3f(u.uHole, 0, 0, 0);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // The drawing buffer is still intact within this task, so copy it out.
  t.ctx.globalCompositeOperation = "copy";
  t.ctx.drawImage(glCanvas, 0, glCanvas.height - t.h, t.w, t.h, 0, 0, t.w, t.h);
  if (!t.live) {
    t.live = true;
    t.el.classList.add("is-live");
  }
}

let raf = 0;
let lastFrame = 0;
const kick = () => {
  if (!raf) raf = requestAnimationFrame(frame);
};

function frame(now) {
  raf = 0;
  const dt = lastFrame ? now - lastFrame : 16;
  lastFrame = now;
  let more = false;
  for (const t of targets) {
    if (!t.visible || !t.w) continue;
    const dyeing = !reduce.matches && t.dye0 !== null && now - t.dye0 < DYE_MS;
    const breathing = t === primary && !reduce.matches && !document.hidden;
    if (!(t.dirty || dyeing || breathing)) continue;
    more ||= dyeing || breathing;
    // Once the dye has settled and the wax has faded, the slow drift
    // needs only a third of the frames.
    const idle = !dyeing && now - t.lastStamp > WAX_MS;
    t.tick = (t.tick + 1) % 3;
    if (!t.dirty && idle && t.tick) continue;
    draw(t, now);
    t.dirty = false;
    if (t === primary && !idle) adapt(t, dt);
  }
  if (more) kick();
  else lastFrame = 0;
}

// Drop resolution if the GPU cannot keep up.
function adapt(t, dt) {
  t.slow = t.slow * 0.95 + dt * 0.05;
  if (++t.frames > 45 && t.slow > 24 && t.quality > 0.55) {
    t.quality *= 0.8;
    t.frames = 0;
    t.slow = 16;
    resize(t);
  }
}

/* ---------- start ---------- */

function penAt(e) {
  const t = primary;
  if (reduce.matches || !t) return;
  const r = t.canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (x < 0 || y < 0 || x > r.width || y > r.height) {
    t.penA = null;
    return;
  }
  t.penB = { x, y };
  t.penA ||= t.penB;
  t.lastStamp = performance.now();
  kick();
}

function start() {
  setup();
  for (const el of document.querySelectorAll("[data-cloth]")) {
    const canvas = document.createElement("canvas");
    canvas.className = "cloth-canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.querySelector(".cloth-still").after(canvas);
    const t = {
      el, canvas, ctx: canvas.getContext("2d"), m: motif(el.dataset.seed),
      quality: 1, w: 0, h: 0, cssW: 0, cssH: 0, fixed: false,
      dye0: null, visible: false, dirty: true, live: false, tick: 0,
      frames: 0, slow: 16, mask: null, trail: null, penA: null, penB: null, lastStamp: -1e9,
    };
    if (el.dataset.cloth !== "swatch") primary = t;
    targets.push(t);
    if (el.dataset.cloth === "swatch") {
      el.closest("li")?.addEventListener("pointerenter", () => {
        if (reduce.matches || (t.dye0 !== null && performance.now() - t.dye0 < DYE_MS)) return;
        t.dye0 = performance.now();
        kick();
      });
    }
  }

  const resized = new ResizeObserver((entries) => {
    for (const e of entries) resize(targets.find((t) => t.el === e.target));
    kick();
  });
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = targets.find((x) => x.el === e.target);
      t.visible = e.isIntersecting;
      if (t.visible && t.dye0 === null) t.dye0 = performance.now();
      t.dirty ||= t.visible;
    }
    kick();
  });
  for (const t of targets) {
    resized.observe(t.el);
    seen.observe(t.el);
  }

  addEventListener("pointermove", penAt, { passive: true });
  addEventListener("pointerdown", penAt, { passive: true });
  addEventListener("pointerup", (e) => {
    if (primary && e.pointerType !== "mouse") primary.penA = null;
  });
  document.addEventListener("pointerout", (e) => {
    if (primary && !e.relatedTarget) primary.penA = null;
  });
  addEventListener("scroll", () => {
    if (primary?.fixed) {
      primary.dirty = true;
      kick();
    }
  }, { passive: true });
  document.addEventListener("visibilitychange", kick);
  reduce.addEventListener("change", () => {
    for (const t of targets) t.dirty = true;
    kick();
  });
  glCanvas.addEventListener("webglcontextlost", () => {
    cancelAnimationFrame(raf);
    for (const t of targets) {
      t.el.classList.remove("is-live");
      t.canvas.remove();
    }
    targets.length = 0;
    root.classList.remove("js");
  });
}

try {
  if (!gl) throw new Error("WebGL2 unavailable");
  await document.fonts.ready;
  start();
} catch (err) {
  root.classList.remove("js");
  console.warn("cloth: showing the still pattern.", err);
}
