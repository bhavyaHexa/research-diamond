// Splits public/shaders/bundle-0.8.0.mjs into feature bundles under src/engine/.
// Run: node split.mjs <bundle path> <out dir>   (needs acorn, see tools/package.json)
import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
import { analyze, patNames } from "./graph.mjs";

const [, , bundlePath, outDir] = process.argv;
const src = fs.readFileSync(bundlePath, "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true, allowHashBang: true });
const body = ast.body;

// ---- 1. statements of the original file
const modulesDecl = body[0];          // var __webpackgi_modules__={...}, __webpackgi_module_cache__={}, leafPrototypes, ...
const runtimeFn = body[1];            // function __webpackgi_require__
const runtimeSetup = body[2];         // __webpackgi_require__.m = ..., chunk loader
const exportsDecl = body[3];          // var __webpackgi_exports__={}
const glue = body[4].expression.argument.callee.body.body; // units of the engine IIFE
const aliasDecl = body[5];            // var __webpackgi_exports__X=__webpackgi_exports__.KEY,...
const exportList = body[6];           // export{...}

const text = (n) => src.slice(n.range[0], n.range[1]);

// ---- 2. vendor module map
const moduleProps = modulesDecl.declarations[0].init.properties;
const modules = moduleProps.map((p) => ({
  key: p.key.value,
  fn: p.value,
  requireParam: p.value.params[2]?.name ?? null,
}));
const moduleIndex = new Map(modules.map((m, i) => [String(m.key), i]));

// ---- 3. nodes: engine units then vendor modules
const UNITS = glue.length;
const NU = UNITS;
const N = NU + modules.length;
const unitRefs = [];
const unitDecl = new Map();
for (let i = 0; i < UNITS; i++) {
  const a = analyze(glue[i], true);
  unitRefs.push(a);
  for (const d of a.decls) {
    if (unitDecl.has(d)) throw new Error("name declared twice: " + d);
    unitDecl.set(d, i);
  }
}
const modRefs = modules.map((m) => analyze(m.fn, false));

// ---- 4. edges
const deps = Array.from({ length: N }, () => new Set());
const writeEdges = [];
for (let i = 0; i < UNITS; i++) {
  const a = unitRefs[i];
  for (const r of [...a.refs, ...a.writes]) {
    const j = unitDecl.get(r);
    if (j !== undefined && j !== i) deps[i].add(j);
    if (j !== undefined && j !== i && a.writes.has(r)) writeEdges.push([i, j, r]);
  }
}
// unit -> module via __webpackgi_require__(NUMBER)
const requireCalls = (node) => {
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "__webpackgi_require__" && n.arguments[0]?.type === "Literal") out.push(String(n.arguments[0].value));
    for (const k of Object.keys(n)) if (k !== "range" && n[k] && typeof n[k] === "object") walk(n[k]);
  })(node);
  return out;
};
for (let i = 0; i < UNITS; i++) for (const id of requireCalls(glue[i])) {
  const m = moduleIndex.get(id);
  if (m !== undefined) deps[i].add(NU + m);
}
// module -> module via its own require parameter, module -> unit via free names
modules.forEach((m, k) => {
  const node = NU + k;
  const rp = m.requireParam;
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === rp && n.arguments[0]?.type === "Literal") {
      const j = moduleIndex.get(String(n.arguments[0].value));
      if (j !== undefined && j !== k) deps[node].add(NU + j);
    }
    for (const kk of Object.keys(n)) if (kk !== "range" && n[kk] && typeof n[kk] === "object") walk(n[kk]);
  })(m.fn.body);
  for (const r of modRefs[k].refs) { const j = unitDecl.get(r); if (j !== undefined) deps[node].add(j); }
});

