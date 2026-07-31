# Prisma Şema Patch Notları

Bu patch, kaynak projedeki gerçek `backend/prisma/schema.prisma` dosyası üzerine hazırlanmıştır. Bu çalışma sırasında **DATABASE_URL kullanılmadı**, gerçek veritabanına bağlanılmadı, migration oluşturulmadı/çalıştırılmadı ve Prisma Client üretilmiş gibi gösterilmedi.

Uygulanabilir diff dosyası: `backend/prisma/schema.patch.diff`

## Eklenen veya değiştirilen alanlar

### `Training`

- `coverImageUrl String?`

### `TrainingAssignment`

- `status TrainingAssignmentStatus @default(ASSIGNED)`
- `cancelledAt DateTime?`
- `cancellationReason String?`
- Yeni enum değerleri: `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED`

### `TrainingContent`

- `durationSeconds Int?`

Bu alan video izleme oranının backend tarafından doğrulanabilmesi için kullanılır.

### `ExamAttempt`

Model kaynak şemada taslak olarak bulunuyordu. Aşağıdaki çalışma alanları eklendi:

- `expiresAt DateTime?`
- `totalPoints Int?`
- `correctCount Int?`
- `wrongCount Int?`
- `unansweredCount Int?`
- `questionOrder Json?`
- `optionOrder Json?`

### `ExamAnswer`

- `isCorrect Boolean?`: submit öncesinde doğruluk bilinmediği için nullable hale getirildi.
- `answeredAt DateTime?`
- Çoklu seçimler mevcut `ExamAnswerOption` ara modeli üzerinden tutulmaya devam eder.

### `TrainingDocumentType`

Aşağıdaki belge türleri eklendi:

- `TRAINING_COVER`
- `TRAINING_CONTENT`
- `QUESTION_IMAGE`
- `PARTICIPANT_LIST`
- `RESULTS_REPORT`

### `TrainingDocument`

- `employeeId String?`
- `uploadedById String?`
- `checksumSha256 String?`
- Kullanıcı silinince belge kaydını korumak için ilgili ilişkilerde `onDelete: SetNull`

Sistem üretimi boş sınav, sonuç raporu veya katılım formu gibi belgelerin her zaman tek bir çalışana ait olmaması nedeniyle çalışan/yükleyen alanları nullable hazırlanmıştır.

## Cenk Bey'in gerçek ortamda yapması gerekenler

1. Gerçek `schema.prisma` ile `schema.patch.diff` dosyasını karşılaştırın; tablo/kolon isimleri veya kurum tarafında eklenmiş modeller varsa elle birleştirin.
2. Backend bağımlılıklarını temiz kurun. `package.json` içinde Prisma CLI, Client ve PostgreSQL adapter sürümleri `7.8.0` olarak hizalanmıştır.
3. Bu teslimde eski ve uyumsuz backend `package-lock.json` kaldırılmıştır. Gerçek ortamda `npm install` çalıştırılarak yeni lock dosyası üretilmelidir.
4. Doğru `DATABASE_URL` tanımlandıktan sonra `npm run prisma:generate` çalıştırın.
5. Migration'ı önce geliştirme/staging veritabanında oluşturup SQL'i inceleyin. Özellikle mevcut assignment durumları, nullable kullanıcı ilişkileri ve mevcut `ExamAnswer.isCorrect` verileri kontrol edilmelidir.
6. Onaylanan migration'ı kurumun normal deployment süreciyle uygulayın.

Örnek komutlar yalnızca gerçek geliştirme ortamında ve doğru veritabanı erişimiyle çalıştırılmalıdır:

```bash
cd backend
npm install
npm run prisma:generate
npx prisma migrate dev --name artemis_exam_attempt_documents
```

Production veritabanında migration komutu kurumun mevcut Prisma/deployment politikasına göre seçilmelidir; bu teslimde hiçbir migration komutu çalıştırılmamıştır.
