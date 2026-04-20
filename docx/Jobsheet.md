# JOBSHEET PRAKTIKUM

## Deploy Website Lokal ke Internet via Cloudflare Tunnel & name.com

| Mata Kuliah | Jaringan & Web Server                         |
| ----------- | --------------------------------------------- |
| Topik       | Cloudflare Tunnel + Domain Custom (name.com)  |
| Durasi      | 3 × 50 menit                                 |
| Tools       | Linux, cloudflared, Python, Browser           |
| Nama        | ............................................. |
| NIM         | ............................................. |
| Kelas       | ............................................. |
| Tanggal     | ............................................. |

---

## TUJUAN PRAKTIKUM

Setelah menyelesaikan praktikum ini, mahasiswa mampu:

1. Menjalankan web server lokal menggunakan Python
2. Membuat dan mengkonfigurasi Cloudflare Tunnel
3. Menghubungkan domain name.com ke Cloudflare
4. Mengakses website lokal dari internet menggunakan domain custom
5. Mengamankan website dengan HTTPS melalui Cloudflare SSL

---

## ARSITEKTUR SISTEM

```
Internet
    │
    ▼
┌─────────────────────┐
│   Browser Pengunjung │
└─────────┬───────────┘
          │ https://namadomain.com
          ▼
┌─────────────────────┐
│   name.com          │  ← Domain registrar
│   Nameserver →      │    ignat.ns.cloudflare.com
│   Cloudflare NS     │    naomi.ns.cloudflare.com
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Cloudflare CDN    │  ← SSL/TLS termination
│   + DNS + Firewall  │    "Always Use HTTPS" aktif
└─────────┬───────────┘
          │ QUIC/HTTP2 (encrypted)
          ▼
┌─────────────────────┐
│  cloudflared daemon  │  ← Tunnel agent di PC lokal
│  (systemd service)  │    Koneksi outbound ke Cloudflare
└─────────┬───────────┘
          │ http://localhost:8080
          ▼
┌─────────────────────┐
│  Python HTTP Server  │  ← Web server lokal
│  port 8080          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  ~/Documents/website/│  ← File website
│  index.html         │
│  style.css          │
│  script.js          │
└─────────────────────┘
```

---

## PERSIAPAN

### A. Kebutuhan Sistem

- OS: Ubuntu/Debian Linux (20.04 / 22.04 / 24.04)
- RAM: minimal 2 GB
- Koneksi internet aktif
- Python 3 sudah terinstall

### B. Akun yang Dibutuhkan

| Layanan    | URL                    | Keterangan              |
| ---------- | ---------------------- | ----------------------- |
| Cloudflare | https://cloudflare.com | CDN, Tunnel, DNS gratis |
| name.com   | https://www.name.com   | Registrar domain        |

---

## LANGKAH-LANGKAH PRAKTIKUM

---

### 🔷 TAHAP 1 — PERSIAPKAN FILE WEBSITE

**1.1 Buat direktori project**

```bash
mkdir -p ~/Documents/website
cd ~/Documents/website
```

**1.2 Buat file `index.html`**

```bash
nano index.html
```

Isi minimal:

```html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Website Saya</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Halo Dunia!</h1>
    <p>Website lokal saya kini online.</p>
    <script src="script.js"></script>
</body>
</html>
```

**1.3 Buat file `style.css`**

```bash
nano style.css
```

```css
body {
    font-family: Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    background: #1a1a2e;
    color: white;
    text-align: center;
}
```

**1.4 Buat file `script.js`**

```bash
nano script.js
```

```js
console.log("Website lokal berhasil diakses!");
```

**✅ Checkpoint 1:** Struktur file siap

```
~/Documents/website/
├── index.html
├── style.css
└── script.js
```

Screenshot hasil: _______________

---

### 🔷 TAHAP 2 — JALANKAN WEB SERVER LOKAL

**2.1 Masuk ke direktori website**

```bash
cd ~/Documents/website
```

**2.2 Jalankan Python HTTP Server di port 8080**

```bash
python -m http.server 8080
```

Output yang diharapkan:

```
Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

**2.3 Buka browser dan test**

- Buka browser baru
- Ketik: `http://localhost:8080`
- Website harus tampil

**2.4 Test via terminal** (buka terminal baru)

```bash
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:8080
# Output yang diharapkan: Status: 200
```

> ⚠️ Jika ada error port sudah dipakai:
>
> ```bash
> sudo lsof -i :8080
> sudo kill -9 <PID>
> ```

**✅ Checkpoint 2:** `http://localhost:8080` → HTTP 200

Screenshot hasil: _______________

