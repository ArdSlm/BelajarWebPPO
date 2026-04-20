# TUGAS VIDEO DEMO
## Deploy Website Lokal ke Internet via Cloudflare Tunnel & name.com

| Item         | Detail                                          |
|--------------|-------------------------------------------------|
| Jenis Tugas  | Demo Video + Screen Recording                   |
| Durasi       | 5–10 menit                                      |
| Format       | MP4 (resolusi minimal 1280×720 / 720p)          |
| Deadline     | ............................................    |
| Nama         | ............................................    |
| NIM          | ............................................    |

---

## DESKRIPSI TUGAS

Buat video demo yang mendokumentasikan bahwa project kamu **berhasil diselesaikan** dan semua komponen berjalan dengan baik. Video ini menggantikan presentasi tatap muka dan harus dapat membuktikan bahwa kamu memahami sistem yang dibangun.

---

## STRUKTUR VIDEO (5–10 menit)

### BAGIAN 1 — Identitas (30 detik)
- Tampilkan wajah/nama di kamera atau tuliskan di layar
- Sebutkan: Nama, NIM, Kelas
- Sebutkan judul project dan domain yang digunakan

### BAGIAN 2 — Demo Website (1–2 menit)
Tunjukkan website yang sudah jadi:
- [ ] Buka browser → ketik `https://namadomain.com`
- [ ] Tunjukkan ikon **gembok (🔒)** di address bar (HTTPS aktif)
- [ ] Scroll seluruh halaman website
- [ ] Tunjukkan tampilan responsif (resize browser / tampilkan di HP)
- [ ] Klik tombol/interaksi JavaScript yang ada

### BAGIAN 3 — Bukti Teknis (2–3 menit)
Buka terminal dan jalankan perintah berikut satu per satu:

```bash
# a. Identitas sistem
whoami && hostname

# b. Status web server
systemctl --user status website --no-pager | head -10

# c. Status cloudflared
systemctl --user status cloudflared --no-pager | head -10

# d. Test curl
curl -s -o /dev/null -w "localhost:8080 → %{http_code}\n" http://localhost:8080
curl -s -o /dev/null -w "https domain → %{http_code}\n" https://namadomain.com

# e. HTTP redirect ke HTTPS
curl -s -o /dev/null -w "http → %{http_code} redirect to: %{redirect_url}\n" http://namadomain.com

# f. Lihat isi config.yml
cat ~/.cloudflared/config.yml
```

Jelaskan setiap output yang muncul!

### BAGIAN 4 — Bukti DNS & Cloudflare Dashboard (1–2 menit)
Screen record browser:
- [ ] Buka **Cloudflare Dashboard** → pilih domain → **DNS** → **Records**
- [ ] Tunjukkan CNAME records untuk root domain dan www
- [ ] Buka **SSL/TLS** → **Edge Certificates** → tunjukkan "Always Use HTTPS: ON"

### BAGIAN 5 — Demo server.sh (1 menit)
```bash
cd ~/Documents/website
./server.sh
```
- [ ] Pilih opsi **3 (Status)** → tunjukkan kedua service running
- [ ] Pilih opsi **2 (Stop)** → tunjukkan server berhenti
- [ ] Pilih opsi **1 (Start)** → tunjukkan server kembali jalan
- [ ] Pilih opsi **3 (Status)** → verifikasi kembali

### BAGIAN 6 — Penjelasan Singkat (1–2 menit)
Jelaskan dengan bahasamu sendiri (tidak boleh membaca):
- [ ] Apa itu Cloudflare Tunnel dan bagaimana cara kerjanya?
- [ ] Mengapa menggunakan Cloudflare dibanding ngrok?
- [ ] Apa yang terjadi jika PC dimatikan?

---

## CHECKLIST VIDEO

Pastikan semua item ini terlihat jelas dalam video:

**Demo Website:**
- [ ] URL domain dengan HTTPS di address bar
- [ ] Ikon gembok terkunci (🔒)
- [ ] Seluruh konten website terlihat
- [ ] Website responsif

**Terminal:**
- [ ] `systemctl status website` → active (running)
- [ ] `systemctl status cloudflared` → active (running)
- [ ] `curl localhost:8080` → 200
- [ ] `curl https://domain.com` → 200
- [ ] `curl http://domain.com` → 301 redirect ke https
- [ ] Isi `config.yml` ditampilkan

**Cloudflare Dashboard:**
- [ ] DNS Records: CNAME untuk root + www
- [ ] Always Use HTTPS: ON

