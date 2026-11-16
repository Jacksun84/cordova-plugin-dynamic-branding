'use strict';
/**
 * after_prepare hook (2/2): overrides the app display name and plugin variables
 * (e.g. com.pushwoosh.appid) directly in the prepared native projects.
 *   Android: res/values/strings.xml, res/xml/config.xml (AppName), AndroidManifest.xml meta-data
 *   iOS:     <App>/<App>-Info.plist, <App>/config.xml (AppName)
 */
const fs = require('fs');
const path = require('path');
const { log, loadBuildContext, androidMainDir, iosAppDir, xmlEscape, escapeRe } = require('./lib/common');

module.exports = function (context) {
  const ctx = loadBuildContext(context);
  if (!ctx) return;
  log('variables: app "' + (ctx.config.appName || '-') + '" on ' + ctx.platforms.join(', '));

  ctx.platforms.forEach((platform) => {
    const platformRoot = path.join(ctx.projectRoot, 'platforms', platform);
    if (platform === 'android') applyAndroidVariables(platformRoot, ctx.config);
    else applyIosVariables(platformRoot, ctx.config);
  });
};

/* ---------- android ---------- */

function applyAndroidVariables(platformRoot, config) {
  const mainDir = androidMainDir(platformRoot);

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
    // cordova-plugin-change-displayname reads this preference in its own after_prepare hook
    // (whose run order relative to ours is not guaranteed), so keep it in sync.
    setAppNamePreference(path.join(mainDir, 'res', 'xml', 'config.xml'), config.appName);
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

/* ---------- ios ---------- */

function applyIosVariables(platformRoot, config) {
  const appDir = iosAppDir(platformRoot);
  const plistPath = fs
    .readdirSync(appDir)
    .filter((f) => /-Info\.plist$/.test(f))
    .map((f) => path.join(appDir, f))[0];
  if (!plistPath) throw new Error('[dynamic-branding] ios: Info.plist not found in ' + appDir);

  const values = Object.assign({}, (config.ios && config.ios.infoPlist) || {});
  if (config.appName) {
    values.CFBundleDisplayName = config.appName;
    setAppNamePreference(path.join(appDir, 'config.xml'), config.appName);
  }
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

function setAppNamePreference(configXmlPath, name) {
  if (!fs.existsSync(configXmlPath)) {
    log('config.xml not found at ' + configXmlPath + ', AppName preference not synced');
    return;
  }
  let xml = fs.readFileSync(configXmlPath, 'utf8');
  const v = xmlEscape(name);
  const re = /(<preference\s+[^>]*name="AppName"[^>]*value=")[^"]*(")/;
  if (re.test(xml)) xml = xml.replace(re, (_, a, b) => a + v + b);
  else xml = xml.replace(/<\/widget>/, '    <preference name="AppName" value="' + v + '" />\n</widget>');
  fs.writeFileSync(configXmlPath, xml);
  log('AppName preference synced in ' + path.basename(path.dirname(configXmlPath)) + '/config.xml');
}
