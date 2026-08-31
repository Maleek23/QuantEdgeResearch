import { isApprovedTicker } from './shared/approved-tickers';
for (const s of ['URA','URNM','SMH','ARKK','BITQ','OKLO','SMR','UEC']) console.log(s, isApprovedTicker(s));
