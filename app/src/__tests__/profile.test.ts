import { emptyProfile, parseStoredProfile, toPersonaConfig, validateProfile } from '@/lib/profile';

describe('doll profile', () => {
  const profile = {
    ...emptyProfile(),
    dollName: ' Jinnie ',
    idolReference: 'Hyunjin',
    relationship: 'Tsundere Partner' as const,
    vibes: ['Playful' as const, 'Sassy' as const],
    memories: 'I hate cucumbers',
    voiceId: 'abc',
  };

  it('converts to the backend persona config', () => {
    expect(toPersonaConfig(profile)).toEqual({
      doll_name: 'Jinnie',
      idol_identity: 'Inspired by Hyunjin',
      personality_tags: ['playful', 'sassy'],
      relationship_type: 'tsundere partner',
      custom_lore: 'I hate cucumbers',
      elevenlabs_voice_id: 'abc',
    });
    expect(toPersonaConfig({ ...profile, idolReference: '', memories: '  ' })).toMatchObject({
      idol_identity: '',
      custom_lore: null,
    });
  });

  it('validates required fields', () => {
    expect(validateProfile(profile)).toBeNull();
    expect(validateProfile({ ...profile, dollName: '  ' })).toMatch(/name/);
    expect(validateProfile({ ...profile, vibes: [] })).toMatch(/vibe/);
  });

  it('round-trips through storage and tolerates junk', () => {
    expect(parseStoredProfile(JSON.stringify(profile))).toEqual(profile);
    expect(parseStoredProfile(null)).toBeNull();
    expect(parseStoredProfile('{oops')).toBeNull();
    expect(parseStoredProfile(JSON.stringify({ dollName: '' }))).toBeNull();
    const repaired = parseStoredProfile(JSON.stringify({ dollName: 'A', relationship: 'Enemy', vibes: ['Playful', 'Evil'] }));
    expect(repaired?.relationship).toBe('Best Friend');
    expect(repaired?.vibes).toEqual(['Playful']);
  });
});
