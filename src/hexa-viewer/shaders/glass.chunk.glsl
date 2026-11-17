// Glass, inlined into a MeshPhysicalMaterial after its lighting (see glass.ts).
//
// The material's own lighting supplies the reflection off the front surface (environment and lights, Fresnel from the
// IOR; diffuse is black). This function adds what happens INSIDE the glass, following the view ray through the REAL
// geometry, which is hollow (the cavity is modelled). Along a ray the surfaces are, from the camera:
//   front 1  outer surface, nearest (this fragment)
//   back 1   the inner wall's near side, or the outer far side where there is no cavity (solid rim)
//   front 2  the inner wall's far side            } only where the ray crosses the cavity
//   back 2   the outer far side                   }
// The ray refracts in at front 1, crosses the wall, leaves at back 1; across a cavity it travels the air gap, enters
// the far wall at front 2, crosses it and leaves at back 2. Each surface uses its own normal, so the bending comes
// from the real shape. Where it ends up on screen, the scene without glass (tRefraction) gives the colour behind.
// Beer-Lambert absorption tints it by the glass path length; a ray that cannot leave (total internal reflection)
// shows the environment instead. The result is premultiplied: alpha is how much of the page behind stays hidden,
// so the glass composites correctly over a white page and over a transparent background.
uniform sampler2D tGlassBack;      // back 1: r = view depth - glassDepthRef, gb = outward normal xy, a = covered
uniform sampler2D tFront2;         // front 2
uniform sampler2D tBack2;          // back 2
uniform sampler2D tRefraction;     // the scene without glass (premultiplied by coverage)
uniform vec2 glassResolution;
uniform mat4 glassProjection;      // the jittered camera projection
uniform vec3 glassPage;            // linear colour of the page behind (black when the background is transparent)
uniform float glassDepthRef;
uniform vec3 glassTint;
uniform float glassDensity;        // absorption per unit of glass path
uniform float glassIor;
uniform float glassRefraction;     // how far behind the glass the refracted ray looks
uniform float glassReflection;     // strength of the reflection
uniform float glassBounces;        // strength of the secondary internal reflections (the second images)
uniform float glassBlur;           // roughness of the environment lookups inside the glass (0 = a mirror, higher = soft scatter)
uniform vec3 glassFade;           // reflection copy only: ground height, fade length, strength (length 0 = a normal glass)
uniform float glassCrease;         // strength of the bright and dark lines along bevels and facet edges

float glassFresnel(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}

// Normal of a stored layer; `side` is +1 for surfaces facing the camera, -1 for those facing away.
vec3 glassNormal(vec4 layer, float side) {
  return vec3(layer.g, layer.b, side * sqrt(max(0.0, 1.0 - dot(layer.gb, layer.gb))));
}

