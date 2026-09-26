const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Inicialización ultra segura tradicional
if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const messaging = admin.messaging();

module.exports = { messaging };