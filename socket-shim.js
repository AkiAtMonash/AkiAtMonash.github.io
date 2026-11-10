(function () {
  var SEAT = new URLSearchParams(location.search).get('seat');
  var handlers = {};
  var announced = false;
  var socket = {
    emit: function (ev, payload) {
      if (ev === 'act') window.parent.postMessage({ type: 'bf:act', action: payload }, '*');
    },
    on: function (ev, cb) {
      (handlers[ev] = handlers[ev] || []).push(cb);
      if (ev === 'state' && !announced) {
        announced = true;
        window.parent.postMessage({ type: 'bf:hello', seat: SEAT }, '*');
      }
    },
    io: { on: function () {} }
  };
  window.io = function () { return socket; };
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'bf:state') {
      (handlers['state'] || []).forEach(function (cb) { cb(d.state); });
    }
  });
})();
