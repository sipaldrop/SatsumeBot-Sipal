# SIPAL SATSUME V1.0

> Satsume Genesis Airdrop Automation Bot by **Sipal Airdrop Community**

## Features

- **Auto Login** — Cukup masukkan private key, bot auto-generate token
- **Daily Check-in** — Otomatis check-in harian untuk poin
- **NUSD Faucet** — Klaim 1,000,000 NUSD per hari (on-chain Sepolia)
- **Auto Purchase** — Beli produk termurah yang tersedia secara otomatis
- **Auto Review** — Review otomatis bintang 5 setelah pembelian
- **Multi Account** — Support banyak akun sekaligus
- **Proxy Support** — HTTP/SOCKS5 proxy per akun
- **Dashboard UI** — Tampilan realtime dengan tabel status & log
- **Smart Retry** — Retry otomatis jika gagal
- **Anti-Detection** — Fingerprint unik per wallet
- **Auto Loop** — Otomatis ulang setiap hari (00:00 UTC)

## Requirements

- **Node.js** v18+
- **Sepolia ETH** (untuk gas fee faucet & purchase)

## Installation

```bash
git clone https://github.com/sipaldrop/SatsumeBot-Sipal.git
cd SatsumeBot-Sipal
npm install
```

## Configuration

1. Copy template akun:
```bash
cp accounts_tmp.json accounts.json
```

2. Edit `accounts.json` dengan data kamu:
```json
[
    {
        "name": "Account1",
        "privateKey": "YOUR_PRIVATE_KEY_HERE",
        "proxy": ""
    }
]
```

| Field | Keterangan |
|---|---|
| `name` | Nama akun (opsional, untuk label di dashboard) |
| `privateKey` | Private key wallet EVM (tanpa/dengan prefix 0x) |
| `proxy` | Opsional. Format: `http://user:pass@host:port` atau `socks5://host:port` |

> **Note:** Cukup private key saja, bot akan auto-login dan auto-generate token.

## Usage

```bash
npm start
```

atau

```bash
node index.js
```

## Dashboard

Bot menampilkan dashboard realtime dengan tabel status per akun:

```
    ======SIPAL AIRDROP======
  =====SIPAL SATSUME V1.0=====

┌────────────┬──────────┬────────────┬──────────┬──────────┬──────────┬──────────┐
│ Account    │ Status   │ Next Run   │ Checkin  │ Faucet   │ Purchase │ Review   │
├────────────┼──────────┼────────────┼──────────┼──────────┼──────────┼──────────┤
│ Account 1  │ SUCCESS  │ 4h 22m 9s  │ ALREADY  │ ALREADY  │ SUCCESS  │ SUCCESS  │
└────────────┴──────────┴────────────┴──────────┴──────────┴──────────┴──────────┘

 EXECUTION LOGS:
[02:42] ✅ [Account 1]   Login (fresh) - ID: xxxxx
[02:42] ⚠️  [Account 1]   Check-in: Already done today
[02:42] ⚠️  [Account 1]   Faucet: Already claimed today
[02:42] ✅ [Account 1]   Purchase: Bought "LUFFY ONO" for 100,000 NUSD
[02:42] ✅ [Account 1]   Review: Reviewed 1 order(s)
```

## Task Schedule

| Task | Reward | Frequency |
|---|---|---|
| Check-in | +50 Neurobits | Daily |
| NUSD Faucet | 1,000,000 NUSD | Daily |
| Purchase | +200 Neurobits | Daily |
| Review | +200 Neurobits | Per purchase |

Bot otomatis loop dan menunggu reset harian (00:00 UTC).

## Security

- Private key HANYA disimpan di `accounts.json` (sudah di `.gitignore`)
- Token di-generate otomatis dan disimpan di `tokens.json` (sudah di `.gitignore`)
- TIDAK ADA credential yang hardcoded di source code
- Setiap wallet mendapat fingerprint unik yang persistent

## Disclaimer

Bot ini untuk keperluan edukasi dan otomasi testnet. Gunakan dengan bijak dan tanggung jawab sendiri.

## Community

**Sipal Airdrop** — Join komunitas untuk update dan support terbaru.

## License

MIT License — Lihat file [LICENSE](LICENSE)
