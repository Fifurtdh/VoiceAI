import React from 'react';

interface AuthLogoProps {
  variant?: 'dark-text' | 'light-text';
}

/**
 * Voice Khata brand mark for Authentication pages (white & green kirana palette).
 */
export const AuthLogo: React.FC<AuthLogoProps> = ({ variant = 'dark-text' }) => {
  const isLight = variant === 'light-text';

  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className={`w-12 h-12 rounded-2xl bg-[#0F7B4F] text-white flex items-center justify-center shrink-0 ${
          isLight ? 'shadow-lg ring-1 ring-white/25' : 'shadow-sm'
        }`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>
      <div className="text-left">
        <span
          className={`block text-2xl font-extrabold tracking-tight leading-none ${
            isLight ? 'text-white drop-shadow-sm' : 'text-[#121714]'
          }`}
        >
          Voice Khata
        </span>
        <span
          className={`block text-xs font-medium mt-1 ${
            isLight ? 'text-white/85' : 'text-[#3C4740]'
          }`}
        >
          Simple Shop Credit Book
        </span>
      </div>
    </div>
  );
};
