/** Everything in a doll profile is the user's own free-text input. */
export interface DollProfile {
  version: 2;
  dollName: string;
  /** Optional look/vibe inspiration, in the user's words. */
  inspiration: string;
  /** How the doll relates to the user, in the user's words. */
  relationship: string;
  personality: string;
  /** The doll's own invented backstory. */
  backstory: string;
  /** Things the doll knows about the user. */
  memories: string;
  /** How the voice should sound (used for AI voice design). */
  voiceDescription: string;
  voiceId: string;
  /** Local file URI of the plushie photo, copied into the app's document directory. */
  photoUri: string | null;
  /** Optional override of the backend URL (useful for cloud builds / LAN testing). */
  apiUrl: string;
  /** When the user confirmed the doll is their own original character (see setup screen). */
  acceptedTermsAt: string | null;
  createdAt: string;
}

export interface PersonaConfig {
  doll_name: string;
  idol_identity: string;
  personality: string;
  relationship_type: string;
  custom_lore: string | null;
  elevenlabs_voice_id: string;
}

export const LIMITS = {
  dollName: 60,
  inspiration: 160,
  relationship: 160,
  personality: 600,
  backstory: 900,
  memories: 1000,
  voiceDescription: 400,
} as const;

export function emptyProfile(): DollProfile {
  return {
    version: 2,
    dollName: '',
    inspiration: '',
    relationship: '',
    personality: '',
    backstory: '',
    memories: '',
    voiceDescription: '',
    voiceId: '',
    photoUri: null,
    apiUrl: '',
    acceptedTermsAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function buildLore(p: Pick<DollProfile, 'backstory' | 'memories'>): string | null {
  const parts: string[] = [];
  if (p.backstory.trim()) parts.push(`Your backstory: ${p.backstory.trim()}`);
  if (p.memories.trim()) parts.push(`About your human: ${p.memories.trim()}`);
  return parts.length ? parts.join('\n') : null;
}

export function toPersonaConfig(p: DollProfile): PersonaConfig {
  return {
    doll_name: p.dollName.trim() || 'Doll',
    idol_identity: p.inspiration.trim(),
    personality: p.personality.trim(),
    relationship_type: p.relationship.trim(),
    custom_lore: buildLore(p),
    elevenlabs_voice_id: p.voiceId,
  };
}

export function validateProfile(p: DollProfile): string | null {
  if (!p.dollName.trim()) return 'Give your doll a name';
  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    if (p[key].length > max) return `That ${key} is a little long (${max} characters max)`;
  }
  if (!p.acceptedTermsAt) return 'Please confirm your doll is your own original character';
  return null;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Parses stored JSON defensively so a corrupt or older record never crashes launch.
 * Version 1 profiles (preset relationship + vibe chips) are migrated to free text.
 */
export function parseStoredProfile(raw: string | null): DollProfile | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data.dollName !== 'string' || !data.dollName.trim()) return null;
    const base = emptyProfile();
    const legacyVibes = Array.isArray(data.vibes) ? data.vibes.filter((v) => typeof v === 'string').join(', ') : '';
    return {
      ...base,
      dollName: str(data.dollName, LIMITS.dollName),
      inspiration: str(data.inspiration ?? data.idolReference, LIMITS.inspiration),
      relationship: str(data.relationship, LIMITS.relationship),
      personality: str(data.personality, LIMITS.personality) || legacyVibes,
      backstory: str(data.backstory, LIMITS.backstory),
      memories: str(data.memories, LIMITS.memories),
      voiceDescription: str(data.voiceDescription, LIMITS.voiceDescription),
      voiceId: str(data.voiceId, 64),
      photoUri: typeof data.photoUri === 'string' ? data.photoUri : null,
      apiUrl: str(data.apiUrl, 300),
      // A doll saved before the confirmation existed counts as confirmed once the user
      // re-saves it in setup; until then validateProfile asks for it.
      acceptedTermsAt: typeof data.acceptedTermsAt === 'string' ? data.acceptedTermsAt : null,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    };
  } catch {
    return null;
  }
}
