const MARKER = 'wingoGameBoundary';
/** One history boundary per document; scene changes must not grow the stack. */
export function guardBrowserBack(onBack: () => void, rearm = true) {
  const state = () => ({ ...(history.state && typeof history.state === 'object' ? history.state : {}), [MARKER]: location.href });
  if (rearm && history.state?.[MARKER] !== location.href) history.pushState(state(), '', location.href);
  const back = () => {
    if (rearm) history.pushState(state(), '', location.href);
    onBack();
  };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onBack(); } };
  window.addEventListener('popstate', back);
  window.addEventListener('keydown', key);
  return () => { window.removeEventListener('popstate', back); window.removeEventListener('keydown', key); };
}
