"""
=============================================================================
YÖRÜNGE RADYASYON AKISI VERİ TOPLAMA PİPELINE — v2
=============================================================================
v1'den farklar:
  ✗ Eski: Analitik AP-8/AE-8 yaklaşımı (hata: ~10^6 kat, temel olarak yanlış)
  ✓ Yeni: Gerçek SPENVIS verisinden oluşturulan (L, E) → flux interpolatörü

Temel problem: Analitik model L değerine bakıp "bu L'de ortalama akı nedir?"
diye soruyor. Ama SPENVIS, her yörünge noktasındaki B/L koordinatını bilip
gerçek manyetik alan modeliyle (IGRF+Olson-Pfitzer) flux hesaplıyor.
ISS'nin zamanının %92'si Van Allen kuşağının dışında geçer (SAA geçişleri
hariç). Analitik model bunu görmezden gelir.

Çözüm: Gerçek SPENVIS verilerini birden fazla kalibrasyon yörüngesi için
yükle, (L, E) uzayında interpolasyon tablosu oluştur, yeni yörüngeler için
bu tabloyu sorgula.

Kalibrasyon yörüngesi stratejisi (LEO→GEO kapsama):
  1. ISS-like     : 400 km, 51.6° → L~1.0–1.8  (iç kuşak giriş)
  2. MEO-1        : 3000 km, 55°  → L~1.5–2.5  (iç kuşak / slot geçiş)
  3. HEO-like     : 500×20000 km, 28° → L~1.0–5.5 (tüm kuşakları süpürür)
  4. GPS-like     : 20200 km, 55° → L~4.2–5.0  (dış kuşak tepe)
  5. GEO          : 35786 km, 0°  → L~6.6       (dış kuşak sınırı)

Gerekli kütüphaneler:
  pip install numpy scipy pandas pyDOE2
=============================================================================
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from scipy.stats import qmc
from scipy.interpolate import RectBivariateSpline, interp1d, LinearNDInterpolator
from datetime import datetime
warnings.filterwarnings('ignore')


# =============================================================================
# BÖLÜM 1: SPENVIS VERİ YÜKLEYICI VE İNTERPOLATÖR
# =============================================================================

# --- SPENVIS GCR VE SPE SABİTLERİ ---

# 1. GCR Integral Akıları (Tüm <100 MeV enerjiler için sabittir)
# Birim: particles / cm^2 / sec
GCR_FLUX_MIN = 4.10  # spenvis_gcr_min.txt -> 3262.3 değeri çevrildi
GCR_FLUX_MAX = 1.52  # spenvis_gcr_max.txt -> 1208.4 değeri çevrildi

# 2. ESP Modelinden Gelen Toplam SPE Fluence (Birim: particles / cm^2)
# UYARI: Bu sayılar 10 yıllık görev ve %95 Güven Aralığı içindir!


def get_spe_base_for_energy(target_energy):
        # SPENVIS'ten çektiğimiz referans değerler
        ref_energies = np.array([10.0, 30.0, 50.0, 100.0])
        ref_fluences = np.array([1.7433e11, 4.1600e10, 1.9903e10, 4.8783e09])
        
        # Eğer enerji 10 MeV'den düşükse (örneğin 1 MeV), uzayda bu parçacıklardan 
        # MİLYARLARCA daha fazla vardır. Mühendislik worst-case'i olarak şimdilik 
        # 10 MeV'in dozunu alt enerjiler için sabit kabul edebiliriz (çok ince hesap istersen uzatılabilir).
        if target_energy <= ref_energies[0]:
            return ref_fluences[0]
        
        # Eğer enerji 100 MeV'den büyükse
        if target_energy >= ref_energies[-1]:
            return ref_fluences[-1]
        
        # Aradaki enerjiler (örn: 40 MeV) için fiziksel logaritmik interpolasyon
        return np.exp(np.interp(target_energy, ref_energies, np.log(ref_fluences)))

class SPENVISInterpolator:
    """
    Gerçek SPENVIS verilerinden oluşturulan (L, E) → flux interpolatörü.

    Birden fazla kalibrasyon yörüngesi dosyasını yükler,
    hepsinin B-L-flux noktalarını birleştirir ve
    L-E uzayında 2D interpolasyon tablosu oluşturur.

    Kullanım:
        interp = SPENVISInterpolator()
        interp.load_file("spenvis_iss_electron.txt", "electron")
        interp.load_file("spenvis_meo_electron.txt", "electron")
        interp.build()
        flux = interp.query("electron", L=2.5, energies_mev=np.array([0.1, 1.0, 5.0]))
    """

    # Her SPENVIS dosyası için kaç L binine gruplayacağız
    L_GRID_RESOLUTION = 0.1   # Re
    L_MIN, L_MAX = 1.0, 12.0

    def __init__(self):
        # Ham nokta bulutu: {particle_type: list of (L, flux_vector)}
        self._raw_points = {"proton": [], "electron": []}
        self._energy_grids = {"proton": None, "electron": None}

        # İnterpolatörler (build() sonrası dolar)
        self._interp = {"proton": None, "electron": None}
        self._L_grid = None
        self._built = False

    # ── Dosya Yükleme ────────────────────────────────────────────────────────

    def load_file(self, file_path: str, particle_type: str) -> None:
        """
        Bir SPENVIS trapped particle dosyasını yükle.

        Parameters
        ----------
        file_path     : SPENVIS .txt dosya yolu
        particle_type : 'proton' veya 'electron'
        """
        file_path = os.path.normpath(file_path)
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Dosya bulunamadı: {file_path}")
        if particle_type not in ("proton", "electron"):
            raise ValueError("particle_type 'proton' veya 'electron' olmalı")

        with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()

        # 1) Enerji seviyelerini oku
        n_energy, energies = None, None
        
        for i, line in enumerate(lines):
            # Format 1: Klasik satır başı 'ENERGY' formatı
            if line.strip().startswith("'ENERGY'"):
                parts = line.strip().split(",")
                n_energy = int(parts[1].strip())
                energies = np.array([float(parts[j + 2].strip()) for j in range(n_energy)])
                break
                
            # Format 2: Yeni SPENVIS çıktı formatı (Satır 'Flux' ile başlar, 'ENERGY' sonda yer alır)
            elif "'Flux'" in line and "'ENERGY'" in line:
                parts = line.strip().split(",")
                # Bu formatta enerji sayısı 3. elemandır (index 2)
                n_energy = int(parts[2].strip())
                
                # Enerji değerleri bir sonraki satırdadır
                energy_line = lines[i+1].replace(",", " ").split()
                energies = np.array([float(x) for x in energy_line])
                break

        if n_energy is None or energies is None:
            raise ValueError(f"HATA: '{file_path}' dosyasında enerji başlığı bulunamadı! SPENVIS formatını kontrol et.")

        # Enerji grid kontrolü: farklı dosyalar farklı grid kullanabilir
        existing = self._energy_grids[particle_type]
        if existing is None:
            self._energy_grids[particle_type] = energies
        else:
            # Farklı grid varsa daha kaba olana hizala (sonraki geliştirme)
            # Şimdilik: dosyaların aynı grid kullandığını varsay
            if not np.allclose(existing, energies, rtol=0.01):
                print(f"  UYARI: {file_path} farklı enerji gridi kullanıyor. "
                      f"Ortak grid için interpolasyon yapılacak.")
    
        # 2) Veri satırlarını oku (B, L, flux_1, ..., flux_n sütunları)
        expected_cols = 2 + n_energy
        loaded = 0

    
        for line in lines:
            parts = line.replace(",", " ").split()
            if len(parts) != expected_cols:
                continue
            try:
                row = [float(x) for x in parts]
            except ValueError:
                continue
            B = row[0]
            L = row[1]
            flux_vec = np.array(row[2:])
            # Sadece geçerli L aralığı ve en az bir non-zero flux
            if self.L_MIN <= L <= self.L_MAX and np.any(flux_vec > 0):
                # Eskiden sadece (L, flux_vec) ekleniyordu, şimdi (B, L, flux_vec) olarak güncelledik
                self._raw_points[particle_type].append((B, L, flux_vec)) 
                loaded += 1

        print(f"  {os.path.basename(file_path)}: {loaded} geçerli nokta yüklendi "
              f"[{particle_type}, {n_energy} enerji]")

    # ── İnterpolatör İnşası ──────────────────────────────────────────────────

    """
        Yüklenen ham veritabanından 2D (L, E) → flux interpolatörleri oluştur.

        Strateji:
          a) Her L bin'inde o bine düşen tüm noktaların maksimum flux'unu al
             (worst-case tasarım için; isteğe bağlı olarak "mean" de kullanılabilir)
          b) L-E matrisini scipy RectBivariateSpline ile fit et
          c) Logaritmik uzayda fit yap (flux'un büyüklük sırası önemli)
        """

    

    def build(self) -> None:
        for ptype in ("proton", "electron"):
            points = self._raw_points[ptype]
            if not points:
                print(f"  UYARI: {ptype} için yüklü veri yok, atlanıyor.")
                continue

            energies = self._energy_grids[ptype]
            
            # (B, L) ve Flux matrislerini ayır
            B_vals = np.array([p[0] for p in points])
            L_vals = np.array([p[1] for p in points])
            flux_matrix = np.array([p[2] for p in points])
            
            # B değerini logaritmik uzaya al
            B_log = np.log10(np.maximum(B_vals, 1e-6))
            points_2d = np.column_stack((B_log, L_vals))
            
            # Flux'u logaritmik uzaya al (0 olan yerleri çok küçük bir değerle doldur)
            log_flux_matrix = np.where(flux_matrix > 0, np.log10(flux_matrix), -20.0)
            
            interp_funcs = []
            for e_idx in range(len(energies)):
                # Her enerji seviyesi için (B, L) -> Flux interpolatörü
                f = LinearNDInterpolator(points_2d, log_flux_matrix[:, e_idx], fill_value=-20.0)
                interp_funcs.append(f)
            
            self._interp[ptype] = (interp_funcs, energies)
            print(f"  {ptype}: {len(points)} nokta ile 3D (B, L, E) model oluşturuldu.")

        self._built = True

    # ── Flux Sorgulama ───────────────────────────────────────────────────────

    """
        Verilen L ve enerji dizisi için integral flux döndür.

        Parameters
        ----------
        particle_type : 'proton' veya 'electron'
        L             : McIlwain L-kabuğu değeri
        energies_mev  : sorgulanacak enerji eşikleri (MeV)

        Returns
        -------
        np.ndarray : flux [cm⁻² s⁻¹], aynı shape ile energies_mev
      """
        

    # ~196. Satır - query metodunu tamamen bununla değiştir
    def query(self, particle_type: str, B: np.ndarray, L: np.ndarray,
              energies_mev: np.ndarray) -> np.ndarray:
        if not self._built:
            raise RuntimeError("Önce build() çağırın.")

        B = np.atleast_1d(B)
        L = np.atleast_1d(L)
        energies_mev = np.atleast_1d(np.float64(energies_mev))
        
        interp_data = self._interp.get(particle_type)
        if interp_data is None:
            return np.zeros((len(B), len(energies_mev)))

        interp_funcs, ref_energies = interp_data

        # Sorgu noktalarını hazırla
        B_log = np.log10(np.maximum(B, 1e-6))
        pts = np.column_stack((B_log, L))

        # Referans enerjilerdeki log_flux değerlerini bul
        log_flux_ref = np.column_stack([f(pts) for f in interp_funcs])
        
        # Ekstrapolasyon alanlarını sıfırla
        log_flux_ref = np.nan_to_num(log_flux_ref, nan=-20.0)

        # İstenen enerjilere göre 1D interpolasyon (Enerji ekseni boyunca vektörel)
        f_E = interp1d(np.log10(ref_energies), log_flux_ref, axis=1, 
                       kind='linear', bounds_error=False, fill_value=-20.0)
        
        log_flux_query = f_E(np.log10(np.maximum(energies_mev, 1e-4)))
        flux = 10.0 ** log_flux_query

        # Sorgu enerjisi maksimum limiti aşıyorsa o sütunu 0 yap
        for i, E in enumerate(energies_mev):
            if E > ref_energies[-1]:
                flux[:, i] = 0.0

        # Eğrinin çok altındakileri tam sıfıra çek (fiziksel gerçeklik)
        flux[flux < 1e-10] = 0.0
        return flux

    # ── Durum ve Tanı ────────────────────────────────────────────────────────

    def summary(self) -> None:
        """Yüklü veri ve interpolatör durumunu yazdır."""
        print("\n── SPENVISInterpolator Durumu ──────────────────────────")
        for ptype in ("proton", "electron"):
            n = len(self._raw_points[ptype])
            E = self._energy_grids[ptype]
            interp = self._interp[ptype]
            e_range = f"{E[0]:.2f}–{E[-1]:.0f} MeV" if E is not None else "yok"
            status = "hazır ✓" if interp is not None else "yüklenmedi ✗"
            print(f"  {ptype:8s}: {n:5d} nokta | Enerji: {e_range} | Spline: {status}")
        print("────────────────────────────────────────────────────────\n")


# =============================================================================
# BÖLÜM 2: PARAMETRE UZAYI (değişmedi)
# =============================================================================

PARAM_RANGES = {
    "altitude_km": [200.0, 40000.0],       # LEO'dan GEO dışına kadar
    "inclination_deg": [0.0, 98.6],        # Ekvatordan Kutupsal/SSO yörüngelere
    "eccentricity": [0.0, 0.8],            # Daireselden yüksek eliptik GTO'lara
    "raan_deg": [0.0, 360.0],
    "arg_perigee_deg": [0.0, 360.0],
    "mission_duration_years": [1.0, 15.0], # 1 yıl ile 15 yıl arası görev süreleri
    "solar_max_fraction": [0.0, 1.0]       # %0 ile %100 arası Solar Max evresi
}

PROTON_ENERGIES_MEV = np.array([
    0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0,
    5.0, 7.0, 10.0, 15.0, 20.0, 30.0, 50.0, 70.0, 100.0,
    150.0, 200.0, 300.0, 400.0
])

ELECTRON_ENERGIES_MEV = np.array([
    0.04, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0,
    1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0
])


# =============================================================================
# BÖLÜM 3: LHS ÖRNEKLEMESİ (v1'den değişmedi)
# =============================================================================

def generate_lhs_samples(n_samples: int = 5000, seed: int = 42) -> pd.DataFrame:
    n_params = len(PARAM_RANGES)
    param_names = list(PARAM_RANGES.keys())
    
    sampler = qmc.LatinHypercube(d=n_params, seed=seed)
    samples_unit = sampler.random(n=n_samples)
    
    lower = [PARAM_RANGES[p][0] for p in param_names]
    upper = [PARAM_RANGES[p][1] for p in param_names]
    
    samples = qmc.scale(samples_unit, lower, upper)
    df = pd.DataFrame(samples, columns=param_names)
    
    # Fiziksel eliptiklik sınırı
    df["eccentricity"] = df["eccentricity"].clip(0, 0.8)
    
    R_E = 6378.14
    a = R_E + df["altitude_km"]
    perigee_alt = a * (1 - df["eccentricity"]) - R_E
    
    # Uydunun atmosfere çarpıp yanmasını engelleyen fiziksel filtre
    df = df[perigee_alt >= 150].reset_index(drop=True)
    
    print(f"LHS: {n_samples} örnek üretildi, {len(df)} geçerli yörünge eğitime girecek.")
    return df


# =============================================================================
# BÖLÜM 4: YÖRÜNGE PROPAGASYONU (v1'den değişmedi, dipol B/L)
# =============================================================================

def propagate_orbit(altitude_km, inclination_deg, eccentricity,
                    raan_deg, arg_perigee_deg, n_points=360):
    R_E = 6378.14
    mu = 398600.4418
    a = R_E + altitude_km
    T = 2 * np.pi * np.sqrt(a**3 / mu)
    nu_arr = np.linspace(0, 2 * np.pi, n_points, endpoint=False)
    inc = np.radians(inclination_deg)
    raan = np.radians(raan_deg)
    omega = np.radians(arg_perigee_deg)
    cos_O, sin_O = np.cos(raan), np.sin(raan)
    cos_i, sin_i = np.cos(inc), np.sin(inc)
    cos_w, sin_w = np.cos(omega), np.sin(omega)

    positions = []
    for nu in nu_arr:
        r = a * (1 - eccentricity**2) / (1 + eccentricity * np.cos(nu))
        xo, yo = r * np.cos(nu), r * np.sin(nu)
        z_eci = (sin_w * sin_i) * xo + (cos_w * sin_i) * yo
        lat_rad = np.arcsin(np.clip(z_eci / r, -1, 1))
        lambda_m = lat_rad
        cos_lam = np.cos(lambda_m)
        L = min((r / R_E) / max(cos_lam**2, 1e-4), 20.0) if cos_lam > 0.01 else 20.0
        B0 = 0.311  # Gauss
        B = ((B0 / L**3) * np.sqrt(1 + 3 * np.sin(lambda_m)**2)
             / max(cos_lam**6, 1e-8)) if cos_lam > 0.01 else 0.0
        positions.append({
            "L_value": L,
            "B_gauss": B,
            "latitude_deg": np.degrees(lat_rad),
            "altitude_km": r - R_E,
            "time_min": np.degrees(nu) / 360.0 * (T / 60.0),
        })
    return {"period_min": T / 60.0, "semi_major_axis_km": a, "positions": positions}


# =============================================================================
# BÖLÜM 5: YENİ — SPENVIS TABANLI AKI HESAPLAYICI
# =============================================================================

def compute_orbit_flux(orbit_data: dict,
                       interpolator: SPENVISInterpolator,
                       energies_mev: np.ndarray,
                       particle_type: str) -> dict:
    """
    Bir yörünge boyunca akıyı SPENVIS interpolatörü kullanarak hesapla.

    Analitik yaklaşımın yerini tamamen alır.

    Parameters
    ----------
    orbit_data    : propagate_orbit() çıktısı
    interpolator  : Kalibre edilmiş SPENVISInterpolator
    energies_mev  : Sorgulanacak enerji eşikleri
    particle_type : 'proton' veya 'electron'

    Returns
    -------
    dict : orbit-averaged, max, min flux + along-orbit profil
    """
    """positions = orbit_data["positions"]
    n_pts = len(positions)
    n_E = len(energies_mev)
    flux_along = np.zeros((n_pts, n_E))

    for i, pos in enumerate(positions):
        L = pos["L_value"]
        flux_along[i] = interpolator.query(particle_type, L, energies_mev)"""

    positions = orbit_data["positions"]
    n_E = len(energies_mev)
    
    # Tüm B ve L değerlerini array'e al
    L_arr = np.array([p["L_value"] for p in positions])
    B_arr = np.array([p["B_gauss"] for p in positions])
    
    # Tek seferde tüm yörünge boyunca akıyı hesapla
    flux_along = interpolator.query(particle_type, B_arr, L_arr, energies_mev)

    # Sıfır olmayan noktaların ortalaması (yörünge-ortalama)
    nonzero_mask = flux_along.sum(axis=1) > 0
    if nonzero_mask.any():
        orbit_avg = flux_along[nonzero_mask].mean(axis=0)
    else:
        orbit_avg = np.zeros(n_E)

    # SAA/kuşak fraksiyonu: hangi oranda orbitin flux>0 içinde?
    belt_fraction = nonzero_mask.mean()

    # Referans enerji: ~10 MeV proton veya ~1 MeV elektron
    ref_idx = np.argmin(np.abs(energies_mev - (10.0 if particle_type == "proton" else 1.0)))

    return {
        "orbit_averaged_flux": orbit_avg,           # cm⁻²s⁻¹ (tüm enerji)
        "max_flux": flux_along.max(axis=0),
        "min_flux": flux_along.min(axis=0),
        "energies_mev": energies_mev,
        "belt_fraction": belt_fraction,             # kuşak içinde geçen süre oranı
        "along_orbit_flux": flux_along[:, ref_idx],
        "along_orbit_L": [p["L_value"] for p in positions],
        "along_orbit_lat": [p["latitude_deg"] for p in positions],
    }

def get_geomagnetic_transmission(L_array, particle_type="SPE"):
    """
    McIlwain L-parametresine göre Dünya'nın manyetik alanının 
    GCR ve SPE radyasyonunu ne kadar geçirdiğini hesaplar.
    L_array: Yörünge boyunca hesaplanmış L değerleri dizisi.
    """
    # L = 3.5 civarında bükülme noktası olan bir lojistik büyüme (sigmoid) fonksiyonu
    # L > 4.5 iken ~1.0 (Tam geçirgen), L < 2.5 iken ~0.0 (Tam korumalı)
    
    L_0 = 3.5  # Eğrinin orta noktası (Geçiş bölgesi)
    k = 3.0    # Eğrinin dikliği (Manyetik alanın ne kadar keskin kestiği)
    
    transmission = 1.0 / (1.0 + np.exp(-k * (L_array - L_0)))
    
    # GCR (Kozmik Işınlar) SPE'ye göre çok daha yüksek enerjili oldukları için 
    # manyetik alanı delme ihtimalleri daha yüksektir. LEO'da bile arka plan 
    # GCR'ın %10-15'i içeri sızar.
    if particle_type == "GCR":
        transmission = 0.15 + 0.85 * transmission
        
    return transmission


# =============================================================================
# BÖLÜM 6: BATCH PIPELINE
# =============================================================================

def run_batch_pipeline(interp_max: SPENVISInterpolator,
                       interp_min: SPENVISInterpolator,
                       n_samples: int = 100,
                       output_dir: str = "radiation_dataset_v3") -> pd.DataFrame:
    print("=" * 70)
    print("RADYASYON AKISI VERİ TOPLAMA — v3 (Solar Min/Max Harmanlamalı)")
    print("=" * 70)

    os.makedirs(output_dir, exist_ok=True)
    params_df = generate_lhs_samples()

    all_results = []
    R_E = 6378.14

    for idx, row in params_df.iterrows():
        orbit = propagate_orbit(
            altitude_km=row["altitude_km"], inclination_deg=row["inclination_deg"],
            eccentricity=row["eccentricity"], raan_deg=row["raan_deg"],
            arg_perigee_deg=row["arg_perigee_deg"], n_points=360,
        )

        # GÖREV SÜRESİ VE GÜNEŞ ORANI (Örnek LHS parametreleri veya sabit değerler)
        mission_duration_years = row["mission_duration_years"]
        solar_max_fraction = row["solar_max_fraction"]
        solar_min_fraction = 1.0 - solar_max_fraction
        mission_duration_seconds = mission_duration_years * 365.25 * 24 * 3600

        # HER İKİ MODELDEN AKI HESAPLAMA
        p_res_max = compute_orbit_flux(orbit, interp_max, PROTON_ENERGIES_MEV, "proton")
        p_res_min = compute_orbit_flux(orbit, interp_min, PROTON_ENERGIES_MEV, "proton")
        
        e_res_max = compute_orbit_flux(orbit, interp_max, ELECTRON_ENERGIES_MEV, "electron")
        e_res_min = compute_orbit_flux(orbit, interp_min, ELECTRON_ENERGIES_MEV, "electron")

        a = orbit["semi_major_axis_km"]
        e = row["eccentricity"]
        res = {
            "sample_id": idx,
            "altitude_km": row["altitude_km"], 
            "inclination_deg": row["inclination_deg"],
            "eccentricity": row["eccentricity"], 
            # 3. LHS'den gelen değerleri CSV'ye feature (X) olarak yazdırıyoruz
            "mission_duration_years": mission_duration_years,
            "solar_max_fraction": solar_max_fraction,
            "period_min": orbit["period_min"],
        }

        # Yörüngenin ortalama L-Kabuğunu (Manyetik uzaklık) hesapla
        # (Eğer propagate_orbit fonksiyonun L_shell döndürmüyorsa, a/R_E olarak yaklaşıklayabilirsin)
        mean_L = orbit.get("L_shell_avg", orbit["semi_major_axis_km"] / 6378.14)
        
        # Manyetik geçirgenlikleri hesapla
        gcr_transmission = get_geomagnetic_transmission(mean_L, particle_type="GCR")
        spe_transmission = get_geomagnetic_transmission(mean_L, particle_type="SPE")

        # PROTON HARMANLAMA VE FLUENCE (TOPLAM DOZ)
        for e_idx, energy in enumerate(PROTON_ENERGIES_MEV):
            avg_max = p_res_max["orbit_averaged_flux"][e_idx]
            avg_min = p_res_min["orbit_averaged_flux"][e_idx]
            trapped_blended_flux = (avg_max * solar_max_fraction) + (avg_min * solar_min_fraction)
            trapped_fluence = trapped_blended_flux * mission_duration_seconds

           # B. GCR Fluence Hesabı (Zaman ve Yörünge Ağırlıklı)
            gcr_blended_flux = (GCR_FLUX_MAX * solar_max_fraction) + (GCR_FLUX_MIN * solar_min_fraction)
            gcr_fluence = gcr_blended_flux * mission_duration_seconds * gcr_transmission
            
            # C. SPE (Güneş Patlaması) Fluence Hesabı (Yörünge Ağırlıklı)
            base_spe_10_years = get_spe_base_for_energy(energy)
            
            yearly_spe_rate = base_spe_10_years / 10.0
            spe_fluence = yearly_spe_rate * mission_duration_years * spe_transmission
            
            # 10 yıllık toplam dozu 10'a bölerek "Yıllık Ortalama Şok" değerini buluyoruz
            # ve LHS'nin belirlediği o spesifik görev süresi ile çarpıyoruz.
            yearly_spe_rate = base_spe_10_years / 10.0
            spe_fluence = yearly_spe_rate * mission_duration_years * spe_transmission

            # D. NİHAİ MAKİNE ÖĞRENMESİ HEDEF DEĞİŞKENİ (TID)
            total_mission_fluence = trapped_fluence + gcr_fluence + spe_fluence
            
            res[f"p_trapped_fluence_{energy:.1f}MeV"] = trapped_fluence
            res[f"total_p_fluence_{energy:.1f}MeV"] = total_mission_fluence

            # 1. Toplam Hedef Değişkeni (ML'in asıl tahmin edeceği şey)
            res[f"total_p_fluence_{energy:.1f}MeV"] = total_mission_fluence
            
            # 2. UI ve Karar Algoritması İçin Alt Bileşenler (Sadece kayıt için)
            res[f"p_trapped_fluence_{energy:.1f}MeV"] = trapped_fluence
            res[f"p_gcr_fluence_{energy:.1f}MeV"] = gcr_fluence
            res[f"p_spe_fluence_{energy:.1f}MeV"] = spe_fluence
            
            # 3. Yüzdelik Dağılımlar (UI Pasta Grafiği İçin Doğrudan Hazır Veri)
            if total_mission_fluence > 0:
                res[f"p_spe_ratio_{energy:.1f}MeV"] = round((spe_fluence / total_mission_fluence) * 100, 2)
                res[f"p_trapped_ratio_{energy:.1f}MeV"] = round((trapped_fluence / total_mission_fluence) * 100, 2)
                res[f"p_gcr_ratio_{energy:.1f}MeV"] = round((gcr_fluence / total_mission_fluence) * 100, 2)
            else:
                res[f"p_spe_ratio_{energy:.1f}MeV"] = 0
                res[f"p_trapped_ratio_{energy:.1f}MeV"] = 0
                res[f"p_gcr_ratio_{energy:.1f}MeV"] = 0

        # ELEKTRON HARMANLAMA VE FLUENCE
        for e_idx, energy in enumerate(ELECTRON_ENERGIES_MEV):
            avg_max = e_res_max["orbit_averaged_flux"][e_idx]
            avg_min = e_res_min["orbit_averaged_flux"][e_idx]
            blended_flux = (avg_max * solar_max_fraction) + (avg_min * solar_min_fraction)
            
            res[f"e_avg_{energy:.2f}MeV"] = blended_flux
            res[f"e_fluence_{energy:.2f}MeV"] = blended_flux * mission_duration_seconds

        all_results.append(res)

    print("\n[3/4] Sonuçlar kaydediliyor...")
    results_df = pd.DataFrame(all_results)
    results_df.to_csv(f"{output_dir}/radiation_dataset.csv", index=False)
    results_df.describe().to_csv(f"{output_dir}/dataset_summary.csv")

    metadata = {
        "version": "v2",
        "n_samples": len(results_df),
        "model": "SPENVIS AE-8/AP-8 tabanlı 2D (L,E) interpolatör",
        "proton_energies_mev": PROTON_ENERGIES_MEV.tolist(),
        "electron_energies_mev": ELECTRON_ENERGIES_MEV.tolist(),
        "param_ranges": {k: list(v) for k, v in PARAM_RANGES.items()},
        "generated_at": datetime.now().isoformat(),
        "notes": (
            "v1 analitik yaklaşımı ~10^6 kat hata veriyordu (L bazlı sabit "
            "akı atayarak SAA/kuşak dışı noktaları hesaba katmıyordu). "
            "v2, gerçek SPENVIS (B,L,flux) nokta bulutundan 2D spline "
            "interpolasyonu kullanır."
        ),
    }
    with open(f"{output_dir}/metadata.json", "w") as fh:
        json.dump(metadata, fh, indent=2)

    print(f"\n{'='*70}")
    print(f"TAMAMLANDI — {len(results_df)} örnek, {len(results_df.columns)} sütun")
    print(f"Çıktı dizini: {output_dir}/")
    print(f"{'='*70}")
    return results_df


# =============================================================================
# BÖLÜM 7: KALİBRASYON DOĞRULAMASI
# =============================================================================

def validate_calibration(interpolator: SPENVISInterpolator,
                          spenvis_file: str,
                          particle_type: str,
                          label: str = "ISS") -> None:
    """
    Interpolatörün bilinen bir SPENVIS dosyasını ne kadar iyi yeniden
    ürettiğini test et. Hata dağılımını log-uzayda raporla.
    """
    from scipy.interpolate import interp1d as _interp1d

    with open(spenvis_file, "r", errors="replace") as fh:
        lines = fh.readlines()

    for i, line in enumerate(lines):
        if line.strip().startswith("'ENERGY'"):
            parts = line.strip().split(",")
            n = int(parts[1].strip())
            energies_ref = np.array([float(parts[j+2].strip()) for j in range(n)])
            break
        elif "'Flux'" in line and "'ENERGY'" in line:
            parts = line.strip().split(",")
            n = int(parts[2].strip())
            energy_line = lines[i+1].replace(",", " ").split()
            energies_ref = np.array([float(x) for x in energy_line])
            break

    expected_cols = 2 + len(energies_ref)
    rows = []
    for line in lines:
        parts = line.replace(",", " ").split()
        if len(parts) == expected_cols:
            try:
                rows.append([float(x) for x in parts])
            except ValueError:
                continue

    data = np.array(rows)
    flux_ref = data[:, 2:]
    
    B_vals = data[:, 0]
    L_vals = data[:, 1]

    # Sadece non-zero satırlar
    nonzero_mask = flux_ref.sum(axis=1) > 0
    if nonzero_mask.sum() == 0:
        print(f"  {label}: non-zero veri yok, atlanıyor.")
        return

    B_nz = B_vals[nonzero_mask]
    L_nz = L_vals[nonzero_mask]
    flux_nz = flux_ref[nonzero_mask]

    # İnterpolatör tahmini 
    E_test = energies_ref[0]
    pred_flux = interpolator.query(particle_type, B_nz, L_nz, np.array([E_test]))[:, 0]

    # ~411. Satır - validate_calibration içindeki ilgili kısım
    B_vals = data[:, 0] # B sütununu al
    L_vals = data[:, 1]
    
    # ... [sadece non-zero satırlar] kısmı aynı kalacak
    
    B_nz = B_vals[nonzero_mask]
    L_nz = L_vals[nonzero_mask]
    flux_nz = flux_ref[nonzero_mask]

    # İnterpolatör tahmini (Artık B_nz array'ini de veriyoruz)
    E_test = energies_ref[0]
    
    pred_flux = interpolator.query(particle_type, B_nz, L_nz, np.array([E_test]))[:, 0]

    true_flux = flux_nz[:, 0]
    mask = (true_flux > 0) & (pred_flux > 0)
    if mask.sum() == 0:
        print(f"  {label}: karşılaştırılabilir nokta yok.")
        return

    log_ratio = np.log10(pred_flux[mask] / true_flux[mask])
    print(f"\n  Kalibrasyon doğrulama: {label} ({particle_type}, E>{E_test:.2f} MeV)")
    print(f"    Karşılaştırılan nokta: {mask.sum()}")
    print(f"    Medyan hata (log10)  : {np.median(log_ratio):.3f}")
    print(f"    Std dev (log10)      : {np.std(log_ratio):.3f}")
    print(f"    Faktor 2 içinde      : {(np.abs(log_ratio)<0.301).mean()*100:.1f}%")
    print(f"    Faktor 10 içinde     : {(np.abs(log_ratio)<1.0).mean()*100:.1f}%")


# =============================================================================
# ANA ÇALIŞTIRMA
# =============================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("SPENVIS İNTERPOLATÖR + BATCH PIPELINE — v3")
    print("=" * 70)

    interp_max = SPENVISInterpolator()
    interp_min = SPENVISInterpolator()

    # İndirdiğin MAX dosyaları
    CALIB_FILES_MAX = {
        "electron": ["spenvis_trapped_electron_geo.txt","spenvis_trapped_electron_gps.txt","spenvis_trapped_electron_heo.txt",
                     "spenvis_trapped_electron_iss.txt","spenvis_trapped_electron_meo.txt"],
        "proton": ["spenvis_trapped_proton_geo.txt","spenvis_trapped_proton_gps.txt","spenvis_trapped_proton_heo.txt",
                   "spenvis_trapped_proton_iss.txt","spenvis_trapped_proton_meo.txt"]
    }
    
    # İndirdiğin MIN dosyaları
    CALIB_FILES_MIN = {
        "electron": ["spenvis_spe_min_geo.txt","spenvis_spe_min_gps.txt","spenvis_spe_min_heo.txt","spenvis_spe_min_iss.txt",
                     "spenvis_spe_min_meo.txt"],
        "proton": ["spenvis_spp_min_geo.txt","spenvis_spp_min_gps.txt","spenvis_spp_min_heo.txt","spenvis_spp_min_iss.txt",
                   "spenvis_spp_min_meo.txt"]
    }

    base_folder_max = r"SPENVIS_Sample_data\training_max" 
    base_folder_min = r"SPENVIS_Sample_data\training_min"

    print("\n[1] MAX Kalibrasyon dosyaları yükleniyor...")
    for ptype, files in CALIB_FILES_MAX.items():
        for file_name in files:
            fpath = os.path.join(base_folder_max, file_name)
            if os.path.isfile(fpath): interp_max.load_file(fpath, ptype)

    print("\n[2] MIN Kalibrasyon dosyaları yükleniyor...")
    for ptype, files in CALIB_FILES_MIN.items():
        for file_name in files:
            fpath = os.path.join(base_folder_min, file_name)
            if os.path.isfile(fpath): interp_min.load_file(fpath, ptype)

    interp_max.build()
    interp_min.build()


    # ── ADIM 3: Kalibrasyon doğrulaması ──────────────────────────────────────
    print("\n[3] Kalibrasyon doğrulaması (KÖR TEST)...")
    
    # MAX modeli için test
    validate_calibration(interp_max, r"SPENVIS_Sample_data\test\spenvis_elektron_gto.txt", "electron", "GTO-e (MAX)")
    validate_calibration(interp_max, r"SPENVIS_Sample_data\test\spenvis_proton_gto.txt", "proton", "GTO-p (MAX)")
    
    # MIN modeli için test
    validate_calibration(interp_min, r"SPENVIS_Sample_data\test\spenvis_spe_min_gto.txt", "electron", "GTO-e (MIN)")
    validate_calibration(interp_min, r"SPENVIS_Sample_data\test\spenvis_spp_min_gto.txt", "proton", "GTO-p (MIN)")

    print("\n[4] Batch pipeline başlatılıyor...")
    # Yeni fonksiyona her iki modeli de gönderiyoruz
    df = run_batch_pipeline(interp_max, interp_min, n_samples=50, output_dir="radiation_dataset_v3")

    # Özet
    print("\nProton akısı örnek (orbit-avg):")
    for E in [1.0, 10.0, 100.0]:
        col = f"p_avg_{E:.1f}MeV"
        if col in df.columns:
            nz = df[col][df[col] > 0]
            if len(nz):
                print(f"  E>{E:.0f} MeV: {nz.min():.2e} – {nz.max():.2e} p/cm²/s")