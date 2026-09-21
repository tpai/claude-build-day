attribute float aAcross;   // -1 .. 1 across the ribbon
attribute float aAlong;    // metres along the road
attribute float aWidth;    // ribbon width in metres
attribute float aCls;      // road class (0 footway .. 7 trunk) + 16 if oneway
varying vec3 vWorld;
varying vec2 vFlat;
varying float vAcross;
varying float vAlong;
varying float vWidth;
varying float vCls;

void main() {
  vec3 folded = mirrorFold(position);
  vWorld = folded;
  vFlat = position.xz;
  vAcross = aAcross; vAlong = aAlong; vWidth = aWidth; vCls = aCls;
  gl_Position = projectionMatrix * viewMatrix * vec4(folded, 1.0);
}
