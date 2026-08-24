/**
 * LEAP GRID — the same 52 picks as the list, rendered on the shared card kit.
 *
 * This exists to prove the templates are actually applicable, not landing-page
 * decoration. Every visual here is imported from components/templates: the card
 * shape, the tone scale, the eyebrow, the key/value strip. Nothing in this file
 * declares a colour.
 *
 * WHY A SECOND VIEW RATHER THAN A REWRITE
 * The existing LeapRow list works and is denser — for scanning 52 names in rank
 * order, a list beats a grid and always will. What the list is bad at is the
 * COMPARE step: once you are down to a handful of candidates, you want to see
 * their contracts side by side, and 52 stacked rows make that a scrolling
 * exercise. So this is a second lens on the same data, not a replacement, and
 * the toggle between them is the reference site's `.hp-switch` / `.hp-variant`
 * pattern doing a real job instead of a decorative one.
 *
 * The one thing the grid adds that the list cannot: `Distribution` renders the
 * three pillars that earned the grade (sector / trend / contract) as comparable
 * bars inside every card, so "why is this an S" is answerable without expanding
 * anything.
 */
import { RecordCard } from '@/components/templates/surfaces';
import { Distribution } from '@/components/templates/charts';
import { KeyValue, KeyValueRow, type Tone } from '@/components/templates/kit';

export interface LeapGridPick {
  symbol: string; name: string; sectorLabel: string;
  grade: 'S' | 'A' | 'B' | 'C'; score: number;
  sectorScore: number; trendScore: number; contractScore: number;
  strike: number; expiry: string; dte: number; delta: number;
  entryPremium: number; roiAtT1Pct: number; openInterest: number;
  ivLabel: 'cheap' | 'fair' | 'rich';
  why: string[];
}

/**
 * Grade → tone. Deliberately NOT a rainbow: S and A are both "buy this", so both
 * read cyan-structural, and the split that matters (is this actionable at all)
 * is carried by B/C dropping to muted. Using four distinct hues would spend the
 * directional colours on a quality axis, which is the mistake the house rules
 * exist to prevent — clay has to keep meaning "short", not "grade C".
 */
const GRADE_TONE: Record<LeapGridPick['grade'], Tone> = {
  S: 'structural', A: 'structural', B: 'time', C: 'muted',
};

/** IV is a cost signal: cheap is good for a buyer, rich is the warning. */
const IV_TONE: Record<LeapGridPick['ivLabel'], Tone> = {
  cheap: 'bull', fair: 'structural', rich: 'bear',
};

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;

export function LeapGrid({ picks }: { picks: LeapGridPick[] }) {
  if (!picks.length) {
    return (
      <p className="py-8 text-center font-mono text-[11px] text-muted-foreground">
        No LEAPS at this grade — loosen the filter.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {picks.map((p) => (
        <RecordCard
          key={p.symbol}
          ticker={p.symbol}
          badge={`${p.grade} · ${p.score}`}
          tone={GRADE_TONE[p.grade]}
          id={`${p.sectorLabel} · ${p.dte}d`}
          title={p.why[0] ?? p.name}
          footLeft={`ROI ${pct(p.roiAtT1Pct)}`}
          footRight={`${p.openInterest.toLocaleString()} OI`}
        >
          {/* The three pillars that produced the grade, to the same scale. */}
          <Distribution
            items={[
              { label: 'Sector', value: p.sectorScore, note: `${p.sectorScore}/30` },
              { label: 'Trend', value: p.trendScore, note: `${p.trendScore}/30` },
              { label: 'Contract', value: p.contractScore, note: `${p.contractScore}/40` },
            ]}
            tone={GRADE_TONE[p.grade]}
          />

          <KeyValueRow className="mt-4">
            <KeyValue k="Strike" v={`${p.strike}`} />
            <KeyValue k="Expiry" v={p.expiry.slice(0, 7)} />
            <KeyValue k="Delta" v={p.delta.toFixed(2)} />
            <KeyValue k="Premium" v={`$${p.entryPremium.toFixed(2)}`} />
            <KeyValue k="IV" v={p.ivLabel} tone={IV_TONE[p.ivLabel]} />
          </KeyValueRow>
        </RecordCard>
      ))}
    </div>
  );
}
