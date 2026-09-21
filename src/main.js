// ============================================================================
// Mirror Dimension — main application. Injected into a single HTML file by
// build.mjs together with THREE_SRC, SHADERS, CITY_DATA and BUILD_INFO.
// ============================================================================

const $ = (s) => document.querySelector(s);
const loadingText = $('#loadingText');

// ---------------------------------------------------------------- i18n
const I18N = {
  zh: {
    city: '城市', time: '時段', mirror: '鏡像強度',
    hint: '拖曳旋轉 · 滾輪縮放 · 1–5 切城市 · Q/W 切日夜 · H 隱藏面板',
    lang: 'EN', attribution: '© OpenStreetMap 貢獻者',
    times: ['白天', '夜晚'],
    buildings: (n) => `${n} 棟建築`,
    loading: '正在展開城市…',
  },
  en: {
    city: 'City', time: 'Time', mirror: 'Mirror',
    hint: 'Drag to orbit · Scroll to zoom · 1–5 cities · Q/W day/night · H hides panel',
    lang: '繁中', attribution: '© OpenStreetMap contributors',
    times: ['Day', 'Night'],
    buildings: (n) => `${n} buildings`,
    loading: 'Unfolding the city…',
  },
};
// URL hash overrides, e.g. #city=2&time=night&mirror=0.6&lang=en
const HASH = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
let lang = HASH.lang === 'en' || HASH.lang === 'zh' ? HASH.lang : (/^zh/i.test(navigator.language) ? 'zh' : 'en');

// ---------------------------------------------------------------- bootstrap Three
let THREE;
try {
  const url = URL.createObjectURL(new Blob([THREE_SRC], { type: 'text/javascript' }));
  THREE = await import(url);
  URL.revokeObjectURL(url);
} catch (e) {
  console.error(e);
  showFallback();
  throw e;
}

function showFallback() {
  $('#loading').classList.add('done');
  $('#fallback').hidden = false;
  $('#panel').classList.add('hidden');
}

