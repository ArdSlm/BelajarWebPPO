# MATERI TEORI
## Deploy Website Lokal ke Internet via Cloudflare Tunnel & name.com

---

## 1. KONSEP DASAR DNS (Domain Name System)

### 1.1 Apa itu DNS?
**DNS (Domain Name System)** adalah sistem yang menerjemahkan nama domain yang mudah diingat manusia (seperti `google.com`) menjadi alamat IP yang dimengerti komputer (seperti `172.217.14.206`).

Analogi: DNS seperti **buku telepon** — kamu tidak perlu hafal nomor telepon, cukup cari nama orangnya.

### 1.2 Hierarki DNS
```
.                          ← Root DNS
└── com / codes / site     ← Top-Level Domain (TLD)
    └── namakamu            ← Second-Level Domain (SLD)
        └── www             ← Subdomain
```

### 1.3 Jenis Record DNS
| Record | Fungsi | Contoh |
|--------|--------|--------|
| **A** | Domain → IPv4 | `namakamu.com → 192.168.1.1` |
| **AAAA** | Domain → IPv6 | `namakamu.com → 2001:db8::1` |
| **CNAME** | Domain → Domain lain | `www → namakamu.com` |
| **MX** | Mail server | `mail.namakamu.com` |
| **NS** | Nameserver domain | `ignat.ns.cloudflare.com` |
| **TXT** | Data teks (verifikasi, SPF) | `v=spf1 include:...` |

### 1.4 Nameserver
**Nameserver** adalah server yang menyimpan dan melayani data DNS untuk sebuah domain. Ketika Anda mendaftarkan domain di name.com, by default nameserver-nya milik name.com. Dengan mengubah nameserver ke Cloudflare, semua pengelolaan DNS domain Anda dilakukan oleh Cloudflare.

**Alur perubahan nameserver:**
```
User browser → Root DNS → "namakamu.codes punya NS Cloudflare"
    → Cloudflare NS → "CNAME ke tunnel Cloudflare"
    → Cloudflare tunnel → localhost:8080
```

### 1.5 DNS Propagation
Setelah nameserver diubah, perubahan tidak langsung berlaku di seluruh dunia karena:
- DNS resolver di seluruh dunia meng-cache data lama
- TTL (Time-To-Live) menentukan berapa lama cache disimpan
- Propagasi penuh: 5 menit – 48 jam

---

## 2. HTTP vs HTTPS

### 2.1 HTTP (HyperText Transfer Protocol)
- Protokol komunikasi antara browser dan server web
- Data dikirim dalam **plaintext** (teks biasa)
- Port default: **80**
- ❌ Tidak aman — data bisa dibaca jika disadap

### 2.2 HTTPS (HTTP Secure)
- HTTP + **SSL/TLS enkripsi**
- Data dikirim dalam bentuk **terenkripsi**
- Port default: **443**
- ✅ Aman — data tidak bisa dibaca pihak ketiga

### 2.3 SSL/TLS
**SSL (Secure Sockets Layer)** / **TLS (Transport Layer Security)** adalah protokol enkripsi yang mengamankan komunikasi di internet.

Proses koneksi HTTPS (TLS Handshake):
```
Browser                           Server
  │                                 │
  │── ClientHello (versi, cipher) ──▶│
  │◀──ServerHello + Sertifikat ─────│
  │── Verifikasi sertifikat          │
  │── PreMasterSecret (encrypted) ──▶│
  │◀──────── Encrypted Data ────────│
  │─────────  Encrypted Data  ──────▶│
```

### 2.4 Mode SSL di Cloudflare
| Mode | Deskripsi | Kapan digunakan |
|------|-----------|-----------------|
| **Off** | Tidak ada SSL | ❌ Tidak disarankan |
| **Flexible** | Browser↔Cloudflare: HTTPS; Cloudflare↔Origin: HTTP | Server asal tidak punya SSL |
| **Full** | Semua koneksi HTTPS | ✅ Direkomendasikan |
| **Full (Strict)** | Semua HTTPS + sertifikat valid | Server punya sertifikat resmi |

> Untuk Cloudflare Tunnel, gunakan mode **Full**.

---

## 3. WEB SERVER

### 3.1 Fungsi Web Server
Web server adalah software yang menerima permintaan HTTP dari browser dan membalas dengan konten (HTML, CSS, JS, gambar, dll.).

