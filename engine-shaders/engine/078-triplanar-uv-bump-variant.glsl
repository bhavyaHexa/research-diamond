// Triplanar UV: bump variant
// group: Material extensions   stage: fragment injection
// owner (minified): c
// source: bundle-0.8.0.mjs, character offset 1591620 (original minified file on branch main)

#ifdef USE_BUMPMAP
uniform sampler2D bumpMap;
uniform float bumpScale;
// Bump Mapping Unparametrized Surfaces on the GPU by Morten S. Mikkelsen
// https://invalid.invalid/papers3d/mm_sfgrad_bump.pdf
// Evaluate the derivative of the height w.r.t. screen-space using forward differencing (listing 2)
vec2 dHdxy_fwd()  {
	vec3 dSTdx = dFdx( vWorldPosition );
	vec3 dSTdy = dFdy( vWorldPosition );
	vec3 normal_ = normalize(vWorldNormal);
	float Hll = bumpScale * textureTriplanar( bumpMap, vWorldPosition, normal_ ).x;
	float dBx = bumpScale * textureTriplanar( bumpMap, vWorldPosition + dSTdx, normal_ ).x - Hll;
	float dBy = bumpScale * textureTriplanar( bumpMap, vWorldPosition + dSTdy, normal_ ).x - Hll;
	return vec2( dBx, dBy );
}
vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection )  {
	vec3 vSigmaX = dFdx( surf_pos.xyz );
	vec3 vSigmaY = dFdy( surf_pos.xyz );
	vec3 vN = surf_norm;
	// normalized
	vec3 R1 = cross( vSigmaY, vN );
	vec3 R2 = cross( vN, vSigmaX );
	float fDet = dot( vSigmaX, R1 ) * faceDirection;
	vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
	return normalize( abs( fDet ) * surf_norm - vGrad );
}
#endif