let renderer;
try {
  const canvas = $('#view');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
} catch (e) {
  console.error(e);
  showFallback();
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // manual gamma in post pass
renderer.autoClear = true;

// ---------------------------------------------------------------- day / night
const C = (hex) => new THREE.Color(hex);
const TIMES = [
  { key: 'day', shape: 1,
    skyTop: C('#1f5bbf'), skyBottom: C('#bfe4ff'), sunColor: C('#ffffff'), sunEl: 1.0, sunAz: 0.5,
    skyLight: C('#bcd7ff'), groundLight: C('#6a665a'), fog: C('#d7edff'), fogDensity: 0.00028,
    buildingTint: C('#d9d6c8'), windowColor: C('#fff6d8'), windowLit: 0.05,
    groundBase: C('#3f4640'), gridColor: C('#ffe9a0'),
    water: C('#3d7ea6'), grass: C('#5a9a44'), canopy: C('#3f7f33'), blossom: C('#3f7f33'), blossomAmt: 0,
    particle: C('#fff2a8'), fall: -3, sway: 6, size: 2.2, spin: 0.2, opacity: 0.55,
    grade: new THREE.Vector3(1.0, 1.0, 0.96), saturation: 1.15, vignette: 0.25 },
  { key: 'night', shape: 1,
    // a low moon, a warm city glow on the horizon and fireflies in the parks
    skyTop: C('#04070f'), skyBottom: C('#2a2438'), sunColor: C('#9aa8c8'), sunEl: 0.55, sunAz: -1.6,
    skyLight: C('#2a3452'), groundLight: C('#16181f'), fog: C('#0e1220'), fogDensity: 0.00055,
    buildingTint: C('#6f7686'), windowColor: C('#ffd59a'), windowLit: 0.55,
    groundBase: C('#191c24'), gridColor: C('#5fa8ff'),
    water: C('#0b1728'), grass: C('#1c3222'), canopy: C('#213a29'), blossom: C('#213a29'), blossomAmt: 0,
    particle: C('#ffd27a'), fall: -1, sway: 14, size: 2.6, spin: 0.3, opacity: 0.7,
    grade: new THREE.Vector3(0.88, 0.92, 1.12), saturation: 0.95, vignette: 0.55 },
];

function sunDir(s) {
  return new THREE.Vector3(Math.cos(s.sunEl) * Math.sin(s.sunAz), Math.sin(s.sunEl), Math.cos(s.sunEl) * Math.cos(s.sunAz)).normalize();
}

// current interpolated palette
const cur = {
  skyTop: new THREE.Color(), skyBottom: new THREE.Color(), sunColor: new THREE.Color(), sunDir: new THREE.Vector3(),
  skyLight: new THREE.Color(), groundLight: new THREE.Color(), fog: new THREE.Color(), fogDensity: 0,
  buildingTint: new THREE.Color(), windowColor: new THREE.Color(), windowLit: 0,
  groundBase: new THREE.Color(), gridColor: new THREE.Color(),
  water: new THREE.Color(), grass: new THREE.Color(), canopy: new THREE.Color(), blossom: new THREE.Color(), blossomAmt: 0,
  particle: new THREE.Color(), fall: 0, sway: 0, size: 0, spin: 0, opacity: 0,
  grade: new THREE.Vector3(), saturation: 1, vignette: 0.3,
};
const COLOR_KEYS = ['skyTop', 'skyBottom', 'sunColor', 'skyLight', 'groundLight', 'fog', 'buildingTint', 'windowColor', 'groundBase', 'gridColor', 'water', 'grass', 'canopy', 'blossom', 'particle'];
const SCALAR_KEYS = ['fogDensity', 'windowLit', 'blossomAmt', 'fall', 'sway', 'size', 'spin', 'opacity', 'saturation', 'vignette'];
function setPalette(target, s) {
  for (const k of COLOR_KEYS) target[k].copy(s[k]);
  target.sunDir.copy(sunDir(s));
  for (const k of SCALAR_KEYS) target[k] = s[k];
  target.grade.copy(s.grade);
}
function lerpPalette(target, s, t) {
  for (const k of COLOR_KEYS) target[k].lerp(s[k], t);
  target.sunDir.lerp(sunDir(s), t).normalize();
  for (const k of SCALAR_KEYS) target[k] += (s[k] - target[k]) * t;
  target.grade.lerp(s.grade, t);
}

// ---------------------------------------------------------------- city decoding + geometry
function decodeCity(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  let o = 0;
  const rd = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  const n = rd();
  const buildings = new Array(n);
  for (let i = 0; i < n; i++) {
    const nv = rd();
    const h = rd() / 2;
    const pts = new Float32Array(nv * 2);
    for (let j = 0; j < nv * 2; j++) pts[j] = rd() / 2;
    buildings[i] = { h, pts };
  }
  return buildings;
}

const fract = (x) => x - Math.floor(x);
function hash01(i) {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 15; x = (x * 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0;
  return x / 4294967296;
}

function buildCityGeometry(buildings) {
  const pos = [], nrm = [], uv = [], rnd = [], hgt = [], wall = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  const tri = (p0, p1, p2, n, uvs, r, h, w) => {
    a.set(...p0); b.set(...p1); c.set(...p2);
    ab.subVectors(b, a); ac.subVectors(c, a); fn.crossVectors(ab, ac);
    let P = [p0, p1, p2], U = uvs;
    if (fn.dot(n) < 0) { P = [p0, p2, p1]; U = [uvs[0], uvs[2], uvs[1]]; }
    for (let i = 0; i < 3; i++) {
      pos.push(P[i][0], P[i][1], P[i][2]);
      nrm.push(n.x, n.y, n.z);
      uv.push(U[i][0], U[i][1]);
      rnd.push(r); hgt.push(h); wall.push(w);
    }
  };
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  for (let bi = 0; bi < buildings.length; bi++) {
    const { h, pts } = buildings[bi];
    const nv = pts.length / 2;
    const r = hash01(bi + 1);
    let along = 0;
    for (let i = 0; i < nv; i++) {
      const x0 = pts[2 * i], z0 = pts[2 * i + 1];
      const x1 = pts[(2 * i + 2) % (nv * 2)], z1 = pts[(2 * i + 3) % (nv * 2)];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      n.set(dz / len, 0, -dx / len); // outward for positive signed area in (x,z)
      const p0 = [x0, 0, z0], p1 = [x1, 0, z1], p2 = [x1, h, z1], p3 = [x0, h, z0];
      const u0 = along, u1 = along + len;
      tri(p0, p1, p2, n, [[u0, 0], [u1, 0], [u1, h]], r, h, 1);
      tri(p0, p2, p3, n, [[u0, 0], [u1, h], [u0, h]], r, h, 1);
      along += len;
    }
    // roof
    const contour = [];
    for (let i = 0; i < nv; i++) contour.push(new THREE.Vector2(pts[2 * i], pts[2 * i + 1]));
    let faces = [];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch (_) { faces = []; }
    for (const f of faces) {
      const P = f.map((idx) => [contour[idx].x, h, contour[idx].y]);
      tri(P[0], P[1], P[2], up, P.map((p) => [p[0], p[2]]), r, h, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(rnd, 1));
  g.setAttribute('aHeight', new THREE.Float32BufferAttribute(hgt, 1));
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(wall, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- roads
// class -> [ribbon width m, sidewalk width m, car speed m/s (0 = no cars)]
const ROAD_SPEC = [
  [2.2, 0, 0],    // 0 footway
  [6.0, 0, 0],    // 1 pedestrian street
  [4.5, 0, 4],    // 2 service / alley
  [9.0, 2.5, 7],  // 3 residential
  [12.0, 2.8, 9], // 4 tertiary
  [16.0, 3.0, 12],// 5 secondary
  [20.0, 3.3, 14],// 6 primary
  [24.0, 3.5, 18],// 7 trunk / motorway
];
const sidewalkOf = (cls, width) => cls < 3 ? 0 : Math.min(1.8 + 0.25 * cls, width * 0.22);

function decodeRoads(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dv = new DataView(bytes.buffer);
  let o = 0;
  const rd = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  const n = rd();
  const roads = new Array(n);
  for (let i = 0; i < n; i++) {
    const nv = rd();
    const flags = rd();
    const cls = flags & 15, oneway = (flags & 16) !== 0;
    const pts = new Float32Array(nv * 2);
    const nodes = new Int16Array(nv);
    for (let j = 0; j < nv; j++) { pts[2 * j] = rd() / 2; pts[2 * j + 1] = rd() / 2; nodes[j] = rd(); }
    const cum = new Float32Array(nv);
    for (let j = 1; j < nv; j++) cum[j] = cum[j - 1] + Math.hypot(pts[2 * j] - pts[2 * j - 2], pts[2 * j + 1] - pts[2 * j - 1]);
    const width = ROAD_SPEC[cls][0];
    roads[i] = { cls, oneway, pts, nodes, cum, len: cum[nv - 1], width, sidewalk: sidewalkOf(cls, width), speed: ROAD_SPEC[cls][2] };
  }
  return roads;
}

// Flat ribbons along each road, mitred at the joints, subdivided so they follow the fold.
function buildRoadGeometry(roads) {
  const pos = [], across = [], along = [], widthA = [], clsA = [], index = [];
  const y = 0.3;
  // draw footways first and big roads last so that major roads sit on top at intersections
  const order = roads.map((r, i) => i).sort((a, b) => roads[a].cls - roads[b].cls);
  for (const ri of order) {
    const r = roads[ri];
    // subdivide long segments
    const P = [], L = [];
    const nv = r.pts.length / 2;
    for (let i = 0; i < nv; i++) {
      const x0 = r.pts[2 * i], z0 = r.pts[2 * i + 1];
      if (i > 0) {
        const xp = r.pts[2 * i - 2], zp = r.pts[2 * i - 1];
        const seg = Math.hypot(x0 - xp, z0 - zp);
        const k = Math.ceil(seg / 24);
        for (let j = 1; j < k; j++) { const t = j / k; P.push([xp + (x0 - xp) * t, zp + (z0 - zp) * t]); L.push(r.cum[i - 1] + seg * t); }
      }
      P.push([x0, z0]); L.push(r.cum[i]);
    }
    const n = P.length;
    const hw = r.width / 2;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const prev = P[Math.max(i - 1, 0)], next = P[Math.min(i + 1, n - 1)], cur = P[i];
      let d0x = cur[0] - prev[0], d0z = cur[1] - prev[1], d1x = next[0] - cur[0], d1z = next[1] - cur[1];
      const l0 = Math.hypot(d0x, d0z) || 1, l1 = Math.hypot(d1x, d1z) || 1;
      d0x /= l0; d0z /= l0; d1x /= l1; d1z /= l1;
      if (i === 0) { d0x = d1x; d0z = d1z; }
      if (i === n - 1) { d1x = d0x; d1z = d0z; }
      // normals of the two segments and the mitre between them
      const n0x = -d0z, n0z = d0x, n1x = -d1z, n1z = d1x;
      let mx = n0x + n1x, mz = n0z + n1z;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const scale = Math.min(1 / Math.max(mx * n0x + mz * n0z, 0.4), 2.5);
      const ox = mx * hw * scale, oz = mz * hw * scale;
      pos.push(cur[0] - ox, y, cur[1] - oz, cur[0] + ox, y, cur[1] + oz);
      across.push(-1, 1); along.push(L[i], L[i]); widthA.push(r.width, r.width);
      const c = r.cls + (r.oneway ? 16 : 0); clsA.push(c, c);
      if (i > 0) {
        const a = base + (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('aWidth', new THREE.Float32BufferAttribute(widthA, 1));
  g.setAttribute('aCls', new THREE.Float32BufferAttribute(clsA, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- agents (cars + pedestrians)
// Agents follow the road graph: at every shared node they may turn onto another
// road; at a dead end they turn back. `opts.allowed(road)` picks usable roads,
// `opts.speed(road)` the base speed and `opts.offset(road)` the lateral offset.
function makeAgents(roads, count, opts) {
  const usable = [];
  let total = 0;
  for (let i = 0; i < roads.length; i++) if (opts.allowed(roads[i])) { usable.push(i); total += roads[i].len; }
  const nodeMap = new Map();
  for (const ri of usable) {
    const r = roads[ri];
    for (let k = 0; k < r.nodes.length; k++) if (r.nodes[k] >= 0) {
      let list = nodeMap.get(r.nodes[k]);
      if (!list) nodeMap.set(r.nodes[k], list = []);
      list.push(ri, k);
    }
  }
  const n = usable.length ? Math.min(count, Math.max(20, Math.round(total / opts.spacing))) : 0;
  const road = new Int32Array(n), seg = new Int32Array(n), dir = new Int8Array(n);
  const s = new Float32Array(n), speed = new Float32Array(n), side = new Float32Array(n), seed = new Float32Array(n);
  const rand = Math.random;
  const pickRoad = () => { // weighted by length
    let x = rand() * total;
    for (const ri of usable) { x -= roads[ri].len; if (x <= 0) return ri; }
    return usable[usable.length - 1];
  };
  const enter = (i, ri, k, d) => {
    const r = roads[ri];
    const last = r.pts.length / 2 - 1;
    if (r.oneway && opts.obeyOneway) d = 1;
    if (k === last) d = -1; else if (k === 0) d = 1;
    road[i] = ri; dir[i] = d; s[i] = r.cum[k]; seg[i] = d > 0 ? Math.min(k, last - 1) : Math.max(k - 1, 0);
    speed[i] = opts.speed(r) * (0.75 + 0.5 * seed[i]);
    side[i] = opts.offset(r, seed[i]);
  };
  for (let i = 0; i < n; i++) {
    seed[i] = rand();
    const ri = pickRoad();
    const r = roads[ri];
    const k = Math.floor(rand() * (r.pts.length / 2 - 1));
    enter(i, ri, k, rand() < 0.5 ? 1 : -1);
    s[i] = r.cum[k] + rand() * (r.cum[k + 1] - r.cum[k]);
  }
  // arrived at point k of the current road: maybe switch to another road through this node
  const arrive = (i, k, atEnd) => {
    const r = roads[road[i]];
    const node = r.nodes[k];
    const list = node >= 0 ? nodeMap.get(node) : null;
    if (list && list.length > 2 && (atEnd || rand() < opts.turnP)) {
      // gather candidates other than the current road (and entries that would go against a oneway)
      const cand = [];
      for (let j = 0; j < list.length; j += 2) {
        const rj = list[j], kj = list[j + 1];
        if (rj === road[i]) continue;
        const rr = roads[rj];
        if (opts.obeyOneway && rr.oneway && kj === rr.pts.length / 2 - 1) continue;
        cand.push(rj, kj);
      }
      if (cand.length) {
        const c = Math.floor(rand() * (cand.length / 2)) * 2;
        enter(i, cand[c], cand[c + 1], rand() < 0.5 ? 1 : -1);
        return;
      }
    }
    if (atEnd) {
      if (opts.obeyOneway && r.oneway) { // nowhere to go: respawn somewhere else
        const ri = pickRoad();
        enter(i, ri, Math.floor(rand() * (roads[ri].pts.length / 2 - 1)), 1);
      } else {
        dir[i] = -dir[i];
      }
    }
  };
  const step = (dt, emit) => {
    for (let i = 0; i < n; i++) {
      let r = roads[road[i]];
      const last = r.pts.length / 2 - 1;
      s[i] += dir[i] * speed[i] * dt;
      if (dir[i] > 0) {
        while (seg[i] < last - 1 && s[i] >= r.cum[seg[i] + 1]) { seg[i]++; arrive(i, seg[i], false); r = roads[road[i]]; if (dir[i] < 0) break; }
        if (dir[i] > 0 && s[i] >= r.len) { s[i] = r.len; arrive(i, r.pts.length / 2 - 1, true); r = roads[road[i]]; }
      } else {
        while (seg[i] > 0 && s[i] <= r.cum[seg[i]]) { seg[i]--; arrive(i, seg[i] + 1, false); r = roads[road[i]]; if (dir[i] > 0) break; }
        if (dir[i] < 0 && s[i] <= 0) { s[i] = 0; arrive(i, 0, true); r = roads[road[i]]; }
      }
      // position on the segment + lateral offset to the travelling side
      const k = seg[i];
      const x0 = r.pts[2 * k], z0 = r.pts[2 * k + 1], x1 = r.pts[2 * k + 2], z1 = r.pts[2 * k + 3];
      const l = r.cum[k + 1] - r.cum[k] || 1;
      const t = THREE.MathUtils.clamp((s[i] - r.cum[k]) / l, 0, 1);
      let hx = (x1 - x0) / l * dir[i], hz = (z1 - z0) / l * dir[i];
      const off = side[i];
      emit(i, x0 + (x1 - x0) * t - hz * off, z0 + (z1 - z0) * t + hx * off, hx, hz, seed[i]);
    }
  };
  return { n, step, seed };
}

// ---------------------------------------------------------------- areas (water + parks)
const GROUND_SIZE = 2600; // must match build.mjs GROUND_M
// Decode the per-city PNG mask (R = water, G = parks) into a texture plus its pixels,
// used by the ground shader and to scatter trees.
function loadMask(b64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;
      const tex = new THREE.Texture(img);
      tex.flipY = false; // row 0 is north (z = -size/2), matching the shader's uv = xz / size + 0.5
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      resolve({ tex, px, w: img.width, h: img.height });
    };
    img.onerror = reject;
    img.src = 'data:image/png;base64,' + b64;
  });
}

// Scatter trees on the park mask: jittered grid, kept where the green channel is set.
function scatterTrees(mask, max) {
  const { px, w, h } = mask;
  const step = 3; // pixels (~7.5 m)
  const out = [];
  for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) {
    const r = hash01(y * w + x);
    if (r > 0.6) continue;
    const jx = x + (hash01(x * 7 + y) - 0.5) * step, jy = y + (hash01(x + y * 13) - 0.5) * step;
    const i = (Math.round(jy) * w + Math.round(jx)) * 4;
    if (px[i + 1] < 128 || px[i] > 128) continue;
    out.push((jx / w - 0.5) * GROUND_SIZE, (jy / h - 0.5) * GROUND_SIZE);
  }
  // too many: keep a random subset
  let n = out.length / 2;
  if (n > max) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash01(i * 31 + 7) * (i + 1)); [out[2 * i], out[2 * j]] = [out[2 * j], out[2 * i]]; [out[2 * i + 1], out[2 * j + 1]] = [out[2 * j + 1], out[2 * i + 1]]; }
    n = max;
  }
  return { xz: out, n };
}

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 12000);

const foldUniforms = {
  uIntensity: { value: 0 },
  uTime: { value: 0 },
  uCamAz: { value: 0 },
  uCamDist: { value: 700 },
  uCurlR: { value: 520 },
};
const lightUniforms = {
  uCamPos: { value: new THREE.Vector3() },
  uSunDir: { value: cur.sunDir },
  uSunColor: { value: cur.sunColor },
  uSkyColor: { value: cur.skyLight },
  uGroundColor: { value: cur.groundLight },
  uFogColor: { value: cur.fog },
  uFogDensity: { value: 0.0008 },
};

const LIGHT = SHADERS['lighting.glsl'];
const buildingMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['building.vert'],
  fragmentShader: LIGHT + SHADERS['building.frag'],
  uniforms: {
    ...foldUniforms, ...lightUniforms,
    uBuildingTint: { value: cur.buildingTint },
    uWindowColor: { value: cur.windowColor },
    uWindowLit: { value: 0.2 },
  },
});
const cityMesh = new THREE.Mesh(new THREE.BufferGeometry(), buildingMat);
cityMesh.frustumCulled = false;
scene.add(cityMesh);

const groundMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['ground.vert'],
  fragmentShader: LIGHT + SHADERS['ground.frag'],
  uniforms: {
    ...foldUniforms, ...lightUniforms,
    uGroundBase: { value: cur.groundBase },
    uGridColor: { value: cur.gridColor },
    uWater: { value: cur.water },
    uGrass: { value: cur.grass },
    uMask: { value: null },
    uGroundSize: { value: GROUND_SIZE },
  },
});
const emptyMask = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
emptyMask.needsUpdate = true;
groundMat.uniforms.uMask.value = emptyMask;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 104, 104);
groundGeo.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.position.y = -0.05;
ground.frustumCulled = false;
scene.add(ground);

