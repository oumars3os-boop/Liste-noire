# Notes de Sécurité - Workflow OTP

## Changements Apportés

### 1. **Génération OTP Sécurisée**
- **Avant**: `random.randint()` - Non cryptographiquement sécurisé ❌
- **Après**: `secrets.randbelow()` - Cryptographiquement sécurisé ✅

### 2. **Expiration OTP**
- Ajout d'une durée de vie (TTL) de 5 minutes
- Les OTP expirés deviennent invalides automatiquement

### 3. **Suppression du Stockage en Clair**
- **Avant**: Commiter les OTP dans `admin/access_control.json` ❌
- **Après**: Ne pas stocker dans le repository ✅

### 4. **Réduction des Permissions**
- **Avant**: `contents: write` (accès complet en lecture/écriture) ❌
- **Après**: `contents: read` (lecture seule) ✅

### 5. **Audit Logging**
- Enregistrement des événements de génération OTP
- Traçabilité des actions

## Recommandations pour Production

### Option 1: GitHub Secrets (Pour petites opérations)
```yaml
- name: Store OTP Securely
  env:
    SECURE_API_KEY: ${{ secrets.SECURE_API_KEY }}
  run: |
    # Envoyer l'OTP à un endpoint sécurisé
```

### Option 2: Service Externe (Recommandé)
Intégrer avec:
- **AWS Secrets Manager**
- **HashiCorp Vault**
- **Azure Key Vault**
- **1Password / LastPass**
- **Service API interne**

### Option 3: Database Sécurisée
Stocker les OTPs avec:
- Chiffrement au repos
- Expiration automatique
- Authentification TLS
- Logs d'audit

## Étapes Suivantes

1. **Configurer les secrets** (si vous utilisez une API externe):
   - Ajouter `SECURE_API_ENDPOINT` aux Secrets GitHub
   - Ajouter `API_KEY` aux Secrets GitHub

2. **Tester le workflow**:
   - Trigger manuel depuis l'onglet Actions
   - Vérifier les logs

3. **Intégrer le service sécurisé**:
   - Décommenter l'appel curl dans le workflow
   - Configurer l'endpoint selon votre infrastructure

4. **Nettoyer l'historique git**:
   ```bash
   git log --all --full-history -- admin/access_control.json
   # Envisager un rebase si les OTPs étaient exposés
   ```

## Variables d'Environnement Disponibles

Le workflow peut accéder à:
- `${{ github.actor }}` - Utilisateur qui a déclenché le workflow
- `${{ github.event_name }}` - Type d'événement
- `${{ github.event.inputs.client_id }}` - ID client fourni

## Contacts et Support

En cas de question, consulter:
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Secrets Management Best Practices](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
