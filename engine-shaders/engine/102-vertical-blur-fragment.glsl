// Vertical blur fragment
// group: Ground, background & shadows   stage: fragment
// owner (minified): _E
// source: bundle-0.8.0.mjs, character offset 2145572 (original minified file on branch main)

uniform sampler2D tDiffuse;
uniform float v;
varying vec2 vUv;
void main()  {
	vec4 sum = vec4( 0.0 );
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 4.0 * v ) ) * 0.051;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 3.0 * v ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 2.0 * v ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 1.0 * v ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 1.0 * v ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 2.0 * v ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 3.0 * v ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 4.0 * v ) ) * 0.051;
	gl_FragColor = sum;
}
