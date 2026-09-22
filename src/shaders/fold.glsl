// Shared "mirror dimension" mapping. The city is cut into N equal bands along z;
// band b is laid on the b-th of N infinite planes that surround the viewer like
// a prism-shaped tunnel (face 0 on top, then clockwise). Each plane repeats its
// band along both axes and slides sideways, so the surfaces never end. All
// meshes sit at identity transform: `position` is the original city space.
uniform float uTime;
uniform float uSides;     // number of faces, 2 .. 6
uniform float uBoxR;      // half size of the square of city that is used (metres)
uniform float uTunnelR;   // distance from the viewer to each face (metres)
uniform float uSlide;     // sideways offset within one copy (metres, 0 .. 2 * uBoxR)
uniform float uWraps;     // how many whole copies the surfaces have already slid past
uniform vec3 uTile;       // dynamic meshes: (copy along the slide, copy along the tunnel, band or -1 = derive from z)

const float FOLD_PI = 3.14159265;

// Every copy of a band has a permanent identity, so each one can look different.
// The index along the slide is absolute (it travels with the content, see uWraps),
// which keeps a copy's identity fixed as it drifts past the viewer.
float tileRand(vec3 tile) {
  vec3 p = fract(tile * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// tile: x = copy index along the slide direction, y = copy index along the tunnel axis,
// z = band index, or < 0 to derive it from p.z
vec3 mirrorFold(vec3 p, vec3 tile) {
  float N = uSides;
  float bandW = 2.0 * uBoxR / N;
  float b = tile.z >= 0.0 ? tile.z : clamp(floor((p.z + uBoxR) / bandW), 0.0, N - 1.0);
  float bandCentre = -uBoxR + (b + 0.5) * bandW;
  // half of the copies are turned around: the streets then run the other way, and the
  // copy still fills its slot exactly (a half turn about the surface normal, so windings hold)
  float s = tileRand(vec3(tile.xy, b)) < 0.5 ? -1.0 : 1.0;
  float u = s * p.x + (tile.x + uWraps) * 2.0 * uBoxR + uSlide;  // along the face, sideways for the viewer
  float v = s * (p.z - bandCentre) + tile.y * bandW;             // along the tunnel axis
  float th = 0.5 * FOLD_PI - 2.0 * FOLD_PI * b / N;   // face 0 at the top, then clockwise
  vec2 c = vec2(cos(th), sin(th));                    // face centre direction
  vec2 t = vec2(-sin(th), cos(th));                   // slide direction (same rotational sense on every face)
  vec2 xy = c * uTunnelR - c * p.y + t * u;           // surface normal points at the viewer
  return vec3(xy.x, xy.y, v); // a rotation, never a reflection: windings stay intact
}

// how much taller or shorter this copy's buildings are
float tileHeight(vec3 tile) { return 0.82 + 0.26 * tileRand(tile + vec3(11.5, 3.7, 19.3)); }
