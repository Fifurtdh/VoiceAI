import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type {
  AppScreen,
  AppSettings,
  Customer,
  EntryDirection,
  LanguageCode,
  LedgerEntry,
  PendingConfirmation,
} from './types/khata';
import { useAuth } from './context/AuthContext';
import { formatINRNumber } from './utils/format';
import { TRANSLATIONS } from './utils/i18n';
import {
  computeCustomerSummaries,
  computeDashboardTotals,
  DEFAULT_SETTINGS,
} from './utils/ledgerLogic';
import {
  clearStoreKhataApi,
  createCustomerApi,
  createEntryApi,
  deleteCustomerApi,
  deleteEntryApi,
  fetchKhataData,
  generateNewRecoveryCode,
  reverseEntryApi,
  seedDemoDataApi,
  toggleCustomerReminderApi,
  toggleUndoEntryApi,
  updateCustomerApi,
  updateEntryApi,
  updateStoreSettingsApi,
  type ApiError,
  type DuplicateMatch,
  type StoreProfile,
} from './utils/api';
import { AiAssistantScreen } from './components/AiAssistantScreen';
import { AppShell } from './components/AppShell';
import { EditEntryModal } from './components/EntryMenuModal';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { HistoryScreen } from './components/HistoryScreen';
import { HomeScreen } from './components/HomeScreen';
import { LedgerScreen } from './components/LedgerScreen';
import { LoginPage } from './components/LoginPage';
import { ManualEntryModal } from './components/ManualEntryModal';
import { RegisterStorePage } from './components/RegisterStorePage';
import { RemindersScreen } from './components/RemindersScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { TalkScreen } from './components/TalkScreen';

type AuthView = 'login' | 'register' | 'forgot';

function storeProfileToSettings(store: StoreProfile): AppSettings {
  return {
    theme: store.theme === 'light' ? 'light' : 'dark',
    language: store.language || 'en',
    shopName: store.storeName,
    voiceWsUrl: store.voiceWsUrl || '',
    demoMode: Boolean(store.demoMode),
    aiDisclosurePlayed: Boolean(store.aiDisclosurePlayed),
  };
}

/**
 * Voice Khata — Voice-powered credit ledger & AI business intelligence for Indian kirana shopkeepers.
 * Authentication state is managed by AuthProvider (HTTP-only JWT cookie + SQLite)
 * independently of theme toggles, page navigation, and modal views.
 */
