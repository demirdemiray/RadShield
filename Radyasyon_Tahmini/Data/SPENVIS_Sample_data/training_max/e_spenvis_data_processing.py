"""
SPENVIS AE-8 Trapped Electron Parser — v3 (Doğru Yapı)
=======================================================
Dosya yapısı:
  Sütun 1 : B  (manyetik alan, Gauss)
  Sütun 2 : L  (McIlwain L-kabuğu, Rₑ)
  Sütun 3-32: 30 enerji eşiği için integral flux (cm⁻² s⁻¹)
  
30 enerji eşiği dosyanın başında 'ENERGY' satırında tanımlıdır.
"""

import os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')  # GUI yoksa bu satır gerekli; GUI varsa kaldırabilirsiniz
import matplotlib.pyplot as plt


# ── PARSE ───────────────────────────────────────────────────────────────────

def parse_spenvis_electron(file_path: str):
    """
    SPENVIS AE-8 tuzak elektron dosyasını parse eder.

    Döndürür
    -------
    energy_levels : np.ndarray  shape (30,)   — MeV
    B_vals        : np.ndarray  shape (N,)    — Gauss
    L_vals        : np.ndarray  shape (N,)    — Rₑ (McIlwain L)
    flux_matrix   : np.ndarray  shape (N, 30) — cm⁻² s⁻¹
    """
    file_path = os.path.normpath(file_path)
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Dosya bulunamadı: '{file_path}'")

    with open(file_path, 'r', encoding='utf-8', errors='replace') as fh:
        lines = fh.readlines()

    # 1) Enerji eşiklerini oku
    energy_levels = None
    for line in lines:
        if line.strip().startswith("'ENERGY'"):
            parts = line.strip().split(',')
            n = int(parts[1].strip())
            energy_levels = np.array([float(parts[i + 2].strip()) for i in range(n)])
            break

    if energy_levels is None:
        raise ValueError("'ENERGY' satırı bulunamadı. SPENVIS formatı kontrol edilmeli.")

    n_energy = len(energy_levels)          # genellikle 30
    expected_cols = 2 + n_energy           # B + L + N flux

    # 2) Veri satırlarını oku
    data_rows = []
    for line in lines:
        parts = line.replace(',', ' ').split()
        if len(parts) != expected_cols:
            continue
        try:
            data_rows.append([float(x) for x in parts])
        except ValueError:
            continue

    if not data_rows:
        raise ValueError("Hiç veri satırı bulunamadı.")

    data = np.array(data_rows)
    return energy_levels, data[:, 0], data[:, 1], data[:, 2:]


# ── ANALİZ & GRAFİK ─────────────────────────────────────────────────────────

