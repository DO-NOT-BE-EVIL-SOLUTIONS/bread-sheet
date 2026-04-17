import {
  deleteAsync,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import {
  PENDING_RETURN_TO_KEY,
  __resetPendingReturnToCacheForTests,
  clearPendingReturnTo,
  getPendingReturnTo,
  setPendingReturnTo,
} from './pending-return-to';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

const mockWrite = writeAsStringAsync as jest.Mock;
const mockRead = readAsStringAsync as jest.Mock;
const mockInfo = getInfoAsync as jest.Mock;
const mockDelete = deleteAsync as jest.Mock;

describe('pending-return-to', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingReturnToCacheForTests();
  });

  it('uses "pendingReturnTo" as the persisted key name', () => {
    expect(PENDING_RETURN_TO_KEY).toBe('pendingReturnTo');
  });

  it('writes the return path to the document directory when set', async () => {
    mockWrite.mockResolvedValue(undefined);
    await setPendingReturnTo('/product/1234567890123');
    expect(mockWrite).toHaveBeenCalledWith(
      'file:///documents/pendingReturnTo.txt',
      '/product/1234567890123',
    );
  });

  it('round-trips the written value via getPendingReturnTo from the in-memory cache', async () => {
    mockWrite.mockResolvedValue(undefined);
    await setPendingReturnTo('/product/1234567890123');
    // Cache is warm after set — disk read must not be needed
    const value = await getPendingReturnTo();
    expect(value).toBe('/product/1234567890123');
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('reads the value from disk on a cold start', async () => {
    mockInfo.mockResolvedValue({ exists: true });
    mockRead.mockResolvedValue('/product/999');
    const value = await getPendingReturnTo();
    expect(mockInfo).toHaveBeenCalledWith('file:///documents/pendingReturnTo.txt');
    expect(mockRead).toHaveBeenCalledWith('file:///documents/pendingReturnTo.txt');
    expect(value).toBe('/product/999');
  });

  it('returns null when no value has been persisted', async () => {
    mockInfo.mockResolvedValue({ exists: false });
    const value = await getPendingReturnTo();
    expect(value).toBeNull();
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('returns null when the disk read throws', async () => {
    mockInfo.mockRejectedValue(new Error('boom'));
    const value = await getPendingReturnTo();
    expect(value).toBeNull();
  });

  it('deletes the file when cleared', async () => {
    mockWrite.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    await setPendingReturnTo('/product/123');
    await clearPendingReturnTo();
    expect(mockDelete).toHaveBeenCalledWith(
      'file:///documents/pendingReturnTo.txt',
      { idempotent: true },
    );
    // Cache is cleared too — subsequent read without disk returns null
    mockInfo.mockResolvedValue({ exists: false });
    __resetPendingReturnToCacheForTests();
    mockInfo.mockResolvedValue({ exists: false });
    const value = await getPendingReturnTo();
    expect(value).toBeNull();
  });

  it('does not throw when writeAsStringAsync rejects', async () => {
    mockWrite.mockRejectedValue(new Error('disk full'));
    await expect(setPendingReturnTo('/product/123')).resolves.toBeUndefined();
    // The in-memory cache should still carry the value so the app does not lose
    // the intent in the common (non-cold-start) case.
    const value = await getPendingReturnTo();
    expect(value).toBe('/product/123');
  });
});
