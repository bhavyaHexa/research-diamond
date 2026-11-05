// Contact-shadow ground fragment
// group: Ground, background & shadows   stage: fragment
// role: ContactShadowGroundPlugin (gE / oE)
// owner (minified): oE
// source: bundle-0.8.0.mjs, character offset 2126239 (original minified file on branch main)

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
uniform float opacity;
uniform sampler2D tDiffuse;
uniform sampler2D tTransparentMap;
varying vec2 vUv;
void main()  {
	float depth = getDepth(vUv);
	vec4 texel;
	if(depth>0.9999)  {
		texel = texture2D( tTransparentMap, vUv );
		if(texel.a < 0.01) discard;
		// background
		// transparent objects with render to depth = false
	} else  {
		texel = texture2D( tDiffuse, vUv );
	}
	gl_FragColor = texel;
}
