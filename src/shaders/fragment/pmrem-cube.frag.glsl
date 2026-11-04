// Stage: fragment. Used by: Cube environment to texture.
// Source: public/shaders/bundle-0.8.0.mjs, character offset 576115. Body copied unchanged.
			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
