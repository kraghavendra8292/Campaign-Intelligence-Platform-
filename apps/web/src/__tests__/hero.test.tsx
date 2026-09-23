import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes/routes';
import { AuthProvider } from '../features/auth/AuthProvider';
import { graphqlError, installGraphQLMock, type Responder } from '../test/graphqlMock';
import {
  EMPTY_HOMEPAGE,
  HOMEPAGE,
  HOMEPAGE_WITH_COVERS,
  SITE,
  ALBUM_COVERS,
} from '../test/siteFixtures';
import { buildHeroSlides } from '../features/site/heroSlides';

/**
 * Homepage cover slideshow.
 *
 * The carousel is split into a pure slide builder and a presentational
 * component, so most of the interesting rules are asserted here without
 * rendering anything at all.
 */

function renderHome() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function mockSite(handlers: Record<string, Responder>) {
  return installGraphQLMock({
    Site: SITE,
    Refresh: graphqlError('UNAUTHENTICATED', 'no session'),
    ...handlers,
  });
}

const image = (id: string, width: number, height: number) => ({
  id,
  altText: null,
  width,
  height,
});

describe('hero slides - selection', () => {
  it('leads with the designated cover photo, then albums, then the portrait', () => {
    const slides = buildHeroSlides({
      coverImage: image('cover', 1600, 900),
      profileImage: image('portrait', 800, 1000),
      albums: ALBUM_COVERS,
      fallbackAlt: 'Demo Candidate',
    });

    expect(slides.map((slide) => slide.image.id)).toEqual(['cover', 'img-2', 'img-3', 'portrait']);
  });

  it('never shows the same photograph twice', () => {
    const shared = image('shared', 1600, 900);

    const slides = buildHeroSlides({
      coverImage: shared,
      profileImage: shared,
      albums: [{ id: 'a', title: 'Album', coverImage: shared }],
      fallbackAlt: 'Demo Candidate',
    });

    expect(slides).toHaveLength(1);
  });

  it('anchors portraits to the top of the frame and centres everything else', () => {
    const slides = buildHeroSlides({
      coverImage: image('landscape', 1600, 900),
      profileImage: image('portrait', 900, 1400),
      fallbackAlt: 'Demo Candidate',
    });

    // Centring a tall photograph in a wide hero is what crops the head off.
    expect(slides[0]?.focus).toBe('center');
    expect(slides[1]?.focus).toBe('top');
  });

  it('falls back to the campaign name when the CMS has no alt text', () => {
    const slides = buildHeroSlides({
      coverImage: image('cover', 1600, 900),
      fallbackAlt: 'Demo Candidate',
    });

    expect(slides[0]?.alt).toBe('Demo Candidate');
  });

  it('caps the slideshow rather than loading every album cover', () => {
    const albums = Array.from({ length: 12 }, (_, index) => ({
      id: `album-${index}`,
      title: `Album ${index}`,
      coverImage: image(`img-${index}`, 1600, 900),
    }));

    expect(buildHeroSlides({ albums, fallbackAlt: 'Demo' })).toHaveLength(5);
  });

  it('produces nothing when the campaign has published no photographs', () => {
    expect(buildHeroSlides({ fallbackAlt: 'Demo' })).toEqual([]);
  });
});

describe('hero slideshow - rendering', () => {
  function slides() {
    return Array.from(document.querySelectorAll('.hero-carousel__slide'));
  }

  function activeIndex() {
    return slides().findIndex((slide) => slide.getAttribute('data-active') === 'true');
  }

  it('keeps the headline and calls to action over the photograph', async () => {
    mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
    renderHome();

    // The hero content is the same content either way - only its frame changed.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Your opinion/i })).toBeInTheDocument();
  });

  it('offers no controls when there is only one photograph', async () => {
    // HOMEPAGE has a profile image and nothing else: a carousel of one is a
    // picture, and arrows that go nowhere are worse than no arrows.
    mockSite({ Homepage: HOMEPAGE });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });

    expect(screen.queryByRole('button', { name: /next slide/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause slideshow/i })).not.toBeInTheDocument();
    expect(slides()).toHaveLength(1);
  });

  it('falls back to the split hero when nothing has been published', async () => {
    mockSite({ Homepage: EMPTY_HOMEPAGE });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });
    expect(document.querySelector('.hero-carousel')).toBeNull();
    expect(document.querySelector('.hero')).not.toBeNull();
  });

  it('advances and rewinds from the arrows', async () => {
    mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });
    expect(activeIndex()).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: /next slide/i }));
    await waitFor(() => expect(activeIndex()).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: /previous slide/i }));
    await waitFor(() => expect(activeIndex()).toBe(0));
  });

  it('wraps around rather than dead-ending on the first slide', async () => {
    mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });

    await userEvent.click(screen.getByRole('button', { name: /previous slide/i }));
    await waitFor(() => expect(activeIndex()).toBe(slides().length - 1));
  });

  it('jumps to a slide from its indicator', async () => {
    mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });

    await userEvent.click(screen.getByRole('button', { name: 'Go to slide 3' }));
    await waitFor(() => expect(activeIndex()).toBe(2));
  });

  it('moves between slides with the arrow keys', async () => {
    mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });

    const next = screen.getByRole('button', { name: /next slide/i });
    next.focus();

    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(activeIndex()).toBe(1));

    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(activeIndex()).toBe(0));
  });

  it('can be stopped, as auto-advancing content must be', async () => {
    mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });

    await userEvent.click(screen.getByRole('button', { name: /pause slideshow/i }));
    expect(await screen.findByRole('button', { name: /play slideshow/i })).toBeInTheDocument();
  });

  it('advances on its own, and stops when asked to', async () => {
    vi.useFakeTimers();
    try {
      mockSite({ Homepage: HOMEPAGE_WITH_COVERS });
      renderHome();

      // Let the homepage query settle without letting the autoplay clock run.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(activeIndex()).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(activeIndex()).toBe(1);

      // Pausing must actually stop the clock, not just relabel the button.
      await act(async () => {
        screen.getByRole('button', { name: /pause slideshow/i }).click();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect(activeIndex()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads the first photograph eagerly and defers the ones nobody is near', async () => {
    // Six slides, so the mounted window is meaningfully smaller than the whole
    // slideshow - with three or fewer, "current, previous and next" is all of
    // them and there would be nothing to defer.
    const albums = Array.from({ length: 5 }, (_, index) => ({
      id: `album-${index}`,
      title: `Album ${index}`,
      coverImage: image(`cover-${index}`, 1600, 900),
    }));

    mockSite({ Homepage: { ...HOMEPAGE, publicPhotoAlbums: albums } });
    renderHome();

    await screen.findByRole('heading', { level: 1, name: 'Our constituency, our pride' });

    const carousel = document.querySelector('.hero-carousel') as HTMLElement;
    const images = within(carousel).getAllByRole('img', { hidden: true });

    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images.slice(1).every((img) => img.getAttribute('loading') === 'lazy')).toBe(true);

    // A five-slide hero must not pull five full-bleed photographs at once.
    expect(images.length).toBeLessThan(slides().length);
  });
});
