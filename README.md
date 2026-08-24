# MPS2 — Manufacturing Production System

Sistem informasi manufaktur (PPC) terintegrasi untuk PT. Sanggar Sarana Baja (TMT Group): pengelolaan **timesheet tenaga kerja**, **jam mesin (machine hours)**, **SOW & bay scheduling**, **Early Warning System (EWS)**, hingga **posting otomatis ke SAP**.

Monorepo ini berisi frontend, API, worker ETL, pipeline SAP staging, dan TTS worker — dirancang **offline-first** (tidak bergantung pada CDN/font/aset eksternal) karena diakses melalui LAN pabrik.

---

## Daftar Isi

- [1. Tentang Project](#1-tentang-project)
- [2. Cara Install](#2-cara-install)
- [3. Cara Menjalankan Project](#3-cara-menjalankan-project)
- [4. Teknologi yang Digunakan](#4-teknologi-yang-digunakan)
- [5. Struktur Folder](#5-struktur-folder)
- [6. Cara Menggunakan Fitur](#6-cara-menggunakan-fitur)
- [7. Environment Variable](#7-environment-variable)
- [8. Contoh Penggunaan](#8-contoh-penggunaan)

---

## 1. Tentang Project

### Tujuan

MPS2 menyatukan pencatatan aktivitas produksi — operator, mesin, dan proses — dalam satu sistem yang terhubung dengan SAP. Data yang tercatat di lantai produksi (melalui tablet/NFC dan sensor mesin) diproses, divalidasi, lalu dikirim ke SAP sebagai data _labour_ dan _machine hours_ untuk payroll dan perhitungan produksi.

### Masalah yang Diselesaikan

| Masalah                                                                               | Solusi MPS2                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pencatatan timesheet manual yang lambat dan rawan salah                               | Login NFC, check-in/out per pekerjaan, validasi per record                                                   |
| Posting jam kerja & jam mesin ke SAP tidak konsisten (duplikat, salah nomor personal) | Pipeline **SAP staging** dengan anti-double-post (`source_key` unik) dan substitusi otomatis PERNR outsource |
| Jam mesin dari HMI/SQL Server tidak terstruktur                                       | ETL `mch_transaction` (split segmen, normalisasi `end_effective`, bundling per jam kerja)                    |
| Penjadwalan SOW/order ke area & bay tidak terlihat                                    | **Bay scheduling** berbasis task MS Project dengan reservasi bay, order pool, dan timeline                   |
| Keterlambatan deteksi masalah OEE/OLE/adopsi                                          | **EWS** (Early Warning System): snapshot berkala, ambang batas, notifikasi suara lokal (TTS Piper)           |
| Server pabrik tanpa internet                                                          | Seluruh runtime offline-first; semua aset di-bundle lokal                                                    |

### Fitur Utama

- **Timesheet tenaga kerja** — login NFC (kartu/ID), select-job per project/unit, check-in/check-out, edit, validasi berjenjang, download Excel.
- **Posting SAP** — staging per record (timesheet) dan per bundle (machine hours), pengiriman ke SAP inbound, status POSTED/FAILED, retry, koreksi, antrian operasional via UI.
- **Machine hours** — ETL dari SQL Server pabrik, normalisasi & bundling segmen, validasi jam mesin.
- **SOW & Bay Scheduling** — manajemen SOW (create/revision/saved/draft), editor sub-operasi dengan progress fisik, penjadwalan ke area/bay berbasis task MS Project, order pool (perlu/belum/terjadwal/selesai).
- **Operations Hub & Dashboard** — KPI aktif (active orders, TECO, machine productive, validation pending), OLE/OEE dashboard, dashboard MP.
- **Early Warning System (EWS)** — snapshot OEE/OLE/adopsi berkala, issue drill-down, roster, notifikasi (SSE realtime + suara TTS lokal), rekomendasi perbaikan.
- **Component Tracking** — buffer & transaksi komponen, receiving/shipment, consumable & tools management, kanban board, process control.
- **MS Project Hub** — sinkronisasi project/task, kolaborasi tim, integrasi VBA MS Project.
- **Config Rules** — aturan configurable untuk pipeline SAP (jam istirahat, cap durasi record, rebuild antrian PENDING).

---

## 2. Cara Install

### Requirement

| Requirement             | Versi / Catatan                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| Node.js                 | >= 18 (wajib untuk `apps/api`)                                         |
| npm                     | >= 9                                                                   |
| Python                  | 3.11 (untuk jobs/`sap_staging`, ETL, TTS worker)                       |
| Docker + Docker Compose | Untuk database & deployment produksi (PostgreSQL 15, PgBouncer, Nginx) |
| ffmpeg                  | Lokal (untuk TTS worker / pydub; di container sudah tersedia)          |
| uv (opsional)           | Untuk menjalankan script Python ad-hoc                                 |

> Konfigurasi `.env` tunggal diletakkan di **root repo** dan dibaca oleh backend, frontend, dan job Python. Timezone default `Asia/Makassar` via variabel `TIMEZONE`.

### Langkah Instalasi (dari awal)

```bash
# 1. Clone repository
git clone <url-repository> mps2
cd mps2

# 2. Install dependency JavaScript (frontend & backend)
cd apps/web
npm install
cd ../../apps/api
npm install
cd ../..

# 3. Siapkan environment variable
cp .env.example .env
#   → isi DB_*, SAP_INBOUND_*, PLANT_SSB, TIMEZONE, dll (lihat bagian 7)

# 4. Jalankan database (PostgreSQL + PgBouncer)
docker compose up -d db pgbouncer

# 5. Jalankan migrasi database
node database/migrate.js
```

> Catatan: `database/migrations/` berisi 81 migrasi aplikasi (`api/`) + 14 migrasi legacy (`legacy/`). Pastikan membaca `database/README.md` sebelum menjalankan migrasi di environment produksi.

---

## 3. Cara Menjalankan Project

### Mode Development

Jalankan backend dan frontend secara terpisah (hot-reload):

```bash
# Terminal 1 — API (Express, port 3001, hot-reload via nodemon)
cd apps/api
npm run dev

# Terminal 2 — Frontend (Vite dev server, port 5173)
cd apps/web
npm run dev
```

Jika backend berjalan di port selain 3001, atur `VITE_API_PROXY_TARGET` di `.env` root agar proxy dev frontend mengarah ke port tersebut.

### Mode Production (Docker Compose)

```bash
# Build semua service & jalankan
docker compose up -d --build

# Lihat status
docker compose ps

# Lihat log service tertentu
docker compose logs -f api
```

Stack produksi (lihat `docker-compose.yml`):

- `db` — PostgreSQL 15 (host port `5433:5432`, volume `postgres_data`, backup ke `./backups`)
- `pgbouncer` — connection pooler untuk API & worker
- `api` — Express API (expose internal `3001`)
- `frontend` + `nginx` — build Vite disajikan Nginx, reverse proxy `80/443` (SSL) ke `api_backend`, `fastapi_backend`, dan `frontend_app`
- `ews-snapshot-job`, `ews-adoption-job`, `ews-roster-job` — job berkala EWS
- `sap-stage-worker`, `sap-post-worker`, `sap-ops-worker` — pipeline SAP staging (auto staging, auto posting, consumer antrian UI)
- `fastapi` — service FastAPI (sinkronisasi MS Project)
- `tts-worker`, `ews-tts-worker` — worker TTS lokal (Piper)
- `sow_exporter`, `machine-ping-worker` — exporter SOW & ping mesin

---

## 4. Teknologi yang Digunakan

### Frontend (`apps/web`)

| Teknologi                        | Keterangan                                |
| -------------------------------- | ----------------------------------------- |
| React 19 + React DOM             | UI framework                              |
| Vite 7                           | Build tool & dev server                   |
| Tailwind CSS 3                   | Styling (light theme, offline-first)      |
| React Router 7                   | Routing (`apps/web/src/router/index.jsx`) |
| ECharts 6 / Recharts 3           | Grafik & dashboard                        |
| @dnd-kit                         | Drag & drop (penjadwalan/reservasi)       |
| @zxing/library                   | Scan barcode                              |
| qrcode.react, jspdf, pdfjs-dist  | QR, export PDF                            |
| html-to-image                    | Export gambar (map/layout)                |
| framer-motion                    | Animasi                                   |
| sonner                           | Toast notification                        |
| vite-plugin-pwa + workbox-window | PWA (offline-first)                       |

### Backend (`apps/api`)

| Teknologi                 | Keterangan                                |
| ------------------------- | ----------------------------------------- |
| Node.js >= 18 + Express 4 | REST API (CommonJS)                       |
| pg                        | PostgreSQL driver                         |
| mssql                     | SQL Server driver (sumber data mesin)     |
| ws                        | WebSocket / SSE realtime (dashboard, EWS) |
| multer                    | Upload file (gambar operasi, dsb.)        |
| exceljs + json2csv        | Export Excel/CSV                          |
| joi                       | Validasi input                            |
| @node-rs/argon2           | Hash password                             |
| compression, cors, dotenv | Middleware & konfigurasi                  |

### Python (`jobs/`, `apps/tts-worker`, `apps/fastapi-msproject`)

| Teknologi         | Keterangan                                   |
| ----------------- | -------------------------------------------- |
| FastAPI + uvicorn | Service sinkronisasi MS Project              |
| psycopg2(-binary) | Koneksi PostgreSQL (ETL & staging)           |
| piper-tts + pydub | TTS lokal offline (suara EWS) — butuh ffmpeg |
| python-dotenv     | Baca `.env`                                  |

### Infrastruktur & Tools

| Teknologi                 | Keterangan                           |
| ------------------------- | ------------------------------------ |
| Docker / Docker Compose   | Seluruh stack (16 service)           |
| PostgreSQL 15 + PgBouncer | Database & pooler                    |
| Nginx                     | Reverse proxy + SSL (`infra/nginx/`) |

---

## 5. Struktur Folder

```
mps2/
├── apps/
│   ├── web/                     # Frontend React 19 + Vite 7 + Tailwind 3 (PWA)
│   │   └── src/
│   │       ├── pages/           # Halaman per modul (TIMESHEET, PPC, PE, WAREHOUSE, TOOLS, ...)
│   │       ├── router/          # Definisi route aplikasi
│   │       ├── features/        # Logika fitur (bayScheduling, progress, sow, ...)
│   │       ├── components/      # Komponen reusable
│   │       ├── services/        # Panggilan API
│   │       ├── config/          # Konfigurasi (appVariant, hubSidebarItems, ...)
│   │       ├── rbac/            # Matriks permission FE
│   │       └── templates/       # Template HTML (travel card, dll)
│   ├── api/                     # Backend Express (CommonJS)
│   │   ├── routes/              # Definisi route per domain
│   │   ├── controllers/         # Handler per modul
│   │   ├── services/            # Logika bisnis (msProjectService, ewsCalculator, ...)
│   │   ├── rbac/                # Manifest RBAC (enforce write-only)
│   │   ├── jobs/                # Job berkala (ews snapshot/adoption/roster, kanban)
│   │   └── uploads/             # File upload (volume mount)
│   ├── fastapi-msproject/       # FastAPI: sinkronisasi MS Project + TTS announcement
│   └── tts-worker/              # Python TTS (Piper lokal) untuk notifikasi suara EWS
├── jobs/                        # Worker Python
│   ├── etl/                     # ETL machine hours & sinkronisasi SQL Server
│   ├── sap_staging/             # Pipeline SAP: stage (bundle MCH / per-record TIMESHEET), post, ops_worker
│   ├── sow/                     # Seed ph3_order & export SOW
│   └── machine_ping/            # Ping mesin (worker)
├── database/
│   ├── migrate.js               # Migration runner
│   ├── migrations/
│   │   ├── api/                 # 81 migrasi aplikasi
│   │   └── legacy/              # 14 migrasi legacy (BPN)
│   └── schema/                  # Dump skema (schema_prod.sql)
├── infra/
│   └── nginx/                   # Reverse proxy 80/443 + SSL
├── docker-compose.yml           # Stack produksi (16 service)
└── .env.example                 # Template environment variable
```

### Folder/File Penting

| Path                            | Fungsi                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `apps/web/src/router/index.jsx` | Daftar semua route aplikasi                                    |
| `apps/api/routes/`              | Endpoint REST per domain (timesheet, sow, msProject, ews, ...) |
| `apps/api/rbac/manifest.js`     | Manifest RBAC (metode write di-enforce)                        |
| `jobs/sap_staging/`             | Pipeline posting SAP: staging → posting → ops (queue UI)       |
| `jobs/etl/`                     | ETL machine hours dari SQL Server                              |
| `database/migrations/`          | Migrasi SQL (aplikasi + legacy)                                |
| `database/schema/schema_prod.sql` | Dump kanonik struktur produksi                               |

---

## 6. Cara Menggunakan Fitur

### 6.1 Akses & Autentikasi

1. Buka aplikasi (production: `http://<server>`; dev: `http://localhost:5173`).
2. Halaman `Welcome` → pilih akses/peran.
3. Autentikasi dikirim via header `x-user-id`, `x-user-role`, `x-user-name` (RBAC di-enforce di backend untuk metode write). Frontend menyimpan sesi di `sessionStorage`.

### 6.2 Timesheet Tenaga Kerja (NFC)

1. `/login-timesheet` — masukkan NFC ID / serial number (bisa scan atau ketik manual).
2. `/select-job` — pilih project → unit → operasi (check-in). Setiap aksi (mis. ganti bay) meminta verifikasi NFC kembali.
3. Check-out otomatis mencatat durasi; record muncul di halaman validasi.

### 6.3 Validasi & Posting SAP

1. `/timesheet-validation` — lihat statistik (Pending / SAP Reject / Validated) per karyawan.
2. Klik tombol validasi per record atau per grup → `PUT /timesheet/validation`.
3. Jika toggle **SAP** aktif, record otomatis dikirim ke SAP (`POST /timesheet/post-to-sap`); status per record ditampilkan (spinner SAP…, Validated, atau SAP Reject).
4. Untuk pipeline otomatis (machine hours + timesheet staging), gunakan halaman **Status Kirim SAP** / ops worker (`sap-ops-worker`): `stage_catchup`, `retry_failed`, `post_corrections`, `rebuild_pending`.

### 6.4 SOW & Bay Scheduling

1. `/sow-scheduling` — order pool (tab Perlu/Belum Jadwal/Terjadwal/Selesai), pilih order → task.
2. Reservasi bay di area map (`/sow-scheduling/map`) atau timeline; konfirmasi via NFC (mode manufacturing).
3. `/sow-management` — create/revisi SOW, simpan draft (autosave) atau Saved SOW (snapshot bernama), kelola sub-operasi & progress fisik.

### 6.5 Operations Hub & Dashboard

- `/operations-hub` — KPI: Active Orders (ongoing vs not started), TECO Orders, Machine Productive, Validation Pending; menu navigasi ke semua modul.
- `/dashboard`, `/order-progress-dashboard`, `/operator-performance` — grafik & performa.

### 6.6 Early Warning System (EWS)

- `/ews/*` — detail snapshot, issue drill-down, notifikasi, roster & konfigurasi roster.
- Job berkala (`ews-snapshot-job`, `ews-adoption-job`, `ews-roster-job`) menghitung OEE/OLE/adopsi; notifikasi suara dihasilkan `tts-worker` (Piper lokal) dan dikirim realtime via SSE.

### 6.7 Configuration Rules (Pipeline SAP)

- `/config-rules` — atur `sap_rules` (jam istirahat/break hours, cap durasi record, dsb.) dan rebuild antrian PENDING dari tanggal tertentu. Aturan disimpan di `plant_config.sap_rules` (JSONB).

### 6.8 Modul Pendukung

- `/component-tracking`, `/buffer-transaction`, `/receiving-shipment` — tracking komponen.
- `/consumable-request`, `/tools-request`, `/tools-management`, `/consumable-control` — consumable & tools.
- `/kanban-board`, `/process-control` — kanban & process control.
- `/machine-hours-validation`, `/machine-hours-sqlserver` — validasi jam mesin.
- `/ms-project-hub` (alias `/ms-project-admin`) — kelola project MS Project (rename, edit task, delete/force delete).

---

## 7. Environment Variable

Konfigurasi disimpan di file `.env` **root repo** (baca: backend, frontend, dan job Python). Salin dari `.env.example` dan sesuaikan.

### Variabel Wajib

| Variabel                                                          | Fungsi                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`         | Koneksi PostgreSQL (di compose: lewat `pgbouncer` port `6432`)               |
| `PLANT_SSB`                                                       | Kode plant (mis. `5051`) — dipakai pipeline SAP staging                      |
| `TIMEZONE` (dan `TZ`)                                             | Timezone aplikasi (mis. `Asia/Makassar`)                                     |
| `PORT`                                                            | Port Express API (default `3001`)                                            |
| `SAP_INBOUND_URL`, `SAP_INBOUND_USERNAME`, `SAP_INBOUND_PASSWORD` | Endpoint & kredensial SAP inbound untuk posting                              |
| `TGT_TABLE`                                                       | Tabel referensi produksi (mis. `ph3_order`) untuk lookup confirmation number |

### Variabel Opsional / Tuning

| Variabel                                                                                                                                                             | Fungsi                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ID_TIMESHEET`                                                                                                                                                       | Prefix ZTIMESHEETID (format lama)                                                                                                                                                                                                                                                                                                                                             |
| `SAP_STAGE_INTERVAL`, `SAP_POST_INTERVAL`, `SAP_POST_LIMIT`, `SAP_POST_WORKERS`, `SAP_OPS_INTERVAL`                                                                  | Interval/limit worker SAP staging (default di compose)                                                                                                                                                                                                                                                                                                                        |
| `SAP_STAGING_DB_HOST/PORT/NAME/USER/PASSWORD`                                                                                                                        | Override DB staging (arsitektur source vs staging terpisah; default = DB utama)                                                                                                                                                                                                                                                                                               |
| `SQLSERVER_HOST/PORT/USER/PASSWORD/DATABASE`                                                                                                                         | Koneksi SQL Server (ETL machine hours)                                                                                                                                                                                                                                                                                                                                        |
| `CORS_ORIGIN`, `NODE_ENV`, `HOST`                                                                                                                                    | Konfigurasi API                                                                                                                                                                                                                                                                                                                                                               |
| `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`, `DB_IDLE_IN_TX_TIMEOUT_MS`, `DB_APPLICATION_NAME` | Tuning pool & timeout PostgreSQL                                                                                                                                                                                                                                                                                                                                              |
| `DEVICE_HEARTBEAT_TOKEN`                                                                                                                                             | Token endpoint heartbeat perangkat                                                                                                                                                                                                                                                                                                                                             |
| `DRAWINGS_PATH`                                                                                                                                                      | Lokasi file drawing                                                                                                                                                                                                                                                                                                                                                           |
| `APP_VARIANT`, `VITE_APP_VARIANT`                                                                                                                                    | Varian aplikasi (manufacturing / salvaging)                                                                                                                                                                                                                                                                                                                                   |
| `RBAC_ENFORCE`, `ENABLE_MPS_DASHBOARD_WS`, `KANBAN_REFRESH_ENABLED`, `KANBAN_REFRESH_INTERVAL_MS`                                                                    | Fitur toggle                                                                                                                                                                                                                                                                                                                                                                  |
| `EWS_*`                                                                                                                                                              | Ambang batas & tuning EWS (snapshot, adoption, roster, SSE). Default ada di kode; daftar lengkap: `EWS_ACC_MACHINE_MIN_MISSING`, `EWS_ACC_LABOUR_MIN_BAD`, `EWS_DAY_START_HOUR`, `EWS_OEE_MACHINE_MIN_HOURS`, `EWS_OLE_OPERATOR_MIN_HOURS`, `EWS_SNAPSHOT_TARGETS`, `EWS_SNAPSHOT_STALE_MS`, `EWS_SSE_*`, `EWS_ROSTER_*`, `EWS_JOB_*`, `EWS_ADOPTION_*`, `EWS_UPTIME_*`, dll. |

> Seluruh daftar variabel yang dibaca kode dapat dilihat di `apps/api` (pola `process.env.*`). **Jangan pernah commit `.env`** — file ini sudah di-`.gitignore`.

### Contoh `.env.example`

```bash
# ── Database ─────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=6432
DB_NAME=ptssb
DB_USER=tag
DB_PASSWORD=change-me
DB_POOL_MAX=5

# ── Aplikasi ─────────────────────────────────────────────
PORT=3001
NODE_ENV=development
TIMEZONE=Asia/Makassar
TZ=Asia/Makassar
PLANT_SSB=5051
CORS_ORIGIN=*

# ── SAP Inbound ──────────────────────────────────────────
SAP_INBOUND_URL=https://sap.example.internal/endpoint
SAP_INBOUND_USERNAME=sap-user
SAP_INBOUND_PASSWORD=change-me
TGT_TABLE=ph3_order
ID_TIMESHEET=

# ── Worker SAP Staging ───────────────────────────────────
SAP_STAGE_INTERVAL=900
SAP_POST_INTERVAL=1800
SAP_POST_LIMIT=500
SAP_POST_WORKERS=5
SAP_OPS_INTERVAL=10
# SAP_STAGING_DB_HOST=
# SAP_STAGING_DB_PORT=
# SAP_STAGING_DB_NAME=
# SAP_STAGING_DB_USER=
# SAP_STAGING_DB_PASSWORD=

# ── SQL Server (ETL machine hours) ───────────────────────
SQLSERVER_HOST=
SQLSERVER_PORT=1433
SQLSERVER_USER=
SQLSERVER_PASSWORD=
SQLSERVER_DATABASE=

# ── Device Heartbeat ─────────────────────────────
# DEVICE_HEARTBEAT_TOKEN=
```

---

## 8. Contoh Penggunaan

### 8.1 Alur Timesheet → Posting SAP (end-to-end)

1. Operator login dengan NFC di `/login-timesheet`.
2. Pilih pekerjaan di `/select-job` → check-in.
3. Check-out; record masuk `timesheet_transaction` (status `Pending`).
4. Foreman/PE membuka `/timesheet-validation` → memvalidasi record → record berstatus `Validated` dan dikirim ke SAP.
5. Jika SAP menolak, status berubah `SAP Reject`; record bisa dikirim ulang.
6. Data juga dapat diproses via pipeline staging otomatis (machine hours per bundle; timesheet per record) → `sap_timesheet_staging` → `post_sap_staging` → SAP.

### 8.2 Contoh API

> Semua contoh di bawah adalah endpoint yang benar-benar ada di `apps/api/routes/` dan dipakai frontend.

**Cek data validasi (statistik + grup karyawan)**

```http
GET /timesheet/validation-stats?start=2026-08-01&end=2026-08-20&status=pending
```

Response (ringkas):

```json
{
  "stats": {
    "totalHours": "1234.50",
    "totalRecords": 45,
    "totalEmployees": 12,
    "totalPending": 30,
    "totalReject": 2,
    "totalValidated": 13
  },
  "groups": [
    {
      "serialnumber": "00001234",
      "full_name": "Nama Karyawan",
      "pending_count": "5",
      "total_hours": "40.0"
    }
  ]
}
```

**Validasi record timesheet**

```http
PUT /timesheet/validation
Content-Type: application/json

{ "tsnumbers": [101, 102, 103] }
```

**Posting ke SAP**

```http
POST /timesheet/post-to-sap
Content-Type: application/json

{ "tsnumbers": [101, 102, 103] }
```

Response (ringkas):

```json
{
  "successCount": 2,
  "failCount": 1,
  "results": [
    { "tsnumber": 101, "ok": true, "sapMessage": "OK" },
    { "tsnumber": 102, "ok": true, "sapMessage": "OK" },
    { "tsnumber": 103, "ok": false, "sapMessage": "Error dari SAP" }
  ]
}
```

**Cek kartu NFC**

```http
GET /usernfc/nfcid/12345678
```

Response: object record user langsung (bukan `{data}`); `409` = kartu ganda.

**Download Excel timesheet**

```http
GET /timesheet/getexcel?start=2026-08-01&end=2026-08-20&field=longdate_checkout
```

Response: file `.xlsx` (download).

### 8.3 Pipeline SAP Staging (Worker)

```bash
# Staging machine hours (bundling) — dari DB lokal plant
cd jobs/sap_staging
python stage_machinehours.py --catchup

# Staging timesheet (per record)
python stage_timesheet_transaction.py

# Posting antrian ke SAP
python post_sap_staging.py --limit 500 --workers 5

# Posting ulang baris FAILED
python post_sap_staging.py --failed-only
```

> Anti-double-post dijamin oleh `UNIQUE (source_system, source_key)` pada tabel `sap_timesheet_staging`; script boleh dijalankan ulang (duplikat di-skip).

---

## Dokumentasi Lanjutan

- `database/README.md` — panduan migrasi & pengelolaan database.
- `README.md` (di `apps/tts-worker`) — dokumentasi spesifik TTS worker.
