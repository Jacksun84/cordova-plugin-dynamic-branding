'use strict';
/**
 * after_prepare hook (1/2): applies the brand's icons and splash screens to the prepared native projects.
 *
 * Brand layout (OutSystems export layout):
 *   brands/<brand>/android/drawable-<density>/icon.png     -> res/mipmap-<density>/ic_launcher.png (or drawable-<density>/icon.png on old projects)
 *   brands/<brand>/android/drawable-{port,land}-*\/screen.png, drawable/*  -> copied as-is into res/
 *   brands/<brand>/android/res/**                          -> optional raw overlay onto res/ (e.g. adaptive icons)
 *   brands/<brand>/ios/icons/<name>_<px>.png               -> AppIcon.appiconset, matched by pixel size via Contents.json
 *   brands/<brand>/ios/splashscreens/*.png                 -> LaunchStoryboard.imageset (same file names)
 *   brands/<brand>/ios/AppIcon.appiconset/**               -> optional full replacement of the icon set
 */
const fs = require('fs');
const path = require('path');
const { log, loadBuildContext, androidMainDir, iosAppDir, IOS_CATALOGS, walk, copyDir } = require('./lib/common');

const DENSITIES = ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

module.exports = function (context) {
  const ctx = loadBuildContext(context, { needsBrand: true });
  if (!ctx) return;
  log('icons: brand "' + ctx.config.brand + '" on ' + ctx.platforms.join(', '));

  ctx.platforms.forEach((platform) => {
    const platformRoot = path.join(ctx.projectRoot, 'platforms', platform);
    if (platform === 'android') applyAndroidIcons(platformRoot, ctx.brandDir);
    else applyIosIcons(platformRoot, ctx.brandDir);
  });
};

/* ---------- android ---------- */

function applyAndroidIcons(platformRoot, brandDir) {
  const src = path.join(brandDir, 'android');
  if (!fs.existsSync(src)) {
    log('android: brand has no android folder, untouched');
    return;
  }
  const resDest = path.join(androidMainDir(platformRoot), 'res');
  let iconCount = 0;

  // 1. Launcher icons: drawable-<density>/icon.png
  DENSITIES.forEach((density) => {
    const icon = path.join(src, 'drawable-' + density, 'icon.png');
    if (!fs.existsSync(icon)) return;
    const mipmapDir = path.join(resDest, 'mipmap-' + density);
    if (fs.existsSync(mipmapDir)) {
      removeOtherFormats(mipmapDir, 'ic_launcher', '.png'); // e.g. .webp would shadow our .png
      fs.copyFileSync(icon, path.join(mipmapDir, 'ic_launcher.png'));
    } else {
      const drawableDir = path.join(resDest, 'drawable-' + density);
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.copyFileSync(icon, path.join(drawableDir, 'icon.png'));
    }
    iconCount++;
  });

  // 2. Everything else (splash screens, empty_icon.xml, ...) as-is, except icon.png and docs
  walk(src).forEach((file) => {
    const rel = path.relative(src, file);
    const parts = rel.split(path.sep);
    if (parts[0] === 'res' || /^readme\.md$/i.test(rel) || path.basename(rel) === 'icon.png') return;
    const dest = path.join(resDest, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  });

  // 3. Optional raw overlay (adaptive icons etc.)
  const overlay = path.join(src, 'res');
  if (fs.existsSync(overlay)) {
    walk(overlay).forEach((file) => {
      const rel = path.relative(overlay, file);
      removeOtherFormats(path.join(resDest, path.dirname(rel)), path.basename(rel, path.extname(rel)), path.extname(rel));
    });
    copyDir(overlay, resDest);
    log('android: res overlay copied');
  }
  log('android: ' + iconCount + ' launcher icon density(ies) applied');
}

function removeOtherFormats(dir, baseName, keepExt) {
  ['.png', '.webp', '.jpg'].forEach((ext) => {
    if (ext === keepExt) return;
    const f = path.join(dir, baseName + ext);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

/* ---------- ios ---------- */

function applyIosIcons(platformRoot, brandDir) {
  const src = path.join(brandDir, 'ios');
  if (!fs.existsSync(src)) {
    log('ios: brand has no ios folder, untouched');
    return;
  }
  const appDir = iosAppDir(platformRoot);
  const catalog = IOS_CATALOGS.find((c) => fs.existsSync(path.join(appDir, c)));
  if (!catalog) throw new Error('[dynamic-branding] ios: no ' + IOS_CATALOGS.join(' or ') + ' in ' + appDir);
  const catalogDir = path.join(appDir, catalog);

  // Option 1: full icon set replacement
  const fullSet = path.join(src, 'AppIcon.appiconset');
  if (fs.existsSync(fullSet)) {
    const dest = path.join(catalogDir, 'AppIcon.appiconset');
    fs.rmSync(dest, { recursive: true, force: true }); // avoid stale sizes not listed in the new Contents.json
    copyDir(fullSet, dest);
    log('ios: AppIcon.appiconset replaced');
  }

  // Option 2: loose icons matched by pixel size
  const iconsDir = path.join(src, 'icons');
  if (fs.existsSync(iconsDir)) applyIosLooseIcons(iconsDir, path.join(catalogDir, 'AppIcon.appiconset'));

  // Splash screens
  const splashDir = path.join(src, 'splashscreens');
  if (fs.existsSync(splashDir)) {
    const dest = path.join(catalogDir, 'LaunchStoryboard.imageset');
    if (fs.existsSync(dest)) {
      copyDir(splashDir, dest); // same file names as the Contents.json generated by cordova-ios
      log('ios: splash screens copied');
    } else {
      log('ios: LaunchStoryboard.imageset not found, splash screens skipped');
    }
  }

  if (!fs.existsSync(fullSet) && !fs.existsSync(iconsDir) && !fs.existsSync(splashDir)) {
    log('ios: brand has no icons/splashscreens/AppIcon.appiconset, untouched');
  }
}

function applyIosLooseIcons(iconsDir, setDir) {
  const contentsPath = path.join(setDir, 'Contents.json');
  if (!fs.existsSync(contentsPath)) {
    log('ios: ' + contentsPath + ' not found, loose icons skipped');
    return;
  }
  // pixel size -> file, from names like oshub_180.png
  const bySize = {};
  fs.readdirSync(iconsDir).forEach((f) => {
    const m = f.match(/_(\d+)\.png$/i);
    if (m) bySize[parseInt(m[1], 10)] = path.join(iconsDir, f);
  });

  const contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'));
  let applied = 0;
  const missing = [];
  (contents.images || []).forEach((img) => {
    const px = Math.round(parseFloat(img.size) * parseInt(img.scale || '1', 10));
    const file = bySize[px];
    if (!file) {
      missing.push(px);
      return;
    }
    if (!img.filename) img.filename = 'icon-' + px + '.png';
    fs.copyFileSync(file, path.join(setDir, img.filename));
    applied++;
  });
  fs.writeFileSync(contentsPath, JSON.stringify(contents, null, 2));
  log('ios: ' + applied + ' icon(s) applied' + (missing.length ? ', no source for px: ' + Array.from(new Set(missing)).join(', ') : ''));
}
