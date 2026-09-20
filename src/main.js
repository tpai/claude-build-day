// ============================================================================
// Mirror Dimension — main application. Injected into a single HTML file by
// build.mjs together with THREE_SRC, SHADERS, CITY_DATA and BUILD_INFO.
// ============================================================================

const $ = (s) => document.querySelector(s);
const loadingText = $('#loadingText');

// ---------------------------------------------------------------- i18n
const I18N = {
  zh: {
    city: '城市', season: '季節', mirror: '鏡像強度',
    hint: '拖曳旋轉 · 滾輪縮放 · 1–5 切城市 · Q/W/E/R 切季節 · H 隱藏面板',
    lang: 'EN', attribution: '© OpenStreetMap 貢獻者',
    seasons: ['春', '夏', '秋', '冬'],
    buildings: (n) => `${n} 棟建築`,
    loading: '正在展開城市…',
  },
  en: {
    city: 'City', season: 'Season', mirror: 'Mirror',
    hint: 'Drag to orbit · Scroll to zoom · 1–5 cities · Q/W/E/R seasons · H hides panel',
    lang: '繁中', attribution: '© OpenStreetMap contributors',
    seasons: ['Spring', 'Summer', 'Autumn', 'Winter'],
    buildings: (n) => `${n} buildings`,
    loading: 'Unfolding the city…',
  },
};
// URL hash overrides, e.g. #city=2&season=winter&mirror=0.6&lang=en
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

// ---------------------------------------------------------------- seasons
const C = (hex) => new THREE.Color(hex);
const SEASONS = [
  { key: 'spring', shape: 0,
    skyTop: C('#5f8fd6'), skyBottom: C('#f4cfe0'), sunColor: C('#fff1e2'), sunEl: 0.55, sunAz: 0.9,
    skyLight: C('#c9d9f2'), groundLight: C('#5b5a66'), fog: C('#e3d2e3'), fogDensity: 0.00045,
    buildingTint: C('#d9c9c4'), windowColor: C('#ffe6c4'), windowLit: 0.12,
    groundBase: C('#3a4a44'), gridColor: C('#a5d6c8'),
    particle: C('#ffb7cb'), fall: 7, sway: 14, size: 3.6, spin: 1.0, opacity: 0.9,
    grade: new THREE.Vector3(1.02, 0.98, 1.03), saturation: 1.05, vignette: 0.35 },
  { key: 'summer', shape: 1,
    skyTop: C('#1f5bbf'), skyBottom: C('#bfe4ff'), sunColor: C('#ffffff'), sunEl: 1.1, sunAz: 0.4,
    skyLight: C('#bcd7ff'), groundLight: C('#6a665a'), fog: C('#d7edff'), fogDensity: 0.00028,
    buildingTint: C('#d9d6c8'), windowColor: C('#fff6d8'), windowLit: 0.05,
    groundBase: C('#3f4640'), gridColor: C('#ffe9a0'),
    particle: C('#fff2a8'), fall: -3, sway: 6, size: 2.2, spin: 0.2, opacity: 0.85,
    grade: new THREE.Vector3(1.0, 1.0, 0.96), saturation: 1.18, vignette: 0.25 },
  { key: 'autumn', shape: 2,
    skyTop: C('#332e63'), skyBottom: C('#f1a15c'), sunColor: C('#ffb277'), sunEl: 0.18, sunAz: 2.4,
    skyLight: C('#c48c9a'), groundLight: C('#4a3a34'), fog: C('#c9774a'), fogDensity: 0.00055,
    buildingTint: C('#b8a08c'), windowColor: C('#ffc77a'), windowLit: 0.72,
    groundBase: C('#3a2c26'), gridColor: C('#ff9a4a'),
    particle: C('#e57a2a'), fall: 10, sway: 26, size: 4.2, spin: 1.6, opacity: 0.95,
    grade: new THREE.Vector3(1.08, 0.95, 0.86), saturation: 1.1, vignette: 0.45 },
  { key: 'winter', shape: 3,
    skyTop: C('#1c2a42'), skyBottom: C('#aebdd0'), sunColor: C('#dfe9ff'), sunEl: 0.28, sunAz: -0.6,
    skyLight: C('#b3c1d6'), groundLight: C('#4e5663'), fog: C('#a6b3c4'), fogDensity: 0.0007,
    buildingTint: C('#b9c3cf'), windowColor: C('#ffe9c2'), windowLit: 0.5,
    groundBase: C('#7d8896'), gridColor: C('#e8f0ff'),
    particle: C('#ffffff'), fall: 16, sway: 8, size: 3.2, spin: 0.1, opacity: 0.95,
    grade: new THREE.Vector3(0.93, 0.97, 1.08), saturation: 0.72, vignette: 0.4 },
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
  particle: new THREE.Color(), fall: 0, sway: 0, size: 0, spin: 0, opacity: 0,
  grade: new THREE.Vector3(), saturation: 1, vignette: 0.3,
};
function setPalette(target, s) {
  for (const k of ['skyTop', 'skyBottom', 'sunColor', 'skyLight', 'groundLight', 'fog', 'buildingTint', 'windowColor', 'groundBase', 'gridColor', 'particle']) target[k].copy(s[k]);
  target.sunDir.copy(sunDir(s));
  for (const k of ['fogDensity', 'windowLit', 'fall', 'sway', 'size', 'spin', 'opacity', 'saturation', 'vignette']) target[k] = s[k];
  target.grade.copy(s.grade);
}
function lerpPalette(target, s, t) {
  for (const k of ['skyTop', 'skyBottom', 'sunColor', 'skyLight', 'groundLight', 'fog', 'buildingTint', 'windowColor', 'groundBase', 'gridColor', 'particle']) target[k].lerp(s[k], t);
  target.sunDir.lerp(sunDir(s), t).normalize();
  for (const k of ['fogDensity', 'windowLit', 'fall', 'sway', 'size', 'spin', 'opacity', 'saturation', 'vignette']) target[k] += (s[k] - target[k]) * t;
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

function hash01(i) {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13;
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

const buildingMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['fold.glsl'] + SHADERS['building.vert'],
  fragmentShader: SHADERS['building.frag'],
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
  fragmentShader: SHADERS['ground.frag'],
  uniforms: {
    ...foldUniforms, ...lightUniforms,
    uGroundBase: { value: cur.groundBase },
    uGridColor: { value: cur.gridColor },
  },
});
const groundGeo = new THREE.PlaneGeometry(2600, 2600, 104, 104);
groundGeo.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.position.y = -0.05;
ground.frustumCulled = false;
scene.add(ground);

