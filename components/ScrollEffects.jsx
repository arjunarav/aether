'use client';

import { useLayoutEffect } from 'react';

export default function ScrollEffects() {
  useLayoutEffect(() => {
    let smoother;
    let context;
    let mounted = true;

    async function setup() {
      try {
        const gsapModule = await import('gsap');
        const scrollTriggerModule = await import('gsap/ScrollTrigger');
        const smootherModule = await import('gsap/ScrollSmoother').catch(() => null);

        if (!mounted) return;

        const gsap = gsapModule.gsap || gsapModule.default || gsapModule;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger || scrollTriggerModule.default;
        const ScrollSmoother = smootherModule?.ScrollSmoother || smootherModule?.default;
        const markers = new URLSearchParams(window.location.search).has('gsapMarkers');
        const shouldSmooth = new URLSearchParams(window.location.search).has('smooth');

        gsap.registerPlugin(ScrollTrigger);

        await waitForSelector('.aether-shell');
        if (!mounted) return;

        if (ScrollSmoother && shouldSmooth) {
          gsap.registerPlugin(ScrollSmoother);
          smoother = ScrollSmoother.create({
            wrapper: '#smooth-wrapper',
            content: '#smooth-content',
            smooth: 1.4,
            effects: true,
            smoothTouch: 0.1
          });
        } else {
          document.querySelector('#smooth-wrapper')?.removeAttribute('style');
          document.querySelector('#smooth-content')?.removeAttribute('style');
        }

        context = gsap.context(() => {
          gsap.utils.toArray('.insight-card').forEach((card, i) => {
            gsap.from(card, {
              opacity: 0,
              y: 14,
              duration: 0.5,
              ease: 'power2.out',
              delay: i * 0.08,
              scrollTrigger: {
                trigger: card,
                start: 'top 92%',
                markers,
                once: true
              }
            });
          });

          gsap.utils.toArray('[data-score]').forEach((el) => {
            const target = Number.parseInt(el.dataset.value || '0', 10);
            ScrollTrigger.create({
              trigger: el,
              start: 'top 85%',
              markers,
              once: true,
              onEnter: () => {
                gsap.to(
                  { val: 0 },
                  {
                    val: target,
                    duration: 0.9,
                    ease: 'power4.out',
                    onUpdate() {
                      el.textContent = Math.round(this.targets()[0].val);
                    }
                  }
                );
              }
            });
          });

          gsap.utils.toArray('.chart-line path').forEach((path) => {
            if (!path.getTotalLength) return;
            const length = path.getTotalLength();
            gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
            gsap.to(path, {
              strokeDashoffset: 0,
              duration: 0.7,
              ease: 'power2.inOut',
              scrollTrigger: {
                trigger: path.closest('.chart-container') || path,
                start: 'top 85%',
                markers,
                once: true
              }
            });
          });

          gsap.utils.toArray('.chart-bar').forEach((bar, i) => {
            gsap.from(bar, {
              scaleY: 0,
              transformOrigin: 'bottom',
              duration: 0.5,
              ease: 'power2.out',
              delay: i * 0.03,
              scrollTrigger: {
                trigger: bar.closest('.chart-container') || bar,
                start: 'top 85%',
                markers,
                once: true
              }
            });
          });

          gsap.utils.toArray('.section-header').forEach((header) => {
            gsap.from(header, {
              opacity: 0,
              x: -8,
              duration: 0.4,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: header,
                start: 'top 90%',
                markers,
                once: true
              }
            });
          });

          gsap.utils.toArray('.module-scroll-section').forEach((section) => {
            const track = section.querySelector('.module-track');
            if (!track) return;

            const getDistance = () => Math.max(0, track.scrollWidth - section.clientWidth);
            if (getDistance() <= 0) return;

            gsap.to(track, {
              x: () => -getDistance(),
              ease: 'none',
              scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: () => `+=${getDistance()}`,
                scrub: 1.1,
                pin: true,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                markers
              }
            });
          });

          const regretContainer = document.querySelector('.regret-graph');
          if (regretContainer) {
            const badLine = regretContainer.querySelector('.line-no-action');
            const goodLine = regretContainer.querySelector('.line-with-action');
            const gapFill = regretContainer.querySelector('.gap-fill');
            const labels = regretContainer.querySelectorAll('.line-label');

            if (badLine?.getTotalLength && goodLine?.getTotalLength) {
              const badLength = badLine.getTotalLength();
              const goodLength = goodLine.getTotalLength();
              gsap.set(badLine, { strokeDasharray: badLength, strokeDashoffset: badLength });
              gsap.set(goodLine, { strokeDasharray: goodLength, strokeDashoffset: goodLength });
              gsap.set(gapFill, { opacity: 0 });
              gsap.set(labels, { opacity: 0 });

              ScrollTrigger.create({
                trigger: regretContainer,
                start: 'top 80%',
                markers,
                once: true,
                onEnter: () => {
                  const tl = gsap.timeline();
                  tl.to(badLine, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' })
                    .to({}, { duration: 0.4 })
                    .to(goodLine, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' })
                    .to(gapFill, { opacity: 0.06, duration: 0.5 })
                    .to(labels, { opacity: 1, duration: 0.3, stagger: 0.1 });
                }
              });
            }
          }

        });
        window.__AETHER_GSAP__ = {
          gsap,
          ScrollTrigger,
          ScrollSmoother,
          smoother,
          getTriggers: () => ScrollTrigger.getAll()
        };
        document.documentElement.dataset.gsap = 'ready';
        document.documentElement.dataset.gsapTriggers = String(ScrollTrigger.getAll().length);
      } catch {
        document.documentElement.classList.add('no-gsap');
      }
    }

    setup();

    return () => {
      mounted = false;
      context?.revert();
      smoother?.kill();
    };
  }, []);

  return null;
}

function waitForSelector(selector, timeout = 4000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}
