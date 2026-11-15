// Materialen page: loads the published material samples (php/materialen.php,
// fed by the admin app), shows them as filterable cards, and opens a detail
// view per material with one photo per operation and a zoom view.
(function () {
  "use strict";

  var grid = document.getElementById("mat-grid");
  if (!grid) return;

  var filtersEl = document.getElementById("mat-filters");
  var statusEl = document.getElementById("mat-status");
  var dialog = document.getElementById("mat-dialog");
  var zoom = document.getElementById("mat-zoom");

  var EXPLAIN = {
    RAW: "Het materiaal zoals het binnenkomt.",
    ENGRAVE_VECTOR: "De laser volgt lijnen en contouren, ideaal voor tekst en logo's.",
    ENGRAVE_BITMAP: "Gevulde vlakken en foto's, punt per punt gebrand.",
    SCORE: "Een lichte lijn zonder door te snijden, bijvoorbeeld voor plooilijnen.",
    CUT: "Helemaal doorgesneden, met een nette rand."
  };

  var materials = [];
  var activeCategory = "";
  var lastFocus = null;
  var zoomList = [];
  var zoomIndex = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Overview photo: vector engraving, else bitmap engraving, else scored, else
  // unprocessed (cut only as a last resort).
  var COVER_ORDER = ["ENGRAVE_VECTOR", "ENGRAVE_BITMAP", "SCORE", "RAW", "CUT"];
  // Detail view order: unprocessed, vector, bitmap, scored (cut last).
  var DETAIL_ORDER = ["RAW", "ENGRAVE_VECTOR", "ENGRAVE_BITMAP", "SCORE", "CUT"];

  function operationsInOrder(m, order) {
    var out = [];
    order.forEach(function (key) {
      m.operations.forEach(function (op) {
        if (op.operation === key && op.samples.length) out.push(op);
      });
    });
    return out;
  }

  function cover(m) {
    var ops = operationsInOrder(m, COVER_ORDER);
    return ops.length ? ops[0].samples[0] : null;
  }

  // ---- Cards ------------------------------------------------------------
  function renderFilters() {
    var cats = [];
    materials.forEach(function (m) {
      if (cats.indexOf(m.categoryLabel) === -1) cats.push(m.categoryLabel);
    });
    filtersEl.textContent = "";
    if (cats.length < 2) { filtersEl.hidden = true; return; }
    ["Alle"].concat(cats).forEach(function (label, i) {
      var b = el("button", "mat-chip", label);
      b.type = "button";
      var value = i === 0 ? "" : label;
      b.setAttribute("aria-pressed", String(value === activeCategory));
      b.addEventListener("click", function () {
        activeCategory = value;
        renderFilters();
        renderGrid();
      });
      filtersEl.appendChild(b);
    });
    filtersEl.hidden = false;
  }

  function renderGrid() {
    grid.textContent = "";
    var shown = materials.filter(function (m) {
      return !activeCategory || m.categoryLabel === activeCategory;
    });
    shown.forEach(function (m) {
      var card = el("button", "mat-card");
      card.type = "button";
      card.setAttribute("aria-label", m.name + ": bekijk de stalen");

      var fig = el("span", "mat-card-photo");
      var c = cover(m);
      if (c) {
        var img = el("img");
        img.src = c.thumb;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        fig.appendChild(img);
      }
      card.appendChild(fig);

      var body = el("span", "mat-card-body");
      body.appendChild(el("span", "tag", m.categoryLabel));
      body.appendChild(el("strong", "mat-card-name", m.name));
      body.appendChild(el("span", "mat-card-ops", m.operations.map(function (o) { return o.label; }).join(" · ")));
      card.appendChild(body);

      card.addEventListener("click", function () { openMaterial(m, card); });
      grid.appendChild(card);
    });
    statusEl.textContent = "";
    statusEl.hidden = true;
  }

  // ---- Detail dialog ----------------------------------------------------
  function openMaterial(m, opener) {
    lastFocus = opener || document.activeElement;
    document.getElementById("mat-dialog-cat").textContent = m.categoryLabel;
    document.getElementById("mat-dialog-title").textContent = m.name;
    var text = document.getElementById("mat-dialog-text");
    text.textContent = m.text || "";
    text.hidden = !m.text;
    document.getElementById("mat-dialog-cta").href =
      "./?materiaal=" + encodeURIComponent(m.name) + "#aanvraag";

    var wrap = document.getElementById("mat-dialog-ops");
    wrap.textContent = "";
    var all = [];
    var detailOps = operationsInOrder(m, DETAIL_ORDER);
    detailOps.forEach(function (op) {
      op.samples.forEach(function (s) {
        all.push({ sample: s, label: op.label, material: m.name });
      });
    });
    detailOps.forEach(function (op) {
      var section = el("section", "mat-op");
      section.appendChild(el("h3", null, op.label));
      section.appendChild(el("p", "mat-op-explain", EXPLAIN[op.operation] || ""));
      var row = el("div", "mat-op-photos");
      op.samples.forEach(function (s) {
        var b = el("button", "mat-photo");
        b.type = "button";
        b.setAttribute("aria-label", op.label + ": vergroot de foto");
        var img = el("img");
        img.src = s.thumb;
        img.alt = op.label + " op " + m.name;
        img.loading = "lazy";
        img.decoding = "async";
        b.appendChild(img);
        var meta = [s.caption, s.machine ? "Gemaakt met " + s.machine : ""].filter(Boolean).join(" · ");
        if (meta) b.appendChild(el("span", "caption", meta));
        b.addEventListener("click", function () {
          var idx = all.findIndex(function (x) { return x.sample.id === s.id; });
          openZoom(all, idx);
        });
        row.appendChild(b);
      });
      section.appendChild(row);
      wrap.appendChild(section);
    });

    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    if (history.replaceState) history.replaceState(null, "", "#" + m.slug);
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener("close", function () {
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  });
  dialog.addEventListener("click", function (e) {
    // Click on the backdrop (the dialog element itself) or a close button.
    if (e.target === dialog || e.target.closest("[data-close]")) closeDialog();
  });

  // ---- Zoom -------------------------------------------------------------
  function showZoom() {
    var item = zoomList[zoomIndex];
    var img = document.getElementById("mat-zoom-img");
    img.src = item.sample.image;
    img.alt = item.label + " op " + item.material;
    var meta = [item.label, item.sample.caption, item.sample.machine ? "Gemaakt met " + item.sample.machine : ""]
      .filter(Boolean).join(" · ");
    document.getElementById("mat-zoom-cap").textContent = item.material + ": " + meta;
    var many = zoomList.length > 1;
    zoom.querySelector(".mat-prev").hidden = !many;
    zoom.querySelector(".mat-next").hidden = !many;
  }

  function openZoom(list, index) {
    zoomList = list;
    zoomIndex = Math.max(0, index);
    showZoom();
    if (!zoom.open) zoom.showModal();
  }

  function step(delta) {
    zoomIndex = (zoomIndex + delta + zoomList.length) % zoomList.length;
    showZoom();
  }

  zoom.querySelector(".mat-prev").addEventListener("click", function () { step(-1); });
  zoom.querySelector(".mat-next").addEventListener("click", function () { step(1); });
  zoom.addEventListener("click", function (e) {
    if (e.target === zoom || e.target.closest("[data-close]")) zoom.close();
  });
  zoom.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
  });

  // ---- Load -------------------------------------------------------------
  function showEmpty(message) {
    grid.textContent = "";
    filtersEl.hidden = true;
    statusEl.hidden = false;
    statusEl.textContent = "";
    statusEl.appendChild(document.createTextNode(message + " "));
    var a = el("a", null, "Start met je idee");
    a.href = "./#aanvraag";
    statusEl.appendChild(a);
    statusEl.appendChild(document.createTextNode(" en ik adviseer je graag een materiaal."));
  }

  fetch("php/materialen.php", { headers: { Accept: "application/json" } })
    .then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    })
    .then(function (data) {
      materials = (data && data.materials) || [];
      if (!materials.length) {
        showEmpty("De stalen komen er binnenkort aan.");
        return;
      }
      renderFilters();
      renderGrid();
      // Deep link: materialen.html#berken-multiplex opens that material.
      var slug = decodeURIComponent(location.hash.slice(1));
      var hit = slug && materials.find(function (m) { return m.slug === slug; });
      if (hit) openMaterial(hit, null);
    })
    .catch(function () {
      showEmpty("De stalen konden niet geladen worden. Probeer het later opnieuw of");
    });
})();
