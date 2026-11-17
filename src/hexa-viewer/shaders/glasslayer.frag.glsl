// One layer of the glass geometry as seen from the camera, for depth peeling: r = view depth relative to depthRef
// (kept small so half floats stay precise), g/b = view normal x/y (z is rebuilt by the glass shader from the side
// of the surface), a = 1 where there is a surface. With PEEL, surfaces at or in front of the previous layer are
// skipped, so this layer is the next one behind it.
varying float vViewZ;
varying vec3 vViewNormal;
uniform float depthRef;
uniform vec2 resolution;
uniform sampler2D tPrev;
void main() {
#ifdef PEEL
  vec4 previous = texture2D(tPrev, gl_FragCoord.xy / resolution);
  if (previous.a > 0.5 && vViewZ - depthRef <= previous.r + 0.004) discard;
#endif
  vec3 n = normalize(vViewNormal);
  gl_FragColor = vec4(vViewZ - depthRef, n.x, n.y, 1.0);
}
