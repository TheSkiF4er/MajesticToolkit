# MajesticToolkit v1.5.3 — Chromium & Safari Installation

Релиз 1.5.3 браузерного расширения **MajesticToolkit** для Majestic RP, Russia Online и других RP-сценариев.

Обновление включает исправления функциональности после 1.5.0 и инструкции установки сборок Chromium и Safari.

## Изменения 1.5.3
- Добавлены пошаговые инструкции установки Chromium ZIP в Chrome, Microsoft Edge и Brave через режим разработчика.
- Документирована установка Safari WebExtension на macOS: временная загрузка из меню разработчика либо упаковка приложения через Xcode и `safari-web-extension-packager`.
- Описаны ограничения Safari на iOS/iPadOS: ZIP содержит ресурсы расширения, а не самостоятельный установочный пакет.
- Добавлены `npm run prepare:chromium` и `npm run prepare:safari` — проверка ZIP, manifest, версии, CRC32 и SHA-256 с безопасной распаковкой.
- Уточнён порядок обновления без потери локальных данных и проверки целостности файлов.

## Исправления 1.5.1–1.5.2 (после предыдущего публичного релиза)
- Исправлено сохранение пользовательских ссылок XenForo.
- Исправлена вставка шаблонов в уже открытые вкладки нужного форума с проверкой прав и профиля.
- Улучшена регистрация и внедрение контентных скриптов после выдачи разрешений.
- Исправлено получение разрешений в Firefox Android: вызов `permissions.request()` происходит непосредственно из пользовательского действия.
- Google OAuth проверяет наличие Client ID до запроса дополнительного доступа.
- Независимые ошибки загрузки разделов теперь не должны блокировать всё рабочее пространство.
- Исправлены устаревшие номера версий резервных копий Google Drive.
- CI закреплён на Ubuntu 24.04 для Chromium/Firefox E2E из-за несовместимости Playwright 1.57.0 с Ubuntu 26.04.

## Файлы выпуска
- `MajesticToolkit-1.5.3-chromium.zip` — Chrome, Edge, Brave; для установки распаковать и загрузить папку расширения.
- `MajesticToolkit-1.5.3-firefox.zip` — Firefox Desktop; для постоянной установки через Firefox требуется подпись Mozilla.
- `MajesticToolkit-1.5.3-firefox-android.zip` — Firefox Android; установку и совместимость требуется проверять на устройстве.
- `MajesticToolkit-1.5.3-safari.zip` — **только ресурсы** Safari WebExtension, не готовые .app/.ipa.
- `SHA256SUMS` — SHA-256 контрольные суммы всех четырёх ZIP.
- `release-manifest.json` — размеры, контрольные суммы и состав файлов.

Извлечённые исходники версии доступны через автоматически формируемый архив Source code для тега `v1.5.3`. Инструкции по установке: [Chromium и Safari](https://github.com/TheSkiF4er/MajesticToolkit/blob/v1.5.3/docs/INSTALL_CHROMIUM_SAFARI.md).

## Проверки
- `npm run verify` — unit/регрессионные тесты, сборка и контроль пакетов.
- GitHub Actions — `test-and-build` и `browser-e2e` в Chromium/Firefox на автономных фикстурах XenForo.
- Mozilla Add-ons Linter — проверка двух Firefox ZIP во время CI.
- Firefox Android, Safari, настоящие страницы XenForo и Google OAuth требуют отдельной проверки установленного расширения: автоматические фикстуры не подтверждают все эти сценарии.

**Лицензия:** MPL-2.0. **Исходники:** [TheSkiF4er/MajesticToolkit](https://github.com/TheSkiF4er/MajesticToolkit). **Ошибки:** [Issues](https://github.com/TheSkiF4er/MajesticToolkit/issues).

Этот GitHub Release не является публикацией в Mozilla Add-ons, Chrome Web Store или App Store.
