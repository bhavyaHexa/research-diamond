// Three.js r152 ShaderChunk "background_frag" — MODIFIED by the engine (differs from stock r152)

#ifdef HAS_TEXTURE
uniform sampler2D t2D;
varying vec2 vUv;
#endif
uniform float backgroundIntensity;
uniform vec3 backgroundColor;
void main() {
#ifdef HAS_TEXTURE
	vec4 texColor = texture2D( t2D, vUv );
#else
	vec4 texColor = vec4( 1.0 );
#endif
	texColor.rgb *= backgroundColor * backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}
