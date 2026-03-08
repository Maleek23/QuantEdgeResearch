/**
 * Stock Detail Screen — Quote data, chart placeholder, AI analysis
 */

import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';

import { getStockQuote, addToWatchlist } from '@/lib/api';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function StockDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: quoteData, refetch } = useQuery({
    queryKey: ['stock-quote', symbol],
    queryFn: () => getStockQuote(symbol || ''),
    enabled: !!symbol,
    refetchInterval: 15000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const quote = quoteData?.quote || quoteData;
  const price = quote?.regularMarketPrice;
  const change = quote?.regularMarketChange;
  const changePct = quote?.regularMarketChangePercent;
  const isUp = (changePct ?? 0) >= 0;
  const name = quote?.shortName || quote?.longName || symbol;

  const stats = [
    { label: 'Open', value: quote?.regularMarketOpen },
    { label: 'High', value: quote?.regularMarketDayHigh },
    { label: 'Low', value: quote?.regularMarketDayLow },
    { label: 'Volume', value: quote?.regularMarketVolume },
    { label: 'Prev Close', value: quote?.regularMarketPreviousClose },
    { label: 'Mkt Cap', value: quote?.marketCap },
  ];

  const handleAddWatchlist = async () => {
    try {
      await addToWatchlist(symbol || '');
    } catch {
      // silently fail
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: symbol?.toUpperCase() || 'Stock',
          headerRight: () => (
            <Pressable onPress={handleAddWatchlist} style={{ marginRight: 8 }}>
              <Ionicons name="star-outline" size={22} color={colors.emerald} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
        }
      >
        {/* Price Header */}
        <View style={styles.priceSection}>
          <Text style={styles.stockName}>{name}</Text>
          <Text style={styles.price}>
            {price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </Text>
          <View style={styles.changeRow}>
            <Ionicons
              name={isUp ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={isUp ? colors.green : colors.red}
            />
            <Text style={[styles.changeText, { color: isUp ? colors.green : colors.red }]}>
              {change ? `$${Math.abs(change).toFixed(2)}` : '—'} ({changePct ? `${Math.abs(changePct).toFixed(2)}%` : '—'})
            </Text>
          </View>
        </View>

        {/* Chart Placeholder */}
        <View style={styles.chartPlaceholder}>
          <Ionicons name="analytics-outline" size={48} color={colors.textDim} />
          <Text style={styles.chartText}>Interactive chart coming soon</Text>
          <Text style={styles.chartSubtext}>View full charts at quantedgelabs.net</Text>
        </View>

        {/* Key Stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Key Statistics</Text>
          <View style={styles.statsGrid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statItem}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>
                  {stat.value !== undefined && stat.value !== null
                    ? typeof stat.value === 'number'
                      ? stat.label === 'Volume'
                        ? (stat.value / 1e6).toFixed(1) + 'M'
                        : stat.label === 'Mkt Cap'
                          ? stat.value >= 1e12
                            ? (stat.value / 1e12).toFixed(2) + 'T'
                            : (stat.value / 1e9).toFixed(1) + 'B'
                          : '$' + stat.value.toFixed(2)
                      : String(stat.value)
                    : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionButton} onPress={handleAddWatchlist}>
            <Ionicons name="star-outline" size={18} color={colors.emerald} />
            <Text style={styles.actionText}>Watchlist</Text>
          </Pressable>
          <Pressable style={styles.actionButton}>
            <Ionicons name="share-outline" size={18} color={colors.emerald} />
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
          <Pressable style={styles.actionButton}>
            <Ionicons name="notifications-outline" size={18} color={colors.emerald} />
            <Text style={styles.actionText}>Alert</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },

  priceSection: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  stockName: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 4 },
  price: { fontSize: fontSize.hero, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  changeText: { fontSize: fontSize.md, fontWeight: '700', fontVariant: ['tabular-nums'] },

  chartPlaceholder: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, marginBottom: spacing.xl },
  chartText: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.md },
  chartSubtext: { fontSize: fontSize.xs, color: colors.textDim, marginTop: 4 },

  card: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.xl },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statItem: { width: '50%', paddingVertical: spacing.sm },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  statValue: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'], marginTop: 2 },

  actionsRow: { flexDirection: 'row', marginHorizontal: spacing.xl, gap: spacing.md },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  actionText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.emerald },
});
