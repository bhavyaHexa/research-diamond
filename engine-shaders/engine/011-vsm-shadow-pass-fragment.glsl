// VSM shadow pass fragment
// group: Three.js internals   stage: shared snippet
// role: Three vsm_frag (variance shadow blur)
// owner (minified): fc / __webpackgi_modules__
// source: bundle-0.8.0.mjs, character offset 628022 (original minified file on branch main)

uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main()  {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ )  {
		float uvOffset = uvStart + i * uvStride;
#ifdef HORIZONTAL_PASS
		vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
		mean += distribution.x;
		squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
#else
		float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
		mean += depth;
		squared_mean += depth * depth;
#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}
