import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button, Chip } from '@/components/ui';
import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import { LOOP_SECONDS } from '@/features/doll/pose';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

import { Draggable } from './Draggable';
import { ensureSavePermission, exportLoopVideo, exportStill } from './exportWallpaper';
import { SCENES, SceneBackground, SceneEffects, type SceneId } from './scenes';

type StickerId = 'bubble' | 'mug' | 'ears';

const STICKERS: { id: StickerId; label: string }[] = [
  { id: 'bubble', label: '💬 Speech bubble' },
  { id: 'mug', label: '☕ Coffee mug' },
  { id: 'ears', label: '🐱 Cat ears' },
];

function CatEars({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.4} viewBox="0 0 100 40" style={{ position: 'absolute', top: -size * 0.16, left: 0 }}>
      <Path d="M12 40 L22 2 L42 30 Z" fill="#3B2A35" />
      <Path d="M20 34 L24 12 L35 29 Z" fill="#FF8FB1" />
      <Path d="M88 40 L78 2 L58 30 Z" fill="#3B2A35" />
      <Path d="M80 34 L76 12 L65 29 Z" fill="#FF8FB1" />
    </Svg>
  );
}

export function WallpaperStudioScreen() {
  const { profile, api } = useProfile();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [scene, setScene] = useState<SceneId>('bedroom');
  const [stickers, setStickers] = useState<Record<StickerId, boolean>>({ bubble: true, mug: false, ears: false });
  const [quote, setQuote] = useState(`${profile?.dollName ?? 'I'} missed you!`);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ fraction: number; label: string } | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);

  // Canvas is always 9:16 so exports match phone wallpapers.
  const canvasH = Math.min(screenH * 0.58, ((screenW - space.md * 2) * 16) / 9);
  const canvasW = (canvasH * 9) / 16;
  const dollSize = canvasW * 0.42;

  const canvasRef = useRef<View>(null);
  const clock = useSharedValue(0);
  const ticker = useFrameCallback((info) => {
    clock.value = (clock.value + (info.timeSincePreviousFrame ?? 16) / 1000) % LOOP_SECONDS;
  });
  useEffect(() => {
    ticker.setActive(!exporting);
  }, [exporting, ticker]);

  if (!profile) return null;

  const toggle = (id: StickerId) => setStickers((s) => ({ ...s, [id]: !s[id] }));

  async function runExport(kind: 'video' | 'still') {
    if (!(await ensureSavePermission())) {
      Alert.alert('Photos access needed', 'Allow adding to Photos so your wallpaper can be saved.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setExporting(true);
    setProgress({ fraction: 0, label: 'Getting ready…' });
    try {
      if (kind === 'video') {
        await exportLoopVideo({ canvasRef, clock, api, onProgress: (fraction, label) => setProgress({ fraction, label }) });
      } else {
        await exportStill(canvasRef);
      }
      setShowHowTo(true);
    } catch (err) {
      Alert.alert('Export failed', (err as Error).message);
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + space.xl }]} scrollEnabled={!exporting}>
      {/* ---- canvas ---- */}
      <View
        ref={canvasRef}
        collapsable={false}
        style={[styles.canvas, { width: canvasW, height: canvasH }]}
        pointerEvents={exporting ? 'none' : 'auto'}>
        <SceneBackground scene={scene} />
        <SceneEffects scene={scene} clock={clock} height={canvasH} />

        {stickers.mug && (
          <Draggable initialX={canvasW * 0.08} initialY={canvasH * 0.7}>
            <Text style={{ fontSize: canvasW * 0.16 }}>☕</Text>
          </Draggable>
        )}

        <Draggable initialX={(canvasW - dollSize) / 2} initialY={canvasH * 0.46}>
          <View>
            <PlushieAvatar source={profile.photoUri} size={dollSize} mode="loop5" clock={clock} />
            {stickers.ears && <CatEars size={dollSize} />}
          </View>
        </Draggable>

        {stickers.bubble && quote.trim() !== '' && (
          <Draggable initialX={canvasW * 0.12} initialY={canvasH * 0.3}>
            <View style={[styles.bubble, { maxWidth: canvasW * 0.76 }]}>
              <Text style={[styles.bubbleText, { fontSize: Math.max(12, canvasW * 0.055) }]}>{quote}</Text>
              <View style={styles.bubbleTail} />
            </View>
          </Draggable>
        )}
      </View>
      <Text style={styles.tip}>Drag to move · pinch to resize</Text>

      {/* ---- controls ---- */}
      <Text style={styles.label}>Scene</Text>
      <View style={styles.chips}>
        {SCENES.map((s) => (
          <Chip key={s.id} label={`${s.emoji} ${s.label}`} selected={scene === s.id} onPress={() => setScene(s.id)} />
        ))}
      </View>

      <Text style={styles.label}>Stickers</Text>
      <View style={styles.chips}>
        {STICKERS.map((s) => (
          <Chip key={s.id} label={s.label} selected={stickers[s.id]} onPress={() => toggle(s.id)} />
        ))}
      </View>
      {stickers.bubble && (
        <TextInput
          value={quote}
          onChangeText={setQuote}
          maxLength={60}
          placeholder="Write a cute quote"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />
      )}

      {progress ? (
        <View style={styles.progressBox}>
          <Text style={styles.progressLabel}>{progress.label}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress.fraction * 100)}%` }]} />
          </View>
        </View>
      ) : (
        <>
          <Button title="Export looping video" icon="🎬" onPress={() => runExport('video')} style={{ marginTop: space.lg }} />
          <Button title="Save still image" variant="secondary" onPress={() => runExport('still')} style={{ marginTop: space.sm }} />
        </>
      )}

      <Modal visible={showHowTo} transparent animationType="fade" onRequestClose={() => setShowHowTo(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Saved to your Photos ✨</Text>
            {Platform.OS === 'ios' ? (
              <Text style={styles.modalBody}>
                iOS can&apos;t use a video file as a wallpaper directly. To get a moving Lock Screen:{'\n\n'}
                1. Convert the video to a Live Photo with a video-to-Live-Photo app.{'\n'}
                2. Settings → Wallpaper → Add New Wallpaper → Photos, and pick the Live Photo.{'\n'}
                3. Make sure the Live Photo button on the editor is turned on.{'\n\n'}
                The still image works as a regular wallpaper right away.
              </Text>
            ) : (
              <Text style={styles.modalBody}>
                To set a video wallpaper:{'\n\n'}• Samsung: Settings → Wallpaper and style → Change wallpapers → Gallery, pick the video
                (Lock screen).{'\n'}• Other phones: use a video live-wallpaper app from Google Play and choose the saved video.{'\n\n'}
                The still image works as a regular wallpaper right away.
              </Text>
            )}
            <Button title="Got it" onPress={() => setShowHowTo(false)} style={{ marginTop: space.md }} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, alignItems: 'stretch' },
  canvas: { alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#fff' },
  tip: { textAlign: 'center', color: colors.inkSoft, fontSize: 12, marginTop: space.sm },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: space.md, marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fff',
  },
  bubble: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleText: { color: colors.ink, fontWeight: '700' },
  bubbleTail: {
    position: 'absolute',
    bottom: -6,
    left: 18,
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  progressBox: { marginTop: space.lg },
  progressLabel: { color: colors.ink, fontWeight: '600', marginBottom: space.sm },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.pinkSoft, overflow: 'hidden' },
  progressFill: { height: 10, backgroundColor: colors.pinkDeep },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.lg },
  modalCard: { backgroundColor: '#fff', borderRadius: radius.lg, padding: space.lg },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: space.sm },
  modalBody: { fontSize: 15, color: colors.ink, lineHeight: 22 },
});
