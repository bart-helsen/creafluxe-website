# Creafluxe website (versie 2)

Statische website in HTML, CSS en JavaScript, met PHP voor de formulieren en de materiaalstalen. Geen externe diensten en geen cookies: werkt op gewone gedeelde hosting zoals EasyHost.

## Opbouw

Korte homepage die doorverwijst, en per taak een eigen pagina:

| Pagina | Wat |
| --- | --- |
| `index.html` | Home: hero met snijplan-animatie, drie vertrekpunten, werkwijze, technieken, een realisatie, over mij |
| `atelier.html` | Eigen idee: uitleg, offerteformulier met upload en optionele levering, veelgestelde vragen |
| `webshop.html` | Bestaande producten personaliseren (tekst, eigen bestand, aantal) en de twee samenstellers |
| `herinneringsdoos.html` | Samensteller herinneringsdoos (2D + 3D voorbeeld) |
| `organizer-wand.html` | Samensteller organizer-wand: grootte van de wand, maten en aantal bakjes, live indeling |
| `materialen.html` | Technieken met animaties, overzicht per materiaal, stalen uit de admin-app |
| `ontwerpgids.html` | Gids voor wie voor het eerst een bestand maakt, met sjabloon om te downloaden |
| `privacy.html`, `bedankt.html` | Privacyverklaring en bedankpagina (zonder JavaScript) |

## Pagina's aanpassen

De `.html`-bestanden in de hoofdmap zijn **gegenereerd**. Pas de inhoud aan in `src/pages/<naam>.html` en draai daarna:

```powershell
python tools/build.py
```

Dat script (gewone Python 3, geen pakketten) zet rond elke pagina dezelfde kop, het menu en de footer. Menu en footer staan bovenaan in `tools/build.py`. Herbruikte stukken staan in `src/partials/` (snijplan van de hero, de vier techniek-animaties, de spamvelden van een formulier). Verhoog `VERSION` in `tools/build.py` als je CSS of JavaScript wijzigt, zodat browsers de nieuwe bestanden ophalen.

## Bestanden

| Pad | Wat |
| --- | --- |
| `assets/css/style.css` | Alle opmaak, volgens het Creafluxe design system (inhoudstafel bovenaan het bestand) |
| `assets/js/main.js` | Menu, animaties bij het scrollen, uploadvakken, versturen van de formulieren |
| `assets/js/webshop.js` | Toont de producten, filter, productvenster met personalisatie |
| `assets/data/producten.json` | **De producten van de webshop** (naam, categorie, prijs, tekst, foto) |
| `assets/js/configurator-memory-box.js`, `memory-box-3d.js` | Samensteller herinneringsdoos (ongewijzigd, enkel het mailadres) |
| `assets/js/configurator-organizer.js` | Samensteller organizer-wand: hangt de bakjes op het raster zoals de generator dat doet |
| `assets/js/materialen.js` | Laadt de stalen en toont ze (filter, detailvenster, zoom) |
| `assets/downloads/creafluxe-sjabloon.svg` | Sjabloon 600 × 305 mm met lagen voor snijden, lijngraveren en vlakgraveren |
| `php/aanvraag.php` | Verwerkt alle formulieren: admin-app, e-mail naar jou, bevestiging naar de klant |
| `php/memory-box.php`, `php/organizing-wall.php` | Controleren de keuzes van een samensteller en zetten ze in woorden |
| `php/materialen.php`, `php/materiaal-foto.php`, `php/materialen-common.php` | Stalen en foto's uit de admin-app, met cache |
| `private/config.example.php` | Voorbeeld van de instellingen; kopieer naar `private/config.php` |

## Aanvragen en bestellingen

Elk formulier post naar `php/aanvraag.php`. Dat script:

