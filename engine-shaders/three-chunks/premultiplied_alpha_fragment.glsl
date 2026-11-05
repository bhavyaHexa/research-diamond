// Three.js r152 ShaderChunk "premultiplied_alpha_fragment" — identical to stock r152 (ignoring comments/whitespace)

#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif
