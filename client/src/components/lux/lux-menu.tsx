/**
 * LuxMenu — the one dropdown menu (account menus, row actions, "more" menus).
 * Radix DropdownMenu underneath: arrow keys, typeahead, Escape, focus return.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/ui/
 * dropdown-menu.tsx and the .journal-menu-surface / .journal-popup styles),
 * MIT License, Copyright (c) 2026 LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt.
 */
import type { ComponentProps, ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LuxMenu = Menu.Root;
export const LuxMenuTrigger = Menu.Trigger;

export function LuxMenuContent({ className, sideOffset = 6, align = 'end', ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn('lx-menu', className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function LuxMenuItem({
  className,
  icon,
  end,
  children,
  ...props
}: ComponentProps<typeof Menu.Item> & { icon?: ReactNode; end?: ReactNode }) {
  return (
    <Menu.Item className={cn('lx-menu-item', className)} {...props}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {end != null && <span className="lx-menu-item-end">{end}</span>}
    </Menu.Item>
  );
}
/** Non-interactive header block (e.g. the signed-in account). */
export function LuxMenuLabel({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <Menu.Label className="lx-menu-label">
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </Menu.Label>
  );
}

export function LuxMenuSeparator() {
  return <Menu.Separator className="lx-menu-sep" />;
}
