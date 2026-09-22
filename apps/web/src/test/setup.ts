import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * How long `findBy*` waits for an element to appear.
 *
 * Raised from testing-library's 1000ms default because that default is not a
 * correctness boundary, it is a guess about machine speed - and on a loaded
 * machine (the full monorepo suite running seven workspaces back to back) a
 * list render that normally takes 200ms was measured at 1266ms and failed. The
 * result was a suite that passed when run alone and failed when run with
 * everything else, which is the least useful kind of test failure: it points at
 * an innocent file and hides whatever is actually broken.
 *
 * This does NOT weaken any assertion. `findBy*` still fails when the element
 * never appears; it simply stops treating "slower than one second" as the same
 * thing as "never rendered". A genuinely hung render still fails, five seconds
 * later.
 */
configure({ asyncUtilTimeout: 5000 });

/**
 * Unmount between tests so a leaked component cannot make a later assertion
 * pass, and reset mocks so fetch stubs do not bleed across files.
 *
 * Web storage is cleared too. jsdom keeps one `localStorage` for the whole
 * file, so a test that changes the reader's language would otherwise leave
 * every later test in that language - which shows up as an unrelated assertion
 * failing on a translated string.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();

  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Storage is a convenience here; an environment without it is fine.
  }

  document.documentElement.lang = 'en';
});
