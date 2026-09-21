varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vColor;

void main() {
  vec3 wp = (instanceMatrix * vec4(position, 1.0)).xyz;
  vec3 wn = normalize(mat3(instanceMatrix) * normal);
  // canopies sway a little
  wp.x += step(2.5, position.y) * 0.25 * sin(uTime * 1.3 + wp.z * 0.05) * position.y / 6.0;
  vec3 folded = mirrorFold(wp);
  vec3 folded2 = mirrorFold(wp + wn * 0.5);
  vec3 fn = folded2 - folded;
  vNormal = length(fn) > 1e-5 ? normalize(fn) : wn;
  vWorld = folded;
  vLocal = position;
  vColor = instanceColor; // (variation, variation, seed)
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
