/**
 * Trade Desk Screen — AI trade ideas with multi-engine convergence
 */

import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';

import { getTradeIdeas } from '@/lib/api';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

type Filter = 'active' | 'all' | 'closed';

export default function TradeDeskScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);

  const { data: ideas, refetch } = useQuery({
    queryKey: ['trade-ideas', filter],
    queryFn: () => getTradeIdeas({ status: filter === 'all' ? undefined : filter }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const ideaList = Array.isArray(ideas) ? ideas : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Trade Desk</Text>
        <Text style={styles.subtitle}>AI-powered trade ideas from 6 engines</Text>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>TOTAL</Text>
          <Text style={styles.statValue}>{ideaList.length}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>LONG</Text>
          <Text style={[styles.statValue, { color: colors.green }]}>
            {ideaList.filter((i: any) => i.direction === 'LONG').length}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>SHORT</Text>
          <Text style={[styles.statValue, { color: colors.red }]}>
            {ideaList.filter((i: any) => i.direction === 'SHORT').length}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filters}>
        {(['active', 'all', 'closed'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Trade Ideas */}
      {ideaList.length > 0 ? (
        ideaList.map((idea: any, i: number) => (
          <Pressable
            key={idea.id || i}
            style={styles.ideaCard}
            onPress={() => router.push(`/stock/${idea.symbol}` as any)}
          >
            {/* Top row */}
            <View style={styles.ideaTop}>
              <View style={styles.ideaTopLeft}>
                <Text style={styles.ideaSymbol}>{idea.symbol}</Text>
                <View style={[styles.dirBadge, {
                  backgroundColor: idea.direction === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                  <Text style={[styles.dirText, {
                    color: idea.direction === 'LONG' ? colors.green : colors.red,
                  }]}>
                    {idea.direction}
                  </Text>
                </View>
              </View>
              <View style={styles.convergenceBadge}>
                <Text style={styles.convergenceText}>
                  {idea.engineCount || idea.convergenceScore || '?'}/6
                </Text>
              </View>
            </View>

            {/* Price levels */}
            <View style={styles.levels}>
              <View style={styles.level}>
                <Text style={styles.levelLabel}>Entry</Text>
                <Text style={styles.levelValue}>${idea.entryPrice || '—'}</Text>
              </View>
              <View style={styles.level}>
                <Text style={styles.levelLabel}>Target</Text>
                <Text style={[styles.levelValue, { color: colors.green }]}>${idea.targetPrice || '—'}</Text>
              </View>
              <View style={styles.level}>
                <Text style={styles.levelLabel}>Stop</Text>
                <Text style={[styles.levelValue, { color: colors.red }]}>${idea.stopLoss || '—'}</Text>
              </View>
            </View>

            {/* Bottom */}
            {idea.thesis && (
              <Text style={styles.ideaThesis} numberOfLines={2}>{idea.thesis}</Text>
            )}
          </Pressable>
        ))
      ) : (
        <View style={styles.empty}>
          <Ionicons name="flash-outline" size={40} color={colors.textDim} />
          <Text style={styles.emptyText}>No trade ideas right now</Text>
          <Text style={styles.emptySubtext}>Pull down to refresh</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  header: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },

  statsBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.textDim, letterSpacing: 1, marginBottom: 2 },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, height: 24, backgroundColor: colors.border },

  filters: { flexDirection: 'row', marginHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.lg },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: borderRadius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterTabActive: { backgroundColor: colors.emeraldBg, borderColor: colors.emeraldBorder },
  filterText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  filterTextActive: { color: colors.emerald },

  ideaCard: { marginHorizontal: spacing.xl, marginBottom: spacing.md, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  ideaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  ideaTopLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ideaSymbol: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  dirBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.sm },
  dirText: { fontSize: fontSize.xs, fontWeight: '800' },
  convergenceBadge: { backgroundColor: colors.emeraldBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.emeraldBorder },
  convergenceText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.emerald, fontVariant: ['tabular-nums'] },

  levels: { flexDirection: 'row', gap: spacing.md },
  level: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.sm, alignItems: 'center' },
  levelLabel: { fontSize: 9, fontWeight: '700', color: colors.textDim, letterSpacing: 0.5, marginBottom: 2 },
  levelValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

  ideaThesis: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 20 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: spacing.sm },
  emptyText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textMuted },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textDim },
});
