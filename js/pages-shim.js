(function () {
  var base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || '';
  if (!base) return;
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      if (typeof input === 'string' && input.indexOf('/api/') === 0) {
        input = base + input;
      } else if (input instanceof Request) {
        var u = new URL(input.url);
        if (u.origin === location.origin && u.pathname.indexOf('/api/') === 0) {
          input = new Request(base + u.pathname + u.search, input);
        }
      }
    } catch (e) {}
    return origFetch(input, init);
  };
})();
