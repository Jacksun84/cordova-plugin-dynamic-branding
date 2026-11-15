'use strict';
/**
 * after_prepare hook: picks a brand from config/<appId>.json (or config/current-build.json)
 * and applies name, icons and native config values to the prepared platforms.
 * Node built-ins only, so it runs on MABS without installing anything.
 */
const fs = require('fs');
const path = require('path');

const BRAND_RE = /^[A-Za-z0-9_-]+$/;
const log = (m) => console.log('[dynamic-branding] ' + m);

module.exports = function (context) {
  const projectRoot = context.opts.projectRoot;
  const pluginDir = (context.opts.plugin && context.opts.plugin.dir) || path.join(__dirname, '..');
  const platforms = (context.opts.platforms || []).filter((p) => p === 'android' || p === 'ios');
  if (!platforms.length) return;

  const appId = readWidgetId(projectRoot);
  const config = loadConfig(pluginDir, appId);
  if (!config) {
    log('no config found, skipping (looked for config/' + appId + '.json and config/current-build.json)');
    return;
  }
  normalizeConfig(config);
  if (!BRAND_RE.test(config.brand || '')) {
    throw new Error('[dynamic-branding] invalid or missing "brand" in config');
  }
  const brandDir = path.join(pluginDir, 'brands', config.brand);
  if (!fs.existsSync(brandDir)) {
    throw new Error('[dynamic-branding] brand folder not found: brands/' + config.brand);
  }
  log('applying brand "' + config.brand + '" for ' + (appId || 'unknown app') + ' on ' + platforms.join(', '));

  platforms.forEach((platform) => {
    const platformRoot = path.join(projectRoot, 'platforms', platform);
    if (platform === 'android') applyAndroid(platformRoot, brandDir, config);
    else applyIos(platformRoot, brandDir, config);
  });
};

/* ---------- config ---------- */

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
      const target = PLUGIN_VARIABLE_TARGETS[v.name];
      if (!target) return;
      if (target.android) meta[target.android] = v.value;
      if (target.ios) plist[target.ios] = v.value;
    });
  });
  config.android.manifestMetaData = Object.assign(meta, config.android.manifestMetaData);
  config.ios.infoPlist = Object.assign(plist, config.ios.infoPlist);
}

/* ---------- android ---------- */

function applyAndroid(platformRoot, brandDir, config) {
  const mainDir = fs.existsSync(path.join(platformRoot, 'app', 'src', 'main'))
    ? path.join(platformRoot, 'app', 'src', 'main')
    : platformRoot; // legacy cordova-android < 7 layout

  // Icons
  const resSrc = path.join(brandDir, 'android', 'res');
  if (fs.existsSync(resSrc)) {
    // Remove generated launcher icons in other formats (e.g. .webp) that would shadow our .png
    removeLauncherDuplicates(path.join(mainDir, 'res'), resSrc);
    copyDir(resSrc, path.join(mainDir, 'res'));
    log('android: icons copied');
  } else {
    log('android: brand has no android/res, icons untouched');
  }

  // App name
  if (config.appName) {
    const strings = path.join(mainDir, 'res', 'values', 'strings.xml');
    if (fs.existsSync(strings)) {
      let xml = fs.readFileSync(strings, 'utf8');
      const name = xmlEscape(config.appName);
      ['app_name', 'launcher_name'].forEach((key) => {
        const re = new RegExp('(<string\\s+name="' + key + '"[^>]*>)[^<]*(</string>)');
        xml = xml.replace(re, '$1' + name.replace(/\$/g, '$$$$') + '$2');
      });
      fs.writeFileSync(strings, xml);
      log('android: app name set');
    }
  }

  // Manifest meta-data (e.g. com.pushwoosh.appid)
  const meta = (config.android && config.android.manifestMetaData) || {};
  const names = Object.keys(meta);
  if (names.length) {
    const manifest = path.join(mainDir, 'AndroidManifest.xml');
    let xml = fs.readFileSync(manifest, 'utf8');
    names.forEach((name) => {
      const value = xmlEscape(String(meta[name]));
      const re = new RegExp('(<meta-data\\s+[^>]*android:name="' + escapeRe(name) + '"[^>]*android:value=")[^"]*(")');
      if (re.test(xml)) {
        xml = xml.replace(re, (_, a, b) => a + value + b);
        log('android: meta-data ' + name + ' updated');
      } else {
        xml = xml.replace(
          /<\/application>/,
          '    <meta-data android:name="' + name + '" android:value="' + value + '" />\n    </application>'
        );
        log('android: meta-data ' + name + ' added (was not present)');
      }
    });
    fs.writeFileSync(manifest, xml);
  }
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

/* ---------- ios ---------- */

function applyIos(platformRoot, brandDir, config) {
  const appDir = fs
    .readdirSync(platformRoot)
    .map((d) => path.join(platformRoot, d))
    .find((d) => fs.existsSync(path.join(d, 'Images.xcassets')));
  if (!appDir) throw new Error('[dynamic-branding] ios: could not find Images.xcassets under ' + platformRoot);

  // Icons
  const iconSrc = path.join(brandDir, 'ios', 'AppIcon.appiconset');
  if (fs.existsSync(iconSrc)) {
    const dest = path.join(appDir, 'Images.xcassets', 'AppIcon.appiconset');
    fs.rmSync(dest, { recursive: true, force: true }); // avoid stale sizes not listed in new Contents.json
    copyDir(iconSrc, dest);
    log('ios: icons copied');
  } else {
    log('ios: brand has no ios/AppIcon.appiconset, icons untouched');
  }

  // Info.plist
  const plistPath = fs
    .readdirSync(appDir)
    .filter((f) => /-Info\.plist$/.test(f))
    .map((f) => path.join(appDir, f))[0];
  if (!plistPath) throw new Error('[dynamic-branding] ios: Info.plist not found in ' + appDir);

  const values = Object.assign({}, (config.ios && config.ios.infoPlist) || {});
  if (config.appName) values.CFBundleDisplayName = config.appName;
  let plist = fs.readFileSync(plistPath, 'utf8');
  Object.keys(values).forEach((key) => {
    plist = setPlistString(plist, key, String(values[key]));
    log('ios: Info.plist ' + key + ' set');
  });
  fs.writeFileSync(plistPath, plist);
}

function setPlistString(plist, key, value) {
  const v = xmlEscape(value);
  const re = new RegExp('(<key>' + escapeRe(key) + '</key>\\s*<string>)[^<]*(</string>)');
  if (re.test(plist)) return plist.replace(re, (_, a, b) => a + v + b);
  const entry = '\t<key>' + key + '</key>\n\t<string>' + v + '</string>\n';
  const i = plist.lastIndexOf('</dict>');
  return plist.slice(0, i) + entry + plist.slice(i);
}

/* ---------- utils ---------- */

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
    const p = path.join(dir, e.name);
    return acc.concat(e.isDirectory() ? walk(p) : [p]);
  }, []);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((e) => {
    if (e.name === '.gitkeep') return;
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
