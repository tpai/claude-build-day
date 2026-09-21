precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform float uNight;      // 0 day .. 1 night, lifts the street lamp glow
uniform vec3 uWindowColor;
varying vec3 vWorld;
varying vec2 vFlat;
varying float vAcross;
varying float vAlong;
varying float vWidth;
varying float vCls;

void main() {
  float cls = mod(vCls, 16.0);
  float oneway = step(16.0, vCls);
  float x = abs(vAcross);                  // 0 centre .. 1 edge
  float xm = x * vWidth * 0.5;             // metres from centre line
  float aa = fwidth(xm) * 1.2;             // anti-aliasing width in metres
  vec3 c;
  if (cls < 0.5) {
    // footpath: pale paving with a faint slab pattern
    c = vec3(0.56, 0.54, 0.50) * (0.92 + 0.08 * hash21(floor(vec2(vAlong, xm) / 1.4)));
  } else if (cls < 1.5) {
    // pedestrian street: tiled paving in a chequer
    vec2 tile = floor(vec2(vAlong, vAcross * vWidth * 0.5) / 2.2);
    float chk = mod(tile.x + tile.y, 2.0);
    c = mix(vec3(0.50, 0.47, 0.44), vec3(0.58, 0.56, 0.52), chk) * (0.9 + 0.1 * hash21(tile));
  } else {
    // asphalt with sidewalks, kerb, edge line, centre / lane markings
    float sidewalkW = cls < 2.5 ? 0.0 : min(1.8 + 0.25 * cls, vWidth * 0.22);
    float halfW = vWidth * 0.5;
    float roadHalf = halfW - sidewalkW;
    vec3 asphalt = vec3(0.17, 0.17, 0.18) * (0.9 + 0.2 * hash21(floor(vFlat * 1.7)));
    vec3 paving = vec3(0.52, 0.50, 0.47) * (0.94 + 0.06 * hash21(floor(vec2(vAlong, xm) * 0.8)));
    float sidewalk = smoothstep(roadHalf - aa, roadHalf + aa, xm) * step(0.5, sidewalkW);
    float kerb = smoothstep(roadHalf - 0.35 - aa, roadHalf - 0.35, xm) * (1.0 - sidewalk) * step(0.5, sidewalkW);
    c = mix(asphalt, paving, sidewalk);
    c = mix(c, vec3(0.42, 0.42, 0.41), kerb * 0.8);
    // edge line just inside the kerb
    float edge = (1.0 - smoothstep(0.12, 0.12 + aa, abs(xm - (roadHalf - 0.55)))) * (1.0 - sidewalk) * step(3.5, cls);
    c = mix(c, vec3(0.75), edge * 0.7);
    // centre line: dashed yellow for two-way roads with room for it
    float dash = step(0.5, fract(vAlong / 6.0));
    float centre = (1.0 - smoothstep(0.09, 0.09 + aa, xm)) * step(3.5, cls) * (1.0 - oneway);
    c = mix(c, vec3(0.85, 0.72, 0.30), centre * (0.6 + 0.3 * dash));
    // lane dashes on wide roads
    float lanes = floor(roadHalf / 3.4);
    float lanePos = mod(xm, 3.4);
    float laneLine = (1.0 - smoothstep(0.08, 0.08 + aa, min(lanePos, 3.4 - lanePos))) * step(3.4 * 0.9, xm) * step(xm, lanes * 3.4 + 0.5) * step(4.5, cls) * step(0.5, fract(vAlong / 5.0)) * (1.0 - sidewalk);
    c = mix(c, vec3(0.8), laneLine * 0.6);
    // zebra crossing bands every ~90 m on real roads
    float cross = step(mod(vAlong + 20.0, 90.0), 3.2) * step(0.5, fract(xm / 1.2)) * (1.0 - sidewalk) * step(2.5, cls) * step(12.0, vWidth);
    c = mix(c, vec3(0.85), cross * 0.8);
    // street lamps pool warm light on the pavement at night
    float lamp = exp(-pow(mod(vAlong + 10.0, 32.0) - 16.0, 2.0) * 0.02) * smoothstep(roadHalf - 3.0, roadHalf + 1.0, xm);
    c += uWindowColor * lamp * uNight * 0.35 * step(2.5, cls);
  }
  vec3 n = vec3(0.0, 1.0, 0.0);
  c *= shade(n);
  // faint sheen in the mirror dimension
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (length(vFlat) * 0.002 + vec3(0.0, 0.33, 0.67)) - uTime * 0.3);
  c += uIntensity * irid * 0.06;
  c = applyFog(c, vWorld);
  gl_FragColor = vec4(c, 1.0);
}
