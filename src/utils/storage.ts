import type { AppSettings, Customer, LedgerEntry } from '../types/khata';
import { createSampleSeedData, DEFAULT_SETTINGS } from './ledgerLogic';

const STORAGE_KEYS = {
  customers: 'voice_khata_customers_v1',
  entries: 'voice_khata_entries_v1',
  settings: 'voice_khata_settings_v1',
  initialized: 'voice_khata_initialized_v1',
} as const;

export interface KhataSnapshot {
  customers: Customer[];
  entries: LedgerEntry[];
  settings: AppSettings;
}

export function loadKhataState(): KhataSnapshot {
  try {
    const rawSettings = localStorage.getItem(STORAGE_KEYS.settings);
    const settings: AppSettings = rawSettings
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) }
      : { ...DEFAULT_SETTINGS };

    const initialized = localStorage.getItem(STORAGE_KEYS.initialized);
    if (!initialized) {
      const seed = createSampleSeedData();
      saveKhataData(seed.customers, seed.entries);
      saveKhataSettings(settings);
      localStorage.setItem(STORAGE_KEYS.initialized, '1');
      return { ...seed, settings };
    }

    const rawCustomers = localStorage.getItem(STORAGE_KEYS.customers);
    const rawEntries = localStorage.getItem(STORAGE_KEYS.entries);

    return {
      customers: rawCustomers ? (JSON.parse(rawCustomers) as Customer[]) : [],
      entries: rawEntries ? (JSON.parse(rawEntries) as LedgerEntry[]) : [],
      settings,
    };
  } catch {
    return {
      customers: [],
      entries: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }
}

export function saveKhataData(customers: Customer[], entries: LedgerEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(customers));
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
    localStorage.setItem(STORAGE_KEYS.initialized, '1');
  } catch {
    // Ignore storage quota issues safely
  }
}

export function saveKhataSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues safely
  }
}

export function clearAllKhataData(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.initialized, '1');
  } catch {
    // Ignore storage errors
  }
}
