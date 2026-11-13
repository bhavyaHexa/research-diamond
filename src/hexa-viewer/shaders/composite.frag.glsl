// Final pass: bloom add, tone mapping (ACES), contrast, saturation, sRGB encode,
// and the white page background where nothing was drawn.
varying vec2 vUv;
uniform sampler2D tScene;   // accumulated HDR frame, premultiplied by coverage in alpha
uniform sampler2D tBloom;
uniform float bloomIntensity;
uniform vec2 bloomTexel;    // 1 / size of the bloom texture
uniform float exposure;
uniform float contrast;
uniform float saturation;
uniform vec3 background;    // linear colour behind the ring

#include <tonemapping_pars_fragment>

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The glow gets one last 4-tap box blur on the way in.
vec3 bloomBox(vec2 uv) {
  vec4 o = vec2(-0.5, 0.5).xxyy * bloomTexel.xyxy;
  return 0.25 * (texture2D(tBloom, uv + o.xy).rgb + texture2D(tBloom, uv + o.zy).rgb
               + texture2D(tBloom, uv + o.xw).rgb + texture2D(tBloom, uv + o.zw).rgb);
}

void main() {
  vec4 s = texture2D(tScene, vUv);
  float coverage = clamp(s.a, 0.0, 1.0);
  vec3 hdr = coverage > 0.0001 ? s.rgb / coverage : vec3(0.0);
  hdr += bloomBox(vUv) * bloomIntensity / max(coverage, 0.0001);

  vec3 c = ACESFilmicToneMapping(hdr * exposure);
  c = (c - 0.5) * contrast + 0.5;
  c = mix(vec3(dot(c, vec3(0.2125, 0.7154, 0.0721))), c, saturation);

  vec3 outColor = mix(background, clamp(c, 0.0, 1.0), coverage);
  gl_FragColor = vec4(linearToSRGB(outColor), 1.0);
}
