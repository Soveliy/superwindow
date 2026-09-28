import type { LeadLocation } from '@/features/leads/model/leads.types';

type Coordinates = LeadLocation & { latitude: number; longitude: number };

const hasCoordinates = (location: LeadLocation | undefined): location is Coordinates =>
  location !== undefined &&
  typeof location.latitude === 'number' && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
  typeof location.longitude === 'number' && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;

export const getLocationLabel = (location: LeadLocation): string =>
  location.address?.trim() || [location.city, location.region].filter(Boolean).join(', ');

const pointParams = (location: Coordinates): URLSearchParams => {
  // Map centers and markers use longitude,latitude; routes use the reverse order.
  const point = `${location.longitude},${location.latitude}`;
  return new URLSearchParams({ ll: point, pt: `${point},pm2rdm`, z: '16', l: 'map', lang: 'ru_RU' });
};

export const getYandexMapHref = (location: LeadLocation): string => {
  const params = hasCoordinates(location)
    ? pointParams(location)
    : new URLSearchParams({ text: getLocationLabel(location) });
  return `https://yandex.ru/maps/?${params}`;
};

export const getYandexMapEmbedHref = (location: LeadLocation): string | null =>
  hasCoordinates(location) ? `https://yandex.ru/map-widget/v1/?${pointParams(location)}` : null;

export const getYandexRouteHref = (origin: LeadLocation | undefined, destination: LeadLocation): string | null => {
  if (!hasCoordinates(origin) || !hasCoordinates(destination)) return null;

  const params = new URLSearchParams({
    mode: 'routes',
    rtext: `${origin.latitude},${origin.longitude}~${destination.latitude},${destination.longitude}`,
    rtt: 'auto',
  });
  return `https://yandex.ru/maps/?${params}`;
};
