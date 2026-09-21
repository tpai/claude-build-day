varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vColor;

void main() {
  vec3 wp = (instanceMatrix * vec4(position, 1.0)).xyz;
  vec3 wn = normalize(mat3(instanceMatrix) * normal);
  vec3 folded = mirrorFold(wp);
  vec3 folded2 = mirrorFold(wp + wn * 0.5);
  vec3 fn = folded2 - folded;
  vNormal = length(fn) > 1e-5 ? normalize(fn) : wn;
  vWorld = folded;
  vLocal = position;
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
