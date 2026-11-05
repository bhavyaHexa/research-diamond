// SSAO bilateral blur fragment
// group: Screen-space effects   stage: fragment
// role: class xa: depth/normal-aware blur of the AO map
// owner (minified): xa
// source: bundle-0.8.0.mjs, character offset 1259925 (original minified file on branch main)

uniform vec2 tDiffuseSize;
uniform vec2 bilDirection;
varying vec2 vUv;
uniform bool smoothEnabled;
uniform float edgeSharpness;
vec4 bilaterialAO() {
	vec4 color=clamp((texture2D(tDiffuse,vUv.xy)).B_SRC_ACCESSOR,0.,5.);
	if(!smoothEnabled)return color;
	float depth;
	vec3 normal;
	getDepthNormal(vUv.xy,depth,normal);
	float gaussianWeights[4];
	gaussianWeights[0]=0.153170;
	gaussianWeights[1]=0.144893;
	gaussianWeights[2]=0.122649;
	gaussianWeights[3]=0.092902;
	float Z=gaussianWeights[0]+0.03;
	vec4 final_colour=Z*color;
	vec2 nuv;
	vec4 cc;
	float dp;
	vec3 nor;
	vec2 direction=bilDirection/tDiffuseSize.xy;
#pragma unroll_loop_start
	for(int i=0;i<6;i++) {
		direction*=-1.;
		nuv=vUv+2.*direction*float(UNROLLED_LOOP_INDEX/2+1);
		getDepthNormal(nuv,dp,nor);
		if(dp<0.999) {
			float normalCloseness=dot(normal,nor);
			normalCloseness*=normalCloseness;
			float normalError=(1.-normalCloseness)*8.;
			float normalWeight=max((1.-normalError*edgeSharpness),0.00);
			float depthWeight=max(0.,1.-edgeSharpness*4000.*abs(depth-dp));
			float kernelWeight=gaussianWeights[UNROLLED_LOOP_INDEX/2]+0.03;
			float bilateralWeight=kernelWeight*depthWeight*normalWeight;
			Z+=bilateralWeight;
			cc=clamp((texture2D(tDiffuse,nuv)).B_SRC_ACCESSOR,0.,5.);
			final_colour+=bilateralWeight*cc;
		}
	}
#pragma unroll_loop_end
	final_colour/=Z;
	return final_colour;
}
void main() {
	vec4 ao=clamp(bilaterialAO(),vec4(0.),vec4(1.));
	gl_FragColor=ao;
}