// ---- 5. feature roots (public names -> local bindings)
const exportsKeyOf = new Map(); // public name -> minified key
for (const d of aliasDecl.declarations ?? []) { /* handled below */ }
const aliasText = text(aliasDecl);
for (const m of aliasText.matchAll(/__webpackgi_exports__([A-Za-z0-9_$]+)=__webpackgi_exports__\.([A-Za-z0-9_$]+)/g)) exportsKeyOf.set(m[1], m[2]);
// getter map from the glue (unit that calls __webpackgi_require__.d(__webpackgi_exports__, {...}))
const getters = new Map();
for (const u of glue) {
  const e = u.type === "ExpressionStatement" ? u.expression : null;
  const call = e?.type === "SequenceExpression" ? e.expressions[0] : e;
  if (call?.type === "CallExpression" && text(call.callee) === "__webpackgi_require__.d") {
    for (const p of call.arguments[1].properties) {
      const ret = p.value.body.body[0].argument;
      getters.set(p.key.name ?? String(p.key.value), ret.type === "Identifier" ? ret.name : null);
    }
  }
}
const publicName = new Map(); // public -> local binding name
for (const pub of exportList.specifiers.map((s) => [s.exported.name, s.local.name])) {
  const key = exportsKeyOf.get(pub[1].replace(/^__webpackgi_exports__/, ""));
  if (key && getters.get(key)) publicName.set(pub[0], getters.get(key));
}

const FEATURES = {
  diamond: ["DiamondPlugin", "DiamondMaterial"],
  scene: ["GroundPlugin", "BaseGroundPlugin", "ContactShadowGroundPlugin", "HDRiGroundPlugin", "SSAOPlugin", "SSRPlugin", "TonemapPlugin", "BloomPlugin", "ChromaticAberrationPlugin", "FilmicGrainPlugin", "DepthOfFieldPlugin", "LUTPlugin", "CombinedPostPlugin", "ShadowMapBaker", "RandomizedDirectionalLightPlugin"],
  gold: ["AnisotropyPlugin", "ClearcoatTintPlugin", "NoiseBumpMaterialPlugin"],
};
const sig = Array.from({ length: N }, () => new Set());
for (const [feature, names] of Object.entries(FEATURES)) {
  const starts = [];
  for (const pub of names) {
    const local = publicName.get(pub);
    const u = local ? unitDecl.get(local) : undefined;
    if (u === undefined) { console.warn("no unit for", feature, pub, "(local", local, ")"); continue; }
    starts.push(u);
  }
  const seen = new Set(starts);
  const stack = [...starts];
  while (stack.length) {
    const x = stack.pop();
    sig[x].add(feature);
    for (const y of deps[x]) if (!seen.has(y)) { seen.add(y); stack.push(y); }
  }
}

// ---- 6. union write-edges: a writer and the declarer must share a bundle
const parent = Array.from({ length: N }, (_, i) => i);
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
const union = (a, b) => { parent[find(a)] = find(b); };
for (const [a, b] of writeEdges) union(a, b);
// group signatures
const groupSig = new Map();
for (let i = 0; i < N; i++) {
  const g = find(i);
  if (!groupSig.has(g)) groupSig.set(g, new Set());
  for (const f of sig[i]) groupSig.get(g).add(f);
}
// A node's dependencies must belong to a bundle that holds at least the same features,
// otherwise bundles can import each other. Propagate features along dependencies to a fixed point.
for (let changed = true; changed; ) {
  changed = false;
  for (let i = 0; i < N; i++) {
    const from = groupSig.get(find(i));
    for (const j of deps[i]) {
      const to = groupSig.get(find(j));
      for (const f of from) if (!to.has(f)) { to.add(f); changed = true; }
    }
  }
}
const bundleOf = (i) => {
  const s = groupSig.get(find(i));
  if (s.size === 0) return "core";
  if (s.size === 1) return [...s][0];
  return "shared";
};
const bundleIdx = Array.from({ length: N }, (_, i) => bundleOf(i));
const counts = {};
for (const b of bundleIdx) counts[b] = (counts[b] || 0) + 1;
console.log("node counts per bundle:", counts);

