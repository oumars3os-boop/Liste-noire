# 🔐 Gestionnaire OTP Sécurisé

Système de gestion des codes OTP (One-Time Password) avec chiffrement **AES-256-GCM** et base de données **SQLite**.

## ✨ Caractéristiques

✅ **Chiffrement militaire** - AES-256-GCM (NIST approved)  
✅ **Base de données persistante** - SQLite avec schéma complet  
✅ **Audit complet** - Traçabilité de tous les accès  
✅ **Interface Web moderne** - Design responsive et intuitif  
✅ **API REST sécurisée** - Endpoints validés et testés  
✅ **Génération aléatoire** - Codes OTP uniques à 6 chiffres  
✅ **Expiration auto** - Validité configurable (1-60 minutes)  
✅ **Une seule utilisation** - Codes marqués comme utilisés  

## 🚀 Installation

### Prérequis
- Node.js >= 14.0.0
- npm ou yarn

### Étapes

1. **Cloner le repository**
```bash
git clone https://github.com/oumars3os-boop/Liste-noire.git
cd Liste-noire
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Créer le fichier `.env`**
```bash
cp .env.example .env
```

4. **Générer une clé de chiffrement**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copier la clé et la coller dans `.env` dans `ENCRYPTION_KEY`

5. **Démarrer le serveur**
```bash
npm start
```

6. **Accéder à l'interface**
```
http://localhost:3000
```

## 📋 Utilisation

### Générer un OTP

1. Entrer l'ID du client (ex: `CLIENT_001`)
2. Ajouter email et téléphone (optionnel)
3. Définir la validité (1-60 minutes, défaut: 5)
4. Cliquer sur "🔑 Générer Code OTP"
5. Copier le code et le transmettre au client

### Vérifier un OTP

1. Entrer l'ID du client
2. Entrer le code OTP reçu
3. Cliquer sur "✅ Vérifier"
4. Le code est marqué comme utilisé

## 🔐 Sécurité

### Chiffrement
- **Algorithme**: AES-256-GCM
- **Clé**: 256 bits (32 octets)
- **IV**: 128 bits aléatoires par code
- **Auth Tag**: Vérification d'intégrité

### Stockage
```json
{
  "id": 1,
  "client_id": "CLIENT_001",
  "otp_encrypted": "a3f8e2c1d9...",
  "iv": "9f7a2b4e6c8d1f3a",
  "auth_tag": "8c5d1b2f7a9e3c6d",
  "expires_at": "2026-05-18T14:30:00Z",
  "is_used": 0
}
```

Les codes OTP sont **JAMAIS** stockés en clair. Seuls les codes chiffrés sont sauvegardés.

### Audit
Chaque action est enregistrée :
- Génération réussie/échouée
- Vérification réussie/échouée
- Tentative invalide
- Expiration de code
- Adresse IP du demandeur

## 📊 Base de Données

### Tables

#### `otps`
```sql
CREATE TABLE otps (
    id INTEGER PRIMARY KEY,
    client_id TEXT UNIQUE NOT NULL,
    otp_encrypted TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_used INTEGER DEFAULT 0,
    used_at DATETIME
)
```

#### `clients`
```sql
CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    client_id TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_otp_at DATETIME,
    otp_count INTEGER DEFAULT 0
)
```

#### `audit_log`
```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    client_id TEXT,
    action TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## 🔌 API Endpoints

### POST `/api/generate-otp`
Génère un nouveau code OTP

**Body:**
```json
{
  "clientId": "CLIENT_001",
  "email": "client@example.com",
  "phone": "+33612345678",
  "validity": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Code OTP généré avec succès",
  "otp": "487291",
  "clientId": "CLIENT_001",
  "expiresIn": 300,
  "expiresAt": "2026-05-18T14:30:00Z"
}
```

### POST `/api/verify-otp`
Vérifie un code OTP

**Body:**
```json
{
  "clientId": "CLIENT_001",
  "code": "487291"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Code valide! Accès accordé.",
  "clientId": "CLIENT_001",
  "verifiedAt": "2026-05-18T14:25:00Z"
}
```

### GET `/api/otp-status/:clientId`
Vérifie le statut d'un OTP

**Response:**
```json
{
  "status": "active",
  "hasActiveOTP": true,
  "expiresIn": 245,
  "isUsed": false
}
```

### GET `/api/audit/:clientId`
Récupère l'historique d'audit

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 1,
      "client_id": "CLIENT_001",
      "action": "GENERATE_SUCCESS",
      "details": "{...}",
      "ip_address": "192.168.1.1",
      "created_at": "2026-05-18T14:25:00Z"
    }
  ]
}
```

### GET `/api/stats`
Obtient les statistiques globales

**Response:**
```json
{
  "totalClients": 42,
  "totalOTPsGenerated": 127,
  "activeOTPs": 3
}
```

## 📱 Développement

### Mode développement
```bash
npm run dev
```
Use nodemon pour rechargement automatique

### Structure du projet
```
.
├── server.js              # Serveur Express
├── public/
│   └── index.html        # Interface Web
├── data/
│   └── otp.db           # Base de données SQLite
├── package.json
├── .env
├── .env.example
└── README.md
```

## 🔒 Recommandations de sécurité

1. **Changez la clé de chiffrement** en production
   ```bash
   ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```

2. **Utilisez HTTPS** en production
   ```bash
   NODE_ENV=production
   ```

3. **Limitez les tentatives** de vérification
   - Actuellement: pas de limite (à implémenter)
   - À faire: Rate limiting par IP

4. **Sauvegardez la base de données** régulièrement
   ```bash
   cp data/otp.db data/otp.db.backup
   ```

5. **Nettoyez les codes expirant** périodiquement
   - À faire: Cron job pour supprimer les codes > 24h

6. **Utilisez des variables d'environnement**
   - Ne commitez JAMAIS le `.env`
   - Ne sharchiez JAMAIS les clés

## 📝 Licence

MIT License - Voir LICENSE.md

## 👨‍💻 Développé par

**oumars3os-boop** - 2026

---

**Questions?** Créez une issue sur GitHub ou contactez le support.
