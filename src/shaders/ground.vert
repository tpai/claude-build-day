varying vec3 vWorld;
varying vec2 vFlat;
void main() {
  vec3 folded = mirrorFold(position);
  vWorld = folded;
  vFlat = position.xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
