// CopyShader vertex
// group: Frame & pass infrastructure   stage: vertex
// role: EffectComposer copy pass
// owner (minified): n
// source: bundle-0.8.0.mjs, character offset 955089 (original minified file on branch main)

varying vec2 vUv;
void main()  {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
