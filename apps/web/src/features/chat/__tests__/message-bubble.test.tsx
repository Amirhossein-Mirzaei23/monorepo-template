import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MessageBubble } from '../components/message-bubble';
import { formatTimeFa } from '@/lib/format';

/**
 * MessageBubble component tests (CHT-006): bubble sides (own END-aligned
 * primary / counterpart START-aligned zinc), the inline HH:mm timestamp,
 * the tick states (clock while sending, ✓ delivered, ✓✓ read), the failed
 * bubble's red retry tap, and the SYSTEM centered gray pill.
 */

describe('MessageBubble (CHT-006)', () => {
  it('renders an OWN bubble end-aligned on the primary surface with a timestamp', () => {
    render(
      <MessageBubble
        body="قیمت نهایی چقدر می‌شود؟"
        createdAt="2026-09-05T14:05:00.000Z"
        variant="own"
      />,
    );

    const wrapper = screen.getByText('قیمت نهایی چقدر می‌شود؟').parentElement?.parentElement;
    expect(wrapper).toHaveClass('justify-end'); // end-aligned (RTL logical)
    const bubble = screen.getByText('قیمت نهایی چقدر می‌شود؟').parentElement;
    expect(bubble).toHaveClass('bg-primary');
    expect(bubble).toHaveClass('rounded-ee-sm'); // tail on the sender side

    // HH:mm Persian digits (timezone-safe: formatted through the same Intl).
    const stamp = document.querySelector('time');
    expect(stamp).toHaveTextContent(formatTimeFa('2026-09-05T14:05:00.000Z'));
    expect(stamp?.textContent).toMatch(/^[\u06F0-\u06F9]{1,2}:[\u06F0-\u06F9]{2}$/);
    expect(screen.getByRole('img', { name: 'ارسال شد' })).toBeInTheDocument(); // ✓ delivered
    expect(screen.queryByRole('img', { name: 'خوانده شد' })).not.toBeInTheDocument();
  });

  it('flips to ✓✓ when the counterpart read the message', () => {
    render(
      <MessageBubble
        body="باشه"
        createdAt="2026-09-05T14:05:00.000Z"
        variant="own"
        readAt="2026-09-05T14:06:00.000Z"
      />,
    );

    expect(screen.getByRole('img', { name: 'خوانده شد' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'ارسال شد' })).not.toBeInTheDocument();
  });

  it('renders a COUNTERPART bubble start-aligned on zinc without ticks', () => {
    render(
      <MessageBubble
        body="سلام، موجود است؟"
        createdAt="2026-09-05T09:30:00.000Z"
        variant="other"
      />,
    );

    const wrapper = screen.getByText('سلام، موجود است؟').parentElement?.parentElement;
    expect(wrapper).toHaveClass('justify-start');
    const bubble = screen.getByText('سلام، موجود است؟').parentElement;
    expect(bubble).toHaveClass('bg-zinc-100');
    expect(bubble).toHaveClass('rounded-ss-sm');
    expect(screen.queryByRole('img', { name: /ارسال شد|خوانده شد/ })).not.toBeInTheDocument();
  });

  it('renders SYSTEM messages as a centered gray pill instead of a bubble', () => {
    render(
      <MessageBubble
        body="گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان"
        createdAt="2026-09-05T09:00:00.000Z"
        variant="system"
      />,
    );

    const pill = screen.getByText(/گفتگو درباره:/);
    expect(pill).toHaveClass('mx-auto');
    expect(pill).toHaveClass('rounded-full');
    expect(pill).toHaveClass('bg-zinc-100');
    expect(pill).toHaveClass('text-zinc-500');
    expect(screen.queryByText(/گفتگو درباره:/)?.parentElement).not.toHaveClass('bg-primary');
  });

  it('shows the clock while sending and the red retry tap when failed', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    const { rerender } = render(
      <MessageBubble
        body="سلام"
        createdAt="2026-09-05T14:05:00.000Z"
        variant="own"
        status="sending"
      />,
    );

    expect(screen.getByRole('img', { name: 'در حال ارسال' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تلاش مجدد/ })).not.toBeInTheDocument();

    rerender(
      <MessageBubble
        body="سلام"
        createdAt="2026-09-05T14:05:00.000Z"
        variant="own"
        status="failed"
        onRetry={onRetry}
      />,
    );

    const bubble = screen.getByText('سلام').parentElement;
    expect(bubble).toHaveClass('bg-red-50');
    expect(bubble).toHaveClass('text-red-700');
    expect(screen.queryByRole('img', { name: /ارسال شد|در حال ارسال/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تلاش مجدد برای ارسال' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
