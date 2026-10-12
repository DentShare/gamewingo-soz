import type { Direction } from './arena';

export function stickDirection(dx: number, dy: number): Direction | null {
  if (Math.hypot(dx, dy) < 12) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/** Pointer ownership lasts until release, even outside the original hit zone. */
export class TouchControls {
  stick: number | null = null;
  fire: number | null = null;
  direction: Direction | null = null;
  dx = 0;
  dy = 0;
  startStick(id: number) { if (this.stick === null && id !== this.fire) this.stick = id; }
  startFire(id: number) { if (this.fire === null && id !== this.stick) this.fire = id; }
  move(id: number, dx: number, dy: number) {
    if (id !== this.stick) return;
    const scale = Math.min(1, 35 / Math.max(1, Math.hypot(dx, dy)));
    this.dx = dx * scale; this.dy = dy * scale; this.direction = stickDirection(dx, dy);
  }
  release(id: number) {
    if (id === this.stick) { this.stick = null; this.direction = null; this.dx = this.dy = 0; }
    if (id === this.fire) this.fire = null;
  }
  clear() { this.stick = this.fire = null; this.direction = null; this.dx = this.dy = 0; }
}
