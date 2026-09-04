import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

const FILE_NAME = 'morapay-receipt';

/**
 * Rasterizes the ticket into a PNG — a `data:` URI on web (via
 * `react-native-view-shot`'s own `html2canvas`-backed web implementation),
 * a real temp-file URI on native.
 */
export async function captureReceipt(ref: RefObject<View | null>): Promise<string> {
  return captureRef(ref, {
    format: 'png',
    quality: 1,
    result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
  });
}

function dataUriToFile(dataUri: string, filename: string): File {
  const [header, base64] = dataUri.split(',');
  const mime = /data:(.*?);base64/.exec(header ?? '')?.[1] ?? 'image/png';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/** Saves the captured image locally. Web: a synthetic `<a download>` click
 * (no real "downloads" folder concept for a native share sheet to target).
 * Native: no `expo-media-library` permission dance in this pass — the
 * share sheet itself (iOS's "Save Image", Android's "Save to...") already
 * covers it, so this just opens that. */
export async function downloadReceipt(uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = uri;
    link.download = `${FILE_NAME}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { dialogTitle: 'Save receipt' });
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

/**
 * Native image + caption share. Web: the actual Web Share API with a real
 * image `File` attached (not just a text/link share) when the browser
 * supports sharing files at all; native: `expo-sharing`, which hands the
 * OS share sheet a real file (no caption slot — that's a native share-sheet
 * limitation, not something this function can work around).
 *
 * Returns `'unsupported'` when there's no native share surface at all, so
 * the caller can fall back to `ShareFallbackSheet` (copy link / X intent /
 * WhatsApp intent) instead of silently doing nothing.
 */
export async function shareReceipt(uri: string, caption: string): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };
    if (!nav.share) return 'unsupported';
    const file = dataUriToFile(uri, `${FILE_NAME}.png`);
    const shareData: ShareData = nav.canShare?.({ files: [file] }) ? { files: [file], text: caption } : { text: caption };
    try {
      await nav.share(shareData);
      return 'shared';
    } catch (err) {
      // AbortError is the user dismissing the native share sheet — not a
      // real failure, so it shouldn't read as one.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      return 'unsupported';
    }
  }

  if (!(await Sharing.isAvailableAsync())) return 'unsupported';
  try {
    await Sharing.shareAsync(uri, { dialogTitle: caption });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