const skyMat = new THREE.ShaderMaterial({
  vertexShader: SHADERS['sky.vert'],
  fragmentShader: SHADERS['sky.frag'],
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    uSkyTop: { value: cur.skyTop }, uSkyBottom: { value: cur.skyBottom },
    uSunDir: { value: cur.sunDir }, uSunColor: { value: cur.sunColor },
    uIntensity: foldUniforms.uIntensity, uTime: foldUniforms.uTime,
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
  orbit.radius = THREE.MathUtils.clamp(orbit.radius, 160, 1700);
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
  seasonIndex: 2,
  sliderMirror: 0.35,
  mirror: 0.35,
  transition: null, // { phase: 'in' | 'out', nextCity }
  prevSeason: 0, seasonBlend: 1,
  panelHidden: false,
};
// month -> season: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn
state.seasonIndex = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][new Date().getMonth()];
{
  const si = ['spring', 'summer', 'autumn', 'winter'].indexOf(HASH.season);
  if (si >= 0) state.seasonIndex = si;
  const m = parseFloat(HASH.mirror);
  if (Number.isFinite(m)) state.sliderMirror = THREE.MathUtils.clamp(m, 0, 1);
}
state.prevSeason = state.seasonIndex;
setPalette(cur, SEASONS[state.seasonIndex]);

const decodedCities = new Map();
function loadCity(i) {
  const c = CITY_DATA[i];
  if (!decodedCities.has(c.key)) decodedCities.set(c.key, buildCityGeometry(decodeCity(c.data)));
  const old = cityMesh.geometry;
  cityMesh.geometry = decodedCities.get(c.key);
  if (old && old !== cityMesh.geometry && !Array.from(decodedCities.values()).includes(old)) old.dispose();
  foldUniforms.uCurlR.value = Math.max(520, c.maxH + 90);
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

function setSeason(i) {
  if (i === state.seasonIndex) return;
  state.prevSeason = state.seasonIndex;
  state.seasonIndex = i;
  state.seasonBlend = 0;
  updateTitle();
  document.querySelectorAll('#seasons button').forEach((b, j) => b.classList.toggle('active', j === i));
}

// ---------------------------------------------------------------- UI
function updateTitle() {
  const c = CITY_DATA[state.cityIndex];
  $('#cityName').textContent = c.name[lang];
  $('#citySub').textContent = c.sub[lang];
  $('#seasonChip').textContent = I18N[lang].seasons[state.seasonIndex];
}
function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I18N[lang][el.dataset.i18n]; });
  $('#lang').textContent = I18N[lang].lang;
  document.querySelectorAll('#cities button').forEach((b, i) => { b.firstChild.textContent = CITY_DATA[i].name[lang]; });
  document.querySelectorAll('#seasons button').forEach((b, i) => { b.firstChild.textContent = I18N[lang].seasons[i]; });
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
makeButtons($('#seasons'), I18N[lang].seasons, ['Q', 'W', 'E', 'R'], setSeason);
document.querySelectorAll('#seasons button')[state.seasonIndex].classList.add('active');

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
  else if ('qwer'.includes(k) && k.length === 1) setSeason('qwer'.indexOf(k));
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

  // season interpolation
  state.seasonBlend = Math.min(1, state.seasonBlend + dt / 1.6);
  lerpPalette(cur, SEASONS[state.seasonIndex], 1 - Math.exp(-dt * 2.6));
  const shapeSeason = state.seasonBlend < 0.5 ? state.prevSeason : state.seasonIndex;
  partMat.uniforms.uShape.value = SEASONS[shapeSeason].shape;
  partMat.uniforms.uOpacity.value = cur.opacity * (1 - 0.9 * Math.sin(state.seasonBlend * Math.PI) ** 2);
  partMat.uniforms.uFall.value = cur.fall; partMat.uniforms.uSway.value = cur.sway;
  partMat.uniforms.uSize.value = cur.size; partMat.uniforms.uSpin.value = cur.spin;
  lightUniforms.uFogDensity.value = cur.fogDensity;
  buildingMat.uniforms.uWindowLit.value = cur.windowLit;
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
