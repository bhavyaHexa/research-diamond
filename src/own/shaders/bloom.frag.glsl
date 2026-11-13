// Bloom, one shader for every step (PASS_STEP):
//   0 prefilter + first down-sample   1 down-sample   2 up-sample (added to the level above)
varying vec2 vUv;
uniform sampler2D tSource;
uniform sampler2D tAdd;     // up-sample only: the larger level to add to
uniform vec2 texelSize;     // 1 / size of tSource
uniform vec4 prefilter;     // x threshold, y soft knee (0..1), z max, w scale
uniform float radius;       // weight of each upsampled level

vec4 boxSample(vec2 uv, float delta) {
  vec4 o = vec2(-delta, delta).xxyy * texelSize.xyxy;
  return 0.25 * (texture2D(tSource, uv + o.xy) + texture2D(tSource, uv + o.zy)
               + texture2D(tSource, uv + o.xw) + texture2D(tSource, uv + o.zw));
}

void main() {
#if PASS_STEP == 0
  vec4 c = boxSample(vUv, 1.0);
  float coverage = c.a;
  vec3 rgb = coverage > 0.001 ? c.rgb / coverage : vec3(0.0); // un-premultiply
  float brightness = max(rgb.r, max(rgb.g, rgb.b));
  float soft = clamp(brightness + prefilter.x * (prefilter.y - 1.0), 0.0, prefilter.z);
  soft = soft * soft * prefilter.w;
  float contribution = max(soft, brightness - prefilter.x) / max(brightness, 0.001);
  gl_FragColor = vec4(rgb * contribution * coverage, 1.0);
#elif PASS_STEP == 1
  gl_FragColor = vec4(boxSample(vUv, 1.0).rgb, 1.0);
#else
  gl_FragColor = vec4(texture2D(tAdd, vUv).rgb + boxSample(vUv, 0.5).rgb * radius, 1.0);
#endif
}
