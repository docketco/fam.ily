import { appKey, stripSlash } from './config';
import type { PersonaConfig } from './profile';

export type BackendEmotion = 'HAPPY' | 'SURPRISED' | 'TEASING' | 'SLEEPY';

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
  image_provider: Provider;
  auth_required: boolean;
}

export type SceneEffect = 'none' | 'rain' | 'snow' | 'sparkle' | 'steam' | 'petals';

export interface GeneratedImage {
  image_base64: string;
  mime_type: string;
  provider: string;
}

export interface GeneratedScene extends GeneratedImage {
  effect: SceneEffect;
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
    snapshot: LocalFile;
    persona: PersonaConfig;
    userSpeechText?: string;
    userAudio?: LocalFile | null;
  }): Promise<ReactResponse> {
    const form = new FormData();
    form.append('snapshot', args.snapshot as unknown as Blob);
    form.append('persona_config', JSON.stringify(args.persona));
    form.append('user_speech_text', args.userSpeechText ?? '');
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

  draftPersona(idea: string, dollName: string, inspiration: string): Promise<PersonaDraft> {
    return this.postJson('/api/persona/draft', { idea, doll_name: dollName, inspiration }, 30000);
  }

  async quote(persona: PersonaConfig): Promise<string> {
    const res = await this.postJson<{ quote: string }>('/api/doll/quote', persona, 20000);
    return res.quote;
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

  generateScene(prompt: string): Promise<GeneratedScene> {
    return this.postJson('/api/scene/generate', { prompt }, 120000);
  }

  generateSticker(prompt: string): Promise<GeneratedImage> {
    return this.postJson('/api/sticker/generate', { prompt }, 120000);
  }

  /**
   * Uploads ordered frames of one loop and returns the encoded MP4 bytes.
   * `outputFps` above `fps` repeats frames (Live Photos expect a camera-like 30 fps).
   */
  async renderWallpaper(frames: LocalFile[], fps: number, repeat = 1, outputFps?: number): Promise<ArrayBuffer> {
    const form = new FormData();
    frames.forEach((f) => form.append('frames', f as unknown as Blob));
    form.append('fps', String(fps));
    form.append('repeat', String(repeat));
    if (outputFps) form.append('output_fps', String(outputFps));
    const res = await this.request(
      '/api/wallpaper/render',
      { method: 'POST', headers: this.headers({ Accept: 'video/mp4' }), body: form },
      180000,
    );
    return res.arrayBuffer();
  }
}
