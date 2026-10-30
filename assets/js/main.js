// Creafluxe website: mobile menu, header border on scroll, and the request
// form sent with fetch (falls back to a normal POST when JS is off).
(function () {
  "use strict";

  // Mobile menu
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

  // Header border once the page scrolls
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Request form
  var form = document.getElementById("request-form");
  if (!form) return;

  var started = document.getElementById("f-started");
  if (started) started.value = String(Math.floor(Date.now() / 1000));

  var statusEl = document.getElementById("form-status");
  var submitBtn = form.querySelector('button[type="submit"]');
  var MAX_FILES = 5;
  var MAX_BYTES = 10 * 1024 * 1024;

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "form-status" + (kind ? " is-" + kind : "");
  }

  function clearErrors() {
    form.querySelectorAll(".has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelectorAll(".field-error").forEach(function (m) { m.remove(); });
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

  function validate() {
    clearErrors();
    var firstBad = null;
    var name = form.elements.name;
    var email = form.elements.email;
    var brief = form.elements.brief;
    var privacy = form.elements.privacy;
    var files = document.getElementById("f-files");

    if (!name.value.trim()) { markError(name, "Vul je naam in."); firstBad = firstBad || name; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      markError(email, "Vul een geldig e-mailadres in, bv. naam@voorbeeld.be.");
      firstBad = firstBad || email;
    }
    if (brief.value.trim().length < 10) {
      markError(brief, "Beschrijf je idee in minstens een paar woorden.");
      firstBad = firstBad || brief;
    }
    if (files.files.length > MAX_FILES) {
      markError(files, "Je kunt maximaal " + MAX_FILES + " bestanden meesturen.");
      firstBad = firstBad || files;
    } else {
      for (var i = 0; i < files.files.length; i++) {
        if (files.files[i].size > MAX_BYTES) {
          markError(files, "“" + files.files[i].name + "” is groter dan 10 MB.");
          firstBad = firstBad || files;
          break;
        }
      }
    }
    if (!privacy.checked) { markError(privacy, "Vink aan dat je akkoord gaat."); firstBad = firstBad || privacy; }

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

    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { "Accept": "application/json" }
    })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false }; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        if (r.data.ok) {
          form.reset();
          if (started) started.value = String(Math.floor(Date.now() / 1000));
          setStatus("Bedankt! Je aanvraag is verstuurd. Je krijgt zo dadelijk een bevestiging per e-mail.", "success");
        } else {
          setStatus(r.data.error || "Versturen is niet gelukt. Probeer het opnieuw of mail naar offerte@creafluxe.be.", "error");
        }
      })
      .catch(function () {
        setStatus("Geen verbinding. Controleer je internet en probeer het opnieuw, of mail naar offerte@creafluxe.be.", "error");
      })
      .then(function () { submitBtn.disabled = false; });
  });
})();
