// CopyShader fragment
// group: Frame & pass infrastructure   stage: fragment
// role: EffectComposer copy pass (tDiffuse × opacity)
// owner (minified): n
// source: bundle-0.8.0.mjs, character offset 955262 (original minified file on branch main)

uniform float opacity;
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main()  {
	gl_FragColor = texture2D( tDiffuse, vUv );
	gl_FragColor.a *= opacity;
}
