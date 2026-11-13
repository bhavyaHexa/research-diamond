// G-buffer pre-pass vertex shader: view-space distance and view-space normal.
varying float vViewZ;
varying vec3 vViewNormal;
void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vViewZ = -viewPos.z;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPos;
}
