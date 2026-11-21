import test from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, formatINRNumber, formatShortDate, getPhoneSuffix } from './format';

test('formatINRNumber formats Indian grouping correctly', () => {
  assert.equal(formatINRNumber(0), '0');
  assert.equal(formatINRNumber(340), '340');
  assert.equal(formatINRNumber(1234), '1,234');
  assert.equal(formatINRNumber(123456), '1,23,456');
  assert.equal(formatINRNumber(1234567), '12,34,567');
});

test('formatINR prefixes rupee sign cleanly', () => {
  assert.equal(formatINR(123456), '₹1,23,456');
  assert.equal(formatINR(-250), '-₹250');
});

test('formatShortDate identifies Today and Yesterday relative to reference date', () => {
  const ref = new Date(2026, 10, 21); // 21 Nov 2026
  assert.equal(formatShortDate('2026-11-21', { today: 'Today', yesterday: 'Yesterday' }, ref), 'Today');
  assert.equal(formatShortDate('2026-11-20', { today: 'Today', yesterday: 'Yesterday' }, ref), 'Yesterday');
  assert.match(formatShortDate('2026-11-18', { today: 'Today', yesterday: 'Yesterday' }, ref), /18\s+Nov/);
});

test('getPhoneSuffix returns last 4 digits safely', () => {
  assert.equal(getPhoneSuffix('9820414821'), '4821');
  assert.equal(getPhoneSuffix('+91 98765-01934'), '1934');
  assert.equal(getPhoneSuffix(''), '0000');
});
