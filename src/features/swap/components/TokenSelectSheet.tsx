import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ArrowLeftRight, Check, Search, X } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { noOutlineStyle } from '../webNoOutline';
import { QUICK_PICK_IDS, findToken, shortenAddress, type SwapToken } from '../data/tokens';
import { TokenRowSkeleton } from './TokenRowSkeleton';

export type TokenSelectSheetProps = {
  visible: boolean;
  /** Whatever's currently loaded — starts as the small bootstrap set, then
   * the full live catalog once useSwapTokens' fetch resolves. */
  tokens: SwapToken[];
  /** True while the live catalog fetch is still in flight — shows a few
   * skeleton rows below whatever's already loaded (the bootstrap set). */
  loading?: boolean;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
  selectedId?: string;
};

const DISMISS_THRESHOLD = 120;

// The live catalog can run into the thousands (every token Squid tracks on
// a handful of major chains) — rendering that in one go, even into a
// virtualized FlatList, means keying/filtering thousands of rows on every
// keystroke. Instead the list grows in batches as the user actually
// scrolls, same idea as infinite-scroll pagination, just windowing an
// already-fetched array instead of paging a network call.
const BATCH_SIZE = 60;

/**
 * Token-picker bottom sheet — the swap card's pink/cream palette and
 * hairline dividers, paired with munckins' lowercase, tight-tracked
 * Manrope/Instrument Sans voice for every label (matching how munckins-web
 * sets even UI chrome in lowercase, not just marketing copy).
 *
 * Deliberately NOT built on RN's `<Modal>`: Modal renders into a separate
 * native surface (a new UIWindow on iOS, a new window on Android — visible
 * even on web, where it portals into its own DOM subtree outside the app
 * root), and custom fonts registered via `expo-font` are a known case of
 * silently falling back to the system font on that separate surface. A
 * plain absolutely-positioned overlay in the normal view tree doesn't have
 * that problem.
 */
