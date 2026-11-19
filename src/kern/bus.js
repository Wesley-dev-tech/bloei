// Kleine eventbus tussen modules. Events en hun detail: PLAN.md §6.1.

const luisteraars = new Map();

export function zend(naam, detail = {}) {
  const lijst = luisteraars.get(naam);
  if (!lijst) return;
  // Kopie: een luisteraar mag zichzelf afmelden terwijl het event loopt.
  for (const fn of [...lijst]) {
    try {
      fn(detail);
    } catch (fout) {
      console.error('Fout in luisteraar voor', naam, fout);
    }
  }
}

export function luister(naam, fn) {
  if (!luisteraars.has(naam)) luisteraars.set(naam, new Set());
  luisteraars.get(naam).add(fn);
  return () => luisteraars.get(naam)?.delete(fn);
}