---

### 🔷 TAHAP 3 — INSTALL CLOUDFLARED

**3.1 Download package cloudflared**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
```

**3.2 Install package**

```bash
sudo dpkg -i cloudflared.deb
```

**3.3 Verifikasi instalasi**

```bash
cloudflared --version
```

Output contoh:

```
cloudflared version 2026.1.1
```

**✅ Checkpoint 3:** cloudflared terinstall

Screenshot hasil: _______________

---

### 🔷 TAHAP 4 — DAFTARKAN DOMAIN DI NAME.COM

> Lewati langkah ini jika domain sudah tersedia.

**4.1 Buka name.com di browser**

- URL: `https://www.name.com`

**4.2 Login atau buat akun baru**

- Klik **Sign In** jika sudah punya akun
- Atau klik **Create Account** untuk mendaftar baru

**4.3 Cari domain yang tersedia**

- Di kolom pencarian, ketik nama domain yang diinginkan
- Contoh: `namaanda.codes`, `namaanda.site`, `namaanda.online`
- Klik ikon search/cari

**4.4 Pilih dan beli domain**

- Pilih domain yang tersedia
- Klik **Add to Cart**
- Lanjutkan proses checkout
- Selesaikan pembayaran

**4.5 Tunggu aktivasi**

- Domain aktif dalam 5–15 menit setelah pembayaran

**✅ Checkpoint 4:** Domain terdaftar dan aktif di name.com

Screenshot hasil: _______________

---

### 🔷 TAHAP 5 — SETUP AKUN & TAMBAH DOMAIN DI CLOUDFLARE

**5.1 Buka Cloudflare**

- URL: `https://cloudflare.com`
- Login atau buat akun baru

**5.2 Tambahkan domain ke Cloudflare**

- Di dashboard, klik tombol **+ Add a Site** atau **Add a domain**
- Masukkan nama domain kamu (contoh: `namaanda.codes`)
- Klik **Continue**

**5.3 Pilih plan Free**

- Scroll ke bawah
- Pilih plan **Free ($0/month)**
- Klik **Continue**

**5.4 Cloudflare scan DNS records**

- Cloudflare otomatis scan DNS records lama
- Klik **Continue**

**5.5 Catat nameserver Cloudflare**
Cloudflare akan menampilkan 2 nameserver, contoh:

```
ignat.ns.cloudflare.com
naomi.ns.cloudflare.com
```

> 📝 Catat kedua nameserver ini di sini:
>
> - NS 1: ___________________________
> - NS 2: ___________________________

**✅ Checkpoint 5:** Zone domain dibuat di Cloudflare, nameserver dicatat

Screenshot hasil: _______________

---

### 🔷 TAHAP 6 — UBAH NAMESERVER DI NAME.COM

**6.1 Login ke name.com**

- Buka: `https://www.name.com`
- Login ke akun Anda

**6.2 Buka halaman manajemen domain**

- Klik **My Domains** di menu atas
- Klik nama domain yang ingin dikonfigurasi

**6.3 Pergi ke pengaturan Nameserver**

- Klik tab atau menu **Nameservers**

**6.4 Pilih Custom Nameservers**

- Pilih opsi **Custom Nameservers** (bukan default)
- Hapus nameserver lama yang ada

**6.5 Isi nameserver Cloudflare**
Isi dengan nameserver yang dicatat di Tahap 5:

```
Nameserver 1: ignat.ns.cloudflare.com
Nameserver 2: naomi.ns.cloudflare.com
```

- Klik **Save** atau **Update Nameservers**

**6.6 Tunggu propagasi DNS**

- Propagasi DNS membutuhkan waktu **5 menit – 48 jam**
- Rata-rata selesai dalam **15–30 menit**
- Cek status propagasi di: `https://dnschecker.org`

**6.7 Verifikasi di Cloudflare**

- Kembali ke Cloudflare Dashboard
- Status domain akan berubah menjadi **"Active"** (centang hijau)

**✅ Checkpoint 6:** Nameserver domain → Cloudflare, status Active

Screenshot hasil: _______________

---

### 🔷 TAHAP 7 — LOGIN CLOUDFLARED KE AKUN CLOUDFLARE

**7.1 Jalankan perintah login**

```bash
cloudflared tunnel login
```

Output:

```
Please open the following URL and log in with your Cloudflare account:

https://dash.cloudflare.com/argotunnel?aud=...&callback=...

Leave cloudflared running to download the cert automatically.
```

**7.2 Buka URL di browser**

- Copy URL yang muncul di terminal
- Paste di browser
- Login ke akun Cloudflare Anda

