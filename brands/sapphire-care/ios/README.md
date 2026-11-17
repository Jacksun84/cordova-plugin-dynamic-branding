# iOS brand assets

Applied by `hooks/apply-icons.js` into `platforms/ios/<App>/Assets.xcassets/`.

```
ios/
  icons/<name>_<px>.png            -> AppIcon.appiconset, matched by pixel size (size x scale in Contents.json)
                                      e.g. oshub_20.png, oshub_40.png, oshub_60.png, oshub_120.png, oshub_180.png, oshub_1024.png
  splashscreens/Default@2x~universal~anyany.png ...
                                   -> LaunchStoryboard.imageset (keep the file names)
  AppIcon.appiconset/              -> optional: replaces the whole icon set (with its own Contents.json)
```

Notes:
- The `<name>` prefix is free; only the trailing `_<px>.png` is used.
- The 1024x1024 App Store icon must have no alpha channel.
- A size missing here is logged as `no source for px: ...` and keeps the default icon for that size.
- This README is not copied into the app.
- TODO: add `icons/` and `splashscreens/` for this brand. Until then the default iOS icons are kept.
