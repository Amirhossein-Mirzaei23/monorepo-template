import { fireEvent, render, screen } from '@testing-library/react';
import type { MediaItem } from '../types';
import { MediaGrid } from '../components/media-grid';

/**
 * MEDIA-004 grid tile states (pure rendering — no uploads here): progress
 * overlay, error alert with retry/remove, cover badge promotion, video tiles
 * with/without poster, and edit-mode reorder controls.
 */

function readyImage(key: string, url: string): MediaItem {
  return { key, kind: 'image', id: `asset-${key}`, url, thumbUrl: `${url}-thumb`, status: 'ready' };
}

function readyVideo(key: string, thumbUrl?: string): MediaItem {
  return {
    key,
    kind: 'video',
    id: `asset-${key}`,
    url: `https://media.test/${key}.mp4`,
    thumbUrl,
    status: 'ready',
    durationMs: 58_000,
  };
}

type Handlers = {
  onTileActivate: jest.Mock;
  onMove: jest.Mock;
  onSetCover: jest.Mock;
  onRetry: jest.Mock;
  onRemove: jest.Mock;
};

function renderGrid(
  items: MediaItem[],
  overrides?: Partial<Parameters<typeof MediaGrid>[0]>,
): Handlers {
  const handlers: Handlers = {
    onTileActivate: jest.fn(),
    onMove: jest.fn(),
    onSetCover: jest.fn(),
    onRetry: jest.fn(),
    onRemove: jest.fn(),
  };
  render(
    <MediaGrid items={items} editMode={false} selectedKey={null} {...handlers} {...overrides} />,
  );
  return handlers;
}

describe('MediaGrid', () => {
  it('shows a progressbar with the live percent on an uploading tile', () => {
    renderGrid([
      {
        key: 'k1',
        kind: 'image',
        url: 'blob:preview',
        status: 'uploading',
        progress: 40,
      },
    ]);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('در حال آپلود… ٪۴۰')).toBeInTheDocument();
  });

  it('renders an error tile as an alert with working retry and remove', () => {
    const handlers = renderGrid([
      {
        key: 'k1',
        kind: 'image',
        url: 'blob:preview',
        status: 'error',
        error: 'خطای سرور در پردازش فایل؛ دوباره تلاش کنید',
      },
    ]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'خطای سرور در پردازش فایل؛ دوباره تلاش کنید',
    );
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای آپلود تصویر' }));
    expect(handlers.onRetry).toHaveBeenCalledWith('k1');
    fireEvent.click(screen.getByRole('button', { name: 'حذف تصویر ۱' }));
    expect(handlers.onRemove).toHaveBeenCalledWith('k1');
  });

  it('marks the first ready item as static cover and promotes others via the badge', () => {
    const handlers = renderGrid([
      readyImage('a', 'https://media.test/a'),
      readyImage('b', 'https://media.test/b'),
    ]);

    expect(screen.getAllByRole('img')).toHaveLength(2);
    // One static «کاور» badge (index 0) + one «کاور» button for the other tile.
    expect(screen.getAllByText('کاور')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'تنظیم تصویر ۱ به‌عنوان کاور' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تنظیم تصویر ۲ به‌عنوان کاور' }));
    expect(handlers.onSetCover).toHaveBeenCalledWith('b');
  });

  it('renders a ready video with poster, play overlay and a fa duration chip', () => {
    renderGrid([readyVideo('v1', 'https://media.test/v1-poster')]);

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://media.test/v1-poster');
    expect(screen.getByText('۰:۵۸')).toBeInTheDocument();
  });

  it('falls back to a poster-less video placeholder (no broken <img>)', () => {
    renderGrid([readyVideo('v1')]);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('۰:۵۸')).toBeInTheDocument();
  });

  it('in edit mode, tiles are selectable and arrows emit move requests with edge guards', () => {
    const handlers = renderGrid(
      [readyImage('a', 'https://media.test/a'), readyImage('b', 'https://media.test/b')],
      {
        editMode: true,
        selectedKey: null,
      },
    );

    const first = screen.getByRole('button', { name: 'انتخاب تصویر ۱ برای جابه‌جایی' });
    expect(first).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(first);
    expect(handlers.onTileActivate).toHaveBeenCalledWith('a');

    expect(screen.getByRole('button', { name: 'جابه‌جایی تصویر ۱ به بالا' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'جابه‌جایی تصویر ۲ به پایین' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'جابه‌جایی تصویر ۱ به پایین' }));
    expect(handlers.onMove).toHaveBeenCalledWith('a', 1);
    fireEvent.click(screen.getByRole('button', { name: 'جابه‌جایی تصویر ۲ به بالا' }));
    expect(handlers.onMove).toHaveBeenCalledWith('b', -1);
  });

  it('marks the selected tile with aria-pressed in edit mode', () => {
    renderGrid([readyImage('a', 'https://media.test/a')], { editMode: true, selectedKey: 'a' });

    expect(screen.getByRole('button', { name: 'انتخاب تصویر ۱ برای جابه‌جایی' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
