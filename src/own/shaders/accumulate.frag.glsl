// Progressive accumulation: running average of jittered frames.
// result = mix(history, newFrame, 1 / frameCount)
varying vec2 vUv;
uniform sampler2D tHistory;
uniform sampler2D tFrame;
uniform float weight; // 1 / (number of frames averaged including this one)
// The engine stores HDR colour in 8-bit RGBM with range 16, so no channel can exceed 16.
// Doing the same keeps the extremely bright diamond flashes from blowing up the average.
const float MAX_RADIANCE = 16.0;
void main() {
  vec4 frame = texture2D(tFrame, vUv);
  frame.rgb = min(frame.rgb, vec3(MAX_RADIANCE));
  gl_FragColor = mix(texture2D(tHistory, vUv), frame, weight);
}
