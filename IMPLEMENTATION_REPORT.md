# Artemis Eğitim ve Sınav Yönetim Modülü — Teknik Uygulama Raporu

## 1. Projenin Amacı

Artemis Eğitim ve Sınav Yönetim Modülü; çalışanlara eğitim atamak, eğitim içeriklerini takip etmek, sınav uygulamak, sonuçları değerlendirmek ve eğitimle ilişkili ortak veya kişisel belgeleri güvenli biçimde yönetmek amacıyla geliştirilmiştir.

Modül, çalışan ve yönetici işlemlerini aynı veri modeli üzerinde birleştirir. Eğitim, katılımcı, sınav denemesi, cevap ve belge kayıtları birbirleriyle ilişkili şekilde tutulur.

## 2. Teknik Mimari

### Frontend

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Lucide React

Frontend; çalışan dashboard'u, eğitim içeriği, sınav, sonuç ekranı ve yönetici eğitim/katılımcı/belge sayfalarını içerir.

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- `pdf-lib`

Backend katmanları:

```text
Route → Controller → Service → Prisma
```

Dosya yükleme, belge erişimi, sınav işlemleri ve PDF üretimleri backend üzerinden yürütülür.

## 3. Eğitim Yönetimi

Bir eğitim aşağıdaki özellikleri destekler:

- Başlık, açıklama ve kategori
- Eğitim türü ve formatı
- Tarih, saat, süre ve konum
- Taslak veya yayınlanmış durum
- Aktif/pasif durum
- Eğitim içeriği zorunluluğu
- Sınav kullanımı
- Başarı puanı
- Deneme limiti
- Sınav süresi
- Soru ve seçenek karıştırma
- Katılım formu
- Sertifika/OSGB süreci
- Kapak görseli

Yeni eğitim önce taslak olarak oluşturulur. İlişkili dosyalar ve sorular gerçek eğitim kimliğine bağlandıktan sonra yayın koşulları backend tarafından tekrar kontrol edilir.

Başlanmış eğitimlerin zorunlu içerik yapısının değiştirilmesi ve aktif/tamamlanmış attempt bulunan sınavların soru bütünlüğünün bozulması engellenir.

## 4. Eğitim İçeriği ve İlerleme

Desteklenen içerik türleri:

- Video
- PDF
- Görsel
- Harici bağlantı

Her içerik için sıralama ve zorunluluk bilgisi bulunur. Çalışanın ilerlemesi assignment ve içerik bazında takip edilir.

İlerleme sistemi:

- İçeriğin açılma zamanını kaydeder.
- Video kaldığı konumu saklar.
- Gerçek izlenme süresini takip eder.
- İleri sarma ve sahte izlenme artışlarını sınırlar.
- Zorunlu içerikler tamamlanmadan sınav başlangıcına izin vermez.
- İçerik gerçekten açılamadıysa tamamlanma sayacı başlatmaz.

## 5. Katılımcı Yönetimi

### Katılımcıları Yönet

Yöneticiler seçili eğitimin katılımcılarını checkbox listesi üzerinden yönetir.

- Seçilen çalışan eğitime eklenir.
- Seçimi kaldırılan çalışan eğitimden çıkarılır.
- Yeni katılımcılara son tarih atanabilir.
- Aynı çalışan aynı eğitime iki kez eklenemez.
- Geçmişi olmayan kayıt güvenli biçimde kaldırılabilir.
- Sınav, ilerleme veya belge geçmişi olan kayıt fiziksel olarak silinmez; `CANCELLED` durumuna alınır.
- İptal edilen katılımcı geçmişi korunarak tekrar etkinleştirilebilir.

### Aktif ve Arşivlenmiş Katılımcılar

Aktif katılımcılar ana listede gösterilir. Eğitimden çıkarılmış ancak denetim izi bulunan kişiler ayrı, kapalı bir arşiv bölümünde tutulur.

## 6. Eğitim Bazlı Kişisel Dosya

Katılımcıya tıklandığında yalnızca seçili çalışan ve seçili eğitime ait kayıtlar açılır.

Örnek:

```text
Çalışan A + İSG Eğitimi
```

bu ekranda aynı çalışanın Yangın Eğitimi belgeleri gösterilmez.

Kişisel eğitim dosyasında:

