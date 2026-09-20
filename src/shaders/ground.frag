precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uGroundBase;
uniform vec3 uGridColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vWorld;
varying vec2 vFlat;

void main() {
  vec2 g = abs(fract(vFlat / 50.0 - 0.5) - 0.5) / fwidth(vFlat / 50.0);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float radial = smoothstep(1100.0, 300.0, length(vFlat));
  vec3 c = uGroundBase;
  c += uGridColor * line * (0.35 + 0.5 * uIntensity) * radial;
  // iridescent sheen when folded
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (length(vFlat) * 0.002 + vec3(0.0, 0.33, 0.67)) - uTime * 0.3);
  c += uIntensity * irid * 0.05 * radial;
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist * uFogDensity);
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, 1.0);
}
