// Anisotropy extension
// group: Material extensions   stage: fragment injection
// role: AnisotropyPlugin (Nc)
// owner (minified): a
// source: bundle-0.8.0.mjs, character offset 1422720 (original minified file on branch main)

//#if ANISOTROPY_ENABLED
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
uniform float anisotropyFactor;
uniform float anisotropyNoise;
#if ANISOTROPY_TEX_MODE == 0
uniform float anisotropyDirection;
#else
uniform sampler2D anisotropyDirectionMap;
#endif
const float MIN_ROUGHNESS=0.05;
float D_GGX_Anisotropy(float at,float ab,float ToH,float BoH,float NoH) {
	float a2=at*ab;
	highp vec3 d=vec3(ab*ToH,at*BoH,a2*NoH);
	highp float d2=dot(d,d);
	float b2=a2/d2;
	return a2*b2*b2*(1./PI);
}
float V_GGX_SmithCorrelated_Anisotropy(float at,float ab,float ToV,float BoV,float ToL,float BoL,float NoV,float NoL) {
	float lambdaV=NoL*length(vec3(at*ToV,ab*BoV,NoV));
	float lambdaL=NoV*length(vec3(at*ToL,ab*BoL,NoL));
	float v=0.5/(lambdaV+lambdaL);
	return saturate(v);
}
vec3 indirectAnisotropyBentNormal(const in vec3 normal,const in vec3 viewDir,const in float roughness,const in vec3 anisotropicT,const in vec3 anisotropicB) {
	vec3 aDirection=anisotropyFactor>=0.?anisotropicB:anisotropicT;
	vec3 aTangent=cross(aDirection,viewDir);
	vec3 aNormal=cross(aTangent,aDirection);
	float bendFactor=abs(anisotropyFactor)*saturate(5.*max(roughness,MIN_ROUGHNESS));
	return normalize(mix(normal,aNormal,bendFactor));
}
vec3 BRDF_GGX_Anisotropy(const in vec3 lightDir,const in vec3 viewDir,const in vec3 normal,const in vec3 f0,const in float f90,const in float roughness,const in vec3 anisotropicT,const in vec3 anisotropicB) {
	float alpha=pow2(roughness);
	vec3 halfDir=normalize(lightDir+viewDir);
	float dotNL=saturate(dot(normal,lightDir));
	float dotNV=saturate(dot(normal,viewDir));
	float dotNH=saturate(dot(normal,halfDir));
	float dotVH=saturate(dot(viewDir,halfDir));
	float dotTV=dot(anisotropicT,viewDir);
	float dotBV=dot(anisotropicB,viewDir);
	float dotTL=dot(anisotropicT,lightDir);
	float dotBL=dot(anisotropicB,lightDir);
	float dotTH=dot(anisotropicT,halfDir);
	float dotBH=dot(anisotropicB,halfDir);
	float aspect=sqrt(1.-min(1.-MIN_ROUGHNESS,abs(anisotropyFactor)*0.9));
	if(anisotropyFactor>0.)aspect=1./aspect;
	float at=roughness*aspect;
	float ab=roughness/aspect;
	vec3 F=F_Schlick(f0,f90,dotVH);
	float V=V_GGX_SmithCorrelated_Anisotropy(at,ab,dotTV,dotBV,dotTL,dotBL,dotNV,dotNL);
	float D=D_GGX_Anisotropy(at,ab,dotTH,dotBH,dotNH);
	return F*(V*D);
}
