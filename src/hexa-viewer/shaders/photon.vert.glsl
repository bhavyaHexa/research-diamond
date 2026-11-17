// One photon per point. The points are a regular grid over the light's view of the glass, so every photon carries the
// same energy. Each looks up where it enters the glass (position, normal), is bent, and lands on the ground; the
// point is drawn at that landing place, seen from above (the ground bake's camera).
//   - the glass is treated as a thin parallel plate: light comes out almost where and how it went in
uniform sampler2D tPosition;   // world position of the glass surface seen from the light (a = 1 where there is glass)
uniform sampler2D tNormal;     // its world normal
uniform vec3 incident;         // direction the light travels (from the light into the scene)
uniform float groundY;
uniform float ior;
uniform vec3 tint;
uniform float density;
uniform float path;            // light path through the glass (two walls), for the absorption
uniform float weight;          // energy of one photon
uniform float pointSize;
uniform vec2 jitter;           // offset in -0.5..0.5 grid cells
uniform float gridSize;
uniform float lightRes;        // resolution of the position and normal maps
uniform float lightSize;       // width of the light's view, scene units
uniform vec3 lightRight;       // the light view's axes in world space
uniform vec3 lightUp;
varying float vEnergy;

void main() {
  vec2 uv = position.xy + jitter / gridSize;   // a different offset inside the grid cell for every light sample
  vec4 hitPoint = texture2D(tPosition, uv);
  if (hitPoint.a < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vEnergy = 0.0;
    return;
  }
  // The position map is a lattice of texels; move the entry point to this photon's own place in the light plane
  // so the photons do not all land on that lattice.
  vec2 texel = (floor(uv * lightRes) + 0.5) / lightRes;
  vec2 offset = (uv - texel) * lightSize;
  vec3 entry = hitPoint.xyz + lightRight * offset.x + lightUp * offset.y;
  vec3 N = normalize(texture2D(tNormal, uv).xyz);
  float cosI = clamp(dot(N, -incident), 0.0, 1.0);
  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosI, 5.0);

  vec3 direction = incident;
  direction.y = min(direction.y, -0.05);
  vec3 landing = entry + direction * max((groundY - entry.y) / direction.y, 0.0);

  vec3 absorb = pow(max(tint, vec3(0.001)), vec3(density * path));
  vEnergy = weight * (1.0 - fresnel) * dot(absorb, vec3(0.3333));
  gl_Position = projectionMatrix * viewMatrix * vec4(landing, 1.0);
  gl_PointSize = pointSize;
}