- Assignment bilgisi
- Sınav denemeleri
- Puan ve başarı durumu
- Doğru, yanlış ve boş sayıları
- Soru bazında verilen cevaplar
- Katılımcı cevap PDF'i
- İmzalı sınav kâğıdı
- OSGB sertifikası
- Diğer kişiye özel belgeler

bulunur.

## 7. Ortak Eğitim Belgeleri

Katılım formu bir çalışana ait değildir. Aynı eğitim oturumundaki bütün katılımcıların imzaladığı tek ortak belgedir.

Bu nedenle:

```text
SIGNED_ATTENDANCE_FORM → yalnızca trainingId
```

ile ilişkilendirilir.

Ortak belge alanında:

- Boş katılım formu oluşturma
- Katılım formunu görüntüleme ve indirme
- İmzalı katılım formunu yükleme
- İmzalı formu görüntüleme ve indirme

işlemleri bulunur.

İmzalı katılım formu çalışan, assignment veya attempt kaydına bağlanamaz ve her çalışan için tekrar yüklenmez. Eski sürümler denetim izi amacıyla veri katmanında korunabilir; arayüz güncel sürümü gösterir.

## 8. Sınav ve Attempt Motoru

### Attempt Başlangıcı

Backend aşağıdaki kontrolleri yapar:

- Kullanıcının geçerli assignment kaydı var mı?
- Atama iptal edilmiş veya süresi geçmiş mi?
- Eğitim yayınlanmış ve aktif mi?
- Eğitimde sınav açık mı?
- Geçerli soru bulunuyor mu?
- Zorunlu eğitim içerikleri tamamlandı mı?
- Kullanıcı daha önce başarılı olmuş mu?
- Deneme limiti dolmuş mu?
- Devam eden geçerli attempt var mı?

Devam eden attempt varsa yeni kayıt oluşturmak yerine aynı attempt döndürülür.

### Sınav Süresi

- Backend `expiresAt` üretir.
- Frontend sayaç değeri gerçek `expiresAt` üzerinden hesaplanır.
- Sekmenin arka planda yavaşlaması kullanıcıya fazladan süre kazandırmaz.
- Süre sonunda güvenli submit penceresi uygulanır.
- Geç kalan istekte yalnızca backend'e önceden kaydedilmiş cevaplar değerlendirilir.

### Resimli Şıklar

- Bir şık yalnızca metin, yalnızca görsel veya metin + görsel içerebilir.
- Metin ve görselin ikisi birden boş bırakılamaz.
- Şık görselleri PNG veya JPEG olarak korumalı belge storage alanına yüklenir.
- Görsel, ilgili eğitim + soru + şık kaydıyla doğrulanarak `OPTION_IMAGE` belge türüyle saklanır.
- Çalışan sınav ekranında görsel şıklar radio/checkbox kartının içinde seçilebilir biçimde gösterilir.
- Doğru şık bilgisi attempt sırasında frontend'e gönderilmez.
- Resimli şıklar boş sınav ve katılımcı cevap PDF'lerinde de gösterilir.
- Başlamış bir sınavın şık metni veya görseli değiştirilemez.

### Cevap Kaydı

- Her soru attempt içinde tek cevap kaydına sahiptir.
- Tek seçimli ve çok seçimli cevaplar doğrulanır.
- Başka soruya ait seçenek gönderilemez.
- Aynı seçenek tekrar gönderilemez.
- Tamamlanmış attempt cevapları çalışan tarafından değiştirilemez. Yönetici düzeltmeleri yalnızca zorunlu gerekçe ve audit kaydıyla yapılabilir.

### Submit ve Puanlama

Frontend'den `score`, `passed` veya doğru cevap bilgisi kabul edilmez.

Backend:

- Seçilen seçenekleri doğru seçeneklerle karşılaştırır.
- Çok seçimli sorularda tam seçenek kümesini değerlendirir.
- Soru puanlarını hesaplar.
- Toplam puanı üretir.
- Doğru, yanlış ve boş sayıları belirler.
- Başarılı/başarısız durumunu kaydeder.
- Assignment durumunu günceller.

Eşzamanlı çift submit işlemleri transaction ve durum kontrolleriyle engellenir.


### Yönetici Sonuç Düzeltme ve Audit Akışı