// bundle-level cycle check
const bdeps = new Map();
for (let i = 0; i < N; i++) for (const j of deps[i]) {
  const a = bundleIdx[i], b = bundleIdx[j];
  if (a === b) continue;
  if (!bdeps.has(a)) bdeps.set(a, new Set());
  bdeps.get(a).add(b);
}
const visiting = new Set(), done = new Set();
const cyc = (x, stack) => {
  if (done.has(x)) return null;
  if (visiting.has(x)) return [...stack, x];
  visiting.add(x);
  for (const y of bdeps.get(x) ?? []) { const c = cyc(y, [...stack, x]); if (c) return c; }
  visiting.delete(x); done.add(x); return null;
};
for (const b of Object.keys(counts)) { const c = cyc(b, []); if (c) {
  console.error("BUNDLE CYCLE:", c.join(" -> "));
  const label = (i) => (i < NU ? `unit${i}[${bundleIdx[i]}]` : `module${modules[i - NU].key}[${bundleIdx[i]}]`);
  let shown = 0;
  for (let i = 0; i < N && shown < 25; i++) for (const j of deps[i]) {
    if (bundleIdx[i] === bundleIdx[j]) continue;
    if (bundleIdx[i] === "shared" && bundleIdx[j] === "core") {
      const via = i < NU ? [...unitRefs[i].refs].filter((r) => unitDecl.get(r) === j).join(",") : "module";
      console.error("  edge", label(i), "->", label(j), "via", via);
      if (++shown >= 25) break;
    }
  }
  process.exit(2);
} }
console.log("bundle graph: acyclic", [...bdeps.entries()].map(([a, s]) => `${a}->${[...s].join("|")}`).join("  "));

// ---- 7. runtime names (externals) and cross-bundle exports
const RUNTIME = ["__webpackgi_require__", "__webpackgi_exports__", "__webpackgi_modules__", "__webpackgi_module_cache__", "getProto", "leafPrototypes", "inProgress", "dataWebpackPrefix"];
const runtimeSet = new Set(RUNTIME);
const exportsNeeded = new Map(); // bundle -> Set(names)
const importsOf = new Map();     // bundle -> Map(fromBundle -> Set(names))
const bundles = [...new Set(bundleIdx)];
for (const b of bundles) { exportsNeeded.set(b, new Set()); importsOf.set(b, new Map()); }
for (let i = 0; i < UNITS; i++) {
  const b = bundleIdx[i];
  for (const r of [...unitRefs[i].refs, ...unitRefs[i].writes]) {
    const j = unitDecl.get(r);
    if (j === undefined) continue;
    const c = bundleIdx[j];
    if (c === b) continue;
    exportsNeeded.get(c).add(r);
    if (!importsOf.get(b).has(c)) importsOf.get(b).set(c, new Set());
    importsOf.get(b).get(c).add(r);
  }
}
// module requires use the runtime only; modules reference units through free names, if any
for (let k = 0; k < modules.length; k++) for (const r of modRefs[k].refs) {
  const j = unitDecl.get(r);
  if (j !== undefined) throw new Error("vendor module references engine name " + r);
}
// runtime externals per bundle
const runtimeUse = new Map();
for (const b of bundles) runtimeUse.set(b, new Set());
for (let i = 0; i < UNITS; i++) for (const r of [...unitRefs[i].refs, ...unitRefs[i].writes]) {
  if (runtimeSet.has(r) && !unitDecl.has(r)) runtimeUse.get(bundleIdx[i]).add(r);
}
// module code itself uses the runtime through its parameter, nothing to import

// ---- 8. emit
fs.mkdirSync(outDir, { recursive: true });
const HEADER = (name) => `// Generated from public/shaders/bundle-0.8.0.mjs by tools/split.mjs. Bundle: ${name}.\n// Do not edit by hand; regenerate from the original bundle.\n`;

// runtime.mjs: the webpack runtime, verbatim statements 0-3 with the registries exported
const runtimeCode = [
  HEADER("runtime"),
  `export var __webpackgi_modules__ = {};`,
  `export var __webpackgi_module_cache__ = {};`,
  `export var leafPrototypes, getProto, inProgress, dataWebpackPrefix;`,
  `export ${text(runtimeFn)}`,
  text(runtimeSetup),
  `export var __webpackgi_exports__ = {};`,
  "",
].join("\n");
fs.writeFileSync(path.join(outDir, "runtime.mjs"), runtimeCode);

