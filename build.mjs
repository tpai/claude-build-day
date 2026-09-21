#!/usr/bin/env node
// Build script: fetches OSM building footprints for each preset city, simplifies
// and packs them into a compact binary blob, downloads Three.js, and inlines
// everything (JS, shaders, CSS, data) into a single offline HTML file.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');


const REFETCH = process.argv.includes('--refetch');
const QUICK = process.argv.includes('--quick'); // only cities already cached in data/, output to a preview file
const THREE_VERSION = '0.170.0';
const THREE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const MAX_ATTEMPTS = 15;

const OUT = join(DIST, QUICK ? 'mirror-dimension-preview.html' : 'mirror-dimension.html');

const RADIUS_M = 800;         // fetch radius around each city centre
const MAX_BUILDINGS = 3000;   // per city, nearest to centre kept
const MAX_ROADS = 2600;       // per city, major roads first, then nearest to centre
const MIN_AREA_M2 = 25;       // drop tiny footprints
const SIMPLIFY_TOL_M = 0.6;   // vertex removal tolerance
const CLAMP_M = RADIUS_M * 1.25;

const CITIES = [
  { key: 'taipei',   name: { zh: '台北', en: 'Taipei' },    sub: { zh: '信義區 · 台北 101', en: 'Xinyi District · Taipei 101' }, lat: 25.0350, lon: 121.5630, levels: [4, 12],  levelHeight: 3.3, radius: 1100 },
  { key: 'tokyo',    name: { zh: '東京', en: 'Tokyo' },     sub: { zh: '新宿', en: 'Shinjuku' },                              lat: 35.6905, lon: 139.6960, levels: [3, 10],  levelHeight: 3.2, driveLeft: true },
  { key: 'newyork',  name: { zh: '紐約', en: 'New York' },  sub: { zh: '曼哈頓中城', en: 'Midtown Manhattan' },                 lat: 40.7535, lon: -73.9830, levels: [6, 30],  levelHeight: 3.6 },
  { key: 'paris',    name: { zh: '巴黎', en: 'Paris' },     sub: { zh: '西堤島 · 聖母院', en: 'Île de la Cité · Notre-Dame' },   lat: 48.8535, lon: 2.3480,   levels: [5, 7],   levelHeight: 3.2 },
  { key: 'hongkong', name: { zh: '香港', en: 'Hong Kong' }, sub: { zh: '中環', en: 'Central' },                               lat: 22.2815, lon: 114.1585, levels: [10, 35], levelHeight: 3.4, driveLeft: true },
];

// highway=* -> road class. Width, speed and who travels on it are derived from the class in main.js.
const ROAD_CLASS = {
  footway: 0, path: 0, steps: 0, cycleway: 0,
  pedestrian: 1,
  service: 2,
  residential: 3, unclassified: 3, living_street: 3,
  tertiary: 4, tertiary_link: 4,
  secondary: 5, secondary_link: 5,
  primary: 6, primary_link: 6,
  trunk: 7, trunk_link: 7, motorway: 7, motorway_link: 7,
};

const log = (...a) => console.log('[build]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => stat(p).then(() => true, () => false);

// ---------------------------------------------------------------- fetching
async function fetchOverpass(city, kind = 'building') {
  const rawPath = join(DATA, kind === 'building' ? `${city.key}.raw.json` : `${city.key}.${kind}.raw.json`);
  if (!REFETCH && await exists(rawPath)) {
    log(`${city.key}: using cached ${rawPath}`);
    return JSON.parse(await readFile(rawPath, 'utf8'));
  }
  const radius = city.radius ?? RADIUS_M;
  const selector = kind === 'building'
    ? 'way["building"]'
    : `way["highway"~"^(${Object.keys(ROAD_CLASS).join('|')})$"]["area"!="yes"]`;
  const query = `[out:json][timeout:90];${selector}(around:${radius},${city.lat},${city.lon});out geom;`;
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      log(`${city.key}: fetching from ${endpoint} (attempt ${attempt + 1})`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mirror-dimension-build/0.1' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error('no elements in response');
      await writeFile(rawPath, JSON.stringify(json));
      log(`${city.key}: got ${json.elements.length} ${kind} ways`);
      return json;
    } catch (e) {
      lastErr = e;
      log(`${city.key}: failed (${e.message}), retrying...`);
      await sleep(Math.min(5000 * (attempt + 1), 30_000));
    }
  }
  throw new Error(`Overpass failed for ${city.key}: ${lastErr?.message}`);
}

async function fetchThree() {
  const p = join(DATA, 'three.module.min.js');
  if (await exists(p)) { log('three.js: cached'); return readFile(p, 'utf8'); }
  log(`three.js: downloading ${THREE_URL}`);
  const res = await fetch(THREE_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`three.js download failed: HTTP ${res.status}`);
  const src = await res.text();
  await writeFile(p, src);
  return src;
}

