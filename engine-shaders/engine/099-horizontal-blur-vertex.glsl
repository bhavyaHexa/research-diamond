// Horizontal blur vertex
// group: Ground, background & shadows   stage: vertex
// role: Three HorizontalBlurShader
// owner (minified): mE
// source: bundle-0.8.0.mjs, character offset 2144255 (original minified file on branch main)

varying vec2 vUv;
void main()  {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
