// Memory box configurator (herinneringsdoos.html).
//
// The customer's choices become one JSON object, sent with the form as
// "configuration". The admin app stores it on the request, and the generator
// in product-tools/memory-box reads exactly this shape (generate.py --config).
// Keep the three in step: see creafluxe-admin/src/lib/product-config.ts.
(function () {
  "use strict";

  var form = document.getElementById("config-form");
  if (!form) return;

  // Same limits as the admin schema (tested in the generator at every corner).
  var LIMITS = { w: [120, 340], d: [100, 250], h: [50, 150] };
  var T = 3;                 // material thickness used for the preview and the checks
  var MIN_COMPARTMENT = 15;  // mm, the generator refuses narrower compartments
  // The inside must be this much bigger than a photo window, or the window runs into the
  // border and leaves no room for the name (the generator sits it 35% from the back).
  var PHOTO_MARGIN = { w: 30, d: 63 };
  var LID_OVERHANG = 4, LID_RADIUS = 6, BORDER_INSET = 12, RAIL_IN = 4.5;

  var $ = function (id) { return document.getElementById(id); };
  var radio = function (name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; };
  var svg = $("preview-svg");
  var view = "lid";
  var artworkUrl = null;

  // ---------------------------------------------------------------- state

  function innerSize() {
    var preset = radio("size");
    if (preset && preset !== "custom") {
      var p = preset.split("x").map(Number);
      return { w: p[0], d: p[1], h: p[2] };
    }
    var clamp = function (v, lim) { v = Math.round(Number(v)); return isNaN(v) ? lim[0] : Math.min(lim[1], Math.max(lim[0], v)); };
    return { w: clamp($("c-w").value, LIMITS.w), d: clamp($("c-d").value, LIMITS.d), h: clamp($("c-h").value, LIMITS.h) };
  }

  function fractions(n) {
    var out = [];
    for (var k = 1; k < n; k++) out.push(Math.round((k / n) * 10000) / 10000);
    return out;
  }

  // Narrowest compartment for n evenly spaced compartments over `size` mm.
  function compartmentWidth(size, n) { return size / n - T; }

  function usableWidth(inner, lid) { return lid === "slide" ? inner.w - 2 * T : inner.w; }

  function photoSize() {
    var p = $("c-photo").value.split("x").map(Number);
    return { w: p[0], h: p[1] };
  }

  function photoFits(p, inner) { return p.w <= inner.w - PHOTO_MARGIN.w && p.h <= inner.d - PHOTO_MARGIN.d; }

  function readConfig() {
    var inner = innerSize();
    var lid = radio("lid");
    var motif = radio("motif");
    var file = $("c-artwork").files[0];
    var qty = Math.min(50, Math.max(1, Math.round(Number($("f-quantity").value) || 1)));
    return {
      product: "memory-box",
      version: 1,
      quantity: qty,
      options: {
        lid: lid,
        inner: inner,
        dividers: fractions(Number($("c-div-x").value)),
        dividersY: fractions(Number($("c-div-y").value)),
        feet: radio("feet"),
        border: $("c-border").value,
        ornament: motif === "ornament" ? $("c-ornament").value : "none",
        name: $("c-name").value.trim(),
        date: $("c-date").value.trim(),
        photoWindow: motif === "photo" ? photoSize() : null,
        artwork: motif === "artwork" && file ? file.name : null
      }
    };
  }

  // ------------------------------------------------- keep choices valid

  function syncControls() {
    var inner = innerSize();
    var lid = radio("lid");
    $("custom-size").hidden = radio("size") !== "custom";

    // Photo window: lift lid only.
    var photoInput = form.querySelector('input[name="motif"][value="photo"]');
    photoInput.disabled = lid !== "lift";
    if (photoInput.disabled && photoInput.checked) form.querySelector('input[name="motif"][value="ornament"]').checked = true;
    $("motif-photo-wrap").title = photoInput.disabled ? "Enkel bij het opliggende deksel" : "";

    // Photo sizes that do not fit this box.
    var photoSel = $("c-photo");
    Array.prototype.forEach.call(photoSel.options, function (o) {
      var p = o.value.split("x").map(Number);
      o.disabled = !photoFits({ w: p[0], h: p[1] }, inner);
    });
    if (photoSel.selectedOptions[0] && photoSel.selectedOptions[0].disabled) {
      var ok = Array.prototype.filter.call(photoSel.options, function (o) { return !o.disabled; });
      if (ok.length) photoSel.value = ok[ok.length - 1].value;
      else form.querySelector('input[name="motif"][value="ornament"]').checked = true;
    }
    if (!Array.prototype.some.call(photoSel.options, function (o) { return !o.disabled; })) photoInput.disabled = true;

    var motif = radio("motif");
    $("ornament-field").hidden = motif !== "ornament";
    $("artwork-field").hidden = motif !== "artwork";
    $("photo-field").hidden = motif !== "photo";
    $("c-artwork").disabled = motif !== "artwork";   // only sent when chosen

    // Compartments that would be too narrow.
    var hint = [];
    [["c-div-x", usableWidth(inner, lid)], ["c-div-y", inner.d]].forEach(function (pair) {
      var sel = $(pair[0]);
      Array.prototype.forEach.call(sel.options, function (o) {
        o.disabled = compartmentWidth(pair[1], Number(o.value)) < MIN_COMPARTMENT;
      });
      while (sel.selectedOptions[0].disabled && sel.selectedIndex > 0) sel.selectedIndex -= 1;
    });
    var nx = Number($("c-div-x").value), ny = Number($("c-div-y").value);
    if (nx * ny > 1) {
      hint.push("Elk vak is binnenin ongeveer " + Math.floor(compartmentWidth(usableWidth(inner, lid), nx) + (nx === 1 ? T : 0)) +
        " × " + Math.floor(compartmentWidth(inner.d, ny) + (ny === 1 ? T : 0)) + " mm.");
      if (nx > 1 && ny > 1) hint.push("De tussenschotten worden in elkaar geschoven.");
    }
    if (lid === "slide") hint.push("Bij een schuifdeksel is de doos binnenin 6 mm smaller (de geleiders).");
    $("div-hint").textContent = hint.join(" ");
  }

  // --------------------------------------------------------- preview

  var NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(e);
    return e;
  }
  var f1 = function (v) { return Math.round(v * 10) / 10; };

  function heartPath(cx, cy, s) {
    // s = width; point at the bottom
    var r = s / 4;
    return "M" + f1(cx) + " " + f1(cy + s * 0.42) +
      " C" + f1(cx - s * 0.62) + " " + f1(cy + s * 0.02) + " " + f1(cx - s * 0.5) + " " + f1(cy - s * 0.42) + " " + f1(cx - r) + " " + f1(cy - s * 0.36) +
      " C" + f1(cx - s * 0.08) + " " + f1(cy - s * 0.33) + " " + f1(cx) + " " + f1(cy - s * 0.2) + " " + f1(cx) + " " + f1(cy - s * 0.12) +
      " C" + f1(cx) + " " + f1(cy - s * 0.2) + " " + f1(cx + s * 0.08) + " " + f1(cy - s * 0.33) + " " + f1(cx + r) + " " + f1(cy - s * 0.36) +
      " C" + f1(cx + s * 0.5) + " " + f1(cy - s * 0.42) + " " + f1(cx + s * 0.62) + " " + f1(cy + s * 0.02) + " " + f1(cx) + " " + f1(cy + s * 0.42) + " Z";
  }

  function starPath(cx, cy, s) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? s * 0.22 : s * 0.5;
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(f1(cx + r * Math.cos(a)) + " " + f1(cy + r * Math.sin(a)));
    }
    return "M" + pts.join(" L") + " Z";
  }

  // Points every ~step along the rectangle (x0,y0)-(x1,y1), corners included.
  function perimeterPoints(x0, y0, x1, y1, step) {
    var pts = [];
    var side = function (ax, ay, bx, by) {
      var len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / step));
      for (var i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, Math.atan2(by - ay, bx - ax)]);
    };
    side(x0, y0, x1, y0); side(x1, y0, x1, y1); side(x1, y1, x0, y1); side(x0, y1, x0, y0);
    return pts;
  }

  function drawBorder(kind, x0, y0, x1, y1, k) {
    var g = el("g", {});
    if (kind === "none") return;
    el("rect", { x: x0 - 3 * k, y: y0 - 3 * k, width: x1 - x0 + 6 * k, height: y1 - y0 + 6 * k, class: "engrave", "stroke-width": 0.6 }, g);
    if (kind === "double") {
      el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: "engrave" }, g);
      el("rect", { x: x0 + 3 * k, y: y0 + 3 * k, width: x1 - x0 - 6 * k, height: y1 - y0 - 6 * k, class: "engrave" }, g);
    } else if (kind === "dots") {
      perimeterPoints(x0, y0, x1, y1, 8 * k).forEach(function (p) { el("circle", { cx: f1(p[0]), cy: f1(p[1]), r: f1(1.6 * k), class: "engrave-fill" }, g); });
    } else if (kind === "hearts") {
      perimeterPoints(x0, y0, x1, y1, 14 * k).forEach(function (p) { el("path", { d: heartPath(p[0], p[1], 7 * k), class: "engrave" }, g); });
    } else if (kind === "stars") {
      perimeterPoints(x0, y0, x1, y1, 14 * k).forEach(function (p) { el("path", { d: starPath(p[0], p[1], 8 * k), class: "engrave" }, g); });
    } else if (kind === "scallop") {
      var d = "", pts = perimeterPoints(x0, y0, x1, y1, 10 * k);
      pts.forEach(function (p, i) {
        var q = pts[(i + 1) % pts.length];
        d += (i ? " " : "M" + f1(p[0]) + " " + f1(p[1])) + " A" + f1(5 * k) + " " + f1(5 * k) + " 0 0 1 " + f1(q[0]) + " " + f1(q[1]);
      });
      el("path", { d: d, class: "engrave" }, g);
    } else if (kind === "vine") {
      var pv = perimeterPoints(x0, y0, x1, y1, 6 * k), dv = "";
      pv.forEach(function (p, i) {
        var a = p[2] + Math.PI / 2, off = (i % 2 ? 1.6 : -1.6) * k;
        dv += (i ? " L" : "M") + f1(p[0] + off * Math.cos(a)) + " " + f1(p[1] + off * Math.sin(a));
        if (i % 3 === 0) {
          var lx = p[0] + off * 2.6 * Math.cos(a), ly = p[1] + off * 2.6 * Math.sin(a);
          el("ellipse", { cx: f1(lx), cy: f1(ly), rx: f1(2.4 * k), ry: f1(1.1 * k), class: "engrave-fill", transform: "rotate(" + f1((p[2] * 180) / Math.PI + 35) + " " + f1(lx) + " " + f1(ly) + ")" }, g);
        }
      });
      el("path", { d: dv + " Z", class: "engrave" }, g);
    }
  }

  function fitText(node, maxWidth) {
    try {
      var w = node.getComputedTextLength();
      if (w > maxWidth) node.setAttribute("font-size", f1((Number(node.getAttribute("font-size")) * maxWidth) / w));
    } catch (e) { /* not rendered yet */ }
  }

  function drawLid(c) {
    var o = c.options, inner = o.inner;
    var Wo = inner.w + 2 * T, Do = inner.d + 2 * T;
    var slide = o.lid === "slide";
    var LW = slide ? Wo : Wo + 2 * LID_OVERHANG, LD = slide ? Do : Do + 2 * LID_OVERHANG;
    var k = Math.min(340 / LW, 230 / LD);                        // px per mm
    var x = (400 - LW * k) / 2, y = (300 - LD * k) / 2 + (o.lid === "hinge" ? 6 : 0);
    var engr;                                                    // engraving area in px

    if (o.lid === "hinge") {
      [0.12, 0.3, 0.7, 0.88].forEach(function (f, i) {
        el("rect", { x: f1(x + LW * k * f - 7 * k), y: f1(y - 7 * k), width: f1(14 * k), height: f1(9 * k), class: i % 3 ? "wood" : "wood-dark" });
      });
    }
    if (slide) {
      el("rect", { x: f1(x), y: f1(y), width: f1(LW * k), height: f1(LD * k), class: "wood-dark" });
      var rail = (T + RAIL_IN) * k;
      el("rect", { x: f1(x + rail), y: f1(y + rail), width: f1(LW * k - 2 * rail), height: f1(LD * k - rail), class: "wood" });
      engr = [x + rail + 8 * k, y + rail + 8 * k, x + LW * k - rail - 8 * k, y + LD * k - 10 * k];
    } else {
      el("rect", { x: f1(x), y: f1(y), width: f1(LW * k), height: f1(LD * k), rx: f1(LID_RADIUS * k), class: "wood" });
      engr = [x + BORDER_INSET * k, y + BORDER_INSET * k, x + (LW - BORDER_INSET) * k, y + (LD - BORDER_INSET) * k];
    }

    drawBorder(o.border, engr[0], engr[1], engr[2], engr[3], k);
    var pad = o.border === "none" ? 2 * k : 10 * k;
    var cx = (engr[0] + engr[2]) / 2, top = engr[1] + pad, bottom = engr[3] - pad, maxW = engr[2] - engr[0] - 2 * pad;
    var nameH = o.name ? Math.min(30, (LD - 2 * BORDER_INSET) * 0.24) * k : 0;
    var dateH = o.date ? 5.5 * k : 0;
    var textH = (nameH ? nameH * 1.1 : 0) + (dateH ? dateH + 6 * k : 0);
    var motifTop = top, motifBottom = bottom - textH - (textH ? 4 * k : 0);

    if (o.photoWindow) {
      var pw = o.photoWindow.w * k, ph = o.photoWindow.h * k;
      var wy = y + (LD - o.photoWindow.h) * 0.35 * k;
      el("rect", { x: f1(cx - pw / 2), y: f1(wy), width: f1(pw), height: f1(ph), rx: f1(4 * k), class: "window" });
      el("rect", { x: f1(cx - pw / 2 - 4 * k), y: f1(wy - 4 * k), width: f1(pw + 8 * k), height: f1(ph + 8 * k), rx: f1(6 * k), class: "engrave", "stroke-width": 0.6 });
      var t = el("text", { x: f1(cx), y: f1(wy + ph / 2 + 4), "text-anchor": "middle", class: "photo-hint" });
      t.textContent = "jouw foto";
      // Like the generator: name and date share the strip between the window and the front border.
      var room = bottom - (wy + ph + 4 * k);
      nameH = o.name ? Math.min(30 * k, room * (o.date ? 0.62 : 0.9)) : 0;
      dateH = o.date ? Math.min(5.5 * k, room * 0.22) : 0;
      textH = (nameH ? nameH * 1.1 : 0) + (dateH ? dateH + 6 * k : 0);
      motifBottom = wy + ph + 4 * k + (room - textH) / 2;
    } else if (o.artwork) {
      var box = [cx - maxW / 2, motifTop, maxW, Math.max(10, motifBottom - motifTop)];
      if (artworkUrl) {
        el("image", { href: artworkUrl, x: f1(box[0]), y: f1(box[1]), width: f1(box[2]), height: f1(box[3]), preserveAspectRatio: "xMidYMid meet", style: "filter: grayscale(1) sepia(.6) contrast(1.4); mix-blend-mode: multiply" });
      } else {
        el("rect", { x: f1(box[0]), y: f1(box[1]), width: f1(box[2]), height: f1(box[3]), class: "engrave", "stroke-dasharray": "4 3" });
        var ta = el("text", { x: f1(cx), y: f1(box[1] + box[3] / 2 + 4), "text-anchor": "middle", class: "photo-hint" });
        ta.textContent = o.artwork;
      }
    } else if (o.ornament !== "none") {
      var room = motifBottom - motifTop;
      var big = !o.name && !o.date;
      var s = Math.max(8, Math.min(big ? room * 0.8 : room * 0.75, maxW * 0.5, (big ? 90 : 34) * k));
      var oy = motifTop + room / 2;
      if (o.ornament === "heart") el("path", { d: heartPath(cx, oy, s), class: "engrave", "stroke-width": 1.6 });
      if (o.ornament === "star") el("path", { d: starPath(cx, oy, s), class: "engrave", "stroke-width": 1.6 });
      if (o.ornament === "hearts") {
        el("path", { d: heartPath(cx - s * 0.28, oy, s * 0.7), class: "engrave", "stroke-width": 1.6 });
        el("path", { d: heartPath(cx + s * 0.28, oy + s * 0.08, s * 0.7), class: "engrave", "stroke-width": 1.6 });
      }
    }

    var ty = o.photoWindow ? motifBottom : bottom - textH;
    if (o.name) {
      var n = el("text", { x: f1(cx), y: f1(ty + nameH * 0.85), "text-anchor": "middle", "font-size": f1(nameH), class: "name" });
      n.textContent = o.name;
      fitText(n, maxW);
      ty += nameH * 1.1;
    }
    if (o.date) {
      var dt = el("text", { x: f1(cx), y: f1(ty + dateH + 4 * k), "text-anchor": "middle", "font-size": f1(dateH * 1.35), class: "date" });
      dt.textContent = o.date;
      fitText(dt, maxW);
    }
  }

  function drawInside(c) {
    var o = c.options, inner = o.inner;
    var Wo = inner.w + 2 * T, Do = inner.d + 2 * T;
    var k = Math.min(320 / Wo, 220 / Do);
    var x = (400 - Wo * k) / 2 + 8, y = (300 - Do * k) / 2 - 8;
    el("rect", { x: f1(x), y: f1(y), width: f1(Wo * k), height: f1(Do * k), class: "wood-dark" });
    var liner = o.lid === "slide" ? T : 0;
    var ix = x + (T + liner) * k, iy = y + T * k, iw = (inner.w - 2 * liner) * k, ih = inner.d * k;
    el("rect", { x: f1(ix), y: f1(iy), width: f1(iw), height: f1(ih), class: "wood" });
    o.dividers.forEach(function (f) {
      el("rect", { x: f1(ix + iw * f - (T * k) / 2), y: f1(iy), width: f1(T * k), height: f1(ih), class: "wood-dark" });
    });
    o.dividersY.forEach(function (f) {
      el("rect", { x: f1(ix), y: f1(iy + ih * f - (T * k) / 2), width: f1(iw), height: f1(T * k), class: "wood-dark" });
    });
    // dimension lines: width under the box, depth on the left
    var by = y + Do * k + 16;
    el("line", { x1: f1(ix), y1: by, x2: f1(ix + iw), y2: by, class: "dim-line" });
    var tw = el("text", { x: f1(ix + iw / 2), y: by + 14, "text-anchor": "middle", class: "dim" });
    tw.textContent = (inner.w - 2 * liner) + " mm";
    var lx = x - 14;
    el("line", { x1: lx, y1: f1(iy), x2: lx, y2: f1(iy + ih), class: "dim-line" });
    var td = el("text", { x: lx - 4, y: f1(iy + ih / 2), "text-anchor": "middle", class: "dim", transform: "rotate(-90 " + (lx - 4) + " " + f1(iy + ih / 2) + ")" });
    td.textContent = inner.d + " mm";
    var tf = el("text", { x: f1(x + (Wo * k) / 2), y: f1(y - 8), "text-anchor": "middle", class: "dim" });
    tf.textContent = "achterkant";
  }

  var LID_NAMES = { lift: "opliggend deksel", slide: "schuifdeksel", hinge: "scharnierdeksel" };

  function render() {
    syncControls();
    var c = readConfig();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 400 300");
    if (view === "lid") drawLid(c); else drawInside(c);

    var o = c.options, extra = o.lid === "slide" ? 6 : 14;
    var parts = o.dividers.length + 1 === 1 && o.dividersY.length + 1 === 1 ? "1 vak" : (o.dividers.length + 1) * (o.dividersY.length + 1) + " vakken";
    $("preview-desc").textContent = "Binnenmaat " + o.inner.w + " × " + o.inner.d + " × " + o.inner.h + " mm, buitenmaat ca. " +
      (o.inner.w + extra) + " × " + (o.inner.d + extra) + " × " + (o.inner.h + 14) + " mm · " + LID_NAMES[o.lid] + " · " + parts + ".";
  }

  // ----------------------------------------------------------- events

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  ["c-w", "c-d", "c-h"].forEach(function (id) {
    $(id).addEventListener("blur", function () {
      var s = innerSize();
      $("c-w").value = s.w; $("c-d").value = s.d; $("c-h").value = s.h;
      render();
    });
  });
  $("c-artwork").addEventListener("change", function () {
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    var f = this.files[0];
    artworkUrl = f && /^image\/(png|jpeg|svg\+xml)$/.test(f.type) ? URL.createObjectURL(f) : null;
    render();
  });
  [["tab-lid", "lid"], ["tab-inside", "inside"]].forEach(function (pair) {
    $(pair[0]).addEventListener("click", function () {
      view = pair[1];
      $("tab-lid").setAttribute("aria-selected", String(view === "lid"));
      $("tab-inside").setAttribute("aria-selected", String(view === "inside"));
      render();
    });
  });
  // Fonts change text widths: draw again once they are in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  render();

  // ----------------------------------------------------------- submit

  var started = $("f-started");
  started.value = String(Math.floor(Date.now() / 1000));
  var statusEl = $("form-status");
  var submitBtn = form.querySelector('button[type="submit"]');

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "form-status" + (kind ? " is-" + kind : "");
  }

  function markError(input, message) {
    var field = input.closest(".field");
    field.classList.add("has-error");
    var msg = document.createElement("p");
    msg.className = "field-error";
    msg.id = input.id + "-error";
    msg.textContent = message;
    field.appendChild(msg);
    input.setAttribute("aria-describedby", msg.id);
  }

  function validate(c) {
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelectorAll(".field-error").forEach(function (m) { m.remove(); });
    var bad = null;
    var name = $("f-name"), email = $("f-email"), privacy = $("f-privacy"), art = $("c-artwork");
    if (radio("motif") === "artwork") {
      if (!art.files[0]) { markError(art, "Kies het bestand met je tekening, of kies een versiering."); bad = bad || art; }
      else if (art.files[0].size > 10 * 1024 * 1024) { markError(art, "Dit bestand is groter dan 10 MB."); bad = bad || art; }
    }
    if (!name.value.trim()) { markError(name, "Vul je naam in."); bad = bad || name; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { markError(email, "Vul een geldig e-mailadres in, bv. naam@voorbeeld.be."); bad = bad || email; }
    if (!privacy.checked) { markError(privacy, "Vink aan dat je akkoord gaat."); bad = bad || privacy; }
    if (bad) bad.focus();
    return !bad;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    render();
    var c = readConfig();
    if (!validate(c)) { setStatus("Controleer de gemarkeerde velden.", "error"); return; }
    $("c-configuration").value = JSON.stringify(c);

    submitBtn.disabled = true;
    setStatus("Bezig met versturen…");
    fetch(form.action, { method: "POST", body: new FormData(form), headers: { "Accept": "application/json" } })
      .then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
      .then(function (data) {
        if (data.ok) {
          setStatus("Bedankt! Je aanvraag is verstuurd. Je krijgt zo dadelijk een bevestiging per e-mail, en binnen twee werkdagen een prijs.", "success");
        } else {
          submitBtn.disabled = false;
          setStatus(data.error || "Versturen is niet gelukt. Probeer het opnieuw of mail naar offerte@creafluxe.be.", "error");
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        setStatus("Geen verbinding. Controleer je internet en probeer het opnieuw, of mail naar offerte@creafluxe.be.", "error");
      });
  });
})();
