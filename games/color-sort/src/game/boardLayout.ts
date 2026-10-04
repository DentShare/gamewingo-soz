/** До четырёх колб в ряду: сохраняем размер стекла и удобные зоны нажатия. */
export function tubePositions(count: number): { x: number; y: number }[] {
  const rowCount = Math.ceil(count / 4);
  const ys = rowCount === 1 ? [350] : rowCount === 2 ? [282, 474] : [193, 350, 507];
  const result: { x: number; y: number }[] = [];
  for (let row = 0; row < rowCount; row++) {
    const columns = Math.floor(count / rowCount) + (row < count % rowCount ? 1 : 0);
    const start = 200 - 84 * (columns - 1) / 2;
    for (let col = 0; col < columns; col++) result.push({ x: start + col * 84, y: ys[row] });
  }
  return result;
}
