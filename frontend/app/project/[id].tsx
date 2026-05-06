import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ChevronLeft, RefreshCw, Download, Share2, CheckCircle2, AlertCircle,
  FileText, Music, Image as ImageIcon, Clapperboard, Clock, Loader,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiFetch, fileUrl, getToken } from '../../src/api/client';
import { colors, spacing, typography, radii } from '../../src/theme';

type Project = any;

const MODULES = [
  { id: 'parse', name: 'Parse', icon: FileText, desc: 'Script breakdown' },
  { id: 'audio', name: 'Audio', icon: Music, desc: 'TTS voices + mix' },
  { id: 'art', name: 'Art', icon: ImageIcon, desc: 'Backgrounds & characters' },
  { id: 'video', name: 'Video', icon: Clapperboard, desc: 'Assemble & encode' },
];

function moduleState(project: Project | null, id: string) {
  if (!project) return 'pending';
  const order = ['parse', 'audio', 'art', 'video'];
  const currentIdx = order.indexOf(project.current_module);
  const thisIdx = order.indexOf(id);
  if (project.status === 'failed' && project.current_module === id) return 'failed';
  if (project.status === 'completed') return 'done';
  if (thisIdx < currentIdx) return 'done';
  if (thisIdx === currentIdx) return 'running';
  return 'pending';
}

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      setTok(t);
      const p = await apiFetch<Project>(`/api/projects/${id}`);
      setProject(p);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!project) return;
    if (project.status === 'completed' || project.status === 'failed') return;
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [project, load]);

  const retry = async () => {
    try {
      await apiFetch(`/api/projects/${id}/retry`, { method: 'POST' });
      load();
    } catch (e: any) {
      Alert.alert('Retry failed', e.message);
    }
  };

  const withTok = (u: string) => (u && token ? fileUrl(u) + `?token=${encodeURIComponent(token)}` : '');

  const downloadVideo = async () => {
    const u = project?.video_result?.final_video_url;
    if (!u) return;
    const url = withTok(u);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
      return;
    }
    try {
      const tmp = `${FileSystem.cacheDirectory}${id}.mp4`;
      const res = await FileSystem.downloadAsync(url, tmp);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
    } catch (e: any) { Alert.alert('Download failed', e.message); }
  };

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const bgs = project.art_result?.backgrounds || [];
  const chars = project.art_result?.character_sheets || [];
  const scenes = project.parsed?.scenes || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity testID="project-back-button" style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={1.5} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={typography.overline}>{project.style.replace('_', ' ').toUpperCase()}</Text>
          <Text style={typography.h4} numberOfLines={1}>{project.title}</Text>
        </View>
        {project.status === 'failed' && (
          <TouchableOpacity testID="project-retry-button" style={styles.iconBtn} onPress={retry}>
            <RefreshCw color={colors.brand} size={22} strokeWidth={1.5} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <View style={styles.progressCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={typography.h2}>{project.overall_progress}%</Text>
            <StatusPill status={project.status} />
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${project.overall_progress}%` }]} />
          </View>
          <Text style={[typography.small, { marginTop: 4 }]}>
            {project.scene_count} scenes · {project.character_count} characters
          </Text>
        </View>

        <Text style={[typography.overline, { marginTop: spacing.xl }]}>PIPELINE</Text>
        <View style={{ marginTop: spacing.sm }}>
          {MODULES.map((m, i) => {
            const state = moduleState(project, m.id);
            const Icon = m.icon;
            const color = state === 'done' ? colors.statusDone
              : state === 'running' ? colors.statusRendering
              : state === 'failed' ? colors.statusError
              : colors.textDisabled;
            return (
              <View key={m.id} style={styles.node}>
                <View style={[styles.nodeDot, { borderColor: color }]}>
                  {state === 'done' ? <CheckCircle2 size={16} color={color} strokeWidth={2} />
                    : state === 'running' ? <Loader size={16} color={color} strokeWidth={2} />
                    : state === 'failed' ? <AlertCircle size={16} color={color} strokeWidth={2} />
                    : <Clock size={16} color={color} strokeWidth={1.5} />}
                </View>
                {i < MODULES.length - 1 && <View style={[styles.nodeLine, { backgroundColor: state === 'done' ? color : colors.borderSubtle }]} />}
                <View style={styles.nodeBody}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon size={16} color={color} strokeWidth={1.5} />
                    <Text style={[typography.h4, { color }]}>{m.name}</Text>
                  </View>
                  <Text style={typography.small}>{m.desc}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {project.error && (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color={colors.statusError} />
            <Text style={[typography.small, { color: colors.statusError, flex: 1 }]}>
              {project.error}
            </Text>
          </View>
        )}

        <Text style={[typography.overline, { marginTop: spacing.xl }]}>CONSOLE</Text>
        <View style={styles.console}>
          {(project.logs || []).slice(-12).map((l: any, idx: number) => (
            <Text key={idx} style={styles.consoleLine}>
              [{l.module}] {l.message} {l.progress >= 0 ? `(${l.progress}%)` : ''}
            </Text>
          ))}
          {(!project.logs || project.logs.length === 0) && (
            <Text style={styles.consoleLine}>waiting for pipeline...</Text>
          )}
        </View>

        {chars.length > 0 && (
          <>
            <Text style={[typography.overline, { marginTop: spacing.xl }]}>CAST</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
              {chars.map((c: any, idx: number) => (
                <View key={idx} style={styles.charCard}>
                  <Image source={{ uri: withTok(c.file_url) }} style={styles.charImg} />
                  <Text style={[typography.small, { color: colors.textPrimary, marginTop: 6 }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {bgs.length > 0 && scenes.length > 0 && (
          <>
            <Text style={[typography.overline, { marginTop: spacing.xl }]}>SCENES</Text>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
              {scenes.map((sc: any, idx: number) => {
                const bg = bgs.find((b: any) => b.scene_id === sc.id);
                return (
                  <View key={sc.id} style={styles.sceneCard}>
                    {bg && <Image source={{ uri: withTok(bg.file_url) }} style={styles.sceneImg} />}
                    <View style={styles.sceneBody}>
                      <Text style={typography.overline}>{sc.time_of_day?.toUpperCase() || 'SCENE'} · {sc.mood?.toUpperCase()}</Text>
                      <Text style={[typography.h4, { marginTop: 4 }]} numberOfLines={2}>
                        {sc.heading}
                      </Text>
                      {sc.dialogue?.slice(0, 2).map((d: any) => (
                        <Text key={d.id} style={[typography.small, { marginTop: 6 }]} numberOfLines={2}>
                          <Text style={{ color: colors.brand, fontWeight: '700' }}>{d.character}: </Text>
                          {d.text}
                        </Text>
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        {project.status === 'completed' && project.video_result?.final_video_url && (
          <View style={styles.finalCard}>
            <Text style={typography.h3}>Your film is ready</Text>
            <Text style={[typography.small, { marginTop: 4 }]}>
              {project.video_result.duration_sec?.toFixed(1)}s · {project.video_result.resolution} · {project.video_result.fps}fps
            </Text>
            <TouchableOpacity testID="download-video-button" style={styles.bigBtn} onPress={downloadVideo}>
              <Download color="#fff" size={20} />
              <Text style={styles.bigBtnText}>Download / Share</Text>
            </TouchableOpacity>
            {project.video_result.vertical_video_url && (
              <TouchableOpacity testID="download-vertical-button" style={[styles.bigBtn, styles.bigBtnAlt]}
                onPress={async () => {
                  const u = withTok(project.video_result.vertical_video_url);
                  if (Platform.OS === 'web') { window.open(u, '_blank'); return; }
                  const tmp = `${FileSystem.cacheDirectory}${id}_vertical.mp4`;
                  try {
                    const r = await FileSystem.downloadAsync(u, tmp);
                    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(r.uri);
                  } catch (e: any) { Alert.alert('Failed', e.message); }
                }}>
                <Share2 color={colors.textPrimary} size={20} />
                <Text style={[styles.bigBtnText, { color: colors.textPrimary }]}>Get 9:16 (TikTok/Reels)</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: any = {
    queued: { bg: 'rgba(59,130,246,0.2)', c: colors.statusParsing, t: 'QUEUED' },
    running: { bg: 'rgba(250,204,21,0.15)', c: colors.statusRendering, t: 'RENDERING' },
    completed: { bg: 'rgba(16,185,129,0.15)', c: colors.statusDone, t: 'READY' },
    failed: { bg: 'rgba(239,68,68,0.15)', c: colors.statusError, t: 'FAILED' },
  };
  const cfg = map[status] || map.queued;
  return <Text style={{ backgroundColor: cfg.bg, color: cfg.c, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{cfg.t}</Text>;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  iconBtn: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  progressCard: {
    backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  progressTrack: { height: 6, backgroundColor: colors.borderSubtle, borderRadius: 3, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brand },
  node: { flexDirection: 'row', paddingVertical: spacing.md, position: 'relative' },
  nodeDot: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  nodeLine: { position: 'absolute', left: 15, top: 48, bottom: 0, width: 2 },
  nodeBody: { flex: 1, marginLeft: spacing.md, justifyContent: 'center' },
  errorBox: { flexDirection: 'row', gap: 8, padding: spacing.md, marginTop: spacing.md,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: radii.sm },
  console: {
    marginTop: spacing.sm, padding: spacing.md,
    backgroundColor: '#000', borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderSubtle, maxHeight: 220,
  },
  consoleLine: { color: '#7ef27e', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, lineHeight: 16 },
  charCard: { width: 92, marginRight: spacing.md, alignItems: 'center' },
  charImg: { width: 92, height: 120, borderRadius: radii.sm, backgroundColor: colors.surface, resizeMode: 'cover' },
  sceneCard: {
    width: 300, marginRight: spacing.md, backgroundColor: colors.surface,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle, overflow: 'hidden',
  },
  sceneImg: { width: '100%', height: 170, backgroundColor: '#000' },
  sceneBody: { padding: spacing.md },
  finalCard: {
    marginTop: spacing.xl, padding: spacing.lg, backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
  },
  bigBtn: {
    marginTop: spacing.md, height: 56, backgroundColor: colors.brand, borderRadius: radii.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  bigBtnAlt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  bigBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
