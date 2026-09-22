attribute vec4 aTile;
attribute vec3 aTreeColor;   // (variation, 0, seed)
attribute float aLocalY;     // height within the tree, for trunk / canopy
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLocalY;
varying vec3 vColor;
varying float vTileR;

void main() {
  if (tileDrops(aTile + vec4(3.3, 3.3, 3.3, 0.0), aTreeColor.b, 0.35)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
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
  vTileR = tileRand(aTile.xyz + vec3(2.9, 6.1, 4.3));
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