Katılımcılar sayfasında, tamamlanmış sınavı bulunan kişinin satırında **Sonuç Düzelt** işlemi bulunur.

- Yalnızca admin/İK rolü kullanabilir.
- Devam eden attempt düzenlenemez.
- Yönetici, öğrencinin seçili cevaplarını değiştirir; doğru cevaplar yalnızca admin ekranında referans olarak gösterilir.
- En az 10 karakterlik düzeltme gerekçesi zorunludur.
- Puan, doğru/yanlış/boş sayıları ve başarı durumu backend tarafından yeniden hesaplanır.
- Yeni attempt oluşturulmaz; öğrencinin aynı attempt'i güncel, düzeltilmiş sonucu temsil eder.
- Düzeltme öncesi cevaplar ve sonuç metrikleri silinmez; `ExamResultAudit` kaydında JSON snapshot olarak korunur.
- Audit kaydı; düzenleyen kullanıcıyı, tarihi, gerekçeyi ve eski/yeni puan-durum özetini içerir.
- Assignment durumu yeni sonuca göre yeniden hesaplanır.
- Güncelliğini yitiren sistem üretimi cevap PDF'i ve sonuç raporu kayıtları kaldırılır; tekrar üretildiklerinde düzeltilmiş sonucu kullanırlar.
- Düzeltme sonucunda sertifika uygunluğu kaybolursa çalışanın sonuç ekranında eski sertifika bağlantısı gösterilmez; belge admin arşivinde denetim kaydı olarak kalır.

### Sonuç Sonrası

Tamamlanmış sınav eski cevapları düzenlemek için yeniden açılamaz. Başarısız olan ve deneme hakkı kalan kullanıcı yeni bir attempt başlatır. Başarılı kullanıcı tekrar sınava giremez.

## 9. Belge Yönetimi

### Belge Türleri

- Boş sınav
- Katılımcı cevap PDF'i
- İmzalı sınav
- Katılım formu
- İmzalı katılım formu
- OSGB sertifikası
- Eğitim kapağı
- Eğitim içeriği
- Soru görseli
- Katılımcı listesi
- Sonuç raporu
- Diğer belgeler

### Güvenlik Kontrolleri

- İzin verilen MIME türleri
- Magic-byte doğrulaması
- Dosya boyutu sınırı
- Güvenli ve rastgele depolama adı
- SHA-256 checksum
- Eğitim, çalışan, assignment ve attempt ilişki doğrulaması
- Yetki ve sahiplik kontrolü
- Hassas belgelerde `private, no-store` cache politikası

Belgeler public frontend klasöründe tutulmaz. Korumalı preview ve download endpoint'leri kullanılır.

### OSGB Sertifikası

OSGB sertifikası:

- Yalnızca PDF olarak yüklenir.
- Sertifika özelliği açık eğitime bağlanır.
- Doğru çalışan ve assignment ile ilişkilendirilir.
- Gerekli minimum puanı karşılayan başarılı attempt ile doğrulanır.

## 10. PDF ve Dışa Aktarma

Desteklenen çıktılar:

- Boş sınav PDF'i
- Katılımcı cevap PDF'i
- Katılım formu
- Katılımcı listesi PDF'i
- Katılımcı listesi Excel çıktısı
- Sonuçlar PDF'i

Resmî PDF şablonlarının görsel düzeni korunur.

Ek davranışlar:

- Üretilen PDF için `TrainingDocument` kaydı oluşturulur.
- Soru görselleri güvenli storage üzerinden çözülür.
- Çoklu cevaplar PDF'te eksiksiz gösterilir.
- Metinli, görselli ve metin + görsel şıklar PDF çıktılarında ölçeklenerek gösterilir.
- Katılım formu satır kapasitesi aşılırsa aynı şablonla yeni sayfa oluşturulur.
- İptal edilmiş atamalar yeni katılım formu ve katılımcı çıktılarında gösterilmez.
- Build sırasında şablonlar `dist/pdf/templates` dizinine kopyalanır.

## 11. Frontend–Backend Bağlantıları

Frontend'deki eğitim, katılımcı, attempt, cevap, sonuç ve belge ekranları backend API'lerinden veri alır. Sabit çalışan/eğitim/sonuç mock listeleri ana uygulama akışında kullanılmaz.

Başlıca API grupları:

