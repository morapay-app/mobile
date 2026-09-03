import { useEffect, useRef } from 'react';
import { Animated, FlatList, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { getChainMeta } from '../chainMeta';
import type { SwapToken } from '../data/tokens';

export type NetworkSelectSheetProps = {
  visible: boolean;
  /** Every real chain-variant of the token symbol being received — one row
   * per distinct `chainId` among these, not a hardcoded chain list, so it
   * only ever offers a network this app's own live catalog actually has a
   * token entry for. */
  options: SwapToken[];
  selectedChainId: string;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
};

const DISMISS_THRESHOLD = 120;

/**
 * Network picker for the swap card's "where do you want to receive" step —
 * same edge-to-edge cream sheet, drag handle, and row layout as
 * TokenSelectSheet, so it reads as the same picker pattern rather than a
 * separate control. Deliberately not built on RN's `<Modal>` for the same
 * reason TokenSelectSheet isn't (see its own doc comment): a plain
 * absolutely-positioned overlay avoids Modal's separate-native-surface font
 * fallback issue.
 */
export function NetworkSelectSheet({ visible, options, selectedChainId, onClose, onSelect }: NetworkSelectSheetProps) {
  const translateY = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(400);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 70 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const close = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 400, duration: 220, useNativeDriver: true }),
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

      <Animated.View testID="network-select-sheet" style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Choose Network</Text>
          <Text style={styles.subtitle}>Only send to the network shown — sending on the wrong one can lose funds.</Text>
        </View>

        <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const meta = getChainMeta(item.chainId, { chainName: item.chainName, logoUri: item.logoUri });
            const selected = item.chainId === selectedChainId;
            return (
              <Pressable
                testID={`network-row-${item.chainId}`}
                style={styles.row}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Image source={{ uri: meta.logoUri }} style={styles.networkIcon} />
                <View style={styles.info}>
                  <Text style={styles.networkName}>{meta.name}</Text>
                  <Text style={styles.networkMeta}>
                    {meta.protocolLabel(item)} · Est. arrival {meta.estimatedArrival}
                  </Text>
                </View>
                {selected && <Check size={15} color={swapColors.pillActive} />}
              </Pressable>
            );
          }}
          contentInsetAdjustmentBehavior="automatic"
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
    backgroundColor: swapColors.subcard,
    borderTopLeftRadius: swapRadii.card,
    borderTopRightRadius: swapRadii.card,
    overflow: 'hidden',
    paddingBottom: 24,
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
  header: {
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 4,
  },
  title: {
    fontFamily: swapFonts.headingBold,
    fontSize: 18,
    color: swapColors.textPrimary,
  },
  subtitle: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  listContent: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  networkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: swapColors.card,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  networkName: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  networkMeta: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
});
