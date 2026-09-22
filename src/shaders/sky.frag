precision highp float;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uNight;
uniform vec3 uFogColor;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 1.4 + 0.15, 0.0, 1.0);
  vec3 c = mix(uSkyBottom, uSkyTop, pow(t, 0.55));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunColor * (pow(sd, 200.0) * 1.5 + pow(sd, 8.0) * 0.22);
  // stars fade in at night, twinkling, denser toward the zenith
  if (uNight > 0.01 && d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.35) * 90.0;
    vec2 cell = floor(p);
    float h = hash21(cell);
    vec2 f = fract(p) - 0.5 - (vec2(hash21(cell + 7.1), hash21(cell + 3.7)) - 0.5) * 0.7;
    float star = step(0.92, h) * smoothstep(0.09, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * 2.5 + h * 200.0));
    c += star * uNight * smoothstep(0.02, 0.25, d.y) * vec3(0.85, 0.9, 1.0) * (0.6 + 0.6 * fract(h * 13.0));
  }
  // the tunnel's open ends look into fog
  c = mix(c, uFogColor, smoothstep(0.35, 0.8, abs(d.z)));
  gl_FragColor = vec4(c, 1.0);
}