- `/api/users`
- `/api/trainings`
- `/api/assignments`
- `/api/exam-attempts`
- `/api/exam-answers`
- `/api/documents`
- `/api/pdf`
- `/api/pdfs`
- `/api/exports`

## 12. Yetkilendirme

Backend:

- İstek kimliğini doğrular.
- Admin rollerini kontrol eder.
- Çalışanın yalnızca kendi assignment, attempt ve belgelerine erişmesine izin verir.
- Başka eğitime veya başka çalışana ait kayıtların yanlış URL ile bağlanmasını engeller.

Mevcut identity header yapısı yerel veya güvenilir entegrasyon içindir. Production ortamında kurumun gerçek authentication sistemi bağlanmalıdır.

## 13. Kullanıcının E-Posta ile Eşleştirilmesi

Aynı ad ve soyada sahip birden fazla çalışan bulunabileceği için kullanıcı eşleştirmesi ad-soyad üzerinden yapılmamalıdır.

Önerilen production akışı:

```text
kurumsal oturumdaki eşsiz email
→ mevcut çalışan tablosunda normalize edilmiş email ile arama
→ kullanıcının sabit primary key değerini alma
→ bütün modül ilişkilerini kullanıcı ID'siyle yürütme
```

E-posta yalnızca kullanıcıyı bulma aşamasında kullanılır. Assignment, attempt ve belge foreign key'leri sabit kullanıcı ID'si üzerinden tutulur.

Gerçek kullanıcı tablosu ve email kolonunun adı paylaşılmadığı için bu eşleştirmenin şirket DB'sine özgü mapping kısmı production entegrasyonunda tamamlanmalıdır.

## 13A. E-Posta Tabanlı Kimlik Çözümleme

Kimlik katmanı doğrudan kullanıcı ID'sinin yanında eşsiz kurumsal e-posta header'ını da destekler. ID gönderilmemişse backend normalize edilmiş e-posta ile aktif kullanıcıyı bulur ve bundan sonraki bütün ilişkileri bulunan sabit kullanıcı ID'si üzerinden yürütür.

- Varsayılan ID header: `x-user-id`
- Varsayılan e-posta header: `x-user-email`
- Frontend çalışan/admin için ayrı ID veya e-posta environment değerleri gönderebilir.
- Aynı e-postayla birden fazla aktif kullanıcı eşleşirse `409` dönülür.
- E-postası bulunmayan veya pasif kullanıcı için kimlik doğrulama reddedilir.
- Assignment servisleri gerektiğinde `userEmails` dizisini de kullanıcı ID'lerine güvenli şekilde çözümleyebilir.
- Employee dashboard, kullanıcı ID'sini URL'de taşımak yerine kimliği doğrulanmış `/api/users/me/assignments` endpoint'ini kullanır.

Gerçek DB'de kurumsal e-posta kolonunun benzersizliği ve gerçek kolon mapping'i Cenk Bey'in ortamında doğrulanmalıdır.

## 13B. Arama, Filtreleme ve Sayfalama

- Eğitim listesi: backend tabanlı metin araması, aktif/pasif/taslak filtresi ve sayfalama
- Aktif çalışan listesi: backend tabanlı ad, e-posta, unvan ve departman araması ile sayfalama
- Katılımcılar: eğitim bağlamında ad/e-posta araması, başarılı/başarısız/devam eden/başlamadı filtresi ve sayfalama
- Çalışan dashboard'u: eğitim araması, durum filtresi, sıralama ve sayfalama

Liste endpoint'leri `page`, `pageSize`, `q` ve ilgili yerlerde `status` query parametrelerini kabul eder. Sayfa boyutu backend tarafından üst sınırla korunur.

## 13C. Kaydedilmemiş Değişiklik Koruması

- Eğitim oluşturma ve düzenleme ekranında form snapshot'ı takip edilir.
- SPA navigasyonu, tarayıcı yenileme/kapatma ve geri gitme öncesinde uyarı gösterilir.
- Katılımcı ekleme/çıkarma, son tarih veya imzalı form seçimi kaydedilmeden sayfadan çıkılırsa uyarılır.
- Admin sonuç düzeltme modalı, cevap veya gerekçe değiştiğinde kapatılmadan önce onay ister.
- Başarılı kayıt sonrasında dirty state temizlenir ve normal yönlendirme engellenmez.

