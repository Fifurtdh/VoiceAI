import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  Clock,
  Home,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Settings,
  Users,
  X,
} from 'lucide-react';
import type { AppScreen } from '../types/khata';

interface AppShellProps {
  activeScreen: AppScreen;
  shopName: string;
  onNavigate: (screen: AppScreen) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: AppScreen;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Dashboard', shortLabel: 'Home', icon: Home },
  { id: 'talk', label: 'Voice Khata', shortLabel: 'Voice', icon: Mic },
  { id: 'ledger', label: 'Customers', shortLabel: 'Customers', icon: Users },
  { id: 'history', label: 'Khata History', shortLabel: 'History', icon: Clock },
  { id: 'assistant', label: 'AI Assistant', shortLabel: 'AI Chat', icon: MessageSquareText },
  { id: 'reports', label: 'Business Reports', shortLabel: 'Reports', icon: BarChart3 },
  { id: 'reminders', label: 'Payment Reminders', shortLabel: 'Reminders', icon: Bell },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

const MOBILE_PRIMARY_IDS: AppScreen[] = ['home', 'talk', 'ledger', 'assistant'];
const MOBILE_MORE_IDS: AppScreen[] = ['history', 'reports', 'reminders', 'settings'];

/**
 * Clean, responsive navigation shell connecting all 8 Voice Khata sections:
 * - Desktop (lg+): fixed 236px left sidebar with clear active styling
 * - Mobile (<lg): compact 60px bottom navigation bar + "More" sheet (well under 15% viewport height)
 */
export const AppShell: React.FC<AppShellProps> = ({
  activeScreen,
  shopName,
  onNavigate,
  children,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MOBILE_MORE_IDS.includes(activeScreen);

  const handleSelect = (screen: AppScreen) => {
    setMoreOpen(false);
    onNavigate(screen);
  };

  return (
    <div className="min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex lg:flex-col lg:w-[236px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-[var(--khata-surface)] border-r border-[var(--khata-border)] px-3.5 py-5 justify-between print:hidden"
      >
        <div className="space-y-6">
          <div className="px-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--khata-text-secondary)]">
              Voice Khata
            </p>
            <p className="text-base font-extrabold truncate mt-0.5">{shopName}</p>
          </div>

          <nav className="space-y-1">
            {ALL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`nav-${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleSelect(item.id)}
                  className={`w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors text-left ${
                    active
                      ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold'
                      : 'text-[var(--khata-text-secondary)] hover:bg-[var(--khata-surface-elevated)] hover:text-[var(--khata-text)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-2.5 pt-3 border-t border-[var(--khata-border)]">
          <p className="text-[11px] text-[var(--khata-text-secondary)] leading-snug">
            Kirana Credit Ledger &amp; AI Business Intelligence
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 pb-[72px] lg:pb-0">{children}</div>

      {/* Mobile Compact Bottom Navigation Bar (60px height) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-[60px] bg-[var(--khata-surface)] border-t border-[var(--khata-border)] grid grid-cols-5 items-center px-1 print:hidden"
      >
        {MOBILE_PRIMARY_IDS.map((id) => {
          const item = ALL_NAV_ITEMS.find((n) => n.id === id)!;
          const Icon = item.icon;
          const active = activeScreen === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`mobile-nav-${id}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => handleSelect(id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                active
                  ? 'text-[var(--khata-accent)] font-bold'
                  : 'text-[var(--khata-text-secondary)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}

        <button
          type="button"
          data-testid="mobile-nav-more"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((prev) => !prev)}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            isMoreActive || moreOpen
              ? 'text-[var(--khata-accent)] font-bold'
              : 'text-[var(--khata-text-secondary)]'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile "More" Sheet */}
      {moreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More sections"
          className="lg:hidden fixed inset-0 z-50 bg-black/50 flex items-end print:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-[24px] bg-[var(--khata-surface)] border-t border-[var(--khata-border)] p-5 space-y-2 animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-base font-bold">More Sections</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="min-h-[40px] min-w-[40px] rounded-full bg-[var(--khata-surface-elevated)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {MOBILE_MORE_IDS.map((id) => {
                const item = ALL_NAV_ITEMS.find((n) => n.id === id)!;
                const Icon = item.icon;
                const active = activeScreen === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`mobile-more-${id}`}
                    onClick={() => handleSelect(id)}
                    className={`min-h-[52px] px-4 rounded-2xl flex items-center gap-2.5 text-sm font-semibold border ${
                      active
                        ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] border-transparent font-bold'
                        : 'bg-[var(--khata-surface-elevated)] border-[var(--khata-border)] text-[var(--khata-text)]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