// streets
const nightUniform = { value: 0 };
const roadMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['road.vert'],
  fragmentShader: LIGHT + SHADERS['road.frag'],
  depthWrite: false, // ribbons overlap at junctions; the depth test against ground/buildings is enough
  uniforms: { ...foldUniforms, ...lightUniforms, uNight: nightUniform, uWindowColor: { value: cur.windowColor } },
});
const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
roadMesh.frustumCulled = false;
roadMesh.renderOrder = 1;
scene.add(roadMesh);

// cars: one instanced low-poly body, matrices updated from the traffic simulation
const MAX_CARS = 700;
function carGeometry() {
  const parts = [
    new THREE.BoxGeometry(4.4, 0.9, 1.9).translate(0, 0.8, 0),     // body
    new THREE.BoxGeometry(2.3, 0.65, 1.7).translate(-0.25, 1.55, 0), // cabin
  ];
  const pos = [], nrm = [];
  for (const g of parts) {
    const ng = g.toNonIndexed();
    pos.push(...ng.getAttribute('position').array);
    nrm.push(...ng.getAttribute('normal').array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.scale(1.2, 1.2, 1.2);
  return g;
}
const carMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['car.vert'],
  fragmentShader: LIGHT + SHADERS['car.frag'],
  uniforms: { ...foldUniforms, ...lightUniforms, uNight: nightUniform },
});
const cars = new THREE.InstancedMesh(carGeometry(), carMat, MAX_CARS);
cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cars.frustumCulled = false;
cars.count = 0;
scene.add(cars);
const CAR_COLORS = ['#f2f2f0', '#f2f2f0', '#e9e9ea', '#1a1a1c', '#1a1a1c', '#8d9096', '#5a5d63', '#b8bcc2', '#9e1b1b', '#1f3f7a', '#2b4a3a', '#6f2a5a', '#c9772a'];
const TAXI = { taipei: '#f4c20d', tokyo: '#151515', newyork: '#f7b500', hongkong: '#c8102e' };

