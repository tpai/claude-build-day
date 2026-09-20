precision highp float;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uIntensity;
uniform float uTime;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 1.4 + 0.15, 0.0, 1.0);
  vec3 c = mix(uSkyBottom, uSkyTop, pow(t, 0.55));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunColor * (pow(sd, 200.0) * 1.5 + pow(sd, 8.0) * 0.22);
  // faint aurora-like bands in the mirror dimension
  float band = sin(d.x * 18.0 + d.y * 12.0 + uTime * 0.35) * sin(d.z * 14.0 - uTime * 0.2);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (band * 0.25 + vec3(0.0, 0.33, 0.67)) + uTime * 0.2);
  c += uIntensity * irid * 0.08 * smoothstep(-0.1, 0.5, d.y);
  gl_FragColor = vec4(c, 1.0);
}
