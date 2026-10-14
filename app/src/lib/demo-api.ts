/**
 * Browser demo of the app (EXPO_PUBLIC_DEMO=1), published as a claude.ai artifact.
 * Instead of the FastAPI backend, AI requests go to Claude through the artifact
 * runtime's `sample` capability. Voices use the browser's speech, and exports are
 * disabled. Without Claude access everything falls back to offline placeholders.
 */
import {
  ApiError,
  DollApi,
  type BackendEmotion,
  type DesignedVoice,
  type GeneratedImage,
  type GeneratedScene,
  type Health,
  type LocalFile,
  type PersonaDraft,
  type ReactResponse,
  type SceneEffect,
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

const EMOTIONS: BackendEmotion[] = ['HAPPY', 'SURPRISED', 'TEASING', 'SLEEPY'];
const EFFECTS: SceneEffect[] = ['none', 'rain', 'snow', 'sparkle', 'steam', 'petals'];

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

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function cleanSvg(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('<svg');
  const end = raw.lastIndexOf('</svg>');
  if (start < 0 || end < 0) return null;
  let svg = raw.slice(start, end + 6);
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}

function hashHue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function placeholderScene(prompt: string): string {
  const hue = hashHue(prompt);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 640"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,86%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,62%)"/></linearGradient></defs><rect width="360" height="640" fill="url(#g)"/></svg>`;
}

function placeholderSticker(prompt: string): string {
  const label = prompt.slice(0, 18).replace(/[<&>"]/g, '');
  const hue = hashHue(prompt);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90"><rect x="5" y="5" width="230" height="80" rx="40" fill="hsl(${hue},70%,82%)" stroke="#fff" stroke-width="8"/><text x="120" y="54" font-family="sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#3B2A35">${label}</text></svg>`;
}

const FALLBACK_LINES: [string, BackendEmotion][] = [
  ['Ooh, what is that? Bring it closer, I want to see!', 'SURPRISED'],
  ['You always show me the coolest things. I’m so happy you called!', 'HAPPY'],
  ['Are you trying to impress me? Because it’s kind of working.', 'TEASING'],
];

export class DemoApi extends DollApi {
  constructor() {
    super('demo');
  }

  override async health(): Promise<Health> {
    const sample = await getSample();
    const p = sample ? 'gemini' : 'fallback';
    return { status: 'ok', llm_provider: p, tts_provider: 'none', image_provider: p, auth_required: false };
  }

  override async react(args: {
    snapshot: LocalFile | null;
    persona: PersonaConfig;
    userSpeechText?: string;
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
    const prompt = `You ARE ${args.persona.doll_name}, a small plush doll companion who is alive and on a live video call with your human. You are an original fictional character they created.
${personaBlock(args.persona)}

${images ? 'The attached image is what your human is showing you right now through the camera. React directly and specifically to concrete things you see in it.' : 'Your human is not showing you anything right now.'}
Your human says: "${said || '(nothing, they just smile at you)'}"

Rules: answer in 1 to 3 short, natural spoken sentences, fully in character. No emojis, lists, stage directions or markdown. Never mention cameras, photos, images, AI or prompts; you are simply looking at them. Never claim to be a real person. Keep it non-sexual and kind.
Reply with only JSON: {"spoken_response": "...", "emotion": "HAPPY" | "SURPRISED" | "TEASING" | "SLEEPY"}`;
    const res = await ask<{ spoken_response?: string; emotion?: string }>(prompt, {
      images,
      modelTier: 'quick',
      cache: false,
    });
    if (!res?.spoken_response) {
      const [line, emotion] = FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
      return this.reply(`It’s ${args.persona.doll_name}! ${line}`, emotion, said, 'fallback');
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

  override async quote(persona: PersonaConfig): Promise<string> {
    const res = await ask<{ quote?: string }>(
      `Write one short line (at most 8 words) this plush doll character would say on its owner's phone lock screen. Match its personality. No hashtags, no quotation marks, at most one emoji.
${personaBlock(persona)}
Reply with only JSON: {"quote": "..."}`,
      { modelTier: 'quick', cache: false },
    );
    return String(res?.quote ?? `${persona.doll_name} missed you!`).replace(/^"|"$/g, '').slice(0, 80);
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

  override async generateScene(prompt: string): Promise<GeneratedScene> {
    const res = await ask<{ svg?: string; effect?: string }>(
      `Paint a phone wallpaper background as an SVG illustration: ${prompt}
Requirements: one <svg> with viewBox="0 0 360 640" (portrait), xmlns set, rich layered shapes and gradients, soft cozy lighting, open space in the lower middle where a small plush toy will be placed. No people or characters, no text, no external references or images, no scripts. Keep it under 9000 characters.
Also pick the ambient animation that fits best: "rain", "snow", "sparkle" (stars, lights, glints), "steam" (warm drinks, baths), "petals" (flowers, spring, autumn leaves) or "none".
Reply with only JSON: {"svg": "<svg ...>...</svg>", "effect": "..."}`,
      { cache: false },
    );
    const svg = cleanSvg(res?.svg) ?? placeholderScene(prompt);
    const effect = EFFECTS.includes(res?.effect as SceneEffect) ? (res?.effect as SceneEffect) : 'none';
    return { image_base64: toBase64Utf8(svg), mime_type: 'image/svg+xml', effect, provider: res ? 'claude' : 'fallback' };
  }

  override async generateSticker(prompt: string): Promise<GeneratedImage> {
    const res = await ask<{ svg?: string }>(
      `Draw a cute die-cut sticker as an SVG: ${prompt}
Requirements: one <svg> with viewBox="0 0 200 200", xmlns set, transparent background (no background rectangle), a bold white outline around the shape, flat vibrant colors. No real people, no logos, no text unless the description asks for words, no external references, no scripts. Under 5000 characters.
Reply with only JSON: {"svg": "<svg ...>...</svg>"}`,
      { cache: false },
    );
    const svg = cleanSvg(res?.svg) ?? placeholderSticker(prompt);
    return { image_base64: toBase64Utf8(svg), mime_type: 'image/svg+xml', provider: res ? 'claude' : 'fallback' };
  }

  override async renderWallpaper(): Promise<ArrayBuffer> {
    throw new ApiError('Saving wallpapers works in the phone app.', 501);
  }
}
