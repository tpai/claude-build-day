precision highp float;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDepthFade;
uniform vec3 uCamPos;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
varying float vAlpha;
varying float vPhase;
varying vec3 vSeed;
varying vec3 vWorld;

// signed distance to a segment
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

void main() {
  // figure space: x -0.5..0.5, y 0 (feet) .. 1 (top of head)
  vec2 p = vec2(gl_PointCoord.x - 0.5, 1.0 - gl_PointCoord.y);
  float aa = 0.06;
  float swing = sin(vPhase) * 0.12;
  // legs
  float dl = min(seg(p, vec2(-0.05, 0.45), vec2(-0.05 + swing, 0.02), 0.045),
                 seg(p, vec2( 0.05, 0.45), vec2( 0.05 - swing, 0.02), 0.045));
  // torso
  float dt = seg(p, vec2(0.0, 0.45), vec2(0.0, 0.74), 0.11);
  // arms
  float da = min(seg(p, vec2(-0.1, 0.7), vec2(-0.12 - swing * 0.6, 0.45), 0.035),
                 seg(p, vec2( 0.1, 0.7), vec2( 0.12 + swing * 0.6, 0.45), 0.035));
  // head
  float dh = length(p - vec2(0.0, 0.87)) - 0.1;
  float d = min(min(dl, dt), min(da, dh));
  float a = 1.0 - smoothstep(0.0, aa, d);
  a *= vAlpha;
  if (a < 0.02) discard;
  vec3 shirt = 0.55 + 0.4 * cos(6.2831 * (vSeed.x + vec3(0.0, 0.33, 0.67)));
  shirt = mix(shirt, vec3(0.35), step(0.75, fract(vSeed.x * 7.0)) * 0.7); // some in dark coats
  vec3 trousers = mix(vec3(0.16, 0.17, 0.22), vec3(0.32, 0.28, 0.25), step(0.5, fract(vSeed.x * 13.0)));
  vec3 skin = mix(vec3(0.85, 0.66, 0.52), vec3(0.45, 0.30, 0.20), fract(vSeed.x * 3.0));
  vec3 c = dh < dt && dh < dl ? skin : (dl < dt && dl < da ? trousers : shirt);
  c *= mix(uSkyColor, uSunColor, 0.4) * 0.9 + 0.25;
  float dist = length(uCamPos - vWorld);
  float fog = max(1.0 - exp(-dist * uFogDensity), smoothstep(0.7 * uDepthFade, 0.98 * uDepthFade, abs(vWorld.z)));
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, a);
}
