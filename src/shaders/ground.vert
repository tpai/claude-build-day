attribute vec4 aTile;
attribute vec2 aCity;   // city coordinates before this slice was turned, so the water and park mask lines up
varying vec3 vWorld;
varying float vTileR;
varying vec2 vFlat;
varying vec2 vCity;
void main() {
  vec3 folded = mirrorFold(position, aTile);
  vWorld = folded;
  vTileR = tileRand(aTile.xyz + vec3(4.4, 9.2, 1.7));
  vFlat = position.xz;
  vCity = aCity;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
