// SSAO fragment
// group: Screen-space effects   stage: fragment
// role: class Ta (SSAO plugin Ia): SAO-style ambient occlusion
// owner (minified): Ta
// source: bundle-0.8.0.mjs, character offset 1264074 (original minified file on branch main)
// note: The placeholder `${i}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#include <common>
#include <packing>
varying vec2 vUv;
uniform vec2 cameraNearFar;
uniform mat4 projection;
uniform sampler2D tLastThis;
uniform vec4 saoData;
uniform vec3 saoBiasEpsilon;
uniform vec2 screenSize;
const float INV_NUM_SAMPLES=1./float(NUM_SAMPLES);
float getSelectionBit(in float number) {
	return mod(floor(number/pow(2.,2.)),2.);
}
float getViewZFromNDCZ(const in float depth) {
#if PERSPECTIVE_CAMERA == 1
	return perspectiveDepthToViewZ(depth,cameraNearFar.x,cameraNearFar.y);
#else
	return orthographicDepthToViewZ(depth,cameraNearFar.x,cameraNearFar.y);
#endif
}
vec3 packFloatToRGB(const in float x) {
	const vec3 code=vec3(1.,255.,65025.);
	vec3 pack=vec3(code*x);
	pack.gb=fract(pack.gb);
	pack.rg-=pack.gb*(1./256.);
	return pack;
}
vec3 getViewPositionFromViewZ(const in vec2 uv,const in float viewDepth) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewDepth/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewDepth/projection[1][1];
	return vec3(xe,ye,viewDepth);
}
float decodeDepth(const in vec2 uv) {
	vec4 uncodedDepth;
#if DEPTH_PACKING_MODE == 2
	uncodedDepth=texture2D(tNormalDepth,uv);
#else
	uncodedDepth=texture2D(tDepth,uv);
#endif
#if DEPTH_PACKING_MODE == 0
	return uncodedDepth.x;
#elif DEPTH_PACKING_MODE == 1
#if LINEAR_DEPTH == 1
	return pow2(unpackRGBAToDepth(uncodedDepth));
#else
	return unpackRGBAToDepth(uncodedDepth);
#endif
#else
	return pow2(unpack16(uncodedDepth.xy));
#endif
}
vec3 getPositionFromOffset(const in vec2 uv,const in vec2 offset,const in float screenSpaceRadius) {
	vec2 uvOffset=uv+floor(screenSpaceRadius*offset)/screenSize;
	float d=decodeDepth(uvOffset);
#if LINEAR_DEPTH == 0
	float centerViewZ=getViewZFromNDCZ(d);
	return getViewPositionFromViewZ(uvOffset,centerViewZ);
#else
	d=mix(-cameraNearFar.x,-cameraNearFar.y,d);
	return getViewPositionFromViewZ(uvOffset,d);
#endif
}
float getOcclusion(const in vec2 uv,const in int id,const in float randomAngle,const in float occlusionSphereRadius,const in vec3 centerPosition,const in vec3 centerNormal) {
	float screenSpaceRadius=(float(id)+mod(randomAngle,1.)+0.5)*INV_NUM_SAMPLES;
	float angle=screenSpaceRadius*(float(NUM_SPIRAL_TURNS)*6.28)+randomAngle;
	screenSpaceRadius=(screenSpaceRadius*occlusionSphereRadius);
	vec2 offset=vec2(cos(angle),sin(angle));
	vec3 samplePosition=getPositionFromOffset(uv,offset,screenSpaceRadius);
	vec3 direction=samplePosition-centerPosition;
	float d2=dot(direction,direction);
	float ao=max((dot(centerNormal,direction)+centerPosition.z*saoBiasEpsilon.x)/(saoBiasEpsilon.z*d2+saoBiasEpsilon.y),0.);
	return ao;
}
void main() {
	float centerDepth;
	vec3 centerNormal;
	getDepthNormal(vUv,centerDepth,centerNormal);
#if LINEAR_DEPTH == 0
	float centerViewZ=getViewZFromNDCZ(centerDepth);
#else
	float centerViewZ=mix(-cameraNearFar.x,-cameraNearFar.y,centerDepth);
#endif
	vec3 centerPosition=getViewPositionFromViewZ(vUv,centerViewZ);
	float occlusionSphereScreenRadius=200.*saoData.z/(-centerPosition.z);
	float randomAngle=6.2*random3(vec3(vUv,frameCount*0.1));
	float sum=0.;
	sum+=getOcclusion(vUv,0,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#if NUM_SAMPLES > 1
	sum+=getOcclusion(vUv,1,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 2
	sum+=getOcclusion(vUv,2,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 3
	sum+=getOcclusion(vUv,3,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 4
	sum+=getOcclusion(vUv,4,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 5
	sum+=getOcclusion(vUv,5,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 6
	sum+=getOcclusion(vUv,6,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 7
	sum+=getOcclusion(vUv,7,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 8
	sum+=getOcclusion(vUv,8,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 9
	sum+=getOcclusion(vUv,9,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 10
	sum+=getOcclusion(vUv,10,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
	float aoValue=sum*saoData.y*INV_NUM_SAMPLES;
	bool disableAO=getSelectionBit(getGBufferFlags(vUv).a*255.)>0.001?true:false;
	aoValue=clamp(1.-max(aoValue,0.),0.,1.);
	gl_FragColor.gba=packFloatToRGB(centerDepth);
	gl_FragColor.r=(vec4(aoValue)).r;
}
