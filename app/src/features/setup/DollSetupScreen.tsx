import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Section } from '@/components/ui';
import { PlushieAvatar } from '@/features/doll/PlushieAvatar';
import { defaultApiUrl } from '@/lib/config';
import { type DollProfile, emptyProfile, RELATIONSHIPS, validateProfile, VIBES, type Vibe } from '@/lib/profile';
import { persistPhoto, useProfile } from '@/lib/profile-store';
import { colors, radius, space } from '@/lib/theme';

import { VoicePicker } from './VoicePicker';

export function DollSetupScreen() {
  const { profile, saveProfile, resetProfile, api } = useProfile();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DollProfile>(() => profile ?? emptyProfile());
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = useCallback(<K extends keyof DollProfile>(key: K, value: DollProfile[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);
  const setVoice = useCallback((id: string) => update('voiceId', id), [update]);

  async function pickPhoto(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo'} access in Settings to add your plushie.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) setPickedUri(result.assets[0].uri);
  }

  function toggleVibe(v: Vibe) {
    setDraft((d) => ({ ...d, vibes: d.vibes.includes(v) ? d.vibes.filter((x) => x !== v) : [...d.vibes, v] }));
  }

  async function save() {
    const error = validateProfile(draft);
    if (error) {
      Alert.alert('Almost there', error);
      return;
    }
    setSaving(true);
    try {
      const photoUri = pickedUri ? persistPhoto(pickedUri) : draft.photoUri;
      await saveProfile({ ...draft, photoUri });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function confirmReset() {
    Alert.alert('Start over?', 'This deletes your doll profile from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => resetProfile() },
    ]);
  }

  const previewUri = pickedUri ?? draft.photoUri;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled">
        <Section title="Your plushie" hint="A photo on a plain background looks cutest. Square crop works best.">
          <View style={styles.photoBox}>
            <PlushieAvatar source={previewUri} size={170} />
          </View>
          <View style={styles.row}>
            <Button title="Gallery" icon="🖼️" variant="secondary" onPress={() => pickPhoto(false)} style={styles.flex} />
            <View style={{ width: space.sm }} />
            <Button title="Camera" icon="📷" variant="secondary" onPress={() => pickPhoto(true)} style={styles.flex} />
          </View>
        </Section>

        <Section title="Doll name">
          <TextInput
            value={draft.dollName}
            onChangeText={(t) => update('dollName', t)}
            placeholder="e.g. Jinnie"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            maxLength={60}
            returnKeyType="next"
          />
        </Section>

        <Section title="Idol reference" hint="Who inspires their vibe? e.g. Felix, Jungkook, Custom OC">
          <TextInput
            value={draft.idolReference}
            onChangeText={(t) => update('idolReference', t)}
            placeholder="e.g. Felix"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            maxLength={80}
          />
        </Section>

        <Section title="Relationship dynamic">
          <View style={styles.chips}>
            {RELATIONSHIPS.map((r) => (
              <Chip key={r} label={r} selected={draft.relationship === r} onPress={() => update('relationship', r)} />
            ))}
          </View>
        </Section>

        <Section title="Vibe & quirks" hint="Pick as many as you like">
          <View style={styles.chips}>
            {VIBES.map((v) => (
              <Chip key={v} label={v} selected={draft.vibes.includes(v)} onPress={() => toggleVibe(v)} />
            ))}
          </View>
        </Section>

        <Section title="Custom details & memories" hint="Things your doll should know about you">
          <TextInput
            value={draft.memories}
            onChangeText={(t) => update('memories', t)}
            placeholder="I'm studying design, my favorite cafe is Blue Bottle, I hate cucumbers…"
            placeholderTextColor={colors.inkSoft}
            style={[styles.input, styles.multiline]}
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{draft.memories.length}/2000</Text>
        </Section>

        <Section title="Voice">
          <VoicePicker api={api} value={draft.voiceId} onChange={setVoice} />
        </Section>

        <Button
          title={showAdvanced ? 'Hide advanced' : 'Advanced settings'}
          variant="ghost"
          onPress={() => setShowAdvanced((s) => !s)}
        />
        {showAdvanced && (
          <Section title="Server URL" hint={`Leave empty to use ${defaultApiUrl()}`}>
            <TextInput
              value={draft.apiUrl}
              onChangeText={(t) => update('apiUrl', t)}
              placeholder="https://your-backend.example.com"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Section>
        )}

        <Button title={profile ? 'Save changes' : 'Bring my doll to life ✨'} onPress={save} loading={saving} />
        {profile && <Button title="Delete doll" variant="ghost" onPress={confirmReset} style={{ marginTop: space.sm }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md },
  photoBox: {
    alignItems: 'center',
    paddingVertical: space.lg,
    backgroundColor: colors.pinkSoft,
    borderRadius: radius.lg,
    marginBottom: space.md,
  },
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
  multiline: { minHeight: 110 },
  counter: { alignSelf: 'flex-end', color: colors.inkSoft, fontSize: 12, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
