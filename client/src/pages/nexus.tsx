/**
 * NEXUS — the operator's reference terminal, wired.
 *
 * This is the reference mock USED AS AUTHORED — its stylesheet is embedded
 * verbatim below, its DOM structure is reproduced class-for-class, and its
 * canvas code (background particles, rotation quadrant, card charts, watch
 * sparks) is the mock's own drawing code. Three mechanical transforms only,
 * required to run inside a routed app instead of owning the document:
 *
 *   html,body{...} and body{...}  →  .nexus-root{...}
 *   body::before / body::after    →  .nexus-root::before / ::after
 *   element ids                   →  refs (React owns the DOM)
 *
 * WHAT IS WIRED (the only substantive change): every hardcoded array in the
 * mock is replaced by the real feed that slot describes.
 *
 *   ticker tape        /api/extended-hours          real movers, real session
 *   stream rows        /api/realtime-status         ES/NQ/CL + BTC/ETH with the
 *                                                   socket's OWN ageSeconds —
 *                                                   the ages tick because the
 *                                                   feed is live, not setTimeout
 *   cash rotation      /api/sector-rotation         leaders/laggards
 *   rotation map       /api/sector-rotation         x=rsRatio y=rsMomentum
 *   time & sales       /api/options-flow            real detected flow prints;
 *                                                   side chip is CALL/PUT, not
 *                                                   the mock's coin-flip BUY/SELL
 *                                                   — direction is not measured
 *                                                   and is not claimed (4ce5213)
 *   session brief      /api/sector-rotation         the feed's own headline
 *   signal cards       /api/convictions             the live book
 *   card charts        /api/historical-prices       real 5d closes
 *   heatmap            /api/sector-rotation
 *   watchlist          /api/watchlist + tape quotes
 *   sys status         /api/health, /api/automations/status, /api/market-pulse
 *
 * The mock's price-jitter loop does not run: prices move when the feed moves.
 * Its filter buttons, which only toggled classes, now actually filter.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { usePriceHistory } from '@/components/hunt/cockpit/use-price-history';
import { geometryFor } from '@/components/oracle/signal-detail';
import type { ConvictionPick, ConvictionsResponse } from '@/lib/convictions';

/* ════════════════════════════════════════════════════════════════
   THE MOCK'S STYLESHEET, VERBATIM (body → .nexus-root only).
   ════════════════════════════════════════════════════════════════ */
