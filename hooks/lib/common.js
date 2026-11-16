'use strict';
/**
 * Shared helpers for the branding hooks. Node built-ins only, so it runs on MABS without installing anything.
 */
const fs = require('fs');
const path = require('path');

const BRAND_RE = /^[A-Za-z0-9_-]+$/;
const log = (m) => console.log('[dynamic-branding] ' + m);

/* ---------- build context / config ---------- */

/**
 * Resolves platforms, plugin dir and the build config for a hook run.
 * Returns null when there is nothing to do (no platforms, or no config file).
 * With { needsBrand: true } the brand id is validated and brands/<brand> must exist.
 */
function loadBuildContext(context, opts) {
  opts = opts || {};
  const projectRoot = context.opts.projectRoot;
  const pluginDir = (context.opts.plugin && context.opts.plugin.dir) || path.join(__dirname, '..', '..');
  const platforms = (context.opts.platforms || []).filter((p) => p === 'android' || p === 'ios');
  if (!platforms.length) return null;

  const appId = readWidgetId(projectRoot);
  const config = loadConfig(pluginDir, appId);
  if (!config) {
    log('no config found, skipping (looked for config/' + appId + '.json and config/current-build.json)');
    return null;
  }
  normalizeConfig(config);

  let brandDir = null;
  if (opts.needsBrand) {
    if (!BRAND_RE.test(config.brand || '')) {
      throw new Error('[dynamic-branding] invalid or missing "brand" in config');
    }
    brandDir = path.join(pluginDir, 'brands', config.brand);
    if (!fs.existsSync(brandDir)) {
      throw new Error('[dynamic-branding] brand folder not found: brands/' + config.brand);
    }
  }
  return { projectRoot, pluginDir, platforms, appId, config, brandDir };
}

function readWidgetId(projectRoot) {
  try {
    const xml = fs.readFileSync(path.join(projectRoot, 'config.xml'), 'utf8');
    const m = xml.match(/<widget[^>]*\sid="([^"]+)"/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function loadConfig(pluginDir, appId) {
  const candidates = [];
  if (appId && /^[A-Za-z0-9._-]+$/.test(appId)) candidates.push(path.join(pluginDir, 'config', appId + '.json'));
  candidates.push(path.join(pluginDir, 'config', 'current-build.json'));
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      log('using ' + path.relative(pluginDir, file));
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
  return null;
}

// Maps the web-app schema (brandId, applicationName, plugins[].variables) to what the appliers use.
// Explicit android.manifestMetaData / ios.infoPlist entries still win.
const PLUGIN_VARIABLE_TARGETS = {
  'com.pushwoosh.appid': { android: 'com.pushwoosh.appid', ios: 'Pushwoosh_APPID' },
  'com.pushwoosh.senderid': { android: 'com.pushwoosh.senderid' }
};

function normalizeConfig(config) {
  config.brand = config.brand || config.brandId;
  config.appName = config.appName || config.applicationName;
  config.android = config.android || {};
  config.ios = config.ios || {};
  const meta = {};
  const plist = {};
  (config.plugins || []).forEach((plugin) => {
    (plugin.variables || []).forEach((v) => {
      // The change-displayname plugin's APP_NAME is the explicit display-name override: it wins over applicationName.
      if (plugin.name === 'cordova-plugin-change-displayname' && v.name === 'APP_NAME' && v.value) {
        config.appName = v.value;
      }
      const target = PLUGIN_VARIABLE_TARGETS[v.name];
      if (!target) return;
      if (target.android) meta[target.android] = v.value;
      if (target.ios) plist[target.ios] = v.value;
    });
  });
  config.android.manifestMetaData = Object.assign(meta, config.android.manifestMetaData);
  config.ios.infoPlist = Object.assign(plist, config.ios.infoPlist);
}

/* ---------- native project locations ---------- */

function androidMainDir(platformRoot) {
  const main = path.join(platformRoot, 'app', 'src', 'main');
  return fs.existsSync(main) ? main : platformRoot; // legacy cordova-android < 7 layout
}

// cordova-ios >= 7 (MABS 12) uses Assets.xcassets; older versions use Images.xcassets
const IOS_CATALOGS = ['Assets.xcassets', 'Images.xcassets'];

function iosAppDir(platformRoot) {
  const appDir = fs
    .readdirSync(platformRoot)
    .map((d) => path.join(platformRoot, d))
    .find(
      (d) =>
        fs.statSync(d).isDirectory() &&
        (IOS_CATALOGS.some((c) => fs.existsSync(path.join(d, c))) ||
          fs.readdirSync(d).some((f) => /-Info\.plist$/.test(f)))
    );
  if (!appDir) throw new Error('[dynamic-branding] ios: could not find the app folder under ' + platformRoot);
  return appDir;
}

/* ---------- file utils ---------- */

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
    const p = path.join(dir, e.name);
    return acc.concat(e.isDirectory() ? walk(p) : [p]);
  }, []);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((e) => {
    if (e.name === '.gitkeep' || e.name.toLowerCase() === 'readme.md') return;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  log,
  loadBuildContext,
  androidMainDir,
  iosAppDir,
  IOS_CATALOGS,
  walk,
  copyDir,
  xmlEscape,
  escapeRe
};
