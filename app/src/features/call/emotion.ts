import type { BackendEmotion } from '@/lib/api';
import type { DollEmotion } from '@/features/doll/pose';

export function toDollEmotion(e: BackendEmotion | string | undefined): DollEmotion {
  switch (e) {
    case 'HAPPY':
      return 'happy';
    case 'SURPRISED':
      return 'surprised';
    case 'TEASING':
      return 'teasing';
    case 'SLEEPY':
      return 'sleepy';
    default:
      return 'idle';
  }
}
