// Shared lighting + fog for every surface. Included after fold.glsl in
// fragment shaders that use it.
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDepthFade;   // distance along the tunnel where the surfaces fade out

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
  // the tunnel has a finite number of copies: hide its ends in fog
  fog = max(fog, smoothstep(0.7 * uDepthFade, 0.98 * uDepthFade, abs(world.z)));
  return mix(c, uFogColor, fog);
}