**7.3 Pilih dan otorisasi domain**

- Pilih domain yang tersedia (contoh: `namaanda.codes`)
- Klik tombol **Authorize**
- Tunggu hingga halaman menampilkan konfirmasi sukses

**7.4 Verifikasi sertifikat tersimpan**

```bash
ls ~/.cloudflared/
# Output harus ada: cert.pem
```

**✅ Checkpoint 7:** `~/.cloudflared/cert.pem` tersimpan

Screenshot hasil: _______________

---

### 🔷 TAHAP 8 — BUAT CLOUDFLARE TUNNEL

**8.1 Buat tunnel baru**

```bash
cloudflared tunnel create mysite-tunnel
```

> Ganti `mysite-tunnel` dengan nama yang Anda inginkan (tanpa spasi)

Output:

```
Tunnel credentials written to /home/USER/.cloudflared/TUNNEL-ID.json
Created tunnel mysite-tunnel with id TUNNEL-ID
```

**8.2 Catat Tunnel ID**

```bash
cloudflared tunnel list
```

Output:

```
ID                                   NAME           CREATED
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx mysite-tunnel  2026-03-12
```

> 📝 Catat Tunnel ID di sini: ___________________________

**8.3 Cek file credentials tersimpan**

```bash
ls ~/.cloudflared/
# Output: cert.pem  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json
```

**✅ Checkpoint 8:** Tunnel berhasil dibuat, Tunnel ID dicatat

Screenshot hasil: _______________

---

### 🔷 TAHAP 9 — BUAT FILE KONFIGURASI TUNNEL

**9.1 Buka/buat file config.yml**

```bash
nano ~/.cloudflared/config.yml
```

**9.2 Isi konfigurasi berikut**

```yaml
tunnel: GANTI-DENGAN-TUNNEL-ID-KAMU
credentials-file: /home/GANTI-USERNAME/.cloudflared/GANTI-DENGAN-TUNNEL-ID-KAMU.json

ingress:
  - hostname: namaanda.codes
    service: http://localhost:8080
  - hostname: www.namaanda.codes
    service: http://localhost:8080
  - service: http_status:404
```

> ⚠️ Ganti bagian berikut:
>
> | Placeholder                     | Ganti dengan                   |
> | ------------------------------- | ------------------------------ |
> | `GANTI-DENGAN-TUNNEL-ID-KAMU` | ID tunnel dari Tahap 8.2       |
> | `GANTI-USERNAME`              | Username Linux kamu:`whoami` |
> | `namaanda.codes`              | Domain kamu                    |

**9.3 Cek username Linux kamu**

```bash
whoami
# Output: namauser
```

**9.4 Simpan file**

- Tekan `Ctrl+O` → Enter → `Ctrl+X`

**9.5 Tampilkan isi file untuk verifikasi**

```bash
cat ~/.cloudflared/config.yml
```

**✅ Checkpoint 9:** File `~/.cloudflared/config.yml` siap

Screenshot hasil: _______________

---

### 🔷 TAHAP 10 — TAMBAHKAN DNS RECORD DI CLOUDFLARE

**10.1 Tambahkan CNAME untuk www**

```bash
cloudflared tunnel route dns mysite-tunnel www.namaanda.codes
```

Output sukses:

```
INF Added CNAME www.namaanda.codes which will route to this tunnel tunnelID=...
```

**10.2 Tambahkan CNAME untuk root domain**

```bash
cloudflared tunnel route dns mysite-tunnel namaanda.codes
```

Output sukses:

```
INF Added CNAME namaanda.codes which will route to this tunnel tunnelID=...
```

> ⚠️ Jika error **"Internal server error"** pada root domain:
>
> - Ada Worker atau record lain yang konflik
> - Buka Cloudflare Dashboard → domain → **DNS** → **Records**
> - Hapus record bermerk "Worker" untuk root domain
> - Coba perintah di atas kembali

**10.3 Verifikasi di Cloudflare Dashboard**

- Dashboard Cloudflare → pilih domain → **DNS** → **Records**
- Harus ada 2 record:
  ```
  Type  Name              Content
  CNAME namaanda.codes    TUNNEL-ID.cfargotunnel.com
  CNAME www.namaanda.codes TUNNEL-ID.cfargotunnel.com
  ```

**✅ Checkpoint 10:** DNS records CNAME terdaftar di Cloudflare

Screenshot hasil: _______________

---

### 🔷 TAHAP 11 — JALANKAN TUNNEL DAN TEST

**11.1 Pastikan web server masih berjalan**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
# Output: 200
```

**11.2 Jalankan tunnel**

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run mysite-tunnel
```