// trees: low-poly trunk + canopy, scattered on parks
const MAX_TREES = 3500;
function treeGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.22, 0.3, 2.6, 5).translate(0, 1.3, 0),
    new THREE.IcosahedronGeometry(2.4, 0).scale(1, 1.25, 1).translate(0, 4.6, 0),
  ];
  const pos = [], nrm = [];
  for (const g of parts) {
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    pos.push(...ng.getAttribute('position').array);
    nrm.push(...ng.getAttribute('normal').array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
const treeMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['tree.vert'],
  fragmentShader: LIGHT + SHADERS['tree.frag'],
  uniforms: { ...foldUniforms, ...lightUniforms, uCanopy: { value: cur.canopy }, uBlossom: { value: cur.blossom }, uBlossomAmt: { value: 0 } },
});
const trees = new THREE.InstancedMesh(treeGeometry(), treeMat, MAX_TREES);
trees.frustumCulled = false;
trees.count = 0;
scene.add(trees);

// pedestrians: point sprites, positions updated from the same graph walker
const MAX_PEOPLE = 6000;
const peopleGeo = new THREE.BufferGeometry();
peopleGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_PEOPLE * 3), 3).setUsage(THREE.DynamicDrawUsage));
peopleGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(MAX_PEOPLE * 3), 3));
peopleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3000);
const peopleMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['people.vert'],
  fragmentShader: SHADERS['people.frag'],
  transparent: true, depthWrite: false,
  uniforms: {
    ...foldUniforms, ...lightUniforms,
    uPixelRatio: { value: renderer.getPixelRatio() }, uViewH: { value: 1 },
  },
});
const people = new THREE.Points(peopleGeo, peopleMat);
people.frustumCulled = false;
scene.add(people);

const skyMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['sky.vert'],
  fragmentShader: SHADERS['sky.frag'],
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    uSkyTop: { value: cur.skyTop }, uSkyBottom: { value: cur.skyBottom },
    uSunDir: { value: cur.sunDir }, uSunColor: { value: cur.sunColor },
    uIntensity: foldUniforms.uIntensity, uTime: foldUniforms.uTime,
    uNight: nightUniform,
  },
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

// particles
const PARTICLES = 2600;
const seeds = new Float32Array(PARTICLES * 3);
for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
const partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PARTICLES * 3), 3));
partGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 3));
partGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 240, 0), 1200);
const partMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['particles.vert'],
  fragmentShader: SHADERS['particles.frag'],
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: foldUniforms.uTime,
    uFall: { value: 8 }, uSway: { value: 10 }, uSize: { value: 3 }, uSpin: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uColor: { value: cur.particle }, uShape: { value: 0 }, uOpacity: { value: 1 },
  },
});
const particles = new THREE.Points(partGeo, partMat);
particles.frustumCulled = false;
scene.add(particles);

// post-processing
const rtOpts = { samples: 4, wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.MirroredRepeatWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
let rt = new THREE.WebGLRenderTarget(2, 2, rtOpts);
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['post.vert'],
  fragmentShader: SHADERS['post.frag'],
  depthTest: false, depthWrite: false,
  uniforms: {
    tDiffuse: { value: rt.texture },
    uIntensity: foldUniforms.uIntensity, uTime: foldUniforms.uTime,
    uAspect: { value: 1 },
    uGrade: { value: cur.grade }, uSaturation: { value: 1 }, uVignette: { value: 0.3 },
  },
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio();
  rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
  postMat.uniforms.uAspect.value = w / h;
  partMat.uniforms.uPixelRatio.value = pr;
  peopleMat.uniforms.uPixelRatio.value = pr;
  peopleMat.uniforms.uViewH.value = Math.floor(h * pr);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- camera controller
const orbit = {
  target: new THREE.Vector3(0, 40, 0),
  theta: 0.6, phi: 1.12, radius: 720,
  autoSpeed: 0.045, // rad/s
  lastInteraction: -1e9,
  dragging: false, lastX: 0, lastY: 0, pinchDist: 0,
  vTheta: 0, vPhi: 0,
};
for (const k of ['theta', 'phi', 'radius']) { const v = parseFloat(HASH[k]); if (Number.isFinite(v)) orbit[k] = v; } // #theta=..&phi=..&radius=.. for screenshots
const canvas = renderer.domElement;
const now = () => performance.now() / 1000;
canvas.addEventListener('pointerdown', (e) => { orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; orbit.lastInteraction = now(); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!orbit.dragging) return;
  const dx = e.clientX - orbit.lastX, dy = e.clientY - orbit.lastY;
  orbit.lastX = e.clientX; orbit.lastY = e.clientY;
  orbit.vTheta = -dx * 0.005; orbit.vPhi = -dy * 0.004;
  orbit.theta += orbit.vTheta; orbit.phi += orbit.vPhi;
  orbit.lastInteraction = now();
});
const endDrag = () => { orbit.dragging = false; orbit.lastInteraction = now(); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.radius *= Math.exp(e.deltaY * 0.0012); orbit.lastInteraction = now(); }, { passive: false });
canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) orbit.pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2) return;
  const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  if (orbit.pinchDist > 0) orbit.radius *= orbit.pinchDist / d;
  orbit.pinchDist = d; orbit.lastInteraction = now();
}, { passive: true });

