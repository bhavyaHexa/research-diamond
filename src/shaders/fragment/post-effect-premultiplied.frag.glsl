// Stage: fragment. Used by: Post-effect base template, premultiplied alpha.
// Source: public/shaders/bundle-0.8.0.mjs, character offset 1246116. Body copied unchanged.
                varying vec2 vUv;
                ${e[0]}
                void main() {
                    gl_FragColor = tDiffuseTexelToLinear (texture2D(tDiffuse, vUv));
                    #glMarker
                    ${e[1]}
                    
                    gl_FragColor.rgb *= gl_FragColor.a; // premultiply alpha
                }
