// National ID verification, Phase 0 spike (docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md §9).
// Dev builds only. Measures how well the phone reads a National ID: it compares what the citizen
// typed with what was read and shows only yes/no results and counts. The recognised text and the
// number read never reach component state, the screen or a log: a scanned ID is personal data.
// The scanned image is deleted from the cache as soon as it has been read.
// Delete this screen and its profile row in Phase 3 (Prompt 3, step 8).
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { File } from 'expo-file-system';
import { normalizeNamePart } from '@agap/shared';

// Spike-only checks. The real parsers go in shared/src/validation/national-id.ts (Phase 1).
// No lookbehind: Hermes compatibility. [ \t] only, so a number can't be joined across two lines.
const GROUP_SEPARATOR = '[ \\t]*[-–—]?[ \\t]*';
const CARD_NUMBER_SOURCE = `(?:^|\\D)(\\d{4})${GROUP_SEPARATOR}(\\d{4})${GROUP_SEPARATOR}(\\d{4})${GROUP_SEPARATOR}(\\d{4})(?!\\d)`;
const CARD_NUMBER = new RegExp(CARD_NUMBER_SOURCE);
const ALL_CARD_NUMBERS = new RegExp(CARD_NUMBER_SOURCE, 'g');
const ALL_TWELVE_DIGIT_RUNS = new RegExp(`(?:^|\\D)\\d{4}${GROUP_SEPARATOR}\\d{4}${GROUP_SEPARATOR}\\d{4}(?!\\d)`, 'g');
// Plan §6 candidates, unconfirmed. Compared as letters only, so OCR spacing doesn't matter.
const ENGLISH_HEADING = 'PHILIPPINEIDENTIFICATIONCARD';
const FILIPINO_HEADING = 'PAMBANSANGPAGKAKAKILANLAN';

type Check = 'yes' | 'no' | 'not checked';

interface TypedCard {
  number: string;
  lastName: string;
  givenNames: string;
  middleName: string;
}

interface TextFindings {
  englishHeading: boolean;
  filipinoHeading: boolean;
  cardNumberFound: boolean;
  twelveDigitRuns: number;
  numberMatch: Check;
  lastNameMatch: Check;
  givenNamesMatch: Check;
  middleNameMatch: Check;
}

function wordsOf(value: string): string[] {
  // normalizeNamePart deletes commas, which would glue words that OCR read as `CRUZ,JUAN`.
  return normalizeNamePart(value.replace(/,/g, ' ')).split(/[^A-Z0-9]+/).filter(Boolean);
}

/** Whether the typed words appear together, in order and as whole words, in the text's words. */
function nameCheck(typed: string, textWords: string[]): Check {
  const words = wordsOf(typed);
  if (words.length === 0) return 'not checked';
  for (let start = 0; start + words.length <= textWords.length; start += 1) {
    if (words.every((word, offset) => textWords[start + offset] === word)) return 'yes';
  }
  return 'no';
}

function numberCheck(typed: string, text: string): Check {
  const wanted = typed.replace(/[\s\-–—]/g, '').toUpperCase();
  if (!wanted) return 'not checked';
  const read = CARD_NUMBER.exec(text);
  return read !== null && read.slice(1, 5).join('') === wanted ? 'yes' : 'no';
}

/** Everything the screen is allowed to know about the text: yes/no answers and a count. */
function inspectText(text: string, typed: TypedCard): TextFindings {
  const letters = normalizeNamePart(text).replace(/[^A-Z]/g, '');
  const textWords = wordsOf(text);
  // Remove card numbers first, or the first three groups of one would count as a 12-digit run.
  const withoutCardNumbers = text.replace(ALL_CARD_NUMBERS, ' ');
  return {
    englishHeading: letters.includes(ENGLISH_HEADING),
    filipinoHeading: letters.includes(FILIPINO_HEADING),
    cardNumberFound: CARD_NUMBER.test(text),
    twelveDigitRuns: (withoutCardNumbers.match(ALL_TWELVE_DIGIT_RUNS) ?? []).length,
    numberMatch: numberCheck(typed.number, text),
    lastNameMatch: nameCheck(typed.lastName, textWords),
    givenNamesMatch: nameCheck(typed.givenNames, textWords),
    middleNameMatch: nameCheck(typed.middleName, textWords),
  };
}

type SpikeResult =
  | ({ kind: 'ok'; lineCount: number; width: number; height: number; readMs: number } & TextFindings)
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

async function runSpike(typed: TypedCard): Promise<SpikeResult> {
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
      const readMs = Date.now() - startedAt;
      const lineCount = result.blocks.reduce((total, block) => total + block.lines.length, 0);
      return { kind: 'ok', ...inspectText(result.text, typed), lineCount, readMs, ...size };
    } catch (error) {
      return { kind: 'error', stage: 'text', message: errorMessage(error) };
    }
  } finally {
    deleteScan(uri);
  }
}

const NO_TYPED_CARD: TypedCard = { number: '', lastName: '', givenNames: '', middleName: '' };

export default function IdScanSpikeScreen(): React.ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState<TypedCard>(NO_TYPED_CARD);
  const [result, setResult] = useState<SpikeResult | null>(null);

  // Typed card details stay for rescans of the same card, and go when the screen is left.
  useFocusEffect(
    useCallback(
      () => () => {
        setTyped(NO_TYPED_CARD);
        setResult(null);
      },
      [],
    ),
  );

  if (!__DEV__) return null;

  const edit = (field: keyof TypedCard, value: string): void => {
    setTyped((current) => ({ ...current, [field]: value }));
    setResult(null);
  };

  const scan = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    setResult(await runSpike(typed));
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>National ID scan spike</Text>
      <Text style={styles.note}>
        Dev only. Fill these in, then scan. It shows only yes/no results and counts. The card text is never shown or kept.
      </Text>

      <CardField label="Type the number on your card" value={typed.number} editable={!busy} onChange={(value) => edit('number', value)} />
      <CardField label="Last name" value={typed.lastName} editable={!busy} onChange={(value) => edit('lastName', value)} />
      <CardField label="Given names" value={typed.givenNames} editable={!busy} onChange={(value) => edit('givenNames', value)} />
      <CardField label="Middle name (blank if the card has none)" value={typed.middleName} editable={!busy} onChange={(value) => edit('middleName', value)} />

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
          <Row label="Number exact match" value={result.numberMatch} />
          <Row label="Last name match" value={result.lastNameMatch} />
          <Row label="Given names match" value={result.givenNamesMatch} />
          <Row label="Middle name match" value={result.middleNameMatch} />
          <Row label="16-digit number found" value={result.cardNumberFound ? 'yes' : 'no'} />
          <Row label="12-digit runs found" value={String(result.twelveDigitRuns)} />
          <Row label="English heading found" value={result.englishHeading ? 'yes' : 'no'} />
          <Row label="Filipino heading found" value={result.filipinoHeading ? 'yes' : 'no'} />
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

function CardField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}): React.ReactElement {
  // No autocorrect, suggestions or autofill, so the keyboard doesn't learn card details. A text
  // keyboard, not a numbers-only one: Phase 0 has to find out whether cards contain letters.
  return (
    <View style={styles.field}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        editable={editable}
        accessibilityLabel={label}
        keyboardType="visible-password"
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
      />
    </View>
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
  field: { gap: 6 },
  input: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0F172A' },
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
