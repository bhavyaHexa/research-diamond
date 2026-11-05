// Three.js r152 ShaderChunk "output_fragment" — MODIFIED by the engine (differs from stock r152)

#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha + 0.1;
diffuseColor.a = min(max(diffuseColor.a, 0.), 1.);
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );
