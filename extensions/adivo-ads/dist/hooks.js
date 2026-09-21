'use strict';
const { processIOS } = require('./postprocess-ios');

exports.throwError = true;
exports.load = async function () { console.log('[Adivo Ads] iOS hooks loaded'); };
exports.unload = async function () {};

exports.onAfterBuild = async function (options, result) {
  if (options.platform !== 'ios') return;
  const processed = processIOS([result.dest, options.buildPath], Editor.Project.path);
  if (!processed) console.log('[Adivo Ads] Xcode project not present at onAfterBuild; waiting for onAfterMake');
};

exports.onAfterMake = async function (root, options) {
  if (options.platform !== 'ios') return;
  const processed = processIOS([root, options.buildPath], Editor.Project.path);
  if (!processed) throw new Error('[Adivo Ads] Cocos iOS Xcode project was not found after native make stage.');
};
