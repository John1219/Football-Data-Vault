# Football Data & Media Sources

A reference guide to legitimate data and media sources for the **Ultimate Football Data Vault**, covering licensing, access methods, rate limits, and archiving rules (downloadable vs. link-only).

> **Key Archiving Principles**
> - **Prefer bulk/open datasets (`nflverse`) and official APIs** over scraping consumer websites (`nfl.com`, `pro-football-reference.com`), which prohibit automated scraping in their ToS.
> - **Media separation:** Download and archive only public-domain or permissively licensed media locally; store copyrighted or DRM-protected streams (YouTube, NFL+) as **link-only metadata** (`"is_local_file": false`).

---

## 1. Core NFL Play-by-Play, Stats, Rosters, Draft, Combine & Contracts

| Source | URL | Data Covered | Access & Cost | Legitimacy / Vault Notes |
| :--- | :--- | :--- | :--- | :--- |
| **nflverse** (`nflverse-data` / `nflreadpy`) | https://github.com/nflverse<br>https://github.com/nflverse/nflverse-data/releases<br>https://github.com/nflverse/nflreadpy | PBP (1999+, EPA/WPA), player/team stats, schedules, closing lines, rosters, depth charts, snap counts, injuries (2009+), Next Gen Stats (2016+), Draft, Combine, OTC contracts, FTN charting (2022+) | Direct Parquet/CSV/RDS downloads or `nflreadpy` (Python) / `nflreadr` (R). **Free**, no API key. | **Best-in-class primary source.** MIT (code) / **CC-BY 4.0** (data; FTN charting is **CC-BY-SA 4.0**). Designed for local archiving. |
| **Pro-Football-Reference** & **Stathead** | https://www.pro-football-reference.com/<br>https://stathead.com/football/ | Deepest historical NFL/AFL/AAFC archive, box scores, game logs, draft, combine, Pro Bowl/awards | Web UI with built-in *"Get table as CSV / Excel"*. Stathead is $9/mo or $80/yr. No public API. | **Manual export only.** Strict anti-scraping ToS; Cloudflare blocks >20 req/min (PFR) or >10 req/min (Stathead). |
| **NFL.com** | https://www.nfl.com/ | Official scores, schedules, rosters, transactions, stats | Consumer web UI only. No free public API (official feed is commercial via Sportradar). | **Manual reference only.** Strict IP/anti-scraping ToS. |
| **Over The Cap** & **Spotrac** | https://overthecap.com/<br>https://www.spotrac.com/nfl/ | Salary cap, contracts, dead money, guarantees, free agency | Web HTML tables only. | **Avoid scraping.** Use **`nflverse`'s pre-compiled OTC contract dataset** (`load_contracts()`) for automated archiving; use Spotrac manually. |
| **Pro Football Archives** & **FootballDB** | https://www.profootballarchives.com/<br>https://www.footballdb.com/ | Pre-merger & alt leagues (AFL, AAFC, USFL, CFL, WFL, XFL/UFL) + NFL box scores/transactions | Web HTML pages only. | **Manual reference/gap-filling** for historical and non-NFL leagues. |

---

## 2. Live Scores, Commercial APIs & College Football (NCAA)

