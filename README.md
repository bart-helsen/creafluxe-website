# Creafluxe website (versie 1)

Statische website in HTML, CSS en een beetje JavaScript, met één PHP-script voor het aanvraagformulier. Geen build-stap en geen externe diensten: werkt op gewone gedeelde hosting zoals EasyHost.

## Bestanden

| Pad | Wat |
| --- | --- |
| `index.html` | Homepage: hero, werkwijze, realisaties, technieken, over mij, aanvraagformulier |
| `bedankt.html` | Bedankpagina na het formulier (zonder JavaScript) |
| `privacy.html` | Privacyverklaring |
| `assets/css/style.css` | Alle opmaak, volgens het Creafluxe design system |
| `assets/js/main.js` | Mobiel menu en het formulier versturen zonder pagina te herladen |
| `assets/img/` | Logo's (uit `design/Logo Files`, enkel bijgesneden), favicon, foto van het Revell-project |
| `assets/fonts/` | Manrope, lokaal gehost (geen Google Fonts, dus geen cookiebanner nodig) |
| `php/aanvraag.php` | Verwerkt het formulier: naar de admin-app, e-mail naar jou, bevestiging naar de klant |
| `herinneringsdoos.html` | Samensteller voor de herinneringsdoos: keuzes met live voorbeeld, verstuurt via `php/aanvraag.php` |
| `assets/js/configurator-memory-box.js` | Logica en voorbeeld van de samensteller; maakt de configuratie (JSON) |
| `php/memory-box.php` | Controleert die configuratie en zet ze in woorden voor de e-mails |
| `assets/js/memory-box-3d.js` | 3D-voorbeeld van de doos (deksels openen, pootjes, vakken, gravure); valt terug op de 2D-tekening zonder WebGL |
| `assets/vendor/three/` | three.js 0.160.0 (MIT), lokaal gehost zodat de pagina geen externe diensten laadt |
| `materialen.html` | Materialen en stalen: filterbare kaarten met detailvenster en zoom per foto |
| `assets/js/materialen.js` | Laadt de stalen en toont ze (filter, detailvenster, zoom, deeplink `#berken-multiplex`) |
| `php/materialen.php` | JSON voor de Materialen-pagina: leest `GET /api/public/materials` van de admin-app, 5 minuten gecached, valt terug op de laatste kopie als de admin-app niet bereikbaar is |
| `php/materiaal-foto.php` | Haalt een staalfoto op uit de admin-app, schaalt ze (GD) en cachet ze; zonder GD wordt het origineel doorgegeven |
| `private/config.example.php` | Voorbeeld van de instellingen; kopieer naar `private/config.php` |

## Materialen (stalen uit de admin-app)

De foto's van de materialen beheer je één keer, in de admin-app (Materialen, bij *Stalen & bewerkingen*). Zet daar **Toon op de website** aan en ze verschijnen op `materialen.html`. De site bewaart zelf geen foto's. De admin-app staat standaard op `https://admin.creafluxe.be`; pas dat aan met `admin_url` in `private/config.php` of de variabele `ADMIN_URL`. Gecachte data en verkleinde foto's staan in de tijdelijke map van de server (`creafluxe-materials`).

## Online zetten

1. Kopieer `private/config.example.php` naar `private/config.php` en vul `intake_key` in met dezelfde waarde als `INTAKE_API_KEY` van de admin-app op Railway.
2. Upload alles naar de webroot. Staat `private/` liever buiten de webroot, pas dan het pad bovenaan `php/aanvraag.php` aan.
3. Controleer dat de host PHP 8.1 of nieuwer gebruikt (met `curl` en `fileinfo`).
4. Stuur een testaanvraag. Die komt in de admin-app als echte aanvraag; verwijder ze daarna.

## Testsite op Railway (test.creafluxe.be)

De `Dockerfile` draait de site met PHP 8.3 en Apache. Productie blijft op EasyHost.

1. In Railway: *New → GitHub Repo → creafluxe-website*. Railway vindt de Dockerfile zelf. Elke push naar `main` zet een nieuwe versie online.
2. Variabelen van de service (*Variables*):

   | Variabele | Waarde |
   | --- | --- |
   | `NOINDEX` | `1` (houdt zoekmachines weg) |
   | `INTAKE_KEY` | leeg laten, anders komen testaanvragen in de echte admin-database |
   | `ALLOWED_ORIGINS` | `https://test.creafluxe.be` (standaardwaarde, enkel nodig als het domein anders is) |

3. *Settings → Networking → Custom Domain*: `test.creafluxe.be`. Railway toont een CNAME-doel.
4. In Cloudflare, DNS: record `CNAME`, naam `test`, doel = wat Railway toonde.

Op Railway is er geen mailserver, dus het formulier geeft daar een foutmelding na versturen. De rest van de site werkt gewoon. Zonder `private/config.php` leest `php/aanvraag.php` zijn instellingen uit deze variabelen (ook `INTAKE_URL`, `NOTIFY_TO`, `MAIL_FROM`).

## Lokaal bekijken

```powershell
php -S localhost:8080 -t website
```

Het formulier verstuurt lokaal geen e-mail tenzij PHP een mailserver heeft.

## Nog te doen

- Echte foto's in de vakken met "Foto volgt" en "Foto van het atelier" (`.placeholder` in `index.html`).
- Adres of regio, telefoon en ondernemingsnummer in de footer (zie `TODO` in `index.html`).
- Teksten nakijken: projectbeschrijvingen, materialentabel, de belofte "binnen twee werkdagen", privacyverklaring.
- Later: bestanden rechtstreeks naar R2 opladen zodat ze in de admin-app bij de aanvraag staan (doc 08, optie 2). Nu komen ze enkel als bijlage in de e-mail.
