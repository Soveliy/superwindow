const PRODUCTION_DATES_STORAGE_KEY = 'superwindow.settings.production-dates.v1';

const isStorageAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage);

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getDefaultProductionDates = (): string[] => {
  const today = new Date();

  return [3, 5, 7, 10, 14]
    .map((offset) => toIsoDate(addDays(today, offset)))
    .sort((first, second) => first.localeCompare(second));
};

const normalizeProductionDates = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return getDefaultProductionDates();
  }

  const dates = value
    .filter((item): item is string => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item))
    .map((item) => item.trim());

  return [...new Set(dates)].sort((first, second) => first.localeCompare(second));
};

export const readAvailableProductionDates = (): string[] => {
  if (!isStorageAvailable()) {
    return getDefaultProductionDates();
  }

  try {
    const rawValue = localStorage.getItem(PRODUCTION_DATES_STORAGE_KEY);
    const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : getDefaultProductionDates();
    return normalizeProductionDates(parsed);
  } catch {
    return getDefaultProductionDates();
  }
};

export const writeAvailableProductionDates = (dates: string[]): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.setItem(PRODUCTION_DATES_STORAGE_KEY, JSON.stringify(normalizeProductionDates(dates)));
};
