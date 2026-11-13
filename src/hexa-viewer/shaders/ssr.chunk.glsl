// Screen-space reflections, inlined into the metal shader after its environment specular.
//
// One mirror ray per pixel. The ray is marched in screen space against the depth pre-pass
// (even steps across the frame, not even steps in view distance). A hit reads the previous
// accumulated frame and replaces the environment specular. Accumulation smooths the noise.
uniform sampler2D tSsrDepth;     // r = view distance (positive), a = covered
uniform sampler2D tSsrHistory;   // previous accumulated frame (premultiplied by coverage)
uniform mat4 ssrProjection;      // the jittered camera projection
uniform vec2 ssrResolution;
uniform float ssrFrame;
uniform float ssrDebug;          // 1: show hit probability instead of reflections (tuning only)
uniform vec2 ssrDepthRange;      // near / far the engine normalises depth with (camera distance -/+ 1.5 x scene radius)
uniform float ssrPower;          // exponent applied to the colour found by a hit
uniform float ssrRayLength;      // scene bounding radius; the march length is derived from it
uniform float ssrTolerance;
uniform float ssrIntensity;
uniform float ssrMaskFront;
uniform sampler2D tAo;

// Interleaved gradient noise, the engine's per-pixel random source.
float ssrNoise(vec2 fragCoord, float seed) {
  return fract(52.9829189 * fract(dot(fragCoord + seed * vec2(2.083, 4.867), vec2(0.06711056, 0.00583715))));
}

// Random direction around the mirror direction, spread by roughness (GGX half-vector sampling).
vec3 ssrReflectionDirection(vec3 N, vec3 V, float rough) {
  float e1 = ssrNoise(gl_FragCoord.xy, ssrFrame * 117.0);
  vec2 E = vec2(e1, mix(fract(e1 * 38.65435), 1.0, 0.7));
  float rough4 = rough * rough * rough * rough;
  float phi = 6.283185307179586 * E.x;
  float cosTheta = pow(max(E.y, 0.000001), rough4 / (2.0 - rough4));
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  vec3 H = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
  vec3 tangentX = normalize(cross(abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), N));
  vec3 tangentY = cross(N, tangentX);
  H = H.x * tangentX + H.y * tangentY + H.z * N;
  return normalize(2.0 * dot(V, H) * H - V);
}

// Screen point as (uv, viewZ / clipW, 1 / clipW). Dividing z by w recovers view Z,
// and interpolating this form keeps the ray straight on screen.
vec4 ssrProject(vec3 viewPos) {
  vec4 clip = ssrProjection * vec4(viewPos, 1.0);
  float invW = 1.0 / clip.w;
  return vec4((clip.xy * invW) * 0.5 + 0.5, viewPos.z * invW, invW);
}

// Pull the ray end back to the frame so samples stay on the depth buffer.
vec4 ssrClipToFrame(vec4 start, vec4 end) {
  vec2 clamped = clamp(end.xy, 0.0, 1.0);
  vec2 past = abs(end.xy - clamped);
  vec2 grow = step(0.01, past) * past / (abs(clamped - start.xy) + 0.01) + 1.0;
  float fit = 1.0 / min(max(grow.x, grow.y), 10.0);
  vec4 step = end - start;
  step.xyw *= fit;
  return step;
}

// The engine stores depth as sqrt(normalised depth) in a LINEAR-filtered 8-bit target, so every lookup
// between texel centres blends neighbouring depths (silhouettes become ramps, which catches more
// hits on thin parts such as prongs). Reproduce that: bilinear blend of sqrt(normalised depth).
float ssrPackedDepth(ivec2 p) {
  ivec2 size = textureSize(tSsrDepth, 0);
  vec4 t = texelFetch(tSsrDepth, clamp(p, ivec2(0), size - 1), 0);
  return t.a < 0.5 ? 1.0 : sqrt(clamp((t.r - ssrDepthRange.x) / (ssrDepthRange.y - ssrDepthRange.x), 0.0, 1.0));
}
float ssrSceneZ(vec2 uv) {
  vec2 f = uv * vec2(textureSize(tSsrDepth, 0)) - 0.5;
  ivec2 i = ivec2(floor(f));
  vec2 w = fract(f);
  float x = mix(mix(ssrPackedDepth(i), ssrPackedDepth(i + ivec2(1, 0)), w.x),
                mix(ssrPackedDepth(i + ivec2(0, 1)), ssrPackedDepth(i + ivec2(1, 1)), w.x), w.y);
  float depth = x * x;
  return depth > 0.999 ? -ssrDepthRange.y * 1000.0 : -mix(ssrDepthRange.x, ssrDepthRange.y, depth);
}

