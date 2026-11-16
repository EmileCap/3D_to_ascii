# ASCII3D

ASCII3D transforme des modèles 3D en rendus ASCII colorés et en sprite sheets PNG. L’application de bureau permet de prévisualiser un modèle, d’ajuster le rendu, de lire les animations intégrées ou importées et d’exporter des séquences accompagnées de métadonnées JSON.

## Fonctionnalités

- Interface de bureau Electron pour Windows, macOS et Linux.
- Modèles importés dans l’interface : GLB, GLTF, FBX, OBJ et STL.
- Animations intégrées aux GLB/GLTF et FBX, ou importées depuis un fichier GLB/GLTF/FBX séparé si leurs noms de nœuds/rigs correspondent au modèle.
- Export d’une sprite sheet PNG avec fichier JSON compagnon : séquence d’animation ou rotation 360°.
- Caméra d’export isométrique fixe (indépendante du zoom) ou caméra de l’aperçu 3D.
- CLI sans interface graphique : GLB, GLTF, OBJ et STL en TXT, ANSI, HTML ou JSON. Les animations et FBX ne sont pas pris en charge par la CLI.
- Traitement local : les modèles ne sont pas envoyés à un service distant.

## Télécharger une version installable

Ouvre la section **Releases** du dépôt GitHub et télécharge le paquet qui correspond à ton système. Les artefacts sont construits sur des runners natifs Windows, macOS et Linux par GitHub Actions lorsqu’une version `v*` est publiée.

| Système | Paquet | Installation |
| --- | --- | --- |
| Windows 10/11, x64 | `ASCII3D-Setup-*.exe` (NSIS) | Lance l’installateur et suis l’assistant. |
| macOS, Apple Silicon ou Intel | `ASCII3D-arm64.dmg` ou `ASCII3D-x64.dmg` | Ouvre le DMG et glisse l’application dans Applications. Les builds ne sont pas signés/notarisés : macOS peut demander une confirmation dans Réglages système > Confidentialité et sécurité. |
| Linux, x64 | `*.AppImage` ou `*.deb` | AppImage : rends le fichier exécutable puis lance-le. Debian/Ubuntu : installe le paquet `.deb` avec le gestionnaire logiciel ou `sudo apt install ./fichier.deb`. |

Les builds sont exécutés sur un runner natif par système : Linux x64, macOS x64/arm64 et Windows x64.

## Lancer depuis les sources

### Prérequis

- Node.js 22 LTS (npm est inclus).
- Git pour cloner le dépôt.
- Une carte graphique et des pilotes compatibles WebGL pour l’aperçu 3D.

### Windows (PowerShell)

```powershell
git clone https://github.com/EmileCap/3D_to_ascii.git
Set-Location 3D_to_ascii
npm ci
npm start
```

### macOS et Linux (Terminal)

```sh
git clone https://github.com/EmileCap/3D_to_ascii.git
cd 3D_to_ascii
npm ci
npm start
```

`npm start` ouvre l’interface. Choisis **Ouvrir un fichier**, ou charge l’exemple intégré. Pour développer avec Electron : `npm run dev`.

### Vérifier le projet

```sh
npm test
```

## Utiliser la CLI

La CLI nécessite Node.js 22 ou plus récent. Depuis la racine du projet :

```sh
node bin/ascii3d.js --input assets/sample.glb --width 80 --charset long --color ansi --output rendu.ans
node bin/ascii3d.js --input assets/sample.glb --format html --output rendu.html
node bin/ascii3d.js --input assets/sample.glb --frames 12 --format json --output rotation.json
node bin/ascii3d.js --help
```

Les options `--input` peuvent être répétées et désignent un fichier, un dossier ou un glob. Les sorties disponibles sont `txt`, `ans`, `html` et `json`. En batch, `--out-dir` range chaque résultat. `--frames N` écrit un JSON de trames contenant leur angle, leurs lignes ASCII et leurs couleurs.

Exemple PowerShell :

```powershell
node bin/ascii3d.js --input .\assets\sample.glb --width 80 --format txt --output .\rendu.txt
```

## Construire les installateurs localement

Electron Builder produit les paquets pour la plateforme locale. Construis les paquets Windows depuis Windows, macOS depuis macOS et Linux depuis Linux; la compilation croisée peut demander des outils système spécifiques. Les artefacts sont générés dans `release/`.

```sh
npm run dist:linux
npm run dist:mac
npm run dist:win
```

Cibles configurées : AppImage et DEB (Linux), DMG x64/arm64 (macOS), NSIS x64 (Windows).

## Publier une version

Les pushes de tags `v*` déclenchent les tests, puis les builds natifs des trois systèmes. Une Release GitHub est ensuite créée avec les installateurs joints. Exemple :

```sh
git tag v1.0.0
git push origin v1.0.0
```

Un lancement manuel du workflow construit et dépose les installateurs comme artefacts GitHub Actions sans créer de Release.

## Animations

Pour animer un modèle, ouvre d’abord un modèle riggé, puis clique **Importer animation** et choisis un GLB, GLTF ou FBX contenant des clips pour le même rig. Les os et nœuds animés doivent avoir des noms compatibles. Les animations incorporées dans le modèle sont détectées automatiquement. Le bouton **Lire/Pause** vérifie la lecture; choisis ensuite **Animation du modèle** pour exporter le clip en sprite sheet. Les OBJ et STL sont des formats de géométrie statique.

## Dépannage

- **La fenêtre s’ouvre mais l’aperçu 3D ne s’affiche pas** : vérifie que l’accélération graphique/WebGL est activée et que les pilotes graphiques sont à jour.
- **L’animation importée ne correspond pas** : les noms de racine/os/nœuds doivent correspondre au rig du modèle. Exporte modèle et animation depuis le même rig, de préférence dans un même GLB.
- **macOS bloque l’application téléchargée** : les builds publics ne sont pas signés. Vérifie la provenance de la Release puis autorise son ouverture dans Réglages système > Confidentialité et sécurité.
- **Linux** : l’AppImage doit être exécutable. Sur Ubuntu/Debian, le `.deb` installe les dépendances système via le gestionnaire de paquets.
- **Pas de modèle de démonstration** : clique **Exemple** dans l’application.

## Licence

Le projet est distribué sous licence MIT. Three.js et ses fichiers de distribution sont sous licence MIT; voir `vendor/three/LICENSE`.