vec4 glassShade(vec3 reflection, vec3 N, vec3 P) {
  vec3 incident = normalize(P);    // camera -> surface, view space
  float cosI = clamp(dot(N, -incident), 0.0, 1.0);
  float f0 = pow((glassIor - 1.0) / (glassIor + 1.0), 2.0);
  float fresnel = glassFresnel(cosI, f0);

  vec2 uv = gl_FragCoord.xy / glassResolution;
  vec4 back1 = texture2D(tGlassBack, uv);
  vec4 front2 = texture2D(tFront2, uv);
  vec4 back2 = texture2D(tBack2, uv);
  float frontDepth = -P.z;
  bool hasBack = back1.a > 0.5;
  float backDepth = back1.r + glassDepthRef;
  vec3 backNormal = hasBack ? glassNormal(back1, -1.0) : -N;

  // Wall 1: in at the outer surface, out at back 1.
  vec3 inRay = refract(incident, N, 1.0 / glassIor);
  float path = hasBack ? max(backDepth - frontDepth, 0.0) / max(abs(inRay.z), 0.15) : 0.3;
  vec3 exitPos = P + inRay * path;
  vec3 outRay = refract(inRay, -backNormal, glassIor);                  // zero vector on total internal reflection
  bool trapped = dot(outRay, outRay) < 0.5;
  float exitFresnel = trapped ? 1.0 : glassFresnel(dot(outRay, backNormal), f0);
  float transmitted = 1.0 - fresnel;
  float thickness = path;
  vec3 lastIn = inRay;
  vec3 lastNormal = backNormal;

  // Across a cavity: the air gap, the far wall in at front 2 and out at back 2.
  bool cavity = hasBack && !trapped && front2.a > 0.5 && back2.a > 0.5 && front2.r + glassDepthRef > backDepth - 0.001;
  if (cavity) {
    float frontDepth2 = front2.r + glassDepthRef;
    vec3 farWallPos = exitPos + outRay * (max(frontDepth2 + exitPos.z, 0.0) / max(abs(outRay.z), 0.15));
    vec3 farWallNormal = glassNormal(front2, 1.0);
    vec3 inRay2 = refract(outRay, farWallNormal, 1.0 / glassIor);
    float path2 = max(back2.r + glassDepthRef - frontDepth2, 0.0) / max(abs(inRay2.z), 0.15);
    vec3 backNormal2 = glassNormal(back2, -1.0);
    vec3 outRay2 = refract(inRay2, -backNormal2, glassIor);
    float enterFresnel = glassFresnel(dot(-outRay, farWallNormal), f0);
    transmitted *= (1.0 - exitFresnel) * (1.0 - enterFresnel);
    thickness += path2;
    exitPos = farWallPos + inRay2 * path2;
    trapped = dot(outRay2, outRay2) < 0.5;
    exitFresnel = trapped ? 1.0 : glassFresnel(dot(outRay2, backNormal2), f0);
    outRay = outRay2;
    lastIn = inRay2;
    lastNormal = backNormal2;
  }

  vec3 absorb = pow(max(glassTint, vec3(0.001)), vec3(glassDensity * thickness));

  // Refracted branch: what is behind, at the place the ray lands on screen. A ray bent far from the view direction
  // no longer looks at the backdrop but at the studio around it, which gives glass its dark and bright outlines.
  vec4 clip = glassProjection * vec4(exitPos + outRay * glassRefraction, 1.0);
  vec4 behind = texture2D(tRefraction, clamp(clip.xy / clip.w * 0.5 + 0.5, 0.001, 0.999));
  #if defined( USE_ENVMAP )
    vec3 around = trapped ? vec3(0.0) : getIBLRadiance(outRay, -outRay, glassBlur);
  #else
    vec3 around = vec3(0.0);
  #endif
  float bent = trapped ? 0.0 : smoothstep(0.08, 0.5, 1.0 - dot(outRay, incident));
  vec3 seen = mix(behind.rgb, around, bent);
  float seenAlpha = mix(behind.a, 1.0, bent);
  float minAbsorb = min(absorb.r, min(absorb.g, absorb.b));
  // The part of the tint the alpha blend cannot express (alpha uses the weakest channel) is added as colour.
  vec3 refracted = transmitted * absorb * seen + transmitted * (absorb - minAbsorb) * (1.0 - seenAlpha) * glassPage;
  float refractedAlpha = 1.0 - transmitted * minAbsorb * (1.0 - seenAlpha);

  // The last interface reflects part of the light back inside (and all of it where the ray cannot leave).
  vec3 bounce = reflect(lastIn, -lastNormal);
  #if defined( USE_ENVMAP )
    vec3 farReflection = getIBLRadiance(bounce, -bounce, glassBlur) * absorb;
  #else
    vec3 farReflection = vec3(0.0);
  #endif
  vec3 inside = mix(refracted, farReflection, exitFresnel);
  float alpha = mix(refractedAlpha, 1.0, exitFresnel);

  // Second internal bounce: back off the front wall's inner side and on again. Weighted by both reflections, so it
  // only shows along the edges, where the reflectance is high: the faint second images of a thick bottle.
  vec3 bounceTwo = reflect(bounce, N);
  #if defined( USE_ENVMAP )
    vec3 secondary = getIBLRadiance(bounceTwo, -bounceTwo, glassBlur) * absorb * absorb;
  #else
    vec3 secondary = vec3(0.0);
  #endif
  float secondaryWeight = glassBounces * 0.1 * exitFresnel * fresnel;
  inside += secondary * secondaryWeight;
  alpha = mix(alpha, 1.0, clamp(secondaryWeight * 3.0, 0.0, 1.0));

  // Bevels and facet edges: where the surface normal changes fast from pixel to pixel the glass catches the studio
  // as a thin bright or dark line. Reflection is boosted there and the line is made opaque so it shows on white.
  // (Not at grazing angles: the silhouette always turns the normal fast and is handled by the edge reflections.)
  float crease = glassCrease * smoothstep(0.04, 0.25, length(fwidth(N))) * smoothstep(0.3, 0.6, cosI);
  alpha = max(alpha, 0.7 * min(crease, 1.0));
  vec4 result = vec4(reflection * glassReflection * (1.0 + 6.0 * crease) + inside, alpha);
  if (glassFade.y > 0.0) {
    // The mirror image under the floor fades out with distance from it, like a reflection in a glossy floor.
    float depthBelow = max(glassFade.x - (inverse(viewMatrix) * vec4(P, 1.0)).y, 0.0);
    result *= glassFade.z * exp(-depthBelow / glassFade.y);
  }
  return result;
}
