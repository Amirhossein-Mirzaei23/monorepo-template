import { act, renderHook, waitFor } from '@testing-library/react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as the other suites in this folder). The factory must not
// dereference test-local variables at evaluation time (imports hoist above
// them) — closures over the `mocks` holder keep it lazy.
jest.mock('../../media', () => ({
  useMediaUpload: () => ({
    uploadImage: (...args: unknown[]) => mocks.uploadImage(...args),
    uploadVideo: (...args: unknown[]) => mocks.uploadVideo(...args),
    cancelAll: () => undefined,
  }),
  describeUploadError: () => 'آپلود ناموفق بود؛ دوباره تلاش کنید',
  captureVideoPoster: (...args: unknown[]) => mocks.capturePoster(...args),
}));

jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    accessToken: () => 'test-access-token',
    user: { id: 'user-1' },
  }),
}));

import { useAttachmentSend } from '../hooks/use-attachment-send';

/**
 * useAttachmentSend hook tests (CHT-007): the composer's upload pipeline —
 * picked image → XHR upload with progress → onReady({mediaAssetId}); the
 * CLIENT CAPS (5 concurrent images / 1 concurrent video) refuse excess picks
 * with a Persian notice; a failed upload keeps a retryable tile and retry
 * re-runs the SAME upload; videos capture a poster before the XHR.
 */

const mocks = {
  uploadImage: jest.fn(),
  uploadVideo: jest.fn(),
  capturePoster: jest.fn(),
};

const createObjectUrl = jest.fn(() => 'blob:local-preview');
const revokeObjectURL = jest.fn();

const imageFile = (name = 'photo.png'): File =>
  new File(['image-bytes'], name, { type: 'image/png' });
const videoFile = (name = 'clip.mp4'): File =>
  new File(['video-bytes'], name, { type: 'video/mp4' });

function setup(onReady: jest.Mock = jest.fn()) {
  return renderHook(() => useAttachmentSend({ onReady }));
}

beforeAll(() => {
  Object.defineProperty(global.URL, 'createObjectURL', { value: createObjectUrl });
  Object.defineProperty(global.URL, 'revokeObjectURL', { value: revokeObjectURL });
});

beforeEach(() => {
  createObjectUrl.mockClear().mockReturnValue('blob:local-preview');
  revokeObjectURL.mockClear();
  mocks.uploadImage.mockReset();
  mocks.uploadVideo.mockReset();
  mocks.capturePoster.mockReset();
});

describe('useAttachmentSend (CHT-007)', () => {
  it('uploads a picked image with progress and hands the asset id to onReady', async () => {
    const onReady = jest.fn();
    mocks.uploadImage.mockImplementation(
      async (_file: File, onProgress?: (percent: number) => void) => {
        onProgress?.(60);
        return { id: 'asset-1', urls: {}, width: 10, height: 10 };
      },
    );
    const { result } = setup(onReady);

    act(() => result.current.attachImage(imageFile()));

    expect(result.current.pendingUploads).toHaveLength(1);
    expect(result.current.pendingUploads[0]?.status).toBe('uploading');

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith({
        kind: 'IMAGE',
        mediaAssetId: 'asset-1',
        localPreviewUrl: 'blob:local-preview',
      });
    });
    expect(result.current.pendingUploads).toHaveLength(0); // handed to the send hook
  });

  it('enforces the CLIENT CAPS: 5 concurrent images, 1 concurrent video — excess picks get a notice', async () => {
    mocks.uploadImage.mockReturnValue(new Promise(() => undefined)); // never settles
    mocks.capturePoster.mockReturnValue(new Promise(() => undefined));
    const { result } = setup();

    for (let index = 0; index < 5; index += 1) {
      act(() => result.current.attachImage(imageFile(`p${index}.png`)));
    }
    expect(result.current.pendingUploads).toHaveLength(5);
    expect(result.current.notice).toBeNull();

    act(() => result.current.attachImage(imageFile('p6.png')));
    expect(result.current.pendingUploads).toHaveLength(5); // refused
    expect(result.current.notice).toContain('حداکثر ۵ تصویر');

    act(() => result.current.attachVideo(videoFile()));
    expect(result.current.pendingUploads.filter((item) => item.kind === 'VIDEO')).toHaveLength(1);

    act(() => result.current.attachVideo(videoFile('second.mp4')));
    expect(result.current.pendingUploads.filter((item) => item.kind === 'VIDEO')).toHaveLength(1);
    expect(result.current.notice).toContain('یک ویدیو همزمان');
  });

  it('keeps a failed upload retryable: retry re-runs the SAME file, remove drops the tile', async () => {
    const onReady = jest.fn();
    mocks.uploadImage
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ id: 'asset-2', urls: {}, width: 10, height: 10 });
    const { result } = setup(onReady);

    act(() => result.current.attachImage(imageFile()));
    await waitFor(() => {
      expect(result.current.pendingUploads[0]?.status).toBe('failed');
    });
    expect(result.current.pendingUploads[0]?.error).toContain('آپلود ناموفق بود');

    act(() => result.current.retry(result.current.pendingUploads[0]?.uploadId as number));
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ mediaAssetId: 'asset-2' }));
    });
    expect(mocks.uploadImage).toHaveBeenCalledTimes(2);
    expect(result.current.pendingUploads).toHaveLength(0);
  });

  it('captures a poster for videos before uploading and passes it to uploadVideo', async () => {
    const onReady = jest.fn();
    const poster = new File(['poster'], 'poster.jpg', { type: 'image/jpeg' });
    mocks.capturePoster.mockResolvedValue({ poster, durationMs: 3_500 });
    mocks.uploadVideo.mockResolvedValue({
      id: 'asset-video-1',
      urls: {},
      durationMs: 3_500,
    });
    const { result } = setup(onReady);

    act(() => result.current.attachVideo(videoFile()));

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith({
        kind: 'VIDEO',
        mediaAssetId: 'asset-video-1',
        localPreviewUrl: 'blob:local-preview',
      });
    });
    expect(mocks.uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({ poster, durationMs: 3_500 }),
      expect.any(Function),
    );
  });
});
