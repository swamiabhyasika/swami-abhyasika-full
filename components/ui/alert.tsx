import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-muted text-foreground',
      info: 'border-[var(--blue)]/30 bg-[var(--blue-bg)] text-foreground',
      warning: 'border-[var(--amber)]/40 bg-[var(--amber-bg)] text-foreground',
      destructive: 'border-[var(--red)]/40 bg-[var(--red-bg)] text-foreground',
      success: 'border-[var(--green)]/40 bg-[var(--green-bg)] text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('mb-0.5 font-semibold', className)} {...props} />;
}
function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('text-[13px] text-muted-foreground', className)} {...props} />;
}
export { Alert, AlertTitle, AlertDescription };
