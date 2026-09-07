import { render, screen } from '@testing-library/react';

import { LotContextHeader } from '../components/lot-context-header';
import { conversationItemFixture } from '../testing/fixtures';

/**
 * LotContextHeader component tests (CHT-006): the pinned lot context — thumb,
 * title, price (formatToman), lot status chip, the «مشاهده لات» link to
 * /l/{code} — plus the loading skeleton and the fallback without context.
 */

describe('LotContextHeader (CHT-006)', () => {
  it('renders thumb, title, price, status chip and the «مشاهده لات» link', () => {
    const lot = conversationItemFixture().lot;
    render(<LotContextHeader lot={lot} />);

    expect(screen.getByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
    expect(screen.getByText('۲٬۲۵۰٬۰۰۰ تومان')).toBeInTheDocument(); // formatToman
    expect(screen.getByText('فعال')).toBeInTheDocument(); // LotStatusChip fa label

    const link = screen.getByRole('link', { name: /مشاهده لات/ });
    expect(link).toHaveAttribute('href', '/l/7Kd2Qm9x');
    expect(screen.getByRole('link', { name: 'بازگشت به گفتگوها' })).toHaveAttribute(
      'href',
      '/chat',
    );
  });

  it('renders the cover image when a thumb URL exists', () => {
    const { container } = render(<LotContextHeader lot={conversationItemFixture().lot} />);
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'http://localhost:3001/media/2026/09/asset-1t.webp',
    );
  });

  it('shows the skeleton while loading and the fallback when no context arrived', () => {
    const { rerender } = render(<LotContextHeader loading />);
    expect(screen.getByRole('status', { name: 'در حال بارگذاری اطلاعات لات' })).toBeInTheDocument();

    rerender(<LotContextHeader />);
    expect(screen.getByText('اطلاعات لات در دسترس نیست')).toBeInTheDocument();
  });
});
