// Compatibility shim for older links.
// The real game script lives at js/game.js.
(function loadRealGameScript() {
  var script = document.createElement('script');
  script.src = './js/game.js';
  script.defer = true;
  document.head.appendChild(script);
})();

