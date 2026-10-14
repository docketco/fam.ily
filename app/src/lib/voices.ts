export interface Voice {
  voice_id: string;
  name: string;
  description: string;
}

/** Mirrors the backend presets so the picker works before the server is reachable. */
export const FALLBACK_VOICES: Voice[] = [
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Soft, warm, reassuring' },
  { voice_id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'Bright, quirky, upbeat' },
  { voice_id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'Playful, expressive' },
  { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Casual, friendly, natural' },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Young, energetic' },
  { voice_id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', description: 'Easygoing, charming' },
];
