// Ambient occlusion (scalable ambient obscurance): 11 samples on a spiral around each pixel.
// A neighbour that sits in front of the surface's tangent plane, and close to it, occludes.
varying vec2 vUv;
uniform sampler2D tGBuffer;       // r = view distance, g/b = normal xy, a = covered
uniform mat4 projection;
uniform vec2 screenSize;
uniform float frame;
uniform float radius;             // occlusion radius in world units
uniform float intensity;
uniform vec3 biasEpsilonFalloff;  // x bias, y epsilon, z falloff
const int NUM_SAMPLES = 11;
const float SPIRAL_TURNS = 3.0;

float hash3(vec3 v) {
  v = fract(v * 443.8975);
  v += dot(v, v.yzx + 19.19);
  return fract((v.x + v.y) * v.z);
}

vec3 viewPosition(vec2 uv, float dist) {
  vec2 ndc = 2.0 * uv - 1.0;
  return vec3((ndc.x + projection[2][0]) * dist / projection[0][0],
              (ndc.y + projection[2][1]) * dist / projection[1][1], -dist);
}

vec3 viewNormal(vec2 xy) { return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }

void main() {
  vec4 g = texture2D(tGBuffer, vUv);
  if (g.a < 0.5) { gl_FragColor = vec4(1.0); return; }
  vec3 centre = viewPosition(vUv, g.r);
  vec3 normal = viewNormal(g.gb);
  float radiusPx = 200.0 * radius / (-centre.z);
  float angle0 = 6.2 * hash3(vec3(vUv, frame * 0.1));
  float sum = 0.0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    float s = (float(i) + mod(angle0, 1.0) + 0.5) / float(NUM_SAMPLES);
    float angle = s * (SPIRAL_TURNS * 6.28) + angle0;
    vec2 offset = vec2(cos(angle), sin(angle));
    vec2 uv = vUv + floor(s * radiusPx * offset) / screenSize;
    vec4 t = texture2D(tGBuffer, uv);
    if (t.a < 0.5) continue;
    vec3 d = viewPosition(uv, t.r) - centre;
    sum += max((dot(normal, d) + centre.z * biasEpsilonFalloff.x) / (biasEpsilonFalloff.z * dot(d, d) + biasEpsilonFalloff.y), 0.0);
  }
  float ao = clamp(1.0 - max(sum * intensity / float(NUM_SAMPLES), 0.0), 0.0, 1.0);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}
