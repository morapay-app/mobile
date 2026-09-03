import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedToggle } from '../SegmentedToggle';

function ControlledToggle() {
  const [value, setValue] = useState<0 | 1>(0);
  return <SegmentedToggle options={['Swap', 'Send']} value={value} onChange={setValue} />;
}

describe('SegmentedToggle', () => {
  it('marks the initial option as selected', async () => {
    await render(<ControlledToggle />);
    expect(screen.getByRole('button', { name: 'Swap', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send', selected: false })).toBeTruthy();
  });

  it('switches the selected option on press', async () => {
    await render(<ControlledToggle />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByRole('button', { name: 'Send', selected: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Swap', selected: false })).toBeTruthy();
  });
});
