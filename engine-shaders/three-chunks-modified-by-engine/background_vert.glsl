// Three.js r152 ShaderChunk "background_vert" — MODIFIED by the engine (differs from stock r152)

#ifdef HAS_TEXTURE
varying vec2 vUv;
uniform mat3 uvTransform;
uniform bool flipX;
uniform bool flipY;
#endif
void main() {
#ifdef HAS_TEXTURE
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
    vUv = flipX ? vec2( 1.0 - vUv.x, vUv.y ) : vUv;
    vUv = flipY ? vec2( vUv.x, 1.0 - vUv.y ) : vUv;
#endif
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}
