import Pusher from 'pusher-js';

import { apiPost } from '../api/client';
import { PUSHER_CLUSTER, PUSHER_KEY } from '../config/env';

/**
 * Real-time counterpart to `TransactionStoreContext.tsx`'s own ramp
 * polling — Tier 2 of the transaction-tracker work (Tier 1 was wiring real
 * polling into the store at all). Subscribes to the private, per-transaction
 * channel Core's `pusher.service.ts` (`triggerRampStatusChange`) fires on,
 * so a status change reaches this app within one background-poll tick on
 * Core's side instead of waiting out this app's own poll interval.
 *
 * Deliberately additive, not a replacement: `pollRealRampTransaction` keeps
 * running exactly as it did before this existed. If `PUSHER_KEY`/
 * `PUSHER_CLUSTER` aren't set, or the socket never connects, or an event
 * gets dropped, the poll loop still gets there on its own — this only ever
 * makes updates arrive sooner, never something the tracker depends on to
 * function at all.
 *
 * NOTE: only verified against this app's web preview so far (a real
 * WebSocket connection, confirmed live) — not yet exercised on a real
 * native build. `pusher-js`'s base package is documented to work under React
 * Native (it only needs a global `WebSocket`, which RN provides), but if a
 * real native run turns up an issue, Pusher also ships a
 * `pusher-js/react-native` entry point tuned for that environment — worth
 * trying first before assuming something deeper is wrong.
 */

export function rampStatusChannelName(merchantReference: string): string {
  return `private-ramp-${merchantReference}`;
}

export type RampStatusEvent = {
  merchantReference: string;
  status: string;
  distributionStatus?: string | null;
  settlementMode?: string | null;
  errorMessage?: string | null;
};

type PusherAuthResponse = { auth: string; channel_data?: string; shared_secret?: string };

// `channelAuthorization.customHandler` only ever hands this module the
// channel name + socket id — the wallet address Core's own auth route needs
// (see public-ramp.ts's `/realtime/auth`) has to come from somewhere else.
// Populated right before `subscribe()` for a channel, read back inside the
// handler for that same channel.
const channelWalletAddress = new Map<string, string>();

// `undefined` = not yet attempted; `null` = attempted and unavailable
// (no key/cluster configured) — distinct from "haven't tried" so this only
// ever constructs the client once.
let client: Pusher | null | undefined;

function getClient(): Pusher | null {
  if (client !== undefined) return client;
  if (!PUSHER_KEY || !PUSHER_CLUSTER) {
    client = null;
    return client;
  }
  client = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    channelAuthorization: {
      customHandler: (params, callback) => {
        const merchantReference = params.channelName.replace(/^private-ramp-/, '');
        const walletAddress = channelWalletAddress.get(params.channelName) ?? '';
        apiPost<PusherAuthResponse>('/api/public/ramp/realtime/auth', {
          socket_id: params.socketId,
          channel_name: params.channelName,
          merchant_reference: merchantReference,
          wallet_address: walletAddress,
        })
          .then((data) => callback(null, data))
          .catch((err: unknown) => callback(err instanceof Error ? err : new Error('Realtime auth failed'), null));
      },
    },
  });
  return client;
}

/**
 * Subscribes to one transaction's real-time status feed. Returns an
 * unsubscribe function — always safe to call, including when Pusher isn't
 * configured at all (a no-op in that case, same as the subscribe itself).
 */
export function subscribeToRampStatus(
  merchantReference: string,
  walletAddress: string,
  onStatus: (event: RampStatusEvent) => void,
): () => void {
  const pusher = getClient();
  if (!pusher) return () => {};

  const channelName = rampStatusChannelName(merchantReference);
  channelWalletAddress.set(channelName, walletAddress);
  const channel = pusher.subscribe(channelName);
  const handler = (data: RampStatusEvent) => onStatus(data);
  channel.bind('ramp-status', handler);

  return () => {
    channel.unbind('ramp-status', handler);
    pusher.unsubscribe(channelName);
    channelWalletAddress.delete(channelName);
  };
}
