import { toDollEmotion } from '@/features/call/emotion';
import { meteringToLevel } from '@/features/call/metering';
import { formatDuration } from '@/features/call/useCallTimer';
import { ApiError, DollApi } from '@/lib/api';
import { parseStoredMessages, toHistory, type Message } from '@/lib/conversation';

const persona = {
  doll_name: 'Jinnie',
  idol_identity: '',
  personality: 'chaotic',
  relationship_type: 'my hype-man',
  custom_lore: null,
  elevenlabs_voice_id: 'v',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
}

describe('DollApi', () => {
  it('sends chat turns with mode and history, without a snapshot', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ spoken_text: 'hi', emotion: 'LOVING', heard_text: 'yo', audio_base64: '', audio_mime_type: '' }),
    );
    const api = new DollApi('http://server:8000/', fetchMock);
    const res = await api.react({
      persona,
      mode: 'chat',
      userSpeechText: 'look',
      history: [{ role: 'user', text: 'earlier' }],
    });
    expect(res.emotion).toBe('LOVING');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://server:8000/api/doll/react');
    const form = init.body as FormData;
    expect(form.get('mode')).toBe('chat');
    expect(JSON.parse(form.get('history') as string)).toEqual([{ role: 'user', text: 'earlier' }]);
    expect(form.get('snapshot')).toBeNull();
  });

  it('surfaces the server detail message on errors', async () => {
    const api = new DollApi('http://s', jest.fn().mockResolvedValue(jsonResponse({ detail: 'brain offline' }, 502)));
    await expect(api.health()).rejects.toEqual(new ApiError('brain offline', 502));
  });

  it('reports network failures with a null status', async () => {
    const api = new DollApi('http://s', jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(api.cutout({ uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg' })).rejects.toMatchObject({
      status: null,
      message: "Can't reach the doll server",
    });
  });
});

describe('conversation memory', () => {
  const msg = (i: number, role: 'user' | 'doll'): Message => ({ id: `${i}`, role, text: `line ${i}`, via: 'chat', at: i });

  it('sends only the most recent turns to the AI', () => {
    const many = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 ? 'doll' : 'user'));
    const history = toHistory(many);
    expect(history).toHaveLength(16);
    expect(history[15]).toEqual({ role: 'doll', text: 'line 29' });
  });

  it('reads stored messages defensively', () => {
    expect(parseStoredMessages(JSON.stringify([msg(1, 'user'), { role: 'boss', text: 'x', id: '2' }]))).toHaveLength(1);
    expect(parseStoredMessages('{oops')).toEqual([]);
    expect(parseStoredMessages(null)).toEqual([]);
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
    expect(toDollEmotion('POUTY')).toBe('pouty');
    expect(toDollEmotion('nope')).toBe('idle');
  });

  it('normalizes microphone metering', () => {
    expect(meteringToLevel(undefined)).toBeCloseTo(0.15);
    expect(meteringToLevel(-160)).toBe(0);
    expect(meteringToLevel(0)).toBe(1);
  });
});
