/**
 * Ghana mobile-money network detection from a phone number's prefix — the
 * real carrier-to-prefix mapping (MTN, Vodafone/Telecel, AirtelTigo), same
 * rail morapay's real `/api/moolre/*` backend route validates against.
 */

export type MomoNetwork = 'MTN' | 'Vodafone' | 'AirtelTigo';

const NETWORK_PREFIXES: Record<MomoNetwork, string[]> = {
  MTN: ['24', '25', '53', '54', '55', '59'],
  Vodafone: ['20', '50'],
  AirtelTigo: ['26', '27', '56', '57'],
};

// Real carrier logos, bundled locally (`assets/momo/`) rather than fetched
// from a remote logo CDN — Clearbit's Logo API turned out unreliable in
// testing (never actually loaded, likely blocked by tracker/ad shields —
// Clearbit is a data-enrichment domain, unlike the TrustWallet/flagcdn
// asset CDNs used elsewhere in this app), and a bundled asset has no fetch
// to fail at all. Sourced from Wikimedia Commons (each network's official
// page image): MTN's current wordmark, Vodafone Ghana's local logo, and
// Airtel's (AirtelTigo's Ghana operation traded under the parent Airtel
// brand before its 2023 rename to "AT", for which no Commons logo exists).
export const MOMO_NETWORK_LOGOS: Record<MomoNetwork, number> = {
  MTN: require('../../../assets/momo/mtn.png'),
  Vodafone: require('../../../assets/momo/vodafone.png'),
  AirtelTigo: require('../../../assets/momo/airteltigo.png'),
};

/** Strips formatting and a leading '0' or Ghana country code ('233'). */
function toLocalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Returns the detected network once at least a 2-digit prefix is typed, `null` if unrecognized, `undefined` if too short to tell yet. */
export function detectMomoNetwork(phone: string): MomoNetwork | null | undefined {
  const local = toLocalDigits(phone);
  if (local.length < 2) return undefined;
  const prefix = local.slice(0, 2);
  const entry = (Object.entries(NETWORK_PREFIXES) as [MomoNetwork, string[]][]).find(([, prefixes]) =>
    prefixes.includes(prefix),
  );
  return entry ? entry[0] : null;
}

/** Ghana local mobile numbers are 9 digits after the leading 0 / country code. */
export function isCompleteMomoNumber(phone: string): boolean {
  return toLocalDigits(phone).length === 9;
}

export function formatMomoNumber(phone: string): string {
  const local = toLocalDigits(phone).slice(0, 9);
  const parts = [local.slice(0, 2), local.slice(2, 5), local.slice(5, 9)].filter(Boolean);
  return `0${parts.join(' ')}`;
}

/** Plain "0XXXXXXXXX" form the backend's Moolre validation expects —
 * strips the display formatting's spaces. */
export function toMomoReceiver(phone: string): string {
  return `0${toLocalDigits(phone)}`;
}

export type GhsInstitutionMatch =
  | { code: string }
  | {
      /** More than one real institution matches this brand — can't safely
       * guess which one the offramp `bank_code` field should carry, so the
       * caller needs to ask the user to pick explicitly. */
      ambiguous: true;
      candidates: { code: string; name: string }[];
    };

/** Resolves a detected/selected `MomoNetwork` brand against the REAL
 * institution list `/api/public/ramp/banks` returns — this is what the
 * offramp `bank_code` field actually needs (Quidax's own institution code,
 * e.g. "0004" for MTN), not the brand name string. Matches by substring
 * against the institution's real name rather than a hardcoded code table,
 * since Quidax's exact naming (e.g. "Vodafone" vs the network's real-world
 * 2023 rebrand to "Telecel") isn't something to assume ahead of live data.
 * `AirtelTigo` deliberately can't resolve to a single code: Airtel and
 * Tigo merged as one brand in Ghana, but Quidax may still list them as two
 * separate institutions — auto-picking either one risks sending a payout
 * to the wrong telco's system, so this returns the real candidates for
 * the caller to ask the user to disambiguate instead of guessing. */
export function resolveGhsInstitution(
  network: MomoNetwork,
  institutions: { code: string; name: string }[],
): GhsInstitutionMatch | null {
  const matchesBrand = (name: string): boolean => {
    const upper = name.trim().toUpperCase();
    if (network === 'MTN') return upper.includes('MTN');
    if (network === 'Vodafone') return upper.includes('VODAFONE') || upper.includes('TELECEL');
    return upper.includes('AIRTEL') || upper.includes('TIGO');
  };
  const candidates = institutions.filter((institution) => matchesBrand(institution.name));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { code: candidates[0].code };
  return { ambiguous: true, candidates };
}