const NEXUS_CSS = `
.nexus-root, .nexus-root *{margin:0;padding:0;box-sizing:border-box}
.nexus-root{
  --bg:#06070a;
  --bg-2:#0a0c11;
  --panel:rgba(14,17,23,0.72);
  --panel-solid:#0e1117;
  --panel-2:#131720;
  --panel-hi:#1a1f2a;
  --border:rgba(79,209,197,0.08);
  --border-hi:rgba(79,209,197,0.18);
  --border-glow:rgba(79,209,197,0.35);
  --text:#e8ecf3;
  --text-dim:#8b93a3;
  --text-mute:#525a6b;
  --cyan:#4fd1c5;
  --cyan-bright:#6ee7db;
  --cyan-dim:#2a8a82;
  --green:#3ddc97;
  --red:#ff5470;
  --amber:#f5b642;
  --purple:#a78bfa;
  --blue:#60a5fa;
  --pink:#f472b6;
  background:var(--bg);
  color:var(--text);
  font-family:'Inter',system-ui,sans-serif;
  font-size:12.5px;
  height:100vh;
  height:100dvh;
  overflow:hidden;
  letter-spacing:-0.01em;
  display:grid;
  grid-template-rows:44px 28px 1fr 26px;
  grid-template-columns:1fr;
  position:relative;
}
.nexus-root #bgCanvas{
  position:fixed;inset:0;z-index:0;
  pointer-events:none;
  opacity:0.55;
}
.nexus-root::before{
  content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background:
    repeating-linear-gradient(0deg, rgba(79,209,197,0.015) 0px, rgba(79,209,197,0.015) 1px, transparent 1px, transparent 3px);
  mix-blend-mode:overlay;
}
.nexus-root::after{
  content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%);
}
.nexus-root ::-webkit-scrollbar{width:5px;height:5px}
.nexus-root ::-webkit-scrollbar-track{background:transparent}
.nexus-root ::-webkit-scrollbar-thumb{background:var(--border-hi);border-radius:3px}
.nexus-root ::-webkit-scrollbar-thumb:hover{background:var(--cyan-dim)}

/* ============ TOP BAR ============ */
.nexus-root .topbar{
  background:linear-gradient(180deg, rgba(10,12,17,0.95), rgba(10,12,17,0.8));
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;
  padding:0 14px;gap:16px;
  z-index:10;position:relative;
}
.nexus-root .topbar::after{
  content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;
  background:linear-gradient(90deg, transparent, var(--cyan) 20%, var(--blue) 50%, var(--cyan) 80%, transparent);
  opacity:0.4;
}
.nexus-root .brand{
  display:flex;align-items:center;gap:10px;
  font-family:'Space Grotesk',sans-serif;
  font-weight:700;font-size:12.5px;letter-spacing:0.5px;
}
.nexus-root .brand-mark{
  width:24px;height:24px;
  background:conic-gradient(from 0deg, var(--cyan), var(--blue), var(--purple), var(--cyan));
  border-radius:5px;
  position:relative;
  box-shadow:0 0 20px rgba(79,209,197,0.5), inset 0 0 10px rgba(255,255,255,0.2);
  animation:nexus-spin 8s linear infinite;
}
@keyframes nexus-spin{to{transform:rotate(360deg)}}
.nexus-root .brand-mark::after{
  content:'';position:absolute;inset:5px;
  background:var(--bg-2);border-radius:2px;
  box-shadow:inset 0 0 6px rgba(79,209,197,0.3);
}
.nexus-root .brand-name{
  background:linear-gradient(135deg, #fff 0%, var(--cyan-bright) 100%);
  -webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;
}
.nexus-root .brand-slash{color:var(--text-mute);font-weight:400}
.nexus-root .brand-sub{color:var(--text-dim);font-weight:500;font-size:11px}

.nexus-root .status-chip{
  display:flex;align-items:center;gap:6px;
  padding:3px 9px;
  border-radius:4px;
  font-size:10.5px;font-weight:600;
  letter-spacing:0.5px;text-transform:uppercase;
  position:relative;overflow:hidden;
}
.nexus-root .status-chip::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  transform:translateX(-100%);
  animation:nexus-shimmer 3s infinite;
}
@keyframes nexus-shimmer{to{transform:translateX(100%)}}
.nexus-root .status-chip.ok{
  background:rgba(61,220,151,0.08);
  border:1px solid rgba(61,220,151,0.25);
  color:var(--green);
  box-shadow:0 0 12px rgba(61,220,151,0.15);
}
.nexus-root .status-chip.warn{
  background:rgba(245,182,66,0.08);
  border:1px solid rgba(245,182,66,0.25);
  color:var(--amber);
}
.nexus-root .status-chip .dot{
  width:5px;height:5px;border-radius:50%;
  background:currentColor;
  box-shadow:0 0 6px currentColor, 0 0 12px currentColor;
  animation:nexus-pulse 1.8s infinite;
}
@keyframes nexus-pulse{50%{opacity:0.3}}

.nexus-root .nav-tabs{display:flex;gap:2px;margin-left:6px}
.nexus-root .nav-tab{
  padding:6px 12px;
  font-size:11px;font-weight:600;
  letter-spacing:0.8px;
  color:var(--text-dim);
  cursor:pointer;border-radius:4px;
  transition:all 0.2s;
  text-transform:uppercase;
  position:relative;
  background:transparent;border:none;font-family:inherit;
}
.nexus-root .nav-tab:hover{color:var(--text);background:rgba(79,209,197,0.05)}
.nexus-root .nav-tab.active{
  color:var(--cyan-bright);
  background:rgba(79,209,197,0.1);
  text-shadow:0 0 12px rgba(79,209,197,0.6);
}
.nexus-root .nav-tab.active::after{
  content:'';position:absolute;
  bottom:-8px;left:10%;right:10%;height:1.5px;
  background:linear-gradient(90deg, transparent, var(--cyan), transparent);
  box-shadow:0 0 8px var(--cyan);
}

.nexus-root .top-spacer{flex:1}

.nexus-root .search{
  display:flex;align-items:center;gap:8px;
  padding:5px 10px;
  background:rgba(14,17,23,0.6);
  border:1px solid var(--border);
  border-radius:5px;width:240px;
  transition:all 0.2s;
  backdrop-filter:blur(10px);
}
.nexus-root .search:focus-within{
  border-color:var(--cyan-dim);
  box-shadow:0 0 0 2px rgba(79,209,197,0.12), 0 0 20px rgba(79,209,197,0.1);
}
.nexus-root .search svg{color:var(--text-mute);flex-shrink:0}
.nexus-root .search input{
  background:transparent;border:none;outline:none;
  color:var(--text);font-family:inherit;font-size:11.5px;flex:1;
}
.nexus-root .search input::placeholder{color:var(--text-mute)}
.nexus-root .search-kbd{
  font-family:'JetBrains Mono',monospace;font-size:9px;
  color:var(--text-mute);padding:1px 5px;
  background:var(--bg-2);border:1px solid var(--border);
  border-radius:3px;
}

.nexus-root .user-chip{
  display:flex;align-items:center;gap:8px;
  padding:3px 8px 3px 3px;
  background:rgba(14,17,23,0.6);
  border:1px solid var(--border);
  border-radius:5px;cursor:pointer;
  backdrop-filter:blur(10px);
}
.nexus-root .user-avatar{
  width:22px;height:22px;border-radius:4px;
  background:linear-gradient(135deg, var(--purple), var(--pink));
  display:grid;place-items:center;
  font-size:10px;font-weight:700;color:white;
  box-shadow:0 0 10px rgba(167,139,250,0.4);
}
.nexus-root .user-name{font-size:11px;font-weight:500}

/* ============ TICKER TAPE ============ */
.nexus-root .ticker-tape{
  background:linear-gradient(90deg, var(--bg-2), rgba(14,17,23,0.9), var(--bg-2));
  border-bottom:1px solid var(--border);
  overflow:hidden;position:relative;z-index:5;
  display:flex;align-items:center;
}
.nexus-root .ticker-tape::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:60px;
  background:linear-gradient(90deg, var(--bg-2), transparent);z-index:2;pointer-events:none;
}
.nexus-root .ticker-tape::after{
  content:'';position:absolute;right:0;top:0;bottom:0;width:60px;
  background:linear-gradient(270deg, var(--bg-2), transparent);z-index:2;pointer-events:none;
}
.nexus-root .ticker-track{
  display:flex;gap:28px;
  animation:nexus-tickerScroll 60s linear infinite;
  white-space:nowrap;
  padding:0 20px;
}
@keyframes nexus-tickerScroll{
  from{transform:translateX(0)}
  to{transform:translateX(-50%)}
}
@media (prefers-reduced-motion: reduce){
  .nexus-root .ticker-track{animation:none}
}
.nexus-root .ticker-item{
  display:flex;align-items:center;gap:8px;
  font-family:'JetBrains Mono',monospace;font-size:10.5px;
}
.nexus-root .ticker-sym{color:var(--text);font-weight:700;letter-spacing:0.3px}
.nexus-root .ticker-price{color:var(--text-dim)}
.nexus-root .ticker-chg{font-weight:600}
.nexus-root .ticker-chg.up{color:var(--green)}
.nexus-root .ticker-chg.down{color:var(--red)}
.nexus-root .ticker-sep{color:var(--border-hi)}

/* ============ MAIN LAYOUT ============ */
.nexus-root .main{
  display:grid;
  grid-template-columns:320px 1fr 340px;
  overflow:hidden;
  position:relative;z-index:2;
}
.nexus-root .col{
  overflow-y:auto;
  border-right:1px solid var(--border);
  position:relative;
}
.nexus-root .col:last-child{border-right:none}

/* ============ SECTION HEADERS ============ */
.nexus-root .sec-head{
  padding:14px 16px 10px;
  border-bottom:1px solid var(--border);
  position:sticky;top:0;
  background:rgba(6,7,10,0.85);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  z-index:5;
}
.nexus-root .sec-num{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;color:var(--cyan);
  letter-spacing:1.5px;margin-bottom:4px;
  text-shadow:0 0 8px rgba(79,209,197,0.4);
}
.nexus-root .sec-title{
  font-family:'Space Grotesk',sans-serif;
  font-size:16px;font-weight:600;
  letter-spacing:-0.3px;margin-bottom:3px;
  background:linear-gradient(135deg, #fff 0%, var(--cyan-bright) 100%);
  -webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;
}
.nexus-root .sec-sub{font-size:11.5px;color:var(--text-dim);line-height:1.5}
.nexus-root .sec-meta{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.nexus-root .tag{
  display:inline-flex;align-items:center;gap:5px;
  padding:2px 7px;font-size:10px;font-weight:600;
  border-radius:3px;letter-spacing:0.3px;
}
.nexus-root .tag.live{
  background:rgba(61,220,151,0.1);color:var(--green);
  border:1px solid rgba(61,220,151,0.25);
  box-shadow:0 0 8px rgba(61,220,151,0.15);
}
.nexus-root .tag.warn{background:rgba(245,182,66,0.1);color:var(--amber);border:1px solid rgba(245,182,66,0.25)}
.nexus-root .tag.mute{background:var(--panel-solid);color:var(--text-dim);border:1px solid var(--border)}
.nexus-root .tag.cyan{
  background:rgba(79,209,197,0.1);color:var(--cyan-bright);
  border:1px solid rgba(79,209,197,0.3);
  box-shadow:0 0 8px rgba(79,209,197,0.15);
}
.nexus-root .tag .dot{width:4px;height:4px;border-radius:50%;background:currentColor;box-shadow:0 0 4px currentColor}
.nexus-root .sec-action{
  margin-left:auto;font-size:10px;color:var(--text-dim);
  cursor:pointer;padding:3px 8px;
  border:1px solid var(--border);border-radius:3px;
  transition:all 0.2s;background:transparent;font-family:inherit;
}
.nexus-root .sec-action:hover{color:var(--cyan);border-color:var(--cyan-dim);box-shadow:0 0 10px rgba(79,209,197,0.2)}

/* ============ LEFT — MARKET INTEL ============ */
.nexus-root .intel-block{
  padding:14px 16px;
  border-bottom:1px solid var(--border);
  position:relative;
}
.nexus-root .intel-head{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:10px;
}
.nexus-root .intel-label{
  font-size:10px;text-transform:uppercase;
  letter-spacing:1.2px;color:var(--text-mute);
  font-weight:600;
}
.nexus-root .intel-value{
  font-family:'JetBrains Mono',monospace;
  font-size:10.5px;color:var(--text-dim);
}

.nexus-root .pulse-card{
  background:linear-gradient(135deg, rgba(79,209,197,0.04), rgba(96,165,250,0.02));
  border:1px solid var(--border);
  border-radius:8px;padding:12px;
  position:relative;overflow:hidden;
}
.nexus-root .pulse-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg, transparent, var(--cyan), transparent);
  opacity:0.5;
}
.nexus-root .pulse-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.nexus-root .pulse-title{font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px}
.nexus-root .pulse-title .live-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--green);
  box-shadow:0 0 8px var(--green), 0 0 16px var(--green);
  animation:nexus-pulse 1.5s infinite;
}
.nexus-root .pulse-age{font-size:10px;color:var(--text-mute);font-family:'JetBrains Mono',monospace}
.nexus-root .pulse-main{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.nexus-root .pulse-ticker{
  font-family:'Space Grotesk',sans-serif;
  font-size:20px;font-weight:700;letter-spacing:-0.5px;
  background:linear-gradient(135deg, #fff, var(--cyan-bright));
  -webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;
}
.nexus-root .pulse-change{
  font-family:'JetBrains Mono',monospace;
  font-size:12px;font-weight:700;
  padding:2px 8px;border-radius:4px;
}
.nexus-root .pulse-change.down{color:var(--red);background:rgba(255,84,112,0.1);border:1px solid rgba(255,84,112,0.2)}
.nexus-root .pulse-change.up{color:var(--green);background:rgba(61,220,151,0.1);border:1px solid rgba(61,220,151,0.2)}
.nexus-root .pulse-sub{font-size:10.5px;color:var(--text-dim);margin-bottom:12px}

.nexus-root .stream-row{
  display:grid;
  grid-template-columns:38px 1fr auto auto;
  gap:8px;align-items:center;
  padding:6px 0;
  border-top:1px dashed rgba(79,209,197,0.08);
  font-size:11px;
  position:relative;
}
.nexus-root .stream-row:first-of-type{border-top:none}
.nexus-root .stream-row.flash{animation:nexus-rowFlash 0.8s ease}
@keyframes nexus-rowFlash{
  0%{background:rgba(79,209,197,0.15)}
  100%{background:transparent}
}
.nexus-root .stream-sym{
  font-family:'JetBrains Mono',monospace;
  font-weight:700;font-size:11px;color:var(--text);
}
.nexus-root .stream-bar{
  height:4px;background:rgba(79,209,197,0.08);
  border-radius:2px;overflow:hidden;position:relative;
}
.nexus-root .stream-bar-fill{
  position:absolute;top:0;bottom:0;left:0;
  background:linear-gradient(90deg, var(--cyan), var(--blue));
  border-radius:2px;
  box-shadow:0 0 8px rgba(79,209,197,0.5);
  transition:width 0.8s cubic-bezier(.2,.8,.2,1);
}
.nexus-root .stream-price{
  font-family:'JetBrains Mono',monospace;
  font-size:10.5px;font-weight:600;color:var(--text);
  text-align:right;min-width:60px;
}
.nexus-root .stream-price.up{color:var(--green)}
.nexus-root .stream-price.down{color:var(--red)}
.nexus-root .stream-age{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;color:var(--text-mute);
  text-align:right;min-width:22px;
}

.nexus-root .rotation-flow{
  display:flex;align-items:center;gap:10px;
  padding:10px 0;font-size:11px;
}
.nexus-root .rot-side{flex:1}
.nexus-root .rot-label{
  font-size:9px;text-transform:uppercase;
  letter-spacing:1px;color:var(--text-mute);
  margin-bottom:5px;font-weight:600;
}
.nexus-root .rot-item{
  display:flex;justify-content:space-between;
  padding:4px 8px;border-radius:4px;
  font-family:'JetBrains Mono',monospace;font-size:11px;
  margin-bottom:2px;
  transition:all 0.3s;
}
.nexus-root .rot-item:hover{background:rgba(255,255,255,0.03)}
.nexus-root .rot-item .sym{color:var(--text-dim);font-weight:500}
.nexus-root .rot-item .val{font-weight:700}
.nexus-root .rot-item .val.out{color:var(--red);text-shadow:0 0 8px rgba(255,84,112,0.3)}
.nexus-root .rot-item .val.in{color:var(--green);text-shadow:0 0 8px rgba(61,220,151,0.3)}
.nexus-root .rot-arrow{
  color:var(--cyan);font-size:18px;padding:0 6px;
  text-shadow:0 0 12px var(--cyan);
  animation:nexus-arrowPulse 2s infinite;
}
@keyframes nexus-arrowPulse{
  0%,100%{opacity:0.6;transform:translateX(0)}
  50%{opacity:1;transform:translateX(2px)}
}

.nexus-root .quad-wrap{
  background:linear-gradient(135deg, rgba(14,17,23,0.8), rgba(10,12,17,0.9));
  border:1px solid var(--border);
  border-radius:8px;padding:12px;
  margin-top:8px;position:relative;
  overflow:hidden;
}
.nexus-root .quad-wrap::before{
  content:'';position:absolute;inset:0;
  background:
    radial-gradient(circle at 20% 20%, rgba(61,220,151,0.08), transparent 40%),
    radial-gradient(circle at 80% 20%, rgba(79,209,197,0.06), transparent 40%),
    radial-gradient(circle at 20% 80%, rgba(255,84,112,0.06), transparent 40%),
    radial-gradient(circle at 80% 80%, rgba(245,182,66,0.06), transparent 40%);
  pointer-events:none;
}
.nexus-root .quad-canvas-wrap{
  position:relative;aspect-ratio:1.3;
  border-radius:4px;overflow:hidden;
  background:
    linear-gradient(rgba(79,209,197,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(79,209,197,0.04) 1px, transparent 1px);
  background-size:25% 25%;
  background-position:center;
}
.nexus-root .quad-canvas{position:absolute;inset:0;width:100%;height:100%}
.nexus-root .quad-label{
  position:absolute;font-size:8.5px;font-weight:700;
  letter-spacing:1.2px;text-transform:uppercase;
  opacity:0.6;pointer-events:none;
}
.nexus-root .quad-label.tl{top:8px;left:10px;color:var(--green);text-shadow:0 0 8px var(--green)}
.nexus-root .quad-label.tr{top:8px;right:10px;color:var(--cyan);text-shadow:0 0 8px var(--cyan)}
.nexus-root .quad-label.bl{bottom:22px;left:10px;color:var(--amber);text-shadow:0 0 8px var(--amber)}
.nexus-root .quad-label.br{bottom:22px;right:10px;color:var(--red);text-shadow:0 0 8px var(--red)}
.nexus-root .quad-axis{
  position:absolute;
  font-family:'JetBrains Mono',monospace;
  font-size:9px;color:var(--text-mute);
  letter-spacing:1px;text-transform:uppercase;
  pointer-events:none;
}
.nexus-root .quad-axis.x{bottom:4px;left:50%;transform:translateX(-50%)}
.nexus-root .quad-axis.y{top:50%;left:4px;transform:translateY(-50%) rotate(-90deg);transform-origin:left center}
.nexus-root .quad-legend{
  display:flex;gap:10px;margin-top:10px;
  font-size:9.5px;color:var(--text-dim);flex-wrap:wrap;
  position:relative;z-index:2;
}
.nexus-root .quad-legend-item{display:flex;align-items:center;gap:4px}
.nexus-root .quad-legend-dot{width:7px;height:7px;border-radius:50%;box-shadow:0 0 6px currentColor}

.nexus-root .brief-text{
  font-size:11.5px;color:var(--text-dim);
  line-height:1.7;padding:4px 0;
}
.nexus-root .brief-text b{color:var(--text);font-weight:600}
.nexus-root .brief-text .hl{color:var(--cyan-bright);text-shadow:0 0 8px rgba(79,209,197,0.3)}

.nexus-root .tape{
  padding:12px 16px;
  border-bottom:1px solid var(--border);
}
.nexus-root .tape-list{
  max-height:140px;overflow:hidden;
  position:relative;
  mask-image:linear-gradient(180deg, transparent, black 10%, black 90%, transparent);
}
.nexus-root .tape-row{
  display:grid;
  grid-template-columns:50px 1fr auto auto;
  gap:8px;align-items:center;
  padding:4px 0;
  font-family:'JetBrains Mono',monospace;font-size:10.5px;
  border-bottom:1px dashed rgba(79,209,197,0.05);
  animation:nexus-tapeIn 0.4s ease;
}
@keyframes nexus-tapeIn{
  from{opacity:0;transform:translateY(-4px)}
  to{opacity:1;transform:translateY(0)}
}
.nexus-root .tape-time{color:var(--text-mute);font-size:10px}
.nexus-root .tape-sym{font-weight:700;color:var(--text)}
.nexus-root .tape-price{color:var(--text-dim)}
.nexus-root .tape-side{font-weight:700;font-size:9px;padding:1px 5px;border-radius:3px}
.nexus-root .tape-side.buy{color:var(--green);background:rgba(61,220,151,0.1)}
.nexus-root .tape-side.sell{color:var(--red);background:rgba(255,84,112,0.1)}

/* ============ CENTER — ACTIVE BOOK ============ */
.nexus-root .filters{
  padding:10px 16px;
  display:flex;gap:6px;flex-wrap:wrap;
  border-bottom:1px solid var(--border);
  background:rgba(10,12,17,0.6);
  backdrop-filter:blur(10px);
  position:sticky;top:84px;z-index:4;
}
.nexus-root .filter-group{display:flex;align-items:center;gap:4px}
.nexus-root .filter-label{
  font-size:9.5px;color:var(--text-mute);
  text-transform:uppercase;letter-spacing:0.8px;
  margin-right:3px;font-weight:600;
}
.nexus-root .filter-btn{
  padding:3px 8px;font-size:10.5px;
  background:var(--panel-solid);
  border:1px solid var(--border);
  border-radius:3px;color:var(--text-dim);
  cursor:pointer;font-family:inherit;font-weight:500;
  transition:all 0.2s;
}
.nexus-root .filter-btn:hover{color:var(--text);border-color:var(--border-hi)}
.nexus-root .filter-btn.active{
  background:rgba(79,209,197,0.1);
  color:var(--cyan-bright);
  border-color:rgba(79,209,197,0.35);
  box-shadow:0 0 8px rgba(79,209,197,0.15);
}
.nexus-root .filter-sep{width:1px;height:16px;background:var(--border);margin:0 4px}

.nexus-root .stats-bar{
  padding:12px 16px;
  display:grid;grid-template-columns:repeat(5,1fr);
  gap:10px;border-bottom:1px solid var(--border);
  background:var(--bg);
}
.nexus-root .stat-box{
  padding:10px 12px;
  background:linear-gradient(135deg, var(--panel-solid), var(--panel-2));
  border:1px solid var(--border);
  border-radius:6px;
  position:relative;overflow:hidden;
  transition:all 0.3s;
}
.nexus-root .stat-box:hover{border-color:var(--border-hi);transform:translateY(-1px)}
.nexus-root .stat-box::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg, transparent, var(--cyan), transparent);
  opacity:0.3;
}
.nexus-root .stat-label{
  font-size:9px;color:var(--text-mute);
  text-transform:uppercase;letter-spacing:0.8px;
  margin-bottom:4px;font-weight:600;
}
.nexus-root .stat-val{
  font-family:'JetBrains Mono',monospace;
  font-size:16px;font-weight:700;letter-spacing:-0.3px;
}
.nexus-root .stat-val.cyan{color:var(--cyan-bright);text-shadow:0 0 10px rgba(79,209,197,0.4)}
.nexus-root .stat-val.green{color:var(--green);text-shadow:0 0 10px rgba(61,220,151,0.4)}
.nexus-root .stat-val.amber{color:var(--amber);text-shadow:0 0 10px rgba(245,182,66,0.4)}

.nexus-root .view-toggle{
  display:flex;gap:2px;padding:2px;
  background:var(--panel-solid);
  border:1px solid var(--border);
  border-radius:4px;margin-left:auto;
}
.nexus-root .view-btn{
  padding:3px 9px;font-size:10px;
  color:var(--text-dim);cursor:pointer;
  border-radius:3px;font-weight:600;
  letter-spacing:0.5px;text-transform:uppercase;
  transition:all 0.2s;
}
.nexus-root .view-btn.active{
  background:linear-gradient(135deg, rgba(79,209,197,0.15), rgba(96,165,250,0.1));
  color:var(--cyan-bright);
  box-shadow:inset 0 0 0 1px rgba(79,209,197,0.3);
}

.nexus-root .signals{
  padding:12px;
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(320px,1fr));
  gap:10px;
}
.nexus-root .signal{
  background:linear-gradient(135deg, var(--panel-solid), var(--panel-2));
  border:1px solid var(--border);
  border-radius:8px;padding:12px;
  cursor:pointer;transition:all 0.3s;
  position:relative;overflow:hidden;
}
.nexus-root .signal::before{
  content:'';position:absolute;
  left:0;top:0;bottom:0;width:2px;
  background:var(--band-color,var(--cyan));
  box-shadow:0 0 8px var(--band-color,var(--cyan));
  opacity:0.8;
}
.nexus-root .signal::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg, transparent 60%, rgba(79,209,197,0.04));
  pointer-events:none;opacity:0;transition:opacity 0.3s;
}
.nexus-root .signal:hover{
  border-color:var(--border-hi);
  transform:translateY(-2px);
  box-shadow:0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px var(--border-hi);
}
.nexus-root .signal:hover::after{opacity:1}
.nexus-root .signal.expanded{
  grid-column:1/-1;
  border-color:var(--cyan-dim);
  box-shadow:0 0 20px rgba(79,209,197,0.15);
}

.nexus-root .sig-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.nexus-root .sig-ticker{
  font-family:'Space Grotesk',sans-serif;
  font-size:16px;font-weight:700;letter-spacing:-0.3px;
}
.nexus-root .sig-band{
  font-family:'JetBrains Mono',monospace;
  font-size:9px;font-weight:700;
  padding:2px 6px;border-radius:3px;letter-spacing:0.5px;
}
.nexus-root .band-S{background:rgba(61,220,151,0.15);color:var(--green);border:1px solid rgba(61,220,151,0.35);box-shadow:0 0 8px rgba(61,220,151,0.2)}
.nexus-root .band-A{background:rgba(79,209,197,0.15);color:var(--cyan-bright);border:1px solid rgba(79,209,197,0.35);box-shadow:0 0 8px rgba(79,209,197,0.2)}
.nexus-root .band-B{background:rgba(245,182,66,0.12);color:var(--amber);border:1px solid rgba(245,182,66,0.3)}
.nexus-root .band-C{background:rgba(138,143,152,0.1);color:var(--text-dim);border:1px solid var(--border)}
.nexus-root .sig-ev{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;color:var(--text-dim);
  margin-left:auto;display:flex;align-items:center;gap:6px;
}
.nexus-root .sig-ev b{color:var(--cyan-bright);font-weight:700;font-size:12px;text-shadow:0 0 6px rgba(79,209,197,0.4)}
.nexus-root .ev-bar{
  width:40px;height:3px;background:rgba(79,209,197,0.1);
  border-radius:2px;overflow:hidden;
}
.nexus-root .ev-bar-fill{
  height:100%;
  background:linear-gradient(90deg, var(--cyan), var(--blue));
  box-shadow:0 0 6px var(--cyan);
  transition:width 0.8s;
}

.nexus-root .sig-type{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:10.5px}
.nexus-root .sig-dir{font-weight:700;letter-spacing:0.5px;font-size:10px}
.nexus-root .sig-dir.bull{color:var(--green);text-shadow:0 0 6px rgba(61,220,151,0.3)}
.nexus-root .sig-dir.bear{color:var(--red);text-shadow:0 0 6px rgba(255,84,112,0.3)}
.nexus-root .sig-kind{color:var(--text-dim);font-size:10px}
.nexus-root .sig-pattern{color:var(--text-mute);font-size:10px;margin-left:auto;font-style:italic}

.nexus-root .sig-chart{
  height:36px;margin:6px 0 8px;
  position:relative;
  border-radius:4px;
  background:rgba(0,0,0,0.2);
  overflow:hidden;
}
.nexus-root .sig-chart canvas{width:100%;height:100%;display:block}

.nexus-root .sig-status{
  display:flex;align-items:center;gap:8px;
  padding:6px 8px;
  background:rgba(0,0,0,0.3);
  border-radius:4px;margin-bottom:8px;
  font-size:10px;
  border:1px solid rgba(79,209,197,0.05);
}
.nexus-root .sig-status-pill{
  padding:2px 7px;border-radius:3px;
  font-weight:700;font-size:9px;letter-spacing:0.8px;
  background:rgba(79,209,197,0.12);color:var(--cyan-bright);
  border:1px solid rgba(79,209,197,0.25);
  box-shadow:0 0 6px rgba(79,209,197,0.2);
}
.nexus-root .sig-status-pill.pending{
  background:rgba(245,182,66,0.12);color:var(--amber);
  border-color:rgba(245,182,66,0.25);
  box-shadow:0 0 6px rgba(245,182,66,0.2);
}

.nexus-root .progress-wrap{margin:8px 0}
.nexus-root .progress-label{
  display:flex;justify-content:space-between;
  font-size:9.5px;color:var(--text-mute);
  margin-bottom:4px;font-family:'JetBrains Mono',monospace;
  text-transform:uppercase;letter-spacing:0.5px;
}
.nexus-root .progress-label b{color:var(--text);font-weight:600}
.nexus-root .progress-bar{
  height:4px;background:rgba(79,209,197,0.08);
  border-radius:2px;overflow:hidden;position:relative;
}
.nexus-root .progress-fill{
  height:100%;border-radius:2px;
  background:linear-gradient(90deg, var(--cyan), var(--green));
  box-shadow:0 0 8px rgba(79,209,197,0.5);
  position:relative;transition:width 1s cubic-bezier(.2,.8,.2,1);
}
.nexus-root .progress-fill::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation:nexus-progressShine 2s infinite;
}
@keyframes nexus-progressShine{
  0%{transform:translateX(-100%)}
  100%{transform:translateX(100%)}
}

.nexus-root .sig-ev-list{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px}
.nexus-root .ev-chip{
  display:inline-flex;align-items:center;gap:3px;
  padding:2px 6px;
  background:rgba(0,0,0,0.3);
  border:1px solid var(--border);
  border-radius:3px;
  font-family:'JetBrains Mono',monospace;
  font-size:9.5px;color:var(--text-dim);
  transition:all 0.2s;
}
.nexus-root .ev-chip:hover{border-color:var(--border-hi)}
.nexus-root .ev-chip .v{font-weight:700}
.nexus-root .ev-chip.pos .v{color:var(--green);text-shadow:0 0 4px rgba(61,220,151,0.3)}
.nexus-root .ev-chip.neg .v{color:var(--red);text-shadow:0 0 4px rgba(255,84,112,0.3)}
.nexus-root .ev-note{
  font-size:10px;color:var(--text-mute);
  font-style:italic;margin-bottom:8px;
}

.nexus-root .sig-levels{
  display:grid;grid-template-columns:repeat(5,1fr);
  gap:6px;padding-top:8px;
  border-top:1px dashed rgba(79,209,197,0.1);
}
.nexus-root .level{display:flex;flex-direction:column}
.nexus-root .level-label{
  font-size:8.5px;color:var(--text-mute);
  text-transform:uppercase;letter-spacing:0.8px;
  margin-bottom:2px;font-weight:600;
}
.nexus-root .level-val{
  font-family:'JetBrains Mono',monospace;
  font-size:11px;font-weight:600;color:var(--text);
}
.nexus-root .level-val.entry{color:var(--text)}
.nexus-root .level-val.stop{color:var(--red)}
.nexus-root .level-val.t1{color:var(--green);text-shadow:0 0 6px rgba(61,220,151,0.3)}
.nexus-root .level-val.rr{color:var(--cyan-bright);text-shadow:0 0 6px rgba(79,209,197,0.3)}
.nexus-root .level-val.pnl.pos{color:var(--green);text-shadow:0 0 6px rgba(61,220,151,0.3)}
.nexus-root .level-val.pnl.neg{color:var(--red);text-shadow:0 0 6px rgba(255,84,112,0.3)}

.nexus-root .sig-foot{
  display:flex;justify-content:space-between;align-items:center;
  margin-top:8px;font-size:9.5px;
  color:var(--text-mute);
  font-family:'JetBrains Mono',monospace;
}

/* ============ RIGHT — DEVELOPING ============ */
.nexus-root .dev-empty{
  padding:30px 20px;text-align:center;
  position:relative;
}
.nexus-root .dev-icon{
  width:56px;height:56px;margin:0 auto 14px;
  border:1px dashed var(--border-hi);
  border-radius:50%;
  display:grid;place-items:center;
  color:var(--text-mute);
  position:relative;
  animation:nexus-scanPulse 3s infinite;
}
@keyframes nexus-scanPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(79,209,197,0.3)}
  50%{box-shadow:0 0 0 12px rgba(79,209,197,0)}
}
.nexus-root .dev-icon::before{
  content:'';position:absolute;inset:-4px;
  border:1px solid var(--cyan);
  border-radius:50%;opacity:0.2;
  animation:nexus-ringPulse 2s infinite;
}
@keyframes nexus-ringPulse{
  0%{transform:scale(1);opacity:0.3}
  100%{transform:scale(1.3);opacity:0}
}
.nexus-root .dev-title{
  font-family:'Space Grotesk',sans-serif;
  font-size:13px;font-weight:600;
  margin-bottom:6px;color:var(--text);
}
.nexus-root .dev-desc{
  font-size:11px;color:var(--text-dim);
  line-height:1.5;margin-bottom:14px;
}
.nexus-root .dev-state{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 10px;
  background:rgba(245,182,66,0.08);
  border:1px solid rgba(245,182,66,0.2);
  border-radius:4px;font-size:10px;
  color:var(--amber);
  font-family:'JetBrains Mono',monospace;
}
.nexus-root .dev-state .dot{
  width:5px;height:5px;border-radius:50%;
  background:var(--amber);
  box-shadow:0 0 6px var(--amber);
  animation:nexus-pulse 1.5s infinite;
}

.nexus-root .heatmap-section{padding:12px 16px;border-top:1px solid var(--border)}
.nexus-root .heatmap{
  display:grid;
  grid-template-columns:repeat(5,1fr);
  gap:3px;margin-top:8px;
}
.nexus-root .heat-cell{
  aspect-ratio:1.4;
  border-radius:3px;
  display:grid;place-items:center;
  font-family:'JetBrains Mono',monospace;
  font-size:9px;font-weight:700;
  cursor:pointer;transition:all 0.2s;
  position:relative;overflow:hidden;
  border:none;
}
.nexus-root .heat-cell:hover{transform:scale(1.05);z-index:2}
.nexus-root .heat-cell .chg{
  position:absolute;bottom:2px;right:3px;
  font-size:7.5px;opacity:0.8;
}

.nexus-root .watch-section{padding:14px 16px;border-top:1px solid var(--border)}
.nexus-root .watch-head{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:10px;
}
.nexus-root .watch-title{
  font-size:10px;text-transform:uppercase;
  letter-spacing:1.2px;color:var(--text-mute);
  font-weight:600;
}
.nexus-root .watch-count{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;color:var(--text-dim);
}
.nexus-root .watch-item{
  display:grid;
  grid-template-columns:44px 1fr 50px auto;
  gap:8px;align-items:center;
  padding:6px 8px;border-radius:4px;
  cursor:pointer;transition:all 0.2s;
  border:1px solid transparent;
}
.nexus-root .watch-item:hover{
  background:rgba(79,209,197,0.04);
  border-color:var(--border);
}
.nexus-root .watch-sym{
  font-family:'JetBrains Mono',monospace;
  font-size:11px;font-weight:700;color:var(--text);
}
.nexus-root .watch-name{
  font-size:10.5px;color:var(--text-dim);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.nexus-root .watch-spark{width:50px;height:20px}
.nexus-root .watch-chg{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;font-weight:700;text-align:right;
  min-width:42px;
}
.nexus-root .watch-chg.up{color:var(--green);text-shadow:0 0 6px rgba(61,220,151,0.3)}
.nexus-root .watch-chg.down{color:var(--red);text-shadow:0 0 6px rgba(255,84,112,0.3)}

.nexus-root .sys-status{
  padding:12px 16px;
  border-top:1px solid var(--border);
  background:linear-gradient(180deg, rgba(14,17,23,0.4), transparent);
}
.nexus-root .sys-row{
  display:flex;justify-content:space-between;
  padding:4px 0;font-size:10.5px;
}
.nexus-root .sys-row .k{
  color:var(--text-mute);
  font-family:'JetBrains Mono',monospace;
  text-transform:uppercase;letter-spacing:0.5px;
}
.nexus-root .sys-row .v{
  color:var(--text);
  font-family:'JetBrains Mono',monospace;font-weight:600;
}
.nexus-root .sys-row .v.ok{color:var(--green);text-shadow:0 0 6px rgba(61,220,151,0.3)}
.nexus-root .sys-row .v.warn{color:var(--amber);text-shadow:0 0 6px rgba(245,182,66,0.3)}

.nexus-root .disclaimer{
  padding:10px 16px;font-size:9.5px;
  color:var(--text-mute);text-align:center;
  font-style:italic;border-top:1px solid var(--border);
  line-height:1.5;
}

/* ============ BOTTOM BAR ============ */
.nexus-root .bottombar{
  background:linear-gradient(180deg, rgba(10,12,17,0.9), rgba(10,12,17,0.95));
  backdrop-filter:blur(16px);
  border-top:1px solid var(--border);
  display:flex;align-items:center;
  padding:0 14px;gap:14px;
  font-family:'JetBrains Mono',monospace;font-size:10px;
  color:var(--text-dim);z-index:10;position:relative;
}
.nexus-root .bottombar::before{
  content:'';position:absolute;top:-1px;left:0;right:0;height:1px;
  background:linear-gradient(90deg, transparent, var(--cyan) 30%, var(--blue) 70%, transparent);
  opacity:0.3;
}
.nexus-root .bb-item{display:flex;align-items:center;gap:6px}
.nexus-root .bb-item .dot{
  width:4px;height:4px;border-radius:50%;
  background:var(--green);
  box-shadow:0 0 6px var(--green);
  animation:nexus-pulse 2s infinite;
}
.nexus-root .bb-item .dot.amber{background:var(--amber);box-shadow:0 0 6px var(--amber)}
.nexus-root .bb-sep{width:1px;height:12px;background:var(--border)}
.nexus-root .bb-spacer{flex:1}
.nexus-root .bb-item b{color:var(--text);font-weight:600}
.nexus-root .bb-item .hl{color:var(--cyan-bright);text-shadow:0 0 6px rgba(79,209,197,0.3)}

@media(max-width:1300px){
  .nexus-root .main{grid-template-columns:280px 1fr 300px}
}
@media(max-width:1100px){
  .nexus-root .main{grid-template-columns:260px 1fr}
  .nexus-root .col-right{display:none}
}
`;

