import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Wallet } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { noOutlineStyle } from '../webNoOutline';
import { detectDestination } from '../destinationDetect';
import { detectMomoNetwork, formatMomoNumber, MOMO_NETWORK_LOGOS, resolveGhsInstitution, toMomoReceiver } from '../momoNetwork';
import { useValidateMomo } from '../useValidateMomo';
import { useRampBanks } from '../useRampBanks';
import { useFiatBanks } from '../useFiatBanks';
import { useResolveBankAccount } from '../useResolveBankAccount';
import type { PayoutFiat } from '../../../api/paymentRequests';
import type { SwapToken } from '../data/tokens';

const CRYPTO_ADDRESS_KINDS = new Set(['evm', 'bitcoin', 'solana']);

export type ReceivePayout = { kind: 'crypto'; address: string } | { kind: 'fiat'; payoutFiat: PayoutFiat };

export type ReceiveDestinationCardProps = {
  /** The token being requested — decides which destination shape applies. */
  token: SwapToken;
  walletConnected: boolean;
  walletAddress: string | null;
  onConnectWallet: () => void;
  /** Fires with a fully resolved, submittable payout, or `null` while
   * there's nothing usable yet — the caller (Receive mode's Request button)
   * gates on this instead of re-deriving the same validation itself. */
  onResolvedChange: (payout: ReceivePayout | null) => void;
};

/**
 * "Where should this land once it's paid" — the settlement destination for
 * a payment REQUEST (Receive mode), shaped by what's actually being
 * requested: a crypto token needs a wallet address (`payoutTarget`); GHS
 * needs a real Quidax momo institution code (`resolveGhsInstitution`, same
 * as the offramp payout account); NGN needs a real Paystack bank + a
 * resolved account name (`useResolveBankAccount`) — Paystack's bank-code
 * space, not Quidax's, since that's the provider Core's own settlement
 * service pays this leg out through (see api/fiatBanks.ts's doc).
 *
 * Real backend caveat this doesn't hide from the user or silently work
 * around: Core currently hardcodes a Request's settlement leg to BASE/USDC
 * whenever the payer pays over the fiat pay-link (this app's only payer
 * flow), so a GHS/NGN destination collected here is real and submitted
 * correctly, but won't auto-settle until that TODO closes — see
 * api/paymentRequests.ts's `PayoutFiat` doc.
 */
