const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Inicialización única y segura centralizada
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const messaging = admin.messaging();

module.exports = { admin, messaging };