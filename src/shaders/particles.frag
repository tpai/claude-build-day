precision highp float;
uniform vec3 uColor;
uniform float uShape;   // 0 petal, 1 sparkle, 2 leaf, 3 snow
uniform float uTime;
uniform float uOpacity;
varying float vAlpha;
varying float vRot;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv;
  float a;
  if (uShape < 0.5) {
    a = 1.0 - smoothstep(0.32, 0.48, length(uv * vec2(1.0, 1.8)));
  } else if (uShape < 1.5) {
    float r = length(uv);
    a = pow(max(1.0 - r * 2.0, 0.0), 2.2) * (0.55 + 0.45 * sin(uTime * 6.0 + vSeed * 40.0));
  } else if (uShape < 2.5) {
    a = 1.0 - smoothstep(0.28, 0.44, length(uv * vec2(1.0, 2.2)));
    a *= step(-0.1, uv.x * uv.y + 0.08);
  } else {
    a = 1.0 - smoothstep(0.22, 0.5, length(uv));
  }
  a *= vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
