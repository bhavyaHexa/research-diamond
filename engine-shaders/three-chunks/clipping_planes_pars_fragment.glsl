// Three.js r152 ShaderChunk "clipping_planes_pars_fragment" — identical to stock r152 (ignoring comments/whitespace)

#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif
