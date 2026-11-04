// Stage: fragment. Used by: Composite transparent layer over the depth buffer (template).
// Source: public/shaders/bundle-0.8.0.mjs, character offset 2126224. Body copied unchanged.
        ${kt}
        
        uniform float opacity;

		uniform sampler2D tDiffuse;
		uniform sampler2D tTransparentMap;

		varying vec2 vUv;

		void main() {
		
            float depth = getDepth(vUv);
            vec4 texel;
            if(depth>0.9999) {
			    texel = texture2D( tTransparentMap, vUv );
                if(texel.a < 0.01) discard; // background
                // transparent objects with render to depth = false
            }else {
                texel = texture2D( tDiffuse, vUv );
			}
            gl_FragColor = texel;
            
		}
