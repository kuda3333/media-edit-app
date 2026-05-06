import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../../src/theme';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!email || !password) {
      setErr('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1774392795592-a1302faf1118?crop=entropy&cs=srgb&fm=jpg&w=1200' }}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={typography.overline}>AI ANIMATION STUDIO</Text>
              <Text style={[typography.h1, { marginTop: spacing.sm }]}>
                Turn scripts{'\n'}into animated films.
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={[typography.h3, { marginBottom: spacing.md }]}>Sign in</Text>

              <Text style={typography.small}>Email</Text>
              <TextInput
                testID="login-email-input"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textDisabled}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />

              <Text style={[typography.small, { marginTop: spacing.md }]}>Password</Text>
              <TextInput
                testID="login-password-input"
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textDisabled}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}

              <TouchableOpacity
                testID="login-submit-button"
                style={[styles.btn, loading && { opacity: 0.6 }]}
                onPress={onSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity testID="go-to-signup-button" style={styles.ghostBtn}>
                  <Text style={styles.ghostText}>
                    Don&apos;t have an account? <Text style={{ color: colors.brand }}>Create one</Text>
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,10,0.65)' },
  scroll: { flexGrow: 1, justifyContent: 'space-between', padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginTop: spacing.xxl },
  form: {
    backgroundColor: colors.glass,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginTop: spacing.xl,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    color: colors.textPrimary,
    padding: spacing.md,
    height: 52,
    marginTop: spacing.xs,
  },
  err: { color: colors.statusError, marginTop: spacing.md },
  btn: {
    backgroundColor: colors.brand,
    height: 56,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  ghostBtn: { marginTop: spacing.md, alignItems: 'center', padding: spacing.sm },
  ghostText: { color: colors.textSecondary, fontSize: 14 },
});
