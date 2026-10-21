'use client';

import { motion, useReducedMotion } from 'motion/react';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Switch as SwitchPrimitive } from 'radix-ui';

function Switch({
  className,
  size = 'default',
  checked,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default';
}) {
  const reduced = useReducedMotion();
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'cn-switch peer group/switch relative inline-flex items-center transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className
      )}
      checked={checked}
      {...props}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          data-slot="switch-thumb"
          className="cn-switch-thumb pointer-events-none block ring-0"
          initial={false}
          animate={{ x: checked ? (size === 'sm' ? 10 : 14) : 0 }}
          transition={{ duration: reduced ? 0 : 0.14 }}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
