export type PackageType = 'budget' | 'standard' | 'premium';
export type OpeningType =
  | 'single'
  | 'single_turn'
  | 'double'
  | 'double_left_active'
  | 'double_right_active'
  | 'double_dual_active'
  | 'triple'
  | 'triple_dual_active'
  | 'triple_full_active'
  | 'balcony'
  | 'balcony_left_door'
  | 'balcony_right_door';
export type SealColor = 'black' | 'gray' | 'white';
export type DrainageType = 'bottom' | 'none' | 'street';
export type OpeningMode = 'fixed' | 'turn' | 'tilt_turn' | 'fanlight';
export type WindowColorSide = 'outside' | 'inside' | 'solid';
export type WindowColor = 'white' | 'anthracite' | 'golden_oak' | 'dark_oak' | 'mahogany' | 'silver';
export type HandleType = 'standard' | 'premium' | 'design';
export type HandleColor = 'white' | 'anthracite' | 'brown' | 'light_brown' | 'black';
export type SillType = 'fineber' | 'komfort';
export type SillColor = 'white' | 'brown' | 'anthracite';
export type DripColor = 'white' | 'brown' | 'gray';
export type MullionOrientation = 'vertical' | 'horizontal';
export type MullionOffsets = Record<string, number>;
export type SashId = 'single' | 'left' | 'center' | 'right';
export type HandlePosition = 'none' | 'left' | 'right' | 'top';
export type AdditionalOptionType = 'sill' | 'drip';
export type CalculatorProductionContourId = 1 | 2 | 3;

export interface CalculatorProductionContour {
  id: CalculatorProductionContourId;
  parameters?: Array<Record<string, string>>;
}

export interface CalculatorProductionAccessory {
  id: number;
  article: string;
  color: string;
  quantity: string;
  length: string;
  width: string;
}

export interface CalculatorProductionQuery {
  type_id: number;
  width: number;
  height: number;
  system_id: string;
  color: string;
  discount?: string;
  mullionOffset: Array<Record<string, number>>;
  parameters: {
    sealColor: string;
    drainage: string;
  };
  contours: CalculatorProductionContour[];
  accessories?: CalculatorProductionAccessory[];
}

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
  sillType?: SillType;
  sillColor?: SillColor;
  dripColor?: DripColor;
}

export interface CalculatorPosition {
  id: number;
  width?: number;
  height?: number;
  price?: number;
  serverPrice?: number;
  customerPrice?: number;
  dealerDiscountPercent?: number;
  dealerProfitAmount?: number;
  dealerProfitCode?: string;
  openingType?: OpeningType;
  profileId?: string;
  packageType?: PackageType;
  sealColor?: SealColor;
  drainage?: DrainageType;
  windowColorSide?: WindowColorSide;
  windowColor?: WindowColor;
  handleType?: HandleType;
  handleColor?: HandleColor;
  mullionOrientation?: MullionOrientation;
  mullionOffsets?: MullionOffsets;
  additionalOptions?: CalculatorAdditionalOption[];
  sashes?: CalculatorSashConfig[];
  leftSashMode?: OpeningMode;
  rightSashMode?: OpeningMode;
  mosquitoScreenEnabled?: boolean;
  turnTiltHardware?: boolean;
  childLock?: boolean;
  extSillEnabled?: boolean;
  intSillEnabled?: boolean;
  underSillEnabled?: boolean;
  productionQuery?: CalculatorProductionQuery;
}

const CALCULATOR_POSITIONS_STORAGE_KEY = 'superwindow.calculator.positions.v1';

const packageTypes = ['budget', 'standard', 'premium'] as const;
const openingTypes = [
  'single',
  'single_turn',
  'double',
  'double_left_active',
  'double_right_active',
  'double_dual_active',
  'triple',
  'triple_dual_active',
  'triple_full_active',
  'balcony',
  'balcony_left_door',
  'balcony_right_door',
] as const;
const sealColors = ['black', 'gray', 'white'] as const;
const drainageTypes = ['bottom', 'none', 'street'] as const;
const openingModes = ['fixed', 'turn', 'tilt_turn', 'fanlight'] as const;
const windowColorSides = ['outside', 'inside', 'solid'] as const;
const windowColors = ['white', 'anthracite', 'golden_oak', 'dark_oak', 'mahogany', 'silver'] as const;
const handleTypes = ['standard', 'premium', 'design'] as const;
const handleColors = ['white', 'anthracite', 'brown', 'light_brown', 'black'] as const;
const sillTypes = ['fineber', 'komfort'] as const;
const sillColors = ['white', 'brown', 'anthracite'] as const;
const dripColors = ['white', 'brown', 'gray'] as const;
const mullionOrientations = ['vertical', 'horizontal'] as const;
const sashIds = ['single', 'left', 'center', 'right'] as const;
const handlePositions = ['none', 'left', 'right', 'top'] as const;
const additionalOptionTypes = ['sill', 'drip'] as const;
const SUPPORTED_DRIP_DEPTH = 180;

