/**
 * signal.ts — a tiny fine-grained reactive system (no dependencies).
 *
 * - signal(v): readable/writable cell. Reading inside an effect subscribes it.
 * - computed(fn): a transparent derived value — get() simply runs fn() in the
 *   caller's tracking context, so whoever reads a computed subscribes to the
 *   signals the computed reads (no separate node → no glitches). Recompute cost
 *   is trivial at this app's scale (<=225 cells).
 * - effect(fn): runs now and re-runs when its dependencies change.
 * - batch(fn): coalesce multiple set()s into a single flush.
 */

interface Observer {
  execute(): void;
  deps: Set<Node<unknown>>;
  alive: boolean;
}

let activeObserver: Observer | null = null;
let batchDepth = 0;
const pending = new Set<Observer>();

class Node<T> {
  value: T;
  subs = new Set<Observer>();
  constructor(v: T) {
    this.value = v;
  }
  read(): T {
    if (activeObserver) {
      this.subs.add(activeObserver);
      activeObserver.deps.add(this as Node<unknown>);
    }
    return this.value;
  }
  write(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    for (const o of this.subs) pending.add(o);
    if (batchDepth === 0) flush();
  }
}

function cleanup(o: Observer): void {
  for (const dep of o.deps) dep.subs.delete(o);
  o.deps.clear();
}

function flush(): void {
  let guard = 0;
  while (pending.size > 0) {
    if (++guard > 100_000) throw new Error('signal: flush did not settle (dependency cycle?)');
    const batch = [...pending];
    pending.clear();
    for (const o of batch) if (o.alive) o.execute();
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

/** Run fn without subscribing the current observer to anything it reads. */
export function untrack<T>(fn: () => T): T {
  const prev = activeObserver;
  activeObserver = null;
  try {
    return fn();
  } finally {
    activeObserver = prev;
  }
}

export interface Signal<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  /** Read without subscribing. */
  peek(): T;
}

export function signal<T>(initial: T): Signal<T> {
  const node = new Node(initial);
  return {
    get: () => node.read(),
    set: (next) => node.write(typeof next === 'function' ? (next as (p: T) => T)(node.value) : next),
    peek: () => node.value,
  };
}

export interface Computed<T> {
  get(): T;
  peek(): T;
}

export function computed<T>(fn: () => T): Computed<T> {
  return {
    get: fn,
    peek: () => untrack(fn),
  };
}

export function effect(fn: () => void): () => void {
  const observer: Observer = {
    deps: new Set(),
    alive: true,
    execute() {
      cleanup(observer);
      const prev = activeObserver;
      activeObserver = observer;
      try {
        fn();
      } finally {
        activeObserver = prev;
      }
    },
  };
  observer.execute();
  return () => {
    observer.alive = false;
    cleanup(observer);
  };
}