function updateCamera(dt, t) {
  const idle = t - orbit.lastInteraction;
  if (!orbit.dragging) {
    orbit.theta += orbit.vTheta; orbit.phi += orbit.vPhi;
    orbit.vTheta *= 0.9; orbit.vPhi *= 0.9;
    const resume = THREE.MathUtils.smoothstep(idle, 3.0, 6.0);
    orbit.theta += orbit.autoSpeed * dt * resume;
    orbit.phi += (1.12 + Math.sin(t * 0.13) * 0.08 - orbit.phi) * 0.4 * dt * resume;
  }
  orbit.phi = THREE.MathUtils.clamp(orbit.phi, 0.25, 1.48);
  orbit.radius = THREE.MathUtils.clamp(orbit.radius, 60, 1700);
  const r = orbit.radius;
  camera.position.set(
    orbit.target.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    orbit.target.y + r * Math.cos(orbit.phi),
    orbit.target.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
  );
  camera.lookAt(orbit.target);
  foldUniforms.uCamAz.value = Math.atan2(-camera.position.x, camera.position.z);
  foldUniforms.uCamDist.value = Math.hypot(camera.position.x, camera.position.z);
  lightUniforms.uCamPos.value.copy(camera.position);
}

// ---------------------------------------------------------------- state
const state = {
  cityIndex: 0,
  timeIndex: 0,
  sliderMirror: 0.35,
  mirror: 0.35,
  transition: null, // { phase: 'in' | 'out', nextCity }
  prevTime: 0, timeBlend: 1,
  panelHidden: false,
};
// defaults: Taipei by day (timeIndex 0 = day; city index 0 = Taipei, see loadCity below)
{
  const ti = ['day', 'night'].indexOf(HASH.time);
  if (ti >= 0) state.timeIndex = ti;
  const m = parseFloat(HASH.mirror);
  if (Number.isFinite(m)) state.sliderMirror = THREE.MathUtils.clamp(m, 0, 1);
}
state.prevTime = state.timeIndex;
setPalette(cur, TIMES[state.timeIndex]);

