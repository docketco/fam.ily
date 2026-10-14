import { emptyProfile, parseStoredProfile, toPersonaConfig, validateProfile } from '@/lib/profile';

describe('doll profile', () => {
  const profile = {
    ...emptyProfile(),
    dollName: ' Mochi ',
    inspiration: 'pastel streetwear, sleepy eyes',
    relationship: 'the friend who roasts me before exams',
    personality: 'Deadpan, secretly soft',
    backstory: 'Won at a claw machine in 2019.',
    memories: 'I hate cucumbers',
    voiceId: 'abc',
    acceptedTermsAt: '2026-10-14T00:00:00.000Z',
  };

  it('sends the user’s own words to the backend', () => {
    expect(toPersonaConfig(profile)).toEqual({
      doll_name: 'Mochi',
      idol_identity: 'pastel streetwear, sleepy eyes',
      personality: 'Deadpan, secretly soft',
      relationship_type: 'the friend who roasts me before exams',
      custom_lore: 'Your backstory: Won at a claw machine in 2019.\nAbout your human: I hate cucumbers',
      elevenlabs_voice_id: 'abc',
    });
    expect(toPersonaConfig({ ...profile, backstory: '', memories: '  ' }).custom_lore).toBeNull();
  });

  it('requires a name and the original-character confirmation', () => {
    expect(validateProfile(profile)).toBeNull();
    expect(validateProfile({ ...profile, dollName: '  ' })).toMatch(/name/);
    expect(validateProfile({ ...profile, acceptedTermsAt: null })).toMatch(/original character/);
    expect(validateProfile({ ...profile, personality: 'x'.repeat(601) })).toMatch(/personality/);
  });

  it('round-trips through storage and tolerates junk', () => {
    expect(parseStoredProfile(JSON.stringify(profile))).toEqual(profile);
    expect(parseStoredProfile(null)).toBeNull();
    expect(parseStoredProfile('{oops')).toBeNull();
    expect(parseStoredProfile(JSON.stringify({ dollName: '' }))).toBeNull();
  });

  it('migrates version 1 profiles (preset chips) to free text', () => {
    const v1 = {
      version: 1,
      dollName: 'Jinnie',
      idolReference: 'Felix',
      relationship: 'Best Friend',
      vibes: ['Playful', 'Sassy'],
      memories: 'Blue Bottle',
      voiceId: 'v',
      photoUri: 'file:///doll/plushie.jpg',
      apiUrl: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const migrated = parseStoredProfile(JSON.stringify(v1))!;
    expect(migrated).toMatchObject({
      version: 2,
      inspiration: 'Felix',
      relationship: 'Best Friend',
      personality: 'Playful, Sassy',
      memories: 'Blue Bottle',
      photoUri: 'file:///doll/plushie.jpg',
      acceptedTermsAt: null,
    });
    expect(validateProfile(migrated)).toMatch(/original character/);
  });
});
