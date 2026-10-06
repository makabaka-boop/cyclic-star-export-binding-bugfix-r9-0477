// Re-export resolution, modeled on the ES specification's ResolveExport
// (16.2.1.5). A module's own (local) exports win over everything; an explicit
// `export { x as y } from './dep'` is resolved next; `export *` edges are
// consulted last, in source order.
//
// Nothing here copies binding objects: resolution always yields the concrete
// Binding slot in the module that actually declares the name, so reads through
// arbitrarily many forwarding modules stay live and writes by the original
// module are observed by every consumer.
//
// Resolution results:
//   - a Binding  : the concrete slot of the declaring module
//   - null       : no export of that name is reachable
//   - AMBIGUOUS  : two genuinely different bindings compete for the name

export const AMBIGUOUS = Symbol("ambiguous star export");

function keyOf(m, name) {
  return `${m.name} ${name}`;
}

// One ResolveExport descent. `resolveEdge(m, name)` receives every
// (module, name) pair about to be entered — including edges reached through a
// locally re-exported import (`import {x}; export {x}`); it is what performs
// per-edge cycle bookkeeping and, in the interpreter, chases import hops.
// Returning null from the edge callback means "this edge is part of a cycle
// with no new information" (spec resolveSet semantics).
function exportLookup(m, name, resolveEdge) {
  const entered = resolveEdge(m, name);
  if (entered === null) return null;
  if (entered !== undefined) return entered;

  // 1. Local exports (including `export { x as y }` without `from`). A local
  // export of an imported name is itself an edge toward the importer's source.
  const local = m.exportBindings.get(name);
  if (local) {
    if (local.kind !== "import") return local;
    return exportLookup(local.targetModule, local.targetName, resolveEdge);
  }

  // 2. Explicit indirect export: export { x as y } from './dep'.
  if (m.indirectByName.has(name)) {
    const ind = m.indirectByName.get(name);
    return exportLookup(ind.dep, ind.imported, resolveEdge);
  }

  // 3. Star exports, in source order.
  let starResult = null;
  for (const dep of m.stars) {
    const r = exportLookup(dep, name, resolveEdge);
    if (r === null) continue;
    if (r === AMBIGUOUS) return AMBIGUOUS;
    if (starResult === null) {
      starResult = r;
    } else if (starResult !== r) {
      // Same concrete slot arriving over several (even cyclic, even
      // different-length) paths is fine; two different slots conflict.
      return AMBIGUOUS;
    }
  }
  return starResult;
}

// resolveToSlot: full resolution to the concrete storage binding, with a
// single shared resolveSet covering star edges and import hops. A pure cycle
// that never reaches a declaration returns null; a resolvable cycle ends at
// the concrete (hoisted/initialized) binding.
export function resolveToSlot(module, exportName) {
  const seen = new Set();
  return exportLookup(module, exportName, (m, name) => {
    const key = keyOf(m, name);
    if (seen.has(key)) return null;
    seen.add(key);
    return undefined; // continue the descent
  });
}

// resolveExport: the plain export lookup, returning whatever the module
// locally exports (which may itself be an import binding). Kept for callers
// that only need the one-hop ResolveExport view; each entry gets a fresh
// resolveSet, as a spec call would.
export function resolveExport(m, name) {
  const seen = new Set();
  return exportLookup(m, name, (mm, nname) => {
    const key = keyOf(mm, nname);
    if (seen.has(key)) return null;
    seen.add(key);
    return undefined;
  });
}
