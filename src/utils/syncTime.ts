/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function formatTime12h(dateInput?: Date | string | null): string {
  if (!dateInput) return 'Just now';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return 'Just now';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

export function formatRelativeTime(dateInput?: Date | string | null): string {
  if (!dateInput) return 'ابھی ابھی (Just now)';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return 'ابھی ابھی (Just now)';

  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 15) return 'ابھی ابھی (Just now)';
  if (diffSec < 60) return `${diffSec} سیکنڈ پہلے (${diffSec}s ago)`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} منٹ پہلے (${diffMin}m ago)`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} گھنٹے پہلے (${diffHr}h ago)`;

  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} دن پہلے (${diffDays}d ago)`;
}
