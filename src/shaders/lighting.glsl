// Shared lighting + fog for every folded surface. Included after fold.glsl in
// fragment shaders that use it.
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform float uFogDensity;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// sun + hemisphere light for a normal
vec3 shade(vec3 n) {
  float ndl = max(dot(n, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  return uSunColor * ndl * 0.8 + mix(uGroundColor, uSkyColor, hemi) * 0.62;
}

vec3 applyFog(vec3 c, vec3 world) {
  float dist = length(uCamPos - world);
  float fog = 1.0 - exp(-dist * uFogDensity);
  return mix(c, uFogColor, fog);
}

// mirror-dimension iridescent sheen
vec3 iridescence(vec3 world, vec3 n, float k, float time) {
  vec3 vdir = normalize(uCamPos - world);
  float fres = pow(1.0 - max(dot(n, vdir), 0.0), 3.0);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (world.y * 0.0025 + world.x * 0.0007 + vec3(0.0, 0.33, 0.67)) + time * 0.4);
  return k * irid * (0.12 + 0.9 * fres);
}
