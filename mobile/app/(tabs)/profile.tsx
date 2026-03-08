/**
 * Profile Screen — User info, settings, and account management
 */

import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useAuth } from '@/lib/auth';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
  color = colors.textSecondary,
  showArrow = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
  showArrow?: boolean;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.menuInfo}>
        <Text style={[styles.menuLabel, { color: color === colors.red ? colors.red : colors.text }]}>
          {label}
        </Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const userData = user as any;
  const initials = userData?.firstName?.[0]?.toUpperCase() || userData?.email?.[0]?.toUpperCase() || 'U';

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await logout();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{userData?.firstName || 'Trader'}</Text>
        <Text style={styles.email}>{userData?.email || ''}</Text>
        {userData?.hasBetaAccess && (
          <View style={styles.betaBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.emerald} />
            <Text style={styles.betaText}>Beta Access</Text>
          </View>
        )}
      </View>

      {/* Trading Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TRADING</Text>
        <View style={styles.menuCard}>
          <MenuItem
            icon="wallet-outline"
            label="Portfolio"
            subtitle="Track your trading performance"
            onPress={() => {/* TODO: navigate to portfolio */}}
          />
          <MenuItem
            icon="star-outline"
            label="Watchlist"
            subtitle="Your saved stocks"
            onPress={() => {/* TODO: navigate to watchlist */}}
          />
          <MenuItem
            icon="time-outline"
            label="Trade History"
            subtitle="Past trades and results"
            onPress={() => {/* TODO: navigate to history */}}
          />
        </View>
      </View>

      {/* Learn Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LEARN</Text>
        <View style={styles.menuCard}>
          <MenuItem
            icon="school-outline"
            label="Academy"
            subtitle="Trading education and guides"
            onPress={() => {/* TODO: navigate to academy */}}
          />
          <MenuItem
            icon="book-outline"
            label="Blog"
            subtitle="Market analysis and insights"
            onPress={() => {/* TODO: navigate to blog */}}
          />
        </View>
      </View>

      {/* App Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>APP</Text>
        <View style={styles.menuCard}>
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            subtitle="Push notification preferences"
            onPress={() => {/* TODO */}}
          />
          <MenuItem
            icon="information-circle-outline"
            label="About"
            subtitle="QuantEdge Labs v1.0.0"
            onPress={() => {/* TODO */}}
          />
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        <View style={styles.menuCard}>
          <MenuItem
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            color={colors.red}
            showArrow={false}
          />
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>QuantEdge Labs v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 60 },

  header: { alignItems: 'center', paddingTop: 70, paddingBottom: spacing.xxl },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  avatarText: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  name: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  email: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
  betaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.full, backgroundColor: colors.emeraldBg, borderWidth: 1, borderColor: colors.emeraldBorder },
  betaText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.emerald },

  section: { marginHorizontal: spacing.xl, marginBottom: spacing.xl },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textDim, letterSpacing: 1.5, marginBottom: spacing.sm },
  menuCard: { backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  menuIcon: { width: 36, height: 36, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  menuInfo: { flex: 1 },
  menuLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  menuSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  footer: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textDim, marginTop: spacing.xl },
});
