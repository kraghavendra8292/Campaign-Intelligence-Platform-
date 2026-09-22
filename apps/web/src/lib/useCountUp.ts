import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

/**
 * Eases a number towards its target for the KPI cards.
 *
 * Three rules keep this from becoming the usual dashboard gimmick.
 *
 * It counts from zero ONCE, when the first real figure arrives. Every change
 * after that - a new period, a refresh - eases from the figure already on
 * screen, so the card reads as "this moved" rather than replaying an intro. A
 * component that re-renders for unrelated reasons never restarts it.
 *
 * The intermediate frames are never presented as data under reduced motion:
 * that setting returns the real figure directly, with no animation state
 * involved at all.
 *
 * And only the animation frame writes state. Setting it synchronously from the
 * effect body would cascade a render on every dependency change, which is what
 * makes counters janky on a dashboard that has six of them.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  const [animated, setAnimated] = useState(target);
  const previous = useRef(target);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      // Keep the origin current so enabling motion later eases from the figure
      // on screen rather than replaying from zero.
      previous.current = target;
      return;
    }

    const from = started.current ? previous.current : 0;
    started.current = true;
    previous.current = target;

    // Nothing to travel: the displayed value already equals the target.
    if (from === target) return;

    let frame = 0;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      // Ease-out cubic: fast enough to feel responsive, settling without bounce.
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return reduced ? target : animated;
}
