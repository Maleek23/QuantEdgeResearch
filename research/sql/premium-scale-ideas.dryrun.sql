-- DRY RUN — lists trade_ideas whose levels are on the OPTION PREMIUM scale.
-- READ ONLY: one read-only transaction, rolled back. Changes nothing.
-- Do not turn this into an UPDATE without an operator decision on how to
-- void/exclude the rows (see shared/idea-price-scale.ts for the bug chain).
--
--   psql "$DATABASE_URL" -f research/sql/premium-scale-ideas.dryrun.sql
--
-- Bug chain: quant-ideas-generator / auto-idea-generator / ai-service wrote
-- enrichOptionIdea()'s PREMIUM levels into entry/target/stop without
-- entryPremium → storage premium guard republished them as STOCK
-- ("Underlying-only idea …") → tracker compared a $2.40 entry to the share price.
--
-- Flags (any one):
--   A  stock idea converted by the premium guard (signal underlying_only:no_entry_premium)
--      whose entry is < 30% of the underlying range the tracker recorded
--   B  stock idea whose entry is < 30% of the tracker's highest/lowest reached
--      (the tracker fills those from the UNDERLYING quote)
--   C  option idea whose entry/target/stop < 0.30 × strike (OPTION_SCALE_FLOOR)

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';

WITH flagged AS (
  SELECT
    id, timestamp, source, symbol, asset_type, direction, status, outcome_status,
    entry_price, target_price, stop_loss, strike_price, entry_premium,
    highest_price_reached, lowest_price_reached, exit_price, percent_gain, realized_pnl,
    exclude_from_training,
    ('underlying_only:no_entry_premium' = ANY(coalesce(quality_signals, ARRAY[]::text[]))) AS guard_converted,
    CASE
      WHEN asset_type = 'option' AND strike_price > 0
           AND (entry_price < 0.30 * strike_price OR target_price < 0.30 * strike_price OR stop_loss < 0.30 * strike_price)
        THEN 'C_option_levels_premium_scale'
      WHEN asset_type <> 'option'
           AND ('underlying_only:no_entry_premium' = ANY(coalesce(quality_signals, ARRAY[]::text[])))
           AND greatest(coalesce(highest_price_reached, 0), coalesce(lowest_price_reached, 0)) > 0
           AND entry_price < 0.30 * greatest(coalesce(highest_price_reached, 0), coalesce(lowest_price_reached, 0))
        THEN 'A_guard_converted_premium_entry'
      WHEN asset_type <> 'option'
           AND coalesce(lowest_price_reached, 0) > 0
           AND entry_price < 0.30 * lowest_price_reached
        THEN 'B_stock_entry_far_below_underlying'
      WHEN asset_type <> 'option'
           AND ('underlying_only:no_entry_premium' = ANY(coalesce(quality_signals, ARRAY[]::text[])))
           AND entry_price < 0.30 * coalesce(nullif(exit_price, 0), entry_price * 10)
        THEN 'A_guard_converted_premium_entry(exit)'
    END AS flag
  FROM trade_ideas
  WHERE status <> 'draft'
)
SELECT flag, id, timestamp, source, symbol, asset_type, direction, outcome_status,
       entry_price, target_price, stop_loss, strike_price, entry_premium,
       lowest_price_reached, highest_price_reached, exit_price,
       round(percent_gain::numeric, 1) AS percent_gain, realized_pnl, exclude_from_training
FROM flagged
WHERE flag IS NOT NULL
ORDER BY flag, timestamp DESC;

-- Totals by flag / source (what the book would lose if these were voided).
WITH f AS (
  SELECT source, asset_type,
         CASE
           WHEN asset_type = 'option' AND strike_price > 0
                AND (entry_price < 0.30 * strike_price OR target_price < 0.30 * strike_price OR stop_loss < 0.30 * strike_price) THEN 'C'
           WHEN asset_type <> 'option' AND coalesce(lowest_price_reached, 0) > 0 AND entry_price < 0.30 * lowest_price_reached THEN 'B'
           WHEN asset_type <> 'option' AND ('underlying_only:no_entry_premium' = ANY(coalesce(quality_signals, ARRAY[]::text[])))
                AND entry_price < 0.30 * coalesce(nullif(exit_price, 0), entry_price * 10) THEN 'A'
         END AS flag,
         outcome_status, percent_gain
  FROM trade_ideas
  WHERE status <> 'draft'
)
SELECT flag, source, asset_type, count(*) AS n,
       count(*) FILTER (WHERE outcome_status NOT IN ('open')) AS resolved,
       round(sum(CASE WHEN asset_type <> 'option' THEN coalesce(percent_gain, 0) * 10 ELSE 0 END)::numeric, 0) AS stock_book_pnl_at_1000_notional
FROM f
WHERE flag IS NOT NULL
GROUP BY flag, source, asset_type
ORDER BY n DESC;

ROLLBACK;
