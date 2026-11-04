// Stage: fragment. Used by: Copy / opacity pass.
// Source: public/shaders/bundle-0.8.0.mjs, character offset 955247. Body copied unchanged.
		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );
			gl_FragColor.a *= opacity;


		}
