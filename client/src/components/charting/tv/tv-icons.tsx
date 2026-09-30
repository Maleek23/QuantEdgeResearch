/**
 * Toolbar icons for the TradingView-style chart — 18px line glyphs on
 * currentColor so they follow the visual mode. Drawn here (not an icon
 * package) because the drawing-tool glyphs are chart-specific.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false, ...p });

export const IconCursor = (p: P) => <svg {...base(p)}><path d="M9 2v5M9 11v5M2 9h5M11 9h5" /><circle cx="9" cy="9" r="0.6" fill="currentColor" /></svg>;
export const IconTrend = (p: P) => <svg {...base(p)}><path d="M4 14 14 4" /><circle cx="3.5" cy="14.5" r="1.6" /><circle cx="14.5" cy="3.5" r="1.6" /></svg>;
export const IconRay = (p: P) => <svg {...base(p)}><path d="M4 14 16 2" /><circle cx="3.5" cy="14.5" r="1.6" /><circle cx="9.5" cy="8.5" r="1.4" /></svg>;
export const IconHLine = (p: P) => <svg {...base(p)}><path d="M1.5 9h15" /><circle cx="9" cy="9" r="1.6" /></svg>;
export const IconHRay = (p: P) => <svg {...base(p)}><path d="M5 9h11.5" /><circle cx="3.5" cy="9" r="1.6" /></svg>;
export const IconVLine = (p: P) => <svg {...base(p)}><path d="M9 1.5v15" /><circle cx="9" cy="9" r="1.6" /></svg>;
export const IconChannel = (p: P) => <svg {...base(p)}><path d="M2 11 12 3M6 15 16 7" /><circle cx="2.5" cy="10.8" r="1.3" /><circle cx="12" cy="3.2" r="1.3" /></svg>;
export const IconFib = (p: P) => <svg {...base(p)}><path d="M2 3h14M2 7h14M2 11h14M2 15h14" /><path d="M4 15 14 3" strokeDasharray="1.5 2" /></svg>;
export const IconRect = (p: P) => <svg {...base(p)}><rect x="3" y="4.5" width="12" height="9" rx="0.5" /><circle cx="3" cy="4.5" r="1.3" /><circle cx="15" cy="13.5" r="1.3" /></svg>;
export const IconBrush = (p: P) => <svg {...base(p)}><path d="M2.5 14.5c2-.2 3-1.4 3.3-3 .3-1.4 1.6-2 2.7-1.2 1 .8.8 2.4-.4 3.2-1.5 1-3.6 1.2-5.6 1Z" /><path d="m8.8 9.6 6.4-6.4" /></svg>;
export const IconText = (p: P) => <svg {...base(p)}><path d="M3.5 4h11M9 4v11M7 15h4" /></svg>;
export const IconArrow = (p: P) => <svg {...base(p)}><path d="M9 3 4 9h3v6h4V9h3Z" /></svg>;
export const IconMeasure = (p: P) => <svg {...base(p)}><path d="m2 12 10-10 4 4L6 16Z" /><path d="m5 9 1.5 1.5M7.5 6.5 9 8M10 4l1.5 1.5" /></svg>;
export const IconMagnet = (p: P) => <svg {...base(p)}><path d="M4 3v6a5 5 0 0 0 10 0V3h-3.2v6a1.8 1.8 0 0 1-3.6 0V3Z" /><path d="M4 6h3.2M10.8 6H14" /></svg>;
export const IconLock = (p: P) => <svg {...base(p)}><rect x="3.5" y="8" width="11" height="8" rx="1.2" /><path d="M6 8V5.5a3 3 0 0 1 6 0V8" /></svg>;
export const IconUnlock = (p: P) => <svg {...base(p)}><rect x="3.5" y="8" width="11" height="8" rx="1.2" /><path d="M6 8V5.5a3 3 0 0 1 5.8-1" /></svg>;
export const IconEye = (p: P) => <svg {...base(p)}><path d="M1.5 9S4.2 4 9 4s7.5 5 7.5 5-2.7 5-7.5 5S1.5 9 1.5 9Z" /><circle cx="9" cy="9" r="2.2" /></svg>;
export const IconEyeOff = (p: P) => <svg {...base(p)}><path d="M3 3l12 12M7.2 4.3A7 7 0 0 1 9 4c4.8 0 7.5 5 7.5 5a12 12 0 0 1-1.9 2.4M5 5.6C2.8 7 1.5 9 1.5 9S4.2 14 9 14a7 7 0 0 0 3.2-.8" /></svg>;
export const IconTrash = (p: P) => <svg {...base(p)}><path d="M3 5h12M7 5V3.5h4V5M4.5 5l.8 10.5h7.4L13.5 5M7.5 8v5M10.5 8v5" /></svg>;
export const IconZoomIn = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="5" /><path d="m12 12 4 4M6 8h4M8 6v4" /></svg>;
export const IconZoomOut = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="5" /><path d="m12 12 4 4M6 8h4" /></svg>;
export const IconUndo = (p: P) => <svg {...base(p)}><path d="M5 6H11a4 4 0 0 1 0 8H7" /><path d="M7.5 3.5 5 6l2.5 2.5" /></svg>;
export const IconRedo = (p: P) => <svg {...base(p)}><path d="M13 6H7a4 4 0 0 0 0 8h4" /><path d="M10.5 3.5 13 6l-2.5 2.5" /></svg>;
export const IconCamera = (p: P) => <svg {...base(p)}><path d="M2.5 6h3l1.3-2h4.4L12.5 6h3v8.5h-13Z" /><circle cx="9" cy="10" r="2.6" /></svg>;
export const IconFullscreen = (p: P) => <svg {...base(p)}><path d="M2.5 6.5v-4h4M11.5 2.5h4v4M15.5 11.5v4h-4M6.5 15.5h-4v-4" /></svg>;
export const IconSettings = (p: P) => <svg {...base(p)}><circle cx="9" cy="9" r="2.3" /><path d="M9 1.8v2M9 14.2v2M1.8 9h2M14.2 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M3.9 14.1l1.4-1.4M12.7 5.3l1.4-1.4" /></svg>;
export const IconIndicators = (p: P) => <svg {...base(p)}><path d="M2 13.5 6 8l3 3 3.5-6L16 9" /><path d="M2 16h14" /></svg>;
export const IconCandles = (p: P) => <svg {...base(p)}><path d="M5 2.5v2M5 13.5v2M13 4v2M13 12v2.5" /><rect x="3.5" y="4.5" width="3" height="9" rx=".4" /><rect x="11.5" y="6" width="3" height="6" rx=".4" fill="currentColor" /></svg>;
export const IconBars = (p: P) => <svg {...base(p)}><path d="M6 3v12M4 6h2M6 12h2M12 4v10M10 7h2M12 11h2" /></svg>;
export const IconLine = (p: P) => <svg {...base(p)}><path d="M2 13 6.5 8l3 3L16 4" /></svg>;
export const IconArea = (p: P) => <svg {...base(p)}><path d="M2 13 6.5 8l3 3L16 4v11.5H2Z" fill="currentColor" fillOpacity=".18" /><path d="M2 13 6.5 8l3 3L16 4" /></svg>;
export const IconReplay = (p: P) => <svg {...base(p)}><path d="M9 4.5 3 9l6 4.5ZM15.5 4.5 9.5 9l6 4.5Z" /></svg>;
export const IconPanel = (p: P) => <svg {...base(p)}><rect x="2" y="3" width="14" height="12" rx="1" /><path d="M11 3v12" /></svg>;
export const IconPencil = (p: P) => <svg {...base(p)}><path d="m3 15 1-3.6L12.4 3a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L6.6 14Z" /><path d="m11 4.4 2.6 2.6" /></svg>;
export const IconChevron = (p: P) => <svg {...base({ width: 10, height: 10, viewBox: '0 0 10 10', ...p })}><path d="m2.5 3.8 2.5 2.5 2.5-2.5" /></svg>;
export const IconClose = (p: P) => <svg {...base(p)}><path d="m4.5 4.5 9 9M13.5 4.5l-9 9" /></svg>;
export const IconMore = (p: P) => <svg {...base(p)}><circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="14" cy="9" r="1" fill="currentColor" /></svg>;
export const IconFlip = (p: P) => <svg {...base(p)}><path d="M6 3v12M6 3 3.5 5.5M6 3l2.5 2.5M12 15V3M12 15l-2.5-2.5M12 15l2.5-2.5" /></svg>;
