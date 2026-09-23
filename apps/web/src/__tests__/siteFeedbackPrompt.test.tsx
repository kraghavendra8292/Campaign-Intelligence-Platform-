import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteFeedbackPrompt } from '../components/site/SiteFeedbackPrompt';
import { SiteProvider } from '../features/site/SiteContext';
import {
  markSiteFeedbackGiven,
  markSiteFeedbackPromptDismissed,
  resetSiteFeedbackPromptDeadlines,
} from '../features/site/feedbackPromptStorage';

const GIVEN_KEY = 'rk.siteFeedback.given:demo-campaign';

function renderPrompt() {
  return render(
    <MemoryRouter>
      <SiteProvider>
        <SiteFeedbackPrompt />
      </SiteProvider>
    </MemoryRouter>,
  );
}

describe('SiteFeedbackPrompt dwell timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    resetSiteFeedbackPromptDeadlines();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    resetSiteFeedbackPromptDeadlines();
  });

  it('opens after 30 seconds for a visitor who has not given feedback', async () => {
    renderPrompt();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not open when feedback was already given', async () => {
    localStorage.setItem(GIVEN_KEY, '1');
    renderPrompt();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open when the prompt was dismissed this page load', async () => {
    markSiteFeedbackPromptDismissed();
    renderPrompt();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a legacy sessionStorage dismiss flag left by older builds', async () => {
    sessionStorage.setItem('rk.siteFeedback.promptDismissed', '1');
    resetSiteFeedbackPromptDeadlines();
    renderPrompt();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(sessionStorage.getItem('rk.siteFeedback.promptDismissed')).toBeNull();
  });

  it('keeps the same deadline across remounts (Strict Mode safe)', async () => {
    const first = renderPrompt();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    first.unmount();
    renderPrompt();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stays closed after markSiteFeedbackGiven', async () => {
    renderPrompt();
    markSiteFeedbackGiven('demo-campaign');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
