# Veritabanı Entegrasyon Notu

Bu paket herhangi bir gerçek veritabanına bağlanmamıştır. PostgreSQL/Prisma bağlantısı kurum ortamında yapılacaktır.

## Gerekli adımlar

1. `backend/.env.example` dosyasını `backend/.env` olarak kopyalayın.
2. Kurum PostgreSQL bağlantısını `DATABASE_URL` alanına yazın.
3. Mevcut kurum kullanıcı tablosunun alanlarını `backend/prisma/schema.prisma` içindeki `User` modeliyle doğrulayın.
4. Bağımlılıkları kurun ve Prisma Client üretin:

```bash
npm run setup
npm run prisma:generate
```

5. Yeni ve boş bir veritabanında geliştirme migration'ı oluşturmak için:

```bash
npm run prisma:migrate:dev -- --name training_exam_module
```

Mevcut kurum veritabanında migration uygulanmadan önce BT ekibi tarafından SQL çıktısı ve tablo eşleşmeleri incelenmelidir. Onaylanan migration production ortamında şu komutla uygulanır:

```bash
npm run prisma:migrate:deploy
```

Geçici entegrasyon/staging ortamında migration geçmişi kullanılmayacaksa `npm run prisma:db:push` kullanılabilir; production için migration tercih edilmelidir.

## Frontend bağlantısı

`frontend/.env` içinde:

```env
VITE_API_BASE_URL=https://kurum-api-adresi/api
```

Kullanıcı kimliği kurumun mevcut kimlik doğrulama/gateway katmanından backend'e aktarılmalıdır. Demo kullanıcı seçimi, localStorage veritabanı veya sahte veri katmanı bu pakette bulunmaz.
