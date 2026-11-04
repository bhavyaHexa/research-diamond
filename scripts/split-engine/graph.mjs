import fs from "node:fs";
import * as acorn from "acorn";

export const SRC_PATH = process.argv[2];
export const src = fs.readFileSync(SRC_PATH, "utf8");
export const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true, allowHashBang: true });
export const glueStmt = ast.body[4];
export const glueFn = glueStmt.expression.argument.callee;
export const units = glueFn.body.body;

const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

export function patNames(p, out) {
  if (!p) return out;
  switch (p.type) {
    case "Identifier": out.add(p.name); break;
    case "ObjectPattern": for (const q of p.properties) patNames(q.type === "RestElement" ? q.argument : q.value, out); break;
    case "ArrayPattern": for (const q of p.elements) patNames(q, out); break;
    case "RestElement": patNames(p.argument, out); break;
    case "AssignmentPattern": patNames(p.left, out); break;
  }
  return out;
}

function varNames(node, out) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const c of node) varNames(c, out); return out; }
  if (FN.has(node.type)) return out;
  if (node.type === "VariableDeclaration" && node.kind === "var") for (const d of node.declarations) patNames(d.id, out);
  for (const k of Object.keys(node)) if (k !== "type" && node[k] && typeof node[k] === "object") varNames(node[k], out);
  return out;
}

function lexNames(list, out) {
  for (const n of list) {
    if (n.type === "VariableDeclaration" && n.kind !== "var") for (const d of n.declarations) patNames(d.id, out);
    if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id) out.add(n.id.name);
  }
  return out;
}

// Free identifier references (reads and writes) of a statement, with scope tracking.
export function analyze(node, isUnit = false) {
  const refs = new Set();
  const writes = new Set();
  const scopes = [];
  const bound = (name) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return true; return false; };
  const ref = (name, w) => { if (!bound(name)) { refs.add(name); if (w) writes.add(name); } };

  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const c of n) visit(c); return; }
    switch (n.type) {
      case "Identifier": ref(n.name, false); return;
      case "MemberExpression": visit(n.object); if (n.computed) visit(n.property); return;
      case "Property": if (n.computed) visit(n.key); visit(n.value); return;
      case "MethodDefinition": case "PropertyDefinition": if (n.computed) visit(n.key); if (n.value) visit(n.value); return;
      case "LabeledStatement": visit(n.body); return;
      case "BreakStatement": case "ContinueStatement": return;
      case "AssignmentExpression":
        if (n.left.type === "Identifier") ref(n.left.name, true); else visit(n.left);
        visit(n.right); return;
      case "UpdateExpression":
        if (n.argument.type === "Identifier") ref(n.argument.name, true); else visit(n.argument);
        return;
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": {
        const s = new Set();
        if (n.id && n.type === "FunctionExpression") s.add(n.id.name);
        for (const p of n.params) patNames(p, s);
        if (n.body.type === "BlockStatement") { varNames(n.body, s); lexNames(n.body.body, s); }
        scopes.push(s);
        for (const p of n.params) visitPatternDefaults(p);
        if (n.body.type === "BlockStatement") for (const st of n.body.body) visit(st); else visit(n.body);
        scopes.pop();
        return;
      }
      case "ClassDeclaration": case "ClassExpression": {
        if (n.superClass) visit(n.superClass);
        const s = new Set(); if (n.id) s.add(n.id.name);
        scopes.push(s); for (const m of n.body.body) visit(m); scopes.pop();
        return;
      }
      case "BlockStatement": case "StaticBlock": {
        const s = new Set(); lexNames(n.body, s);
        scopes.push(s); for (const st of n.body) visit(st); scopes.pop();
        return;
      }
      case "ForStatement": case "ForInStatement": case "ForOfStatement": {
        const s = new Set();
        const head = n.init || n.left;
        if (head && head.type === "VariableDeclaration" && head.kind !== "var") for (const d of head.declarations) patNames(d.id, s);
        scopes.push(s);
        for (const k of ["init", "test", "update", "left", "right", "body"]) if (n[k]) visit(n[k]);
        scopes.pop();
        return;
      }
      case "CatchClause": {
        const s = new Set(); if (n.param) patNames(n.param, s);
        scopes.push(s); visit(n.body); scopes.pop(); return;
      }
      case "VariableDeclaration":
        for (const d of n.declarations) { visitPatternDefaults(d.id); if (d.init) visit(d.init); }
        return;
    }
    for (const k of Object.keys(n)) {
      if (k === "type" || k === "range" || k === "start" || k === "end") continue;
      const v = n[k];
      if (v && typeof v === "object") visit(v);
    }
  }
  function visitPatternDefaults(p) {
    if (!p) return;
    if (p.type === "AssignmentPattern") { visit(p.right); visitPatternDefaults(p.left); }
    else if (p.type === "ObjectPattern") for (const q of p.properties) { if (q.computed) visit(q.key); visitPatternDefaults(q.type === "RestElement" ? q.argument : q.value); }
    else if (p.type === "ArrayPattern") for (const q of p.elements) visitPatternDefaults(q);
    else if (p.type === "RestElement") visitPatternDefaults(p.argument);
  }

  visit(node);
  const decls = new Set();
  if (isUnit) {
    if (node.type === "VariableDeclaration") for (const d of node.declarations) patNames(d.id, decls);
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) decls.add(node.id.name);
    varNames(node, decls);
  }
  return { refs, writes, decls };
}
