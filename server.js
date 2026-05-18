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

// ============ CONFIGURATION ============
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ? 
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex') :
    crypto.scryptSync(process.env.SECRET || 'default-secret-key-change-me', 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

// ============ BASE DE DONNÉES ============
const dbPath = path.join(__dirname, 'data', 'otp.db');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erreur BD:', err.message);
        process.exit(1);
    } else {
        console.log('✅ BD SQLite connectée: ' + dbPath);
    }
});

// Créer les tables
db.serialize(() => {
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

    console.log('✅ Tables créées');
});

// ============ FONCTIONS ============

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

// ============ ROUTES ============

// Test
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API fonctionne ✅' });
});

// Générer OTP
app.post('/api/generate-otp', (req, res) => {
    const { clientId, email, phone, validity = 5 } = req.body;
    const ip = getClientIP(req);
    
    console.log('📝 Demande OTP:', { clientId, email, phone, validity });
    
    if (!clientId || typeof clientId !== 'string' || clientId.trim().length === 0) {
        return res.status(400).json({ error: 'Client ID requis' });
    }
    
    if (validity < 1 || validity > 60) {
        return res.status(400).json({ error: 'Validité entre 1 et 60 minutes' });
    }
    
    try {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + validity * 60 * 1000);
        
        console.log('🔐 OTP généré:', otp);
        
        const { encrypted, iv, authTag } = encryptOTP(otp);
        
        db.run(`DELETE FROM otps WHERE client_id = ?`, [clientId]);
        
        db.run(
            `INSERT INTO otps (client_id, otp_encrypted, iv, auth_tag, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [clientId, encrypted, iv, authTag, expiresAt.toISOString()],
            function(err) {
                if (err) {
                    console.error('❌ Erreur insertion:', err);
                    logAudit(clientId, 'GENERATE_FAILED', { error: err.message }, ip);
                    return res.status(500).json({ error: 'Erreur BD: ' + err.message });
                }
                
                db.run(
                    `INSERT OR REPLACE INTO clients 
                     (client_id, email, phone, last_otp_at, otp_count) 
                     VALUES (?, ?, ?, datetime('now'), 
                     (SELECT COALESCE(otp_count, 0) + 1 FROM clients WHERE client_id = ?))`,
                    [clientId, email || null, phone || null, clientId],
                    (err) => {
                        if (err) console.error('❌ Erreur client:', err);
                    }
                );
                
                logAudit(clientId, 'GENERATE_SUCCESS', { email, phone, validity }, ip);
                
                console.log('✅ OTP créé avec succès');
                
                res.json({
                    success: true,
                    message: 'Code OTP généré',
                    otp: otp,
                    clientId: clientId,
                    expiresIn: validity * 60,
                    expiresAt: expiresAt.toISOString()
                });
            }
        );
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// Vérifier OTP
app.post('/api/verify-otp', (req, res) => {
    const { clientId, code } = req.body;
    const ip = getClientIP(req);
    
    console.log('🔍 Vérification:', { clientId, code });
    
    if (!clientId || !code) {
        return res.status(400).json({ error: 'Client ID et code requis' });
    }
    
    db.get(
        `SELECT * FROM otps WHERE client_id = ? AND is_used = 0`,
        [clientId],
        (err, row) => {
            if (err) {
                console.error('❌ Erreur BD:', err);
                return res.status(500).json({ error: 'Erreur BD' });
            }
            
            if (!row) {
                logAudit(clientId, 'VERIFY_NOT_FOUND', {}, ip);
                return res.status(400).json({ error: 'Aucun OTP pour ce client' });
            }
            
            if (new Date(row.expires_at) < new Date()) {
                db.run(`UPDATE otps SET is_used = 1 WHERE id = ?`, [row.id]);
                logAudit(clientId, 'VERIFY_EXPIRED', {}, ip);
                return res.status(400).json({ error: 'Code expiré' });
            }
            
            const decrypted = decryptOTP(row.otp_encrypted, row.iv, row.auth_tag);
            
            if (decrypted === code) {
                db.run(
                    `UPDATE otps SET is_used = 1, used_at = datetime('now') WHERE id = ?`,
                    [row.id]
                );
                
                logAudit(clientId, 'VERIFY_SUCCESS', {}, ip);
                console.log('✅ Code valide');
                
                res.json({
                    success: true,
                    message: 'Accès accordé!',
                    clientId: clientId,
                    verifiedAt: new Date().toISOString()
                });
            } else {
                logAudit(clientId, 'VERIFY_INVALID', {}, ip);
                console.log('❌ Code invalide');
                res.status(400).json({ error: 'Code invalide' });
            }
        }
    );
});

// Stats
app.get('/api/stats', (req, res) => {
    db.get(
        `SELECT COUNT(DISTINCT client_id) as total_clients, SUM(otp_count) as total_otps FROM clients`,
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur' });
            }
            
            db.get(
                `SELECT COUNT(*) as active_otps FROM otps WHERE is_used = 0 AND expires_at > datetime('now')`,
                (err, otpStats) => {
                    if (err) {
                        return res.status(500).json({ error: 'Erreur' });
                    }
                    
                    res.json({
                        totalClients: stats.total_clients || 0,
                        totalOTPsGenerated: stats.total_otps || 0,
                        activeOTPs: otpStats.active_otps || 0
                    });
                }
            );
        }
    );
});

// Audit
app.get('/api/audit/:clientId', (req, res) => {
    const { clientId } = req.params;
    
    db.all(
        `SELECT * FROM audit_log WHERE client_id = ? ORDER BY created_at DESC LIMIT 50`,
        [clientId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur' });
            }
            res.json({
                success: true,
                count: rows ? rows.length : 0,
                data: rows || []
            });
        }
    );
});

// ============ ERREURS ============

app.use((err, req, res, next) => {
    console.error('❌ Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur: ' + err.message });
});

// ============ DÉMARRAGE ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 SERVEUR OTP DÉMARRÉ\n`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🌐 Web: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log(`🧪 Test: http://localhost:${PORT}/api/test\n`);
});

process.on('SIGINT', () => {
    console.log('\n⏹️  Arrêt...');
    db.close();
    process.exit(0);
});
