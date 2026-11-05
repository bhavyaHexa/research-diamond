// SSAO material injection (AO multiply)
// group: Screen-space effects   stage: fragment injection
// role: string patch applied to MeshStandardMaterial2 (beforeModulation marker)
// owner (minified): Ta
// source: bundle-0.8.0.mjs, character offset 1268942 (original minified file on branch main)

#ifndef USE_TRANSMISSION
#if defined(SSAO_ENABLED) && SSAO_ENABLED > 0
float ambientOcclusion=tSSAOMapTexelToLinear(texture2D(tSSAOMap,viewToScreen(vViewPosition.xyz).xy)).r;
reflectedLight.indirectDiffuse*=ambientOcclusion;
#if defined( USE_ENVMAP )
float dotNV=saturate(dot(geometry.normal,geometry.viewDir));
reflectedLight.indirectSpecular*=computeSpecularOcclusion(dotNV,ambientOcclusion,material.roughness);
#endif
#else
#include <aomap_fragment>
#endif
#endif
