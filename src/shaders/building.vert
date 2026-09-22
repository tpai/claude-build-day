attribute float aRand;
attribute float aHeight;
attribute float aWall;
attribute vec4 aTile;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vFlat;
varying float vRand;
varying float vHeight;
varying float vWall;
varying float vTileR;

void main() {
  if (tileDrops(aTile, aRand, 0.18)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // each copy of a band gets its own skyline: the same buildings, a little taller or shorter
  float hs = tileHeight(aTile);
  vec3 p = vec3(position.x, position.y * hs, position.z);
  vec3 folded = mirrorFold(p, aTile);
  vec3 folded2 = mirrorFold(p + normal * 0.5, aTile);
  vec3 fn = folded2 - folded;
  vNormal = length(fn) > 1e-5 ? normalize(fn) : normal;
  vWorld = folded;
  vFlat = position.xz;
  vUv = vec2(uv.x, uv.y * hs);
  vRand = aRand;
  vHeight = aHeight * hs;
  vTileR = tileRand(aTile.xyz + vec3(5.1, 2.3, 8.7));
  vWall = aWall;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
