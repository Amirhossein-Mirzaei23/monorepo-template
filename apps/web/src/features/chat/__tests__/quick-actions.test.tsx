import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  hasOwnUserMessage,
  QUICK_ACTIONS_BY_ROLE,
  QuickActions,
} from '../components/quick-actions';
import type { QuickActionsProps } from '../components/quick-actions';
import { messageFixture } from '../testing/fixtures';

/**
 * QuickActions component tests (CHT-008): the buyer chip set renders with its
 * fa templates and sends them through the CHT-006 send hook, the seller set is
 * the mirrored reduced one, the «پیشنهاد قیمت» offer chip stays hidden until
 * OFR-004, and the row collapses to the «…» overflow toggle once MY first
 * non-SYSTEM message exists (SYSTEM / counterpart messages don't collapse it).
 */

function renderQuickActions(overrides: Partial<QuickActionsProps> = {}) {
  const props: QuickActionsProps = {
    role: 'buyer',
    messages: [],
    myId: 'user-1',
    onSend: jest.fn(),
    ...overrides,
  };
  const view = render(<QuickActions {...props} />);
  return { ...view, props };
}

/** My own committed TEXT message (the collapse trigger). */
function ownMessage(overrides: Partial<Parameters<typeof messageFixture>[0]> = {}) {
  return messageFixture({ id: 'm-mine', senderId: 'user-1', ...overrides });
}

describe('QuickActions (CHT-008)', () => {
  it('renders the buyer chip set before my first message', () => {
    renderQuickActions();

    for (const action of QUICK_ACTIONS_BY_ROLE.buyer) {
      expect(screen.getByRole('button', { name: action.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('group', { name: 'اقدامات سریع' })).toBeInTheDocument();
  });

  it('sends the exact fa template of the tapped chip through the send hook', async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();

    for (const action of QUICK_ACTIONS_BY_ROLE.buyer) {
      // Via the helper (not a literal role="…" JSX attr — jsx-a11y/aria-role
      // reads any literal role prop as the ARIA attribute).
      const { unmount } = renderQuickActions({ onSend });
      await user.click(screen.getByRole('button', { name: action.label }));
      expect(onSend).toHaveBeenCalledWith(action.body);
      unmount();
    }
    expect(onSend).toHaveBeenCalledTimes(QUICK_ACTIONS_BY_ROLE.buyer.length);
  });

  it('hides the «پیشنهاد قیمت» offer chip until OFR-004 ships the offer sheet', () => {
    renderQuickActions();

    // Scope guard: the chip opens the OFR-004 sheet (Phase 6) — not a TEXT
    // template — so it stays out of the set until then.
    expect(screen.queryByText('پیشنهاد قیمت')).not.toBeInTheDocument();
  });

  it('renders the mirrored seller set without the buyer-only chips', async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();
    renderQuickActions({ role: 'seller', onSend });

    expect(screen.getByRole('button', { name: 'ارسال عکس بیشتر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'هماهنگی بازدید' })).toBeInTheDocument();
    for (const buyerOnly of ['قیمت بپرس', 'عکس بیشتری بفرست', 'ویدیو بفرست']) {
      expect(screen.queryByText(buyerOnly)).not.toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'ارسال عکس بیشتر' }));
    expect(onSend).toHaveBeenCalledWith('به‌زودی عکس‌های بیشتری ارسال می‌کنم.');
  });

  it('collapses to the «…» overflow once MY first non-SYSTEM message exists', () => {
    renderQuickActions({ messages: [ownMessage()] });

    expect(screen.queryByRole('button', { name: 'قیمت بپرس' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'نمایش اقدامات سریع' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('the «…» overflow toggles the same chip row open and closed', async () => {
    const user = userEvent.setup();
    renderQuickActions({ messages: [ownMessage()] });
    const toggle = () => screen.getByRole('button', { name: 'نمایش اقدامات سریع' });

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'قیمت بپرس' })).toBeInTheDocument();

    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'قیمت بپرس' })).not.toBeInTheDocument();
  });

  it('SYSTEM and counterpart messages do not collapse the row', () => {
    renderQuickActions({
      messages: [
        messageFixture({ id: 'm-sys', senderId: null, type: 'SYSTEM', body: 'گفتگو درباره: …' }),
        messageFixture({ id: 'm-theirs', senderId: 'user-2' }),
      ],
    });

    expect(screen.getByRole('button', { name: 'قیمت بپرس' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نمایش اقدامات سریع' })).not.toBeInTheDocument();
  });

  it('tapping a chip in collapsed mode sends the template and closes the overflow', async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();
    renderQuickActions({ messages: [ownMessage()], onSend });

    await user.click(screen.getByRole('button', { name: 'نمایش اقدامات سریع' }));
    await user.click(screen.getByRole('button', { name: 'هماهنگی بازدید' }));

    expect(onSend).toHaveBeenCalledWith('برای هماهنگی بازدید حضوری، وقت مناسب را پیشنهاد دهید.');
    expect(screen.queryByRole('button', { name: 'قیمت بپرس' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نمایش اقدامات سریع' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('renders nothing while the conversation role is unknown', () => {
    const { container } = renderQuickActions({ role: undefined });

    expect(container).toBeEmptyDOMElement();
  });

  it('hasOwnUserMessage: a SYSTEM row authored as mine does not count as my first message', () => {
    expect(hasOwnUserMessage([ownMessage({ type: 'SYSTEM' })], 'user-1')).toBe(false);
    expect(hasOwnUserMessage([ownMessage()], 'user-1')).toBe(true);
    expect(hasOwnUserMessage([ownMessage()], undefined)).toBe(false);
  });
});
