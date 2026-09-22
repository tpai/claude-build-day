attribute vec4 aTile;
varying vec3 vWorld;
varying float vTileR;
varying vec2 vFlat;
void main() {
  vec3 folded = mirrorFold(position, aTile);
  vWorld = folded;
  vTileR = tileRand(aTile.xyz + vec3(4.4, 9.2, 1.7));
  vFlat = position.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
