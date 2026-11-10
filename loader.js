window.require = function (name) {
  if (name === 'fs') return { existsSync: function (p) { return window.BF_IMAGES.has(String(p).split('/').pop()); } };
  if (name === 'path') return { join: function () { return Array.prototype.filter.call(arguments, Boolean).join('/'); } };
  throw new Error('require: ' + name);
};
window.__dirname = '';
window.module = { exports: {} };
