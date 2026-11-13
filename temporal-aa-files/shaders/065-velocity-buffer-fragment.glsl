// Velocity buffer fragment
// group: Screen-space effects   stage: fragment
// role: per-pixel motion vectors for TAA
// owner (minified): Dp
// source: bundle-0.8.0.mjs, character offset 1525291 (original minified file on branch main)

varying vec3 vWorldPosition;
varying vec3 vWorldPositionPrevious;
uniform mat4 currentProjectionViewMatrix;
uniform mat4 lastProjectionViewMatrix;
vec2 computeScreenSpaceVelocity2() {
	vec4 currentPositionClip=currentProjectionViewMatrix*vec4(vWorldPosition,1.);
	vec4 prevPositionClip=lastProjectionViewMatrix*vec4(vWorldPositionPrevious,1.);
	vec2 currentPositionNDC=currentPositionClip.xy/currentPositionClip.w;
	vec2 prevPositionNDC=prevPositionClip.xy/prevPositionClip.w;
	if(prevPositionNDC.x>=1.||prevPositionNDC.x<=-1.||prevPositionNDC.x>=1.||prevPositionNDC.y<=-1.) {
		return vec2(0.);
	}
	return 0.5*(currentPositionNDC-prevPositionNDC);
}
void main() {
	vec2 velocity=clamp(computeScreenSpaceVelocity2(),-1.,1.);
	velocity=sign(velocity)*pow(abs(velocity),vec2(1./4.));
	velocity=velocity*0.5+0.5;
	gl_FragColor=vec4(velocity.x,velocity.y,1.,1.);
}
