// A soft round splat; its energy goes into the red channel of the ground bake (the shadow is in green).
varying float vEnergy;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float falloff = (1.0 - r2) * (1.0 - r2);
  gl_FragColor = vec4(vEnergy * falloff, 0.0, 0.0, 0.0);
}