// ---------------------------------------------------------------- geometry
function hashId(id) { // deterministic 0..1 from way id
  let h = (id * 2654435761) >>> 0;
  h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function parseHeight(tags, city, id) {
  const num = (s) => { const m = String(s).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
  if (tags.height) {
    let h = num(tags.height);
    if (/ft|'/.test(tags.height)) h *= 0.3048;
    if (Number.isFinite(h) && h > 2) return Math.min(h, 800);
  }
  if (tags['building:levels']) {
    const l = num(tags['building:levels']);
    if (Number.isFinite(l) && l > 0) return Math.min(l * city.levelHeight + 1, 800);
  }
  const [lo, hi] = city.levels;
  const r = hashId(id);
  const skew = r * r; // bias toward lower buildings
  return (lo + (hi - lo) * skew) * city.levelHeight;
}

function project(city) {
  const kx = Math.cos((city.lat * Math.PI) / 180) * 111_320;
  const kz = 110_540;
  return (lat, lon) => [ (lon - city.lon) * kx, -(lat - city.lat) * kz ];
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dz) / len;
}

function simplify(pts, tol) {
  // drop consecutive duplicates
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05);
  if (pts.length > 1) {
    const f = pts[0], l = pts[pts.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.05) pts.pop();
  }
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (perpDist(b, a, c) < tol) { pts.splice(i, 1); changed = true; i--; }
    }
  }
  return pts;
}

function processCity(city, raw) {
  const proj = project(city);
  const out = [];
  let skippedOpen = 0, skippedSmall = 0, skippedFar = 0;
  for (const el of raw.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue;
    const g = el.geometry;
    if (g[0].lat !== g[g.length - 1].lat || g[0].lon !== g[g.length - 1].lon) { skippedOpen++; continue; }
    let pts = g.slice(0, -1).map((n) => proj(n.lat, n.lon));
    const clamp = (city.radius ?? RADIUS_M) * 1.25;
    if (pts.some(([x, z]) => Math.abs(x) > clamp || Math.abs(z) > clamp)) { skippedFar++; continue; }
    const area = Math.abs(signedArea(pts));
    if (area < MIN_AREA_M2) { skippedSmall++; continue; }
    pts = simplify(pts, SIMPLIFY_TOL_M);
    if (pts.length < 3) { skippedSmall++; continue; }
    if (signedArea(pts) < 0) pts.reverse(); // enforce consistent winding
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    out.push({ h: parseHeight(el.tags || {}, city, el.id), pts, d: Math.hypot(cx, cz), area });
  }
  out.sort((a, b) => a.d - b.d);
  const kept = out.slice(0, MAX_BUILDINGS);
  const maxH = kept.reduce((m, b) => Math.max(m, b.h), 0);
  const verts = kept.reduce((s, b) => s + b.pts.length, 0);
  log(`${city.key}: ${raw.elements.length} ways -> ${out.length} valid -> ${kept.length} kept, ${verts} verts, max height ${maxH.toFixed(0)} m (skipped open ${skippedOpen}, small ${skippedSmall}, far ${skippedFar})`);
  return { buildings: kept, maxH, count: kept.length };
}

// Binary layout (little-endian int16): [N] then per building [nVerts, height*2, x*2, z*2, ...]
function encode(buildings) {
  let n = 1;
  for (const b of buildings) n += 2 + b.pts.length * 2;
  const buf = Buffer.alloc(n * 2);
  let o = 0;
  const w = (v) => { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), o); o += 2; };
  w(buildings.length);
  for (const b of buildings) {
    w(b.pts.length); w(b.h * 2);
    for (const [x, z] of b.pts) { w(x * 2); w(z * 2); }
  }
  return buf.toString('base64');
}

// ---------------------------------------------------------------- roads
// Roads keep their OSM node ids so that cars and pedestrians can follow the real
// street network: every node shared by two or more kept roads becomes an
// intersection with a small integer id.
function processRoads(city, raw) {
  const proj = project(city);
  const clamp = (city.radius ?? RADIUS_M) * 1.25;
  const runs = [];
  for (const el of raw.elements) {
    if (el.type !== 'way' || !el.geometry || !el.nodes || el.geometry.length < 2) continue;
    const tags = el.tags || {};
    const cls = ROAD_CLASS[tags.highway];
    if (cls === undefined) continue;
    if (tags.tunnel === 'yes' || tags.layer && parseInt(tags.layer) < 0) continue;
    const oneway = tags.oneway === 'yes' || tags.oneway === '1' || tags.junction === 'roundabout' || tags.highway === 'motorway';
    // split the way into runs of points inside the clamp box
    let run = null;
    const flush = () => { if (run && run.pts.length >= 2) runs.push(run); run = null; };
    el.geometry.forEach((g, i) => {
      const [x, z] = proj(g.lat, g.lon);
      if (Math.abs(x) > clamp || Math.abs(z) > clamp) { flush(); return; }
      if (!run) run = { cls, oneway, pts: [], nodes: [] };
      const prev = run.pts[run.pts.length - 1];
      if (prev && Math.hypot(prev[0] - x, prev[1] - z) < 0.3) return; // drop duplicate vertices
      run.pts.push([x, z]); run.nodes.push(el.nodes[i]);
    });
    flush();
  }
  for (const r of runs) {
    let len = 0;
    for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    r.len = len;
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    r.d = Math.hypot(mid[0], mid[1]);
  }
  // drivable roads first (by class, then distance), then footways nearest to centre
  runs.sort((a, b) => (b.cls >= 2) - (a.cls >= 2) || a.d - b.d);
  const kept = runs.slice(0, MAX_ROADS);
  // intersection ids: nodes used by >= 2 kept roads (or twice in one road, e.g. loops)
  const count = new Map();
  for (const r of kept) for (const n of r.nodes) count.set(n, (count.get(n) || 0) + 1);
  const ids = new Map();
  for (const [n, c] of count) if (c >= 2) ids.set(n, ids.size);
  for (const r of kept) r.nodes = r.nodes.map((n) => ids.get(n) ?? -1);
  const pts = kept.reduce((s, r) => s + r.pts.length, 0);
  const km = kept.reduce((s, r) => s + r.len, 0) / 1000;
  log(`${city.key}: ${raw.elements.length} highway ways -> ${runs.length} runs -> ${kept.length} kept, ${pts} pts, ${km.toFixed(1)} km, ${ids.size} intersections`);
  return kept;
}

