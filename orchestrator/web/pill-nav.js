/* pill-nav.js — React Bits PillNav Interactive Logic for CrewCtl */
(function () {
  'use strict';

  function initPillNav() {
    const container = document.querySelector('.pill-nav-container');
    if (!container) return;

    const circleRefs = Array.from(container.querySelectorAll('.hover-circle'));
    const pills = Array.from(container.querySelectorAll('.pill-list .pill'));
    const logoImg = container.querySelector('.pill-logo-icon svg, .pill-logo-icon img');
    const logoLink = container.querySelector('.pill-logo');
    const hamburgerBtn = container.querySelector('.mobile-menu-button');
    const mobileMenu = container.querySelector('.mobile-menu-popover');
    let isMobileOpen = false;

    // Highlight active nav item based on current URL path
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    pills.forEach((pill) => {
      const href = pill.getAttribute('href');
      if (href && (href === currentPath || (currentPath === '' && href === 'index.html'))) {
        pill.classList.add('is-active');
      } else {
        pill.classList.remove('is-active');
      }
    });

    const mobileLinks = container.querySelectorAll('.mobile-menu-link');
    mobileLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href && (href === currentPath || (currentPath === '' && href === 'index.html'))) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
    });

    const hasGsap = typeof gsap !== 'undefined';
    const ease = 'power3.easeOut';
    const tlRefs = [];
    const activeTweenRefs = [];

    const layout = () => {
      circleRefs.forEach((circle, i) => {
        const pill = circle.parentElement;
        if (!pill) return;
        const rect = pill.getBoundingClientRect();
        const { width: w, height: h } = rect;
        if (w === 0 || h === 0) return;

        const R = ((w * w) / 4 + h * h) / (2 * h);
        const D = Math.ceil(2 * R) + 2;
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
        const originY = D - delta;

        circle.style.width = `${D}px`;
        circle.style.height = `${D}px`;
        circle.style.bottom = `-${delta}px`;

        if (hasGsap) {
          gsap.set(circle, {
            xPercent: -50,
            scale: 0,
            transformOrigin: `50% ${originY}px`
          });

          const label = pill.querySelector('.pill-label');
          const white = pill.querySelector('.pill-label-hover');

          if (label) gsap.set(label, { y: 0 });
          if (white) gsap.set(white, { y: Math.ceil(h + 100), opacity: 0 });

          tlRefs[i]?.kill();
          const tl = gsap.timeline({ paused: true });
          tl.to(circle, { scale: 1.2, xPercent: -50, duration: 0.35, ease, overwrite: 'auto' }, 0);
          if (label) tl.to(label, { y: -(h + 8), duration: 0.35, ease, overwrite: 'auto' }, 0);
          if (white) tl.to(white, { y: 0, opacity: 1, duration: 0.35, ease, overwrite: 'auto' }, 0);
          tlRefs[i] = tl;
        }
      });
    };

    layout();
    window.addEventListener('resize', layout);
    if (document.fonts?.ready) {
      document.fonts.ready.then(layout).catch(() => {});
    }

    pills.forEach((pill, i) => {
      pill.addEventListener('mouseenter', () => {
        if (hasGsap && tlRefs[i]) {
          activeTweenRefs[i]?.kill();
          activeTweenRefs[i] = tlRefs[i].tweenTo(tlRefs[i].duration(), { duration: 0.25, ease, overwrite: 'auto' });
        }
      });
      pill.addEventListener('mouseleave', () => {
        if (hasGsap && tlRefs[i]) {
          activeTweenRefs[i]?.kill();
          activeTweenRefs[i] = tlRefs[i].tweenTo(0, { duration: 0.2, ease, overwrite: 'auto' });
        }
      });
    });

    if (logoLink && logoImg) {
      logoLink.addEventListener('mouseenter', () => {
        if (hasGsap) {
          gsap.killTweensOf(logoImg);
          gsap.set(logoImg, { rotate: 0 });
          gsap.to(logoImg, { rotate: 360, duration: 0.45, ease, overwrite: 'auto' });
        } else {
          logoImg.style.transition = 'transform 0.4s ease';
          logoImg.style.transform = 'rotate(360deg)';
          setTimeout(() => {
            logoImg.style.transition = 'none';
            logoImg.style.transform = 'rotate(0deg)';
          }, 400);
        }
      });
    }

    if (hamburgerBtn && mobileMenu) {
      const toggleMobileMenu = () => {
        isMobileOpen = !isMobileOpen;
        const lines = hamburgerBtn.querySelectorAll('.hamburger-line');

        if (hasGsap) {
          if (lines.length >= 2) {
            if (isMobileOpen) {
              gsap.to(lines[0], { rotation: 45, y: 3, duration: 0.25, ease });
              gsap.to(lines[1], { rotation: -45, y: -3, duration: 0.25, ease });
            } else {
              gsap.to(lines[0], { rotation: 0, y: 0, duration: 0.25, ease });
              gsap.to(lines[1], { rotation: 0, y: 0, duration: 0.25, ease });
            }
          }

          if (isMobileOpen) {
            gsap.set(mobileMenu, { visibility: 'visible' });
            gsap.fromTo(mobileMenu, { opacity: 0, y: 10, scaleY: 0.95 }, { opacity: 1, y: 0, scaleY: 1, duration: 0.25, ease });
          } else {
            gsap.to(mobileMenu, { opacity: 0, y: 10, scaleY: 0.95, duration: 0.2, ease, onComplete: () => { gsap.set(mobileMenu, { visibility: 'hidden' }); } });
          }
        } else {
          mobileMenu.style.visibility = isMobileOpen ? 'visible' : 'hidden';
          mobileMenu.style.opacity = isMobileOpen ? '1' : '0';
          if (lines.length >= 2) {
            lines[0].style.transform = isMobileOpen ? 'rotate(45deg) translateY(3px)' : 'none';
            lines[1].style.transform = isMobileOpen ? 'rotate(-45deg) translateY(-3px)' : 'none';
          }
        }
      };

      hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
      });

      document.addEventListener('click', (e) => {
        if (isMobileOpen && !mobileMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
          toggleMobileMenu();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPillNav);
  } else {
    initPillNav();
  }
})();
