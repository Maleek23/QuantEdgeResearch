/**
 * GENERATE COMPREHENSIVE LEAPS RESEARCH DOCUMENT
 * Focus: Lotto LEAPS + Budget LEAPS ($100-300)
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { writeFile } from 'fs/promises';

async function generateDoc() {
  console.log('\n🎯 Generating Comprehensive LEAPS Research Document...\n');

  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  // 1. Get lotto LEAPS
  const lottoLeaps = await db.execute(sql`
    SELECT *,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside,
      (confidence_score * ((target_price - entry_price) / entry_price * 100)) as quality_score
    FROM trade_ideas
    WHERE source = 'lotto'
      AND asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
    ORDER BY quality_score DESC
    LIMIT 10
  `);

  // 2. Get budget LEAPS
  const budgetLeaps = await db.execute(sql`
    SELECT *,
      EXTRACT(DAY FROM (expiry_date::timestamp - NOW())) as days_to_expiry,
      ((target_price - entry_price) / entry_price * 100) as percent_upside,
      (confidence_score * ((target_price - entry_price) / entry_price * 100)) as quality_score
    FROM trade_ideas
    WHERE asset_type = 'option'
      AND outcome_status = 'open'
      AND expiry_date::timestamp > ${ninetyDays.toISOString()}::timestamp
      AND entry_price >= 1.00
      AND entry_price <= 3.00
      AND confidence_score >= 70
    ORDER BY quality_score DESC
    LIMIT 15
  `);

  console.log(`Found ${lottoLeaps.rows.length} lotto LEAPS`);
  console.log(`Found ${budgetLeaps.rows.length} budget LEAPS`);

  // Get confluences
  const allSymbols = [...new Set([
    ...lottoLeaps.rows.map((l: any) => l.symbol),
    ...budgetLeaps.rows.map((l: any) => l.symbol)
  ])];

  const confluenceData = new Map();
  for (const symbol of allSymbols) {
    const signals = await db.execute(sql`
      SELECT
        COUNT(*) as total_signals,
        COUNT(CASE WHEN source = 'flow' THEN 1 END) as flow_signals,
        COUNT(CASE WHEN source = 'quant' THEN 1 END) as quant_signals,
        AVG(confidence_score) as avg_confidence,
        MAX(confidence_score) as max_confidence
      FROM trade_ideas
      WHERE symbol = ${symbol} AND outcome_status = 'open'
      GROUP BY symbol
    `);
    if (signals.rows.length > 0) confluenceData.set(symbol, signals.rows[0]);
  }

  // Generate markdown
  let md = `# 🎯 COMPREHENSIVE LEAPS RESEARCH REPORT

**Generated:** ${new Date().toLocaleString()}
**Analysis Period:** 90+ days to expiration

---

## 📋 EXECUTIVE SUMMARY

This document analyzes **${lottoLeaps.rows.length} lottery LEAPS** (high risk/high reward) and **${budgetLeaps.rows.length} budget LEAPS** ($100-300 entry) with full confluence analysis.

### ⚠️ CRITICAL DISCLAIMER

**These confidence scores are UNVALIDATED.** The platform has 0 closed LEAPS to verify predictions. All plays are speculative. Never risk more than you can lose.

---

## 🎰 PART 1: TOP 10 LOTTO LEAPS

*Lottery-style plays with massive upside. Risk: 100% loss possible. Position size: 1-2 contracts max.*

`;

  lottoLeaps.rows.forEach((leap: any, idx) => {
    const cost = (leap.entry_price || 0) * 100;
    const target = (leap.target_price || 0) * 100;
    const profit = target - cost;
    const upside = leap.percent_upside?.toFixed(1) || '0';
    const conf = confluenceData.get(leap.symbol);

    md += `### ${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price}

| Metric | Value |
|--------|-------|
| **Entry** | $${cost.toFixed(0)}/contract ($${leap.entry_price.toFixed(2)}/share) |
| **Target** | $${target.toFixed(0)}/contract ($${leap.target_price.toFixed(2)}/share) |
| **Profit** | +$${profit.toFixed(0)} (+${upside}%) |
| **Confidence** | ${leap.confidence_score}% |
| **Expiry** | ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d) |

**Profit Scenarios:**
- 1 contract: $${cost.toFixed(0)} → **+$${profit.toFixed(0)}**
- 2 contracts: $${(cost*2).toFixed(0)} → **+$${(profit*2).toFixed(0)}**
- 5 contracts: $${(cost*5).toFixed(0)} → **+$${(profit*5).toFixed(0)}**

**Confluences:**
${conf ? `- Total Signals: ${conf.total_signals}
- Flow Signals: ${conf.flow_signals} ${conf.flow_signals > 0 ? '✅' : ''}
- Quant Signals: ${conf.quant_signals} ${conf.quant_signals > 0 ? '✅' : ''}
- Avg Confidence: ${conf.avg_confidence?.toFixed(1)}%
- **Conviction:** ${conf.total_signals >= 5 ? '🔥🔥 VERY HIGH' : conf.total_signals >= 3 ? '🔥 HIGH' : 'MODERATE'}` : '- Single signal'}

**Why This Play:**
${leap.confidence_score >= 70
  ? '✅ Higher confidence for lotto (70%+)\n✅ Strong upside justifies risk\n✅ Position: 1-2 contracts (5% of lotto allocation)'
  : '⚠️ Pure speculation (60-69%)\n⚠️ Lottery ticket only\n⚠️ Position: 1 contract max (2% of lotto allocation)'}

**Risk:** ${leap.confidence_score >= 70 ? 'HIGH' : 'VERY HIGH'} | Max Loss: $${cost.toFixed(0)} (100%)

---

`;
  });

  md += `\n## 💎 PART 2: TOP ${budgetLeaps.rows.length} BUDGET LEAPS ($100-300)

*Affordable high-confidence plays. Better for conservative traders.*

`;

  budgetLeaps.rows.forEach((leap: any, idx) => {
    const cost = (leap.entry_price || 0) * 100;
    const target = (leap.target_price || 0) * 100;
    const profit = target - cost;
    const upside = leap.percent_upside?.toFixed(1) || '0';
    const conf = confluenceData.get(leap.symbol);

    md += `### ${idx + 1}. ${leap.symbol} ${leap.option_type?.toUpperCase()} $${leap.strike_price} ${leap.confidence_score >= 85 ? '⭐ TOP TIER' : ''}

| Metric | Value |
|--------|-------|
| **Entry** | $${cost.toFixed(0)}/contract |
| **Target** | $${target.toFixed(0)}/contract |
| **Profit** | +$${profit.toFixed(0)} (+${upside}%) |
| **Confidence** | **${leap.confidence_score}%** ${leap.confidence_score >= 85 ? '🔥' : ''} |
| **Source** | ${leap.source} |
| **Expiry** | ${new Date(leap.expiry_date).toLocaleDateString()} (${leap.days_to_expiry}d) |

**Profit Scenarios:**
- 1: **+$${profit.toFixed(0)}** | 3: **+$${(profit*3).toFixed(0)}** | 5: **+$${(profit*5).toFixed(0)}** | 10: **+$${(profit*10).toFixed(0)}**

**Confluences:**
${conf ? `- **Total Signals:** **${conf.total_signals}** ${conf.total_signals >= 5 ? '🔥' : ''}
- Flow: ${conf.flow_signals} ${conf.flow_signals > 0 ? '✅' : ''}
- Quant: ${conf.quant_signals} ${conf.quant_signals > 0 ? '✅' : ''}
- Avg Conf: ${conf.avg_confidence?.toFixed(1)}%
- **Conviction:** ${conf.total_signals >= 10 ? '🔥🔥🔥 EXTREMELY HIGH' : conf.total_signals >= 5 ? '🔥🔥 VERY HIGH' : conf.total_signals >= 3 ? '🔥 HIGH' : 'MODERATE'}` : '- Single signal'}

**Why This Play:**
${leap.confidence_score >= 85
  ? '✅ HIGHEST TIER (85%+)\n✅ Strong conviction\n✅ Core portfolio position\n✅ **Position:** 3-5 contracts (15-20%)'
  : leap.confidence_score >= 80
  ? '✅ HIGH CONFIDENCE (80%+)\n✅ Good risk/reward\n✅ **Position:** 2-4 contracts (10-15%)'
  : '✅ ABOVE AVERAGE (70%+)\n✅ Moderate conviction\n✅ **Position:** 1-3 contracts (5-10%)'}

**Risk:** ${leap.confidence_score >= 85 ? 'MODERATE' : leap.confidence_score >= 80 ? 'MODERATE-HIGH' : 'HIGH'}

---

`;
  });

  md += `\n## 🔥 PART 3: HIGH CONVICTION CONFLUENCES

*Symbols with multiple independent signals - highest probability.*

`;

  const topConf = Array.from(confluenceData.entries())
    .sort((a, b) => b[1].total_signals - a[1].total_signals)
    .slice(0, 10);

  topConf.forEach(([symbol, data]: [string, any], idx) => {
    md += `### ${idx + 1}. ${symbol} - ${data.total_signals} SIGNALS ${data.total_signals >= 10 ? '🔥🔥🔥' : data.total_signals >= 5 ? '🔥🔥' : '🔥'}

| Metric | Value |
|--------|-------|
| Total Signals | **${data.total_signals}** |
| Flow Signals | ${data.flow_signals} ${data.flow_signals > 0 ? '✅' : ''} |
| Quant Signals | ${data.quant_signals} ${data.quant_signals > 0 ? '✅' : ''} |
| Avg Confidence | ${data.avg_confidence?.toFixed(1)}% |
| Max Confidence | ${data.max_confidence}% |

**Conviction:** ${data.total_signals >= 10 ? '🔥🔥🔥 EXTREMELY HIGH' : data.total_signals >= 5 ? '🔥🔥 VERY HIGH' : '🔥 HIGH'}

**Analysis:** ${data.total_signals >= 10
  ? 'Multiple algorithms strongly agree. One of the highest conviction opportunities. Consider overweighting.'
  : data.total_signals >= 5
  ? 'Strong multi-engine agreement. High probability setup with institutional interest.'
  : 'Multiple signals provide cross-validation. Above-average confidence.'}

---

`;
  });

  md += `\n## 💼 PART 4: PORTFOLIO STRATEGIES

### Conservative ($1,000-2,000)
**Target: 15-25% return**
- **70% Core** ($700-1,400): 3-5 contracts of 85%+ confidence budget LEAPS
- **20% Growth** ($200-400): 1-2 contracts of 75-84% confidence
- **10% Lotto** ($100-200): 1 lotto contract

### Balanced ($2,000-5,000)
**Target: 25-50% return**
- **50% High Conviction** ($1,000-2,500): Multiple contracts of 80%+ with confluences
- **30% Medium Risk** ($600-1,500): 70-79% confidence, diversified
- **20% Lotto** ($400-1,000): 2-3 lotto contracts

### Aggressive ($5,000+)
**Target: 50-200% return**
- **40% Confluences** ($2,000+): Heavy positions in multi-signal symbols
- **30% Medium** ($1,500+): 70-80% with high upside
- **30% Lotto** ($1,500+): 3-5 lotto contracts

---

## ⚠️ CRITICAL RISKS

1. **UNVALIDATED SCORES** - 0 closed positions. Confidence is theoretical.
2. **100% LOSS POSSIBLE** - Options can expire worthless.
3. **POSITION SIZING** - Max 5-10% per position, 1-2% for lotto.
4. **STOP LOSSES** - Set at 20-30% below entry.
5. **TIME DECAY** - Theta accelerates in final 60 days.

---

## 📊 METHODOLOGY

**Sources:** Flow (whale activity), Lotto (high-risk), Quant (algorithms), Confluence (multi-signal)

**Confidence:** Volume (25%) + Premium (20%) + IV (15%) + Breadth (15%) + Skew (15%) + Timing (10%)

**Quality Score:** Confidence × Percent Upside

---

## 🚀 ACTION STEPS

1. ✅ Review all plays
2. ✅ Check live pricing
3. ✅ Verify Greeks (Delta, Theta, Vega)
4. ✅ Set stop losses
5. ✅ Size positions per strategy
6. ✅ Track performance
7. ✅ Exit discipline

---

## 📝 SUMMARY

- **${lottoLeaps.rows.length} Lotto LEAPS** - High risk/reward
- **${budgetLeaps.rows.length} Budget LEAPS** - Affordable $100-300
- **${topConf.length} High-Conviction Plays** - Multi-signal agreement
- **3 Portfolio Strategies** - Conservative to aggressive

**Remember:** High risk. Unvalidated predictions. Never invest more than you can lose.

---

*Report Generated: ${new Date().toLocaleString()}*
*Data: QuantEdge Platform*

**Trade responsibly! 🎯**
`;

  await writeFile('COMPREHENSIVE_LEAPS_RESEARCH.md', md);

  console.log('\n✅ Research document created: COMPREHENSIVE_LEAPS_RESEARCH.md\n');
  console.log(`📊 Included:`);
  console.log(`   - ${lottoLeaps.rows.length} lotto LEAPS`);
  console.log(`   - ${budgetLeaps.rows.length} budget LEAPS`);
  console.log(`   - ${topConf.length} high-conviction confluences\n`);
}

generateDoc().catch(console.error).finally(() => process.exit(0));