export default function App() {
  const {
    user,
    store,
    authChecking,
    authBanner,
    recoveryCode,
    showRecoveryBanner,
    setAuthBanner,
    setRecoveryCode,
    dismissRecoveryBanner,
    applyAuthSuccess,
    updateStoreLocal,
    logout,
    handleUnauthorized,
  } = useAuth();

  const [authView, setAuthView] = useState<AuthView>('login');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [storeLocation, setStoreLocation] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() =>
    store ? storeProfileToSettings(store) : { ...DEFAULT_SETTINGS }
  );
  const [screen, setScreen] = useState<AppScreen>('home');
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [manualEntryTarget, setManualEntryTarget] = useState<{
    direction: EntryDirection;
    customer?: Customer | null;
  } | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    pending: PendingConfirmation;
    matches: DuplicateMatch[];
  } | null>(null);
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAuthenticatedKhata = useCallback(async () => {
    const khata = await fetchKhataData();
    setCustomers(khata.customers);
    setEntries(khata.entries);
    setStoreLocation(khata.store.storeLocation);
    setSettings(storeProfileToSettings(khata.store));
    updateStoreLocal(khata.store);
  }, [updateStoreLocal]);

  // Load store ledger data whenever authenticated user changes
  useEffect(() => {
    if (!user) {
      setCustomers([]);
      setEntries([]);
      setStoreLocation('');
      setScreen('home');
      return;
    }

    if (store) {
      setStoreLocation(store.storeLocation);
      setSettings(storeProfileToSettings(store));
    }

    let active = true;
    loadAuthenticatedKhata().catch((err) => {
      if (!active) return;
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        handleUnauthorized();
      }
    });

    return () => {
      active = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll cleanly to top when switching screens or auth views
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, authView, user?.id]);

  // Sync <html> dark class cleanly without ever mutating auth state
  useEffect(() => {
    const root = document.documentElement;
    if (!user) {
      root.classList.remove('dark');
      return;
    }
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [user, settings.theme]);

  const handleApiError = useCallback(
    (err: unknown) => {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        handleUnauthorized();
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';
      setActionError(message);
    },
    [handleUnauthorized]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    setCustomers([]);
    setEntries([]);
    setScreen('home');
    setAuthView('login');
  }, [logout]);

  const t = TRANSLATIONS[settings.language] ?? TRANSLATIONS.en;

  const totals = useMemo(
    () => computeDashboardTotals(customers, entries),
    [customers, entries]
  );

  const summaries = useMemo(
    () => computeCustomerSummaries(customers, entries),
    [customers, entries]
  );

  const handleUpdateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));

      const apiPayload: Parameters<typeof updateStoreSettingsApi>[0] = {};
      if (updates.shopName !== undefined) apiPayload.storeName = updates.shopName;
      if (updates.language !== undefined) apiPayload.language = updates.language;
      if (updates.theme !== undefined) apiPayload.theme = updates.theme;
      if (updates.voiceWsUrl !== undefined)
        apiPayload.voiceWsUrl = updates.voiceWsUrl;
      if (updates.demoMode !== undefined) apiPayload.demoMode = updates.demoMode;
      if (updates.aiDisclosurePlayed !== undefined) {
        apiPayload.aiDisclosurePlayed = updates.aiDisclosurePlayed;
      }

      try {
        const res = await updateStoreSettingsApi(apiPayload);
        updateStoreLocal(res.store);
        if (updates.demoMode === true && customers.length === 0) {
          const seeded = await seedDemoDataApi();
          setCustomers(seeded.customers);
          setEntries(seeded.entries);
        }
      } catch (err) {
        handleApiError(err);
      }
    },
    [customers.length, handleApiError, updateStoreLocal]
  );

  const handleSaveProfileSettings = useCallback(
    async (payload: {
      shopName: string;
      storeLocation: string;
      language: LanguageCode;
      voiceWsUrl: string;
    }): Promise<boolean> => {
      setSettings((prev) => ({
        ...prev,
        shopName: payload.shopName,
        language: payload.language,
        voiceWsUrl: payload.voiceWsUrl,
      }));
      setStoreLocation(payload.storeLocation);

      try {
        const res = await updateStoreSettingsApi({
          storeName: payload.shopName,
          storeLocation: payload.storeLocation,
          language: payload.language,
          voiceWsUrl: payload.voiceWsUrl,
        });
        updateStoreLocal(res.store);
        setSettings(storeProfileToSettings(res.store));
        setStoreLocation(res.store.storeLocation);
        return true;
      } catch (err) {
        handleApiError(err);
        return false;
      }
    },
    [handleApiError, updateStoreLocal]
  );

  const handleCreateCustomer = useCallback(
    async (payload: {
      name: string;
      phone: string;
      tag: string;
      remindersOptIn: boolean;
    }) => {
      const res = await createCustomerApi(payload);
      setCustomers((prev) => [res.customer, ...prev]);
    },
    []
  );

  const handleUpdateCustomer = useCallback(
    async (
      customerId: string,
      payload: {
        name: string;
        phone: string;
        tag: string;
        remindersOptIn: boolean;
      }
    ) => {
      const res = await updateCustomerApi(customerId, payload);
      setCustomers((prev) =>
        prev.map((c) => (c.id === customerId ? res.customer : c))
      );
      setEntries((prev) =>
        prev.map((e) =>
          e.customerId === customerId
            ? { ...e, customerName: res.customer.name }
            : e
        )
      );
    },
    []
  );

  const handleDeleteCustomer = useCallback(
    async (customerId: string) => {
      try {
        await deleteCustomerApi(customerId);
        setCustomers((prev) => prev.filter((c) => c.id !== customerId));
        setEntries((prev) => prev.filter((e) => e.customerId !== customerId));
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError]
  );

  const commitEntryToState = useCallback(
    (customer: Customer, entry: LedgerEntry) => {
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === customer.id);
        return exists ? prev : [customer, ...prev];
      });
      setEntries((prev) => {
        const exists = prev.some((e) => e.id === entry.id);
        return exists ? prev : [entry, ...prev];
      });
    },
    []
  );

  const handleConfirmEntry = useCallback(
    async (pending: PendingConfirmation, confirmDuplicate = false) => {
      try {
        const clientRequestId = `req-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const res = await createEntryApi({
          ...pending,
          clientRequestId,
          checkDuplicate: !confirmDuplicate,
          confirmDuplicate,
        });
        commitEntryToState(res.customer, res.entry);
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.code === 'POTENTIAL_DUPLICATE' && apiErr.duplicates?.length) {
          setDuplicatePrompt({ pending, matches: apiErr.duplicates });
          return;
        }
        handleApiError(err);
        throw err;
      }
    },
    [commitEntryToState, handleApiError]
  );

  const handleConfirmDuplicateSave = async () => {
    if (!duplicatePrompt) return;
    setConfirmingDuplicate(true);
    try {
      await handleConfirmEntry(duplicatePrompt.pending, true);
      setDuplicatePrompt(null);
    } catch {
      // Error surfaced via handleApiError
    } finally {
      setConfirmingDuplicate(false);
    }
  };

  const handleEntryReversed = useCallback(
    (reversedEntry: LedgerEntry, replacementEntry: LedgerEntry | null) => {
      setEntries((prev) => {
        const updated = prev.map((e) =>
          e.id === reversedEntry.id ? reversedEntry : e
        );
        return replacementEntry ? [replacementEntry, ...updated] : updated;
      });
    },
    []
  );

  const handleVoiceReverseEntry = useCallback(
    async (
      entryId: string,
      payload: { reason: string; replacementAmount?: number }
    ) => {
      try {
        const res = await reverseEntryApi(entryId, payload);
        handleEntryReversed(res.reversedEntry, res.replacementEntry);
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError, handleEntryReversed]
  );

  const handleSaveEditedEntry = useCallback(
    async (
      entryId: string,
      updates: {
        amount: number;
        direction: EntryDirection;
        date: string;
        note?: string;
      }
    ) => {
      try {
        const res = await updateEntryApi(entryId, updates);
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? res.entry : e))
        );
        setEditingEntry(null);
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError]
  );

  const handleUndoEntry = useCallback(
    async (entryId: string) => {
      try {
        const res = await toggleUndoEntryApi(entryId);
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? res.entry : e))
        );
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError]
  );

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      try {
        await deleteEntryApi(entryId);
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError]
  );

  const handleToggleReminderOptIn = useCallback(
    async (customerId: string) => {
      try {
        const res = await toggleCustomerReminderApi(customerId);
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerId ? res.customer : c))
        );
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError]
  );

  const handleDeleteAllData = useCallback(async () => {
    try {
      await clearStoreKhataApi();
      setCustomers([]);
      setEntries([]);
      setScreen('home');
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError]);

  const handleGenerateRecoveryCode = useCallback(async () => {
    try {
      const res = await generateNewRecoveryCode();
      setRecoveryCode(res.recoveryCode);
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError, setRecoveryCode]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] text-[#121714] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F7B4F]" />
        <p className="text-base font-semibold">Loading Voice Khata...</p>
      </div>
    );
  }

  // Unauthenticated Auth Flow: Login / Register Your Store / Forgot Password
  if (!user) {
    if (authView === 'register') {
      return (
        <RegisterStorePage
          onRegisterSuccess={(session) => {
            applyAuthSuccess(session, true);
            setScreen('home');
          }}
          onGoToLogin={() => {
            setAuthBanner(null);
            setAuthView('login');
          }}
        />
      );
    }

    if (authView === 'forgot') {
      return (
        <ForgotPasswordPage
          onSuccess={(msg) => {
            setAuthBanner(msg);
            setAuthView('login');
          }}
          onBackToLogin={() => {
            setAuthBanner(null);
            setAuthView('login');
          }}
        />
      );
    }

    return (
      <LoginPage
        successBanner={authBanner}
        onLoginSuccess={(session) => {
          applyAuthSuccess(session, false);
          setScreen('home');
        }}
        onGoToRegister={() => {
          setAuthBanner(null);
          setAuthView('register');
        }}
        onGoToForgotPassword={() => {
          setAuthBanner(null);
          setAuthView('forgot');
        }}
      />
    );
  }

  const mainContent = (
    <>
      {showRecoveryBanner && recoveryCode && screen === 'home' && (
        <div
          role="status"
          data-testid="recovery-code-banner"
          className="bg-[#0F7B4F] text-white px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 print:hidden"
        >
          <span>
            Store created! Save your 6-digit Recovery Code:{' '}
            <strong className="font-extrabold tracking-wider tabular-nums">
              {recoveryCode}
            </strong>
          </span>
          <button
            type="button"
            onClick={dismissRecoveryBanner}
            aria-label="Dismiss recovery code notice"
            className="min-h-[36px] min-w-[36px] rounded-full bg-white/15 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="bg-[#FF6B5E] text-[#0B0B0B] px-4 py-2.5 text-sm font-bold flex items-center justify-between gap-3 print:hidden"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="min-h-[32px] min-w-[32px] rounded-full bg-black/10 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {screen === 'home' && (
        <HomeScreen
          settings={settings}
          totals={totals}
          entries={entries}
          customers={customers}
          t={t}
          onNavigate={setScreen}
          onLanguageChange={(language) => void handleUpdateSettings({ language })}
          onQuickAddEntry={(direction) =>
            setManualEntryTarget({ direction, customer: null })
          }
          onEditEntry={(entry) => setEditingEntry(entry)}
          onUndoEntry={(id) => void handleUndoEntry(id)}
          onDeleteEntry={(id) => void handleDeleteEntry(id)}
        />
      )}

      {screen === 'ledger' && (
        <LedgerScreen
          summaries={summaries}
          entries={entries}
          shopName={settings.shopName}
          t={t}
          onBack={() => setScreen('home')}
          onToggleReminderOptIn={(id) => void handleToggleReminderOptIn(id)}
          onCreateCustomer={handleCreateCustomer}
          onUpdateCustomer={handleUpdateCustomer}
          onDeleteCustomer={handleDeleteCustomer}
          onAddEntryForCustomer={(customer, direction) =>
            setManualEntryTarget({ direction, customer })
          }
          onEditEntry={(entry) => setEditingEntry(entry)}
          onUndoEntry={(id) => void handleUndoEntry(id)}
          onDeleteEntry={(id) => void handleDeleteEntry(id)}
        />
      )}

      {screen === 'history' && (
        <HistoryScreen
          shopName={settings.shopName}
          entries={entries}
          onEditEntry={(entry) => setEditingEntry(entry)}
          onUndoEntry={(id) => void handleUndoEntry(id)}
          onDeleteEntry={(id) => void handleDeleteEntry(id)}
          onEntryReversed={handleEntryReversed}
        />
      )}

      {screen === 'assistant' && <AiAssistantScreen settings={settings} />}

      {screen === 'reports' && (
        <ReportsScreen
          shopName={settings.shopName}
          customers={customers}
          entries={entries}
          t={t}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'reminders' && (
        <RemindersScreen
          settings={settings}
          onToggleReminderOptIn={(id) => handleToggleReminderOptIn(id)}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          storeLocation={storeLocation}
          userPhone={user.phoneNumber}
          recoveryCode={recoveryCode}
          t={t}
          onUpdateSettings={handleUpdateSettings}
          onSaveProfileSettings={handleSaveProfileSettings}
          onGenerateRecoveryCode={handleGenerateRecoveryCode}
          onLogout={() => void handleLogout()}
          onDeleteAllData={() => void handleDeleteAllData()}
          onBack={() => setScreen('home')}
        />
      )}
    </>
  );

  return (
    <>
      {screen === 'talk' ? (
        <TalkScreen
          settings={settings}
          customers={customers}
          entries={entries}
          totals={totals}
          t={t}
          onConfirmEntry={(pending) => handleConfirmEntry(pending)}
          onReverseEntry={handleVoiceReverseEntry}
          onMarkDisclosurePlayed={() =>
            void handleUpdateSettings({ aiDisclosurePlayed: true })
          }
          onEnableDemoMode={() => void handleUpdateSettings({ demoMode: true })}
          onClose={() => setScreen('home')}
        />
      ) : (
        <AppShell
          activeScreen={screen}
          shopName={settings.shopName}
          onNavigate={setScreen}
        >
          {mainContent}
        </AppShell>
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          t={t}
          onSave={(id, updates) => void handleSaveEditedEntry(id, updates)}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {manualEntryTarget && (
        <ManualEntryModal
          customers={customers}
          initialDirection={manualEntryTarget.direction}
          initialCustomer={manualEntryTarget.customer}
          t={t}
          onSave={(pending) => handleConfirmEntry(pending)}
          onClose={() => setManualEntryTarget(null)}
        />
      )}

      {/* Feature 5: Duplicate Transaction Safety Confirmation Modal */}
      {duplicatePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Potential duplicate transaction"
          data-testid="duplicate-warning-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-6 space-y-4 shadow-2xl animate-sheet-up">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Possible Duplicate Entry</h2>
                <p className="text-sm text-[var(--khata-text-secondary)] mt-0.5">
                  A matching{' '}
                  <strong className="text-[var(--khata-text)] tabular-nums">
                    ₹{formatINRNumber(duplicatePrompt.pending.amount)}{' '}
                    {duplicatePrompt.pending.direction === 'credit'
                      ? 'udhaar'
                      : 'payment'}
                  </strong>{' '}
                  for{' '}
                  <strong className="text-[var(--khata-text)]">
                    {duplicatePrompt.matches[0].customerName}
                  </strong>{' '}
                  was already recorded on {duplicatePrompt.matches[0].date}
                  {duplicatePrompt.matches[0].minutesAgo <= 60
                    ? ` (${duplicatePrompt.matches[0].minutesAgo} min ago)`
                    : ''}
                  .
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--khata-text-secondary)]">
              If this is a genuine second purchase or payment, you can safely confirm and save it anyway.
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                data-testid="duplicate-cancel-btn"
                onClick={() => setDuplicatePrompt(null)}
                className="flex-1 min-h-[46px] rounded-xl bg-[var(--khata-surface-elevated)] font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmingDuplicate}
                data-testid="duplicate-confirm-save-btn"
                onClick={() => void handleConfirmDuplicateSave()}
                className="flex-1 min-h-[46px] rounded-xl bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-sm disabled:opacity-50"
              >
                {confirmingDuplicate ? 'Saving...' : 'Save Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
