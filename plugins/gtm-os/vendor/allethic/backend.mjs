// A backend is where the rows live and what the actions do. The surface never touches storage;
// it asks the backend, and the backend answers in one shape whatever sits behind it: files in a
// git repo, Postgres, a test's memory.
//
//   backend.count(object, ctx)                             -> number | null (null: unknown)
//   backend.list(object, { filters, search, limit }, ctx)  -> rows (plain objects, field names as keys)
//   backend.act(name, params, ctx)                         -> { outcome: "ok", result } | { outcome: "refused", message }
//                                                             (throw for an error; "denied" is decided before the backend is asked)
// ctx carries the role, the ontology, and the scope value when the server declares one (which
// workspace or deployment the call is about).
//
// The four outcomes are Allethic's: ok, denied (the role may not), refused (the rule says no,
// audited, not a crash), error (something broke).
export const OUTCOMES = ["ok", "denied", "refused", "error"];

export class Refused extends Error { constructor(message) { super(message); this.name = "Refused"; } }

const matches = (row, filters = {}) => Object.entries(filters).every(([k, v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v);
const hit = (row, q) => { const s = String(q).toLowerCase(); return Object.values(row).some(v => v != null && JSON.stringify(v).toLowerCase().includes(s)); };

/* rows in memory, for tests and for trying an ontology before a real backend exists.
   actions: { name: (params, { rows, ctx, ontology }) => result }  (throw Refused to refuse) */
export function memoryBackend({ rows = {}, actions = {} } = {}) {
  const store = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, [...v]]));
  return {
    rows: store,
    count: object => (store[object] || []).length,
    list: (object, { filters = {}, search = "", limit = 50 } = {}) => (store[object] || []).filter(r => matches(r, filters) && (!search || hit(r, search))).slice(-limit).reverse(),
    async act(name, params, ctx = {}) {
      const fn = actions[name];
      if (!fn) throw new Error(`no handler for action ${name}`);
      try { return { outcome: "ok", result: await fn(params, { rows: store, ctx }) }; }
      catch (e) { if (e instanceof Refused) return { outcome: "refused", message: e.message }; throw e; }
    },
  };
}
