import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { useCategories } from '@/features/categories';
import { useAdminCategories, useUpdateCategory } from '../hooks/use-admin-categories';

/**
 * Task 06 step 7 at the unit level: activating a category must invalidate the
 * PUBLIC categories feature queries (categoryKeys.tree — what the seller lot
 * picker consumes) in addition to the admin tree, so a newly activated
 * category reaches the picker on the next fetch without any deployment. The
 * public tree endpoint only ever serves active rows (API e2e proves that);
 * this test proves the cache side of the same contract.
 */

const adminTreeFixture = [
  {
    id: 'cat-root',
    nameFa: 'پوشاک',
    nameEn: null,
    slug: 'apparel',
    parentId: null,
    sortOrder: 0,
    isActive: true,
    directLotCount: 0,
    visibleLotCount: 0,
    children: [],
  },
];

const publicTreeFixture = [
  { id: 'cat-root', nameFa: 'پوشاک', nameEn: null, slug: 'apparel', children: [] },
];

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

let activateRef: (() => void) | undefined;

/** Renders BOTH consumers — the public picker hook and the admin mutation. */
function Harness() {
  const publicTree = useCategories();
  const adminTree = useAdminCategories();
  const update = useUpdateCategory();
  useEffect(() => {
    activateRef = () => update.mutate({ id: 'cat-root', payload: { isActive: true } });
  }, [update]);
  return (
    <div>
      <span data-testid="public-count">{publicTree.data?.length ?? -1}</span>
      <span data-testid="admin-count">{adminTree.data?.length ?? -1}</span>
    </div>
  );
}

function countCalls(url: string): number {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url).length;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  activateRef = undefined;
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && url === '/api/admin/categories') {
      return jsonResponse(adminTreeFixture);
    }
    if (method === 'GET' && url === '/api/categories') {
      return jsonResponse(publicTreeFixture);
    }
    return jsonResponse({ id: 'cat-root', isActive: true });
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('admin categories mutations → cache invalidation', () => {
  it('activating a category refetches BOTH the admin tree and the public categories tree', async () => {
    render(<Harness />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByTestId('public-count')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('admin-count')).toHaveTextContent('1'));
    expect(countCalls('/api/categories')).toBe(1);
    expect(countCalls('/api/admin/categories')).toBe(1);

    act(() => {
      activateRef?.();
    });

    // The activate PATCH plus refetches of BOTH invalidated queries — the
    // picker-side query is stale the moment the admin flips isActive.
    await waitFor(() => expect(countCalls('/api/admin/categories/cat-root')).toBe(1));
    await waitFor(() => expect(countCalls('/api/categories')).toBe(2));
    await waitFor(() => expect(countCalls('/api/admin/categories')).toBe(2));
  }, 15000);
});
