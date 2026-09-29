/**
 * QEDrawer — slide-in sheet for drill-ins.
 *
 * Used everywhere we want to expose detail without losing the parent context:
 *   - Click a ConfluenceRow → drawer with full GEX terminal panes
 *   - Click a ticker in Sector Hunt → drawer with quick research card
 *   - Click an alert → drawer with full alert details + actions
 *
 *   <QEDrawer open={open} onClose={() => setOpen(false)} title="CRDO" subtitle="Credo Technology">
 *     <Body />
 *   </QEDrawer>
 *
 * 2026-09-29 lux pass: built on Radix Dialog — focus moves in and is trapped,
 * Escape and backdrop close, focus returns to the opener, the title labels the
 * dialog, body scroll locks. `side` adds left / bottom sheets (bottom is the
 * phone-friendly choice). Motion and surface (.lx-sheet / .lx-overlay in
 * components/lux/lux.css) adapted from the Trade Journal web app (apps/web/src/
 * components/shell.tsx nav drawer, globals.css .journal-nav-drawer), MIT
 * License, Copyright (c) 2026 LuxAlgo Global, LLC — see
 * components/lux/LICENSE-luxalgo.txt. API unchanged; `side` is optional.
 */
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QEDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** "sm"=420px, "md"=560px, "lg"=720px (width for left/right sheets) */
  size?: 'sm' | 'md' | 'lg';
  /** Which edge the sheet slides from. Default right. */
  side?: 'right' | 'left' | 'bottom';
  /** Right slot in header (e.g. action buttons) */
  headerAction?: ReactNode;
  /** Set to false to suppress the close X button */
  showClose?: boolean;
  className?: string;
  children: ReactNode;
}

const SIZE_MAP = {
  sm: 'w-[420px] max-w-full',
  md: 'w-[560px] max-w-full',
  lg: 'w-[720px] max-w-full',
};

export function QEDrawer({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  side = 'right',
  headerAction,
  showClose = true,
  className,
  children,
}: QEDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="lx-overlay" />
        <Dialog.Content
          className={cn('lx-sheet', side !== 'bottom' && SIZE_MAP[size], className)}
          data-side={side}
          {...(subtitle ? {} : { 'aria-describedby': undefined })}
        >
          <header className="lx-sheet-head">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="lx-sheet-title">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="lx-sheet-sub">{subtitle}</Dialog.Description>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerAction}
              {showClose && (
                <Dialog.Close className="lx-icon-btn lx-focus" aria-label="Close drawer">
                  <X aria-hidden />
                </Dialog.Close>
              )}
            </div>
          </header>
          <div className="lx-sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
