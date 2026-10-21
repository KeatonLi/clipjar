'use client';

import { motion, useReducedMotion } from 'motion/react';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const reduced = useReducedMotion();
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content asChild sideOffset={sideOffset} {...props}>
        <motion.div
          data-slot="tooltip-content"
          className={cn(
            'cn-tooltip-content z-50 w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) bg-foreground text-background',
            className
          )}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {children}
          <TooltipPrimitive.Arrow className="cn-tooltip-arrow z-50 translate-y-[calc(-50%_-_2px)] bg-foreground fill-foreground" />
        </motion.div>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
