/// <reference types="jest" />
import { IdVerificationErrorCode } from '@agap/shared';
import { ApiError, NetworkError } from '../../api/http';
import { submitIdScan } from '../../api/auth.api';
import { processIdImage } from '../id-scan';

// MOD-01: the chosen ID reaches the phone's own check and the upload (National ID plan §4.2). The
// screens have no component tests, so this is the part of "the type isn't lost" a test can show.
// Native modules are stubbed. Invented text and fake numbers only.

const mockRecognize = jest.fn();
const mockDelete = jest.fn();
const mockUpload = jest.fn();
const mockUploadTask = jest.fn();

jest.mock('react-native-document-scanner-plugin', () => ({
  __esModule: true,
  default: { scanDocument: jest.fn() },
  ResponseType: { ImageFilePath: 'imageFilePath' },
  ScanDocumentResponseStatus: { Cancel: 'cancel' },
}));
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: (uri: string) => mockRecognize(uri) },
}));
jest.mock('expo-image-manipulator', () => {
  const rendered = {
    width: 1000,
    height: 600,
    release: jest.fn(),
    saveAsync: jest.fn(async () => ({ uri: 'file:///cache/upload.jpg' })),
  };
  const context = { crop: jest.fn(), resize: jest.fn(), renderAsync: jest.fn(async () => rendered) };
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' } };
});
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, exists: true, delete: () => mockDelete(uri) })),
  UploadType: { MULTIPART: 1 },
  UploadTask: jest.fn().mockImplementation((_file: unknown, _url: string, options: unknown) => {
    mockUploadTask(options);
    return { uploadAsync: mockUpload };
  }),
}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('../../api/auth.api', () => ({
  ...jest.requireActual('../../api/auth.api'),
  submitIdScan: jest.fn(),
}));

const mockedSubmit = submitIdScan as jest.MockedFunction<typeof submitIdScan>;

const NATIONAL_TEXT = 'PAMBANSANG PAGKAKAKILANLAN\n0000-0000-0000-0001\nApelyido/Last Name\nDELA CRUZ';
const PHILHEALTH_TEXT = 'PhilHealth\nPhilippine Health Insurance Corporation\n00-000000001-0\nDELA CRUZ, JUAN SANTOS';
const COORDS = { latitude: 14.7977, longitude: 120.9374, attemptNumber: 1 };
const RESULT = { token: 't', nameOnId: null, pinLast4: '0001', reviewRequired: false, documentType: 'NATIONAL_ID' as const };

beforeEach(() => {
  jest.clearAllMocks();
  mockedSubmit.mockResolvedValue(RESULT);
});

const deletedBoth = () => {
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/upload.jpg');
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/source.jpg');
};

describe('processIdImage', () => {
  it('a National ID, with that ID chosen, is uploaded naming the National ID', async () => {
    mockRecognize.mockResolvedValue({ text: NATIONAL_TEXT });
    const outcome = await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType: 'NATIONAL_ID' });

    expect(outcome).toEqual({ kind: 'success', result: RESULT });
    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0]![1]).toMatchObject({ documentType: 'NATIONAL_ID', clientText: NATIONAL_TEXT, consentGiven: true });
    deletedBoth();
  });

  it('a PhilHealth ID, with that ID chosen, is uploaded naming the PhilHealth ID', async () => {
    mockRecognize.mockResolvedValue({ text: PHILHEALTH_TEXT });
    await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType: 'PHILHEALTH' });
    expect(mockedSubmit.mock.calls[0]![1]).toMatchObject({ documentType: 'PHILHEALTH' });
  });

  it.each([
    ['NATIONAL_ID', PHILHEALTH_TEXT],
    ['PHILHEALTH', NATIONAL_TEXT],
  ] as const)('%s chosen, the other card read: stopped on the phone, nothing uploaded, files deleted', async (documentType, text) => {
    mockRecognize.mockResolvedValue({ text });
    const outcome = await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType });

    expect(outcome).toEqual({ kind: 'failed', reason: 'NOT_RECOGNISED' });
    expect(mockedSubmit).not.toHaveBeenCalled();
    deletedBoth();
  });

  it('a review upload goes up even though the phone refused it, still naming the chosen ID', async () => {
    mockRecognize.mockResolvedValue({ text: PHILHEALTH_TEXT });
    await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType: 'NATIONAL_ID', requestReview: true });
    expect(mockedSubmit.mock.calls[0]![1]).toMatchObject({ documentType: 'NATIONAL_ID', requestReview: true });
  });

  it('a phone that cannot read text uploads anyway, naming the chosen ID, and the server decides', async () => {
    mockRecognize.mockRejectedValue(new Error('no module'));
    await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType: 'NATIONAL_ID' });
    expect(mockedSubmit.mock.calls[0]![1]).toMatchObject({ documentType: 'NATIONAL_ID' });
    expect(mockedSubmit.mock.calls[0]![1]).not.toHaveProperty('clientText');
  });

  it("the server's wrong-card refusal comes back as NOT_NATIONAL_ID, and files are still deleted", async () => {
    mockRecognize.mockResolvedValue({ text: NATIONAL_TEXT });
    mockedSubmit.mockRejectedValue(new ApiError('refused', 422, { code: IdVerificationErrorCode.NOT_NATIONAL_ID }));
    const outcome = await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType: 'NATIONAL_ID' });
    expect(outcome).toEqual({ kind: 'failed', reason: 'NOT_NATIONAL_ID' });
    deletedBoth();
  });

  it('a lost connection during the upload is offline, not a used attempt on the card', async () => {
    mockRecognize.mockResolvedValue({ text: NATIONAL_TEXT });
    mockedSubmit.mockRejectedValue(new NetworkError());
    const outcome = await processIdImage('file:///cache/source.jpg', { ...COORDS, documentType: 'NATIONAL_ID' });
    expect(outcome).toEqual({ kind: 'failed', reason: 'OFFLINE' });
  });
});

describe('submitIdScan', () => {
  const realSubmit = (jest.requireActual('../../api/auth.api') as typeof import('../../api/auth.api')).submitIdScan;

  it.each(['NATIONAL_ID', 'PHILHEALTH'] as const)('sends documentType %s in the upload', async (documentType) => {
    mockUpload.mockResolvedValue({ status: 200, body: JSON.stringify(RESULT) });
    await realSubmit('file:///cache/upload.jpg', { documentType, attemptNumber: 1, latitude: 14.7, longitude: 120.9, consentGiven: true });

    expect(mockUploadTask).toHaveBeenCalledTimes(1);
    expect(mockUploadTask.mock.calls[0]![0].parameters).toMatchObject({ documentType, consentGiven: 'true', attemptNumber: '1' });
  });
});
