import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Info,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  readCalculatorPositions,
  writeCalculatorPositions,
  type CalculatorPosition,
} from '@/features/calculator/model/positions.storage';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';

type WizardStep = 1 | 2 | 3 | 4 | 5;
type PackageType = 'budget' | 'standard' | 'premium';
type OpeningType = 'single' | 'double' | 'triple' | 'balcony';
type SealColor = 'black' | 'gray' | 'white';
type DrainageType = 'front' | 'hidden';
type Sash = 'left' | 'right';
type OpeningMode = 'fixed' | 'turn' | 'tilt_turn' | 'fanlight';
type SillBrand = 'moeller' | 'danke' | 'crystallit' | 'vitrage';
type DripMaterial = 'aluminum' | 'polyester' | 'galvanized';

interface CalculatorLocationState {
  resetPositions?: boolean;
  startStep?: WizardStep;
  returnTo?: string;
}

const wizardSteps: Array<{ id: WizardStep; title: string }> = [
  { id: 1, title: 'Состав заказа' },
  { id: 2, title: 'Форма и размер' },
  { id: 3, title: 'Выбор профиля' },
  { id: 4, title: 'Открывание створок' },
  { id: 5, title: 'Доп. опции' },
];
const CALCULATOR_FIRST_STEP: WizardStep = 2;
const CALCULATOR_TOTAL_STEPS = 4;
// const calculatorSteps = wizardSteps.filter((step) => step.id >= CALCULATOR_FIRST_STEP);

const openingTypes: Array<{ id: OpeningType; label: string }> = [
  { id: 'single', label: '1 створка' },
  { id: 'double', label: '2 створки' },
  { id: 'triple', label: '3 створки' },
  { id: 'balcony', label: 'Балкон' },
];

const profileCatalog = [
  {
    id: 'rula-58',
    label: 'Rula 58мм',
    description: 'Базовый профиль для простых решений',
    pricePerSquare: 3200,
  },
  {
    id: 'isotech-58',
    label: 'Isotech 58мм',
    description: 'Надежный профиль по доступной цене',
    pricePerSquare: 3500,
  },
  {
    id: 'grunder-60',
    label: 'Grunder 60 мм',
    description: 'Оптимальное соотношение цены и тепла',
    pricePerSquare: 4100,
  },
  {
    id: 'wintech-70',
    label: 'Wintech 70мм класс А',
    description: 'Повышенная теплоизоляция, класс А',
    pricePerSquare: 4700,
  },
  {
    id: 'exprof-arctica',
    label: 'Exprof Arctica',
    description: 'Для холодных регионов и больших проемов',
    pricePerSquare: 4900,
  },
  {
    id: 'profecta-plus',
    label: 'Profecta Plus',
    description: 'Премиальная серия с тихим контуром',
    pricePerSquare: 5600,
  },
] as const;

type ProfileId = (typeof profileCatalog)[number]['id'];

const packageLabels: Array<{ id: PackageType; label: string; multiplier: number }> = [
  { id: 'budget', label: 'Бюджет', multiplier: 1 },
  { id: 'standard', label: 'Стандарт', multiplier: 1.12 },
  { id: 'premium', label: 'Премиум', multiplier: 1.26 },
];

const openingModeOptions: Array<{ id: OpeningMode; label: string; description: string; extra: number }> = [
  { id: 'fixed', label: 'Глухое', description: 'Без открывания', extra: 0 },
  { id: 'turn', label: 'Поворотное', description: 'Открытие в сторону', extra: 900 },
  { id: 'tilt_turn', label: 'Поворотно-откидное', description: 'Универсальное', extra: 1500 },
  { id: 'fanlight', label: 'Фрамужное', description: 'Только верх', extra: 700 },
];

const accessoryList = [
  { id: 'ext-sill', label: 'Внешний отлив (сталь)', price: 24 },
  { id: 'int-sill', label: 'Внутренний подоконник (ПВХ)', price: 18 },
  { id: 'under-sill', label: 'Подставочный профиль (30 мм)', price: 8.5 },
] as const;

const nextStepMap: Record<WizardStep, WizardStep> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 5,
};

const prevStepMap: Record<WizardStep, WizardStep> = {
  1: 1,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
};

const openingMultiplier: Record<OpeningType, number> = {
  single: 1,
  double: 1.48,
  triple: 1.93,
  balcony: 2.12,
};