const decodedCities = new Map();
let traffic = null, crowd = null;
const carDummy = new THREE.Object3D();
function loadCity(i) {
  const c = CITY_DATA[i];
  if (!decodedCities.has(c.key)) {
    const roads = decodeRoads(c.roads);
    decodedCities.set(c.key, { geo: buildCityGeometry(decodeCity(c.data)), roadGeo: buildRoadGeometry(roads), roads });
  }
  const entry = decodedCities.get(c.key);
  cityMesh.geometry = entry.geo;
  roadMesh.geometry = entry.roadGeo;
  foldUniforms.uCurlR.value = Math.max(520, c.maxH + 90);

  // water / parks mask and trees arrive once the PNG has decoded
  groundMat.uniforms.uMask.value = emptyMask;
  trees.count = 0;
  if (!entry.mask) entry.mask = loadMask(c.areas).then((m) => ({ ...m, trees: scatterTrees(m, MAX_TREES) }));
  entry.mask.then((m) => {
    if (state.cityIndex !== i) return; // switched away while decoding
    groundMat.uniforms.uMask.value = m.tex;
    const { xz, n } = m.trees;
    for (let k = 0; k < n; k++) {
      const sc = 0.7 + 0.7 * hash01(k * 17 + 3);
      carDummy.position.set(xz[2 * k], 0, xz[2 * k + 1]);
      carDummy.rotation.set(0, hash01(k * 5 + 1) * Math.PI * 2, 0);
      carDummy.scale.set(sc, sc * (0.9 + 0.3 * hash01(k * 3 + 9)), sc);
      carDummy.updateMatrix();
      trees.setMatrixAt(k, carDummy.matrix);
      trees.setColorAt(k, new THREE.Color(hash01(k * 11 + 2), 0, hash01(k * 23 + 5)));
    }
    carDummy.scale.set(1, 1, 1);
    trees.count = n;
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  }).catch((e) => console.warn('area mask failed', e));

  // traffic keeps to the driving side of each city; oneway roads are respected
  const sideSign = c.driveLeft ? -1 : 1;
  traffic = makeAgents(entry.roads, MAX_CARS, {
    spacing: 30, turnP: 0.3, obeyOneway: true,
    allowed: (r) => r.speed > 0,
    speed: (r) => r.speed,
    offset: (r, seed) => {
      const roadHalf = r.width / 2 - r.sidewalk;
      if (r.oneway) return (seed - 0.5) * roadHalf * 1.1; // spread across the lanes
      return sideSign * roadHalf * (0.45 + 0.25 * seed);
    },
  });
  cars.count = traffic.n;
  const taxi = TAXI[c.key] ? new THREE.Color(TAXI[c.key]) : null;
  for (let k = 0; k < traffic.n; k++) {
    const col = taxi && Math.random() < 0.14 ? taxi : new THREE.Color(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]);
    cars.setColorAt(k, col);
  }
  cars.instanceColor.needsUpdate = true;

  // pedestrians use every road, on the sidewalk where there is one
  crowd = makeAgents(entry.roads, MAX_PEOPLE, {
    spacing: 12, turnP: 0.45, obeyOneway: false,
    allowed: () => true,
    speed: () => 1.4,
    offset: (r, seed) => {
      if (r.sidewalk > 0) return (seed < 0.5 ? -1 : 1) * (r.width / 2 - r.sidewalk * (0.25 + 0.6 * fract(seed * 7)));
      return (seed - 0.5) * r.width * 0.7;
    },
  });
  const seeds = peopleGeo.getAttribute('aSeed');
  for (let k = 0; k < crowd.n; k++) seeds.setXYZ(k, Math.random(), Math.random(), Math.random());
  seeds.needsUpdate = true;
  peopleGeo.setDrawRange(0, crowd.n);
  state.cityIndex = i;
  updateTitle();
  $('#stats').textContent = I18N[lang].buildings(c.count);
  document.querySelectorAll('#cities button').forEach((b, j) => b.classList.toggle('active', j === i));
}

function requestCity(i) {
  if (i === state.cityIndex && !state.transition) return;
  if (state.transition) { state.transition.nextCity = i; return; }
  state.transition = { phase: 'in', nextCity: i };
  $('#title').classList.add('fade');
}

function setTime(i) {
  if (i === state.timeIndex) return;
  state.prevTime = state.timeIndex;
  state.timeIndex = i;
  state.timeBlend = 0;
  updateTitle();
  document.querySelectorAll('#times button').forEach((b, j) => b.classList.toggle('active', j === i));
}

// ---------------------------------------------------------------- UI
function updateTitle() {
  const c = CITY_DATA[state.cityIndex];
  $('#cityName').textContent = c.name[lang];
  $('#citySub').textContent = c.sub[lang];
  $('#timeChip').textContent = I18N[lang].times[state.timeIndex];
}
function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I18N[lang][el.dataset.i18n]; });
  $('#lang').textContent = I18N[lang].lang;
  document.querySelectorAll('#cities button').forEach((b, i) => { b.firstChild.textContent = CITY_DATA[i].name[lang]; });
  document.querySelectorAll('#times button').forEach((b, i) => { b.firstChild.textContent = I18N[lang].times[i]; });
  $('#stats').textContent = I18N[lang].buildings(CITY_DATA[state.cityIndex].count);
  updateTitle();
}
function makeButtons(container, items, keys, onClick) {
  container.innerHTML = '';
  items.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.append(document.createTextNode(label));
    const k = document.createElement('kbd'); k.textContent = keys[i]; b.append(k);
    b.addEventListener('click', () => onClick(i));
    container.append(b);
  });
}
makeButtons($('#cities'), CITY_DATA.map((c) => c.name[lang]), ['1', '2', '3', '4', '5'], requestCity);
makeButtons($('#times'), I18N[lang].times, ['Q', 'W'], setTime);
document.querySelectorAll('#times button')[state.timeIndex].classList.add('active');

