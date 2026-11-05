// Basic camera helpers (pc)
// group: Shared snippets   stage: shared snippet
// role: view/projection conversions used by SSR/SSGI/SSCS
// owner (minified): pc
// source: bundle-0.8.0.mjs, character offset 1383527 (original minified file on branch main)

#ifndef BASIC_CAMERA_HELPERS
#define BASIC_CAMERA_HELPERS
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
uniform mat4 projection;
#ifndef THREE_PACKING_INCLUDED
#define THREE_PACKING_INCLUDED
#include <packing>
#endif
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
float depthToViewZ(const in float depth) {
	return(depth>0.999)?-cameraNearFar.y*1000.:-mix(cameraNearFar.x,cameraNearFar.y,depth);
}
float viewZToDepth(const in float viewZ) {
	return linstep(-cameraNearFar.x,-cameraNearFar.y,viewZ);
}
vec4 viewToScreen3(const in vec3 pos) {
	vec4 projected=projection*vec4(pos,1.);
	projected.z=pos.z;
	projected.w=1./projected.w;
	projected.xyz*=projected.w;
	projected.xy=0.5+0.5*projected.xy;
	return projected;
}
vec3 screenToView(const in vec2 uv,const in float viewZ) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewZ/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewZ/projection[1][1];
	return vec3(xe,ye,viewZ);
}
#endif
