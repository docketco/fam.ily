import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Section } from '@/components/ui';
import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import { defaultApiUrl } from '@/lib/config';
import { type DollProfile, emptyProfile, LIMITS, validateProfile } from '@/lib/profile';
import { cutOutPlushie } from '@/lib/cutout';
import { persistPhoto, useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

import { VoiceDesigner } from './VoiceDesigner';

function Field({ multiline, style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkSoft}
      style={[styles.input, multiline && styles.multiline, style]}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
    />
  );
}

export function DollSetupScreen() {
  const { profile, saveProfile, resetProfile, api } = useProfile();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DollProfile>(() => profile ?? emptyProfile());
  // The new photo the user picked, and (when it worked) the plushie cut out of it.
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [cutoutUri, setCutoutUri] = useState<string | null>(null);
  const [cutting, setCutting] = useState(false);
  const [useCutout, setUseCutout] = useState(true);
  const [cutoutNote, setCutoutNote] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Alert does nothing on the web, so problems are also shown inline above the save button.
  const report = useCallback((title: string, message: string) => {
    setFormError(message);
    if (Platform.OS !== 'web') Alert.alert(title, message);
  }, []);

  const update = useCallback(<K extends keyof DollProfile>(key: K, value: DollProfile[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);
  const setVoiceId = useCallback((id: string) => update('voiceId', id), [update]);
  const setVoiceDescription = useCallback((t: string) => update('voiceDescription', t), [update]);

  async function pickPhoto(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      report('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo'} access in Settings to add your plushie.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.9 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setPickedUri(uri);
    setCutoutUri(null);
    setUseCutout(true);
    setCutoutNote(null);
    setCutting(true);
    try {
      setCutoutUri((await cutOutPlushie(uri, api)).uri);
    } catch {
      setCutoutNote("Couldn't lift your plushie off this background. A photo on a plain background works best.");
    } finally {
      setCutting(false);
    }
  }

  async function writeWithAi() {
    if (idea.trim().length < 2 || drafting) return;
    setDrafting(true);
    try {
      const d = await api.draftPersona(idea.trim(), draft.dollName, draft.inspiration);
      // Only fill what the AI actually wrote; never wipe something the user typed.
      setDraft((cur) => ({
        ...cur,
        relationship: (d.relationship || cur.relationship).slice(0, LIMITS.relationship),
        personality: (d.personality || cur.personality).slice(0, LIMITS.personality),
        backstory: (d.backstory || cur.backstory).slice(0, LIMITS.backstory),
        voiceDescription: (d.voice_description || cur.voiceDescription).slice(0, LIMITS.voiceDescription),
      }));
    } catch (err) {
      report("Couldn't write that", (err as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    const error = validateProfile(draft);
    if (error) {
      report('Almost there', error);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      let { photoUri, photoIsCutout } = draft;
      if (pickedUri) {
        photoIsCutout = useCutout && !!cutoutUri;
        photoUri = await persistPhoto(photoIsCutout ? cutoutUri! : pickedUri);
      }
      await saveProfile({ ...draft, photoUri, photoIsCutout });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      report('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function confirmReset() {
    if (Platform.OS === 'web') {
      resetProfile();
      return;
    }
    Alert.alert('Start over?', 'This deletes your doll profile from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => resetProfile() },
    ]);
  }

  const showingCutout = pickedUri ? useCutout && !!cutoutUri : draft.photoIsCutout;
  const previewUri = pickedUri ? (showingCutout ? cutoutUri : pickedUri) : draft.photoUri;
  const accepted = !!draft.acceptedTermsAt;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <Section title="Your plushie" hint="Your plushie is lifted off the background automatically. A plain background works best.">
          <View style={styles.photoBox}>
            <PlushieAvatar source={previewUri} cutout={showingCutout} size={190} emotion={cutting ? 'thinking' : 'idle'} />
            {cutting && <Text style={styles.cutoutStatus}>Cutting out your plushie…</Text>}
          </View>
          <View style={styles.row}>
            <Button title="Gallery" icon="🖼️" variant="secondary" onPress={() => pickPhoto(false)} style={styles.flex} />
            {Platform.OS !== 'web' && (
              <>
                <View style={{ width: space.sm }} />
                <Button title="Camera" icon="📷" variant="secondary" onPress={() => pickPhoto(true)} style={styles.flex} />
              </>
            )}
          </View>
        </Section>

        {pickedUri && cutoutUri ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: useCutout }} onPress={() => setUseCutout((u) => !u)} style={styles.cutoutToggle}>
            <Text style={styles.cutoutToggleText}>{useCutout ? 'Background removed · Use original photo' : 'Original photo · Remove background'}</Text>
          </Pressable>
        ) : null}
        {cutoutNote ? <Text style={styles.cutoutNote}>{cutoutNote}</Text> : null}

        <Section title="Name">
          <Field value={draft.dollName} onChangeText={(t) => update('dollName', t)} placeholder="What's their name?" maxLength={LIMITS.dollName} />
        </Section>

        <Section title="Describe your doll" hint="Say it however you like. AI turns it into a full character you can edit below.">
          <Field value={idea} onChangeText={setIdea} placeholder="Anything goes: their vibe, quirks, how they talk to you…" multiline maxLength={600} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Write the rest with AI"
            onPress={writeWithAi}
            disabled={drafting || idea.trim().length < 2}
            style={({ pressed }) => [styles.aiBtn, pressed && { opacity: 0.8 }, (drafting || idea.trim().length < 2) && { opacity: 0.5 }]}>
            {drafting ? <ActivityIndicator color={colors.pinkDeep} /> : <Text style={styles.aiText}>✨  Write the rest with AI</Text>}
          </Pressable>
        </Section>

        <Section title="Look & vibe" hint="Optional: what inspires how they look and act">
          <Field value={draft.inspiration} onChangeText={(t) => update('inspiration', t)} placeholder="In your own words" maxLength={LIMITS.inspiration} />
        </Section>

        <Section title="Who they are to you">
          <Field value={draft.relationship} onChangeText={(t) => update('relationship', t)} placeholder="Describe your dynamic, your way" maxLength={LIMITS.relationship} />
        </Section>

        <Section title="Personality">
          <Field value={draft.personality} onChangeText={(t) => update('personality', t)} placeholder="How they act and talk" multiline maxLength={LIMITS.personality} />
        </Section>

        <Section title="Their backstory">
          <Field value={draft.backstory} onChangeText={(t) => update('backstory', t)} placeholder="Where they came from, what they love…" multiline maxLength={LIMITS.backstory} />
        </Section>

        <Section title="What they know about you" hint="Facts and memories your doll can bring up">
          <Field value={draft.memories} onChangeText={(t) => update('memories', t)} placeholder="Your life, favorites, inside jokes…" multiline maxLength={LIMITS.memories} />
          <Text style={styles.counter}>
            {draft.memories.length}/{LIMITS.memories}
          </Text>
        </Section>

        <Section title="Voice">
          <VoiceDesigner
            api={api}
            dollName={draft.dollName}
            description={draft.voiceDescription}
            onDescriptionChange={setVoiceDescription}
            voiceId={draft.voiceId}
            onVoiceIdChange={setVoiceId}
          />
        </Section>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          onPress={() => update('acceptedTermsAt', accepted ? null : new Date().toISOString())}
          style={styles.terms}>
          <View style={[styles.checkbox, accepted && styles.checkboxOn]}>{accepted && <Text style={styles.check}>✓</Text>}</View>
          <Text style={styles.termsText}>
            My doll is an original character I&apos;m creating. It isn&apos;t affiliated with or endorsed by any real person, group or
            company, and I&apos;m responsible for what I enter and generate.
          </Text>
        </Pressable>

        <Button title={showAdvanced ? 'Hide advanced' : 'Advanced settings'} variant="ghost" onPress={() => setShowAdvanced((s) => !s)} />
        {showAdvanced && (
          <>
            <Section title="ElevenLabs voice ID" hint="Paste an existing voice ID instead of designing one">
              <Field value={draft.voiceId} onChangeText={setVoiceId} placeholder="Voice ID" autoCapitalize="none" autoCorrect={false} maxLength={64} />
            </Section>
            <Section title="Server URL" hint={`Leave empty to use ${defaultApiUrl()}`}>
              <Field
                value={draft.apiUrl}
                onChangeText={(t) => update('apiUrl', t)}
                placeholder="https://your-backend.example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Section>
          </>
        )}

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button title={profile ? 'Save changes' : 'Bring my doll to life ✨'} onPress={save} loading={saving} />
        {profile && <Button title="Delete doll" variant="ghost" onPress={confirmReset} style={{ marginTop: space.sm }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md },
  photoBox: { alignItems: 'center', paddingVertical: space.lg, backgroundColor: colors.pinkSoft, borderRadius: radius.lg, marginBottom: space.md },
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 96 },
  counter: { alignSelf: 'flex-end', color: colors.inkSoft, fontSize: 12, marginTop: 4 },
  aiBtn: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.pinkSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    minWidth: 210,
    alignItems: 'center',
  },
  aiText: { color: colors.pinkDeep, fontWeight: '700' },
  terms: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.xs, marginBottom: space.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.pinkDeep, borderColor: colors.pinkDeep },
  check: { color: '#fff', fontWeight: '900', fontSize: 14 },
  termsText: { flex: 1, color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  cutoutStatus: { marginTop: space.sm, color: colors.pinkDeep, fontWeight: '600' },
  cutoutToggle: { alignSelf: 'center', paddingVertical: space.xs, paddingHorizontal: space.md, marginTop: -space.sm, marginBottom: space.md },
  cutoutToggleText: { color: colors.pinkDeep, fontWeight: '700', fontSize: 13 },
  cutoutNote: { color: colors.inkSoft, fontSize: 13, textAlign: 'center', marginTop: -space.sm, marginBottom: space.md, paddingHorizontal: space.md },
  formError: { color: colors.danger, fontWeight: '600', textAlign: 'center', marginBottom: space.sm },
});