// Binary layout (little-endian int16): [N] then per road [nPts, cls | oneway << 4, (x*2, z*2, nodeId) * nPts]
function encodeRoads(roads) {
  let n = 1;
  for (const r of roads) n += 2 + r.pts.length * 3;
  const buf = Buffer.alloc(n * 2);
  let o = 0;
  const w = (v) => { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), o); o += 2; };
  w(roads.length);
  for (const r of roads) {
    w(r.pts.length); w(r.cls | (r.oneway ? 16 : 0));
    r.pts.forEach(([x, z], i) => { w(x * 2); w(z * 2); w(r.nodes[i]); });
  }
  return buf.toString('base64');
}

// ---------------------------------------------------------------- assemble
const escapeForScript = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

async function readShaders() {
  const names = ['fold.glsl', 'lighting.glsl', 'building.vert', 'building.frag', 'ground.vert', 'ground.frag', 'road.vert', 'road.frag', 'car.vert', 'car.frag', 'people.vert', 'people.frag', 'sky.vert', 'sky.frag', 'particles.vert', 'particles.frag', 'post.vert', 'post.frag'];
  const shaders = {};
  for (const n of names) shaders[n] = await readFile(join(SRC, 'shaders', n), 'utf8');
  return shaders;
}

async function main() {
  await mkdir(DATA, { recursive: true });
  await mkdir(DIST, { recursive: true });

  const threeSrc = await fetchThree();

  const cities = [];
  for (const city of CITIES) {
    if (QUICK && !(await exists(join(DATA, `${city.key}.raw.json`)) && await exists(join(DATA, `${city.key}.roads.raw.json`)))) { log(`${city.key}: not cached, skipped (--quick)`); continue; }
    const raw = await fetchOverpass(city);
    const { buildings, maxH, count } = processCity(city, raw);
    const roadsRaw = await fetchOverpass(city, 'roads');
    const roads = processRoads(city, roadsRaw);
    cities.push({ key: city.key, name: city.name, sub: city.sub, lat: city.lat, lon: city.lon, driveLeft: !!city.driveLeft, count, maxH: Math.round(maxH), data: encode(buildings), roads: encodeRoads(roads) });
    if (!REFETCH) continue;
    await sleep(2000); // be polite to Overpass
  }

  const [template, css, mainJs, shaders] = await Promise.all([
    readFile(join(SRC, 'index.html'), 'utf8'),
    readFile(join(SRC, 'style.css'), 'utf8'),
    readFile(join(SRC, 'main.js'), 'utf8'),
    readShaders(),
  ]);

  const payload = [
    `const THREE_SRC = ${escapeForScript(JSON.stringify(threeSrc))};`,
    `const SHADERS = ${escapeForScript(JSON.stringify(shaders))};`,
    `const CITY_DATA = ${escapeForScript(JSON.stringify(cities))};`,
    `const BUILD_INFO = ${JSON.stringify({ three: THREE_VERSION, builtAt: new Date().toISOString(), radius: RADIUS_M })};`,
  ].join('\n');

  const html = template
    .replace('<!--STYLE-->', () => `<style>\n${css}\n</style>`)
    .replace('<!--APP-->', () => `<script type="module">\n${payload}\n${escapeForScript(mainJs)}\n</script>`);

  await writeFile(OUT, html);
  const size = (await stat(OUT)).size;
  log(`wrote ${OUT} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  for (const c of cities) log(`  ${c.key}: ${c.count} buildings, ${(c.data.length / 1024).toFixed(0)} KB + roads ${(c.roads.length / 1024).toFixed(0)} KB base64`);
}

main().catch((e) => { console.error(e); process.exit(1); });
