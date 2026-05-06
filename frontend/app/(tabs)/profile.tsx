import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Mail, User as UserIcon, Film } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../../src/theme';

export default function Profile() {
  const { user, logout } = useAuth();
  const initials = (user?.name || user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.container}>
        <Text style={typography.overline}>ACCOUNT</Text>
        <Text style={[typography.h2, { marginTop: 2 }]}>Profile</Text>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[typography.h3, { marginTop: spacing.md }]}>{user?.name || 'Creator'}</Text>
          <View style={styles.row}>
            <Mail size={14} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={typography.small}>{user?.email}</Text>
          </View>
          <View style={styles.row}>
            <UserIcon size={14} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={typography.small}>Role: {user?.role}</Text>
          </View>
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <View style={styles.inlineRow}>
            <Film size={18} color={colors.brand} strokeWidth={1.5} />
            <Text style={[typography.h4, { marginLeft: spacing.sm }]}>About</Text>
          </View>
          <Text style={[typography.small, { marginTop: spacing.sm, lineHeight: 20 }]}>
            AI Animation Studio orchestrates a full open-source pipeline: script parsing, multi-voice TTS,
            AI art generation, and video assembly — all from your phone.
          </Text>
        </View>

        <TouchableOpacity testID="logout-button" style={styles.logoutBtn} onPress={logout}>
          <LogOut color={colors.statusError} size={18} strokeWidth={1.8} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, flex: 1 },
  card: {
    marginTop: spacing.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.lg, borderRadius: radii.md,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  logoutBtn: {
    marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: radii.sm,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)',
  },
  logoutText: { color: colors.statusError, fontWeight: '700' },
});
