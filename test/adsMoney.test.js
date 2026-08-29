import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fromMetaBudget,
  getMetaCurrencyScale,
  parseBudgetInput,
  toMetaBudget
} from '../src/utils/adsMoney.js';

test('Meta budget conversion respects zero-decimal VND accounts', () => {
  assert.equal(getMetaCurrencyScale('VND'), 1);
  assert.equal(fromMetaBudget('200000', 'VND'), 200000);
  assert.equal(toMetaBudget(200000, 'VND'), 200000);
});

test('Meta budget conversion keeps cent-based currencies correct', () => {
  assert.equal(getMetaCurrencyScale('USD'), 100);
  assert.equal(fromMetaBudget('2500', 'USD'), 25);
  assert.equal(toMetaBudget(25, 'USD'), 2500);
});

test('budget input does not turn a decimal foreign-currency amount into 100x more', () => {
  assert.equal(parseBudgetInput('25.50', 'USD'), 25.5);
  assert.equal(parseBudgetInput('25,50', 'USD'), 25.5);
  assert.equal(parseBudgetInput('200.000 ₫', 'VND'), 200000);
});
