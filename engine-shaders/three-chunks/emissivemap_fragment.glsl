// Three.js r152 ShaderChunk "emissivemap_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif
