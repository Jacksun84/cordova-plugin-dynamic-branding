'use strict';
/**
 * after_prepare hook (1/2): copies the brand's launcher icons into the prepared native projects.
 *   brands/<brand>/android/res/**               -> Android res/
 *   brands/<brand>/ios/AppIcon.appiconset/**    -> iOS <App>/Assets.xcassets/AppIcon.appiconset/
 */
const fs = require('fs');
const path = require('path');
const { log, loadBuildContext, androidMainDir, iosAppDir, IOS_CATALOGS, walk, copyDir } = require('./lib/common');

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

function applyAndroidIcons(platformRoot, brandDir) {
  const resSrc = path.join(brandDir, 'android', 'res');
  if (!fs.existsSync(resSrc)) {
    log('android: brand has no android/res, icons untouched');
    return;
  }
  const resDest = path.join(androidMainDir(platformRoot), 'res');
  // Remove generated launcher icons in other formats (e.g. .webp) that would shadow our .png
  removeLauncherDuplicates(resDest, resSrc);
  copyDir(resSrc, resDest);
  log('android: icons copied');
}

function removeLauncherDuplicates(destRes, srcRes) {
  walk(srcRes).forEach((file) => {
    const rel = path.relative(srcRes, file);
    const base = rel.replace(/\.[^.]+$/, '');
    ['.png', '.webp', '.jpg'].forEach((ext) => {
      const other = path.join(destRes, base + ext);
      if (other !== path.join(destRes, rel) && fs.existsSync(other)) fs.unlinkSync(other);
    });
  });
}

function applyIosIcons(platformRoot, brandDir) {
  const iconSrc = path.join(brandDir, 'ios', 'AppIcon.appiconset');
  if (!fs.existsSync(iconSrc)) {
    log('ios: brand has no ios/AppIcon.appiconset, icons untouched');
    return;
  }
  const appDir = iosAppDir(platformRoot);
  const catalog = IOS_CATALOGS.find((c) => fs.existsSync(path.join(appDir, c)));
  if (!catalog) throw new Error('[dynamic-branding] ios: no ' + IOS_CATALOGS.join(' or ') + ' in ' + appDir);
  const dest = path.join(appDir, catalog, 'AppIcon.appiconset');
  fs.rmSync(dest, { recursive: true, force: true }); // avoid stale sizes not listed in the new Contents.json
  copyDir(iconSrc, dest);
  log('ios: icons copied');
}
