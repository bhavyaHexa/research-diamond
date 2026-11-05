// Three.js r152 ShaderChunk "iridescence_pars_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif
