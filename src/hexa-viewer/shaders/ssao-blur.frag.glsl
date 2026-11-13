// Depth- and normal-aware blur of the AO map (one direction per pass).
varying vec2 vUv;
uniform sampler2D tAo;
uniform sampler2D tGBuffer;
uniform vec2 direction;           // texel step, e.g. (1/w, 0) then (0, 1/h)
uniform float edgeSharpness;

vec3 viewNormal(vec2 xy) { return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }

float kernel(int i) {
  if (i == 0) return 0.153170;
  if (i == 1) return 0.144893;
  if (i == 2) return 0.122649;
  return 0.092902;
}

void main() {
  vec4 g = texture2D(tGBuffer, vUv);
  float centre = texture2D(tAo, vUv).r;
  if (g.a < 0.5) { gl_FragColor = vec4(centre); return; }
  vec3 n = viewNormal(g.gb);
  float total = kernel(0) + 0.03;
  float sum = total * centre;
  vec2 stepDir = direction;
  for (int i = 0; i < 6; i++) {
    stepDir *= -1.0;
    vec2 uv = vUv + 2.0 * stepDir * float(i / 2 + 1);
    vec4 t = texture2D(tGBuffer, uv);
    if (t.a < 0.5) continue;
    float closeness = dot(n, viewNormal(t.gb));
    closeness *= closeness;
    float normalWeight = max(1.0 - (1.0 - closeness) * 8.0 * edgeSharpness, 0.0);
    float depthWeight = max(0.0, 1.0 - edgeSharpness * 4000.0 * abs(g.r - t.r) / 10.0);
    float w = (kernel(i / 2) + 0.03) * depthWeight * normalWeight;
    total += w;
    sum += w * texture2D(tAo, uv).r;
  }
  float ao = sum / total;
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}
