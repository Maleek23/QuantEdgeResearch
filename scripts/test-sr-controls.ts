import assert from 'node:assert/strict';
import { convictionBandForScore } from '../shared/conviction-bands';
import { buildMonotoneCalibration, interpolateCalibration } from '../shared/isotonic-calibration';
import { executeLongSignals } from '../server/backtest-execution-engine';
import { classifyGradeCohort } from '../shared/grade-provenance';

assert.deepEqual([12, 13, 18, 19, 24, 25].map(convictionBandForScore), ['C', 'B', 'B', 'A', 'A', 'S']);
const born = '2026-09-25T14:00:00.000Z';
assert.equal(classifyGradeCohort({ timestamp: born }), 'replay');
assert.equal(classifyGradeCohort({ timestamp: born, genConvictionScore: 25, genConvictionBand: 'S' }), 'legacy-stored');
assert.equal(classifyGradeCohort({ timestamp: born, genConvictionScore: 25, genConvictionBand: 'S', generationTimestamp: '2026-09-26T14:00:00.000Z', engineVersion: 'abc123' }), 'certified');
assert.equal(classifyGradeCohort({ timestamp: born, genConvictionScore: 25, genConvictionBand: 'S', generationTimestamp: '2026-09-26T14:00:01.000Z', engineVersion: 'abc123' }), 'legacy-stored');

const curve = buildMonotoneCalibration([
  { score: 20, winRate: 70, sampleSize: 10 },
  { score: 50, winRate: 40, sampleSize: 10 },
  { score: 100, winRate: 80, sampleSize: 10 },
]);
for (let score = 21; score <= 100; score += 1) {
  assert(interpolateCalibration(curve, score) >= interpolateCalibration(curve, score - 1), 'calibration must be monotone');
}

const bars = [
  { date: 'd1', open: 100, high: 101, low: 99, close: 101 },
  { date: 'd2', open: 102, high: 104, low: 101, close: 103 },
  { date: 'd3', open: 103, high: 110, low: 90, close: 104 },
];
const trades = executeLongSignals(bars, [true, false, false], [false, false, false], {
  initialCapital: 10_000,
  positionSizePercent: 100,
  stopLossPercent: 5,
  takeProfitPercent: 5,
  slippageBps: 5,
  commissionPerOrder: 1,
});
assert.equal(trades.length, 1);
assert.equal(trades[0].entryDate, 'd2', 'signal must fill at next-bar open');
assert.equal(trades[0].exitReason, 'stop_loss', 'ambiguous stop/target bar must assume stop first');
assert(Math.abs(trades[0].pnl - (trades[0].grossPnl - trades[0].costs)) < 1e-8, 'gross - costs must equal net');

const noPhantom = executeLongSignals(bars, [false, false, true], [false, false, false], {
  initialCapital: 10_000,
  positionSizePercent: 100,
  stopLossPercent: 5,
  takeProfitPercent: 5,
});
assert.equal(noPhantom.length, 0, 'last-bar signal must not create a phantom fill');
console.log('SR controls passed: bands, monotonic calibration, execution semantics');
