// Three.js r152 ShaderChunk "alphatest_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_ALPHATEST
	if ( diffuseColor.a < alphaTest ) discard;
#endif
