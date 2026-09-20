precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uBuildingTint;
uniform vec3 uWindowColor;
uniform float uWindowLit;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vRand;
varying float vHeight;
varying float vWall;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 base = uBuildingTint * (0.68 + 0.4 * vRand);

  float lit = 0.0;
  if (vWall > 0.5) {
    // street-level darkening
    base *= 0.62 + 0.38 * clamp(vUv.y / min(max(vHeight, 1.0), 40.0), 0.0, 1.0);
    // procedural window grid
    vec2 cell = vec2(3.2, 3.6);
    vec2 g = vUv / cell;
    vec2 id = floor(g);
    vec2 f = fract(g);
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.74);
    float h = hash21(id + vRand * 97.0);
    lit = win * step(1.0 - uWindowLit, h) * (0.7 + 0.3 * hash21(id * 1.7 + vRand));
    base = mix(base, base * 0.6, win * 0.45);
  } else {
    base *= 0.92;
  }

  float ndl = max(dot(n, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 light = uSunColor * ndl * 0.8 + mix(uGroundColor, uSkyColor, hemi) * 0.62;
  vec3 c = base * light + uWindowColor * lit * 1.7;

  // mirror-dimension iridescence
  vec3 vdir = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - max(dot(n, vdir), 0.0), 3.0);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vWorld.y * 0.0025 + vWorld.x * 0.0007 + vec3(0.0, 0.33, 0.67)) + uTime * 0.4);
  c += uIntensity * irid * (0.12 + 0.9 * fres);

  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist * uFogDensity);
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, 1.0);
}
