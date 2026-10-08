/**
 * Mounted once in every signed-in layout (App.tsx). Owns:
 *   • the one-time "Complete your profile" sheet — invited users who never
 *     filled the waitlist intake (no profile, never dismissed);
 *   • the first-run tour for the current page (beginner: full, intermediate:
 *     core steps, pro: none) and Help → "Take the tour" re-launches.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { OPEN_PROFILE_EVENT, START_TOUR_EVENT, useOnboarding } from '@/lib/onboarding';
import type { IntakeProfile } from '@shared/intake';
import type { TourId } from '@shared/onboarding';
import { IntakeForm } from './intake-form';
import { CoachTour } from './coach-tour';
import { TOURS, stepsFor, tourForLocation } from './tours';
import { waitlistErrorText } from '@/components/waitlist-popup';
import '@/styles/onboarding.css';

export function ProfileSheet({ onClose, onSaved, initial }: { onClose(): void; onSaved(p: IntakeProfile): void; initial?: Partial<IntakeProfile> | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="ob ob-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ob-sheet" role="dialog" aria-modal="true" aria-labelledby="ob-sheet-title" data-testid="profile-sheet">
        <div className="ob-sheet-head">
          <div>
            <h2 id="ob-sheet-title">{initial ? 'Your trading profile' : 'Complete your profile'}</h2>
            <p>About a minute. We use it to set up your tour and show you the right tools first.</p>
          </div>
          <button type="button" className="ob-x" onClick={onClose} aria-label="Not now"><X size={18} /></button>
        </div>
        <IntakeForm mode="profile" initial={initial ?? undefined} submitLabel="Save profile"
          onSubmit={async (profile) => {
            try {
              await apiRequest('PUT', '/api/onboarding/profile', { ...profile, via: 'profile-sheet' });
              onSaved(profile);
            } catch (e) { return waitlistErrorText(e); }
          }} />
      </div>
    </div>
  );
}

export function OnboardingHost() {
  const ob = useOnboarding();
  const [path] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tour, setTour] = useState<{ id: TourId; full: boolean } | null>(null);
  // The terminal switches ?nx= with replaceState (no router event) — re-read it on a light poll.
  const [liveSearch, setLiveSearch] = useState(() => window.location.search);
  useEffect(() => {
    setLiveSearch(window.location.search);
    const t = window.setInterval(() => setLiveSearch((s) => (s === window.location.search ? s : window.location.search)), 1000);
    return () => window.clearInterval(t);
  }, [search, path]);
  const pageTour = tourForLocation(path.split('?')[0], liveSearch);

  // One-time profile sheet.
  // Only inside the app (terminal, Today, desks) — never over the landing page or other public pages.
  const inApp = /^\/(t|today|desk)(\/|$)/.test(path.split('?')[0]);
  const needsProfile = inApp && ob.signedIn && !ob.loading && !ob.profile && !ob.progress.profileSheetDismissedAt;
  useEffect(() => {
    if (!needsProfile) return;
    const t = window.setTimeout(() => setSheetOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [needsProfile]);
  useEffect(() => {
    const open = () => setSheetOpen(true);
    window.addEventListener(OPEN_PROFILE_EVENT, open);
    return () => window.removeEventListener(OPEN_PROFILE_EVENT, open);
  }, []);

  // Auto-run the page tour (never over the sheet, never for pros, never with tips off).
  useEffect(() => {
    if (!inApp || !pageTour || tour || sheetOpen || !ob.signedIn || ob.loading || !ob.profile) return;
    if (ob.tier === 'pro' || !ob.tipsOn || ob.progress.tours[pageTour]) return;
    const t = window.setTimeout(() => setTour({ id: pageTour, full: false }), 1200);
    return () => window.clearTimeout(t);
  }, [inApp, pageTour, tour, sheetOpen, ob.signedIn, ob.loading, ob.profile, ob.tier, ob.tipsOn, ob.progress.tours]);

  // Help → Take the tour.
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id?: TourId }>).detail?.id ?? pageTour;
      if (id) setTour({ id, full: true });
      else toast({ title: 'No tour on this page', description: 'Tours run on Today, NEXUS, 0DTE, GEX, FLOW and Journal.' });
    };
    window.addEventListener(START_TOUR_EVENT, on);
    return () => window.removeEventListener(START_TOUR_EVENT, on);
  }, [pageTour, toast]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (!ob.profile) ob.patch({ profileSheetDismissedAt: new Date().toISOString() });
  }, [ob]);

  const finish = useCallback(() => {
    if (tour) ob.finishTour(tour.id);
    setTour(null);
  }, [tour, ob]);

  // A tour started on one page doesn't follow you to another.
  useEffect(() => { setTour((t) => (t && t.id !== pageTour ? null : t)); }, [pageTour]);

  if (!ob.signedIn) return null;
  return (
    <>
      {sheetOpen && (
        <ProfileSheet onClose={closeSheet} initial={ob.profile}
          onSaved={(p) => { ob.setProfile(p); setSheetOpen(false); toast({ title: 'Profile saved', description: 'Thanks — your tour is set up for you.' }); }} />
      )}
      {tour && !sheetOpen && (
        <CoachTour key={tour.id} title={TOURS[tour.id].label} steps={stepsFor(tour.id, ob.tier, tour.full)} onDone={finish} />
      )}
    </>
  );
}
