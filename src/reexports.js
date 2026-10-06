export function finalizeExports(modules) {
  for (const m of [...modules].reverse()) {
    for (const [name, local] of m.exports)
      m.exportBindings.set(name, m.env.vars.get(local));
    for (const item of m.indirect)
      m.exportBindings.set(
        item.name,
        item.dep.exportBindings.get(item.imported),
      );
    for (const dep of m.stars)
      for (const [name, binding] of dep.exportBindings) {
        if (name !== "default" && !m.exportBindings.has(name))
          m.exportBindings.set(name, { ...binding });
      }
  }
}
