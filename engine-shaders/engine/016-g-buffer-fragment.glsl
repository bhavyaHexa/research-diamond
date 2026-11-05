// G-buffer fragment
// group: G-buffer   stage: fragment
// role: packs linear depth + normal + flags into 2 RGBA8 targets
// owner (minified): Pt
// source: bundle-0.8.0.mjs, character offset 1065409 (original minified file on branch main)

#ifdef USE_ALPHAMAP
#define USE_UV
#include <packing>
uniform float alphaTest;
#endif
#if IS_GLSL3 > 0
#ifndef gl_FragColor
layout(location=0)out vec4 A;
layout(location=1)out vec4 B;
#endif
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <alphamap_pars_fragment>
uniform vec2 cameraNearFar;
uniform vec4 flags;
#if IS_GLSL3 > 0
in vec3 vViewPosition;
#else
varying vec3 vViewPosition;
#endif
vec2 pack16(float value) {
	float f=clamp(value,0.,1.)*255.;
	float digitLow=fract(f);
	float digitHigh=floor(f)/255.;
	return vec2(digitHigh,digitLow);
}
vec2 packNormal(vec3 n) {
	float p=sqrt(n.z*8.+8.);
	return vec2(n.xy/p+0.5);
}
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
void main() {
#glMarker mainStart
#ifdef USE_ALPHAMAP
#ifdef ALPHA_I_RGBA_PACKING
	if(1.-unpackRGBAToDepth(texture2D(alphaMap,vAlphaMapUv))<alphaTest)
#else
	if(texture2D(alphaMap,vAlphaMapUv).g<alphaTest)
#endif
	discard;
#endif
#include <normal_fragment_begin>
#ifdef FORCED_LINEAR_DEPTH
	float linearZ=float(FORCED_LINEAR_DEPTH);
#else
	float linearZ=linstep(-cameraNearFar.x,-cameraNearFar.y,-vViewPosition.z);
#endif
	vec2 packedZ=pack16(pow(linearZ,0.5));
	vec2 packedNormal=packNormal(normal);
#if IS_GLSL3 > 0
#ifndef gl_FragColor
	A=vec4(packedZ.x,packedZ.y,packedNormal.x,packedNormal.y);
	B=flags;
#else
	gl_FragColor=vec4(packedZ.x,packedZ.y,packedNormal.x,packedNormal.y);
#endif
#else
	gl_FragColor=vec4(packedZ.x,packedZ.y,packedNormal.x,packedNormal.y);
#endif
}
