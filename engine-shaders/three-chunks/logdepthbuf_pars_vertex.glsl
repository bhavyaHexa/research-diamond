// Three.js r152 ShaderChunk "logdepthbuf_pars_vertex" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		varying float vFragDepth;
		varying float vIsPerspective;
	#else
		uniform float logDepthBufFC;
	#endif
#endif
