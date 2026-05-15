// Very high TODO/FIXME density on purpose.

// TODO: implement real persistence
// FIXME: this in-memory store loses data on restart
// HACK: using a module-level Map for now
const store = new Map<string, unknown>();

export function put(key: string, value: unknown): void {
  // TODO: validate value
  store.set(key, value);
}

export function get(key: string): unknown {
  // FIXME: should return a typed result
  return store.get(key);
}

export function del(key: string): boolean {
  // XXX: no audit log
  // TODO: emit deletion event
  return store.delete(key);
}

export function clear(): void {
  // TODO: confirm before clearing in production
  // FIXME: this is wildly dangerous
  store.clear();
}

// TODO: replace this with a real eviction policy
// HACK: just clear everything every minute
// XXX: this is set in module scope, which is a side-effect on import
setInterval(() => store.clear(), 60_000);
