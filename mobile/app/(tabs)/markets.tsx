/**
 * Markets Screen — Real-time market data across asset classes
 */

import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';

import { getMarketBatch } from '@/lib/api';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const MARKET_SYMBOLS = 'SPY,QQQ,DIA,IWM,^VIX,AAPL,MSFT,NVDA,TSLA,AMZN,GOOGL,META,BTC-USD,ETH-USD,GLD,USO,TLT';

type Category = 'indices' | 'tech' | 'crypto' | 'commodities';

const categories: { key: Category; label: string }[] = [
  { key: 'indices', label: 'Indices' },
  { key: 'tech', label: 'Tech' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'commodities', label: 'Other' },
];

const symbolMap: Record<Category, { symbol: string; name: string }[]> = {
  indices: [
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'QQQ', name: 'Nasdaq 100' },
    { symbol: 'DIA', name: 'Dow Jones' },
    { symbol: 'IWM', name: 'Russell 2000' },
    { symbol: '^VIX', name: 'Volatility' },
  ],
  tech: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'META', name: 'Meta' },
  ],
  crypto: [
    { symbol: 'BTC-USD', name: 'Bitcoin' },
    { symbol: 'ETH-USD', name: 'Ethereum' },
  ],
  commodities: [
    { symbol: 'GLD', name: 'Gold' },
    { symbol: 'USO', name: 'Oil' },
    { symbol: 'TLT', name: '20Y Treasury' },
  ],
};

export default function MarketsScreen() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<Category>('indices');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: marketData, refetch } = useQuery({
    queryKey: ['market-batch-all', MARKET_SYMBOLS],
    queryFn: () => getMarketBatch(MARKET_SYMBOLS),
    refetchInterval: 15000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/stock/${searchQuery.trim().toUpperCase()}` as any);
      setSearchQuery('');
    }
  };

  const currentSymbols = symbolMap[activeCategory];

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
        <Text style={styles.title}>Markets</Text>
        <Text style={styles.subtitle}>Real-time market data</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search any stock or crypto..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="characters"
        />
      </View>

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {categories.map((cat) => (
          <Pressable
            key={cat.key}
            style={[styles.tab, activeCategory === cat.key && styles.tabActive]}
            onPress={() => setActiveCategory(cat.key)}
          >
            <Text style={[styles.tabText, activeCategory === cat.key && styles.tabTextActive]}>
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Market Data */}
      <View style={styles.list}>
        {currentSymbols.map((item) => {
          const quote = marketData?.quotes?.[item.symbol];
          const price = quote?.regularMarketPrice;
          const change = quote?.regularMarketChangePercent ?? 0;
          const isUp = change >= 0;

          return (
            <Pressable
              key={item.symbol}
              style={styles.row}
              onPress={() => router.push(`/stock/${item.symbol}` as any)}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowSymbol}>{item.symbol.replace('^', '').replace('-USD', '')}</Text>
                <Text style={styles.rowName}>{item.name}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowPrice}>
                  {price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                </Text>
                <View style={[styles.changeBadge, { backgroundColor: isUp ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                  <Ionicons
                    name={isUp ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={isUp ? colors.green : colors.red}
                  />
                  <Text style={[styles.changeText, { color: isUp ? colors.green : colors.red }]}>
                    {Math.abs(change).toFixed(2)}%
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  header: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  searchInput: { flex: 1, paddingVertical: 14, paddingHorizontal: spacing.sm, color: colors.text, fontSize: fontSize.md },

  tabs: { marginBottom: spacing.lg },
  tabsContent: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: borderRadius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.emeraldBg, borderColor: colors.emeraldBorder },
  tabText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.emerald },

  list: { marginHorizontal: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  rowLeft: { flex: 1 },
  rowSymbol: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  rowName: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowPrice: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.sm },
  changeText: { fontSize: fontSize.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
