import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

import ProductScreen from './[barcode]';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mocks that live inside factory closures need to be declared BEFORE the
// factory captures them. Jest allows `mock`-prefixed variables to be referenced
// from factories, but we still have to ensure the factory's callback uses a
// live reference — that's why these are functions that hand back jest.fn()s
// on first access. The individual jest.fn() instances are memoised module-wide
// so assertions can reach them after the component has called them.

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};
const mockUseLocalSearchParams = jest.fn(() => ({ barcode: '0000000000001' }));
const mockUseSession = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => mockRouter,
}));

jest.mock('@/hooks/use-session', () => ({
  useSession: () => mockUseSession(),
}));

// IMPORTANT: the returned object must be stable across renders — if
// `addRecentProduct` is a new reference on every call, the useEffect
// inside ProductScreen re-runs on every render, which triggers repeated
// state updates (setNotFound(false)) that clobber the not-found state we
// are trying to assert. Memoise both the function and the wrapping object
// inside the factory closure.
jest.mock('@/hooks/use-recent-products', () => {
  const addRecentProduct = jest.fn();
  const value = { addRecentProduct, recentProducts: [] as unknown[] };
  return { useRecentProducts: () => value };
});

// Preserve ApiError as a real class so `instanceof` checks in the component
// match errors constructed in the tests.
jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiError,
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError, api } = require('@/lib/api') as typeof import('@/lib/api');
const mockApiGet = api.get as jest.Mock;

describe('ProductScreen — product-not-found state', () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.back.mockClear();
    mockApiGet.mockReset();
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      session: { user: { id: 'u1', is_anonymous: false } },
      isAnonymous: false,
      isLoading: false,
    });
  });

  it('renders the not-found screen on a 404 response', async () => {
    mockApiGet.mockRejectedValue(new ApiError(404, 'Product not found', {}));
    const { findByTestId, getByText } = render(<ProductScreen />);
    await findByTestId('product-not-found');
    expect(getByText(/isn't in the database yet/i)).toBeTruthy();
  });

  it('shows the "Add this product" CTA for registered users and navigates with the barcode', async () => {
    mockApiGet.mockRejectedValue(new ApiError(404, 'Product not found', {}));
    const { findByTestId, queryByTestId } = render(<ProductScreen />);
    const btn = await findByTestId('product-not-found-add');
    expect(queryByTestId('product-not-found-signup')).toBeNull();
    fireEvent.press(btn);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(app)/add-product',
      params: { barcode: '0000000000001' },
    });
  });

  it('shows the Sign up CTA for anonymous users and deep-links to signup with returnTo', async () => {
    mockUseSession.mockReturnValue({
      session: { user: { id: 'guest', is_anonymous: true } },
      isAnonymous: true,
      isLoading: false,
    });
    mockApiGet.mockRejectedValue(new ApiError(404, 'Product not found', {}));
    const { findByTestId, queryByTestId } = render(<ProductScreen />);
    const btn = await findByTestId('product-not-found-signup');
    expect(queryByTestId('product-not-found-add')).toBeNull();
    fireEvent.press(btn);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/(auth)/signup',
      params: { returnTo: '/product/0000000000001' },
    });
  });

  it('shows a generic error (not the not-found UI) on non-404 failures', async () => {
    mockApiGet.mockRejectedValue(new ApiError(500, 'Server exploded', {}));
    const { findByText, queryByTestId } = render(<ProductScreen />);
    await findByText('Server exploded');
    expect(queryByTestId('product-not-found')).toBeNull();
  });

  it('renders the product normally on a 2xx response — no regression for known products', async () => {
    mockApiGet.mockResolvedValue({
      id: 'p1',
      barcode: '0000000000001',
      name: 'Sourdough Loaf',
      brand: 'Artisan',
      image: null,
      description: null,
    });
    const { findByText, queryByTestId } = render(<ProductScreen />);
    await findByText('Sourdough Loaf');
    await waitFor(() => expect(queryByTestId('product-not-found')).toBeNull());
  });
});
