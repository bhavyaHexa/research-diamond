// Three.js r152 ShaderChunk "specularmap_fragment" — identical to stock r152 (ignoring comments/whitespace)

float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif
