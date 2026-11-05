// Thin-film: voronoise helper
// group: Material extensions   stage: fragment declarations
// role: ThinFilmLayerPlugin (qa)
// owner (minified): ? / qa
// source: bundle-0.8.0.mjs, character offset 1303645 (original minified file on branch main)

#ifndef VORONOISE_HELPER
#define VORONOISE_HELPER
float voronoise(in vec2 p,float u,float v) {
	float k=1.+63.*pow(1.-v,6.);
	vec2 i=floor(p);
	vec2 f=fract(p);
	vec2 a=vec2(0.,0.);
	for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++) {
		vec2 g=vec2(x,y);
		vec3 o=hash3(i+g)*vec3(u,u,1.);
		vec2 d=g-f+o.xy;
		float w=pow(1.-smoothstep(0.,1.414,length(d)),k);
		a+=vec2(o.z*w,w);
	}
	return a.x/a.y;
}
vec3 voronoise3(vec2 p,float u,float v) {
	return vec3(voronoise(p,u,v),voronoise(p+vec2(0.435,0.23),u,v),voronoise(p-vec2(0.83,0.45),u,v));
}
vec3 voronoiseNormal(vec2 p,float u,float v) {
	return vec3(voronoise(p,u,v),voronoise(p+vec2(0.435,0.23),u,v),1.);
}
#endif
#ifndef HSV_HELPERS
#define HSV_HELPERS
vec3 hsv2rgb(vec3 c) {
	vec4 K=vec4(1.,2./3.,1./3.,3.);
	vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
	return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}
vec3 rgb2hsv(vec3 c) {
	vec4 K=vec4(0.,-1./3.,2./3.,-1.);
	vec4 p=c.g<c.b?vec4(c.bg,K.wz):vec4(c.gb,K.xy);
	vec4 q=c.r<p.x?vec4(p.xyw,c.r):vec4(c.r,p.yzx);
	float d=q.x-min(q.w,q.y);
	float e=1.0e-10;
	return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);
}
#endif
uniform vec4 thinBaseLayerFactors;
uniform vec4 thinNoiseLayerFactors;
uniform vec4 thinColorNoiseParams;
uniform float thinFilmFactor;
