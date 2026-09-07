import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Composer, MESSAGE_BODY_COUNTER_THRESHOLD } from '../components/composer';
import { MESSAGE_BODY_MAX_LENGTH } from '../api/chat-api';
import { formatFaDigits } from '@/lib/format';

/**
 * Composer component tests (CHT-006 validation mechanics): disabled while
 * empty / whitespace-only / oversize, the >1800-char counter with fa digits,
 * Enter sends (Shift+Enter newlines), the value clears after send, and every
 * keystroke notifies the throttled typing emitter. Bulk values are set via
 * fireEvent.change (validation of VALUES, not of typing mechanics — typing
 * thousands of keystrokes through userEvent is needlessly slow on loaded CI
 * workers); real keyboard interaction stays on userEvent.
 */

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props: Parameters<typeof Composer>[0] = {
    conversationId: 'conv-1',
    onSend: jest.fn(),
    onTyping: jest.fn(),
    ...overrides,
  };
  const view = render(<Composer {...props} />);
  return { ...view, props };
}

function setValue(value: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'متن پیام' }), { target: { value } });
}

describe('Composer (CHT-006 validation + send)', () => {
  it('disables send while empty, while disabled, and re-enables with a trimmed body', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderComposer();
    const send = () => screen.getByRole('button', { name: 'ارسال' });

    expect(send()).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'متن پیام' }), 'سلام');
    expect(send()).toBeEnabled();

    // Whitespace-only still blocks (the API bound is post-trim).
    setValue('   ');
    expect(send()).toBeDisabled();

    rerender(<Composer {...props} disabled />);
    setValue('سلام');
    expect(send()).toBeDisabled();
  });

  it('shows the fa-digit counter past the threshold and disables past the 2000 bound', () => {
    renderComposer();

    // Below the threshold: no counter.
    setValue('سلام');
    expect(screen.queryByText(/\/ ۲۰۰۰/)).not.toBeInTheDocument();

    // One char past the threshold → counter appears.
    setValue('x'.repeat(MESSAGE_BODY_COUNTER_THRESHOLD + 1));
    const counter = screen.getByText(
      `${formatFaDigits(MESSAGE_BODY_COUNTER_THRESHOLD + 1)} / ۲۰۰۰`,
    );
    expect(counter).not.toHaveClass('text-red-600');
    expect(screen.getByRole('button', { name: 'ارسال' })).toBeEnabled();

    // Past the hard bound (2000 post-trim) → counter red + send disabled.
    setValue('x'.repeat(MESSAGE_BODY_MAX_LENGTH + 1));
    expect(screen.getByText(`${formatFaDigits(MESSAGE_BODY_MAX_LENGTH + 1)} / ۲۰۰۰`)).toHaveClass(
      'text-red-600',
    );
    expect(screen.getByRole('button', { name: 'ارسال' })).toBeDisabled();
  });

  it('sends on Enter (not Shift+Enter), forwards the raw value and clears the field', async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();
    renderComposer({ onSend });
    const textarea = screen.getByRole('textbox', { name: 'متن پیام' }) as HTMLTextAreaElement;

    await user.type(textarea, 'سلام{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('سلام');
    expect(textarea.value).toBe('');

    // Shift+Enter inserts a newline instead of sending.
    await user.type(textarea, 'خط اول{Shift>}{Enter}{/Shift}خط دوم');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe('خط اول\nخط دوم');

    // Enter on the newline-containing draft sends the raw value.
    await user.type(textarea, '{Enter}');
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend).toHaveBeenLastCalledWith('خط اول\nخط دوم');
  });

  it('notifies the typing emitter on every keystroke', async () => {
    const user = userEvent.setup();
    const onTyping = jest.fn();
    renderComposer({ onTyping });

    await user.type(screen.getByRole('textbox', { name: 'متن پیام' }), 'سلام');

    expect(onTyping).toHaveBeenCalledTimes(4); // per keystroke; throttling is the hook's job
  });
});

describe('Composer attachments (CHT-007)', () => {
  it('hands picked image/video files to the attach handlers and resets the inputs', () => {
    const onAttachImage = jest.fn();
    const onAttachVideo = jest.fn();
    const { container } = renderComposer({ onAttachImage, onAttachVideo });

    const imageInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    const videoInput = container.querySelector(
      'input[accept="video/mp4,video/webm"]',
    ) as HTMLInputElement;
    expect(imageInput).not.toBeNull();
    expect(videoInput).not.toBeNull();

    const image = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(imageInput, { target: { files: [image] } });
    expect(onAttachImage).toHaveBeenCalledWith(image);

    const video = new File(['y'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(videoInput, { target: { files: [video] } });
    expect(onAttachVideo).toHaveBeenCalledWith(video);

    // Same-file re-pick fires again (the input value was reset).
    fireEvent.change(imageInput, { target: { files: [image] } });
    expect(onAttachImage).toHaveBeenCalledTimes(2);
  });

  it('renders no attachment buttons when the handlers are absent (feature-off surface)', () => {
    const { container } = renderComposer();
    expect(container.querySelector('input[accept="image/*"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'ارسال تصویر' })).not.toBeInTheDocument();
  });
});
