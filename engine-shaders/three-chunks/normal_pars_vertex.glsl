// Three.js r152 ShaderChunk "normal_pars_vertex" — identical to stock r152 (ignoring comments/whitespace)

#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif
