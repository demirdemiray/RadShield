## Türkçe
# RadShield Uydu Radyasyon Kalkan Tasarım Uygulaması

Bu proje, yörünge mekaniği, güneş fiziği ve malzeme bilimini bir araya getirerek uzay araçları için optimize edilmiş Graded-Z (çok katmanlı) radyasyon kalkanı konfigürasyonları üreten gelişmiş bir simülasyon ve analiz aracıdır.

#🚀 Proje Hakkında
Uzay ortamındaki radyasyon, uydu bileşenlerinin ömrünü belirleyen en kritik faktörlerden biridir. SRSO; fırlatma tarihi, yörünge dinamikleri (inklinasyon, egzantiriklik, apogee, perigee) ve güneş döngüsü (aktif/pasif evreler) gibi çevresel değişkenleri analiz eder. Araç, uydunun hedeflenen görev ömrü boyunca maruz kalacağı toplam radyasyon dozunu hesaplar ve ikincil radyasyon risklerini (Bremsstrahlung) en aza indiren malzeme, kalınlık ve sıralama kombinasyonlarını (LEO, MEO ve GEO için ortalama g/cm² değerlerinde) simüle eder.

#⚙️ Çekirdek Algoritma ve Son Modifikasyonlar
Algoritma, yüksek doğruluk ve esneklik sağlamak amacıyla bir dizi gelişmiş optimizasyon barındırır:

SPENVIS Tabanlı Makine Öğrenmesi: Yörüngeye özel radyasyon karakteristiği, SPENVIS verileriyle eğitilmiş bir model kullanılarak analiz edilir ve sistemde ön tanımlı 25 farklı Graded-Z şablonuyla eşleştirilir.

Kullanıcı Öncelikli Ağırlıklandırma Sistemi: Tasarım iterasyonları, kullanıcının belirlediği ve toplamı %100 olan 3 ana metriğe göre (Hafiflik, Maliyet, Koruma) dinamik olarak yönlendirilir.

Gelişmiş Doz ve Parçacık Dağılımı: Proton, elektron, GCR (Galaktik Kozmik Işınlar) ve SPE (Güneş Parçacık Olayları) baskınlık yüzdeleri yüksek hassasiyetle hesaplanarak tüm veri sekmelerinde tutarlı bir şekilde senkronize edilir.

SEE ve Güvenlik Marjı Kalibrasyonu: Zorlu yörüngelerde karşılaşılan aşırı güvenlik marjı hesaplamaları optimize edilmiş ve SEE (Single Event Effect) riskini hedeflenen seviyeye çekecek katman kalınlık eşikleri sisteme entegre edilmiştir.

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

## English
# RadShield Satellite Radiation Shield Design Application

This project is an advanced simulation and analysis tool that combines orbital mechanics, solar physics, and materials science to produce optimized Graded-Z (multi-layer) radiation shield configurations for spacecraft.

## 🚀 About the Project
Radiation in the space environment is one of the most critical factors determining the lifetime of satellite components. SRSO analyzes environmental variables such as launch date, orbital dynamics (inclination, eccentricity, apogee, perigee), and solar cycle phase (active/quiet). The tool calculates the total radiation dose the satellite will be exposed to over its intended mission lifetime and simulates material, thickness, and stacking combinations (in average g/cm² values for LEO, MEO, and GEO) that minimize secondary radiation risks (Bremsstrahlung).

## ⚙️ Core Algorithm and Recent Modifications
The algorithm incorporates a series of advanced optimizations to ensure high accuracy and flexibility:

**SPENVIS-Based Machine Learning:** Orbit-specific radiation characteristics are analyzed using a model trained on SPENVIS data and matched against 25 predefined Graded-Z templates in the system.

**User-Priority Weighting System:** Design iterations are dynamically guided by 3 key metrics defined by the user — Lightness, Cost, and Protection — whose weights must sum to 100%.

**Advanced Dose and Particle Distribution:** Proton, electron, GCR (Galactic Cosmic Rays), and SPE (Solar Particle Events) dominance percentages are calculated with high precision and synchronized consistently across all data tabs.

**SEE and Safety Margin Calibration:** Excessive safety margin calculations encountered in challenging orbits have been optimized, and layer thickness thresholds that bring SEE (Single Event Effect) risk to target levels have been integrated into the system.

## 📊 Inputs and Outputs

### 📥 User Inputs
**Mission Parameters:** Launch date, target satellite mission lifetime.

**Orbital Dynamics:** Inclination, eccentricity, apogee, and perigee values.

**Tolerance Limits:** Maximum radiation dose the satellite components can withstand, maximum allowable shielding mass (g/cm²).

**Optimization Preferences:** Percentage weights for Lightness, Cost, and Protection.

### 📤 System Outputs
**Shield Configuration:** Number of layers, materials to be used, stacking order, and specific thicknesses of each layer.

**Physical Properties:** Total shield mass (in g/cm²) and estimated shielding cost.

**Radiation Analysis:** Filtering percentages of the shield for proton, electron, and X-ray radiation.

**Mission Lifetime Estimate:** Net radiation dose reaching the satellite over its lifetime and the effective protection lifetime provided by the shield.

## 🛠️ Design Criteria and Threshold Values
The system aims not only to stop radiation but also to prevent the generation of secondary radiation. For example, it calculates the X-ray (secondary radiation) risk that would arise from using materials such as aluminum beyond a certain thickness and constrains thicknesses at specific thresholds. It avoids unnecessarily heavy shield designs for short-lifetime satellites launched during solar quiet periods.

### Example Shield Thickness References:

- **LEO (Low Earth Orbit):** ~0.5 – 2 g/cm²
- **GEO (Geostationary Orbit):** ~2 – 5 g/cm²
- **MEO (Medium Earth Orbit):** ~5 – 10 g/cm²

## Running the Interface
You can navigate between directories using the `cd` command. Steps:

1. First, install Node.js on your computer if it is not already installed. (You can use https://nodejs.org/en/download/current)

2. Open a terminal and run `npx kill-port 5173 7474` to ensure the relevant localhost ports are free.

3. Start the server — open the terminal, navigate to the `src` folder under the application directory, and run `node .\volkan-server.cjs` to launch the Radiation Data Local Server.

4. Open a terminal, navigate to the application directory (RadShield-main), and run `npm install` before the first launch.
5- Uygulama başlatılır. (RadShield-main dizininde iken npm run dev komutu ile uygulama başlatılır.)

6- Uygulama tarayıcıda açılır. "npm run dev" komutu sonrası gelen mesajların arasındaki Local: http://localhost:5173/ şeklinde yazan bağlantı kopyalanıp tarayıcıda başlatılır.

