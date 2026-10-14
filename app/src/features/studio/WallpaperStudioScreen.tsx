import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip } from '@/components/ui';
import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import { LOOP_SECONDS } from '@/features/doll/pose';
import type { SceneEffect } from '@/lib/api';
import { IS_DEMO } from '@/lib/demo-api';
import { deleteQuietly, writeImageToCache } from '@/lib/audio';
import { toPersonaConfig } from '@/lib/profile';
import { useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

import { isLivePhotoSupported } from '../../../modules/live-photo';
import { Draggable } from './Draggable';
import { EFFECTS, SceneEffects } from './effects';
import { ensureSavePermission, exportAnimated, exportStill, type ExportKind } from './exportWallpaper';

interface Sticker {
  id: string;
  uri: string;
  prompt: string;
}

const MAX_STICKERS = 8;

function PromptRow({
  value,
  onChange,
  placeholder,
  action,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  action: string;
  onSubmit: () => void;
  busy: boolean;
}) {
  const disabled = busy || value.trim().length < 2;
  return (
    <View style={styles.promptRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        style={styles.promptInput}
        maxLength={400}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!busy}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action}
        onPress={onSubmit}
        disabled={disabled}
        style={[styles.promptBtn, disabled && { opacity: 0.5 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.promptBtnText}>{action}</Text>}
      </Pressable>
    </View>
  );
}

export function WallpaperStudioScreen() {
  const { profile, api } = useProfile();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [scenePrompt, setScenePrompt] = useState('');
  const [sceneUri, setSceneUri] = useState<string | null>(null);
  const [effect, setEffect] = useState<SceneEffect>('none');
  const [paintingScene, setPaintingScene] = useState(false);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stickerPrompt, setStickerPrompt] = useState('');
  const [makingSticker, setMakingSticker] = useState(false);

  const [bubbleOn, setBubbleOn] = useState(true);
  const [quote, setQuote] = useState('');
  const [quoting, setQuoting] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ fraction: number; label: string } | null>(null);
  const [savedKind, setSavedKind] = useState<ExportKind | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);

  // Canvas is always 9:16 so exports match phone wallpapers.
  const canvasH = Math.min(screenH * 0.58, ((screenW - space.md * 2) * 16) / 9);
  const canvasW = (canvasH * 9) / 16;
  const dollSize = canvasW * 0.42;
  const stickerSize = canvasW * 0.3;

  const canvasRef = useRef<View>(null);
  const clock = useSharedValue(0);
  const ticker = useFrameCallback((info) => {
    clock.value = (clock.value + (info.timeSincePreviousFrame ?? 16) / 1000) % LOOP_SECONDS;
  });
  useEffect(() => {
    ticker.setActive(!exporting);
  }, [exporting, ticker]);

  // Clean up generated images when leaving the studio.
  const generated = useRef<string[]>([]);
  useEffect(() => () => generated.current.forEach(deleteQuietly), []);

  if (!profile) return null;

  // Alert does nothing on the web, so problems are also shown inline.
  function report(title: string, message: string) {
    setStudioError(message);
    if (Platform.OS !== 'web') Alert.alert(title, message);
  }

  async function paintScene() {
    if (scenePrompt.trim().length < 2 || paintingScene) return;
    setPaintingScene(true);
    setStudioError(null);
    try {
      const res = await api.generateScene(scenePrompt.trim());
      const uri = writeImageToCache(res.image_base64, res.mime_type, 'scene');
      generated.current.push(uri);
      setSceneUri(uri);
      setEffect(res.effect);
    } catch (err) {
      report("Couldn't paint that", (err as Error).message);
    } finally {
      setPaintingScene(false);
    }
  }

  async function makeSticker() {
    if (stickerPrompt.trim().length < 2 || makingSticker) return;
    if (stickers.length >= MAX_STICKERS) {
      report('That is a lot of stickers', 'Long-press a sticker on the canvas to remove it.');
      return;
    }
    setMakingSticker(true);
    setStudioError(null);
    try {
      const prompt = stickerPrompt.trim();
      const res = await api.generateSticker(prompt);
      const uri = writeImageToCache(res.image_base64, res.mime_type, 'sticker');
      generated.current.push(uri);
      setStickers((s) => [...s, { id: `${Date.now()}`, uri, prompt }]);
      setStickerPrompt('');
    } catch (err) {
      report("Couldn't make that sticker", (err as Error).message);
    } finally {
      setMakingSticker(false);
    }
  }

  function removeSticker(s: Sticker) {
    if (Platform.OS === 'web') {
      setStickers((all) => all.filter((x) => x.id !== s.id));
      return;
    }
    Alert.alert('Remove sticker?', s.prompt, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setStickers((all) => all.filter((x) => x.id !== s.id)) },
    ]);
  }

  async function writeQuote() {
    if (!profile || quoting) return;
    setQuoting(true);
    try {
      setQuote(await api.quote(toPersonaConfig(profile)));
      setBubbleOn(true);
    } catch (err) {
      report("Couldn't write a line", (err as Error).message);
    } finally {
      setQuoting(false);
    }
  }

  async function runExport(kind: ExportKind) {
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
      if (kind === 'still') await exportStill(canvasRef);
      else await exportAnimated({ kind, canvasRef, clock, api, onProgress: (fraction, label) => setProgress({ fraction, label }) });
      setSavedKind(kind);
    } catch (err) {
      report('Export failed', (err as Error).message);
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  const showBubble = bubbleOn && quote.trim() !== '';

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + space.xl }]}
      scrollEnabled={!exporting}
      keyboardShouldPersistTaps="handled">
      {/* ---- canvas ---- */}
      <View ref={canvasRef} collapsable={false} style={[styles.canvas, { width: canvasW, height: canvasH }]} pointerEvents={exporting ? 'none' : 'auto'}>
        {sceneUri ? (
          <Image source={{ uri: sceneUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        ) : (
          !exporting && (
            <View style={styles.emptyScene}>
              <Text style={styles.emptyText}>Describe any scene below and AI will paint it ✨</Text>
            </View>
          )
        )}
        <SceneEffects effect={effect} clock={clock} height={canvasH} />

        <Draggable initialX={(canvasW - dollSize) / 2} initialY={canvasH * 0.5}>
          <PlushieAvatar source={profile.photoUri} size={dollSize} mode="loop5" clock={clock} />
        </Draggable>

        {stickers.map((s, i) => (
          <Draggable
            key={s.id}
            initialX={canvasW * (0.08 + 0.12 * (i % 4))}
            initialY={canvasH * (0.12 + 0.09 * (i % 3))}
            onLongPress={() => removeSticker(s)}>
            <Image source={{ uri: s.uri }} style={{ width: stickerSize, height: stickerSize }} contentFit="contain" />
          </Draggable>
        ))}

        {showBubble && (
          <Draggable initialX={canvasW * 0.12} initialY={canvasH * 0.34}>
            <View style={[styles.bubble, { maxWidth: canvasW * 0.76 }]}>
              <Text style={[styles.bubbleText, { fontSize: Math.max(12, canvasW * 0.055) }]}>{quote}</Text>
              <View style={styles.bubbleTail} />
            </View>
          </Draggable>
        )}
      </View>
      <Text style={styles.tip}>Drag to move · pinch to resize · long-press a sticker to remove it</Text>

      {/* ---- scene ---- */}
      <Text style={styles.label}>Scene</Text>
      <PromptRow
        value={scenePrompt}
        onChange={setScenePrompt}
        placeholder="Describe any place, mood or style…"
        action="Paint"
        onSubmit={paintScene}
        busy={paintingScene}
      />
      <Text style={styles.subLabel}>Ambient motion {sceneUri ? '(picked by AI, change it if you like)' : ''}</Text>
      <View style={styles.chips}>
        {EFFECTS.map((e) => (
          <Chip key={e.id} label={e.label} selected={effect === e.id} onPress={() => setEffect(e.id)} />
        ))}
      </View>

      {/* ---- stickers ---- */}
      <Text style={styles.label}>Stickers</Text>
      <PromptRow
        value={stickerPrompt}
        onChange={setStickerPrompt}
        placeholder="Describe any sticker…"
        action="Add"
        onSubmit={makeSticker}
        busy={makingSticker}
      />

      {/* ---- speech bubble ---- */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Speech bubble</Text>
        <Chip label={bubbleOn ? 'Shown' : 'Hidden'} selected={bubbleOn} onPress={() => setBubbleOn((b) => !b)} />
      </View>
      <View style={styles.promptRow}>
        <TextInput
          value={quote}
          onChangeText={setQuote}
          maxLength={80}
          placeholder="Write a line, or let your doll write one"
          placeholderTextColor={colors.inkSoft}
          style={styles.promptInput}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Let my doll write a line" onPress={writeQuote} disabled={quoting} style={[styles.promptBtn, quoting && { opacity: 0.5 }]}>
          {quoting ? <ActivityIndicator color="#fff" /> : <Text style={styles.promptBtnText}>✨</Text>}
        </Pressable>
      </View>

      {studioError ? <Text style={styles.studioError}>{studioError}</Text> : null}

      {/* ---- export ---- */}
      {IS_DEMO ? (
        <Text style={styles.demoNote}>
          In the phone app, this is where you save your wallpaper as a Live Photo (iPhone), a looping video (Android) or a
          still image.
        </Text>
      ) : progress ? (
        <View style={styles.progressBox}>
          <Text style={styles.progressLabel}>{progress.label}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress.fraction * 100)}%` }]} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: space.lg }}>
          {Platform.OS === 'ios' && isLivePhotoSupported && (
            <Button title="Save as Live Photo" icon="✨" onPress={() => runExport('livePhoto')} style={styles.exportBtn} />
          )}
          <Button
            title="Save looping video"
            icon="🎬"
            variant={Platform.OS === 'ios' && isLivePhotoSupported ? 'secondary' : 'primary'}
            onPress={() => runExport('video')}
            style={styles.exportBtn}
          />
          <Button title="Save still image" variant="secondary" onPress={() => runExport('still')} style={styles.exportBtn} />
        </View>
      )}

      <Modal visible={!!savedKind} transparent animationType="fade" onRequestClose={() => setSavedKind(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Saved to your Photos ✨</Text>
            <Text style={styles.modalBody}>{howToText(savedKind)}</Text>
            <Button title="Got it" onPress={() => setSavedKind(null)} style={{ marginTop: space.md }} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function howToText(kind: ExportKind | null): string {
  if (kind === 'livePhoto') {
    return (
      'To make it your moving Lock Screen:\n\n' +
      '1. Settings → Wallpaper → Add New Wallpaper → Photos.\n' +
      '2. Pick the Live Photo you just saved.\n' +
      '3. Make sure the Live Photo button (bottom left) is on, then tap Add.\n\n' +
      'Your doll moves when you wake your phone.'
    );
  }
  if (kind === 'still') return 'Set it from Photos → Share → Use as Wallpaper (iPhone) or your phone’s wallpaper settings (Android).';
  if (Platform.OS === 'ios') {
    return 'iOS can’t use a video as a wallpaper. Use “Save as Live Photo” for a moving Lock Screen, or share the video anywhere you like.';
  }
  return (
    'To set a video wallpaper:\n\n• Samsung: Settings → Wallpaper and style → Change wallpapers → Gallery, pick the video.\n' +
    '• Other phones: use a video live-wallpaper app from Google Play and choose the saved video.'
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, alignItems: 'stretch' },
  canvas: { alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.pinkSoft },
  emptyScene: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: '18%', paddingHorizontal: space.lg },
  emptyText: { color: colors.pinkDeep, fontWeight: '700', textAlign: 'center' },
  tip: { textAlign: 'center', color: colors.inkSoft, fontSize: 12, marginTop: space.sm },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: space.md, marginBottom: space.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  subLabel: { fontSize: 13, color: colors.inkSoft, marginTop: space.sm, marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  promptInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fff',
  },
  promptBtn: {
    minWidth: 64,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.pinkDeep,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  promptBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bubble: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleText: { color: colors.ink, fontWeight: '700' },
  bubbleTail: { position: 'absolute', bottom: -6, left: 18, width: 12, height: 12, backgroundColor: '#fff', transform: [{ rotate: '45deg' }] },
  exportBtn: { marginBottom: space.sm },
  studioError: { color: colors.danger, fontWeight: '600', marginTop: space.md },
  demoNote: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.pinkSoft,
    color: colors.ink,
    lineHeight: 20,
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
