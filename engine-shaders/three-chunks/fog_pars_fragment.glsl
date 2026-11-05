// Three.js r152 ShaderChunk "fog_pars_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
