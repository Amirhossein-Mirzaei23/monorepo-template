import {
  buildLotShareText,
  buildLotShareUrl,
  buildTelegramUrl,
  buildWhatsappUrl,
  copyLotLink,
  shareLot,
  type ShareLotInput,
} from '../lib/share';

/**
 * MKT-010 unit tests — the share builders are pure, so the fa text template,
 * the absolute /l/{code} URL forms and the Telegram/WhatsApp intent contracts
 * are asserted on decoded values (searchParams.get), never on the exact
 * percent-encoding. The two actions (shareLot / copyLotLink) are tested by
 * stubbing navigator.share / navigator.clipboard.
 */

const INFO = { title: 'عمده پیراهن مردانه — ۵۰ عدد', unitPrice: 2_250_000, city: 'تهران' };
const CODE = '7Kd2Qm9x';
const INPUT: ShareLotInput = { ...INFO, code: CODE };

describe('buildLotShareText', () => {
  it('renders the fa template with title + toman price + city', () => {
    expect(buildLotShareText(INFO)).toBe(
      'عمده پیراهن مردانه — ۵۰ عدد — ۲٬۲۵۰٬۰۰۰ تومان | راکدشو تهران',
    );
  });

  it('keeps a bare «راکدشو» brand segment when the city is absent', () => {
    expect(buildLotShareText({ ...INFO, city: null })).toBe(
      'عمده پیراهن مردانه — ۵۰ عدد — ۲٬۲۵۰٬۰۰۰ تومان | راکدشو',
    );
    expect(buildLotShareText({ title: 'لات', unitPrice: 1000 })).toBe('لات — ۱٬۰۰۰ تومان | راکدشو');
  });
});

describe('buildLotShareUrl', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the configured NEXT_PUBLIC_APP_URL origin when present', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_APP_URL: 'https://rakdsho.ir/' };
      const share = await import('../lib/share');
      expect(share.buildLotShareUrl(CODE)).toBe('https://rakdsho.ir/l/7Kd2Qm9x');
    });
  });

  it('falls back to window.location.origin client-side (no configured origin)', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildLotShareUrl(CODE)).toBe(`${window.location.origin}/l/7Kd2Qm9x`);
  });
  // The SSR branch (no configured origin, no window → relative /l/{code}) is
  // covered in share.ssr.test.ts, which runs under the node environment —
  // jsdom's `window` getter cannot be deleted from the inside.
});

describe('intent builders', () => {
  const url = `${window.location.origin}/l/${CODE}`;
  const text = buildLotShareText(INFO);

  it('buildTelegramUrl → t.me/share/url with the URL and text params', () => {
    const intent = new URL(buildTelegramUrl(url, text));
    expect(intent.origin).toBe('https://t.me');
    expect(intent.pathname).toBe('/share/url');
    expect(intent.searchParams.get('url')).toBe(url);
    expect(intent.searchParams.get('text')).toBe(text);
  });

  it('buildWhatsappUrl → wa.me/?text= with the URL appended to the text', () => {
    const intent = new URL(buildWhatsappUrl(text, url));
    expect(intent.origin).toBe('https://wa.me');
    expect(intent.searchParams.get('text')).toBe(`${text}\n${url}`);
  });

  it('buildWhatsappUrl without a URL sends the text alone', () => {
    const intent = new URL(buildWhatsappUrl(text));
    expect(intent.searchParams.get('text')).toBe(text);
  });
});

describe('shareLot', () => {
  afterEach(() => {
    // @ts-expect-error -- removing the test stub
    delete window.navigator.share;
  });

  it('uses navigator.share with {title, text, url} when the platform offers it', async () => {
    const nativeShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'share', {
      value: nativeShare,
      configurable: true,
    });

    await expect(shareLot(INPUT)).resolves.toBe('native');
    expect(nativeShare).toHaveBeenCalledWith({
      title: INFO.title,
      text: buildLotShareText(INFO),
      url: buildLotShareUrl(CODE),
    });
  });

  it('still resolves native when the user dismisses the native sheet (no fallback stacking)', async () => {
    Object.defineProperty(window.navigator, 'share', {
      value: jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
      configurable: true,
    });

    await expect(shareLot(INPUT)).resolves.toBe('native');
  });

  it('resolves sheet when navigator.share is unavailable (desktop fallback path)', async () => {
    await expect(shareLot(INPUT)).resolves.toBe('sheet');
  });
});

describe('copyLotLink', () => {
  const writeText = (impl: () => Promise<void>) =>
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: impl },
      configurable: true,
    });

  afterEach(() => {
    // @ts-expect-error -- removing the test stub
    delete window.navigator.clipboard;
  });

  it('writes the lot URL to the clipboard on success', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    writeText(write);

    await expect(copyLotLink(CODE)).resolves.toBe('copied');
    expect(write).toHaveBeenCalledWith(buildLotShareUrl(CODE));
  });

  it('resolves manual on clipboard denial (NotAllowedError)', async () => {
    writeText(jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));

    await expect(copyLotLink(CODE)).resolves.toBe('manual');
  });

  it('resolves manual when there is no clipboard API at all (insecure context)', async () => {
    await expect(copyLotLink(CODE)).resolves.toBe('manual');
  });
});