const slider = $('#mirror');
const setSlider = (v) => {
  state.sliderMirror = THREE.MathUtils.clamp(v, 0, 1);
  slider.value = state.sliderMirror;
  $('#mirrorVal').textContent = Math.round(state.sliderMirror * 100) + '%';
};
slider.addEventListener('input', () => setSlider(parseFloat(slider.value)));
setSlider(state.sliderMirror);

$('#lang').addEventListener('click', () => { lang = lang === 'zh' ? 'en' : 'zh'; applyLang(); });

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.key.startsWith('Arrow')) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '5') requestCity(parseInt(k) - 1);
  else if (k === 'q') setTime(0);
  else if (k === 'w') setTime(1);
  else if (k === 'h') { state.panelHidden = !state.panelHidden; $('#panel').classList.toggle('hidden', state.panelHidden); }
  else if (k === 'l') { lang = lang === 'zh' ? 'en' : 'zh'; applyLang(); }
  else if (k === '[') setSlider(state.sliderMirror - 0.05);
  else if (k === ']') setSlider(state.sliderMirror + 0.05);
});

// ---------------------------------------------------------------- main loop
let last = now();
const t0 = last;
function frame() {
  const t = now();
  const dt = Math.min(t - last, 0.05);
  last = t;
  const elapsed = t - t0;

  // city transition: fold up fully, swap geometry, unfold
  let mirrorTarget = state.sliderMirror;
  if (state.transition) {
    if (state.transition.phase === 'in') {
      mirrorTarget = 1;
      if (state.mirror > 0.965) { loadCity(state.transition.nextCity); state.transition.phase = 'out'; $('#title').classList.remove('fade'); }
    } else if (Math.abs(state.mirror - state.sliderMirror) < 0.02) {
      state.transition = null;
    }
  }
  const rate = state.transition?.phase === 'in' ? 3.2 : 2.2;
  state.mirror += (mirrorTarget - state.mirror) * (1 - Math.exp(-dt * rate));
  foldUniforms.uIntensity.value = state.mirror;
  foldUniforms.uTime.value = elapsed;

  // day / night interpolation
  state.timeBlend = Math.min(1, state.timeBlend + dt / 1.6);
  lerpPalette(cur, TIMES[state.timeIndex], 1 - Math.exp(-dt * 2.0));
  const shapeTime = state.timeBlend < 0.5 ? state.prevTime : state.timeIndex;
  partMat.uniforms.uShape.value = TIMES[shapeTime].shape;
  partMat.uniforms.uOpacity.value = cur.opacity * (1 - 0.9 * Math.sin(state.timeBlend * Math.PI) ** 2);
  partMat.uniforms.uFall.value = cur.fall; partMat.uniforms.uSway.value = cur.sway;
  partMat.uniforms.uSize.value = cur.size; partMat.uniforms.uSpin.value = cur.spin;
  lightUniforms.uFogDensity.value = cur.fogDensity;
  buildingMat.uniforms.uWindowLit.value = cur.windowLit;
  nightUniform.value = THREE.MathUtils.smoothstep(cur.windowLit, 0.25, 0.7);
  treeMat.uniforms.uBlossomAmt.value = cur.blossomAmt;

  // traffic + pedestrians
  if (traffic) {
    traffic.step(dt, (k, x, z, hx, hz) => {
      carDummy.position.set(x, 0, z);
      carDummy.rotation.y = Math.atan2(-hz, hx);
      carDummy.updateMatrix();
      cars.setMatrixAt(k, carDummy.matrix);
    });
    cars.instanceMatrix.needsUpdate = true;
  }
  if (crowd) {
    const arr = peopleGeo.getAttribute('position').array;
    crowd.step(dt, (k, x, z) => { arr[3 * k] = x; arr[3 * k + 1] = 0.3; arr[3 * k + 2] = z; });
    peopleGeo.getAttribute('position').needsUpdate = true;
  }
  postMat.uniforms.uSaturation.value = cur.saturation;
  postMat.uniforms.uVignette.value = cur.vignette;

  updateCamera(dt, t);

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start
loadingText.textContent = I18N[lang].loading;
applyLang();
await new Promise((r) => requestAnimationFrame(r));
{
  const ci = Number.isInteger(+HASH.city) ? CITY_DATA.findIndex((c, i) => c.key === HASH.city || i === +HASH.city) : CITY_DATA.findIndex((c) => c.key === HASH.city);
  loadCity(ci >= 0 ? ci : 0);
}
state.mirror = HASH.intro === '0' ? state.sliderMirror : 1; // start folded, then unfold into the first city
requestAnimationFrame(frame);
setTimeout(() => $('#loading').classList.add('done'), 150);
console.info('mirror-dimension', BUILD_INFO);
window.__md = { state, cur, trees, treeMat, cars, decodedCities }; // debugging handle
