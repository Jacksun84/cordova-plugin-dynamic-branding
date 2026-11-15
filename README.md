# cordova-plugin-dynamic-branding

Cordova plugin that overrides branding and build configuration for OutSystems mobile apps compiled by MABS, without touching the extensibility configuration in Service Studio.

## How it works

1. The OutSystems module references this plugin once (Git URL + fixed branch/tag in the extensibility JSON).
2. Before a build, the OS web app writes `config/<appId>.json` (or `config/current-build.json`) to this repo.
3. MABS fetches the plugin, and the `after_prepare` hook (`hooks/apply-branding.js`) reads the config and:
   - copies `brands/<brand>/android/res/**` over the Android `res` folder
   - replaces `ios/.../Images.xcassets/AppIcon.appiconset` with `brands/<brand>/ios/AppIcon.appiconset`
   - sets the app name (Android `strings.xml`, iOS `CFBundleDisplayName`)
   - sets Android manifest `meta-data` and iOS `Info.plist` string keys (e.g. `com.pushwoosh.appid`)

`<appId>` is the `widget id` in `config.xml` (the app identifier). Falls back to `config/current-build.json`.

## Config format

See [config/current-build.json](config/current-build.json). `brandId` and `applicationName` are used; `plugins[].variables` named `com.pushwoosh.appid` / `com.pushwoosh.senderid` are written to the Android manifest `meta-data` and (appid only) iOS `Pushwoosh_APPID`. Optional `android.manifestMetaData` / `ios.infoPlist` objects override or add raw entries.

`brandId` must match a folder in `brands/` (letters, digits, `_`, `-`). Missing brand folder fails the build on purpose.

See [brands/example/README.md](brands/example/README.md) for the icon layout.
