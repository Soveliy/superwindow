export type PackageType = 'budget' | 'standard' | 'premium';
export type OpeningType = 'single' | 'double' | 'triple' | 'balcony';
export type SealColor = 'black' | 'gray' | 'white';
export type DrainageType = 'bottom' | 'front' | 'hidden';
export type OpeningMode = 'fixed' | 'turn' | 'tilt_turn' | 'fanlight';
export type DripMaterial = 'aluminum' | 'polyester' | 'galvanized';
export type SillColor = 'white' | 'brown' | 'anthracite';
export type SashId = 'single' | 'left' | 'center' | 'right';
export type HandlePosition = 'none' | 'left' | 'right' | 'top';
export type AdditionalOptionType = 'sill' | 'drip';

export interface CalculatorSashConfig {
  id: SashId;
  mode?: OpeningMode;
  handlePosition?: HandlePosition;
  mosquitoScreenEnabled?: boolean;
}

export interface CalculatorAdditionalOption {
  id: number;
  type: AdditionalOptionType;
  length?: number;
  width?: number;
  sillColor?: SillColor;
  dripMaterial?: DripMaterial;
}

export interface CalculatorPosition {
  id: number;
  width?: number;
  height?: number;
  price?: number;
  openingType?: OpeningType;
  profileId?: string;
  packageType?: PackageType;
  sealColor?: SealColor;
  drainage?: DrainageType;
  sashes?: CalculatorSashConfig[];
  additionalOptions?: CalculatorAdditionalOption[];
  leftSashMode?: OpeningMode;
  rightSashMode?: OpeningMode;
  mosquitoScreenEnabled?: boolean;
  turnTiltHardware?: boolean;
  childLock?: boolean;
  extSillEnabled?: boolean;
  intSillEnabled?: boolean;
  underSillEnabled?: boolean;
}

const CALCULATOR_POSITIONS_STORAGE_KEY = 'superwindow.calculator.positions.v1';

const packageTypes = ['budget', 'standard', 'premium'] as const;
const openingTypes = ['single', 'double', 'triple', 'balcony'] as const;
const sealColors = ['black', 'gray', 'white'] as const;
const drainageTypes = ['bottom', 'front', 'hidden'] as const;
const openingModes = ['fixed', 'turn', 'tilt_turn', 'fanlight'] as const;
const dripMaterials = ['aluminum', 'polyester', 'galvanized'] as const;
const sillColors = ['white', 'brown', 'anthracite'] as const;
const sashIds = ['single', 'left', 'center', 'right'] as const;
const handlePositions = ['none', 'left', 'right', 'top'] as const;
const additionalOptionTypes = ['sill', 'drip'] as const;

const isStorageAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isOptionalNumber = (value: unknown): value is number | undefined =>
  typeof value === 'undefined' || isNonNegativeNumber(value);
const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  typeof value === 'undefined' || typeof value === 'boolean';
const isOptionalString = (value: unknown): value is string | undefined =>
  typeof value === 'undefined' || (typeof value === 'string' && value.trim().length > 0);
const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T);
const isOptionalOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T | undefined =>
  typeof value === 'undefined' || isOneOf(value, values);

const normalizePositionId = (value: number): number => Math.max(1, Math.trunc(value));
const normalizeOptionalNumber = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined;
const normalizeOptionalBoolean = (value: boolean | undefined): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;
const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
const normalizeOptionalEnum = <T extends string>(value: unknown, values: readonly T[]): T | undefined =>
  isOneOf(value, values) ? value : undefined;

const isCalculatorSashConfig = (value: unknown): value is CalculatorSashConfig => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isOptionalOneOf(value.id, sashIds) &&
    isOptionalOneOf(value.mode, openingModes) &&
    isOptionalOneOf(value.handlePosition, handlePositions) &&
    isOptionalBoolean(value.mosquitoScreenEnabled)
  );
};