const legacyOpeningTypes = ['single', 'double', 'triple', 'balcony'] as const;

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
const normalizeOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined;
const normalizeOptionalBoolean = (value: boolean | undefined): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;
const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
const normalizeProductionLiteralString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;
const normalizeOptionalEnum = <T extends string>(value: unknown, values: readonly T[]): T | undefined =>
  isOneOf(value, values) ? value : undefined;

const normalizeOpeningType = (value: unknown): OpeningType | undefined => {
  if (isOneOf(value, openingTypes)) {
    return value;
  }

  if (isOneOf(value, legacyOpeningTypes)) {
    return value;
  }

  return undefined;
};

const isMullionOffsets = (value: unknown): value is MullionOffsets => {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, item]) => /^\d+$/.test(key) && typeof item === 'number' && Number.isFinite(item) && item >= 0,
  );
};

const normalizeMullionOffsets = (value: unknown): MullionOffsets | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(([key, item]) => /^\d+$/.test(key) && typeof item === 'number' && Number.isFinite(item) && item >= 0)
    .map(
      ([key, item]) =>
        [String(Math.max(1, Math.trunc(Number.parseInt(key, 10)))), Math.max(0, Math.trunc(item as number))] as const,
    )
    .sort((first, second) => Number(first[0]) - Number(second[0]));

  if (entries.length === 0) {
    return undefined;
  }

  const normalized: MullionOffsets = {};

  for (const [key, offset] of entries) {
    normalized[key] = offset;
  }

  return normalized;
};

const normalizeProductionStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([key, item]) => [key.trim(), typeof item === 'string' ? item : ''] as const)
    .filter(([key, item]) => key.length > 0 && item.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeProductionMullionOffset = (value: unknown): Array<Record<string, number>> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => {
      const entries = Object.entries(item)
        .filter(([key, offset]) => /^\d+$/.test(key) && typeof offset === 'number' && Number.isFinite(offset) && offset >= 0)
        .map(([key, offset]) => [String(Math.max(1, Math.trunc(Number.parseInt(key, 10)))), Math.max(0, Math.trunc(offset as number))]);

      return entries.length > 0 ? Object.fromEntries(entries) : null;
    })
    .filter((item): item is Record<string, number> => item !== null);
};

const normalizeProductionContourId = (value: unknown): CalculatorProductionContourId | undefined =>
  value === 1 || value === 2 || value === 3 ? value : undefined;

const normalizeProductionContours = (value: unknown): CalculatorProductionContour[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => {
      const id = normalizeProductionContourId(item.id);

      if (!id) {
        return null;
      }

      const parameters = Array.isArray(item.parameters)
        ? item.parameters
            .map(normalizeProductionStringRecord)
            .filter((parameter): parameter is Record<string, string> => Boolean(parameter))
        : [];

      return {
        id,
        ...(parameters.length > 0 ? { parameters } : {}),
      };
    })
    .filter((item): item is CalculatorProductionContour => item !== null);
};

const normalizeProductionAccessory = (value: unknown): CalculatorProductionAccessory | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = normalizeOptionalNumber(value.id);
  const article = normalizeOptionalString(value.article);
  const color = normalizeProductionLiteralString(value.color);
  const quantity = normalizeOptionalString(value.quantity);
  const length = normalizeOptionalString(value.length);
  const width = normalizeOptionalString(value.width);

  if (
    typeof id !== 'number' ||
    typeof article !== 'string' ||
    typeof color !== 'string' ||
    typeof quantity !== 'string' ||
    typeof length !== 'string' ||
    typeof width !== 'string'
  ) {
    return undefined;
  }

  return {
    id,
    article,
    color,
    quantity,
    length,
    width,
  };
};

const normalizeProductionAccessories = (value: unknown): CalculatorProductionAccessory[] | undefined => {
  if (Array.isArray(value)) {
    const accessories = value
      .map(normalizeProductionAccessory)
      .filter((accessory): accessory is CalculatorProductionAccessory => Boolean(accessory));

    return accessories.length > 0 ? accessories : undefined;
  }

  const accessory = normalizeProductionAccessory(value);

  return accessory ? [accessory] : undefined;
};

