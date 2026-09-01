import {
  isObjectionable,
  maskText,
  normalize,
  screenFields,
  screenText,
} from '../contentFilter';

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('CAFÉ')).toBe('cafe');
  });

  it('undoes leetspeak substitutions', () => {
    expect(normalize('h3ll0')).toBe('hello');
  });

  it('collapses padded repeats down to two', () => {
    expect(normalize('soooooo')).toBe('soo');
  });
});

describe('screenText — clean text passes', () => {
  // Every one of these contains a blocklist term as a substring. They are the
  // whole reason matching is boundary-based rather than substring-based.
  const innocent = [
    'Grape picking at the vineyard',
    'Raccoon watching in the park',
    'That looks suspicious',
    'Torpedo museum tour',
    'Pakistan independence day celebration',
    'Document review session',
    'Chemistry class study group',
    'Cocktail making night',
    'Bass fishing at the lake',
    'Assignment help session',
    'Password reset workshop',
    'Analysis and analytics meetup',
    'Peacock sanctuary visit',
    'Titanic exhibit downtown',
    'Scunthorpe United supporters club',
    'Massive game night, pass the snacks',
    'Cumulative review before finals',
    'Shiitake mushroom cooking class',
  ];

  it.each(innocent)('allows %s', (text) => {
    expect(screenText(text).ok).toBe(true);
  });

  it('allows empty and whitespace-only input', () => {
    expect(screenText('').ok).toBe(true);
    expect(screenText('   ').ok).toBe(true);
  });
});

describe('screenText — profanity', () => {
  it('flags plain profanity', () => {
    const result = screenText('this is fucking terrible');
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('profanity');
  });

  it('flags leetspeak profanity', () => {
    expect(isObjectionable('this is sh1t')).toBe(true);
  });

  it('flags plurals of a listed term', () => {
    expect(isObjectionable('no assholes allowed')).toBe(true);
  });

  it('flags padded-out repeats', () => {
    expect(isObjectionable('fuuuuuck this')).toBe(true);
  });

  it('does not echo the matched term back to the user', () => {
    const result = screenText('this is shit');
    expect(result.message).not.toContain('shit');
  });
});

describe('screenText — severe content', () => {
  it('flags slurs as severe', () => {
    expect(screenText('you retard').severity).toBe('severe');
  });

  it('flags slurs written with leetspeak', () => {
    expect(screenText('f4gg0t').severity).toBe('severe');
  });

  it('flags letter-spaced evasion', () => {
    expect(screenText('you are a f a g g o t').severity).toBe('severe');
  });

  it('flags punctuation-separated evasion', () => {
    expect(screenText('r.e.t.a.r.d').severity).toBe('severe');
  });

  it('flags threat phrases across word gaps', () => {
    expect(screenText('go kill yourself').severity).toBe('severe');
    expect(screenText('i will find you').severity).toBe('severe');
  });

  it('flags kys as a standalone word only', () => {
    expect(screenText('kys').severity).toBe('severe');
    expect(screenText('monkeys at the zoo').ok).toBe(true);
  });

  it('ranks severe above profanity when both are present', () => {
    expect(screenText('you fucking retard').severity).toBe('severe');
  });
});

describe('screenFields', () => {
  it('reports which field failed', () => {
    const result = screenFields({
      name: 'Board game night',
      description: 'no assholes allowed',
    });
    expect(result.ok).toBe(false);
    expect(result.field).toBe('description');
  });

  it('passes when every field is clean', () => {
    expect(
      screenFields({ name: 'Board game night', description: 'Bring a friend' }).ok,
    ).toBe(true);
  });
});

describe('maskText', () => {
  it('masks flagged terms and leaves the rest intact', () => {
    expect(maskText('this is shit')).toBe('this is ****');
  });

  it('leaves clean text untouched', () => {
    expect(maskText('Grape picking at the vineyard')).toBe(
      'Grape picking at the vineyard',
    );
  });
});