def analyze_and_plot(energy_levels, B_vals, L_vals, flux_matrix,
                     save_path="spenvis_electron_analysis.png"):

    max_flux  = np.max(flux_matrix, axis=0)
    with np.errstate(invalid='ignore'):
        mean_flux = np.where(flux_matrix > 0, flux_matrix, np.nan)
        mean_flux = np.nanmean(mean_flux, axis=0)

    # ─── Konsol Özeti ───────────────────────────────────────────
    print("=" * 55)
    print("AE-8 MAX Tuzak Elektron — Yörünge Analizi")
    print("=" * 55)
    print(f"Veri noktası        : {len(B_vals)}")
    print(f"B alanı aralığı     : {B_vals.min():.4f} – {B_vals.max():.4f} Gauss")
    print(f"L-kabuğu aralığı    : {L_vals.min():.2f} – {L_vals.max():.2f} Rₑ")
    print(f"\n{'Enerji (MeV)':<14} {'Max Flux':>14} {'Ort Flux':>14}")
    print("-" * 44)
    for i in range(len(energy_levels)):
        if max_flux[i] > 0:
            mf = f"{mean_flux[i]:.3e}" if mean_flux[i] > 0 else "—"
            print(f"E > {energy_levels[i]:<8.2f}   {max_flux[i]:>12.3e}   {mf:>14}")
    print("=" * 55)

    # ─── Grafik ─────────────────────────────────────────────────
    fig = plt.figure(figsize=(16, 10))
    fig.suptitle("ISS-Like Orbit — AE-8 MAX Trapped Electron Analysis\n"
                 "Orbit: 402–412 km, 51.6° inc.",
                 fontsize=13, fontweight='bold', y=0.98)

    # Panel 1: Spektrum
    ax1 = fig.add_subplot(2, 2, 1)
    vm = max_flux > 0
    ve = mean_flux > 0
    ax1.loglog(energy_levels[vm], max_flux[vm], 'r-o', ms=5, lw=2, label='Worst-case (Max)')
    ax1.loglog(energy_levels[ve], mean_flux[ve], 'b--s', ms=4, lw=1.5, label='Orbit-avg (Mean)')
    ax1.set_title("AE-8 Integral Flux Spektrumu")
    ax1.set_xlabel("Enerji Eşiği (MeV)")
    ax1.set_ylabel("Integral Flux  (cm⁻² s⁻¹)")
    ax1.grid(True, which='both', ls='--', alpha=0.4)
    ax1.legend()
    ax1.set_xlim([0.03, 8])

    # Panel 2: B-L haritası
    ax2 = fig.add_subplot(2, 2, 2)
    flux_e0 = flux_matrix[:, 0]
    mask = flux_e0 > 0
    sc = ax2.scatter(L_vals[mask], B_vals[mask],
                     c=np.log10(flux_e0[mask]), cmap='plasma', s=2, alpha=0.7)
    cbar = plt.colorbar(sc, ax=ax2)
    cbar.set_label('log₁₀(Flux >0.04 MeV)')
    ax2.set_title("B-L Haritası (E > 0.04 MeV)")
    ax2.set_xlabel("L-kabuğu (Rₑ)")
    ax2.set_ylabel("B alanı (Gauss)")
    ax2.grid(True, ls='--', alpha=0.3)
    ax2.axvline(1.5, color='cyan', ls=':', lw=1.2, label='ISS L-bölgesi')
    ax2.axvline(2.0, color='cyan', ls=':', lw=1.2)
    ax2.legend(fontsize=8)

    # Panel 3: L'e göre flux
    ax3 = fig.add_subplot(2, 2, 3)
    L_bins = np.arange(1.0, 6.5, 0.1)
    L_centers = 0.5 * (L_bins[:-1] + L_bins[1:])
    for idx, color, lbl in [(0,'royalblue','0.04'), (2,'green','0.20'),
                             (5,'orange','0.50'), (9,'red','1.00')]:
        flux_E = flux_matrix[:, idx]
        bmeans = []
        for i in range(len(L_bins) - 1):
            m = (L_vals >= L_bins[i]) & (L_vals < L_bins[i+1]) & (flux_E > 0)
            bmeans.append(np.mean(flux_E[m]) if m.sum() > 0 else np.nan)
        bmeans = np.array(bmeans)
        v = bmeans > 0
        ax3.semilogy(L_centers[v], bmeans[v], lw=1.8, color=color,
                     label=f'E > {lbl} MeV')
    ax3.set_title("L-Kabuğuna Göre Ortalama Flux")
    ax3.set_xlabel("McIlwain L-kabuğu (Rₑ)")
    ax3.set_ylabel("Integral Flux  (cm⁻² s⁻¹)")
    ax3.grid(True, which='both', ls='--', alpha=0.4)
    ax3.legend()
    ax3.axvspan(1.3, 1.7, color='cyan', alpha=0.1)

    # Panel 4: Özet tablo
    ax4 = fig.add_subplot(2, 2, 4)
    ax4.axis('off')
    rows = [
        ["Model", "AE-8 MAX"],
        ["Apoge/Perige", "412 / 402 km"],
        ["İğnim", "51.6°"],
        ["L-kabuğu", f"{L_vals.min():.1f} – {L_vals.max():.1f} Rₑ"],
        ["Yörünge noktası", str(len(B_vals))],
        ["Enerji aralığı", "0.04 – 7.00 MeV"],
        ["Max flux (E>0.04)", f"{max_flux[0]:.2e} cm⁻²s⁻¹"],
        ["Max flux (E>1.00)", f"{max_flux[9]:.2e} cm⁻²s⁻¹"],
        ["Max flux (E>5.00)", f"{max_flux[25]:.2e} cm⁻²s⁻¹"],
    ]
    tbl = ax4.table(cellText=rows, colLabels=["Parametre", "Değer"],
                    loc='center', cellLoc='left')
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(10)
    tbl.scale(1.2, 1.9)
    for (r, c), cell in tbl.get_celld().items():
        if r == 0:
            cell.set_facecolor('#2c3e50')
            cell.set_text_props(color='white', fontweight='bold')
        elif r % 2 == 0:
            cell.set_facecolor('#ecf0f1')
    ax4.set_title("Görev Özeti", fontsize=11, pad=10)

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"\n✅ Grafik kaydedildi → {save_path}")
    plt.show()


# ── ANA BLOK ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    file_name = os.path.join("SPENVIS_Sample_data", "ISS-like",
                             "spenvis_trapped_electron.txt")
    if len(sys.argv) > 1:
        file_name = sys.argv[1]

    try:
        energy_levels, B_vals, L_vals, flux_matrix = parse_spenvis_electron(file_name)
        print(f"✅ {len(B_vals)} veri noktası yüklendi.\n")
        analyze_and_plot(energy_levels, B_vals, L_vals, flux_matrix,
                         save_path="spenvis_electron_analysis.png")
    except (FileNotFoundError, ValueError) as e:
        print(f"❌ {e}")
    except Exception as e:
        print(f"❌ Beklenmeyen hata: {e}")
        raise