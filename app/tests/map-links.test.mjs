import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Compile the real pure helper using the project's existing TypeScript dependency.
const source = await readFile(new URL('../src/features/leads/model/map-links.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { getYandexMapHref, getYandexMapEmbedHref, getYandexRouteHref } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const location = { region: 'Регион', city: 'Город', latitude: 42.01696165, longitude: 47.251198648782 };

test('map and embedded marker use longitude,latitude without losing precision', () => {
  for (const [href, path] of [[getYandexMapHref(location), '/maps/'], [getYandexMapEmbedHref(location), '/map-widget/v1/']]) {
    const url = new URL(href);
    assert.equal(url.origin, 'https://yandex.ru');
    assert.equal(url.pathname, path);
    assert.equal(url.searchParams.get('ll'), '47.251198648782,42.01696165');
    assert.equal(url.searchParams.get('pt'), '47.251198648782,42.01696165,pm2rdm');
    assert.equal(url.searchParams.get('z'), '16');
  }
});

test('address search safely encodes Cyrillic and reserved characters', () => {
  const address = 'Москва, улица Тестовая, 5 & корпус #2';
  const noCoordinates = { region: 'Область', city: 'Москва', address };
  assert.equal(new URL(getYandexMapHref(noCoordinates)).searchParams.get('text'), address);
  assert.equal(getYandexMapEmbedHref(noCoordinates), null);
  assert.equal(new URL(getYandexMapHref({ ...noCoordinates, address: '' })).searchParams.get('text'), 'Москва, Область');
});

test('zero and negative coordinates remain valid', () => {
  for (const [latitude, longitude] of [[0, 0], [-42, -47], [-90, -180], [90, 180]]) {
    assert.ok(getYandexMapEmbedHref({ ...location, latitude, longitude }));
  }
});

test('missing, nonfinite, nonnumeric and out-of-range coordinates fall back safely', () => {
  for (const override of [{ latitude: undefined }, { longitude: undefined }, { latitude: NaN }, { longitude: Infinity }, { latitude: 91 }, { longitude: -181 }, { latitude: null }, { longitude: '47' }]) {
    const invalid = { ...location, ...override };
    assert.equal(getYandexMapEmbedHref(invalid), null);
    assert.equal(new URL(getYandexMapHref(invalid)).searchParams.get('text'), 'Город, Регион');
    assert.equal(getYandexRouteHref(invalid, location), null);
    assert.equal(getYandexRouteHref(location, invalid), null);
  }
  assert.equal(getYandexRouteHref(undefined, location), null);
});

test('driving route keeps origin/destination order and uses latitude,longitude', () => {
  const url = new URL(getYandexRouteHref({ ...location, latitude: 0, longitude: 0 }, location));
  assert.equal(url.origin, 'https://yandex.ru');
  assert.equal(url.searchParams.get('mode'), 'routes');
  assert.equal(url.searchParams.get('rtt'), 'auto');
  assert.equal(url.searchParams.get('rtext'), '0,0~42.01696165,47.251198648782');
});
