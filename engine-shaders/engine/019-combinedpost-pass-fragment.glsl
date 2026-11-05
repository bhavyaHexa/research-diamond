// CombinedPost pass fragment
// group: Frame & pass infrastructure   stage: fragment
// role: class aa: the single final full-screen pass; extensions inject tone mapping etc.
// owner (minified): aa
// source: bundle-0.8.0.mjs, character offset 1246131 (original minified file on branch main)
// note: `${e[0]}` / `${e[1]}` are the app-supplied declarations and body of the optional screen shader (empty in this app).

varying vec2 vUv;
/*${e[0]}*/ void main()  {
	gl_FragColor = tDiffuseTexelToLinear (texture2D(tDiffuse, vUv));
#glMarker
	/*${e[1]}*/ gl_FragColor.rgb *= gl_FragColor.a;
	// premultiply alpha
}
