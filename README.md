# Artemis Eğitim ve Sınav Yönetim Modülü

Artemis çalışanlarının eğitim, sınav, katılımcı, sertifika ve belge süreçlerini tek modül üzerinden yönetmek amacıyla geliştirilmiş full-stack uygulamadır.

Modül iki ayrı uygulamadan oluşur:

- **Frontend:** React, TypeScript, Vite ve Tailwind CSS
- **Backend:** Node.js, Express, TypeScript, Prisma ve PostgreSQL

## Modülün Kapsamı

- Eğitim oluşturma, taslak kaydetme, yayınlama ve aktif/pasif yönetimi
- Video, PDF, kapak ve soru görseli yükleme
- Zorunlu içerik ilerlemesi ve sınav kilidi
- Tek ve çok seçimli sınav soruları
- Attempt süresi, deneme limiti ve tekrar giriş kuralları
- Puanın yalnızca backend tarafından hesaplanması
- Katılımcıları checkbox ile eğitime ekleme ve çıkarma
- Eğitim bazlı katılımcı dosyaları
- İmzalı sınav ve OSGB sertifikası yükleme/indirme
- Eğitime ait tek ortak imzalı katılım formu
- Sınav, cevap, katılım, katılımcı listesi ve sonuç PDF çıktıları
- Katılımcı listesi Excel çıktısı
- Korumalı belge görüntüleme ve indirme

## Katılımcı ve Belge Yapısı

Her eğitim kendi katılımcı ve belgelerine sahiptir. İSG ve Yangın Eğitimi gibi farklı eğitimlerin kayıtları aynı listede karışmaz.

### Eğitim seviyesinde ortak belgeler

- Katılım formu
- İmzalı katılım formu
- Katılımcı listesi PDF/Excel
- Sonuç raporu
- Boş sınav PDF'i

Bu belgeler yalnızca ilgili `trainingId` ile ilişkilendirilir.

### Katılımcıya özel belgeler

- Sınav sonucu ve cevapları
- Katılımcı cevap PDF'i
- İmzalı sınav kâğıdı
- OSGB sertifikası
- Diğer kişisel eğitim belgeleri

Bu kayıtlar çalışan, eğitim, atama ve gerektiğinde sınav denemesiyle ilişkilendirilir.

## Proje Yapısı

```text
artemis-project/
├── backend/
│   ├── prisma/
│   ├── scripts/
│   ├── src/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   ├── .env.example
│   ├── package-lock.json
│   └── package.json
├── .gitignore
├── IMPLEMENTATION_REPORT.md
├── README.md
└── package.json
```

## Yerel Kurulum

### 1. Bağımlılıklar

Kök klasörde:

```bash
npm run setup
```

Aynı işlem ayrı ayrı da çalıştırılabilir:

```bash
cd backend
npm install

cd ../frontend
npm ci
```

Backend kaynak tesliminde güncel bir lock dosyası bulunmadığı için backend tarafında ilk temiz kurulumda `npm install` kullanılmalıdır. Frontend tarafında mevcut lock dosyası nedeniyle `npm ci` kullanılabilir.

### 2. Ortam dosyaları

Örnek dosyaları kopyalayın:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Gerçek `.env` dosyaları GitHub'a gönderilmemelidir.

### 3. Uygulamaları çalıştırma

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev:frontend
```

Varsayılan adresler:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- API: `http://localhost:3001/api`

## Veritabanı Entegrasyonu

Bu repository gerçek `DATABASE_URL` içermeden teslim edilir. Gerçek veritabanına erişim olmadığı için migration çalıştırılmamıştır.

Prisma hazırlıkları:

```text
backend/prisma/schema.prisma
backend/prisma/schema.patch.diff
backend/prisma/SCHEMA_PATCH_NOTES.md
```

Gerçek ortamda yapılacaklar:

1. Mevcut şirket tablolarını ve kolonlarını Prisma modelleriyle eşleştirmek
2. Özellikle mevcut kullanıcı, eğitim, soru ve seçenek tablolarının gerçek adlarını doğrulamak
3. `DATABASE_URL` tanımlamak
4. Prisma Client üretmek
5. Migration SQL'ini staging ortamında inceleyip uygulamak
6. Gerçek verilerle uçtan uca test yapmak

Prisma Client üretimi:

```bash
npm run prisma:generate
```

DB tanımlı olmadığında health endpoint'i çalışır; DB gerektiren işlemler sahte başarı yerine kontrollü `503` yanıtı verir.

## Kullanıcı Kimliği Entegrasyonu

Ad ve soyad eşsiz kabul edilmez. Kurum sistemindeki **eşsiz e-posta adresi**, kullanıcıyı bulmak için kullanılmalıdır:

```text
kurumsal oturumdaki email
→ mevcut çalışan tablosunda email ile eşleştirme
→ sabit kullanıcı ID'sini alma
→ eğitim, attempt ve belge ilişkilerini kullanıcı ID'siyle yürütme
```

Mevcut `VITE_CURRENT_USER_ID` ve `VITE_CURRENT_ADMIN_ID` alanları yalnızca yerel geliştirme ve entegrasyon içindir. Production ortamında kurumun gerçek session, SSO, JWT veya gateway yapısı bağlanmalıdır.

## PDF Şablonları

Resmî PDF şablonları şu dizindedir:

```text
backend/src/pdf/templates/
```

Backend build sırasında şablonlar doğrulanarak `dist/pdf/templates` dizinine kopyalanır. Mevcut resmî görsel düzen korunmuştur.

## Kullanışlı Komutlar

```bash
npm run setup
npm run dev:backend
npm run dev:frontend
npm run build:backend
npm run build:frontend
npm run build
npm run lint
npm run prisma:generate
```

## Repository Güvenliği

Aşağıdaki dosya ve klasörler `.gitignore` kapsamındadır:

- `.env` ve `.env.local`
- `node_modules`
- `dist` ve diğer build çıktıları
- Prisma generated client
- Runtime belge storage alanı
- Yüklenen gerçek kullanıcı belgeleri
- Log ve geçici dosyalar

Şirket kodu ve belge akışları içerdiği için repository'nin **private** olarak yayınlanması önerilir.

## Ayrıntılı Teknik Rapor

Modülün mimarisi, iş kuralları, veri modeli, endpoint akışları, güvenlik kontrolleri ve gerçek ortam entegrasyon sınırları için:

```text
IMPLEMENTATION_REPORT.md
```
