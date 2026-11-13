// G-buffer pre-pass: r = view-space distance (positive), g/b = view-space normal x/y
// (z is rebuilt as sqrt(1 - x^2 - y^2), because visible normals face the camera), a = 1 where drawn.
varying float vViewZ;
varying vec3 vViewNormal;
void main() {
  vec3 n = normalize(vViewNormal);
  if (!gl_FrontFacing) n = -n;
  gl_FragColor = vec4(vViewZ, n.x, n.y, 1.0);
}
