/** LOT-004 — live unit-price derivation preview (round(totalPrice / quantity)). */
import { render, screen } from '@testing-library/react';

import { UnitPricePreview } from '../components/unit-price-preview';

describe('UnitPricePreview', () => {
  it('renders the per-unit hint with Persian digits and Toman', () => {
    // 45,000 / 2 = 22,500 → «قیمت هر واحد: ~۲۲٬۵۰۰ تومان» (card example).
    render(<UnitPricePreview totalPrice={45000} quantity={2} />);
    expect(screen.getByTestId('unit-price-preview').textContent).toBe(
      'قیمت هر واحد: ~۲۲٬۵۰۰ تومان',
    );
  });

  it('rounds fractional unit prices like the server (round(total/quantity))', () => {
    render(<UnitPricePreview totalPrice={100} quantity={3} />);
    expect(screen.getByTestId('unit-price-preview').textContent).toContain('۳۳');
  });

  it('renders nothing until both inputs are valid', () => {
    const { rerender } = render(<UnitPricePreview totalPrice={45000} quantity={0} />);
    expect(screen.queryByTestId('unit-price-preview')).not.toBeInTheDocument();
    rerender(<UnitPricePreview totalPrice={0} quantity={2} />);
    expect(screen.queryByTestId('unit-price-preview')).not.toBeInTheDocument();
    rerender(<UnitPricePreview totalPrice={Number.NaN} quantity={2} />);
    expect(screen.queryByTestId('unit-price-preview')).not.toBeInTheDocument();
  });
});