**Alur sederhana:**
```
Browser → HTTP Request → Web Server → HTTP Response → Browser
GET /index.html HTTP/1.1              200 OK + <html>...
```

### 3.2 Python HTTP Server
Python 3 punya built-in HTTP server yang bisa dijalankan langsung:
```bash
python3 -m http.server 8080
```
- Melayani file statik dari direktori saat ini
- Cocok untuk **development** dan **demo**
- Bukan untuk production skala besar

### 3.3 Port
- **Port** adalah angka 0–65535 yang mengidentifikasi proses/layanan di komputer
- Port 8080 adalah port alternatif untuk HTTP (tidak perlu sudo)
- Port 80 dan 443 membutuhkan hak akses root

---

## 4. CLOUDFLARE

### 4.1 Apa itu Cloudflare?
**Cloudflare** adalah perusahaan infrastruktur internet yang menyediakan layanan:
- **CDN** (Content Delivery Network) — distribusi konten global
- **DNS** — nameserver cepat dan andal
- **DDoS Protection** — perlindungan dari serangan
- **SSL/TLS** — sertifikat HTTPS gratis
- **Cloudflare Tunnel** — koneksi aman dari lokal ke internet

### 4.2 Cara Kerja Cloudflare (Proxy)
```
Pengunjung → Cloudflare Edge (terdekat) → Origin Server
                    ↑
           - SSL termination
           - Cache
           - Firewall
           - DDoS mitigation
```

Cloudflare bertindak sebagai **reverse proxy** antara pengunjung dan server Anda. Cloudflare menyembunyikan IP asli server Anda.

### 4.3 Cloudflare DNS
Cloudflare menyediakan DNS publik tercepat: **1.1.1.1** (resolusi DNS gratis). Ketika domain Anda menggunakan Cloudflare nameserver, semua record DNS dikelola di Cloudflare Dashboard.

---

## 5. CLOUDFLARE TUNNEL

### 5.1 Masalah yang Diselesaikan
Masalah klasik: "Saya punya server lokal di rumah, bagaimana membuatnya bisa diakses dari internet?"

**Solusi lama:**
- Port forwarding di router ❌ (butuh akses router, IP publik berubah-ubah)
- Reverse SSH tunnel ❌ (kompleks, butuh VPS)
- ngrok ❌ (URL berubah, terbatas di free tier)

**Solusi modern: Cloudflare Tunnel** ✅

### 5.2 Cara Kerja Cloudflare Tunnel
```
  Server Lokal                              Cloudflare Network
┌──────────────────┐                      ┌─────────────────────┐
│                  │  Outbound connection  │                     │
│  cloudflared     │ ────────────────────▶│  Cloudflare Edge    │
│  (agent)         │  QUIC/HTTP2          │                     │
│                  │◀────────────────────│  (4 connections)    │
│  localhost:8080  │                      │                     │
└──────────────────┘                      └────────┬────────────┘
                                                   │
                                            Internet Pengunjung
```

**Keunggulan:**
- ✅ Tidak perlu port forwarding
- ✅ IP lokal tidak terekspos
- ✅ SSL/TLS otomatis
- ✅ Gratis
- ✅ Koneksi outbound (tidak ada inbound firewall issue)

### 5.3 Protokol yang Digunakan
- **QUIC** (Quick UDP Internet Connections) — protokol transport modern oleh Google
- Lebih cepat dari TCP untuk koneksi berlatency tinggi
- Fallback ke HTTP/2 jika QUIC tidak tersedia

### 5.4 Komponen Cloudflare Tunnel
| Komponen | Deskripsi |
|----------|-----------|
| `cloudflared` | Daemon/agent yang berjalan di PC lokal |
| `cert.pem` | Sertifikat autentikasi untuk akun Cloudflare |
| `TUNNEL-ID.json` | Credentials spesifik untuk tunnel tertentu |
| `config.yml` | Konfigurasi ingress rules (domain → service) |
| Tunnel ID | UUID unik untuk setiap tunnel |

### 5.5 Ingress Rules
File `config.yml` mendefinisikan **ingress rules**: request dari domain mana diteruskan ke service mana.

```yaml
ingress:
  - hostname: namakamu.codes       # Jika request ke namakamu.codes
    service: http://localhost:8080  # Teruskan ke localhost:8080
  - hostname: www.namakamu.codes   # Jika request ke www.
    service: http://localhost:8080  # Teruskan ke localhost:8080
  - service: http_status:404       # Default: return 404
```

