// SSR core: ray march + GGX ray sampling (Bc)
// group: Screen-space effects   stage: shared snippet
// role: inlined into both the SSR pass and standard materials
// owner (minified): Bc
// source: bundle-0.8.0.mjs, character offset 1409272 (original minified file on branch main)

uniform float objectRadius;
uniform float radius;
uniform float tolerance;
uniform bool autoRadius;
#ifndef D_sceneBoundingRadius
#define D_sceneBoundingRadius
uniform float sceneBoundingRadius;
#endif
vec3 ComputeReflectionL(vec3 N,vec2 E,vec3 V,float rough) {
	float rough4=rough*rough*rough*rough;
	float phi=2.*PI*E.x;
	float cos_theta=pow(max(E.y,0.000001),rough4/(2.-rough4));
	float sin_theta=sqrt(max(0.,1.-cos_theta*cos_theta));
	vec3 half_vec=vec3(sin_theta*cos(phi),sin_theta*sin(phi),cos_theta);
	vec3 tangentX=normalize(cross(abs(N.z)<0.999?vec3(0.,0.,1.):vec3(1.,0.,0.),N));
	vec3 tangentY=cross(N,tangentX);
	half_vec=half_vec.x*tangentX+half_vec.y*tangentY+half_vec.z*N;
	vec3 ray_dir=(2.*dot(V,half_vec))*half_vec-V;
	return ray_dir;
}
vec2 GetRandomE(float seed) {
	vec2 rand_e;
	rand_e.x=interleavedGradientNoise(gl_FragCoord.xy,frameCount*117.);
	rand_e.y=fract(rand_e.x*38.65435);
	rand_e.y=mix(rand_e.y,1.,0.7);
	return rand_e;
}
vec4 calculateSSR(in float seed,in vec3 screenPos,in vec3 normal,in float radiusFactor,in float roughness) {
	vec3 viewPos=screenToView(screenPos.xy,screenPos.z);
	normal=normalize(normal);
	vec2 E=GetRandomE(seed);
	vec3 L=ComputeReflectionL(normal,E,-normalize(viewPos),roughness);
	L=normalize(L);
	float cameraDist=length(cameraPositionWorld);
	float rayLen=autoRadius?mix((cameraDist+objectRadius*sceneBoundingRadius)+viewPos.z,-viewPos.z-max(0.,cameraDist-objectRadius*sceneBoundingRadius),L.z*0.5+0.5):objectRadius*sceneBoundingRadius;
	rayLen*=radiusFactor;
	float r=interleavedGradientNoise(gl_FragCoord.xy,frameCount+seed);
	rayLen=max(rayLen,0.001);
	int steps=SSR_STEP_COUNT/(frameCount<float(SSR_LOW_QUALITY_FRAMES)?2:1);
	vec3 state=vec3(0.,(r+0.5)/float(steps),2.);
	viewPos+=normal*max(-0.0001*viewPos.z,0.001);
	vec3 screenHitP=traceRay(viewPos,L*rayLen,tolerance*rayLen,state,steps);
	if(state.z<0.99) {
		vec3 hitColor=(tLastFrameTexelToLinear(texture2D(tLastFrame,screenHitP.xy))).rgb;
		float ssrWeight=1.;
		return vec4(hitColor*ssrWeight,1.);
	}
	return vec4(0.);
}
