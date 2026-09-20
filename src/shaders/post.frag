precision highp float;
uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uTime;
uniform float uAspect;
uniform vec3 uGrade;
uniform float uSaturation;
uniform float uVignette;
varying vec2 vUv;

const float PI = 3.14159265;

vec2 kaleido(vec2 uv, float k) {
  vec2 c = uv - 0.5;
  c.x *= uAspect;
  float r = length(c);
  float a = atan(c.y, c.x);
  float segs = floor(mix(2.0, 6.99, smoothstep(0.2, 1.0, k)));
  float rot = uTime * 0.05 * k;
  float sector = 2.0 * PI / segs;
  a = abs(mod(a + rot + sector * 0.5, sector) - sector * 0.5);
  a += sin(uTime * 0.3) * 0.15 * k;
  r *= 1.0 + 0.08 * k * sin(r * 9.0 - uTime * 0.9);
  vec2 o = vec2(cos(a), sin(a)) * r;
  o.x /= uAspect;
  return o + 0.5;
}

vec3 sampleRGB(vec2 uv, float ca) {
  vec2 dir = (uv - 0.5) * ca;
  return vec3(
    texture2D(tDiffuse, uv + dir).r,
    texture2D(tDiffuse, uv).g,
    texture2D(tDiffuse, uv - dir).b
  );
}

void main() {
  float k = uIntensity;
  vec2 c = vUv - 0.5;
  c.x *= uAspect;
  float r = length(c);
  // the mirror world creeps in from the edges as intensity grows
  float r0 = mix(1.05, -0.15, smoothstep(0.08, 0.95, k));
  float wobble = 0.03 * k * sin(atan(c.y, c.x) * 5.0 + uTime * 0.7);
  float mask = smoothstep(r0 - 0.04 + wobble, r0 + 0.04 + wobble, r);
  vec2 kuv = kaleido(vUv, k);
  vec2 uv = mix(vUv, kuv, mask);
  float ca = 0.006 * k * mask;
  vec3 col = sampleRGB(uv, ca);

  // glowing seam at the boundary between the two dimensions
  float seam = exp(-pow((r - r0 - wobble) / 0.012, 2.0)) * step(0.001, k) * step(k, 0.999);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (r * 2.0 + vec3(0.0, 0.33, 0.67)) + uTime * 0.8);
  col += irid * seam * 0.9;
  col += vec3(0.35, 0.6, 1.0) * 0.05 * mask * k;

  // tone map + grade
  col = col / (1.0 + col * 0.45);
  col *= uGrade;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col *= 1.0 - uVignette * smoothstep(0.35, 1.05, r);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
