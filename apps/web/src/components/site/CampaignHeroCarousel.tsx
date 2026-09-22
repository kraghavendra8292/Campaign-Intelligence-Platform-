import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@rk/ui';
import { useSite } from '../../features/site/SiteContext';
import { mediaUrl } from '../../features/site/media';
import type { HeroSlide } from '../../features/site/heroSlides';

/**
 * Homepage cover-photo slideshow.
 *
 * Presentation only - it renders the slides it is given and owns nothing about
 * where they came from. `buildHeroSlides` decides that.
 *
 * Three things it is careful about:
 *
 *  - **It degrades.** One slide renders as a plain cover photo, with no
 *    controls, no timer and no gesture handling, because a carousel of one is
 *    just a picture.
 *  - **It can be stopped.** Auto-advancing content must be pausable to meet
 *    WCAG 2.2.2, so the pause control is part of the component, not an option.
 *  - **It only loads what it needs.** The first photograph is fetched at high
 *    priority; the rest arrive one slide ahead of being seen.
 */

/** Long enough to read a photograph, short enough to feel alive. */
const AUTOPLAY_MS = 5500;

/** Below this a gesture is a tap or a scroll, not a swipe. */
const SWIPE_THRESHOLD_PX = 48;

export interface CampaignHeroCarouselProps {
  slides: HeroSlide[];
  /** Headline, summary and calls to action, laid over the photograph. */
  children?: ReactNode;
}

export function CampaignHeroCarousel({ slides, children }: CampaignHeroCarouselProps) {
  const { t } = useSite();
  const total = slides.length;
  const isCarousel = total > 1;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  /** Transient: a pointer is down, or a pointer/focus is resting on the hero. */
  const [held, setHeld] = useState(false);

  const baseId = useId();
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  /*
   * Which slides are committed to the DOM.
   *
   * Derived from the current index rather than accumulated in state: the slide
   * being shown, the one after it, and the one before it.
   *
   * The NEXT slide is mounted early so its bytes land during the autoplay
   * interval and the transition never waits on the network. The PREVIOUS one
   * stays mounted because it is still fading OUT - dropping it on the index
   * change would make it vanish instead of dissolve. Everything further away is
   * a full-bleed photograph nobody has asked to see yet.
   */
  const mounted = new Set([index, (index + 1) % total, (index - 1 + total) % total]);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + total) % total);
    },
    [total],
  );

  const autoplayRunning = isCarousel && playing && !held;

  /*
   * Keyed on `index`, so the clock restarts whenever the slide changes for any
   * reason. Arriving somewhere by arrow key or swipe therefore buys a full
   * interval to look at it, rather than being hurried along by a timer that was
   * already half spent.
   */
  useEffect(() => {
    if (!autoplayRunning) return;

    const timer = window.setTimeout(() => step(1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoplayRunning, index, step]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!isCarousel) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  }

  /*
   * Swipe, without stealing the page scroll.
   *
   * `touch-action: pan-y` on the viewport leaves vertical panning to the
   * browser and gives us the horizontal axis. Nothing calls `preventDefault`,
   * so a tap that never crosses the threshold still reaches the link or button
   * underneath it and the overlay stays fully usable.
   */
  function onPointerDown(event: React.PointerEvent) {
    if (!isCarousel) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    dragRef.current = { x: event.clientX, y: event.clientY };
    setHeld(true);
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragRef.current;
    dragRef.current = null;
    setHeld(false);
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    // A mostly-vertical drag was someone scrolling the page past the hero.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

    step(dx < 0 ? 1 : -1);
  }

  const slide = slides[index];
  if (!slide) return null;

  return (
    <section
      className="hero-carousel"
      aria-roledescription={isCarousel ? 'carousel' : undefined}
      aria-label={t('hero.slideshow')}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div className="hero-carousel__viewport" id={baseId}>
        {slides.map((item, position) => (
          <div
            key={item.image.id}
            className="hero-carousel__slide"
            data-active={position === index}
            aria-hidden={position !== index}
            {...(isCarousel
              ? {
                  role: 'group',
                  'aria-roledescription': 'slide',
                  'aria-label': t('hero.slideOf', { current: position + 1, total }),
                }
              : {})}
          >
            {mounted.has(position) ? (
              <img
                src={mediaUrl(item.image)}
                alt={item.alt}
                className="hero-carousel__image"
                data-focus={item.focus}
                width={item.image.width ?? undefined}
                height={item.image.height ?? undefined}
                loading={position === 0 ? 'eager' : 'lazy'}
                decoding={position === 0 ? 'sync' : 'async'}
                {...(position === 0 ? { fetchPriority: 'high' as const } : {})}
              />
            ) : null}
          </div>
        ))}

        {/* Sits over the photograph, never over another slide's controls. */}
        {children ? <div className="hero-carousel__overlay">{children}</div> : null}
      </div>

      {isCarousel ? (
        <>
          <button
            type="button"
            className="hero-carousel__arrow hero-carousel__arrow--prev"
            onClick={() => step(-1)}
            aria-label={t('hero.previousSlide')}
            aria-controls={baseId}
          >
            <Icon name="chevronLeft" size={1.5} />
          </button>

          <button
            type="button"
            className="hero-carousel__arrow hero-carousel__arrow--next"
            onClick={() => step(1)}
            aria-label={t('hero.nextSlide')}
            aria-controls={baseId}
          >
            <Icon name="chevronRight" size={1.5} />
          </button>

          <div className="hero-carousel__controls">
            <div className="hero-carousel__dots">
              {slides.map((item, position) => (
                <button
                  key={item.image.id}
                  type="button"
                  className="hero-carousel__dot"
                  data-active={position === index}
                  aria-current={position === index}
                  aria-label={t('hero.goToSlide', { index: position + 1 })}
                  onClick={() => setIndex(position)}
                />
              ))}
            </div>

            <button
              type="button"
              className="hero-carousel__play"
              onClick={() => setPlaying((current) => !current)}
              aria-label={playing ? t('hero.pauseSlideshow') : t('hero.playSlideshow')}
            >
              <Icon name={playing ? 'pause' : 'play'} size={1.1} />
            </button>
          </div>

          {/*
            Silent while the slideshow is advancing on its own - a screen reader
            narrating every automatic change would be unusable - and polite once
            it is stopped, when a change means the visitor asked for one.
          */}
          <p className="visually-hidden" aria-live={playing ? 'off' : 'polite'}>
            {t('hero.slideOf', { current: index + 1, total })}
          </p>
        </>
      ) : null}
    </section>
  );
}
