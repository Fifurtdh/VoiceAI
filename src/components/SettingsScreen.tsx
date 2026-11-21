import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  Phone,
  Sun,
  Trash2,
} from 'lucide-react';
import type { AppSettings, LanguageCode, ThemeMode } from '../types/khata';
import { LANGUAGES, type TranslationStrings } from '../utils/i18n';
import { CornerLines } from './CornerLines';
import { ConfirmDeleteAllModal } from './EntryMenuModal';

interface SettingsScreenProps {
  settings: AppSettings;
  storeLocation: string;
  userPhone: string;
  recoveryCode: string | null;
  t: TranslationStrings;
  onUpdateSettings: (updates: Partial<AppSettings>) => Promise<void> | void;
  onSaveProfileSettings: (payload: {
    shopName: string;
    storeLocation: string;
    language: LanguageCode;
    voiceWsUrl: string;
  }) => Promise<boolean>;
  onGenerateRecoveryCode: () => Promise<void>;
  onLogout: () => void;
  onDeleteAllData: () => void;
  onBack: () => void;
}

/**
 * Settings screen:
 * - Light (sunlight) / Dark mode toggle (never logs out)
 * - Shop Name, Store Location, 7-language selector + explicit Save Settings button
 * - Store Recovery Code, Voice WebSocket URL, Demo Mode toggle, Delete All Data, Logout
 */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  storeLocation,
  userPhone,
  recoveryCode,
  t,
  onUpdateSettings,
  onSaveProfileSettings,
  onGenerateRecoveryCode,
  onLogout,
  onDeleteAllData,
  onBack,
}) => {
  const [tapCount, setTapCount] = useState(0);
  const [demoRevealed, setDemoRevealed] = useState(settings.demoMode);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  const [draftShopName, setDraftShopName] = useState(settings.shopName);
  const [draftLocation, setDraftLocation] = useState(storeLocation);
  const [draftLanguage, setDraftLanguage] = useState<LanguageCode>(settings.language);
  const [draftWsUrl, setDraftWsUrl] = useState(settings.voiceWsUrl);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setDraftShopName(settings.shopName);
    setDraftLanguage(settings.language);
    setDraftWsUrl(settings.voiceWsUrl);
  }, [settings.shopName, settings.language, settings.voiceWsUrl]);

  useEffect(() => {
    setDraftLocation(storeLocation);
  }, [storeLocation]);

  const handleVersionTap = () => {
    if (demoRevealed) return;
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 7) {
      setDemoRevealed(true);
    }
  };

  const setTheme = (theme: ThemeMode) => {
    void onUpdateSettings({ theme });
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFeedback(null);
    if (draftShopName.trim().length < 2) {
      setSaveFeedback({
        type: 'error',
        message: 'Shop name must be at least 2 characters.',
      });
      return;
    }
    setSaving(true);
    try {
      const ok = await onSaveProfileSettings({
        shopName: draftShopName.trim(),
        storeLocation: draftLocation.trim(),
        language: draftLanguage,
        voiceWsUrl: draftWsUrl.trim(),
      });
      if (ok) {
        setSaveFeedback({
          type: 'success',
          message: 'Settings saved to your store profile.',
        });
      } else {
        setSaveFeedback({
          type: 'error',
          message: 'Could not save settings right now.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRotateCode = async () => {
    setGeneratingCode(true);
    try {
      await onGenerateRecoveryCode();
    } finally {
      setGeneratingCode(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--khata-bg)] text-[var(--khata-text)] overflow-x-hidden">
      <CornerLines className="absolute top-0 right-0 w-56 h-40 text-[var(--khata-text)]" />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-12">
        <header className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label={t.back}
              data-testid="settings-back-btn"
              className="min-h-[48px] min-w-[48px] w-12 h-12 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] flex items-center justify-center shrink-0 hover:opacity-90"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold">{t.settings}</h1>
          </div>

          <button
            type="button"
            onClick={onLogout}
            data-testid="logout-btn"
            className="min-h-[46px] px-4 rounded-full bg-[var(--khata-surface)] border border-[var(--khata-border)] text-sm font-bold inline-flex items-center gap-2 hover:opacity-90"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </header>

        <div className="space-y-4">
          {/* Light / Dark Theme Toggle */}
          <section className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5">
            <h2 className="text-base font-bold mb-3">{t.appearance}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={settings.theme === 'dark'}
                data-testid="dark-mode-btn"
                className={`min-h-[48px] px-4 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                  settings.theme === 'dark'
                    ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                    : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>{t.darkMode}</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={settings.theme === 'light'}
                data-testid="light-mode-btn"
                className={`min-h-[48px] px-4 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                  settings.theme === 'light'
                    ? 'bg-[var(--khata-accent)] text-[var(--khata-accent-fg)]'
                    : 'bg-[var(--khata-surface-elevated)] text-[var(--khata-text-secondary)]'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>{t.lightMode}</span>
              </button>
            </div>
          </section>

          {/* Store Profile, Language & Explicit Save Settings Button */}
          <form
            onSubmit={handleSaveSubmit}
            className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--khata-border)]">
              <div className="flex items-center gap-2 text-sm text-[var(--khata-text-secondary)]">
                <Phone className="w-4 h-4" />
                <span className="tabular-nums">+91 {userPhone}</span>
              </div>
              <span className="text-xs font-semibold text-[var(--khata-accent)]">
                Signed in
              </span>
            </div>

            {saveFeedback && (
              <div
                role="status"
                data-testid="settings-save-status"
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold ${
                  saveFeedback.type === 'success'
                    ? 'bg-[var(--khata-payment-bg)] text-[var(--khata-payment)]'
                    : 'bg-[#FF6B5E]/15 text-[#FF6B5E]'
                }`}
              >
                {saveFeedback.message}
              </div>
            )}

            <div>
              <label
                htmlFor="settings-shop-name"
                className="block text-sm font-bold mb-1.5"
              >
                {t.shopName}
              </label>
              <input
                id="settings-shop-name"
                type="text"
                value={draftShopName}
                onChange={(e) => setDraftShopName(e.target.value)}
                data-testid="settings-shop-name-input"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="settings-store-location"
                className="block text-sm font-bold mb-1.5"
              >
                Store Location
              </label>
              <input
                id="settings-store-location"
                type="text"
                value={draftLocation}
                onChange={(e) => setDraftLocation(e.target.value)}
                data-testid="settings-location-input"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="settings-language"
                className="block text-sm font-bold mb-1.5"
              >
                {t.language}
              </label>
              <select
                id="settings-language"
                value={draftLanguage}
                onChange={(e) => {
                  const nextLang = e.target.value as LanguageCode;
                  setDraftLanguage(nextLang);
                  void onUpdateSettings({ language: nextLang });
                }}
                data-testid="settings-language-select"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeName} ({lang.englishName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-ws-url"
                className="block text-sm font-bold mb-1.5"
              >
                {t.voiceBackendUrl}
              </label>
              <input
                id="settings-ws-url"
                type="url"
                value={draftWsUrl}
                onChange={(e) => setDraftWsUrl(e.target.value)}
                placeholder="wss://your-voice-server.example/ws"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] border border-[var(--khata-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--khata-accent)]"
              />
              <p className="text-xs text-[var(--khata-text-secondary)] leading-relaxed mt-1.5">
                {t.voiceBackendHelp}
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              data-testid="save-settings-btn"
              className="w-full min-h-[52px] px-5 rounded-full bg-[var(--khata-accent)] text-[var(--khata-accent-fg)] font-bold text-base flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Check className="w-5 h-5" />
              )}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </form>

          {/* Store Recovery Code (for Forgot Password) */}
          <section className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--khata-accent)]" />
                <h2 className="text-base font-bold">Store Recovery Code</h2>
              </div>
              {recoveryCode && (
                <span
                  data-testid="settings-recovery-code"
                  className="text-lg font-extrabold tracking-widest tabular-nums text-[var(--khata-accent)]"
                >
                  {recoveryCode}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--khata-text-secondary)]">
              Keep this 6-digit code in your shop diary to reset your password if forgotten.
            </p>
            <button
              type="button"
              onClick={handleRotateCode}
              disabled={generatingCode}
              className="min-h-[44px] px-4 rounded-full bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] text-sm font-semibold hover:opacity-90"
            >
              {generatingCode
                ? 'Generating...'
                : recoveryCode
                ? 'Generate New Code'
                : 'Show New Recovery Code'}
            </button>
          </section>

          {/* Hidden Demo Mode Toggle (revealed after 7 taps on version line) */}
          {demoRevealed && (
            <section
              data-testid="demo-mode-section"
              className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 flex items-center justify-between gap-4"
            >
              <div>
                <h2 className="text-base font-bold">{t.demoMode}</h2>
                <p className="text-xs text-[var(--khata-text-secondary)] mt-0.5">
                  {t.demoModeHelp}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.demoMode}
                aria-label={t.demoMode}
                data-testid="demo-mode-toggle"
                onClick={() =>
                  void onUpdateSettings({ demoMode: !settings.demoMode })
                }
                className={`min-h-[44px] w-20 px-1.5 rounded-full flex items-center transition-colors shrink-0 ${
                  settings.demoMode
                    ? 'bg-[var(--khata-accent)] justify-end'
                    : 'bg-[var(--khata-surface-elevated)] border border-[var(--khata-border)] justify-start'
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-full shadow ${
                    settings.demoMode
                      ? 'bg-[var(--khata-accent-fg)]'
                      : 'bg-[var(--khata-text-secondary)]'
                  }`}
                />
              </button>
            </section>
          )}

          {/* Delete All Data & Account Sign Out */}
          <section className="rounded-[24px] bg-[var(--khata-surface)] border border-[var(--khata-border)] p-5 space-y-3">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              data-testid="delete-all-data-btn"
              className="w-full min-h-[52px] px-5 rounded-full bg-[#FF6B5E]/15 text-[#FF6B5E] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#FF6B5E]/25 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              <span>{t.deleteAllData}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full min-h-[52px] px-5 rounded-full bg-[var(--khata-surface-elevated)] text-[var(--khata-text)] font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout from Store</span>
            </button>
          </section>

          {/* Subtle footer line — tap 7 times to reveal hidden Demo mode */}
          <div className="pt-2 text-center">
            <button
              type="button"
              data-testid="version-tap-target"
              onClick={handleVersionTap}
              className="min-h-[44px] px-4 text-xs text-[var(--khata-text-secondary)] select-none"
            >
              Voice Khata 1.0 · Store SQLite Sync
              {tapCount >= 4 && !demoRevealed
                ? ` (${7 - tapCount} more)`
                : ''}
            </button>
          </div>
        </div>
      </main>

      {confirmDeleteOpen && (
        <ConfirmDeleteAllModal
          t={t}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            onDeleteAllData();
          }}
        />
      )}
    </div>
  );
};
