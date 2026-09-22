// Shared "mirror dimension" mapping. The city is cut into N equal bands along z;
// band b is laid on the b-th of N infinite planes that surround the viewer like
// a prism-shaped tunnel (face 0 on top, then clockwise). Each plane repeats its
// band along both axes and slides sideways, so the surfaces never end. All
// meshes sit at identity transform: `position` is the original city space.
uniform float uTime;
uniform float uSides;     // number of faces, 2 .. 6
uniform float uBoxR;      // half size of the square of city that is used (metres)
uniform float uTunnelR;   // distance from the viewer to each face (metres)
uniform float uSlide;     // sideways offset of the surfaces (metres, wraps at 2 * uBoxR)
uniform vec3 uTile;       // dynamic meshes: (copy along the slide, copy along the tunnel, band or -1 = derive from z)

const float FOLD_PI = 3.14159265;

// tile: x = copy index along the slide direction, y = copy index along the tunnel axis,
// z = band index, or < 0 to derive it from p.z
vec3 mirrorFold(vec3 p, vec3 tile) {
  float N = uSides;
  float bandW = 2.0 * uBoxR / N;
  float b = tile.z >= 0.0 ? tile.z : clamp(floor((p.z + uBoxR) / bandW), 0.0, N - 1.0);
  float bandCentre = -uBoxR + (b + 0.5) * bandW;
  float u = p.x + uSlide + tile.x * 2.0 * uBoxR;      // along the face, sideways for the viewer
  float v = (p.z - bandCentre) + tile.y * bandW;      // along the tunnel axis
  float th = 0.5 * FOLD_PI - 2.0 * FOLD_PI * b / N;   // face 0 at the top, then clockwise
  vec2 c = vec2(cos(th), sin(th));                    // face centre direction
  vec2 t = vec2(-sin(th), cos(th));                   // slide direction (same rotational sense on every face)
  vec2 xy = c * uTunnelR - c * p.y + t * u;           // surface normal points at the viewer
  return vec3(xy.x, xy.y, v); // a rotation, never a reflection: windings stay intact
}
