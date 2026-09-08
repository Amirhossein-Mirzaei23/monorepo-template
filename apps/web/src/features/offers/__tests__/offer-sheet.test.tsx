import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (the features/lots and features/chat precedent).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { lotDetailFixture } from '@/features/marketplace';

import { ToastProvider } from '@/components/ui/toast';
import { OfferSheet } from '../components/offer-sheet';
import { offerFixture } from '../testing/fixtures';

/**
 * OFR-004 sheet tests: the seeded create/counter forms, the lot-bounded
 * quantity stepper, fa-digit tolerance with the live total hint, the submit
 * payloads (create carries lotId+conversationId; counter carries none), the
 * inline 409 banners with the «به‌روزرسانی لات» refresh hint, and the
 * proactive lot-inactive lock — all against a mocked BFF (global.fetch).
 */

const fetchMock = jest.fn();

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const LOT = lotDetailFixture();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function renderSheet(props: Partial<Parameters<typeof OfferSheet>[0]> = {}) {
  return render(<OfferSheet open lotCode={LOT.code} onOpenChange={() => {}} {...props} />, {
    wrapper: createWrapper(),
  });
}

function posts(): Array<{ path: string; body: unknown }> {
  return (global.fetch as jest.Mock).mock.calls
    .map(([input, init]) => ({
      path: String(input),
      method: String((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase(),
      body: JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null')) as unknown,
    }))
    .filter((call) => call.method === 'POST');
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/lots/7Kd2Qm9x')) {
      return ok(LOT);
    }
    if (url === '/api/offers' && String(init?.method ?? '').toUpperCase() === 'POST') {
      return ok(offerFixture(), 201);
    }
    if (url === '/api/offers/offer-1/counter') {
      return ok(offerFixture({ id: 'offer-2', status: 'PENDING', myRole: 'seller' }), 201);
    }
    return ok({});
  });
});

