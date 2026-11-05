// PMREM cube→CubeUV fragment
// group: Three.js internals   stage: fragment
// role: converts a cube map into the CubeUV layout
// owner (minified): ga / __webpackgi_modules__
// source: bundle-0.8.0.mjs, character offset 576130 (original minified file on branch main)

precision mediump float;
precision mediump int;
uniform float flipEnvMap;
varying vec3 vOutputDirection;
uniform samplerCube envMap;
void main()  {
	gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );
}
