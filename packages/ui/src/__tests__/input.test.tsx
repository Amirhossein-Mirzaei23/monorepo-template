import { render, screen } from '@testing-library/react';
import { Input } from '../components/input';

describe('Input', () => {
  it('associates the label with the control', () => {
    render(<Input label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toBeInTheDocument();
  });

  it('wires inline errors for assistive tech', () => {
    render(<Input label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });

  it('renders no alert element when there is no error', () => {
    render(<Input label="Email" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
