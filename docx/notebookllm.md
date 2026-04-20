# NotebookLM Study Guide
## Deploy Website Lokal ke Internet via Cloudflare Tunnel & name.com

> File ini diformat untuk diupload ke **NotebookLM** (notebooklm.google.com)
> sebagai sumber belajar. Berisi penjelasan konsep, Q&A, dan rangkuman.

---

## BAGIAN 1 — KONSEP DASAR

### Apa itu Cloudflare Tunnel?
Cloudflare Tunnel (dulu disebut Argo Tunnel) adalah layanan yang memungkinkan kamu menghubungkan server lokal di komputermu ke internet **tanpa perlu membuka port di router** atau memiliki IP publik statis. 

Cara kerjanya: program `cloudflared` yang berjalan di PC kamu membuat koneksi outbound (keluar) ke Cloudflare. Koneksi ini dipakai sebagai "terowongan" untuk menyalurkan traffic dari internet ke server lokalmu.

### Mengapa Tidak Perlu Port Forwarding?
Pada cara tradisional, untuk membuat server lokal bisa diakses dari internet, kamu harus:
1. Buka port di firewall router
2. Konfigurasi router dengan IP publik
3. IP publik yang terus berubah (dynamic IP)

Dengan Cloudflare Tunnel, masalah ini tidak ada karena koneksinya **outbound** dari PC kamu ke Cloudflare — bukan inbound dari internet ke PC kamu. Firewall dan router tidak memblokir koneksi keluar.

### Apa Perbedaan HTTP dan HTTPS?
- **HTTP** — Data dikirim sebagai teks biasa. Siapapun yang bisa "menyadap" jaringan bisa membaca isinya.
- **HTTPS** — Data dienkripsi menggunakan SSL/TLS sebelum dikirim. Walaupun disadap, data tidak bisa dibaca.

Untuk website yang sudah menggunakan Cloudflare Tunnel, Cloudflare otomatis menyediakan sertifikat SSL gratis. Aktifkan "Always Use HTTPS" agar semua pengunjung selalu diarahkan ke versi HTTPS.

### Apa itu Nameserver dan Mengapa Harus Diubah ke Cloudflare?
Nameserver adalah server yang menjawab pertanyaan DNS: "IP berapa untuk domain ini?". 

Ketika kamu membeli domain di name.com, by default nameserver-nya milik name.com. Untuk bisa menggunakan fitur Cloudflare (Tunnel, CDN, SSL, dll.), kamu harus mengubah nameserver domain ke milik Cloudflare. Setelah itu, Cloudflare yang mengelola semua record DNS domainmu.

### Apa itu CNAME Record?
CNAME (Canonical Name) adalah jenis record DNS yang membuat sebuah domain menunjuk ke domain lain. 

Contoh:  
`www.namakamu.codes` → `CNAME` → `tunnel-id.cfargotunnel.com`

Artinya: "Ketika ada yang mengakses www.namakamu.codes, sebenarnya yang diakses adalah tunnel-id.cfargotunnel.com". Cloudflare kemudian meneruskannya ke tunnel yang terhubung ke PC kamu.

---

## BAGIAN 2 — TANYA JAWAB (Q&A)

**Q: Apakah Cloudflare Tunnel benar-benar gratis?**
A: Ya! Cloudflare Tunnel tersedia di plan **Free**. Kamu bisa membuat tunnel, menghubungkan domain, dan mendapatkan SSL gratis tanpa biaya. Yang berbayar adalah fitur tambahan seperti Access (autentikasi), Load Balancing, dll.

**Q: Apakah website saya aman dari serangan jika menggunakan Cloudflare?**
A: Cloudflare memberikan proteksi dasar dari DDoS dan bot berbahaya secara otomatis di plan free. IP asli server kamu juga tersembunyi di balik IP Cloudflare. Namun keamanan penuh tetap bergantung pada kode website kamu sendiri.

**Q: Apa bedanya cloudflared vs ngrok?**
A: Keduanya adalah tool tunneling, tapi berbeda:
- **ngrok** — URL berubah setiap restart (di free plan), terbatas koneksi, tidak bisa custom domain di free plan
- **cloudflared** — Menggunakan domain kamu sendiri, gratis, tidak ada batas waktu, lebih production-ready

**Q: Apakah server saya harus selalu menyala?**
A: Ya. Website hanya bisa diakses selama:
1. PC kamu menyala
2. Internet tersambung
3. Service `website` dan `cloudflared` berjalan

Jika PC dimatikan, website tidak bisa diakses. Untuk ketersediaan 24/7, gunakan VPS (Virtual Private Server) atau Raspberry Pi yang selalu menyala.

**Q: Berapa lama DNS propagation?**
A: Bervariasi antara beberapa menit hingga 48 jam. Rata-rata 15–30 menit untuk nameserver Cloudflare yang sudah dikenal cepat. Cek status propagasi di **dnschecker.org**.

**Q: Apakah bisa hosting lebih dari satu website dengan satu tunnel?**
A: Ya! Tambahkan lebih banyak hostname di `config.yml`:
```yaml
ingress:
  - hostname: website1.com
    service: http://localhost:8080
  - hostname: website2.com
    service: http://localhost:3000
  - service: http_status:404
```
Asalkan masing-masing service berjalan di port yang berbeda.

