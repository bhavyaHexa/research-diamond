// SSBevel edge-detect fragment
// group: Screen-space effects   stage: fragment
// role: lh._edgeMaterial
// owner (minified): ? / lh
// source: bundle-0.8.0.mjs, character offset 1579316 (original minified file on branch main)

uniform vec2 screenSize;
uniform sampler2D tNormalDepth;
uniform sampler2D tNormalBuffer;
uniform sampler2D tGBufferFlags;
uniform float radius;
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
const float depthStep=0.2;
const float normalThreshold=0.9;
float unpack16(vec2 value) {
	return(value.x*0.996108949416342426275150501169264316558837890625+value.y*0.00389105058365758760263730664519243873655796051025390625);
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
void lookupNormalDepth(out float depth,out vec3 normal,vec2 off) {
	vec2 uv=(gl_FragCoord.st+off)/screenSize;
	vec4 texel=texture2D(tNormalDepth,uv);
	depth=mix(cameraNearFar.x,cameraNearFar.y,pow(unpack16(texel.xy),2.));
	normal=2.*texture2D(tNormalBuffer,uv).rgb-1.;
}
float getBorderWeight() {
	float depth1,depth2,depth3,depth4;
	vec3 normal1,normal2,normal3,normal4;
	float d_=dot(cameraPositionWorld,cameraPositionWorld);
	float radiusModifier=clamp(3./(1.+pow(d_,0.5)),0.,1.);
	float modRad=radius;
	lookupNormalDepth(depth1,normal1,vec2(0.,modRad));
	lookupNormalDepth(depth2,normal2,vec2(0.,-modRad));
	lookupNormalDepth(depth3,normal3,vec2(modRad,0.));
	lookupNormalDepth(depth4,normal4,vec2(-modRad,0.));
	vec2 uv=(gl_FragCoord.st)/screenSize;
	float mask=step(0.0001,texture2D(tGBufferFlags,uv).g);
	float mask1=texture2D(tGBufferFlags,uv+vec2(0.,modRad)/screenSize).b*255.;
	float mask2=texture2D(tGBufferFlags,uv+vec2(0.,-modRad)/screenSize).b*255.;
	float mask3=texture2D(tGBufferFlags,uv+vec2(modRad,0.)/screenSize).b*255.;
	float mask4=texture2D(tGBufferFlags,uv+vec2(-modRad,0.)/screenSize).b*255.;
	float maskWeight=max(abs(mask1-mask2),abs(mask3-mask4))*255.;
	maskWeight=(step(maskWeight,0.01));
	float a1=dot(normal1,normal2);
	float a2=dot(normal3,normal4);
	float normalWeight=min(abs(a1),abs(a2));
	normalWeight=1.-step(normalThreshold,normalWeight);
	float depthWeight=max(abs(depth1-depth2),abs(depth3-depth4));
	depthWeight=(step(depthWeight,depthStep));
	return normalWeight*depthWeight*maskWeight*mask;
}
void main() {
	float weight=getBorderWeight();
	vec2 uv=gl_FragCoord.st/screenSize;
	vec4 texel=texture2D(tNormalDepth,uv);
	float depth=pow(unpack16(texel.xy),2.);
	vec3 outColor=vec3(0.);
	if(depth>0.999) {
		weight=0.;
	} else {
		outColor=vec3(weight);
	}
	gl_FragColor=vec4(outColor,1.);
}
