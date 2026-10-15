import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'tripwire',
  slug: '',
  section: 'field-guide',
  nav: 'Alerts',
  title: 'Alerts field guide',
  description: 'Alerts on the life of an idea — new, triggered, near the stop, at target — plus level-cross alerts you set on a chart.',
  seoTitle: 'Alerts alerts field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'You cannot watch every setup. Alerts watches the published ideas for you and tells you when one **changes state**, and fires once when price crosses a level you drew.' },
    { t: 'h2', text: 'Idea alerts' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**New signal**', 'Live conviction feed', 'A fresh idea published in the last 2 hours.'],
      ['**Trigger confirmed**', 'Live conviction feed', 'Price entered the entry zone.'],
      ['**Target hit**', 'Live conviction feed', 'Price reached T1.'],
      ['**Danger zone**', 'Live conviction feed', 'Price is approaching the stop.'],
      ['**Invalidation**', 'Live conviction feed', 'The stop was taken out.'],
      ['**Rating moved**', 'Live conviction feed', 'Conviction moved 5 or more points. Off by default.'],
      ['**NEXUS grade A**', 'NEXUS grade', 'The actionability score reached 90+. Not a win probability.'],
    ] },
    { t: 'callout', kind: 'note', md: 'Idea alerts are detected in your browser against the live feed, so they fire while QuantEdge is open. Preferences are saved per device.' },
    { t: 'h2', text: 'Level-cross alerts' },
    { t: 'p', md: 'Set from a ticker page or from a drawing on the chart (sloped lines are tracked as they move). Direction is taken from where price sits when you create it. Checked every 3 minutes, 09:30–16:00 ET on weekdays; each fires once as a Discord message, then shows as triggered.' },
    { t: 'h2', text: 'Delivery' },
    { t: 'list', items: [
      '**Send to Discord** — off by default.',
      '**Quiet hours** — off by default; 22:00–07:00 when on.',
      '**Alert sounds** — on by default.',
      'The feed keeps the last 30 alerts, with clear and undo.',
    ] },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Arm only the types you will act on; the header shows how many are armed out of 7.',
      'An alert is a state change, not an instruction. Open the idea and re-read its stamps before doing anything.',
    ] },
  ],
};
export default page;