export const normalizeCalculatorProductionQuery = (value: unknown): CalculatorProductionQuery | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const typeId = normalizeOptionalNumber(value.type_id);
  const width = normalizeOptionalNumber(value.width);
  const height = normalizeOptionalNumber(value.height);
  const systemId = normalizeOptionalString(value.system_id);
  const color = normalizeOptionalString(value.color);

  if (
    typeof typeId !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof systemId !== 'string' ||
    typeof color !== 'string'
  ) {
    return undefined;
  }

  const parametersSource = isRecord(value.parameters) ? value.parameters : {};
  const sealColor = normalizeOptionalString(parametersSource.sealColor) ?? '';
  const drainage = normalizeOptionalString(parametersSource.drainage) ?? '';
  const discount = normalizeOptionalString(value.discount);
  const contours = normalizeProductionContours(value.contours);
  const accessories = normalizeProductionAccessories(value.accessories);

  return {
    type_id: typeId,
    width,
    height,
    system_id: systemId,
    color,
    ...(discount ? { discount } : {}),
    mullionOffset: normalizeProductionMullionOffset(value.mullionOffset),
    parameters: {
      sealColor,
      drainage,
    },
    contours,
    ...(accessories ? { accessories } : {}),
  };
};

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
    isOptionalOneOf(value.sillType, sillTypes) &&
    isOptionalOneOf(value.sillColor, sillColors) &&
    isOptionalOneOf(value.dripColor, dripColors)
  );
};

const normalizeAdditionalOption = (option: CalculatorAdditionalOption): CalculatorAdditionalOption => {
  const normalized: CalculatorAdditionalOption = {
    id: normalizePositionId(option.id),
    type: normalizeOptionalEnum(option.type, additionalOptionTypes) ?? 'sill',
  };

  const length = normalizeOptionalNumber(option.length);
  const width = normalizeOptionalNumber(option.width);
  const sillType = normalizeOptionalEnum(option.sillType, sillTypes);
  const sillColor = normalizeOptionalEnum(option.sillColor, sillColors);
  const dripColor = normalizeOptionalEnum(option.dripColor, dripColors);

  if (typeof length === 'number') {
    normalized.length = length;
  }
  if (normalized.type === 'drip') {
    normalized.width = SUPPORTED_DRIP_DEPTH;
  } else if (typeof width === 'number') {
    normalized.width = width;
  }
  if (sillType) {
    normalized.sillType = sillType;
  }
  if (sillColor) {
    normalized.sillColor = sillColor;
  }
  if (dripColor) {
    normalized.dripColor = dripColor;
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
    isOptionalNumber(value.serverPrice) &&
    isOptionalNumber(value.customerPrice) &&
    isOptionalNumber(value.dealerDiscountPercent) &&
    isOptionalNumber(value.dealerProfitAmount) &&
    isOptionalString(value.dealerProfitCode) &&
    (typeof value.openingType === 'undefined' || normalizeOpeningType(value.openingType) !== undefined) &&
    isOptionalString(value.profileId) &&
    isOptionalOneOf(value.packageType, packageTypes) &&
    isOptionalOneOf(value.sealColor, sealColors) &&
    isOptionalOneOf(value.drainage, drainageTypes) &&
    isOptionalOneOf(value.windowColorSide, windowColorSides) &&
    isOptionalOneOf(value.windowColor, windowColors) &&
    isOptionalOneOf(value.handleType, handleTypes) &&
    isOptionalOneOf(value.handleColor, handleColors) &&
    isOptionalOneOf(value.mullionOrientation, mullionOrientations) &&
    (typeof value.mullionOffsets === 'undefined' || isMullionOffsets(value.mullionOffsets)) &&
    (typeof value.additionalOptions === 'undefined' ||
      (Array.isArray(value.additionalOptions) && value.additionalOptions.every(isCalculatorAdditionalOption))) &&
    (typeof value.sashes === 'undefined' || (Array.isArray(value.sashes) && value.sashes.every(isCalculatorSashConfig))) &&
    isOptionalOneOf(value.leftSashMode, openingModes) &&
    isOptionalOneOf(value.rightSashMode, openingModes) &&
    isOptionalBoolean(value.mosquitoScreenEnabled) &&
    isOptionalBoolean(value.turnTiltHardware) &&
    isOptionalBoolean(value.childLock) &&
    isOptionalBoolean(value.extSillEnabled) &&
    isOptionalBoolean(value.intSillEnabled) &&
    isOptionalBoolean(value.underSillEnabled) &&
    (typeof value.productionQuery === 'undefined' ||
      normalizeCalculatorProductionQuery(value.productionQuery) !== undefined)
  );
};

