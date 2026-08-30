import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../components/button';

describe('Button', () => {
  it('renders its label and fires clicks', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="button" (no accidental form submits)', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant="secondary" size="sm">
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('ui-button--secondary');
    expect(button).toHaveClass('ui-button--sm');
  });
});
