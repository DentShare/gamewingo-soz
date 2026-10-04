/** Offline content authoring: shuffle full tubes, then find a legal solution.
 * Prints fixtures; never writes progress or modifies game files. */
const capacity = 4;
const keyOf = (tubes) => tubes.map((tube) => tube.join('')).sort().join('|');
const runOf = (tube) => {
  let count = 0;
  while (count < tube.length && tube[tube.length - 1 - count] === tube.at(-1)) count++;
  return count;
};
function solve(start, nodeBudget = 300_000) {
  const seen = new Set();
  let nodes = 0;
  const visit = (tubes, path) => {
    if (++nodes > nodeBudget || path.length > 90) return null;
    if (tubes.every((tube) => !tube.length || (tube.length === capacity && runOf(tube) === capacity))) return path;
    const key = keyOf(tubes);
    if (seen.has(key)) return null;
    seen.add(key);
    const candidates = [];
    for (let from = 0; from < tubes.length; from++) {
      const source = tubes[from], run = runOf(source);
      if (!run || run === capacity) continue;
      let usedEmpty = false;
      for (let to = 0; to < tubes.length; to++) {
        const target = tubes[to];
        if (from === to || target.length === capacity || (target.length && target.at(-1) !== source.at(-1))) continue;
        if (!target.length) {
          if (usedEmpty || run === source.length) continue;
          usedEmpty = true;
        }
        const count = Math.min(run, capacity - target.length);
        const next = tubes.map((tube) => tube.slice());
        next[to].push(...next[from].splice(source.length - count, count));
        const complete = next[to].length === capacity && runOf(next[to]) === capacity;
        const exposed = next[from].length && runOf(next[from]) === next[from].length;
        candidates.push({ next, from, to, score: (complete ? 100 : 0) + (target.length ? 20 : 0) + (count === source.length ? 10 : 0) + (exposed ? 5 : 0) + count });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates) {
      const result = visit(candidate.next, [...path, [candidate.from, candidate.to]]);
      if (result) return result;
      if (nodes > nodeBudget) break;
    }
    return null;
  };
  return { solution: visit(start, []), nodes };
}

for (let n = 5; n <= 10; n++) {
  const colors = 2 + Math.floor((n - 1) / 2);
  let fixture;
  for (let attempt = 0; attempt < 20_000; attempt++) {
    let seed = n * 7919 + attempt * 104729;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const units = Array.from({ length: n }, (_, i) => Array(capacity).fill(i % colors)).flat();
    for (let i = units.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }
    const tubes = Array.from({ length: n }, (_, i) => units.slice(i * capacity, (i + 1) * capacity));
    if (tubes.some((tube) => new Set(tube).size < 3 || tube.some((color, i) => i > 0 && color === tube[i - 1]))) continue;
    tubes.push([], []);
    const { solution, nodes } = solve(tubes);
    if (solution) {
      fixture = { n, colors, tubes, solution };
      console.error(`level ${n}: ${solution.length} moves, ${nodes} search nodes, seed attempt ${attempt}`);
      break;
    }
  }
  if (!fixture) throw new Error(`No verified puzzle for level ${n}`);
  console.log(JSON.stringify(fixture));
}
