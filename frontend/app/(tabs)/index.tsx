import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Film, Clock, AlertCircle, CheckCircle2, Loader } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch, fileUrl, getToken } from '../../src/api/client';
import { colors, spacing, typography, radii } from '../../src/theme';

type Project = {
  project_id: string;
  title: string;
  style: string;
  status: string;
  overall_progress: number;
  current_module: string;
  scene_count: number;
  character_count: number;
  created_at: string;
  video_result?: { final_video_url?: string };
  art_result?: { backgrounds?: { file_url: string }[] };
};

function StatusBadge({ status, progress }: { status: string; progress: number }) {
  const map: Record<string, { bg: string; color: string; label: string; Icon: any }> = {
    queued: { bg: 'rgba(59,130,246,0.2)', color: colors.statusParsing, label: 'Queued', Icon: Clock },
    running: { bg: 'rgba(250,204,21,0.15)', color: colors.statusRendering, label: `${progress}%`, Icon: Loader },
    completed: { bg: 'rgba(16,185,129,0.15)', color: colors.statusDone, label: 'Ready', Icon: CheckCircle2 },
    failed: { bg: 'rgba(239,68,68,0.15)', color: colors.statusError, label: 'Failed', Icon: AlertCircle },
  };
  const cfg = map[status] || map.queued;
  const Icon = cfg.Icon;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Icon size={12} color={cfg.color} strokeWidth={2} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setTok] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      setTok(t);
      const data = await apiFetch<Project[]>('/api/projects');
      setProjects(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const running = projects.some((p) => p.status === 'running' || p.status === 'queued');
    if (!running) return;
    const id = setInterval(load, 3500);
    return () => clearInterval(id);
  }, [projects, load]);

  const renderItem = ({ item }: { item: Project }) => {
    const thumb = item.art_result?.backgrounds?.[0]?.file_url;
    const thumbUri = thumb && token ? fileUrl(thumb) + `?token=${encodeURIComponent(token)}` : null;
    return (
      <TouchableOpacity
        testID={`project-card-${item.project_id}`}
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/project/${item.project_id}`)}
      >
        <View style={styles.thumbWrap}>
          {thumbUri ? (
            <Image source={{ uri: thumbUri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Film size={40} color={colors.textDisabled} strokeWidth={1.2} />
            </View>
          )}
          <View style={styles.thumbGradient} />
          <View style={styles.thumbTopBar}>
            <StatusBadge status={item.status} progress={item.overall_progress} />
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={typography.h4} numberOfLines={1}>{item.title}</Text>
          <Text style={[typography.small, { marginTop: 4 }]}>
            {item.scene_count || 0} scenes · {item.character_count || 0} chars · {item.style.replace('_', ' ')}
          </Text>
          {item.status === 'running' && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${item.overall_progress}%` }]} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={typography.overline}>STUDIO</Text>
          <Text style={[typography.h2, { marginTop: 2 }]}>Hi {user?.name || 'Creator'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : projects.length === 0 ? (
        <View style={styles.empty}>
          <Film size={64} color={colors.textDisabled} strokeWidth={1} />
          <Text style={[typography.h3, { marginTop: spacing.lg, textAlign: 'center' }]}>
            Your stage is empty
          </Text>
          <Text style={[typography.small, { textAlign: 'center', marginTop: spacing.sm, maxWidth: 280 }]}>
            Paste a script, pick a style, and watch the AI roll camera.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="projects-list"
          data={projects}
          keyExtractor={(p) => p.project_id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.brand} />
          }
        />
      )}

      <TouchableOpacity
        testID="new-project-fab"
        style={styles.fab}
        onPress={() => router.push('/new-project')}
        activeOpacity={0.85}
      >
        <Plus color="#fff" size={28} strokeWidth={2} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  thumbWrap: { height: 180, position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  thumbGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  thumbTopBar: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  cardBody: { padding: spacing.md },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm, gap: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  progressTrack: { height: 4, backgroundColor: colors.borderSubtle, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brand },
  fab: {
    position: 'absolute', bottom: 96, right: spacing.lg,
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
