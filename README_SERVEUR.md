# 🔐 Serveur OTP - Liste Noire

Guide d'installation et d'utilisation du serveur pour générer et vérifier les codes OTP.

## 📋 Prérequis

- **Node.js** (v14 ou supérieur) - [Télécharger](https://nodejs.org/)
- **npm** (inclus avec Node.js)

## 🚀 Installation

### 1. Cloner le repository
```bash
git clone https://github.com/oumars3os-boop/Liste-noire.git
cd Liste-noire
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Démarrer le serveur
```bash
npm start
```

Vous devriez voir :
```
🚀 Serveur OTP en écoute sur le port 3000
📱 Accès local: http://localhost:3000
🌐 Accès réseau: http://<votre-ip>:3000
```

## 📱 Utilisation avec votre téléphone

### 1. Trouver votre adresse IP

**Windows :**
```cmd
ipconfig
```
Cherchez "IPv4 Address" sous votre connexion réseau (ex: `192.168.1.X`)

**Linux/Mac :**
```bash
ifconfig
# ou
ip addr
```

### 2. Configurer votre application mobile

Remplacez l'URL `10.0.2.2:3000` par :
```
http://192.168.1.X:3000
```
(Remplacez X par votre IP réelle)

### 3. Vous pouvez aussi tester avec:
```
http://192.168.1.00.41:3000
```
(qui semble être votre IP actuelle)

## 🔌 Endpoints API

### 1. Générer un nouvel OTP
```
POST /api/generate-otp
Content-Type: application/json

{
  "client_id": "mobile_app"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "OTP généré avec succès",
  "otp": "543210",
  "expires_in": 300,
  "client_id": "mobile_app",
  "timestamp": "2026-05-18T20:00:00.000Z"
}
```

### 2. Obtenir l'OTP actuel
```
GET /api/current-otp
```

**Réponse :**
```json
{
  "success": true,
  "otp": "543210",
  "expires_at": "2026-05-18T20:05:00.000Z",
  "time_remaining": 298
}
```

### 3. Vérifier un OTP
```
POST /api/verify-otp
Content-Type: application/json

{
  "otp": "543210"
}
```

**Réponse (valide) :**
```json
{
  "success": true,
  "message": "OTP valide",
  "verified": true
}
```

**Réponse (invalide) :**
```json
{
  "success": false,
  "message": "OTP invalide",
  "verified": false
}
```

### 4. Vérifier l'état du serveur
```
GET /api/health
```

**Réponse :**
```json
{
  "success": true,
  "message": "Serveur fonctionnel",
  "timestamp": "2026-05-18T20:00:00.000Z"
}
```

## 🧪 Tester avec cURL

### Générer un OTP
```bash
curl -X POST http://192.168.1.X:3000/api/generate-otp \
  -H "Content-Type: application/json" \
  -d '{"client_id": "mobile_app"}'
```

### Vérifier un OTP
```bash
curl -X POST http://192.168.1.X:3000/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"otp": "543210"}'
```

### Vérifier l'état
```bash
curl http://192.168.1.X:3000/api/health
```

## 🔧 Dépannage

### Erreur: "failed to connect to 10.0.2.2:3000"

1. ✅ Assurez-vous que le serveur est en cours d'exécution (`npm start`)
2. ✅ Vérifiez votre adresse IP locale avec `ipconfig` (Windows) ou `ifconfig` (Linux/Mac)
3. ✅ Remplacez `10.0.2.2` par votre IP réelle dans votre app mobile
4. ✅ Désactivez temporairement votre pare-feu pour tester

### Le serveur ne démarre pas

```bash
# Vérifier que Node.js est installé
node --version
npm --version

# Réinstaller les dépendances
rm -rf node_modules
npm install

# Relancer
npm start
```

### Port 3000 déjà utilisé

```bash
# Changer le port dans server.js (ligne 5)
# const PORT = 3000; → const PORT = 3001;
npm start
```

## 💾 Fichiers générés

- `admin/access_control.json` - Contient l'OTP actuel et ses informations

## 🌐 Intégration avec GitHub Actions

Votre workflow GitHub Actions (`blank.yml`) peut déclencher la génération d'OTP :

```bash
# Via curl
curl -X POST http://192.168.1.X:3000/api/generate-otp

# L'OTP sera sauvegardé dans admin/access_control.json
```

## 📝 Notes importantes

- **Expiration OTP** : 5 minutes (modifiable dans `server.js` ligne 40)
- **Sécurité** : Ce serveur est pour le développement/test local
- **Production** : Ajoutez HTTPS, authentification, rate limiting, etc.

## 🆘 Besoin d'aide ?

Consultez les logs du serveur pour plus de détails sur les erreurs.

---

**Créé le:** 2026-05-18  
**Version:** 1.0.0