**server.sh:**
- [ ] Menu tampil
- [ ] Stop → Start → Status berfungsi

---

## KETENTUAN VIDEO

### Kualitas
- Resolusi minimal: **720p (1280×720)**
- Audio: jelas, tidak terlalu bising
- Teks di layar harus dapat dibaca
- Tidak boleh di-cut saat menjalankan perintah penting

### Narasi
- Harus ada suara narasi (tidak boleh video tanpa suara)
- Jelaskan apa yang sedang dilakukan di setiap langkah
- Gunakan bahasa Indonesia atau Inggris

### Konten
- Tidak boleh menggunakan domain/server milik teman
- Terminal harus menampilkan username asli kamu
- Tanggal di terminal harus sesuai tanggal pengambilan video

### Format Upload
```
NIM_NamaLengkap_DemoCloudflare.mp4
Contoh: 12345678_BudiSantoso_DemoCloudflare.mp4
```

---

## CONTOH SCRIPT NARASI

Berikut contoh narasi yang bisa kamu gunakan sebagai panduan:

---

*"Halo, perkenalkan nama saya [NAMA], NIM [NIM] dari kelas [KELAS].*

*Pada demo ini saya akan menunjukkan hasil project deploy website lokal ke internet menggunakan Cloudflare Tunnel dengan domain [DOMAIN].*

*[Buka browser]*

*Ini adalah website saya yang bisa diakses di [DOMAIN]. Perhatikan ikon gembok di sini, artinya website sudah menggunakan HTTPS dan aman.*

*[Buka terminal]*

*Sekarang saya tunjukkan dari sisi teknis. Pertama, status web server Python yang berjalan di localhost port 8080...*

*[Jalankan systemctl status]*

*Server aktif. Sekarang saya test dengan curl...*

*[Jalankan curl]*

*Domain merespons dengan HTTP 200, artinya website bisa diakses.*

*[Buka Cloudflare Dashboard]*

*Ini adalah Cloudflare Dashboard saya. Di sini terlihat DNS records — ada dua CNAME: satu untuk root domain dan satu untuk www. Keduanya menuju ke tunnel Cloudflare saya.*

*[Jalankan server.sh]*

*Terakhir, ini adalah script manajemen server yang sudah saya buat. Saya bisa start, stop, dan cek status dengan mudah...*

*[Penjelasan konsep]*

*Cara kerja Cloudflare Tunnel: program cloudflared di PC saya membuat koneksi keluar ke Cloudflare. Ketika ada pengunjung ke domain saya, traffic masuk ke Cloudflare, kemudian diteruskan melalui tunnel ke PC saya, dan akhirnya ke Python HTTP Server yang melayani file website.*

*Tidak perlu port forwarding karena koneksinya outbound, bukan inbound.*

*Sekian demo dari saya, terima kasih."*

---

## TOOLS YANG BISA DIGUNAKAN

### Screen Recording
| Tool | Platform | Keterangan |
|------|----------|------------|
| **OBS Studio** | Linux/Win/Mac | Gratis, fitur lengkap |
| **Kazam** | Linux | Ringan, mudah |
| **SimpleScreenRecorder** | Linux | Stabil |
| `recordmydesktop` | Linux terminal | Via terminal |

### Instalasi Kazam (rekomendasi untuk Linux)
```bash
sudo apt install kazam
kazam &
```

### Instalasi OBS Studio
```bash
sudo apt install obs-studio
obs &
```

---

## RUBRIK PENILAIAN VIDEO

| No | Komponen | Bobot | Keterangan |
|----|----------|-------|------------|
| 1 | Demo website (HTTPS + konten) | 20% | URL + gembok terlihat |
| 2 | Bukti terminal (curl + status) | 25% | Semua perintah dijalankan |
| 3 | Cloudflare Dashboard DNS | 15% | CNAME records terlihat |
| 4 | Demo server.sh | 15% | Start/stop/status |
| 5 | Penjelasan konsep | 15% | Dengan bahasa sendiri |
| 6 | Kualitas video & presentasi | 10% | Jelas, sistematis |
| | **TOTAL** | **100%** | |

---

## PENGUMPULAN

| Platform | Link/Info |
|----------|-----------|
| Google Drive / LMS | Upload file MP4 |
| Format nama file | `NIM_Nama_DemoCloudflare.mp4` |
| Deadline | Lihat header dokumen |

> ⚠️ Video yang tidak memenuhi kriteria durasi atau checklist akan diminta untuk diulang.

---

*Tugas Video dibuat: Maret 2026 | RofiqCP IoT Solutions*
