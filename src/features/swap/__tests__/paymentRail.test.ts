import { getPaymentRail } from '../paymentRail';

const ghs = { type: 'fiat' as const, symbol: 'GHS' };
const ngn = { type: 'fiat' as const, symbol: 'NGN' };
const kes = { type: 'fiat' as const, symbol: 'KES' };
const eth = { type: 'crypto' as const, symbol: 'ETH' };
const usdcBase = { type: 'crypto' as const, symbol: 'USDC' };

describe('getPaymentRail', () => {
  it('routes GHS to mobile money', () => {
    expect(getPaymentRail(ghs)).toEqual({ assetType: 'fiat', currency: 'GHS', method: 'momo' });
  });

  it('routes NGN to bank transfer', () => {
    expect(getPaymentRail(ngn)).toEqual({ assetType: 'fiat', currency: 'NGN', method: 'bank' });
  });

  it('returns null for a fiat currency that is not a real ramp currency today', () => {
    expect(getPaymentRail(kes)).toBeNull();
  });

  it('routes every crypto token to the crypto rail, regardless of symbol/chain', () => {
    expect(getPaymentRail(eth)).toEqual({ assetType: 'crypto', method: 'crypto' });
    expect(getPaymentRail(usdcBase)).toEqual({ assetType: 'crypto', method: 'crypto' });
  });

  it('is case-insensitive on the fiat symbol', () => {
    expect(getPaymentRail({ type: 'fiat', symbol: 'ghs' })).toEqual({ assetType: 'fiat', currency: 'GHS', method: 'momo' });
  });
});
