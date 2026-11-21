import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Phone } from 'lucide-react';
import { resetForgottenPassword } from '../utils/api';
import { AuthLogo } from './AuthLogo';

interface ForgotPasswordPageProps {
  onSuccess: (message: string) => void;
  onBackToLogin: () => void;
}

/**
 * Simple password reset screen verified with the shopkeeper's 6-digit Store Recovery Code.
 */
export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({
  onSuccess,
  onBackToLogin,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const digits = phoneNumber.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!/^\d{6}$/.test(recoveryCode.trim())) {
      setError('Please enter the 6-digit Store Recovery Code.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetForgottenPassword({
        phoneNumber: digits,
        recoveryCode: recoveryCode.trim(),
        newPassword,
      });
      onSuccess(res.message || 'Password updated. You can now log in.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reset password. Please check your details.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#121714] flex flex-col justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md mx-auto space-y-6">
        <button
          type="button"
          onClick={onBackToLogin}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-white border border-[#121714]/15 text-sm font-bold text-[#121714] hover:bg-[#F1EFE8]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Login</span>
        </button>

        <div className="flex justify-center">
          <AuthLogo />
        </div>

        <div className="rounded-[24px] bg-white border border-[#0F7B4F]/15 shadow-sm p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold text-[#121714]">
            Reset Password
          </h1>
          <p className="text-sm sm:text-base text-[#3C4740] mt-1 mb-5">
            Enter your registered mobile number and the 6-digit Store Recovery
            Code given when you registered your store.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-2xl bg-[#D93829]/10 border border-[#D93829]/25 px-4 py-3 text-sm font-semibold text-[#B42318]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="fp-phone"
                className="block text-base font-bold text-[#121714] mb-1.5"
              >
                Phone Number
              </label>
              <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] overflow-hidden">
                <span className="inline-flex items-center gap-1.5 px-4 bg-[#EBF3EE] text-[#0F7B4F] font-bold text-base border-r border-[#121714]/15 shrink-0">
                  <Phone className="w-4 h-4" aria-hidden="true" />
                  <span>+91</span>
                </span>
                <input
                  id="fp-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phoneNumber}
                  onChange={(e) =>
                    setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  placeholder="98765 43210"
                  className="w-full min-h-[54px] px-4 bg-transparent text-lg font-semibold text-[#121714] focus:outline-none tabular-nums"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="fp-code"
                className="block text-base font-bold text-[#121714] mb-1.5"
              >
                6-Digit Store Recovery Code
              </label>
              <div className="flex items-center rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] px-4">
                <KeyRound className="w-5 h-5 text-[#0F7B4F] shrink-0" aria-hidden="true" />
                <input
                  id="fp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={recoveryCode}
                  onChange={(e) =>
                    setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="123456"
                  className="w-full min-h-[54px] px-3 bg-transparent text-lg font-bold tracking-widest text-[#121714] focus:outline-none tabular-nums"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="fp-password"
                className="block text-base font-bold text-[#121714] mb-1.5"
              >
                New Password
              </label>
              <div className="flex items-stretch rounded-2xl border border-[#121714]/20 bg-[#FAF8F3] focus-within:ring-2 focus-within:ring-[#0F7B4F] overflow-hidden">
                <span className="inline-flex items-center pl-4 text-[#3C4740]" aria-hidden="true">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="fp-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[54px] px-3 bg-transparent text-lg font-medium text-[#121714] focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="min-h-[54px] min-w-[52px] px-3 flex items-center justify-center text-[#3C4740]"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[56px] px-6 rounded-full bg-[#0F7B4F] text-white font-bold text-lg flex items-center justify-center gap-2 hover:bg-[#0C6641] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>{loading ? 'Updating...' : 'Update Password'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
