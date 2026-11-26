/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useLayoutEffect, useRef, useState } from 'react';

/**
 * Strips commas and non-numeric characters while keeping clean digits and an optional single decimal point.
 */
export function sanitizeAmountInput(raw: string, allowDecimal = true): string {
  if (!raw) return '';
  let cleaned = raw.replace(/,/g, '').replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');

  if (allowDecimal) {
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
  }

  // Strip unnecessary leading zeros (e.g. "01000" -> "1000") while keeping "0" and "0.xxx"
  if (cleaned.length > 1 && cleaned.startsWith('0') && cleaned[1] !== '.') {
    cleaned = cleaned.replace(/^0+/, '') || '0';
  }

  return cleaned;
}

/**
 * Formats a raw numeric string/number with live thousands commas (e.g. "10000" -> "10,000", "10230.5" -> "10,230.5").
 */
export function formatAmountWithCommas(value: string | number | null | undefined, allowDecimal = true): string {
  if (value === null || value === undefined || value === '') return '';
  const str = sanitizeAmountInput(String(value), allowDecimal);
  if (!str) return '';

  const dotIdx = str.indexOf('.');
  if (dotIdx !== -1) {
    const intPart = str.slice(0, dotIdx);
    const decPart = str.slice(dotIdx + 1);
    const formattedInt = intPart ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0';
    return `${formattedInt}.${decPart}`;
  }

  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface AmountInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string | number | null | undefined;
  onValueChange: (rawValue: string) => void;
  allowDecimal?: boolean;
}

/**
 * Reusable numeric amount input with live thousands-comma formatting (10,000 / 50,000 / 76,234),
 * mobile decimal keyboard (inputMode="decimal"), smart caret preservation, and raw numeric output.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onValueChange, allowDecimal = true, inputMode, onBlur, onFocus, ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const pendingCaretDigitCountRef = useRef<number | null>(null);
    const [focusedDraft, setFocusedDraft] = useState<string | null>(null);

    const setRefs = (el: HTMLInputElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === 'function') {
        forwardedRef(el);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      }
    };

    const propRaw =
      value === null || value === undefined || value === ''
        ? ''
        : sanitizeAmountInput(String(value), allowDecimal);

    // Keep trailing decimal draft (e.g. "100." or "100.0") intact while typing even when parent stores a number
    const useDraft =
      focusedDraft !== null &&
      ((focusedDraft === '' && (propRaw === '' || propRaw === '0')) ||
        (focusedDraft !== '' &&
          propRaw !== '' &&
          !Number.isNaN(Number(focusedDraft)) &&
          !Number.isNaN(Number(propRaw)) &&
          Number(focusedDraft) === Number(propRaw)));

    const effectiveRaw = useDraft ? focusedDraft : propRaw;
    const formattedValue = formatAmountWithCommas(effectiveRaw, allowDecimal);

    useLayoutEffect(() => {
      const targetDigitCount = pendingCaretDigitCountRef.current;
      const el = innerRef.current;
      if (targetDigitCount === null || !el || document.activeElement !== el) return;
      pendingCaretDigitCountRef.current = null;

      let digitsSeen = 0;
      let caretPos = formattedValue.length;
      for (let i = 0; i < formattedValue.length; i++) {
        if (digitsSeen >= targetDigitCount) {
          caretPos = i;
          break;
        }
        if (formattedValue[i] !== ',') {
          digitsSeen++;
        }
      }
      if (digitsSeen >= targetDigitCount && targetDigitCount === 0) {
        caretPos = 0;
      }

      try {
        el.setSelectionRange(caretPos, caretPos);
      } catch {
        // Ignore on unsupported input environments
      }
    }, [formattedValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.target;
      const typed = inputEl.value;
      const selectionStart = inputEl.selectionStart ?? typed.length;

      // Count meaningful characters (digits / decimal) to the left of the cursor
      let digitsBeforeCursor = 0;
      for (let i = 0; i < selectionStart; i++) {
        const ch = typed[i];
        if ((ch >= '0' && ch <= '9') || (allowDecimal && ch === '.')) {
          digitsBeforeCursor++;
        }
      }

      let nextRaw = sanitizeAmountInput(typed, allowDecimal);

      // Handle pressing Backspace directly on a comma (e.g. "10,|000" -> remove the digit right before the comma)
      if (
        typed.length === formattedValue.length - 1 &&
        nextRaw === effectiveRaw &&
        digitsBeforeCursor > 0
      ) {
        nextRaw = sanitizeAmountInput(
          nextRaw.slice(0, digitsBeforeCursor - 1) + nextRaw.slice(digitsBeforeCursor),
          allowDecimal
        );
        digitsBeforeCursor = Math.max(0, digitsBeforeCursor - 1);
      }

      pendingCaretDigitCountRef.current = digitsBeforeCursor;
      setFocusedDraft(nextRaw);
      onValueChange(nextRaw);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocusedDraft(propRaw);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocusedDraft(null);
      onBlur?.(e);
    };

    return (
      <input
        {...rest}
        ref={setRefs}
        type="text"
        inputMode={inputMode ?? (allowDecimal ? 'decimal' : 'numeric')}
        autoComplete="off"
        value={formattedValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  }
);

AmountInput.displayName = 'AmountInput';
