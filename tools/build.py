"""Build the Creafluxe pages.

Every page in src/pages/ holds only its own content. This script wraps it in the shared
head, header and footer and writes the finished .html file in the website root.

    python tools/build.py

No packages needed (plain Python 3). Run it after changing anything in src/.
The .html files in the root are generated: change src/pages/<name>.html instead.

A page starts with a small block of settings:

    <!--
    title: Atelier · Creafluxe
    description: One or two sentences for search engines.
    nav: atelier                 (which menu item is the current one; optional)
    scripts: assets/js/a.js, assets/js/b.js   (extra scripts; optional)
    head: <script ...></script>  (extra line for <head>; optional)
    -->

Inside a page, {{> name}} inserts src/partials/name (with or without extension).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
VERSION = "6"   # raise when CSS or JS changes, so browsers fetch the new files

NAV = [
    ("atelier", "atelier.html", "Atelier"),
    ("webshop", "webshop.html", "Webshop"),
    ("materialen", "materialen.html", "Materialen"),
    ("ontwerpgids", "ontwerpgids.html", "Ontwerpgids"),
]

HEAD = """<!doctype html>
<!-- Gegenereerd uit src/pages/{source}. Pas dat bestand aan en draai: python tools/build.py -->
<html lang="nl-BE">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <meta name="theme-color" content="#ffffff">
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="assets/fonts/Manrope-Variable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="assets/css/style.css?v={v}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:type" content="website">
  <script>document.documentElement.classList.add("js");</script>
{head}  <script defer src="assets/js/main.js?v={v}"></script>
{scripts}</head>
<body>
  <a class="skip" href="#main">Naar de inhoud</a>

  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="./" aria-label="Creafluxe, naar de startpagina">
        <img src="assets/img/logo.svg" alt="Creafluxe" width="212" height="94">
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
        <span class="nav-toggle-bar" aria-hidden="true"></span>
        <span class="sr-only">Menu</span>
      </button>
      <nav id="site-nav" class="site-nav" aria-label="Hoofdmenu">
{nav}        <a class="btn btn-small" href="atelier.html#aanvraag">Vraag een offerte</a>
      </nav>
    </div>
  </header>

"""

FOOT = """
  <footer class="site-footer">
    <div class="container footer-inner">
      <img src="assets/img/logo-wit.svg" alt="Creafluxe" width="180" height="80" loading="lazy">
      <div class="footer-cols">
        <div>
          <p class="footer-label">Maken</p>
          <p><a href="atelier.html">Atelier</a><br><a href="webshop.html">Webshop</a><br><a href="herinneringsdoos.html">Herinneringsdoos</a><br><a href="organizer-wand.html">Organizer-wand</a></p>
        </div>
        <div>
          <p class="footer-label">Weten</p>
          <p><a href="materialen.html">Materialen</a><br><a href="ontwerpgids.html">Ontwerpgids</a><br><a href="privacy.html">Privacy</a></p>
        </div>
        <div>
          <p class="footer-label">Contact</p>
          <p><a href="mailto:contact@creafluxe.be">contact@creafluxe.be</a><br><a href="https://www.instagram.com/creafluxe/" rel="noopener">Instagram</a><br><a href="https://www.facebook.com/profile.php?id=61586495937170" rel="noopener">Facebook</a></p>
          <!-- TODO: adres of regio, telefoon en ondernemingsnummer (verplicht te vermelden) -->
        </div>
      </div>
      <p class="footer-small">© <span id="year">2026</span> Creafluxe · Bring your design to life</p>
    </div>
  </footer>
</body>
</html>
"""


def partial(match):
    name = match.group(1).strip()
    for path in (SRC / "partials" / name, *sorted((SRC / "partials").glob(name + ".*"))):
        if path.is_file():
            return path.read_text(encoding="utf-8").rstrip("\n")
    sys.exit(f"partial not found: {name}")


def build(page):
    text = page.read_text(encoding="utf-8")
    m = re.match(r"\s*<!--(.*?)-->\s*", text, re.S)
    if not m:
        sys.exit(f"{page.name}: settings block missing")
    meta = {}
    for line in m.group(1).strip().splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    body = re.sub(r"\{\{>\s*([^}]+)\}\}", partial, text[m.end():])

    nav = "".join(
        '        <a href="{0}"{2}>{1}</a>\n'.format(href, label, ' aria-current="page"' if meta.get("nav") == key else "")
        for key, href, label in NAV
    )
    scripts = "".join(
        '  <script defer src="{0}?v={1}"></script>\n'.format(s.strip(), VERSION)
        for s in meta.get("scripts", "").split(",") if s.strip()
    )
    head = ("  " + meta["head"] + "\n") if meta.get("head") else ""
    html = HEAD.format(source=page.name, title=meta["title"], description=meta["description"],
                       v=VERSION, nav=nav, scripts=scripts, head=head) + body.rstrip("\n") + "\n" + FOOT
    (ROOT / page.name).write_text(html, encoding="utf-8", newline="\n")
    print("built", page.name)


if __name__ == "__main__":
    for p in sorted((SRC / "pages").glob("*.html")):
        build(p)
