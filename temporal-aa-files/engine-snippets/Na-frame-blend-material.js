Na = class Na extends Mt{constructor(e){super({vertexShader:n.vertexShader,fragmentShader:t.glsl`
                uniform vec4 weight;
                uniform vec4 weight2;
                varying vec2 vUv;
                void main() {
                    vec4 texel = clamp(weight * tDiffuseTexelToLinear ( texture2D( tDiffuse, vUv ) ) + weight2 * tDiffuse2TexelToLinear ( texture2D( tDiffuse2, vUv ) ), vec4(0), vec4(8));
                    gl_FragColor = texel;
                    #include <encodings_fragment>
                }
