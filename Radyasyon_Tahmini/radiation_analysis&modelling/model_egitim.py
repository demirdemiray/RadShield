import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
import joblib

print("VS Code ortaminda model egitiliyor, lutfen bekleyin...")

# 1. Veriyi Yukle (CSV dosyanin adinin dogru oldugundan emin ol)
df = pd.read_csv("radiation_dataset_v3/radiation_dataset.csv")

features = ['altitude_km', 'inclination_deg', 'eccentricity', 'mission_duration_years', 'solar_max_fraction']
targets = ['p_trapped_fluence_10.0MeV', 'e_fluence_2.00MeV', 'p_gcr_fluence_10.0MeV', 'p_spe_fluence_10.0MeV']

X = df[features]
Y = np.log10(df[targets] + 1e-5)
X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.2, random_state=42)

# 2. Daha once yarisip kazanan modellerimiz
best_models = {
    'p_trapped_fluence_10.0MeV': RandomForestRegressor(n_estimators=100, max_depth=15, random_state=42, n_jobs=-1),
    'e_fluence_2.00MeV': RandomForestRegressor(n_estimators=100, max_depth=15, random_state=42, n_jobs=-1),
    'p_gcr_fluence_10.0MeV': GradientBoostingRegressor(n_estimators=150, max_depth=7, learning_rate=0.1, random_state=42),
    'p_spe_fluence_10.0MeV': GradientBoostingRegressor(n_estimators=150, max_depth=7, learning_rate=0.1, random_state=42)
}

# 3. Modelleri Egit
for target, model in best_models.items():
    print(f"{target} egitiliyor...")
    i = targets.index(target)
    model.fit(X_train, Y_train.iloc[:, i])

# 4. Kaydet
joblib.dump(best_models, 'optimized_radiation_models_dict.pkl')
print("\nZAFER! Model VS Code ortaminda guncel surumle uretildi ve kaydedildi!")