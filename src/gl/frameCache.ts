// A small least-recently-used cache: effects that look at earlier frames (echo trails) segment each source frame once and reuse
// the matte while the playhead moves on, instead of once per trail step per frame.
export class LruCache<V> {
  private readonly entries = new Map<string, V>();
  private readonly capacity: number;
  constructor(capacity: number) {
    this.capacity = capacity;
  }
  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }
  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value as string);
  }
  get size(): number { return this.entries.size; }
}
