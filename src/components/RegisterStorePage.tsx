import React, { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MapPin,
  Navigation,
  Phone,
  Store,
} from 'lucide-react';
import type { AuthSessionResponse } from '../utils/api';
import { registerStore } from '../utils/api';
import { AuthLogo } from './AuthLogo';

interface RegisterStorePageProps {
  onRegisterSuccess: (session: AuthSessionResponse) => void;
  onGoToLogin: () => void;
}

/**
 * Clean, simple New Store Registration page for Indian kirana shopkeepers.
 * Collects Store Name, Store Location (+ optional GPS fill), +91 Phone Number, Password & Confirm Password.
 */
export const RegisterStorePage: React.FC<RegisterStorePageProps> = ({
  onRegisterSuccess,
  onGoToLogin,
}) => {
  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location service is not available on this device.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lng = pos.coords.longitude.toFixed(4);
        setStoreLocation((prev) =>
          prev.trim()
            ? `${prev.trim()} (GPS: ${lat}, ${lng})`
            : `GPS Location: ${lat}, ${lng}`
        );
        setLocating(false);
      },
      () => {
        setError('Could not read GPS location. Please type your area and city.');
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (storeName.trim().length < 2) {
      setError('Please enter your store name (for example: Sri Lakshmi General Store).');
      return;
    }
    if (storeLocation.trim().length < 3) {
      setError('Please enter your store address, area, city, or PIN code.');
      return;
    }
    const digits = phoneNumber.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please enter the same password twice.');
      return;
    }

    setLoading(true);
    try {
      const session = await registerStore({
        storeName: storeName.trim(),
        storeLocation: storeLocation.trim(),
        phoneNumber: digits,
        password,
        confirmPassword,
      });
      onRegisterSuccess(session);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not register your store. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#121714] px-4 py-6 sm:px-6 lg:px-8 flex flex-col justify-center">
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start lg:items-center">
        {/* Left intro / back navigation */}
        <div className="lg:col-span-5 space-y-4">
          <button
            type="button"
            onClick={onGoToLogin}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-white border border-[#121714]/15 text-sm font-bold text-[#121714] hover:bg-[#F1EFE8]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Login</span>
          </button>

          <div className="pt-2 flex justify-start">
            <AuthLogo />
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#121714]">
            Register Your Store
          </h1>
          <p className="text-base sm:text-lg text-[#3C4740]">
            Set up your shop&apos;s digital khata in 1 minute. Your customers
            and balances stay private to your store account.
          </p>
        </div>

        {/* White & Green Registration Form Card */}
        <div className="lg:col-span-7 w-full max-w-lg mx-auto lg:ml-auto">
          <div className="rounded-[24px] bg-white border border-[#0F7B4F]/15 shadow-sm p-6 sm:p-8">
            {error && (
              <div
                role="alert"
                data-testid="register-error"
                className="mb-5 rounded-2xl bg-[#D93829]/10 border border-[#D93829]/25 px-4 py-3 text-sm font-semibold text-[#B42318]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* 1. Store Name */}
              <div>
                <label
                  htmlFor="reg-store-name"
                  className="block text-base font-bold text-[#121714] mb-1.5"
                >
                  Store Name
                </label>
                <div className="flex items-center rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] px-4">
                  <Store className="w-5 h-5 text-[#0F7B4F] shrink-0" aria-hidden="true" />
                  <input
                    id="reg-store-name"
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Sri Lakshmi General Store"
                    className="w-full min-h-[54px] px-3 bg-transparent text-base sm:text-lg font-medium text-[#121714] placeholder:text-[#6B7670] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* 2. Store Location + optional GPS button */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="reg-store-location"
                    className="block text-base font-bold text-[#121714]"
                  >
                    Store Location
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locating}
                    className="min-h-[36px] px-3 rounded-full bg-[#EBF3EE] text-[#0F7B4F] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#DCECE3]"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{locating ? 'Locating...' : 'Use GPS location'}</span>
                  </button>
                </div>
                <div className="flex items-center rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] px-4">
                  <MapPin className="w-5 h-5 text-[#0F7B4F] shrink-0" aria-hidden="true" />
                  <input
                    id="reg-store-location"
                    type="text"
                    value={storeLocation}
                    onChange={(e) => setStoreLocation(e.target.value)}
                    placeholder="Area, City & PIN code"
                    className="w-full min-h-[54px] px-3 bg-transparent text-base sm:text-lg font-medium text-[#121714] placeholder:text-[#6B7670] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* 3. Phone Number (+91) */}
              <div>
                <label
                  htmlFor="reg-phone"
                  className="block text-base font-bold text-[#121714] mb-1.5"
                >
                  Phone Number
                </label>
                <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] overflow-hidden">
                  <span className="inline-flex items-center gap-1.5 px-4 bg-[#EBF3EE] text-[#0F7B4F] font-bold text-base border-r border-[#121714]/15 shrink-0 select-none">
                    <Phone className="w-4 h-4" aria-hidden="true" />
                    <span>+91</span>
                  </span>
                  <input
                    id="reg-phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phoneNumber}
                    onChange={(e) =>
                      setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="98765 43210"
                    className="w-full min-h-[54px] px-4 bg-transparent text-lg font-semibold text-[#121714] placeholder:text-[#6B7670] focus:outline-none tabular-nums"
                    required
                  />
                </div>
              </div>

              {/* 4. Password */}
              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-base font-bold text-[#121714] mb-1.5"
                >
                  Password
                </label>
                <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] overflow-hidden">
                  <span className="inline-flex items-center pl-4 text-[#3C4740]" aria-hidden="true">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full min-h-[54px] px-3 bg-transparent text-base sm:text-lg font-medium text-[#121714] placeholder:text-[#6B7670] focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="min-h-[54px] min-w-[52px] px-3 flex items-center justify-center text-[#3C4740]"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 5. Confirm Password */}
              <div>
                <label
                  htmlFor="reg-confirm-password"
                  className="block text-base font-bold text-[#121714] mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] overflow-hidden">
                  <span className="inline-flex items-center pl-4 text-[#3C4740]" aria-hidden="true">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full min-h-[54px] px-3 bg-transparent text-base sm:text-lg font-medium text-[#121714] placeholder:text-[#6B7670] focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    className="min-h-[54px] min-w-[52px] px-3 flex items-center justify-center text-[#3C4740]"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Large Green Register Button */}
              <button
                type="submit"
                disabled={loading}
                data-testid="register-submit-btn"
                className="w-full min-h-[56px] px-6 mt-2 rounded-full bg-[#0F7B4F] text-white font-bold text-lg flex items-center justify-center gap-2 hover:bg-[#0C6641] active:scale-[0.99] transition-all disabled:opacity-60"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>{loading ? 'Creating Store...' : 'Register My Store'}</span>
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-[#121714]/10 text-center">
              <p className="text-base text-[#3C4740]">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="font-bold text-[#0F7B4F] hover:underline py-1"
                >
                  Login here
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
