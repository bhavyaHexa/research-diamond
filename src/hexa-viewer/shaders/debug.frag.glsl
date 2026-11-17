// Debug views of the pre-pass buffers: 1 depth, 2 view-space normals, 3 ambient occlusion.
varying vec2 vUv;
uniform sampler2D tDepth;   // r = view distance, g/b = view normal x/y, a = covered
uniform sampler2D tAo;
uniform float mode;
uniform vec2 depthRange;    // near / far used to normalise depth

void main() {
  vec4 g = texture2D(tDepth, vUv);
  vec3 colour = vec3(1.0);
  if (mode < 1.5) {
    if (g.a > 0.5) colour = vec3(1.0 - clamp((g.r - depthRange.x) / (depthRange.y - depthRange.x), 0.0, 1.0));
  } else if (mode < 2.5) {
    if (g.a > 0.5) colour = vec3(g.gb, sqrt(max(0.0, 1.0 - dot(g.gb, g.gb)))) * 0.5 + 0.5;
  } else {
    colour = vec3(texture2D(tAo, vUv).r);
  }
  gl_FragColor = vec4(colour, 1.0);
}
