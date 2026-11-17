# Brand folder layout

See "Brand folder layout" in the [main README](../../README.md). In short:

```
brands/<brandId>/
  android/drawable-<density>/icon.png, drawable-{port,land}-*/screen.png, drawable/empty_icon.xml
  ios/icons/<name>_<px>.png, ios/splashscreens/Default@2x~...png
```

The folder name must equal `brandId` in `config/current-build.json`.
