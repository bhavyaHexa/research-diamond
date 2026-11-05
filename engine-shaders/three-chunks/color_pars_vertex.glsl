// Three.js r152 ShaderChunk "color_pars_vertex" — identical to stock r152 (ignoring comments/whitespace)

#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	varying vec3 vColor;
#endif
