import React from 'react';
import type { VoiceOrbState } from '../types/khata';

interface VoiceOrbProps {
  state: VoiceOrbState;
  /** Normalized mic volume 0..1 when listening */
  volume?: number;
}

/**
 * Lightweight CSS-only iridescent voice orb (blue, purple, lime, pink gradients)
 * matching the jewel-like rim and deep obsidian core of the visual reference.
 * Animates only transform and opacity for smooth 60fps performance on low-end Android phones.
 */
export const VoiceOrb: React.FC<VoiceOrbProps> = ({ state, volume = 0 }) => {
  const listeningScale = state === 'listening' ? 1 + Math.min(0.18, volume * 0.22) : 1;

  const stateClass =
    state === 'thinking'
      ? 'animate-orb-think'
      : state === 'speaking'
      ? 'animate-orb-speak'
      : state === 'idle'
      ? 'animate-orb-idle'
      : '';

  return (
    <div
      data-testid="voice-orb"
      data-orb-state={state}
      className="relative flex items-center justify-center w-56 h-56 sm:w-64 sm:h-64 mx-auto select-none"
      aria-hidden="true"
    >
      {/* Subtle outer ambient halo */}
      <div
        className="absolute inset-4 rounded-full opacity-35 blur-2xl transition-transform duration-150"
        style={{
          background:
            'radial-gradient(circle at 65% 65%, #3B82F6 0%, #B8A4F5 38%, #C8F03C 72%, #F5B3D0 100%)',
          transform: `scale(${listeningScale * 1.05})`,
        }}
      />

      {/* Crisp glassy outer rim */}
      <div
        className={`relative w-48 h-48 sm:w-56 sm:h-56 rounded-full p-[3px] transition-transform duration-100 ${stateClass}`}
        style={{
          transform: state === 'listening' ? `scale(${listeningScale})` : undefined,
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.75) 0%, rgba(184,164,245,0.45) 35%, rgba(96,165,250,0.65) 65%, rgba(200,240,60,0.5) 100%)',
          boxShadow:
            '0 0 36px rgba(96, 165, 250, 0.24), inset 0 0 20px rgba(255, 255, 255, 0.28)',
        }}
      >
        {/* Deep obsidian core with layered iridescent crescent arcs */}
        <div
          className="relative w-full h-full rounded-full overflow-hidden"
          style={{
            background: '#050609',
          }}
        >
          {/* Electric blue & violet bottom-right arc */}
          <div
            className="absolute -inset-2 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 76% 74%, rgba(59, 130, 246, 0.92) 0%, rgba(168, 85, 247, 0.55) 28%, transparent 56%)',
            }}
          />
          {/* Soft pink & lime bottom-left caustic */}
          <div
            className="absolute -inset-2 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 28% 72%, rgba(245, 179, 208, 0.78) 0%, rgba(200, 240, 60, 0.35) 24%, transparent 52%)',
            }}
          />
          {/* Crisp top-left pearlescent rim highlight */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 26% 22%, rgba(255, 255, 255, 0.55) 0%, rgba(200, 240, 60, 0.14) 18%, transparent 45%)',
            }}
          />
          {/* Deep dark pupil center so the iridescent arcs read cleanly */}
          <div
            className="absolute inset-5 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 48% 46%, rgba(5, 6, 9, 0.96) 24%, rgba(5, 6, 9, 0.55) 58%, transparent 82%)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
