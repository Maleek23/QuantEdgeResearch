import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'tripwire',
  slug: 'reference',
  section: 'reference',
  nav: 'Settings',
  title: 'Tripwire settings reference',
  description: 'Every Tripwire alert type and default, where preferences are stored, and when level-cross alerts are checked.',
  seoTitle: 'Tripwire settings reference | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Defaults' },
    { t: 'table', head: ['Setting', 'Default'], rows: [
      ['New signal · Trigger confirmed · Target hit · Danger zone · Invalidation · NEXUS grade A', 'On'],
      ['Rating moved (±5 points)', 'Off'],
      ['Send to Discord', 'Off'],
      ['Quiet hours (22:00–07:00)', 'Off'],
      ['Alert sounds', 'On'],
    ] },
    { t: 'h2', text: 'Where things live' },
    { t: 'list', items: [
      'Idea-alert preferences and the 30-item feed are stored in this browser.',
      'Level-cross alerts are stored on the server and checked every 3 minutes during regular hours.',
    ] },
  ],
};
export default page;
