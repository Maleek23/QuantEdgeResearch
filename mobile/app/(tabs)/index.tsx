/**
 * Home Screen — Morning briefing, market overview, quick actions
 */

import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';

import { useAuth } from '@/lib/auth';
import { getMorningBriefing, getMarketBatch, getTradeIdeas } from '@/lib/api';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function MarketStatusBadge() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const hour = etTime.getHours();
  const min = etTime.getMinutes();
  const t = hour * 60 + min;
  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && t >= 570 && t < 960;

  return (
    <View style={[styles.statusBadge, { backgroundColor: isOpen ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)' }]}>
      <View style={[styles.statusDot, { backgroundColor: isOpen ? colors.emerald : colors.textMuted }]} />
      <Text style={[styles.statusText, { color: isOpen ? colors.emeraldLight : colors.textMuted }]}>
        {isOpen ? 'Market Open' : 'Market Closed'}
      </Text>
    </View>
  );
}

function QuickActions() {
  const router = useRouter();
  const actions = [
    { label: 'Trade Desk', icon: 'flash-outline' as const, route: '/(tabs)/trade-desk' },
    { label: 'Markets', icon: 'bar-chart-outline' as const, route: '/(tabs)/markets' },
    { label: 'Charts', icon: 'trending-up-outline' as const, route: '/(tabs)/charts' },
    { label: 'Scanner', icon: 'search-outline' as const, route: '/(tabs)/markets' },
  ];

  return (
    <View style={styles.quickActions}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          style={styles.quickAction}
          onPress={() => router.push(action.route as any)}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name={action.icon} size={20} color={colors.emerald} />
          </View>
          <Text style={styles.quickActionLabel}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: briefing, refetch: refetchBriefing } = useQuery({
    queryKey: ['morning-briefing'],
    queryFn: getMorningBriefing,
  });

  const { data: marketData, refetch: refetchMarket } = useQuery({
    queryKey: ['market-batch', 'SPY,QQQ,DIA,IWM,^VIX'],
    queryFn: () => getMarketBatch('SPY,QQQ,DIA,IWM,^VIX'),
    refetchInterval: 30000,
  });

  const { data: ideas, refetch: refetchIdeas } = useQuery({
    queryKey: ['trade-ideas-home'],
    queryFn: () => getTradeIdeas({ limit: 3, status: 'active' }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBriefing(), refetchMarket(), refetchIdeas()]);
    setRefreshing(false);
  }, []);

  const indices = [
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'QQQ', name: 'Nasdaq' },
    { symbol: 'DIA', name: 'Dow' },
    { symbol: 'IWM', name: 'Russell' },
    { symbol: '^VIX', name: 'VIX' },
  ];

  const firstName = (user as any)?.firstName || 'Trader';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.emerald}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{getGreeting()}, {firstName}</Text>
        <View style={styles.headerRow}>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <MarketStatusBadge />
        </View>
      </View>

      {/* Quick Actions */}
      <QuickActions />

      {/* Morning Briefing */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sunny-outline" size={18} color={colors.emerald} />
          <Text style={styles.cardTitle}>Morning Briefing</Text>
        </View>
        {briefing ? (
          <>
            <Text style={styles.briefingSentiment}>
              {briefing.sentiment === 'bullish' ? '🟢' : briefing.sentiment === 'bearish' ? '🔴' : '🟡'}{' '}
              {briefing.sentiment?.charAt(0).toUpperCase() + briefing.sentiment?.slice(1)}
            </Text>
            <Text style={styles.cardBody} numberOfLines={4}>
              {briefing.summary || briefing.content || 'Check back during market hours.'}
            </Text>
          </>
        ) : (
          <Text style={styles.cardBody}>Morning briefing unavailable. Check back soon.</Text>
        )}
      </View>

      {/* Market Overview */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="globe-outline" size={18} color={colors.emerald} />
          <Text style={styles.cardTitle}>Market Overview</Text>
        </View>
        {indices.map((idx) => {
          const quote = marketData?.quotes?.[idx.symbol];
          const change = quote?.regularMarketChangePercent ?? 0;
          const price = quote?.regularMarketPrice;
          return (
            <Pressable
              key={idx.symbol}
              style={styles.marketRow}
              onPress={() => router.push(`/stock/${idx.symbol}` as any)}
            >
              <View>
                <Text style={styles.marketSymbol}>{idx.symbol.replace('^', '')}</Text>
                <Text style={styles.marketName}>{idx.name}</Text>
              </View>
              <View style={styles.marketRight}>
                {price && <Text style={styles.marketPrice}>${price.toFixed(2)}</Text>}
                <Text style={[styles.marketChange, { color: change >= 0 ? colors.green : colors.red }]}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Latest Trade Ideas */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="flash-outline" size={18} color={colors.emerald} />
          <Text style={styles.cardTitle}>Latest Trade Ideas</Text>
          <Pressable onPress={() => router.push('/(tabs)/trade-desk')} style={styles.seeAll}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.emerald} />
          </Pressable>
        </View>
        {ideas && Array.isArray(ideas) && ideas.length > 0 ? (
          ideas.slice(0, 3).map((idea: any, i: number) => (
            <View key={idea.id || i} style={styles.ideaRow}>
              <View style={styles.ideaLeft}>
                <Text style={styles.ideaSymbol}>{idea.symbol}</Text>
                <View style={[styles.ideaDirection, {
                  backgroundColor: idea.direction === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                  <Text style={[styles.ideaDirectionText, {
                    color: idea.direction === 'LONG' ? colors.green : colors.red,
                  }]}>
                    {idea.direction}
                  </Text>
                </View>
              </View>
              <Text style={styles.ideaEngines}>{idea.engineCount || idea.convergenceScore || '-'}/6</Text>
            </View>
          ))
        ) : (
          <Text style={styles.cardBody}>No active trade ideas right now.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  header: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.lg },
  greeting: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  date: { fontSize: fontSize.sm, color: colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.full },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },

  quickActions: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.xl },
  quickAction: { flex: 1, alignItems: 'center', gap: 6 },
  quickActionIcon: { width: 48, height: 48, borderRadius: borderRadius.lg, backgroundColor: colors.emeraldBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.emeraldBorder },
  quickActionLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },

  card: { marginHorizontal: spacing.xl, marginBottom: spacing.lg, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, flex: 1 },
  cardBody: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22 },

  briefingSentiment: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },

  marketRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  marketSymbol: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  marketName: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  marketRight: { alignItems: 'flex-end' },
  marketPrice: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  marketChange: { fontSize: fontSize.sm, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 2 },

  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: fontSize.sm, color: colors.emerald, fontWeight: '600' },

  ideaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  ideaLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ideaSymbol: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  ideaDirection: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm },
  ideaDirectionText: { fontSize: fontSize.xs, fontWeight: '700' },
  ideaEngines: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
});
