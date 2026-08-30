import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../components/dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Dialog open={false} title="Confirm" onClose={jest.fn()}>
        body
      </Dialog>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes dialog semantics and closes via the button', async () => {
    const onClose = jest.fn();
    render(
      <Dialog open title="Confirm delete" onClose={onClose}>
        Are you sure?
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = jest.fn();
    render(
      <Dialog open title="Confirm" onClose={onClose}>
        body
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
