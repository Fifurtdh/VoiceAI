import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
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
  seedDemoDataApi,
  toggleCustomerReminderApi,
  toggleUndoEntryApi,
  updateCustomerApi,
  updateEntryApi,
  updateStoreSettingsApi,
  type StoreProfile,
} from './utils/api';
import { EditEntryModal } from './components/EntryMenuModal';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { HomeScreen } from './components/HomeScreen';
import { LedgerScreen } from './components/LedgerScreen';
import { LoginPage } from './components/LoginPage';
import { ManualEntryModal } from './components/ManualEntryModal';
import { RegisterStorePage } from './components/RegisterStorePage';
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
 * Voice Khata — Voice-powered credit ledger for Indian kirana shopkeepers.
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
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
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
      if (updates.voiceWsUrl !== undefined) apiPayload.voiceWsUrl = updates.voiceWsUrl;
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

  const handleConfirmEntry = useCallback(
    async (pending: PendingConfirmation) => {
      try {
        const res = await createEntryApi(pending);
        setCustomers((prev) => {
          const exists = prev.some((c) => c.id === res.customer.id);
          return exists ? prev : [res.customer, ...prev];
        });
        setEntries((prev) => [res.entry, ...prev]);
      } catch (err) {
        handleApiError(err);
        throw err;
      }
    },
    [handleApiError]
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

  return (
    <>
      {showRecoveryBanner && recoveryCode && screen === 'home' && (
        <div
          role="status"
          data-testid="recovery-code-banner"
          className="bg-[#0F7B4F] text-white px-4 py-3 text-sm font-medium flex items-center justify-between gap-3"
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
          className="bg-[#FF6B5E] text-[#0B0B0B] px-4 py-2.5 text-sm font-bold flex items-center justify-between gap-3"
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

      {screen === 'talk' && (
        <TalkScreen
          settings={settings}
          customers={customers}
          entries={entries}
          totals={totals}
          t={t}
          onConfirmEntry={(pending) => handleConfirmEntry(pending)}
          onMarkDisclosurePlayed={() =>
            void handleUpdateSettings({ aiDisclosurePlayed: true })
          }
          onEnableDemoMode={() => void handleUpdateSettings({ demoMode: true })}
          onClose={() => setScreen('home')}
        />
      )}

      {(screen === 'ledger' || screen === 'reminders') && (
        <LedgerScreen
          mode={screen}
          summaries={summaries}
          entries={entries}
          shopName={settings.shopName}
          t={t}
          onBack={() => setScreen('home')}
          onToggleReminderOptIn={(id) => void handleToggleReminderOptIn(id)}
          onSwitchToLedger={() => setScreen('ledger')}
          onOpenReports={() => setScreen('reports')}
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

      {screen === 'reports' && (
        <ReportsScreen
          customers={customers}
          entries={entries}
          t={t}
          onBack={() => setScreen('home')}
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
    </>
  );
}
