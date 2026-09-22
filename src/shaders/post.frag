precision highp float;
uniform sampler2D tDiffuse;
uniform float uAspect;
uniform vec3 uGrade;
uniform float uSaturation;
uniform float uVignette;
uniform float uFade;      // 1 = visible, 0 = black (city / face-count transitions)
varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  c.x *= uAspect;
  float r = length(c);
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  // tone map + grade
  col = col / (1.0 + col * 0.45);
  col *= uGrade;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col *= 1.0 - uVignette * smoothstep(0.35, 1.05, r);
  col *= uFade;
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
