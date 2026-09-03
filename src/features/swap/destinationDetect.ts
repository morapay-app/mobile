/**
 * Best-effort classification of a typed "Destination" value — a crypto
 * address, phone number, or email — purely from its shape. Regex-only: this
 * can't validate a real checksum (e.g. that a base58 string decodes to a
 * genuine Solana ed25519 public key), so it's a strong hint for the user,
 * not proof the address is live. Returns `null` while there's nothing
 * recognizable yet, so callers can hide any "detected" UI until there's
 * something worth showing instead of guessing at a partial value.
 */

import { detectMomoNetwork } from './momoNetwork';

export type DestinationKind = 'evm' | 'bitcoin' | 'solana' | 'ens' | 'email' | 'phone';

export type DetectedDestination = {
  kind: DestinationKind;
  label: string;
  /** Only set for `kind: 'phone'` once a calling code was actually identified. */
  countryCode?: string;
};

export type PhoneCountry = {
  /** ITU-T E.164 calling code digits, no '+'. */
  code: string;
  name: string;
  /** ISO 3166-1 alpha-2, lowercase — flagcdn.com's own country key, same
   * CDN/convention `data/tokens.ts`'s fiat entries already use for their
   * flag images, rather than relying on emoji flag glyphs (unsupported or
   * rendered as bare two-letter codes on some platforms/fonts). */
  iso: string;
};

// Real ITU-T E.164 calling codes — a representative set covering the
// markets morapay actually deals with (Ghana and its neighbors) plus a
// handful of large ones, not an exhaustive directory. Ghana leads the list
// since it's morapay's home market and the default when a local number
// carries no explicit country code.
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: '233', name: 'Ghana', iso: 'gh' },
  { code: '234', name: 'Nigeria', iso: 'ng' },
  { code: '254', name: 'Kenya', iso: 'ke' },
  { code: '256', name: 'Uganda', iso: 'ug' },
  { code: '255', name: 'Tanzania', iso: 'tz' },
  { code: '27', name: 'South Africa', iso: 'za' },
  { code: '225', name: "Côte d'Ivoire", iso: 'ci' },
  { code: '221', name: 'Senegal', iso: 'sn' },
  { code: '1', name: 'US/Canada', iso: 'us' },
  { code: '44', name: 'United Kingdom', iso: 'gb' },
];

const COUNTRY_BY_CODE: Record<string, PhoneCountry> = Object.fromEntries(
  PHONE_COUNTRIES.map((country) => [country.code, country]),
);

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
// Base58 (excludes 0/O/I/l), the shape of a Solana ed25519 public key.
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BITCOIN_LEGACY_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BITCOIN_BECH32_RE = /^(bc1|tb1)[a-z0-9]{25,90}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SHAPE_RE = /^[+\d][\d\s-]*$/;
// Deliberately `.eth` only, not "any dotted name": that's the namespace the
// backend's own resolver (`/api/ens/address`, viem `getEnsAddress`) is
// actually pointed at, and being conservative here matters — this classifier
// decides whether a typed value gets treated as a payable destination at
// all, so a loose pattern would claim strings it can't resolve. Subdomains
// (`pay.someone.eth`) are real ENS names and included.
const ENS_NAME_RE = /^(?:[a-z0-9-]+\.)+eth$/i;

function detectPhone(raw: string, digits: string): DetectedDestination | null {
  if (raw.trim().startsWith('+')) {
    for (const len of [3, 2, 1]) {
      const country = COUNTRY_BY_CODE[digits.slice(0, len)];
      if (!country) continue;
      if (country.name === 'Ghana') {
        const network = detectMomoNetwork(digits.slice(len));
        if (network) return { kind: 'phone', label: `${network} · Ghana`, countryCode: country.code };
      }
      return { kind: 'phone', label: `Phone Number · ${country.name}`, countryCode: country.code };
    }
    return { kind: 'phone', label: 'Phone Number' };
  }

  // No country code typed — check the same local-number shape the momo
  // rail elsewhere in this app already recognizes (Ghana) before falling
  // back to a bare "Phone Number" guess.
  const network = detectMomoNetwork(raw);
  if (network) return { kind: 'phone', label: `${network} · Ghana`, countryCode: '233' };
  return digits.length >= 9 ? { kind: 'phone', label: 'Phone Number' } : null;
}

/** Re-derives the phone label for a country the user picked explicitly via
 * CountrySelect, overriding whatever `detectDestination` guessed on its
 * own — so correcting the country actually changes what's shown, not just
 * the flag chip. */
export function describePhoneForCountry(rawValue: string, countryCode: string): string {
  const countryName = COUNTRY_BY_CODE[countryCode]?.name;
  if (countryName === 'Ghana') {
    const network = detectMomoNetwork(rawValue);
    if (network) return `${network} · Ghana`;
  }
  return countryName ? `Phone Number · ${countryName}` : 'Phone Number';
}

/**
 * A typed phone number in unambiguous E.164 form (`+233241234567`).
 *
 * A local number ("024 123 4567") only identifies a person once it carries a
 * country code, so anything that sends a phone number OUT of this app — a
 * beneficiary to notify, a payer to bill — has to normalize it first, rather
 * than forwarding whatever shape it happened to be typed in. Distinct from
 * `toMomoReceiver`, which produces the local `0XXXXXXXXX` form that Ghana's
 * own mobile-money rail expects instead.
 *
 * `countryCode` is whichever the user actually settled on (their explicit
 * CountrySelect pick, else the detected one). Without one, this can only
 * hand back the bare digits — better than inventing a country.
 */
export function toE164Phone(rawValue: string, countryCode?: string): string {
  const digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';
  // Already fully qualified — the user typed the '+' themselves.
  if (rawValue.trim().startsWith('+')) return `+${digits}`;
  if (!countryCode) return digits;
  const withoutCode = digits.startsWith(countryCode) ? digits.slice(countryCode.length) : digits;
  // A leading trunk '0' is a domestic-dialling prefix, never part of the
  // subscriber number once a country code is attached.
  return `+${countryCode}${withoutCode.replace(/^0+/, '')}`;
}

export function detectDestination(rawValue: string): DetectedDestination | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (EMAIL_RE.test(value)) return { kind: 'email', label: 'Email — redeemable once claimed' };
  if (EVM_ADDRESS_RE.test(value)) return { kind: 'evm', label: 'Ethereum, Base & other EVM chains' };
  // Before the base58/phone fallbacks, and after the address checks (an ENS
  // name can't collide with either) — the label stays neutral about whether
  // it resolves, since that's a live lookup the caller runs separately.
  if (ENS_NAME_RE.test(value)) return { kind: 'ens', label: 'ENS Name' };
  if (BITCOIN_LEGACY_RE.test(value) || BITCOIN_BECH32_RE.test(value)) return { kind: 'bitcoin', label: 'Bitcoin Address' };
  if (SOLANA_ADDRESS_RE.test(value)) return { kind: 'solana', label: 'Solana Address' };

  const digits = value.replace(/\D/g, '');
  if (digits.length >= 6 && PHONE_SHAPE_RE.test(value)) {
    return detectPhone(value, digits);
  }

  return null;
}
