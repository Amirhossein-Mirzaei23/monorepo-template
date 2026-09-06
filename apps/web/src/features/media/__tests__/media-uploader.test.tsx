import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import type { MediaItem } from '../types';
import { MediaUploader } from '../components/media-uploader';

/**
 * MEDIA-004 uploader flow tests. Upload/compress/poster are mocked at their
 * module boundaries (the real XHR path is covered in use-upload.test.tsx):
 * pick → compress → upload → ready, client limit enforcement, error/retry/
 * remove, cover promotion, tap-to-swap reorder and the video modal path.
 */

const mockUploadImage = jest.fn();
const mockUploadVideo = jest.fn();

jest.mock('../hooks/use-upload', () => ({
  ...jest.requireActual('../hooks/use-upload'),
  useMediaUpload: () => ({
    uploadImage: (...args: unknown[]) => mockUploadImage(...args),
    uploadVideo: (...args: unknown[]) => mockUploadVideo(...args),
    cancelAll: () => undefined,
  }),
}));

const mockCompressImage = jest.fn();

jest.mock('../lib/compress', () => ({
  ...jest.requireActual('../lib/compress'),
  compressImage: (...args: unknown[]) => mockCompressImage(...args),
}));

const mockCapturePoster = jest.fn();

jest.mock('../lib/poster-capture', () => ({
  ...jest.requireActual('../lib/poster-capture'),
  captureVideoPoster: (...args: unknown[]) => mockCapturePoster(...args),
}));

const imageResponse = {
  id: 'asset-1',
  urls: {
    original: 'https://media.test/o.jpg',
    cover: 'https://media.test/c.webp',
    thumb: 'https://media.test/t.webp',
  },
  width: 100,
  height: 100,
};

const videoResponse = {
  id: 'asset-v1',
  urls: {
    video: 'https://media.test/v.mp4',
    poster: 'https://media.test/vp.jpg',
    posterThumb: 'https://media.test/vpt.webp',
  },
  durationMs: 5000,
};

const posterFile = new File([new ArrayBuffer(4)], 'clip.mp4-poster.jpg', { type: 'image/jpeg' });

function makeImageFile(name = 'photo.jpg'): File {
  return new File([new ArrayBuffer(8)], name, { type: 'image/jpeg' });
}

function makeVideoFile(sizeBytes = 16): File {
  return new File([new ArrayBuffer(sizeBytes)], 'clip.mp4', { type: 'video/mp4' });
}

function readyImage(key: string, url: string): MediaItem {
  return { key, kind: 'image', id: `asset-${key}`, url, thumbUrl: url, status: 'ready' };
}

function Harness(props: { initial?: MediaItem[]; imagesMax?: number; videosMax?: number }) {
  const [items, setItems] = useState<MediaItem[]>(props.initial ?? []);
  return (
    <MediaUploader
      value={items}
      onChange={setItems}
      imagesMax={props.imagesMax}
      videosMax={props.videosMax}
    />
  );
}

