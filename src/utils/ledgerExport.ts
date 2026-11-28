/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-contained History Ledger Exporter (JPG, Real Binary PDF, & WhatsApp Share)
 * Zero external dependencies — works offline, on Android Chrome, PWAs, and Desktop.
 */

export interface LedgerExportEntry {
  description: string;
  date: string;
  by?: string;
  type: 'in' | 'out' | 'opening' | string;
  amount: number;
  amountLabel?: string;
  amountTone?: 'emerald' | 'rose' | 'blue' | 'slate';
}

export interface LedgerExportPayload {
  shopName: string;
  shopPhone?: string;
  partyTypeLabel: string; // e.g. 'Customer' | 'Wholesaler'
  partyName: string;
  partyPhone?: string;
  invoiceNumber?: string;
  address?: string;
  extraMeta?: string;
  totalGivenLabel: string; // e.g. 'Total Diya' | 'Total Bill'
  totalReceivedLabel: string; // e.g. 'Wapas Mila' | 'Ada Kiya'
  remainingLabel: string; // e.g. 'Baqi Lena Hai' | 'Baqi Dena Hai'
  totalGiven: number;
  totalReceived: number;
  remaining: number;
  entries: LedgerExportEntry[];
}

function sanitizeFilePart(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'Ledger'
  );
}

function getTodayTag(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        const rest = words.slice(i).join(' ');
        let trimmed = rest;
        while (trimmed.length > 3 && ctx.measureText(trimmed + '...').width > maxWidth) {
          trimmed = trimmed.slice(0, -1);
        }
        lines.push(trimmed === rest ? rest : `${trimmed}...`);
        return lines;
      }
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Renders a crisp high-resolution (2x) History Ledger card onto an HTMLCanvasElement.
 */
