import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator,
  Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react-native';
import { apiFetch } from '../src/api/client';
import { colors, spacing, typography, radii, STYLE_OPTIONS } from '../src/theme';

const SAMPLE = `INT. COFFEE SHOP - DAY

Rain streaks down the window. MAYA, 28, stares at her laptop. Across the table, JESSE, 30, fidgets with a cup.

MAYA
You said you had news.

JESSE
I got in. The program in Paris.

MAYA
(quiet)
That's incredible.

EXT. CITY STREET - NIGHT

Neon reflects on wet pavement. Maya walks alone.

MAYA
(voice over)
Sometimes a yes changes everything.`;

const STEPS = ['Script', 'Style', 'Review'];

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('Untitled Project');
  const [script, setScript] = useState(SAMPLE);
  const [style, setStyle] = useState('flat_2d');
  const [submitting, setSubmitting] = useState(false);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const start = async () => {
    if (!script.trim()) { Alert.alert('Script required'); return; }
    setSubmitting(true);
    try {
      const proj = await apiFetch<{ project_id: string }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() || 'Untitled', script, style }),
      });
      router.replace(`/project/${proj.project_id}`);
    } catch (e: any) {
      Alert.alert('Failed to start', e.message || 'Error');
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity testID="wizard-back-button" style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={1.5} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={typography.overline}>NEW PROJECT</Text>
          <Text style={typography.h4}>{STEPS[step]}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.stepper}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={typography.small}>Project Title</Text>
              <TextInput
                testID="wizard-title-input"
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="My animated short"
                placeholderTextColor={colors.textDisabled}
              />

              <Text style={[typography.small, { marginTop: spacing.lg }]}>
                Script (use INT./EXT. headings & CHARACTER names in caps)
              </Text>
              <TextInput
                testID="wizard-script-input"
                style={[styles.input, styles.textarea]}
                multiline
                value={script}
                onChangeText={setScript}
                placeholder="INT. LOCATION - DAY..."
                placeholderTextColor={colors.textDisabled}
                textAlignVertical="top"
              />
              <Text style={[typography.small, { marginTop: spacing.sm }]}>
                ~{script.split(/\s+/).filter(Boolean).length} words · Runtime capped at 5 min
              </Text>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={typography.h3}>Pick an art style</Text>
              <Text style={[typography.small, { marginTop: spacing.xs }]}>
                Applied to all scenes and characters.
              </Text>
              <View style={styles.styleGrid}>
                {STYLE_OPTIONS.map((s) => (
                  <TouchableOpacity
                    testID={`style-${s.id}`}
                    key={s.id}
                    style={[styles.styleCard, style === s.id && styles.styleCardActive]}
                    onPress={() => setStyle(s.id)}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: s.image }} style={styles.styleImg} />
                    <View style={styles.styleOverlay} />
                    <Text style={styles.styleLabel}>{s.label}</Text>
                    {style === s.id && (
                      <View style={styles.styleCheck}>
                        <Check size={14} color="#fff" strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={typography.h3}>Ready to roll</Text>
              <Text style={[typography.small, { marginTop: spacing.xs }]}>
                Review and kick off the pipeline.
              </Text>
              <InfoRow label="Title" value={title || 'Untitled'} />
              <InfoRow label="Style" value={STYLE_OPTIONS.find((s) => s.id === style)?.label || style} />
              <InfoRow label="Script length" value={`${script.split(/\s+/).filter(Boolean).length} words`} />
              <View style={styles.pipelineCard}>
                <Sparkles size={20} color={colors.accent} strokeWidth={1.5} />
                <Text style={[typography.small, { marginLeft: spacing.sm, flex: 1 }]}>
                  Parser → Audio (edge-tts) → Art (Pollinations) → Video (ffmpeg/moviepy){'\n'}
                  You can monitor progress live on the next screen.
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 0 && (
            <TouchableOpacity testID="wizard-back-step" style={styles.btnGhost} onPress={back}>
              <ChevronLeft color={colors.textPrimary} size={18} />
              <Text style={styles.btnGhostText}>Back</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <TouchableOpacity testID="wizard-next-step" style={styles.btn} onPress={next}>
              <Text style={styles.btnText}>Next</Text>
              <ChevronRight color="#fff" size={18} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity testID="wizard-start-button" style={[styles.btn, submitting && { opacity: 0.6 }]}
              onPress={start} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Sparkles color="#fff" size={18} />
                  <Text style={styles.btnText}>Start Pipeline</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={typography.overline}>{label}</Text>
      <Text style={typography.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  iconBtn: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  stepDot: { flex: 1, height: 3, backgroundColor: colors.borderSubtle, borderRadius: 2 },
  stepDotActive: { backgroundColor: colors.brand },
  input: {
    marginTop: spacing.xs, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.sm,
    color: colors.textPrimary, padding: spacing.md, minHeight: 52,
  },
  textarea: { minHeight: 260 },
  styleGrid: { marginTop: spacing.lg, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  styleCard: {
    width: '48%', aspectRatio: 1, marginBottom: spacing.md,
    borderRadius: radii.md, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent',
    position: 'relative', backgroundColor: colors.surface,
  },
  styleCardActive: { borderColor: colors.brand },
  styleImg: { width: '100%', height: '100%' },
  styleOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  styleLabel: { position: 'absolute', bottom: 10, left: 12, color: '#fff', fontWeight: '700', fontSize: 14 },
  styleCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  infoRow: { marginTop: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  pipelineCard: {
    marginTop: spacing.xl, padding: spacing.md, flexDirection: 'row',
    backgroundColor: colors.surfaceElevated, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: spacing.md,
  },
  btn: {
    backgroundColor: colors.brand, height: 52, paddingHorizontal: spacing.lg,
    borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnGhost: { height: 52, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnGhostText: { color: colors.textPrimary, fontWeight: '600' },
});
