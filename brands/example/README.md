# Brand folder layout

One folder per brand. Contents are copied as an overlay onto the native project, so only include what changes.

```
brands/<brand>/
  android/res/                      -> platforms/android/app/src/main/res/
    mipmap-mdpi/ic_launcher.png            48x48
    mipmap-hdpi/ic_launcher.png            72x72
    mipmap-xhdpi/ic_launcher.png           96x96
    mipmap-xxhdpi/ic_launcher.png          144x144
    mipmap-xxxhdpi/ic_launcher.png         192x192
    mipmap-*/ic_launcher_foreground.png    (adaptive icon, 108dp base)
    mipmap-*/ic_launcher_background.png    (adaptive icon, optional)
  ios/AppIcon.appiconset/           -> platforms/ios/<App>/Images.xcassets/AppIcon.appiconset/
    Contents.json                          (must match the PNG file names)
    *.png                                  (all sizes listed in Contents.json, 1024x1024 has no alpha)
```

Tip: keep the same file names the generated project already uses (check a MABS build output once).
