# Plan: Remote Database untuk Scrum Dashboard

## Context

Dashboard scrum (`scrum-dashboard/index.html`, single-file vanilla JS) saat ini menyimpan semua data di **localStorage browser**. Akibatnya:
- Data hilang jika ganti browser/perangkat/clear cache
- Data tidak dishare — orang lain yang buka URL Vercel lihat kosong
- Yang bisa edit cuma owner, tapi belum ada mekanisme auth

Tujuan: data tersimpan di database remote (shared), publik read-only, hanya owner (password admin) bisa edit.

Keputusan user: **Turso (libSQL)** + **1 blob JSON**.

## Arsitektur

```
Browser (index.html)                Vercel Function (api/data.js)        Turso
├─ read: GET /api/data      ────────► SELECT blob ──────────────────────► table kv
├─ write: PUT /api/data     ────────► header x-auth vs AUTH_PASSWORD ───► UPDATE blob
└─ localStorage tetap sebagai cache fallback (offline-safe)
```

- **Skema Turso**: 1 tabel `kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)` — 1 baris `dashboard`.
- **Auth**: shared-secret — env `AUTH_PASSWORD` di server; edit request kirim header `x-auth`. Pola sama dengan legacy `old/server/src/index.ts` line 12–25 (timingSafeEqual). Read tidak butuh auth.
- **Write strategy**: tiap fungsi mutator (`addFeature`, `setSlot`, `addRelease`, dll — semuanya sudah memanggil `save()`) → `save()` diubah jadi: tulis localStorage (langsung, render instan) + queue debounce 800ms → `PUT /api/data` dengan seluruh `JSON.stringify(state)`. Kalau gagal (offline/401), tetap lokal, tampilkan indikator kecil "offline / read-only".
- **Conflict avoidance**: owner satu-satunya editor, jadi no-merge; `PUT` pakai `If-Match` sederhana (last `updated_at` yang browser ketahui) → 409 = reload data.

## File yang diubah/dibuat

1. **`api/data.js`** (baru, Vercel Node function, no build):
   - `GET` → `{ data: <blob>, updated_at }`; blob kosong → `null`
   - `PUT` → cek `x-auth` vs `process.env.AUTH_PASSWORD` (timingSafeEqual, pola dari old/server/src/index.ts:13-25); validasi JSON size < 1MB; upsert blob + `updated_at`
   - Client `@libsql/client` (sudah ada di old/package.json; install ulang di root)
2. **`index.html`** (edit, ~60 baris):
   - Konstanta `API = '/api/data'`
   - `loadRemote()` di startup: fetch GET → jika ada, `state = parsed` (lewat normalisasi yang sama seperti load block saat ini line 280–296) → render; jika gagal → fallback localStorage
   - `save()` (line 297) → tetap tulis localStorage + `queueRemote()` debounce; `queueRemote` kirim `PUT` dengan header `x-auth` dari `sessionStorage.authToken`
   - UI kecil: tombol "🔒 Login admin" di panel Settings → prompt password → simpan sessionStorage → indikator titik status (tersimpan/readonly)
   - Export/Import JSON tetap jalan (dipertahankan sebagai backup)
3. **`package.json`** (root baru): `@libsql/client` dep + script `dev` (vercel dev)
4. **`.env.example`**: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_PASSWORD`
5. **`vercel.json`**: tambah rewrite `/api/(.*)` → `/api/data.js` (pola dari old/vercel.json)

## Setup yang dibutuhkan dari user

- Buat DB Turso gratis: `turso db create scrum-dashboard` (atau via dashboard) → dapat URL + token
- Set 3 env vars di Vercel project
- Push → deploy → done

## Verifikasi

1. `npx vercel dev` lokal → buka `http://localhost:3000`
2. Login admin → tambah fitur → cek Turso (turso db shell: `SELECT value FROM kv`) blob terupdate
3. Buka di browser/incognito lain (tanpa login) → data sama tampil, tombol edit disabled, coba edit → 401, indikator read-only
4. Deploy production → buka URL → sama seperti lokal
5. Offline test: kill network → edit tetap tersimpan lokal, indikator offline; koneksi balik → sync
