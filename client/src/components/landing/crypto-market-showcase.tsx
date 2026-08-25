import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { CryptoAssetRead, type CryptoPulseAsset } from '@/components/crypto/crypto-terminal';

type Pulse = { asOf: string; assets: CryptoPulseAsset[] };

export function CryptoMarketShowcase() {
  const reduce = useReducedMotion();
  const { data } = useQuery<Pulse>({ queryKey: ['/api/crypto/pulse', 'landing'], queryFn: async () => { const response = await fetch('/api/crypto/pulse'); if (!response.ok) throw new Error('crypto pulse unavailable'); return response.json(); }, staleTime: 45_000, refetchInterval: 60_000, retry: 1 });
  const btc = data?.assets.find((row) => row.symbol === 'BTC');
  const eth = data?.assets.find((row) => row.symbol === 'ETH');
  return (
    <section className="border-y border-border/60 bg-[var(--surface-base)] px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-cyan)]">24/7 market transmission</p>
          <h2 className="mt-4 max-w-lg text-4xl font-light leading-[1.04] tracking-[-0.035em] text-foreground md:text-5xl">Watch the underlying move. Then choose the trade.</h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">The exact live BTC and ETH cards used inside QuantEdge—same traces, range, RSI and realized volatility. Move across either chart to inspect its recorded closes.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {btc && <CryptoAssetRead asset={btc} accent="var(--brand-gold)" reduce={reduce} />}
          {eth && <CryptoAssetRead asset={eth} accent="var(--brand-cyan)" reduce={reduce} />}
        </div>
      </div>
    </section>
  );
}
