const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Inicialización ultra segura sin usar .length ni llamadas que fallen
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    // Si la app ya fue inicializada previamente, ignoramos el error de duplicidad
    if (!/already exists/.test(error.message)) {
        console.error('Error al inicializar Firebase Admin:', error);
    }
}

const messaging = admin.messaging();

module.exports = { admin, messaging };