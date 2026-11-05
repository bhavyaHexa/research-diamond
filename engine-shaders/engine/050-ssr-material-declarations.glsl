// SSR material declarations
// group: Screen-space effects   stage: fragment declarations
// role: uniforms read by the material-side SSR block
// owner (minified): ? / Oc
// source: bundle-0.8.0.mjs, character offset 1417125 (original minified file on branch main)

uniform float ssrPower;
uniform float ssrIntensity;
uniform float ssrMaskFrontFactor;
uniform vec3 ssrBoost;
uniform sampler2D tSSRMap;
uniform sampler2D tLastFrame;
