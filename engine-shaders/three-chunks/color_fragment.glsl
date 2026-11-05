// Three.js r152 ShaderChunk "color_fragment" — identical to stock r152 (ignoring comments/whitespace)

#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif
