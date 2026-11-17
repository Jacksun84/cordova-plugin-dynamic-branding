# Android brand assets

Applied by `hooks/apply-icons.js` into `platforms/android/app/src/main/res/`.

```
android/
  drawable-ldpi|mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi/icon.png   -> mipmap-<density>/ic_launcher.png (launcher icon)
  drawable-port-<density>/screen.png                       -> copied as-is (splash, portrait)
  drawable-land-<density>/screen.png                       -> copied as-is (splash, landscape)
  drawable/empty_icon.xml                                  -> copied as-is
  res/                                                     -> optional raw overlay (e.g. adaptive icon files)
```

Launcher icon sizes: ldpi 36, mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192 (px).
This README is not copied into the app.
