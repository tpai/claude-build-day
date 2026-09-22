// Shared "mirror dimension" mapping. The city is cut into N equal bands along z;
// band b is laid on the b-th of N infinite planes that surround the viewer like
// a prism-shaped tunnel (face 0 on top, then clockwise). Each plane repeats its
// band along both axes and slides sideways, so the surfaces never end. All
// meshes sit at identity transform: `position` is the original city space.
uniform float uTime;
uniform float uSides;     // number of faces, 2 .. 6
uniform float uSlices;    // how many slices of the city the copies are drawn from
uniform float uBoxR;      // half size of the square of city that is used (metres)
uniform float uTunnelR;   // distance from the viewer to each face (metres)
uniform float uSlide;     // sideways offset within one copy (metres, 0 .. 2 * uBoxR)
uniform float uWraps;     // how many whole copies the surfaces have already slid past
uniform vec4 uTile;       // dynamic meshes: see mirrorFold

const float FOLD_PI = 3.14159265;

// Every copy of a band has a permanent identity, so each one can look different.
// The index along the slide is absolute (it travels with the content, see uWraps),
// which keeps a copy's identity fixed as it drifts past the viewer.
float tileRand(vec3 t) {
  vec3 p = fract(t * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// tile: x = copy index along the slide direction, y = slot index along the tunnel axis,
// z = which face it is on, w = centre (in city z) of the slice of city this copy shows
vec3 mirrorFold(vec3 p, vec4 tile) {
  float N = uSides;
  float f = tile.z;
  float sliceW = 2.0 * uBoxR / uSlices;
  // one of four orientations, so the streets run a different way in each copy; every one
  // maps the slot exactly onto itself. Two of them are mirror images, which reverse the
  // triangle winding, so the folded materials are drawn double sided.
  float r = tileRand(vec3(tile.xy, f));
  float su = r < 0.5 ? 1.0 : -1.0;
  float sv = fract(r * 17.0) < 0.5 ? 1.0 : -1.0;
  float u = su * p.x + (tile.x + uWraps) * 2.0 * uBoxR + uSlide;  // along the face, sideways for the viewer
  float v = sv * (p.z - tile.w) + tile.y * sliceW;                // along the tunnel axis
  float th = 0.5 * FOLD_PI - 2.0 * FOLD_PI * f / N;   // face 0 at the top, then clockwise
  vec2 c = vec2(cos(th), sin(th));                    // face centre direction
  vec2 t = vec2(-sin(th), cos(th));                   // slide direction (same rotational sense on every face)
  vec2 xy = c * uTunnelR - c * p.y + t * u;           // surface normal points at the viewer
  return vec3(xy.x, xy.y, v); // a rotation, never a reflection: windings stay intact
}

// how much taller or shorter this copy's buildings are
float tileHeight(vec4 tile) { return 0.82 + 0.26 * tileRand(tile.xyz + vec3(11.5, 3.7, 19.3)); }

// Each copy is missing a different random share of its buildings and trees, so the
// blocks themselves differ and not just their paint. `seed` identifies the object.
bool tileDrops(vec4 tile, float seed, float most) {
  float rate = most * tileRand(tile.xyz + vec3(13.7, 5.3, 2.1));
  return tileRand(vec3(seed * 131.0, tile.x * 1.7 + tile.y * 3.1, tile.z + tile.w * 0.01)) < rate;
}
