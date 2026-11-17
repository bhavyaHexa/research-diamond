// Glass seen from the light: world position and world normal of the surface the light reaches first.
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
