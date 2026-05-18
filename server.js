const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ CONFIGURATION CHIFFREMENT ============
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ? 
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex') :
    crypto.scryptSync(process.env.SECRET || 'votre-clé-secrète-par-défaut', 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

// ============ INITIALISATION BASE DE DONNÉES ============
const dbPath = path.join(__dirname, 'data', 'otp.db');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erreur connexion BD:', err.message);
        process.exit(1);
    } else {
        console.log('✅ Base de données SQLite connectée');
    }
});

// Créer les tables
db.serialize(() => {
    // Table des OTP chiffrés
    db.run(`
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL UNIQUE,
            otp_encrypted TEXT NOT NULL,
            iv TEXT NOT NULL,
            auth_tag TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            is_used INTEGER DEFAULT 0,
            used_at DATETIME
        )
    `);

    // Table d'audit
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT,
            action TEXT,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Table clients
    db.run(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL UNIQUE,
            email TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_otp_at DATETIME,
            otp_count INTEGER DEFAULT 0
        )
    `);

    console.log('✅ Tables de base de données initialisées');
});

// ============ FONCTIONS DE CHIFFREMENT ============

/**
 * Chiffre un code OTP avec AES-256-GCM
 * @param {string} plaintext - Le code OTP en texte clair
 * @returns {object} - {encrypted, iv, authTag}
 */
function encryptOTP(plaintext) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

/**
 * Déchiffre un code OTP
 * @param {string} encrypted - Code chiffré
 * @param {string} iv - Vecteur d'initialisation
 * @param {string} authTag - Tag d'authentification
 * @returns {string|null} - Code OTP en clair ou null
 */
function decryptOTP(encrypted, iv, authTag) {
    try {
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            ENCRYPTION_KEY,
            Buffer.from(iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('❌ Erreur déchiffrement:', error.message);
        return null;
    }
}

// ============ FONCTIONS UTILITAIRES ============

function generateOTP() {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function logAudit(clientId, action, details, ip) {
    db.run(
        `INSERT INTO audit_log (client_id, action, details, ip_address) 
         VALUES (?, ?, ?, ?)`,
        [clientId, action, JSON.stringify(details), ip],
        (err) => {
            if (err) console.error('❌ Erreur audit:', err.message);
        }
    );
}

function getClientIP(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
}

// ============ ROUTES API ============

/**
 * POST /api/generate-otp
 * Génère un nouveau code OTP chiffré
 */
app.post('/api/generate-otp', (req, res) => {
    const { clientId, email, phone, validity = 5 } = req.body;
    const ip = getClientIP(req);
    
    // Validation
    if (!clientId || typeof clientId !== 'string' || clientId.length === 0) {
        return res.status(400).json({ 
            error: 'Client ID invalide',
            code: 'INVALID_CLIENT_ID'
        });
    }
    
    if (validity < 1 || validity > 60) {
        return res.status(400).json({ 
            error: 'Validité entre 1 et 60 minutes',
            code: 'INVALID_VALIDITY'
        });
    }
    
    try {
        // Générer l'OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + validity * 60 * 1000);
        
        // Chiffrer l'OTP
        const { encrypted, iv, authTag } = encryptOTP(otp);
        
        // Supprimer l'ancien OTP s'il existe
        db.run(`DELETE FROM otps WHERE client_id = ?`, [clientId]);
        
        // Insérer le nouvel OTP chiffré
        db.run(
            `INSERT INTO otps (client_id, otp_encrypted, iv, auth_tag, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [clientId, encrypted, iv, authTag, expiresAt.toISOString()],
            function(err) {
                if (err) {
                    console.error('❌ Erreur BD:', err.message);
                    logAudit(clientId, 'GENERATE_FAILED', { error: err.message }, ip);
                    return res.status(500).json({ 
                        error: 'Erreur génération OTP',
                        code: 'DB_ERROR'
                    });
                }
                
                // Mettre à jour les infos client
                db.run(
                    `INSERT OR REPLACE INTO clients 
                     (client_id, email, phone, last_otp_at, otp_count) 
                     VALUES (?, ?, ?, datetime('now'), 
                     (SELECT COALESCE(otp_count, 0) + 1 FROM clients WHERE client_id = ?))`,
                    [clientId, email || null, phone || null, clientId]
                );
                
                // Log d'audit
                logAudit(clientId, 'GENERATE_SUCCESS', { 
                    email, 
                    phone, 
                    validity 
                }, ip);
                
                res.json({
                    success: true,
                    message: 'Code OTP généré avec succès',
                    otp: otp,
                    clientId,
                    expiresIn: validity * 60,
                    expiresAt: expiresAt.toISOString()
                });
            }
        );
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        logAudit(clientId, 'GENERATE_ERROR', { error: error.message }, ip);
        res.status(500).json({ 
            error: 'Erreur serveur',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * POST /api/verify-otp
 * Vérifie un code OTP
 */
app.post('/api/verify-otp', (req, res) => {
    const { clientId, code } = req.body;
    const ip = getClientIP(req);
    
    if (!clientId || !code) {
        return res.status(400).json({ 
            error: 'Client ID et code requis',
            code: 'MISSING_PARAMS'
        });
    }
    
    db.get(
        `SELECT * FROM otps WHERE client_id = ? AND is_used = 0`,
        [clientId],
        (err, row) => {
            if (err) {
                logAudit(clientId, 'VERIFY_ERROR', { error: err.message }, ip);
                return res.status(500).json({ 
                    error: 'Erreur serveur',
                    code: 'DB_ERROR'
                });
            }
            
            if (!row) {
                logAudit(clientId, 'VERIFY_NOT_FOUND', {}, ip);
                return res.status(400).json({ 
                    error: 'Aucun OTP actif pour ce client',
                    code: 'NO_OTP'
                });
            }
            
            // Vérifier l'expiration
            if (new Date(row.expires_at) < new Date()) {
                db.run(`UPDATE otps SET is_used = 1 WHERE id = ?`, [row.id]);
                logAudit(clientId, 'VERIFY_EXPIRED', {}, ip);
                return res.status(400).json({ 
                    error: 'Code expiré',
                    code: 'EXPIRED'
                });
            }
            
            // Déchiffrer et vérifier
            const decrypted = decryptOTP(row.otp_encrypted, row.iv, row.auth_tag);
            
            if (decrypted === code) {
                // Marquer comme utilisé
                db.run(
                    `UPDATE otps SET is_used = 1, used_at = datetime('now') WHERE id = ?`,
                    [row.id]
                );
                
                logAudit(clientId, 'VERIFY_SUCCESS', {}, ip);
                
                res.json({
                    success: true,
                    message: 'Code valide! Accès accordé.',
                    clientId,
                    verifiedAt: new Date().toISOString()
                });
            } else {
                logAudit(clientId, 'VERIFY_INVALID', {}, ip);
                res.status(400).json({ 
                    error: 'Code invalide',
                    code: 'INVALID_CODE'
                });
            }
        }
    );
});

/**
 * GET /api/otp-status/:clientId
 * Vérifie le statut d'un OTP
 */
app.get('/api/otp-status/:clientId', (req, res) => {
    const { clientId } = req.params;
    
    db.get(
        `SELECT id, expires_at, is_used, used_at 
         FROM otps WHERE client_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [clientId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            
            if (!row) {
                return res.json({ 
                    status: 'no_otp',
                    hasActiveOTP: false 
                });
            }
            
            const now = new Date();
            const expiresAt = new Date(row.expires_at);
            const isExpired = expiresAt < now;
            
            res.json({
                status: row.is_used ? 'used' : isExpired ? 'expired' : 'active',
                hasActiveOTP: !row.is_used && !isExpired,
                expiresAt: row.expires_at,
                expiresIn: Math.max(0, Math.floor((expiresAt - now) / 1000)),
                isUsed: row.is_used === 1,
                usedAt: row.used_at
            });
        }
    );
});

/**
 * GET /api/audit/:clientId
 * Récupère l'historique d'audit
 */
app.get('/api/audit/:clientId', (req, res) => {
    const { clientId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    
    db.all(
        `SELECT * FROM audit_log 
         WHERE client_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [clientId, limit],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json({
                success: true,
                count: rows.length,
                data: rows
            });
        }
    );
});

/**
 * GET /api/stats
 * Statistiques générales
 */
app.get('/api/stats', (req, res) => {
    db.get(
        `SELECT 
            COUNT(DISTINCT client_id) as total_clients,
            SUM(otp_count) as total_otps_generated
         FROM clients`,
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            
            db.get(
                `SELECT COUNT(*) as active_otps 
                 FROM otps 
                 WHERE is_used = 0 AND expires_at > datetime('now')`,
                (err, otpStats) => {
                    if (err) {
                        return res.status(500).json({ error: 'Erreur serveur' });
                    }
                    
                    res.json({
                        totalClients: stats.total_clients || 0,
                        totalOTPsGenerated: stats.total_otps_generated || 0,
                        activeOTPs: otpStats.active_otps || 0
                    });
                }
            );
        }
    );
});

// ============ GESTION ERREURS ============

app.use((err, req, res, next) => {
    console.error('❌ Erreur:', err);
    res.status(500).json({ 
        error: 'Erreur serveur interne',
        code: 'INTERNAL_ERROR'
    });
});

// ============ DÉMARRAGE ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Serveur OTP Sécurisé`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🔐 Chiffrement: AES-256-GCM`);
    console.log(`💾 Base de données: SQLite`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log(`🌐 Interface Web: http://localhost:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️  Arrêt du serveur...');
    db.close();
    process.exit(0);
});
