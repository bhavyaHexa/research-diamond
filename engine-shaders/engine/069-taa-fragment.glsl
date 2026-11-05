// TAA fragment
// group: Screen-space effects   stage: fragment
// role: class Kp (TAA plugin Jp; pass disabled in this scene)
// owner (minified): Kp
// source: bundle-0.8.0.mjs, character offset 1558096 (original minified file on branch main)

#include <common>
varying vec2 vUv;
uniform vec2 previousRTSize;
uniform mat4 lastProjectionViewMatrix;
uniform mat4 currentProjectionViewMatrix;
uniform mat4 inverseViewMatrix;
uniform vec2 jitterSample;
uniform vec2 feedBack;
uniform bool firstFrame;
#if HAS_VELOCITY_BUFFER == 1
uniform sampler2D tVelocity;
#endif
vec3 find_closest_fragment_3x3(const in vec2 uv) {
	const vec3 offset=vec3(-1.,1.,0.);
	vec2 texelSize=1./previousRTSize;
	vec3 dtr=vec3(1,1,getDepth(uv+offset.yy*texelSize));
	vec3 dtc=vec3(0,1,getDepth(uv+offset.zy*texelSize));
	vec3 dtl=vec3(-1,1,getDepth(uv+offset.xy*texelSize));
	vec3 dml=vec3(-1,0,getDepth(uv+offset.xz*texelSize));
	vec3 dmc=vec3(0,0,getDepth(uv));
	vec3 dmr=vec3(1,0,getDepth(uv+offset.yz*texelSize));
	vec3 dbl=vec3(-1,-1,getDepth(uv+offset.xx*texelSize));
	vec3 dbc=vec3(0,-1,getDepth(uv+offset.zx*texelSize));
	vec3 dbr=vec3(1,-1,getDepth(uv+offset.yx*texelSize));
	vec3 dmin=dtl;
	if(dmin.z>dtc.z)dmin=dtc;
	if(dmin.z>dtr.z)dmin=dtr;
	if(dmin.z>dml.z)dmin=dml;
	if(dmin.z>dmc.z)dmin=dmc;
	if(dmin.z>dmr.z)dmin=dmr;
	if(dmin.z>dbl.z)dmin=dbl;
	if(dmin.z>dbc.z)dmin=dbc;
	if(dmin.z>dbr.z)dmin=dbr;
	return vec3(uv+texelSize.xy*dmin.xy,dmin.z);
}
vec3 find_closest_fragment_5tap(const in vec2 uv) {
	vec2 texelSize=1./previousRTSize;
	vec2 offset=vec2(1.,-1.);
	vec3 dtl=vec3(-1,1,getDepth(uv+offset.yx*texelSize));
	vec3 dtr=vec3(1,1,getDepth(uv+offset.xx*texelSize));
	vec3 dmc=vec3(0,0,getDepth(uv));
	vec3 dbl=vec3(-1,-1,getDepth(uv+offset.yy*texelSize));
	vec3 dbr=vec3(1,-1,getDepth(uv+offset.xy*texelSize));
	vec3 dmin=dtl;
	if(dmin.z>dtr.z)dmin=dtr;
	if(dmin.z>dmc.z)dmin=dmc;
	if(dmin.z>dbl.z)dmin=dbl;
	if(dmin.z>dbr.z)dmin=dbr;
	return vec3(uv+dmin.xy*texelSize,dmin.z);
}
vec4 clip_aabb(const in vec4 aabb_min,const in vec4 aabb_max,vec4 p) {
	const float FLT_EPS=1e-8;
	vec4 p_clip=0.5*(aabb_max+aabb_min);
	vec4 e_clip=0.5*(aabb_max-aabb_min)+FLT_EPS;
	vec4 v_clip=p-p_clip;
	vec4 v_unit=abs(v_clip/e_clip);
	float ma_unit=max(v_unit.x,max(v_unit.y,v_unit.z));
	if(ma_unit>1.)return p_clip+v_clip/ma_unit;
	else return p;
}
#if HAS_VELOCITY_BUFFER == 0
vec2 computeScreenSpaceVelocity(const in vec3 worldPosition) {
	vec4 currentPositionClip=currentProjectionViewMatrix*vec4(worldPosition,1.);
	vec4 prevPositionClip=lastProjectionViewMatrix*vec4(worldPosition,1.);
	vec2 currentPositionNDC=currentPositionClip.xy/currentPositionClip.w;
	vec2 prevPositionNDC=prevPositionClip.xy/prevPositionClip.w;
	if(prevPositionNDC.x>=1.||prevPositionNDC.x<=-1.||prevPositionNDC.x>=1.||prevPositionNDC.y<=-1.) {
		return vec2(0.);
	}
	return 0.5*(currentPositionNDC-prevPositionNDC);
}
#endif
vec4 computeTAA(const in vec2 uv,const in vec2 screenSpaceVelocity) {
	vec2 jitterOffset=jitterSample/previousRTSize;
	vec2 uvUnJitter=uv;
	vec4 currentColor=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter));
	vec4 previousColor=previousRTTexelToLinear(texture2D(previousRT,uv-screenSpaceVelocity));
	const vec3 offset=vec3(1.,-1.,0.);
	vec2 texelSize=1./previousRTSize;
	float texelSpeed=length(screenSpaceVelocity);
	vec4 tl=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.yx*texelSize));
	vec4 tc=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.zx*texelSize));
	vec4 tr=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.xx*texelSize));
	vec4 ml=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.yz*texelSize));
	vec4 mc=currentColor;
	vec4 mr=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.xz*texelSize));
	vec4 bl=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.yy*texelSize));
	vec4 bc=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.zy*texelSize));
	vec4 br=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.xy*texelSize));
	vec4 corners=2.*(tr+bl+br+tl)-2.*mc;
	mc+=(mc-(corners*0.166667))*2.718282*0.3;
	mc=max(vec4(0.),mc);
	vec4 min5=min(tc,min(ml,min(mc,min(mr,bc))));
	vec4 max5=max(tc,max(ml,max(mc,max(mr,bc))));
	vec4 cmin=min(min5,min(tl,min(tr,min(bl,br))));
	vec4 cmax=max(min5,max(tl,max(tr,max(bl,br))));
	;
	cmin=0.5*(cmin+min5);
	cmax=0.5*(cmax+max5);
	previousColor=clip_aabb(cmin,cmax,previousColor);
	float lum0=luminance(currentColor.rgb);
	float lum1=luminance(previousColor.rgb);
	float unbiased_diff=abs(lum0-lum1)/max(lum0,max(lum1,0.2));
	float unbiased_weight=1.-unbiased_diff;
	float unbiased_weight_sqr=unbiased_weight*unbiased_weight;
	float k_feedback=mix(feedBack.x,feedBack.y,unbiased_weight_sqr);
	return mix(currentColor,previousColor,k_feedback);
}
vec3 getWorldPositionFromViewZ(const in vec2 uv,const in float viewDepth) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewDepth/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewDepth/projection[1][1];
	return(inverseViewMatrix*vec4(xe,ye,viewDepth,1.)).xyz;
}
void main() {
	vec2 jitterOffset=jitterSample/previousRTSize;
#if QUALITY == 1
	vec3 c_frag=find_closest_fragment_3x3(vUv);
#else
	vec3 c_frag=find_closest_fragment_5tap(vUv);
#endif
	if(c_frag.z>=0.999) {
		gl_FragColor=currentRTTexelToLinear(texture2D(currentRT,vUv-jitterOffset));
	} else {
		float sampleViewZ=mix(-cameraNearFar.x,-cameraNearFar.y,c_frag.z);
		vec3 worldPosition=getWorldPositionFromViewZ(c_frag.xy,sampleViewZ);
#if HAS_VELOCITY_BUFFER == 0
		vec2 screenSpaceVelocity=computeScreenSpaceVelocity(worldPosition);
#else
		vec2 screenSpaceVelocity=texture2D(tVelocity,c_frag.xy).xy*2.-1.;
		screenSpaceVelocity=sign(screenSpaceVelocity)*pow(abs(screenSpaceVelocity),vec2(4.));
#endif
		gl_FragColor=firstFrame?currentRTTexelToLinear(texture2D(currentRT,vUv)):computeTAA(vUv,screenSpaceVelocity);
	}
#include <encodings_fragment>
}
