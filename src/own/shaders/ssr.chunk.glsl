// Screen-space reflections, inlined into the metal shader just before its indirect specular.
//
// For each pixel: one ray in the mirror direction, marched through the depth pre-pass. If it
// lands on something, the colour comes from the previous accumulated frame at that spot and
// replaces the environment reflection there. One noisy ray per frame; accumulation smooths it.
uniform sampler2D tSsrDepth;     // r = view distance, a = covered
uniform sampler2D tSsrHistory;   // previous accumulated frame (premultiplied by coverage)
uniform mat4 ssrProjection;      // the (jittered) camera projection matrix
uniform vec2 ssrResolution;
uniform float ssrFrame;
uniform float ssrRayLength;
uniform float ssrTolerance;
uniform float ssrIntensity;
uniform float ssrMaskFront;
uniform sampler2D tAo;           // ambient occlusion map (see ssao.ts)

float ssrNoise(vec2 p, float t) {
  return fract(52.9829189 * fract(dot(p + t * 5.588238, vec2(0.06711056, 0.00583715))));
}

vec2 ssrToScreen(vec3 viewPos) {
  vec4 clip = ssrProjection * vec4(viewPos, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}

// Returns rgb = colour at the hit, a = 1 on a hit.
vec4 ssrTrace(vec3 viewPos, vec3 dir, float rayLen) {
  const int STEPS = 16;
  float jitter = ssrNoise(gl_FragCoord.xy, ssrFrame);
  float thickness = ssrTolerance * rayLen * 0.125;
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + 0.5 + jitter) / float(STEPS);
    vec3 p = viewPos + dir * rayLen * t;
    if (p.z > -0.001) break;                         // behind the camera plane
    vec2 uv = ssrToScreen(p);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
    vec4 d = texture2D(tSsrDepth, uv);
    if (d.a < 0.5) continue;                         // nothing drawn here
    float delta = (-p.z) - d.r;                      // > 0: the ray is behind the surface
    if (delta > 0.0 && delta < thickness) {
      vec4 h = texture2D(tSsrHistory, uv);
      // The history holds colour premultiplied by coverage; where the ring is absent the page is white.
      vec3 colour = h.rgb + (1.0 - clamp(h.a, 0.0, 1.0)) * vec3(1.0);
      return vec4(colour, 1.0);
    }
  }
  return vec4(0.0);
}

// `reflectance` is the metal's specular colour S. The engine saturates S * hitColour, so a very
// bright hit (a stone's sparkle) can still reach full brightness; three.js multiplies by S later,
// so the hit is capped at 1 / S here to get the same result.
vec3 ssrApply(vec3 radiance, vec3 viewPos, vec3 normal, vec3 toCamera, float roughness, vec3 reflectance) {
  float a = (1.0 - clamp(0.3 * roughness, 0.0, 1.0)) * ssrIntensity;
  a *= clamp(-4.0 * dot(-toCamera, normal) + (4.0 + ssrMaskFront), 0.0, 1.0);
  vec2 uv = gl_FragCoord.xy / ssrResolution;
  vec2 edge = min(uv, 1.0 - uv);
  float dist = min(edge.x, edge.y);
  a *= pow(clamp(dist * dist / 0.101, 0.0, 1.0), 0.3);
  if (a < 0.01 || roughness > 0.9) return radiance;
  vec3 dir = reflect(-toCamera, normal);
  vec4 hit = ssrTrace(viewPos + normal * max(0.0001 * -viewPos.z, 0.001), normalize(dir), ssrRayLength);
  vec3 capped = min(hit.rgb, vec3(1.0) / max(reflectance, vec3(0.05)));
  return mix(radiance, capped, hit.a * a);
}
