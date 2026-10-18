import { useEffect, useRef } from 'react';

export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (first ?? panel)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
      if (!controls?.length) { event.preventDefault(); return; }
      const head = controls[0];
      const tail = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === head || document.activeElement === panel)) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && (document.activeElement === tail || document.activeElement === panel)) { event.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return ref;
}
