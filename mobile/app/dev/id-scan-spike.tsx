// PhilHealth ID verification, Phase 0 spike (docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §9).
// Dev builds only. Proves the phone's document scanner and on-device text reading work.
// It never shows or logs the recognised text: a scanned ID is personal data. The scanned
// image is deleted from the cache as soon as it has been read.
// Delete this screen in Phase 3 (Prompt 3, step 8).
import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { File } from 'expo-file-system';

// Spike-only check. The real PIN parser lives in shared/src/validation/philhealth-id.ts (Phase 1).
const PIN_PATTERN = /\b\d{2}[-\s]?\d{9}[-\s]?\d\b/;

type SpikeResult =
  | { kind: 'ok'; pinFound: boolean; lineCount: number; width: number; height: number; readMs: number }
  | { kind: 'cancelled' }
  | { kind: 'error'; stage: 'scanner' | 'text' | 'image'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function deleteScan(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache file; the OS clears it eventually. Nothing to report in a spike.
  }
}

async function runSpike(): Promise<SpikeResult> {
  let uri: string | undefined;
  try {
    const scan = await DocumentScanner.scanDocument({
      maxNumDocuments: 1,
      croppedImageQuality: 85,
      responseType: ResponseType.ImageFilePath,
    });
    if (scan.status === ScanDocumentResponseStatus.Cancel) return { kind: 'cancelled' };
    uri = scan.scannedImages?.[0];
    if (!uri) return { kind: 'error', stage: 'scanner', message: 'Scanner returned no image' };
  } catch (error) {
    return { kind: 'error', stage: 'scanner', message: errorMessage(error) };
  }

  try {
    let size: { width: number; height: number };
    try {
      size = await imageSize(uri);
    } catch (error) {
      return { kind: 'error', stage: 'image', message: errorMessage(error) };
    }

    const startedAt = Date.now();
    try {
      const result = await TextRecognition.recognize(uri);
      const lineCount = result.blocks.reduce((total, block) => total + block.lines.length, 0);
      return {
        kind: 'ok',
        pinFound: PIN_PATTERN.test(result.text),
        lineCount,
        readMs: Date.now() - startedAt,
        ...size,
      };
    } catch (error) {
      return { kind: 'error', stage: 'text', message: errorMessage(error) };
    }
  } finally {
    deleteScan(uri);
  }
}

export default function IdScanSpikeScreen(): React.ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpikeResult | null>(null);

  if (!__DEV__) return null;

  const scan = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    setResult(await runSpike());
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>PhilHealth ID scan spike</Text>
      <Text style={styles.note}>
        Dev only. Shows whether a PIN pattern was found, the line count and the image size. The card text is never shown.
      </Text>

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={scan}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Scan ID</Text>}
      </TouchableOpacity>

      {result?.kind === 'ok' && (
        <View style={styles.card}>
          <Row label="12-digit PIN pattern found" value={result.pinFound ? 'yes' : 'no'} />
          <Row label="Text lines" value={String(result.lineCount)} />
          <Row label="Image size" value={`${result.width} × ${result.height} px`} />
          <Row label="Text reading time" value={`${result.readMs} ms`} />
        </View>
      )}
      {result?.kind === 'cancelled' && <Text style={styles.note}>Scan cancelled.</Text>}
      {result?.kind === 'error' && (
        <View style={[styles.card, styles.errorCard]}>
          <Row label="Failed at" value={result.stage} />
          <Text style={styles.errorText}>{result.message}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 16, backgroundColor: '#FFFFFF', flexGrow: 1 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  note: { fontSize: 14, color: '#475569' },
  button: { backgroundColor: '#0D6053', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  card: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, gap: 10 },
  errorCard: { borderColor: '#FECDCA', backgroundColor: '#FEF3F2' },
  errorText: { fontSize: 14, color: '#B42318' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, color: '#475569' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
});
