precision highp float;
uniform float uTime;
uniform vec3 uBuildingTint;
uniform vec3 uWindowColor;
uniform float uWindowLit;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vCity;    // where this surface sits in the real city, for the imagery
varying vec2 vUv;      // walls: (metres along the facade, metres up); roofs: (along the ridge, metres above the eaves)
varying vec2 vFlat;    // unfolded world xz, used for roof detail
varying float vRand;
varying float vHeight;
varying float vWall;
varying float vTileR;   // this copy's identity: shifts the windows that are lit and the tint

const float FLOOR = 3.4;

// Facade styles picked per building from vRand:
//   0 punched windows in masonry, 1 glass curtain wall, 2 horizontal strip windows
void facade(inout vec3 base, out float glass, out float lit, out vec3 glassTint, vec3 n) {
  float r = fract(vRand + vTileR);
  float style = r < 0.42 ? 0.0 : (r < 0.72 ? 1.0 : 2.0);
  float r2 = fract(vRand * 41.7 + vTileR);
  float r3 = fract(vRand * 97.3 + vTileR * 3.1);
  float cellW = 2.6 + r2 * 1.8;
  vec2 g = vec2(vUv.x / cellW, vUv.y / FLOOR);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float floorIdx = id.y;
  float topFloor = floor((vHeight - 0.6) / FLOOR);
  float isGround = step(vUv.y, 4.2) * step(6.0, vHeight);
  float belowRoof = step(floorIdx, topFloor - 1.0); // no windows in the parapet band

  glass = 0.0; lit = 0.0;
  glassTint = vec3(0.0);
  float h = hash21(id + vRand * 97.0 + vTileR * 53.0);
  // some buildings are mostly dark, some mostly lit; floors differ too (offices vs. empty)
  float floorMood = 0.7 + 0.6 * hash21(vec2(floorIdx, vRand * 31.0 + vTileR * 17.0));
  float litP = clamp(uWindowLit * (0.35 + 1.3 * fract(vRand * 5.7)) * floorMood, 0.0, 0.95);

  if (style < 0.5) {
    // punched windows with a recessed reveal and a sill
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.26, f.y) * step(f.y, 0.78);
    glass = win * belowRoof;
    float reveal = smoothstep(0.78, 0.7, f.y) * smoothstep(0.2, 0.27, f.x); // shadow at top + left of the opening
    glassTint = mix(vec3(0.10, 0.11, 0.13), vec3(0.16, 0.19, 0.24), reveal);
    float sill = step(0.21, f.y) * step(f.y, 0.26) * step(0.17, f.x) * step(f.x, 0.83) * belowRoof;
    base = mix(base, base * 1.18, sill);
    // brick / render bands every floor, slightly darker joints
    base *= 1.0 - 0.08 * step(f.y, 0.06);
    base *= 1.0 - 0.06 * step(f.x, 0.04) * step(0.5, r3);
    lit = glass * step(1.0 - litP, h) * (0.7 + 0.3 * hash21(id * 1.7 + vRand + vTileR));
  } else if (style < 1.5) {
    // full glass curtain wall with mullions; whole panels light up per office
    vec2 gm = vec2(vUv.x / 1.6, vUv.y / FLOOR);
    vec2 fm = fract(gm);
    float mullion = step(fm.x, 0.06) + step(fm.y, 0.05) + step(0.62, fm.y) * step(fm.y, 0.66);
    mullion = clamp(mullion, 0.0, 1.0);
    glass = (1.0 - mullion) * belowRoof;
    // spandrel band between floors is opaque darker glass
    float spandrel = step(0.66, fm.y);
    glassTint = mix(vec3(0.09, 0.13, 0.18), vec3(0.05, 0.07, 0.09), spandrel);
    base = mix(base, base * 0.55, 1.0 - glass); // metal mullions are dark
    vec2 office = floor(vec2(vUv.x / (cellW * 2.0), vUv.y / FLOOR));
    float ho = hash21(office + vRand * 53.0 + vTileR * 29.0);
    lit = glass * (1.0 - spandrel) * step(1.0 - litP * 1.15, ho) * (0.5 + 0.3 * hash21(office * 2.3 + vRand));
  } else {
    // horizontal ribbon windows between concrete spandrels
    float band = step(0.3, f.y) * step(f.y, 0.82);
    float mull = step(fract(vUv.x / 1.5), 0.05);
    glass = band * (1.0 - mull) * belowRoof;
    glassTint = vec3(0.11, 0.13, 0.16);
    base *= 1.0 - 0.1 * step(f.y, 0.3) * step(0.24, f.y); // shadow line under the band
    vec2 seg = vec2(floor(vUv.x / (cellW * 1.5)), floorIdx);
    float hs = hash21(seg + vRand * 71.0 + vTileR * 41.0);
    lit = glass * step(1.0 - litP, hs) * (0.6 + 0.4 * hash21(seg * 1.3 + vRand));
  }

  // street level: shopfront glazing with an awning stripe
  if (isGround > 0.5) {
    float shop = step(0.4, vUv.y) * step(vUv.y, 3.0);
    float pier = step(fract(vUv.x / 6.5), 0.08); // structural piers between shops
    shop *= 1.0 - pier;
    float shopId = floor(vUv.x / 6.5);
    float hsId = hash21(vec2(shopId, vRand * 13.0 + vTileR * 7.0));
    glass = max(glass * (1.0 - step(vUv.y, 4.2)), shop);
    glassTint = mix(glassTint, vec3(0.13, 0.12, 0.10), shop);
    float awning = step(3.1, vUv.y) * step(vUv.y, 3.75) * (1.0 - pier) * step(0.45, hsId);
    vec3 awningCol = 0.55 + 0.45 * cos(6.2831 * (hsId * 3.0 + vec3(0.0, 0.33, 0.67)));
    awningCol = mix(awningCol, vec3(0.5), 0.35);
    base = mix(base, awningCol, awning);
    // shops are lit whenever windows start to glow, and warmer
    lit = max(lit, shop * step(1.0 - (0.35 + 0.65 * litP), hsId) * 0.9);
  }
}

