/** Геометрия жидкости: объём сохраняется, поверхность остаётся горизонтальной
 * в координатах экрана даже при наклоне самой колбы. Без физического движка. */
export interface LiquidPoint { x: number; y: number; }
export interface LiquidLayer { color: number; amount: number; }
export interface LiquidBand { color: number; points: LiquidPoint[]; }

export const LIQUID_TOP = -65;
export const LIQUID_BOTTOM = 66;
export const LIQUID_HALF_WIDTH = 19;
export const LIQUID_CAPACITY = 4;

const cavity: LiquidPoint[] = [
  { x: -19, y: -65 }, { x: 19, y: -65 }, { x: 19, y: 53 },
  { x: 17, y: 60 }, { x: 11, y: 65 }, { x: 0, y: 66 },
  { x: -11, y: 65 }, { x: -17, y: 60 }, { x: -19, y: 53 },
];

export function polygonArea(points: readonly LiquidPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

const areaPerUnit = polygonArea(cavity) / 4.5; // запас воздуха над полной колбой

/** Отсечение многоугольника линией свободной поверхности. */
function clip(points: readonly LiquidPoint[], nx: number, ny: number, level: number, below = true): LiquidPoint[] {
  const result: LiquidPoint[] = [];
  const distance = (point: LiquidPoint) => (nx * point.x + ny * point.y - level) * (below ? 1 : -1);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = distance(a), db = distance(b);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}

function surfaceFor(amount: number, nx: number, ny: number): number {
  const dots = cavity.map((p) => nx * p.x + ny * p.y);
  let low = Math.min(...dots), high = Math.max(...dots);
  const desired = Math.max(0, Math.min(LIQUID_CAPACITY, amount)) * areaPerUnit;
  for (let i = 0; i < 22; i++) {
    const mid = (low + high) / 2;
    if (polygonArea(clip(cavity, nx, ny, mid)) > desired) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function liquidBands(layers: readonly LiquidLayer[], radians: number): LiquidBand[] {
  const nx = Math.sin(radians), ny = Math.cos(radians);
  let amount = 0;
  let lower = surfaceFor(0, nx, ny);
  const bands: LiquidBand[] = [];
  for (const layer of layers) {
    if (layer.amount <= 0.0001) continue;
    amount += layer.amount;
    const upper = surfaceFor(amount, nx, ny);
    bands.push({ color: layer.color, points: clip(clip(cavity, nx, ny, upper), nx, ny, lower, false) });
    lower = upper;
  }
  return bands;
}

/** Угол, при котором свободная поверхность достигает нижней кромки горлышка. */
export function pouringAngle(amount: number): number {
  if (amount <= 0.001) return Math.PI * 0.53;
  const desired = amount * areaPerUnit;
  let low = 0, high = Math.PI / 2;
  for (let i = 0; i < 22; i++) {
    const angle = (low + high) / 2;
    const nx = Math.sin(angle), ny = Math.cos(angle);
    const lipLevel = nx * LIQUID_HALF_WIDTH + ny * LIQUID_TOP;
    if (polygonArea(clip(cavity, nx, ny, lipLevel)) > desired) low = angle;
    else high = angle;
  }
  return (low + high) / 2;
}

export function uprightSurface(amount: number): number {
  return surfaceFor(amount, 0, 1);
}