| Source | URL | Data Covered | Access & Cost | Legitimacy / Vault Notes |
| :--- | :--- | :--- | :--- | :--- |
| **CollegeFootballData (CFBD)** | https://collegefootballdata.com/ | NCAA FBS/FCS schedules (1869+), PBP, stats, recruiting, polls, betting lines | Official REST/GraphQL API + CSV exports. Free (~1,000 calls/mo); Patreon paid tiers. | **Great if NCAA is in scope.** Explicit ToS allows private caching/storing; do not redistribute raw API responses. |
| **API-Sports (American Football)** | https://v1.american-football.api-sports.io | NFL & NCAA schedules, live scores, standings, team/player box scores (2010+) | REST JSON API. Free (100 req/day); Pro ~$15/mo (7,500 req/day). | **Good for live scores & box scores** with an official API key. |
| **BallDontLie NFL API** | https://api.balldontlie.io/nfl/v1/plays | Schedules, scores, player stats, injuries, PBP | REST JSON API. Free (basic scores); All-Star ~$9.99/mo; GOAT ~$39.99/mo (unlocks PBP). | Viable paid API for structured PBP if you want a managed REST feed alongside `nflverse`. |
| **MySportsFeeds** | https://www.mysportsfeeds.com | Scores, box scores, standings, injuries, stats (PBP via DETAILS add-on) | REST API (JSON/XML/CSV). Free/low-cost personal non-commercial tiers (~1,000 req/day). | **Good for personal/hobbyist archiving** under non-commercial terms. |
| **ESPN Public JSON** *(Unofficial)* | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` | Live scores, game summaries, win probability, PBP | Unauthenticated HTTP GET (JSON). Free. | **Use with caution:** undocumented internal endpoints under general ESPN ToS; low-volume hobby polling only. |
| **SportsDataIO** & **Sportradar** | https://sportsdata.io/<br>https://sportradar.com | Official enterprise-grade real-time feeds | SportsDataIO (~$99–$149/mo personal; free trial is scrambled); Sportradar ($1,200+/mo). | **Not recommended** for a personal vault due to cost. |

---

## 3. Tracking, Analytics, Fantasy, Weather & Odds

| Source | URL | Data Covered | Access & Cost | Legitimacy / Vault Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Kaggle NFL Big Data Bowl** | https://www.kaggle.com | Official Next Gen Stats x/y player-tracking coordinates (selected weeks/seasons) | Bulk CSV via Kaggle UI/CLI. Free (requires account + competition rules). | **Non-commercial / research only.** No redistribution. |
| **Sleeper API** | https://api.sleeper.app/v1 | Fantasy leagues, rosters, matchups, drafts, full NFL player metadata | Public read-only REST JSON. Free, no key. | **Great for personal vaults.** Cache `/v1/players/nfl` locally (fetch ≤1×/day). |
| **Yahoo Fantasy API** | https://fantasysports.yahooapis.com/fantasy/v2/ | Fantasy leagues, rosters, scoring, drafts | Official REST API (3-legged OAuth 2.0). Free (~2,000 req/hr). | Personal vault storage allowed; no raw redistribution. |
| **Open-Meteo**, **Meteostat**, **NOAA/NWS** | https://archive-api.open-meteo.com/v1/archive<br>https://data.meteostat.net/<br>https://www.ncei.noaa.gov/cdo-web/api/v2/ | Historical hourly/daily game-day weather by stadium coordinates/station | REST JSON or bulk Parquet/CSV.gz. **Free** (Open-Meteo non-commercial; Meteostat CC-BY 4.0; NOAA Public Domain). | **Fully legitimate & ideal** for enriching every game in your vault with kickoff weather. |
| **The Odds API** | https://api.the-odds-api.com/v4/historical/sports/americanfootball_nfl/odds | Multi-bookmaker historical odds snapshots | REST JSON. Free tier is live-only; historical requires paid plan (from $30/mo). | Use `nflverse` schedules for free historical closing lines; use The Odds API if you need multi-book line history. |
| **Pro Football Focus (PFF)** & **FTN / DVOA** | https://developer.pff.com/<br>https://www.ftnfantasy.com/pricing | Proprietary player grades (PFF) and DVOA / full charting (FTN) | PFF Pro ($199.99/yr, CLI/API); FTN paid CSV/API tiers. | Strictly personal non-commercial use; **PFF prohibits AI/ML training** and scraping. |

---

## 4. Audio, Images & Video (Downloadable vs. Link-Only)

| Source | URL | Media Type | Legitimacy / Archiving Rule |
| :--- | :--- | :--- | :--- |
| **Library of Congress (LOC)** | https://www.loc.gov/free-to-use/football/ | Historical photos (1880s–2010s) | **Archivable locally.** Public domain / "No Known Restrictions" (check per-item Rights Advisory). |
| **Wikimedia Commons** | https://commons.wikimedia.org/wiki/Category:American_footballs | Photos, illustrations, some audio/video | **Archivable locally.** CC0 / CC-BY / CC-BY-SA / PD-US. |
| **DVIDS** | https://www.dvidshub.net/ | Military/academy football photos, video, audio | **Archivable locally.** U.S. Gov Public Domain (unless marked contractor-licensed). |
| **Internet Archive** | https://archive.org/ | Old-Time Radio (1930s–50s), historical broadcasts | **Mixed — verify per item.** PD Old-Time Radio is archivable; modern fan-uploaded broadcasts are often copyrighted. |
| **Kaggle NFL CV Datasets** | https://www.kaggle.com/competitions/nfl-impact-detection | Game video clips & helmet frames | **Archivable for non-commercial research** under competition rules. |
| **Official NFL Podcasts** | https://www.nfl.com/ (Apple/Spotify/iHeart RSS) | Audio | **Personal listening only.** Store RSS/episode metadata; no redistribution or AI/ML training. |
| **NFL / NFL Films YouTube** | https://www.youtube.com/@NFL<br>https://www.youtube.com/nflfilms | Video highlights, documentaries | **Link/Embed only.** YouTube ToS prohibits third-party downloading. |
| **NFL+ / NFL+ Premium** | https://plus.nfl.com | Full games, All-22 coaches film, live audio | **Link/Stream only.** Strict Widevine/FairPlay DRM; do not rip or circumvent. |