describe('OfferSheet (create mode)', () => {
  it('seeds the form from the lot context and shows the baseline block', async () => {
    renderSheet();

    const quantity = (await screen.findByLabelText('تعداد (عدد)')) as HTMLInputElement;
    const unitPrice = (screen.getByLabelText('قیمت واحد (تومان)') as HTMLInputElement).value;
    expect(quantity.value).toBe('10');
    expect(unitPrice).toBe('2250000');
    expect(screen.getByText(LOT.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت پیشنهاد' })).toBeInTheDocument();
  });

  it('shows a live total hint that tolerates fa digits and reflects the price delta', async () => {
    const user = userEvent.setup();
    renderSheet();

    const quantity = await screen.findByLabelText('تعداد (عدد)');
    const unitPrice = screen.getByLabelText('قیمت واحد (تومان)');

    await user.clear(quantity);
    await user.type(quantity, '۴۵');
    await user.clear(unitPrice);
    await user.type(unitPrice, '2000000');

    // 45 × 2,000,000 = 90,000,000 — fa digits in, formatted Toman out.
    expect(screen.getByText(/جمع پیشنهاد:/)).toHaveTextContent('۹۰٬۰۰۰٬۰۰۰ تومان');
    expect(screen.getByText(/کمتر از قیمت پایه/)).toBeInTheDocument();
  });

  it('the stepper clamps the quantity to the lot bounds', async () => {
    const user = userEvent.setup();
    renderSheet();

    const quantity = (await screen.findByLabelText('تعداد (عدد)')) as HTMLInputElement;
    const plus = screen.getByRole('button', { name: 'افزایش تعداد' });
    const minus = screen.getByRole('button', { name: 'کاهش تعداد' });

    // Seeded at minOrder (10): minus disabled, plus walks up.
    expect(minus).toBeDisabled();
    await user.click(plus);
    expect(quantity.value).toBe('11');

    // Walk to the available cap (45) — plus must disable there.
    for (let i = 0; i < 45; i += 1) {
      await user.click(plus);
    }
    expect(quantity.value).toBe('45');
    expect(plus).toBeDisabled();
  });

  it('rejects an out-of-bounds quantity inline and does not POST', async () => {
    const user = userEvent.setup();
    renderSheet();

    const quantity = await screen.findByLabelText('تعداد (عدد)');
    // ۴۶ is just past the cap (and keeps the derived total under the money
    // ceiling, so the ONLY issue is the lot bound — the 409 mirror).
    await user.clear(quantity);
    await user.type(quantity, '۴۶');
    await user.click(screen.getByRole('button', { name: 'ثبت پیشنهاد' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تعداد باید بین ۱۰ تا ۴۵ باشد');
    expect(posts()).toHaveLength(0);
  });

  it('submits the create payload with lotId + conversationId and closes on success', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    renderSheet({ conversationId: 'conv-1', onOpenChange });

    const quantity = await screen.findByLabelText('تعداد (عدد)');
    await user.clear(quantity);
    await user.type(quantity, '۴۵');
    await user.clear(screen.getByLabelText('قیمت واحد (تومان)'));
    await user.type(screen.getByLabelText('قیمت واحد (تومان)'), '2100000');
    await user.type(screen.getByLabelText('یادداشت (اختیاری)'), '  تا آخر هفته  ');
    await user.click(screen.getByRole('button', { name: 'ثبت پیشنهاد' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [call] = posts();
    expect(call).toMatchObject({
      path: '/api/offers',
      body: {
        lotId: LOT.id,
        quantity: 45,
        unitPrice: 2100000,
        note: 'تا آخر هفته',
        conversationId: 'conv-1',
      },
    });
  });

  it('surfaces a 409 as an inline banner with the «به‌روزرسانی لات» refresh', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/offers' && String(init?.method ?? '').toUpperCase() === 'POST') {
        return ok({ statusCode: 409, message: 'out of range', code: 'QUANTITY_OUT_OF_RANGE' }, 409);
      }
      if (url.startsWith('/api/lots/7Kd2Qm9x')) {
        return ok(LOT);
      }
      return ok({});
    });
    renderSheet();

    await screen.findByLabelText('تعداد (عدد)');
    await user.click(screen.getByRole('button', { name: 'ثبت پیشنهاد' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('موجودی یا حداقل سفارش لات تغییر کرده است');
    const refresh = screen.getByRole('button', { name: 'به‌روزرسانی لات' });

    // The hint refetches the lot context (a second GET /api/lots/{code}).
    const lotCallsBefore = (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
      String(input).startsWith('/api/lots/7Kd2Qm9x'),
    ).length;
    await user.click(refresh);
    await waitFor(() => {
      const lotCallsAfter = (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
        String(input).startsWith('/api/lots/7Kd2Qm9x'),
      ).length;
      expect(lotCallsAfter).toBeGreaterThan(lotCallsBefore);
    });
  });

  it('locks the submit when the resolved lot is not ACTIVE (proactive banner)', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).startsWith('/api/lots/7Kd2Qm9x')) {
        return ok(lotDetailFixture({ status: 'PAUSED' }));
      }
      return ok({});
    });
    renderSheet();

    expect(await screen.findByText(/این لات در وضعیت فعلی فعال نیست/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت پیشنهاد' })).toBeDisabled();
  });
});

describe('OfferSheet (counter mode — the sheet reuse)', () => {
  /** The countered offer's lot with bounds that still cover its 500 pieces. */
  function counterLotResponse(): unknown {
    return lotDetailFixture({ availableQuantity: 600 });
  }

  it('seeds from the countered offer and POSTs the counter payload (no lotId)', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/lots/7Kd2Qm9x')) {
        return ok(counterLotResponse());
      }
      if (url === '/api/offers/offer-1/counter') {
        return ok(offerFixture({ id: 'offer-2', myRole: 'seller' }), 201);
      }
      return ok({});
    });
    renderSheet({
      counterOffer: offerFixture({
        id: 'offer-1',
        myRole: 'seller',
        quantity: 500,
        unitPrice: 300000,
        note: 'تعداد کمتر ممکن است؟',
      }),
      onOpenChange,
    });

    const quantity = (await screen.findByLabelText('تعداد (عدد)')) as HTMLInputElement;
    const unitPrice = (screen.getByLabelText('قیمت واحد (تومان)') as HTMLInputElement).value;
    expect(quantity.value).toBe('500');
    expect(unitPrice).toBe('300000');
    expect(screen.getByRole('button', { name: 'ارسال پیشنهاد متقابل' })).toBeInTheDocument();

    await user.clear(quantity);
    await user.type(quantity, '۴۰۰');
    await user.click(screen.getByRole('button', { name: 'ارسال پیشنهاد متقابل' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [call] = posts();
    expect(call?.path).toBe('/api/offers/offer-1/counter');
    expect(call?.body).toStrictEqual({
      quantity: 400,
      unitPrice: 300000,
      note: 'تعداد کمتر ممکن است؟',
    });
    expect(call?.body).not.toHaveProperty('lotId');
  });

  it('does not fetch anything while closed', () => {
    render(<OfferSheet open={false} lotCode={LOT.code} onOpenChange={() => {}} />, {
      wrapper: createWrapper(),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
