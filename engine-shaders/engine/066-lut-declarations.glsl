// LUT declarations
// group: Tone mapping & post-processing   stage: fragment declarations
// role: class Lp (inactive in this scene)
// owner (minified): ? / Up
// source: bundle-0.8.0.mjs, character offset 1529921 (original minified file on branch main)

#if (USE_LUT == 1 || USE_LUT1 == 1 || USE_LUT2 == 1)
uniform float lutSize;
uniform float lutSize1;
uniform float lutSize2;
uniform float intensity;
#if USE_3DTEXTURE == 1
precision highp sampler3D;
#if USE_LUT == 1
uniform sampler3D lut3d;
#endif
#if USE_LUT1 == 1
uniform sampler3D lut3d1;
#endif
#if USE_LUT2 == 1
uniform sampler3D lut3d2;
#endif
#else
#if USE_LUT == 1
uniform sampler2D lut2d;
#endif
#if USE_LUT1 == 1
uniform sampler2D lut2d1;
#endif
#if USE_LUT2 == 1
uniform sampler2D lut2d2;
#endif
vec3 lutLookup(sampler2D tex,float size,vec3 rgb) {
	float sliceHeight=1./size;
	float yPixelHeight=1./(size*size);
	float slice=rgb.b*size;
	float interp=fract(slice);
	float slice0=slice-interp;
	float centeredInterp=interp-0.5;
	float slice1=slice0+sign(centeredInterp);
	float greenOffset=clamp(rgb.g*sliceHeight,yPixelHeight*0.5,sliceHeight-yPixelHeight*0.5);
	vec2 uv0=vec2(rgb.r,slice0*sliceHeight+greenOffset);
	vec2 uv1=vec2(rgb.r,slice1*sliceHeight+greenOffset);
	vec3 sample0=texture2D(tex,uv0).rgb;
	vec3 sample1=texture2D(tex,uv1).rgb;
	return mix(sample0,sample1,abs(centeredInterp));
}
#endif
float getLUTBit(in float number) {
	return mod(number,2.);
}
float getLUTIndex(in float number) {
	return mod(number,8.);
}
vec3 getUVW(in float lutSize,in vec4 color) {
	float pixelWidth=1./lutSize;
	float halfPixelWidth=0.5/lutSize;
	vec3 uvw=vec3(halfPixelWidth)+color.rgb*(1.-pixelWidth);
	return uvw;
}
vec4 colorLookUp(in vec4 color) {
	vec4 outColor;
	float lutFac=step(0.0001,getLUTBit(getGBufferFlags(vUv).a*255.));
	float lutIndex=getLUTIndex(getGBufferFlags(vUv).g*255.);
#if USE_3DTEXTURE == 1
	if(lutIndex==0.) {
#if USE_LUT == 1
		outColor=vec4(texture(lut3d,getUVW(lutSize,color)).rgb,color.a);
#endif
	} else if(lutIndex==1.) {
#if USE_LUT1 == 1
		outColor=vec4(texture(lut3d1,getUVW(lutSize1,color)).rgb,color.a);
#endif
	} else if(lutIndex==2.) {
#if USE_LUT2 == 1
		outColor=vec4(texture(lut3d2,getUVW(lutSize2,color)).rgb,color.a);
#endif
	} else {
#if USE_LUT == 1
		outColor=vec4(texture(lut3d,getUVW(lutSize,color)).rgb,color.a);
#endif
	}
#else
	if(lutIndex==0.) {
		outColor=vec4(lutLookup(lut2d,lutSize,getUVW(lutSize,color)),color.a);
	} else if(lutIndex==1.) {
#if USE_LUT1 == 1
		outColor=vec4(lutLookup(lut2d1,lutSize,getUVW(lutSize1,color)),color.a);
#endif
	} else if(lutIndex==2.) {
#if USE_LUT2 == 1
		outColor=vec4(lutLookup(lut2d2,lutSize,getUVW(lutSize2,color)),color.a);
#endif
	} else {
		outColor=vec4(lutLookup(lut2d,lutSize,getUVW(lutSize,color)),color.a);
	}
#endif
	outColor=mix(color,outColor,lutFac);
	return vec4(mix(color,outColor,intensity));
}
#endif
