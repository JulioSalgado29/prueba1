const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

let messaging;

try {
    // Intentamos inicializar la app por defecto de forma segura
    const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    messaging = admin.messaging(app);
} catch (error) {
    // Si ya existe una app inicializada, la obtenemos sin lanzar excepciones
    if (/already exists/.test(error.message)) {
        const existingApp = admin.app();
        messaging = admin.messaging(existingApp);
    } else {
        console.error('Error crítico al inicializar Firebase Admin:', error);
        throw error;
    }
}

module.exports = { admin, messaging };