attribute vec3 aTile;
attribute vec3 aTreeColor;   // (variation, 0, seed)
attribute float aLocalY;     // height within the tree, for trunk / canopy
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLocalY;
varying vec3 vColor;

void main() {
  vec3 wp = position;
  // canopies sway a little
  wp.x += step(2.5, aLocalY) * 0.25 * sin(uTime * 1.3 + wp.z * 0.05) * aLocalY / 6.0;
  vec3 folded = mirrorFold(wp, aTile);
  vec3 folded2 = mirrorFold(wp + normal * 0.5, aTile);
  vec3 fn = folded2 - folded;
  vNormal = length(fn) > 1e-5 ? normalize(fn) : normal;
  vWorld = folded;
  vLocalY = aLocalY;
  vColor = aTreeColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