export function TokenSelectSheet({ visible, tokens, loading = false, onClose, onSelect, selectedId }: TokenSelectSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.min(windowHeight * 0.85, 640);

  const [query, setQuery] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Tracks whether the OPEN transition (rather than merely a re-render while
  // already open) is what's running this effect — `sheetHeight` has to stay
  // a dependency so a live viewport change (keyboard opening, or mobile
  // Safari's auto-zoom on focus — see `searchInput`'s font size below for
  // the real fix to that) keeps the sheet's own height current, but reusing
  // `visible` transitioning true->true as a signal to replay the spring-in
  // and wipe `query` was a real bug: any resize while the sheet was already
  // open (typing into the search box triggers exactly that on mobile web)
  // silently cleared whatever the user had just typed.
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setQuery('');
      translateY.setValue(sheetHeight);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 70 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    wasVisible.current = visible;
  }, [visible, sheetHeight, translateY, backdropOpacity]);

  const close = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: sheetHeight, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_THRESHOLD) {
          close();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 70 }).start();
        }
      },
    }),
  ).current;

  const filteredTokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(q) ||
        token.name.toLowerCase().includes(q) ||
        token.chainName.toLowerCase().includes(q),
    );
  }, [tokens, query]);

  // A fresh search (or the catalog itself changing, e.g. the live fetch
  // landing after the bootstrap set) starts back at one batch rather than
  // keeping however far a previous scroll had grown it.
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [query, tokens]);

  const visibleTokens = filteredTokens.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTokens.length;
  const loadMore = () => {
    if (hasMore) setVisibleCount((count) => count + BATCH_SIZE);
  };

  const quickPicks = QUICK_PICK_IDS.map((id) => findToken(tokens, id)).filter((t): t is SwapToken => Boolean(t));
  const fiatRails = useMemo(() => tokens.filter((token) => token.type === 'fiat'), [tokens]);

  const handleSelect = (token: SwapToken) => {
    onSelect(token);
    close();
  };

  if (!visible) return null;

  return (
    <>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}
      >
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <View style={styles.searchRow}>
          <Search size={16} color={swapColors.textMuted} />
          <TextInput
            testID="token-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="search tokens"
            placeholderTextColor={swapColors.textMuted}
            underlineColorAndroid="transparent"
            style={[styles.searchInput, noOutlineStyle]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {!bannerDismissed && (
          <View style={styles.banner}>
            <ArrowLeftRight size={18} color={swapColors.pillActive} />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>swap any chain, any token</Text>
              <Text style={styles.bannerSubtitle}>morapay routes across networks for you.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={() => setBannerDismissed(true)}
              hitSlop={8}
            >
              <X size={16} color={swapColors.textMuted} />
            </Pressable>
          </View>
        )}

        <FlatList
          data={visibleTokens}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <>
              <View style={styles.quickPickRow}>
                {quickPicks.map((token) => (
                  <Pressable
                    key={token.id}
                    testID={`quick-pick-${token.id}`}
                    style={styles.quickPickItem}
                    onPress={() => handleSelect(token)}
                  >
                    <Image source={{ uri: token.logoUri }} style={styles.quickPickIcon} />
                    <Text style={styles.quickPickLabel}>{token.symbol.toLowerCase()}</Text>
                  </Pressable>
                ))}
              </View>

              {fiatRails.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>fiat & cash</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.fiatRow}
                  >
                    {fiatRails.map((token) => (
                      <Pressable
                        key={token.id}
                        testID={`fiat-pick-${token.id}`}
                        style={styles.fiatCard}
                        onPress={() => handleSelect(token)}
                      >
                        <Image source={{ uri: token.logoUri }} style={styles.fiatIcon} />
                        <View style={styles.fiatInfo}>
                          <Text style={styles.fiatSymbol}>{token.symbol}</Text>
                          <Text style={styles.fiatChain}>{token.chainName}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.sectionLabel}>tokens by 24h volume</Text>
            </>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`token-row-${item.id}`}
              style={styles.tokenRow}
              onPress={() => handleSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === selectedId }}
            >
              <Image source={{ uri: item.logoUri }} style={styles.tokenIcon} />
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{item.name}</Text>
                <View style={styles.tokenMetaRow}>
                  <Text style={styles.tokenSymbol}>{item.symbol}</Text>
                  {/* The same symbol shows up on several chains (USDC on
                      Ethereum, Base, ...) — the chain name is what actually
                      tells those rows apart, so it comes before the address. */}
                  <Text style={styles.tokenChain}>· {item.chainName}</Text>
                  {shortenAddress(item.address) && (
                    <Text style={styles.tokenAddress}>· {shortenAddress(item.address)}</Text>
                  )}
                </View>
              </View>
              {item.id === selectedId && <Check size={18} color={swapColors.pillActive} />}
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? null : <Text style={styles.emptyState}>no tokens match &ldquo;{query}&rdquo;</Text>
          }
          ListFooterComponent={
            loading ? (
              <View testID="token-list-loading">
                {Array.from({ length: 6 }).map((_, index) => (
                  <TokenRowSkeleton key={index} />
                ))}
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,10,25,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // The lighter `card` cream reads as near-white against this sheet's
    // white/darkened surroundings — `subcard` is the same family but
    // noticeably warmer/deeper, so it unmistakably reads as cream.
    backgroundColor: swapColors.subcard,
    borderTopLeftRadius: swapRadii.card,
    borderTopRightRadius: swapRadii.card,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: swapColors.divider,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.pill,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    fontFamily: swapFonts.body,
    // 16px, not 15 — mobile Safari auto-zooms the whole page on focus for
    // any input under 16px, which is the "zooms in" half of the bug report
    // this was written for. Paired with the `wasVisible` fix above (the
    // "zooming out clears my search" half): together neither the zoom nor
    // the state loss should happen anymore, while the keyboard-avoidance
    // "sheet rises above the input" behavior (driven by `useViewportHeight`,
    // a real viewport resize, not a zoom) is untouched.
    fontSize: 16,
    color: swapColors.textPrimary,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 14,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bannerTitle: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 14,
    color: swapColors.textPrimary,
  },
  bannerSubtitle: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  quickPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 18,
  },
  quickPickItem: {
    alignItems: 'center',
    gap: 6,
    width: 60,
  },
  quickPickIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: swapColors.card,
  },
  quickPickLabel: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    color: swapColors.textPrimary,
  },
  sectionLabel: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    letterSpacing: 0.4,
    color: swapColors.textMuted,
    marginHorizontal: 20,
    marginBottom: 6,
  },
  fiatRow: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  fiatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
  },
  fiatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: swapColors.subcard,
  },
  fiatInfo: {
    gap: 1,
  },
  fiatSymbol: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  fiatChain: {
    fontFamily: swapFonts.body,
    fontSize: 11,
    color: swapColors.textMuted,
  },
  listContent: {
    paddingBottom: 24,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tokenIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: swapColors.card,
  },
  tokenInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tokenName: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  tokenMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tokenSymbol: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  tokenChain: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  tokenAddress: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    opacity: 0.7,
  },
  emptyState: {
    fontFamily: swapFonts.body,
    fontSize: 14,
    color: swapColors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
});
