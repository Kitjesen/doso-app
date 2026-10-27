# MiSans in DOSO

Original static OTF files extracted from Xiaomi's official MiSans.zip (2025-07-14 server Last-Modified), downloaded 2026-10-11.

- Source: https://hyperos.mi.com/font-download/MiSans.zip
- Official site: https://hyperos.mi.com/font/zh/download
- License: MiSans-License.pdf in this directory, retained unmodified.
- Copyright © 2020-2025 Beijing Xiaomi Mobile Software Co.,Ltd. All Rights Reserved.
- Original ZIP entry CRC32, byte size, OTF names/weight metadata and downloaded-file SHA-256: manifest.json.

These files are part of the DOSO App, not a standalone font distribution. Keep the copyright notice and license with the application. Do not subset, convert or modify the fonts. In-software attribution and the full bilingual agreement are available at the bottom of the Profile page.

The four application font aliases select individual static faces. The 400/500/600/700 design roles do not equal the font's internal OS/2 weightClass values (330/380/450/630 respectively). The wrapper resets native fontWeight to normal after selecting a face to avoid synthetic bolding. System fallback remains available on load failure and for missing glyphs; icon families and diagnostic monospace are not replaced.
