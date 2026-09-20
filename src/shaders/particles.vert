attribute vec3 aSeed;
uniform float uTime;
uniform float uFall;
uniform float uSway;
uniform float uSize;
uniform float uSpin;
uniform float uPixelRatio;
varying float vAlpha;
varying float vRot;
varying float vSeed;

void main() {
  const float H = 480.0;
  const float W = 1000.0;
  float t = uTime;
  float speed = 0.6 + 0.8 * aSeed.z;
  float y = mod(aSeed.y * H - t * uFall * speed, H);
  float x = (aSeed.x - 0.5) * W + sin(t * 0.7 + aSeed.z * 6.2831) * uSway;
  float z = (aSeed.z - 0.5) * W + cos(t * 0.5 + aSeed.x * 6.2831) * uSway * 0.7;
  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * 320.0 / max(-mv.z, 1.0) * (0.6 + 0.8 * aSeed.x);
  vAlpha = smoothstep(0.0, 40.0, y) * smoothstep(H, H - 60.0, y) * smoothstep(1400.0, 400.0, -mv.z);
  vRot = t * uSpin * (aSeed.x - 0.5) * 4.0 + aSeed.y * 6.2831;
  vSeed = aSeed.z;
}
