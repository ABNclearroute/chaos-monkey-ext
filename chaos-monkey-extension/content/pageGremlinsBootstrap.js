// Runs in the page's main world (injected via a <script src="..."> tag).
// It reads the ChaosMonkey config from its own script URL fragment.
(function () {
  try {
    var current = document.currentScript;
    if (!current) return;

    var src = String(current.src || '');
    var hashIndex = src.indexOf('#');
    if (hashIndex === -1) return;

    var encoded = src.slice(hashIndex + 1);
    var json = decodeURIComponent(encoded);
    var config = JSON.parse(json);

    function callback() {
      try {
        var species = [];
        if (config.types && config.types.clicker) species.push(gremlins.species.clicker());
        if (config.types && config.types.toucher) species.push(gremlins.species.toucher());
        if (config.types && config.types.formFiller) species.push(gremlins.species.formFiller());
        if (config.types && config.types.scroller) species.push(gremlins.species.scroller());
        if (config.types && config.types.typer) species.push(gremlins.species.typer());

        if (!species.length && gremlins.allSpecies) {
          species = gremlins.allSpecies;
        }

        var durationMs = (config.durationSeconds || 30) * 1000;
        var nb = config.gremlinCount || 200;
        var delay = config.speedMs || 50;

        var horde = gremlins.createHorde({
          species: species,
          mogwais: [
            gremlins.mogwais.alert(),
            gremlins.mogwais.fps(),
            gremlins.mogwais.gizmo()
          ],
          strategies: [
            gremlins.strategies.distribution({ delay: delay })
          ]
        });

        window.__chaosMonkeyHorde = horde;
        horde.unleash({ nb: nb });

        setTimeout(function () {
          try {
            horde.stop && horde.stop();
          } catch (e) {}
        }, durationMs);
      } catch (e) {
        console.error('[ChaosMonkey page] Failed to start horde', e);
      }
    }

    if (window.gremlins) {
      callback();
    } else {
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/gremlins.js';
      s.async = true;
      if (s.addEventListener) {
        s.addEventListener('load', callback, false);
      } else if (s.readyState) {
        s.onreadystatechange = callback;
      }
      document.body.appendChild(s);
    }
  } catch (e) {
    console.error('[ChaosMonkey page] Bootstrap error', e);
  }
})();