/* ════════════════════════════════════════════════════════════════
   DATA — the real feeds behind each slot.
   ════════════════════════════════════════════════════════════════ */

interface EHQuote { symbol: string; lastPrice: number; changePct: number }
interface EHPayload {
  session?: string; isStale?: boolean;
  gainers?: EHQuote[]; losers?: EHQuote[]; mostActive?: EHQuote[]; assetClasses?: EHQuote[];
}
interface Sector {
  etf: string; name: string; change: number; rsRatio: number; rsMomentum: number; state?: string;
}
interface RotationPayload {
  asOf?: string; sessionLabel?: string; spyChange?: number; headline?: string;
  leaders?: Sector[]; laggards?: Sector[]; sectors?: Sector[];
}
interface RealtimePayload {
  prices?: {
    futures?: Record<string, { price: number; ageSeconds: number }>;
    crypto?: Record<string, { price: number; ageSeconds: number }>;
  };
}
interface FlowTrade {
  id: string; symbol: string; optionType: 'call' | 'put'; strikePrice: number;
  totalPremium: number; flowType?: string; detectedAt: string;
}

const q = (path: string) => async () => {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} failed`);
  return r.json();
};

function useNexusData() {
  const realtime = useQuery<RealtimePayload>({
    queryKey: ['/api/realtime-status', 'nexus'], queryFn: q('/api/realtime-status'),
    refetchInterval: 5_000, staleTime: 4_000, retry: 1,
  });
  const rotation = useQuery<RotationPayload>({
    queryKey: ['/api/sector-rotation', 'nexus'], queryFn: q('/api/sector-rotation'),
    refetchInterval: 180_000, staleTime: 120_000, retry: 1,
  });
  const extended = useQuery<EHPayload>({
    queryKey: ['/api/extended-hours', 'nexus'], queryFn: q('/api/extended-hours'),
    refetchInterval: 120_000, staleTime: 60_000, retry: 1,
  });
  const convictions = useQuery<ConvictionsResponse>({
    queryKey: ['/api/convictions', 'nexus'], queryFn: q('/api/convictions?limit=24&minScore=0'),
    refetchInterval: 120_000, staleTime: 60_000, retry: 1,
  });
  const flow = useQuery<{ trades: FlowTrade[] }>({
    queryKey: ['/api/options-flow', 'nexus'], queryFn: q('/api/options-flow?limit=12'),
    refetchInterval: 120_000, staleTime: 60_000, retry: 1,
  });
  const watchlist = useQuery<{ symbol: string }[]>({
    queryKey: ['/api/watchlist'], refetchInterval: 120_000, retry: 1,
  });
  const pulse = useQuery<{ macro?: { vix?: number } }>({
    queryKey: ['market-pulse'], queryFn: q('/api/market-pulse'),
    refetchInterval: 120_000, staleTime: 60_000, retry: 1,
  });
  const health = useQuery<{ dataPartial?: boolean }>({
    queryKey: ['/api/health', 'terminal-chrome'], queryFn: q('/api/health'),
    refetchInterval: 120_000, staleTime: 60_000, retry: 1,
  });
  return { realtime, rotation, extended, convictions, flow, watchlist, pulse, health };
}

/* ════════════════════════════════════════════════════════════════
   THE MOCK'S DRAWING CODE (verbatim logic, refs instead of ids).
   ════════════════════════════════════════════════════════════════ */

/** Background particles + flow lines — the mock's drawBg, unchanged. */
function useBgCanvas(ref: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const bgCanvas = ref.current;
    if (!bgCanvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return;
    let bgW = 0; let bgH = 0; let raf = 0;
    function resizeBg() {
      bgW = bgCanvas!.width = innerWidth * devicePixelRatio;
      bgH = bgCanvas!.height = innerHeight * devicePixelRatio;
      bgCanvas!.style.width = innerWidth + 'px';
      bgCanvas!.style.height = innerHeight + 'px';
    }
    resizeBg();
    const onResize = () => { bgCtx!.setTransform(1, 0, 0, 1, 0, 0); resizeBg(); };
    window.addEventListener('resize', onResize);

    const particles: { x: number; y: number; vx: number; vy: number; r: number; hue: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * innerWidth, y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5, hue: 170 + Math.random() * 40,
      });
    }
    const flowLines: { y: number; amp: number; freq: number; phase: number; opacity: number }[] = [];
    for (let i = 0; i < 8; i++) {
      flowLines.push({
        y: Math.random() * innerHeight, amp: 20 + Math.random() * 40,
        freq: 0.002 + Math.random() * 0.003, phase: Math.random() * Math.PI * 2,
        opacity: 0.03 + Math.random() * 0.05,
      });
    }
    function drawBg(t: number) {
      bgCtx!.setTransform(1, 0, 0, 1, 0, 0);
      bgCtx!.clearRect(0, 0, bgW, bgH);
      bgCtx!.scale(devicePixelRatio, devicePixelRatio);
      flowLines.forEach((fl) => {
        bgCtx!.strokeStyle = `rgba(79, 209, 197, ${fl.opacity})`;
        bgCtx!.lineWidth = 1;
        bgCtx!.beginPath();
        for (let x = 0; x < innerWidth; x += 4) {
          const y = fl.y + Math.sin(x * fl.freq + t * 0.0005 + fl.phase) * fl.amp;
          if (x === 0) bgCtx!.moveTo(x, y); else bgCtx!.lineTo(x, y);
        }
        bgCtx!.stroke();
      });
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = innerWidth; if (p.x > innerWidth) p.x = 0;
        if (p.y < 0) p.y = innerHeight; if (p.y > innerHeight) p.y = 0;
        bgCtx!.fillStyle = `hsla(${p.hue}, 80%, 65%, 0.6)`;
        bgCtx!.beginPath(); bgCtx!.arc(p.x, p.y, p.r, 0, Math.PI * 2); bgCtx!.fill();
        bgCtx!.fillStyle = `hsla(${p.hue}, 80%, 65%, 0.1)`;
        bgCtx!.beginPath(); bgCtx!.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); bgCtx!.fill();
      });
      bgCtx!.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            bgCtx!.strokeStyle = `rgba(79, 209, 197, ${(1 - d / 120) * 0.15})`;
            bgCtx!.beginPath();
            bgCtx!.moveTo(particles[i].x, particles[i].y);
            bgCtx!.lineTo(particles[j].x, particles[j].y);
            bgCtx!.stroke();
          }
        }
      }
      raf = requestAnimationFrame(drawBg);
    }
    raf = requestAnimationFrame(drawBg);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [ref]);
}

const QUAD_COLOR: Record<string, string> = {
  leading: '#3ddc97', improving: '#4fd1c5', weakening: '#f5b642', lagging: '#ff5470',
};

/** The feed's rsRatio/rsMomentum → the mock's 0–100 x/y + quadrant colour. */
function quadPointsFrom(sectors: Sector[]) {
  const vals = sectors.flatMap((s) => [Math.abs(s.rsRatio), Math.abs(s.rsMomentum)]).filter(Number.isFinite);
  const span = Math.max(1e-6, ...vals);
  return sectors.map((s) => {
    const x = 50 + (s.rsRatio / span) * 45;
    const y = 50 + (s.rsMomentum / span) * 45;
    const quad = s.rsRatio >= 0
      ? (s.rsMomentum >= 0 ? 'leading' : 'weakening')
      : (s.rsMomentum >= 0 ? 'improving' : 'lagging');
    return { sym: s.etf, x, y, color: QUAD_COLOR[quad], phase: 0, trail: [] as { x: number; y: number }[] };
  }).map((p, i) => ({ ...p, phase: (i * Math.PI * 2) / Math.max(1, sectors.length) }));
}

/** Rotation quadrant — the mock's drawQuad verbatim, fed real sector positions. */
function useQuadCanvas(ref: React.RefObject<HTMLCanvasElement>, sectors: Sector[]) {
  const pointsRef = useRef<ReturnType<typeof quadPointsFrom>>([]);
  useEffect(() => { pointsRef.current = quadPointsFrom(sectors); }, [sectors]);
  useEffect(() => {
    const quadCanvas = ref.current;
    if (!quadCanvas) return;
    const quadCtx = quadCanvas.getContext('2d');
    if (!quadCtx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    function resizeQuad() {
      const rect = quadCanvas!.getBoundingClientRect();
      quadCanvas!.width = rect.width * devicePixelRatio;
      quadCanvas!.height = rect.height * devicePixelRatio;
    }
    resizeQuad();
    window.addEventListener('resize', resizeQuad);
    function drawQuad(t: number) {
      const rect = quadCanvas!.getBoundingClientRect();
      const w = rect.width; const h = rect.height;
      quadCtx!.setTransform(1, 0, 0, 1, 0, 0);
      quadCtx!.clearRect(0, 0, quadCanvas!.width, quadCanvas!.height);
      quadCtx!.scale(devicePixelRatio, devicePixelRatio);
      quadCtx!.strokeStyle = 'rgba(79, 209, 197, 0.15)';
      quadCtx!.lineWidth = 1;
      quadCtx!.setLineDash([4, 4]);
      quadCtx!.beginPath();
      quadCtx!.moveTo(w / 2, 0); quadCtx!.lineTo(w / 2, h);
      quadCtx!.moveTo(0, h / 2); quadCtx!.lineTo(w, h / 2);
      quadCtx!.stroke();
      quadCtx!.setLineDash([]);
      pointsRef.current.forEach((s) => {
        const drift = still ? 0 : Math.sin(t * 0.0005 + s.phase) * 1.5;
        const px = (s.x / 100) * w + drift;
        const py = (1 - s.y / 100) * h + (still ? 0 : Math.cos(t * 0.0007 + s.phase) * 1.5);
        s.trail.push({ x: px, y: py });
        if (s.trail.length > 12) s.trail.shift();
        const r = parseInt(s.color.slice(1, 3), 16);
        const g = parseInt(s.color.slice(3, 5), 16);
        const b = parseInt(s.color.slice(5, 7), 16);
        s.trail.forEach((tp, i) => {
          const alpha = (i / s.trail.length) * 0.3;
          quadCtx!.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          quadCtx!.beginPath();
          quadCtx!.arc(tp.x, tp.y, (i / s.trail.length) * 3, 0, Math.PI * 2);
          quadCtx!.fill();
        });
        const glowR = 14 + (still ? 0 : Math.sin(t * 0.003 + s.phase) * 2);
        const grad = quadCtx!.createRadialGradient(px, py, 0, px, py, glowR);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        quadCtx!.fillStyle = grad;
        quadCtx!.beginPath(); quadCtx!.arc(px, py, glowR, 0, Math.PI * 2); quadCtx!.fill();
        quadCtx!.fillStyle = s.color;
        quadCtx!.beginPath(); quadCtx!.arc(px, py, 4, 0, Math.PI * 2); quadCtx!.fill();
        quadCtx!.strokeStyle = `rgba(${r},${g},${b},0.6)`;
        quadCtx!.lineWidth = 1;
        quadCtx!.beginPath();
        quadCtx!.arc(px, py, 7 + (still ? 0 : Math.sin(t * 0.004 + s.phase) * 1), 0, Math.PI * 2);
        quadCtx!.stroke();
        quadCtx!.fillStyle = '#fff';
        quadCtx!.font = '700 8.5px "JetBrains Mono", monospace';
        quadCtx!.textAlign = 'center';
        quadCtx!.fillText(s.sym, px, py - 12);
      });
      raf = requestAnimationFrame(drawQuad);
    }
    raf = requestAnimationFrame(drawQuad);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resizeQuad); };
  }, [ref]);
}

/** The mock's drawSignalChart, verbatim — fed real closes instead of a walk. */
function drawSignalChart(canvas: HTMLCanvasElement, data: number[], dir: 'bull' | 'bear') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = devicePixelRatio;
  const w = canvas.clientWidth; const h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const min = Math.min(...data); const max = Math.max(...data);
  const range = max - min || 1;
  const color = dir === 'bull' ? '#3ddc97' : '#ff5470';
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  data.forEach((p, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((p - min) / range) * h * 0.85 - h * 0.05;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  data.forEach((p, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((p - min) / range) * h * 0.85 - h * 0.05;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 1.3;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.stroke(); ctx.shadowBlur = 0;
  const lastY = h - ((data[data.length - 1] - min) / range) * h * 0.85 - h * 0.05;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(w - 1, lastY, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color + '60';
  ctx.beginPath(); ctx.arc(w - 1, lastY, 5, 0, Math.PI * 2); ctx.fill();
}

/** Mini chart cell: mock canvas + real 5d closes. Empty history → empty box. */
function SigChart({ symbol, dir }: { symbol: string; dir: 'bull' | 'bear' }) {
  const { points } = usePriceHistory(symbol, '5d', '1h');
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && points.length >= 2) drawSignalChart(ref.current, points.map((p) => p.close), dir);
  }, [points, dir]);
  return (
    <div className="sig-chart">
      {points.length >= 2
        ? <canvas ref={ref} />
        : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 9, color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>NO PRICE HISTORY</div>}
    </div>
  );
}

/** Watchlist spark: the mock's drawSpark shape, real closes. */
function WatchSpark({ symbol, up }: { symbol: string; up: boolean }) {
  const { points } = usePriceHistory(symbol, '5d', '1d');
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && points.length >= 2) drawSignalChart(ref.current, points.map((p) => p.close), up ? 'bull' : 'bear');
  }, [points, up]);
  return <canvas ref={ref} className="watch-spark" />;
}

/* ════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════ */

const NAV_TABS = [
  { label: 'Nexus', href: '/nexus' },
  { label: 'Oracle', href: '/t?tab=oracle' },
  { label: 'Chart', href: '/t?tab=chart' },
  { label: 'Flow', href: '/t?tab=flow' },
  { label: 'GEX', href: '/t?tab=gex' },
  { label: 'Leaps', href: '/t?tab=leaps' },
  { label: 'Crypto', href: '/t?tab=crypto' },
  { label: 'Catalyst', href: '/t?tab=catalyst' },
  { label: 'Bot', href: '/t?tab=bot' },
];

const STREAM_ORDER = [
  { sym: 'ES', kind: 'futures' as const },
  { sym: 'NQ', kind: 'futures' as const },
  { sym: 'CL', kind: 'futures' as const },
  { sym: 'BTC', kind: 'crypto' as const },
  { sym: 'ETH', kind: 'crypto' as const },
];

function sessionWord(s?: string) {
  return s === 'pre' ? 'pre-market' : s === 'post' ? 'after hours' : s === 'regular' ? 'live session' : 'last close';
}
const fmtPrice = (n: number, money = false) =>
  money ? '$' + Math.round(n).toLocaleString()
    : n >= 1000 ? n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : n.toFixed(2);

export default function NexusPage() {
  const [, setLocation] = useLocation();
  const { realtime, rotation, extended, convictions, flow, watchlist, pulse, health } = useNexusData();

  useEffect(() => { document.title = 'QUANTEDGE // NEXUS'; }, []);

  /* clock + uptime — the mock's tick, verbatim behaviour (uptime = page age) */
  const [now, setNow] = useState(() => Date.now());
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = new Date(now).toTimeString().slice(0, 8);
  const upSec = Math.floor((now - mountedAt.current) / 1000);
  const uptime = `${pad(Math.floor(upSec / 3600))}:${pad(Math.floor((upSec % 3600) / 60))}:${pad(upSec % 60)}`;

  /* canvases */
  const bgRef = useRef<HTMLCanvasElement>(null);
  const quadRef = useRef<HTMLCanvasElement>(null);
  useBgCanvas(bgRef);
  useQuadCanvas(quadRef, rotation.data?.sectors ?? []);

  /* stream rows — real prices; flash only when a price actually changed */
  const fut = realtime.data?.prices?.futures ?? {};
  const cry = realtime.data?.prices?.crypto ?? {};
  const prevPrices = useRef<Record<string, number>>({});
  const streamRows = STREAM_ORDER.map(({ sym, kind }) => {
    const src = kind === 'futures' ? fut[sym] : cry[sym];
    const prev = prevPrices.current[sym];
    const flash = src != null && prev != null && src.price !== prev;
    const dirUp = src != null && prev != null ? src.price >= prev : undefined;
    return { sym, kind, price: src?.price, age: src?.ageSeconds, flash, dirUp };
  });
  useEffect(() => {
    for (const { sym, kind } of STREAM_ORDER) {
      const src = kind === 'futures' ? fut[sym] : cry[sym];
      if (src) prevPrices.current[sym] = src.price;
    }
  });
  const freshCount = streamRows.filter((r) => r.age != null && r.age <= 60).length;

  /* tape — real movers, deduped, both fields present */
  const tapeQuotes = useMemo(() => {
    const seen = new Set<string>(); const out: EHQuote[] = [];
    for (const list of [extended.data?.gainers, extended.data?.losers, extended.data?.mostActive]) {
      for (const t of list ?? []) {
        if (seen.has(t.symbol) || !Number.isFinite(t.lastPrice) || !Number.isFinite(t.changePct)) continue;
        seen.add(t.symbol); out.push(t);
      }
    }
    return out;
  }, [extended.data]);

  /* signals — the live book through the mock's filter bar, which now filters */
  const [side, setSide] = useState<'all' | 'long' | 'short'>('all');
  const [band, setBand] = useState<'all' | 'S' | 'A' | 'B' | 'C'>('all');
  const [sort, setSort] = useState<'conviction' | 'rr' | 'newest'>('conviction');
  const [expanded, setExpanded] = useState<string | null>(null);
  const picks = convictions.data?.picks ?? [];
  const bandOf = (p: ConvictionPick) => (p.convictionBand || 'C').charAt(0).toUpperCase();
  const bandCounts = useMemo(() => {
    const c: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };
    picks.forEach((p) => { c[bandOf(p)] = (c[bandOf(p)] ?? 0) + 1; });
    return c;
  }, [picks]);
  const shown = useMemo(() => {
    let out = picks.filter((p) =>
      (side === 'all' || p.direction === side) &&
      (band === 'all' || bandOf(p) === band));
    out = [...out].sort((a, b) =>
      sort === 'conviction' ? (b.convictionScore ?? 0) - (a.convictionScore ?? 0)
        : sort === 'rr' ? (b.riskRewardRatio ?? 0) - (a.riskRewardRatio ?? 0)
          : String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? '')));
    return out;
  }, [picks, side, band, sort]);
  const longs = picks.filter((p) => p.direction === 'long').length;
  const shorts = picks.length - longs;
  const scores = picks.map((p) => p.convictionScore ?? 0);
  const avgEv = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const topEv = scores.length ? Math.max(...scores) : null;

  /* heat colour — the mock's heatColor, verbatim */
  function heatColor(v: number) {
    const intensity = Math.min(Math.abs(v) / 6, 1);
    if (v >= 0) {
      const r = Math.round(20 + intensity * 40);
      const g = Math.round(40 + intensity * 180);
      const b = Math.round(40 + intensity * 100);
      return `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.5})`;
    }
    const r = Math.round(40 + intensity * 200);
    const g = Math.round(30 + intensity * 40);
    const b = Math.round(40 + intensity * 60);
    return `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.5})`;
  }

  const sectors = rotation.data?.sectors ?? [];
  const leaders = (rotation.data?.leaders ?? sectors.filter((s) => s.change > 0).slice(0, 2)).slice(0, 2);
  const laggards = (rotation.data?.laggards ?? [...sectors].reverse().filter((s) => s.change < 0).slice(0, 2)).slice(0, 2);
  const spyChange = rotation.data?.spyChange;
  const dataPartial = health.data?.dataPartial ?? true;
  const vix = pulse.data?.macro?.vix;
  const watchSyms = (watchlist.data ?? []).slice(0, 10);
  const quoteBySym = useMemo(() => {
    const m = new Map<string, EHQuote>();
    for (const list of [extended.data?.gainers, extended.data?.losers, extended.data?.mostActive]) {
      for (const t of list ?? []) if (!m.has(t.symbol) && Number.isFinite(t.changePct)) m.set(t.symbol, t);
    }
    return m;
  }, [extended.data]);
  const runningBots = 0; /* automations/status shape varies; sys row reads watch/vix/feed */
  const es = fut['ES'];
  const btc = cry['BTC'];

  const bandColorOf = (b: string) =>
    b === 'S' ? '#3ddc97' : b === 'A' ? '#4fd1c5' : b === 'B' ? '#f5b642' : '#8b93a3';

  return (
    <div className="nexus-root">
      <style dangerouslySetInnerHTML={{ __html: NEXUS_CSS }} />
      <canvas id="bgCanvas" ref={bgRef} />

      {/* ============ TOP BAR ============ */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <span className="brand-name">QUANTEDGE</span>
          <span className="brand-slash">{'//'}</span>
          <span className="brand-sub">NEXUS</span>
        </div>
        <div className="status-chip ok"><span className="dot" />Engaged</div>
        {dataPartial && <div className="status-chip warn"><span className="dot" />Data partial</div>}

        <div className="nav-tabs">
          {NAV_TABS.map((t) => (
            <button
              key={t.label}
              className={`nav-tab${t.label === 'Nexus' ? ' active' : ''}`}
              onClick={() => { if (t.label !== 'Nexus') setLocation(t.href); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="top-spacer" />

        <button className="user-chip" onClick={() => setLocation('/t')} title="Back to the terminal">
          <div className="user-avatar">Q</div>
          <span className="user-name">terminal</span>
        </button>
      </div>

      {/* ============ TICKER TAPE ============ */}
      <div className="ticker-tape">
        <div className="ticker-track">
          {[...tapeQuotes, ...tapeQuotes].map((t, i) => (
            <div className="ticker-item" key={`${t.symbol}-${i}`}>
              <span className="ticker-sym">{t.symbol.replace('-USD', '')}</span>
              <span className="ticker-price">{fmtPrice(t.lastPrice)}</span>
              <span className={`ticker-chg ${t.changePct >= 0 ? 'up' : 'down'}`}>
                {t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(2)}%
              </span>
              <span className="ticker-sep">·</span>
            </div>
          ))}
          {!tapeQuotes.length && (
            <div className="ticker-item"><span className="ticker-price">quote tape · no data</span></div>
          )}
        </div>
      </div>

      {/* ============ MAIN ============ */}
      <div className="main">
        {/* LEFT — MARKET INTEL */}
        <div className="col col-left">
          <div className="sec-head">
            <div className="sec-num">01 · MARKET INTELLIGENCE</div>
            <div className="sec-sub">Read the tape before the trade. Participation, relative rotation and leadership — one connected market view.</div>
          </div>

          <div className="intel-block">
            <div className="intel-head">
              <div className="intel-label">Market Pulse</div>
              <div className="intel-value">{rotation.data?.sessionLabel ?? '—'}</div>
            </div>
            <div className="pulse-card">
              <div className="pulse-top">
                <div className="pulse-title">
                  {freshCount > 0 && <span className="live-dot" />}
                  {freshCount > 0 ? 'LIVE · streams' : 'STREAMS'}
                </div>
                <div className="pulse-age">{freshCount}/{STREAM_ORDER.length} fresh</div>
              </div>
              <div className="pulse-main">
                <div className="pulse-ticker">SPY</div>
                {spyChange != null ? (
                  <div className={`pulse-change ${spyChange >= 0 ? 'up' : 'down'}`}>
                    {spyChange >= 0 ? '+' : ''}{spyChange.toFixed(1)}%
                  </div>
                ) : (
                  <div className="pulse-change" style={{ color: 'var(--text-mute)' }}>—</div>
                )}
                <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-mute)' }}>
                  CASH · {sessionWord(extended.data?.session)}
                </div>
              </div>
              <div className="pulse-sub">{freshCount}/{STREAM_ORDER.length} fresh · futures &amp; crypto stream</div>

              {streamRows.map((r) => (
                <div className={`stream-row${r.flash ? ' flash' : ''}`} key={`${r.sym}-${r.price ?? 'x'}`}>
                  <div className="stream-sym">{r.sym}</div>
                  <div className="stream-bar">
                    {/* Bar = freshness: full at 0s, empty at 60s+. The mock's bars
                        were random widths; this one means something. */}
                    <div className="stream-bar-fill" style={{ width: r.age != null ? `${Math.max(4, 100 - Math.min(60, r.age) * (100 / 60))}%` : '0%' }} />
                  </div>
                  <div className={`stream-price${r.dirUp === true ? ' up' : r.dirUp === false ? ' down' : ''}`}>
                    {r.price != null ? fmtPrice(r.price, r.kind === 'crypto') : '—'}
                  </div>
                  <div className="stream-age">{r.age != null ? `${r.age}s` : '—'}</div>
                </div>
              ))}
            </div>

            <div className="intel-head" style={{ marginTop: 14 }}>
              <div className="intel-label">Cash rotation</div>
            </div>
            <div className="rotation-flow">
              <div className="rot-side">
                <div className="rot-label">Out of</div>
                {laggards.map((s) => (
                  <div className="rot-item" key={s.etf}>
                    <span className="sym">{s.name}</span>
                    <span className="val out">{s.change.toFixed(1)}%</span>
                  </div>
                ))}
                {!laggards.length && <div className="rot-item"><span className="sym">—</span></div>}
              </div>
              <div className="rot-arrow">→</div>
              <div className="rot-side">
                <div className="rot-label">Into</div>
                {leaders.map((s) => (
                  <div className="rot-item" key={s.etf}>
                    <span className="sym">{s.name}</span>
                    <span className="val in">+{s.change.toFixed(1)}%</span>
                  </div>
                ))}
                {!leaders.length && <div className="rot-item"><span className="sym">—</span></div>}
              </div>
            </div>
          </div>

          {/* Rotation Map */}
          <div className="intel-block">
            <div className="intel-head">
              <div className="intel-label">Rotation Map</div>
              <div className="intel-value">{rotation.data?.sessionLabel ?? '—'}</div>
            </div>
            <div className="quad-wrap">
              <div className="quad-canvas-wrap">
                <canvas className="quad-canvas" ref={quadRef} />
                <div className="quad-label tl">Leading</div>
                <div className="quad-label tr">Improving</div>
                <div className="quad-label bl">Weakening</div>
                <div className="quad-label br">Lagging</div>
                <div className="quad-axis x">x · rel strength →</div>
                <div className="quad-axis y">y · building →</div>
              </div>
              <div className="quad-legend">
                <div className="quad-legend-item"><div className="quad-legend-dot" style={{ background: 'var(--green)', color: 'var(--green)' }} />Leading</div>
                <div className="quad-legend-item"><div className="quad-legend-dot" style={{ background: 'var(--cyan)', color: 'var(--cyan)' }} />Improving</div>
                <div className="quad-legend-item"><div className="quad-legend-dot" style={{ background: 'var(--amber)', color: 'var(--amber)' }} />Weakening</div>
                <div className="quad-legend-item"><div className="quad-legend-dot" style={{ background: 'var(--red)', color: 'var(--red)' }} />Lagging</div>
              </div>
            </div>
          </div>

          {/* Flow prints — the mock's Time & Sales slot, wired to the real flow
              feed. Side chip is CALL/PUT because that is measured; buyer vs
              seller is not, and is not claimed. */}
          <div className="tape">
            <div className="intel-head">
              <div className="intel-label">Flow Prints</div>
              <div className="intel-value">15-min delayed</div>
            </div>
            <div className="tape-list">
              {(flow.data?.trades ?? []).slice(0, 10).map((t) => (
                <div className="tape-row" key={t.id}>
                  <span className="tape-time">{new Date(t.detectedAt).toTimeString().slice(0, 8)}</span>
                  <span className="tape-sym">{t.symbol}</span>
                  <span className="tape-price">${t.strikePrice} × ${Math.round(t.totalPremium / 1000)}k</span>
                  <span className={`tape-side ${t.optionType === 'call' ? 'buy' : 'sell'}`}>{t.optionType.toUpperCase()}</span>
                </div>
              ))}
              {!(flow.data?.trades ?? []).length && (
                <div className="tape-row"><span className="tape-time">—</span><span className="tape-sym" style={{ color: 'var(--text-mute)' }}>no prints yet</span></div>
              )}
            </div>
          </div>

          {/* Session Brief — the rotation feed's own headline, not invented prose */}
          <div className="intel-block">
            <div className="intel-head">
              <div className="intel-label">Session Brief</div>
              <div className="intel-value">from the rotation feed</div>
            </div>
            <div className="brief-text">
              {rotation.data?.headline
                ? <span>{rotation.data.headline}</span>
                : <span style={{ color: 'var(--text-mute)' }}>No session read yet.</span>}
            </div>
          </div>
        </div>

        {/* CENTER — ACTIVE BOOK */}
        <div className="col col-center">
          <div className="sec-head">
            <div className="sec-num">02 · ACTIVE BOOK</div>
            <div className="sec-title">Ranked opportunities.</div>
            <div className="sec-sub">Select a ticker to connect price, evidence, levels and execution.</div>
            <div className="sec-meta">
              <span className="tag cyan">ranked book</span>
              <span className="tag mute">· {picks.length}</span>
              <button className="sec-action" onClick={() => setLocation('/t?tab=oracle')}>↗ Open in Oracle</button>
            </div>
          </div>

          <div className="stats-bar">
            <div className="stat-box">
              <div className="stat-label">Active Signals</div>
              <div className="stat-val cyan">{picks.length}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Avg Evidence</div>
              <div className="stat-val">{avgEv ?? '—'}<span style={{ color: 'var(--text-mute)', fontSize: 10 }}>/100</span></div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Top Evidence</div>
              <div className="stat-val green">{topEv ?? '—'}<span style={{ color: 'var(--text-mute)', fontSize: 10 }}>/100</span></div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Long / Short</div>
              <div className="stat-val">
                <span style={{ color: 'var(--green)' }}>{longs}</span>
                <span style={{ color: 'var(--text-mute)' }}> / </span>
                <span style={{ color: 'var(--red)' }}>{shorts}</span>
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Session</div>
              <div className="stat-val amber">{sessionWord(extended.data?.session).toUpperCase()}</div>
            </div>
          </div>

          <div className="filters">
            <div className="filter-group">
              <span className="filter-label">Side</span>
              {(['all', 'long', 'short'] as const).map((s) => (
                <button key={s} className={`filter-btn${side === s ? ' active' : ''}`} onClick={() => setSide(s)}>
                  {s === 'all' ? 'All' : s === 'long' ? 'Long' : 'Short'}
                </button>
              ))}
            </div>
            <div className="filter-sep" />
            <div className="filter-group">
              <span className="filter-label">Band</span>
              <button className={`filter-btn${band === 'all' ? ' active' : ''}`} onClick={() => setBand('all')}>All · {picks.length}</button>
              {(['S', 'A', 'B', 'C'] as const).map((b) => (
                <button key={b} className={`filter-btn${band === b ? ' active' : ''}`} onClick={() => setBand(b)}>
                  {b} · {bandCounts[b] ?? 0}
                </button>
              ))}
            </div>
            <div className="filter-sep" />
            <div className="filter-group">
              <span className="filter-label">Sort</span>
              {([['conviction', 'Conviction'], ['rr', 'R:R'], ['newest', 'Newest']] as const).map(([v, l]) => (
                <button key={v} className={`filter-btn${sort === v ? ' active' : ''}`} onClick={() => setSort(v)}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: '8px 16px 0', fontSize: 10, color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>
            {shown.length} of {picks.length} shown
          </div>

          <div className="signals">
            {shown.map((p) => {
              const b = bandOf(p);
              const px = p.currentPrice ?? p.entryPrice;
              const g = geometryFor(p, px);
              const pending = /pending|trigger/i.test(g.statusLabel ?? '');
              const against = (p.layers ?? []).filter((l) => l.points < 0);
              const chips = (p.layers ?? [])
                .filter((l) => l.points !== 0)
                .sort((a2, b2) => Math.abs(b2.points) - Math.abs(a2.points))
                .slice(0, 4);
              const dir = p.direction === 'long' ? 'bull' : 'bear';
              return (
                <div
                  className={`signal${expanded === p.ideaId ? ' expanded' : ''}`}
                  style={{ ['--band-color' as string]: bandColorOf(b) }}
                  key={p.ideaId}
                  onClick={() => setExpanded(expanded === p.ideaId ? null : p.ideaId)}
                >
                  <div className="sig-head">
                    <div className="sig-ticker">{p.symbol}</div>
                    <div className={`sig-band band-${b}`}>{b}</div>
                    <div className="sig-ev">
                      <span>+<b>{p.convictionScore}</b> evidence</span>
                      <div className="ev-bar"><div className="ev-bar-fill" style={{ width: `${Math.min(100, ((p.convictionScore ?? 0) / 70) * 100)}%` }} /></div>
                    </div>
                  </div>
                  <div className="sig-type">
                    <span className={`sig-dir ${dir}`}>{dir === 'bull' ? '▲ BULL' : '▼ BEAR'}</span>
                    <span className="sig-kind">· {p.holdingPeriod}</span>
                    <span className="sig-pattern">{p.thesis?.split('.')[0] ?? ''}</span>
                  </div>
                  <SigChart symbol={p.symbol} dir={dir} />
                  <div className="sig-status">
                    <span className={`sig-status-pill${pending ? ' pending' : ''}`}>{g.statusLabel}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {p.optionDte != null || p.expiryDate
                        ? `${g.horizonUsedPct.toFixed(0)}% of ${g.horizonDays}d used`
                        : 'timing pending contract'}
                    </span>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-label">
                      <span>Progress to T1</span>
                      <b>{g.progressPct.toFixed(0)}%</b>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, g.progressPct))}%` }} />
                    </div>
                  </div>
                  <div className="sig-ev-list">
                    {chips.map((l, i) => (
                      <div className={`ev-chip ${l.points >= 0 ? 'pos' : 'neg'}`} key={`${l.kind}-${i}`}>
                        {l.kind.slice(0, 3).toUpperCase()} <span className="v">{l.points > 0 ? '+' : ''}{l.points}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ev-note">
                    {against.length ? `${against.length} layer${against.length > 1 ? 's' : ''} arguing against` : 'nothing arguing against'}
                  </div>
                  <div className="sig-levels">
                    <div className="level"><div className="level-label">Entry</div><div className="level-val entry">${p.entryPrice?.toFixed(2) ?? '—'}</div></div>
                    <div className="level"><div className="level-label">Stop</div><div className="level-val stop">${p.stopLoss?.toFixed(2) ?? '—'}</div></div>
                    <div className="level"><div className="level-label">T1</div><div className="level-val t1">${p.targetPrice?.toFixed(2) ?? '—'}</div></div>
                    <div className="level"><div className="level-label">R:R</div><div className="level-val rr">{p.riskRewardRatio ? `${p.riskRewardRatio.toFixed(1)}:1` : '—'}</div></div>
                    <div className="level"><div className="level-label">P&amp;L</div><div className={`level-val pnl ${g.pnlPct >= 0 ? 'pos' : 'neg'}`}>{g.pnlPct >= 0 ? '+' : ''}{g.pnlPct.toFixed(1)}%</div></div>
                  </div>
                  <div className="sig-foot">
                    <span>{p.optionDte != null ? `${p.optionDte}d` : 'no contract'}</span>
                    <span>{p.sector ?? ''}</span>
                  </div>
                </div>
              );
            })}
            {!shown.length && (
              <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '32px 0', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)' }}>
                {convictions.isLoading ? 'loading the book…' : 'Nothing matches these filters.'}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT — DEVELOPING */}
        <div className="col col-right">
          <div className="sec-head">
            <div className="sec-num">03 · DEVELOPING</div>
            <div className="sec-title">Setups before the trigger.</div>
            <div className="sec-sub">Coiled names inside groups already receiving money.</div>
            <div className="sec-meta"><span className="tag mute">watch · not signals</span></div>
          </div>

          <div className="dev-empty">
            <div className="dev-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </div>
            <div className="dev-title">Candidate field</div>
            <div className="dev-desc">Screening for names coiling inside leading groups. A signal will surface here when evidence crosses threshold.</div>
            <div className="dev-state"><span className="dot" />screening…</div>
          </div>

          <div className="heatmap-section">
            <div className="intel-head">
              <div className="intel-label">Sector Heatmap</div>
              <div className="intel-value">{rotation.data?.sessionLabel ?? '1D % chg'}</div>
            </div>
            <div className="heatmap">
              {sectors.map((s) => (
                <button
                  className="heat-cell"
                  key={s.etf}
                  title={`${s.name} · ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%`}
                  style={{ background: heatColor(s.change), color: Math.abs(s.change) > 2 ? '#fff' : 'rgba(255,255,255,0.85)' }}
                >
                  {s.etf}
                  <span className="chg">{s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>

          <div className="watch-section">
            <div className="watch-head">
              <div className="watch-title">Watchlist</div>
              <div className="watch-count">{watchSyms.length ? `${watchSyms.length} names` : ''}</div>
            </div>
            <div>
              {watchSyms.map(({ symbol }) => {
                const wq = quoteBySym.get(symbol);
                const up = wq != null && wq.changePct >= 0;
                return (
                  <div className="watch-item" key={symbol}>
                    <div className="watch-sym">{symbol}</div>
                    <div className="watch-name" />
                    <WatchSpark symbol={symbol} up={wq ? up : true} />
                    {wq
                      ? <div className={`watch-chg ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{wq.changePct.toFixed(1)}%</div>
                      : <div className="watch-chg" style={{ color: 'var(--text-mute)' }}>—</div>}
                  </div>
                );
              })}
              {!watchSyms.length && (
                <div style={{ fontSize: 11, color: 'var(--text-mute)', padding: '4px 0' }}>
                  No names on the watchlist yet.
                </div>
              )}
            </div>
          </div>

          <div className="sys-status">
            <div className="sys-row"><span className="k">Online</span><span className="v ok">● connected</span></div>
            <div className="sys-row"><span className="k">Uptime</span><span className="v">{uptime}</span></div>
            <div className="sys-row"><span className="k">Watchlist</span><span className="v">{watchlist.data?.length ?? '—'}</span></div>
            <div className="sys-row"><span className="k">VIX</span><span className={`v${vix != null && vix >= 20 ? ' warn' : ''}`}>{vix != null ? vix.toFixed(1) : '—'}</span></div>
            <div className="sys-row"><span className="k">Feed</span><span className="v" style={{ color: dataPartial ? 'var(--amber)' : 'var(--green)' }}>{dataPartial ? 'partial' : 'connected'}</span></div>
          </div>

          <div className="disclaimer">
            Educational only · not investment advice.<br />
            Past setups do not guarantee future results.
          </div>
        </div>
      </div>

      {/* ============ BOTTOM BAR ============ */}
      <div className="bottombar">
        <div className="bb-item"><span className="dot" /><b>NEXUS</b> engaged</div>
        <div className="bb-sep" />
        <div className="bb-item">Feed <span className="hl">{dataPartial ? 'partial' : 'connected'}</span></div>
        <div className="bb-sep" />
        <div className="bb-item">Session <b>{sessionWord(extended.data?.session)}</b></div>
        {es && (<><div className="bb-sep" /><div className="bb-item">ES <span className="hl">{fmtPrice(es.price)}</span></div></>)}
        {vix != null && (<><div className="bb-sep" /><div className="bb-item">VIX <span style={{ color: 'var(--amber)' }}>{vix.toFixed(1)}</span></div></>)}
        {btc && (<><div className="bb-sep" /><div className="bb-item">BTC <span className="hl">{fmtPrice(btc.price, true)}</span></div></>)}
        <div className="bb-spacer" />
        <div className="bb-item"><span className="dot amber" />stream age <b>{es ? `${es.ageSeconds}s` : '—'}</b></div>
        <div className="bb-sep" />
        <div className="bb-item">{clock}</div>
      </div>
    </div>
  );
}
