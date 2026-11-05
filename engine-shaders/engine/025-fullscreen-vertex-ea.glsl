// Fullscreen vertex (Ea)
// group: Shared snippets   stage: shared snippet
// role: vUv pass-through used by most screen passes
// owner (minified): Ea
// source: bundle-0.8.0.mjs, character offset 1262180 (original minified file on branch main)

varying vec2 vUv;
void main() {
	vUv=uv;
	gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
