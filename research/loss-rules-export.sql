-- Read-only export for research/loss-rules-report.ts (run with psql -At on the server):
--   psql "$DATABASE_URL" -At -f research/loss-rules-export.sql > export.json
with ideas as (
  select id, symbol, asset_type "assetType", direction, entry_price "entryPrice", target_price "targetPrice",
         stop_loss "stopLoss", risk_reward_ratio "riskRewardRatio", option_type "optionType", strike_price "strikePrice",
         expiry_date "expiryDate", entry_premium "entryPremium", exit_premium "exitPremium",
         option_percent_gain "optionPercentGain", exit_price "exitPrice", percent_gain "percentGain",
         outcome_status "outcomeStatus", resolution_reason "resolutionReason", exit_date "exitDate",
         timestamp, source, catalyst, gen_conviction_band "genConvictionBand", holding_period "holdingPeriod",
         gen_scoring_layers "genScoringLayers", convergence_signals_json "convergenceSignalsJson",
         status, exclude_from_training "excludeFromTraining"
  from trade_ideas
  where timestamp >= '2026-08-20'
     or id in (select trade_idea_id from paper_positions where trade_idea_id is not null)
), bot as (
  select pp.id, pp.trade_idea_id "tradeIdeaId", pp.symbol, pp.asset_type "assetType", pp.direction,
         pp.option_type "optionType", pp.expiry_date "expiryDate", pp.entry_time "entryTime", pp.status,
         pp.realized_pnl "realizedPnL", pp.entry_signals "entrySignals"
  from paper_positions pp join paper_portfolios p on p.id = pp.portfolio_id
  where p.user_id = 'system-quant-bot'
)
select json_build_object(
  'ideas', (select coalesce(json_agg(ideas), '[]'::json) from ideas),
  'positions', (select coalesce(json_agg(bot), '[]'::json) from bot)
);
