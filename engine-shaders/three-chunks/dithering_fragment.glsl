// Three.js r152 ShaderChunk "dithering_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif
