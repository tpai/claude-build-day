precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uGroundBase;
uniform vec3 uGridColor;
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
  // block interiors: mostly paved courtyards with patches of planting
  vec3 paved = vec3(0.36, 0.35, 0.34);
  vec3 c = mix(paved, uGroundBase, 0.3 + 0.5 * n1) * (0.88 + 0.12 * n2);
  // paving inside blocks: a faint slab grid, only near the viewer
  vec2 g = abs(fract(vFlat / 50.0 - 0.5) - 0.5) / fwidth(vFlat / 50.0);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  c += uGridColor * line * (0.06 + 0.7 * uIntensity) * radial;
  c *= shade(vec3(0.0, 1.0, 0.0));
  // iridescent sheen when folded
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (length(vFlat) * 0.002 + vec3(0.0, 0.33, 0.67)) - uTime * 0.3);
  c += uIntensity * irid * 0.05 * radial;
  c = applyFog(c, vWorld);
  gl_FragColor = vec4(c, 1.0);
}
