precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uCanopy;
uniform vec3 uBlossom;
uniform float uBlossomAmt;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vColor;

void main() {
  vec3 n = normalize(vNormal);
  float trunk = 1.0 - step(2.5, vLocal.y);
  vec3 canopy = mix(uCanopy, uBlossom, step(0.72, vColor.b) * uBlossomAmt) * (0.75 + 0.5 * vColor.r);
  vec3 base = mix(canopy, vec3(0.30, 0.22, 0.16), trunk);
  // darker underside of the canopy
  base *= 1.0 - 0.3 * (1.0 - trunk) * (1.0 - smoothstep(-0.6, 0.4, n.y));
  vec3 c = base * shade(n);
  c += iridescence(vWorld, n, uIntensity, uTime) * 0.5;
  c = applyFog(c, vWorld);
  gl_FragColor = vec4(c, 1.0);
}
