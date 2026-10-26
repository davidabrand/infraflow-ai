/** Risk engine is deterministic, testable and never depends on an LLM guess. */
export type Priority = 'critical' | 'high' | 'normal';
export type ShipmentStatus = 'in_transit' | 'at_hub' | 'delayed' | 'delivered' | 'ordered';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export interface Shipment {
  id: string;
  origin: string;
  destination: string;
  item: string;
  sku: string;
  units: number;
  carrier: string;
  eta: string;
  status: ShipmentStatus;
  priority: Priority;
  updated_at: string;
  available: number | null;
  reorder_point: number | null;
}
export type Risk = { severity: Severity; score: number; daysLate: number; lowStock: boolean; summary: string };

export function evaluateRisk(s: Shipment, today = new Date()): Risk {
  if (s.status === 'delivered') return { severity: 'low', score: 0, daysLate: 0, lowStock: false, summary: 'Delivery completed' };
  // compare pure calendar days in UTC; incoming YYYY-MM-DD is validated during creation/seed.
  const due = Date.parse(`${s.eta}T00:00:00Z`);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysLate = Math.max(0, Math.round((now - due) / 86400000));
  const lowStock = s.available !== null && s.reorder_point !== null && s.available < s.reorder_point;
  let score = 0;
  if (daysLate > 0) score += 35 + Math.min(daysLate * 5, 25);
  if (s.status === 'delayed') score += 15;
  if (lowStock) score += 25;
  if (s.priority === 'critical') score += 20;
  else if (s.priority === 'high') score += 10;
  score = Math.min(100, score);
  const severity: Severity = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
  const reasons: string[] = [];
  if (daysLate > 0) reasons.push(`${daysLate} day${daysLate === 1 ? '' : 's'} overdue`);
  else if (s.status === 'delayed') reasons.push('carrier reported delay');
  if (lowStock) reasons.push(`stock below reorder point (${s.available}/${s.reorder_point})`);
  if (!reasons.length) reasons.push('on schedule');
  return { severity, score, daysLate, lowStock, summary: reasons.join(' · ') };
}
