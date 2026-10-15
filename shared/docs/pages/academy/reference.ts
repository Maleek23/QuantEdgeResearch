import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'academy',
  slug: 'reference',
  section: 'reference',
  nav: 'Names map',
  title: 'Product names map',
  description: 'Every QuantEdge product name, what it used to be called, and where it lives in the app.',
  seoTitle: 'Product names map | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'table', head: ['Name', 'Also called', 'Where'], rows: [
      ['NEXUS', 'Trading desk', 'Terminal, first tab'],
      ['Zero', '0DTE desk', 'NEXUS › 0DTE'],
      ['GEX', 'GEX', 'Terminal › GEX'],
      ['Current', 'Flow', 'Terminal › Current'],
      ['Chart', 'Chart', 'Terminal › Chart'],
      ['Expected move', 'Expected move', 'On the Chart chart and Zero cards'],
      ['LEAPS & Swings', 'LEAPS & swings', 'Terminal › LEAPS & Swings'],
      ['Journal', 'Journal', 'Terminal › Journal'],
      ['Alerts', 'Alerts', '`/alerts`'],
      ['Quantinum', 'Ask Quantinum', '`/ask`'],
      ['Quantinum Bot', 'Bot', 'Terminal › Quantinum Bot'],
      ['Academy', 'How to use', '`/how-to` and `/academy`'],
    ] },
  ],
};
export default page;
