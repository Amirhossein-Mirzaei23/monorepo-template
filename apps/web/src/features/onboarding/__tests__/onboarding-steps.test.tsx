import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepIdentity } from '../components/steps/step-identity';
import { StepInterests } from '../components/steps/step-interests';
import { StepLinks } from '../components/steps/step-links';
import { StepRole } from '../components/steps/step-role';
import { StepSellerExtras } from '../components/steps/step-seller-extras';

/**
 * ONB-002 per-step component tests: role cards, cascading geo selects,
 * interest chips (≤10), conditional seller extras, link validation display.
 */

const categoryTree = [
  {
    id: 'cat-apparel',
    nameFa: 'پوشاک',
    nameEn: null,
    slug: 'apparel',
    children: [
      { id: 'cat-apparel-men', nameFa: 'مردانه', nameEn: null, slug: 'apparel-men', children: [] },
      {
        id: 'cat-apparel-women',
        nameFa: 'زنانه',
        nameEn: null,
        slug: 'apparel-women',
        children: [],
      },
    ],
  },
  { id: 'cat-beauty', nameFa: 'زیبایی و بهداشتی', nameEn: null, slug: 'beauty', children: [] },
];

describe('StepRole', () => {
  it('toggles buyer and seller cards independently (both selectable)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StepRole isBuyer={false} isSeller={false} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /خریدار/ }));
    expect(onChange).toHaveBeenLastCalledWith({ isBuyer: true });

    await user.click(screen.getByRole('button', { name: /فروشنده/ }));
    expect(onChange).toHaveBeenLastCalledWith({ isSeller: true });
  });

  it('marks the selected role with aria-pressed', () => {
    render(<StepRole isBuyer isSeller={false} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /خریدار/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /فروشنده/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows the at-least-one-role error', () => {
    render(<StepRole isBuyer={false} isSeller={false} error="حداقل یکی..." onChange={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('حداقل یکی...');
  });
});

describe('StepIdentity', () => {
  it('resets city when the province changes and gates city on province', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <StepIdentity
        value={{ displayName: '', businessName: '', province: '', city: '' }}
        errors={{}}
        isSeller={false}
        onChange={onChange}
      />,
    );

    // No province yet → city select disabled with a placeholder.
    expect(screen.getByLabelText('شهر')).toBeDisabled();

    const provinceSelect = screen.getByLabelText('استان');
    await user.selectOptions(provinceSelect, 'isfahan');
    expect(onChange).toHaveBeenLastCalledWith({ province: 'isfahan', city: '' });

    rerender(
      <StepIdentity
        value={{ displayName: '', businessName: '', province: 'isfahan', city: '' }}
        errors={{}}
        isSeller={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('شهر')).toBeEnabled();
  });

  it('enables the city select and lists cities when a province is chosen', () => {
    render(
      <StepIdentity
        value={{ displayName: '', businessName: '', province: 'tehran', city: '' }}
        errors={{}}
        isSeller={false}
        onChange={jest.fn()}
      />,
    );
    const citySelect = screen.getByLabelText('شهر') as HTMLSelectElement;
    expect(citySelect).toBeEnabled();
    expect(citySelect.options.length).toBeGreaterThan(1);
  });

  it('shows the business name field only for sellers', () => {
    const { rerender } = render(
      <StepIdentity
        value={{ displayName: '', businessName: '', province: '', city: '' }}
        errors={{}}
        isSeller={false}
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText('نام کسب‌وکار')).toBeNull();

    rerender(
      <StepIdentity
        value={{ displayName: '', businessName: '', province: '', city: '' }}
        errors={{}}
        isSeller
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('نام کسب‌وکار')).toBeInTheDocument();
  });

  it('renders inline field errors', () => {
    render(
      <StepIdentity
        value={{ displayName: '', businessName: '', province: '', city: '' }}
        errors={{ displayName: 'نام نمایشی باید حداقل ۳ نویسه باشد' }}
        isSeller={false}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('نام نمایشی باید حداقل ۳ نویسه باشد');
  });
});

describe('StepInterests', () => {
  it('renders parent and parent › child chips', () => {
    render(
      <StepInterests
        tree={categoryTree}
        selected={[]}
        max={10}
        isLoading={false}
        loadError={false}
        onRetry={jest.fn()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'پوشاک' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پوشاک › مردانه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'زیبایی و بهداشتی' })).toBeInTheDocument();
  });

  it('marks selected chips and toggles them', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <StepInterests
        tree={categoryTree}
        selected={['cat-apparel-men']}
        max={10}
        isLoading={false}
        loadError={false}
        onRetry={onToggle}
        onToggle={onToggle}
      />,
    );
    const chip = screen.getByRole('button', { name: 'پوشاک › مردانه' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(onToggle).toHaveBeenCalledWith('cat-apparel-men');
  });

  it('disables unselected chips at the max limit', () => {
    render(
      <StepInterests
        tree={categoryTree}
        selected={['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']}
        max={10}
        isLoading={false}
        loadError={false}
        onRetry={jest.fn()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'پوشاک' })).toBeDisabled();
  });

  it('shows skeletons while loading and a retry affordance on error', () => {
    const { rerender } = render(
      <StepInterests
        tree={undefined}
        selected={[]}
        max={10}
        isLoading
        loadError={false}
        onRetry={jest.fn()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('در حال بارگذاری دسته‌بندی‌ها')).toBeInTheDocument();

    rerender(
      <StepInterests
        tree={undefined}
        selected={[]}
        max={10}
        isLoading={false}
        loadError
        onRetry={jest.fn()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument();
  });
});

describe('StepSellerExtras', () => {
  it('lists the seven business types with Persian labels', () => {
    render(
      <StepSellerExtras
        value={{ sellerYearsActive: '', sellerBusinessType: '', sellerDescription: '' }}
        errors={{}}
        onChange={jest.fn()}
      />,
    );
    const select = screen.getByLabelText('نوع کسب‌وکار') as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toEqual(
      expect.arrayContaining([
        'MANUFACTURER',
        'WORKSHOP',
        'WHOLESALER',
        'RETAILER',
        'TRADING',
        'SERVICE',
        'OTHER',
      ]),
    );
    expect(screen.getByRole('option', { name: 'تولیدکننده' })).toBeInTheDocument();
  });
});

describe('StepLinks', () => {
  it('renders optional instagram and website fields with ltr direction', () => {
    render(<StepLinks value={{ instagram: '', website: '' }} errors={{}} onChange={jest.fn()} />);
    expect(screen.getByLabelText('اینستاگرام (اختیاری)')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByLabelText('وب‌سایت (اختیاری)')).toHaveAttribute('dir', 'ltr');
  });
});
