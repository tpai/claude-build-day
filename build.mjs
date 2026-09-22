#!/usr/bin/env node
// Build script: fetches OSM building footprints for each preset city, simplifies
// and packs them into a compact binary blob, downloads Three.js, and inlines
// everything (JS, shaders, CSS, data) into a single offline HTML file.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
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
const GROUND_M = 2600;        // ground plane size (must match main.js)
const MASK_PX = 1024;         // water / park mask resolution over the ground plane (~2.5 m per pixel)
const AREA_RADIUS_M = 1300;   // fetch water and parks out to the edge of the ground plane
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

// water and green areas -> mask channel (0 = water / red, 1 = green / green)
const AREA_TAGS = {
  natural: { water: 0, wood: 1, scrub: 1, grassland: 1 },
  waterway: { riverbank: 0 },
  leisure: { park: 1, garden: 1, recreation_ground: 1 },
  landuse: { grass: 1, forest: 1, meadow: 1, village_green: 1 },
};
const areaKind = (tags) => {
  for (const [k, v] of Object.entries(AREA_TAGS)) if (tags[k] in v) return v[tags[k]];
  return -1;
};

// ---------------------------------------------------------------- fetching
async function fetchOverpass(city, kind = 'building') {
  const rawPath = join(DATA, kind === 'building' ? `${city.key}.raw.json` : `${city.key}.${kind}.raw.json`);
  if (!REFETCH && await exists(rawPath)) {
    log(`${city.key}: using cached ${rawPath}`);
    return JSON.parse(await readFile(rawPath, 'utf8'));
  }
  const radius = city.radius ?? RADIUS_M;
  const at = `(around:${radius},${city.lat},${city.lon})`;
  let body;
  if (kind === 'building') body = `way["building"]${at};`;
  else if (kind === 'roads') body = `way["highway"~"^(${Object.keys(ROAD_CLASS).join('|')})$"]["area"!="yes"]${at};`;
  else { // areas: polygons and multipolygon relations for water / parks, plus the coastline
    const atA = `(around:${AREA_RADIUS_M},${city.lat},${city.lon})`;
    const parts = ['way["natural"="coastline"]' + atA + ';'];
    for (const [k, v] of Object.entries(AREA_TAGS)) {
      const re = `["${k}"~"^(${Object.keys(v).join('|')})$"]`;
      parts.push(`way${re}${atA};`, `relation${re}${atA};`);
    }
    body = `(${parts.join('')});`;
  }
  const query = `[out:json][timeout:90];${body}out geom;`;
  if (!REFETCH) await sleep(1500); // be polite to Overpass between the queries of one city
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

// ---------------------------------------------------------------- areas (water + parks)
// Rasterised into an RGB mask over the ground plane: R = water, G = green.
// Polygons use even-odd scanline fill, so multipolygon holes (islands in a river)
// just work; the coastline is drawn as a barrier and the sea flood-filled from its
// right-hand side (OSM convention: water on the right).
const samePt = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;

function assembleRings(ways) {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings = [];
  while (pool.length) {
    const ring = pool.pop();
    let guard = 0;
    while (!samePt(ring[0], ring[ring.length - 1]) && guard++ < 10000) {
      const end = ring[ring.length - 1];
      let found = -1, rev = false;
      for (let i = 0; i < pool.length; i++) {
        if (samePt(pool[i][0], end)) { found = i; break; }
        if (samePt(pool[i][pool[i].length - 1], end)) { found = i; rev = true; break; }
      }
      if (found < 0) break;
      const w = pool.splice(found, 1)[0];
      if (rev) w.reverse();
      ring.push(...w.slice(1));
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function fillRings(mask, W, H, rings, channel) {
  // rings: arrays of [px, py]; even-odd rule across all rings at once
  let minY = Infinity, maxY = -Infinity;
  for (const r of rings) for (const [, y] of r) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length];
        if ((ay <= sy) === (by <= sy)) continue;
        xs.push(ax + (sy - ay) / (by - ay) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.round(xs[i])), xb = Math.min(W, Math.round(xs[i + 1]));
      for (let x = xa; x < xb; x++) mask[(y * W + x) * 3 + channel] = 255;
    }
  }
}

function processAreas(city, raw) {
  const proj = project(city);
  const W = MASK_PX, H = MASK_PX;
  const toPx = (n) => { const [x, z] = proj(n.lat, n.lon); return [(x / GROUND_M + 0.5) * W, (z / GROUND_M + 0.5) * H]; };
  const mask = Buffer.alloc(W * H * 3);
  const coast = [];
  let nWater = 0, nGreen = 0;
  for (const el of raw.elements) {
    const tags = el.tags || {};
    if (el.type === 'way' && tags.natural === 'coastline' && el.geometry) { coast.push(el.geometry.map(toPx)); continue; }
    const kind = areaKind(tags);
    if (kind < 0) continue;
    let rings;
    if (el.type === 'way' && el.geometry) rings = [el.geometry];
    else if (el.type === 'relation' && el.members) rings = assembleRings(el.members.filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner')).map((m) => m.geometry));
    else continue;
    fillRings(mask, W, H, rings.map((r) => r.map(toPx)), kind);
    if (kind === 0) nWater++; else nGreen++;
  }
  // coastline -> sea: draw the lines as a barrier, flood fill from the water side
  let seaFrac = 0;
  if (coast.length) {
    const barrier = new Uint8Array(W * H);
    const seeds = [];
    for (const line of coast) {
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(len * 2));
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(ax + (bx - ax) * s / steps), y = Math.round(ay + (by - ay) * s / steps);
          if (x >= 0 && x < W && y >= 0 && y < H) barrier[y * W + x] = 1;
        }
        // water is on the right in lat/lon; in our (x, z = -lat) frame that is (-dz, dx)
        if (len > 2) { const dx = (bx - ax) / len, dy = (by - ay) / len; seeds.push([Math.round((ax + bx) / 2 - dy * 2.5), Math.round((ay + by) / 2 + dx * 2.5)]); }
      }
    }
    const sea = new Uint8Array(W * H);
    const stack = [];
    for (const [x, y] of seeds) if (x >= 0 && x < W && y >= 0 && y < H && !barrier[y * W + x]) stack.push(y * W + x);
    let filled = 0;
    while (stack.length) {
      const i = stack.pop();
      if (sea[i] || barrier[i]) continue;
      sea[i] = 1; filled++;
      const x = i % W, y = (i - x) / W;
      if (x > 0) stack.push(i - 1);
      if (x < W - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - W);
      if (y < H - 1) stack.push(i + W);
    }
    seaFrac = filled / (W * H);
    if (seaFrac < 0.9) { for (let i = 0; i < W * H; i++) if (sea[i] || barrier[i]) mask[i * 3] = 255; }
    else log(`${city.key}: coastline flood fill leaked (${(seaFrac * 100).toFixed(0)}%), ignoring coastline`);
  }
  let water = 0, green = 0;
  for (let i = 0; i < W * H; i++) { if (mask[i * 3]) water++; if (mask[i * 3 + 1]) green++; }
  const png = encodePng(W, H, mask);
  log(`${city.key}: ${raw.elements.length} area elements -> ${nWater} water + ${nGreen} green polygons, ${coast.length} coastline ways; water ${(water / W / H * 100).toFixed(1)}%, green ${(green / W / H * 100).toFixed(1)}% of ground, mask ${(png.length / 1024).toFixed(0)} KB`);
  return png.toString('base64');
}

