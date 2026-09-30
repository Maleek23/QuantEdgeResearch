/**
 * Top-bar "Copy link" — copies the URL of exactly what is on screen (tab,
 * focus ticker, NEXUS selection, FLOW filters, GEX window… all live in the
 * query string, lib/url-state.ts) and confirms with a toast.
 */
import { Link2 } from 'lucide-react';
import { copyText, currentViewUrl } from '@/lib/url-state';
import { doneToast, failToast } from '@/lib/undo-toast';

export function CopyLinkButton() {
  const copy = async () => {
    const url = currentViewUrl();
    if (await copyText(url)) doneToast('Link copied', url.replace(/^https?:\/\//, ''));
    else failToast("Couldn't copy the link", new Error('Clipboard is blocked here — copy it from the address bar.'));
  };
  return (
    <button type="button" className="lx-icon-btn" onClick={() => void copy()} aria-label="Copy link to this view" title="Copy link to this view" data-testid="copy-link">
      <Link2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
