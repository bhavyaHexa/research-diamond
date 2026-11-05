// Clearcoat tint declarations
// group: Material extensions   stage: fragment declarations
// role: ClearcoatTintPlugin (yh)
// owner (minified): ? / yh
// source: bundle-0.8.0.mjs, character offset 1598515 (original minified file on branch main)

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
