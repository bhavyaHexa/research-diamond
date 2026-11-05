// ShaderMaterial default vertex shader
// group: Three.js internals   stage: vertex
// role: fallback used when a ShaderMaterial has no vertex shader
// owner (minified): ks / __webpackgi_modules__
// source: bundle-0.8.0.mjs, character offset 397766 (original minified file on branch main)

void main()  {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
