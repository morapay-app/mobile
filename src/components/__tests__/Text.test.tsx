import { render, screen } from '@testing-library/react-native';

import { Text } from '../Text';

describe('Text', () => {
  it('lowercases content for lowercase variants (headings)', async () => {
    await render(<Text variant="heading">Get Started NOW</Text>);
    expect(screen.getByText('get started now')).toBeTruthy();
  });

  it('leaves body copy untouched', async () => {
    await render(<Text variant="body">Get Started NOW</Text>);
    expect(screen.getByText('Get Started NOW')).toBeTruthy();
  });

  it('applies the theme font family for the variant', async () => {
    await render(<Text variant="displayLg">hero</Text>);
    const node = screen.getByText('hero');
    const flatStyle = Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style)
      : node.props.style;
    expect(flatStyle.fontFamily).toBe('Manrope_500Medium');
  });
});
