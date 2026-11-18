# cordova-plugin-dynamic-branding

Cordova plugin that overrides branding and build configuration for OutSystems mobile apps compiled by MABS, without touching the extensibility configuration in Service Studio.

## How it works

1. The OutSystems module references this plugin once (Git URL + fixed branch/tag in the extensibility JSON).
2. Before a build, the OS web app writes `config/<appId>.json` (or `config/current-build.json`) to this repo.
3. MABS fetches the plugin and two `after_prepare` hooks run, each reading the config independently (shared code in `hooks/lib/common.js`):
   - `hooks/apply-icons.js` (brand assets in the OutSystems export layout, see "Brand folder layout" below):
     - Android: `drawable-<density>/icon.png` becomes `mipmap-<density>/ic_launcher.png`; splash `screen.png` files and `drawable/` are copied as-is
     - iOS: `icons/<name>_<px>.png` are matched by pixel size to the entries of the generated `AppIcon.appiconset/Contents.json`; `splashscreens/*` go into `LaunchStoryboard.imageset` (`Assets.xcassets`, or `Images.xcassets` on older cordova-ios)
   - `hooks/apply-variables.js`:
     - sets the app name (Android `strings.xml`, iOS `CFBundleDisplayName`, and the `AppName` preference read by cordova-plugin-change-displayname)
     - sets Android manifest `meta-data` and iOS `Info.plist` string keys (e.g. `com.pushwoosh.appid`)

To add another task, create a new `hooks/apply-<task>.js` that calls `loadBuildContext(context)` and register it in `plugin.xml`.

`<appId>` is the `widget id` in `config.xml` (the app identifier). Falls back to `config/current-build.json`.

## Config format

See [config/current-build.json](config/current-build.json). `brandId` and `applicationName` are used; `plugins[].variables` named `com.pushwoosh.appid` / `com.pushwoosh.senderid` are written to the Android manifest `meta-data` and (appid only) iOS `Pushwoosh_APPID`. Optional `android.manifestMetaData` / `ios.infoPlist` objects override or add raw entries.

`brandId` must match a folder in `brands/` (letters, digits, `_`, `-`). Missing brand folder fails the build on purpose.

## Brands

| `brandId` | Folder |
|---|---|
| `kuwait-hospital` | `brands/kuwait-hospital/` |
| `sapphire-care` | `brands/sapphire-care/` |
| `patient-mobile` | `brands/patient-mobile/` |

### Brand folder layout

```
brands/<brandId>/
  android/
    drawable-ldpi|mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi/icon.png      launcher icon
    drawable-port-*|drawable-land-*/screen.png                  splash screens (copied as-is)
    drawable/empty_icon.xml
    res/                                                        optional raw overlay (e.g. adaptive icons)
  ios/
    icons/<name>_<px>.png                                       e.g. oshub_20.png ... oshub_1024.png
    splashscreens/Default@2x~universal~anyany.png ...           same names as the generated LaunchStoryboard.imageset
    AppIcon.appiconset/                                         optional full replacement of the icon set
```

To add a brand: create the folder with this layout, then add it to the table. A brand folder with no `android` or `ios` content does not fail the build. The hook logs "untouched" and keeps the default images. A `brandId` with no folder at all does fail the build.

iOS icon matching: every entry in the generated `Contents.json` needs pixel size = `size` × `scale` (for example 60x60 @3x = 180). The hook logs `no source for px: ...` for sizes missing in `ios/icons`. Android: ldpi has no launcher mipmap in recent projects, so it is written to `drawable-ldpi/icon.png` and is unused.
