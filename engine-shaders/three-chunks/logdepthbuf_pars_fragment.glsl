// Three.js r152 ShaderChunk "logdepthbuf_pars_fragment" — identical to stock r152 (ignoring comments/whitespace)

#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif
