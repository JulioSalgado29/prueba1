const admin = require('firebase-admin');
const path = require('path');

// 1. Le decimos al servidor dónde está tu archivo JSON usando la variable oficial de Google
// ¡Esto hace un bypass total y evita usar admin.credential.cert!
const rutaCredenciales = path.join(__dirname, 'serviceAccountKey.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = rutaCredenciales;

// 2. Inicializamos Firebase completamente en blanco (él mismo leerá la variable de arriba)
try {
    if (!admin.apps || admin.apps.length === 0) {
        admin.initializeApp();
    }
} catch (error) {
    console.error('Error al inicializar Firebase:', error);
}

// 3. Exportamos el servicio de notificaciones
const messaging = admin.messaging();

module.exports = { messaging };