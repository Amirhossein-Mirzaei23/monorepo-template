import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as the other suites in this folder).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    accessToken: () => 'test-access-token',
    user: { id: 'user-1' },
  }),
}));

import { MediaBubble } from '../components/media-bubble';

/**
 * MediaBubble tests (CHT-007): bytes load through the AUTHED FETCH (bearer
 * header on the /media/secure/ URL) → blob → object URL and the object URL is
 * REVOKED on unmount; a 403 from the secure route renders the access-denied
 * copy; the video renders its poster with a tap-to-play affordance; tapping
 * an image opens the fullscreen overlay which closes via the ✕ button.
 */

const createObjectUrl = jest.fn((_blob?: Blob) => 'blob:media-preview');
const revokeObjectURL = jest.fn();

const blobs = new Map<string, Blob>();
let fetchMock: jest.Mock;

beforeAll(() => {
  Object.defineProperty(global.URL, 'createObjectURL', { value: createObjectUrl });
  Object.defineProperty(global.URL, 'revokeObjectURL', { value: revokeObjectURL });
});

beforeEach(() => {
  createObjectUrl.mockClear().mockReturnValue('blob:media-preview');
  revokeObjectURL.mockClear();
  blobs.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  // Blob URL registry: each created object URL serves its blob back.
  createObjectUrl.mockImplementation((_blob?: Blob) => {
    const url = `blob:media-${blobs.size}`;
    if (_blob) {
      blobs.set(url, _blob);
    }
    return url;
  });
});

function okBlobResponse(text: string, contentType: string): Response {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob([text], { type: contentType }),
  } as unknown as Response;
}

describe('MediaBubble (CHT-007 secure media)', () => {
  it('loads image bytes with the bearer header and renders the blob object URL', async () => {
    fetchMock.mockResolvedValue(okBlobResponse('image-bytes', 'image/webp'));

    const view = render(
      <MediaBubble
        mediaType="IMAGE"
        storageKey="2026/03/img0000000001.png"
        previewKey="2026/03/img0000000001c.webp"
        createdAt="2026-09-05T09:30:00.000Z"
        variant="own"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'پیوست تصویری' })).toHaveAttribute(
        'src',
        'blob:media-0',
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/media/secure/2026/03/img0000000001c.webp'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-access-token' },
      }),
    );

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:media-0');
  });

  it('renders the access-denied copy when the secure route answers 403', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 } as unknown as Response);

    render(
      <MediaBubble
        mediaType="IMAGE"
        storageKey="2026/03/img0000000001.png"
        previewKey="2026/03/img0000000001c.webp"
        createdAt="2026-09-05T09:30:00.000Z"
        variant="other"
      />,
    );

    expect(await screen.findByText('دسترسی به این رسانه را ندارید')).toBeInTheDocument();
  });

  it('renders the poster with a play affordance; tapping loads the original video bytes inline', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(okBlobResponse('poster-bytes', 'image/webp')) // the poster
      .mockResolvedValueOnce(okBlobResponse('mp4-bytes', 'video/mp4')); // the player

    render(
      <MediaBubble
        mediaType="VIDEO"
        storageKey="2026/03/clip0000000001.mp4"
        previewKey="2026/03/clip0000000001pt.webp"
        createdAt="2026-09-05T09:30:00.000Z"
        variant="other"
      />,
    );

    const play = await screen.findByRole('button', { name: 'پخش ویدیو' });
    expect(play).toBeInTheDocument();
    // Only the poster is fetched before the tap (tap-to-play).
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(play);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[0]).toContain('/media/secure/2026/03/clip0000000001.mp4');
    });
    // jsdom maps no ARIA role to <video>; query the element itself.
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('opens the fullscreen overlay on image tap and closes it from the ✕ button', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: unknown) =>
      Promise.resolve(
        String(url).endsWith('c.webp')
          ? okBlobResponse('image-bytes', 'image/webp')
          : okBlobResponse('original-bytes', 'image/png'),
      ),
    );

    render(
      <MediaBubble
        mediaType="IMAGE"
        storageKey="2026/03/img0000000001.png"
        previewKey="2026/03/img0000000001c.webp"
        createdAt="2026-09-05T09:30:00.000Z"
        variant="own"
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'نمایش تصویر در اندازه کامل' }));

    const dialog = await screen.findByRole('dialog', { name: 'نمایش تمام‌صفحه تصویر' });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بستن' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the failed/retry chrome from the optimistic send stage without opening media', async () => {
    render(
      <MediaBubble
        mediaType="IMAGE"
        storageKey="2026/03/img0000000001.png"
        previewKey="2026/03/img0000000001c.webp"
        createdAt="2026-09-05T09:30:00.000Z"
        variant="own"
        status="failed"
        onRetry={jest.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'تلاش مجدد برای ارسال' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'نمایش تصویر در اندازه کامل' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد برای ارسال' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
