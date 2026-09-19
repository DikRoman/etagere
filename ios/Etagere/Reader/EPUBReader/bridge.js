(function () {
  var book = null;
  var rendition = null;
  var theme = "paper";
  var spread = true;

  function post(payload) {
    if (window.webkit && window.webkit.messageHandlers.etagere) {
      window.webkit.messageHandlers.etagere.postMessage(payload);
    }
  }

  function themeColors() {
    if (theme === "night") {
      return { body: { background: "#12161c", color: "#e8edf3" } };
    }
    if (theme === "paper") {
      return { body: { background: "#f4ecd8", color: "#2a2418" } };
    }
    return { body: { background: "#f7f7f5", color: "#1c2430" } };
  }

  function paint() {
    if (!rendition) return;
    var colors = themeColors();
    rendition.themes.default(colors);
    rendition.themes.fontSize("112%");
  }

  window.Etagere = {
    open: function (path) {
      if (book) {
        try {
          book.destroy();
        } catch (e) {}
      }
      book = ePub(path);
      rendition = book.renderTo("viewer", {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: spread ? "auto" : "none",
        minSpreadWidth: 700,
        allowScriptedContent: false,
      });
      paint();
      rendition.on("relocated", function (location) {
          var count = 1;
          try {
            if (book.spine && typeof book.spine.each === "function") {
              var n = 0;
              book.spine.each(function () {
                n += 1;
              });
              if (n) count = n;
            }
          } catch (e) {}
          post({
            type: "relocated",
            index: (location.start && location.start.index ? location.start.index : 0) + 1,
            count: count,
            href: location.start ? location.start.href : "",
          });
      });
      rendition.on("click", function (event) {
        var x = event.clientX || 0;
        var w = window.innerWidth || 1;
        var edge = Math.min(140, Math.max(64, w * 0.2));
        var zone = "chrome";
        if (x < edge) zone = "prev";
        else if (x > w - edge) zone = "next";
        post({ type: "tap", zone: zone });
      });
      rendition.display();
    },
    next: function () {
      if (rendition) rendition.next();
    },
    prev: function () {
      if (rendition) rendition.prev();
    },
    go: function (href) {
      if (rendition) rendition.display(href);
    },
    setTheme: function (nextTheme, nextSpread) {
      theme = nextTheme || theme;
      spread = !!nextSpread;
      paint();
    },
  };
})();
