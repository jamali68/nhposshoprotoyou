/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Crown } from 'lucide-react';

interface TajLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const TajLogo: React.FC<TajLogoProps> = ({ size = 'md', showSubtitle = false }) => {
  const sizeClasses =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl'
      : size === 'lg'
      ? 'w-16 h-16 rounded-2xl'
      : 'w-12 h-12 rounded-2xl';

  const iconSizes =
    size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';

  return (
    <div className="inline-flex flex-col items-center">
      <div
        className={`${sizeClasses} bg-gradient-to-br from-[#1b263b] via-slate-800 to-[#0d1b2a] border-2 border-amber-400/70 shadow-lg flex items-center justify-center relative overflow-hidden`}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-emerald-400/10" />
        <Crown className={`${iconSizes} text-amber-400 drop-shadow-xs relative z-10`} />
      </div>
      {showSubtitle && (
        <span className="text-[10px] font-bold text-amber-600 mt-1 tracking-wider uppercase">
          NH POS Shop
        </span>
      )}
    </div>
  );
};
