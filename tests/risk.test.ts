import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRisk, type Shipment } from '../src/risk.ts';
const today = new Date('2026-10-26T13:00:00.000Z');
const base: Shipment = {
  id: 'TEST-1', origin: 'A', destination: 'B', item: 'GPU', sku: 'G', units: 1,
  carrier: 'Test', eta: '2026-10-28', status: 'in_transit', priority: 'normal',
  updated_at: '', available: 10, reorder_point: 5,
};
test('on-time deliveries remain low-risk', () => {
  assert.deepEqual(evaluateRisk(base, today).severity, 'low');
  assert.equal(evaluateRisk(base, today).daysLate, 0);
});
test('critical late low-stock shipment escalates', () => {
  const risk = evaluateRisk({ ...base, eta: '2026-10-23', status: 'delayed', priority: 'critical', available: 1 }, today);
  assert.equal(risk.severity, 'critical');
  assert.equal(risk.daysLate, 3);
  assert.equal(risk.lowStock, true);
});
test('delivered shipments do not generate risk even if overdue', () => {
  const risk = evaluateRisk({ ...base, eta: '2026-09-01', status: 'delivered', available: 0 }, today);
  assert.equal(risk.score, 0);
  assert.equal(risk.severity, 'low');
});
test('date comparison uses calendar days rather than hours', () => {
  const risk = evaluateRisk({ ...base, eta: '2026-10-26' }, today);
  assert.equal(risk.daysLate, 0);
});
test('unknown stock does not invent low-stock data', () => {
  const risk = evaluateRisk({ ...base, available: null, reorder_point: null }, today);
  assert.equal(risk.lowStock, false);
});
