import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge, Button, Card, CardHeader, Field, Input, Select } from '@rk/ui';

describe('Button', () => {
  it('renders its label and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Publish</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is inert and marked busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole('button', { name: /Saving/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Action</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('applies the requested variant class', () => {
    render(<Button variant="accent">Accent</Button>);
    expect(screen.getByRole('button')).toHaveClass('rk-button--accent');
  });
});

describe('Card', () => {
  it('renders a heading and description', () => {
    render(
      <Card>
        <CardHeader title="Reported issues" description="Last 30 days" />
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Reported issues' })).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('always carries a text label, never colour alone', () => {
    render(<Badge tone="warning">In progress</Badge>);
    expect(screen.getByText('In progress')).toHaveClass('rk-badge--warning');
  });
});

describe('Field + Input', () => {
  it('associates the label with the control', () => {
    render(
      <Field htmlFor="ward" label="Ward">
        <Input id="ward" />
      </Field>,
    );

    expect(screen.getByLabelText('Ward')).toBeInTheDocument();
  });

  it('wires hint text through aria-describedby', () => {
    render(
      <Field htmlFor="ward" label="Ward" hint="Enter the ward number">
        <Input id="ward" hasHint />
      </Field>,
    );

    expect(screen.getByLabelText('Ward')).toHaveAccessibleDescription('Enter the ward number');
  });

  it('marks the control invalid and announces the error', () => {
    render(
      <Field htmlFor="ward" label="Ward" error="Ward is required">
        <Input id="ward" invalid />
      </Field>,
    );

    const input = screen.getByLabelText('Ward');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Ward is required');
    expect(screen.getByRole('alert')).toHaveTextContent('Ward is required');
  });
});

describe('Select', () => {
  it('renders options and reports the chosen value', async () => {
    render(
      <Field htmlFor="status" label="Status">
        <Select
          id="status"
          placeholder="Choose a status"
          options={[
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </Field>,
    );

    const select = screen.getByLabelText('Status');
    await userEvent.selectOptions(select, 'resolved');
    expect(select).toHaveValue('resolved');
  });
});
