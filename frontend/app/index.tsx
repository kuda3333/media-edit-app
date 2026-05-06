import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { colors, spacing, typography } from '../src/theme';

export default function Index() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    if (user) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Text style={[typography.h1, styles.brand]}>AI Animation Studio</Text>
      <Text style={[typography.small, styles.tag]}>Script to Screen, Automatically.</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brand: { textAlign: 'center' },
  tag: { marginTop: spacing.sm, textAlign: 'center' },
});
