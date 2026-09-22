precision highp float;
uniform float uTime;
uniform float uNight;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;   // car space: +x forward, +y up, +z right. Body ~4.4 x 1.9 m
varying vec3 vColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 base = vColor;
  // glazing on the cabin
  float cabin = step(1.25, vLocal.y) * (1.0 - step(0.98, n.y));
  base = mix(base, vec3(0.10, 0.13, 0.17), cabin);
  vec3 c = base * shade(n);
  // specular glint on the roof and bonnet
  vec3 vdir = normalize(uCamPos - vWorld);
  c += uSunColor * pow(max(dot(reflect(-vdir, n), uSunDir), 0.0), 30.0) * 0.35;
  // head / tail lights on the front and rear faces
  float lightBand = step(0.55, vLocal.y) * step(vLocal.y, 1.0) * step(0.45, abs(vLocal.z));
  float front = step(0.9, n.x) * lightBand;
  float rear = step(0.9, -n.x) * lightBand;
  c += vec3(1.0, 0.95, 0.8) * front * (0.25 + 1.4 * uNight);
  c += vec3(1.0, 0.12, 0.08) * rear * (0.35 + 0.9 * uNight);
  c = applyFog(c, vWorld);
  gl_FragColor = vec4(c, 1.0);
}
