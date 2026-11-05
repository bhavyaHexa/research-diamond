// Planar reflection: vertex injection
// group: Ground, background & shadows   stage: vertex injection
// role: class Dg
// owner (minified): Dg
// source: bundle-0.8.0.mjs, character offset 1802907 (original minified file on branch main)
// note: This is a fragment, not a whole program: it is spliced into a larger function of Three's shader, so its braces do not balance.

void main()  {
	vRefUv = refTextureMatrix * vec4( position, 1.0 );
