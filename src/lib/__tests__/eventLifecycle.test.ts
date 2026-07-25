import {
  EVENT_TTL_MS,
  eventVisibilityCutoffISO,
  isEventExpired,
  isInRatingWindow,
} from '../eventLifecycle';

const NOW = new Date('2026-07-24T12:00:00Z').getTime();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;

describe('eventVisibilityCutoffISO', () => {
  it('is exactly 24h before now', () => {
    expect(eventVisibilityCutoffISO(NOW)).toBe(iso(-EVENT_TTL_MS));
  });
});

describe('isEventExpired', () => {
  it('future event is not expired', () => {
    expect(isEventExpired(iso(2 * HOUR), NOW)).toBe(false);
  });

  it('event 23h ago is not expired', () => {
    expect(isEventExpired(iso(-23 * HOUR), NOW)).toBe(false);
  });

  it('event exactly 24h ago is expired', () => {
    expect(isEventExpired(iso(-24 * HOUR), NOW)).toBe(true);
  });

  it('event 25h ago is expired', () => {
    expect(isEventExpired(iso(-25 * HOUR), NOW)).toBe(true);
  });

  it('invalid date is treated as not expired', () => {
    expect(isEventExpired('not-a-date', NOW)).toBe(false);
  });
});

describe('isInRatingWindow', () => {
  it('closed before the event starts', () => {
    expect(isInRatingWindow(iso(1 * HOUR), NOW)).toBe(false);
  });

  it('open at the event start time', () => {
    expect(isInRatingWindow(iso(0), NOW)).toBe(true);
  });

  it('open 23h after the event', () => {
    expect(isInRatingWindow(iso(-23 * HOUR), NOW)).toBe(true);
  });

  it('closed exactly 24h after the event', () => {
    expect(isInRatingWindow(iso(-24 * HOUR), NOW)).toBe(false);
  });

  it('closed for invalid dates', () => {
    expect(isInRatingWindow('not-a-date', NOW)).toBe(false);
  });
});
