# AIMatchLab — FT KV → R2 Migrator

## Τι κάνει
Μεταφέρει **όλα** τα keys `MATCH:FT:*` από το **KV namespace** `AIMATCHLAB_KV_CORE`
στο **R2 bucket** `aimatchlab-leagues-archive`.

Γράφει objects σε path:

```
ft/<leagueSlug>/<season>/matches/<id>.json
```

Παράδειγμα:
```
ft/eng.1/2024-2025/matches/01022025-ipswich-southampton.json
```

> Δεν σβήνει τίποτα από KV. Είναι SAFE migration.

---

## Πού μπαίνει μέσα στο project
Βάλ' το εδώ:

```
Ai-MatchLab-ULTRA-UI/
  tools/
    ft-kv-to-r2/
      migrate_ft_kv_to_r2.js
      package.json
      README.md
```

---

## Προαπαιτούμενα
- Node.js 18+
- Wrangler logged in (OAuth)
- Το R2 bucket να υπάρχει: `aimatchlab-leagues-archive`

---

## Βήματα εγκατάστασης
1) Κάνε extract το zip στο:
   `Ai-MatchLab-ULTRA-UI/tools/ft-kv-to-r2/`

2) Άνοιξε terminal μέσα στον φάκελο και τρέξε:
   ```bash
   npm install
   ```

---

## Χρήση (Run)
### Default (όλα)
```bash
node migrate_ft_kv_to_r2.js
```

### Limit (δοκιμαστικό)
```bash
node migrate_ft_kv_to_r2.js --limit=50
```

### Dry run (δεν γράφει στο R2)
```bash
node migrate_ft_kv_to_r2.js --dry
```

---

## Notes
### “Authentication error 10000”
Αν τρέχεις με `CLOUDFLARE_API_TOKEN` που δεν έχει δικαιώματα, βγάλ' το:
```powershell
Remove-Item Env:\CLOUDFLARE_API_TOKEN
npx wrangler login
```

### Season mapping
Υπολογίζεται από `kickoff_ms`:
- αν μήνας >= 7 → season = YYYY-(YYYY+1)
- αλλιώς season = (YYYY-1)-YYYY
