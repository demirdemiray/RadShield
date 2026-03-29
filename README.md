# RadShield Uydu Radyasyon Kalkan Tasarım Uygulaması

Bu proje, yörünge mekaniği, güneş fiziği ve malzeme bilimini bir araya getirerek uzay araçları için optimize edilmiş Graded-Z (çok katmanlı) radyasyon kalkanı konfigürasyonları üreten gelişmiş bir simülasyon ve analiz aracıdır.

#🚀 Proje Hakkında
Uzay ortamındaki radyasyon, uydu bileşenlerinin ömrünü belirleyen en kritik faktörlerden biridir. SRSO; fırlatma tarihi, yörünge dinamikleri (inklinasyon, egzantiriklik, apogee, perigee) ve güneş döngüsü (aktif/pasif evreler) gibi çevresel değişkenleri analiz eder. Araç, uydunun hedeflenen görev ömrü boyunca maruz kalacağı toplam radyasyon dozunu hesaplar ve ikincil radyasyon risklerini (Bremsstrahlung) en aza indiren malzeme, kalınlık ve sıralama kombinasyonlarını (LEO, MEO ve GEO için ortalama g/cm² değerlerinde) simüle eder.

#⚙️ Çekirdek Algoritma ve Son Modifikasyonlar
Algoritma, yüksek doğruluk ve esneklik sağlamak amacıyla bir dizi gelişmiş optimizasyon barındırır:

SPENVIS Tabanlı Makine Öğrenmesi: Yörüngeye özel radyasyon karakteristiği, SPENVIS verileriyle eğitilmiş bir model kullanılarak analiz edilir ve sistemde ön tanımlı 25 farklı Graded-Z şablonuyla eşleştirilir.

Kullanıcı Öncelikli Ağırlıklandırma Sistemi: Tasarım iterasyonları, kullanıcının belirlediği ve toplamı %100 olan 3 ana metriğe göre (Hafiflik, Maliyet, Koruma) dinamik olarak yönlendirilir.

Gelişmiş Doz ve Parçacık Dağılımı: Proton, elektron, GCR (Galaktik Kozmik Işınlar) ve SPE (Güneş Parçacık Olayları) baskınlık yüzdeleri yüksek hassasiyetle hesaplanarak tüm veri sekmelerinde tutarlı bir şekilde senkronize edilir.

SEE ve Güvenlik Marjı Kalibrasyonu: 4200 km gibi zorlu yörüngelerde karşılaşılan aşırı güvenlik marjı hesaplamaları optimize edilmiş ve SEE (Single Event Effect) riskini hedeflenen seviyeye çekecek katman kalınlık eşikleri sisteme entegre edilmiştir.

#📊 Girdi ve Çıktılar
📥 Kullanıcı Girdileri
Görev Parametreleri: Fırlatma tarihi, hedeflenen uydu görev ömrü.

Yörünge Dinamikleri: İnklinasyon, egzantiriklik, apogee ve perigee değerleri.

Tolerans Sınırları: Uydu bileşenlerinin dayanabileceği maksimum radyasyon dozu, izin verilen maksimum zırh kütlesi (g/cm²).

Optimizasyon Tercihleri: Hafiflik, Maliyet ve Koruma yüzdelik ağırlıkları.

#📤 Sistem Çıktıları
Zırh Konfigürasyonu: Katman sayısı, kullanılacak malzemeler, katmanların dizilim sırası ve spesifik kalınlıkları.

Fiziksel Özellikler: Toplam zırh kütlesi (g/cm² cinsinden) ve tahmini zırh maliyeti.

Radyasyon Analizi: Zırhın proton, elektron ve X-ray radyasyonunu filtreleme yüzdeleri.

Görev Ömrü Tahmini: Ömür boyu uyduya ulaşan net radyasyon dozu ve kalkanın sağlayacağı efektif koruma ömrü.

#🛠️ Tasarım Kriterleri ve Eşik Değerler
Sistem, sadece radyasyonu durdurmayı değil, aynı zamanda ikincil radyasyon üretimini engellemeyi de hedefler. Örneğin, alüminyum gibi malzemelerin gereğinden kalın kullanılması durumunda ortaya çıkacak X-ray (ikincil radyasyon) riskini hesaplayarak kalınlıkları belirli eşiklerde sınırlar. Güneşin sakin döneminde fırlatılacak kısa ömürlü bir uydu için gereksiz ağır zırh tasarımlarından kaçınır.

#Örnek Zırh Kalınlığı Referansları:

LEO (Alçak Dünya Yörüngesi): ~0.5 - 2 g/cm²

GEO (Yer Senkron Yörünge): ~2 - 5 g/cm²

MEO (Orta Dünya Yörüngesi): ~5 - 10 g/cm²

# Arayüzün Çalıştırılması
Dizinler arasında cd komutu ile geçiş yapılabilir. Örnek:

1- İlk önce eğer kurulu değilse bilgisayarınıza Node JS yüklemeniz gerekiyor. (https://nodejs.org/en/download/current linkini kullanabilirsiniz)
2- Terminal'e girilir, öncelikle localhost ID'lerinin boş olduğundan emin olmak için npx kill-port 5173 7474 komutu girilir.
3- Server açılır (Teerminal'den uygulamanın bulunduğu dizinin altındaki src klasörüne girilir, node .\volkan-server.cjs komutu ile Radyasyon Verileri Lokal Sunucusu açılır.) 
4- Terminal'e girilir, ilk başlatma öncesinde uygulama dizinine (RadShield-main) ulaşılır ve npm install komutu yazılır.
5- Uygulama başlatılır. (RadShield-main dizininde iken npm run dev komutu ile uygulama başlatılır.)
6- Uygulama tarayıcıda açılır. "npm run dev" komutu sonrası gelen mesajların arasındaki Local: http://localhost:5173/ şeklinde yazan bağlantı kopyalanıp tarayıcıda başlatılır.