---

## 6. SYSTEMD SERVICE

### 6.1 Apa itu systemd?
**systemd** adalah sistem init dan service manager untuk Linux. Ia bertanggung jawab menjalankan dan mengelola proses (service) saat sistem boot.

### 6.2 User Service vs System Service
| | User Service | System Service |
|--|--------------|----------------|
| Lokasi | `~/.config/systemd/user/` | `/etc/systemd/system/` |
| Hak akses | Tanpa sudo | Butuh sudo |
| Kapan jalan | Saat user login | Saat sistem boot |
| Dengan linger | Saat sistem boot (tanpa login) | Selalu |

### 6.3 Struktur File Service
```ini
[Unit]
Description=Nama deskriptif service
After=network.target          # Tunggu network siap

[Service]
Type=simple                   # Tipe proses
ExecStart=/path/to/command    # Perintah untuk start
Restart=on-failure            # Auto-restart jika crash
RestartSec=5                  # Tunggu 5 detik sebelum restart

[Install]
WantedBy=default.target       # Target (kapan diaktifkan)
```

### 6.4 Perintah systemd
```bash
# Start/Stop/Restart
systemctl --user start nama-service
systemctl --user stop nama-service
systemctl --user restart nama-service

# Enable/Disable (auto-start)
systemctl --user enable nama-service
systemctl --user disable nama-service

# Cek status
systemctl --user status nama-service

# Lihat log
journalctl --user -u nama-service -f     # real-time
journalctl --user -u nama-service -n 50  # 50 baris terakhir
```

### 6.5 loginctl linger
Secara default, user service hanya berjalan saat user login. Dengan `loginctl enable-linger`, service tetap berjalan meskipun tidak ada yang login:

```bash
loginctl enable-linger $USER
# Service berjalan saat boot,
# bahkan tanpa perlu login ke desktop
```

---

## 7. DOMAIN DAN REGISTRAR

### 7.1 Domain Registrar
**Domain registrar** adalah perusahaan yang menjual nama domain. Beberapa registrar populer:
- **name.com** — antarmuka yang bersih, harga kompetitif
- **Namecheap** — murah, banyak promo
- **GoDaddy** — populer di AS
- **Google Domains** (sekarang Squarespace) 
- **Cloudflare Registrar** — at-cost (tanpa markup)

### 7.2 Ekstensi Domain (TLD)
| TLD | Kegunaan | Harga approx |
|-----|----------|--------------|
| .com | Umum, bisnis | $10–15/tahun |
| .id | Indonesia | $25–40/tahun |
| .codes | Dev/tech | $30–50/tahun |
| .site | Umum | $2–5/tahun |
| .online | Umum | $2–5/tahun |
| .tech | Teknologi | $10–50/tahun |

### 7.3 Siklus Hidup Domain
```
Registrasi → Aktif → Expired (grace period) → Deleted → Tersedia lagi
   0 hari    1 tahun   +30-45 hari              +30 hari
```

---

## 8. RINGKASAN ALUR SISTEM

```
1. USER mengetik https://namakamu.codes di browser
         │
2. Browser → DNS Query ke 1.1.1.1 (atau DNS resolver)
         │
3. DNS Query → Root DNS → TLD DNS → Cloudflare NS
         │
4. Cloudflare NS → CNAME → TUNNEL-ID.cfargotunnel.com
         │
5. Traffic → Cloudflare Edge terdekat (misal Singapore)
         │
6. Cloudflare → Cloudflare Tunnel → cloudflared agent di PC
         │
7. cloudflared → http://localhost:8080 (Python HTTP Server)
         │
8. Python HTTP Server → baca file ~/Documents/website/index.html
         │
9. Response → kembali ke browser pengunjung
         │
10. Browser menampilkan halaman website ✅
```

---

## REFERENSI

1. Cloudflare Tunnel Documentation: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
2. Mozilla MDN - HTTP: https://developer.mozilla.org/en-US/docs/Web/HTTP
3. Python http.server: https://docs.python.org/3/library/http.server.html
4. systemd User Services: https://wiki.archlinux.org/title/Systemd/User
5. DNS explained: https://www.cloudflare.com/learning/dns/what-is-dns/

---

*Materi dibuat: Maret 2026 | RofiqCP IoT Solutions*
