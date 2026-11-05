// SSGI fragment
// group: Screen-space effects   stage: fragment
// role: class _c (SSGI plugin gc; disabled in this scene)
// owner (minified): _c
// source: bundle-0.8.0.mjs, character offset 1388353 (original minified file on branch main)
// note: The placeholder `${i}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

#ifndef BASIC_HELPERS
#define BASIC_HELPERS
float saturate2(float v,float mx) {
	return max(0.,min(mx,v));
}
vec3 saturate2(vec3 v) {
	return max(vec3(0.),min(vec3(1.),v));
}
#endif
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
#define PI  3.141592653589793
mat3 GetTangentBasis(vec3 TangentZ) {
	vec3 up=vec3(0.,0.,1.);
	vec3 TangentX=normalize(cross(dot(TangentZ,up)<0.8?up:vec3(1.,0.,0.),TangentZ));
	vec3 TangentY=cross(TangentZ,TangentX);
	return mat3(TangentX,TangentY,TangentZ);
}
vec4 CosineSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=sqrt(E.y);
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=CosTheta*(1./PI);
	return vec4(H,PDF);
}
vec4 UniformSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=E.y;
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=1./(2.*PI);
	return vec4(H,PDF);
}
vec2 UniformSampleDiskConcentric(vec2 E) {
	vec2 p=2.*E-1.;
	float Radius;
	float Phi;
	if(abs(p.x)>abs(p.y)) {
		Radius=p.x;
		Phi=(PI/4.)*(p.y/p.x);
	} else {
		Radius=p.y;
		Phi=(PI/2.)-(PI/4.)*(p.x/p.y);
	}
	return vec2(Radius*cos(Phi),Radius*sin(Phi));
}
vec2 UniformSampleDiskConcentricApprox(vec2 E) {
	vec2 sf=E*sqrt(2.)-sqrt(0.5);
	vec2 sq=sf*sf;
	float root=sqrt(2.*max(sq.x,sq.y)-min(sq.x,sq.y));
	if(sq.x>sq.y) {
		sf.x=sf.x>0.?root:-root;
	} else {
		sf.y=sf.y>0.?root:-root;
	}
	return sf;
}
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
#ifndef SSRT_PARS_SNIP
#define SSRT_PARS_SNIP
#define pow2(a)a*a
float getDepth2(const in vec2 uv,const in float lod) {
	float viewDepth=getDepth(uv);
	return depthToViewZ(viewDepth);
}
#define LOD_DEPTH  1.0
#define LOD_COLOR  5.0
void _traceRay(in vec4 ray_origin,in vec4 ray_dir,in float tolerance,inout vec3 state,in int loopMax,in float iStepCount) {
	vec4 sample_uv;
	float d,hit;
	float dLod=0.;
#pragma unroll_loop_start
	for(int i=0;i<8;i++) {
		if(UNROLLED_LOOP_INDEX<loopMax) {
			sample_uv=ray_origin+ray_dir*state.y;
			d=getDepth2(sample_uv.xy,dLod);
			d=sample_uv.z/sample_uv.w-d;
			if(abs(d+tolerance)<tolerance) {
				hit=clamp(state.x/(state.x-d),0.,1.)-1.;
				hit=(state.y+hit*iStepCount);
				state.z=min(state.z,hit);
			}
			state.x=d;
			state.y+=1.*iStepCount;
		}
	}
#pragma unroll_loop_end
}
vec3 traceRay(in vec3 ray_origin_view,in vec3 ray_dir_view,in float tolerance,inout vec3 state,in int _STEP_COUNT) {
	vec4 sample_uv;
	vec4 ray_origin=viewToScreen3(ray_origin_view);
	vec3 ray_end_view=ray_origin_view+ray_dir_view;
	vec4 ray_dir=viewToScreen3(ray_end_view);
	vec2 clamp_end=clamp(ray_dir.xy,vec2(0.),vec2(1.));
	vec2 correction=abs(ray_dir.xy-clamp_end);
	correction=(step(0.01,correction)*correction/(abs(clamp_end-ray_origin.xy)+0.01))+1.;
	correction.x=1./min(max(correction.y,correction.x),10.);
	ray_dir=ray_dir-ray_origin;
	ray_dir.xyw*=correction.x;
	float iStepCount=1./float(_STEP_COUNT);
	tolerance*=0.125;
	_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT,iStepCount);
	if(_STEP_COUNT>8&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-8,iStepCount);
	if(_STEP_COUNT>15&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	if(_STEP_COUNT>23&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	sample_uv=ray_origin+ray_dir*state.z;
	sample_uv.z/=sample_uv.w;
	state.z=state.z<0.999?state.z:9999999.;
	return sample_uv.xyz;
}
#endif
varying vec2 vUv;
uniform float frameCount2;
uniform float intensity;
uniform float objectRadius;
uniform float rayCount;
uniform float power;
uniform float bias;
uniform float falloff;
uniform float tolerance;
uniform bool autoRadius;
uniform vec2 screenSize;
vec3 ComputeUniformL(vec3 N,vec2 E) {
	vec3 L;
	L.xy=E;
	L.z=interleavedGradientNoise(gl_FragCoord.xy,frameCount2*5.);
	L=L*2.-1.;
	return L;
}
vec2 GetRandomE(float seed) {
	vec2 rand_e;
	rand_e.x=random3(vec3(gl_FragCoord.xy,frameCount2+seed));
	rand_e.y=random3(vec3(gl_FragCoord.yx,rand_e.x+(frameCount2)*7.));
	return rand_e;
}
vec4 calculateGI(in float seed,in vec3 screenPos,in vec3 normal,in float radiusFactor) {
	vec3 viewPos=screenToView(screenPos.xy,screenPos.z);
	normal=normalize(normal);
	vec2 E=GetRandomE(seed);
	vec3 L=ComputeUniformL(normal,E);
	L=normalize(L);
	L*=sign(dot(L,normal));
	float cameraDist=length(cameraPositionWorld);
	float rayLen=autoRadius?length(viewPos-screenToView(screenPos.xy+objectRadius/10.,screenPos.z)):mix((cameraNearFar.y)+viewPos.z,-viewPos.z-cameraNearFar.x,L.z*0.5+0.5)*objectRadius;
	rayLen*=radiusFactor;
	float r=interleavedGradientNoise(gl_FragCoord.xy,frameCount2*14.+seed)+0.05;
	rayLen=max(rayLen,0.001);
	vec3 state=vec3(1.,(r+0.5)/float(RTAO_STEP_COUNT),2.);
	viewPos+=normal*max(-0.01*viewPos.z,0.001);
	vec3 screenHitP=traceRay(viewPos,L*rayLen,tolerance*rayLen,state,RTAO_STEP_COUNT);
	vec3 viewHitP=screenToView(screenHitP.xy,screenHitP.z);
	vec3 LRes=viewHitP-viewPos;
	if(state.z>1.)LRes=vec3(9999999.);
	float dist=length(LRes)*falloff;
	float EPS=0.01;
	float zBias=(viewPos.z)*bias;
	float ao=(max(dot(normal,L)+zBias,0.))/(dist*dist+EPS);
#if defined(SSGI_ENABLED) && SSGI_ENABLED > 0
	vec3 hitColor=tLastFrameTexelToLinear(texture2D(tLastFrame,screenHitP.xy)).rgb;
	vec3 hitNormal=getViewNormal(screenHitP.xy);
	float giWeight=1.;
	giWeight=saturate2(giWeight/(dist+EPS),1.);
	giWeight*=saturate2((dot(normal,L)),1.);
	giWeight*=saturate2((dot(hitNormal,-L)),1.);
	return vec4(hitColor*giWeight,ao);
#endif
	return vec4(0,0,0,ao);
}
float normpdf(in float x,in float sigma) {
	return exp(-0.5*x*x/(sigma*sigma));
}
vec4 getLastThis(sampler2D tex,float depth,vec3 normal) {
	vec2 direction=vec2(1,1);
	vec4 color=clamp(tLastThisTexelToLinear(texture2D(tex,vUv.xy)),0.,5.);
	return color;
}
void main() {
	float depth;
	vec3 normal;
	getDepthNormal(vUv,depth,normal);
	if(depth>0.99) {
		discard;
		gl_FragColor=getLastThis(tLastThis,depth,normal);
		return;
	}
	float viewZ=depthToViewZ(depth);
	vec3 screenPos=vec3(vUv.x,vUv.y,viewZ);
	vec4 gi=vec4(0.);
	gi+=calculateGI(8.,screenPos,normal,1.);
	if(rayCount>1.5)gi=max(gi,calculateGI(2.,screenPos,normal,0.4));
	if(rayCount>2.5)gi=max(gi,calculateGI(3.,screenPos,normal,1.5));
	if(rayCount>3.5)gi=max(gi,calculateGI(1.,screenPos,normal,0.6));
	if(rayCount>4.5)gi=max(gi,calculateGI(3.,screenPos,normal,1.));
	gi.a=min(1.,gi.a);
	gi.a=max(0.,gi.a);
	gi.rgb=min(vec3(3.),gi.rgb);
	gi.rgb=max(vec3(0.),gi.rgb);
	if(frameCount2<3.) {
		gl_FragColor=gi;
		return;
	}
	gl_FragColor=(texture2D(tLastThis,vUv));
	gl_FragColor=((gi+(gl_FragColor)*frameCount2)/(frameCount2+1.));
}