const normalizeSashConfig = (sash: CalculatorSashConfig): CalculatorSashConfig => {
  const normalized: CalculatorSashConfig = {
    id: normalizeOptionalEnum(sash.id, sashIds) ?? 'single',
  };

  const mode = normalizeOptionalEnum(sash.mode, openingModes);
  const handlePosition = normalizeOptionalEnum(sash.handlePosition, handlePositions);
  const mosquitoScreenEnabled = normalizeOptionalBoolean(sash.mosquitoScreenEnabled);

  if (mode) {
    normalized.mode = mode;
  }
  if (handlePosition) {
    normalized.handlePosition = handlePosition;
  }
  if (typeof mosquitoScreenEnabled === 'boolean') {
    normalized.mosquitoScreenEnabled = mosquitoScreenEnabled;
  }

  return normalized;
};

const isCalculatorAdditionalOption = (value: unknown): value is CalculatorAdditionalOption => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeNumber(value.id) &&
    isOptionalOneOf(value.type, additionalOptionTypes) &&
    isOptionalNumber(value.length) &&
    isOptionalNumber(value.width) &&
    isOptionalOneOf(value.sillColor, sillColors) &&
    isOptionalOneOf(value.dripMaterial, dripMaterials)
  );
};

const normalizeAdditionalOption = (option: CalculatorAdditionalOption): CalculatorAdditionalOption => {
  const normalized: CalculatorAdditionalOption = {
    id: normalizePositionId(option.id),
    type: normalizeOptionalEnum(option.type, additionalOptionTypes) ?? 'sill',
  };

  const length = normalizeOptionalNumber(option.length);
  const width = normalizeOptionalNumber(option.width);
  const sillColor = normalizeOptionalEnum(option.sillColor, sillColors);
  const dripMaterial = normalizeOptionalEnum(option.dripMaterial, dripMaterials);

  if (typeof length === 'number') {
    normalized.length = length;
  }
  if (typeof width === 'number') {
    normalized.width = width;
  }
  if (sillColor) {
    normalized.sillColor = sillColor;
  }
  if (dripMaterial) {
    normalized.dripMaterial = dripMaterial;
  }

  return normalized;
};

export const isCalculatorPosition = (value: unknown): value is CalculatorPosition => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeNumber(value.id) &&
    isOptionalNumber(value.width) &&
    isOptionalNumber(value.height) &&
    isOptionalNumber(value.price) &&
    isOptionalOneOf(value.openingType, openingTypes) &&
    isOptionalString(value.profileId) &&
    isOptionalOneOf(value.packageType, packageTypes) &&
    isOptionalOneOf(value.sealColor, sealColors) &&
    isOptionalOneOf(value.drainage, drainageTypes) &&
    (typeof value.sashes === 'undefined' || (Array.isArray(value.sashes) && value.sashes.every(isCalculatorSashConfig))) &&
    (typeof value.additionalOptions === 'undefined' ||
      (Array.isArray(value.additionalOptions) && value.additionalOptions.every(isCalculatorAdditionalOption))) &&
    isOptionalOneOf(value.leftSashMode, openingModes) &&
    isOptionalOneOf(value.rightSashMode, openingModes) &&
    isOptionalBoolean(value.mosquitoScreenEnabled) &&
    isOptionalBoolean(value.turnTiltHardware) &&
    isOptionalBoolean(value.childLock) &&
    isOptionalBoolean(value.extSillEnabled) &&
    isOptionalBoolean(value.intSillEnabled) &&
    isOptionalBoolean(value.underSillEnabled)
  );
};

