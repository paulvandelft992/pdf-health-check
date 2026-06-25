const { notarize } = require('@electron/notarize');

/**
 * After-sign hook called by electron-builder.
 * Notarizes the macOS app using Apple ID + app-specific password.
 * Skipped on non-macOS platforms and when credentials are absent.
 *
 * Required env vars:
 *   APPLE_ID           — your Apple ID email (e.g. paul@example.com)
 *   APPLE_APP_PASSWORD — app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID      — your 10-char team ID (F5HD4RNX7P)
 */
exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return;

  if (!process.env.APPLE_ID) {
    console.log('[notarize] APPLE_ID not set — skipping notarization');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  console.log(`[notarize] Notarizing ${appPath}…`);
  await notarize({
    tool:           'notarytool',
    appBundleId:    'com.pdfhealthcheck.app',
    appPath,
    appleId:        process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    teamId:         process.env.APPLE_TEAM_ID,
  });
  console.log('[notarize] Done.');
};
