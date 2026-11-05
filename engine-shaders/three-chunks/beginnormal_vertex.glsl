// Three.js r152 ShaderChunk "beginnormal_vertex" — identical to stock r152 (ignoring comments/whitespace)

vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif
