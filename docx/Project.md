# PROJECT BRIEF
## Deploy Website Lokal ke Internet via Cloudflare Tunnel & name.com

| Item          | Detail                                             |
|---------------|----------------------------------------------------|
| Nama Project  | Personal Website Online via Cloudflare Tunnel      |
| Mata Kuliah   | Jaringan & Web Server                              |
| Tipe          | Project Individu                                   |
| Deadline      | ............................................       |
| Nama          | ............................................       |
| NIM           | ............................................       |

---

## DESKRIPSI PROJECT

Project ini bertujuan membuat sebuah website personal yang dapat diakses dari **internet menggunakan domain custom**, namun file websitenya berjalan di **komputer lokal** (localhost). Koneksi dari internet ke lokal dijembatani oleh **Cloudflare Tunnel** — tanpa perlu port forwarding, VPS, maupun ngrok.

### Hasil Akhir yang Diharapkan
- Website dapat diakses di: `https://namadomain.com`
- Menampilkan konten tentang diri sendiri / profil / IoT project
- Aman dengan HTTPS (gembok hijau di browser)
- Server jalan otomatis saat PC dinyalakan

---

## SPESIFIKASI TEKNIS

### Stack Teknologi
| Layer | Teknologi | Keterangan |
|-------|-----------|------------|
| Frontend | HTML5, CSS3, JavaScript | Tampilan website |
| Server | Python `http.server` | Web server lokal |
| Tunnel | Cloudflare Tunnel (`cloudflared`) | Jembatan lokal↔internet |
| DNS | Cloudflare DNS | Pengelolaan domain |
| Domain | name.com | Registrar domain |
| SSL | Cloudflare SSL (gratis) | Keamanan HTTPS |
| Service | systemd user service | Auto-start |

### Spesifikasi Minimum Website
- **Halaman:** minimal 1 halaman (index.html)
- **Styling:** CSS eksternal (style.css) — boleh framework (Bootstrap, Tailwind)
- **Script:** JavaScript eksternal (script.js) — minimal 1 fungsi interaktif
- **Responsif:** tampilan baik di mobile dan desktop
- **Konten:** berisi profil/identitas/project IoT

### Spesifikasi Minimum Infrastruktur
- Python HTTP Server berjalan di port 8080
- Cloudflare Tunnel terkonfigurasi dan aktif
- DNS CNAME untuk root domain dan www
- HTTPS aktif (Always Use HTTPS)
- systemd service untuk auto-start
- Script `server.sh` untuk manajemen

---

## ALUR KERJA PROJECT

```
MINGGU 1                    MINGGU 2                    MINGGU 3
──────────────────────────────────────────────────────────────────
[1] Desain konten website   [4] Beli domain name.com   [7] Test HTTPS
[2] Buat HTML/CSS/JS        [5] Setup Cloudflare Zone  [8] Setup auto-start
[3] Test localhost:8080     [6] Buat Tunnel + DNS      [9] Dokumentasi & demo
```

---

## KETENTUAN KONTEN WEBSITE

Website harus memuat minimal salah satu tema berikut:

### Option A: Profil Personal + IoT Portfolio
- Nama, foto, bio singkat
- Daftar project IoT yang pernah dibuat
- Deskripsi minimal 2 project
- Kontak (email, GitHub, LinkedIn)

### Option B: Landing Page Produk IoT
- Nama produk/device IoT
- Fitur dan spesifikasi
- Demo atau video (embed YouTube)
- Form kontak (bisa dummy)

### Option C: Blog/Jurnal Belajar
- Minimal 3 artikel tentang IoT / pemrograman
- Kategori dan tanggal artikel
- About page
- Menu navigasi

---

## KRITERIA PENILAIAN

### A. Teknis (60 poin)
| Kriteria | Poin |
|----------|------|
| Website jalan di localhost:8080 | 5 |
| Cloudflare Tunnel terkonfigurasi | 10 |
| Domain custom bisa diakses (HTTP 200) | 15 |
| HTTPS aktif (HTTP redirect ke HTTPS) | 10 |
| systemd service auto-start aktif | 10 |
| Script server.sh berfungsi | 5 |
| DNS CNAME root + www terdaftar | 5 |

### B. Desain Website (25 poin)
| Kriteria | Poin |
|----------|------|
| Tampilan profesional dan menarik | 10 |
| Responsif (mobile & desktop) | 7 |
| Konten sesuai spesifikasi | 5 |
| Fitur interaktif JavaScript | 3 |

### C. Dokumentasi (15 poin)
| Kriteria | Poin |
|----------|------|
| Laporan Jobsheet lengkap + screenshot | 10 |
| Jawaban pertanyaan praktikum | 5 |

**Total: 100 poin**

---

## FILE YANG DIKUMPULKAN

```
submissions/
├── 📁 website/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── server.sh
├── 📄 Laporan.pdf          ← Jobsheet yang sudah diisi + screenshot
└── 📄 README.md            ← Berisi URL domain dan cara akses
```

### Format README.md
```markdown
# Nama Project

- **Nama:** [Nama Anda]
- **NIM:** [NIM Anda]
- **URL:** https://namadomain.com
- **Domain:** Terdaftar di name.com
- **Server:** localhost:8080 (Python HTTP Server)
- **Tunnel:** Cloudflare Tunnel (sirobo-tunnel)
- **Auto-start:** Ya (systemd user service)

## Cara Akses
1. Buka browser
2. Ketik: https://namadomain.com
3. Website tampil ✅
```

---

## TIMELINE

| Minggu | Kegiatan | Deliverable |
|--------|----------|-------------|
| 1 | Desain & buat website, test lokal | localhost:8080 berjalan |
| 2 | Beli domain, setup Cloudflare, buat tunnel | Domain bisa diakses |
| 3 | HTTPS, auto-start, dokumentasi | Laporan + demo live |

---

## REFERENSI YANG DIIZINKAN

- Dokumentasi resmi Cloudflare: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- MDN Web Docs: https://developer.mozilla.org
- W3Schools: https://www.w3schools.com
- Modul praktikum ini (Materi.md, Jobsheet.md)
- Stack Overflow (dengan menyebutkan sumber di laporan)

---

## PELANGGARAN AKADEMIK

- Dilarang meng-copy website milik orang lain secara keseluruhan
- Boleh menggunakan template, tetapi harus dimodifikasi dan disesuaikan kontennya
- Setiap mahasiswa HARUS memiliki domain dan tunnel sendiri
- Berbagi tunnel/domain dengan teman → nilai = 0

---

*Project Brief dibuat: Maret 2026 | RofiqCP IoT Solutions*
