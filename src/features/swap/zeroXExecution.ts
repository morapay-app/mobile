import { concat, numberToHex, size, type Hex } from 'viem';

import type { SwapToken } from './data/tokens';

/** 0x/Squid's native-gas-token sentinel — matches core/src/lib/native-token.ts's
 * `toZeroXNativeToken`. Never a bare symbol or the string 'native'. */
export const NATIVE_TOKEN_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export function toExecutionTokenAddress(token: Pick<SwapToken, 'address'>): string {
  return token.address === 'native' ? NATIVE_TOKEN_SENTINEL : token.address;
}

/**
 * 0x's own documented Permit2 flow: after signing the quote's
 * `permit2.eip712` message, the signature has to be appended to the
 * transaction calldata as a 32-byte big-endian length prefix followed by
 * the signature bytes — not sent as a separate call. Same splice 0x's own
 * client SDKs perform; this just does it with viem instead.
 */
export function appendPermit2SignatureToCalldata(data: Hex, signature: Hex): Hex {
  const signatureLengthHex = numberToHex(size(signature), { size: 32 });
  return concat([data, signatureLengthHex, signature]);
}
