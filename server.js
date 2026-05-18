const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

app.use(express.json());

// Créer le répertoire admin s'il n'existe pas
const adminDir = path.join(__dirname, 'admin');
if (!fs.existsSync(adminDir)) {
  fs.mkdirSync(adminDir, { recursive: true });
}

const accessControlFile = path.join(adminDir, 'access_control.json');

// Fonction pour générer un OTP à 6 chiffres
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Fonction pour lire le fichier OTP
function readOTPFile() {
  try {
    if (fs.existsSync(accessControlFile)) {
      const data = fs.readFileSync(accessControlFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erreur lors de la lecture du fichier OTP:', error);
  }
  return null;
}

// Fonction pour sauvegarder l'OTP
function saveOTP(otp, clientId = 'app') {
  const data = {
    current_otp: otp,
    last_updated: new Date().toISOString(),
    target_client: clientId,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Expire dans 5 minutes
  };
  
  try {
    fs.writeFileSync(accessControlFile, JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de l\'OTP:', error);
    return null;
  }
}

// Route pour générer un nouvel OTP
app.post('/api/generate-otp', (req, res) => {
  try {
    const otp = generateOTP();
    const clientId = req.body.client_id || 'mobile_app';
    
    const savedOTP = saveOTP(otp, clientId);
    
    if (savedOTP) {
      console.log(`OTP généré pour ${clientId}: ${otp}`);
      res.status(200).json({
        success: true,
        message: 'OTP généré avec succès',
        otp: otp,
        expires_in: 300, // 5 minutes en secondes
        client_id: clientId,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération de l\'OTP'
      });
    }
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Route pour obtenir l'OTP actuel
app.get('/api/current-otp', (req, res) => {
  try {
    const otpData = readOTPFile();
    
    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: 'Aucun OTP disponible. Générez-en un d\'abord.'
      });
    }

    // Vérifier si l'OTP a expiré
    const expiresAt = new Date(otpData.expires_at);
    const now = new Date();

    if (now > expiresAt) {
      return res.status(410).json({
        success: false,
        message: 'OTP expiré',
        expired_at: otpData.expires_at
      });
    }

    res.status(200).json({
      success: true,
      otp: otpData.current_otp,
      expires_at: otpData.expires_at,
      time_remaining: Math.round((expiresAt - now) / 1000) // en secondes
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route pour vérifier un OTP
app.post('/api/verify-otp', (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP requis'
      });
    }

    const otpData = readOTPFile();

    if (!otpData) {
      return res.status(404).json({
        success: false,
        message: 'Aucun OTP disponible'
      });
    }

    // Vérifier l'expiration
    const expiresAt = new Date(otpData.expires_at);
    if (new Date() > expiresAt) {
      return res.status(410).json({
        success: false,
        message: 'OTP expiré'
      });
    }

    // Vérifier le code
    if (otp === otpData.current_otp) {
      res.status(200).json({
        success: true,
        message: 'OTP valide',
        verified: true
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'OTP invalide',
        verified: false
      });
    }
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// Route de santé pour vérifier que le serveur fonctionne
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Serveur fonctionnel',
    timestamp: new Date().toISOString()
  });
});

// Démarrer le serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Serveur OTP en écoute sur le port ${PORT}`);
  console.log(`📱 Accès local: http://localhost:${PORT}`);
  console.log(`🌐 Accès réseau: http://<votre-ip>:${PORT}`);
  console.log(`\n✅ Endpoints disponibles:`);
  console.log(`  POST   /api/generate-otp   - Générer un nouvel OTP`);
  console.log(`  GET    /api/current-otp    - Obtenir l'OTP actuel`);
  console.log(`  POST   /api/verify-otp     - Vérifier un OTP`);
  console.log(`  GET    /api/health         - Vérifier l'état du serveur\n`);
});