void main() {
  vec3 n = normalize(vNormal);
  // per-building hue: beige, brick, cool grey, blue-grey ...
  vec3 hue = 0.5 + 0.5 * cos(6.2831 * (fract(vRand * 3.1 + vTileR * 0.7) + vec3(0.0, 0.1, 0.2)));
  vec3 base = uBuildingTint * (0.68 + 0.4 * vRand) * mix(vec3(1.0), hue, 0.22) * (0.9 + 0.2 * vTileR);
  // the imagery of this building seen from above: its roof, and the colour its walls take
  float satAmt;
  vec3 satAlb = satAlbedo(satAt(vCity, satAmt));
  vec3 c;

  if (vWall > 1.5) {
    // pitched roof from OSM: rows of tiles or standing-seam metal, up the slope
    float slate = step(0.45, fract(vRand * 29.0 + vTileR));
    vec3 tileCol = mix(vec3(0.40, 0.20, 0.13), vec3(0.30, 0.31, 0.33), slate); // terracotta or zinc
    tileCol *= 0.85 + 0.35 * fract(vRand * 7.3);
    float row = vUv.y / mix(0.34, 0.55, slate);
    float col = vUv.x / mix(0.24, 0.48, slate);
    float seam = smoothstep(0.0, 0.12, fract(row)) * smoothstep(0.0, 0.1, fract(col));
    float shift = slate > 0.5 ? 0.0 : 0.5 * step(0.5, fract(floor(row) * 0.5)); // staggered courses
    seam = min(seam, smoothstep(0.0, 0.1, fract(col + shift)));
    float wear = hash21(vec2(floor(col + shift), floor(row)) + vRand * 17.0);
    base = mix(tileCol, satAlb, 0.55 * satAmt) * (0.78 + 0.32 * wear) * (0.72 + 0.4 * seam);
    // ridges and hips catch the light, the eaves keep a shadow line
    base *= 1.0 + 0.1 * smoothstep(0.6, 1.0, n.y);
    base *= 0.7 + 0.3 * smoothstep(0.0, 0.5, vUv.y);
    c = base * shade(n);
  } else if (vWall > 0.5) {
    // the real city's palette: keep the procedural brightness, borrow the colour
    base *= mix(vec3(1.0), satAlb / max(lum(satAlb), 0.06), 0.32 * satAmt);
    // street-level darkening (ambient occlusion from the block)
    base *= 0.62 + 0.38 * clamp(vUv.y / min(max(vHeight, 1.0), 40.0), 0.0, 1.0);
    float glass, lit; vec3 glassTint;
    facade(base, glass, lit, glassTint, n);
    vec3 vdir = normalize(uCamPos - vWorld);
    float fres = pow(1.0 - max(dot(n, vdir), 0.0), 2.0);
    // glass reflects the sky: darker straight-on, bright at grazing angles
    vec3 glassCol = glassTint * (0.8 + 0.4 * n.y) + uSkyColor * (0.06 + 0.5 * fres) + uSunColor * pow(max(dot(reflect(-vdir, n), uSunDir), 0.0), 40.0) * 0.5;
    vec3 wall = base * shade(n);
    // lit windows only really glow once the sky darkens
    c = mix(wall, glassCol, glass) + uWindowColor * lit * (0.45 + 1.3 * smoothstep(0.25, 0.7, uWindowLit));
  } else {
    // flat roof: the imagery already shows the real gravel, decks and plant up here,
    // so it leads, and the procedural HVAC boxes only fill in what it is too coarse to show
    base *= 0.86 + 0.08 * hash21(floor(vFlat * 0.9));
    base = mix(base, satAlb, 0.8 * satAmt);
    vec2 cell = floor(vFlat / 4.5);
    vec2 cf = fract(vFlat / 4.5);
    float hc = hash21(cell + vRand * 7.0 + vTileR * 23.0);
    float unit = step(0.9 - 0.06 * step(20.0, vHeight), hc) * step(0.25, cf.x) * step(cf.x, 0.75) * step(0.3, cf.y) * step(cf.y, 0.7) * step(12.0, vHeight);
    // HVAC boxes: lighter top, shaded side edge
    vec3 unitCol = uBuildingTint * (0.7 + 0.3 * fract(hc * 9.0)) * (1.0 - 0.35 * step(cf.y, 0.38));
    base = mix(base, unitCol, unit * (1.0 - 0.5 * satAmt));
    c = base * shade(n);
  }

  c = applyFog(c, vWorld);
  gl_FragColor = vec4(c, 1.0);
}
