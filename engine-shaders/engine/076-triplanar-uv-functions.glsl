// Triplanar UV: functions
// group: Material extensions   stage: fragment injection
// owner (minified): o
// source: bundle-0.8.0.mjs, character offset 1590376 (original minified file on branch main)

struct TriplanarUV {
	vec2 x;
	vec2 y;
	vec2 z;
};
uniform float triplanarScale;
uniform float triplanarBlend;
uniform float triplanarOffset;
vec3 getTriplanarWeights(in vec3 position,in vec3 normal) {
	vec3 triW=abs(normal);
	triW=clamp(triW-vec3(triplanarOffset),vec3(0.),vec3(1.));
	triW=pow(triW,vec3(triplanarBlend));
	return triW/(triW.x+triW.y+triW.z);
}
TriplanarUV getTriplanarUV(in vec3 position,in vec3 normal) {
	TriplanarUV triUV;
	triUV.x=position.zy*triplanarScale;
	triUV.y=position.xz*triplanarScale;
	triUV.z=position.xy*triplanarScale;
	if(normal.x<0.) {
		triUV.x.x=-triUV.x.x;
	}
	if(normal.y<0.) {
		triUV.y.x=-triUV.y.x;
	}
	if(normal.z>=0.) {
		triUV.z.x=-triUV.z.x;
	}
	return triUV;
}
vec4 textureTriplanar(in sampler2D tex,in vec3 position,in vec3 normal) {
	TriplanarUV triUV=getTriplanarUV(position,normal);
	vec4 texX=texture2D(tex,triUV.x);
	vec4 texY=texture2D(tex,triUV.y);
	vec4 texZ=texture2D(tex,triUV.z);
	vec3 triW=getTriplanarWeights(position,normal);
	return texX*triW.x+texY*triW.y+texZ*triW.z;
}
#ifndef USE_TRANSMISSION
varying vec3 vWorldPosition;
#endif
varying vec3 vWorldNormal;
