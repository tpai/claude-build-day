// One point sprite per pedestrian. position is updated on the CPU every frame.
attribute vec3 aSeed;     // x: colour, y: phase, z: height variation
uniform float uPixelRatio;
uniform float uViewH;     // drawing buffer height in device pixels
varying float vAlpha;
varying float vPhase;
varying vec3 vSeed;
varying vec3 vWorld;

void main() {
  float height = 1.7 + 0.35 * aSeed.z;
  vec3 folded = mirrorFold(position);
  vec4 mv = viewMatrix * vec4(folded, 1.0);
  gl_Position = projectionMatrix * mv;
  // project the figure's height into device pixels
  float px = height * projectionMatrix[1][1] * (uViewH * 0.5) / max(-mv.z, 1.0);
  gl_PointSize = clamp(px, 2.0, 96.0);
  vAlpha = smoothstep(1.0, 3.0, px);
  vPhase = uTime * 4.0 + aSeed.y * 6.2831;
  vSeed = aSeed;
  vWorld = folded;
}
