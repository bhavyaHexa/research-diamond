// HDRi ground-projected background fragment
// group: Ground, background & shadows   stage: fragment
// role: HDRiGroundPlugin (Kc): backgroundCube fragment
// owner (minified): ? / Kc
// source: bundle-0.8.0.mjs, character offset 1444664 (original minified file on branch main)

#ifdef HDRi_GROUND_PROJ
float intersectPlane1(const in vec3 r0,const in vec3 rd,const in vec3 n,const in vec3 p0) {
	float t=dot(p0-r0,n)/(dot(n,rd)+1e-6);
	return t<0.?1000.:t;
}
float intersectSphere1(in vec3 ro,in vec3 rd,in vec3 sph,in float rad) {
	vec3 oc=ro-sph;
	float b=dot(oc,rd);
	float c=dot(oc,oc)-rad*rad;
	float t=b*b-c;
	return t<0.?t:-b+sqrt(t);
}
#define PI_HALF  1.5707963267948966
uniform float worldRadius;
uniform float tripodHeight;
uniform vec3 originPosition;
vec3 hdriProject() {
	vec3 p=normalize(vWorldDirection);
	vec3 camPos=cameraPosition;
	camPos.y-=tripodHeight;
	float t=intersectSphere1(camPos,p,originPosition,worldRadius);
	if(t>0.) {
		float t2=intersectPlane1(camPos,p,vec3(0,-1,0),originPosition+vec3(0.,-tripodHeight,0.));
		p=(camPos+min(t,t2)*p)/worldRadius;
	} else p=vec3(0.,1.,0.);
	return p;
}
#endif
