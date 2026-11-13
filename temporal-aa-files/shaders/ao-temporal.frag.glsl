// Stage: fragment. Used by: Temporal reprojection of AO / SSGI.
// Source: public/shaders/bundle-0.8.0.mjs, character offset 1411634. Body copied unchanged.
varying vec2 vUv;

${fc}
${pc}
${Ca}
${hc}
${n}

${dc}

${Bc}

uniform sampler2D tLastThis;void main(){vec4 texel=tDiffuseTexelToLinear(texture2D(tDiffuse,vUv));vec4 lastAO=tLastThisTexelToLinear(texture2D(tLastThis,vUv));float depth;vec3 normal;getDepthNormal(vUv,depth,normal);if(depth>=0.999){discard;}float viewZ=depthToViewZ(depth);vec3 screenPos=vec3(vUv.x,vUv.y,viewZ);vec3 viewPos=screenToView(screenPos.xy,screenPos.z);viewPos.z=viewZ/viewPos.z;vec4 ao=vec4(0.);ao+=calculateSSR(8.,screenPos,normal,1.,0.1);ao.rgb=min(vec3(3.),ao.rgb);ao.rgb=max(vec3(0.),ao.rgb);if(frameCount<1.){gl_FragColor=ao;return;}if(ao.a<0.01){gl_FragColor.rgb=lastAO.rgb;gl_FragColor.a=(((lastAO.a)*frameCount)/(frameCount+1.));}else{gl_FragColor=((ao+(lastAO)*frameCount)/(frameCount+1.));}
#include <encodings_fragment>
}