// rgb = hit colour, a = 1 when the ray meets a surface.
vec4 ssrTrace(vec3 viewPos, vec3 dir, float rayLen) {
  const int STEPS = 16;
  vec4 start = ssrProject(viewPos);
  vec4 step = ssrClipToFrame(start, ssrProject(viewPos + dir * rayLen));
  float jitter = ssrNoise(gl_FragCoord.xy, ssrFrame + 8.0);
  float thickness = ssrTolerance * rayLen * 0.125;
  float t = (jitter + 0.5) / float(STEPS);
  float dt = 1.0 / float(STEPS);
  float previous = 0.0;
  float hitT = 2.0;               // 2 = no hit yet (a hit can legitimately land at t < 0, see below)

  for (int i = 0; i < STEPS; i++) {
    vec4 samplePos = start + step * t;
    vec2 uv = samplePos.xy;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;

    float sceneZ = ssrSceneZ(uv);
    float delta = samplePos.z / samplePos.w - sceneZ;
    // The ray has just passed the surface when delta is a small negative view-Z gap.
    if (abs(delta + thickness) < thickness) {
      float between = clamp(previous / (previous - delta), 0.0, 1.0) - 1.0;
      hitT = t + between * dt;       // may be slightly negative: the ray starts inside the thickness band
      break;
    }
    previous = delta;
    t += dt;
  }

  // The engine accepts any hit with t < 0.99, including negative ones (the surface itself, hit on the first step).
  if (hitT >= 0.99) return vec4(0.0);
  vec2 hitUv = (start + step * hitT).xy;
  vec4 history = texture2D(tSsrHistory, clamp(hitUv, 0.0, 1.0));
  // Uncovered texels are the white page. Covered texels already hold linear scene colour.
  vec3 colour = history.rgb + (1.0 - clamp(history.a, 0.0, 1.0)) * vec3(1.0);
  return vec4(pow(max(colour, vec3(0.0)), vec3(ssrPower)), 1.0);
}

// `indirect` is the environment specular after the metal BRDF. A hit replaces it with
// the same BRDF times the hit colour, clamped at 1, which is how the engine keeps
// reflections of sparkles from exceeding the metal colour.
vec3 ssrApply(vec3 indirect, vec3 viewPos, vec3 normal, vec3 toCamera, float roughness, vec3 fresnel0, float fresnel90) {
  float weight = (1.0 - clamp(0.3 * roughness, 0.0, 1.0)) * ssrIntensity;
  // The engine's mask: surfaces facing the camera reflect rays that point back at it, so SSR fades
  // in only toward grazing angles (dot(toCamera, normal) below about 0.95).
  weight *= clamp(-4.0 * dot(toCamera, normal) + (4.0 + ssrMaskFront), 0.0, 1.0);
  vec2 uv = gl_FragCoord.xy / ssrResolution;
  vec2 edge = min(uv, 1.0 - uv);
  float dist = min(edge.x, edge.y);
  weight *= pow(clamp(dist * dist / 0.101, 0.0, 1.0), 0.3);
  if (weight < 0.01 || roughness > 0.9) return ssrDebug > 0.5 ? vec3(0.0) : indirect;

  vec3 dir = ssrReflectionDirection(normal, toCamera, roughness);
  float cameraDist = length(cameraPosition);
  float bound = ssrRayLength;
  // Rays aimed at the camera get a shorter march; rays aimed into the scene get a longer one.
  float rayLen = mix(
    cameraDist + bound + viewPos.z,
    -viewPos.z - max(cameraDist - bound, 0.0),
    dir.z * 0.5 + 0.5
  );
  vec3 origin = viewPos + normal * max(0.0001 * -viewPos.z, 0.001);
  vec4 hit = ssrTrace(origin, dir, max(rayLen, 0.001));
  if (ssrDebug > 0.5) return vec3(hit.a * weight);
  vec3 brdf = EnvironmentBRDF(normal, toCamera, fresnel0, fresnel90, roughness);
  vec3 reflected = min(brdf * hit.rgb, vec3(1.0));
  return mix(indirect, reflected, hit.a * weight);
}
