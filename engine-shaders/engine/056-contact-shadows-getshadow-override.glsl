// Contact shadows: getShadow override
// group: Screen-space effects   stage: fragment injection
// role: SSContactShadows ($c): replaces Three's getShadow with a screen-space ray
// owner (minified): s
// source: bundle-0.8.0.mjs, character offset 1446969 (original minified file on branch main)
// note: This is a fragment, not a whole program: it is spliced into a larger function of Three's shader, so its braces do not balance.

#ifndef D_sceneBoundingRadius
#define D_sceneBoundingRadius
uniform float sceneBoundingRadius;
#endif
float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, vec3 lightDirection )  {
	vec3 ray_origin_view = -vViewPosition;
	float rnd = interleavedGradientNoise(gl_FragCoord.xy, frameCount+34.);
	float cameraDist = length(cameraPositionWorld);
	//                    float radius = mix((cameraNearFar.y) + ray_origin_view.z, -ray_origin_view.z - cameraNearFar.x, rnd * 0.5 + 0.5)*sscsRadius;
	float radius = mix((cameraDist + sceneBoundingRadius) + ray_origin_view.z, -ray_origin_view.z - max(0.0, cameraDist - sceneBoundingRadius), rnd * 0.5 + 0.5)*sscsRadius;
	vec3 state = vec3(1.,(rnd+0.5)/float(SSCS_STEP_COUNT),2.);
	traceRay(ray_origin_view, normalize(lightDirection) * radius, sscsTolerance * radius * 2., state, SSCS_STEP_COUNT);
	state.z = state.z > 0.99 ? 1. : max(0.,min(state.z * state.z * (1.-sscsIntensity), 1.));
#if defined(SSCS_DEBUG) && SSCS_DEBUG > 0
	return state.z;
#endif
