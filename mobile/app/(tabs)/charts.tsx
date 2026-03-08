/**
 * Charts Screen — Stock search + quick chart view
 */

import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const popularStocks = [
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'Nasdaq 100' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'ETH-USD', name: 'Ethereum' },
];

const recentSearches = ['NVDA', 'TSLA', 'SPY', 'AAPL'];

export default function ChartsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/stock/${searchQuery.trim().toUpperCase()}` as any);
      setSearchQuery('');
    }
  };

  const filteredStocks = searchQuery.trim()
    ? popularStocks.filter(
        (s) =>
          s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : popularStocks;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Charts</Text>
        <Text style={styles.subtitle}>Search and analyze any stock</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search symbol or company name..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="characters"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Recent Searches */}
      {!searchQuery && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT</Text>
          <View style={styles.recentRow}>
            {recentSearches.map((symbol) => (
              <Pressable
                key={symbol}
                style={styles.recentChip}
                onPress={() => router.push(`/stock/${symbol}` as any)}
              >
                <Text style={styles.recentChipText}>{symbol}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Stock List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{searchQuery ? 'RESULTS' : 'POPULAR'}</Text>
        {filteredStocks.map((stock) => (
          <Pressable
            key={stock.symbol}
            style={styles.stockRow}
            onPress={() => router.push(`/stock/${stock.symbol}` as any)}
          >
            <View style={styles.stockIcon}>
              <Text style={styles.stockIconText}>{stock.symbol[0]}</Text>
            </View>
            <View style={styles.stockInfo}>
              <Text style={styles.stockSymbol}>{stock.symbol}</Text>
              <Text style={styles.stockName}>{stock.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
        ))}
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

  searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginBottom: spacing.xl },
  searchInput: { flex: 1, paddingVertical: 14, paddingHorizontal: spacing.sm, color: colors.text, fontSize: fontSize.md },

  section: { marginHorizontal: spacing.xl, marginBottom: spacing.xl },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: colors.textDim, letterSpacing: 1.5, marginBottom: spacing.md },

  recentRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  recentChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  recentChipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },

  stockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: spacing.md },
  stockIcon: { width: 40, height: 40, borderRadius: borderRadius.md, backgroundColor: colors.emeraldBg, alignItems: 'center', justifyContent: 'center' },
  stockIconText: { fontSize: fontSize.md, fontWeight: '800', color: colors.emerald },
  stockInfo: { flex: 1 },
  stockSymbol: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  stockName: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
