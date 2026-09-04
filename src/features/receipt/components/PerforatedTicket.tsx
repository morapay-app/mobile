import { Platform, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ArrowRight } from 'lucide-react-native';

import { swapFonts, swapRadii } from '../../swap/theme';
import { statementFor, type ReceiptColorway } from '../receiptStatements';
import type { ReceiptData } from '../types';

const NOTCH_SIZE = 22;
const TICKET_WIDTH = 336;

// No monospace family is loaded by useAppFonts (Manrope/Instrument Sans
// only) — pulling one in just for a few data-accent labels isn't worth the
// app-wide font-preload cost, so this uses each platform's own built-in
// monospace instead of a custom face.
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export type PerforatedTicketProps = {
  data: ReceiptData;
  colorway: ReceiptColorway;
};

/**
 * The shareable ticket itself — perforated-ticket punch notches (from the
 * arcade-boarding-pass reference) plus a per-transaction-type neon
 * colorway (see `receiptStatements.ts`). Deliberately NOT wrapped in
 * `overflow: hidden` — the notches are small circles painted in the
 * surrounding backdrop color, positioned half outside the card's own
 * edges, and rely on being visible past the card's border to read as
 * actual cutouts rather than colored dots sitting on top of the card.
 */
export function PerforatedTicket({ data, colorway }: PerforatedTicketProps) {
  const headline = statementFor(data);
  const stats = data.stats;
  const hasStats = Boolean(stats?.feeSaved || stats?.settlementTime || stats?.settlementMethod);

  return (
    <View style={[styles.card, { backgroundColor: colorway.surface, borderColor: `${colorway.accent}40` }]}>
      <View style={styles.topSection}>
        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: colorway.accent }]}>
            <View style={[styles.statusDot, { backgroundColor: colorway.textOnAccent }]} />
            <Text style={[styles.statusText, { color: colorway.textOnAccent }]}>{data.status}</Text>
          </View>
          <Text style={[styles.txId, { color: colorway.textMuted }]}>#TX-{data.id}</Text>
        </View>

        <Text style={[styles.headline, { color: colorway.textPrimary }]}>{headline}</Text>

        <View style={styles.routeRow}>
          <View style={[styles.routeChip, { borderColor: colorway.accent }]}>
            <Text style={[styles.routeChipText, { color: colorway.textPrimary }]}>
              {data.from.amount} {data.from.symbol}
            </Text>
          </View>
          <ArrowRight size={16} color={colorway.accent} />
          <View style={[styles.routeChip, styles.routeChipFilled, { backgroundColor: colorway.accent }]}>
            <Text style={[styles.routeChipText, { color: colorway.textOnAccent }]}>
              {data.to.amount} {data.to.symbol}
            </Text>
          </View>
        </View>

        <View style={styles.qrWrap}>
          <View style={[styles.qrCard, { backgroundColor: colorway.bg, borderColor: colorway.accent }]}>
            <QRCode value={data.verifyUrl} size={128} backgroundColor={colorway.bg} color={colorway.accent} />
          </View>
          <Text style={[styles.qrCaption, { color: colorway.textMuted }]}>SCAN TO VERIFY</Text>
        </View>
      </View>

      <View style={styles.perforationRow}>
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: colorway.bg }]} />
        <View style={[styles.dashedLine, { borderColor: `${colorway.accent}55` }]} />
        <View style={[styles.notch, styles.notchRight, { backgroundColor: colorway.bg }]} />
      </View>

      <View style={styles.bottomStub}>
        {hasStats && (
          <View style={styles.statsRow}>
            {stats?.feeSaved && <Stat label="SAVED" value={stats.feeSaved} colorway={colorway} />}
            {stats?.settlementTime && <Stat label="SPEED" value={stats.settlementTime} colorway={colorway} />}
            {stats?.settlementMethod && <Stat label="VIA" value={stats.settlementMethod} colorway={colorway} />}
          </View>
        )}

        {data.promo && (
          <View style={[styles.promoBanner, { backgroundColor: colorway.bg, borderColor: `${colorway.accent}55` }]}>
            <Text style={styles.promoEmoji}>{data.promo.emoji}</Text>
            <Text style={[styles.promoText, { color: colorway.textPrimary }]}>{data.promo.text}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Stat({ label, value, colorway }: { label: string; value: string; colorway: ReceiptColorway }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colorway.accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colorway.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: TICKET_WIDTH,
    borderRadius: swapRadii.subcard,
    borderWidth: 1,
  },
  topSection: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 16,
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: swapRadii.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: swapFonts.label,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  txId: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  headline: {
    fontFamily: swapFonts.headingBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeChip: {
    borderRadius: swapRadii.pill,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  routeChipFilled: {
    borderWidth: 0,
  },
  routeChipText: {
    fontFamily: swapFonts.label,
    fontSize: 13,
  },
  qrWrap: {
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  qrCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  qrCaption: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: NOTCH_SIZE,
  },
  notch: {
    position: 'absolute',
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    top: 0,
  },
  notchLeft: {
    left: -NOTCH_SIZE / 2,
  },
  notchRight: {
    right: -NOTCH_SIZE / 2,
  },
  dashedLine: {
    flex: 1,
    marginHorizontal: NOTCH_SIZE,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  bottomStub: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 22,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: MONO_FONT,
    fontSize: 15,
    fontWeight: '700',
  },
  statLabel: {
    fontFamily: swapFonts.label,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: swapRadii.subcard,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  promoEmoji: {
    fontSize: 18,
  },
  promoText: {
    flex: 1,
    fontFamily: swapFonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
});
