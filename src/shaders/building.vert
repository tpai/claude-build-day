attribute float aRand;
attribute float aHeight;
attribute float aWall;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vRand;
varying float vHeight;
varying float vWall;

void main() {
  vec3 folded = mirrorFold(position);
  vec3 folded2 = mirrorFold(position + normal * 0.5);
  vec3 fn = folded2 - folded;
  vNormal = length(fn) > 1e-5 ? normalize(fn) : normal;
  vWorld = folded;
  vUv = uv;
  vRand = aRand;
  vHeight = aHeight;
  vWall = aWall;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
