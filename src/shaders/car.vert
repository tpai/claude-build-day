varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vColor;
varying float vTileR;

void main() {
  vec3 wp = (instanceMatrix * vec4(position, 1.0)).xyz;
  vec3 wn = normalize(mat3(instanceMatrix) * normal);
  vec3 folded = mirrorFold(wp, uTile);
  vec3 folded2 = mirrorFold(wp + wn * 0.5, uTile);
  vec3 fn = folded2 - folded;
  vNormal = length(fn) > 1e-5 ? normalize(fn) : wn;
  vWorld = folded;
  vLocal = position;
  vColor = instanceColor;
  vTileR = tileRand(uTile.xyz + vec3(7.7, 1.3, 3.9));
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
