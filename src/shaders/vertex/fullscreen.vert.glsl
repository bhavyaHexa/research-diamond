// Stage: vertex. Used by: Fullscreen triangle/quad for every post pass (also 32, 34).
// Source: public/shaders/bundle-0.8.0.mjs, character offset 955076. Body copied unchanged.
		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}
