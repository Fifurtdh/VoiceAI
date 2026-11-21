import React from 'react';

/**
 * Voice Khata brand mark for Authentication pages (white & green kirana palette).
 */
export const AuthLogo: React.FC = () => {
  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className="w-12 h-12 rounded-2xl bg-[#0F7B4F] text-white flex items-center justify-center shadow-sm shrink-0"
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
        <span className="block text-2xl font-extrabold tracking-tight text-[#121714] leading-none">
          Voice Khata
        </span>
        <span className="block text-xs font-medium text-[#3C4740] mt-1">
          Simple Shop Credit Book
        </span>
      </div>
    </div>
  );
};
