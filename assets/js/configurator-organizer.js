// Organizer wall configurator (organizer-wand.html).
//
// The customer picks the size of the wall and, per kind of box, its inner size and how many.
// The page hangs every box on the keyhole grid the same way the generator does
// (product-tools/organizing-wall: wall.py Grid, boxes.py peg_layout, layout.py place_box),
// draws the result and sends the choices as one JSON object ("configuration").
// php/organizing-wall.php checks that JSON again; keep the limits in step with it.
(function () {
  "use strict";

  var form = document.getElementById("wall-form");
  if (!form) return;

  // Generator defaults (config.py): 3 mm material, a keyhole every 32 mm.
  var T = 3, FOOT = 3, PITCH = 32, EDGE = 12;
  var HOLE_R = (18 + 1) / 2;      // (HEAD_D + HEAD_PLAY) / 2
  var SLOT_HALF = (8 + 0.4) / 2;  // (NECK_D + NECK_PLAY) / 2
  var TRAVEL = 10, NECK_R = 4, PEG_EDGE = 2, PEG_TOP_INSET = 12;
  var SHEET = [596, 301];         // plate 600 x 305 minus 2 mm margin

  var LIMITS = { wall_w: [300, 2400], wall_h: [300, 1500], inner_w: [30, 400], inner_d: [20, 150], h_back: [20, 200], h_front: [15, 200] };
  var MAX_TYPES = 12, MAX_PER_TYPE = 40, MAX_BOXES = 80, MIN_COMPARTMENT = 15, TWO_PEGS = 38;

  var PRESETS = {
    bottle: { label: "Flesjeshouder", inner_w: 36, inner_d: 36, h_back: 45, h_front: 22, dividers: 0, scoop: false },
    tin:    { label: "Blikjesplank", inner_w: 210, inner_d: 46, h_back: 22, h_front: 22, dividers: 4, scoop: false },
    tray:   { label: "Bakje met greep", inner_w: 100, inner_d: 70, h_back: 60, h_front: 35, dividers: 1, scoop: true },
    custom: { label: "Eigen maat", inner_w: 80, inner_d: 60, h_back: 50, h_front: 30, dividers: 0, scoop: false }
  };
  var KEYS = "ABCDEFGHIJKL";
  var SVG_NS = "http://www.w3.org/2000/svg";

  var $ = function (id) { return document.getElementById(id); };
  var list = $("box-list");
  var svg = $("wall-svg");
  var boxes = [];       // one entry per row: { preset, label, inner_w, inner_d, h_back, h_front, dividers, scoop, qty }
  var lastLayout = { placed: [], missing: 0, grid: null };

  function clamp(v, range) { return Math.max(range[0], Math.min(range[1], v)); }
  function num(input, fallback) { var v = parseInt(input.value, 10); return isNaN(v) ? fallback : v; }

  // ---------------------------------------------------------------- geometry
  function makeGrid(W, H) {
    var xMin = EDGE + HOLE_R, xMax = W - EDGE - HOLE_R;
    var nCols = Math.floor((xMax - xMin) / PITCH + 1e-9) + 1;
    var x0 = xMin + ((xMax - xMin) - (nCols - 1) * PITCH) / 2;
    var yMin = EDGE + SLOT_HALF, yMax = H - EDGE - (TRAVEL + HOLE_R);
    var nRows = Math.floor((yMax - yMin) / PITCH + 1e-9) + 1;
    var y0 = yMin + ((yMax - yMin) - (nRows - 1) * PITCH) / 2;
    var xs = [], ys = [];
    for (var c = 0; c < nCols; c++) xs.push(x0 + c * PITCH);
    // Row 1 is the top row. ys are measured from the top of the wall (the generator counts from the bottom).
    for (var r = 0; r < nRows; r++) ys.push(H - (y0 + (nRows - 1 - r) * PITCH));
    return { W: W, H: H, nCols: Math.max(0, nCols), nRows: Math.max(0, nRows), xs: xs, ys: ys };
  }

  // Outer size of the back plate and where its pegs sit (u from the left, v from the bottom).
  function boxShape(b) {
    var Wo = b.inner_w + 2 * T, Hb = FOOT + T + b.h_back;
    var cells = Math.floor((Wo - 2 * (NECK_R + PEG_EDGE)) / PITCH + 1e-9);
    var pc = cells < 1 ? 1 : (Wo <= 130 || cells < 2 ? 2 : 3);
    var step = pc === 1 ? 0 : (pc === 2 ? cells : Math.floor(cells / 2));
    var us = [];
    for (var i = 0; i < pc; i++) us.push(Wo / 2 + (i - (pc - 1) / 2) * step * PITCH);
    var vMin = NECK_R + PEG_EDGE;
    var vTop = Math.max(Hb - PEG_TOP_INSET, vMin);
    var ky = Math.floor((vTop - vMin) / PITCH + 1e-9);
    if (ky < 1) {
      var vAlt = Hb - (NECK_R + PEG_EDGE);
      if (Math.floor((vAlt - vMin) / PITCH + 1e-9) >= 1) { vTop = vAlt; ky = Math.floor((vTop - vMin) / PITCH + 1e-9); }
    }
    var vs = ky >= 1 ? [vTop, vTop - ky * PITCH] : [vTop];
    return { Wo: Wo, Hb: Hb, us: us, vs: vs, stepCols: step, stepRows: ky >= 1 ? ky : 0, pegs: us.length * vs.length };
  }

  // What is wrong with one kind of box, in words ("" when fine).
  function boxProblem(b) {
    if (b.h_front > b.h_back) return "De voorkant kan niet hoger zijn dan de achterkant.";
    if (b.inner_w < TWO_PEGS && b.h_back < TWO_PEGS) {
      return "Dit bakje heeft maar plaats voor één haakje en zou gaan draaien. Maak het minstens " + TWO_PEGS + " mm breed of " + TWO_PEGS + " mm hoog achteraan.";
    }
    if ((b.inner_w - b.dividers * T) / (b.dividers + 1) < MIN_COMPARTMENT) {
      return "Zoveel vakken passen niet: een vak moet minstens " + MIN_COMPARTMENT + " mm breed zijn.";
    }
    if (b.scoop && (b.inner_w < 50 || b.h_front < 25)) return "Een greep kan vanaf 50 mm breed en 25 mm hoog vooraan.";
    return "";
  }

  // Hang every box on the grid: first free position, row by row from the top left.
  function layout(grid) {
    var order = boxes.map(function (b, i) { return { b: b, i: i, shape: boxShape(b) }; })
      .filter(function (t) { return !boxProblem(t.b); })
      .sort(function (a, c) { return c.shape.Hb - a.shape.Hb || a.i - c.i; });
    var placed = [], missing = 0, GAP = 3;

    order.forEach(function (t) {
      var s = t.shape, start = 0, total = grid.nCols * grid.nRows;
      for (var n = 0; n < t.b.qty; n++) {
        var found = false;
        for (var k = start; k < total && !found; k++) {
          var col = k % grid.nCols, row = Math.floor(k / grid.nCols);   // 0-based
          if (col + (s.us.length - 1) * s.stepCols >= grid.nCols) continue;
          if (row + s.stepRows >= grid.nRows) continue;
          var x0 = grid.xs[col] - s.us[0];
          var top = grid.ys[row] - (s.Hb - s.vs[0]);
          var x1 = x0 + s.Wo, bottom = top + s.Hb;
          if (x0 < 0 || top < 0 || x1 > grid.W || bottom > grid.H) continue;
          var clash = placed.some(function (p) {
            return x0 < p.x1 + GAP && x1 > p.x0 - GAP && top < p.bottom + GAP && bottom > p.top - GAP;
          });
          if (clash) continue;
          placed.push({ index: t.i, col: col + 1, row: row + 1, x0: x0, x1: x1, top: top, bottom: bottom, shape: s, box: t.b });
          start = k + 1;
          found = true;
        }
        if (!found) { missing += t.b.qty - n; break; }
      }
    });
    return { placed: placed, missing: missing, grid: grid };
  }

  function panelCount(W, H) {
    var a = Math.ceil(W / SHEET[0]) * Math.ceil(H / SHEET[1]);
    var b = Math.ceil(W / SHEET[1]) * Math.ceil(H / SHEET[0]);
    return Math.min(a, b);
  }

  // ---------------------------------------------------------------- reading the form
  function wallSize() {
    var choice = form.querySelector('input[name="wall"]:checked').value;
    if (choice !== "custom") {
      var parts = choice.split("x");
      return { w: parseInt(parts[0], 10), h: parseInt(parts[1], 10) };
    }
    return { w: clamp(num($("w-w"), 900), LIMITS.wall_w), h: clamp(num($("w-h"), 600), LIMITS.wall_h) };
  }

  function readRows() {
    Array.prototype.forEach.call(list.children, function (row, i) {
      var b = boxes[i];
      var get = function (name) { return row.querySelector('[data-field="' + name + '"]'); };
      b.inner_w = clamp(num(get("inner_w"), b.inner_w), LIMITS.inner_w);
      b.inner_d = clamp(num(get("inner_d"), b.inner_d), LIMITS.inner_d);
      b.h_back = clamp(num(get("h_back"), b.h_back), LIMITS.h_back);
      b.h_front = clamp(num(get("h_front"), b.h_front), LIMITS.h_front);
      b.dividers = clamp(num(get("compartments"), b.dividers + 1), [1, 9]) - 1;
      b.scoop = get("scoop").checked;
      b.qty = clamp(num(get("qty"), b.qty), [1, MAX_PER_TYPE]);
    });
  }

  function readConfig() {
    var wall = wallSize();
    return {
      product: "organizing-wall",
      version: 1,
      quantity: 1,
      options: {
        wall: wall,
        boxes: boxes.map(function (b) {
          return { label: b.label, inner_w: b.inner_w, inner_d: b.inner_d, h_back: b.h_back, h_front: b.h_front, dividers: b.dividers, scoop: b.scoop, qty: b.qty };
        }),
        layout: lastLayout.missing ? [] : lastLayout.placed.map(function (p) { return ["bak" + (p.index + 1), p.col, p.row]; })
      }
    };
  }

  // ---------------------------------------------------------------- box rows
  function field(label, name, value, range, extra) {
    var id = "b-" + name + "-" + Math.random().toString(36).slice(2, 8);
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" data-field="' + name + '" type="number" inputmode="numeric" min="' + range[0] + '" max="' + range[1] + '" step="1" value="' + value + '"' + (extra || "") + '></div>';
  }

  function addRow(presetKey) {
    if (boxes.length >= MAX_TYPES) return;
    var p = PRESETS[presetKey];
    boxes.push({ preset: presetKey, label: p.label, inner_w: p.inner_w, inner_d: p.inner_d, h_back: p.h_back, h_front: p.h_front, dividers: p.dividers, scoop: p.scoop, qty: presetKey === "bottle" ? 4 : 2 });
    renderRows();
  }

  function renderRows() {
    list.textContent = "";
    boxes.forEach(function (b, i) {
      var row = document.createElement("div");
      row.className = "box-row";
      var options = Object.keys(PRESETS).map(function (k) {
        return '<option value="' + k + '"' + (k === b.preset ? " selected" : "") + ">" + PRESETS[k].label + "</option>";
      }).join("");
      var selectId = "b-kind-" + i, scoopId = "b-scoop-" + i;
      row.innerHTML =
        '<div class="box-row-head"><strong><span class="box-key">' + KEYS[i] + '</span><span data-title></span></strong>' +
        (boxes.length > 1 ? '<button type="button" class="btn-text" data-remove>Verwijderen</button>' : "") + "</div>" +
        '<div class="box-row-grid">' +
        '<div class="field"><label for="' + selectId + '">Soort</label><select id="' + selectId + '" data-field="preset">' + options + "</select></div>" +
        field("Aantal", "qty", b.qty, [1, MAX_PER_TYPE]) +
        field("Vakken", "compartments", b.dividers + 1, [1, 9]) +
        field("Breedte (mm)", "inner_w", b.inner_w, LIMITS.inner_w) +
        field("Diepte (mm)", "inner_d", b.inner_d, LIMITS.inner_d) +
        field("Hoogte achter (mm)", "h_back", b.h_back, LIMITS.h_back) +
        field("Hoogte voor (mm)", "h_front", b.h_front, LIMITS.h_front) +
        "</div>" +
        '<div class="field check"><input id="' + scoopId + '" data-field="scoop" type="checkbox"' + (b.scoop ? " checked" : "") + '><label for="' + scoopId + '">Met een uitsparing vooraan om er makkelijk iets uit te nemen</label></div>' +
        '<p class="hint is-warning" data-problem hidden></p>';
      row.querySelector("[data-title]").textContent = b.label;   // text, never markup
      list.appendChild(row);
    });
    $("add-box").hidden = boxes.length >= MAX_TYPES;
    render();
  }

  list.addEventListener("change", function (e) {
    var row = e.target.closest(".box-row");
    if (!row) return;
    var i = Array.prototype.indexOf.call(list.children, row);
    if (e.target.getAttribute("data-field") === "preset") {
      var p = PRESETS[e.target.value], qty = boxes[i].qty;
      boxes[i] = { preset: e.target.value, label: p.label, inner_w: p.inner_w, inner_d: p.inner_d, h_back: p.h_back, h_front: p.h_front, dividers: p.dividers, scoop: p.scoop, qty: qty };
      renderRows();
      return;
    }
    // Put clamped values back in the fields once the customer leaves them.
    readRows();
    var b = boxes[i];
    ["inner_w", "inner_d", "h_back", "h_front", "qty"].forEach(function (name) {
      row.querySelector('[data-field="' + name + '"]').value = b[name];
    });
    row.querySelector('[data-field="compartments"]').value = b.dividers + 1;
    render();
  });
  list.addEventListener("input", function () { readRows(); render(); });
  list.addEventListener("click", function (e) {
    if (!e.target.closest("[data-remove]")) return;
    var row = e.target.closest(".box-row");
    boxes.splice(Array.prototype.indexOf.call(list.children, row), 1);
    renderRows();
  });
  $("add-box").addEventListener("click", function () { addRow("custom"); });

  // ---------------------------------------------------------------- drawing
  function node(tag, attrs, text) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function draw(result) {
    var g = result.grid, W = g.W, H = g.H, pad = Math.max(40, W * 0.05);
    svg.textContent = "";
    svg.setAttribute("viewBox", [-pad, -pad * 0.6, W + pad * 1.6, H + pad * 1.7].join(" "));
    var fontSize = Math.max(14, W / 55);

    svg.appendChild(node("rect", { class: "wall-plate", x: 0, y: 0, width: W, height: H }));
    var holes = "";
    g.xs.forEach(function (x) {
      g.ys.forEach(function (y) { holes += "M" + (x - 4) + " " + (y - TRAVEL) + "a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"; });
    });
    svg.appendChild(node("path", { class: "wall-hole", d: holes }));

    result.placed.forEach(function (p) {
      var s = p.shape, b = p.box;
      svg.appendChild(node("rect", { class: "wall-box", x: p.x0, y: p.top, width: s.Wo, height: s.Hb }));
      for (var d = 1; d <= b.dividers; d++) {
        var x = p.x0 + T + d * (b.inner_w - b.dividers * T) / (b.dividers + 1) + (d - 0.5) * T;
        svg.appendChild(node("line", { class: "wall-box-div", x1: x, x2: x, y1: p.top + 3, y2: p.bottom - FOOT - T }));
      }
      s.us.forEach(function (u) {
        s.vs.forEach(function (v) { svg.appendChild(node("circle", { class: "wall-peg", cx: p.x0 + u, cy: p.bottom - v, r: 2.6 })); });
      });
      if (s.Wo >= 24 && s.Hb >= 20) {
        // In the first compartment, so the letter never sits on a divider.
        var cw = (b.inner_w - b.dividers * T) / (b.dividers + 1);
        svg.appendChild(node("text", { class: "wall-label", x: p.x0 + T + cw / 2, y: (p.top + p.bottom) / 2, "font-size": Math.min(fontSize, s.Hb * 0.5, cw * 0.8) }, KEYS[p.index]));
      }
    });

    svg.appendChild(node("text", { class: "dim", x: W / 2, y: H + pad * 0.7, "text-anchor": "middle", "font-size": fontSize }, W + " mm"));
    svg.appendChild(node("text", { class: "dim", x: W + pad * 0.3, y: H / 2, "text-anchor": "middle", "font-size": fontSize, transform: "rotate(90 " + (W + pad * 0.3) + " " + H / 2 + ")" }, H + " mm"));
  }

  function render() {
    var wall = wallSize();
    $("custom-wall").hidden = form.querySelector('input[name="wall"]:checked').value !== "custom";
    var grid = makeGrid(wall.w, wall.h);
    var result = layout(grid);
    lastLayout = result;
    draw(result);

    var total = 0, problems = 0;
    Array.prototype.forEach.call(list.children, function (row, i) {
      var msg = boxProblem(boxes[i]);
      var p = row.querySelector("[data-problem]");
      p.textContent = msg;
      p.hidden = !msg;
      if (msg) problems++;
      total += boxes[i].qty;
    });

    var hint = $("wall-hint"), panels = panelCount(wall.w, wall.h);
    var facts = wall.w + " × " + wall.h + " mm · " + (grid.nCols * grid.nRows) + " ophangpunten · " +
      (panels === 1 ? "1 paneel" : "ongeveer " + panels + " panelen");
    $("wall-desc").textContent = "Wand van " + facts + ", met " + result.placed.length + " bakjes.";
    var warning = "";
    if (total > MAX_BOXES) warning = "Dat zijn meer dan " + MAX_BOXES + " bakjes. Voor zo'n grote wand neem je best contact op via het atelier.";
    else if (problems) warning = "Kijk de gemarkeerde bakjes na.";
    else if (result.missing) {
      warning = (result.missing === 1 ? "1 bakje past" : result.missing + " bakjes passen") +
        " niet meer op deze wand. Kies een grotere wand, kleinere bakjes of een kleiner aantal.";
    }
    hint.textContent = warning || "Alles past. Je kunt de bakjes later op elk ophangpunt verhangen; dit is een voorbeeld van een indeling.";
    hint.className = "hint" + (warning ? " is-warning" : "");
    return !warning;
  }

  form.addEventListener("change", function (e) { if (!e.target.closest(".box-row")) render(); });
  form.addEventListener("input", function (e) { if (e.target.id === "w-w" || e.target.id === "w-h") render(); });
  ["w-w", "w-h"].forEach(function (id) {
    $(id).addEventListener("blur", function () {
      $(id).value = clamp(num($(id), id === "w-w" ? 900 : 600), id === "w-w" ? LIMITS.wall_w : LIMITS.wall_h);
      render();
    });
  });

  // Start with the three example boxes.
  ["bottle", "tin", "tray"].forEach(function (k) {
    var p = PRESETS[k];
    boxes.push({ preset: k, label: p.label, inner_w: p.inner_w, inner_d: p.inner_d, h_back: p.h_back, h_front: p.h_front, dividers: p.dividers, scoop: p.scoop, qty: k === "bottle" ? 4 : 2 });
  });
  renderRows();

  // ---------------------------------------------------------------- submit
  var started = form.querySelector('input[name="started"]');
  started.value = String(Math.floor(Date.now() / 1000));
  var statusEl = $("form-status");
  var submitBtn = form.querySelector('button[type="submit"]');

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "form-status" + (kind ? " is-" + kind : "");
  }

  function markError(input, message) {
    var f = input.closest(".field");
    f.classList.add("has-error");
    var msg = document.createElement("p");
    msg.className = "field-error";
    msg.id = input.id + "-error";
    msg.textContent = message;
    f.appendChild(msg);
    input.setAttribute("aria-describedby", msg.id);
  }

  function validateContact() {
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelectorAll(".field-error").forEach(function (m) { m.remove(); });
    var bad = null, name = $("f-name"), email = $("f-email"), privacy = $("f-privacy");
    if (!name.value.trim()) { markError(name, "Vul je naam in."); bad = bad || name; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { markError(email, "Vul een geldig e-mailadres in, bv. naam@voorbeeld.be."); bad = bad || email; }
    if (!privacy.checked) { markError(privacy, "Vink aan dat je akkoord gaat."); bad = bad || privacy; }
    if (bad) bad.focus();
    return !bad;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    readRows();
    if (!render()) {
      setStatus("De wand klopt nog niet: kijk de melding onder het voorbeeld na.", "error");
      $("wall-hint").scrollIntoView({ block: "center" });
      return;
    }
    if (!validateContact()) { setStatus("Controleer de gemarkeerde velden.", "error"); return; }
    $("c-configuration").value = JSON.stringify(readConfig());

    submitBtn.disabled = true;
    setStatus("Bezig met versturen…");
    fetch(form.action, { method: "POST", body: new FormData(form), headers: { "Accept": "application/json" } })
      .then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
      .then(function (data) {
        if (data.ok) {
          setStatus("Bedankt! Je aanvraag is verstuurd. Je krijgt zo dadelijk een bevestiging per e-mail, en binnen twee werkdagen een prijs.", "success");
        } else {
          submitBtn.disabled = false;
          setStatus(data.error || "Versturen is niet gelukt. Probeer het opnieuw of mail naar offer@creafluxe.be.", "error");
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        setStatus("Geen verbinding. Controleer je internet en probeer het opnieuw, of mail naar offer@creafluxe.be.", "error");
      });
  });
})();