export const normalizeCalculatorPosition = (position: CalculatorPosition): CalculatorPosition => {
  const normalized: CalculatorPosition = {
    id: normalizePositionId(position.id),
  };

  const width = normalizeOptionalNumber(position.width);
  const height = normalizeOptionalNumber(position.height);
  const price = normalizeOptionalNumber(position.price);
  const openingType = normalizeOptionalEnum(position.openingType, openingTypes);
  const profileId = normalizeOptionalString(position.profileId);
  const packageType = normalizeOptionalEnum(position.packageType, packageTypes);
  const sealColor = normalizeOptionalEnum(position.sealColor, sealColors);
  const drainage = normalizeOptionalEnum(position.drainage, drainageTypes);
  const sashes = Array.isArray(position.sashes) ? position.sashes.filter(isCalculatorSashConfig).map(normalizeSashConfig) : [];
  const additionalOptions = Array.isArray(position.additionalOptions)
    ? position.additionalOptions.filter(isCalculatorAdditionalOption).map(normalizeAdditionalOption)
    : [];
  const leftSashMode = normalizeOptionalEnum(position.leftSashMode, openingModes);
  const rightSashMode = normalizeOptionalEnum(position.rightSashMode, openingModes);
  const mosquitoScreenEnabled = normalizeOptionalBoolean(position.mosquitoScreenEnabled);
  const turnTiltHardware = normalizeOptionalBoolean(position.turnTiltHardware);
  const childLock = normalizeOptionalBoolean(position.childLock);
  const extSillEnabled = normalizeOptionalBoolean(position.extSillEnabled);
  const intSillEnabled = normalizeOptionalBoolean(position.intSillEnabled);
  const underSillEnabled = normalizeOptionalBoolean(position.underSillEnabled);

  if (typeof width === 'number') {
    normalized.width = width;
  }
  if (typeof height === 'number') {
    normalized.height = height;
  }
  if (typeof price === 'number') {
    normalized.price = price;
  }
  if (openingType) {
    normalized.openingType = openingType;
  }
  if (profileId) {
    normalized.profileId = profileId;
  }
  if (packageType) {
    normalized.packageType = packageType;
  }
  if (sealColor) {
    normalized.sealColor = sealColor;
  }
  if (drainage) {
    normalized.drainage = drainage;
  }
  if (sashes.length > 0) {
    normalized.sashes = sashes;
  }
  if (additionalOptions.length > 0) {
    normalized.additionalOptions = additionalOptions;
  }
  if (leftSashMode) {
    normalized.leftSashMode = leftSashMode;
  }
  if (rightSashMode) {
    normalized.rightSashMode = rightSashMode;
  }
  if (typeof mosquitoScreenEnabled === 'boolean') {
    normalized.mosquitoScreenEnabled = mosquitoScreenEnabled;
  }
  if (typeof turnTiltHardware === 'boolean') {
    normalized.turnTiltHardware = turnTiltHardware;
  }
  if (typeof childLock === 'boolean') {
    normalized.childLock = childLock;
  }
  if (typeof extSillEnabled === 'boolean') {
    normalized.extSillEnabled = extSillEnabled;
  }
  if (typeof intSillEnabled === 'boolean') {
    normalized.intSillEnabled = intSillEnabled;
  }
  if (typeof underSillEnabled === 'boolean') {
    normalized.underSillEnabled = underSillEnabled;
  }

  return normalized;
};

export const readCalculatorPositions = (): CalculatorPosition[] => {
  if (!isStorageAvailable()) {
    return [];
  }

  try {
    const rawValue = localStorage.getItem(CALCULATOR_POSITIONS_STORAGE_KEY);
    const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : [];

    return Array.isArray(parsed) ? parsed.filter(isCalculatorPosition).map(normalizeCalculatorPosition) : [];
  } catch {
    return [];
  }
};

export const writeCalculatorPositions = (positions: CalculatorPosition[]): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.setItem(
    CALCULATOR_POSITIONS_STORAGE_KEY,
    JSON.stringify(positions.filter(isCalculatorPosition).map(normalizeCalculatorPosition)),
  );
};

export const clearCalculatorPositions = (): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.removeItem(CALCULATOR_POSITIONS_STORAGE_KEY);
};
