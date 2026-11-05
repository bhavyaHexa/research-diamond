// Horizontal blur fragment
// group: Ground, background & shadows   stage: fragment
// owner (minified): mE
// source: bundle-0.8.0.mjs, character offset 2144428 (original minified file on branch main)

uniform sampler2D tDiffuse;
uniform float h;
varying vec2 vUv;
void main()  {
	vec4 sum = vec4( 0.0 );
	sum += texture2D( tDiffuse, vec2( vUv.x - 4.0 * h, vUv.y ) ) * 0.051;
	sum += texture2D( tDiffuse, vec2( vUv.x - 3.0 * h, vUv.y ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x - 2.0 * h, vUv.y ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x - 1.0 * h, vUv.y ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
	sum += texture2D( tDiffuse, vec2( vUv.x + 1.0 * h, vUv.y ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x + 2.0 * h, vUv.y ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x + 3.0 * h, vUv.y ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x + 4.0 * h, vUv.y ) ) * 0.051;
	gl_FragColor = sum;
}
