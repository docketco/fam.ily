/**
 * Browser demo of the app (EXPO_PUBLIC_DEMO=1), published as a claude.ai artifact.
 * Instead of the FastAPI backend, AI requests go to Claude through the artifact
 * runtime's `sample` capability, and voices use the browser's speech. Without Claude
 * access everything falls back to sample replies.
 */
import {
  ApiError,
  DollApi,
  type BackendEmotion,
  type ChatMode,
  type DesignedVoice,
  type Health,
  type HistoryTurn,
  type LocalFile,
  type PersonaDraft,
  type ReactResponse,
  type VoicePreview,
} from './api';
import type { PersonaConfig } from './profile';

export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

interface SampleFn {
  (input: string, options?: Record<string, unknown>): Promise<{ text: string }>;
  json<T>(input: string, options?: Record<string, unknown>): Promise<T>;
}

let samplePromise: Promise<SampleFn | null> | null = null;

function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const claude = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    samplePromise = claude?.use ? (claude.use('sample') as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

/** Errors the viewer can act on become ApiErrors; "no access" becomes null (use the fallback). */
async function ask<T>(prompt: string, options: Record<string, unknown> = {}): Promise<T | null> {
  const sample = await getSample();
  if (!sample) return null;
  try {
    return await sample.json<T>(prompt, options);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled') {
      return null;
    }
    if (code === 'rate_limited') throw new ApiError('Claude is busy right now. Try again in a minute.', 429);
    if (code === 'refused') throw new ApiError('Claude declined that one. Try wording it differently.', 422);
    throw new ApiError('That didn’t work. Try again.', 502);
  }
}

const EMOTIONS: BackendEmotion[] = ['HAPPY', 'LOVING', 'TEASING', 'SURPRISED', 'SLEEPY', 'SAD', 'POUTY'];

function personaBlock(p: PersonaConfig): string {
  return [
    `Name: ${p.doll_name}`,
    p.idol_identity && `Look and vibe (their words): ${p.idol_identity}`,
    p.relationship_type && `Relationship to their human (their words): ${p.relationship_type}`,
    p.personality && `Personality (their words): ${p.personality}`,
    p.custom_lore && `Story and memories:\n${p.custom_lore}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const FALLBACK_LINES: [string, BackendEmotion][] = [
  ['I missed you! Tell me everything about your day.', 'LOVING'],
  ['Wait, really? Okay, now I need the whole story.', 'SURPRISED'],
  ['Hmm, are you trying to impress me? Because it’s kind of working.', 'TEASING'],
];

export class DemoApi extends DollApi {
  constructor() {
    super('demo');
  }

  override async health(): Promise<Health> {
    const sample = await getSample();
    const p = sample ? 'gemini' : 'fallback';
    return { status: 'ok', llm_provider: p, tts_provider: 'none', auth_required: false };
  }

  override async react(args: {
    persona: PersonaConfig;
    mode: ChatMode;
    userSpeechText?: string;
    history?: HistoryTurn[];
    snapshot?: LocalFile | null;
    userAudio?: LocalFile | null;
  }): Promise<ReactResponse> {
    const said = (args.userSpeechText ?? '').trim();
    let images: Blob[] | undefined;
    if (args.snapshot?.uri) {
      try {
        images = [await (await fetch(args.snapshot.uri)).blob()];
      } catch {
        images = undefined;
      }
    }
    const name = args.persona.doll_name;
    const transcript = (args.history ?? []).map((t) => `${t.role === 'user' ? 'Human' : name}: ${t.text}`).join('\n');
    const situation =
      args.mode === 'chat'
        ? 'Your human is texting you in a chat. Reply like a text message: 1 to 3 short sentences, casual and warm, at most one emoji.'
        : images
          ? 'You are on a video call and the attached image is what your human is showing you right now. React specifically to what you see. Answer in 1 to 3 short spoken sentences, no emojis. Never mention cameras or photos.'
          : 'You are on a voice call; everything you say is read aloud. Answer in 1 to 3 short, natural spoken sentences, no emojis.';
    const turn = said
      ? `Your human says: "${said}"`
      : transcript
        ? 'Your human just came back to talk to you. Greet them in one short line, picking up from where you left off if it fits.'
        : 'Your human just started talking to you for the first time. Greet them in one short line.';
    const prompt = `You ARE ${name}, a small plush doll companion who is alive and talking with your human. You are an original fictional character they created.
${personaBlock(args.persona)}

${situation}
Stay fully in character, react to what they actually said (including earlier), and ask something back now and then. No lists, stage directions or markdown. Never mention being an AI. Never claim to be a real person. Keep it non-sexual and kind.
${transcript ? `\nConversation so far (oldest first):\n${transcript}\n` : ''}
${turn}

Pick the one feeling you show while saying it; your body acts it out on screen.
Reply with only JSON: {"spoken_response": "...", "emotion": "HAPPY" | "LOVING" | "TEASING" | "SURPRISED" | "SLEEPY" | "SAD" | "POUTY"}`;
    const res = await ask<{ spoken_response?: string; emotion?: string }>(prompt, {
      images,
      modelTier: 'quick',
      cache: false,
    });
    if (!res?.spoken_response) {
      const [line, emotion] = FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
      return said
        ? this.reply(line, emotion, said, 'fallback')
        : this.reply(`Hi, it’s ${name}! I missed you. How was your day?`, 'LOVING', said, 'fallback');
    }
    const emotion = EMOTIONS.includes(res.emotion as BackendEmotion) ? (res.emotion as BackendEmotion) : 'HAPPY';
    return this.reply(String(res.spoken_response).trim(), emotion, said, 'claude');
  }

  private reply(text: string, emotion: BackendEmotion, heard: string, provider: string): ReactResponse {
    return {
      spoken_text: text,
      emotion,
      heard_text: heard,
      audio_base64: '',
      audio_mime_type: '',
      provider,
      tts_provider: 'none',
    };
  }

  override async draftPersona(idea: string, dollName: string, inspiration: string): Promise<PersonaDraft> {
    const res = await ask<Partial<PersonaDraft>>(
      `Help someone write the character sheet for their own plush doll companion. Expand their idea into a vivid, original character. Keep their wording and intent; invent only what is missing. The doll is an original fictional character: never describe it as a real person, keep it non-sexual. Write in the language of the idea.
Idea: ${idea}${dollName ? `\nDoll name: ${dollName}` : ''}${inspiration ? `\nLook/vibe inspiration: ${inspiration}` : ''}
Reply with only JSON: {"relationship": "one short phrase", "personality": "1-3 sentences", "backstory": "1-3 sentences", "voice_description": "one sentence about how their voice sounds"}`,
      { modelTier: 'quick', cache: false },
    );
    return {
      relationship: String(res?.relationship ?? ''),
      personality: String(res?.personality ?? idea),
      backstory: String(res?.backstory ?? ''),
      voice_description: String(res?.voice_description ?? ''),
    };
  }

  override async designVoice(): Promise<DesignedVoice[]> {
    throw new ApiError(
      'AI voice design runs on ElevenLabs in the real app. In this demo your doll speaks with your device’s voice.',
      503,
    );
  }

  override async previewVoice(): Promise<VoicePreview> {
    return { audio_base64: '', audio_mime_type: '', tts_provider: 'none' };
  }
}
