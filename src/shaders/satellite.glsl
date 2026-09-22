// Satellite imagery for the current city, sampled in city coordinates (metres from the
// city centre, before the slice was turned). One texture covers the square the slices
// are cut from; outside it the procedural ground takes over again.
uniform sampler2D uSat;
uniform vec4 uSatRect;   // west, north, width, depth, in city metres
uniform float uSatAmt;   // 0 while the imagery is still decoding, or when it is switched off

// imagery colour at a point in city coordinates; `amt` is how much of it to believe
vec3 satAt(vec2 cityXZ, out float amt) {
  vec2 uv = (cityXZ - uSatRect.xy) / uSatRect.zw;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  amt = uSatAmt * smoothstep(0.0, 0.025, edge);
  return texture2D(uSat, clamp(uv, 0.0, 1.0)).rgb;
}

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// The imagery was shot in daylight from straight above, so it already carries its own
// sun. Flatten that out to something closer to an albedo before the scene relights it.
vec3 satAlbedo(vec3 c) {
  float l = lum(c);
  vec3 tint = c / max(l, 0.04);
  return mix(vec3(l), vec3(l) * tint, 0.85) * (0.55 + 0.75 * smoothstep(0.02, 0.5, l));
}
