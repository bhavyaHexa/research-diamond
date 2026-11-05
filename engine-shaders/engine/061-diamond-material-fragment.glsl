// Diamond material fragment
// group: Materials   stage: fragment
// role: refraction loop, dispersion, reflection
// owner (minified): ll
// source: bundle-0.8.0.mjs, character offset 1461953 (original minified file on branch main)

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec2 vUv;
uniform mat4 projectionMatrix;
uniform samplerCube tCubeMapNormals;
#if ENV_MAP_TYPE == 0
uniform samplerCube envMap;
#elif ENV_MAP_TYPE == 1
uniform sampler2D envMap;
#endif
uniform float envMapIntensity;
uniform mat4 modelMatrix;
uniform mat4 inverseModelMatrix;
uniform mat4 offsetMatrixInv;
uniform mat4 modelOffsetMatrix;
uniform float transmission;
uniform vec2 transmissionSamplerSize;
uniform sampler2D transmissionSamplerMap;
uniform float refractiveIndex;
uniform float radius;
uniform float rIndexDelta;
uniform float squashFactor;
uniform float geometryFactor;
uniform vec3 color;
uniform vec3 colorCorrection;
uniform vec3 boostFactors;
uniform vec3 centerOffset;
uniform float gammaFactor;
uniform float absorptionFactor;
uniform float envMapRotation;
uniform float reflectivity;
vec3 BRDF_Specular_GGX_Environment(const in vec3 viewDir,const in vec3 normal,const in vec3 specularColor,const in float roughness) {
	float dotNV=abs(dot(normal,viewDir));
	const vec4 c0=vec4(-1,-0.0275,-0.572,0.022);
	const vec4 c1=vec4(1,0.0425,1.04,-0.04);
	vec4 r=roughness*c0+c1;
	float a004=min(r.x*r.x,exp2(-9.28*dotNV))*r.x+r.y;
	vec2 AB=vec2(-1.04,1.04)*a004+r.zw;
	return specularColor*AB.x+AB.y;
}
vec2 cartesianToPolar(vec3 n) {
	vec2 uv;
	uv.x=atan(n.z,n.x)/(PI*2.)+0.5;
	uv.y=asin(n.y)/PI+0.5;
	return uv;
}
vec4 sampleEnvMap(vec3 direction) {
#if !defined(USE_ENVMAP)
	return vec4(direction,1);
#else
	float cs=cos(envMapRotation);
	float sn=sin(envMapRotation);
	float temp=cs*direction.x+sn*direction.z;
	direction.z=-sn*direction.x+cs*direction.z;
	direction.x=temp;
	direction.x*=-1.;
	direction.y*=-1.;
	direction.z*=-1.;
#if ENV_MAP_TYPE == 0
	return(textureCube(envMap,direction));
#elif ENV_MAP_TYPE == 1
	return(texture2D(envMap,cartesianToPolar(direction)));
#endif
	return vec4(1,0,1,1);
#endif
}
vec4 SampleSpecularReflection(vec3 direction) {
#if defined(FIX_ENV_DIRECTION)
	direction=(viewMatrix*vec4(direction,0.)).xyz;
#endif
	return envMapIntensity*(sampleEnvMap(direction));
}
vec4 SampleSpecularContribution(vec3 direction) {
#if DIA_ORIENT_ENVMAP < 1
	direction=mat3(modelOffsetMatrix)*direction;
#endif
#if defined(FIX_ENV_DIRECTION)
	direction=(viewMatrix*vec4(direction,0.)).xyz;
#endif
	direction=normalize(direction);
	direction.x*=-1.;
	direction.z*=-1.;
	return envMapIntensity*(sampleEnvMap(direction));
}
vec4 SampleSpecularContributionRef(vec3 origin,int i) {
	vec4 ndcPos=projectionMatrix*viewMatrix*vec4(origin,1.);
	vec2 refractionCoords=ndcPos.xy/ndcPos.w;
	refractionCoords+=1.;
	refractionCoords/=2.;
	return transmissionSamplerMapTexelToLinear(texture2D(transmissionSamplerMap,refractionCoords));
}
vec3 intersectSphere(vec3 origin,vec3 direction) {
	origin-=centerOffset;
	direction.y/=squashFactor;
	float A=dot(direction,direction);
	float B=2.*dot(origin,direction);
	float C=dot(origin,origin)-radius*radius;
	float disc=B*B-4.*A*C;
	if(disc>0.) {
		disc=sqrt(disc);
		float t1=(-B+disc)*geometryFactor/A;
		float t2=(-B-disc)*geometryFactor/A;
		float t=(t1>t2)?t1:t2;
		direction.y*=squashFactor;
		return vec3(origin+centerOffset+direction*t);
	}
	return vec3(0.);
}
vec3 linePlaneIntersect(in vec3 pointOnLine,in vec3 lineDirection,in vec3 pointOnPlane,in vec3 planeNormal) {
	return lineDirection*(dot(planeNormal,pointOnPlane-pointOnLine)/dot(planeNormal,lineDirection))+pointOnLine;
}
vec4 getNormalDistance(vec3 d) {
	return textureCube(tCubeMapNormals,d);
}
vec3 getSurfaceNormal(vec4 surfaceInfos) {
	vec3 surfaceNormal=surfaceInfos.rgb;
	surfaceNormal=surfaceNormal*2.-1.;
	return-normalize(surfaceNormal);
}
vec3 intersect(vec3 rayOrigin,vec3 rayDirection) {
	vec3 sphereHitPoint=intersectSphere(rayOrigin,rayDirection);
	vec3 direction1=normalize(sphereHitPoint-centerOffset);
	vec4 normalDistanceData1=getNormalDistance(direction1);
	float distance1=normalDistanceData1.a*radius;
	vec3 pointOnPlane1=centerOffset+direction1*distance1;
	vec3 planeNormal1=getSurfaceNormal(normalDistanceData1);
	vec3 hitPoint1=linePlaneIntersect(rayOrigin,rayDirection,pointOnPlane1,planeNormal1);
	vec3 direction2=normalize(hitPoint1-centerOffset);
	vec4 normalDistanceData2=getNormalDistance(direction2);
	float distance2=normalDistanceData2.a*radius;
	vec3 pointOnPlane2=centerOffset+direction2*distance2;
	vec3 hitPoint=hitPoint1;
	vec3 planeNormal2=getSurfaceNormal(normalDistanceData2);
	hitPoint=linePlaneIntersect(rayOrigin,rayDirection,pointOnPlane2,planeNormal2);
	return hitPoint;
}
vec3 debugBounces(int count) {
	vec3 color=vec3(1.,1.,1.);
	if(count==1)color=vec3(0.,1.,0.);
	else if(count==2)color=vec3(0.,0.,1.);
	else if(count==3)color=vec3(1.,1.,0.);
	else if(count==4)color=vec3(0.,1.,1.);
	else color=vec3(0.,1.,0.);
	if(count==0)color=vec3(1.,0.,0.);
	return color;
}
vec3 getRefractionColor(vec3 origin,vec3 direction,vec3 normal) {
	vec3 outColor=vec3(0.);
	const float n1=1.;
	const float epsilon=1e-4;
	float f0=(2.4-n1)/(2.4+n1);
	f0*=f0;
	vec3 attenuationFactor=vec3(1.);
	vec3 newDirection=refract(direction,normal,n1/refractiveIndex);
	vec3 brdfRefracted=BRDF_Specular_GGX_Environment(newDirection,-normal,vec3(f0),0.);
	attenuationFactor*=(vec3(1.)-brdfRefracted);
	int count=0;
	newDirection=(offsetMatrixInv*inverseModelMatrix*vec4(newDirection,0.)).xyz;
	newDirection=normalize(newDirection);
	origin=(offsetMatrixInv*inverseModelMatrix*vec4(origin,1.)).xyz;
	for(int i=0;i<RAY_BOUNCES;i++) {
		vec3 intersectedPos=intersect(origin,newDirection);
		vec3 dist=intersectedPos-origin;
		vec3 d=normalize(intersectedPos-centerOffset);
		vec3 mappedNormal=getNormalDistance(d).rgb;
		mappedNormal=2.*mappedNormal-1.;
		mappedNormal=-normalize(mappedNormal);
		float r=length(dist)/radius*absorptionFactor;
		attenuationFactor*=exp(-r*(1.-color));
		origin=intersectedPos;
		vec3 origin2=(modelOffsetMatrix*vec4(intersectedPos,1)).xyz;
		vec3 oldDir=newDirection;
		newDirection=refract(newDirection,mappedNormal,refractiveIndex/n1);
		if(dot(newDirection,newDirection)<epsilon) {
			newDirection=reflect(oldDir,mappedNormal);
			if(i==RAY_BOUNCES-1) {
				vec3 brdfReflected=BRDF_Specular_GGX_Environment(-oldDir,mappedNormal,vec3(f0),0.);
				vec3 d1=mat3(modelOffsetMatrix)*oldDir;
				d1=normalize(d1);
				float cosT=1.-dot(direction,d1);
				outColor+=((transmission>0.&&cosT<transmission)?SampleSpecularContributionRef(origin2+0.5*d1*cosT,i).rgb:SampleSpecularContribution(oldDir).rgb)*attenuationFactor*colorCorrection*boostFactors*(vec3(1.)-brdfReflected);
			}
		} else {
			vec3 brdfRefracted=vec3(1.)-BRDF_Specular_GGX_Environment(newDirection,-mappedNormal,vec3(f0),0.);
			vec3 d1=normalize(mat3(modelOffsetMatrix)*newDirection);
			float cosT=1.-dot(direction,d1);
			if(transmission>0.&&cosT<transmission) {
				outColor+=SampleSpecularContributionRef(origin2+0.5*d1*cosT,i).rgb*brdfRefracted*attenuationFactor*colorCorrection*boostFactors;
			} else {
				vec3 dir0=newDirection;
				vec3 dir1=refract(oldDir,mappedNormal,(refractiveIndex+rIndexDelta)/n1);
				vec3 dir2=refract(oldDir,mappedNormal,(refractiveIndex-rIndexDelta)/n1);
				outColor+=vec3(SampleSpecularContribution(dir1).r,SampleSpecularContribution(dir0).g,SampleSpecularContribution(dir2).b)*brdfRefracted*attenuationFactor*colorCorrection*boostFactors;
			}
			newDirection=reflect(oldDir,mappedNormal);
			vec3 brdfReflected=BRDF_Specular_GGX_Environment(newDirection,mappedNormal,vec3(f0),0.);
			attenuationFactor*=brdfReflected*boostFactors;
			count++;
		}
	}
	return outColor;
}
void main() {
	vec3 normalizedNormal=normalize(vWorldNormal);
	vec3 viewVector=normalize(vWorldPosition-cameraPosition);
	const float n1=1.;
	const float epsilon=1e-4;
	float f0=(2.4-n1)/(2.4+n1);
	f0*=f0;
	vec3 attenuationFactor=vec3(1.);
	vec3 reflectedDirection=reflect(viewVector,normalizedNormal);
	vec3 brdfReflected=BRDF_Specular_GGX_Environment(reflectedDirection,normalizedNormal,vec3(f0),0.);
	vec3 reflectionColor=SampleSpecularReflection(reflectedDirection).rgb*brdfReflected*reflectivity*2.;
	vec3 refractionColor=getRefractionColor(vWorldPosition,viewVector,normalizedNormal);
	vec3 normal=normalize(vNormal);
	vec3 diffuseColor=vec3(1.);
#glMarker beforeAccumulation
	gl_FragColor=vec4((refractionColor.rgb+reflectionColor.rgb)*diffuseColor,1.);
	gl_FragColor.rgb=pow(gl_FragColor.rgb,vec3(gammaFactor));
#include <encodings_fragment>
}
