// Creafluxe website, shared script: mobile menu, header line on scroll, things that
// animate when they scroll into view, the upload areas, and the request forms
// (sent with fetch; without JavaScript they post normally and land on bedankt.html).
(function () {
  "use strict";

  // ---- Mobile menu -------------------------------------------------------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      }
    });
  }

  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // ---- In view: .reveal fades in, .demo drawings start -------------------
  var watched = document.querySelectorAll(".reveal, .demo");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-inview");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.15 });
    watched.forEach(function (el) { io.observe(el); });
  } else {
    watched.forEach(function (el) { el.classList.add("is-inview"); });
  }

  // ---- Upload areas ------------------------------------------------------
  // <div class="dropzone" data-max-files="5"><input type="file" ...><ul class="file-list"></ul></div>
  function formatSize(bytes) {
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " kB" : (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
  }

  function setupDropzone(zone) {
    var input = zone.querySelector('input[type="file"]');
    var list = zone.querySelector(".file-list");
    if (!input) return;

    function show() {
      if (!list) return;
      list.textContent = "";
      Array.prototype.forEach.call(input.files, function (f) {
        var li = document.createElement("li");
        var name = document.createElement("span");
        var size = document.createElement("span");
        name.textContent = f.name;
        size.textContent = formatSize(f.size);
        li.appendChild(name);
        li.appendChild(size);
        list.appendChild(li);
      });
    }
    input.addEventListener("change", show);

    ["dragenter", "dragover"].forEach(function (type) {
      zone.addEventListener(type, function (e) { e.preventDefault(); zone.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (type) {
      zone.addEventListener(type, function (e) { e.preventDefault(); zone.classList.remove("is-over"); });
    });
    zone.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      try {
        // Keep to one file when the input takes only one.
        var dt = new DataTransfer();
        Array.prototype.forEach.call(e.dataTransfer.files, function (f, i) {
          if (input.multiple || i === 0) dt.items.add(f);
        });
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (err) { /* old browser: the button still works */ }
    });
  }
  document.querySelectorAll(".dropzone").forEach(setupDropzone);

  // ---- Request forms -----------------------------------------------------
  // Any <form data-request-form>. The configurators have their own script.
  var MAX_BYTES = 10 * 1024 * 1024;
  var MAIL = "offer@creafluxe.be";

  function setupRequestForm(form) {
    var statusEl = form.querySelector(".form-status");
    var submitBtn = form.querySelector('button[type="submit"]');
    var started = form.querySelector('input[name="started"]');
    if (started) started.value = String(Math.floor(Date.now() / 1000));

    function setStatus(text, kind) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = "form-status" + (kind ? " is-" + kind : "");
    }

    function clearErrors() {
      form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
      form.querySelectorAll(".field-error").forEach(function (m) { m.remove(); });
    }

    function markError(input, message) {
      var field = input.closest(".field");
      if (!field) return;
      field.classList.add("has-error");
      var msg = document.createElement("p");
      msg.className = "field-error";
      msg.id = (input.id || input.name) + "-error";
      msg.textContent = message;
      field.appendChild(msg);
      input.setAttribute("aria-describedby", msg.id);
    }

    function validate() {
      clearErrors();
      var firstBad = null;
      function bad(input, message) { markError(input, message); firstBad = firstBad || input; }
      var el = form.elements;

      if (el.name && !el.name.value.trim()) bad(el.name, "Vul je naam in.");
      if (el.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.email.value.trim())) {
        bad(el.email, "Vul een geldig e-mailadres in, bv. naam@voorbeeld.be.");
      }
      if (el.brief && el.brief.required && el.brief.value.trim().length < 10) {
        bad(el.brief, "Beschrijf je idee in minstens een paar woorden.");
      }
      // Delivery address only counts when delivery is ticked.
      if (el.delivery && el.delivery.checked) {
        ["street", "postcode", "city"].forEach(function (key) {
          if (el[key] && !el[key].value.trim()) bad(el[key], "Vul dit veld in voor de levering.");
        });
      }
      form.querySelectorAll('input[type="file"]').forEach(function (files) {
        var max = parseInt(files.getAttribute("data-max-files") || (files.multiple ? "5" : "1"), 10);
        if (files.files.length > max) {
          bad(files, "Je kunt maximaal " + max + " bestanden meesturen.");
          return;
        }
        for (var i = 0; i < files.files.length; i++) {
          if (files.files[i].size > MAX_BYTES) {
            bad(files, "“" + files.files[i].name + "” is groter dan 10 MB.");
            break;
          }
        }
      });
      if (el.privacy && !el.privacy.checked) bad(el.privacy, "Vink aan dat je akkoord gaat.");

      if (firstBad) firstBad.focus();
      return !firstBad;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate()) {
        setStatus("Controleer de gemarkeerde velden.", "error");
        return;
      }
      submitBtn.disabled = true;
      setStatus("Bezig met versturen…");

      fetch(form.action, { method: "POST", body: new FormData(form), headers: { "Accept": "application/json" } })
        .then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
        .then(function (data) {
          if (data.ok) {
            form.reset();
            form.querySelectorAll(".file-list").forEach(function (l) { l.textContent = ""; });
            if (started) started.value = String(Math.floor(Date.now() / 1000));
            form.dispatchEvent(new CustomEvent("request:sent", { bubbles: true }));
            setStatus(form.getAttribute("data-success") || "Bedankt! Je aanvraag is verstuurd. Je krijgt zo dadelijk een bevestiging per e-mail.", "success");
          } else {
            setStatus(data.error || "Versturen is niet gelukt. Probeer het opnieuw of mail naar " + MAIL + ".", "error");
          }
        })
        .catch(function () {
          setStatus("Geen verbinding. Controleer je internet en probeer het opnieuw, of mail naar " + MAIL + ".", "error");
        })
        .then(function () { submitBtn.disabled = false; });
    });
  }
  document.querySelectorAll("form[data-request-form]").forEach(setupRequestForm);
  // Other scripts (the webshop) build their form later and hook it up with this.
  window.CreafluxeForms = { setup: setupRequestForm, dropzone: setupDropzone };

  // ---- Small helpers on single pages ---------------------------------------
  // Atelier: "?materiaal=Berken multiplex" fills in the material field; the delivery
  // address only shows when delivery is ticked.
  try {
    var wanted = new URLSearchParams(window.location.search).get("materiaal");
    var materialField = document.getElementById("f-material");
    if (wanted && materialField && !materialField.value) materialField.value = wanted.slice(0, 120);
  } catch (e) { /* old browser: leave the field empty */ }

  // Sent without JavaScript and refused: php/aanvraag.php sends the visitor back with ?fout=1.
  if (/[?&]fout=1/.test(window.location.search)) {
    var firstStatus = document.querySelector(".form-status");
    if (firstStatus) {
      firstStatus.textContent = "Versturen is niet gelukt. Kijk je gegevens na en probeer opnieuw, of mail naar " + MAIL + ".";
      firstStatus.className = "form-status is-error";
    }
  }

  var delivery = document.getElementById("f-delivery");
  var address = document.getElementById("delivery-address");
  if (delivery && address) {
    var syncAddress = function () { address.hidden = !delivery.checked; };
    delivery.addEventListener("change", syncAddress);
    delivery.form.addEventListener("reset", function () { setTimeout(syncAddress, 0); });
    syncAddress();
  }

  // Design guide: mark the chapter you are reading in the side menu.
  var guideLinks = document.querySelectorAll(".guide-nav a");
  if (guideLinks.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        guideLinks.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll(".guide-block").forEach(function (b) { spy.observe(b); });
  }
})();
