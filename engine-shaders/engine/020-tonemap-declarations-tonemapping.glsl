// Tonemap declarations + ToneMapping()
// group: Tone mapping & post-processing   stage: snippet
// role: class ma: ACES etc., contrast, saturation, depth/flag mask
// owner (minified): ?
// source: bundle-0.8.0.mjs, character offset 1250361 (original minified file on branch main)
// note: `${this.depthTonemap ? kt : ""}` is shown in its enabled form (kt included), which is what this scene uses.

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
#define USE_DEPTH_TONEMAP 1
uniform float opacity;
uniform float toneMappingContrast;
uniform float toneMappingSaturation;
float getToneMapBit(in float number) {
	return mod(floor(number/pow(2.,1.)),2.);
}
vec3 TonemappingSaturation(vec3 rgb) {
	const vec3 W=vec3(0.2125,0.7154,0.0721);
	vec3 intensity=vec3(dot(rgb,W));
	return mix(intensity,rgb,toneMappingSaturation);
}
vec3 TonemappingContrast(vec3 color) {
	return(color-vec3(0.5))*toneMappingContrast+vec3(0.5);
}
vec4 ToneMapping(in vec4 color) {
	vec4 outColor=opacity*color;
#if USE_DEPTH_TONEMAP > 0
	bool doTonemap=getToneMapBit(getGBufferFlags(vUv).a*255.)>0.5;
	float depth=getDepth(vUv);
	vec4 transparentCol=tTransparentTexelToLinear(texture2D(tTransparent,vUv));
#if TONEMAP_BACKGROUND < 1 || TRANSPARENT_BACKGROUND > 0
	bool isBackground=depth>0.99&&transparentCol.a<0.001;
	if(isBackground)doTonemap=false;
#endif
	if(doTonemap) {
#endif
#if defined( TONE_MAPPING )
		outColor.rgb=toneMapping(outColor.rgb);
		outColor.rgb=TonemappingContrast(outColor.rgb);
		outColor.rgb=TonemappingSaturation(outColor.rgb);
#endif
#if USE_DEPTH_TONEMAP > 0
	}
#if TRANSPARENT_BACKGROUND > 0
	if(isBackground)outColor.a=0.;
	if(depth>0.99&&transparentCol.a>=0.001)outColor.a=transparentCol.a;
#endif
	if(depth<0.00001)outColor.a=0.;
#if defined(DEBUG_DEPTH) && DEBUG_DEPTH > 0
	outColor.rgb=vec3(sRGBToLinear(vec4((1.-depth))).x);
#endif
#endif
	return outColor;
}
