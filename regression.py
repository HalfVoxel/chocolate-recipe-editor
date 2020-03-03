import matplotlib
from matplotlib import pyplot as plt
from matplotlib import cm
import json
from scipy.optimize import curve_fit
import numpy as np

data = [
    # {
    #     "moulds": ["2207"],
    #     "weight": (270 + 15 + 230) * 0.5 + 140 + 20 + 29*1.5 + 1,
    #     "relation": 1,
    #     "note": "Hallon + lime",
    # },
    # {
    #     "moulds": ["1143", "diamant"],
    #     "weight": 120 + 120 + 30 + 10 + 90 + 66 + 20 + 14 + 4,
    #     "relation": 1,
    #     "note": "xante"
    # },
    {
        "moulds": ["2295"],
        "shell": "57%",
        "weight": (270 + 15 + 230) * 0.5 + (200 + 90 + 50 + 5 + 1),
        "relation": 0.6,
        "note": "hallon/lakrits",
    },
    {
        "moulds": ["1000L20"],
        "shell": "57%",
        "weight": 80 + 200 + 2,
        "relation": 1,
        "note": "rosmarin",
    },
    {
        "moulds": ["swirly"],
        "shell": "white",
        "weight": (89 + 59)*0.9 + (150 + 60 + 5 + 0.25 + 5),
        "relation": 0.9,
        "note": "Saffran & björnbär 2019-11-29",
    },
    {
        "moulds": ["2295", "1143"],
        "shell": "57%",
        "weight": (205 + 205 + 75 + 50 + 75 + 5),
        "relation": 0.95,
        "note": "Amarettopraliner med mandelcrunch (too much)",
    },
    {
        "moulds": ["2295", "1143"],
        "shell": "57%",
        "weight": (150 + 150 + 40 + 50 + 50 + 5),
        "relation": 1.2,
        "note": "Amarettopraliner med mandelcrunch (too little)",
    },
    {
        "moulds": ["pyramid", "flat earth", "stock", "halvsfär"],
        "shell": "57%",
        "weight": (300 + 50 + 15) + (100 + 100 + 50 + 150 + 125 + 25 + 2) * 1.5,
        "relation": 1.0,
        "note": "Smörkola/kardemumma 2019-12-19"
    },
    {
        "moulds": ["halvsfär"],
        "shell": "white",
        "weight": (56 + 165) * (8/9) + (206 + 38 + 44 + 12) * 0.9,
        "relation": 1,
        "note": "Yuzu & Ingefära 2019-11-29",
    },
    {
        "moulds": ["flat earth"],
        "shell": "white",
        "weight": (150 + 100)*0.6 + (150 + 85*0.8 + 43 + 10 + 6),
        "relation": 1,
        "note": "Hallon/blåbär 2019-11-29"
    },
    {
        "moulds": ["swirly kub"],
        "shell": "white",
        "weight": 80 + 11 + 200,
        "relation": 1,
        "note": "Basilika/jordgubb 2019-11-04"
    },
    {
        "moulds": ["stock"],
        "shell": "57%",
        "weight": 200 + 27 + 11 + 100,
        "relation": 0.8,
        "note": "Hasselnötspralin 2019-11-04"
    }
]

# Model
# mould.count*mould.weight*A - mould.surface_area*B = recipe.weight
# mould.surface_area = mould.count*(mould.weight)**(2/3)

moulds = json.loads(open("moulds.json").read())
def find_mould(name):
    for mould in moulds:
        if mould["name"] == name or mould["model"] == name:
            return mould

    raise Exception(f"Could not find any mould with the name '{name}'")

def model(xs, A, B, C):
    result = []
    for i in range(xs.shape[0]):
        x = xs[i,:]
        v = A*x[0] - B*x[1] + 100*C
        
        result.append(v)
    
    return result

def get_x(recipe):
    v = [0,0]
    for mould in [find_mould(n) for n in recipe["moulds"]]:
        weight = mould["cavity"]["weight"]
        count = mould["cavity"]["layout"][0] * mould["cavity"]["layout"][1]
        v[0] += count * weight
        v[1] += count * (weight**(2/3))
    
    return v

y = np.array([recipe["weight"] * recipe["relation"] for recipe in data])
x = np.array([get_x(recipe) for recipe in data])

print(np.array(model(x, 0.9, 0.1, 0)) / y)

def scores(xs, A, B, C):
    fractions = np.array(model(xs, A, B, C)) / y
    # return np.log10(((fractions - 1)**2).mean())
    return (fractions - 1)

def score(xs, A, B, C):
    fractions = np.array(model(xs, A, B, C)) / y
    return np.log10(((fractions - 1)**2).mean())

print("Fitting...")
(popt, pcov) = curve_fit(model, x, y, bounds=([0, 0, -3], [3, 1, 3]))
(popt2, pcov2) = curve_fit(scores, x, [0] * x.shape[0], bounds=([0, 0, -3], [3, 1, 3]))
print("Optimal parameters", popt)
print("Optimal parameters2", popt2)
print(score(x, popt[0], popt[1], popt[2]))
print(score(x, 0.9, 0.1, 0))


delta = 0.01
X, Y = np.meshgrid(np.arange(-1, 2, delta), np.arange(-1, 4, delta))
Z = np.array([[score(x, X[i,j], Y[i,j], 0) for j in range(X.shape[1])] for i in range(X.shape[0])])
print(Z.shape)

levels = np.arange(Z.min(), Z.max(), 0.1)
print(Z.min())

norm = cm.colors.Normalize(vmax=abs(Z).max(), vmin=-abs(Z).max())
cmap = cm.PRGn

fig, _axs = plt.subplots(nrows=3, ncols=1, figsize=(13,13))
fig.subplots_adjust(hspace=0.3)
axs = _axs.flatten()

cset1 = axs[0].contourf(X, Y, Z, levels, norm=norm,
                     cmap=cm.get_cmap(cmap, len(levels) - 1))

cset2 = axs[0].contour(X, Y, Z, cset1.levels, colors='k')
axs[0].scatter([popt[0]], [popt[1]], color="#FF0000")

# cset3 = axs[0].contour(X, Y, Z, (0,), colors='g', linewidths=2)
axs[0].set_title('Filled contours')
axs[0].set_xlabel("Mould weight")
axs[0].set_xlabel("Shell weight")
fig.colorbar(cset1, ax=axs[0])

for i in range(len(data)):
    axs[1].scatter(model(x[[i],:], popt[0], popt[1], popt[2]), y[i], label=data[i]["note"] if "note" in data[i] else "?")

axs[1].legend()
axs[1].plot([0, y.max()], (0, y.max()))
axs[1].set_xlabel("Good according to model")
axs[1].set_ylabel("Good according to recipe")


for i in range(len(data)):
    axs[2].scatter(model(x[[i],:], popt2[0], popt2[1], popt2[2]), y[i], label=data[i]["note"] if "note" in data[i] else "?")

axs[2].legend()
axs[2].plot([0, y.max()], (0, y.max()))
axs[2].set_xlabel("Good according to model")
axs[2].set_ylabel("Good according to recipe")

plt.show()