for (const b of bundles) {
  const parts = [HEADER(b)];
  const names = [...exportsNeeded.get(b)];
  const imports = [];
  const hasModules = modules.some((_, k) => bundleIdx[NU + k] === b);
  const runtimeNeeded = new Set(runtimeUse.get(b));
  if (hasModules) runtimeNeeded.add("__webpackgi_modules__");
  if (b === "core") runtimeNeeded.add("__webpackgi_exports__");
  if (runtimeNeeded.size) imports.push(`import { ${[...runtimeNeeded].join(", ")} } from "./runtime.mjs";`);
  for (const [c, set] of importsOf.get(b)) imports.push(`import { ${[...set].join(", ")} } from "./${c}.mjs";`);
  parts.push(...imports);
  // vendor modules that belong here: registered into the shared registry
  const mods = modules.map((m, k) => [m, k]).filter(([, k]) => bundleIdx[NU + k] === b);
  if (mods.length) {
    parts.push(`Object.assign(__webpackgi_modules__, {`);
    for (const [m] of mods) parts.push(`${m.key}: ${text(m.fn)},`);
    parts.push(`});`);
  }
  // Declarations stay at module scope (they have no load-time effect). Everything with a
  // load-time effect becomes a step, and the steps run in the original statement order.
  const mine = [];
  for (let i = 0; i < UNITS; i++) if (bundleIdx[i] === b) mine.push(i);
  const steps = [];
  for (const i of mine) {
    const u = glue[i];
    if (u.type === "FunctionDeclaration") { parts.push(text(u)); continue; }
    if (u.type === "VariableDeclaration") {
      const ids = [...new Set(u.declarations.flatMap((d) => [...patNames(d.id, new Set())]))];
      if (ids.length) parts.push(`${u.kind === "var" ? "var" : "let"} ${ids.join(", ")};`);
      const assigns = u.declarations.filter((d) => d.init).map((d) => {
        if (d.id.type === "Identifier") return `${d.id.name} = (${text(d.init)});`;
        return `(${text(d.id)} = (${text(d.init)}));`;
      });
      if (assigns.length) steps.push([i, assigns.join("\n")]);
      continue;
    }
    if (u.type === "ClassDeclaration") {
      parts.push(`let ${u.id.name};`);
      steps.push([i, `${u.id.name} = ${text(u)};`]);
      continue;
    }
    // var declared inside a statement (e.g. a for-loop head) is hoisted to module scope,
    // because other units can refer to it. Its declaration becomes a plain assignment.
    const r = rewriteNestedVars(u);
    if (r.names.length) parts.push(`var ${r.names.join(", ")};`);
    steps.push([i, r.text]);
  }
  parts.push(`export const engineSteps__ = [`);
  for (const [i, code] of steps) parts.push(`  [${i}, () => {\n${code}\n  }],`);
  parts.push(`];`);
  if (b === "core") {
    const others = bundles.filter((x) => x !== "core");
    parts.push(...others.map((x) => `import { engineSteps__ as ${x}Steps } from "./${x}.mjs";`));
    parts.push(`const __engineSteps = [${[...others.map((x) => `...${x}Steps`), "...engineSteps__"].join(", ")}].sort((a, b) => a[0] - b[0]);`);
    parts.push(`for (const [, run] of __engineSteps) run();`);
    parts.push(text(aliasDecl));
    parts.push(text(exportList));
  }
  if (names.length && b !== "core") parts.push(`export { ${names.join(", ")} };`);
  fs.writeFileSync(path.join(outDir, `${b}.mjs`), parts.join("\n") + "\n");
}
console.log("wrote bundles:", bundles.join(", "));

// Rewrites `var` declarations that sit inside a statement (not inside a nested function).
// Returns the unit text with those declarations as assignments, and the names to hoist.
function rewriteNestedVars(unit) {
  const edits = [];
  const names = new Set();
  const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
  (function walk(n, top) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const c of n) walk(c, false); return; }
    if (FN.has(n.type)) return;
    if (n.type === "VariableDeclaration" && n.kind === "var" && !top) {
      for (const d of n.declarations) patNames(d.id, names);
      let body = src.slice(n.range[0] + 3, n.range[1]).trim();
      if (n.declarations.some((d) => d.id.type !== "Identifier")) body = `(${body})`;
      edits.push([n.range[0], n.range[1], body]);
      return;
    }
    for (const k of Object.keys(n)) if (k !== "range" && n[k] && typeof n[k] === "object") walk(n[k], false);
  })(unit, true);
  let out = src.slice(unit.range[0], unit.range[1]);
  for (const [s, e, rep] of edits.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, s - unit.range[0]) + rep + out.slice(e - unit.range[0]);
  }
  return { text: out, names: [...names] };
}
