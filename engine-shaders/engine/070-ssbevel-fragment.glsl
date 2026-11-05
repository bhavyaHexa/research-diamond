// SSBevel fragment
// group: Screen-space effects   stage: fragment
// role: class lh (SSBevel plugin uh)
// owner (minified): ? / lh
// source: bundle-0.8.0.mjs, character offset 1575442 (original minified file on branch main)
// note: The placeholder `${i}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

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
uniform sampler2D tNormalBuffer;
uniform sampler2D edgeMaskBuffer;
uniform vec2 screenSize;
const float depthStep=0.02;
uniform vec2 samples[NUM_SAMPLES];
uniform vec3 cameraPositionWorld;
varying vec2 vUv;
#include <common>
float getBevelRadius(in float number) {
	return floor(number/8.);
}
vec3 smoothNormal() {
	vec2 uv=gl_FragCoord.xy/screenSize;
	vec4 texel=texture2D(tNormalDepth,uv);
	vec4 edgeMask=texture2D(edgeMaskBuffer,uv);
	vec3 avgNormal=2.*texture2D(tNormalBuffer,uv).rgb-1.;
	float depth=pow(unpack16(texel.xy),2.);
	vec2 invScreenSize=vec2(1.)/screenSize;
	vec4 mask=texture2D(tGBufferFlags,uv);
	float weightSum=0.;
	float radius=getBevelRadius(mask.g*255.)*2.;
	float randomAngle=6.2*random(frameCount*0.1);
	float theta=randomAngle;
	float snTheta=sin(theta);
	float csTheta=cos(theta);
	mat2 randomRotationMatrix=mat2(csTheta,snTheta,-snTheta,csTheta);
	float d_=dot(cameraPositionWorld,cameraPositionWorld);
	float radiusModifier=clamp(1./(1.+pow(d_,0.5)),0.,1.);
	for(int i=0;i<5;i++) {
		float x=float(i)-2.;
		for(int j=0;j<5;j++) {
			float y=float(j)-2.;
			vec2 offset=randomRotationMatrix*vec2(x,y)*radius*radiusModifier*invScreenSize;
			vec4 texel=texture2D(tNormalDepth,uv+offset);
			float offsetDepth=pow(unpack16(texel.xy),2.);
			float depthWeight=abs(offsetDepth-depth);
			depthWeight=(1.-step(depthStep,depthWeight));
			vec3 offsetNormal=2.*texture2D(tNormalBuffer,uv+offset).rgb-1.;
			if(dot(offsetNormal,offsetNormal)>0.) {
				avgNormal+=offsetNormal*depthWeight;
			}
		}
	}
	return normalize(avgNormal);
}
void main() {
	vec2 uv=gl_FragCoord.xy/screenSize;
	vec4 edgeMask=texture2D(edgeMaskBuffer,uv);
	vec3 normal=vec3(0.);
	if(edgeMask.x>0.) {
		normal=smoothNormal();
	} else {
		normal=2.*texture2D(tNormalBuffer,uv).rgb-1.;
	}
	gl_FragColor=vec4(vec3(0.5*normal+0.5),1.);
}