**Q: Apakah Python HTTP Server cocok untuk production?**
A: Tidak disarankan untuk production besar karena:
- Tidak bisa menjalankan kode server-side (PHP, Node.js, dll.)
- Performa terbatas untuk traffic tinggi
- Tidak ada fitur keamanan tambahan

Python HTTP Server cocok untuk: demo, portfolio, website statis, praktikum. Untuk production, gunakan Nginx atau Apache.

**Q: Apa itu systemd dan mengapa digunakan?**
A: systemd adalah sistem manajemen service di Linux. Dengan mendaftarkan cloudflared dan web server sebagai systemd service, mereka akan:
- Otomatis jalan saat PC menyala (setelah login)
- Otomatis restart jika crash
- Bisa dikontrol dengan perintah start/stop/status

**Q: Apa itu `loginctl enable-linger`?**
A: Perintah ini membuat user service tetap berjalan bahkan ketika user tidak sedang login ke desktop. Berguna jika PC di-restart dan tidak ada yang login, tapi website tetap harus bisa diakses.

**Q: Bagaimana cara update isi website?**
A: Cukup edit file di `~/Documents/website/`. Karena Python HTTP Server membaca file secara real-time, refresh browser sudah cukup untuk melihat perubahan. Tidak perlu restart server.

---

## BAGIAN 3 — ALUR TROUBLESHOOTING

### Website tidak bisa diakses dari internet
1. Cek apakah localhost:8080 jalan: `curl http://localhost:8080`
2. Cek apakah tunnel jalan: `systemctl --user status cloudflared`
3. Cek apakah DNS sudah propagasi: buka `dnschecker.org` → cek domainmu
4. Cek apakah nameserver sudah benar di name.com

### Muncul "Not Secure" di browser
1. Buka Cloudflare Dashboard → SSL/TLS → Edge Certificates
2. Pastikan "Always Use HTTPS" dalam kondisi **ON**
3. Pastikan mode SSL di **Full** (bukan Flexible atau Off)

### Tunnel disconnect / error
1. Cek koneksi internet
2. `systemctl --user restart cloudflared`
3. Lihat log: `journalctl --user -u cloudflared -n 50`

### Service tidak mau start
1. Cek apakah port 8080 sudah dipakai: `sudo lsof -i :8080`
2. Cek isi config.yml: `cat ~/.cloudflared/config.yml`
3. Pastikan path di service file benar (username, path tunnel, dll.)

---

## BAGIAN 4 — RANGKUMAN ARSITEKTUR

### Komponen Sistem
```
KOMPONEN          LOKASI              FUNGSI
─────────────────────────────────────────────────────
index.html        ~/Documents/website  Konten website
style.css         ~/Documents/website  Tampilan website
script.js         ~/Documents/website  Interaktivitas
Python server     localhost:8080       Melayani file HTML
cloudflared       ~/.cloudflared/      Agen tunnel
config.yml        ~/.cloudflared/      Konfigurasi tunnel
cert.pem          ~/.cloudflared/      Auth ke Cloudflare
TUNNEL-ID.json    ~/.cloudflared/      Credentials tunnel
website.service   ~/.config/systemd/   Auto-start web server
cloudflared.svc   ~/.config/systemd/   Auto-start tunnel
server.sh         ~/Documents/website  Script manajemen
```

### Alur Request dari Pengunjung
```
1. Ketik URL → 2. DNS Lookup → 3. IP Cloudflare
→ 4. Cloudflare CDN → 5. Tunnel → 6. cloudflared
→ 7. localhost:8080 → 8. Baca file HTML → 9. Response
```

### Perintah Penting
```bash
# Jalankan server manual (test)
python3 -m http.server 8080

# Login ke Cloudflare
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create nama-tunnel

# Tambah DNS
cloudflared tunnel route dns nama-tunnel domain.com

# Jalankan tunnel
cloudflared tunnel --config ~/.cloudflared/config.yml run nama-tunnel

# Cek service
systemctl --user status website cloudflared

# Manajemen service
./server.sh
```

---

## BAGIAN 5 — CHECKLIST SETUP

Gunakan checklist ini untuk memastikan semua tahap selesai:

- [ ] File website (HTML, CSS, JS) sudah dibuat
- [ ] Python HTTP Server jalan di port 8080
- [ ] cloudflared terinstall
- [ ] Domain terdaftar di name.com
- [ ] Zone domain dibuat di Cloudflare
- [ ] Nameserver name.com → Cloudflare
- [ ] cloudflared login berhasil (cert.pem ada)
- [ ] Tunnel dibuat
- [ ] config.yml dikonfigurasi
- [ ] DNS CNAME untuk root domain ditambahkan
- [ ] DNS CNAME untuk www ditambahkan
- [ ] Tunnel jalan, 4 koneksi terdaftar
- [ ] Domain bisa diakses via browser
- [ ] "Always Use HTTPS" diaktifkan
- [ ] HTTP otomatis redirect ke HTTPS
- [ ] systemd service website dibuat dan enabled
- [ ] systemd service cloudflared dibuat dan enabled
- [ ] loginctl linger diaktifkan
- [ ] server.sh dibuat dan berfungsi

---

*NotebookLM Guide dibuat: Maret 2026 | RofiqCP IoT Solutions*
