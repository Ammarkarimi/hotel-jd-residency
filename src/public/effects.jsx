import { Component, useEffect, useRef, useState } from 'react';

export function useInView({ rootMargin = '200px' } = {}) {
  // Callback ref, so it also works for elements that mount after the first render.
  const [el, setEl] = useState(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, rootMargin]);
  return [setEl, inView];
}

/** Adds `.is-in` to every `[data-reveal]` element once it scrolls into view. */
export function useRevealAll(dep) {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.is-in)');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -10% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

/** Card that tilts toward the pointer in 3D. */
export function Tilt({ children, className = '', max = 10, ...rest }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-y * max}deg`);
    el.style.setProperty('--ry', `${x * max}deg`);
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  };
  const onLeave = () => {
    ref.current.style.setProperty('--rx', '0deg');
    ref.current.style.setProperty('--ry', '0deg');
  };
  return (
    <div ref={ref} className={`tilt ${className}`} onPointerMove={onMove} onPointerLeave={onLeave} {...rest}>
      {children}
    </div>
  );
}

/** Soft glowing cursor follower (pointer devices only). */
export function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let rx = x;
    let ry = y;
    let raf;
    const move = (e) => {
      x = e.clientX;
      y = e.clientY;
      const hot = e.target.closest?.('a, button, input, select, textarea, label, [role="tab"]');
      ring.current?.classList.toggle('is-hot', !!hot);
    };
    const tick = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      if (dot.current) dot.current.style.transform = `translate(${x}px, ${y}px)`;
      if (ring.current) ring.current.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = requestAnimationFrame(tick);
    };
    document.body.classList.add('has-cursor');
    window.addEventListener('pointermove', move);
    raf = requestAnimationFrame(tick);
    return () => {
      document.body.classList.remove('has-cursor');
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  );
}

export function Preloader({ ready }) {
  const [pct, setPct] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const target = ready ? 100 : 86;
      const p = Math.min(target, ((t - start) / 1400) * 100);
      setPct(Math.round(p));
      if (p < 100) raf = requestAnimationFrame(tick);
      else setTimeout(() => setGone(true), 650);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);
  if (gone) return null;
  return (
    <div className={`preloader ${pct >= 100 ? 'is-done' : ''}`} aria-hidden="true">
      <div className="preloader-inner">
        <div className="preloader-logo">JD</div>
        <div className="preloader-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="preloader-text">
          Checking you in <b>{String(pct).padStart(3, '0')}</b>
        </div>
      </div>
    </div>
  );
}

export class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('3D scene disabled:', err?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
