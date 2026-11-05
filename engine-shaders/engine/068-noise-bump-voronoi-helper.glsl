// Noise bump: voronoi helper
// group: Material extensions   stage: fragment declarations
// role: NoiseBumpMaterialPlugin (Wp)
// owner (minified): ? / Wp
// source: bundle-0.8.0.mjs, character offset 1548131 (original minified file on branch main)

#ifndef VORONOI_HELPER
#define VORONOI_HELPER
float voronoi_distance(vec2 a,vec2 b,float metric) {
	return distance(a,b);
}
float voronoi_f1_2d(in vec2 coord,in float randomness,in float flakeClamp,in float flakeRadius,inout vec3 outColor) {
	vec2 cellPosition=floor(coord);
	vec2 localPosition=coord-cellPosition;
	float minDistance=8.;
	vec2 targetOffset,targetPosition;
	for(int j=-1;j<=1;j++) {
		for(int i=-1;i<=1;i++) {
			vec2 cellOffset=vec2(i,j);
			vec2 pointPosition=cellOffset+hash3(cellPosition+cellOffset).xy*randomness;
			float distanceToPoint=voronoi_distance(pointPosition,localPosition,1.);
			if(distanceToPoint<minDistance) {
				targetOffset=cellOffset;
				minDistance=distanceToPoint;
				targetPosition=pointPosition;
			}
		}
	}
	float outDistance=minDistance;
	float dist=step(flakeRadius,outDistance);
	outColor=hash3(cellPosition+hash3(cellPosition+targetOffset).xy*randomness+targetOffset);
	vec3 outColor1=minDistance<flakeRadius?outColor:vec3(0.5,0.5,1.);
	outDistance=mix(dist,minDistance,flakeClamp);
	outColor=mix(outColor1,outColor,flakeClamp);
	return outDistance;
}
#endif
uniform vec2 noiseBumpParams;
uniform float noiseBumpScale;
uniform float noiseBumpFlakeScale;
uniform float noiseFlakeClamp;
uniform float noiseFlakeRadius;
uniform bool useColorFlakes;
uniform vec4 flakeParams;
uniform vec3 flakeFallOffParams;
vec3 perturbNormalArb_nb(vec3 surf_pos,vec3 surf_norm,vec2 dHdxy,float faceDirection) {
	vec3 vSigmaX=dFdx(surf_pos.xyz);
	vec3 vSigmaY=dFdy(surf_pos.xyz);
	vec3 vN=surf_norm;
	vec3 R1=cross(vSigmaY,vN);
	vec3 R2=cross(vN,vSigmaX);
	float fDet=dot(vSigmaX,R1)*faceDirection;
	vec3 vGrad=sign(fDet)*(dHdxy.x*R1+dHdxy.y*R2);
	return normalize(abs(fDet)*surf_norm-vGrad);
}
