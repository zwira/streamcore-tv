# StreamCore TV — APK Fire Stick

## Build avec Android Studio

1. Ouvre Android Studio
2. File → Open → sélectionne ce dossier
3. Attends la sync Gradle
4. Build → Generate Signed APK (ou Build → Build APK for debug)

## Installer sur Fire Stick via Downloader

1. Sur le Fire Stick : Settings → My Fire TV → Developer Options → Apps from Unknown Sources → ON
2. Installe l'app "Downloader" depuis l'Amazon Store
3. Lance Downloader, entre l'URL de ton APK
4. Installe l'APK

## Architecture

- **MainActivity.java** — Interface WebView (catalogue, EPG, navigation)
- **PlayerActivity.java** — ExoPlayer (lecture vidéo max qualité)
- **www/** — App web TV (HTML/CSS/JS vanilla, sans framework)

## Qualité vidéo

ExoPlayer configuré avec :
- Hardware decoding (MediaCodec) via `setTunnelingEnabled(true)`
- `setForceHighestSupportedBitrate(true)` — toujours la meilleure qualité
- Dolby Digital / DTS passthrough natif Android
- Buffer adapté live (latence minimale) vs VOD (fluidité max)
- Reconnexion automatique si le flux coupe
