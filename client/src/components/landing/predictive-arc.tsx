/**
 * PREDICTIVE ARC — procedural atmosphere for the landing hero.
 *
 * Adapted from ThreeUI's `predictiveArcRenderer.ts`.
 *   https://github.com/MengTo/threeui — MIT License, Copyright (c) 2026 Meng To
 *
 * Ported rather than installed on purpose: `@designcodeio/threeui` is 53.7 MB
 * unpacked and aliases two extra copies of three.js (0.128 + 0.165) alongside the
 * 0.160 this app already runs. The renderer itself is ~110 lines of canvas 2D with
 * no imports, so the dependency bought nothing.
 *
 * Two deliberate changes from upstream:
 *
 * 1. The colour ramp is rewritten. Upstream declares `hue` and `saturation` in its
 *    options type but never reads them in the render loop — the ramp is hardcoded
 *    violet. Tuning to Ice Signal meant replacing the ramp, not passing a param.
 *    The coefficients below are chosen so a full-intensity dot lands exactly on
 *    #78C6E8 (30+90=120, 70+128=198, 110+122=232), which is `--brand-cyan`.
 *
 * 2. Motion is opt-out. Under `prefers-reduced-motion` this paints a single frame
 *    and stops, and it pauses entirely when scrolled out of view. Decorative motion
 *    that runs unwatched is the kind this app's motion budget should not be spent on.
 */
import { useEffect, useRef } from 'react';

type Mode = 'dark' | 'light';

export interface PredictiveArcOptions {
  /** Vertical position of the arch crown, 0-1 of height. Higher sits lower. */
  archPeak: number;
  speed: number;
  spacing: number;
  dotSize: number;
  archHeight: number;
  thickness: number;
  brightness: number;
}

export const PREDICTIVE_ARC_DEFAULTS: PredictiveArcOptions = {
  archPeak: 0.35,
  speed: 1,
  spacing: 5,
  dotSize: 6,
  archHeight: 0.7,
  thickness: 1,
  brightness: 1,
};

function createRenderer(
  canvas: HTMLCanvasElement,
  getOptions: () => PredictiveArcOptions & { mode: Mode },
) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;

  let width = 1;
  let height = 1;
  let time = 0;

  const resize = (nextWidth: number, nextHeight: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const render = (advance = true) => {
    const options = getOptions();
    const isLight = options.mode === 'light';

    // Matches --surface-base in index.css, so the masked edges dissolve into the
    // page rather than into a seam.
    context.fillStyle = isLight ? '#ffffff' : '#0a0a0b';
    context.fillRect(0, 0, width, height);
    if (advance) time += 0.015 * options.speed;

    const centerX = width / 2;
    const archPeakY = height * options.archPeak;
    const archWidth = width * 1.5;
    const archHeight = height * options.archHeight;

    // Additive on dark so overlapping dots bloom; plain compositing on light so
    // they do not wash the page out.
    context.globalCompositeOperation = isLight ? 'source-over' : 'lighter';

    for (let x = 0; x < width; x += options.spacing) {
      const normX = (x - centerX) / (archWidth / 2);
      const curveY = archPeakY + normX * normX * archHeight;

      for (let y = 0; y < height; y += options.spacing) {
        const distanceToCurve = Math.abs(y - curveY);
        const thickness = (140 + (1 - Math.abs(normX)) * 80) * options.thickness;
        if (distanceToCurve >= thickness) continue;

        let intensity = 1 - distanceToCurve / thickness;
        const waveX = Math.sin(x * 0.015 + time);
        const waveY = Math.cos(y * 0.02 + time);
        intensity = intensity * 0.7 + waveX * waveY * 0.3 * intensity;
        intensity *= Math.max(0, 1 - Math.pow(Math.abs(normX), 2.5));
        if (intensity <= 0.02) continue;

        let r: number;
        let g: number;
        let b: number;

        if (isLight) {
          // Deep teal ink on white — legible without the additive bloom.
          r = Math.min(255, 12 * intensity + 28 * Math.pow(intensity, 3));
          g = Math.min(255, 45 * intensity + 65 * Math.pow(intensity, 4));
          b = Math.min(255, 70 * intensity + 80 * Math.pow(intensity, 2));
        } else {
          // Ice Signal. Full intensity resolves to exactly #78C6E8.
          r = Math.min(255, 30 * intensity + 90 * Math.pow(intensity, 3));
          g = Math.min(255, 70 * intensity + 128 * Math.pow(intensity, 4));
          b = Math.min(255, 110 * intensity + 122 * Math.pow(intensity, 2));

          // The hottest cores lift toward white, the way a bright signal blows out.
          if (intensity > 0.7) {
            const coreBoost = (intensity - 0.7) * 3.3;
            r = Math.min(255, r + 110 * coreBoost);
            g = Math.min(255, g + 55 * coreBoost);
            b = Math.min(255, b + 20 * coreBoost);
          }
        }

        context.fillStyle = `rgb(${Math.floor(r * options.brightness)}, ${Math.floor(
          g * options.brightness,
        )}, ${Math.floor(b * options.brightness)})`;
        context.fillRect(x, y, options.dotSize * intensity, options.dotSize * intensity);
      }
    }

    context.globalCompositeOperation = 'source-over';
  };

  return { resize, render };
}

export function PredictiveArc({
  className,
  options,
}: {
  className?: string;
  options?: Partial<PredictiveArcOptions>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = createRenderer(canvas, () => ({
      ...PREDICTIVE_ARC_DEFAULTS,
      ...optionsRef.current,
      mode: document.documentElement.classList.contains('light') ? 'light' : 'dark',
    }));
    if (!renderer) return;

    const parent = canvas.parentElement;
    let frame = 0;
    let visible = true;

    const sync = () => {
      const rect = (parent ?? canvas).getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
      renderer.render(false);
    };
    sync();

    const loop = () => {
      if (visible) renderer.render(true);
      frame = requestAnimationFrame(loop);
    };
    if (!reduced) frame = requestAnimationFrame(loop);

    const resizeObserver = new ResizeObserver(sync);
    if (parent) resizeObserver.observe(parent);

    // Stop burning frames once the hero has scrolled away.
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    intersection.observe(canvas);

    // Repaint on theme flip so the ramp follows the toggle.
    const themeObserver = new MutationObserver(() => renderer.render(false));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
