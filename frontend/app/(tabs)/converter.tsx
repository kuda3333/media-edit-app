import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { FileUp, FileVideo, Music, Image as ImageIcon, Download, Clapperboard } from 'lucide-react-native';
import { apiUpload, fileUrl, getToken } from '../../src/api/client';
import { colors, spacing, typography, radii } from '../../src/theme';

type Kind = 'video' | 'audio' | 'image';

const TARGETS: Record<Kind, { id: string; label: string }[]> = {
  video: [
    { id: 'mp4', label: 'MP4' }, { id: 'mov', label: 'MOV' }, { id: 'webm', label: 'WEBM' },
    { id: 'avi', label: 'AVI' }, { id: 'gif', label: 'GIF' }, { id: 'mp3', label: 'Audio Only (MP3)' },
  ],
  audio: [
    { id: 'mp3', label: 'MP3' }, { id: 'wav', label: 'WAV' }, { id: 'ogg', label: 'OGG' },
    { id: 'aac', label: 'AAC' }, { id: 'flac', label: 'FLAC' },
  ],
  image: [
    { id: 'png', label: 'PNG' }, { id: 'jpg', label: 'JPG' }, { id: 'webp', label: 'WEBP' },
    { id: 'gif', label: 'GIF' }, { id: 'bmp', label: 'BMP' },
  ],
};

const VIDEO_PRESETS = [
  { id: '', label: 'Original' },
  { id: '1080p', label: '1080p' }, { id: '720p', label: '720p' }, { id: '480p', label: '480p' },
  { id: 'square', label: '1:1' }, { id: 'vertical', label: '9:16' }, { id: '4k', label: '4K' },
];

function detectKind(ext: string): Kind {
  const v = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
  const a = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
  const i = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  const e = ext.toLowerCase().replace(/^\./, '');
  if (v.includes(e)) return 'video';
  if (a.includes(e)) return 'audio';
  if (i.includes(e)) return 'image';
  return 'video';
}

export default function Converter() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [target, setTarget] = useState<string>('mp4');
  const [preset, setPreset] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1);
  const [watermark, setWatermark] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ download_url: string; filename: string; size_bytes: number } | null>(null);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['video/*', 'audio/*', 'image/*'], copyToCacheDirectory: true });
    if (res.canceled) return;
    setFile(res.assets[0]);
    setResult(null);
    const ext = (res.assets[0].name.split('.').pop() || '').toLowerCase();
    const kind = detectKind(ext);
    setTarget(TARGETS[kind][0].id);
  };

  const kind: Kind = file ? detectKind((file.name.split('.').pop() || '').toLowerCase()) : 'video';
  const options = TARGETS[kind];

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(file.uri)).blob();
        form.append('file', new File([blob], file.name));
      } else {
        form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      }
      form.append('target_format', target);
      if (preset) form.append('preset', preset);
      if (speed !== 1) form.append('speed', String(speed));
      if (watermark) form.append('watermark', watermark);

      const res = await apiUpload<{ download_url: string; filename: string; size_bytes: number }>('/api/convert', form);
      setResult(res);
    } catch (e: any) {
      Alert.alert('Conversion failed', e.message || 'Unknown error');
    } finally { setBusy(false); }
  };

  const download = async () => {
    if (!result) return;
    const t = await getToken();
    const url = fileUrl(result.download_url) + `?token=${encodeURIComponent(t || '')}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }
    try {
      const tmp = `${FileSystem.cacheDirectory}${result.filename}`;
      const res = await FileSystem.downloadAsync(url, tmp);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri);
      } else {
        Alert.alert('Downloaded', `Saved to ${res.uri}`);
      }
    } catch (e: any) {
      Alert.alert('Download failed', e.message);
    }
  };

  const kindIcon = kind === 'video' ? FileVideo : kind === 'audio' ? Music : ImageIcon;
  const KindIcon = kindIcon;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <Text style={typography.overline}>TOOLBOX</Text>
        <Text style={[typography.h2, { marginTop: 2 }]}>Media Converter</Text>
        <Text style={[typography.small, { marginTop: spacing.xs }]}>
          Convert video · audio · images. Trim, resize, watermark.
        </Text>

        <TouchableOpacity testID="pick-file-button" style={styles.uploader} onPress={pick} activeOpacity={0.85}>
          {file ? (
            <View style={{ alignItems: 'center' }}>
              <KindIcon size={42} color={colors.brand} strokeWidth={1.5} />
              <Text style={[typography.h4, { marginTop: spacing.sm }]} numberOfLines={1}>{file.name}</Text>
              <Text style={typography.small}>{(file.size ? file.size / 1024 / 1024 : 0).toFixed(2)} MB</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <FileUp size={42} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[typography.h4, { marginTop: spacing.sm }]}>Tap to upload</Text>
              <Text style={typography.small}>Video, audio, or image file</Text>
            </View>
          )}
        </TouchableOpacity>

        {file && (
          <>
            <Section title="Target Format">
              <Row>
                {options.map((o) => (
                  <Chip key={o.id} label={o.label} active={target === o.id}
                    testID={`target-${o.id}`} onPress={() => setTarget(o.id)} />
                ))}
              </Row>
            </Section>

            {kind === 'video' && (target !== 'mp3') && (
              <>
                <Section title="Resolution / Aspect">
                  <Row>
                    {VIDEO_PRESETS.map((p) => (
                      <Chip key={p.id || 'orig'} label={p.label} active={preset === p.id}
                        testID={`preset-${p.id || 'original'}`} onPress={() => setPreset(p.id)} />
                    ))}
                  </Row>
                </Section>

                <Section title="Speed">
                  <Row>
                    {[0.5, 0.75, 1, 1.5, 2].map((s) => (
                      <Chip key={s} label={`${s}x`} active={speed === s}
                        testID={`speed-${s}`} onPress={() => setSpeed(s)} />
                    ))}
                  </Row>
                </Section>
              </>
            )}

            <TouchableOpacity testID="convert-button" style={[styles.btn, busy && { opacity: 0.6 }]}
              onPress={convert} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Clapperboard color="#fff" size={18} />
                  <Text style={styles.btnText}>Convert</Text>
                </>
              )}
            </TouchableOpacity>

            {result && (
              <View style={styles.resultCard}>
                <Text style={typography.h4}>Done!</Text>
                <Text style={[typography.small, { marginTop: 4 }]}>
                  {result.filename} · {(result.size_bytes / 1024 / 1024).toFixed(2)} MB
                </Text>
                <TouchableOpacity testID="download-converted-button" style={styles.dlBtn} onPress={download}>
                  <Download color={colors.textPrimary} size={18} />
                  <Text style={styles.dlText}>Download / Share</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={typography.overline}>{title}</Text>
      <View style={{ marginTop: spacing.sm }}>{children}</View>
    </View>
  );
}

function Row({ children }: any) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

function Chip({ label, active, onPress, testID }: any) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  uploader: {
    marginTop: spacing.lg, borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.borderStrong, borderRadius: radii.md,
    padding: spacing.xl, alignItems: 'center', backgroundColor: colors.surface,
    minHeight: 180, justifyContent: 'center',
  },
  chip: {
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
  },
  chipActive: { backgroundColor: 'rgba(225,29,72,0.15)', borderColor: colors.brand },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: colors.brand, fontWeight: '700' },
  btn: {
    marginTop: spacing.xl, backgroundColor: colors.brand, height: 56, borderRadius: radii.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resultCard: {
    marginTop: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surfaceElevated, borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
  },
  dlBtn: {
    marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 48, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong,
  },
  dlText: { color: colors.textPrimary, fontWeight: '600' },
});