function renderLedgerToCanvas(data: LedgerExportPayload): HTMLCanvasElement {
  const scale = 2;
  const logicalWidth = 760;
  const padX = 40;
  const contentWidth = logicalWidth - padX * 2;
  const entries = data.entries.length > 0 ? data.entries : [];
  const rowHeight = 68;
  const headerHeight = 148;
  const metaExtraHeight =
    data.partyPhone || data.invoiceNumber || data.address || data.extraMeta ? 34 : 0;
  const summaryHeight = 112;
  const listHeaderHeight = 42;
  const listBodyHeight = Math.max(1, entries.length) * rowHeight + 16;
  const footerHeight = 64;
  const logicalHeight =
    headerHeight + metaExtraHeight + summaryHeight + listHeaderHeight + listBodyHeight + footerHeight + 36;

  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);

  // Clean white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // Top Header Gradient Banner
  const headerGrad = ctx.createLinearGradient(0, 0, logicalWidth, headerHeight);
  headerGrad.addColorStop(0, '#0f172a');
  headerGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, logicalWidth, headerHeight);

  // Accent Emerald Strip at top
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, 0, logicalWidth, 6);

  // Shop Name & Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(data.shopName || 'NH POS Shop', padX, 48);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const generatedStr = new Date().toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  ctx.textAlign = 'right';
  ctx.fillText(`Generated: ${generatedStr}`, logicalWidth - padX, 44);

  // Party Name Banner inside Header
  ctx.textAlign = 'left';
  ctx.fillStyle = '#34d399';
  ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${data.partyTypeLabel.toUpperCase()} HISTORY LEDGER`, padX, 86);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(data.partyName, padX, 120);

  let y = headerHeight + 20;

  // Optional Party Meta Row (Phone / Invoice / Address / Schedule)
  if (metaExtraHeight > 0) {
    const metaParts: string[] = [];
    if (data.partyPhone) metaParts.push(`Phone: ${data.partyPhone}`);
    if (data.invoiceNumber) metaParts.push(`Inv: ${data.invoiceNumber}`);
    if (data.address) metaParts.push(`Address: ${data.address}`);
    if (data.extraMeta) metaParts.push(data.extraMeta);
    ctx.fillStyle = '#475569';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(metaParts.join('   |   ').slice(0, 95), padX, y + 12);
    y += metaExtraHeight;
  }

  // 3-Column Summary Box (Total Diya | Wapas Mila | Baqi Lena Hai)
  drawRoundedRect(ctx, padX, y, contentWidth, 88, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  const colW = contentWidth / 3;
  const summaryCols = [
    { label: data.totalGivenLabel, value: `Rs. ${data.totalGiven.toLocaleString()}`, color: '#0f172a' },
    { label: data.totalReceivedLabel, value: `Rs. ${data.totalReceived.toLocaleString()}`, color: '#047857' },
    { label: data.remainingLabel, value: `Rs. ${data.remaining.toLocaleString()}`, color: '#e11d48' }
  ];

  summaryCols.forEach((col, idx) => {
    const cx = padX + colW * idx + colW / 2;
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(padX + colW * idx, y + 16);
      ctx.lineTo(padX + colW * idx, y + 72);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(col.label, cx, y + 32);

    ctx.fillStyle = col.color;
    ctx.font = '800 22px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(col.value, cx, y + 64);
  });

  y += summaryHeight;

  // Ledger Section Heading
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`TRANSACTION HISTORY (${entries.length})`, padX, y + 14);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('AMOUNT', logicalWidth - padX, y + 14);

  y += 26;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(logicalWidth - padX, y);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  y += 12;

  // Transaction Rows
  if (entries.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('No transaction history recorded yet.', logicalWidth / 2, y + 36);
    y += rowHeight;
  } else {
    entries.forEach((entry, idx) => {
      if (idx % 2 === 1) {
        drawRoundedRect(ctx, padX - 8, y, contentWidth + 16, rowHeight - 4, 10);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
      }

      // Description (wrapped cleanly)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const descLines = wrapTextLines(ctx, entry.description, contentWidth - 205, 2);
      ctx.fillText(descLines[0], padX, y + 23);
      if (descLines[1]) {
        ctx.fillText(descLines[1], padX, y + 40);
      }

      // Date & Created By
      ctx.fillStyle = '#64748b';
      ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const metaText = entry.by ? `${entry.date}  |  By: ${entry.by}` : entry.date;
      ctx.fillText(metaText, padX, descLines[1] ? y + 57 : y + 45);

      // Amount Pill / Label on Right
      ctx.textAlign = 'right';
      const isOpeningZero = entry.amount === 0 || entry.type === 'opening';
      if (entry.amountLabel) {
        const toneColorMap: Record<string, string> = {
          emerald: '#059669',
          rose: '#e11d48',
          blue: '#2563eb',
          slate: '#475569'
        };
        ctx.fillStyle = toneColorMap[entry.amountTone || (isOpeningZero ? 'slate' : 'rose')] || '#475569';
        ctx.font =
          entry.amountTone === 'slate' || isOpeningZero
            ? '700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
            : '800 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(entry.amountLabel, logicalWidth - padX, y + 36);
      } else if (isOpeningZero) {
        ctx.fillStyle = '#475569';
        ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(`Rs. ${entry.amount.toLocaleString()} (Opening)`, logicalWidth - padX, y + 36);
      } else if (entry.type === 'in') {
        ctx.fillStyle = '#059669';
        ctx.font = '800 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(`Received: - Rs. ${entry.amount.toLocaleString()}`, logicalWidth - padX, y + 36);
      } else {
        ctx.fillStyle = '#e11d48';
        ctx.font = '800 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.fillText(`Given: + Rs. ${entry.amount.toLocaleString()}`, logicalWidth - padX, y + 36);
      }

      // Subtle bottom divider
      ctx.beginPath();
      ctx.moveTo(padX, y + rowHeight - 2);
      ctx.lineTo(logicalWidth - padX, y + rowHeight - 2);
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.stroke();

      y += rowHeight;
    });
  }

  // Footer
  y += 18;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(logicalWidth - padX, y);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${data.shopName || 'NH POS Shop'} • Digital Khata Statement`, logicalWidth / 2, y + 26);

  return canvas;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array<ArrayBuffer> {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Builds a valid single-page PDF 1.4 Blob containing the high-resolution JPEG canvas image.
 */
function buildSinglePagePdfFromJpeg(
  jpegBytes: Uint8Array,
  imgWidth: number,
  imgHeight: number
): Blob {
  const encoder = new TextEncoder();
  const pageWidthPt = 595.28; // Standard A4 width in PDF points
  const pageHeightPt = Math.max(360, Number(((imgHeight / imgWidth) * pageWidthPt).toFixed(2)));

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0]; // Object 0 is free

  const pushStr = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    offset += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Obj 1: Catalog
  offsets.push(offset);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  offsets.push(offset);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Obj 3: Page
  offsets.push(offset);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // Obj 4: JPEG Image XObject
  offsets.push(offset);
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  // Obj 5: Content Stream
  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets.push(offset);
  pushStr(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  // Cross-reference table
  const xrefOffset = offset;
  pushStr(`xref\n0 ${offsets.length}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    merged.set(c, pos);
    pos += c.length;
  }

  return new Blob([merged], { type: 'application/pdf' });
}

export function downloadLedgerAsJpg(data: LedgerExportPayload): void {
  const canvas = renderLedgerToCanvas(data);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
  const bytes = dataUrlToUint8Array(dataUrl);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const filename = `${data.partyTypeLabel}_History_${sanitizeFilePart(data.partyName)}_${getTodayTag()}.jpg`;
  triggerBlobDownload(blob, filename);
}

export function downloadLedgerAsPdf(data: LedgerExportPayload): void {
  const canvas = renderLedgerToCanvas(data);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const jpegBytes = dataUrlToUint8Array(dataUrl);
  const pdfBlob = buildSinglePagePdfFromJpeg(jpegBytes, canvas.width, canvas.height);
  const filename = `${data.partyTypeLabel}_History_${sanitizeFilePart(data.partyName)}_${getTodayTag()}.pdf`;
  triggerBlobDownload(pdfBlob, filename);
}

function formatWhatsAppPhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('03') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  }
  return digits.length >= 10 ? digits : '';
}

export function buildLedgerWhatsAppText(data: LedgerExportPayload): string {
  const lines: string[] = [];
  lines.push(`*${data.shopName || 'NH POS Shop'}*`);
  lines.push(`*${data.partyTypeLabel} History Ledger: ${data.partyName}*`);
  if (data.partyPhone) lines.push(`Phone: ${data.partyPhone}`);
  if (data.invoiceNumber) lines.push(`Invoice: ${data.invoiceNumber}`);
  if (data.extraMeta) lines.push(data.extraMeta);
  lines.push('------------------------');
  lines.push(`${data.totalGivenLabel}: *Rs. ${data.totalGiven.toLocaleString()}*`);
  lines.push(`${data.totalReceivedLabel}: *Rs. ${data.totalReceived.toLocaleString()}*`);
  lines.push(`${data.remainingLabel}: *Rs. ${data.remaining.toLocaleString()}*`);
  lines.push('------------------------');

  if (data.entries.length > 0) {
    lines.push('*Details:*');
    data.entries.slice(0, 25).forEach((entry, idx) => {
      const amtText = entry.amountLabel
        ? entry.amountLabel
        : entry.amount === 0 || entry.type === 'opening'
        ? `Rs. ${entry.amount.toLocaleString()} (Opening)`
        : entry.type === 'in'
        ? `Received -Rs. ${entry.amount.toLocaleString()}`
        : `Given +Rs. ${entry.amount.toLocaleString()}`;
      lines.push(`${idx + 1}. ${entry.date} | ${entry.description} (${amtText})`);
    });
    if (data.entries.length > 25) {
      lines.push(`...and ${data.entries.length - 25} more entries`);
    }
  }

  return lines.join('\n');
}

export async function shareLedgerOnWhatsApp(data: LedgerExportPayload): Promise<'shared_file' | 'opened_whatsapp'> {
  const summaryText = buildLedgerWhatsAppText(data);

  // Copy text summary to clipboard silently as a convenient backup
  try {
    await navigator.clipboard?.writeText(summaryText);
  } catch {}

  // On mobile devices supporting Web Share with image files, share the crisp JPG statement directly!
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      const canvas = renderLedgerToCanvas(data);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const bytes = dataUrlToUint8Array(dataUrl);
      const filename = `${data.partyTypeLabel}_History_${sanitizeFilePart(data.partyName)}_${getTodayTag()}.jpg`;
      const jpgFile = new File([bytes], filename, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [jpgFile] })) {
        await navigator.share({
          title: `${data.partyName} - History Ledger`,
          text: summaryText,
          files: [jpgFile]
        });
        return 'shared_file';
      }
    }
  } catch (err: any) {
    // If user explicitly cancelled the native share sheet, stop here cleanly
    if (err?.name === 'AbortError') {
      return 'shared_file';
    }
  }

  // Fallback: Open WhatsApp directly via a clean anchor link (no window.open)
  const cleanPhone = formatWhatsAppPhone(data.partyPhone);
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(summaryText)}`
    : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;

  const link = document.createElement('a');
  link.href = waUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
  }, 500);

  return 'opened_whatsapp';
}
