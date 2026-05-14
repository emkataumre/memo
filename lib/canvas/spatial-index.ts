/**
 * Grid-bucket spatial index for O(visible cells) viewport culling.
 * Cell size defaults to 1000 canvas units. See tech-spec.md §14.3.
 */
export class SpatialIndex<T> {
  private cells = new Map<string, Set<T>>();
  private positions = new Map<T, [number, number]>();

  constructor(private cellSize = 1000) {}

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  add(item: T, x: number, y: number): void {
    const k = this.key(x, y);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = new Set();
      this.cells.set(k, cell);
    }
    cell.add(item);
    this.positions.set(item, [x, y]);
  }

  remove(item: T): void {
    const pos = this.positions.get(item);
    if (!pos) return;
    const k = this.key(pos[0], pos[1]);
    this.cells.get(k)?.delete(item);
    this.positions.delete(item);
  }

  move(item: T, x: number, y: number): void {
    this.remove(item);
    this.add(item, x, y);
  }

  /** Returns all items whose anchor (x, y) lies in any cell touched by the bbox. */
  query(x1: number, y1: number, x2: number, y2: number): T[] {
    const out: T[] = [];
    const cx1 = Math.floor(x1 / this.cellSize);
    const cy1 = Math.floor(y1 / this.cellSize);
    const cx2 = Math.floor(x2 / this.cellSize);
    const cy2 = Math.floor(y2 / this.cellSize);
    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) cell.forEach((item) => out.push(item));
      }
    }
    return out;
  }
}
