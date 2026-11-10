(function () {
  var BF = window.module.exports; // {createGame, DECKS, imgFile}
  var seats = {}; // seat番号 -> iframe の window
  function broadcast() {
    for (var seat in seats) {
      var s = +seat;
      var v = game.view(s);
      v.mode = 'self';
      seats[seat].postMessage({ type: 'bf:state', state: v }, '*');
    }
  }
  var game = BF.createGame(broadcast, { botSeat: -1 });
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'bf:hello') { seats[String(d.seat)] = e.source; broadcast(); return; }
    if (d.type === 'bf:act') {
      var seat = null;
      for (var k in seats) if (seats[k] === e.source) seat = +k;
      if (seat !== null && d.action && typeof d.action.t === 'string') {
        game.act(seat, d.action).catch(function (err) { console.error(err); });
      }
    }
  });
})();
