// Local Memory Word & Phrase Suggestion Engine (HTML5 <datalist> + localStorage)
// Automatically saves typed words, notes, customer names, wholesaler names, and item names
// so they appear in native keyboard/browser suggestions (like Chrome Android suggestion chips).

export type SuggestionCategory = 'note' | 'customer' | 'wholesaler' | 'item' | 'general';

const STORAGE_KEY = 'taj_pos_word_memory_v1';
const MAX_PER_CATEGORY = 400;

interface SuggestionStore {
  note: string[];
  customer: string[];
  wholesaler: string[];
  item: string[];
  general: string[];
}

const DEFAULT_NOTE_SUGGESTIONS: string[] = [
  'Sending',
  'Received',
  'Paid',
  'Cash Add',
  'Cash Out',
  'Cash Received',
  'Payment Paid',
  'JazzCash',
  'EasyPaisa',
  'Bank Transfer',
  'Udhaar',
  'Jama',
  'Commission',
  'Load',
  'Package',
  'Bill Paid'
];

function loadStore(): SuggestionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        note: [...DEFAULT_NOTE_SUGGESTIONS],
        customer: [],
        wholesaler: [],
        item: [],
        general: []
      };
    }
    const parsed = JSON.parse(raw) as Partial<SuggestionStore>;
    return {
      note: Array.isArray(parsed.note) ? parsed.note : [...DEFAULT_NOTE_SUGGESTIONS],
      customer: Array.isArray(parsed.customer) ? parsed.customer : [],
      wholesaler: Array.isArray(parsed.wholesaler) ? parsed.wholesaler : [],
      item: Array.isArray(parsed.item) ? parsed.item : [],
      general: Array.isArray(parsed.general) ? parsed.general : []
    };
  } catch {
    return {
      note: [...DEFAULT_NOTE_SUGGESTIONS],
      customer: [],
      wholesaler: [],
      item: [],
      general: []
    };
  }
}

function saveStore(store: SuggestionStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taj_suggestions_updated'));
    }
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Saves a newly typed phrase (and its first meaningful word if multi-word) into local memory
 * so next time the user starts typing, it appears in the suggestion bar above the keyboard.
 */
export function rememberTextSuggestion(
  rawText: string | undefined | null,
  category: SuggestionCategory = 'note'
): void {
  if (!rawText) return;
  const cleaned = String(rawText).trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length < 2) return;

  // Ignore pure numbers
  if (/^\d+(\.\d+)?$/.test(cleaned)) return;

  const store = loadStore();
  const list = store[category] || [];

  const candidates: string[] = [cleaned];

  // If the phrase has multiple words (e.g., "Sending meray no pe"), also remember the first word ("Sending")
  // so both "Sending" and "Sending meray no pe" show up in suggestions!
  const firstWord = cleaned.split(' ')[0];
  if (firstWord && firstWord.length >= 3 && !/^\d+$/.test(firstWord) && firstWord.toLowerCase() !== cleaned.toLowerCase()) {
    candidates.push(firstWord);
  }

  let changed = false;
  for (const candidate of candidates) {
    const existingIdx = list.findIndex(item => item.toLowerCase() === candidate.toLowerCase());
    if (existingIdx === 0) {
      // Already at the very top
      if (list[0] !== candidate) {
        list[0] = candidate;
        changed = true;
      }
      continue;
    }
    if (existingIdx > 0) {
      list.splice(existingIdx, 1);
    }
    list.unshift(candidate);
    changed = true;
  }

  if (changed) {
    store[category] = list.slice(0, MAX_PER_CATEGORY);
    saveStore(store);
  }
}

/**
 * Combines locally remembered phrases with live records from app state (transactions, customers, items),
 * returning a deduplicated list ordered by most recently used.
 */
export function getCombinedSuggestions(
  category: SuggestionCategory,
  liveItems: Array<string | undefined | null> = []
): string[] {
  const store = loadStore();
  const saved = store[category] || [];
  const seen = new Set<string>();
  const result: string[] = [];

  const pushUnique = (val: string | undefined | null) => {
    if (!val) return;
    const trimmed = String(val).trim().replace(/\s+/g, ' ');
    if (!trimmed || trimmed.length < 2) return;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return;
    // Skip auto-generated system transfer descriptions if overly long with brackets
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  // 1. User's locally remembered words/phrases first (most recent on top)
  for (const item of saved) {
    pushUnique(item);
  }

  // 2. Live items from existing database/transactions
  for (const item of liveItems) {
    pushUnique(item);
  }

  // 3. Default helpful words for notes
  if (category === 'note') {
    for (const def of DEFAULT_NOTE_SUGGESTIONS) {
      pushUnique(def);
    }
  }

  return result.slice(0, MAX_PER_CATEGORY);
}
