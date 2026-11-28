/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sticky Page Header with 50% Compact Frosted-Glass Morph on Scroll.
 * Keeps the Back button and Page Title permanently visible right beneath the top app navbar.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

interface StickyPageHeaderProps {
  title: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
}

export const StickyPageHeader: React.FC<StickyPageHeaderProps> = ({
  title,
  onBack,
  rightSlot
}) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState<number>(60);
  const [isStuck, setIsStuck] = useState<boolean>(false);

  useEffect(() => {
    const getAppHeader = () => document.querySelector('header');

    const measureHeaderHeight = (): number => {
      const headerEl = getAppHeader();
      if (!headerEl) return 60;
      const h = Math.round(headerEl.getBoundingClientRect().height);
      return h > 20 ? h + 4 : 60;
    };

    const updateTop = () => {
      setStickyTop(measureHeaderHeight());
    };

    updateTop();

    let resizeObserver: ResizeObserver | null = null;
    const headerEl = getAppHeader();
    if (headerEl && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateTop();
      });
      resizeObserver.observe(headerEl);
    }

    const handleScrollOrResize = () => {
      const topOffset = measureHeaderHeight();
      setStickyTop(prev => (prev === topOffset ? prev : topOffset));

      if (window.scrollY <= 4) {
        setIsStuck(false);
        return;
      }

      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      const sentinelTop = sentinel.getBoundingClientRect().top;

      // Hysteresis band prevents any flicker right at the transition threshold
      setIsStuck(prev => {
        if (!prev && sentinelTop <= topOffset - 2) return true;
        if (prev && sentinelTop > topOffset + 4) return false;
        return prev;
      });
    };

    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <>
      {/* Zero-height scroll sentinel placed directly above the sticky bar */}
      <div
        ref={sentinelRef}
        className="!m-0 h-0 w-full pointer-events-none"
        aria-hidden="true"
      />

      {/* Sticky Title Bar — Full size at top, smoothly shrinks ~50% with frosted glass when scrolled */}
      <div
        style={{ top: `${stickyTop}px` }}
        className={`sticky z-[15] !mt-0 flex items-center justify-between gap-2 transition-all duration-200 ease-out ${
          isStuck
            ? 'bg-white/88 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-200/90 shadow-md shadow-slate-900/10 ring-1 ring-slate-900/5'
            : 'bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs'
        }`}
      >
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center shrink-0 bg-[#2c3e50] hover:bg-slate-700 text-white font-bold transition-all duration-200 cursor-pointer active:scale-95 ${
            isStuck
              ? 'gap-1 px-2.5 py-1 rounded-lg text-[11px] shadow-xs'
              : 'gap-1.5 px-3 py-1.5 rounded-xl text-xs'
          }`}
        >
          <ArrowLeft className={isStuck ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          <span>Back</span>
        </button>

        <h2
          className={`font-black text-slate-800 text-center tracking-tight truncate transition-all duration-200 ${
            isStuck ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
          }`}
        >
          {title}
        </h2>

        {rightSlot ? (
          <div className="shrink-0 flex items-center">{rightSlot}</div>
        ) : (
          <div className="w-8 shrink-0" />
        )}
      </div>
    </>
  );
};
