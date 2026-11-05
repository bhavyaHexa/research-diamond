# Engine Shaders — every GLSL program in the engine bundle

Source: `vendor/engine-0.8.0/bundle-0.8.0.mjs` (branch `main`; on `r3f-dev` the same code is split into `src/engine/*.mjs`). Extracted with a real JavaScript parser (not text search), then formatted. Nothing was rewritten.

**Evidence:** the GLSL is ✅ verbatim from the bundle (formatting adds only line breaks and indentation; I checked that every shader has *exactly* the same tokens before and after formatting). The **names and groupings** are 🔶 inferred from the enclosing class or plugin, because the bundle is minified (e.g. `class Ra`).

**Files:** every shader below is also a file in [`engine-shaders/`](engine-shaders/) — `engine/` (the engine's own programs), `three-chunks/` (all 137 Three.js chunks) and `three-chunks-modified-by-engine/` (the 11 the engine changed).

## 1. What is in the bundle

| Kind | Count | Where |
|---|---:|---|
| Engine-authored shader strings (programs, snippets, injections) | 105 | section 3 |
| Three.js r152 ShaderChunks (built-in shader library) | 137 | section 4 |
| …of which **modified by the engine** | 11 | section 4.1 |
| …identical to stock r152 | 126 | section 4.2 |
| Total engine GLSL shown in this file | 124 k characters | |

## 2. How the shaders reach the GPU (so you know what you are reading)

There are five different kinds of shader text in this bundle. Knowing which kind you are looking at explains why some are not complete programs.

| Kind | What it is | Examples here |
|---|---|---|
| **A. Standalone program** | A `vertexShader` + `fragmentShader` pair given to a `ShaderMaterial`. Complete GLSL. | Diamond, normal-capture, G-buffer, bloom, SSAO, SSR… |
| **B. Full-screen pass** | A program drawn over a quad that reads earlier render targets (`tDiffuse`, `tNormalDepth`…). Uses the shared fullscreen vertex shader `Ea`. | SSAO, SSR, bloom, TAA, DoF, combined post |
| **C. Material extension** | Not a program. Three parts that are **string-patched into a stock Three material** at compile time: `parsFragmentSnippet` (declarations inserted before `void main()`), `extraUniforms`, and `shaderExtender` (text replaced inside `main`). | tone mapping, SSAO multiply, SSR blend on the gold, anisotropy, clipping |
| **D. Shared snippet** | A string constant included by many programs through `${…}`. | `kt` (G-buffer unpack), `Ca` (random), `Sa`/`pc` (camera), `Ea` |
| **E. Three.js chunk patch** | The engine edits 11 of Three's built-in chunks when it loads (rotation of the environment, camera-fixed environment, RGBM helpers…). | section 4.1 |

**Markers.** `#glMarker NAME` lines are hooks that the engine's material code inserts into Three's `MeshPhysicalMaterial` shader (`mainStart`, `beforeAccumulation`, `beforeModulation`, `afterModulation`) and later turns into comments. **Runtime helpers.** Colour-space decode helpers such as `tDiffuseTexelToLinear( vec4 )` are generated at runtime (e.g. `RGBMToLinear( value, 16.0 )`), so they do not appear as literals.

**Placeholders.** `/*${…}*/` marks a value only known at runtime (an app-supplied string, a plugin option); each one is explained in a note under the shader.

## 3. Engine shaders, by role

### 3.1 Materials

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 58 | [Diamond normal-capture vertex](#shader-58) | vertex | `tl` | 352 |
| 59 | [Diamond normal-capture fragment](#shader-59) | fragment | `tl` | 211 |
| 60 | [Diamond material vertex](#shader-60) | vertex | `ll` | 427 |
| 61 | [Diamond material fragment](#shader-61) | fragment | `ll` | 8419 |

### 3.2 G-buffer

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 15 | [G-buffer vertex](#shader-15) | vertex | `Pt` | 767 |
| 16 | [G-buffer fragment](#shader-16) | fragment | `Pt` | 1539 |
| 17 | [G-buffer unpack snippet (kt)](#shader-17) | shared snippet | `kt` | 1053 |

### 3.3 Screen-space effects

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 24 | [SSAO bilateral blur fragment](#shader-24) | fragment | `xa` | 1452 |
| 28 | [SSAO fragment](#shader-28) | fragment | `Ta` | 6401 |
| 29 | [SSAO material injection (AO multiply)](#shader-29) | fragment injection | `Ta` | 466 |
| 30 | [SSAO material declarations](#shader-30) | snippet | `Ta` | 384 |
| 46 | [SSGI fragment](#shader-46) | fragment | `_c` | 9383 |
| 47 | [SSGI material declarations](#shader-47) | snippet | `_c` | 438 |
| 48 | [SSR core: ray march + GGX ray sampling (Bc)](#shader-48) | shared snippet | `Bc` | 2040 |
| 49 | [SSR pass fragment](#shader-49) | fragment | `? / Oc` | 9097 |
| 50 | [SSR material declarations](#shader-50) | fragment declarations | `? / Oc` | 165 |
| 56 | [Contact shadows: getShadow override](#shader-56) | fragment injection | `s` | 1052 |
| 57 | [Contact shadows: declarations + helpers](#shader-57) | fragment injection | `a / ?` | 5101 |
| 64 | [Velocity buffer vertex](#shader-64) | vertex | `Dp` | 848 |
| 65 | [Velocity buffer fragment](#shader-65) | fragment | `Dp` | 860 |
| 69 | [TAA fragment](#shader-69) | fragment | `Kp` | 5665 |
| 70 | [SSBevel fragment](#shader-70) | fragment | `? / lh` | 3599 |
| 71 | [SSBevel material declarations](#shader-71) | snippet | `?` | 308 |
| 72 | [SSBevel edge-detect fragment](#shader-72) | fragment | `? / lh` | 2396 |
| 73 | [SSBevel separable blur fragment](#shader-73) | fragment | `? / lh` | 778 |

### 3.4 Tone mapping & post-processing

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 20 | [Tonemap declarations + ToneMapping()](#shader-20) | snippet | `?` | 2471 |
| 21 | [Tonemap injection](#shader-21) | fragment injection | `? / ma` | 41 |
| 22 | [Chromatic aberration declarations](#shader-22) | snippet | `?` | 395 |
| 23 | [Chromatic aberration injection](#shader-23) | fragment injection | `? / ba` | 47 |
| 31 | [Bloom fragment (5 PASS_STEP variants)](#shader-31) | fragment | `? / Ra` | 1473 |
| 32 | [Depth-of-field composite fragment](#shader-32) | fragment | `Oa` | 2087 |
| 33 | [DoF weighted separable blur](#shader-33) | fragment | `Ua` | 1577 |
| 34 | [DoF circular (bokeh) blur](#shader-34) | fragment | `Ua` | 1164 |
| 35 | [DoF compute circle-of-confusion](#shader-35) | fragment | `Fa` | 600 |
| 36 | [DoF expand circle-of-confusion](#shader-36) | fragment | `Fa` | 2102 |
| 39 | [Film grain declarations](#shader-39) | snippet | `?` | 376 |
| 40 | [Film grain injection](#shader-40) | fragment injection | `? / ao` | 45 |
| 62 | [Vignette declarations](#shader-62) | snippet | `?` | 204 |
| 63 | [Vignette injection](#shader-63) | fragment injection | `? / Mp` | 48 |
| 66 | [LUT declarations](#shader-66) | fragment declarations | `? / Up` | 2615 |
| 67 | [LUT injection](#shader-67) | fragment injection | `? / Up` | 226 |
| 74 | [Gamma / sRGB injection](#shader-74) | fragment injection | `dh` | 52 |

### 3.5 Frame & pass infrastructure

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 12 | [CopyShader vertex](#shader-12) | vertex | `n` | 120 |
| 13 | [CopyShader fragment](#shader-13) | fragment | `n` | 157 |
| 14 | [BlendPass fragment](#shader-14) | snippet | `It` | 346 |
| 18 | [Screen-shader wrapper fragment](#shader-18) | fragment | `sa` | 125 |
| 19 | [CombinedPost pass fragment](#shader-19) | fragment | `aa` | 193 |
| 37 | [Frame blend fragment (Progressive accumulation)](#shader-37) | snippet | `Na` | 299 |

### 3.6 Shared snippets

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 25 | [Fullscreen vertex (Ea)](#shader-25) | shared snippet | `Ea` | 107 |
| 26 | [Random helpers (Ca)](#shader-26) | shared snippet | `Ca` | 719 |
| 27 | [Simple camera helpers (Sa)](#shader-27) | shared snippet | `Sa` | 277 |
| 45 | [Basic camera helpers (pc)](#shader-45) | shared snippet | `pc` | 1025 |
| 900 | [Tangent basis + GGX/BRDF sampling helpers (hc)](#shader-900) | shared snippet | `var:hc` | 1264 |
| 901 | [SSRT parameters snippet (dc)](#shader-901) | shared snippet | `var:dc` | 1980 |
| 902 | [Basic helpers (fc)](#shader-902) | shared snippet | `var:fc` | 181 |

### 3.7 Material extensions

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 38 | [Thin-film: voronoise helper](#shader-38) | fragment declarations | `? / qa` | 1256 |
| 43 | [Custom bump map: declarations](#shader-43) | fragment declarations | `?` | 2146 |
| 44 | [Custom bump map: vertex injection](#shader-44) | vertex injection | `?` | 138 |
| 51 | [Anisotropy extension](#shader-51) | fragment injection | `a` | 2947 |
| 53 | [Fragment clipping: declarations](#shader-53) | snippet | `?` | 1607 |
| 54 | [Fragment clipping: injection](#shader-54) | fragment injection | `e.fragmentShader` | 772 |
| 68 | [Noise bump: voronoi helper](#shader-68) | fragment declarations | `? / Wp` | 1727 |
| 75 | [Triplanar UV: varyings](#shader-75) | fragment injection | `s` | 87 |
| 76 | [Triplanar UV: functions](#shader-76) | fragment injection | `o` | 1125 |
| 78 | [Triplanar UV: bump variant](#shader-78) | fragment injection | `c` | 1180 |
| 79 | [Clearcoat tint declarations](#shader-79) | fragment declarations | `? / yh` | 405 |
| 106 | [Bump-map extension (normal patch)](#shader-106) | fragment injection | `?` | 88 |

### 3.8 Ground, background & shadows

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 55 | [HDRi ground-projected background fragment](#shader-55) | fragment | `? / Kc` | 847 |
| 81 | [Ground shadow: vertex position patch](#shader-81) | vertex injection | `Ig` | 62 |
| 82 | [Ground shadow: vertex](#shader-82) | vertex injection | `Ig` | 43 |
| 83 | [Ground shadow: fragment (reads tLastThis)](#shader-83) | fragment injection | `Ig` | 61 |
| 84 | [Ground shadow: colour/alpha from shadow mask](#shader-84) | fragment injection | `Ig` | 66 |
| 85 | [Ground shadow: dithered shadow colour](#shader-85) | snippet | `Ig` | 352 |
| 86 | [Ground extension: transitionOpacity](#shader-86) | snippet | `kg` | 32 |
| 87 | [Ground extension: AO alpha modulation](#shader-87) | fragment injection | `e.fragmentShader` | 372 |
| 88 | [Ground extension: alpha vignette](#shader-88) | fragment injection | `e.fragmentShader` | 518 |
| 89 | [Ground shadow depth blur fragment](#shader-89) | fragment | `kg` | 452 |
| 90 | [Planar reflection: vertex injection](#shader-90) | vertex injection | `Dg` | 66 |
| 91 | [Planar reflection: vertex declarations](#shader-91) | vertex declarations | `Dg` | 51 |
| 92 | [Planar reflection: fragment declarations](#shader-92) | fragment declarations | `Dg` | 1362 |
| 98 | [Contact-shadow ground fragment](#shader-98) | fragment | `oE` | 1458 |
| 99 | [Horizontal blur vertex](#shader-99) | vertex | `mE` | 120 |
| 100 | [Horizontal blur fragment](#shader-100) | fragment | `mE` | 763 |
| 101 | [Vertical blur vertex](#shader-101) | vertex | `_E` | 120 |
| 102 | [Vertical blur fragment](#shader-102) | fragment | `_E` | 763 |
| 103 | [Contact-shadow depth-material patch](#shader-103) | fragment injection | `gE` | 148 |

### 3.9 Utility & debug

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 41 | [Fat line vertex (Line2)](#shader-41) | vertex | `r.Vj0.line` | 4705 |
| 42 | [Fat line fragment (Line2)](#shader-42) | fragment | `r.Vj0.line` | 2755 |
| 80 | [Debug texture overlay fragment](#shader-80) | fragment | `_d` | 307 |
| 93 | [Outline declarations](#shader-93) | snippet | `?` | 2474 |
| 95 | [Outline injection](#shader-95) | fragment injection | `? / Xx` | 47 |
| 96 | [Outline normal pass vertex](#shader-96) | vertex | `n / Yx` | 490 |
| 97 | [Outline normal pass fragment](#shader-97) | fragment | `n / Yx` | 527 |

### 3.10 Three.js internals

| # | Shader | Stage | Owner (minified) | Chars |
|---:|---|---|---|---:|
| 0 | [ShaderMaterial default vertex shader](#shader-0) | vertex | `ks / __webpackgi_modules__` | 91 |
| 1 | [ShaderMaterial default fragment shader](#shader-1) | fragment | `ks / __webpackgi_modules__` | 60 |
| 2 | [Equirect→cube vertex (PMREM helper)](#shader-2) | shared snippet | `n / Us` | 276 |
| 3 | [Equirect→cube fragment (PMREM helper)](#shader-3) | shared snippet | `i / Us` | 233 |
| 4 | [PMREM blur vertex](#shader-4) | vertex | `da` | 945 |
| 5 | [PMREM blur fragment](#shader-5) | fragment | `da` | 1230 |
| 6 | [PMREM equirect→CubeUV vertex](#shader-6) | vertex | `_a / __webpackgi_modules__` | 945 |
| 7 | [PMREM equirect→CubeUV fragment](#shader-7) | fragment | `_a / __webpackgi_modules__` | 295 |
| 8 | [PMREM cube→CubeUV vertex](#shader-8) | vertex | `ga / __webpackgi_modules__` | 945 |
| 9 | [PMREM cube→CubeUV fragment](#shader-9) | fragment | `ga / __webpackgi_modules__` | 250 |
| 10 | [VSM shadow pass vertex](#shader-10) | shared snippet | `dc / __webpackgi_modules__` | 54 |
| 11 | [VSM shadow pass fragment](#shader-11) | shared snippet | `fc / __webpackgi_modules__` | 1046 |

---

## Code — Materials

<a id="shader-58"></a>
### 58. Diamond normal-capture vertex

- **Stage:** vertex  ·  **Role:** class tl (DiamondPlugin bake)
- **Owner (minified):** `tl`  ·  **Source:** character offset 1454313
- **Uniforms:** `offsetMatrixInv : mat4`, `offsetCenter : vec3`

```glsl
varying vec3 vNormal;
varying vec3 vecPosition;
uniform mat4 offsetMatrixInv;
uniform vec3 offsetCenter;
void main() {
	vNormal=normalize((offsetMatrixInv*vec4(normal,0.)).xyz);
	vecPosition=(modelMatrix*offsetMatrixInv*vec4(position-offsetCenter,1.)).xyz;
	gl_Position=projectionMatrix*modelViewMatrix*offsetMatrixInv*vec4(position-offsetCenter,1.);
}
```

<a id="shader-59"></a>
### 59. Diamond normal-capture fragment

- **Stage:** fragment  ·  **Role:** writes normal (rgb) + distance (a) into the cube
- **Owner (minified):** `tl`  ·  **Source:** character offset 1454671
- **Uniforms:** `radius : float`

```glsl
varying vec3 vNormal;
varying vec3 vecPosition;
uniform float radius;
void main() {
	vec3 color=normalize(vNormal);
	color=color*0.5+0.5;
	gl_FragColor=vec4(color.x,color.y,color.z,length(vecPosition)/radius);
}
```

<a id="shader-60"></a>
### 60. Diamond material vertex

- **Stage:** vertex  ·  **Role:** class ll (DiamondMaterial)
- **Owner (minified):** `ll`  ·  **Source:** character offset 1461513
- **Compile-time switches:** `USE_ENVMAP`

```glsl
#ifndef USE_ENVMAP
#define USE_ENVMAP
#endif
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
	vWorldNormal=(modelMatrix*vec4(normal,0.)).xyz;
#include <begin_vertex>
#include <project_vertex>
	vViewPosition=-mvPosition.xyz;
	vNormal=normalize(normalMatrix*normal);
	vUv=uv;
#include <worldpos_vertex>
	vWorldPosition=worldPosition.xyz;
}
```

<a id="shader-61"></a>
### 61. Diamond material fragment

- **Stage:** fragment  ·  **Role:** refraction loop, dispersion, reflection
- **Owner (minified):** `ll`  ·  **Source:** character offset 1461953
- **Uniforms:** `projectionMatrix : mat4`, `tCubeMapNormals : samplerCube`, `envMap : samplerCube`, `envMap : sampler2D`, `envMapIntensity : float`, `modelMatrix : mat4`, `inverseModelMatrix : mat4`, `offsetMatrixInv : mat4`, `modelOffsetMatrix : mat4`, `transmission : float`, `transmissionSamplerSize : vec2`, `transmissionSamplerMap : sampler2D`, `refractiveIndex : float`, `radius : float`, `rIndexDelta : float`, `squashFactor : float`, `geometryFactor : float`, `color : vec3`, `colorCorrection : vec3`, `boostFactors : vec3`, `centerOffset : vec3`, `gammaFactor : float`, `absorptionFactor : float`, `envMapRotation : float`, `reflectivity : float`
- **Compile-time switches:** `ENV_MAP_TYPE`, `USE_ENVMAP`, `FIX_ENV_DIRECTION`, `DIA_ORIENT_ENVMAP`

```glsl
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying vec3 vNormal;
varying vec2 vUv;
uniform mat4 projectionMatrix;
uniform samplerCube tCubeMapNormals;
#if ENV_MAP_TYPE == 0
uniform samplerCube envMap;
#elif ENV_MAP_TYPE == 1
uniform sampler2D envMap;
#endif
uniform float envMapIntensity;
uniform mat4 modelMatrix;
uniform mat4 inverseModelMatrix;
uniform mat4 offsetMatrixInv;
uniform mat4 modelOffsetMatrix;
uniform float transmission;
uniform vec2 transmissionSamplerSize;
uniform sampler2D transmissionSamplerMap;
uniform float refractiveIndex;
uniform float radius;
uniform float rIndexDelta;
uniform float squashFactor;
uniform float geometryFactor;
uniform vec3 color;
uniform vec3 colorCorrection;
uniform vec3 boostFactors;
uniform vec3 centerOffset;
uniform float gammaFactor;
uniform float absorptionFactor;
uniform float envMapRotation;
uniform float reflectivity;
vec3 BRDF_Specular_GGX_Environment(const in vec3 viewDir,const in vec3 normal,const in vec3 specularColor,const in float roughness) {
	float dotNV=abs(dot(normal,viewDir));
	const vec4 c0=vec4(-1,-0.0275,-0.572,0.022);
	const vec4 c1=vec4(1,0.0425,1.04,-0.04);
	vec4 r=roughness*c0+c1;
	float a004=min(r.x*r.x,exp2(-9.28*dotNV))*r.x+r.y;
	vec2 AB=vec2(-1.04,1.04)*a004+r.zw;
	return specularColor*AB.x+AB.y;
}
vec2 cartesianToPolar(vec3 n) {
	vec2 uv;
	uv.x=atan(n.z,n.x)/(PI*2.)+0.5;
	uv.y=asin(n.y)/PI+0.5;
	return uv;
}
vec4 sampleEnvMap(vec3 direction) {
#if !defined(USE_ENVMAP)
	return vec4(direction,1);
#else
	float cs=cos(envMapRotation);
	float sn=sin(envMapRotation);
	float temp=cs*direction.x+sn*direction.z;
	direction.z=-sn*direction.x+cs*direction.z;
	direction.x=temp;
	direction.x*=-1.;
	direction.y*=-1.;
	direction.z*=-1.;
#if ENV_MAP_TYPE == 0
	return(textureCube(envMap,direction));
#elif ENV_MAP_TYPE == 1
	return(texture2D(envMap,cartesianToPolar(direction)));
#endif
	return vec4(1,0,1,1);
#endif
}
vec4 SampleSpecularReflection(vec3 direction) {
#if defined(FIX_ENV_DIRECTION)
	direction=(viewMatrix*vec4(direction,0.)).xyz;
#endif
	return envMapIntensity*(sampleEnvMap(direction));
}
vec4 SampleSpecularContribution(vec3 direction) {
#if DIA_ORIENT_ENVMAP < 1
	direction=mat3(modelOffsetMatrix)*direction;
#endif
#if defined(FIX_ENV_DIRECTION)
	direction=(viewMatrix*vec4(direction,0.)).xyz;
#endif
	direction=normalize(direction);
	direction.x*=-1.;
	direction.z*=-1.;
	return envMapIntensity*(sampleEnvMap(direction));
}
vec4 SampleSpecularContributionRef(vec3 origin,int i) {
	vec4 ndcPos=projectionMatrix*viewMatrix*vec4(origin,1.);
	vec2 refractionCoords=ndcPos.xy/ndcPos.w;
	refractionCoords+=1.;
	refractionCoords/=2.;
	return transmissionSamplerMapTexelToLinear(texture2D(transmissionSamplerMap,refractionCoords));
}
vec3 intersectSphere(vec3 origin,vec3 direction) {
	origin-=centerOffset;
	direction.y/=squashFactor;
	float A=dot(direction,direction);
	float B=2.*dot(origin,direction);
	float C=dot(origin,origin)-radius*radius;
	float disc=B*B-4.*A*C;
	if(disc>0.) {
		disc=sqrt(disc);
		float t1=(-B+disc)*geometryFactor/A;
		float t2=(-B-disc)*geometryFactor/A;
		float t=(t1>t2)?t1:t2;
		direction.y*=squashFactor;
		return vec3(origin+centerOffset+direction*t);
	}
	return vec3(0.);
}
vec3 linePlaneIntersect(in vec3 pointOnLine,in vec3 lineDirection,in vec3 pointOnPlane,in vec3 planeNormal) {
	return lineDirection*(dot(planeNormal,pointOnPlane-pointOnLine)/dot(planeNormal,lineDirection))+pointOnLine;
}
vec4 getNormalDistance(vec3 d) {
	return textureCube(tCubeMapNormals,d);
}
vec3 getSurfaceNormal(vec4 surfaceInfos) {
	vec3 surfaceNormal=surfaceInfos.rgb;
	surfaceNormal=surfaceNormal*2.-1.;
	return-normalize(surfaceNormal);
}
vec3 intersect(vec3 rayOrigin,vec3 rayDirection) {
	vec3 sphereHitPoint=intersectSphere(rayOrigin,rayDirection);
	vec3 direction1=normalize(sphereHitPoint-centerOffset);
	vec4 normalDistanceData1=getNormalDistance(direction1);
	float distance1=normalDistanceData1.a*radius;
	vec3 pointOnPlane1=centerOffset+direction1*distance1;
	vec3 planeNormal1=getSurfaceNormal(normalDistanceData1);
	vec3 hitPoint1=linePlaneIntersect(rayOrigin,rayDirection,pointOnPlane1,planeNormal1);
	vec3 direction2=normalize(hitPoint1-centerOffset);
	vec4 normalDistanceData2=getNormalDistance(direction2);
	float distance2=normalDistanceData2.a*radius;
	vec3 pointOnPlane2=centerOffset+direction2*distance2;
	vec3 hitPoint=hitPoint1;
	vec3 planeNormal2=getSurfaceNormal(normalDistanceData2);
	hitPoint=linePlaneIntersect(rayOrigin,rayDirection,pointOnPlane2,planeNormal2);
	return hitPoint;
}
vec3 debugBounces(int count) {
	vec3 color=vec3(1.,1.,1.);
	if(count==1)color=vec3(0.,1.,0.);
	else if(count==2)color=vec3(0.,0.,1.);
	else if(count==3)color=vec3(1.,1.,0.);
	else if(count==4)color=vec3(0.,1.,1.);
	else color=vec3(0.,1.,0.);
	if(count==0)color=vec3(1.,0.,0.);
	return color;
}
vec3 getRefractionColor(vec3 origin,vec3 direction,vec3 normal) {
	vec3 outColor=vec3(0.);
	const float n1=1.;
	const float epsilon=1e-4;
	float f0=(2.4-n1)/(2.4+n1);
	f0*=f0;
	vec3 attenuationFactor=vec3(1.);
	vec3 newDirection=refract(direction,normal,n1/refractiveIndex);
	vec3 brdfRefracted=BRDF_Specular_GGX_Environment(newDirection,-normal,vec3(f0),0.);
	attenuationFactor*=(vec3(1.)-brdfRefracted);
	int count=0;
	newDirection=(offsetMatrixInv*inverseModelMatrix*vec4(newDirection,0.)).xyz;
	newDirection=normalize(newDirection);
	origin=(offsetMatrixInv*inverseModelMatrix*vec4(origin,1.)).xyz;
	for(int i=0;i<RAY_BOUNCES;i++) {
		vec3 intersectedPos=intersect(origin,newDirection);
		vec3 dist=intersectedPos-origin;
		vec3 d=normalize(intersectedPos-centerOffset);
		vec3 mappedNormal=getNormalDistance(d).rgb;
		mappedNormal=2.*mappedNormal-1.;
		mappedNormal=-normalize(mappedNormal);
		float r=length(dist)/radius*absorptionFactor;
		attenuationFactor*=exp(-r*(1.-color));
		origin=intersectedPos;
		vec3 origin2=(modelOffsetMatrix*vec4(intersectedPos,1)).xyz;
		vec3 oldDir=newDirection;
		newDirection=refract(newDirection,mappedNormal,refractiveIndex/n1);
		if(dot(newDirection,newDirection)<epsilon) {
			newDirection=reflect(oldDir,mappedNormal);
			if(i==RAY_BOUNCES-1) {
				vec3 brdfReflected=BRDF_Specular_GGX_Environment(-oldDir,mappedNormal,vec3(f0),0.);
				vec3 d1=mat3(modelOffsetMatrix)*oldDir;
				d1=normalize(d1);
				float cosT=1.-dot(direction,d1);
				outColor+=((transmission>0.&&cosT<transmission)?SampleSpecularContributionRef(origin2+0.5*d1*cosT,i).rgb:SampleSpecularContribution(oldDir).rgb)*attenuationFactor*colorCorrection*boostFactors*(vec3(1.)-brdfReflected);
			}
		} else {
			vec3 brdfRefracted=vec3(1.)-BRDF_Specular_GGX_Environment(newDirection,-mappedNormal,vec3(f0),0.);
			vec3 d1=normalize(mat3(modelOffsetMatrix)*newDirection);
			float cosT=1.-dot(direction,d1);
			if(transmission>0.&&cosT<transmission) {
				outColor+=SampleSpecularContributionRef(origin2+0.5*d1*cosT,i).rgb*brdfRefracted*attenuationFactor*colorCorrection*boostFactors;
			} else {
				vec3 dir0=newDirection;
				vec3 dir1=refract(oldDir,mappedNormal,(refractiveIndex+rIndexDelta)/n1);
				vec3 dir2=refract(oldDir,mappedNormal,(refractiveIndex-rIndexDelta)/n1);
				outColor+=vec3(SampleSpecularContribution(dir1).r,SampleSpecularContribution(dir0).g,SampleSpecularContribution(dir2).b)*brdfRefracted*attenuationFactor*colorCorrection*boostFactors;
			}
			newDirection=reflect(oldDir,mappedNormal);
			vec3 brdfReflected=BRDF_Specular_GGX_Environment(newDirection,mappedNormal,vec3(f0),0.);
			attenuationFactor*=brdfReflected*boostFactors;
			count++;
		}
	}
	return outColor;
}
void main() {
	vec3 normalizedNormal=normalize(vWorldNormal);
	vec3 viewVector=normalize(vWorldPosition-cameraPosition);
	const float n1=1.;
	const float epsilon=1e-4;
	float f0=(2.4-n1)/(2.4+n1);
	f0*=f0;
	vec3 attenuationFactor=vec3(1.);
	vec3 reflectedDirection=reflect(viewVector,normalizedNormal);
	vec3 brdfReflected=BRDF_Specular_GGX_Environment(reflectedDirection,normalizedNormal,vec3(f0),0.);
	vec3 reflectionColor=SampleSpecularReflection(reflectedDirection).rgb*brdfReflected*reflectivity*2.;
	vec3 refractionColor=getRefractionColor(vWorldPosition,viewVector,normalizedNormal);
	vec3 normal=normalize(vNormal);
	vec3 diffuseColor=vec3(1.);
#glMarker beforeAccumulation
	gl_FragColor=vec4((refractionColor.rgb+reflectionColor.rgb)*diffuseColor,1.);
	gl_FragColor.rgb=pow(gl_FragColor.rgb,vec3(gammaFactor));
#include <encodings_fragment>
}
```

## Code — G-buffer

<a id="shader-15"></a>
### 15. G-buffer vertex

- **Stage:** vertex  ·  **Role:** class Pt (GBuffer override material)
- **Owner (minified):** `Pt`  ·  **Source:** character offset 1064597
- **Compile-time switches:** `USE_ALPHAMAP`, `IS_GLSL3`

```glsl
#ifdef USE_ALPHAMAP
#define USE_UV
#endif
#include <uv_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#if IS_GLSL3 > 0
out vec3 vViewPosition;
#else
varying vec3 vViewPosition;
#endif
void main() {
#include <uv_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
	vViewPosition=-mvPosition.xyz;
}
```

<a id="shader-16"></a>
### 16. G-buffer fragment

- **Stage:** fragment  ·  **Role:** packs linear depth + normal + flags into 2 RGBA8 targets
- **Owner (minified):** `Pt`  ·  **Source:** character offset 1065409
- **Uniforms:** `alphaTest : float`, `cameraNearFar : vec2`, `flags : vec4`
- **Compile-time switches:** `USE_ALPHAMAP`, `IS_GLSL3`, `ALPHA_I_RGBA_PACKING`, `FORCED_LINEAR_DEPTH`

```glsl
#ifdef USE_ALPHAMAP
#define USE_UV
#include <packing>
uniform float alphaTest;
#endif
#if IS_GLSL3 > 0
#ifndef gl_FragColor
layout(location=0)out vec4 A;
layout(location=1)out vec4 B;
#endif
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <alphamap_pars_fragment>
uniform vec2 cameraNearFar;
uniform vec4 flags;
#if IS_GLSL3 > 0
in vec3 vViewPosition;
#else
varying vec3 vViewPosition;
#endif
vec2 pack16(float value) {
	float f=clamp(value,0.,1.)*255.;
	float digitLow=fract(f);
	float digitHigh=floor(f)/255.;
	return vec2(digitHigh,digitLow);
}
vec2 packNormal(vec3 n) {
	float p=sqrt(n.z*8.+8.);
	return vec2(n.xy/p+0.5);
}
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
void main() {
#glMarker mainStart
#ifdef USE_ALPHAMAP
#ifdef ALPHA_I_RGBA_PACKING
	if(1.-unpackRGBAToDepth(texture2D(alphaMap,vAlphaMapUv))<alphaTest)
#else
	if(texture2D(alphaMap,vAlphaMapUv).g<alphaTest)
#endif
	discard;
#endif
#include <normal_fragment_begin>
#ifdef FORCED_LINEAR_DEPTH
	float linearZ=float(FORCED_LINEAR_DEPTH);
#else
	float linearZ=linstep(-cameraNearFar.x,-cameraNearFar.y,-vViewPosition.z);
#endif
	vec2 packedZ=pack16(pow(linearZ,0.5));
	vec2 packedNormal=packNormal(normal);
#if IS_GLSL3 > 0
#ifndef gl_FragColor
	A=vec4(packedZ.x,packedZ.y,packedNormal.x,packedNormal.y);
	B=flags;
#else
	gl_FragColor=vec4(packedZ.x,packedZ.y,packedNormal.x,packedNormal.y);
#endif
#else
	gl_FragColor=vec4(packedZ.x,packedZ.y,packedNormal.x,packedNormal.y);
#endif
}
```

<a id="shader-17"></a>
### 17. G-buffer unpack snippet (kt)

- **Stage:** shared snippet  ·  **Role:** shared by SSAO, SSR, SSGI, tonemap mask, bloom, outline…
- **Owner (minified):** `kt`  ·  **Source:** character offset 1068458
- **Uniforms:** `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`
- **Compile-time switches:** `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`

```glsl
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
```

## Code — Screen-space effects

<a id="shader-24"></a>
### 24. SSAO bilateral blur fragment

- **Stage:** fragment  ·  **Role:** class xa: depth/normal-aware blur of the AO map
- **Owner (minified):** `xa`  ·  **Source:** character offset 1259925
- **Uniforms:** `tDiffuseSize : vec2`, `bilDirection : vec2`, `smoothEnabled : bool`, `edgeSharpness : float`

```glsl
uniform vec2 tDiffuseSize;
uniform vec2 bilDirection;
varying vec2 vUv;
uniform bool smoothEnabled;
uniform float edgeSharpness;
vec4 bilaterialAO() {
	vec4 color=clamp((texture2D(tDiffuse,vUv.xy)).B_SRC_ACCESSOR,0.,5.);
	if(!smoothEnabled)return color;
	float depth;
	vec3 normal;
	getDepthNormal(vUv.xy,depth,normal);
	float gaussianWeights[4];
	gaussianWeights[0]=0.153170;
	gaussianWeights[1]=0.144893;
	gaussianWeights[2]=0.122649;
	gaussianWeights[3]=0.092902;
	float Z=gaussianWeights[0]+0.03;
	vec4 final_colour=Z*color;
	vec2 nuv;
	vec4 cc;
	float dp;
	vec3 nor;
	vec2 direction=bilDirection/tDiffuseSize.xy;
#pragma unroll_loop_start
	for(int i=0;i<6;i++) {
		direction*=-1.;
		nuv=vUv+2.*direction*float(UNROLLED_LOOP_INDEX/2+1);
		getDepthNormal(nuv,dp,nor);
		if(dp<0.999) {
			float normalCloseness=dot(normal,nor);
			normalCloseness*=normalCloseness;
			float normalError=(1.-normalCloseness)*8.;
			float normalWeight=max((1.-normalError*edgeSharpness),0.00);
			float depthWeight=max(0.,1.-edgeSharpness*4000.*abs(depth-dp));
			float kernelWeight=gaussianWeights[UNROLLED_LOOP_INDEX/2]+0.03;
			float bilateralWeight=kernelWeight*depthWeight*normalWeight;
			Z+=bilateralWeight;
			cc=clamp((texture2D(tDiffuse,nuv)).B_SRC_ACCESSOR,0.,5.);
			final_colour+=bilateralWeight*cc;
		}
	}
#pragma unroll_loop_end
	final_colour/=Z;
	return final_colour;
}
void main() {
	vec4 ao=clamp(bilaterialAO(),vec4(0.),vec4(1.));
	gl_FragColor=ao;
}
```

<a id="shader-28"></a>
### 28. SSAO fragment

- **Stage:** fragment  ·  **Role:** class Ta (SSAO plugin Ia): SAO-style ambient occlusion
- **Owner (minified):** `Ta`  ·  **Source:** character offset 1264074
- **Uniforms:** `frameCount : float`, `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `cameraNearFar : vec2`, `projection : mat4`, `tLastThis : sampler2D`, `saoData : vec4`, `saoBiasEpsilon : vec3`, `screenSize : vec2`
- **Compile-time switches:** `BASIC_RANDOM_HELPERS`, `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `PERSPECTIVE_CAMERA`, `DEPTH_PACKING_MODE`, `LINEAR_DEPTH`, `NUM_SAMPLES`
- **Note:** The placeholder `${i}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

```glsl
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#include <common>
#include <packing>
varying vec2 vUv;
uniform vec2 cameraNearFar;
uniform mat4 projection;
uniform sampler2D tLastThis;
uniform vec4 saoData;
uniform vec3 saoBiasEpsilon;
uniform vec2 screenSize;
const float INV_NUM_SAMPLES=1./float(NUM_SAMPLES);
float getSelectionBit(in float number) {
	return mod(floor(number/pow(2.,2.)),2.);
}
float getViewZFromNDCZ(const in float depth) {
#if PERSPECTIVE_CAMERA == 1
	return perspectiveDepthToViewZ(depth,cameraNearFar.x,cameraNearFar.y);
#else
	return orthographicDepthToViewZ(depth,cameraNearFar.x,cameraNearFar.y);
#endif
}
vec3 packFloatToRGB(const in float x) {
	const vec3 code=vec3(1.,255.,65025.);
	vec3 pack=vec3(code*x);
	pack.gb=fract(pack.gb);
	pack.rg-=pack.gb*(1./256.);
	return pack;
}
vec3 getViewPositionFromViewZ(const in vec2 uv,const in float viewDepth) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewDepth/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewDepth/projection[1][1];
	return vec3(xe,ye,viewDepth);
}
float decodeDepth(const in vec2 uv) {
	vec4 uncodedDepth;
#if DEPTH_PACKING_MODE == 2
	uncodedDepth=texture2D(tNormalDepth,uv);
#else
	uncodedDepth=texture2D(tDepth,uv);
#endif
#if DEPTH_PACKING_MODE == 0
	return uncodedDepth.x;
#elif DEPTH_PACKING_MODE == 1
#if LINEAR_DEPTH == 1
	return pow2(unpackRGBAToDepth(uncodedDepth));
#else
	return unpackRGBAToDepth(uncodedDepth);
#endif
#else
	return pow2(unpack16(uncodedDepth.xy));
#endif
}
vec3 getPositionFromOffset(const in vec2 uv,const in vec2 offset,const in float screenSpaceRadius) {
	vec2 uvOffset=uv+floor(screenSpaceRadius*offset)/screenSize;
	float d=decodeDepth(uvOffset);
#if LINEAR_DEPTH == 0
	float centerViewZ=getViewZFromNDCZ(d);
	return getViewPositionFromViewZ(uvOffset,centerViewZ);
#else
	d=mix(-cameraNearFar.x,-cameraNearFar.y,d);
	return getViewPositionFromViewZ(uvOffset,d);
#endif
}
float getOcclusion(const in vec2 uv,const in int id,const in float randomAngle,const in float occlusionSphereRadius,const in vec3 centerPosition,const in vec3 centerNormal) {
	float screenSpaceRadius=(float(id)+mod(randomAngle,1.)+0.5)*INV_NUM_SAMPLES;
	float angle=screenSpaceRadius*(float(NUM_SPIRAL_TURNS)*6.28)+randomAngle;
	screenSpaceRadius=(screenSpaceRadius*occlusionSphereRadius);
	vec2 offset=vec2(cos(angle),sin(angle));
	vec3 samplePosition=getPositionFromOffset(uv,offset,screenSpaceRadius);
	vec3 direction=samplePosition-centerPosition;
	float d2=dot(direction,direction);
	float ao=max((dot(centerNormal,direction)+centerPosition.z*saoBiasEpsilon.x)/(saoBiasEpsilon.z*d2+saoBiasEpsilon.y),0.);
	return ao;
}
void main() {
	float centerDepth;
	vec3 centerNormal;
	getDepthNormal(vUv,centerDepth,centerNormal);
#if LINEAR_DEPTH == 0
	float centerViewZ=getViewZFromNDCZ(centerDepth);
#else
	float centerViewZ=mix(-cameraNearFar.x,-cameraNearFar.y,centerDepth);
#endif
	vec3 centerPosition=getViewPositionFromViewZ(vUv,centerViewZ);
	float occlusionSphereScreenRadius=200.*saoData.z/(-centerPosition.z);
	float randomAngle=6.2*random3(vec3(vUv,frameCount*0.1));
	float sum=0.;
	sum+=getOcclusion(vUv,0,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#if NUM_SAMPLES > 1
	sum+=getOcclusion(vUv,1,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 2
	sum+=getOcclusion(vUv,2,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 3
	sum+=getOcclusion(vUv,3,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 4
	sum+=getOcclusion(vUv,4,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 5
	sum+=getOcclusion(vUv,5,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 6
	sum+=getOcclusion(vUv,6,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 7
	sum+=getOcclusion(vUv,7,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 8
	sum+=getOcclusion(vUv,8,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 9
	sum+=getOcclusion(vUv,9,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
#if NUM_SAMPLES > 10
	sum+=getOcclusion(vUv,10,randomAngle,occlusionSphereScreenRadius,centerPosition,centerNormal);
#endif
	float aoValue=sum*saoData.y*INV_NUM_SAMPLES;
	bool disableAO=getSelectionBit(getGBufferFlags(vUv).a*255.)>0.001?true:false;
	aoValue=clamp(1.-max(aoValue,0.),0.,1.);
	gl_FragColor.gba=packFloatToRGB(centerDepth);
	gl_FragColor.r=(vec4(aoValue)).r;
}
```

<a id="shader-29"></a>
### 29. SSAO material injection (AO multiply)

- **Stage:** fragment injection  ·  **Role:** string patch applied to MeshStandardMaterial2 (beforeModulation marker)
- **Owner (minified):** `Ta`  ·  **Source:** character offset 1268942
- **Compile-time switches:** `USE_TRANSMISSION`, `SSAO_ENABLED`, `USE_ENVMAP`

```glsl
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
```

<a id="shader-30"></a>
### 30. SSAO material declarations

- **Stage:** snippet  ·  **Role:** uniform tSSAOMap + texel decode helper
- **Owner (minified):** `Ta`  ·  **Source:** character offset 1269931
- **Uniforms:** `tSSAOMap : sampler2D`, `projectionMatrix : mat4`
- **Compile-time switches:** `SIMPLE_CAMERA_HELPERS`, `USE_TRANSMISSION`
- **Note:** The `${M(...)}` placeholder is a runtime helper generator; shown here as the linear-texture variant it produces (seen in the compiled program).

```glsl
uniform sampler2D tSSAOMap;
vec4 tSSAOMapTexelToLinear( vec4 value )  {
	return LinearToLinear( value );
}
#ifndef SIMPLE_CAMERA_HELPERS
#define SIMPLE_CAMERA_HELPERS
#ifndef USE_TRANSMISSION
uniform mat4 projectionMatrix;
#endif
vec3 viewToScreen(const in vec3 pos) {
	vec4 projected=projectionMatrix*vec4(pos,1.);
	return vec3(0.5+0.5*projected.xy/projected.w,projected.w);
}
#endif
```

<a id="shader-46"></a>
### 46. SSGI fragment

- **Stage:** fragment  ·  **Role:** class _c (SSGI plugin gc; disabled in this scene)
- **Owner (minified):** `_c`  ·  **Source:** character offset 1388353
- **Uniforms:** `cameraNearFar : vec2`, `cameraPositionWorld : vec3`, `projection : mat4`, `frameCount : float`, `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `frameCount2 : float`, `intensity : float`, `objectRadius : float`, `rayCount : float`, `power : float`, `bias : float`, `falloff : float`, `tolerance : float`, `autoRadius : bool`, `screenSize : vec2`
- **Compile-time switches:** `BASIC_HELPERS`, `BASIC_CAMERA_HELPERS`, `THREE_PACKING_INCLUDED`, `BASIC_RANDOM_HELPERS`, `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `SSRT_PARS_SNIP`, `SSGI_ENABLED`
- **Note:** The placeholder `${i}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

```glsl
#ifndef BASIC_HELPERS
#define BASIC_HELPERS
float saturate2(float v,float mx) {
	return max(0.,min(mx,v));
}
vec3 saturate2(vec3 v) {
	return max(vec3(0.),min(vec3(1.),v));
}
#endif
#ifndef BASIC_CAMERA_HELPERS
#define BASIC_CAMERA_HELPERS
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
uniform mat4 projection;
#ifndef THREE_PACKING_INCLUDED
#define THREE_PACKING_INCLUDED
#include <packing>
#endif
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
float depthToViewZ(const in float depth) {
	return(depth>0.999)?-cameraNearFar.y*1000.:-mix(cameraNearFar.x,cameraNearFar.y,depth);
}
float viewZToDepth(const in float viewZ) {
	return linstep(-cameraNearFar.x,-cameraNearFar.y,viewZ);
}
vec4 viewToScreen3(const in vec3 pos) {
	vec4 projected=projection*vec4(pos,1.);
	projected.z=pos.z;
	projected.w=1./projected.w;
	projected.xyz*=projected.w;
	projected.xy=0.5+0.5*projected.xy;
	return projected;
}
vec3 screenToView(const in vec2 uv,const in float viewZ) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewZ/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewZ/projection[1][1];
	return vec3(xe,ye,viewZ);
}
#endif
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
#define PI  3.141592653589793
mat3 GetTangentBasis(vec3 TangentZ) {
	vec3 up=vec3(0.,0.,1.);
	vec3 TangentX=normalize(cross(dot(TangentZ,up)<0.8?up:vec3(1.,0.,0.),TangentZ));
	vec3 TangentY=cross(TangentZ,TangentX);
	return mat3(TangentX,TangentY,TangentZ);
}
vec4 CosineSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=sqrt(E.y);
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=CosTheta*(1./PI);
	return vec4(H,PDF);
}
vec4 UniformSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=E.y;
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=1./(2.*PI);
	return vec4(H,PDF);
}
vec2 UniformSampleDiskConcentric(vec2 E) {
	vec2 p=2.*E-1.;
	float Radius;
	float Phi;
	if(abs(p.x)>abs(p.y)) {
		Radius=p.x;
		Phi=(PI/4.)*(p.y/p.x);
	} else {
		Radius=p.y;
		Phi=(PI/2.)-(PI/4.)*(p.x/p.y);
	}
	return vec2(Radius*cos(Phi),Radius*sin(Phi));
}
vec2 UniformSampleDiskConcentricApprox(vec2 E) {
	vec2 sf=E*sqrt(2.)-sqrt(0.5);
	vec2 sq=sf*sf;
	float root=sqrt(2.*max(sq.x,sq.y)-min(sq.x,sq.y));
	if(sq.x>sq.y) {
		sf.x=sf.x>0.?root:-root;
	} else {
		sf.y=sf.y>0.?root:-root;
	}
	return sf;
}
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#ifndef SSRT_PARS_SNIP
#define SSRT_PARS_SNIP
#define pow2(a)a*a
float getDepth2(const in vec2 uv,const in float lod) {
	float viewDepth=getDepth(uv);
	return depthToViewZ(viewDepth);
}
#define LOD_DEPTH  1.0
#define LOD_COLOR  5.0
void _traceRay(in vec4 ray_origin,in vec4 ray_dir,in float tolerance,inout vec3 state,in int loopMax,in float iStepCount) {
	vec4 sample_uv;
	float d,hit;
	float dLod=0.;
#pragma unroll_loop_start
	for(int i=0;i<8;i++) {
		if(UNROLLED_LOOP_INDEX<loopMax) {
			sample_uv=ray_origin+ray_dir*state.y;
			d=getDepth2(sample_uv.xy,dLod);
			d=sample_uv.z/sample_uv.w-d;
			if(abs(d+tolerance)<tolerance) {
				hit=clamp(state.x/(state.x-d),0.,1.)-1.;
				hit=(state.y+hit*iStepCount);
				state.z=min(state.z,hit);
			}
			state.x=d;
			state.y+=1.*iStepCount;
		}
	}
#pragma unroll_loop_end
}
vec3 traceRay(in vec3 ray_origin_view,in vec3 ray_dir_view,in float tolerance,inout vec3 state,in int _STEP_COUNT) {
	vec4 sample_uv;
	vec4 ray_origin=viewToScreen3(ray_origin_view);
	vec3 ray_end_view=ray_origin_view+ray_dir_view;
	vec4 ray_dir=viewToScreen3(ray_end_view);
	vec2 clamp_end=clamp(ray_dir.xy,vec2(0.),vec2(1.));
	vec2 correction=abs(ray_dir.xy-clamp_end);
	correction=(step(0.01,correction)*correction/(abs(clamp_end-ray_origin.xy)+0.01))+1.;
	correction.x=1./min(max(correction.y,correction.x),10.);
	ray_dir=ray_dir-ray_origin;
	ray_dir.xyw*=correction.x;
	float iStepCount=1./float(_STEP_COUNT);
	tolerance*=0.125;
	_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT,iStepCount);
	if(_STEP_COUNT>8&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-8,iStepCount);
	if(_STEP_COUNT>15&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	if(_STEP_COUNT>23&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	sample_uv=ray_origin+ray_dir*state.z;
	sample_uv.z/=sample_uv.w;
	state.z=state.z<0.999?state.z:9999999.;
	return sample_uv.xyz;
}
#endif
varying vec2 vUv;
uniform float frameCount2;
uniform float intensity;
uniform float objectRadius;
uniform float rayCount;
uniform float power;
uniform float bias;
uniform float falloff;
uniform float tolerance;
uniform bool autoRadius;
uniform vec2 screenSize;
vec3 ComputeUniformL(vec3 N,vec2 E) {
	vec3 L;
	L.xy=E;
	L.z=interleavedGradientNoise(gl_FragCoord.xy,frameCount2*5.);
	L=L*2.-1.;
	return L;
}
vec2 GetRandomE(float seed) {
	vec2 rand_e;
	rand_e.x=random3(vec3(gl_FragCoord.xy,frameCount2+seed));
	rand_e.y=random3(vec3(gl_FragCoord.yx,rand_e.x+(frameCount2)*7.));
	return rand_e;
}
vec4 calculateGI(in float seed,in vec3 screenPos,in vec3 normal,in float radiusFactor) {
	vec3 viewPos=screenToView(screenPos.xy,screenPos.z);
	normal=normalize(normal);
	vec2 E=GetRandomE(seed);
	vec3 L=ComputeUniformL(normal,E);
	L=normalize(L);
	L*=sign(dot(L,normal));
	float cameraDist=length(cameraPositionWorld);
	float rayLen=autoRadius?length(viewPos-screenToView(screenPos.xy+objectRadius/10.,screenPos.z)):mix((cameraNearFar.y)+viewPos.z,-viewPos.z-cameraNearFar.x,L.z*0.5+0.5)*objectRadius;
	rayLen*=radiusFactor;
	float r=interleavedGradientNoise(gl_FragCoord.xy,frameCount2*14.+seed)+0.05;
	rayLen=max(rayLen,0.001);
	vec3 state=vec3(1.,(r+0.5)/float(RTAO_STEP_COUNT),2.);
	viewPos+=normal*max(-0.01*viewPos.z,0.001);
	vec3 screenHitP=traceRay(viewPos,L*rayLen,tolerance*rayLen,state,RTAO_STEP_COUNT);
	vec3 viewHitP=screenToView(screenHitP.xy,screenHitP.z);
	vec3 LRes=viewHitP-viewPos;
	if(state.z>1.)LRes=vec3(9999999.);
	float dist=length(LRes)*falloff;
	float EPS=0.01;
	float zBias=(viewPos.z)*bias;
	float ao=(max(dot(normal,L)+zBias,0.))/(dist*dist+EPS);
#if defined(SSGI_ENABLED) && SSGI_ENABLED > 0
	vec3 hitColor=tLastFrameTexelToLinear(texture2D(tLastFrame,screenHitP.xy)).rgb;
	vec3 hitNormal=getViewNormal(screenHitP.xy);
	float giWeight=1.;
	giWeight=saturate2(giWeight/(dist+EPS),1.);
	giWeight*=saturate2((dot(normal,L)),1.);
	giWeight*=saturate2((dot(hitNormal,-L)),1.);
	return vec4(hitColor*giWeight,ao);
#endif
	return vec4(0,0,0,ao);
}
float normpdf(in float x,in float sigma) {
	return exp(-0.5*x*x/(sigma*sigma));
}
vec4 getLastThis(sampler2D tex,float depth,vec3 normal) {
	vec2 direction=vec2(1,1);
	vec4 color=clamp(tLastThisTexelToLinear(texture2D(tex,vUv.xy)),0.,5.);
	return color;
}
void main() {
	float depth;
	vec3 normal;
	getDepthNormal(vUv,depth,normal);
	if(depth>0.99) {
		discard;
		gl_FragColor=getLastThis(tLastThis,depth,normal);
		return;
	}
	float viewZ=depthToViewZ(depth);
	vec3 screenPos=vec3(vUv.x,vUv.y,viewZ);
	vec4 gi=vec4(0.);
	gi+=calculateGI(8.,screenPos,normal,1.);
	if(rayCount>1.5)gi=max(gi,calculateGI(2.,screenPos,normal,0.4));
	if(rayCount>2.5)gi=max(gi,calculateGI(3.,screenPos,normal,1.5));
	if(rayCount>3.5)gi=max(gi,calculateGI(1.,screenPos,normal,0.6));
	if(rayCount>4.5)gi=max(gi,calculateGI(3.,screenPos,normal,1.));
	gi.a=min(1.,gi.a);
	gi.a=max(0.,gi.a);
	gi.rgb=min(vec3(3.),gi.rgb);
	gi.rgb=max(vec3(0.),gi.rgb);
	if(frameCount2<3.) {
		gl_FragColor=gi;
		return;
	}
	gl_FragColor=(texture2D(tLastThis,vUv));
	gl_FragColor=((gi+(gl_FragColor)*frameCount2)/(frameCount2+1.));
}
```

<a id="shader-47"></a>
### 47. SSGI material declarations

- **Stage:** snippet  ·  **Role:** uniforms read by materials
- **Owner (minified):** `_c`  ·  **Source:** character offset 1394235
- **Uniforms:** `ssaoPower : float`, `ssgiIntensity : float`, `tSSGIMap : sampler2D`, `projectionMatrix : mat4`
- **Compile-time switches:** `SIMPLE_CAMERA_HELPERS`, `USE_TRANSMISSION`
- **Note:** The `${M(...)}` placeholder is a runtime helper generator; shown here as the linear-texture variant it produces (seen in the compiled program).

```glsl
uniform float ssaoPower;
uniform float ssgiIntensity;
uniform sampler2D tSSGIMap;
vec4 tSSGIMapTexelToLinear( vec4 value )  {
	return LinearToLinear( value );
}
#ifndef SIMPLE_CAMERA_HELPERS
#define SIMPLE_CAMERA_HELPERS
#ifndef USE_TRANSMISSION
uniform mat4 projectionMatrix;
#endif
vec3 viewToScreen(const in vec3 pos) {
	vec4 projected=projectionMatrix*vec4(pos,1.);
	return vec3(0.5+0.5*projected.xy/projected.w,projected.w);
}
#endif
```

<a id="shader-48"></a>
### 48. SSR core: ray march + GGX ray sampling (Bc)

- **Stage:** shared snippet  ·  **Role:** inlined into both the SSR pass and standard materials
- **Owner (minified):** `Bc`  ·  **Source:** character offset 1409272
- **Uniforms:** `objectRadius : float`, `radius : float`, `tolerance : float`, `autoRadius : bool`, `sceneBoundingRadius : float`

```glsl
uniform float objectRadius;
uniform float radius;
uniform float tolerance;
uniform bool autoRadius;
#ifndef D_sceneBoundingRadius
#define D_sceneBoundingRadius
uniform float sceneBoundingRadius;
#endif
vec3 ComputeReflectionL(vec3 N,vec2 E,vec3 V,float rough) {
	float rough4=rough*rough*rough*rough;
	float phi=2.*PI*E.x;
	float cos_theta=pow(max(E.y,0.000001),rough4/(2.-rough4));
	float sin_theta=sqrt(max(0.,1.-cos_theta*cos_theta));
	vec3 half_vec=vec3(sin_theta*cos(phi),sin_theta*sin(phi),cos_theta);
	vec3 tangentX=normalize(cross(abs(N.z)<0.999?vec3(0.,0.,1.):vec3(1.,0.,0.),N));
	vec3 tangentY=cross(N,tangentX);
	half_vec=half_vec.x*tangentX+half_vec.y*tangentY+half_vec.z*N;
	vec3 ray_dir=(2.*dot(V,half_vec))*half_vec-V;
	return ray_dir;
}
vec2 GetRandomE(float seed) {
	vec2 rand_e;
	rand_e.x=interleavedGradientNoise(gl_FragCoord.xy,frameCount*117.);
	rand_e.y=fract(rand_e.x*38.65435);
	rand_e.y=mix(rand_e.y,1.,0.7);
	return rand_e;
}
vec4 calculateSSR(in float seed,in vec3 screenPos,in vec3 normal,in float radiusFactor,in float roughness) {
	vec3 viewPos=screenToView(screenPos.xy,screenPos.z);
	normal=normalize(normal);
	vec2 E=GetRandomE(seed);
	vec3 L=ComputeReflectionL(normal,E,-normalize(viewPos),roughness);
	L=normalize(L);
	float cameraDist=length(cameraPositionWorld);
	float rayLen=autoRadius?mix((cameraDist+objectRadius*sceneBoundingRadius)+viewPos.z,-viewPos.z-max(0.,cameraDist-objectRadius*sceneBoundingRadius),L.z*0.5+0.5):objectRadius*sceneBoundingRadius;
	rayLen*=radiusFactor;
	float r=interleavedGradientNoise(gl_FragCoord.xy,frameCount+seed);
	rayLen=max(rayLen,0.001);
	int steps=SSR_STEP_COUNT/(frameCount<float(SSR_LOW_QUALITY_FRAMES)?2:1);
	vec3 state=vec3(0.,(r+0.5)/float(steps),2.);
	viewPos+=normal*max(-0.0001*viewPos.z,0.001);
	vec3 screenHitP=traceRay(viewPos,L*rayLen,tolerance*rayLen,state,steps);
	if(state.z<0.99) {
		vec3 hitColor=(tLastFrameTexelToLinear(texture2D(tLastFrame,screenHitP.xy))).rgb;
		float ssrWeight=1.;
		return vec4(hitColor*ssrWeight,1.);
	}
	return vec4(0.);
}
```

<a id="shader-49"></a>
### 49. SSR pass fragment

- **Stage:** fragment  ·  **Role:** class Oc (SSReflection plugin Uc)
- **Owner (minified):** `? / Oc`  ·  **Source:** character offset 1411649
- **Uniforms:** `cameraNearFar : vec2`, `cameraPositionWorld : vec3`, `projection : mat4`, `frameCount : float`, `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `objectRadius : float`, `radius : float`, `tolerance : float`, `autoRadius : bool`, `sceneBoundingRadius : float`, `tLastThis : sampler2D`
- **Compile-time switches:** `BASIC_HELPERS`, `BASIC_CAMERA_HELPERS`, `THREE_PACKING_INCLUDED`, `BASIC_RANDOM_HELPERS`, `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `SSRT_PARS_SNIP`
- **Note:** The placeholder `${n}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

```glsl
varying vec2 vUv;
#ifndef BASIC_HELPERS
#define BASIC_HELPERS
float saturate2(float v,float mx) {
	return max(0.,min(mx,v));
}
vec3 saturate2(vec3 v) {
	return max(vec3(0.),min(vec3(1.),v));
}
#endif
#ifndef BASIC_CAMERA_HELPERS
#define BASIC_CAMERA_HELPERS
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
uniform mat4 projection;
#ifndef THREE_PACKING_INCLUDED
#define THREE_PACKING_INCLUDED
#include <packing>
#endif
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
float depthToViewZ(const in float depth) {
	return(depth>0.999)?-cameraNearFar.y*1000.:-mix(cameraNearFar.x,cameraNearFar.y,depth);
}
float viewZToDepth(const in float viewZ) {
	return linstep(-cameraNearFar.x,-cameraNearFar.y,viewZ);
}
vec4 viewToScreen3(const in vec3 pos) {
	vec4 projected=projection*vec4(pos,1.);
	projected.z=pos.z;
	projected.w=1./projected.w;
	projected.xyz*=projected.w;
	projected.xy=0.5+0.5*projected.xy;
	return projected;
}
vec3 screenToView(const in vec2 uv,const in float viewZ) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewZ/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewZ/projection[1][1];
	return vec3(xe,ye,viewZ);
}
#endif
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
#define PI  3.141592653589793
mat3 GetTangentBasis(vec3 TangentZ) {
	vec3 up=vec3(0.,0.,1.);
	vec3 TangentX=normalize(cross(dot(TangentZ,up)<0.8?up:vec3(1.,0.,0.),TangentZ));
	vec3 TangentY=cross(TangentZ,TangentX);
	return mat3(TangentX,TangentY,TangentZ);
}
vec4 CosineSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=sqrt(E.y);
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=CosTheta*(1./PI);
	return vec4(H,PDF);
}
vec4 UniformSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=E.y;
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=1./(2.*PI);
	return vec4(H,PDF);
}
vec2 UniformSampleDiskConcentric(vec2 E) {
	vec2 p=2.*E-1.;
	float Radius;
	float Phi;
	if(abs(p.x)>abs(p.y)) {
		Radius=p.x;
		Phi=(PI/4.)*(p.y/p.x);
	} else {
		Radius=p.y;
		Phi=(PI/2.)-(PI/4.)*(p.x/p.y);
	}
	return vec2(Radius*cos(Phi),Radius*sin(Phi));
}
vec2 UniformSampleDiskConcentricApprox(vec2 E) {
	vec2 sf=E*sqrt(2.)-sqrt(0.5);
	vec2 sq=sf*sf;
	float root=sqrt(2.*max(sq.x,sq.y)-min(sq.x,sq.y));
	if(sq.x>sq.y) {
		sf.x=sf.x>0.?root:-root;
	} else {
		sf.y=sf.y>0.?root:-root;
	}
	return sf;
}
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#ifndef SSRT_PARS_SNIP
#define SSRT_PARS_SNIP
#define pow2(a)a*a
float getDepth2(const in vec2 uv,const in float lod) {
	float viewDepth=getDepth(uv);
	return depthToViewZ(viewDepth);
}
#define LOD_DEPTH  1.0
#define LOD_COLOR  5.0
void _traceRay(in vec4 ray_origin,in vec4 ray_dir,in float tolerance,inout vec3 state,in int loopMax,in float iStepCount) {
	vec4 sample_uv;
	float d,hit;
	float dLod=0.;
#pragma unroll_loop_start
	for(int i=0;i<8;i++) {
		if(UNROLLED_LOOP_INDEX<loopMax) {
			sample_uv=ray_origin+ray_dir*state.y;
			d=getDepth2(sample_uv.xy,dLod);
			d=sample_uv.z/sample_uv.w-d;
			if(abs(d+tolerance)<tolerance) {
				hit=clamp(state.x/(state.x-d),0.,1.)-1.;
				hit=(state.y+hit*iStepCount);
				state.z=min(state.z,hit);
			}
			state.x=d;
			state.y+=1.*iStepCount;
		}
	}
#pragma unroll_loop_end
}
vec3 traceRay(in vec3 ray_origin_view,in vec3 ray_dir_view,in float tolerance,inout vec3 state,in int _STEP_COUNT) {
	vec4 sample_uv;
	vec4 ray_origin=viewToScreen3(ray_origin_view);
	vec3 ray_end_view=ray_origin_view+ray_dir_view;
	vec4 ray_dir=viewToScreen3(ray_end_view);
	vec2 clamp_end=clamp(ray_dir.xy,vec2(0.),vec2(1.));
	vec2 correction=abs(ray_dir.xy-clamp_end);
	correction=(step(0.01,correction)*correction/(abs(clamp_end-ray_origin.xy)+0.01))+1.;
	correction.x=1./min(max(correction.y,correction.x),10.);
	ray_dir=ray_dir-ray_origin;
	ray_dir.xyw*=correction.x;
	float iStepCount=1./float(_STEP_COUNT);
	tolerance*=0.125;
	_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT,iStepCount);
	if(_STEP_COUNT>8&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-8,iStepCount);
	if(_STEP_COUNT>15&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	if(_STEP_COUNT>23&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	sample_uv=ray_origin+ray_dir*state.z;
	sample_uv.z/=sample_uv.w;
	state.z=state.z<0.999?state.z:9999999.;
	return sample_uv.xyz;
}
#endif
uniform float objectRadius;
uniform float radius;
uniform float tolerance;
uniform bool autoRadius;
#ifndef D_sceneBoundingRadius
#define D_sceneBoundingRadius
uniform float sceneBoundingRadius;
#endif
vec3 ComputeReflectionL(vec3 N,vec2 E,vec3 V,float rough) {
	float rough4=rough*rough*rough*rough;
	float phi=2.*PI*E.x;
	float cos_theta=pow(max(E.y,0.000001),rough4/(2.-rough4));
	float sin_theta=sqrt(max(0.,1.-cos_theta*cos_theta));
	vec3 half_vec=vec3(sin_theta*cos(phi),sin_theta*sin(phi),cos_theta);
	vec3 tangentX=normalize(cross(abs(N.z)<0.999?vec3(0.,0.,1.):vec3(1.,0.,0.),N));
	vec3 tangentY=cross(N,tangentX);
	half_vec=half_vec.x*tangentX+half_vec.y*tangentY+half_vec.z*N;
	vec3 ray_dir=(2.*dot(V,half_vec))*half_vec-V;
	return ray_dir;
}
vec2 GetRandomE(float seed) {
	vec2 rand_e;
	rand_e.x=interleavedGradientNoise(gl_FragCoord.xy,frameCount*117.);
	rand_e.y=fract(rand_e.x*38.65435);
	rand_e.y=mix(rand_e.y,1.,0.7);
	return rand_e;
}
vec4 calculateSSR(in float seed,in vec3 screenPos,in vec3 normal,in float radiusFactor,in float roughness) {
	vec3 viewPos=screenToView(screenPos.xy,screenPos.z);
	normal=normalize(normal);
	vec2 E=GetRandomE(seed);
	vec3 L=ComputeReflectionL(normal,E,-normalize(viewPos),roughness);
	L=normalize(L);
	float cameraDist=length(cameraPositionWorld);
	float rayLen=autoRadius?mix((cameraDist+objectRadius*sceneBoundingRadius)+viewPos.z,-viewPos.z-max(0.,cameraDist-objectRadius*sceneBoundingRadius),L.z*0.5+0.5):objectRadius*sceneBoundingRadius;
	rayLen*=radiusFactor;
	float r=interleavedGradientNoise(gl_FragCoord.xy,frameCount+seed);
	rayLen=max(rayLen,0.001);
	int steps=SSR_STEP_COUNT/(frameCount<float(SSR_LOW_QUALITY_FRAMES)?2:1);
	vec3 state=vec3(0.,(r+0.5)/float(steps),2.);
	viewPos+=normal*max(-0.0001*viewPos.z,0.001);
	vec3 screenHitP=traceRay(viewPos,L*rayLen,tolerance*rayLen,state,steps);
	if(state.z<0.99) {
		vec3 hitColor=(tLastFrameTexelToLinear(texture2D(tLastFrame,screenHitP.xy))).rgb;
		float ssrWeight=1.;
		return vec4(hitColor*ssrWeight,1.);
	}
	return vec4(0.);
}
uniform sampler2D tLastThis;
void main() {
	vec4 texel=tDiffuseTexelToLinear(texture2D(tDiffuse,vUv));
	vec4 lastAO=tLastThisTexelToLinear(texture2D(tLastThis,vUv));
	float depth;
	vec3 normal;
	getDepthNormal(vUv,depth,normal);
	if(depth>=0.999) {
		discard;
	}
	float viewZ=depthToViewZ(depth);
	vec3 screenPos=vec3(vUv.x,vUv.y,viewZ);
	vec3 viewPos=screenToView(screenPos.xy,screenPos.z);
	viewPos.z=viewZ/viewPos.z;
	vec4 ao=vec4(0.);
	ao+=calculateSSR(8.,screenPos,normal,1.,0.1);
	ao.rgb=min(vec3(3.),ao.rgb);
	ao.rgb=max(vec3(0.),ao.rgb);
	if(frameCount<1.) {
		gl_FragColor=ao;
		return;
	}
	if(ao.a<0.01) {
		gl_FragColor.rgb=lastAO.rgb;
		gl_FragColor.a=(((lastAO.a)*frameCount)/(frameCount+1.));
	} else {
		gl_FragColor=((ao+(lastAO)*frameCount)/(frameCount+1.));
	}
#include <encodings_fragment>
}
```

<a id="shader-50"></a>
### 50. SSR material declarations

- **Stage:** fragment declarations  ·  **Role:** uniforms read by the material-side SSR block
- **Owner (minified):** `? / Oc`  ·  **Source:** character offset 1417125
- **Uniforms:** `ssrPower : float`, `ssrIntensity : float`, `ssrMaskFrontFactor : float`, `ssrBoost : vec3`, `tSSRMap : sampler2D`, `tLastFrame : sampler2D`

```glsl
uniform float ssrPower;
uniform float ssrIntensity;
uniform float ssrMaskFrontFactor;
uniform vec3 ssrBoost;
uniform sampler2D tSSRMap;
uniform sampler2D tLastFrame;
```

<a id="shader-56"></a>
### 56. Contact shadows: getShadow override

- **Stage:** fragment injection  ·  **Role:** SSContactShadows ($c): replaces Three's getShadow with a screen-space ray
- **Owner (minified):** `s`  ·  **Source:** character offset 1446969
- **Uniforms:** `sceneBoundingRadius : float`
- **Compile-time switches:** `SSCS_DEBUG`
- **Note:** This is a fragment, not a whole program: it is spliced into a larger function of Three's shader, so its braces do not balance.

```glsl
#ifndef D_sceneBoundingRadius
#define D_sceneBoundingRadius
uniform float sceneBoundingRadius;
#endif
float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, vec3 lightDirection )  {
	vec3 ray_origin_view = -vViewPosition;
	float rnd = interleavedGradientNoise(gl_FragCoord.xy, frameCount+34.);
	float cameraDist = length(cameraPositionWorld);
	//                    float radius = mix((cameraNearFar.y) + ray_origin_view.z, -ray_origin_view.z - cameraNearFar.x, rnd * 0.5 + 0.5)*sscsRadius;
	float radius = mix((cameraDist + sceneBoundingRadius) + ray_origin_view.z, -ray_origin_view.z - max(0.0, cameraDist - sceneBoundingRadius), rnd * 0.5 + 0.5)*sscsRadius;
	vec3 state = vec3(1.,(rnd+0.5)/float(SSCS_STEP_COUNT),2.);
	traceRay(ray_origin_view, normalize(lightDirection) * radius, sscsTolerance * radius * 2., state, SSCS_STEP_COUNT);
	state.z = state.z > 0.99 ? 1. : max(0.,min(state.z * state.z * (1.-sscsIntensity), 1.));
#if defined(SSCS_DEBUG) && SSCS_DEBUG > 0
	return state.z;
#endif
```

<a id="shader-57"></a>
### 57. Contact shadows: declarations + helpers

- **Stage:** fragment injection  ·  **Role:** SSContactShadows ($c); disabled in this scene
- **Owner (minified):** `a / ?`  ·  **Source:** character offset 1448323
- **Uniforms:** `sscsIntensity : float`, `sscsRadius : float`, `sscsTolerance : float`, `cameraNearFar : vec2`, `cameraPositionWorld : vec3`, `projection : mat4`, `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `frameCount : float`
- **Compile-time switches:** `SSCS_ENABLED`, `BASIC_HELPERS`, `BASIC_CAMERA_HELPERS`, `THREE_PACKING_INCLUDED`, `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `BASIC_RANDOM_HELPERS`, `SSRT_PARS_SNIP`

```glsl
#if SSCS_ENABLED
uniform float sscsIntensity;
uniform float sscsRadius;
uniform float sscsTolerance;
#ifndef BASIC_HELPERS
#define BASIC_HELPERS
float saturate2(float v,float mx) {
	return max(0.,min(mx,v));
}
vec3 saturate2(vec3 v) {
	return max(vec3(0.),min(vec3(1.),v));
}
#endif
#define THREE_PACKING_INCLUDED
#ifndef BASIC_CAMERA_HELPERS
#define BASIC_CAMERA_HELPERS
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
uniform mat4 projection;
#ifndef THREE_PACKING_INCLUDED
#define THREE_PACKING_INCLUDED
#include <packing>
#endif
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
float depthToViewZ(const in float depth) {
	return(depth>0.999)?-cameraNearFar.y*1000.:-mix(cameraNearFar.x,cameraNearFar.y,depth);
}
float viewZToDepth(const in float viewZ) {
	return linstep(-cameraNearFar.x,-cameraNearFar.y,viewZ);
}
vec4 viewToScreen3(const in vec3 pos) {
	vec4 projected=projection*vec4(pos,1.);
	projected.z=pos.z;
	projected.w=1./projected.w;
	projected.xyz*=projected.w;
	projected.xy=0.5+0.5*projected.xy;
	return projected;
}
vec3 screenToView(const in vec2 uv,const in float viewZ) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewZ/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewZ/projection[1][1];
	return vec3(xe,ye,viewZ);
}
#endif
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
#ifndef SSRT_PARS_SNIP
#define SSRT_PARS_SNIP
#define pow2(a)a*a
float getDepth2(const in vec2 uv,const in float lod) {
	float viewDepth=getDepth(uv);
	return depthToViewZ(viewDepth);
}
#define LOD_DEPTH  1.0
#define LOD_COLOR  5.0
void _traceRay(in vec4 ray_origin,in vec4 ray_dir,in float tolerance,inout vec3 state,in int loopMax,in float iStepCount) {
	vec4 sample_uv;
	float d,hit;
	float dLod=0.;
#pragma unroll_loop_start
	for(int i=0;i<8;i++) {
		if(UNROLLED_LOOP_INDEX<loopMax) {
			sample_uv=ray_origin+ray_dir*state.y;
			d=getDepth2(sample_uv.xy,dLod);
			d=sample_uv.z/sample_uv.w-d;
			if(abs(d+tolerance)<tolerance) {
				hit=clamp(state.x/(state.x-d),0.,1.)-1.;
				hit=(state.y+hit*iStepCount);
				state.z=min(state.z,hit);
			}
			state.x=d;
			state.y+=1.*iStepCount;
		}
	}
#pragma unroll_loop_end
}
vec3 traceRay(in vec3 ray_origin_view,in vec3 ray_dir_view,in float tolerance,inout vec3 state,in int _STEP_COUNT) {
	vec4 sample_uv;
	vec4 ray_origin=viewToScreen3(ray_origin_view);
	vec3 ray_end_view=ray_origin_view+ray_dir_view;
	vec4 ray_dir=viewToScreen3(ray_end_view);
	vec2 clamp_end=clamp(ray_dir.xy,vec2(0.),vec2(1.));
	vec2 correction=abs(ray_dir.xy-clamp_end);
	correction=(step(0.01,correction)*correction/(abs(clamp_end-ray_origin.xy)+0.01))+1.;
	correction.x=1./min(max(correction.y,correction.x),10.);
	ray_dir=ray_dir-ray_origin;
	ray_dir.xyw*=correction.x;
	float iStepCount=1./float(_STEP_COUNT);
	tolerance*=0.125;
	_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT,iStepCount);
	if(_STEP_COUNT>8&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-8,iStepCount);
	if(_STEP_COUNT>15&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	if(_STEP_COUNT>23&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	sample_uv=ray_origin+ray_dir*state.z;
	sample_uv.z/=sample_uv.w;
	state.z=state.z<0.999?state.z:9999999.;
	return sample_uv.xyz;
}
#endif
#endif
```

<a id="shader-64"></a>
### 64. Velocity buffer vertex

- **Stage:** vertex  ·  **Role:** class Dp (VelocityBuffer; disabled in this scene)
- **Owner (minified):** `Dp`  ·  **Source:** character offset 1524415
- **Uniforms:** `modelMatrixPrevious : mat4`
- **Compile-time switches:** `USE_ALPHAMAP`, `USE_INSTANCING`

```glsl
#ifdef USE_ALPHAMAP
#define USE_UV
#endif
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vWorldPosition;
varying vec3 vWorldPositionPrevious;
uniform mat4 modelMatrixPrevious;
void main() {
#include <uv_vertex>
#include <skinbase_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
	vec4 mvPosition=vec4(transformed,1.);
#ifdef USE_INSTANCING
	mvPosition=instanceMatrix*mvPosition;
#endif
	vWorldPosition=(modelMatrix*mvPosition).xyz;
	vWorldPositionPrevious=(modelMatrixPrevious*mvPosition).xyz;
	mvPosition=modelViewMatrix*mvPosition;
	gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
}
```

<a id="shader-65"></a>
### 65. Velocity buffer fragment

- **Stage:** fragment  ·  **Role:** per-pixel motion vectors for TAA
- **Owner (minified):** `Dp`  ·  **Source:** character offset 1525291
- **Uniforms:** `currentProjectionViewMatrix : mat4`, `lastProjectionViewMatrix : mat4`

```glsl
varying vec3 vWorldPosition;
varying vec3 vWorldPositionPrevious;
uniform mat4 currentProjectionViewMatrix;
uniform mat4 lastProjectionViewMatrix;
vec2 computeScreenSpaceVelocity2() {
	vec4 currentPositionClip=currentProjectionViewMatrix*vec4(vWorldPosition,1.);
	vec4 prevPositionClip=lastProjectionViewMatrix*vec4(vWorldPositionPrevious,1.);
	vec2 currentPositionNDC=currentPositionClip.xy/currentPositionClip.w;
	vec2 prevPositionNDC=prevPositionClip.xy/prevPositionClip.w;
	if(prevPositionNDC.x>=1.||prevPositionNDC.x<=-1.||prevPositionNDC.x>=1.||prevPositionNDC.y<=-1.) {
		return vec2(0.);
	}
	return 0.5*(currentPositionNDC-prevPositionNDC);
}
void main() {
	vec2 velocity=clamp(computeScreenSpaceVelocity2(),-1.,1.);
	velocity=sign(velocity)*pow(abs(velocity),vec2(1./4.));
	velocity=velocity*0.5+0.5;
	gl_FragColor=vec4(velocity.x,velocity.y,1.,1.);
}
```

<a id="shader-69"></a>
### 69. TAA fragment

- **Stage:** fragment  ·  **Role:** class Kp (TAA plugin Jp; pass disabled in this scene)
- **Owner (minified):** `Kp`  ·  **Source:** character offset 1558096
- **Uniforms:** `previousRTSize : vec2`, `lastProjectionViewMatrix : mat4`, `currentProjectionViewMatrix : mat4`, `inverseViewMatrix : mat4`, `jitterSample : vec2`, `feedBack : vec2`, `firstFrame : bool`, `tVelocity : sampler2D`
- **Compile-time switches:** `HAS_VELOCITY_BUFFER`, `QUALITY`

```glsl
#include <common>
varying vec2 vUv;
uniform vec2 previousRTSize;
uniform mat4 lastProjectionViewMatrix;
uniform mat4 currentProjectionViewMatrix;
uniform mat4 inverseViewMatrix;
uniform vec2 jitterSample;
uniform vec2 feedBack;
uniform bool firstFrame;
#if HAS_VELOCITY_BUFFER == 1
uniform sampler2D tVelocity;
#endif
vec3 find_closest_fragment_3x3(const in vec2 uv) {
	const vec3 offset=vec3(-1.,1.,0.);
	vec2 texelSize=1./previousRTSize;
	vec3 dtr=vec3(1,1,getDepth(uv+offset.yy*texelSize));
	vec3 dtc=vec3(0,1,getDepth(uv+offset.zy*texelSize));
	vec3 dtl=vec3(-1,1,getDepth(uv+offset.xy*texelSize));
	vec3 dml=vec3(-1,0,getDepth(uv+offset.xz*texelSize));
	vec3 dmc=vec3(0,0,getDepth(uv));
	vec3 dmr=vec3(1,0,getDepth(uv+offset.yz*texelSize));
	vec3 dbl=vec3(-1,-1,getDepth(uv+offset.xx*texelSize));
	vec3 dbc=vec3(0,-1,getDepth(uv+offset.zx*texelSize));
	vec3 dbr=vec3(1,-1,getDepth(uv+offset.yx*texelSize));
	vec3 dmin=dtl;
	if(dmin.z>dtc.z)dmin=dtc;
	if(dmin.z>dtr.z)dmin=dtr;
	if(dmin.z>dml.z)dmin=dml;
	if(dmin.z>dmc.z)dmin=dmc;
	if(dmin.z>dmr.z)dmin=dmr;
	if(dmin.z>dbl.z)dmin=dbl;
	if(dmin.z>dbc.z)dmin=dbc;
	if(dmin.z>dbr.z)dmin=dbr;
	return vec3(uv+texelSize.xy*dmin.xy,dmin.z);
}
vec3 find_closest_fragment_5tap(const in vec2 uv) {
	vec2 texelSize=1./previousRTSize;
	vec2 offset=vec2(1.,-1.);
	vec3 dtl=vec3(-1,1,getDepth(uv+offset.yx*texelSize));
	vec3 dtr=vec3(1,1,getDepth(uv+offset.xx*texelSize));
	vec3 dmc=vec3(0,0,getDepth(uv));
	vec3 dbl=vec3(-1,-1,getDepth(uv+offset.yy*texelSize));
	vec3 dbr=vec3(1,-1,getDepth(uv+offset.xy*texelSize));
	vec3 dmin=dtl;
	if(dmin.z>dtr.z)dmin=dtr;
	if(dmin.z>dmc.z)dmin=dmc;
	if(dmin.z>dbl.z)dmin=dbl;
	if(dmin.z>dbr.z)dmin=dbr;
	return vec3(uv+dmin.xy*texelSize,dmin.z);
}
vec4 clip_aabb(const in vec4 aabb_min,const in vec4 aabb_max,vec4 p) {
	const float FLT_EPS=1e-8;
	vec4 p_clip=0.5*(aabb_max+aabb_min);
	vec4 e_clip=0.5*(aabb_max-aabb_min)+FLT_EPS;
	vec4 v_clip=p-p_clip;
	vec4 v_unit=abs(v_clip/e_clip);
	float ma_unit=max(v_unit.x,max(v_unit.y,v_unit.z));
	if(ma_unit>1.)return p_clip+v_clip/ma_unit;
	else return p;
}
#if HAS_VELOCITY_BUFFER == 0
vec2 computeScreenSpaceVelocity(const in vec3 worldPosition) {
	vec4 currentPositionClip=currentProjectionViewMatrix*vec4(worldPosition,1.);
	vec4 prevPositionClip=lastProjectionViewMatrix*vec4(worldPosition,1.);
	vec2 currentPositionNDC=currentPositionClip.xy/currentPositionClip.w;
	vec2 prevPositionNDC=prevPositionClip.xy/prevPositionClip.w;
	if(prevPositionNDC.x>=1.||prevPositionNDC.x<=-1.||prevPositionNDC.x>=1.||prevPositionNDC.y<=-1.) {
		return vec2(0.);
	}
	return 0.5*(currentPositionNDC-prevPositionNDC);
}
#endif
vec4 computeTAA(const in vec2 uv,const in vec2 screenSpaceVelocity) {
	vec2 jitterOffset=jitterSample/previousRTSize;
	vec2 uvUnJitter=uv;
	vec4 currentColor=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter));
	vec4 previousColor=previousRTTexelToLinear(texture2D(previousRT,uv-screenSpaceVelocity));
	const vec3 offset=vec3(1.,-1.,0.);
	vec2 texelSize=1./previousRTSize;
	float texelSpeed=length(screenSpaceVelocity);
	vec4 tl=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.yx*texelSize));
	vec4 tc=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.zx*texelSize));
	vec4 tr=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.xx*texelSize));
	vec4 ml=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.yz*texelSize));
	vec4 mc=currentColor;
	vec4 mr=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.xz*texelSize));
	vec4 bl=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.yy*texelSize));
	vec4 bc=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.zy*texelSize));
	vec4 br=currentRTTexelToLinear(texture2D(currentRT,uvUnJitter+offset.xy*texelSize));
	vec4 corners=2.*(tr+bl+br+tl)-2.*mc;
	mc+=(mc-(corners*0.166667))*2.718282*0.3;
	mc=max(vec4(0.),mc);
	vec4 min5=min(tc,min(ml,min(mc,min(mr,bc))));
	vec4 max5=max(tc,max(ml,max(mc,max(mr,bc))));
	vec4 cmin=min(min5,min(tl,min(tr,min(bl,br))));
	vec4 cmax=max(min5,max(tl,max(tr,max(bl,br))));
	;
	cmin=0.5*(cmin+min5);
	cmax=0.5*(cmax+max5);
	previousColor=clip_aabb(cmin,cmax,previousColor);
	float lum0=luminance(currentColor.rgb);
	float lum1=luminance(previousColor.rgb);
	float unbiased_diff=abs(lum0-lum1)/max(lum0,max(lum1,0.2));
	float unbiased_weight=1.-unbiased_diff;
	float unbiased_weight_sqr=unbiased_weight*unbiased_weight;
	float k_feedback=mix(feedBack.x,feedBack.y,unbiased_weight_sqr);
	return mix(currentColor,previousColor,k_feedback);
}
vec3 getWorldPositionFromViewZ(const in vec2 uv,const in float viewDepth) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewDepth/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewDepth/projection[1][1];
	return(inverseViewMatrix*vec4(xe,ye,viewDepth,1.)).xyz;
}
void main() {
	vec2 jitterOffset=jitterSample/previousRTSize;
#if QUALITY == 1
	vec3 c_frag=find_closest_fragment_3x3(vUv);
#else
	vec3 c_frag=find_closest_fragment_5tap(vUv);
#endif
	if(c_frag.z>=0.999) {
		gl_FragColor=currentRTTexelToLinear(texture2D(currentRT,vUv-jitterOffset));
	} else {
		float sampleViewZ=mix(-cameraNearFar.x,-cameraNearFar.y,c_frag.z);
		vec3 worldPosition=getWorldPositionFromViewZ(c_frag.xy,sampleViewZ);
#if HAS_VELOCITY_BUFFER == 0
		vec2 screenSpaceVelocity=computeScreenSpaceVelocity(worldPosition);
#else
		vec2 screenSpaceVelocity=texture2D(tVelocity,c_frag.xy).xy*2.-1.;
		screenSpaceVelocity=sign(screenSpaceVelocity)*pow(abs(screenSpaceVelocity),vec2(4.));
#endif
		gl_FragColor=firstFrame?currentRTTexelToLinear(texture2D(currentRT,vUv)):computeTAA(vUv,screenSpaceVelocity);
	}
#include <encodings_fragment>
}
```

<a id="shader-70"></a>
### 70. SSBevel fragment

- **Stage:** fragment  ·  **Role:** class lh (SSBevel plugin uh)
- **Owner (minified):** `? / lh`  ·  **Source:** character offset 1575442
- **Uniforms:** `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `frameCount : float`, `tNormalBuffer : sampler2D`, `edgeMaskBuffer : sampler2D`, `screenSize : vec2`, `samples : vec2`, `cameraPositionWorld : vec3`
- **Compile-time switches:** `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `BASIC_RANDOM_HELPERS`
- **Note:** The placeholder `${i}` is a constructor argument. It is filled here with the G-buffer unpack snippet (kt) — deduced, because this shader calls getDepthNormal/unpackNormal that kt defines.

```glsl
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
uniform sampler2D tNormalBuffer;
uniform sampler2D edgeMaskBuffer;
uniform vec2 screenSize;
const float depthStep=0.02;
uniform vec2 samples[NUM_SAMPLES];
uniform vec3 cameraPositionWorld;
varying vec2 vUv;
#include <common>
float getBevelRadius(in float number) {
	return floor(number/8.);
}
vec3 smoothNormal() {
	vec2 uv=gl_FragCoord.xy/screenSize;
	vec4 texel=texture2D(tNormalDepth,uv);
	vec4 edgeMask=texture2D(edgeMaskBuffer,uv);
	vec3 avgNormal=2.*texture2D(tNormalBuffer,uv).rgb-1.;
	float depth=pow(unpack16(texel.xy),2.);
	vec2 invScreenSize=vec2(1.)/screenSize;
	vec4 mask=texture2D(tGBufferFlags,uv);
	float weightSum=0.;
	float radius=getBevelRadius(mask.g*255.)*2.;
	float randomAngle=6.2*random(frameCount*0.1);
	float theta=randomAngle;
	float snTheta=sin(theta);
	float csTheta=cos(theta);
	mat2 randomRotationMatrix=mat2(csTheta,snTheta,-snTheta,csTheta);
	float d_=dot(cameraPositionWorld,cameraPositionWorld);
	float radiusModifier=clamp(1./(1.+pow(d_,0.5)),0.,1.);
	for(int i=0;i<5;i++) {
		float x=float(i)-2.;
		for(int j=0;j<5;j++) {
			float y=float(j)-2.;
			vec2 offset=randomRotationMatrix*vec2(x,y)*radius*radiusModifier*invScreenSize;
			vec4 texel=texture2D(tNormalDepth,uv+offset);
			float offsetDepth=pow(unpack16(texel.xy),2.);
			float depthWeight=abs(offsetDepth-depth);
			depthWeight=(1.-step(depthStep,depthWeight));
			vec3 offsetNormal=2.*texture2D(tNormalBuffer,uv+offset).rgb-1.;
			if(dot(offsetNormal,offsetNormal)>0.) {
				avgNormal+=offsetNormal*depthWeight;
			}
		}
	}
	return normalize(avgNormal);
}
void main() {
	vec2 uv=gl_FragCoord.xy/screenSize;
	vec4 edgeMask=texture2D(edgeMaskBuffer,uv);
	vec3 normal=vec3(0.);
	if(edgeMask.x>0.) {
		normal=smoothNormal();
	} else {
		normal=2.*texture2D(tNormalBuffer,uv).rgb-1.;
	}
	gl_FragColor=vec4(vec3(0.5*normal+0.5),1.);
}
```

<a id="shader-71"></a>
### 71. SSBevel material declarations

- **Stage:** snippet  ·  **Role:** tSSBevelMap
- **Owner (minified):** `?`  ·  **Source:** character offset 1578714
- **Uniforms:** `tSSBevelMap : sampler2D`, `projectionMatrix : mat4`
- **Compile-time switches:** `SIMPLE_CAMERA_HELPERS`, `USE_TRANSMISSION`

```glsl
uniform sampler2D tSSBevelMap;
#ifndef SIMPLE_CAMERA_HELPERS
#define SIMPLE_CAMERA_HELPERS
#ifndef USE_TRANSMISSION
uniform mat4 projectionMatrix;
#endif
vec3 viewToScreen(const in vec3 pos) {
	vec4 projected=projectionMatrix*vec4(pos,1.);
	return vec3(0.5+0.5*projected.xy/projected.w,projected.w);
}
#endif
```

<a id="shader-72"></a>
### 72. SSBevel edge-detect fragment

- **Stage:** fragment  ·  **Role:** lh._edgeMaterial
- **Owner (minified):** `? / lh`  ·  **Source:** character offset 1579316
- **Uniforms:** `screenSize : vec2`, `tNormalDepth : sampler2D`, `tNormalBuffer : sampler2D`, `tGBufferFlags : sampler2D`, `radius : float`, `cameraNearFar : vec2`, `cameraPositionWorld : vec3`

```glsl
uniform vec2 screenSize;
uniform sampler2D tNormalDepth;
uniform sampler2D tNormalBuffer;
uniform sampler2D tGBufferFlags;
uniform float radius;
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
const float depthStep=0.2;
const float normalThreshold=0.9;
float unpack16(vec2 value) {
	return(value.x*0.996108949416342426275150501169264316558837890625+value.y*0.00389105058365758760263730664519243873655796051025390625);
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
void lookupNormalDepth(out float depth,out vec3 normal,vec2 off) {
	vec2 uv=(gl_FragCoord.st+off)/screenSize;
	vec4 texel=texture2D(tNormalDepth,uv);
	depth=mix(cameraNearFar.x,cameraNearFar.y,pow(unpack16(texel.xy),2.));
	normal=2.*texture2D(tNormalBuffer,uv).rgb-1.;
}
float getBorderWeight() {
	float depth1,depth2,depth3,depth4;
	vec3 normal1,normal2,normal3,normal4;
	float d_=dot(cameraPositionWorld,cameraPositionWorld);
	float radiusModifier=clamp(3./(1.+pow(d_,0.5)),0.,1.);
	float modRad=radius;
	lookupNormalDepth(depth1,normal1,vec2(0.,modRad));
	lookupNormalDepth(depth2,normal2,vec2(0.,-modRad));
	lookupNormalDepth(depth3,normal3,vec2(modRad,0.));
	lookupNormalDepth(depth4,normal4,vec2(-modRad,0.));
	vec2 uv=(gl_FragCoord.st)/screenSize;
	float mask=step(0.0001,texture2D(tGBufferFlags,uv).g);
	float mask1=texture2D(tGBufferFlags,uv+vec2(0.,modRad)/screenSize).b*255.;
	float mask2=texture2D(tGBufferFlags,uv+vec2(0.,-modRad)/screenSize).b*255.;
	float mask3=texture2D(tGBufferFlags,uv+vec2(modRad,0.)/screenSize).b*255.;
	float mask4=texture2D(tGBufferFlags,uv+vec2(-modRad,0.)/screenSize).b*255.;
	float maskWeight=max(abs(mask1-mask2),abs(mask3-mask4))*255.;
	maskWeight=(step(maskWeight,0.01));
	float a1=dot(normal1,normal2);
	float a2=dot(normal3,normal4);
	float normalWeight=min(abs(a1),abs(a2));
	normalWeight=1.-step(normalThreshold,normalWeight);
	float depthWeight=max(abs(depth1-depth2),abs(depth3-depth4));
	depthWeight=(step(depthWeight,depthStep));
	return normalWeight*depthWeight*maskWeight*mask;
}
void main() {
	float weight=getBorderWeight();
	vec2 uv=gl_FragCoord.st/screenSize;
	vec4 texel=texture2D(tNormalDepth,uv);
	float depth=pow(unpack16(texel.xy),2.);
	vec3 outColor=vec3(0.);
	if(depth>0.999) {
		weight=0.;
	} else {
		outColor=vec3(weight);
	}
	gl_FragColor=vec4(outColor,1.);
}
```

<a id="shader-73"></a>
### 73. SSBevel separable blur fragment

- **Stage:** fragment  ·  **Role:** lh._separableBlurMaterial
- **Owner (minified):** `? / lh`  ·  **Source:** character offset 1581832
- **Uniforms:** `colorTexture : sampler2D`, `maskTexture : sampler2D`, `texSize : vec2`, `direction : vec2`

```glsl
varying vec2 vUv;
uniform sampler2D colorTexture;
uniform sampler2D maskTexture;
uniform vec2 texSize;
uniform vec2 direction;
float gaussianPdf(in float x,in float sigma) {
	return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
}
void main() {
	vec2 invSize=1./texSize;
	float fSigma=float(SIGMA);
	float weightSum=gaussianPdf(0.,fSigma);
	vec4 mask=texture2D(maskTexture,vUv);
	vec3 diffuseSum=texture2D(colorTexture,vUv).rgb*weightSum;
	for(int i=1;i<KERNEL_RADIUS;i++) {
		float x=float(i);
		float w=gaussianPdf(x,fSigma);
		vec2 uvOffset=direction*invSize*x;
		vec3 sample1=texture2D(colorTexture,vUv+uvOffset).rgb;
		vec3 sample2=texture2D(colorTexture,vUv-uvOffset).rgb;
		diffuseSum+=(sample1+sample2)*w;
		weightSum+=2.*w;
	}
	gl_FragColor=vec4(diffuseSum/weightSum,1.);
}
```

## Code — Tone mapping & post-processing

<a id="shader-20"></a>
### 20. Tonemap declarations + ToneMapping()

- **Stage:** snippet  ·  **Role:** class ma: ACES etc., contrast, saturation, depth/flag mask
- **Owner (minified):** `?`  ·  **Source:** character offset 1250361
- **Uniforms:** `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `opacity : float`, `toneMappingContrast : float`, `toneMappingSaturation : float`
- **Compile-time switches:** `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `USE_DEPTH_TONEMAP`, `TONEMAP_BACKGROUND`, `TONE_MAPPING`, `TRANSPARENT_BACKGROUND`, `DEBUG_DEPTH`
- **Note:** `${this.depthTonemap ? kt : ""}` is shown in its enabled form (kt included), which is what this scene uses.

```glsl
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
#define USE_DEPTH_TONEMAP 1
uniform float opacity;
uniform float toneMappingContrast;
uniform float toneMappingSaturation;
float getToneMapBit(in float number) {
	return mod(floor(number/pow(2.,1.)),2.);
}
vec3 TonemappingSaturation(vec3 rgb) {
	const vec3 W=vec3(0.2125,0.7154,0.0721);
	vec3 intensity=vec3(dot(rgb,W));
	return mix(intensity,rgb,toneMappingSaturation);
}
vec3 TonemappingContrast(vec3 color) {
	return(color-vec3(0.5))*toneMappingContrast+vec3(0.5);
}
vec4 ToneMapping(in vec4 color) {
	vec4 outColor=opacity*color;
#if USE_DEPTH_TONEMAP > 0
	bool doTonemap=getToneMapBit(getGBufferFlags(vUv).a*255.)>0.5;
	float depth=getDepth(vUv);
	vec4 transparentCol=tTransparentTexelToLinear(texture2D(tTransparent,vUv));
#if TONEMAP_BACKGROUND < 1 || TRANSPARENT_BACKGROUND > 0
	bool isBackground=depth>0.99&&transparentCol.a<0.001;
	if(isBackground)doTonemap=false;
#endif
	if(doTonemap) {
#endif
#if defined( TONE_MAPPING )
		outColor.rgb=toneMapping(outColor.rgb);
		outColor.rgb=TonemappingContrast(outColor.rgb);
		outColor.rgb=TonemappingSaturation(outColor.rgb);
#endif
#if USE_DEPTH_TONEMAP > 0
	}
#if TRANSPARENT_BACKGROUND > 0
	if(isBackground)outColor.a=0.;
	if(depth>0.99&&transparentCol.a>=0.001)outColor.a=transparentCol.a;
#endif
	if(depth<0.00001)outColor.a=0.;
#if defined(DEBUG_DEPTH) && DEBUG_DEPTH > 0
	outColor.rgb=vec3(sRGBToLinear(vec4((1.-depth))).x);
#endif
#endif
	return outColor;
}
```

<a id="shader-21"></a>
### 21. Tonemap injection

- **Stage:** fragment injection  ·  **Role:** gl_FragColor = ToneMapping(gl_FragColor)
- **Owner (minified):** `? / ma`  ·  **Source:** character offset 1252086

```glsl
gl_FragColor = ToneMapping(gl_FragColor);
```

<a id="shader-22"></a>
### 22. Chromatic aberration declarations

- **Stage:** snippet  ·  **Role:** class ba (inactive in this scene)
- **Owner (minified):** `?`  ·  **Source:** character offset 1256909
- **Uniforms:** `aberrationIntensity : float`

```glsl
uniform float aberrationIntensity;
vec4 chromaticAberration() {
	vec2 distFromCenter=vUv-0.5;
	vec2 aberrated=aberrationIntensity*pow(distFromCenter,vec2(2.));
	vec4 color=tDiffuseTexelToLinear(texture2D(tDiffuse,vUv));
	vec4 outColor=vec4(tDiffuseTexelToLinear(texture2D(tDiffuse,vUv+aberrated)).r,color.g,tDiffuseTexelToLinear(texture2D(tDiffuse,vUv-aberrated)).b,color.a);
	return outColor;
}
```

<a id="shader-23"></a>
### 23. Chromatic aberration injection

- **Stage:** fragment injection
- **Owner (minified):** `? / ba`  ·  **Source:** character offset 1257505

```glsl
gl_FragColor = chromaticAberration();
#glMarker
```

<a id="shader-31"></a>
### 31. Bloom fragment (5 PASS_STEP variants)

- **Stage:** fragment  ·  **Role:** class Ra: prefilter, down, up, combine
- **Owner (minified):** `? / Ra`  ·  **Source:** character offset 1273674
- **Uniforms:** `intensity : float`, `opacity : float`, `tDiffuseSize : vec2`, `weight : float`, `prefilter : vec4`
- **Compile-time switches:** `PASS_STEP`

```glsl
uniform float intensity;
uniform float opacity;
uniform vec2 tDiffuseSize;
varying vec2 vUv;
uniform float weight;
#if PASS_STEP == 0
uniform vec4 prefilter;
vec4 Prefilter(vec4 c) {
	if(getDepth(vUv)>0.999) {
		return vec4(0.);
	}
	float brightness=max(c.r,max(c.g,c.b));
	float soft=brightness+prefilter.x*(prefilter.y-1.);
	soft=clamp(soft,0.,prefilter.z);
	soft=soft*soft*prefilter.w;
	float contribution=max(soft,brightness-prefilter.x);
	contribution/=max(brightness,0.001);
	return vec4(c.rgb*contribution,c.a);
}
#endif
vec4 Sample(vec2 uv) {
	return tDiffuseTexelToLinear(texture2D(tDiffuse,uv));
}
vec4 SampleBox(vec2 uv,float delta) {
	vec4 o=vec2(-delta,delta).xxyy/tDiffuseSize.xyxy;
	vec4 s=Sample(uv+o.xy)+Sample(uv+o.zy)+Sample(uv+o.xw)+Sample(uv+o.zw);
	return s*0.25;
}
void main() {
#if PASS_STEP == 0
	gl_FragColor=weight*Prefilter(SampleBox(vUv,1.));
	gl_FragColor.a=1.;
#elif PASS_STEP == 1
	gl_FragColor=weight*(SampleBox(vUv,1.));
	gl_FragColor.a=1.;
#elif PASS_STEP == 2
	gl_FragColor=(SampleBox(vUv,0.5));
	gl_FragColor.a=1.;
#elif PASS_STEP == 3
	vec4 texel=tSourceTexelToLinear(texture2D(tSource,vUv));
	vec4 bloom=intensity*SampleBox(vUv,0.5).rgba;
	float brightness=max(bloom.r,max(bloom.g,bloom.b));
	texel.rgb+=bloom.rgb;
	texel.a=min(1.,texel.a+brightness);
	gl_FragColor=texel;
#elif PASS_STEP == 4
	vec4 texel=vec4(0.);
	texel.rgb+=intensity*SampleBox(vUv,0.5).rgb;
	texel.a=1.;
	gl_FragColor=texel;
#endif
#include <encodings_fragment>
}
```

<a id="shader-32"></a>
### 32. Depth-of-field composite fragment

- **Stage:** fragment  ·  **Role:** class Fa/Oa (disabled in this scene)
- **Owner (minified):** `Oa`  ·  **Source:** character offset 1280087
- **Uniforms:** `cocTextureSize : vec2`, `nearFarBlurScale : vec2`, `cameraNearFar : vec2`, `focalDepthRange : vec2`, `crossCenter : vec2`, `crossRadius : float`, `crossAlpha : float`, `crossColor : vec3`

```glsl
#include <common>
#include <packing>
varying vec2 vUv;
uniform vec2 cocTextureSize;
uniform vec2 nearFarBlurScale;
uniform vec2 cameraNearFar;
uniform vec2 focalDepthRange;
uniform vec2 crossCenter;
uniform float crossRadius;
uniform float crossAlpha;
uniform vec3 crossColor;
float smoothBoundary(float d,float smooothFactor) {
	smooothFactor*=0.5;
	float value=smoothstep(-smooothFactor,smooothFactor,d);
	return value;
}
float circle(vec2 p,float r) {
	return min((length(p)-r),-(length(p)-r-0.01));
}
float computeCoc() {
	float depth=getDepth(vUv);
	if(depth>1.-0.01)return max(nearFarBlurScale.x,nearFarBlurScale.y);
	depth=mix(cameraNearFar.x,cameraNearFar.y,depth);
	float coc=(depth-focalDepthRange.x)/focalDepthRange.y;
	coc=clamp(coc,-1.,1.);
	return(coc>0.?coc*nearFarBlurScale.y:coc*nearFarBlurScale.x);
}
void main() {
	vec4 blur=blurTextureTexelToLinear(texture2D(blurTexture,vUv));
	float scale=0.5;
	blur+=blurTextureTexelToLinear(texture2D(blurTexture,vUv+scale*vec2(1.,1.)/cocTextureSize));
	blur+=blurTextureTexelToLinear(texture2D(blurTexture,vUv+scale*vec2(-1.,1.)/cocTextureSize));
	blur+=blurTextureTexelToLinear(texture2D(blurTexture,vUv+scale*vec2(-1.,-1.)/cocTextureSize));
	blur+=blurTextureTexelToLinear(texture2D(blurTexture,vUv+scale*vec2(1.,-1.)/cocTextureSize));
	blur/=5.;
	vec2 uvNearest=(floor(vUv*cocTextureSize)+0.5)/cocTextureSize;
	float coc=abs(min(2.*cocTextureTexelToLinear(texture2D(cocTexture,uvNearest)).a-1.,computeCoc()));
	float cocLower=0.005;
	float cocHigher=0.3;
	vec4 outColor=vec4(mix(colorTextureTexelToLinear(texture2D(colorTexture,vUv)).rgb,blur.rgb,smoothstep(cocLower,cocHigher,coc)),1.);
	vec2 d=vUv-crossCenter;
	if(length(d)>crossRadius+0.05) {
		float dist=circle(d,crossRadius);
		gl_FragColor=outColor;
	} else {
		d.x*=cocTextureSize.x/cocTextureSize.y;
		float dist=circle(d,crossRadius);
		dist=smoothBoundary(dist,2.*fwidth(dist));
		vec4 color=outColor;
		vec3 dofCircleColor=mix(crossColor,color.rgb,1.-crossAlpha);
		gl_FragColor=vec4(mix(color.rgb,dofCircleColor,dist),color.a);
	}
#include <encodings_fragment>
}
```

<a id="shader-33"></a>
### 33. DoF weighted separable blur

- **Stage:** fragment  ·  **Role:** class Ua
- **Owner (minified):** `Ua`  ·  **Source:** character offset 1282249
- **Uniforms:** `colorTextureSize : vec2`, `direction : vec2`

```glsl
#include <common>
varying vec2 vUv;
uniform vec2 colorTextureSize;
uniform vec2 direction;
const float MAXIMUM_BLUR_SIZE=16.;
const float SIGMA=5.;
const int NUM_SAMPLES=4;
float normpdf(in float x,in float sigma) {
	return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
}
vec3 weightedBlur() {
	float cocIn=2.*cocTextureTexelToLinear(texture2D(cocTexture,vUv)).a-1.;
	float kernelRadius=MAXIMUM_BLUR_SIZE*cocIn;
	vec2 invSize=1./colorTextureSize;
	cocIn*=cocIn*cocIn;
	float centreSpaceWeight=normpdf(0.,SIGMA)*abs(cocIn);
	float weightSum=centreSpaceWeight;
	vec3 centreSample=colorTextureTexelToLinear(texture2D(colorTexture,vUv)).rgb;
	vec3 diffuseSum=centreSample*weightSum;
	vec2 delta=invSize*kernelRadius/float(NUM_SAMPLES);
	for(int i=1;i<=NUM_SAMPLES;i++) {
		float spaceWeight=normpdf(float(i),SIGMA);
		vec2 texcoord=direction*delta*float(i);
		vec4 rightSample=colorTextureTexelToLinear(texture2D(colorTexture,vUv+texcoord));
		vec4 leftSample=colorTextureTexelToLinear(texture2D(colorTexture,vUv-texcoord));
		float leftCocWeight=abs(2.*cocTextureTexelToLinear(texture2D(cocTexture,vUv-texcoord)).a-1.);
		float rightCocWeight=abs(2.*cocTextureTexelToLinear(texture2D(cocTexture,vUv+texcoord)).a-1.);
		leftCocWeight*=leftCocWeight*leftCocWeight;
		rightCocWeight*=rightCocWeight*rightCocWeight;
		diffuseSum+=((leftSample.rgb*leftCocWeight)+(rightSample.rgb*rightCocWeight))*spaceWeight;
		weightSum+=(spaceWeight*(leftCocWeight+rightCocWeight));
	}
	return diffuseSum/weightSum;
}
void main() {
	gl_FragColor=vec4(weightedBlur(),1.);
#include <encodings_fragment>
}
```

<a id="shader-34"></a>
### 34. DoF circular (bokeh) blur

- **Stage:** fragment  ·  **Role:** class Ua
- **Owner (minified):** `Ua`  ·  **Source:** character offset 1283979
- **Uniforms:** `colorTextureSize : vec2`, `blurRadius : float`
- **Compile-time switches:** `DOF_MODE`

```glsl
#include <common>
varying vec2 vUv;
uniform vec2 colorTextureSize;
uniform float blurRadius;
vec4 CircularBlur() {
	vec4 color=colorTextureTexelToLinear(texture2D(colorTexture,vUv));
#ifdef DOF_MODE
	float blurDist=blurRadius*(2.*color.a-1.);
#else
	float blurDist=blurRadius*color.a;
#endif
	float rnd=PI2*random3(vec3(vUv,frameCount*0.1));
	float costheta=cos(rnd);
	float sintheta=sin(rnd);
	vec4 rotationMatrix=vec4(costheta,-sintheta,sintheta,costheta);
	vec3 colorSum=vec3(0.);
	float weightSum=0.001;
	vec2 ofs;
	vec4 sampleColor;
	setPds();
#pragma unroll_loop_start
	for(int i=0;i<16;i++) {
		ofs=poisson_disk_samples[UNROLLED_LOOP_INDEX];
		ofs=vec2(dot(ofs,rotationMatrix.xy),dot(ofs,rotationMatrix.zw));
		sampleColor=colorTextureTexelToLinear(texture2D(colorTexture,vUv+blurDist*ofs/colorTextureSize.xy));
#ifdef DOF_MODE
		sampleColor.a=abs(sampleColor.a*2.-1.);
		sampleColor.a*=sampleColor.a*sampleColor.a;
#endif
		colorSum+=sampleColor.rgb*sampleColor.a;
		weightSum+=sampleColor.a;
	}
#pragma unroll_loop_end
	colorSum/=weightSum;
	return vec4(saturate(colorSum),1.);
}
void main() {
	gl_FragColor=CircularBlur();
#include <encodings_fragment>
}
```

<a id="shader-35"></a>
### 35. DoF compute circle-of-confusion

- **Stage:** fragment  ·  **Role:** class Fa.computeCocMaterial
- **Owner (minified):** `Fa`  ·  **Source:** character offset 1286161
- **Uniforms:** `nearFarBlurScale : vec2`, `cameraNearFar : vec2`, `focalDepthRange : vec2`

```glsl
#include <common>
#include <packing>
varying vec2 vUv;
uniform vec2 nearFarBlurScale;
uniform vec2 cameraNearFar;
uniform vec2 focalDepthRange;
float computeCoc() {
	float depth=getDepth(vUv);
	if(depth==1.)return max(nearFarBlurScale.x,nearFarBlurScale.y);
	depth=mix(cameraNearFar.x,cameraNearFar.y,depth);
	float coc=(depth-focalDepthRange.x)/focalDepthRange.y;
	coc=clamp(coc,-1.,1.);
	return(coc>0.?coc*nearFarBlurScale.y:coc*nearFarBlurScale.x);
}
void main() {
	gl_FragColor=vec4(colorTextureTexelToLinear(texture2D(colorTexture,vUv)).rgb,0.5*computeCoc()+0.5);
#include <encodings_fragment>
}
```

<a id="shader-36"></a>
### 36. DoF expand circle-of-confusion

- **Stage:** fragment  ·  **Role:** class Fa.expandCocMaterial
- **Owner (minified):** `Fa`  ·  **Source:** character offset 1287014
- **Uniforms:** `colorTextureSize : vec2`, `direction : vec2`, `nearFarBlurScale : vec2`

```glsl
#include <common>
varying vec2 vUv;
uniform vec2 colorTextureSize;
uniform vec2 direction;
uniform vec2 nearFarBlurScale;
const float MAXIMUM_BLUR_SIZE=4.;
float expandNear(const in vec2 offset,const in bool isBackground) {
	float coc=0.;
	vec2 sampleOffsets=MAXIMUM_BLUR_SIZE*offset/5.;
	float coc0=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv)).a-1.;
	float coc1=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv-5.*sampleOffsets)).a-1.;
	float coc2=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv-4.*sampleOffsets)).a-1.;
	float coc3=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv-3.*sampleOffsets)).a-1.;
	float coc4=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv-2.*sampleOffsets)).a-1.;
	float coc5=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv-1.*sampleOffsets)).a-1.;
	float coc6=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv+1.*sampleOffsets)).a-1.;
	float coc7=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv+2.*sampleOffsets)).a-1.;
	float coc8=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv+3.*sampleOffsets)).a-1.;
	float coc9=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv+4.*sampleOffsets)).a-1.;
	float coc10=2.*colorTextureTexelToLinear(texture2D(colorTexture,vUv+5.*sampleOffsets)).a-1.;
	if(isBackground) {
		coc=abs(coc0)*0.095474+(abs(coc1)+abs(coc10))*0.084264+(abs(coc2)+abs(coc9))*0.088139+(abs(coc3)+abs(coc8))*0.091276+(abs(coc4)+abs(coc7))*0.093585+(abs(coc5)+abs(coc6))*0.094998;
	} else {
		coc=min(coc0,0.);
		coc=min(coc1*0.3,coc);
		coc=min(coc2*0.5,coc);
		coc=min(coc3*0.75,coc);
		coc=min(coc4*0.8,coc);
		coc=min(coc5*0.95,coc);
		coc=min(coc6*0.95,coc);
		coc=min(coc7*0.8,coc);
		coc=min(coc8*0.75,coc);
		coc=min(coc9*0.5,coc);
		coc=min(coc10*0.3,coc);
		if(abs(coc0)>abs(coc))coc=coc0;
	}
	return coc;
}
void main() {
	vec2 offset=2.*direction/colorTextureSize;
	bool isBackground=getDepth(vUv)>1.-0.001;
	float coc=expandNear(offset,isBackground);
	gl_FragColor=vec4(colorTextureTexelToLinear(texture2D(colorTexture,vUv)).rgb,0.5*coc+0.5);
#include <encodings_fragment>
}
```

<a id="shader-39"></a>
### 39. Film grain declarations

- **Stage:** snippet  ·  **Role:** class io (inactive in this scene)
- **Owner (minified):** `?`  ·  **Source:** character offset 1313570
- **Uniforms:** `grainIntensity : float`, `grainMultiply : bool`

```glsl
uniform float grainIntensity;
uniform bool grainMultiply;
vec4 grain(in vec4 color) {
	float x=(vUv.x+4.)*(vUv.y+4.)*(10.);
	vec4 grain=vec4(mod((mod(x,13.)+1.)*(mod(x,123.)+1.),0.01)-0.005)*grainIntensity;
	vec4 outColor=color;
	if(grainMultiply) {
		grain=1.-grain;
		outColor.rgb=color.rgb*vec3(grain);
	} else {
		outColor.rgb=color.rgb+vec3(grain);
	}
	return outColor;
}
```

<a id="shader-40"></a>
### 40. Film grain injection

- **Stage:** fragment injection
- **Owner (minified):** `? / ao`  ·  **Source:** character offset 1314143

```glsl
gl_FragColor = grain(gl_FragColor);
#glMarker
```

<a id="shader-62"></a>
### 62. Vignette declarations

- **Stage:** snippet  ·  **Role:** class Cp (inactive in this scene)
- **Owner (minified):** `?`  ·  **Source:** character offset 1518634
- **Uniforms:** `power : float`, `bgcolor : vec3`

```glsl
uniform float power;
uniform vec3 bgcolor;
vec4 Vignette(in vec4 color) {
	vec2 uv=vUv*(1.-vUv);
	float vig=uv.x*uv.y*16.;
	vig=pow(vig,power);
	return vec4(mix(color.rgb,vec3(bgcolor),1.-vig),color.a);
}
```

<a id="shader-63"></a>
### 63. Vignette injection

- **Stage:** fragment injection
- **Owner (minified):** `? / Mp`  ·  **Source:** character offset 1519053

```glsl
gl_FragColor = Vignette(gl_FragColor);
#glMarker
```

<a id="shader-66"></a>
### 66. LUT declarations

- **Stage:** fragment declarations  ·  **Role:** class Lp (inactive in this scene)
- **Owner (minified):** `? / Up`  ·  **Source:** character offset 1529921
- **Uniforms:** `lutSize : float`, `lutSize1 : float`, `lutSize2 : float`, `intensity : float`, `lut3d : sampler3D`, `lut3d1 : sampler3D`, `lut3d2 : sampler3D`, `lut2d : sampler2D`, `lut2d1 : sampler2D`, `lut2d2 : sampler2D`
- **Compile-time switches:** `USE_3DTEXTURE`, `USE_LUT`, `USE_LUT1`, `USE_LUT2`

```glsl
#if (USE_LUT == 1 || USE_LUT1 == 1 || USE_LUT2 == 1)
uniform float lutSize;
uniform float lutSize1;
uniform float lutSize2;
uniform float intensity;
#if USE_3DTEXTURE == 1
precision highp sampler3D;
#if USE_LUT == 1
uniform sampler3D lut3d;
#endif
#if USE_LUT1 == 1
uniform sampler3D lut3d1;
#endif
#if USE_LUT2 == 1
uniform sampler3D lut3d2;
#endif
#else
#if USE_LUT == 1
uniform sampler2D lut2d;
#endif
#if USE_LUT1 == 1
uniform sampler2D lut2d1;
#endif
#if USE_LUT2 == 1
uniform sampler2D lut2d2;
#endif
vec3 lutLookup(sampler2D tex,float size,vec3 rgb) {
	float sliceHeight=1./size;
	float yPixelHeight=1./(size*size);
	float slice=rgb.b*size;
	float interp=fract(slice);
	float slice0=slice-interp;
	float centeredInterp=interp-0.5;
	float slice1=slice0+sign(centeredInterp);
	float greenOffset=clamp(rgb.g*sliceHeight,yPixelHeight*0.5,sliceHeight-yPixelHeight*0.5);
	vec2 uv0=vec2(rgb.r,slice0*sliceHeight+greenOffset);
	vec2 uv1=vec2(rgb.r,slice1*sliceHeight+greenOffset);
	vec3 sample0=texture2D(tex,uv0).rgb;
	vec3 sample1=texture2D(tex,uv1).rgb;
	return mix(sample0,sample1,abs(centeredInterp));
}
#endif
float getLUTBit(in float number) {
	return mod(number,2.);
}
float getLUTIndex(in float number) {
	return mod(number,8.);
}
vec3 getUVW(in float lutSize,in vec4 color) {
	float pixelWidth=1./lutSize;
	float halfPixelWidth=0.5/lutSize;
	vec3 uvw=vec3(halfPixelWidth)+color.rgb*(1.-pixelWidth);
	return uvw;
}
vec4 colorLookUp(in vec4 color) {
	vec4 outColor;
	float lutFac=step(0.0001,getLUTBit(getGBufferFlags(vUv).a*255.));
	float lutIndex=getLUTIndex(getGBufferFlags(vUv).g*255.);
#if USE_3DTEXTURE == 1
	if(lutIndex==0.) {
#if USE_LUT == 1
		outColor=vec4(texture(lut3d,getUVW(lutSize,color)).rgb,color.a);
#endif
	} else if(lutIndex==1.) {
#if USE_LUT1 == 1
		outColor=vec4(texture(lut3d1,getUVW(lutSize1,color)).rgb,color.a);
#endif
	} else if(lutIndex==2.) {
#if USE_LUT2 == 1
		outColor=vec4(texture(lut3d2,getUVW(lutSize2,color)).rgb,color.a);
#endif
	} else {
#if USE_LUT == 1
		outColor=vec4(texture(lut3d,getUVW(lutSize,color)).rgb,color.a);
#endif
	}
#else
	if(lutIndex==0.) {
		outColor=vec4(lutLookup(lut2d,lutSize,getUVW(lutSize,color)),color.a);
	} else if(lutIndex==1.) {
#if USE_LUT1 == 1
		outColor=vec4(lutLookup(lut2d1,lutSize,getUVW(lutSize1,color)),color.a);
#endif
	} else if(lutIndex==2.) {
#if USE_LUT2 == 1
		outColor=vec4(lutLookup(lut2d2,lutSize,getUVW(lutSize2,color)),color.a);
#endif
	} else {
		outColor=vec4(lutLookup(lut2d,lutSize,getUVW(lutSize,color)),color.a);
	}
#endif
	outColor=mix(color,outColor,lutFac);
	return vec4(mix(color,outColor,intensity));
}
#endif
```

<a id="shader-67"></a>
### 67. LUT injection

- **Stage:** fragment injection
- **Owner (minified):** `? / Up`  ·  **Source:** character offset 1533655
- **Compile-time switches:** `USE_LUT`, `LUT_BACKGROUND`

```glsl
#if USE_LUT == 1
bool isBackground = getDepth(vUv)>0.9999;
#if LUT_BACKGROUND == 1
gl_FragColor = colorLookUp(gl_FragColor);
#else
gl_FragColor = isBackground ? gl_FragColor : colorLookUp(gl_FragColor);
#endif
#endif
#glMarker
```

<a id="shader-74"></a>
### 74. Gamma / sRGB injection

- **Stage:** fragment injection  ·  **Role:** class dh: gl_FragColor = LinearTosRGB(...)  — this is the final encode
- **Owner (minified):** `dh`  ·  **Source:** character offset 1588413

```glsl
gl_FragColor = LinearTosRGB(gl_FragColor);
#glMarker
```

## Code — Frame & pass infrastructure

<a id="shader-12"></a>
### 12. CopyShader vertex

- **Stage:** vertex  ·  **Role:** EffectComposer copy pass
- **Owner (minified):** `n`  ·  **Source:** character offset 955089

```glsl
varying vec2 vUv;
void main()  {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
```

<a id="shader-13"></a>
### 13. CopyShader fragment

- **Stage:** fragment  ·  **Role:** EffectComposer copy pass (tDiffuse × opacity)
- **Owner (minified):** `n`  ·  **Source:** character offset 955262
- **Uniforms:** `opacity : float`, `tDiffuse : sampler2D`

```glsl
uniform float opacity;
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main()  {
	gl_FragColor = texture2D( tDiffuse, vUv );
	gl_FragColor.a *= opacity;
}
```

<a id="shader-14"></a>
### 14. BlendPass fragment

- **Stage:** snippet  ·  **Role:** class It: blends two textures with a caller-supplied expression
- **Owner (minified):** `It`  ·  **Source:** character offset 1063795
- **Note:** `${i}` is an optional caller-supplied declarations string (default empty); `${r}` is the blend expression (default `c = a + b;`, the transparent pass uses `c = vec4(a.rgb * (1. - b.a) + b.rgb * b.a, 1.);`).

```glsl
varying vec2 vUv;
/*${i}*/ void blend(in vec4 a, in vec4 b, inout vec4 c) {
	/*${r}*/
}
void main()  {
	vec4 texel = vec4(0);
	blend(tDiffuseTexelToLinear ( texture2D( tDiffuse, vUv ) ), tDiffuse2TexelToLinear ( texture2D( tDiffuse2, vUv ) ), texel);
	texel = clamp(texel, vec4(0), vec4(8));
	gl_FragColor = texel;
#include <encodings_fragment>
}
```

<a id="shader-18"></a>
### 18. Screen-shader wrapper fragment

- **Stage:** fragment  ·  **Role:** function sa: wraps the app's optional `screenShader`
- **Owner (minified):** `sa`  ·  **Source:** character offset 1245413
- **Note:** `${e[0]}` / `${e[1]}` are the app-supplied declarations and body of the optional screen shader (empty in this app).

```glsl
varying vec2 vUv;
/*${e[0]}*/ void main()  {
	gl_FragColor = tDiffuseTexelToLinear (texture2D(tDiffuse, vUv));
	/*${e[1]}*/
}
```

<a id="shader-19"></a>
### 19. CombinedPost pass fragment

- **Stage:** fragment  ·  **Role:** class aa: the single final full-screen pass; extensions inject tone mapping etc.
- **Owner (minified):** `aa`  ·  **Source:** character offset 1246131
- **Note:** `${e[0]}` / `${e[1]}` are the app-supplied declarations and body of the optional screen shader (empty in this app).

```glsl
varying vec2 vUv;
/*${e[0]}*/ void main()  {
	gl_FragColor = tDiffuseTexelToLinear (texture2D(tDiffuse, vUv));
#glMarker
	/*${e[1]}*/ gl_FragColor.rgb *= gl_FragColor.a;
	// premultiply alpha
}
```

<a id="shader-37"></a>
### 37. Frame blend fragment (Progressive accumulation)

- **Stage:** snippet  ·  **Role:** class Na: weight·current + weight2·history
- **Owner (minified):** `Na`  ·  **Source:** character offset 1290885
- **Uniforms:** `weight : vec4`, `weight2 : vec4`

```glsl
uniform vec4 weight;
uniform vec4 weight2;
varying vec2 vUv;
void main()  {
	vec4 texel = clamp(weight * tDiffuseTexelToLinear ( texture2D( tDiffuse, vUv ) ) + weight2 * tDiffuse2TexelToLinear ( texture2D( tDiffuse2, vUv ) ), vec4(0), vec4(8));
	gl_FragColor = texel;
#include <encodings_fragment>
}
```

## Code — Shared snippets

<a id="shader-25"></a>
### 25. Fullscreen vertex (Ea)

- **Stage:** shared snippet  ·  **Role:** vUv pass-through used by most screen passes
- **Owner (minified):** `Ea`  ·  **Source:** character offset 1262180

```glsl
varying vec2 vUv;
void main() {
	vUv=uv;
	gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
```

<a id="shader-26"></a>
### 26. Random helpers (Ca)

- **Stage:** shared snippet  ·  **Role:** random, interleavedGradientNoise, hash3
- **Owner (minified):** `Ca`  ·  **Source:** character offset 1262286
- **Uniforms:** `frameCount : float`
- **Compile-time switches:** `BASIC_RANDOM_HELPERS`

```glsl
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
```

<a id="shader-27"></a>
### 27. Simple camera helpers (Sa)

- **Stage:** shared snippet  ·  **Role:** viewToScreen / screenToView
- **Owner (minified):** `Sa`  ·  **Source:** character offset 1262982
- **Uniforms:** `projectionMatrix : mat4`
- **Compile-time switches:** `SIMPLE_CAMERA_HELPERS`, `USE_TRANSMISSION`

```glsl
#ifndef SIMPLE_CAMERA_HELPERS
#define SIMPLE_CAMERA_HELPERS
#ifndef USE_TRANSMISSION
uniform mat4 projectionMatrix;
#endif
vec3 viewToScreen(const in vec3 pos) {
	vec4 projected=projectionMatrix*vec4(pos,1.);
	return vec3(0.5+0.5*projected.xy/projected.w,projected.w);
}
#endif
```

<a id="shader-45"></a>
### 45. Basic camera helpers (pc)

- **Stage:** shared snippet  ·  **Role:** view/projection conversions used by SSR/SSGI/SSCS
- **Owner (minified):** `pc`  ·  **Source:** character offset 1383527
- **Uniforms:** `cameraNearFar : vec2`, `cameraPositionWorld : vec3`, `projection : mat4`
- **Compile-time switches:** `BASIC_CAMERA_HELPERS`, `THREE_PACKING_INCLUDED`

```glsl
#ifndef BASIC_CAMERA_HELPERS
#define BASIC_CAMERA_HELPERS
uniform vec2 cameraNearFar;
uniform vec3 cameraPositionWorld;
uniform mat4 projection;
#ifndef THREE_PACKING_INCLUDED
#define THREE_PACKING_INCLUDED
#include <packing>
#endif
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
float depthToViewZ(const in float depth) {
	return(depth>0.999)?-cameraNearFar.y*1000.:-mix(cameraNearFar.x,cameraNearFar.y,depth);
}
float viewZToDepth(const in float viewZ) {
	return linstep(-cameraNearFar.x,-cameraNearFar.y,viewZ);
}
vec4 viewToScreen3(const in vec3 pos) {
	vec4 projected=projection*vec4(pos,1.);
	projected.z=pos.z;
	projected.w=1./projected.w;
	projected.xyz*=projected.w;
	projected.xy=0.5+0.5*projected.xy;
	return projected;
}
vec3 screenToView(const in vec2 uv,const in float viewZ) {
	vec2 uv_=2.*uv-1.;
	float xe=-(uv_.x+projection[2][0])*viewZ/projection[0][0];
	float ye=-(uv_.y+projection[2][1])*viewZ/projection[1][1];
	return vec3(xe,ye,viewZ);
}
#endif
```

<a id="shader-900"></a>
### 900. Tangent basis + GGX/BRDF sampling helpers (hc)

- **Stage:** shared snippet  ·  **Role:** included by SSR, SSGI, contact shadows
- **Owner (minified):** `var:hc`  ·  **Source:** character offset 1384525

```glsl
#define PI  3.141592653589793
mat3 GetTangentBasis(vec3 TangentZ) {
	vec3 up=vec3(0.,0.,1.);
	vec3 TangentX=normalize(cross(dot(TangentZ,up)<0.8?up:vec3(1.,0.,0.),TangentZ));
	vec3 TangentY=cross(TangentZ,TangentX);
	return mat3(TangentX,TangentY,TangentZ);
}
vec4 CosineSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=sqrt(E.y);
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=CosTheta*(1./PI);
	return vec4(H,PDF);
}
vec4 UniformSampleHemisphere(vec2 E) {
	float Phi=2.*PI*E.x;
	float CosTheta=E.y;
	float SinTheta=sqrt(1.-CosTheta*CosTheta);
	vec3 H;
	H.x=SinTheta*cos(Phi);
	H.y=SinTheta*sin(Phi);
	H.z=CosTheta;
	float PDF=1./(2.*PI);
	return vec4(H,PDF);
}
vec2 UniformSampleDiskConcentric(vec2 E) {
	vec2 p=2.*E-1.;
	float Radius;
	float Phi;
	if(abs(p.x)>abs(p.y)) {
		Radius=p.x;
		Phi=(PI/4.)*(p.y/p.x);
	} else {
		Radius=p.y;
		Phi=(PI/2.)-(PI/4.)*(p.x/p.y);
	}
	return vec2(Radius*cos(Phi),Radius*sin(Phi));
}
vec2 UniformSampleDiskConcentricApprox(vec2 E) {
	vec2 sf=E*sqrt(2.)-sqrt(0.5);
	vec2 sq=sf*sf;
	float root=sqrt(2.*max(sq.x,sq.y)-min(sq.x,sq.y));
	if(sq.x>sq.y) {
		sf.x=sf.x>0.?root:-root;
	} else {
		sf.y=sf.y>0.?root:-root;
	}
	return sf;
}
```

<a id="shader-901"></a>
### 901. SSRT parameters snippet (dc)

- **Stage:** shared snippet  ·  **Role:** SSRT_PARS_SNIP: pow helpers etc., included by SSR/SSGI/contact shadows
- **Owner (minified):** `var:dc`  ·  **Source:** character offset 1385686

```glsl
#ifndef SSRT_PARS_SNIP
#define SSRT_PARS_SNIP
#define pow2(a)a*a
float getDepth2(const in vec2 uv,const in float lod) {
	float viewDepth=getDepth(uv);
	return depthToViewZ(viewDepth);
}
#define LOD_DEPTH  1.0
#define LOD_COLOR  5.0
void _traceRay(in vec4 ray_origin,in vec4 ray_dir,in float tolerance,inout vec3 state,in int loopMax,in float iStepCount) {
	vec4 sample_uv;
	float d,hit;
	float dLod=0.;
#pragma unroll_loop_start
	for(int i=0;i<8;i++) {
		if(UNROLLED_LOOP_INDEX<loopMax) {
			sample_uv=ray_origin+ray_dir*state.y;
			d=getDepth2(sample_uv.xy,dLod);
			d=sample_uv.z/sample_uv.w-d;
			if(abs(d+tolerance)<tolerance) {
				hit=clamp(state.x/(state.x-d),0.,1.)-1.;
				hit=(state.y+hit*iStepCount);
				state.z=min(state.z,hit);
			}
			state.x=d;
			state.y+=1.*iStepCount;
		}
	}
#pragma unroll_loop_end
}
vec3 traceRay(in vec3 ray_origin_view,in vec3 ray_dir_view,in float tolerance,inout vec3 state,in int _STEP_COUNT) {
	vec4 sample_uv;
	vec4 ray_origin=viewToScreen3(ray_origin_view);
	vec3 ray_end_view=ray_origin_view+ray_dir_view;
	vec4 ray_dir=viewToScreen3(ray_end_view);
	vec2 clamp_end=clamp(ray_dir.xy,vec2(0.),vec2(1.));
	vec2 correction=abs(ray_dir.xy-clamp_end);
	correction=(step(0.01,correction)*correction/(abs(clamp_end-ray_origin.xy)+0.01))+1.;
	correction.x=1./min(max(correction.y,correction.x),10.);
	ray_dir=ray_dir-ray_origin;
	ray_dir.xyw*=correction.x;
	float iStepCount=1./float(_STEP_COUNT);
	tolerance*=0.125;
	_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT,iStepCount);
	if(_STEP_COUNT>8&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-8,iStepCount);
	if(_STEP_COUNT>15&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	if(_STEP_COUNT>23&&state.z>0.98)_traceRay(ray_origin,ray_dir,tolerance,state,_STEP_COUNT-16,iStepCount);
	sample_uv=ray_origin+ray_dir*state.z;
	sample_uv.z/=sample_uv.w;
	state.z=state.z<0.999?state.z:9999999.;
	return sample_uv.xyz;
}
#endif
```

<a id="shader-902"></a>
### 902. Basic helpers (fc)

- **Stage:** shared snippet  ·  **Role:** BASIC_HELPERS: saturate2, luminance… included by SSR/SSGI/contact shadows
- **Owner (minified):** `var:fc`  ·  **Source:** character offset 1387575

```glsl
#ifndef BASIC_HELPERS
#define BASIC_HELPERS
float saturate2(float v,float mx) {
	return max(0.,min(mx,v));
}
vec3 saturate2(vec3 v) {
	return max(vec3(0.),min(vec3(1.),v));
}
#endif
```

## Code — Material extensions

<a id="shader-38"></a>
### 38. Thin-film: voronoise helper

- **Stage:** fragment declarations  ·  **Role:** ThinFilmLayerPlugin (qa)
- **Owner (minified):** `? / qa`  ·  **Source:** character offset 1303645
- **Uniforms:** `thinBaseLayerFactors : vec4`, `thinNoiseLayerFactors : vec4`, `thinColorNoiseParams : vec4`, `thinFilmFactor : float`
- **Compile-time switches:** `VORONOISE_HELPER`, `HSV_HELPERS`

```glsl
#ifndef VORONOISE_HELPER
#define VORONOISE_HELPER
float voronoise(in vec2 p,float u,float v) {
	float k=1.+63.*pow(1.-v,6.);
	vec2 i=floor(p);
	vec2 f=fract(p);
	vec2 a=vec2(0.,0.);
	for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++) {
		vec2 g=vec2(x,y);
		vec3 o=hash3(i+g)*vec3(u,u,1.);
		vec2 d=g-f+o.xy;
		float w=pow(1.-smoothstep(0.,1.414,length(d)),k);
		a+=vec2(o.z*w,w);
	}
	return a.x/a.y;
}
vec3 voronoise3(vec2 p,float u,float v) {
	return vec3(voronoise(p,u,v),voronoise(p+vec2(0.435,0.23),u,v),voronoise(p-vec2(0.83,0.45),u,v));
}
vec3 voronoiseNormal(vec2 p,float u,float v) {
	return vec3(voronoise(p,u,v),voronoise(p+vec2(0.435,0.23),u,v),1.);
}
#endif
#ifndef HSV_HELPERS
#define HSV_HELPERS
vec3 hsv2rgb(vec3 c) {
	vec4 K=vec4(1.,2./3.,1./3.,3.);
	vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
	return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}
vec3 rgb2hsv(vec3 c) {
	vec4 K=vec4(0.,-1./3.,2./3.,-1.);
	vec4 p=c.g<c.b?vec4(c.bg,K.wz):vec4(c.gb,K.xy);
	vec4 q=c.r<p.x?vec4(p.xyw,c.r):vec4(c.r,p.yzx);
	float d=q.x-min(q.w,q.y);
	float e=1.0e-10;
	return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);
}
#endif
uniform vec4 thinBaseLayerFactors;
uniform vec4 thinNoiseLayerFactors;
uniform vec4 thinColorNoiseParams;
uniform float thinFilmFactor;
```

<a id="shader-43"></a>
### 43. Custom bump map: declarations

- **Stage:** fragment declarations  ·  **Role:** CustomBumpMapPlugin (nc)
- **Owner (minified):** `?`  ·  **Source:** character offset 1364742
- **Uniforms:** `customBumpMap : sampler2D`, `customBumpScale : float`
- **Compile-time switches:** `CUSTOM_BUMP_MAP_ENABLED`, `CUSTOM_BUMP_MAP_BICUBIC`, `USE_BUMPMAP`

```glsl
#if defined(CUSTOM_BUMP_MAP_ENABLED) && CUSTOM_BUMP_MAP_ENABLED > 0
#if CUSTOM_BUMP_MAP_BICUBIC > 0
vec4 cubic_cb(float v) {
	vec4 n=vec4(1.,2.,3.,4.)-v;
	vec4 s=n*n*n;
	float x=s.x;
	float y=s.y-4.*s.x;
	float z=s.z-4.*s.y+6.*s.x;
	float w=6.-x-y-z;
	return vec4(x,y,z,w)*(1./6.);
}
vec4 textureBicubic_cb(sampler2D sampler,vec2 texCoords) {
	vec2 texSize=vec2(textureSize(sampler,0));
	vec2 invTexSize=1./texSize;
	texCoords=texCoords*texSize-0.5;
	vec2 fxy=fract(texCoords);
	texCoords-=fxy;
	vec4 xcubic=cubic_cb(fxy.x);
	vec4 ycubic=cubic_cb(fxy.y);
	vec4 c=texCoords.xxyy+vec2(-0.5,+1.5).xyxy;
	vec4 s=vec4(xcubic.xz+xcubic.yw,ycubic.xz+ycubic.yw);
	vec4 offset=c+vec4(xcubic.yw,ycubic.yw)/s;
	offset*=invTexSize.xxyy;
	vec4 sample0=texture(sampler,offset.xz);
	vec4 sample1=texture(sampler,offset.yz);
	vec4 sample2=texture(sampler,offset.xw);
	vec4 sample3=texture(sampler,offset.yw);
	float sx=s.x/(s.x+s.y);
	float sy=s.z/(s.z+s.w);
	return mix(mix(sample3,sample2,sx),mix(sample1,sample0,sx),sy);
}
#endif
varying vec2 vCustomBumpUv;
uniform sampler2D customBumpMap;
uniform float customBumpScale;
vec2 dHdxy_fwd_cb() {
	vec2 dSTdx=dFdx(vCustomBumpUv);
	vec2 dSTdy=dFdy(vCustomBumpUv);
#if CUSTOM_BUMP_MAP_BICUBIC > 0
	float Hll=customBumpScale*textureBicubic_cb(customBumpMap,vCustomBumpUv).x;
	float dBx=customBumpScale*textureBicubic_cb(customBumpMap,vCustomBumpUv+dSTdx).x-Hll;
	float dBy=customBumpScale*textureBicubic_cb(customBumpMap,vCustomBumpUv+dSTdy).x-Hll;
#else
	float Hll=customBumpScale*texture2D(customBumpMap,vCustomBumpUv).x;
	float dBx=customBumpScale*texture2D(customBumpMap,vCustomBumpUv+dSTdx).x-Hll;
	float dBy=customBumpScale*texture2D(customBumpMap,vCustomBumpUv+dSTdy).x-Hll;
#endif
	return vec2(dBx,dBy);
}
#ifndef USE_BUMPMAP
vec3 perturbNormalArb(vec3 surf_pos,vec3 surf_norm,vec2 dHdxy,float faceDirection) {
	vec3 vSigmaX=dFdx(surf_pos.xyz);
	vec3 vSigmaY=dFdy(surf_pos.xyz);
	vec3 vN=surf_norm;
	vec3 R1=cross(vSigmaY,vN);
	vec3 R2=cross(vN,vSigmaX);
	float fDet=dot(vSigmaX,R1)*faceDirection;
	vec3 vGrad=sign(fDet)*(dHdxy.x*R1+dHdxy.y*R2);
	return normalize(abs(fDet)*surf_norm-vGrad);
}
#endif
#endif
```

<a id="shader-44"></a>
### 44. Custom bump map: vertex injection

- **Stage:** vertex injection
- **Owner (minified):** `?`  ·  **Source:** character offset 1367296
- **Uniforms:** `customBumpUvTransform : mat3`
- **Compile-time switches:** `CUSTOM_BUMP_MAP_ENABLED`

```glsl
#if defined(CUSTOM_BUMP_MAP_ENABLED) && CUSTOM_BUMP_MAP_ENABLED > 0
varying vec2 vCustomBumpUv;
uniform mat3 customBumpUvTransform;
#endif
```

<a id="shader-51"></a>
### 51. Anisotropy extension

- **Stage:** fragment injection  ·  **Role:** AnisotropyPlugin (Nc)
- **Owner (minified):** `a`  ·  **Source:** character offset 1422720
- **Uniforms:** `frameCount : float`, `anisotropyFactor : float`, `anisotropyNoise : float`, `anisotropyDirection : float`, `anisotropyDirectionMap : sampler2D`
- **Compile-time switches:** `ANISOTROPY_ENABLED`, `BASIC_RANDOM_HELPERS`, `ANISOTROPY_TEX_MODE`

```glsl
//#if ANISOTROPY_ENABLED
#ifndef BASIC_RANDOM_HELPERS
#define BASIC_RANDOM_HELPERS
uniform float frameCount;
float random(float n) {
	return fract(sin(n)*43758.5453123);
}
float random2(vec2 n,float x) {
	n+=x;
	return fract(sin(dot(n.xy,vec2(12.9898,78.233)))*43758.5453);
}
float random3(vec3 v) {
	v=fract(v*443.8975);
	v+=dot(v,v.yzx+19.19);
	return fract((v.x+v.y)*v.z);
}
float interleavedGradientNoise(const in vec2 fragCoord,const in float seed) {
	vec3 magic=vec3(0.06711056,0.00583715,52.9829189);
	return fract(magic.z*fract(dot(fragCoord.xy+seed*vec2(2.083,4.867),magic.xy)));
}
vec3 hash3(vec2 p) {
	vec3 q=vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9)));
	return fract(sin(q)*43758.5453);
}
#endif
uniform float anisotropyFactor;
uniform float anisotropyNoise;
#if ANISOTROPY_TEX_MODE == 0
uniform float anisotropyDirection;
#else
uniform sampler2D anisotropyDirectionMap;
#endif
const float MIN_ROUGHNESS=0.05;
float D_GGX_Anisotropy(float at,float ab,float ToH,float BoH,float NoH) {
	float a2=at*ab;
	highp vec3 d=vec3(ab*ToH,at*BoH,a2*NoH);
	highp float d2=dot(d,d);
	float b2=a2/d2;
	return a2*b2*b2*(1./PI);
}
float V_GGX_SmithCorrelated_Anisotropy(float at,float ab,float ToV,float BoV,float ToL,float BoL,float NoV,float NoL) {
	float lambdaV=NoL*length(vec3(at*ToV,ab*BoV,NoV));
	float lambdaL=NoV*length(vec3(at*ToL,ab*BoL,NoL));
	float v=0.5/(lambdaV+lambdaL);
	return saturate(v);
}
vec3 indirectAnisotropyBentNormal(const in vec3 normal,const in vec3 viewDir,const in float roughness,const in vec3 anisotropicT,const in vec3 anisotropicB) {
	vec3 aDirection=anisotropyFactor>=0.?anisotropicB:anisotropicT;
	vec3 aTangent=cross(aDirection,viewDir);
	vec3 aNormal=cross(aTangent,aDirection);
	float bendFactor=abs(anisotropyFactor)*saturate(5.*max(roughness,MIN_ROUGHNESS));
	return normalize(mix(normal,aNormal,bendFactor));
}
vec3 BRDF_GGX_Anisotropy(const in vec3 lightDir,const in vec3 viewDir,const in vec3 normal,const in vec3 f0,const in float f90,const in float roughness,const in vec3 anisotropicT,const in vec3 anisotropicB) {
	float alpha=pow2(roughness);
	vec3 halfDir=normalize(lightDir+viewDir);
	float dotNL=saturate(dot(normal,lightDir));
	float dotNV=saturate(dot(normal,viewDir));
	float dotNH=saturate(dot(normal,halfDir));
	float dotVH=saturate(dot(viewDir,halfDir));
	float dotTV=dot(anisotropicT,viewDir);
	float dotBV=dot(anisotropicB,viewDir);
	float dotTL=dot(anisotropicT,lightDir);
	float dotBL=dot(anisotropicB,lightDir);
	float dotTH=dot(anisotropicT,halfDir);
	float dotBH=dot(anisotropicB,halfDir);
	float aspect=sqrt(1.-min(1.-MIN_ROUGHNESS,abs(anisotropyFactor)*0.9));
	if(anisotropyFactor>0.)aspect=1./aspect;
	float at=roughness*aspect;
	float ab=roughness/aspect;
	vec3 F=F_Schlick(f0,f90,dotVH);
	float V=V_GGX_SmithCorrelated_Anisotropy(at,ab,dotTV,dotBV,dotTL,dotBL,dotNV,dotNL);
	float D=D_GGX_Anisotropy(at,ab,dotTH,dotBH,dotNH);
	return F*(V*D);
}
```

<a id="shader-53"></a>
### 53. Fragment clipping: declarations

- **Stage:** snippet  ·  **Role:** FragmentClippingExtensionPlugin1 (Hc)
- **Owner (minified):** `?`  ·  **Source:** character offset 1434881
- **Uniforms:** `fragClippingPosition : vec4`, `fragClippingParams : vec4`, `fragClippingCamAspect : float`
- **Compile-time switches:** `FRAG_CLIPPING_MODE`
- **Note:** `${Qc.Circle}` … are the integer values of the clipping-shape enum (Circle/Ellipse/Rectangle/Plane/Sphere).

```glsl
uniform vec4 fragClippingPosition;
uniform vec4 fragClippingParams;
uniform float fragClippingCamAspect;
#if FRAG_CLIPPING_MODE == /*${Qc.Circle}*/
float fragClippingCircle() {
	vec2 pos = viewToScreen(vViewPosition.xyz).xy;
	float radius = fragClippingParams.x;
	vec2 center = fragClippingPosition.xy;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	return length(pos - center) - radius;
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Ellipse}*/
float fragClippingEllipse() {
	vec2 pos = viewToScreen(vViewPosition.xyz).xy;
	vec2 radius = fragClippingParams.xy;
	vec2 center = fragClippingPosition.xy;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	return length((pos - center) / radius) - 1.0;
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Rectangle}*/
float fragClippingRectangle() {
	vec2 pos = viewToScreen(vViewPosition.xyz).xy;
	vec2 radius = fragClippingParams.xy;
	vec2 center = fragClippingPosition.xy;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	vec2 d = abs(pos - center) - radius;
	return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Plane}*/
float fragClippingPlane() {
	vec3 pos = vViewPosition.xyz;
	vec3 normal = fragClippingParams.xyz;
	float d = dot(pos, normal) - fragClippingParams.w;
	return d;
}
#elif FRAG_CLIPPING_MODE == /*${Qc.Sphere}*/
float fragClippingSphere() {
	vec3 pos = vViewPosition.xyz;
	vec3 center = fragClippingPosition.xyz;
	float radius = fragClippingParams.x;
	pos.y /= fragClippingCamAspect;
	center.y /= fragClippingCamAspect;
	return length(pos - center) - radius;
}
#endif
```

<a id="shader-54"></a>
### 54. Fragment clipping: injection

- **Stage:** fragment injection
- **Owner (minified):** `e.fragmentShader`  ·  **Source:** character offset 1436732
- **Compile-time switches:** `FRAG_CLIPPING_MODE`, `FRAG_CLIPPING_DEBUG`, `FRAG_CLIPPING_INVERSE`
- **Note:** `${Qc.Circle}` … are the integer values of the clipping-shape enum (Circle/Ellipse/Rectangle/Plane/Sphere).

```glsl
float fragClippingDist = 0.0;
#if FRAG_CLIPPING_MODE == /*${Qc.Circle}*/
fragClippingDist = fragClippingCircle();
#elif FRAG_CLIPPING_MODE == /*${Qc.Ellipse}*/
fragClippingDist = fragClippingEllipse();
#elif FRAG_CLIPPING_MODE == /*${Qc.Rectangle}*/
fragClippingDist = fragClippingRectangle();
#elif FRAG_CLIPPING_MODE == /*${Qc.Plane}*/
fragClippingDist = fragClippingPlane();
#elif FRAG_CLIPPING_MODE == /*${Qc.Sphere}*/
fragClippingDist = fragClippingSphere();
#endif
#if FRAG_CLIPPING_DEBUG
gl_FragColor = vec4(max(fragClippingDist, 0.0), 0.0, 0.0, 1.0);
//    gl_FragColor = vec4(vViewPosition.xyz, 1.0);
#include <encodings_fragment>
return;
#endif
#if FRAG_CLIPPING_INVERSE == 1
if (fragClippingDist > 0.0) discard;
#else
if (fragClippingDist < 0.0) discard;
#endif
```

<a id="shader-68"></a>
### 68. Noise bump: voronoi helper

- **Stage:** fragment declarations  ·  **Role:** NoiseBumpMaterialPlugin (Wp)
- **Owner (minified):** `? / Wp`  ·  **Source:** character offset 1548131
- **Uniforms:** `noiseBumpParams : vec2`, `noiseBumpScale : float`, `noiseBumpFlakeScale : float`, `noiseFlakeClamp : float`, `noiseFlakeRadius : float`, `useColorFlakes : bool`, `flakeParams : vec4`, `flakeFallOffParams : vec3`
- **Compile-time switches:** `VORONOI_HELPER`

```glsl
#ifndef VORONOI_HELPER
#define VORONOI_HELPER
float voronoi_distance(vec2 a,vec2 b,float metric) {
	return distance(a,b);
}
float voronoi_f1_2d(in vec2 coord,in float randomness,in float flakeClamp,in float flakeRadius,inout vec3 outColor) {
	vec2 cellPosition=floor(coord);
	vec2 localPosition=coord-cellPosition;
	float minDistance=8.;
	vec2 targetOffset,targetPosition;
	for(int j=-1;j<=1;j++) {
		for(int i=-1;i<=1;i++) {
			vec2 cellOffset=vec2(i,j);
			vec2 pointPosition=cellOffset+hash3(cellPosition+cellOffset).xy*randomness;
			float distanceToPoint=voronoi_distance(pointPosition,localPosition,1.);
			if(distanceToPoint<minDistance) {
				targetOffset=cellOffset;
				minDistance=distanceToPoint;
				targetPosition=pointPosition;
			}
		}
	}
	float outDistance=minDistance;
	float dist=step(flakeRadius,outDistance);
	outColor=hash3(cellPosition+hash3(cellPosition+targetOffset).xy*randomness+targetOffset);
	vec3 outColor1=minDistance<flakeRadius?outColor:vec3(0.5,0.5,1.);
	outDistance=mix(dist,minDistance,flakeClamp);
	outColor=mix(outColor1,outColor,flakeClamp);
	return outDistance;
}
#endif
uniform vec2 noiseBumpParams;
uniform float noiseBumpScale;
uniform float noiseBumpFlakeScale;
uniform float noiseFlakeClamp;
uniform float noiseFlakeRadius;
uniform bool useColorFlakes;
uniform vec4 flakeParams;
uniform vec3 flakeFallOffParams;
vec3 perturbNormalArb_nb(vec3 surf_pos,vec3 surf_norm,vec2 dHdxy,float faceDirection) {
	vec3 vSigmaX=dFdx(surf_pos.xyz);
	vec3 vSigmaY=dFdy(surf_pos.xyz);
	vec3 vN=surf_norm;
	vec3 R1=cross(vSigmaY,vN);
	vec3 R2=cross(vN,vSigmaX);
	float fDet=dot(vSigmaX,R1)*faceDirection;
	vec3 vGrad=sign(fDet)*(dHdxy.x*R1+dHdxy.y*R2);
	return normalize(abs(fDet)*surf_norm-vGrad);
}
```

<a id="shader-75"></a>
### 75. Triplanar UV: varyings

- **Stage:** fragment injection  ·  **Role:** TriplanarUVMappingPlugin (_h)
- **Owner (minified):** `s`  ·  **Source:** character offset 1589808
- **Compile-time switches:** `USE_TRANSMISSION`

```glsl
#ifndef USE_TRANSMISSION
varying vec3 vWorldPosition;
#endif
varying vec3 vWorldNormal;
```

<a id="shader-76"></a>
### 76. Triplanar UV: functions

- **Stage:** fragment injection
- **Owner (minified):** `o`  ·  **Source:** character offset 1590376
- **Uniforms:** `triplanarScale : float`, `triplanarBlend : float`, `triplanarOffset : float`
- **Compile-time switches:** `USE_TRANSMISSION`

```glsl
struct TriplanarUV {
	vec2 x;
	vec2 y;
	vec2 z;
};
uniform float triplanarScale;
uniform float triplanarBlend;
uniform float triplanarOffset;
vec3 getTriplanarWeights(in vec3 position,in vec3 normal) {
	vec3 triW=abs(normal);
	triW=clamp(triW-vec3(triplanarOffset),vec3(0.),vec3(1.));
	triW=pow(triW,vec3(triplanarBlend));
	return triW/(triW.x+triW.y+triW.z);
}
TriplanarUV getTriplanarUV(in vec3 position,in vec3 normal) {
	TriplanarUV triUV;
	triUV.x=position.zy*triplanarScale;
	triUV.y=position.xz*triplanarScale;
	triUV.z=position.xy*triplanarScale;
	if(normal.x<0.) {
		triUV.x.x=-triUV.x.x;
	}
	if(normal.y<0.) {
		triUV.y.x=-triUV.y.x;
	}
	if(normal.z>=0.) {
		triUV.z.x=-triUV.z.x;
	}
	return triUV;
}
vec4 textureTriplanar(in sampler2D tex,in vec3 position,in vec3 normal) {
	TriplanarUV triUV=getTriplanarUV(position,normal);
	vec4 texX=texture2D(tex,triUV.x);
	vec4 texY=texture2D(tex,triUV.y);
	vec4 texZ=texture2D(tex,triUV.z);
	vec3 triW=getTriplanarWeights(position,normal);
	return texX*triW.x+texY*triW.y+texZ*triW.z;
}
#ifndef USE_TRANSMISSION
varying vec3 vWorldPosition;
#endif
varying vec3 vWorldNormal;
```

<a id="shader-78"></a>
### 78. Triplanar UV: bump variant

- **Stage:** fragment injection
- **Owner (minified):** `c`  ·  **Source:** character offset 1591620
- **Uniforms:** `bumpMap : sampler2D`, `bumpScale : float`
- **Compile-time switches:** `USE_BUMPMAP`

```glsl
#ifdef USE_BUMPMAP
uniform sampler2D bumpMap;
uniform float bumpScale;
// Bump Mapping Unparametrized Surfaces on the GPU by Morten S. Mikkelsen
// https://invalid.invalid/papers3d/mm_sfgrad_bump.pdf
// Evaluate the derivative of the height w.r.t. screen-space using forward differencing (listing 2)
vec2 dHdxy_fwd()  {
	vec3 dSTdx = dFdx( vWorldPosition );
	vec3 dSTdy = dFdy( vWorldPosition );
	vec3 normal_ = normalize(vWorldNormal);
	float Hll = bumpScale * textureTriplanar( bumpMap, vWorldPosition, normal_ ).x;
	float dBx = bumpScale * textureTriplanar( bumpMap, vWorldPosition + dSTdx, normal_ ).x - Hll;
	float dBy = bumpScale * textureTriplanar( bumpMap, vWorldPosition + dSTdy, normal_ ).x - Hll;
	return vec2( dBx, dBy );
}
vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection )  {
	vec3 vSigmaX = dFdx( surf_pos.xyz );
	vec3 vSigmaY = dFdy( surf_pos.xyz );
	vec3 vN = surf_norm;
	// normalized
	vec3 R1 = cross( vSigmaY, vN );
	vec3 R2 = cross( vN, vSigmaX );
	float fDet = dot( vSigmaX, R1 ) * faceDirection;
	vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
	return normalize( abs( fDet ) * surf_norm - vGrad );
}
#endif
```

<a id="shader-79"></a>
### 79. Clearcoat tint declarations

- **Stage:** fragment declarations  ·  **Role:** ClearcoatTintPlugin (yh)
- **Owner (minified):** `? / yh`  ·  **Source:** character offset 1598515
- **Uniforms:** `ccTintColor : vec3`, `ccThickness : float`, `ccIor : float`

```glsl
uniform vec3 ccTintColor;
uniform float ccThickness;
uniform float ccIor;
vec3 clearcoatTint(const in float dotNV, const in float dotNL, const in float clearcoat)  {
	vec3 tint = ( ccThickness > 0. ? 1. - ccTintColor : ccTintColor);
	// Set thickness < 0 for glow.
	tint = exp(tint * -(ccThickness * ((dotNL + dotNV) / max(dotNL * dotNV, 1e-3))));
	// beer's law
	return mix(vec3(1.0), tint, clearcoat);
}
```

<a id="shader-106"></a>
### 106. Bump-map extension (normal patch)

- **Stage:** fragment injection
- **Owner (minified):** `?`  ·  **Source:** character offset 2155479

```glsl
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <map_fragment>
```

## Code — Ground, background & shadows

<a id="shader-55"></a>
### 55. HDRi ground-projected background fragment

- **Stage:** fragment  ·  **Role:** HDRiGroundPlugin (Kc): backgroundCube fragment
- **Owner (minified):** `? / Kc`  ·  **Source:** character offset 1444664
- **Uniforms:** `worldRadius : float`, `tripodHeight : float`, `originPosition : vec3`
- **Compile-time switches:** `HDR`

```glsl
#ifdef HDRi_GROUND_PROJ
float intersectPlane1(const in vec3 r0,const in vec3 rd,const in vec3 n,const in vec3 p0) {
	float t=dot(p0-r0,n)/(dot(n,rd)+1e-6);
	return t<0.?1000.:t;
}
float intersectSphere1(in vec3 ro,in vec3 rd,in vec3 sph,in float rad) {
	vec3 oc=ro-sph;
	float b=dot(oc,rd);
	float c=dot(oc,oc)-rad*rad;
	float t=b*b-c;
	return t<0.?t:-b+sqrt(t);
}
#define PI_HALF  1.5707963267948966
uniform float worldRadius;
uniform float tripodHeight;
uniform vec3 originPosition;
vec3 hdriProject() {
	vec3 p=normalize(vWorldDirection);
	vec3 camPos=cameraPosition;
	camPos.y-=tripodHeight;
	float t=intersectSphere1(camPos,p,originPosition,worldRadius);
	if(t>0.) {
		float t2=intersectPlane1(camPos,p,vec3(0,-1,0),originPosition+vec3(0.,-tripodHeight,0.));
		p=(camPos+min(t,t2)*p)/worldRadius;
	} else p=vec3(0.,1.,0.);
	return p;
}
#endif
```

<a id="shader-81"></a>
### 81. Ground shadow: vertex position patch

- **Stage:** vertex injection  ·  **Role:** class Ig
- **Owner (minified):** `Ig`  ·  **Source:** character offset 1790053

```glsl
#include <project_vertex>
gl_Position = vec4(uv*2.-1., 0, 1.);
```

<a id="shader-82"></a>
### 82. Ground shadow: vertex

- **Stage:** vertex injection  ·  **Role:** class Ig
- **Owner (minified):** `Ig`  ·  **Source:** character offset 1790187
- **Note:** This is a fragment, not a whole program: it is spliced into a larger function of Three's shader, so its braces do not balance.

```glsl
varying vec2 vUv;
void main()  {
	vUv = uv;
```

<a id="shader-83"></a>
### 83. Ground shadow: fragment (reads tLastThis)

- **Stage:** fragment injection  ·  **Role:** class Ig
- **Owner (minified):** `Ig`  ·  **Source:** character offset 1790308
- **Uniforms:** `tLastThis : sampler2D`
- **Note:** This is a fragment, not a whole program: it is spliced into a larger function of Three's shader, so its braces do not balance.

```glsl
varying vec2 vUv;
uniform sampler2D tLastThis;
void main()  {
```

<a id="shader-84"></a>
### 84. Ground shadow: colour/alpha from shadow mask

- **Stage:** fragment injection  ·  **Role:** class Ig
- **Owner (minified):** `Ig`  ·  **Source:** character offset 1790428

```glsl
gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
```

<a id="shader-85"></a>
### 85. Ground shadow: dithered shadow colour

- **Stage:** snippet  ·  **Role:** class Ig
- **Owner (minified):** `Ig`  ·  **Source:** character offset 1790503

```glsl
float shadow = getShadowMask();
//shift the color by dither_shift
shadow = clamp(shadow + mix(-1./512., 1./512., rand( gl_FragCoord.xy )), 0., 1.);
float last = unpackRGBAToDepth(texture2D(tLastThis, vUv));
gl_FragColor = packDepthToRGBA(mix(last, shadow, opacity));
//if not useMovingAverage:
//gl_FragColor = packDepthToRGBA(shadow * opacity + last);
```

<a id="shader-86"></a>
### 86. Ground extension: transitionOpacity

- **Stage:** snippet  ·  **Role:** class kg
- **Owner (minified):** `kg`  ·  **Source:** character offset 1792555
- **Uniforms:** `transitionOpacity : float`

```glsl
uniform float transitionOpacity;
```

<a id="shader-87"></a>
### 87. Ground extension: AO alpha modulation

- **Stage:** fragment injection  ·  **Role:** class kg
- **Owner (minified):** `e.fragmentShader`  ·  **Source:** character offset 1793708
- **Compile-time switches:** `OPAQUE`, `USE_AOMAP`, `NUM_DIR_LIGHT_SHADOWS`

```glsl
#include <output_fragment>
#ifndef OPAQUE
#ifdef USE_AOMAP
#if NUM_DIR_LIGHT_SHADOWS > 0
// TODO find a better solution
float alphaMod = length(reflectedLight.directDiffuse)*4./float(NUM_DIR_LIGHT_SHADOWS);
#else
float alphaMod = 1.;
#endif
float t1 = 1. - ambientOcclusion;
float t2 = max(1. - alphaMod, 0.);
float t = t1 + t2;
gl_FragColor.a *= max(t, 0.);
#endif
#endif
```

<a id="shader-88"></a>
### 88. Ground extension: alpha vignette

- **Stage:** fragment injection  ·  **Role:** class kg
- **Owner (minified):** `e.fragmentShader`  ·  **Source:** character offset 1794539
- **Compile-time switches:** `OPAQUE`, `USE_UV`, `USE_LIGHTMAP`
- **Note:** `alphaVignetteAxis` is a swizzle string (e.g. `x`, `y`) chosen by the plugin.

```glsl
#include <output_fragment>
#ifndef OPAQUE
float weight = 0.;
#ifdef USE_UV
weight = 2.*abs(length(0.5 - vUv./*${this.alphaVignetteAxis}*/));
#endif
#if defined(USE_LIGHTMAP) || defined(USE_AOMAP)
weight = 2.*abs(length(0.5 - vAoMapUv./*${this.alphaVignetteAxis}*/));
#endif
weight = min(1., max(0., weight))-0.5;
weight = min(1., max(0., 1.0-2.*weight));
weight = pow(weight, 1.5);
gl_FragColor.a *= weight;
//gl_FragColor.rgb /= max(0.01, weight);
gl_FragColor = saturate(gl_FragColor);
//gl_FragColor.a = 0.5;
#endif
```

<a id="shader-89"></a>
### 89. Ground shadow depth blur fragment

- **Stage:** fragment  ·  **Role:** class kg._shadowBlurMat
- **Owner (minified):** `kg`  ·  **Source:** character offset 1796459
- **Uniforms:** `colorTexture : sampler2D`, `size : vec2`, `direction : vec2`, `step : float`

```glsl
#include <packing>
uniform sampler2D colorTexture;
uniform vec2 size;
uniform vec2 direction;
uniform float step;
varying vec2 vUv;
void main() {
	float sum=0.;
	vec2 uvDelta=step*direction/size;
	sum+=unpackRGBAToDepth(texture2D(colorTexture,vUv-1.*uvDelta))*0.3333;
	sum+=unpackRGBAToDepth(texture2D(colorTexture,vec2(vUv.x,vUv.y)))*0.3333;
	sum+=unpackRGBAToDepth(texture2D(colorTexture,vUv+1.*uvDelta))*0.3333;
	gl_FragColor=packDepthToRGBA(sum);
}
```

<a id="shader-90"></a>
### 90. Planar reflection: vertex injection

- **Stage:** vertex injection  ·  **Role:** class Dg
- **Owner (minified):** `Dg`  ·  **Source:** character offset 1802907
- **Note:** This is a fragment, not a whole program: it is spliced into a larger function of Three's shader, so its braces do not balance.

```glsl
void main()  {
	vRefUv = refTextureMatrix * vec4( position, 1.0 );
```

<a id="shader-91"></a>
### 91. Planar reflection: vertex declarations

- **Stage:** vertex declarations  ·  **Role:** class Dg
- **Owner (minified):** `Dg`  ·  **Source:** character offset 1804314
- **Uniforms:** `refTextureMatrix : mat4`

```glsl
uniform mat4 refTextureMatrix;
varying vec4 vRefUv;
```

<a id="shader-92"></a>
### 92. Planar reflection: fragment declarations

- **Stage:** fragment declarations  ·  **Role:** class Dg
- **Owner (minified):** `Dg`  ·  **Source:** character offset 1804432
- **Uniforms:** `sceneBoundingRadius : float`, `tRefDiffuse : sampler2D`, `tRefDiffuseSize : vec2`

```glsl
#ifndef D_sceneBoundingRadius
#define D_sceneBoundingRadius
uniform float sceneBoundingRadius;
#endif
varying vec4 vRefUv;
uniform sampler2D tRefDiffuse;
uniform vec2 tRefDiffuseSize;
float getSpecularMIPLevel(const in float roughness,const in float maxMIPLevel) {
	float sigma=PI*roughness*roughness/(1.+roughness);
	float desiredMIPLevel=maxMIPLevel+log2(sigma);
	return clamp(desiredMIPLevel,0.,maxMIPLevel);
}
vec4 getReflectionColor(const in float roughness,const in float depthModifier) {
	float mip=getSpecularMIPLevel(roughness+depthModifier,5.);
	vec4 color=texture2D(tRefDiffuse,vRefUv.xy/vRefUv.w,mip);
	float blurDist=saturate(2./(1.+pow(abs(vViewPosition.z),0.25)))*mip*32.*color.a;
	float rnd=PI2*interleavedGradientNoise(vUv.xy,frameCount);
	vec4 rotationMatrix=vec4(cos(rnd),-sin(rnd),0.,0.);
	rotationMatrix.z=-rotationMatrix.y;
	rotationMatrix.w=rotationMatrix.x;
	vec3 colorSum=color.rgb*color.a;
	float weightSum=0.001+color.a;
	vec2 ofs;
	setPds();
#pragma unroll_loop_start
	for(int i=0;i<16;i++) {
		ofs=poisson_disk_samples[UNROLLED_LOOP_INDEX];
		ofs=vec2(dot(ofs,rotationMatrix.xy),dot(ofs,rotationMatrix.zw));
		ofs=vRefUv.xy+vRefUv.w*blurDist*ofs/tRefDiffuseSize.xy;
		color=texture2D(tRefDiffuse,ofs/vRefUv.w,mip);
		colorSum+=color.rgb*color.a;
		weightSum+=color.a;
	}
#pragma unroll_loop_end
	return vec4(colorSum/weightSum,1.);
}
```

<a id="shader-98"></a>
### 98. Contact-shadow ground fragment

- **Stage:** fragment  ·  **Role:** ContactShadowGroundPlugin (gE / oE)
- **Owner (minified):** `oE`  ·  **Source:** character offset 2126239
- **Uniforms:** `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `opacity : float`, `tDiffuse : sampler2D`, `tTransparentMap : sampler2D`
- **Compile-time switches:** `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`

```glsl
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
uniform float opacity;
uniform sampler2D tDiffuse;
uniform sampler2D tTransparentMap;
varying vec2 vUv;
void main()  {
	float depth = getDepth(vUv);
	vec4 texel;
	if(depth>0.9999)  {
		texel = texture2D( tTransparentMap, vUv );
		if(texel.a < 0.01) discard;
		// background
		// transparent objects with render to depth = false
	} else  {
		texel = texture2D( tDiffuse, vUv );
	}
	gl_FragColor = texel;
}
```

<a id="shader-99"></a>
### 99. Horizontal blur vertex

- **Stage:** vertex  ·  **Role:** Three HorizontalBlurShader
- **Owner (minified):** `mE`  ·  **Source:** character offset 2144255

```glsl
varying vec2 vUv;
void main()  {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
```

<a id="shader-100"></a>
### 100. Horizontal blur fragment

- **Stage:** fragment
- **Owner (minified):** `mE`  ·  **Source:** character offset 2144428
- **Uniforms:** `tDiffuse : sampler2D`, `h : float`

```glsl
uniform sampler2D tDiffuse;
uniform float h;
varying vec2 vUv;
void main()  {
	vec4 sum = vec4( 0.0 );
	sum += texture2D( tDiffuse, vec2( vUv.x - 4.0 * h, vUv.y ) ) * 0.051;
	sum += texture2D( tDiffuse, vec2( vUv.x - 3.0 * h, vUv.y ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x - 2.0 * h, vUv.y ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x - 1.0 * h, vUv.y ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
	sum += texture2D( tDiffuse, vec2( vUv.x + 1.0 * h, vUv.y ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x + 2.0 * h, vUv.y ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x + 3.0 * h, vUv.y ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x + 4.0 * h, vUv.y ) ) * 0.051;
	gl_FragColor = sum;
}
```

<a id="shader-101"></a>
### 101. Vertical blur vertex

- **Stage:** vertex  ·  **Role:** Three VerticalBlurShader
- **Owner (minified):** `_E`  ·  **Source:** character offset 2145399

```glsl
varying vec2 vUv;
void main()  {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
```

<a id="shader-102"></a>
### 102. Vertical blur fragment

- **Stage:** fragment
- **Owner (minified):** `_E`  ·  **Source:** character offset 2145572
- **Uniforms:** `tDiffuse : sampler2D`, `v : float`

```glsl
uniform sampler2D tDiffuse;
uniform float v;
varying vec2 vUv;
void main()  {
	vec4 sum = vec4( 0.0 );
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 4.0 * v ) ) * 0.051;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 3.0 * v ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 2.0 * v ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 1.0 * v ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 1.0 * v ) ) * 0.1531;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 2.0 * v ) ) * 0.12245;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 3.0 * v ) ) * 0.0918;
	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 4.0 * v ) ) * 0.051;
	gl_FragColor = sum;
}
```

<a id="shader-103"></a>
### 103. Contact-shadow depth-material patch

- **Stage:** fragment injection  ·  **Role:** gE.onAdded
- **Owner (minified):** `gE`  ·  **Source:** character offset 2147175

```glsl
/*${e.fragmentShader.replace("gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );","gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), 1.0 );")}*/
```

## Code — Utility & debug

<a id="shader-41"></a>
### 41. Fat line vertex (Line2)

- **Stage:** vertex  ·  **Role:** Three LineMaterial
- **Owner (minified):** `r.Vj0.line`  ·  **Source:** character offset 1322667
- **Uniforms:** `linewidth : float`, `resolution : vec2`, `dashScale : float`
- **Compile-time switches:** `WORLD_UNITS`, `USE_DASH`, `USE_COLOR`

```glsl
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
uniform float linewidth;
uniform vec2 resolution;
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
attribute vec3 instanceColorStart;
attribute vec3 instanceColorEnd;
#ifdef WORLD_UNITS
varying vec4 worldPos;
varying vec3 worldStart;
varying vec3 worldEnd;
#ifdef USE_DASH
varying vec2 vUv;
#endif
#else
varying vec2 vUv;
#endif
#ifdef USE_DASH
uniform float dashScale;
attribute float instanceDistanceStart;
attribute float instanceDistanceEnd;
varying float vLineDistance;
#endif
void trimSegment( const in vec4 start, inout vec4 end )  {
	// trim end segment so it terminates between the camera plane and the near plane
	// conservative estimate of the near plane
	float a = projectionMatrix[ 2 ][ 2 ];
	// 3nd entry in 3th column
	float b = projectionMatrix[ 3 ][ 2 ];
	// 3nd entry in 4th column
	float nearEstimate = - 0.5 * b / a;
	float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );
	end.xyz = mix( start.xyz, end.xyz, alpha );
}
void main()  {
#ifdef USE_COLOR
	vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;
#endif
#ifdef USE_DASH
	vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
	vUv = uv;
#endif
	float aspect = resolution.x / resolution.y;
	// camera space
	vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
	vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );
#ifdef WORLD_UNITS
	worldStart = start.xyz;
	worldEnd = end.xyz;
#else
	vUv = uv;
#endif
	// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
	// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
	// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
	// perhaps there is a more elegant solution -- WestLangley
	bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 );
	// 4th entry in the 3rd column
	if ( perspective )  {
		if ( start.z < 0.0 && end.z >= 0.0 )  {
			trimSegment( start, end );
		} else if ( end.z < 0.0 && start.z >= 0.0 )  {
			trimSegment( end, start );
		}
	}
	// clip space
	vec4 clipStart = projectionMatrix * start;
	vec4 clipEnd = projectionMatrix * end;
	// ndc space
	vec3 ndcStart = clipStart.xyz / clipStart.w;
	vec3 ndcEnd = clipEnd.xyz / clipEnd.w;
	// direction
	vec2 dir = ndcEnd.xy - ndcStart.xy;
	// account for clip-space aspect ratio
	dir.x *= aspect;
	dir = normalize( dir );
#ifdef WORLD_UNITS
	// get the offset direction as perpendicular to the view vector
	vec3 worldDir = normalize( end.xyz - start.xyz );
	vec3 offset;
	if ( position.y < 0.5 )  {
		offset = normalize( cross( start.xyz, worldDir ) );
	} else  {
		offset = normalize( cross( end.xyz, worldDir ) );
	}
	// sign flip
	if ( position.x < 0.0 ) offset *= - 1.0;
	float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );
	// don't extend the line if we're rendering dashes because we
	// won't be rendering the endcaps
#ifndef USE_DASH
	// extend the line bounds to encompass  endcaps
	start.xyz += - worldDir * linewidth * 0.5;
	end.xyz += worldDir * linewidth * 0.5;
	// shift the position of the quad so it hugs the forward edge of the line
	offset.xy -= dir * forwardOffset;
	offset.z += 0.5;
#endif
	// endcaps
	if ( position.y > 1.0 || position.y < 0.0 )  {
		offset.xy += dir * 2.0 * forwardOffset;
	}
	// adjust for linewidth
	offset *= linewidth * 0.5;
	// set the world position
	worldPos = ( position.y < 0.5 ) ? start : end;
	worldPos.xyz += offset;
	// project the worldpos
	vec4 clip = projectionMatrix * worldPos;
	// shift the depth of the projected points so the line
	// segments overlap neatly
	vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
	clip.z = clipPose.z * clip.w;
#else
	vec2 offset = vec2( dir.y, - dir.x );
	// undo aspect ratio adjustment
	dir.x /= aspect;
	offset.x /= aspect;
	// sign flip
	if ( position.x < 0.0 ) offset *= - 1.0;
	// endcaps
	if ( position.y < 0.0 )  {
		offset += - dir;
	} else if ( position.y > 1.0 )  {
		offset += dir;
	}
	// adjust for linewidth
	offset *= linewidth;
	// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
	offset /= resolution.y;
	// select end
	vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;
	// back to clip space
	offset *= clip.w;
	clip.xy += offset;
#endif
	gl_Position = clip;
	vec4 mvPosition = ( position.y < 0.5 ) ? start : end;
	// this is an approximation
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <fog_vertex>
}
```

<a id="shader-42"></a>
### 42. Fat line fragment (Line2)

- **Stage:** fragment  ·  **Role:** Three LineMaterial
- **Owner (minified):** `r.Vj0.line`  ·  **Source:** character offset 1328567
- **Uniforms:** `diffuse : vec3`, `opacity : float`, `linewidth : float`, `dashOffset : float`, `dashSize : float`, `gapSize : float`
- **Compile-time switches:** `USE_DASH`, `WORLD_UNITS`, `USE_ALPHA_TO_COVERAGE`

```glsl
uniform vec3 diffuse;
uniform float opacity;
uniform float linewidth;
#ifdef USE_DASH
uniform float dashOffset;
uniform float dashSize;
uniform float gapSize;
#endif
varying float vLineDistance;
#ifdef WORLD_UNITS
varying vec4 worldPos;
varying vec3 worldStart;
varying vec3 worldEnd;
#ifdef USE_DASH
varying vec2 vUv;
#endif
#else
varying vec2 vUv;
#endif
#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4)  {
	float mua;
	float mub;
	vec3 p13 = p1 - p3;
	vec3 p43 = p4 - p3;
	vec3 p21 = p2 - p1;
	float d1343 = dot( p13, p43 );
	float d4321 = dot( p43, p21 );
	float d1321 = dot( p13, p21 );
	float d4343 = dot( p43, p43 );
	float d2121 = dot( p21, p21 );
	float denom = d2121 * d4343 - d4321 * d4321;
	float numer = d1343 * d4321 - d1321 * d4343;
	mua = numer / denom;
	mua = clamp( mua, 0.0, 1.0 );
	mub = ( d1343 + d4321 * ( mua ) ) / d4343;
	mub = clamp( mub, 0.0, 1.0 );
	return vec2( mua, mub );
}
void main()  {
#include <clipping_planes_fragment>
#ifdef USE_DASH
	if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard;
	// discard endcaps
	if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard;
	// todo - FIX
#endif
	float alpha = opacity;
#ifdef WORLD_UNITS
	// Find the closest points on the view ray and the line segment
	vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
	vec3 lineDir = worldEnd - worldStart;
	vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );
	vec3 p1 = worldStart + lineDir * params.x;
	vec3 p2 = rayEnd * params.y;
	vec3 delta = p1 - p2;
	float len = length( delta );
	float norm = len / linewidth;
#ifndef USE_DASH
#ifdef USE_ALPHA_TO_COVERAGE
	float dnorm = fwidth( norm );
	alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );
#else
	if ( norm > 0.5 )  {
		discard;
	}
#endif
#endif
#else
#ifdef USE_ALPHA_TO_COVERAGE
	// artifacts appear on some hardware if a derivative is taken within a conditional
	float a = vUv.x;
	float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
	float len2 = a * a + b * b;
	float dlen = fwidth( len2 );
	if ( abs( vUv.y ) > 1.0 )  {
		alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );
	}
#else
	if ( abs( vUv.y ) > 1.0 )  {
		float a = vUv.x;
		float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
		float len2 = a * a + b * b;
		if ( len2 > 1.0 ) discard;
	}
#endif
#endif
	vec4 diffuseColor = vec4( diffuse, alpha );
#include <logdepthbuf_fragment>
#include <color_fragment>
	gl_FragColor = vec4( diffuseColor.rgb, alpha );
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
}
```

<a id="shader-80"></a>
### 80. Debug texture overlay fragment

- **Stage:** fragment  ·  **Role:** class _d (DebugPlugin.addTexture)
- **Owner (minified):** `_d`  ·  **Source:** character offset 1670003
- **Uniforms:** `opacity : float`, `tDiffuse : samplerCube`
- **Note:** `${s??""}` is an optional extra snippet.

```glsl
#include <common>
#include <packing>
uniform float opacity;
uniform samplerCube tDiffuse;
varying vec2 vUv;
void main()  {
	vec4 texel = textureCube( tDiffuse, vec3(cos(vUv.y * PI2) * cos(vUv.x * PI2), sin(vUv.y * PI2), cos(vUv.y * PI2) * sin(vUv.x * PI2)) );
	/*${s??""}*/ gl_FragColor = opacity * texel;
}
```

<a id="shader-93"></a>
### 93. Outline declarations

- **Stage:** snippet  ·  **Role:** OutlinePlugin (Xx)
- **Owner (minified):** `?`  ·  **Source:** character offset 2097641
- **Uniforms:** `tNormalDepth : sampler2D`, `tGBufferFlags : sampler2D`, `outlineBuffer : sampler2D`, `tDiffuseSize : vec2`, `outlineColor : vec3`, `outlineThickness : float`, `outlineIntensity : float`, `highlightTransparency : float`, `enableHighlight : bool`
- **Compile-time switches:** `UNPACK_GBUFFER_SNIPPET`, `GBUFFER_HAS_FLAGS`, `DEBUG_OUTLINE`

```glsl
#ifndef UNPACK_GBUFFER_SNIPPET
#define UNPACK_GBUFFER_SNIPPET
uniform sampler2D tNormalDepth;
float unpack16(vec2 value) {
	return value.x+value.y/255.;
}
vec3 unpackNormal(vec2 enc) {
	vec2 fenc=enc*4.-2.;
	float f=dot(fenc,fenc);
	float g=sqrt(1.-f/4.);
	return vec3(fenc*g,1.-f/2.);
}
float unpackDepth(vec2 uncodedDepth) {
	float x=unpack16(uncodedDepth.xy);
	return x*x;
}
float getDepth(vec2 uv) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	return unpackDepth(uncodedDepth.xy);
}
void getDepthNormal(const in vec2 uv,out float depth,out vec3 normal) {
	vec4 uncodedDepth=texture2D(tNormalDepth,uv);
	depth=unpackDepth(uncodedDepth.xy);
	normal=unpackNormal(uncodedDepth.zw);
}
vec3 getViewNormal(const in vec2 uv) {
	return unpackNormal(texture2D(tNormalDepth,uv).zw);
}
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
uniform sampler2D tGBufferFlags;
#endif
vec4 getGBufferFlags(const in vec2 uv) {
#if defined(GBUFFER_HAS_FLAGS) && GBUFFER_HAS_FLAGS == 1
	return texture2D(tGBufferFlags,uv);
#else
	return vec4(1.);
#endif
}
#endif
uniform sampler2D outlineBuffer;
uniform vec2 tDiffuseSize;
uniform vec3 outlineColor;
uniform float outlineThickness;
uniform float outlineIntensity;
uniform float highlightTransparency;
uniform bool enableHighlight;
float isSelected(vec2 uv) {
	return 1.-texture2D(outlineBuffer,uv).b;
}
vec4 outline(in vec4 color) {
	vec2 invSize=1./tDiffuseSize;
#if DEBUG_OUTLINE > 0
	color=vec4(0.,0.,0.,1.);
#endif
	vec3 finalColor=color.rgb;
	float c=isSelected(vUv);
	if(c>0.) {
		vec4 uvOffset=1.5*outlineThickness*vec4(1.,0.,-1.,1.)*vec4(invSize,invSize);
		float c1=isSelected(vUv+uvOffset.xy);
		float c2=isSelected(vUv-uvOffset.xy);
		float c3=isSelected(vUv+uvOffset.yw);
		float c4=isSelected(vUv-uvOffset.yw);
		float diff1=(c1-c2)*0.5;
		float diff2=(c3-c4)*0.5;
		float d=length(vec2(diff1,diff2));
		vec4 highlightColor=enableHighlight?vec4(c*outlineColor,(1.-highlightTransparency)*c):vec4(0.);
		vec4 edgeColor=vec4(outlineColor,1.)*vec4(d);
		float gbufferDepth=getDepth(vUv);
		float outlineDepth=unpack16(texture2D(outlineBuffer,vUv).xy);
		outlineDepth*=outlineDepth;
		outlineDepth-=0.001;
		if(gbufferDepth<outlineDepth) {
			highlightColor.rgb=highlightColor.rgb*0.3;
			edgeColor.rgb=edgeColor.rgb*0.5;
		}
		vec4 outColor=edgeColor+highlightColor*(1.-d);
		finalColor=mix(color.rgb,outlineIntensity*outColor.rgb,outColor.a);
	} else {
		finalColor.rgb=color.rgb;
	}
	return vec4(finalColor.rgb,color.a);
}
```

<a id="shader-95"></a>
### 95. Outline injection

- **Stage:** fragment injection
- **Owner (minified):** `? / Xx`  ·  **Source:** character offset 2099305

```glsl
gl_FragColor = outline(gl_FragColor);
#glMarker
```

<a id="shader-96"></a>
### 96. Outline normal pass vertex

- **Stage:** vertex  ·  **Role:** class Yx
- **Owner (minified):** `n / Yx`  ·  **Source:** character offset 2101316
- **Compile-time switches:** `USE_ALPHAMAP`

```glsl
#ifdef USE_ALPHAMAP
#define USE_UV
#endif
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vViewPosition;
void main() {
#include <skinbase_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
	vViewPosition=-mvPosition.xyz;
}
```

<a id="shader-97"></a>
### 97. Outline normal pass fragment

- **Stage:** fragment
- **Owner (minified):** `n / Yx`  ·  **Source:** character offset 2101837
- **Uniforms:** `cameraNearFar : vec2`

```glsl
uniform vec2 cameraNearFar;
varying vec3 vViewPosition;
vec2 pack16(float value) {
	float sMax=65535.;
	int v=int(clamp(value,0.,1.)*sMax+0.5);
	int digit0=v/256;
	int digit1=v-digit0*256;
	return vec2(float(digit0)/255.,float(digit1)/255.);
}
float linstep(float edge0,float edge1,float value) {
	return clamp((value-edge0)/(edge1-edge0),0.,1.);
}
void main() {
	float linearZ=linstep(-cameraNearFar.x,-cameraNearFar.y,-vViewPosition.z);
	vec2 packedZ=pack16(pow(linearZ,0.5));
	gl_FragColor=vec4(packedZ.x,packedZ.y,0.,0.);
}
```

## Code — Three.js internals

<a id="shader-0"></a>
### 0. ShaderMaterial default vertex shader

- **Stage:** vertex  ·  **Role:** fallback used when a ShaderMaterial has no vertex shader
- **Owner (minified):** `ks / __webpackgi_modules__`  ·  **Source:** character offset 397766

```glsl
void main()  {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
```

<a id="shader-1"></a>
### 1. ShaderMaterial default fragment shader

- **Stage:** fragment  ·  **Role:** fallback: solid red
- **Owner (minified):** `ks / __webpackgi_modules__`  ·  **Source:** character offset 397882

```glsl
void main()  {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}
```

<a id="shader-2"></a>
### 2. Equirect→cube vertex (PMREM helper)

- **Stage:** shared snippet  ·  **Role:** WebGLCubeUVMaps / Us.fromEquirectangularTexture
- **Owner (minified):** `n / Us`  ·  **Source:** character offset 404852

```glsl
varying vec3 vWorldDirection;
vec3 transformDirection( in vec3 dir, in mat4 matrix )  {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
void main()  {
	vWorldDirection = transformDirection( position, modelMatrix );
#include <begin_vertex>
#include <project_vertex>
}
```

<a id="shader-3"></a>
### 3. Equirect→cube fragment (PMREM helper)

- **Stage:** shared snippet  ·  **Role:** samples an equirect map for each cube direction
- **Owner (minified):** `i / Us`  ·  **Source:** character offset 405243
- **Uniforms:** `tEquirect : sampler2D`

```glsl
uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main()  {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
}
```

<a id="shader-4"></a>
### 4. PMREM blur vertex

- **Stage:** vertex  ·  **Role:** PMREMGenerator (da._blurMaterial)
- **Owner (minified):** `da`  ·  **Source:** character offset 567532

```glsl
precision mediump float;
precision mediump int;
attribute float faceIndex;
varying vec3 vOutputDirection;
// RH coordinate system; PMREM face-indexing convention
vec3 getDirection( vec2 uv, float face )  {
	uv = 2.0 * uv - 1.0;
	vec3 direction = vec3( uv, 1.0 );
	if ( face == 0.0 )  {
		direction = direction.zyx;
		// ( 1, v, u ) pos x
	} else if ( face == 1.0 )  {
		direction = direction.xzy;
		direction.xz *= -1.0;
		// ( -u, 1, -v ) pos y
	} else if ( face == 2.0 )  {
		direction.x *= -1.0;
		// ( -u, v, 1 ) pos z
	} else if ( face == 3.0 )  {
		direction = direction.zyx;
		direction.xz *= -1.0;
		// ( -1, v, -u ) neg x
	} else if ( face == 4.0 )  {
		direction = direction.xzy;
		direction.xy *= -1.0;
		// ( -u, -1, v ) neg y
	} else if ( face == 5.0 )  {
		direction.z *= -1.0;
		// ( u, v, -1 ) neg z
	}
	return direction;
}
void main()  {
	vOutputDirection = getDirection( uv, faceIndex );
	gl_Position = vec4( position, 1.0 );
}
```

<a id="shader-5"></a>
### 5. PMREM blur fragment

- **Stage:** fragment  ·  **Role:** directional gaussian blur along cube faces, builds the roughness levels
- **Owner (minified):** `da`  ·  **Source:** character offset 568708
- **Uniforms:** `envMap : sampler2D`, `samples : int`, `weights : float`, `latitudinal : bool`, `dTheta : float`, `mipInt : float`, `poleAxis : vec3`

```glsl
precision mediump float;
precision mediump int;
varying vec3 vOutputDirection;
uniform sampler2D envMap;
uniform int samples;
uniform float weights[ n ];
uniform bool latitudinal;
uniform float dTheta;
uniform float mipInt;
uniform vec3 poleAxis;
#define ENVMAP_TYPE_CUBE_UV
#include <cube_uv_reflection_fragment>
vec3 getSample( float theta, vec3 axis )  {
	float cosTheta = cos( theta );
	// Rodrigues' axis-angle rotation
	vec3 sampleDirection = vOutputDirection * cosTheta
	+ cross( axis, vOutputDirection ) * sin( theta )
	+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );
	return bilinearCubeUV( envMap, sampleDirection, mipInt );
}
void main()  {
	vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );
	if ( all( equal( axis, vec3( 0.0 ) ) ) )  {
		axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );
	}
	axis = normalize( axis );
	gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );
	for ( int i = 1; i < n; i++ )  {
		if ( i >= samples )  {
			break;
		}
		float theta = dTheta * float( i );
		gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
		gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );
	}
}
```

<a id="shader-6"></a>
### 6. PMREM equirect→CubeUV vertex

- **Stage:** vertex  ·  **Role:** PMREMGenerator
- **Owner (minified):** `_a / __webpackgi_modules__`  ·  **Source:** character offset 573227

```glsl
precision mediump float;
precision mediump int;
attribute float faceIndex;
varying vec3 vOutputDirection;
// RH coordinate system; PMREM face-indexing convention
vec3 getDirection( vec2 uv, float face )  {
	uv = 2.0 * uv - 1.0;
	vec3 direction = vec3( uv, 1.0 );
	if ( face == 0.0 )  {
		direction = direction.zyx;
		// ( 1, v, u ) pos x
	} else if ( face == 1.0 )  {
		direction = direction.xzy;
		direction.xz *= -1.0;
		// ( -u, 1, -v ) pos y
	} else if ( face == 2.0 )  {
		direction.x *= -1.0;
		// ( -u, v, 1 ) pos z
	} else if ( face == 3.0 )  {
		direction = direction.zyx;
		direction.xz *= -1.0;
		// ( -1, v, -u ) neg x
	} else if ( face == 4.0 )  {
		direction = direction.xzy;
		direction.xy *= -1.0;
		// ( -u, -1, v ) neg y
	} else if ( face == 5.0 )  {
		direction.z *= -1.0;
		// ( u, v, -1 ) neg z
	}
	return direction;
}
void main()  {
	vOutputDirection = getDirection( uv, faceIndex );
	gl_Position = vec4( position, 1.0 );
}
```

<a id="shader-7"></a>
### 7. PMREM equirect→CubeUV fragment

- **Stage:** fragment  ·  **Role:** converts an equirect map into the CubeUV layout
- **Owner (minified):** `_a / __webpackgi_modules__`  ·  **Source:** character offset 574403
- **Uniforms:** `envMap : sampler2D`

```glsl
precision mediump float;
precision mediump int;
varying vec3 vOutputDirection;
uniform sampler2D envMap;
#include <common>
void main()  {
	vec3 outputDirection = normalize( vOutputDirection );
	vec2 uv = equirectUv( outputDirection );
	gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );
}
```

<a id="shader-8"></a>
### 8. PMREM cube→CubeUV vertex

- **Stage:** vertex  ·  **Role:** PMREMGenerator
- **Owner (minified):** `ga / __webpackgi_modules__`  ·  **Source:** character offset 574954

```glsl
precision mediump float;
precision mediump int;
attribute float faceIndex;
varying vec3 vOutputDirection;
// RH coordinate system; PMREM face-indexing convention
vec3 getDirection( vec2 uv, float face )  {
	uv = 2.0 * uv - 1.0;
	vec3 direction = vec3( uv, 1.0 );
	if ( face == 0.0 )  {
		direction = direction.zyx;
		// ( 1, v, u ) pos x
	} else if ( face == 1.0 )  {
		direction = direction.xzy;
		direction.xz *= -1.0;
		// ( -u, 1, -v ) pos y
	} else if ( face == 2.0 )  {
		direction.x *= -1.0;
		// ( -u, v, 1 ) pos z
	} else if ( face == 3.0 )  {
		direction = direction.zyx;
		direction.xz *= -1.0;
		// ( -1, v, -u ) neg x
	} else if ( face == 4.0 )  {
		direction = direction.xzy;
		direction.xy *= -1.0;
		// ( -u, -1, v ) neg y
	} else if ( face == 5.0 )  {
		direction.z *= -1.0;
		// ( u, v, -1 ) neg z
	}
	return direction;
}
void main()  {
	vOutputDirection = getDirection( uv, faceIndex );
	gl_Position = vec4( position, 1.0 );
}
```

<a id="shader-9"></a>
### 9. PMREM cube→CubeUV fragment

- **Stage:** fragment  ·  **Role:** converts a cube map into the CubeUV layout
- **Owner (minified):** `ga / __webpackgi_modules__`  ·  **Source:** character offset 576130
- **Uniforms:** `flipEnvMap : float`, `envMap : samplerCube`

```glsl
precision mediump float;
precision mediump int;
uniform float flipEnvMap;
varying vec3 vOutputDirection;
uniform samplerCube envMap;
void main()  {
	gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );
}
```

<a id="shader-10"></a>
### 10. VSM shadow pass vertex

- **Stage:** shared snippet  ·  **Role:** Three vsm_vert
- **Owner (minified):** `dc / __webpackgi_modules__`  ·  **Source:** character offset 627960

```glsl
void main()  {
	gl_Position = vec4( position, 1.0 );
}
```

<a id="shader-11"></a>
### 11. VSM shadow pass fragment

- **Stage:** shared snippet  ·  **Role:** Three vsm_frag (variance shadow blur)
- **Owner (minified):** `fc / __webpackgi_modules__`  ·  **Source:** character offset 628022
- **Uniforms:** `shadow_pass : sampler2D`, `resolution : vec2`, `radius : float`
- **Compile-time switches:** `HORIZONTAL_PASS`

```glsl
uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main()  {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ )  {
		float uvOffset = uvStart + i * uvStride;
#ifdef HORIZONTAL_PASS
		vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
		mean += distribution.x;
		squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
#else
		float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
		mean += depth;
		squared_mean += depth * depth;
#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}
```

## 4. Three.js r152 built-in chunks

Three assembles its own materials from named chunks (`#include <name>`). The bundle contains the whole library; I diffed it against stock `three@0.152.2` (comments and whitespace ignored, because the build strips comments).

### 4.1 The 11 chunks the engine changed

These are the places where the engine's materials differ from a stock Three.js material. Each shows what was added/removed (statement level) and then the full engine version.

#### `alphamap_fragment`

```diff
- #ifdef USE_ALPHAMAP diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
- #endif
+ #ifdef USE_ALPHAMAP #if defined(INVERSE_ALPHAMAP) && INVERSE_ALPHAMAP >= 1 diffuseColor.a *= 1.0-texture2D( alphaMap, vAlphaMapUv ).g;
+ #else diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
+ #endif #endif
```

<details><summary>full engine version</summary>

```glsl
#ifdef USE_ALPHAMAP
	#if defined(INVERSE_ALPHAMAP) && INVERSE_ALPHAMAP >= 1
	diffuseColor.a *= 1.0-texture2D( alphaMap, vAlphaMapUv ).g;
	#else
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
	#endif
#endif
```

</details>

#### `encodings_pars_fragment`

```diff
+ vec4 sRGBToLinear( in vec4 value ) {
+ return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
+ vec4 RGBMToLinear( in vec4 value, in float maxRange ) {
+ return vec4( value.rgb * value.a * maxRange, 1.0 );
+ vec4 LinearToRGBM( in vec4 value, in float maxRange ) {
+ float maxRGB = max( value.r, max( value.g, value.b ) );
+ float M = clamp( maxRGB / maxRange, 0.0, 1.0 );
+ M = ceil( M * 255.0 ) / 255.0;
+ return vec4( value.rgb / ( M * maxRange ), M );
```

<details><summary>full engine version</summary>

```glsl
vec4 LinearToLinear( in vec4 value ) {
	return value;
}
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 RGBMToLinear( in vec4 value, in float maxRange ) {
	return vec4( value.rgb * value.a * maxRange, 1.0 );
}
vec4 LinearToRGBM( in vec4 value, in float maxRange ) {
	float maxRGB = max( value.r, max( value.g, value.b ) );
	float M = clamp( maxRGB / maxRange, 0.0, 1.0 );
	M = ceil( M * 255.0 ) / 255.0;
	return vec4( value.rgb / ( M * maxRange ), M );
}
```

</details>

#### `envmap_fragment`

```diff
- #endif #ifdef ENVMAP_TYPE_CUBE vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
+ #endif reflectVec = transformDirection(reflectVec, rotationMatrix(vec3(0,1,0), envMapRotation));
+ #ifdef ENVMAP_TYPE_CUBE vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
```

<details><summary>full engine version</summary>

```glsl
#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	reflectVec = transformDirection(reflectVec, rotationMatrix(vec3(0,1,0), envMapRotation));
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif
```

</details>

#### `envmap_common_pars_fragment`

```diff
- #ifdef USE_ENVMAP uniform float envMapIntensity;
+ #ifdef USE_ENVMAP mat4 rotationMatrix(vec3 axis, float angle) {
+ axis = normalize(axis);
+ float s = sin(angle);
+ float c = cos(angle);
+ float oc = 1.0 - c;
+ return mat4(oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0, oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.0, oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.0, 0.0, 0.0, 0.0, 1.0);
+ }
+ uniform float envMapIntensity;
+ uniform float envMapRotation;
```

<details><summary>full engine version</summary>

```glsl
#ifdef USE_ENVMAP
	mat4 rotationMatrix(vec3 axis, float angle) {
		axis = normalize(axis);
		float s = sin(angle);
		float c = cos(angle);
		float oc = 1.0 - c;
		return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
					oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
					oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
					0.0,                                0.0,                                0.0,                                1.0);
	}
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform float envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif
```

</details>

#### `envmap_physical_pars_fragment`

```diff
- #if defined( ENVMAP_TYPE_CUBE_UV ) vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
- reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
+ #if defined( ENVMAP_TYPE_CUBE_UV ) #if defined( FIX_ENV_DIRECTION ) vec3 worldNormal = normal;
+ #else vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
+ #endif worldNormal = transformDirection(worldNormal, rotationMatrix(vec3(0,1,0), envMapRotation));
+ #if !defined( FIX_ENV_DIRECTION ) reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
+ #endif reflectVec = transformDirection(reflectVec, rotationMatrix(vec3(0,1,0), envMapRotation));
```

<details><summary>full engine version</summary>

```glsl
#if defined( USE_ENVMAP )
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#if defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( FIX_ENV_DIRECTION )
			vec3 worldNormal = normal;
		#else
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#endif
			worldNormal = transformDirection(worldNormal, rotationMatrix(vec3(0,1,0), envMapRotation));
			vec4 envMapColor = textureCubeUV( envMap, worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#if defined( ENVMAP_TYPE_CUBE_UV )
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			#if !defined( FIX_ENV_DIRECTION )
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			#endif
			reflectVec = transformDirection(reflectVec, rotationMatrix(vec3(0,1,0), envMapRotation));
			vec4 envMapColor = textureCubeUV( envMap, reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
#endif
```

</details>

#### `output_fragment`

```diff
+ diffuseColor.a = min(max(diffuseColor.a, 0.), 1.);
```

<details><summary>full engine version</summary>

```glsl
#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha + 0.1;
diffuseColor.a = min(max(diffuseColor.a, 0.), 1.);
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );
```

</details>

#### `transmission_fragment`

```diff
- vec4 transmission = getIBLVolumeRefraction( n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90, pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness, material.attenuationColor, material.attenuationDistance );
+ vec4 transmission = getIBLVolumeRefraction( n, v, roughnessFactor, material.diffuseColor, material.specularColor, material.specularF90, pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness, material.attenuationColor, material.attenuationDistance );
```

<details><summary>full engine version</summary>

```glsl
#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmission = getIBLVolumeRefraction(
		n, v, roughnessFactor, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmission.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmission.rgb, material.transmission );
#endif
```

</details>

#### `transmission_pars_fragment`

```diff
- return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
- if ( isinf( attenuationDistance ) ) {
+ if(roughness == 0.0) return transmissionSamplerMapTexelToLinear( texture2D( transmissionSamplerMap, fragCoord.xy ) );
+ return transmissionSamplerMapTexelToLinear( textureBicubic( transmissionSamplerMap, fragCoord.xy, lod ) );
+ if ( isinf( attenuationDistance ) || attenuationDistance == 0.0) {
```

<details><summary>full engine version</summary>

```glsl
#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		if(roughness == 0.0) return transmissionSamplerMapTexelToLinear( texture2D( transmissionSamplerMap, fragCoord.xy ) );
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return transmissionSamplerMapTexelToLinear( textureBicubic( transmissionSamplerMap, fragCoord.xy, lod ) );
	}
	vec3 applyVolumeAttenuation( const in vec3 radiance, const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) || attenuationDistance == 0.0) {
			return radiance;
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance * radiance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
		vec3 refractedRayExit = position + transmissionRay;
		vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
		vec2 refractionCoords = ndcPos.xy / ndcPos.w;
		refractionCoords += 1.0;
		refractionCoords /= 2.0;
		vec4 transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
		vec3 attenuatedColor = applyVolumeAttenuation( transmittedLight.rgb, length( transmissionRay ), attenuationColor, attenuationDistance );
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		return vec4( ( 1.0 - F ) * attenuatedColor * diffuseColor, transmittedLight.a );
	}
#endif
```

</details>

#### `background_vert`

```diff
- varying vec2 vUv;
- void main() {
- vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
- gl_Position = vec4( position.xy, 1.0, 1.0 );
+ #ifdef HAS_TEXTURE varying vec2 vUv;
+ uniform bool flipX;
+ uniform bool flipY;
+ #endif void main() {
+ #ifdef HAS_TEXTURE vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
+ vUv = flipX ? vec2( 1.0 - vUv.x, vUv.y ) : vUv;
+ vUv = flipY ? vec2( vUv.x, 1.0 - vUv.y ) : vUv;
+ #endif gl_Position = vec4( position.xy, 1.0, 1.0 );
```

<details><summary>full engine version</summary>

```glsl
#ifdef HAS_TEXTURE
varying vec2 vUv;
uniform mat3 uvTransform;
uniform bool flipX;
uniform bool flipY;
#endif
void main() {
#ifdef HAS_TEXTURE
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
    vUv = flipX ? vec2( 1.0 - vUv.x, vUv.y ) : vUv;
    vUv = flipY ? vec2( vUv.x, 1.0 - vUv.y ) : vUv;
#endif
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}
```

</details>

#### `background_frag`

```diff
- uniform sampler2D t2D;
- uniform float backgroundIntensity;
- vec4 texColor = texture2D( t2D, vUv );
- texColor.rgb *= backgroundIntensity;
+ #ifdef HAS_TEXTURE uniform sampler2D t2D;
+ #endif uniform float backgroundIntensity;
+ uniform vec3 backgroundColor;
+ #ifdef HAS_TEXTURE vec4 texColor = texture2D( t2D, vUv );
+ #else vec4 texColor = vec4( 1.0 );
+ #endif texColor.rgb *= backgroundColor * backgroundIntensity;
```

<details><summary>full engine version</summary>

```glsl
#ifdef HAS_TEXTURE
uniform sampler2D t2D;
varying vec2 vUv;
#endif
uniform float backgroundIntensity;
uniform vec3 backgroundColor;
void main() {
#ifdef HAS_TEXTURE
	vec4 texColor = texture2D( t2D, vUv );
#else
	vec4 texColor = vec4( 1.0 );
#endif
	texColor.rgb *= backgroundColor * backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}
```

</details>

#### `backgroundCube_frag`

```diff
- #ifdef ENVMAP_TYPE_CUBE uniform samplerCube envMap;
- #elif defined( ENVMAP_TYPE_CUBE_UV ) uniform sampler2D envMap;
- #endif uniform float flipEnvMap;
- uniform float backgroundBlurriness;
- #include <cube_uv_reflection_fragment> void main() {
- #ifdef ENVMAP_TYPE_CUBE vec4 texColor = textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
- #elif defined( ENVMAP_TYPE_CUBE_UV ) vec4 texColor = textureCubeUV( envMap, vWorldDirection, backgroundBlurriness );
+ #include <envmap_common_pars_fragment> uniform float backgroundBlurriness;
+ #include <cube_uv_reflection_fragment> vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
+ return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
+ }
+ void main() {
+ vec3 vReflect = vWorldDirection;
+ vReflect = transformDirection(vReflect, rotationMatrix(vec3(0,1,0), envMapRotation));
+ #ifdef ENVMAP_TYPE_CUBE vec4 texColor = textureCube( envMap, vec3( flipEnvMap * vReflect.x, vReflect.yz ) );
+ #elif defined( ENVMAP_TYPE_CUBE_UV ) vec4 texColor = textureCubeUV( envMap, vReflect, backgroundBlurriness );
+ texColor.rgb *= envMapIntensity;
```

<details><summary>full engine version</summary>

```glsl
#include <envmap_common_pars_fragment>
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
void main() {
	vec3 vReflect = vWorldDirection;
	vReflect = transformDirection(vReflect, rotationMatrix(vec3(0,1,0), envMapRotation));
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, vec3( flipEnvMap * vReflect.x, vReflect.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, vReflect, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	texColor.rgb *= envMapIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}
```

</details>

### 4.2 The 126 identical chunks

Identical to stock r152 (not reproduced here; each is a file in `engine-shaders/three-chunks/`).

| chunk | chars |
|---|---:|
| `alphamap_pars_fragment` | 55 |
| `alphatest_fragment` | 71 |
| `alphatest_pars_fragment` | 53 |
| `aomap_fragment` | 405 |
| `aomap_pars_fragment` | 80 |
| `begin_vertex` | 36 |
| `beginnormal_vertex` | 104 |
| `bsdfs` | 669 |
| `iridescence_fragment` | 2733 |
| `bumpmap_pars_fragment` | 845 |
| `clipping_planes_fragment` | 587 |
| `clipping_planes_pars_fragment` | 116 |
| `clipping_planes_pars_vertex` | 63 |
| `clipping_planes_vertex` | 69 |
| `color_fragment` | 118 |
| `color_pars_fragment` | 108 |
| `color_pars_vertex` | 143 |
| `color_vertex` | 256 |
| `common` | 2749 |
| `cube_uv_reflection_fragment` | 3445 |
| `defaultnormal_vertex` | 544 |
| `displacementmap_pars_vertex` | 136 |
| `displacementmap_vertex` | 172 |
| `emissivemap_fragment` | 138 |
| `emissivemap_pars_fragment` | 61 |
| `encodings_fragment` | 51 |
| `envmap_pars_fragment` | 307 |
| `envmap_pars_vertex` | 281 |
| `envmap_vertex` | 599 |
| `fog_vertex` | 50 |
| `fog_pars_vertex` | 47 |
| `fog_fragment` | 265 |
| `fog_pars_fragment` | 180 |
| `gradientmap_pars_fragment` | 435 |
| `lightmap_fragment` | 205 |
| `lightmap_pars_fragment` | 89 |
| `lights_lambert_fragment` | 113 |
| `lights_lambert_pars_fragment` | 831 |
| `lights_pars_begin` | 4566 |
| `lights_toon_fragment` | 64 |
| `lights_toon_pars_fragment` | 769 |
| `lights_phong_fragment` | 191 |
| `lights_phong_pars_fragment` | 1103 |
| `lights_physical_fragment` | 2873 |
| `lights_physical_pars_fragment` | 12702 |
| `lights_fragment_begin` | 5074 |
| `lights_fragment_maps` | 676 |
| `lights_fragment_end` | 257 |
| `logdepthbuf_fragment` | 173 |
| `logdepthbuf_pars_fragment` | 159 |
| `logdepthbuf_pars_vertex` | 163 |
| `logdepthbuf_vertex` | 353 |
| `map_fragment` | 64 |
| `map_pars_fragment` | 45 |
| `map_particle_fragment` | 338 |
| `map_particle_pars_fragment` | 249 |
| `metalnessmap_fragment` | 170 |
| `metalnessmap_pars_fragment` | 63 |
| `morphcolor_vertex` | 466 |
| `morphnormal_vertex` | 541 |
| `morphtarget_pars_vertex` | 786 |
| `morphtarget_vertex` | 815 |
| `normal_fragment_begin` | 1019 |
| `normal_fragment_maps` | 544 |
| `normal_pars_fragment` | 129 |
| `normal_pars_vertex` | 129 |
| `normal_vertex` | 211 |
| `normalmap_pars_fragment` | 786 |
| `clearcoat_normal_fragment_begin` | 67 |
| `clearcoat_normal_fragment_maps` | 228 |
| `clearcoat_pars_fragment` | 259 |
| `iridescence_pars_fragment` | 154 |
| `packing` | 1707 |
| `premultiplied_alpha_fragment` | 70 |
| `project_vertex` | 203 |
| `dithering_fragment` | 74 |
| `dithering_pars_fragment` | 311 |
| `roughnessmap_fragment` | 170 |
| `roughnessmap_pars_fragment` | 63 |
| `shadowmap_pars_fragment` | 8468 |
| `shadowmap_pars_vertex` | 1213 |
| `shadowmap_vertex` | 1421 |
| `shadowmask_pars_fragment` | 1353 |
| `skinbase_vertex` | 214 |
| `skinning_pars_vertex` | 753 |
| `skinning_vertex` | 365 |
| `skinnormal_vertex` | 444 |
| `specularmap_fragment` | 185 |
| `specularmap_pars_fragment` | 61 |
| `tonemapping_fragment` | 87 |
| `tonemapping_pars_fragment` | 1247 |
| `uv_pars_fragment` | 1455 |
| `uv_pars_vertex` | 2278 |
| `uv_vertex` | 2529 |
| `worldpos_vertex` | 320 |
| `backgroundCube_vert` | 211 |
| `cube_vert` | 211 |
| `cube_frag` | 328 |
| `depth_vert` | 699 |
| `depth_frag` | 844 |
| `distanceRGBA_vert` | 677 |
| `distanceRGBA_frag` | 703 |
| `equirect_vert` | 179 |
| `equirect_frag` | 296 |
| `linedashed_vert` | 592 |
| `linedashed_frag` | 815 |
| `meshbasic_vert` | 839 |
| `meshbasic_frag` | 1552 |
| `meshlambert_vert` | 1041 |
| `meshlambert_frag` | 1860 |
| `meshmatcap_vert` | 894 |
| `meshmatcap_frag` | 1439 |
| `meshnormal_vert` | 963 |
| `meshnormal_frag` | 652 |
| `meshphong_vert` | 1039 |
| `meshphong_frag` | 1968 |
| `meshphysical_vert` | 1115 |
| `meshphysical_frag` | 3724 |
| `meshtoon_vert` | 982 |
| `meshtoon_frag` | 1719 |
| `points_vert` | 831 |
| `points_frag` | 726 |
| `shadow_vert` | 570 |
| `shadow_frag` | 468 |
| `sprite_vert` | 1093 |
| `sprite_frag` | 701 |