Output sukses (tunggu 4 koneksi):

```
INF Starting metrics server on 127.0.0.1:20241/metrics
INF Registered tunnel connection connIndex=0 ... location=sin12 protocol=quic
INF Registered tunnel connection connIndex=1 ... location=sin20 protocol=quic
INF Registered tunnel connection connIndex=2 ... location=sin19 protocol=quic
INF Registered tunnel connection connIndex=3 ... location=sin07 protocol=quic
```

**11.3 Test domain dari browser**

- Buka browser baru
- Ketik: `https://namaanda.codes`
- Website harus tampil!

**11.4 Test via terminal** (terminal baru)

```bash
curl -s -o /dev/null -w "https domain: %{http_code}\n" https://namaanda.codes
curl -s -o /dev/null -w "www domain: %{http_code}\n" https://www.namaanda.codes
# Keduanya harus 200
```

**✅ Checkpoint 11:** Domain bisa diakses dari internet!

Screenshot hasil (browser dengan domain): _______________

---

### 🔷 TAHAP 12 — AKTIFKAN HTTPS (Always Use HTTPS)

**12.1 Buka Cloudflare SSL/TLS Settings**

- Cloudflare Dashboard → pilih domain → klik **SSL/TLS** di sidebar
- Pilih sub-menu **Edge Certificates**

**12.2 Aktifkan "Always Use HTTPS"**

- Scroll ke bagian **Always Use HTTPS**
- Toggle/centang menjadi **ON**
- Tersimpan otomatis (tampil pesan "Setting was last changed...")

**12.3 Pastikan mode SSL "Full"**

- Kembali ke **SSL/TLS** → **Overview**
- Pilih mode **Full** (bukan Flexible, bukan Off)

**12.4 Verifikasi redirect HTTP → HTTPS**

```bash
curl -s -o /dev/null -w "HTTP code: %{http_code}\nRedirect ke: %{redirect_url}\n" http://namaanda.codes
# Output:
# HTTP code: 301
# Redirect ke: https://namaanda.codes/
```

**✅ Checkpoint 12:** HTTP otomatis redirect ke HTTPS, ikon gembok muncul di browser

Screenshot hasil (ikon gembok di browser): _______________

---

### 🔷 TAHAP 13 — SETUP AUTO-START (SYSTEMD SERVICE)

> Agar server jalan otomatis saat login tanpa perlu ketik perintah manual.

**13.1 Aktifkan linger**

```bash
loginctl enable-linger $USER
```

**13.2 Buat direktori systemd user**

```bash
mkdir -p ~/.config/systemd/user
```

**13.3 Buat service untuk web server**

```bash
nano ~/.config/systemd/user/website.service
```

Isi:

```ini
[Unit]
Description=Website HTTP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/GANTI-USERNAME/Documents/website
ExecStart=/usr/bin/python3 -m http.server 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

**13.4 Buat service untuk cloudflared tunnel**

```bash
nano ~/.config/systemd/user/cloudflared.service
```

Isi:

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --config /home/GANTI-USERNAME/.cloudflared/config.yml run mysite-tunnel
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

**13.5 Reload & aktifkan services**

```bash
systemctl --user daemon-reload
systemctl --user enable website
systemctl --user enable cloudflared
systemctl --user start website
systemctl --user start cloudflared
```

**13.6 Cek status**

```bash
systemctl --user status website cloudflared --no-pager
```

Output sukses:

```
● website.service - Website HTTP Server
     Active: active (running) since ...

● cloudflared.service - Cloudflare Tunnel
     Active: active (running) since ...
```

**✅ Checkpoint 13:** Services berjalan otomatis saat login

Screenshot hasil: _______________

---

### 🔷 TAHAP 14 — BUAT SCRIPT MANAJEMEN SERVER

**14.1 Buat file server.sh**

```bash
nano ~/Documents/website/server.sh
```

Isi script:

```bash
#!/bin/bash

show_menu() {
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║   Server Management - namaanda.codes  ║"
    echo "╚══════════════════════════════════════╝"
    echo "1. Start Server"
    echo "2. Stop Server"
    echo "3. Status"
    echo "4. Lihat Log Website"
    echo "5. Lihat Log Cloudflare"
    echo "6. Restart Server"
    echo "0. Exit"
    echo ""
}

