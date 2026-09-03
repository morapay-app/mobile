import { apiGet } from './client';

/**
 * Real ENS resolution — `/api/ens/*` on the backend (see its
 * `src/controllers/ens.controller.ts`, backed by `ens.service.ts`). Note
 * these two routes answer OUTSIDE the `{ success, data }` envelope every
 * `/api/public/*` route uses: they reply `{ success, address, avatar }` /
 * `{ success, ensName, avatar }` at the top level, so `client.ts`'s
 * unwrapper passes the whole body through untouched and the fields are read
 * directly off it here.
 */

type EnsAddressResponse = {
  success?: boolean;
  address?: string | null;
  avatar?: string | null;
};

type EnsNameResponse = {
  success?: boolean;
  ensName?: string | null;
  avatar?: string | null;
};

export type EnsResolution = {
  address: string;
  avatar: string | null;
};

/** Resolves an ENS name (`vitalik.eth`) to the address it points at, or
 * `null` when the name simply doesn't resolve — a name with no record is a
 * normal, expected answer here (the user may still be typing), not an
 * error worth surfacing. A genuine transport/server failure still throws
 * as an `ApiError`, same as every other call in this folder. */
export async function resolveEnsName(ensName: string): Promise<EnsResolution | null> {
  const name = ensName.trim();
  if (!name) return null;
  const body = await apiGet<EnsAddressResponse>('/api/ens/address', { 'ens-name': name });
  const address = body?.address?.trim();
  return address ? { address, avatar: body.avatar?.trim() || null } : null;
}

/** Reverse lookup — the primary ENS name registered to an address, if any. */
export async function resolveEnsNameForAddress(address: string): Promise<string | null> {
  const value = address.trim();
  if (!value) return null;
  const body = await apiGet<EnsNameResponse>(`/api/ens/name/${encodeURIComponent(value)}`);
  return body?.ensName?.trim() || null;
}
