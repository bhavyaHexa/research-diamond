// Three.js r152 ShaderChunk "roughnessmap_fragment" — identical to stock r152 (ignoring comments/whitespace)

float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif
