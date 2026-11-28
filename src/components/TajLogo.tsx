/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NH_POS_LOGO_DATA_URI } from '../assets/nhPosLogoData';

interface TajLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const TajLogo: React.FC<TajLogoProps> = ({
  className = '',
  size = 'md'
}) => {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-32 h-32'
  };

  return (
    <div
      role="img"
      aria-label="NH POS Shop"
      className={`relative flex items-center justify-center shrink-0 ${sizeMap[size]} ${className}`}
    >
      <img
        src={NH_POS_LOGO_DATA_URI}
        alt=""
        decoding="sync"
        className="w-full h-full object-contain rounded-full shadow-xs select-none"
      />
    </div>
  );
};
