const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');

// Chargement des variables d'environnement (.env)
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// Vérification de la présence du Token GitHub dans la configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
    console.error("⚠️ ERREUR : Le GITHUB_TOKEN n'est pas défini dans les variables d'environnement !");
}

// Route de test pour vérifier si le serveur tourne
app.get('/', (req, res) => {
    res.status(200).json({ status: "success", message: "Le serveur ID-MASTER fonctionne correctement." });
});

/**
 * Route pour générer et valider un OTP via GitHub
 * C'est ici qu'on corrige l'erreur 401 en envoyant correctement le Token
 */
app.post('/api/verify-otp', async (req, res) => {
    const { code, phoneNumber } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: "Le code est requis." });
    }

    try {
        // Exemple de requête vers GitHub (ajuste l'URL selon ton besoin réel sur GitHub)
        // L'en-tête 'Authorization' utilise ici le token configuré pour éviter la 401
        const response = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        // Logique de vérification de ton OTP (à adapter selon ton fonctionnement)
        console.log(`Vérification demandée pour le numéro : ${phoneNumber}`);
        
        // Si tout est bon
        return res.status(200).json({
            success: true,
            message: "Authentification réussie",
            userData: response.data
        });

    } catch (error) {
        console.error("Erreur d'authentification GitHub :", error.response ? error.response.data : error.message);
        
        // Si GitHub renvoie 401, on le signale clairement dans les logs du serveur
        if (error.response && error.response.status === 401) {
            return res.status(401).json({
                success: false,
                message: "Erreur 401 : Le token configuré sur le serveur est invalide ou expiré."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Erreur interne lors de la vérification."
        });
    }
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
