export type RepeatAction = 'left' | 'right' | 'down';

/** Game-controlled repeat, independent of the operating system's key repeat. */
export class HeldControls {
  private held = new Map<string, { action: RepeatAction; nextAt: number }>();

  press(source: string, action: RepeatAction, now: number, perform: (action: RepeatAction) => void): void {
    if (this.held.has(source)) return;
    this.held.set(source, { action, nextAt: now + (action === 'down' ? 45 : 160) });
    perform(action);
  }

  release(source: string): void { this.held.delete(source); }
  clear(): void { this.held.clear(); }

  update(now: number, perform: (action: RepeatAction) => void): void {
    // The most recently pressed horizontal direction wins; down can run alongside it.
    const inputs = [...this.held.values()];
    const horizontal = inputs.slice().reverse().find(input => input.action !== 'down');
    const down = inputs.slice().reverse().find(input => input.action === 'down');
    for (const input of [horizontal, down]) {
      if (!input || now < input.nextAt) continue;
      input.nextAt = now + (input.action === 'down' ? 45 : 55);
      perform(input.action);
    }
  }
}
