// Three.js r152 ShaderChunk "map_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_MAP
	diffuseColor *= texture2D( map, vMapUv );
#endif
