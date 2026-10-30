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
| `private/config.example.php` | Voorbeeld van de instellingen; kopieer naar `private/config.php` |

## Online zetten

1. Kopieer `private/config.example.php` naar `private/config.php` en vul `intake_key` in met dezelfde waarde als `INTAKE_API_KEY` van de admin-app op Railway.
2. Upload alles naar de webroot. Staat `private/` liever buiten de webroot, pas dan het pad bovenaan `php/aanvraag.php` aan.
3. Controleer dat de host PHP 8.1 of nieuwer gebruikt (met `curl` en `fileinfo`).
4. Stuur een testaanvraag. Die komt in de admin-app als echte aanvraag; verwijder ze daarna.

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
