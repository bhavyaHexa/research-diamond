// Three.js r152 ShaderChunk "metalnessmap_fragment" — identical to stock r152 (ignoring comments/whitespace)

float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif
