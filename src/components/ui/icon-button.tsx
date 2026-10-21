import type { ComponentProps } from 'react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

/** Shared composition of Nova Button and Tooltip for labelled icon actions. */
export function IconButton({ title, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{title || props['aria-label']}</TooltipContent>
    </Tooltip>
  );
}
