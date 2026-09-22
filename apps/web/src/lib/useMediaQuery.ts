import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query from React.
 *
 * Used where a LAYOUT decision has a behavioural consequence that CSS cannot
 * express - `inert` is a DOM attribute, not a style, so a drawer that is a
 * permanent sidebar on desktop has to know which it currently is.
 *
 * `fallback` is what to assume when `matchMedia` is unavailable, as in jsdom.
 * Callers should pass the value that keeps content REACHABLE, so a missing API
 * degrades to everything visible rather than to something silently inert.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : fallback,
  );

  useEffect(() => {
    if (!supported) return;

    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);

    // Re-read on subscribe: the viewport may have changed between the initial
    // render and this effect.
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query, supported]);

  return matches;
}
