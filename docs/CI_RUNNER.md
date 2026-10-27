# GitHub Actions: browser-e2e runner (MajesticToolkit 1.5.4)

## Исправленная ошибка

26 октября 2026 года workflow `Verify MajesticToolkit` в GitHub Actions (например, [run 40285242118](https://github.com/TheSkiF4er/MajesticToolkit/actions/runs/40285242118)) завершался с ошибкой в шаге **Install reproducible browser test runtime**:

```text
BEWARE: your OS is not officially supported by Playwright; installing dependencies for ubuntu26.04-x64 as a fallback.
Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.57.0-beta-1764944708000!
Failed to install browsers
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

`ubuntu-latest` перешёл на Ubuntu 26.04, которая несовместима с зафиксированным в проекте Playwright Python 1.57.0. Сборка `test-and-build` при этом завершалась успешно.

## Решение

В актуальных `.github/workflows/verify.yml` и `.github/workflows/release-check.yml` только для `browser-e2e` зафиксирован `runs-on: ubuntu-24.04`. Пакет Playwright, установку браузеров Chromium и Firefox, а также сами E2E-тесты **не отключали**.

Добавлены регрессионные тесты `tests/ci-runner.test.mjs`, которые проверяют совместимый runner, версию Playwright и наличие реального запуска двух браузеров. Тесты входят в `npm run verify`.

## Проверка после внесения изменений

1. Наложите патч поверх соответствующего исходного дерева и отправьте изменения в новую ветку либо `main`.
2. Откройте новый запуск **Verify MajesticToolkit**, созданный новым коммитом. Старый запуск при повторе исполняет прежнюю версию workflow и сам по себе не проверяет исправление.
3. Убедитесь, что job `test-and-build` и job `browser-e2e` завершились успешно. Для `browser-e2e` должны пройти установка Playwright и Chromium/Firefox DOM E2E.
4. Для тегов `v*` аналогичное условие применяется к workflow `Stable release checks`.

**Ограничение:** локальные тесты YAML и `npm run verify` не доказывают успех удалённой установки браузеров. Окончательное подтверждение — только новый завершённый GitHub Actions run на `ubuntu-24.04`.

**Исторический workflow:** `.github/workflows/publish-1.5.0.yml` обслуживает уже опубликованный релиз 1.5.0. Этот файл не менялся, чтобы не запускать устаревший workflow на новых исходниках 1.5.4 при событии `push` в `main`.
