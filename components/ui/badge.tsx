import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-accent text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      success: 'bg-[var(--green-bg)] text-success',
      warning: 'bg-[var(--amber-bg)] text-warning',
      destructive: 'bg-[var(--red-bg)] text-destructive',
      info: 'bg-[var(--blue-bg)] text-info',
      outline: 'border border-border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
