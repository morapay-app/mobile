import { friendlyExecutionError } from '../friendlyExecutionError';

describe('friendlyExecutionError', () => {
  it('maps a wallet rejection (EIP-1193 code 4001) to plain copy', () => {
    const err = Object.assign(new Error('User rejected the request.'), { code: 4001 });
    expect(friendlyExecutionError(err)).toBe('You rejected the transaction.');
  });

  it('maps a wallet rejection by viem error name, even without the code', () => {
    const err = Object.assign(new Error('some raw provider text'), { name: 'UserRejectedRequestError' });
    expect(friendlyExecutionError(err)).toBe('You rejected the transaction.');
  });

  it('maps a wallet rejection by message text as a last resort', () => {
    expect(friendlyExecutionError(new Error('User denied transaction signature.'))).toBe('You rejected the transaction.');
  });

  it('maps insufficient funds to plain copy', () => {
    const err = Object.assign(new Error('insufficient funds for gas * price + value'), { name: 'InsufficientFundsError' });
    expect(friendlyExecutionError(err)).toBe("You don't have enough to cover this, including network fees.");
  });

  it('maps a reverted transaction to plain copy', () => {
    expect(friendlyExecutionError(new Error('execution reverted: TRANSFER_FROM_FAILED'))).toBe(
      "This transaction can't go through right now. Try again.",
    );
  });

  it('never lets a raw viem error dump (Details:/Version: footer) reach the user', () => {
    // Deliberately doesn't contain "rejected"/"insufficient funds"/"reverted"
    // — this is testing the generic catch-all, not one of the specific
    // named cases above.
    const raw =
      'The gas price cannot be higher than the maximum fee per gas.\n\nRequest Arguments:\n  maxFeePerGas: 2 gwei\n\nDetails: fee cap too high\nVersion: viem@2.47.6';
    expect(friendlyExecutionError(new Error(raw))).toBe('Could not complete this swap. Please try again.');
  });

  it('passes through our own already-friendly thrown messages unchanged', () => {
    expect(friendlyExecutionError(new Error('Connect a wallet to swap.'))).toBe('Connect a wallet to swap.');
    expect(friendlyExecutionError(new Error("Your wallet isn't ready. Try reconnecting."))).toBe(
      "Your wallet isn't ready. Try reconnecting.",
    );
  });

  it('handles a non-Error thrown value the same way — plain text passes through, technical-looking text gets the fallback', () => {
    expect(friendlyExecutionError('something went sideways')).toBe('something went sideways');
    expect(friendlyExecutionError('Version: viem@2.47.6')).toBe('Could not complete this swap. Please try again.');
  });
});
