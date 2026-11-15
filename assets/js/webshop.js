// Webshop (webshop.html): shows the products from assets/data/producten.json as cards with
// a category filter. A card opens the product with a form to personalise it (text, own
// file, quantity); the form posts to php/aanvraag.php like the other request forms.
(function () {
  "use strict";

  var grid = document.getElementById("shop-grid");
  if (!grid) return;

  var filtersEl = document.getElementById("shop-filters");
  var statusEl = document.getElementById("shop-status");
  var dialog = document.getElementById("shop-dialog");
  var form = document.getElementById("shop-form");
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Line drawings shown until a product has a photo ("image" in producten.json).
  // Every shape has pathLength="1" so the card can redraw it on hover.
  var ART = {
    box: '<path d="M20 44 L60 30 L100 44 V82 L60 96 L20 82 Z"/><path d="M20 44 L60 58 L100 44"/><path d="M60 58 V96"/><path class="accent" d="M36 60 C36 55 44 55 44 60 C44 55 52 55 52 60 C52 66 44 70 44 70 C44 70 36 66 36 60 Z"/>',
    sign: '<path d="M14 46 H106 V86 H14 Z"/><path d="M40 46 L60 26 L80 46"/><circle cx="60" cy="26" r="2.5"/><path class="accent" d="M28 72 C32 58 38 58 40 66 C42 74 46 74 50 62 C52 56 58 58 58 66 C58 74 64 72 68 64 C72 56 78 60 78 68 H92"/>',
    puzzle: '<path d="M20 30 H52 C48 20 68 20 64 30 H100 V58 C110 54 110 74 100 70 V98 H64 C68 88 48 88 52 98 H20 V70 C30 74 30 54 20 58 Z"/><path class="accent" d="M60 30 V98"/><path class="accent" d="M20 64 H100"/>',
    keyring: '<circle cx="34" cy="38" r="14"/><path d="M45 47 L58 58"/><path d="M52 52 H96 A10 10 0 0 1 106 62 V86 A10 10 0 0 1 96 96 H62 A10 10 0 0 1 52 86 Z"/><circle class="accent" cx="79" cy="70" r="8"/><path class="accent" d="M66 88 C68 80 90 80 92 88"/>',
    train: '<path d="M16 84 V54 H44 V38 H70 V54 H98 V84 Z"/><path d="M50 38 V28 H64 V38"/><circle cx="34" cy="88" r="9"/><circle cx="78" cy="88" r="9"/><path d="M98 70 H108"/><path class="accent" d="M24 68 H90"/><path class="accent" d="M82 54 V44 H92 V54"/>',
    sleigh: '<path d="M22 40 C22 62 30 70 52 70 H96 V52 H62 C50 52 44 46 44 34"/><path d="M34 70 V86"/><path d="M84 70 V86"/><path d="M14 80 C14 90 20 92 28 92 H98 C106 92 110 88 110 82"/><path class="accent" d="M52 60 H88"/>'
  };

  var products = [];
  var active = "";
  var lastFocus = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function priceText(p) {
    if (typeof p.price !== "number") return "Prijs op aanvraag";
    return "€ " + p.price.toFixed(2).replace(".", ",").replace(",00", "");
  }

  function media(p, cls) {
    var wrap = el("span", cls);
    if (p.image) {
      var img = el("img");
      img.src = p.image;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
    } else {
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 120 120");
      svg.setAttribute("class", "product-art");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = ART[p.art] || ART.box;   // fixed markup from this file, not from the data
      Array.prototype.forEach.call(svg.children, function (shape) { shape.setAttribute("pathLength", "1"); });
      wrap.appendChild(svg);
    }
    return wrap;
  }

  // ---- Filters and cards ---------------------------------------------------
  function renderFilters() {
    var cats = [];
    products.forEach(function (p) { if (cats.indexOf(p.category) === -1) cats.push(p.category); });
    filtersEl.textContent = "";
    if (cats.length < 2) { filtersEl.hidden = true; return; }
    ["Alles"].concat(cats).forEach(function (label, i) {
      var b = el("button", "chip", label);
      b.type = "button";
      var value = i === 0 ? "" : label;
      b.setAttribute("aria-pressed", String(value === active));
      b.addEventListener("click", function () { active = value; renderFilters(); renderGrid(); });
      filtersEl.appendChild(b);
    });
    filtersEl.hidden = false;
  }

  function renderGrid() {
    grid.textContent = "";
    products.filter(function (p) { return !active || p.category === active; }).forEach(function (p) {
      var li = el("li");
      var card = el("button", "product");
      card.type = "button";
      card.setAttribute("aria-label", p.name + ": bekijk en personaliseer");
      card.appendChild(media(p, "product-media"));
      var body = el("span", "product-body");
      body.appendChild(el("span", "tag", p.category));
      body.appendChild(el("strong", "product-name", p.name));
      body.appendChild(el("span", "product-text", p.text));
      body.appendChild(el("span", "product-price", priceText(p)));
      card.appendChild(body);
      card.addEventListener("click", function () { openProduct(p, card); });
      li.appendChild(card);
      grid.appendChild(li);
    });
    statusEl.hidden = true;
  }

  // ---- Product dialog --------------------------------------------------------
  function openProduct(p, opener) {
    lastFocus = opener || document.activeElement;
    document.getElementById("shop-cat").textContent = p.category;
    document.getElementById("shop-title").textContent = p.name;
    document.getElementById("shop-text").textContent = p.text;
    document.getElementById("shop-price").textContent = priceText(p) + (typeof p.price === "number" ? " per stuk" : "");
    var holder = document.getElementById("shop-media");
    holder.textContent = "";
    holder.appendChild(media(p, "shop-dialog-art"));

    var wants = p.personalise || ["text", "file"];
    document.getElementById("shop-text-field").hidden = wants.indexOf("text") === -1;
    document.getElementById("shop-file-field").hidden = wants.indexOf("file") === -1;

    form.reset();
    form.querySelectorAll(".file-list").forEach(function (l) { l.textContent = ""; });
    form.querySelectorAll(".field-error").forEach(function (m) { m.remove(); });
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelector(".form-status").textContent = "";
    form.elements.product_id.value = p.id;
    document.getElementById("s-address").hidden = true;

    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    if (history.replaceState) history.replaceState(null, "", "#" + p.id);
  }

  dialog.addEventListener("close", function () {
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  });
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });

  // Quantity stepper
  var qty = document.getElementById("s-quantity");
  form.querySelectorAll("[data-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = (parseInt(qty.value, 10) || 1) + parseInt(b.getAttribute("data-step"), 10);
      qty.value = String(Math.max(1, Math.min(50, next)));
    });
  });

  // Delivery address only when delivery is ticked
  var delivery = document.getElementById("s-delivery");
  delivery.addEventListener("change", function () {
    document.getElementById("s-address").hidden = !delivery.checked;
  });

  // ---- Load ------------------------------------------------------------------
  fetch("assets/data/producten.json", { headers: { Accept: "application/json" } })
    .then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    })
    .then(function (data) {
      products = ((data && data.products) || []).filter(function (p) { return p && p.id && p.name && !p.configurator; });
      if (!products.length) throw new Error("empty");
      renderFilters();
      renderGrid();
      // Deep link: webshop.html#naambordje opens that product.
      var id = decodeURIComponent(location.hash.slice(1));
      var hit = id && products.find(function (p) { return p.id === id; });
      if (hit) openProduct(hit, null);
    })
    .catch(function () {
      statusEl.hidden = false;
      statusEl.textContent = "De producten konden niet geladen worden. Probeer het later opnieuw of vraag je idee aan via het atelier.";
    });
})();
