precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uGroundBase;
uniform vec3 uGridColor;
uniform vec3 uWater;
uniform vec3 uGrass;
uniform sampler2D uMask;   // R = water, G = parks, over the whole ground plane
uniform float uGroundSize;
varying vec3 vWorld;
varying vec2 vFlat;

// value noise for patches of soil / lawn between the blocks
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  float radial = smoothstep(1100.0, 300.0, length(vFlat));
  float n1 = vnoise(vFlat * 0.045), n2 = vnoise(vFlat * 0.2);
  vec2 m = texture2D(uMask, vFlat / uGroundSize + 0.5).rg;
  float water = smoothstep(0.4, 0.6, m.r);
  float green = smoothstep(0.4, 0.6, m.g) * (1.0 - water);

  // block interiors: mostly paved courtyards with patches of planting
  vec3 paved = vec3(0.36, 0.35, 0.34);
  vec3 c = mix(paved, uGroundBase, 0.3 + 0.5 * n1) * (0.88 + 0.12 * n2);
  // parks: lawn with mown stripes and a worn path or two
  vec3 grass = uGrass * (0.8 + 0.3 * vnoise(vFlat * 0.15)) * (0.92 + 0.08 * step(0.5, fract(vFlat.x / 9.0)));
  grass = mix(grass, grass * 0.7, smoothstep(0.55, 0.7, m.g) * 0.15); // slightly darker deep inside
  c = mix(c, grass, green);
  // paving inside blocks: a faint slab grid, only near the viewer
  vec2 g = abs(fract(vFlat / 50.0 - 0.5) - 0.5) / fwidth(vFlat / 50.0);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  c += uGridColor * line * (0.06 + 0.7 * uIntensity) * radial * (1.0 - green);
  c *= shade(vec3(0.0, 1.0, 0.0));

  // water: sky reflection, moving ripples, sun glitter, lighter shallows near the bank
  vec3 vdir = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(vdir.y, 0.0), 3.0);
  float rip = vnoise(vFlat * 0.12 + vec2(uTime * 0.35, uTime * 0.2)) * vnoise(vFlat * 0.07 - vec2(uTime * 0.25, uTime * 0.15));
  vec3 waterCol = mix(uWater, uSkyColor, 0.25 + 0.55 * fres) * (0.8 + 0.5 * rip);
  vec3 r = reflect(-vdir, vec3(0.0, 1.0, 0.0));
  waterCol += uSunColor * pow(max(dot(r, uSunDir), 0.0), 60.0) * (0.3 + 0.8 * rip);
  waterCol = mix(waterCol * 1.15, waterCol, smoothstep(0.55, 0.9, m.r));
  c = mix(c, waterCol, water);

  // iridescent sheen when folded
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (length(vFlat) * 0.002 + vec3(0.0, 0.33, 0.67)) - uTime * 0.3);
  c += uIntensity * irid * 0.05 * radial;
  c = applyFog(c, vWorld);
  gl_FragColor = vec4(c, 1.0);
}
