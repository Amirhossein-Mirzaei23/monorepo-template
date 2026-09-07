import { fireEvent, render, screen } from '@testing-library/react';
import { MediaGallery } from '../components/media-gallery';
import { lotDetailFixture } from '../testing/fixtures';

/**
 * MKT-009 gallery component tests: image rendering (alt/src, eager first
 * slide), video slides (poster + inline controls), per-image error fallback,
 * the empty-gallery placeholder and the multi-slide dots indicator.
 */

describe('MediaGallery', () => {
  it('renders one placeholder tile for an empty gallery', () => {
    render(<MediaGallery media={[]} title="لات بدون عکس" />);

    expect(screen.getByRole('img', { name: 'تصویری برای این لات موجود نیست' })).toBeInTheDocument();
  });

  it('renders image slides with the lot title as alt and the media url', () => {
    const media = lotDetailFixture().media.slice(0, 2); // images only
    render(<MediaGallery media={media} title="عمده پیراهن مردانه" />);

    const images = screen.getAllByRole('img', { name: 'عمده پیراهن مردانه' });
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'http://media.test/2026/09/cover.jpg');
    // First slide is the LCP element, the rest lazy-load.
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
  });

  it('swaps a broken image to the in-slide placeholder (never a broken glyph)', () => {
    const media = lotDetailFixture().media.slice(0, 1);
    render(<MediaGallery media={media} title="لات خراب" />);

    fireEvent.error(screen.getByRole('img', { name: 'لات خراب' }));

    expect(screen.queryByRole('img', { name: 'لات خراب' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'تصویر در دسترس نیست' })).toBeInTheDocument();
  });

  it('renders a video slide with the poster thumb and inline controls', () => {
    const media = lotDetailFixture().media.filter((item) => item.kind === 'VIDEO');
    render(<MediaGallery media={media} title="لات ویدیویی" />);

    const video = screen.getByLabelText('ویدیو: لات ویدیویی');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('poster', 'http://media.test/2026/09/clip-poster.webp');
    expect(video).toHaveAttribute('preload', 'metadata');
  });

  it('shows the dots indicator only for multi-slide galleries', () => {
    const { container, rerender } = render(
      <MediaGallery media={lotDetailFixture().media} title="لات چندرسانه‌ای" />,
    );
    // jsdom renders every slide; the dots row lists one dot per slide.
    const dots = container.querySelectorAll('.pointer-events-none span');
    expect(dots).toHaveLength(3);

    rerender(<MediaGallery media={lotDetailFixture().media.slice(0, 1)} title="تک‌اسلاید" />);
    expect(container.querySelectorAll('.pointer-events-none span')).toHaveLength(0);
  });

  it('renders video without a poster (no poster attribute, no crash)', () => {
    const media = lotDetailFixture()
      .media.filter((item) => item.kind === 'VIDEO')
      .map((item) => ({ ...item, thumbUrl: null }));
    render(<MediaGallery media={media} title="ویدیو بی‌پوستر" />);

    const video = screen.getByLabelText('ویدیو: ویدیو بی‌پوستر');
    expect(video).not.toHaveAttribute('poster');
  });
});
