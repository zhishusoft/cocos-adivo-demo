'use strict';
exports.load = function () { console.log('[Adivo Ads] Builder extension loaded'); };
exports.unload = function () {};
exports.configs = {
  ios: { hooks: './hooks' }
};