function pickFromGallery(files: File[]): void {
  const input = screen.getByLabelText('انتخاب تصویر از گالری');
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  mockUploadImage.mockReset();
  mockUploadVideo.mockReset();
  mockCompressImage.mockReset();
  mockCapturePoster.mockReset();
  mockCompressImage.mockImplementation(async (file: File) => file);
  mockCapturePoster.mockResolvedValue({ poster: posterFile, durationMs: 5000 });

  // jsdom has no object-URL implementation.
  let urlCounter = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: jest.fn(() => `blob:preview-${(urlCounter += 1)}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: jest.fn(),
  });
});

describe('image flow', () => {
  it('compresses a picked image, uploads it and renders the ready tile as cover', async () => {
    mockUploadImage.mockResolvedValue(imageResponse);
    render(<Harness />);

    const file = makeImageFile();
    pickFromGallery([file]);

    await waitFor(() => expect(mockCompressImage).toHaveBeenCalledWith(file));
    await waitFor(() => expect(mockUploadImage).toHaveBeenCalledWith(file, expect.any(Function)));

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.test/t.webp'),
    );
    expect(screen.getByText('کاور')).toBeInTheDocument(); // first item becomes the cover
  });

  it('shows the live percent while uploading (progressbar + polite live region)', async () => {
    let resolveUpload: (value: typeof imageResponse) => void = () => undefined;
    mockUploadImage.mockImplementation((_file: File, onProgress: (percent: number) => void) => {
      onProgress(40);
      return new Promise<typeof imageResponse>((resolve) => {
        resolveUpload = resolve;
      });
    });
    render(<Harness />);
    pickFromGallery([makeImageFile()]);

    expect(await screen.findByText('در حال آپلود… ٪۴۰')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

    await act(async () => {
      resolveUpload(imageResponse);
    });
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.test/t.webp'),
    );
  });

  it('clips picks beyond imagesMax and alerts in Persian', async () => {
    mockUploadImage.mockResolvedValue(imageResponse);
    render(<Harness imagesMax={1} />);
    pickFromGallery([makeImageFile('a.jpg'), makeImageFile('b.jpg')]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'حداکثر ۱ تصویر مجاز است — بقیه نادیده گرفته شد',
    );
    await waitFor(() => expect(mockUploadImage).toHaveBeenCalledTimes(1));
  });

  it('rejects oversize images before any upload', async () => {
    render(<Harness />);
    const oversized = new File([new ArrayBuffer(10)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });

    pickFromGallery([oversized]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'حجم تصویر نباید بیش از ۱۰ مگابایت باشد',
    );
    expect(mockCompressImage).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it('disables the pick buttons once imagesMax is reached', () => {
    render(<Harness initial={[readyImage('a', 'https://media.test/a')]} imagesMax={1} />);

    expect(screen.getByRole('button', { name: /دوربین/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /گالری/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ویدیو' })).toBeEnabled();
  });
});

describe('failure path', () => {
  it('shows a mapped Persian error tile and retries the same file', async () => {
    mockUploadImage
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockResolvedValueOnce(imageResponse);
    render(<Harness />);
    pickFromGallery([makeImageFile()]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'خطای سرور در پردازش فایل؛ دوباره تلاش کنید',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای آپلود تصویر' }));

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.test/t.webp'),
    );
    expect(mockUploadImage).toHaveBeenCalledTimes(2);
  });

  it('removes an errored tile', async () => {
    mockUploadImage.mockRejectedValue(new ApiError(0, 'offline'));
    render(<Harness />);
    pickFromGallery([makeImageFile()]);

    expect(await screen.findByRole('alert')).toHaveTextContent('برقراری ارتباط با سرور ممکن نشد');

    fireEvent.click(screen.getByRole('button', { name: 'حذف تصویر ۱' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('اولین رسانه، کاور اصلی می‌شود.')).toBeInTheDocument();
  });
});

describe('cover + reorder', () => {
  it('promotes another tile to cover via the badge', async () => {
    render(
      <Harness
        initial={[readyImage('a', 'https://media.test/a'), readyImage('b', 'https://media.test/b')]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'تنظیم تصویر ۲ به‌عنوان کاور' }));

    await waitFor(() => {
      const firstTile = screen.getAllByRole('listitem')[0];
      expect(firstTile?.querySelector('img')).toHaveAttribute('src', 'https://media.test/b');
    });
  });

  it('swaps tiles via tap-to-swap in edit mode', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[readyImage('a', 'https://media.test/a'), readyImage('b', 'https://media.test/b')]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'مرتب‌سازی' }));
    await user.click(screen.getByRole('button', { name: 'انتخاب تصویر ۱ برای جابه‌جایی' }));
    expect(screen.getByRole('button', { name: 'انتخاب تصویر ۱ برای جابه‌جایی' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'انتخاب تصویر ۲ برای جابه‌جایی' }));

    await waitFor(() => {
      const firstTile = screen.getAllByRole('listitem')[0];
      expect(firstTile?.querySelector('img')).toHaveAttribute('src', 'https://media.test/b');
    });
    expect(screen.getByRole('button', { name: 'پایان مرتب‌سازی' })).toBeInTheDocument();
  });
});

describe('video flow', () => {
  it('picks a video in the modal, captures a poster and uploads on confirm', async () => {
    const user = userEvent.setup();
    mockUploadVideo.mockResolvedValue(videoResponse);
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ویدیو' }));
    const dialog = screen.getByRole('dialog', { name: 'افزودن ویدیو' });
    expect(dialog).toHaveTextContent('حداکثر ۶۰ ثانیه');

    const file = makeVideoFile();
    fireEvent.change(screen.getByLabelText('انتخاب فایل ویدیو'), { target: { files: [file] } });

    await waitFor(() => expect(mockCapturePoster).toHaveBeenCalledWith(file));
    await user.click(await screen.findByRole('button', { name: 'افزودن ویدیو' }));

    await waitFor(() =>
      expect(mockUploadVideo).toHaveBeenCalledWith(
        { file, poster: posterFile, durationMs: 5000 },
        expect.any(Function),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.test/vpt.webp'),
    );
    expect(screen.getByText('۰:۰۵')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blocks confirming a video longer than 60s', async () => {
    const user = userEvent.setup();
    mockCapturePoster.mockResolvedValue({ poster: posterFile, durationMs: 62_000 });
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ویدیو' }));
    fireEvent.change(screen.getByLabelText('انتخاب فایل ویدیو'), {
      target: { files: [makeVideoFile()] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'طول ویدیو بیش از ۶۰ ثانیه مجاز نیست',
    );
    expect(screen.getByRole('button', { name: 'افزودن ویدیو' })).toBeDisabled();
    expect(mockUploadVideo).not.toHaveBeenCalled();
  });

  it('rejects an oversize video inside the modal before capture', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ویدیو' }));
    fireEvent.change(screen.getByLabelText('انتخاب فایل ویدیو'), {
      target: { files: [makeVideoFile(50 * 1024 * 1024 + 1)] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'حجم ویدیو نباید بیش از ۵۰ مگابایت باشد',
    );
    expect(mockCapturePoster).not.toHaveBeenCalled();
  });

  it('disables the video button at videosMax', () => {
    render(
      <Harness
        initial={[
          {
            key: 'v1',
            kind: 'video',
            id: 'asset-v1',
            url: 'https://media.test/v.mp4',
            thumbUrl: 'https://media.test/vpt.webp',
            status: 'ready',
            durationMs: 5000,
          },
        ]}
        videosMax={1}
      />,
    );

    expect(screen.getByRole('button', { name: 'ویدیو' })).toBeDisabled();
  });
});