while true; do
    show_menu
    read -p "Pilih opsi: " choice
    case $choice in
        1) systemctl --user start website cloudflared && echo "✅ Server started" ;;
        2) systemctl --user stop website cloudflared && echo "⏸ Server stopped" ;;
        3) systemctl --user status website cloudflared --no-pager | grep "Active:" ;;
        4) journalctl --user -u website -n 30 --no-pager ;;
        5) journalctl --user -u cloudflared -n 30 --no-pager ;;
        6) systemctl --user restart website cloudflared && echo "🔄 Server restarted" ;;
        0) echo "Bye!"; exit 0 ;;
        *) echo "❌ Opsi tidak valid" ;;
    esac
done
```

**14.2 Beri hak eksekusi**

```bash
chmod +x ~/Documents/website/server.sh
```

**14.3 Jalankan script**

```bash
cd ~/Documents/website
./server.sh
```

**✅ Checkpoint 14:** Script manajemen server berfungsi

Screenshot hasil: _______________

---

## VERIFIKASI AKHIR

Jalankan semua perintah ini dan pastikan outputnya sesuai:

```bash
# Test 1: Web server lokal
curl -s -o /dev/null -w "localhost:8080 → %{http_code}\n" http://localhost:8080
# ✅ Diharapkan: localhost:8080 → 200

# Test 2: HTTP redirect ke HTTPS
curl -s -o /dev/null -w "http redirect → %{http_code} → %{redirect_url}\n" http://namaanda.codes
# ✅ Diharapkan: http redirect → 301 → https://namaanda.codes/

# Test 3: HTTPS root domain
curl -s -o /dev/null -w "https root → %{http_code}\n" https://namaanda.codes
# ✅ Diharapkan: https root → 200

# Test 4: HTTPS www domain
curl -s -o /dev/null -w "https www → %{http_code}\n" https://www.namaanda.codes
# ✅ Diharapkan: https www → 200

# Test 5: Status services
systemctl --user status website cloudflared --no-pager | grep "Active:"
# ✅ Diharapkan: Active: active (running) ... (x2)
```

Screenshot output semua test: _______________

---

## TROUBLESHOOTING

| Masalah                                     | Penyebab                     | Solusi                                    |
| ------------------------------------------- | ---------------------------- | ----------------------------------------- |
| `localhost:8080` error                    | Server belum jalan           | `systemctl --user start website`        |
| Tunnel tidak connect                        | Web server mati              | Pastikan localhost:8080 aktif dulu        |
| Domain belum bisa diakses                   | DNS belum propagasi          | Tunggu 15–30 mnt, cek dnschecker.org     |
| `route dns` error "Internal server error" | Record konflik di Cloudflare | Hapus record lama di dashboard, coba lagi |
| "Not secure" di browser                     | HTTPS belum aktif            | Aktifkan "Always Use HTTPS" di Cloudflare |
| `cert.pem` tidak ada                      | Belum login cloudflared      | Jalankan `cloudflared tunnel login`     |
| Port 8080 sudah dipakai                     | Proses lain                  | `sudo lsof -i :8080` → kill PID-nya    |
| Service tidak auto-start                    | Linger belum aktif           | `loginctl enable-linger $USER`          |

---

## PERTANYAAN PRAKTIKUM

Jawab pertanyaan berikut berdasarkan pengamatan selama praktikum:

1. Jelaskan perbedaan **HTTP** dan **HTTPS**. Mengapa HTTPS lebih aman?

   Jawaban: _____________________________________________
2. Apa fungsi **nameserver** dalam sistem DNS? Mengapa nameserver domain harus diubah ke Cloudflare?

   Jawaban: _____________________________________________
3. Jelaskan cara kerja **Cloudflare Tunnel**. Mengapa tidak perlu membuka port di router?

   Jawaban: _____________________________________________
4. Apa perbedaan menjalankan server secara **manual** vs menggunakan **systemd service**?

   Jawaban: _____________________________________________
5. Apa yang dimaksud **DNS propagation** dan mengapa butuh waktu?

   Jawaban: _____________________________________________

---

## RUBRIK PENILAIAN

| No | Komponen                              | Bobot          | Nilai |
| -- | ------------------------------------- | -------------- | ----- |
| 1  | Checkpoint 1–3 (Website & Install)   | 15%            |       |
| 2  | Checkpoint 4–6 (Domain & Cloudflare) | 20%            |       |
| 3  | Checkpoint 7–9 (Tunnel & Config)     | 20%            |       |
| 4  | Checkpoint 10–12 (Online & HTTPS)    | 25%            |       |
| 5  | Checkpoint 13–14 (Auto-start)        | 10%            |       |
| 6  | Jawaban Pertanyaan                    | 10%            |       |
|    | **TOTAL**                       | **100%** |       |

---

*Jobsheet dibuat: Maret 2026 | RofiqCP IoT Solutions*
