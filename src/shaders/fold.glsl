// Shared "mirror dimension" world fold. All folded meshes sit at identity
// transform, so `position` is already world space.
uniform float uIntensity;   // 0 = normal city, 1 = fully folded
uniform float uTime;
uniform float uCamAz;       // camera azimuth, rotates the curl to face the viewer
uniform float uCamDist;     // camera horizontal distance from origin
uniform float uCurlR;       // curl radius at full intensity

vec3 mirrorFold(vec3 p0) {
  float k = uIntensity;
  if (k < 0.0005) return p0;
  vec3 p = p0;
  float d = length(p.xz);

  // slow twist around the vertical axis, grows with distance
  float tw = k * k * 0.0010 * d * sin(uTime * 0.25 + d * 0.003);
  float c = cos(tw), s = sin(tw);
  p.xz = mat2(c, -s, s, c) * p.xz;

  // into camera frame: camera ends up at (0, +uCamDist)
  float ca = cos(uCamAz), sa = sin(uCamAz);
  vec2 q2 = mat2(ca, -sa, sa, ca) * p.xz;

  // curl the world up in front of the viewer (Inception style)
  float R = mix(2500.0, uCurlR, k);
  float ang = (q2.y - uCamDist) / R;
  float r = R - p.y;
  vec3 q = vec3(q2.x, R - r * cos(ang), uCamDist + r * sin(ang));

  // gentle side bowl
  float R2 = mix(4000.0, 1400.0, k);
  float a2 = q.x / R2;
  float r2 = R2 - q.y;
  q = vec3(r2 * sin(a2), R2 - r2 * cos(a2), q.z);

  // back to world frame
  q.xz = mat2(ca, sa, -sa, ca) * q.xz;

  // breathing ripple
  q.y += k * 5.0 * sin(d * 0.02 - uTime * 0.8);

  return mix(p0, q, smoothstep(0.0, 1.0, k));
}
