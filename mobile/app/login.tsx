/**
 * Login Screen — Email/password auth
 */

import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';

import { useAuth } from '@/lib/auth';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logo}>
            <Ionicons name="trending-up" size={28} color="#fff" />
          </View>
          <Text style={styles.appName}>QuantEdge</Text>
          <Text style={styles.tagline}>AI-Powered Trading Intelligence</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textDim}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={colors.textDim}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>
          Don't have an account? Visit quantedgelabs.net
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },

  logoSection: { alignItems: 'center', marginBottom: 48 },
  logo: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  appName: { fontSize: 32, fontWeight: '800', color: colors.text },
  tagline: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },

  form: { gap: spacing.lg },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  errorText: { fontSize: fontSize.sm, color: colors.red, flex: 1 },

  inputGroup: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  inputContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  input: { flex: 1, paddingVertical: 16, color: colors.text, fontSize: fontSize.md },

  loginButton: { backgroundColor: colors.emerald, borderRadius: borderRadius.lg, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },

  footer: { textAlign: 'center', fontSize: fontSize.sm, color: colors.textDim, marginTop: 32 },
});