const CRC_TABLE = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); // filter byte 0 per row
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- assemble
const escapeForScript = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

async function readShaders() {
  const names = ['fold.glsl', 'lighting.glsl', 'building.vert', 'building.frag', 'ground.vert', 'ground.frag', 'road.vert', 'road.frag', 'car.vert', 'car.frag', 'tree.vert', 'tree.frag', 'people.vert', 'people.frag', 'sky.vert', 'sky.frag', 'particles.vert', 'particles.frag', 'post.vert', 'post.frag'];
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
    if (QUICK && !(await exists(join(DATA, `${city.key}.raw.json`)) && await exists(join(DATA, `${city.key}.roads.raw.json`)) && await exists(join(DATA, `${city.key}.areas.raw.json`)))) { log(`${city.key}: not cached, skipped (--quick)`); continue; }
    const raw = await fetchOverpass(city);
    const { buildings, maxH, count } = processCity(city, raw);
    const roadsRaw = await fetchOverpass(city, 'roads');
    const roads = processRoads(city, roadsRaw);
    const areasRaw = await fetchOverpass(city, 'areas');
    const areas = processAreas(city, areasRaw);
    cities.push({ key: city.key, name: city.name, sub: city.sub, lat: city.lat, lon: city.lon, radius: city.radius ?? RADIUS_M, driveLeft: !!city.driveLeft, count, maxH: Math.round(maxH), data: encode(buildings), roads: encodeRoads(roads), areas });
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
  for (const c of cities) log(`  ${c.key}: ${c.count} buildings, ${(c.data.length / 1024).toFixed(0)} KB + roads ${(c.roads.length / 1024).toFixed(0)} KB + areas ${(c.areas.length / 1024).toFixed(0)} KB base64`);
}

main().catch((e) => { console.error(e); process.exit(1); });