export function ReceiveDestinationCard({ token, walletConnected, walletAddress, onConnectWallet, onResolvedChange }: ReceiveDestinationCardProps) {
  // Crypto
  const [address, setAddress] = useState('');

  // GHS momo
  const [phone, setPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [selectedGhsCode, setSelectedGhsCode] = useState<string | null>(null);

  // NGN bank
  const [ngnBankCode, setNgnBankCode] = useState<string | null>(null);
  const [ngnBankPickerOpen, setNgnBankPickerOpen] = useState(false);
  const [ngnAccountNumber, setNgnAccountNumber] = useState('');

  const isCrypto = token.type === 'crypto';
  const fiatSymbol = token.symbol.trim().toUpperCase();
  const isGhs = !isCrypto && fiatSymbol === 'GHS';
  const isNgn = !isCrypto && fiatSymbol === 'NGN';

  // Reset the other shapes' state on a token-kind change so a stale value
  // never leaks into a payout the new token wouldn't actually match.
  useEffect(() => {
    setAddress('');
    setPhone('');
    setManualName('');
    setSelectedGhsCode(null);
    setNgnBankCode(null);
    setNgnBankPickerOpen(false);
    setNgnAccountNumber('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrypto, isGhs, isNgn]);

  const network = isGhs ? detectMomoNetwork(phone) : undefined;
  const validation = useValidateMomo(isGhs ? phone : '', network);
  const resolvedMomoName = validation.accountName ?? (manualName.trim().length > 1 ? manualName.trim() : null);
  const rampBanks = useRampBanks(isGhs ? 'GHS' : null);
  const ghsMatch = isGhs && network ? resolveGhsInstitution(network, rampBanks.mobileMoney) : null;
  const ghsAmbiguousCandidates = ghsMatch && 'ambiguous' in ghsMatch ? ghsMatch.candidates : null;
  const ghsInstitutionCode = (ghsMatch && 'code' in ghsMatch ? ghsMatch.code : null) ?? selectedGhsCode;

  const fiatBanks = useFiatBanks(isNgn ? 'nigeria' : null);
  const selectedNgnBankName = fiatBanks.banks.find((bank) => bank.code === ngnBankCode)?.name ?? null;
  const ngnResolution = useResolveBankAccount(isNgn ? ngnAccountNumber : '', ngnBankCode);

  const addressKind = isCrypto ? detectDestination(address.trim())?.kind : undefined;
  const addressValid = Boolean(addressKind && CRYPTO_ADDRESS_KINDS.has(addressKind));

  useEffect(() => {
    if (isCrypto) {
      onResolvedChange(addressValid ? { kind: 'crypto', address: address.trim() } : null);
      return;
    }
    if (isGhs) {
      onResolvedChange(
        ghsInstitutionCode && resolvedMomoName
          ? {
              kind: 'fiat',
              payoutFiat: {
                type: 'mobile_money',
                account_name: resolvedMomoName,
                account_number: toMomoReceiver(phone),
                bank_code: ghsInstitutionCode,
                currency: 'GHS',
              },
            }
          : null,
      );
      return;
    }
    if (isNgn) {
      onResolvedChange(
        ngnBankCode && ngnResolution.accountName
          ? {
              kind: 'fiat',
              payoutFiat: {
                type: 'nuban',
                account_name: ngnResolution.accountName,
                account_number: ngnAccountNumber.trim(),
                bank_code: ngnBankCode,
                currency: 'NGN',
              },
            }
          : null,
      );
      return;
    }
    onResolvedChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrypto, isGhs, isNgn, addressValid, address, ghsInstitutionCode, resolvedMomoName, phone, ngnBankCode, ngnResolution.accountName, ngnAccountNumber]);

  const handlePasteAddress = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text.trim().length > 0) setAddress(text.trim());
    } catch {
      // Permission denied, or nothing to paste — no-op, same as any other paste.
    }
  };

  // Toggles the connected address in/out — see MomoSheet.tsx's
  // `handleAddressIconPress` for the same fix and why it matters: this used
  // to only ever set the address, so once connected there was no way to
  // clear the field back to blank except retyping over it by hand.
  const handleUseWallet = () => {
    if (!walletConnected || !walletAddress) {
      onConnectWallet();
      return;
    }
    setAddress((current) => (current.trim() === walletAddress ? '' : walletAddress));
  };

  if (isCrypto) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>Receive to</Text>
        <TextInput
          testID="receive-address-input"
          value={address}
          onChangeText={setAddress}
          placeholder="Wallet address"
          placeholderTextColor={swapColors.textMuted}
          underlineColorAndroid="transparent"
          multiline
          style={[styles.bigInput, noOutlineStyle]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.actionRow}>
          <Pressable testID="receive-paste-address" accessibilityRole="button" onPress={handlePasteAddress} style={styles.actionPill}>
            <ClipboardPaste size={14} color={swapColors.textPrimary} />
            <Text style={styles.actionLabel}>Paste</Text>
          </Pressable>
          <Pressable
            testID="receive-use-wallet"
            accessibilityRole="button"
            onPress={handleUseWallet}
            style={styles.actionPill}
          >
            <Wallet size={14} color={swapColors.textPrimary} />
            <Text style={styles.actionLabel}>{walletConnected ? 'Connected Wallet' : 'Connect Wallet'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isGhs) {
    return (
      <View style={styles.card}>
        {network ? (
          <View style={styles.networkRow}>
            <View style={styles.networkLogoChip}>
              <Image source={MOMO_NETWORK_LOGOS[network]} style={styles.networkLogo} resizeMode="contain" />
            </View>
            <Text style={styles.label}>{network}</Text>
          </View>
        ) : (
          <Text style={styles.label}>Receive to Mobile Money</Text>
        )}
        <TextInput
          testID="receive-momo-phone-input"
          value={phone}
          onChangeText={(text) => {
            setPhone(formatMomoNumber(text));
            setSelectedGhsCode(null);
          }}
          placeholder="024 123 4567"
          placeholderTextColor={swapColors.textMuted}
          keyboardType="phone-pad"
          underlineColorAndroid="transparent"
          style={[styles.phoneInput, noOutlineStyle]}
        />

        {validation.accountName && (
          <View testID="receive-momo-account-name" style={styles.accountNameField}>
            <Text style={styles.accountNameLabel}>Account name</Text>
            <Text style={styles.accountNameValue}>{validation.accountName}</Text>
          </View>
        )}

        {ghsAmbiguousCandidates && (
          <View style={styles.field}>
            <Text style={styles.label}>Which network?</Text>
            <View style={styles.institutionRow}>
              {ghsAmbiguousCandidates.map((candidate) => (
                <Pressable
                  key={candidate.code}
                  testID={`receive-momo-institution-${candidate.code}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedGhsCode(candidate.code)}
                  style={[styles.institutionChip, selectedGhsCode === candidate.code && styles.institutionChipSelected]}
                >
                  <Text style={[styles.institutionChipLabel, selectedGhsCode === candidate.code && styles.institutionChipLabelSelected]}>
                    {candidate.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!validation.accountName && (
          <View style={[styles.field, styles.fieldRow]}>
            <TextInput
              testID="receive-momo-name-input"
              value={manualName}
              onChangeText={setManualName}
              placeholder="Full name as registered"
              placeholderTextColor={swapColors.textMuted}
              underlineColorAndroid="transparent"
              editable
              style={[styles.input, styles.nameInput, styles.nameInputFlex, noOutlineStyle]}
              autoCapitalize="words"
            />
            {validation.loading && <ActivityIndicator size="small" color={swapColors.pillActive} style={styles.loadingIndicator} />}
          </View>
        )}
      </View>
    );
  }

  if (isNgn) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>Receive to Bank</Text>
        <View style={styles.field}>
          <Pressable testID="receive-ngn-bank-select" accessibilityRole="button" onPress={() => setNgnBankPickerOpen((open) => !open)} style={styles.input}>
            <Text style={selectedNgnBankName ? styles.accountNameValue : styles.placeholderText}>
              {selectedNgnBankName ?? (fiatBanks.loading ? 'Loading banks…' : 'Select your bank')}
            </Text>
          </Pressable>
          {ngnBankPickerOpen && (
            <View testID="receive-ngn-bank-picker" style={styles.bankPicker}>
              <ScrollView style={styles.bankPickerScroll} showsVerticalScrollIndicator={false}>
                {fiatBanks.banks.map((bank) => (
                  // Paystack's own real bank list can repeat the same `code`
                  // across distinct rows — `id` is the one field it
                  // guarantees unique, so that's what identifies the row;
                  // `code` is still exactly what gets submitted, since
                  // that's the value Paystack's resolve/transfer calls need.
                  <Pressable
                    key={bank.id}
                    testID={`receive-ngn-bank-${bank.id}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setNgnBankCode(bank.code);
                      setNgnBankPickerOpen(false);
                    }}
                    style={styles.bankPickerItem}
                  >
                    <Text style={styles.bankPickerItemLabel}>{bank.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <TextInput
            testID="receive-ngn-account-number-input"
            value={ngnAccountNumber}
            onChangeText={(text) => setNgnAccountNumber(text.replace(/\D/g, '').slice(0, 10))}
            placeholder="Account number"
            placeholderTextColor={swapColors.textMuted}
            keyboardType="number-pad"
            underlineColorAndroid="transparent"
            style={[styles.input, noOutlineStyle]}
          />
        </View>

        {ngnResolution.loading && <ActivityIndicator size="small" color={swapColors.pillActive} style={styles.loadingIndicator} />}
        {ngnResolution.accountName && (
          <View testID="receive-ngn-account-name" style={styles.accountNameField}>
            <Text style={styles.accountNameLabel}>Account name</Text>
            <Text style={styles.accountNameValue}>{ngnResolution.accountName}</Text>
          </View>
        )}
        {ngnResolution.failed && (
          <Text testID="receive-ngn-resolve-error" style={styles.errorText}>
            Couldn't verify that account. Check the number and bank.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text testID="receive-destination-unsupported" style={styles.errorText}>
        Requesting {token.symbol} isn't supported yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same background/radius/padding as the Send tab's own "Destination"
  // subcard (SwapScreen's `styles.subcard`) — this card sits in the exact
  // same slot Send mode uses, so it reads as the same kind of card.
  card: {
    backgroundColor: swapColors.subcard,
    borderRadius: swapRadii.subcard,
    padding: 20,
    gap: 8,
  },
  label: {
    fontFamily: swapFonts.label,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  field: {
    gap: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bigInput: {
    fontFamily: swapFonts.label,
    fontSize: 18,
    lineHeight: 24,
    color: swapColors.textPrimary,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.card,
  },
  actionLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  networkLogoChip: {
    width: 34,
    height: 20,
    borderRadius: 6,
    backgroundColor: swapColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  networkLogo: {
    width: '100%',
    height: '100%',
  },
  phoneInput: {
    fontFamily: swapFonts.numberBold,
    fontSize: 26,
    color: swapColors.textPrimary,
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
  accountNameField: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 2,
  },
  accountNameLabel: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  accountNameValue: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 16,
    color: swapColors.textPrimary,
  },
  institutionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  institutionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.card,
  },
  institutionChipSelected: {
    backgroundColor: swapColors.pillActive,
  },
  institutionChipLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  institutionChipLabelSelected: {
    color: swapColors.textOnDark,
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  input: {
    fontFamily: swapFonts.label,
    // 16px, not 15 — under 16px, mobile Safari auto-zooms the whole page on
    // focus (this is also a Pressable label in the bank-select trigger, not
    // just the two real TextInputs that use this style — harmless there).
    fontSize: 16,
    color: swapColors.textPrimary,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  // The momo name field sits directly on the card, not in its own pill —
  // same "transparent field on a soft surface" treatment as the swap
  // card's own amount fields, rather than a second nested card tone.
  nameInput: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  nameInputFlex: {
    flex: 1,
  },
  placeholderText: {
    fontFamily: swapFonts.label,
    fontSize: 15,
    color: swapColors.textMuted,
  },
  bankPicker: {
    marginTop: 6,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bankPickerScroll: {
    maxHeight: 220,
  },
  bankPickerItem: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  bankPickerItemLabel: {
    fontFamily: swapFonts.label,
    fontSize: 14,
    color: swapColors.textPrimary,
  },
  errorText: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: '#B3261E',
  },
});
