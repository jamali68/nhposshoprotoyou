/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface TajLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const TajLogo: React.FC<TajLogoProps> = ({ size = 'md', showSubtitle = false }) => {
  const sizeClasses =
    size === 'sm'
      ? 'w-10 h-10 rounded-full'
      : size === 'lg'
      ? 'w-20 h-20 rounded-full'
      : 'w-14 h-14 rounded-full';

  return (
    <div className="inline-flex flex-col items-center shrink-0">
      <div
        className={`${sizeClasses} bg-[#FAF8EC] border-2 border-emerald-600/30 shadow-md flex items-center justify-center relative overflow-hidden`}
      >
        <img
          src="./icon-512.png"
          alt="NH POS Official Logo"
          className="w-full h-full object-contain"
        />
      </div>
      {showSubtitle && (
        <span className="text-[10px] font-bold text-emerald-700 mt-1 tracking-wider uppercase">
          NH POS Shop
        </span>
      )}
    </div>
  );
};
