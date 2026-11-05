// Three.js r152 ShaderChunk "displacementmap_vertex" — identical to stock r152 (ignoring comments/whitespace)

#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif
