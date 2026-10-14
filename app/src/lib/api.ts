import { appKey, stripSlash } from './config';
import type { PersonaConfig } from './profile';

export type BackendEmotion = 'HAPPY' | 'LOVING' | 'TEASING' | 'SURPRISED' | 'SLEEPY' | 'SAD' | 'POUTY';

/** How the user is talking to the doll: texting, a voice call, or a call with the camera on. */
export type ChatMode = 'chat' | 'call' | 'camera';

/** One earlier line of the conversation, sent so the doll remembers what was said. */
export interface HistoryTurn {
  role: 'user' | 'doll';
  text: string;
}

export interface ReactResponse {
  spoken_text: string;
  emotion: BackendEmotion;
  heard_text: string;
  /** Empty when the server has no TTS configured: speak `spoken_text` on device instead. */
  audio_base64: string;
  audio_mime_type: string;
  provider: string;
  tts_provider: string;
}

export type Provider = 'gemini' | 'openai' | 'fallback';

export interface Health {
  status: 'ok';
  llm_provider: Provider;
  tts_provider: 'elevenlabs' | 'none';
  auth_required: boolean;
}

export interface PersonaDraft {
  relationship: string;
  personality: string;
  backstory: string;
  voice_description: string;
}

export interface DesignedVoice {
  generated_voice_id: string;
  audio_base64: string;
  audio_mime_type: string;
}

export interface VoicePreview {
  audio_base64: string;
  audio_mime_type: string;
  tts_provider: string;
}

/** A local file to send in a multipart body (React Native's `{ uri, name, type }` convention). */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchLike = typeof fetch;

export class DollApi {
  constructor(
    private readonly baseUrl: string,
    // Wrapped so `fetch` is never invoked with this class as `this` ("Illegal invocation").
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private url(path: string) {
    return `${stripSlash(this.baseUrl)}${path}`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Accept: 'application/json', ...(appKey ? { 'X-App-Key': appKey } : {}), ...extra };
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path), { ...init, signal: controller.signal });
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new ApiError(aborted ? 'The doll took too long to answer' : "Can't reach the doll server", null);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let detail = `Server error (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(detail, res.status);
    }
    return res;
  }

  async health(timeoutMs = 5000): Promise<Health> {
    const res = await this.request('/health', { headers: this.headers() }, timeoutMs);
    return res.json();
  }

  async react(args: {
    persona: PersonaConfig;
    mode: ChatMode;
    userSpeechText?: string;
    history?: HistoryTurn[];
    snapshot?: LocalFile | null;
    userAudio?: LocalFile | null;
  }): Promise<ReactResponse> {
    const form = new FormData();
    form.append('persona_config', JSON.stringify(args.persona));
    form.append('mode', args.mode);
    form.append('user_speech_text', args.userSpeechText ?? '');
    if (args.history?.length) form.append('history', JSON.stringify(args.history));
    if (args.snapshot) form.append('snapshot', args.snapshot as unknown as Blob);
    if (args.userAudio) form.append('user_audio', args.userAudio as unknown as Blob);
    const res = await this.request('/api/doll/react', { method: 'POST', headers: this.headers(), body: form }, 45000);
    return res.json();
  }

  previewVoice(voiceId: string, text?: string): Promise<VoicePreview> {
    return this.postJson('/api/voices/preview', { voice_id: voiceId, ...(text ? { text } : {}) }, 20000);
  }

  private async postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    const res = await this.request(
      path,
      { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) },
      timeoutMs,
    );
    return res.json();
  }

  /** Server fallback for cutting the plushie out of its photo (plain backgrounds only). */
  async cutout(photo: LocalFile): Promise<{ image_base64: string; mime_type: string }> {
    const form = new FormData();
    form.append('photo', photo as unknown as Blob);
    const res = await this.request('/api/doll/cutout', { method: 'POST', headers: this.headers(), body: form }, 30000);
    return res.json();
  }

  draftPersona(idea: string, dollName: string, inspiration: string): Promise<PersonaDraft> {
    return this.postJson('/api/persona/draft', { idea, doll_name: dollName, inspiration }, 30000);
  }

  async designVoice(description: string, sampleText?: string): Promise<DesignedVoice[]> {
    const res = await this.postJson<{ previews: DesignedVoice[] }>(
      '/api/voices/design',
      { description, ...(sampleText ? { sample_text: sampleText } : {}) },
      60000,
    );
    return res.previews;
  }

  async saveVoice(generatedVoiceId: string, name: string, description: string): Promise<string> {
    const res = await this.postJson<{ voice_id: string }>(
      '/api/voices/save',
      { generated_voice_id: generatedVoiceId, name, description },
      30000,
    );
    return res.voice_id;
  }

}
