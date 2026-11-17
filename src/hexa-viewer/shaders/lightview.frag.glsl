varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
#ifdef OUTPUT_NORMAL
  gl_FragColor = vec4(normalize(vNormalW), 1.0);
#else
  gl_FragColor = vec4(vWorld, 1.0);
#endif
}
