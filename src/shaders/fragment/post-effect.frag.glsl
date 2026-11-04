// Stage: fragment. Used by: Post-effect base template (placeholders filled at runtime).
// Source: public/shaders/bundle-0.8.0.mjs, character offset 1245398. Body copied unchanged.
                       varying vec2 vUv;
                       
                       ${Array.isArray(e)?e[0]:e?.pars||""}
                       
                       void main() {

                            gl_FragColor = tDiffuseTexelToLinear (texture2D(tDiffuse, vUv));
                            
                            ${Array.isArray(e)?e[1]:"string"==typeof e?e:e?.main||""}
                            
                        }
