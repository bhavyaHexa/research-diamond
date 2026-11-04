// Stage: fragment. Used by: Equirect environment to texture.
// Source: public/shaders/bundle-0.8.0.mjs, character offset 574388. Body copied unchanged.
			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
