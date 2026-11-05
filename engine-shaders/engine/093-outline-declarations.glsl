// Outline declarations
// group: Utility & debug   stage: snippet
// role: OutlinePlugin (Xx)
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 2097641 (original minified file on branch main)

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
uniform sampler2D outlineBuffer;
uniform vec2 tDiffuseSize;
uniform vec3 outlineColor;
uniform float outlineThickness;
uniform float outlineIntensity;
uniform float highlightTransparency;
uniform bool enableHighlight;
float isSelected(vec2 uv) {
	return 1.-texture2D(outlineBuffer,uv).b;
}
vec4 outline(in vec4 color) {
	vec2 invSize=1./tDiffuseSize;
#if DEBUG_OUTLINE > 0
	color=vec4(0.,0.,0.,1.);
#endif
	vec3 finalColor=color.rgb;
	float c=isSelected(vUv);
	if(c>0.) {
		vec4 uvOffset=1.5*outlineThickness*vec4(1.,0.,-1.,1.)*vec4(invSize,invSize);
		float c1=isSelected(vUv+uvOffset.xy);
		float c2=isSelected(vUv-uvOffset.xy);
		float c3=isSelected(vUv+uvOffset.yw);
		float c4=isSelected(vUv-uvOffset.yw);
		float diff1=(c1-c2)*0.5;
		float diff2=(c3-c4)*0.5;
		float d=length(vec2(diff1,diff2));
		vec4 highlightColor=enableHighlight?vec4(c*outlineColor,(1.-highlightTransparency)*c):vec4(0.);
		vec4 edgeColor=vec4(outlineColor,1.)*vec4(d);
		float gbufferDepth=getDepth(vUv);
		float outlineDepth=unpack16(texture2D(outlineBuffer,vUv).xy);
		outlineDepth*=outlineDepth;
		outlineDepth-=0.001;
		if(gbufferDepth<outlineDepth) {
			highlightColor.rgb=highlightColor.rgb*0.3;
			edgeColor.rgb=edgeColor.rgb*0.5;
		}
		vec4 outColor=edgeColor+highlightColor*(1.-d);
		finalColor=mix(color.rgb,outlineIntensity*outColor.rgb,outColor.a);
	} else {
		finalColor.rgb=color.rgb;
	}
	return vec4(finalColor.rgb,color.a);
}