## 14. Prisma Veri Modeli

Modül aşağıdaki ana modelleri kullanır:

- `User`
- `Training`
- `TrainingAssignment`
- `TrainingContent`
- `TrainingContentProgress`
- `Question`
- `QuestionOption`
- `ExamAttempt`
- `ExamAnswer`
- `ExamAnswerOption`
- `TrainingDocument`
- `ExamResultAudit`

Gerçek DB erişimi olmadığı için migration uygulanmamıştır. Hazırlanan dosyalar:

```text
backend/prisma/schema.prisma
backend/prisma/schema.patch.diff
backend/prisma/SCHEMA_PATCH_NOTES.md
```

Gerçek ortamda mevcut şirket tablolarının adları, ID tipleri, kolonları, foreign key'leri ve enum değerleri doğrulanmalıdır.

## 15. Ortam Değişkenleri

Backend başlıca değerleri:

- `DATABASE_URL`
- `PORT`
- `CORS_ORIGIN`
- `DOCUMENT_STORAGE_DIR`
- Belge ve eğitim asset limitleri
- Sınav submit toleransı
- Video ilerleme toleransı
- Admin rol listesi
- Kimlik ID ve e-posta header ayarları

Frontend başlıca değerleri:

- API base URL
- Kimlik ID ve e-posta header adları
- Yerel çalışan/admin ID veya e-posta değerleri
- Görüntüleme ve upload limitleri

Gerçek environment dosyaları repository'ye eklenmez; yalnızca `.env.example` dosyaları bulunur.

## 16. Doğrulama Durumu

Kod geliştirme ve teslim sürecinde:

- Backend TypeScript clean build
- Frontend TypeScript kontrolü
- Frontend ESLint kontrolü
- DB'siz backend health kontrolü
- DB gerektiren endpoint'lerde kontrollü `503`
- Production CORS reddinde `403`
- Boş sınav PDF smoke testi
- Katılımcı cevap PDF smoke testi
- Resimli şık içeren boş sınav ve katılımcı cevap PDF smoke testi
- Katılım formu PDF smoke testi
- Çok sayfalı katılım formu kontrolü
- PDF şablonlarının build çıktısına kopyalanması

kontrolleri gerçekleştirilmiştir.

Hedef sistemde temiz dependency kurulumu, Prisma generate, migration ve gerçek DB ile staging testi yeniden çalıştırılmalıdır.

## 17. Gerçek Ortam Entegrasyon Sınırı

Kod seviyesindeki eğitim, katılımcı, sınav, belge ve PDF akışları hazırlanmıştır.

Gerçek altyapıda tamamlanacak işlemler:

1. Mevcut kullanıcı/eğitim/soru tablolarını gerçek kolon adlarıyla Prisma modellerine map etmek
2. Yeni modül tabloları için migration hazırlamak ve staging ortamında incelemek
3. `DATABASE_URL` tanımlamak
4. Prisma Client üretmek
5. Kurumun gerçek login/SSO/JWT/gateway sistemini bağlamak
6. Eşsiz kurumsal e-posta üzerinden kullanıcı ID çözümlemesini gerçek tabloya uyarlamak
7. Kalıcı document storage volume ve yedekleme politikasını tanımlamak
8. Gerçek verilerle uçtan uca staging testi yapmak

Bu işlemler şirket DB kolonları ve production altyapısı verilmeden tamamlanamaz ve yapılmış gibi gösterilmemiştir.

## 18. Proje Durumu

Modülün uygulama kodu aşağıdaki alanlarda tamamlanmıştır:

- Eğitim ve içerik yönetimi
- Katılımcı ekleme/çıkarma
- Eğitim bazlı kişisel dosya
- Ortak eğitim belgeleri
- Attempt ve cevap sistemi
- Backend puanlama
- Belge upload/download
- OSGB sertifikası
- PDF ve Excel çıktıları
- Frontend–backend bağlantıları
- Veri bütünlüğü ve erişim kontrolleri

Canlıya geçiş için kalan çalışma yeni bir UI veya sınav özelliği geliştirmek değil; gerçek veritabanı şeması, kurumsal kullanıcı kimliği ve production storage altyapısının mevcut kodla eşleştirilmesidir.
