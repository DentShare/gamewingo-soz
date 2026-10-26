export type GestureAction = 'left' | 'right' | 'rotate' | 'rotateBack' | 'drop';

interface Stroke {
  id: number;
  x: number;
  y: number;
  anchorX: number;
  time: number;
  distance: number;
  moved: boolean;
  axis: 'horizontal' | 'vertical' | null;
}

/** Logical coordinates keep gesture thresholds independent of screen size and DPR. */
export class SwipeControls {
  private stroke: Stroke | null = null;

  constructor(private readonly cellSize: number) {}

  start(id: number, x: number, y: number, time: number): void {
    if (this.stroke) return; // A second finger must not replace the current gesture.
    this.stroke = { id, x, y, anchorX: x, time, distance: 0, moved: false, axis: null };
  }

  move(id: number, x: number, y: number): GestureAction[] {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== id) return [];
    const dx = x - stroke.x, dy = y - stroke.y;
    stroke.distance = Math.max(stroke.distance, Math.hypot(dx, dy));
    if (!stroke.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 18) {
      stroke.axis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (stroke.axis !== 'horizontal') return [];
    const actions: GestureAction[] = [];
    let threshold = stroke.moved ? this.cellSize : 18;
    // Preserve the unused distance so a long drag can move several columns or reverse.
    while (Math.abs(x - stroke.anchorX) >= threshold && actions.length < 10) {
      const direction = x > stroke.anchorX ? 1 : -1;
      actions.push(direction > 0 ? 'right' : 'left');
      stroke.anchorX += direction * threshold;
      stroke.moved = true;
      threshold = this.cellSize;
    }
    return actions;
  }

  end(id: number, x: number, y: number, time: number): GestureAction[] {
    const stroke = this.stroke;
    if (!stroke || stroke.id !== id) return [];
    const actions = this.move(id, x, y);
    this.cancel();
    if (stroke.axis === 'vertical') {
      // A horizontal drag can never become an accidental hard drop.
      if (y - stroke.y >= 64) actions.push('drop');
      else if (y - stroke.y <= -36) actions.push('rotateBack');
    } else if (!stroke.axis && stroke.distance <= 10 && time - stroke.time <= 300) {
      actions.push('rotate');
    }
    return actions;
  }

  cancel(): void { this.stroke = null; }
}
