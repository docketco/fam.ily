import { ApiError, DollApi } from '@/lib/api';
import { formatDuration } from '@/features/call/useCallTimer';
import { toDollEmotion } from '@/features/call/emotion';
import { meteringToLevel } from '@/features/call/metering';

const persona = {
  doll_name: 'Jinnie',
  idol_identity: '',
  personality_tags: [],
  relationship_type: 'bestie',
  custom_lore: null,
  elevenlabs_voice_id: 'v',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
}

describe('DollApi', () => {
  it('posts multipart form data to /api/doll/react', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ spoken_text: 'hi', emotion: 'HAPPY', heard_text: 'yo', audio_base64: '', audio_mime_type: '' }),
    );
    const api = new DollApi('http://server:8000/', fetchMock);
    const res = await api.react({
      snapshot: { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' },
      persona,
      userSpeechText: 'look',
      userAudio: { uri: 'file:///q.m4a', name: 'q.m4a', type: 'audio/mp4' },
    });
    expect(res.spoken_text).toBe('hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://server:8000/api/doll/react');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('surfaces the server detail message on errors', async () => {
    const api = new DollApi('http://s', jest.fn().mockResolvedValue(jsonResponse({ detail: 'brain offline' }, 502)));
    await expect(api.health()).rejects.toEqual(new ApiError('brain offline', 502));
  });

  it('reports network failures with a null status', async () => {
    const api = new DollApi('http://s', jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(api.voices()).rejects.toMatchObject({ status: null, message: "Can't reach the doll server" });
  });
});

describe('call helpers', () => {
  it('formats the call timer', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('maps backend emotions', () => {
    expect(toDollEmotion('SURPRISED')).toBe('surprised');
    expect(toDollEmotion('nope')).toBe('idle');
  });

  it('normalizes microphone metering', () => {
    expect(meteringToLevel(undefined)).toBeCloseTo(0.15);
    expect(meteringToLevel(-160)).toBe(0);
    expect(meteringToLevel(0)).toBe(1);
  });
});
