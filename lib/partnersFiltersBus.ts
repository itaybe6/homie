type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeOpenPartnersFilters(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitOpenPartnersFilters() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