1. controleert de invoer en houdt spam tegen;
2. stuurt de aanvraag naar de admin-app (`intake_url`), als `intake_key` is ingevuld;
3. mailt de aanvraag altijd naar **offer@creafluxe.be** (`notify_to`), met de bestanden van de klant en een bijlage `aanvraag.json` met dezelfde aanvraag in een vaste vorm (soort, klant, levering, product, configuratie, bestandsnamen), zodat de admin-app ze uit die mailbox kan oppikken;
4. stuurt de klant een bevestiging.

Leest de admin-app de mailbox offer@ uit, laat `intake_key` dan leeg. Anders komt elke aanvraag twee keer binnen.

Soorten aanvragen (`kind` in `aanvraag.json`): `atelier`, `webshop`, `memory-box`, `organizing-wall`.

- **Webshop**: geen winkelmandje en geen online betaling. De klant stuurt een bestelling door; jij bevestigt met prijs, voorbeeld en betaalgegevens.
- **Organizer-wand**: de mail bevat `organizer-wand-config.py.txt` met `WALL_W`, `WALL_H`, `BOXES` en `LAYOUT`, klaar om in `product-tools/organizing-wall/generator/config.py` te plakken. De admin-app kent dit product nog niet (strikt schema), dus naar de intake gaat enkel de beschrijving in tekst.
- **Herinneringsdoos**: ongewijzigd (`configuratie-memory-box.json` in de mail, `configuration` naar de intake).

## Producten van de webshop

Bewerk `assets/data/producten.json`. Per product: `id`, `name`, `category`, `text`, optioneel `price` (euro per stuk; zonder prijs toont de site "Prijs op aanvraag"), optioneel `image` (foto 4:3, bv. `assets/img/producten/doosje.jpg`) en `personalise` (`"text"`, `"file"` of allebei). Zonder foto toont de site een lijntekening (`art`, getekend in `assets/js/webshop.js`).

## Materialen (stalen uit de admin-app)

De foto's van de materialen beheer je in de admin-app (Materialen, bij *Stalen & bewerkingen*). Zet daar **Toon op de website** aan en ze verschijnen op `materialen.html`. De admin-app staat standaard op `https://admin.creafluxe.be`; pas dat aan met `admin_url` in `private/config.php` of de variabele `ADMIN_URL`.

## Online zetten

1. Draai `python tools/build.py`.
2. Kopieer `private/config.example.php` naar `private/config.php` en vul in wat nodig is.
3. Upload alles naar de webroot (`src/` en `tools/` mogen thuisblijven). Staat `private/` liever buiten de webroot, pas dan het pad bovenaan `php/aanvraag.php` aan.
4. Controleer dat de host PHP 8.1 of nieuwer gebruikt (met `curl` en `fileinfo`) en dat het postvak offer@creafluxe.be bestaat.
5. Stuur een testaanvraag vanaf elke pagina (atelier, webshop, beide samenstellers).

De testsite op Railway (`Dockerfile`, test.creafluxe.be) werkt zoals voorheen; daar is geen mailserver, dus versturen geeft er een foutmelding.

## Lokaal bekijken

```powershell
php -S localhost:8080
```

## Nog te doen

- **Producten**: echte foto's, prijzen en beschrijvingen in `assets/data/producten.json`. Enkel "Gepersonaliseerd doosje, € 35" komt van de huidige site; de andere producten zijn afgeleid van de categorieën en voorbeelden daar.
- **Teksten nakijken**: materialentabel (o.a. PVC, diktes), ontwerpgids (snijlijn ca. 0,2 mm, marge 2 mm, 100 pixels per cm voor foto's), veelgestelde vragen in het atelier, "binnen twee werkdagen", privacyverklaring.
- Foto van het atelier op de homepage (`.placeholder` in `src/pages/index.html`).
- Adres of regio, telefoon en ondernemingsnummer in de footer (zie `TODO` in `tools/build.py`).
- Admin-app: `organizing-wall` en webshop-bestellingen als eigen soort opnemen, en `aanvraag.json` uit de mailbox offer@ inlezen.
- Design system: de extra tokens bovenaan `style.css` (lijnkleuren, tussenmaten, oranje op donker, foutkleur) eventueel toevoegen.