const sealColorExtra: Record<SealColor, number> = {
  black: 0,
  gray: 180,
  white: 220,
};

const drainageExtra: Record<DrainageType, number> = {
  front: 0,
  hidden: 420,
};

const dripMaterialExtra: Record<DripMaterial, number> = {
  aluminum: 350,
  polyester: 210,
  galvanized: 120,
};

const sillBrandExtra: Record<SillBrand, number> = {
  moeller: 620,
  danke: 560,
  crystallit: 490,
  vitrage: 450,
};

const isWizardStep = (value: unknown): value is WizardStep =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5;

const clampDimension = (value: number): number => Math.max(500, Math.min(3200, value));

const Toggle = ({ checked, onToggle }: { checked: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className={cn(
      'relative inline-flex h-6 w-11 items-center border border-slate-300 transition-colors',
      checked ? 'bg-brand-500' : 'bg-slate-200',
    )}
  >
    <span
      className={cn(
        'inline-block h-5 w-5 bg-surface transition-transform',
        checked ? 'translate-x-5 border border-brand-500' : 'translate-x-1 border border-slate-400',
      )}
    />
  </button>
);

export const CalculatorPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as CalculatorLocationState | null;
  const shouldResetPositions = locationState?.resetPositions === true;
  const initialStep = isWizardStep(locationState?.startStep) ? locationState.startStep : CALCULATOR_FIRST_STEP;
  const returnTo =
    typeof locationState?.returnTo === 'string' && locationState.returnTo.length > 0
      ? locationState.returnTo
      : '/orders/new';

  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep);
  const [selectedProfile, setSelectedProfile] = useState<ProfileId>('grunder-60');
  const [selectedPackage, setSelectedPackage] = useState<PackageType>('standard');
  const [selectedOpeningType, setSelectedOpeningType] = useState<OpeningType>('double');
  const [sealColor, setSealColor] = useState<SealColor>('black');
  const [drainage, setDrainage] = useState<DrainageType>('front');
  const [height, setHeight] = useState(1400);
  const [width, setWidth] = useState(1300);
  const [mosquitoScreenEnabled, setMosquitoScreenEnabled] = useState(true);
  const [selectedAccessories, setSelectedAccessories] = useState<Record<string, boolean>>({
    'ext-sill': false,
    'int-sill': true,
    'under-sill': false,
  });
  const [positions, setPositions] = useState<CalculatorPosition[]>(() =>
    shouldResetPositions ? [] : readCalculatorPositions(),
  );
  const [activeSash, setActiveSash] = useState<Sash>('left');
  const [sashModes, setSashModes] = useState<Record<Sash, OpeningMode>>({
    left: 'tilt_turn',
    right: 'fixed',
  });
  const [sillDepth, setSillDepth] = useState(300);
  const [sillBrand, setSillBrand] = useState<SillBrand>('moeller');
  const [dripWidth, setDripWidth] = useState(150);
  const [dripMaterial, setDripMaterial] = useState<DripMaterial>('aluminum');
  const [turnTiltHardware, setTurnTiltHardware] = useState(false);
  const [childLock, setChildLock] = useState(false);

  const selectedProfileConfig = profileCatalog.find((profile) => profile.id === selectedProfile) ?? profileCatalog[0];
  const selectedPackageConfig = packageLabels.find((item) => item.id === selectedPackage) ?? packageLabels[1];
  const selectedOpeningConfig = openingTypes.find((item) => item.id === selectedOpeningType) ?? openingTypes[0];

  const totalPrice = useMemo(() => {
    const area = (width * height) / 1_000_000;
    const baseCost = area * selectedProfileConfig.pricePerSquare * openingMultiplier[selectedOpeningType];
    const openingCost = openingModeOptions.reduce((acc, option) => {
      if (sashModes.left === option.id) {
        acc += option.extra;
      }
      if (sashModes.right === option.id) {
        acc += option.extra;
      }
      return acc;
    }, 0);

    const accessoriesCost = accessoryList.reduce((acc, accessory) => {
      if (!selectedAccessories[accessory.id]) {
        return acc;
      }

      return acc + accessory.price * 100;
    }, 0);

    const optionsCost =
      (mosquitoScreenEnabled ? 900 : 0) +
      (turnTiltHardware ? 1400 : 0) +
      (childLock ? 700 : 0) +
      sealColorExtra[sealColor] +
      drainageExtra[drainage] +
      dripMaterialExtra[dripMaterial] +
      sillBrandExtra[sillBrand] +
      dripWidth * 2 +
      sillDepth * 1.8;

    return Math.round((baseCost + openingCost + accessoriesCost + optionsCost) * selectedPackageConfig.multiplier);
  }, [
    childLock,
    drainage,
    dripMaterial,
    dripWidth,
    height,
    mosquitoScreenEnabled,
    sashModes,
    sealColor,
    selectedAccessories,
    selectedOpeningType,
    selectedPackageConfig.multiplier,
    selectedProfileConfig.pricePerSquare,
    sillBrand,
    sillDepth,
    turnTiltHardware,
    width,
  ]);

  const orderPositions = useMemo(
    () =>
      positions.map((position, index) => {
        const sizeWidth = clampDimension(width + index * 80);
        const sizeHeight = clampDimension(height + index * 60);
        const price = Math.round(totalPrice * (1 + index * 0.18));

        return {
          ...position,
          opening: selectedOpeningConfig.label,
          profile: selectedProfileConfig.label,
          width: sizeWidth,
          height: sizeHeight,
          price,
        };
      }),
    [height, positions, selectedOpeningConfig.label, selectedProfileConfig.label, totalPrice, width],
  );

  useEffect(() => {
    const positionsForStorage: CalculatorPosition[] = orderPositions.map((position) => ({
      id: position.id,
      width: position.width,
      height: position.height,
      price: position.price,
    }));

    writeCalculatorPositions(positionsForStorage);
  }, [orderPositions]);

  const displayStep = Math.min(CALCULATOR_TOTAL_STEPS, Math.max(1, currentStep - 1));
  const headerTitle = wizardSteps.find((step) => step.id === currentStep)?.title ?? 'Калькулятор';
  const isLastStep = currentStep === 5;

  const footerPrice = totalPrice;
  const footerLabel = 'Стоимость';

  const toggleAccessory = (id: string): void => {
    setSelectedAccessories((state) => ({
      ...state,
      [id]: !state[id],
    }));
  };

  const adjustDimension = (type: 'width' | 'height', delta: number): void => {
    if (type === 'width') {
      setWidth((value) => clampDimension(value + delta));
      return;
    }

    setHeight((value) => clampDimension(value + delta));
  };

  const applyDimensionFromInput = (value: string, type: 'width' | 'height'): void => {
    const digits = value.replace(/\D/g, '');
    const nextValue = digits ? clampDimension(Number.parseInt(digits, 10)) : 500;

    if (type === 'width') {
      setWidth(nextValue);
      return;
    }

    setHeight(nextValue);
  };

  const addPosition = (): void => {
    setPositions((state) => {
      const nextId = state.length > 0 ? Math.max(...state.map((item) => item.id)) + 1 : 1;

      return [...state, { id: nextId }];
    });
  };

  const handleAddWindow = (): void => {
    addPosition();
    setCurrentStep(2);
  };

  const copyPosition = (positionId: number): void => {
    setPositions((state) => {
      const source = state.find((item) => item.id === positionId);

      if (!source) {
        return state;
      }

      const nextId = Math.max(...state.map((item) => item.id)) + 1;

      return [...state, { ...source, id: nextId }];
    });
  };

  const removePosition = (positionId: number): void => {
    setPositions((state) => state.filter((item) => item.id !== positionId));
  };

  const goBack = (): void => {
    if (currentStep === 1 || currentStep === initialStep) {
      navigate(returnTo);
      return;
    }

    setCurrentStep(prevStepMap[currentStep]);
  };

  const goNext = (): void => {
    if (isLastStep) {
      navigate(returnTo);
      return;
    }

    setCurrentStep(nextStepMap[currentStep]);
  };

  const openingModeForActiveSash = sashModes[activeSash];

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] bg-surface shadow-panel">
        <header className="border-b border-slate-200 px-4 pb-4 pt-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 bg-slate-100 text-ink-700 transition-colors hover:bg-slate-200"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-center text-base font-extrabold text-ink-800">
              {`Шаг ${displayStep} из ${CALCULATOR_TOTAL_STEPS}: ${headerTitle}`}
            </h1>
            {currentStep === CALCULATOR_FIRST_STEP ? (
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="px-2 text-sm font-semibold text-slate-500 hover:text-ink-700"
              >
                Отмена
              </button>
            )}
          </div>

          {/* <div className="flex items-center gap-1">
            {calculatorSteps.map((step) => (
              <span
                key={step.id}
                className={cn(
                  'h-1.5 flex-1 border border-slate-300 bg-slate-200 transition-colors',
                  step.id <= currentStep && 'border-brand-500 bg-brand-500',
                )}
              />
            ))}
          </div> */}
        </header>

        <section className="space-y-5 px-4 pb-36 pt-4">
          {currentStep === 1 ? (
            <section className="space-y-4">
              <article className="border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-12 w-12 items-center justify-center bg-slate-100 text-brand-500">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-ink-800">Новый клиент</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        Адрес будет заполнен в заказе
                      </p>
                    </div>
                  </div>
                  <span className="border border-slate-300 bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-600">
                    Черновик
                  </span>
                </div>
              </article>

              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-extrabold text-ink-800">Позиции</h2>
                <span className="text-sm font-semibold text-slate-500">{positions.length} шт.</span>
              </div>

              {orderPositions.length === 0 ? (
                <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
                  Пока нет добавленных окон
                </div>
              ) : null}
              <div className="space-y-3">
                {orderPositions.map((position) => (
                  <article key={position.id} className="border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="inline-flex h-20 w-20 items-center justify-center border border-slate-300 bg-slate-100">
                        <div className="h-10 w-10 border border-slate-400">
                          <div className="h-full w-1/2 border-r border-slate-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xl font-extrabold text-ink-800">
                          Позиция {position.id}
                        </p>
                        <p className="text-sm font-medium text-slate-500">{position.opening}</p>
                        <p className="mt-2 text-[28px] font-extrabold leading-none text-ink-800">
                          {position.width} x {position.height} мм
                        </p>
                        <p className="mt-1 text-sm text-slate-500">{position.profile}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
                      <p className="text-[32px] font-extrabold leading-none text-ink-800">
                        {formatCurrency(position.price)}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyPosition(position.id)}
                          className="inline-flex h-9 items-center gap-1 border border-slate-300 bg-slate-100 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 bg-slate-100 text-brand-500 hover:bg-slate-200"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePosition(position.id)}
                          className="inline-flex h-9 w-9 items-center justify-center border border-slate-300 bg-slate-100 text-slate-400 hover:bg-slate-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddWindow}
                className="flex h-12 w-full items-center justify-center gap-2 border border-brand-400 bg-brand-50 text-base font-bold text-brand-600 hover:bg-brand-100"
              >
                <Plus className="h-5 w-5" />
                Добавить еще одно окно
              </button>
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section className="space-y-6">
              <div>
                <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">Тип конструкции</h2>
                <div className="grid grid-cols-2 gap-3">
                  {openingTypes.map((type) => {
                    const isActive = selectedOpeningType === type.id;

                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedOpeningType(type.id)}
                        className={cn(
                          'border px-3 py-3 text-left transition-colors',
                          isActive
                            ? 'border-brand-500 bg-brand-50 shadow-sm'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                        )}
                      >
                        <span className="mb-3 block h-14 border border-slate-300 bg-slate-100" />
                        <span className="text-sm font-bold text-ink-700">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">Размеры</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => adjustDimension('width', -50)}
                      className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <label className="flex h-12 flex-1 items-center justify-center gap-2 border border-brand-400 bg-slate-50 px-3">
                      <input
                        value={width}
                        inputMode="numeric"
                        onChange={(event) => applyDimensionFromInput(event.target.value, 'width')}
                        className="w-full border-none bg-transparent text-center text-[34px] font-extrabold leading-none text-ink-800 outline-none"
                      />
                      <span className="text-sm font-semibold text-slate-500">мм</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => adjustDimension('width', 50)}
                      className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => adjustDimension('height', -50)}
                      className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <label className="flex h-12 flex-1 items-center justify-center gap-2 border border-slate-300 bg-slate-50 px-3">
                      <input
                        value={height}
                        inputMode="numeric"
                        onChange={(event) => applyDimensionFromInput(event.target.value, 'height')}
                        className="w-full border-none bg-transparent text-center text-[34px] font-extrabold leading-none text-ink-800 outline-none"
                      />
                      <span className="text-sm font-semibold text-slate-500">мм</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => adjustDimension('height', 50)}
                      className="inline-flex h-12 w-12 items-center justify-center border border-slate-300 bg-slate-50 text-slate-600"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section className="space-y-4">
              <div>
                <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">Комплектация</h2>
                <div className="grid grid-cols-3 gap-2">
                  {packageLabels.map((item) => {
                    const isActive = item.id === selectedPackage;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedPackage(item.id)}
                        className={cn(
                          'h-11 border text-sm font-semibold transition-colors',
                          isActive
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300',
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <h2 className="text-[30px] font-extrabold leading-none text-ink-800">Варианты профилей</h2>
              <div className="space-y-2">
                {profileCatalog.map((profile) => {
                  const isActive = selectedProfile === profile.id;

                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedProfile(profile.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 border px-3 py-3 text-left transition-colors',
                        isActive
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-20 w-16 border border-slate-300 bg-slate-100" />
                        <div>
                          <p className="text-2xl font-extrabold leading-none">{profile.label}</p>
                          <p className="mt-1 text-sm text-slate-500">{profile.description}</p>
                          <p className="mt-2 text-[28px] font-extrabold leading-none">
                            {formatCurrency(profile.pricePerSquare)}/м²
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'flex-shrink-0 inline-flex h-6 w-6 items-center justify-center border',
                          isActive
                            ? 'border-brand-500 bg-brand-500 text-surface'
                            : 'border-slate-300 bg-slate-100 text-slate-100',
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {currentStep === 4 ? (
            <section className="space-y-4">
              <div className="border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Конфигурация: {width}x{height}мм
                </p>
                <div className="grid h-44 grid-cols-2 border border-slate-300 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setActiveSash('left')}
                    className={cn(
                      'relative border-r border-slate-300 px-2 py-2 text-left',
                      activeSash === 'left' && 'bg-brand-50',
                    )}
                  >
                    <span className="text-xs font-semibold text-slate-500">Левая створка</span>
                    <span
                      className={cn(
                        'absolute inset-2 border border-slate-400',
                        activeSash === 'left' && 'border-brand-500',
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSash('right')}
                    className={cn('relative px-2 py-2 text-left', activeSash === 'right' && 'bg-brand-50')}
                  >
                    <span className="text-xs font-semibold text-slate-500">Правая створка</span>
                    <span
                      className={cn(
                        'absolute inset-2 border border-slate-400',
                        activeSash === 'right' && 'border-brand-500',
                      )}
                    />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setActiveSash('left')}
                  className={cn(
                    'h-10 text-sm font-semibold transition-colors',
                    activeSash === 'left' ? 'bg-slate-50 text-ink-700 shadow-sm' : 'text-slate-500',
                  )}
                >
                  Левая створка
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSash('right')}
                  className={cn(
                    'h-10 text-sm font-semibold transition-colors',
                    activeSash === 'right' ? 'bg-slate-50 text-ink-700 shadow-sm' : 'text-slate-500',
                  )}
                >
                  Правая створка
                </button>
              </div>

              <div>
                <h2 className="mb-3 text-2xl font-extrabold text-ink-800">Тип открывания</h2>
                <p className="mb-3 text-sm text-slate-500">
                  Выберите механизм для {activeSash === 'left' ? 'левой' : 'правой'} створки
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {openingModeOptions.map((option) => {
                    const isActive = openingModeForActiveSash === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSashModes((state) => ({ ...state, [activeSash]: option.id }))}
                        className={cn(
                          'border px-3 py-3 text-left transition-colors',
                          isActive
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                        )}
                      >
                        <div className="mb-2 h-10 w-10 border border-slate-300 bg-slate-100" />
                        <p className="text-sm font-extrabold">{option.label}</p>
                        <p className="text-xs text-slate-500">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          {currentStep === 5 ? (
            <section className="space-y-4">
              <article className="border border-slate-200 bg-slate-50 px-3 py-3">
                <h2 className="mb-3 text-lg font-extrabold text-ink-800">Подоконники</h2>
                <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-500">Глубина</span>
                  <span className="text-brand-600">{sillDepth} мм</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={600}
                  step={10}
                  value={sillDepth}
                  onChange={(event) => setSillDepth(Number(event.target.value))}
                  className="w-full accent-brand-500"
                />

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {([
                    { id: 'moeller', label: 'Moeller' },
                    { id: 'danke', label: 'Danke' },
                    { id: 'crystallit', label: 'Crystallit' },
                    { id: 'vitrage', label: 'Vitrage' },
                  ] as Array<{ id: SillBrand; label: string }>).map((brand) => {
                    const isActive = sillBrand === brand.id;

                    return (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() => setSillBrand(brand.id)}
                        className={cn(
                          'h-10 border text-sm font-semibold transition-colors',
                          isActive
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300',
                        )}
                      >
                        {brand.label}
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className="border border-slate-200 bg-slate-50 px-3 py-3">
                <h2 className="mb-3 text-lg font-extrabold text-ink-800">Отливы</h2>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDripWidth((value) => Math.max(80, value - 10))}
                    className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 bg-slate-100 text-slate-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex h-10 flex-1 items-center justify-center border border-slate-300 bg-slate-100 text-lg font-extrabold text-ink-800">
                    {dripWidth} мм
                  </div>
                  <button
                    type="button"
                    onClick={() => setDripWidth((value) => Math.min(400, value + 10))}
                    className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 bg-slate-100 text-slate-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'aluminum', label: 'Алюминий' },
                    { id: 'polyester', label: 'Полиэстер' },
                    { id: 'galvanized', label: 'Оцинковка' },
                  ] as Array<{ id: DripMaterial; label: string }>).map((item) => {
                    const isActive = dripMaterial === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDripMaterial(item.id)}
                        className={cn(
                          'h-10 border text-xs font-semibold transition-colors',
                          isActive
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300',
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className="space-y-3 border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink-700">Москитная сетка</p>
                    <p className="text-xs text-slate-500">Стандартный антимоскит</p>
                  </div>
                  <Toggle checked={mosquitoScreenEnabled} onToggle={() => setMosquitoScreenEnabled((value) => !value)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink-700">Поворотно-откидной</p>
                    <p className="text-xs text-slate-500">Механизм открывания</p>
                  </div>
                  <Toggle checked={turnTiltHardware} onToggle={() => setTurnTiltHardware((value) => !value)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink-700">Детский замок</p>
                    <p className="text-xs text-slate-500">Блокировка ручки</p>
                  </div>
                  <Toggle checked={childLock} onToggle={() => setChildLock((value) => !value)} />
                </div>
              </article>

              <article className="border border-slate-200 bg-slate-50 px-3 py-3">
                <h2 className="mb-3 text-lg font-extrabold text-ink-800">Дополнительно</h2>

                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет уплотнителя</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'black', label: 'Черный' },
                      { id: 'gray', label: 'Серый' },
                      { id: 'white', label: 'Белый' },
                    ] as Array<{ id: SealColor; label: string }>).map((item) => {
                      const isActive = sealColor === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSealColor(item.id)}
                          className={cn(
                            'h-10 border text-sm font-semibold transition-colors',
                            isActive
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300',
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Дренаж</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDrainage('front')}
                      className={cn(
                        'h-10 border text-sm font-semibold transition-colors',
                        drainage === 'front'
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300',
                      )}
                    >
                      Спереди
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrainage('hidden')}
                      className={cn(
                        'h-10 border text-sm font-semibold transition-colors',
                        drainage === 'hidden'
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300',
                      )}
                    >
                      Скрытый
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {accessoryList.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-300"
                          checked={selectedAccessories[item.id]}
                          onChange={() => toggleAccessory(item.id)}
                        />
                        <span className="font-medium text-ink-700">{item.label}</span>
                      </span>
                      <span className="font-semibold text-brand-600">
                        +{formatCurrency(item.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </label>
                  ))}
                </div>
              </article>
            </section>
          ) : null}
        </section>

        <footer className="fixed bottom-0 left-1/2 z-10 w-[calc(100%-1rem)] max-w-[560px] -translate-x-1/2 border border-slate-200 bg-surface/95 px-4 pb-4 pt-3 shadow-panel backdrop-blur-sm">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{footerLabel}</p>
              <p className="text-[38px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(footerPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 border border-slate-300 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-600">
              <Info className="h-3.5 w-3.5" />
              {`Шаг ${displayStep}/${CALCULATOR_TOTAL_STEPS}`}
            </span>
          </div>
          <Button className="h-12 text-base" onClick={goNext}>
            {isLastStep ? 'Завершить расчет' : 'Далее'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </footer>
      </main>
    </div>
  );
};
