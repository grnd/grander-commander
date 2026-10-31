import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickSearch } from '@renderer/components/QuickSearch';

describe('QuickSearch', () => {
  it('renders nothing while no search is running', () => {
    const { container } = render(<QuickSearch buffer={null} matched />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the typed prefix, including an empty-looking one', () => {
    render(<QuickSearch buffer="re" matched />);
    expect(screen.getByText('re')).toBeInTheDocument();
    expect(screen.queryByText('no match')).toBeNull();
  });

  it('says so when the prefix matches nothing', () => {
    const { container } = render(<QuickSearch buffer="zz" matched={false} />);
    expect(screen.getByText('no match')).toBeInTheDocument();
    expect(container.querySelector('.gc-quicksearch')).toHaveClass('is-nomatch');
  });
});
