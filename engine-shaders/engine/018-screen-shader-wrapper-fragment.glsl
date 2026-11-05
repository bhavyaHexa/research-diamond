// Screen-shader wrapper fragment
// group: Frame & pass infrastructure   stage: fragment
// role: function sa: wraps the app's optional `screenShader`
// owner (minified): sa
// source: bundle-0.8.0.mjs, character offset 1245413 (original minified file on branch main)
// note: `${e[0]}` / `${e[1]}` are the app-supplied declarations and body of the optional screen shader (empty in this app).

varying vec2 vUv;
/*${e[0]}*/ void main()  {
	gl_FragColor = tDiffuseTexelToLinear (texture2D(tDiffuse, vUv));
	/*${e[1]}*/
}
