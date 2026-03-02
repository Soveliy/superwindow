export interface CalculatorPosition {
  id: number;
  width?: number;
  height?: number;
  price?: number;
}

const CALCULATOR_POSITIONS_STORAGE_KEY = 'superwindow.calculator.positions.v1';

const isCalculatorPosition = (value: unknown): value is CalculatorPosition => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CalculatorPosition>;
  const hasValidWidth =
    typeof candidate.width === 'undefined' || (typeof candidate.width === 'number' && Number.isFinite(candidate.width));
  const hasValidHeight =
    typeof candidate.height === 'undefined' ||
    (typeof candidate.height === 'number' && Number.isFinite(candidate.height));
  const hasValidPrice =
    typeof candidate.price === 'undefined' || (typeof candidate.price === 'number' && Number.isFinite(candidate.price));

  return typeof candidate.id === 'number' && Number.isFinite(candidate.id) && hasValidWidth && hasValidHeight && hasValidPrice;
};

const isStorageAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizePositionId = (value: number): number => Math.max(1, Math.trunc(value));
const normalizeOptionalNumber = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.trunc(value));
};

export const readCalculatorPositions = (): CalculatorPosition[] => {
  if (!isStorageAvailable()) {
    return [];
  }

  try {
    const rawValue = localStorage.getItem(CALCULATOR_POSITIONS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isCalculatorPosition).map((item) => {
      const normalized: CalculatorPosition = {
        id: normalizePositionId(item.id),
      };
      const width = normalizeOptionalNumber(item.width);
      const height = normalizeOptionalNumber(item.height);
      const price = normalizeOptionalNumber(item.price);

      if (typeof width === 'number') {
        normalized.width = width;
      }
      if (typeof height === 'number') {
        normalized.height = height;
      }
      if (typeof price === 'number') {
        normalized.price = price;
      }

      return normalized;
    });
  } catch {
    return [];
  }
};

export const writeCalculatorPositions = (positions: CalculatorPosition[]): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.setItem(CALCULATOR_POSITIONS_STORAGE_KEY, JSON.stringify(positions));
};

export const clearCalculatorPositions = (): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.removeItem(CALCULATOR_POSITIONS_STORAGE_KEY);
};
