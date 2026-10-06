import { formatRemaining, isWindowClosed } from '../banWindow';

// Fixed reference point so these never depend on the wall clock.
const NOW = new Date('2026-09-02T12:00:00Z').getTime();
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRemaining', () => {
  it('shows days, hours and minutes for a fresh 72-hour ban', () => {
    expect(formatRemaining(at(72 * HOUR), NOW)).toBe('3d 00h 00m');
  });

  it('drops the day part once under 24 hours', () => {
    expect(formatRemaining(at(5 * HOUR + 30 * MINUTE), NOW)).toBe('05h 30m');
  });

  it('zero-pads hours and minutes', () => {
    expect(formatRemaining(at(1 * HOUR + 5 * MINUTE), NOW)).toBe('01h 05m');
  });

  it('rounds down rather than up', () => {
    // 90 seconds left is one minute, not two.
    expect(formatRemaining(at(90_000), NOW)).toBe('00h 01m');
  });

  it('returns null exactly at the deadline', () => {
    expect(formatRemaining(at(0), NOW)).toBeNull();
  });

  it('returns null once the deadline has passed', () => {
    expect(formatRemaining(at(-1 * MINUTE), NOW)).toBeNull();
  });

  it('returns null for a missing or malformed deadline', () => {
    expect(formatRemaining(null, NOW)).toBeNull();
    expect(formatRemaining(undefined, NOW)).toBeNull();
    expect(formatRemaining('not a date', NOW)).toBeNull();
  });

  it('handles a deadline just under the day boundary', () => {
    expect(formatRemaining(at(DAY - MINUTE), NOW)).toBe('23h 59m');
  });

  it('handles a deadline just over the day boundary', () => {
    expect(formatRemaining(at(DAY + MINUTE), NOW)).toBe('1d 00h 01m');
  });
});

describe('isWindowClosed', () => {
  it('is false while time remains', () => {
    expect(isWindowClosed(at(1 * MINUTE), NOW)).toBe(false);
  });

  it('is true at and after the deadline', () => {
    expect(isWindowClosed(at(0), NOW)).toBe(true);
    expect(isWindowClosed(at(-1 * HOUR), NOW)).toBe(true);
  });

  it('is true when there is no deadline at all', () => {
    expect(isWindowClosed(null, NOW)).toBe(true);
  });
});