export const normalizeCalculatorPosition = (position: CalculatorPosition): CalculatorPosition => {
  const normalized: CalculatorPosition = {
    id: normalizePositionId(position.id),
  };

  const width = normalizeOptionalNumber(position.width);
  const height = normalizeOptionalNumber(position.height);
  const price = normalizeOptionalNumber(position.price);
  const serverPrice = normalizeOptionalNumber(position.serverPrice);
  const customerPrice = normalizeOptionalNumber(position.customerPrice);
  const dealerDiscountPercent = normalizeOptionalNumber(position.dealerDiscountPercent);
  const dealerProfitAmount = normalizeOptionalNumber(position.dealerProfitAmount);
  const dealerProfitCode = normalizeOptionalString(position.dealerProfitCode);
  const openingType = normalizeOpeningType(position.openingType);
  const profileId = normalizeOptionalString(position.profileId);
  const packageType = normalizeOptionalEnum(position.packageType, packageTypes);
  const sealColor = normalizeOptionalEnum(position.sealColor, sealColors);
  const drainage = normalizeOptionalEnum(position.drainage, drainageTypes);
  const windowColorSide = normalizeOptionalEnum(position.windowColorSide, windowColorSides);
  const windowColor = normalizeOptionalEnum(position.windowColor, windowColors);
  const handleType = normalizeOptionalEnum(position.handleType, handleTypes);
  const handleColor = normalizeOptionalEnum(position.handleColor, handleColors);
  const mullionOrientation = normalizeOptionalEnum(position.mullionOrientation, mullionOrientations);
  const mullionOffsets = normalizeMullionOffsets(position.mullionOffsets);
  const additionalOptions = Array.isArray(position.additionalOptions)
    ? position.additionalOptions.filter(isCalculatorAdditionalOption).map(normalizeAdditionalOption)
    : [];
  const sashes = Array.isArray(position.sashes) ? position.sashes.filter(isCalculatorSashConfig).map(normalizeSashConfig) : [];
  const leftSashMode = normalizeOptionalEnum(position.leftSashMode, openingModes);
  const rightSashMode = normalizeOptionalEnum(position.rightSashMode, openingModes);
  const mosquitoScreenEnabled = normalizeOptionalBoolean(position.mosquitoScreenEnabled);
  const turnTiltHardware = normalizeOptionalBoolean(position.turnTiltHardware);
  const childLock = normalizeOptionalBoolean(position.childLock);
  const extSillEnabled = normalizeOptionalBoolean(position.extSillEnabled);
  const intSillEnabled = normalizeOptionalBoolean(position.intSillEnabled);
  const underSillEnabled = normalizeOptionalBoolean(position.underSillEnabled);
  const productionQuery = normalizeCalculatorProductionQuery(position.productionQuery);

  if (typeof width === 'number') {
    normalized.width = width;
  }
  if (typeof height === 'number') {
    normalized.height = height;
  }
  if (typeof price === 'number') {
    normalized.price = price;
  }
  if (typeof serverPrice === 'number') {
    normalized.serverPrice = serverPrice;
  }
  if (typeof customerPrice === 'number') {
    normalized.customerPrice = customerPrice;
  }
  if (typeof dealerDiscountPercent === 'number') {
    normalized.dealerDiscountPercent = dealerDiscountPercent;
  }
  if (typeof dealerProfitAmount === 'number') {
    normalized.dealerProfitAmount = dealerProfitAmount;
  }
  if (dealerProfitCode) {
    normalized.dealerProfitCode = dealerProfitCode;
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
  if (windowColorSide) {
    normalized.windowColorSide = windowColorSide;
  }
  if (windowColor) {
    normalized.windowColor = windowColor;
  }
  if (handleType) {
    normalized.handleType = handleType;
  }
  if (handleColor) {
    normalized.handleColor = handleColor;
  }
  if (mullionOrientation) {
    normalized.mullionOrientation = mullionOrientation;
  }
  if (mullionOffsets) {
    normalized.mullionOffsets = mullionOffsets;
  }
  if (additionalOptions.length > 0) {
    normalized.additionalOptions = additionalOptions;
  }
  if (sashes.length > 0) {
    normalized.sashes = sashes;
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
  if (productionQuery) {
    normalized.productionQuery = productionQuery;
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
