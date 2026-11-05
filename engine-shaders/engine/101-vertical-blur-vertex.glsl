// Vertical blur vertex
// group: Ground, background & shadows   stage: vertex
// role: Three VerticalBlurShader
// owner (minified): _E
// source: bundle-0.8.0.mjs, character offset 2145399 (original minified file on branch main)

varying vec2 vUv;
void main()  {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
