import 'dotenv/config';
import { PREMIUM_WATCHLIST, USER_CORE_WATCHLIST } from './server/ticker-universe';
function gem(chg:number, price:number, vol:number|null, avg:number|null){let s=0;const c=Math.abs(chg);
 if(c>=5)s+=40;else if(c>=3)s+=30;else if(c>=1)s+=20;else s+=10;
 if(vol&&avg){const r=vol/avg; if(r>=3)s+=30;else if(r>=2)s+=20;else if(r>=1.5)s+=10;}
 if(price>=10)s+=30;else if(price>=5)s+=20;else if(price>=1)s+=10; return s;}
async function main(){
  const curated=Array.from(new Set([...PREMIUM_WATCHLIST,...USER_CORE_WATCHLIST].map(x=>x.toUpperCase())));
  const { getRealtimeBatchQuotes } = await import('./server/realtime-pricing-service');
  const q = await getRealtimeBatchQuotes(curated.map(symbol=>({symbol,assetType:'stock' as const})));
  const rows:any[]=[];
  q.forEach((v,sym)=>{ if(!Number.isFinite(v.price)||v.price<=0)return;
    rows.push({sym, price:v.price, chg:v.changePercent, type:v.price<5?'penny':'stock', score:gem(v.changePercent,v.price,null,null)});});
  const stocks=rows.filter(r=>r.type==='stock').sort((a,b)=>b.score-a.score||Math.abs(b.chg)-Math.abs(a.chg));
  console.log('curated quoted:',rows.length,'stocks:',stocks.length);
  const idx=stocks.findIndex(r=>r.sym==='SMR');
  console.log('SMR rank among curated stocks:', idx+1, '/', stocks.length, JSON.stringify(stocks[idx]));
  console.log('score-60 tier count (ties):', stocks.filter(r=>r.score===60).length, '| score>60:', stocks.filter(r=>r.score>60).length);
  console.log('top20:', stocks.slice(0,20).map(r=>`${r.sym} ${r.chg.toFixed(1)}% $${r.price} sc${r.score}`).join(' | '));
  process.exit(0);
}
main().catch(e=>{console.error('ERR',e);process.exit(1);});
