import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/toast';
import {
  buildSellerShareText,
  buildSellerShareUrl,
  copySellerLink,
  shareSeller,
} from '@/features/marketplace';
import { SellerShareButton, SellerShareSheet } from '../components/seller-share';

/**
 * PROF-002 share action tests — the MKT-010 mechanics re-run on /s/{id} with
 * the seller fa text: pure builders (text template, absolute URL), the
 * shareSeller native/sheet dispatch, the clipboard copy paths and the
 * manual-copy fallback state. Builders come through the marketplace BARREL —
 * the sanctioned cross-feature import path (boundary rule).
 */

const SELLER = { id: 'clxprofile999', name: 'تولیدی پوشاک مینا', city: 'کاشان' };

const stubClipboard = (writeText: () => Promise<void>) =>
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });

const stubNativeShare = (share: () => Promise<void>) =>
  Object.defineProperty(window.navigator, 'share', {
    value: share,
    configurable: true,
  });

afterEach(() => {
  // @ts-expect-error -- removing the test stub
  delete window.navigator.clipboard;
  // @ts-expect-error -- removing the test stub
  delete window.navigator.share;
});

describe('seller share builders', () => {
  it('builds the fa seller text: {name} | راکدشو {city}', () => {
    expect(buildSellerShareText(SELLER)).toBe('تولیدی پوشاک مینا | راکدشو کاشان');
  });

  it('omits the trailing city segment when the seller has no city', () => {
    expect(buildSellerShareText({ name: 'فروشنده بی‌شهر', city: null })).toBe(
      'فروشنده بی‌شهر | راکدشو',
    );
  });

  it('builds the absolute /s/{id} URL (window origin in tests)', () => {
    expect(buildSellerShareUrl(SELLER.id)).toBe(`${window.location.origin}/s/${SELLER.id}`);
  });

  it('dispatches to the native share sheet when the platform offers it', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    stubNativeShare(share);

    const outcome = await shareSeller(SELLER);

    expect(outcome).toBe('native');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({
      title: SELLER.name,
      text: 'تولیدی پوشاک مینا | راکدشو کاشان',
      url: `${window.location.origin}/s/${SELLER.id}`,
    });
  });

  it('resolves "sheet" when no Web Share API exists (desktop/insecure contexts)', async () => {
    const outcome = await shareSeller(SELLER);
    expect(outcome).toBe('sheet');
  });

  it('copies the seller URL to the clipboard, degrading to "manual"', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    expect(await copySellerLink(SELLER.id)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/${SELLER.id}`);

    // No clipboard API at all → manual fallback (readonly input path).
    // @ts-expect-error -- removing the test stub
    delete window.navigator.clipboard;
    expect(await copySellerLink(SELLER.id)).toBe('manual');
  });
});

describe('SellerShareButton', () => {
  it('opens the fallback sheet when the platform has no native share', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SellerShareButton {...SELLER} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'هم‌رسانی پروفایل فروشنده' }));

    expect(await screen.findByRole('button', { name: 'کپی لینک' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تلگرام' })).toHaveAttribute(
      'href',
      expect.stringContaining(`s%2F${SELLER.id}`),
    );
  });

  it('keeps the sheet closed when the native share handled the action', async () => {
    stubNativeShare(jest.fn().mockResolvedValue(undefined));
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SellerShareButton {...SELLER} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'هم‌رسانی پروفایل فروشنده' }));

    expect(screen.queryByRole('button', { name: 'کپی لینک' })).not.toBeInTheDocument();
  });
});

describe('SellerShareSheet', () => {
  const PROPS = {
    open: true,
    onOpenChange: jest.fn(),
    ...SELLER,
  };

  function renderSheet(props: Partial<typeof PROPS> = {}) {
    return render(
      <ToastProvider>
        <SellerShareSheet {...PROPS} {...props} />
      </ToastProvider>,
    );
  }

  it('prefills the telegram/whatsapp intents with the /s/{id} URL and seller text', () => {
    renderSheet();

    const text = 'تولیدی پوشاک مینا | راکدشو کاشان';
    const url = `${window.location.origin}/s/${SELLER.id}`;

    const telegram = new URL(screen.getByRole('link', { name: 'تلگرام' }).getAttribute('href')!);
    expect(telegram.origin).toBe('https://t.me');
    expect(telegram.pathname).toBe('/share/url');
    expect(telegram.searchParams.get('url')).toBe(url);
    expect(telegram.searchParams.get('text')).toBe(text);

    const whatsapp = new URL(screen.getByRole('link', { name: 'واتساپ' }).getAttribute('href')!);
    expect(whatsapp.origin).toBe('https://wa.me');
    expect(whatsapp.searchParams.get('text')).toBe(`${text}\n${url}`);
  });

  it('closes with a success toast after a successful clipboard copy', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    stubClipboard(jest.fn().mockResolvedValue(undefined));
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'کپی لینک' }));

    expect(await screen.findByText('لینک کپی شد')).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reveals the URL for manual copying when clipboard write is denied (sheet stays open)', async () => {
    // setup() FIRST — user-event installs its own working clipboard stub on
    // setup, so the denial stub must land after it to win.
    const user = userEvent.setup();
    stubClipboard(jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
    const onOpenChange = jest.fn();
    renderSheet({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'کپی لینک' }));

    const manual = (await screen.findByLabelText(/لینک را انتخاب/)) as HTMLInputElement;
    expect(manual).toHaveValue(`${window.location.origin}/s/${SELLER.id}`);
    expect(screen.getByText(/کپی خودکار ممکن نشد/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
