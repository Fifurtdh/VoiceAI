import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Phone } from 'lucide-react';
import type { AuthSessionResponse } from '../utils/api';
import { loginStore } from '../utils/api';
import { AuthLogo } from './AuthLogo';

interface LoginPageProps {
  successBanner?: string | null;
  onLoginSuccess: (session: AuthSessionResponse) => void;
  onGoToRegister: () => void;
  onGoToForgotPassword: () => void;
}

/**
 * Clean, high-contrast white & green Login page designed for kirana shopkeepers.
 */
export const LoginPage: React.FC<LoginPageProps> = ({
  successBanner,
  onLoginSuccess,
  onGoToRegister,
  onGoToForgotPassword,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgLoaded, setBgLoaded] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const digits = phoneNumber.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const session = await loginStore({ phoneNumber: digits, password });
      onLoginSuccess(session);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not log in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#1A1611] text-[#121714] flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      {/* Full-bleed Kirana Store Background with Subtle Drift Motion */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden select-none"
        aria-hidden="true"
      >
        {bgLoaded ? (
          <img
            src="/assets/aistudio/image_f1766328.jpg_d3c0ed48.jpeg"
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBgLoaded(false)}
            data-testid="login-bg-image"
            className="h-full w-full object-cover object-[68%_32%] lg:object-[62%_35%] animate-login-bg-drift"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1C241E] via-[#262018] to-[#121714]" />
        )}

        {/* Measured directional scrim: strong legibility on left/mobile, open warmth over the shopkeeper on desktop right */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#121714]/78 via-[#121714]/44 to-[#121714]/76 lg:bg-gradient-to-r lg:from-[#121714]/86 lg:via-[#121714]/54 lg:to-[#121714]/15" />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto">
        <div className="w-full max-w-md mx-auto lg:mx-0 space-y-6">
          {/* Brand + Welcome Back Header */}
          <div className="text-center lg:text-left space-y-3">
            <div className="flex justify-center lg:justify-start">
              <AuthLogo variant="light-text" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white pt-1 drop-shadow-sm [text-wrap:balance]">
              Welcome Back!
            </h1>
            <p className="text-sm sm:text-base text-white/90 drop-shadow-sm">
              Sign in with your store mobile number to manage your udhaar khata,
              voice entries, and customer balances safely.
            </p>
          </div>

          {/* White & Green Login Card */}
          <div className="rounded-[24px] bg-white/95 backdrop-blur-md border border-white/60 shadow-2xl p-6 sm:p-8">
            {successBanner && (
              <div
                role="status"
                className="mb-5 rounded-2xl bg-[#0F7B4F]/10 border border-[#0F7B4F]/25 px-4 py-3 text-sm font-semibold text-[#0F7B4F]"
              >
                {successBanner}
              </div>
            )}

            {error && (
              <div
                role="alert"
                data-testid="login-error"
                className="mb-5 rounded-2xl bg-[#D93829]/10 border border-[#D93829]/25 px-4 py-3 text-sm font-semibold text-[#B42318]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Phone Number with +91 */}
              <div>
                <label
                  htmlFor="login-phone"
                  className="block text-base font-bold text-[#121714] mb-2"
                >
                  Phone Number
                </label>
                <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] focus-within:border-[#0F7B4F] overflow-hidden">
                  <span className="inline-flex items-center gap-1.5 px-4 bg-[#EBF3EE] text-[#0F7B4F] font-bold text-base border-r border-[#121714]/15 shrink-0 select-none">
                    <Phone className="w-4 h-4" aria-hidden="true" />
                    <span>+91</span>
                  </span>
                  <input
                    id="login-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
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

              {/* Password with Show/Hide */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label
                    htmlFor="login-password"
                    className="block text-base font-bold text-[#121714]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={onGoToForgotPassword}
                    className="min-h-[36px] text-sm font-semibold text-[#0F7B4F] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>

                <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] focus-within:border-[#0F7B4F] overflow-hidden">
                  <span className="inline-flex items-center pl-4 text-[#3C4740]" aria-hidden="true">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full min-h-[54px] px-3 bg-transparent text-lg font-medium text-[#121714] placeholder:text-[#6B7670] focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="min-h-[54px] min-w-[52px] px-3 flex items-center justify-center text-[#3C4740] hover:text-[#121714]"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Large Green Login Button */}
              <button
                type="submit"
                disabled={loading}
                data-testid="login-submit-btn"
                className="w-full min-h-[56px] px-6 rounded-full bg-[#0F7B4F] text-white font-bold text-lg flex items-center justify-center gap-2 hover:bg-[#0C6641] active:scale-[0.99] transition-all disabled:opacity-60"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>{loading ? 'Logging in...' : 'Login'}</span>
              </button>
            </form>

            {/* Register Link */}
            <div className="mt-6 pt-5 border-t border-[#121714]/10 text-center">
              <p className="text-base text-[#3C4740]">
                New to Voice Khata?{' '}
                <button
                  type="button"
                  onClick={onGoToRegister}
                  data-testid="go-to-register-btn"
                  className="font-bold text-[#0F7B4F] hover:underline py-1"
                >
                  Register Your Store
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
