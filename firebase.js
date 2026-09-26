const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('./serviceAccountKey.json');

let app;

// Inicialización segura con los submódulos modernos
if (!getApps().length) {
    app = initializeApp({
        credential: cert(serviceAccount)
    });
} else {
    app = getApps()[0];
}

const messaging = getMessaging(app);

module.exports = { messaging };