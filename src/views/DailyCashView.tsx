/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Truck,
  Users,
  Smartphone,
  Save,
  Edit2,
  Trash2,
  Share2,
  Calendar,
  Lock,
  Unlock,
  AlertCircle,
  History,
  Briefcase,
  TrendingUp,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  PlusCircle,
  MinusCircle,
  Sparkles
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { DailyTransaction } from '../types/pos';
import { HistoryModal } from '../components/HistoryModal';
import { ReportModal } from '../components/ReportModal';
import { DateNavigator } from '../components/DateNavigator';
import { showAppAlert } from '../components/AppDialogHost';
import { AmountInput } from '../components/AmountInput';
import { superAdminService } from '../superadmin/superAdminService';

export const DailyCashView: React.FC = () => {
  const {
    filterDate,
    setFilterDate,
    yesterdayDate,
    currentUser,
    currentShop,
    systemSettings,
    setSystemSettings,
    dailyTransactions,
    addDailyTransaction,
    updateDailyTransaction,
    deleteDailyTransaction,
    transferBetweenCashAccounts,
    saveEasyloadPurchase,
    getShopCashStats,
    getYesterdayClosingCash,
    setActiveView,
    goBack,
    registerBackHandler
  } = usePOS();

  // Privacy state for Total Shop Cash box (Hidden by default)
  const [isTotalHidden, setIsTotalHidden] = useState<boolean>(true);
  // Collapsible state for Shift Closing & Sale Report (Collapsed by default)
  const [isShiftClosingExpanded, setIsShiftClosingExpanded] = useState<boolean>(false);
  // Multi-Shift Cash Handover Mode:
  // 'separate'   -> Each shift enters only its own separate/new cash counted (Shift 1 + Shift 2 = Total Shop Cash)
  // 'cumulative' -> 2nd shift counts the FULL drawer including Shift 1's leftover cash (Last shift cash = Final Drawer)
  const [shiftClosingMode, setShiftClosingMode] = useState<'separate' | 'cumulative'>(() => {
    try {
      const saved = localStorage.getItem('nhpos_shift_closing_mode');
      if (saved === 'cumulative' || saved === 'separate') return saved;
    } catch {}
    return 'separate';
  });
  const updateShiftClosingMode = (mode: 'separate' | 'cumulative') => {
    setShiftClosingMode(mode);
    try {
      localStorage.setItem('nhpos_shift_closing_mode', mode);
    } catch {}
  };

  // Real-time Admin -> Staff Lock/Unlock Permissions
  const [, setPermTick] = useState(0);
  useEffect(() => {
    const onPermChange = () => setPermTick(t => t + 1);
    window.addEventListener('taj_module_control_updated', onPermChange);
    return () => window.removeEventListener('taj_module_control_updated', onPermChange);
  }, []);

  const effectiveShopId = currentShop?.id || currentUser?.shopId;
  const userWithShop = currentUser ? { ...currentUser, shopId: effectiveShopId } : null;
  const isStoreAdmin = Boolean(
    currentUser?.isGoogleUser || currentUser?.role === 'admin' || currentUser?.role === 'super_admin'
  );
  const canAddEntry = isStoreAdmin || superAdminService.isActionUnlockedForUser('allowAddEntry', userWithShop);
  const canEditEntry = isStoreAdmin || superAdminService.isActionUnlockedForUser('allowEditEntry', userWithShop);
  const canDeleteEntry = isStoreAdmin || superAdminService.isActionUnlockedForUser('allowDeleteEntry', userWithShop);
  const canViewDeletedLogs =
    isStoreAdmin || superAdminService.isModuleUnlockedForUser('deleted_history', userWithShop).unlocked;

  // New Transaction Form State
  const [entryType, setEntryType] = useState<'out' | 'in' | 'opening' | 'from_back_cash' | 'to_back_cash' | 'shift_closing'>('out');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const formCardRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const focusScrollTimersRef = useRef<number[]>([]);
  const [isFormFocused, setIsFormFocused] = useState<boolean>(false);

  const clearFocusScrollTimers = () => {
    focusScrollTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    focusScrollTimersRef.current = [];
  };

  // Focus Amount input immediately (inside user gesture so mobile keyboard opens)
  // and smoothly center it directly above the virtual keyboard.
  const focusAndCenterAmountInput = () => {
    clearFocusScrollTimers();

    const centerAmount = () => {
      const el = amountInputRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    };

    const focusInput = () => {
      const el = amountInputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    };

    focusInput();

    window.requestAnimationFrame(() => {
      if (document.activeElement !== amountInputRef.current) {
        focusInput();
      }
      centerAmount();
    });

    // Re-focus if triggered from native mobile <select> dismissal and re-center after keyboard/layout settle
    const t1 = window.setTimeout(() => {
      if (document.activeElement !== amountInputRef.current) {
        focusInput();
      }
      centerAmount();
    }, 100);
    const t2 = window.setTimeout(centerAmount, 300);
    const t3 = window.setTimeout(centerAmount, 480);

    focusScrollTimersRef.current = [t1, t2, t3];
  };

  useEffect(() => {
    return () => clearFocusScrollTimers();
  }, []);

  // Handle mobile keyboard open/close so Amount box, form and Save button remain comfortably in view
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const initialHeight = vv.height;
    const handleViewportResize = () => {
      if (vv.height < initialHeight - 100 && document.activeElement === amountInputRef.current) {
        // Keyboard opened while Amount input is active: center Amount right above keyboard
        window.requestAnimationFrame(() => {
          amountInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        });
      } else if (vv.height >= initialHeight - 60 && isFormFocused) {
        // When keyboard is dismissed (viewport height expands), keep the active form in full view
        setTimeout(() => {
          formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    };

    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, [isFormFocused]);

  // Easyload Purchase Form State
  const [showLoadForm, setShowLoadForm] = useState<boolean>(false);
  const [loadNetwork, setLoadNetwork] = useState<'jazz' | 'telenor' | 'zong' | 'ufone'>('jazz');
  const [loadAmount, setLoadAmount] = useState<string>('');
  const [loadNote, setLoadNote] = useState<string>('');

  // Edit Modal State
  const [editId, setEditId] = useState<string | null>(null);
  const [editType, setEditType] = useState<string>('out');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');

  // Sub-Modals
  const [selectedHisTxId, setSelectedHisTxId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Auto-Detect Missed Yesterday Closing Smart Prompt Modal State
  const [showYesterdayClosingPrompt, setShowYesterdayClosingPrompt] = useState<boolean>(false);
  const [pendingOpeningAmount, setPendingOpeningAmount] = useState<number>(0);
  const [pendingOpeningDesc, setPendingOpeningDesc] = useState<string>('');
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Hardware back closes delete confirm modal first
  useEffect(() => {
    if (!deleteConfirmId) return;
    return registerBackHandler(() => {
      setDeleteConfirmId(null);
      return true;
    });
  }, [deleteConfirmId, registerBackHandler]);

  // Hardware back closes edit modal first
  useEffect(() => {
    if (!editId) return;
    return registerBackHandler(() => {
      setEditId(null);
      return true;
    });
  }, [editId, registerBackHandler]);

  // Hardware back closes history sub-modal first
  useEffect(() => {
    if (!selectedHisTxId) return;
    return registerBackHandler(() => {
      setSelectedHisTxId(null);
      return true;
    });
  }, [selectedHisTxId, registerBackHandler]);

  // Hardware back closes report modal first
  useEffect(() => {
    if (!showReportModal) return;
    return registerBackHandler(() => {
      setShowReportModal(false);
      return true;
    });
  }, [showReportModal, registerBackHandler]);

  // Hardware back closes yesterday closing prompt first
  useEffect(() => {
    if (!showYesterdayClosingPrompt) return;
    return registerBackHandler(() => {
      setShowYesterdayClosingPrompt(false);
      return true;
    });
  }, [showYesterdayClosingPrompt, registerBackHandler]);

  const stats = getShopCashStats(filterDate);
  const yesterdayBal = getYesterdayClosingCash(filterDate);
  const filteredList = dailyTransactions.filter(t => t.transaction_date === filterDate);

  const getTxTimestamp = (tx: { id?: string; created_at?: string }) => {
    if (tx.created_at) {
      const t = Date.parse(tx.created_at);
      if (!isNaN(t) && t > 0) return t;
    }
    if (tx.id) {
      const parts = tx.id.split('-');
      if (parts.length >= 2) {
        const ts = parseInt(parts[1], 10);
        if (!isNaN(ts) && ts > 1500000000000) {
          return ts;
        }
      }
    }
    return 0;
  };

  const getTransactionTime = (tx: { created_at?: string; id?: string; extra_fields?: any }) => {
    if (tx.extra_fields?.shift_time) {
      return tx.extra_fields.shift_time;
    }
    if (tx.created_at) {
      try {
        const d = new Date(tx.created_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      } catch {}
    }
    if (tx.id) {
      const parts = tx.id.split('-');
      if (parts.length >= 2) {
        const ts = parseInt(parts[1], 10);
        if (!isNaN(ts) && ts > 1500000000000) {
          const d = new Date(ts);
          if (!isNaN(d.getTime())) {
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          }
        }
      }
    }
    return '';
  };

  const sortedFilteredList = useMemo(() => {
    return [...filteredList].sort((a, b) => {
      const timeA = getTxTimestamp(a);
      const timeB = getTxTimestamp(b);
      if (timeA !== 0 && timeB !== 0 && timeA !== timeB) {
        return timeB - timeA; // Newest entry on top, 1st entry at very bottom
      }
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [filteredList]);

  const effectiveOpening = stats.opening > 0 ? stats.opening : yesterdayBal;
  const totalOutPurchases = stats.cashOut;

  // Check if yesterday had activity and is missing shift closing (Single User vs Multi-Shift)
  const yesterdayMissingClosingInfo = useMemo(() => {
    const yTxs = dailyTransactions.filter(t => t.transaction_date === yesterdayDate);
    if (yTxs.length === 0) {
      return {
        isMissing: false,
        count: 0,
        morningClosing: null,
        morningUser: null,
        yesterdayOperators: [],
        isSingleShiftDay: true,
        targetYesterdayUser: currentUser?.name || (currentUser?.role === 'admin' ? 'Admin' : 'Staff')
      };
    }

    const yShiftTxs = yTxs.filter(t => t.type === 'shift_closing');
    const hasNightClosing = yShiftTxs.some(t => {
      const desc = (t.description || '').toLowerCase();
      const shiftTime = (t.extra_fields?.shift_time || '').toLowerCase();
      return desc.includes('night') || desc.includes('raat') || shiftTime.includes('night') || shiftTime.includes('raat');
    });

    const isMissing = yShiftTxs.length === 0 || (!hasNightClosing && yShiftTxs.length < 2);
    const morningClosing = yShiftTxs.length > 0 ? yShiftTxs[0].amount : null;
    const morningUser = yShiftTxs.length > 0 ? (yShiftTxs[0].created_by_name || (yShiftTxs[0].created_by === 'admin' ? 'Admin' : 'Staff')) : null;

    // Detect unique users who operated or logged transactions yesterday
    const yOperators = Array.from(new Set(
      yTxs.map(t => t.created_by_name || (t.created_by === 'admin' ? 'Admin' : 'Staff')).filter(Boolean)
    ));
    const isSingleShiftDay = yShiftTxs.length === 0;
    const targetYesterdayUser = isSingleShiftDay
      ? (yOperators[0] || currentUser?.name || (currentUser?.role === 'admin' ? 'Admin' : 'Staff'))
      : (currentUser?.name || (currentUser?.role === 'admin' ? 'Admin' : 'Staff'));

    return {
      isMissing,
      count: yShiftTxs.length,
      morningClosing,
      morningUser,
      yesterdayOperators: yOperators,
      isSingleShiftDay,
      targetYesterdayUser
    };
  }, [dailyTransactions, yesterdayDate, currentUser]);

  // Transfers between Shop Cash and Back Cash for current filterDate
  const backCashTransfers = useMemo(() => {
    const txs = dailyTransactions.filter(t => t.transaction_date === filterDate);
    const fromBack = txs
      .filter(t => t.transfer_direction === 'from_back_cash' || (t.type === 'in' && t.description?.includes('Back Cash')))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const toBack = txs
      .filter(t => t.transfer_direction === 'to_back_cash' || (t.type === 'out' && t.description?.includes('Back Cash')))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const net = fromBack - toBack;
    return {
      fromBack,
      toBack,
      net,
      hasTransfers: fromBack > 0 || toBack > 0
    };
  }, [dailyTransactions, filterDate]);

  // Pure Shift Closing & Net Sale calculator with chronological per-shift purchase attribution
  const computeShiftClosing = (
    shiftTxsInput: DailyTransaction[],
    outTxsInput: DailyTransaction[],
    openingAmount: number,
    mode: 'separate' | 'cumulative'
  ) => {
    const sortedShifts = [...shiftTxsInput].sort((a, b) => {
      const ta = getTxTimestamp(a);
      const tb = getTxTimestamp(b);
      if (ta !== 0 && tb !== 0 && ta !== tb) return ta - tb;
      return (a.id || '').localeCompare(b.id || '');
    });

    const sortedOuts = [...outTxsInput].sort((a, b) => {
      const ta = getTxTimestamp(a);
      const tb = getTxTimestamp(b);
      if (ta !== 0 && tb !== 0 && ta !== tb) return ta - tb;
      return (a.id || '').localeCompare(b.id || '');
    });

    const normalizeUserKey = (role?: string, name?: string) => {
      const r = (role || 'user').trim().toLowerCase();
      const n = (name || (r === 'admin' ? 'Admin' : r) || 'Staff').trim().toLowerCase();
      return `${r}___${n}`;
    };

    type RawShift = {
      shiftIndex: number;
      key: string;
      userId: string;
      userName: string;
      role: string;
      totalCash: number;
      firstTs: number;
      endTs: number;
      entries: DailyTransaction[];
      outEntries: DailyTransaction[];
      shiftPurchases: number;
    };

    // Group consecutive shift_closing entries by the same operator into chronological shifts
    const rawShifts: RawShift[] = [];
    sortedShifts.forEach(t => {
      const uId = t.created_by || 'user';
      const uName = t.created_by_name || (t.created_by === 'admin' ? 'Admin' : t.created_by) || 'Staff';
      const key = normalizeUserKey(uId, uName);
      const ts = getTxTimestamp(t);
      const last = rawShifts[rawShifts.length - 1];

      if (last && last.key === key) {
        last.totalCash += Number(t.amount) || 0;
        last.entries.push(t);
        if (ts > 0 && (last.firstTs === 0 || ts < last.firstTs)) last.firstTs = ts;
        if (ts > last.endTs) last.endTs = ts;
      } else {
        rawShifts.push({
          shiftIndex: rawShifts.length,
          key,
          userId: uId,
          userName: uName,
          role: (t.created_by || 'user').toUpperCase(),
          totalCash: Number(t.amount) || 0,
          firstTs: ts,
          endTs: ts,
          entries: [t],
          outEntries: [],
          shiftPurchases: 0
        });
      }
    });

    // Attribute each Cash Out / Purchase transaction strictly to the shift window in which it occurred
    let unclosedShiftPurchases = 0;
    if (rawShifts.length === 1) {
      const onlyShift = rawShifts[0];
      sortedOuts.forEach(outTx => {
        const outTs = getTxTimestamp(outTx);
        const outKey = normalizeUserKey(outTx.created_by, outTx.created_by_name);
        const isAfterClosingByDifferentUser =
          onlyShift.endTs > 0 &&
          outTs > onlyShift.endTs &&
          outKey !== onlyShift.key;

        if (isAfterClosingByDifferentUser) {
          // A 2nd shift user has already started purchasing after Shift 1 closed, before logging Shift 2 closing
          unclosedShiftPurchases += Number(outTx.amount) || 0;
        } else {
          onlyShift.outEntries.push(outTx);
          onlyShift.shiftPurchases += Number(outTx.amount) || 0;
        }
      });
    } else if (rawShifts.length > 1) {
      const hasShiftTimestamps = rawShifts.some(s => s.endTs > 0);
      sortedOuts.forEach(outTx => {
        const outTs = getTxTimestamp(outTx);
        let targetIdx = -1;

        if (outTs > 0 && hasShiftTimestamps) {
          for (let i = 0; i < rawShifts.length; i++) {
            if (rawShifts[i].endTs > 0 && outTs <= rawShifts[i].endTs) {
              targetIdx = i;
              break;
            }
          }
          if (targetIdx === -1) {
            targetIdx = rawShifts.length - 1;
          }
        } else {
          const outKey = normalizeUserKey(outTx.created_by, outTx.created_by_name);
          const byUser = rawShifts.findIndex(s => s.key === outKey);
          targetIdx = byUser >= 0 ? byUser : 0;
        }

        rawShifts[targetIdx].outEntries.push(outTx);
        rawShifts[targetIdx].shiftPurchases += Number(outTx.amount) || 0;
      });
    }

    const userGroups = rawShifts.map((shift, idx) => {
      let startingCash = 0;
      let remainingBase = 0;
      let shiftSale = 0;

      if (idx === 0) {
        startingCash = openingAmount;
        remainingBase = openingAmount - shift.shiftPurchases;
        shiftSale = (shift.totalCash + shift.shiftPurchases) - openingAmount;
      } else if (mode === 'cumulative') {
        const prevClosingCash = rawShifts[idx - 1].totalCash;
        startingCash = prevClosingCash;
        remainingBase = prevClosingCash - shift.shiftPurchases;
        shiftSale = (shift.totalCash + shift.shiftPurchases) - prevClosingCash;
      } else {
        // 'separate' mode: Shift 1's closing cash is already accounted for; Shift 2+ counts only its own new cash
        startingCash = 0;
        remainingBase = -shift.shiftPurchases;
        shiftSale = shift.totalCash + shift.shiftPurchases;
      }

      return {
        ...shift,
        startingCash,
        remainingBase,
        shiftSale
      };
    });

    const totalClosingCash =
      userGroups.length === 0
        ? 0
        : mode === 'cumulative' && userGroups.length > 1
        ? userGroups[userGroups.length - 1].totalCash
        : sortedShifts.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const netSale = userGroups.reduce((sum, g) => sum + g.shiftSale, 0);
    const differenceFromOpening = totalClosingCash - openingAmount;

    const entryShiftMap = new Map<string, (typeof userGroups)[number]>();
    userGroups.forEach(group => {
      group.entries.forEach(e => {
        entryShiftMap.set(e.id, group);
      });
    });

    return {
      entries: sortedShifts,
      totalClosingCash,
      netSale,
      differenceFromOpening,
      hasShiftClosing: sortedShifts.length > 0,
      unclosedShiftPurchases,
      userGroups,
      entryShiftMap
    };
  };

  // Shift Closing & Net Sale calculation and multi-user shift breakdown
  const shiftClosingAnalysis = useMemo(() => {
    const dayShiftTxs = dailyTransactions.filter(
      t => t.transaction_date === filterDate && t.type.toLowerCase() === 'shift_closing'
    );
    const dayOutTxs = dailyTransactions.filter(
      t => t.transaction_date === filterDate && t.type.toLowerCase() === 'out'
    );
    return computeShiftClosing(dayShiftTxs, dayOutTxs, effectiveOpening, shiftClosingMode);
  }, [dailyTransactions, filterDate, effectiveOpening, shiftClosingMode]);

  // Auto-fill description when opening, shift_closing or transfer is selected
  const handleTypeChange = (newType: 'out' | 'in' | 'opening' | 'from_back_cash' | 'to_back_cash' | 'shift_closing') => {
    setEntryType(newType);
    const uName = currentUser?.name || currentUser?.username || (currentUser?.role === 'admin' ? 'Admin' : 'Staff');
    if (newType === 'opening' && (!description || description === '')) {
      setDescription('Subha Ka Opening Cash ⭐');
    } else if (newType === 'shift_closing') {
      setIsShiftClosingExpanded(true);
      setDescription(`${uName} Shift Closing Cash (گنتی)`);
    } else if (newType === 'from_back_cash' && (!description || description === '' || description === 'Subha Ka Opening Cash ⭐' || description === 'Back Cash ko Cash Diya (Counter Out)' || description.includes('Shift Closing'))) {
      setDescription('Back Cash se Cash Liya (Counter In)');
    } else if (newType === 'to_back_cash' && (!description || description === '' || description === 'Subha Ka Opening Cash ⭐' || description === 'Back Cash se Cash Liya (Counter In)' || description.includes('Shift Closing'))) {
      setDescription('Back Cash ko Cash Diya (Counter Out)');
    } else if (description === 'Subha Ka Opening Cash ⭐' || description === 'Back Cash se Cash Liya (Counter In)' || description === 'Back Cash ko Cash Diya (Counter Out)' || description.includes('Shift Closing')) {
      setDescription('');
    }
    focusAndCenterAmountInput();
  };

  const handleSubmitNewEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddEntry) {
      showAppAlert('🔒 ایڈمن کی جانب سے نئی انٹری شامل کرنا لاک (Locked) ہے۔');
      return;
    }
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      showAppAlert('Please enter a valid amount!');
      return;
    }

    if (entryType === 'from_back_cash') {
      transferBetweenCashAccounts({
        from: 'back',
        to: 'shop',
        amount: val,
        note: description.trim(),
        transaction_date: filterDate
      });
    } else if (entryType === 'to_back_cash') {
      transferBetweenCashAccounts({
        from: 'shop',
        to: 'back',
        amount: val,
        note: description.trim(),
        transaction_date: filterDate
      });
    } else if (entryType === 'shift_closing') {
      const uName = currentUser?.name || currentUser?.username || (currentUser?.role === 'admin' ? 'Admin' : 'Staff');
      const nowIso = new Date().toISOString();
      const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dayShiftTxs = dailyTransactions.filter(
        t => t.transaction_date === filterDate && t.type.toLowerCase() === 'shift_closing'
      );
      const dayOutTxs = dailyTransactions.filter(
        t => t.transaction_date === filterDate && t.type.toLowerCase() === 'out'
      );
      const simEntry: DailyTransaction = {
        id: `dt-${Date.now()}-sim`,
        type: 'shift_closing',
        amount: val,
        description: description.trim() || `${uName} Shift Closing Balance`,
        transaction_date: filterDate,
        created_by: currentUser?.role || 'user',
        created_by_name: uName,
        created_at: nowIso
      };
      const simResult = computeShiftClosing([...dayShiftTxs, simEntry], dayOutTxs, effectiveOpening, shiftClosingMode);
      const simShift = simResult.userGroups[simResult.userGroups.length - 1];

      addDailyTransaction({
        type: 'shift_closing',
        amount: val,
        description: description.trim() || `${uName} Shift Closing Balance`,
        transaction_date: filterDate,
        created_at: nowIso,
        created_by_name: uName,
        extra_fields: {
          shift_time: nowTime,
          user_name: uName,
          opening_cash: simShift ? simShift.startingCash : effectiveOpening,
          out_purchases: simShift ? simShift.shiftPurchases : totalOutPurchases,
          calculated_sale: simShift ? simShift.shiftSale : (val + totalOutPurchases) - effectiveOpening
        }
      });
      setIsShiftClosingExpanded(true);
    } else if (entryType === 'opening') {
      if (yesterdayMissingClosingInfo.isMissing) {
        setPendingOpeningAmount(val);
        setPendingOpeningDesc(description.trim() || 'Today Opening Cash ⭐');
        setShowYesterdayClosingPrompt(true);
        return;
      }
      addDailyTransaction({
        type: 'opening',
        amount: val,
        description: description.trim() || 'Today Opening Cash ⭐',
        transaction_date: filterDate
      });
    } else {
      addDailyTransaction({
        type: entryType,
        amount: val,
        description: description.trim() || (entryType === 'in' ? 'Cash Add (+)' : 'Cash Out (-)'),
        transaction_date: filterDate
      });
    }

    setAmount('');
    setDescription('');
  };

  // Smart Prompt Actions: Confirm both Today Opening Cash and Yesterday Shift Closing (User-Attributed)
  const handleConfirmYesterdayClosingAndOpening = () => {
    const val = pendingOpeningAmount;
    const desc = pendingOpeningDesc || 'Today Opening Cash ⭐';
    if (val <= 0) return;

    // 1. Save Today Opening Cash
    addDailyTransaction({
      type: 'opening',
      amount: val,
      description: desc,
      transaction_date: filterDate,
      created_at: new Date().toISOString()
    });

    // 2. Compute yesterday stats to log accurate figures
    const yStats = getShopCashStats(yesterdayDate);
    const yOpening = yStats.opening > 0 ? yStats.opening : getYesterdayClosingCash(yesterdayDate);
    const yOut = yStats.cashOut;
    const ySale = (val + yOut) - yOpening;

    // Attribution: identify if this is a Single User Full Day Shop or a Multi-Shift Shop
    const { isSingleShiftDay, targetYesterdayUser } = yesterdayMissingClosingInfo;
    const uName = targetYesterdayUser || currentUser?.name || (currentUser?.role === 'admin' ? 'Admin' : 'Staff');
    const closingDesc = isSingleShiftDay
      ? `${uName} - Full Day Shift Closing (مکمل دن کی کلوزنگ و سیل)`
      : `${uName} - 2nd Shift Closing Balance (دوسری شفٹ کلوزنگ)`;
    const shiftTime = isSingleShiftDay ? 'Full Day Shift (1 User)' : 'Night / 2nd Shift';

    // 3. Save Yesterday Shift Closing with 100% accurate user attribution
    addDailyTransaction({
      type: 'shift_closing',
      amount: val,
      description: closingDesc,
      transaction_date: yesterdayDate,
      created_at: `${yesterdayDate}T23:59:59.000Z`,
      created_by_name: uName,
      extra_fields: {
        shift_time: shiftTime,
        user_name: uName,
        opening_cash: yOpening,
        out_purchases: yOut,
        calculated_sale: ySale
      }
    });

    setAmount('');
    setDescription('');
    setShowYesterdayClosingPrompt(false);
    setPendingOpeningAmount(0);
    setPendingOpeningDesc('');

    const toastMsg = isSingleShiftDay
      ? `✅ Today Opening Cash (Rs. ${val.toLocaleString()}) save ho gaya aur Kal (${yesterdayDate}) ki Full Day Sale (Rs. ${ySale.toLocaleString()}) 100% ${uName} ke naam par darj ho gayi!`
      : `✅ Today Opening Cash (Rs. ${val.toLocaleString()}) save ho gaya aur Kal (${yesterdayDate}) ki 2nd Shift Closing aur Sale (Rs. ${ySale.toLocaleString()}) ${uName} ke account mein darj ho gayi!`;

    setToastNotification(toastMsg);
    setTimeout(() => setToastNotification(null), 6500);
  };

  // Smart Prompt Action: Save Only Today Opening Cash without modifying yesterday
  const handleSaveOnlyTodayOpening = () => {
    const val = pendingOpeningAmount;
    const desc = pendingOpeningDesc || 'Today Opening Cash ⭐';
    if (val <= 0) return;

    addDailyTransaction({
      type: 'opening',
      amount: val,
      description: desc,
      transaction_date: filterDate,
      created_at: new Date().toISOString()
    });

    setAmount('');
    setDescription('');
    setShowYesterdayClosingPrompt(false);
    setPendingOpeningAmount(0);
    setPendingOpeningDesc('');

    setToastNotification(`✅ Today Opening Cash (Rs. ${val.toLocaleString()}) save ho gaya.`);
    setTimeout(() => setToastNotification(null), 4000);
  };

  const handleEasyloadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(loadAmount);
    if (isNaN(val) || val <= 0) {
      showAppAlert('Please enter purchase amount!');
      return;
    }

    saveEasyloadPurchase(loadNetwork, val, loadNote);
    setLoadAmount('');
    setLoadNote('');
    setShowLoadForm(false);
  };

  const openEditModal = (t: typeof dailyTransactions[0]) => {
    if (!canEditEntry) {
      showAppAlert('🔒 ایڈمن کی جانب سے انٹری ایڈٹ کرنا لاک (Locked) ہے۔');
      return;
    }
    setEditId(t.id);
    setEditType(t.type);
    setEditAmount(t.amount.toString());
    setEditDesc(t.description);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    if (!canEditEntry) {
      showAppAlert('🔒 ایڈمن کی جانب سے انٹری ایڈٹ کرنا لاک (Locked) ہے۔');
      return;
    }
    const val = parseFloat(editAmount);
    if (isNaN(val) || val <= 0) return;

    updateDailyTransaction(editId, val, editDesc, editType);
    setEditId(null);
  };

  const handleDelete = (id: string) => {
    if (!canDeleteEntry) {
      showAppAlert('🔒 ایڈمن کی جانب سے انٹری ڈیلیٹ کرنا لاک (Locked) ہے۔');
      return;
    }
    setDeleteConfirmId(id);
  };

  const confirmDeleteTransaction = () => {
    if (!deleteConfirmId) return;
    deleteDailyTransaction(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  const toggleUserDeletePerm = async () => {
    if (!isStoreAdmin) return;
    const nextVal = !systemSettings.user_can_delete;
    setSystemSettings(prev => ({
      ...prev,
      user_can_delete: nextVal
    }));
    if (effectiveShopId) {
      const cfg = superAdminService.getShopStaffPermissions(effectiveShopId);
      cfg.rolePermissions.manager.actions.allowDeleteEntry = nextVal;
      cfg.rolePermissions.cashier.actions.allowDeleteEntry = nextVal;
      cfg.rolePermissions.salesman.actions.allowDeleteEntry = nextVal;
      Object.keys(cfg.userOverrides || {}).forEach(uKey => {
        if (cfg.userOverrides[uKey]?.actions) {
          delete (cfg.userOverrides[uKey].actions as any).allowDeleteEntry;
        }
      });
      cfg.updatedBy = currentUser?.name || currentUser?.username || 'Admin';
      await superAdminService.saveShopStaffPermissions(effectiveShopId, cfg);
    }
  };

  const loadValNum = parseFloat(loadAmount) || 0;
  const loadSimBalance = loadValNum > 0 ? loadValNum + loadValNum * 0.024 : 0;

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2c3e50] hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-base sm:text-lg font-black text-slate-800 text-center tracking-tight">
          Daily Cash Book
        </h2>

        {canViewDeletedLogs ? (
          <button
            type="button"
            onClick={() => setActiveView('deleted_history')}
            title="Deleted Audit Logs"
            className="text-lg p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            📜
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* Toast Notification Alert */}
      {toastNotification && (
        <div className="bg-emerald-600 text-white text-xs font-bold p-3 sm:p-3.5 rounded-2xl shadow-md flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span>✨</span>
            <span>{toastNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotification(null)}
            className="text-white/80 hover:text-white p-1 text-sm font-black"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Delete Permission Box */}
      {isStoreAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            {systemSettings.user_can_delete ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-rose-600" />}
            <span>User Delete Permission: </span>
            <span className={systemSettings.user_can_delete ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}>
              {systemSettings.user_can_delete ? 'ALLOWED' : 'LOCKED'}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleUserDeletePerm}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Fast Shortcut Buttons for Wholesaler & Customer */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setActiveView('wholesaler')}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-[#ea580c] hover:bg-orange-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
        >
          <Truck className="w-4 h-4" />
          <span>WHOLESALER</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('customer')}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
        >
          <Users className="w-4 h-4" />
          <span>CUSTOMERS</span>
        </button>
      </div>

      {/* Easyload Purchase Toggle Button */}
      <button
        type="button"
        onClick={() => setShowLoadForm(prev => !prev)}
        className="w-full py-3 px-4 bg-[#2c3e50] hover:bg-slate-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
      >
        <Smartphone className="w-4 h-4 text-amber-400" />
        <span>Easy Load Purchase Form (+)</span>
      </button>

      {/* Collapsible Easyload Purchase Form */}
      {showLoadForm && (
        <div className="bg-[#fffaf5] border-l-4 border-[#e67e22] rounded-2xl p-4 shadow-sm space-y-3 animate-in fade-in duration-200">
          <h3 className="font-extrabold text-sm text-[#d35400] flex items-center justify-center gap-1.5">
            <Smartphone className="w-4 h-4" />
            <span>Easy Load Purchase (Stock Added)</span>
          </h3>

          <form onSubmit={handleEasyloadSubmit} className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Select Network</label>
              <select
                value={loadNetwork}
                onChange={e => setLoadNetwork(e.target.value as any)}
                className="w-full p-2.5 bg-white border border-[#e67e22] rounded-xl font-bold focus:outline-none"
              >
                <option value="jazz">⭐ JAZZ (2.4%)</option>
                <option value="telenor">🔹 TELENOR (2.4%)</option>
                <option value="zong">🟢 ZONG (2.4%)</option>
                <option value="ufone">🔸 UFONE (2.4%)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Purchase Amount (Paid from Cash Counter)</label>
              <AmountInput
                value={loadAmount}
                onValueChange={setLoadAmount}
                placeholder="e.g. 5,000"
                required
                className="w-full p-2.5 bg-white border border-[#e67e22] rounded-xl font-bold focus:outline-none"
              />
            </div>

            {/* Live commission status */}
            {loadValNum > 0 && (
              <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-800 font-bold text-center text-xs border border-emerald-200">
                Cash Out: Rs. {loadValNum.toLocaleString()} | Sim Balance Credited: Rs. {loadSimBalance.toLocaleString()}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Note (Optional)</label>
              <input
                type="text"
                name="load_note"
                list="nh-note-suggestions"
                autoComplete="on"
                value={loadNote}
                onChange={e => setLoadNote(e.target.value)}
                placeholder="e.g. Paid from Cash Counter / Dealer Name"
                className="w-full p-2.5 bg-white border border-[#e67e22] rounded-xl focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#d35400] hover:bg-orange-700 text-white font-bold rounded-xl shadow-md transition-colors"
            >
              Record Load Purchase
            </button>
          </form>
        </div>
      )}

      {/* Date Filter */}
      <DateNavigator
        value={filterDate}
        onChange={setFilterDate}
        accentColor="emerald"
      />

      {/* Main Green Shop Cash Banner */}
      <div className="bg-[#27ae60] text-white p-5 rounded-2xl text-center shadow-md relative isolate transform-gpu">
        <button
          type="button"
          onClick={() => setIsTotalHidden(prev => !prev)}
          title={isTotalHidden ? 'Show Total Shop Cash' : 'Hide Total Shop Cash'}
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white transition-colors cursor-pointer"
        >
          {isTotalHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        <h2
          onClick={() => setIsTotalHidden(prev => !prev)}
          className="text-3xl font-black tracking-tight font-mono cursor-pointer select-none"
        >
          {isTotalHidden ? 'Rs. ****' : `Rs. ${stats.balance.toLocaleString()}`}
        </h2>
        <p className="text-xs font-bold uppercase tracking-wider opacity-90 mt-1">
          TOTAL SHOP CASH ({new Date(filterDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
        </p>

        {/* 3 Metrics Grid below Banner */}
        <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-2 gap-2 text-xs text-left bg-white text-slate-800 p-3 rounded-xl shadow-xs">
          <div className="border-r border-dashed border-slate-200 pr-2">
            <small className="text-[#2980b9] font-bold block text-[10px] uppercase">Today Opening Cash</small>
            <b className="text-sm">Rs. {stats.opening.toLocaleString()}</b>
          </div>
          <div>
            <small className="text-[#e67e22] font-bold block text-[10px] uppercase">Cash Added (In)</small>
            <b className="text-sm text-emerald-600">Rs. {stats.cashIn.toLocaleString()}</b>
          </div>
          <div className="col-span-2 border-t border-dashed border-slate-200 pt-2 mt-1 flex justify-between items-center text-[11px]">
            <span className="text-slate-500 font-semibold">Yesterday Closing Cash:</span>
            <span className="font-bold font-mono">Rs. {yesterdayBal.toLocaleString()}</span>
          </div>
        </div>

        {/* Back Cash Transfer / Leen Deen Record (بیک کیش لین دین ریکارڈ) */}
        {backCashTransfers.hasTransfers && (
          <div className="mt-3 text-left bg-black/25 border border-white/20 rounded-xl p-2.5 text-xs text-white">
            <div className="flex items-center justify-between gap-1.5 mb-1.5 pb-1 border-b border-white/15">
              <span className="font-bold flex items-center gap-1.5 text-white/95 text-[11px]">
                <span className="text-amber-300 text-sm">🔁</span>
                <span>Back Cash لین دین (Transfer Record):</span>
              </span>
              <span
                className={`font-mono font-black text-[11px] px-2 py-0.5 rounded-md border ${
                  backCashTransfers.net === 0
                    ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                    : backCashTransfers.net > 0
                    ? 'bg-blue-500/30 text-blue-200 border-blue-400/40'
                    : 'bg-amber-500/30 text-amber-200 border-amber-400/40'
                }`}
              >
                {backCashTransfers.net === 0
                  ? 'Net: Rs. 0 (برابر / صاف)'
                  : backCashTransfers.net > 0
                  ? `Net: +Rs. ${backCashTransfers.net.toLocaleString()} (بیک کیش سے آیا)`
                  : `Net: -Rs. ${Math.abs(backCashTransfers.net).toLocaleString()} (بیک کیش کو دیا)`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
              <div className="bg-white/10 rounded-lg py-1 px-1.5 border border-white/5">
                <span className="text-blue-200 block font-semibold truncate">بیک کیش سے آیا (+)</span>
                <span className="font-mono font-bold text-white text-[12px]">
                  Rs. {backCashTransfers.fromBack.toLocaleString()}
                </span>
              </div>
              <div className="bg-white/10 rounded-lg py-1 px-1.5 border border-white/5">
                <span className="text-amber-200 block font-semibold truncate">بیک کیش کو دیا (-)</span>
                <span className="font-mono font-bold text-white text-[12px]">
                  Rs. {backCashTransfers.toBack.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Shift Closing & Sale Summary Card (شفٹ کلوزنگ اور مجموعی سیل ریکارڈ) - Touch to Expand */}
      <div className="bg-gradient-to-r from-[#1e1b4b] via-indigo-950 to-[#312e81] text-white rounded-2xl border border-indigo-500/30 shadow-md overflow-hidden transition-all">
        {/* Clickable Slim Header (Touch to Expand / Collapse) */}
        <button
          type="button"
          onClick={() => setIsShiftClosingExpanded(prev => !prev)}
          className="w-full text-left p-3 sm:p-3.5 flex items-center justify-between gap-2 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-indigo-100 truncate">
              Shift Closing &amp; Sale Report {shiftClosingAnalysis.hasShiftClosing ? `(${shiftClosingAnalysis.entries.length} بار کیش درج ہوا)` : '(شفٹ کلوزنگ)'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono font-black text-xs sm:text-sm text-emerald-400">
              Rs. {shiftClosingAnalysis.netSale.toLocaleString()}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-indigo-300 transition-transform duration-200 ${
                isShiftClosingExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* Expanded Content */}
        {isShiftClosingExpanded && (
          <div className="px-3.5 pb-3.5 pt-2 border-t border-white/10 animate-in fade-in duration-200 space-y-3">
            {shiftClosingAnalysis.hasShiftClosing ? (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-500/30 rounded-xl text-lg">💼</span>
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                        <span>Shift Closing &amp; Sale Report</span>
                        <span className="text-[10px] font-bold text-indigo-300">({shiftClosingAnalysis.entries.length} بار کیش درج ہوا)</span>
                      </h4>
                      <p className="text-[10px] text-indigo-200">
                        شفٹ کلوزنگ کیش گنتی اور خالص سیل کا خودکار حساب
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-indigo-200 block font-bold">Total Shift Sale (مجموعی سیل)</span>
                    <span className="font-mono font-black text-sm sm:text-base text-emerald-400">
                      Rs. {shiftClosingAnalysis.netSale.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="bg-white/10 rounded-xl py-1.5 px-2 border border-white/5">
                    <span className="text-indigo-200 block font-semibold truncate">اوپننگ کیش</span>
                    <span className="font-mono font-bold text-white text-xs">
                      Rs. {effectiveOpening.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-white/10 rounded-xl py-1.5 px-2 border border-white/5">
                    <span className="text-rose-300 block font-semibold truncate">کل خرچ / پرچیز (-)</span>
                    <span className="font-mono font-bold text-rose-200 text-xs">
                      Rs. {totalOutPurchases.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-white/10 rounded-xl py-1.5 px-2 border border-white/5">
                    <span className="text-amber-300 block font-semibold truncate">
                      {shiftClosingMode === 'cumulative' && shiftClosingAnalysis.userGroups.length > 1
                        ? 'آخری دراز گنتی کیش'
                        : 'کل کلوزنگ گنتی کیش'}
                    </span>
                    <span className="font-mono font-bold text-white text-xs">
                      Rs. {shiftClosingAnalysis.totalClosingCash.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Multi-Shift Handover Mode Toggle (Only shown when 2+ Staff Shifts exist) */}
                {shiftClosingAnalysis.userGroups.length > 1 && (
                  <div className="bg-white/10 rounded-xl p-2 border border-indigo-400/30 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-indigo-200">
                        دوسری شفٹ کیش گنتی کا طریقہ (Handover Mode):
                      </span>
                      <div className="grid grid-cols-2 gap-1 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => updateShiftClosingMode('separate')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                            shiftClosingMode === 'separate'
                              ? 'bg-emerald-500 text-white shadow-xs'
                              : 'bg-white/10 text-indigo-200 hover:bg-white/20'
                          }`}
                        >
                          الگ شفٹ کیش (Separate)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateShiftClosingMode('cumulative')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                            shiftClosingMode === 'cumulative'
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'bg-white/10 text-indigo-200 hover:bg-white/20'
                          }`}
                        >
                          مکمل دراز کیش (Handover)
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-indigo-200/90 leading-snug">
                      {shiftClosingMode === 'separate'
                        ? 'الگ شفٹ کیش: ہر شفٹ نے صرف اپنا نیا/الگ کیش درج کیا ہے (پچھلی شفٹ کا کیش دوبارہ نہیں گنا گیا)۔'
                        : 'مکمل دراز کیش: دوسری شفٹ کی گنتی میں پچھلی شفٹ کا چھوڑا گیا کیش (بقایا اوپننگ + پہلی شفٹ کی سیل) بھی شامل ہے، اس لیے دوسری شفٹ کی سیل پچھلی شفٹ کا کیش نکال کر حساب ہو رہی ہے۔'}
                    </p>
                  </div>
                )}

                {shiftClosingAnalysis.unclosedShiftPurchases > 0 && (
                  <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl px-2.5 py-2 text-[10px] text-amber-100 leading-snug">
                    ⏳ پہلی شفٹ بند ہونے کے بعد <b>Rs. {shiftClosingAnalysis.unclosedShiftPurchases.toLocaleString()}</b> کی خریداری دوسرے یوزر نے کی ہے — یہ پہلی شفٹ میں شامل نہیں کی گئی، دوسری شفٹ کلوز ہونے پر اس میں خودکار شامل ہو جائے گی۔
                  </div>
                )}

                {/* User-wise Shift Breakdown - Dynamic Single-User vs Multi-User Support */}
                {shiftClosingAnalysis.userGroups.length > 0 && (
                  <div className="bg-black/25 rounded-xl p-2.5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-200 border-b border-white/10 pb-1">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-300" />
                        <span>
                          {shiftClosingAnalysis.userGroups.length === 1
                            ? 'مکمل دن کا یوزر ریکارڈ (Single User Full Day Shop):'
                            : 'یوزر وار شفٹ کلوزنگ اور سیل (Multi-User Shifts):'}
                        </span>
                      </span>
                      <span className="text-[10px] text-indigo-300 font-mono">
                        {shiftClosingAnalysis.userGroups.length === 1 ? '⭐ 1 User (Solo Operator)' : `${shiftClosingAnalysis.userGroups.length} Staff Shifts`}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {shiftClosingAnalysis.userGroups.map((u, idx) => {
                        const isSolo = shiftClosingAnalysis.userGroups.length === 1;
                        const uSale = u.shiftSale;
                        const isCumulativeMismatch =
                          idx > 0 && shiftClosingMode === 'cumulative' && uSale < 0;

                        return (
                          <div key={`${u.key}-${idx}`} className="bg-white/5 rounded-lg p-2.5 text-xs space-y-2 border border-white/5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-indigo-500/40 text-indigo-200 font-black text-[10px] flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-white text-sm">{u.userName}</span>
                                    <span className="text-[9px] text-indigo-300 px-1.5 py-0.2 rounded bg-indigo-500/20 uppercase font-mono">
                                      {u.role}
                                    </span>
                                    {isSolo && (
                                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold border border-emerald-500/30">
                                        100% Full Day Sale &amp; Profit (مکمل دن کا منافع و سیل)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-300 mt-1 flex flex-wrap gap-1">
                                    {u.entries.map((e, eIdx) => (
                                      <span key={e.id} className="font-mono text-white/90 bg-white/10 px-1.5 py-0.5 rounded">
                                        Rs. {e.amount.toLocaleString()} {e.extra_fields?.shift_time ? `(${e.extra_fields.shift_time})` : ''}
                                        {eIdx < u.entries.length - 1 ? ' +' : ''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 sm:text-right shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-white/10">
                                <div>
                                  <span className="text-[9px] text-indigo-300 block">
                                    {idx > 0 && shiftClosingMode === 'cumulative' ? 'مکمل دراز کیش' : 'گنتی کیش'}
                                  </span>
                                  <span className="font-mono font-bold text-white text-xs">
                                    Rs. {u.totalCash.toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-emerald-300 block">
                                    {isSolo ? 'کل سیل (100% یوزر سیل)' : 'شفٹ کی اصل سیل'}
                                  </span>
                                  <span className={`font-mono font-black text-xs ${uSale >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    Rs. {uSale.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Transparent Per-Shift Accounting Formula Strip */}
                            <div className="bg-black/25 rounded-lg px-2 py-1.5 text-[10px] text-indigo-100/90 flex flex-wrap items-center gap-x-2.5 gap-y-1 border border-white/5 font-mono">
                              {idx === 0 ? (
                                <>
                                  <span>اوپننگ: <b>Rs. {u.startingCash.toLocaleString()}</b></span>
                                  <span className="text-rose-300">شفٹ پرچیز: <b>-Rs. {u.shiftPurchases.toLocaleString()}</b></span>
                                  <span className="text-amber-300">بقایا اوپننگ: <b>Rs. {u.remainingBase.toLocaleString()}</b></span>
                                  <span className="text-emerald-300">
                                    حساب: {u.totalCash.toLocaleString()} {u.remainingBase >= 0 ? `- ${u.remainingBase.toLocaleString()}` : `+ ${Math.abs(u.remainingBase).toLocaleString()}`} = <b>Rs. {uSale.toLocaleString()}</b>
                                  </span>
                                </>
                              ) : shiftClosingMode === 'cumulative' ? (
                                <>
                                  <span>پچھلی شفٹ ہینڈ اوور: <b>Rs. {u.startingCash.toLocaleString()}</b></span>
                                  <span className="text-rose-300">شفٹ پرچیز: <b>-Rs. {u.shiftPurchases.toLocaleString()}</b></span>
                                  <span className="text-amber-300">بقایا ہینڈ اوور: <b>Rs. {u.remainingBase.toLocaleString()}</b></span>
                                  <span className={uSale >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                    حساب: {u.totalCash.toLocaleString()} {u.remainingBase >= 0 ? `- ${u.remainingBase.toLocaleString()}` : `+ ${Math.abs(u.remainingBase).toLocaleString()}`} = <b>Rs. {uSale.toLocaleString()}</b>
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-indigo-200">الگ شفٹ کیش: <b>Rs. {u.totalCash.toLocaleString()}</b></span>
                                  <span className="text-rose-300">شفٹ پرچیز: <b>+Rs. {u.shiftPurchases.toLocaleString()}</b></span>
                                  <span className="text-emerald-300">
                                    حساب: {u.totalCash.toLocaleString()} + {u.shiftPurchases.toLocaleString()} = <b>Rs. {uSale.toLocaleString()}</b>
                                  </span>
                                </>
                              )}
                            </div>

                            {isCumulativeMismatch && (
                              <div className="bg-amber-500/20 border border-amber-400/40 rounded-lg px-2 py-1.5 text-[10px] text-amber-100 leading-snug">
                                ⚠️ گنتی کیش (Rs. {u.totalCash.toLocaleString()}) بقایا ہینڈ اوور (Rs. {u.remainingBase.toLocaleString()}) سے کم ہے۔ اگر آپ نے صرف اس شفٹ کا الگ کیش درج کیا ہے (پچھلی شفٹ کا Rs. {u.startingCash.toLocaleString()} شامل کیے بغیر) تو اوپر <b>"الگ شفٹ کیش (Separate)"</b> منتخب کریں۔
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white/10 border border-white/15 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-white">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-500/30 rounded-lg text-sm">💼</span>
                  <div>
                    <p className="font-bold text-[11px] text-white">Shift Closing Balance (شفٹ کلوزنگ کیش)</p>
                    <p className="text-[10px] text-indigo-200">شفٹ تبدیل ہونے پر دراز کیش درج کریں تا کہ سسٹم کل سیل کا حساب نکال سکے</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTypeChange('shift_closing')}
                  className="px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[10px] font-bold shrink-0 transition-colors cursor-pointer"
                >
                  کیش درج کریں
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New Entry Card */}
      <div ref={formCardRef} className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 space-y-3 scroll-mt-16">
        <h3 className="font-black text-center text-sm sm:text-base text-slate-800">
          Add New Entry
        </h3>

        {/* Quick Type Selection Buttons (Matches Back Cash Layout) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleTypeChange('in')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              entryType === 'in'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Cash Add (+)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('out')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              entryType === 'out'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <MinusCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Cash Out (-)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('opening')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              entryType === 'opening'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Opening Cash</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('shift_closing')}
            className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              entryType === 'shift_closing'
                ? 'bg-[#ea580c] text-white border-orange-600 shadow-xs'
                : 'bg-orange-50/70 text-orange-900 border-orange-200 hover:bg-orange-100'
            }`}
          >
            <Briefcase className={`w-3.5 h-3.5 shrink-0 ${entryType === 'shift_closing' ? 'text-white' : 'text-orange-500'}`} />
            <span className="truncate">Shift Closing</span>
          </button>
        </div>

        {/* Quick Back Cash Transfer Buttons */}
        <div className="pt-2 border-t border-dashed border-slate-200">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange('from_back_cash')}
              className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                entryType === 'from_back_cash'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="text-sm">🔄</span>
              <span className="truncate">Back se Aya (+)</span>
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange('to_back_cash')}
              className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                entryType === 'to_back_cash'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span className="text-sm">🔁</span>
              <span className="truncate">Back ko Diya (-)</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmitNewEntry} className="space-y-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Transaction Type</label>
            <select
              value={entryType}
              onChange={e => handleTypeChange(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold focus:outline-none"
            >
              <option value="shift_closing">💼 Shift Closing Balance (شفٹ کلوزنگ / کیش گنتی)</option>
              <option value="out">Cash Out (-)</option>
              <option value="in">Cash Add (+)</option>
              <option value="opening">Today Opening Cash (★)</option>
              <option value="from_back_cash">🔄 Back Cash se Aya / Liya (Shop In + | Back Cash -)</option>
              <option value="to_back_cash">🔄 Back Cash ko Diya / Bheja (Shop Out - | Back Cash +)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              {entryType === 'shift_closing' ? 'Shift Closing Cash (دراز میں موجود گنتی کیا گیا کیش)' : 'Amount (Raqam)'}
            </label>
            <AmountInput
              ref={amountInputRef}
              value={amount}
              onValueChange={setAmount}
              onFocus={() => setIsFormFocused(true)}
              onBlur={() => {
                setIsFormFocused(false);
                setTimeout(() => {
                  if (document.activeElement === amountInputRef.current) return;
                  formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 80);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitNewEntry(e);
                }
              }}
              placeholder={entryType === 'shift_closing' ? 'مثلاً 1,200 یا 21,000 یا 15,000' : 'Raqam Likhein (e.g. 10,000)'}
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm focus:outline-none focus:border-indigo-500 focus:bg-white scroll-my-24"
            />
          </div>

          {/* Live Interactive Calculation Preview for Shift Closing */}
          {entryType === 'shift_closing' && (() => {
            const previewAmountVal = parseFloat(amount) || 0;
            const uName = currentUser?.name || currentUser?.username || (currentUser?.role === 'admin' ? 'Admin' : 'Staff');
            const dayShiftTxs = dailyTransactions.filter(
              t => t.transaction_date === filterDate && t.type.toLowerCase() === 'shift_closing'
            );
            const dayOutTxs = dailyTransactions.filter(
              t => t.transaction_date === filterDate && t.type.toLowerCase() === 'out'
            );

            const previewAnalysis =
              previewAmountVal > 0
                ? computeShiftClosing(
                    [
                      ...dayShiftTxs,
                      {
                        id: `dt-${Date.now()}-preview`,
                        type: 'shift_closing',
                        amount: previewAmountVal,
                        description: description.trim() || `${uName} Shift Closing Balance`,
                        transaction_date: filterDate,
                        created_by: currentUser?.role || 'user',
                        created_by_name: uName,
                        created_at: new Date().toISOString()
                      }
                    ],
                    dayOutTxs,
                    effectiveOpening,
                    shiftClosingMode
                  )
                : shiftClosingAnalysis;

            const activePreviewShift = previewAnalysis.userGroups[previewAnalysis.userGroups.length - 1];
            const previewTotalCounted = previewAnalysis.totalClosingCash;
            const previewCalculatedSale = previewAnalysis.netSale;
            const previewShiftSale = activePreviewShift ? activePreviewShift.shiftSale : 0;
            const isMultiShiftPreview = previewAnalysis.userGroups.length > 1;

            return (
              <div className="p-3 bg-gradient-to-br from-indigo-50/90 to-purple-50/90 border border-indigo-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-extrabold text-[11px] text-indigo-900 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <span>Shift Closing &amp; Sale Calculator (سیل حساب کتاب)</span>
                  </span>
                  {shiftClosingAnalysis.entries.length > 0 && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                      پہلے سے درج: {shiftClosingAnalysis.entries.length} بار (Rs. {shiftClosingAnalysis.totalClosingCash.toLocaleString()})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center text-[10px]">
                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-slate-500 font-bold block truncate">
                      {isMultiShiftPreview && activePreviewShift
                        ? shiftClosingMode === 'cumulative'
                          ? '1. Prev Handover'
                          : '1. Shift Mode'
                        : '1. Opening Cash'}
                    </span>
                    <span className="font-mono font-black text-slate-800 text-[11px]">
                      {isMultiShiftPreview && activePreviewShift
                        ? shiftClosingMode === 'cumulative'
                          ? `Rs. ${activePreviewShift.startingCash.toLocaleString()}`
                          : 'Separate'
                        : `Rs. ${effectiveOpening.toLocaleString()}`}
                    </span>
                  </div>

                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-rose-600 font-bold block truncate">
                      {isMultiShiftPreview ? '2. This Shift Out (-)' : '2. Out/Purchases (-)'}
                    </span>
                    <span className="font-mono font-black text-rose-700 text-[11px]">
                      Rs. {(activePreviewShift ? activePreviewShift.shiftPurchases : totalOutPurchases).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-indigo-600 font-bold block truncate">
                      {isMultiShiftPreview ? '3. This Shift Cash' : '3. Closing Counted'}
                    </span>
                    <span className="font-mono font-black text-indigo-700 text-[11px]">
                      Rs. {(activePreviewShift ? activePreviewShift.totalCash : previewTotalCounted).toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-emerald-600 font-bold block truncate">
                      {isMultiShiftPreview ? '4. This Shift Sale' : '4. Net Sale (کل سیل)'}
                    </span>
                    <span className={`font-mono font-black text-[12px] ${
                      (isMultiShiftPreview ? previewShiftSale : previewCalculatedSale) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                      Rs. {(isMultiShiftPreview ? previewShiftSale : previewCalculatedSale).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Explanation text */}
                <div className="text-[10px] text-slate-700 bg-white/70 p-2 rounded-lg border border-indigo-100/60 leading-relaxed">
                  {previewAmountVal > 0 && activePreviewShift ? (
                    <p className="font-semibold text-slate-700">
                      💡 <span className="font-bold text-indigo-900">اس شفٹ کا حساب ({activePreviewShift.userName}):</span>{' '}
                      {activePreviewShift.shiftIndex === 0 ? (
                        <>
                          گنتی کیش (Rs. {activePreviewShift.totalCash.toLocaleString()}) + شفٹ پرچیز (Rs. {activePreviewShift.shiftPurchases.toLocaleString()}) - اوپننگ (Rs. {activePreviewShift.startingCash.toLocaleString()}) ={' '}
                          <span className="font-bold text-emerald-700">شفٹ سیل Rs. {previewShiftSale.toLocaleString()}</span>
                        </>
                      ) : shiftClosingMode === 'cumulative' ? (
                        <>
                          مکمل دراز کیش (Rs. {activePreviewShift.totalCash.toLocaleString()}) + شفٹ پرچیز (Rs. {activePreviewShift.shiftPurchases.toLocaleString()}) - پچھلی شفٹ ہینڈ اوور (Rs. {activePreviewShift.startingCash.toLocaleString()}) ={' '}
                          <span className={`font-bold ${previewShiftSale >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>شفٹ سیل Rs. {previewShiftSale.toLocaleString()}</span> | کل دن کی سیل: <span className="font-bold text-indigo-800">Rs. {previewCalculatedSale.toLocaleString()}</span>
                        </>
                      ) : (
                        <>
                          الگ شفٹ کیش (Rs. {activePreviewShift.totalCash.toLocaleString()}) + شفٹ پرچیز (Rs. {activePreviewShift.shiftPurchases.toLocaleString()}) ={' '}
                          <span className="font-bold text-emerald-700">شفٹ سیل Rs. {previewShiftSale.toLocaleString()}</span> | کل دن کی سیل: <span className="font-bold text-indigo-800">Rs. {previewCalculatedSale.toLocaleString()}</span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-slate-500">
                      اوپر رقم والے خانے میں کیش لکھیں (بڑے نوٹ جیسے 1000/500 یا مجموعی کیش)۔ سسٹم خودکار طور پر ہر شفٹ کی اپنی پرچیزز اور اوپننگ/ہینڈ اوور کے مطابق اصل سیل نکال دے گا۔
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Note (Detail/Name)</label>
            <input
              type="text"
              name="entry_note"
              list="nh-note-suggestions"
              autoComplete="on"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onFocus={() => setIsFormFocused(true)}
              onBlur={() => {
                setIsFormFocused(false);
                setTimeout(() => {
                  formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 80);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitNewEntry(e);
                }
              }}
              placeholder="Note (Detail/Name)"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          {/* Helper Banner when entering Opening Cash and Yesterday Closing is Missing */}
          {entryType === 'opening' && yesterdayMissingClosingInfo.isMissing && (
            <div className="p-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl flex items-start gap-2 text-indigo-950 text-xs">
              <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <span className="font-bold text-[11px] block text-indigo-900">
                  {yesterdayMissingClosingInfo.isSingleShiftDay
                    ? `Kal (${yesterdayDate}) Single User Full Day Closing Missing:`
                    : `Kal (${yesterdayDate}) 2nd Shift Closing Missing:`}
                </span>
                <span className="text-[10px] text-indigo-800">
                  Save karne par popup aayega. "Haan / Yes" dabane par kal ki closing aur 100% sale {yesterdayMissingClosingInfo.targetYesterdayUser} ke naam par darj ho jayegi.
                </span>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-sm rounded-xl shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] mt-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Cash Entry (محفوظ کریں)</span>
          </button>
        </form>
      </div>

      {/* Transaction History Table with clear top margin */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3 mt-6">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-800">
            Transaction History ({new Date(filterDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">{filteredList.length} Entries</span>
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              title="Share Statement"
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Report</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedFilteredList.length > 0 ? (
            sortedFilteredList.map(t => {
              const isOut = t.type.toLowerCase() === 'out';
              const isOpening = t.type.toLowerCase() === 'opening';
              const isShiftClosing = t.type.toLowerCase() === 'shift_closing';
              const isFromBack = t.transfer_direction === 'from_back_cash' || t.description?.includes('[Back Cash se Liya]') || t.description?.includes('[From Back Cash]');
              const isToBack = t.transfer_direction === 'to_back_cash' || t.description?.includes('[Back Cash ko Diya]') || t.description?.includes('[To Back Cash]');
              const txTime = getTransactionTime(t);

              return (
                <div key={t.id} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          isShiftClosing
                            ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                            : isFromBack
                            ? 'bg-blue-100 text-blue-900 border border-blue-200'
                            : isToBack
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : isOpening
                            ? 'bg-blue-100 text-blue-800'
                            : isOut
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isShiftClosing
                          ? '💼 SHIFT CLOSING (کیش گنتی)'
                          : isFromBack
                          ? '🔄 FROM BACK CASH (+)'
                          : isToBack
                          ? '🔄 TO BACK CASH (-)'
                          : isOpening
                          ? 'OPENING CASH'
                          : t.type.toUpperCase()}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded text-white ${
                          t.created_by === 'admin' ? 'bg-emerald-600' : 'bg-slate-700'
                        }`}
                      >
                        {(t.created_by_name || t.created_by).toUpperCase()}
                      </span>
                    </div>

                    <p className="font-bold text-slate-800 text-[13px] leading-snug break-words whitespace-pre-wrap mt-1">
                      {t.description || 'No Note'}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                      {canEditEntry && (
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-blue-600 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Edit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedHisTxId(t.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 border border-slate-200/80 text-slate-700 hover:text-blue-600 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <History className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="text-[11px]">History</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-right shrink-0 whitespace-nowrap">
                    {txTime ? (
                      <div
                        className={`text-[11px] font-bold font-mono tracking-tight ${
                          isShiftClosing ? 'text-indigo-800' : 'text-slate-500'
                        }`}
                      >
                        {txTime}
                      </div>
                    ) : (
                      <div className="h-4" />
                    )}

                    <div
                      className={`text-sm font-black font-mono ${
                        isShiftClosing
                          ? 'text-indigo-700'
                          : isOut
                          ? 'text-rose-600'
                          : isOpening
                          ? 'text-blue-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {isShiftClosing ? '💼 ' : isOut ? '-' : isOpening ? '★ ' : '+'} Rs. {t.amount.toLocaleString()}
                    </div>

                    {isShiftClosing && (() => {
                      const matchedShift = shiftClosingAnalysis.entryShiftMap.get(t.id);
                      const displaySale = matchedShift
                        ? matchedShift.shiftSale
                        : (t.amount + totalOutPurchases) - effectiveOpening;
                      return (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 inline-block mt-0.5">
                          {matchedShift ? `شفٹ #${matchedShift.shiftIndex + 1} سیل:` : 'سیل:'} Rs. {displaySale.toLocaleString()}
                        </span>
                      );
                    })()}

                    {canDeleteEntry && (
                      <button
                        type="button"
                        onClick={() => handleDelete(t.id)}
                        className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-3 py-1 rounded-lg mt-1.5 transition-colors flex items-center justify-center ml-auto cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              Aaj ki koi transaction record nahi hui.
            </div>
          )}
        </div>

        {/* Generate Statement & Share Button - Distinct Dark Navy style so it is never confused with Save Cash Entry */}
        <div className="pt-3 border-t border-slate-100 mt-2">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="w-full py-3 bg-[#1e293b] hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Share2 className="w-4 h-4 text-emerald-400" />
            <span>GENERATE STATEMENT & SHARE (روزنامچہ رپورٹ)</span>
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white text-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-sm text-slate-800 mb-3 pb-2 border-b border-slate-100">
              Shop Cash Entry Edit
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Transaction Type</label>
                <select
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                >
                  <option value="in">Cash Add (+)</option>
                  <option value="out">Cash Out (-)</option>
                  <option value="opening">Today Opening Cash (★)</option>
                  <option value="shift_closing">💼 Shift Closing Balance (شفٹ کلوزنگ / کیش گنتی)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Amount</label>
                <div className="flex gap-2">
                  <AmountInput
                    value={editAmount}
                    onValueChange={setEditAmount}
                    required
                    className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedHisTxId(editId)}
                    className="px-3 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Note (Detail)</label>
                <input
                  type="text"
                  name="edit_note"
                  list="nh-note-suggestions"
                  autoComplete="on"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SweetAlert-Style Delete Confirmation Modal */}
      {deleteConfirmId && (() => {
        const targetTx = dailyTransactions.find(t => t.id === deleteConfirmId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white text-slate-800 w-full max-w-xs sm:max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 border-4 border-rose-100 flex items-center justify-center text-rose-500 shadow-inner">
                <Trash2 className="w-8 h-8 animate-bounce" />
              </div>

              <div className="space-y-1">
                <h3 className="font-black text-base sm:text-lg text-slate-900">
                  Delete Entry?
                </h3>
                <p className="text-xs font-bold text-rose-600">
                  کیا آپ واقعی یہ انٹری ڈیلیٹ کرنا چاہتے ہیں؟
                </p>
              </div>

              {targetTx && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-xs space-y-1">
                  <p className="font-bold text-slate-800 break-words leading-snug">
                    {targetTx.description || 'Shop Cash Entry'}
                  </p>
                  <p className="font-mono font-black text-sm text-rose-600">
                    Rs. {targetTx.amount.toLocaleString()}
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                یہ انٹری فہرست سے ہٹ جائے گی۔ ایڈمن کسی بھی وقت Deleted Logs سے اسے واپس ری سٹور کر سکتا ہے۔
              </p>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Cancel (نہیں)
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteTransaction}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-black rounded-xl text-xs shadow-md shadow-rose-500/30 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Yes, Delete!</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History Sub-Modal */}
      {selectedHisTxId && (
        <HistoryModal
          isOpen={true}
          onClose={() => setSelectedHisTxId(null)}
          transactionId={selectedHisTxId}
        />
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          isOpen={true}
          onClose={() => setShowReportModal(false)}
          title="Daily Shop Cash Account Statement"
          dateStr={filterDate}
          closingBalance={stats.balance}
          items={sortedFilteredList.map(t => ({
            id: t.id,
            note: `${t.description}${t.created_by_name ? ` [${t.created_by_name}]` : ''}`,
            type: t.type,
            amount: t.amount
          }))}
        />
      )}

      {/* Auto-Detect Missed Yesterday Night Closing Smart Prompt Modal */}
      {showYesterdayClosingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white text-slate-800 w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center text-xl shrink-0 shadow-xs">
                💼
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-black text-sm sm:text-base text-slate-900">
                    Kal Raat Ki Closing Missing Hai!
                  </h3>
                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded-full uppercase">
                    Auto-Detect
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  {yesterdayDate} (گزشتہ کل کی شفٹ کلوزنگ)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowYesterdayClosingPrompt(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                title="Band Karein"
              >
                ✕
              </button>
            </div>

            {/* Prompt Question */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-indigo-100">
                <span className="font-bold text-indigo-900">
                  {yesterdayMissingClosingInfo.isSingleShiftDay ? '⭐ 1 User Shop (Full Day Shift)' : '👥 2nd / Night Shift'}
                </span>
                <span className="text-[10px] bg-indigo-200/80 text-indigo-900 font-bold px-2 py-0.5 rounded-md font-mono">
                  {yesterdayMissingClosingInfo.targetYesterdayUser}
                </span>
              </div>
              <p className="text-slate-800 leading-relaxed font-semibold">
                {yesterdayMissingClosingInfo.isSingleShiftDay ? (
                  <>
                    Kal <span className="font-bold text-indigo-900 font-mono">({yesterdayDate})</span> poora din <span className="font-bold text-slate-900 underline">{yesterdayMissingClosingInfo.targetYesterdayUser}</span> ne shop operate ki thi.
                  </>
                ) : (
                  <>
                    Kal <span className="font-bold text-indigo-900 font-mono">({yesterdayDate})</span> 1st shift <span className="font-bold text-slate-900">{yesterdayMissingClosingInfo.morningUser}</span> ne close ki thi.
                  </>
                )}
              </p>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                {yesterdayMissingClosingInfo.isSingleShiftDay ? (
                  <>
                    Kya ye cash (<span className="font-mono font-black text-indigo-700">Rs. {pendingOpeningAmount.toLocaleString()}</span>) kal ki <strong>Full Day Closing</strong> maan kar darj kar dein? Is se kal ki <strong>100% sale aur profit {yesterdayMissingClosingInfo.targetYesterdayUser}</strong> ke naam par count ho jayegi!
                  </>
                ) : (
                  <>
                    Kya ye cash (<span className="font-mono font-black text-indigo-700">Rs. {pendingOpeningAmount.toLocaleString()}</span>) 2nd shift ki closing maan kar <strong>{yesterdayMissingClosingInfo.targetYesterdayUser}</strong> ke naam par darj kar dein?
                  </>
                )}
              </p>
            </div>

            {/* Live Calculation Preview Card */}
            {(() => {
              const yStats = getShopCashStats(yesterdayDate);
              const yOpening = yStats.opening > 0 ? yStats.opening : getYesterdayClosingCash(yesterdayDate);
              const yOut = yStats.cashOut;
              const yCalculatedSale = (pendingOpeningAmount + yOut) - yOpening;
              const yShiftTxs = dailyTransactions.filter(t => t.transaction_date === yesterdayDate && t.type === 'shift_closing');
              const hasMorningClosing = yShiftTxs.length > 0;
              const morningAmount = hasMorningClosing ? yShiftTxs[0].amount : 0;
              const nightDiff = pendingOpeningAmount - morningAmount;

              return (
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2">
                  <div className="text-[11px] font-black text-slate-700 flex items-center justify-between border-b border-slate-200/60 pb-1">
                    <span>کل کے ریکارڈ کا خودکار حساب (Auto Sale Preview):</span>
                    <span className="font-mono text-emerald-600 font-black">
                      سیل: Rs. {yCalculatedSale.toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-slate-500 font-bold block truncate">کل اوپننگ</span>
                      <span className="font-mono font-bold text-slate-800">
                        Rs. {yOpening.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-rose-600 font-bold block truncate">کل خرچ/پرچیز (-)</span>
                      <span className="font-mono font-bold text-rose-700">
                        Rs. {yOut.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-indigo-600 font-bold block truncate">رات کلوزنگ کیش</span>
                      <span className="font-mono font-black text-indigo-700">
                        Rs. {pendingOpeningAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {hasMorningClosing && (
                    <div className="text-[10px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                      <span>دپہر کلوزنگ: <strong className="font-mono">Rs. {morningAmount.toLocaleString()}</strong></span>
                      <span className="font-bold text-indigo-700">
                        رات شفٹ کیش فرق: <span className="font-mono">{nightDiff >= 0 ? '+' : ''}Rs. {nightDiff.toLocaleString()}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* YES Button */}
              <button
                type="button"
                onClick={handleConfirmYesterdayClosingAndOpening}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>✅ Haan, Kal Ki Closing Mein Bhi Add Karein (Yes)</span>
              </button>

              {/* NO Button */}
              <button
                type="button"
                onClick={handleSaveOnlyTodayOpening}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-colors cursor-pointer"
              >
                <span>❌ Nahi, Sirf Aaj Ka Opening Cash Save Karein (No)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowYesterdayClosingPrompt(false)}
                className="w-full text-center text-[11px] text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer"
              >
                Cancel / Wapas Edit Karein
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
