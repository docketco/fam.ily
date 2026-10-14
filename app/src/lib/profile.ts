export const RELATIONSHIPS = ['Best Friend', 'Clingy Cutie', 'Protective Brother', 'Tsundere Partner'] as const;
export const VIBES = ['Playful', 'Sassy', 'Supportive', 'Soft-spoken', 'Hyperactive'] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];
export type Vibe = (typeof VIBES)[number];

export interface DollProfile {
  version: 1;
  dollName: string;
  idolReference: string;
  relationship: Relationship;
  vibes: Vibe[];
  memories: string;
  voiceId: string;
  /** Local file URI of the plushie photo, copied into the app's document directory. */
  photoUri: string | null;
  /** Optional override of the backend URL (useful for cloud builds / LAN testing). */
  apiUrl: string;
  createdAt: string;
}

export interface PersonaConfig {
  doll_name: string;
  idol_identity: string;
  personality_tags: string[];
  relationship_type: string;
  custom_lore: string | null;
  elevenlabs_voice_id: string;
}

export function emptyProfile(): DollProfile {
  return {
    version: 1,
    dollName: '',
    idolReference: '',
    relationship: 'Best Friend',
    vibes: ['Playful'],
    memories: '',
    voiceId: '',
    photoUri: null,
    apiUrl: '',
    createdAt: new Date().toISOString(),
  };
}

export function toPersonaConfig(p: DollProfile): PersonaConfig {
  const idol = p.idolReference.trim();
  return {
    doll_name: p.dollName.trim() || 'Doll',
    idol_identity: idol ? `Inspired by ${idol}` : '',
    personality_tags: p.vibes.map((v) => v.toLowerCase()),
    relationship_type: p.relationship.toLowerCase(),
    custom_lore: p.memories.trim() || null,
    elevenlabs_voice_id: p.voiceId,
  };
}

export function validateProfile(p: DollProfile): string | null {
  if (!p.dollName.trim()) return 'Give your doll a name';
  if (p.dollName.trim().length > 60) return 'That name is a little long (60 characters max)';
  if (p.memories.length > 2000) return 'Memories can be up to 2000 characters';
  if (p.vibes.length === 0) return 'Pick at least one vibe';
  return null;
}

/** Parses stored JSON defensively so a corrupt or older record never crashes launch. */
export function parseStoredProfile(raw: string | null): DollProfile | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<DollProfile>;
    if (!data || typeof data.dollName !== 'string' || !data.dollName.trim()) return null;
    const base = emptyProfile();
    return {
      ...base,
      ...data,
      version: 1,
      relationship: RELATIONSHIPS.includes(data.relationship as Relationship)
        ? (data.relationship as Relationship)
        : base.relationship,
      vibes: Array.isArray(data.vibes)
        ? data.vibes.filter((v): v is Vibe => VIBES.includes(v as Vibe))
        : base.vibes,
    };
  } catch {
    return null;
  }
}
