/**
 * PhilHealth ID scan at registration (MOD-01, docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §3–§4).
 *
 *   capture (phone's document scanner, or the fallback camera)
 *     → on-device text reading + instant check with @agap/shared (a hint only)
 *     → downscale to ~1600 px JPEG → upload; the server reads the card again and decides.
 *
 * Privacy: the card image, the text read from it and the PIN are personal data. Nothing here
 * logs them. Every image file is deleted from the cache in a `finally`, success or not.
 */
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { IdScanResponse } from '@agap/shared';
import { submitIdScan } from '../api/auth.api';
import {
  localReadVerdict,
  scanFailureFromError,
  type CropRect,
  type IdScanFailureReason,
} from '../../lib/id-verification';

export type { CropRect };

/** Long edge of the uploaded image (Phase 0: the scanner returns ~2500 px; the endpoint caps at 2 MB). */
export const UPLOAD_LONG_EDGE = 1600;
const UPLOAD_JPEG_QUALITY = 0.85;

/** What the capture step produced. */
export type IdCapture =
  | { kind: 'image'; uri: string }
  | { kind: 'cancelled' }
  /** No Google document scanner (e.g. a phone without Google Play services): show the fallback camera. */
  | { kind: 'scanner_unavailable' };

export type IdScanOutcome =
  | { kind: 'success'; result: IdScanResponse }
  | { kind: 'failed'; reason: IdScanFailureReason };

export interface ProcessIdImageOptions {
  /** Crop to the fallback camera's card frame before anything else. */
  crop?: CropRect;
  attemptNumber: number;
  latitude: number;
  longitude: number;
  /** Upload even if the phone's own check fails, and ask the server to keep an unreadable card for staff. */
  requestReview?: boolean;
}

/** Deletes a cache file. Never throws: the OS clears its cache eventually anyway. */
export function deleteCachedFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing else to do; never log the path of an ID image.
  }
}

/**
 * Opens the phone's own document scanner for one page: Google ML Kit on Android, VisionKit on
 * iOS. ML Kit's gallery import is off by default and the plugin never turns it on (Phase 0).
 */
export async function openDocumentScanner(): Promise<IdCapture> {
  let images: string[] = [];
  try {
    const scan = await DocumentScanner.scanDocument({
      maxNumDocuments: 1, // Android only; iOS may return more pages: the first is used.
      croppedImageQuality: 95, // Re-encoded at UPLOAD_JPEG_QUALITY after downscaling.
      responseType: ResponseType.ImageFilePath,
    });
    if (scan.status === ScanDocumentResponseStatus.Cancel) return { kind: 'cancelled' };
    images = scan.scannedImages ?? [];
  } catch {
    // ML Kit can't start (no Google Play services) or the scanner module is missing.
    return { kind: 'scanner_unavailable' };
  }
  const [first, ...extra] = images;
  extra.forEach(deleteCachedFile);
  return first ? { kind: 'image', uri: first } : { kind: 'cancelled' };
}

/** The phone's own reading of the card, or null when on-device text reading isn't available. */
async function readOnDevice(uri: string): Promise<string | null> {
  try {
    return (await TextRecognition.recognize(uri)).text;
  } catch {
    return null;
  }
}

/** Optional crop, then downscale so the long edge is at most UPLOAD_LONG_EDGE, saved as JPEG. */
async function prepareUpload(uri: string, crop: CropRect | undefined): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (crop) context.crop(crop);
  const cropped = await context.renderAsync();
  try {
    const longEdge = Math.max(cropped.width, cropped.height);
    if (longEdge <= UPLOAD_LONG_EDGE) {
      return (await cropped.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG })).uri;
    }
    const resize = cropped.width >= cropped.height ? { width: UPLOAD_LONG_EDGE } : { height: UPLOAD_LONG_EDGE };
    const resized = await ImageManipulator.manipulate(cropped).resize(resize).renderAsync();
    try {
      return (await resized.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG })).uri;
    } finally {
      resized.release();
    }
  } finally {
    cropped.release();
  }
}

/**
 * Checks and uploads one captured image. The captured file and the prepared upload are both
 * deleted before this returns, whatever the outcome.
 */
export async function processIdImage(sourceUri: string, options: ProcessIdImageOptions): Promise<IdScanOutcome> {
  let uploadUri: string | null = null;
  try {
    try {
      uploadUri = await prepareUpload(sourceUri, options.crop);
    } catch {
      return { kind: 'failed', reason: 'IMAGE_PROBLEM' };
    }

    // Read the prepared (cropped) image, so a fallback photo is judged on the card alone.
    const clientText = await readOnDevice(uploadUri);
    if (!options.requestReview && localReadVerdict(clientText) === 'not_recognised') {
      return { kind: 'failed', reason: 'NOT_RECOGNISED' };
    }

    const result = await submitIdScan(uploadUri, {
      ...(clientText ? { clientText } : {}),
      attemptNumber: options.attemptNumber,
      latitude: options.latitude,
      longitude: options.longitude,
      consentGiven: true,
      ...(options.requestReview ? { requestReview: true } : {}),
    });
    return { kind: 'success', result };
  } catch (err) {
    return { kind: 'failed', reason: scanFailureFromError(err) };
  } finally {
    deleteCachedFile(uploadUri);
    deleteCachedFile(sourceUri);
  }
}
