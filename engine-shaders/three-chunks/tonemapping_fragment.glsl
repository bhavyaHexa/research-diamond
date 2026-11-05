// Three.js r152 ShaderChunk "tonemapping_fragment" — identical to stock r152 (ignoring comments/whitespace)

#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif
