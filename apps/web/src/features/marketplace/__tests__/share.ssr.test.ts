/**
 * @jest-environment node
 */
import { buildLotShareUrl, buildLotShareText, copyLotLink, shareLot } from '../lib/share';

/**
 * MKT-010 SSR-safety — the share builders/actions must degrade, never crash,
 * on the server (no `window`/`navigator`). This runs under the node
 * environment because jsdom's `window` getter cannot be deleted from the
 * inside, so the jsdom suite cannot simulate a genuinely window-less realm.
 */

const CODE = '7Kd2Qm9x';

describe('share builders on the server (no window/navigator)', () => {
  it('buildLotShareUrl degrades to the relative /l/{code} path', () => {
    expect(buildLotShareUrl(CODE)).toBe('/l/7Kd2Qm9x');
  });

  it('buildLotShareText is environment-independent', () => {
    expect(buildLotShareText({ title: 'لات', unitPrice: 1000, city: 'تهران' })).toBe(
      'لات — ۱٬۰۰۰ تومان | راکدشو تهران',
    );
  });

  it('shareLot resolves sheet (native share is unavailable server-side)', async () => {
    await expect(shareLot({ code: CODE, title: 'لات', unitPrice: 1000 })).resolves.toBe('sheet');
  });

  it('copyLotLink resolves manual (no clipboard server-side)', async () => {
    await expect(copyLotLink(CODE)).resolves.toBe('manual');
  });
});
