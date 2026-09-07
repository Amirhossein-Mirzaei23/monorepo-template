import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/toast';
import { ShareSheet, type ShareSheetProps } from '../components/share-sheet';
import { buildLotShareText, buildLotShareUrl } from '../lib/share';

/**
 * MKT-010 share-sheet component tests: the three fa options (کپی لینک /
 * تلگرام / واتساپ) with correct prefilled intent hrefs and ≥44px targets, the
 * copy path (clipboard write → success toast + close) and the clipboard-denial
 * error state (readonly URL input, focused and fully selected for manual copy,
 * with an info toast — sheet stays open).
 */

const PROPS: ShareSheetProps = {
  open: true,
  onOpenChange: jest.fn(),
  code: '7Kd2Qm9x',
  title: 'عمده پیراهن مردانه — ۵۰ عدد',
  unitPrice: 2_250_000,
  city: 'تهران',
};

const SHARE_TEXT = buildLotShareText({
  title: PROPS.title,
  unitPrice: PROPS.unitPrice,
  city: PROPS.city,
});
const SHARE_URL = buildLotShareUrl(PROPS.code);

function renderSheet(props: Partial<ShareSheetProps> = {}) {
  return render(
    <ToastProvider>
      <ShareSheet {...PROPS} {...props} />
    </ToastProvider>,
  );
}

const stubClipboard = (writeText: () => Promise<void>) =>
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });

afterEach(() => {
  // @ts-expect-error -- removing the test stub
  delete window.navigator.clipboard;
});

describe('ShareSheet — options', () => {
  it('renders the three fa options with ≥44px touch targets', () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'کپی لینک' })).toHaveClass('min-h-12');
    for (const label of ['تلگرام', 'واتساپ']) {
      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveClass('min-h-12');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('prefills the Telegram intent with the lot URL and fa share text', () => {
    renderSheet();

    const intent = new URL(screen.getByRole('link', { name: 'تلگرام' }).getAttribute('href')!);
    expect(intent.origin).toBe('https://t.me');
    expect(intent.pathname).toBe('/share/url');
    expect(intent.searchParams.get('url')).toBe(SHARE_URL);
    expect(intent.searchParams.get('text')).toBe(SHARE_TEXT);
  });

  it('prefills the WhatsApp intent with the fa text + URL in the text param', () => {
    renderSheet();

    const intent = new URL(screen.getByRole('link', { name: 'واتساپ' }).getAttribute('href')!);
    expect(intent.origin).toBe('https://wa.me');
    expect(intent.searchParams.get('text')).toBe(`${SHARE_TEXT}\n${SHARE_URL}`);
  });
});

describe('ShareSheet — copy path', () => {
  it('writes the URL to the clipboard, toasts confirmation and closes the sheet', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onOpenChange = jest.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'کپی لینک' }));

    expect(writeText).toHaveBeenCalledWith(SHARE_URL);
    expect(await screen.findByText('لینک کپی شد')).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // No manual fallback UI on the happy path.
    expect(screen.queryByLabelText(/لینک را انتخاب/)).not.toBeInTheDocument();
  });

  it('on clipboard denial shows the URL in a selected readonly input + info toast', async () => {
    const user = userEvent.setup();
    stubClipboard(jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
    const onOpenChange = jest.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'کپی لینک' }));

    const input = (await screen.findByLabelText(/لینک را انتخاب/)) as HTMLInputElement;
    expect(input).toHaveValue(SHARE_URL);
    expect(input).toHaveFocus();
    // Fully selected → one tap / Ctrl+C copies manually.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(SHARE_URL.length);
    expect(screen.getByText(/کپی خودکار ممکن نشد/)).toBeInTheDocument();
    // The sheet stays open — the user is mid manual copy.
    expect(screen.getByRole('dialog', { name: 'هم‌رسانی' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('falls back to manual copy when there is no clipboard API (insecure context)', async () => {
    const user = userEvent.setup();
    // user-event's setup() installs a working clipboard stub — remove it to
    // simulate the genuinely clipboard-less environment.
    // @ts-expect-error -- removing the installed stub
    delete window.navigator.clipboard;
    renderSheet();

    await user.click(screen.getByRole('button', { name: 'کپی لینک' }));

    expect(await screen.findByLabelText(/لینک را انتخاب/)).toHaveValue(SHARE_URL);
    expect(screen.getByText(/کپی خودکار ممکن نشد/)).toBeInTheDocument();
  });
});
