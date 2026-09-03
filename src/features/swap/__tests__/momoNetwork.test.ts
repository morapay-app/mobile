import { resolveGhsInstitution } from '../momoNetwork';

const REAL_GHS_INSTITUTIONS = [
  { code: '0004', name: 'MTN Mobile Money' },
  { code: '0005', name: 'AirtelGh' },
  { code: '0006', name: 'Vodafone Cash' },
  { code: '0009', name: 'Tigo Cash' },
];

describe('resolveGhsInstitution', () => {
  it('resolves MTN to its real Quidax institution code', () => {
    expect(resolveGhsInstitution('MTN', REAL_GHS_INSTITUTIONS)).toEqual({ code: '0004' });
  });

  it('resolves Vodafone to its real code, and still matches a "Telecel" rebrand name', () => {
    expect(resolveGhsInstitution('Vodafone', REAL_GHS_INSTITUTIONS)).toEqual({ code: '0006' });
    expect(resolveGhsInstitution('Vodafone', [{ code: '0006', name: 'Telecel Cash' }])).toEqual({ code: '0006' });
  });

  // The real regression this exists to prevent: Airtel and Tigo merged as
  // one brand in the real world, but Quidax's institution list still
  // carries them as two separate codes — auto-picking either one risks a
  // payout landing on the wrong telco's system.
  it('never guesses between Airtel and Tigo for the merged AirtelTigo brand — reports both as ambiguous', () => {
    const result = resolveGhsInstitution('AirtelTigo', REAL_GHS_INSTITUTIONS);
    expect(result).toEqual({
      ambiguous: true,
      candidates: [
        { code: '0005', name: 'AirtelGh' },
        { code: '0009', name: 'Tigo Cash' },
      ],
    });
  });

  it('returns null when the live list has nothing matching yet (e.g. still loading)', () => {
    expect(resolveGhsInstitution('MTN', [])).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(resolveGhsInstitution('MTN', [{ code: '0004', name: 'mtn mobile money' }])).toEqual({ code: '0004' });
  });
});
